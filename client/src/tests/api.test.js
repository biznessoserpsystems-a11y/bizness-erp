import { describe, test, expect, vi, beforeEach } from 'vitest';

// axios.create() returns a callable mock instance (matching how the real
// axios instance itself is called directly to retry a request:
// `return api(originalRequest);` in the real source) with .interceptors
// hooks that capture whatever handlers api.js registers, so those exact
// handlers can be invoked directly in tests with a fabricated error —
// this exercises the real interceptor logic, not a re-encoded assumption
// about what it does. axios.post is mocked separately since the refresh
// call deliberately bypasses the api instance to avoid recursively
// triggering its own interceptor.
function createMockAxiosInstance() {
  const handlers = { request: [], response: [] };
  const callLog = [];
  const instance = vi.fn((config) => {
    callLog.push(config);
    return Promise.resolve({ data: 'retried-ok', config });
  });
  instance.interceptors = {
    request: { use: (fn) => handlers.request.push(fn) },
    response: { use: (successFn, errorFn) => handlers.response.push({ successFn, errorFn }) },
  };
  instance.callLog = callLog;
  instance.handlers = handlers;
  return instance;
}

let mockInstance;
let mockPost;

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockInstance),
    post: (...args) => mockPost(...args),
  },
}));

async function loadFreshApi() {
  vi.resetModules();
  mockInstance = createMockAxiosInstance();
  mockPost = vi.fn();
  const tokenStore = await import('../services/tokenStore');
  tokenStore.clearAccessToken();
  await import('../services/api');
  return { instance: mockInstance, tokenStore };
}

function fake401Error(url = '/some/protected/endpoint') {
  return {
    config: { url, headers: {}, _retry: undefined },
    response: { status: 401 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('api.js request interceptor', () => {
  test('attaches the current access token as a Bearer header when one is set', async () => {
    const { instance, tokenStore } = await loadFreshApi();
    tokenStore.setAccessToken('abc123');
    const requestHandler = instance.handlers.request[0];
    const config = requestHandler({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer abc123');
  });

  test('does not attach an Authorization header when there is no token', async () => {
    const { instance } = await loadFreshApi();
    const requestHandler = instance.handlers.request[0];
    const config = requestHandler({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe('api.js request interceptor - offline write blocking', () => {
  function setOnline(value) {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true, writable: true });
  }

  test('a mutating request while offline is rejected before ever reaching the network', async () => {
    const { instance } = await loadFreshApi();
    setOnline(false);
    const requestHandler = instance.handlers.request[0];

    await expect(requestHandler({ method: 'post', headers: {} })).rejects.toMatchObject({
      isOfflineWriteBlock: true,
    });
    await expect(requestHandler({ method: 'patch', headers: {} })).rejects.toMatchObject({ isOfflineWriteBlock: true });
    await expect(requestHandler({ method: 'delete', headers: {} })).rejects.toMatchObject({ isOfflineWriteBlock: true });
  });

  // The real property worth checking here: reads must never be blocked
  // by this check, only writes. A GET request while offline should
  // still be attempted — it's the service worker's NetworkFirst cache
  // (see vite.config.js) that decides whether a cached copy is served,
  // not this interceptor. Blocking GETs here would break the whole
  // point of the offline reading feature.
  test('a GET request while offline is not blocked', async () => {
    const { instance } = await loadFreshApi();
    setOnline(false);
    const requestHandler = instance.handlers.request[0];

    const config = await requestHandler({ method: 'get', headers: {} });
    expect(config).toEqual({ method: 'get', headers: {} });
  });

  test('a mutating request while online proceeds normally, unaffected', async () => {
    const { instance } = await loadFreshApi();
    setOnline(true);
    const requestHandler = instance.handlers.request[0];

    const config = await requestHandler({ method: 'post', headers: {} });
    expect(config).toEqual({ method: 'post', headers: {} });
  });
});

describe('api.js response interceptor - 401 refresh and retry', () => {
  test('a 401 on a non-auth endpoint triggers a refresh, then retries the original request with the new token', async () => {
    const { instance } = await loadFreshApi();
    mockPost.mockResolvedValue({ data: { accessToken: 'new-token-456' } });

    const errorHandler = instance.handlers.response[0].errorFn;
    await errorHandler(fake401Error('/customers'));

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toContain('/auth/refresh');
    expect(instance.callLog).toHaveLength(1);
    expect(instance.callLog[0].headers.Authorization).toBe('Bearer new-token-456');
  });

  test('a 401 on an auth endpoint itself does not trigger a refresh loop', async () => {
    const { instance } = await loadFreshApi();
    const errorHandler = instance.handlers.response[0].errorFn;

    await expect(errorHandler(fake401Error('/auth/login'))).rejects.toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
    expect(instance.callLog).toHaveLength(0);
  });

  test('a request already marked as retried is not retried again, avoiding an infinite loop', async () => {
    const { instance } = await loadFreshApi();
    const errorHandler = instance.handlers.response[0].errorFn;
    const alreadyRetried = fake401Error('/customers');
    alreadyRetried.config._retry = true;

    await expect(errorHandler(alreadyRetried)).rejects.toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
  });

  // The concurrency property this queueing design exists for: if several
  // requests fail with 401 while a refresh is already in flight, only
  // the first should trigger an actual refresh call — the rest should
  // queue and wait for that same refresh, not each kick off their own.
  test('multiple simultaneous 401s while a refresh is already in flight only trigger one real refresh call', async () => {
    const { instance } = await loadFreshApi();
    let resolveRefresh;
    mockPost.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));

    const errorHandler = instance.handlers.response[0].errorFn;
    const first = errorHandler(fake401Error('/customers'));
    const second = errorHandler(fake401Error('/invoices'));
    const third = errorHandler(fake401Error('/products'));

    expect(mockPost).toHaveBeenCalledTimes(1); // still only one refresh in flight

    resolveRefresh({ data: { accessToken: 'queued-token-789' } });
    await Promise.all([first, second, third]);

    expect(mockPost).toHaveBeenCalledTimes(1); // still just one, even after all three resolved
    expect(instance.callLog).toHaveLength(3); // all three original requests were retried
    expect(instance.callLog.every((c) => c.headers.Authorization === 'Bearer queued-token-789')).toBe(true);
  });

  test('a failed refresh clears the token and rejects every queued request, not just the one that triggered it', async () => {
    const { instance, tokenStore } = await loadFreshApi();
    tokenStore.setAccessToken('stale-token');
    let rejectRefresh;
    mockPost.mockReturnValue(new Promise((resolve, reject) => { rejectRefresh = reject; }));

    // jsdom provides window.location; redirect assignment itself is not
    // under test here, only that the failure path completes and rejects.
    const originalHref = window.location.href;
    delete window.location;
    window.location = { href: originalHref };

    const errorHandler = instance.handlers.response[0].errorFn;
    const first = errorHandler(fake401Error('/customers'));
    const second = errorHandler(fake401Error('/invoices'));

    rejectRefresh(new Error('refresh token expired'));

    await expect(first).rejects.toThrow('refresh token expired');
    await expect(second).rejects.toThrow('refresh token expired');
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});

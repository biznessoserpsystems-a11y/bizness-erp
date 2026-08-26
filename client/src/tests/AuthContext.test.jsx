import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { saveDraft, getDraft } from '../services/offlineDrafts';

vi.mock('../services/api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock('../services/tokenStore', () => ({
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

import api from '../services/api';
import { setAccessToken, clearAccessToken } from '../services/tokenStore';

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider — silent refresh on mount', () => {
  test('a successful silent refresh signs the person in without a password, loading user and company', async () => {
    api.post.mockResolvedValueOnce({ data: { accessToken: 'refreshed-token' } });
    api.get.mockImplementation((url) => {
      if (url === '/me') return Promise.resolve({ data: { id: 'user-1', permissions: ['sales.view'] } });
      if (url === '/company') return Promise.resolve({ data: { id: 'co-1', name: 'Kwame Traders' } });
    });

    const { result } = renderAuth();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(setAccessToken).toHaveBeenCalledWith('refreshed-token');
    expect(result.current.user).toEqual({ id: 'user-1', permissions: ['sales.view'] });
    expect(result.current.company).toEqual({ id: 'co-1', name: 'Kwame Traders' });
  });

  test('no valid session cookie fails the silent refresh quietly, leaving user and company null', async () => {
    api.post.mockRejectedValueOnce(new Error('no refresh cookie'));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(clearAccessToken).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.company).toBeNull();
    // Must not have attempted to load user/company data with no valid session.
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  test('a normal successful login sets the token and loads user and company', async () => {
    api.post.mockResolvedValueOnce({ data: { accessToken: 'refresh-noop' } }).mockRejectedValue(new Error('n/a'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();

    api.post.mockResolvedValueOnce({ data: { accessToken: 'login-token', mfaRequired: false } });
    api.get.mockImplementation((url) => {
      if (url === '/me') return Promise.resolve({ data: { id: 'user-2', permissions: [] } });
      if (url === '/company') return Promise.resolve({ data: { id: 'co-1' } });
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.login('kwame@kwametraders.com', 'StrongPass123');
    });

    expect(outcome).toEqual({ success: true });
    expect(setAccessToken).toHaveBeenCalledWith('login-token');
    expect(result.current.user).toEqual({ id: 'user-2', permissions: [] });
  });

  // A real, meaningful property: when a login response says MFA is
  // required, the session must not be treated as authenticated yet — no
  // access token stored, no user or company data fetched — until the MFA
  // step actually completes. Loading user/company prematurely here would
  // be a real security-relevant bug, not a cosmetic one.
  test('an MFA-required response does not authenticate the session or load any data', async () => {
    api.post.mockRejectedValueOnce(new Error('no refresh cookie')); // mount's silent refresh
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();

    api.post.mockResolvedValueOnce({ data: { mfaRequired: true } });

    let outcome;
    await act(async () => {
      outcome = await result.current.login('kwame@kwametraders.com', 'StrongPass123', undefined, false);
    });

    expect(outcome).toEqual({ mfaRequired: true });
    expect(setAccessToken).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });
});

describe('logout', () => {
  test('clears local session state even when the logout request itself fails on the network', async () => {
    api.post.mockRejectedValueOnce(new Error('no refresh cookie')); // mount
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();

    api.post.mockRejectedValueOnce(new Error('network error'));

    await act(async () => {
      await result.current.logout();
    });

    expect(clearAccessToken).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.company).toBeNull();
  });

  // The critical multi-tenancy safeguard: any offline draft saved for
  // the signed-in company must be genuinely gone after logout, not just
  // theoretically cleared - verified against the real storage module
  // (backed by fake-indexeddb) rather than a mocked call, since what
  // matters is the actual data no longer being there for whoever uses
  // this device next.
  test('genuinely clears offline drafts saved for the signed-in company', async () => {
    api.post.mockResolvedValueOnce({ data: { accessToken: 'refreshed-token' } }); // mount
    api.get.mockImplementation((url) => {
      if (url === '/me') return Promise.resolve({ data: { id: 'user-1', permissions: [] } });
      if (url === '/company') return Promise.resolve({ data: { id: 'company-for-logout-test' } });
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.company.id).toBe('company-for-logout-test');

    await saveDraft('company-for-logout-test', 'journal-entry', 'default', { description: 'In progress' });
    expect(await getDraft('company-for-logout-test', 'journal-entry', 'default')).not.toBeNull();

    api.post.mockResolvedValueOnce({ data: {} }); // the /auth/logout call itself
    await act(async () => {
      await result.current.logout();
    });

    expect(await getDraft('company-for-logout-test', 'journal-entry', 'default')).toBeNull();
  });
});

describe('hasPermission', () => {
  test('returns falsy when no user is signed in yet, without throwing', async () => {
    api.post.mockRejectedValueOnce(new Error('no refresh cookie'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasPermission('sales.view')).toBeFalsy();
  });

  test('correctly reflects the signed-in user\'s actual permission list', async () => {
    api.post.mockResolvedValueOnce({ data: { accessToken: 't' } });
    api.get.mockImplementation((url) => {
      if (url === '/me') return Promise.resolve({ data: { id: 'user-1', permissions: ['sales.view', 'hr.payroll.manage'] } });
      if (url === '/company') return Promise.resolve({ data: { id: 'co-1' } });
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasPermission('sales.view')).toBe(true);
    expect(result.current.hasPermission('assets.register.manage')).toBe(false);
  });
});

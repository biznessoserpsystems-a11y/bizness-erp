import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// withCredentials is required so the browser actually sends and receives
// the httpOnly refreshToken cookie the server sets on login — without
// this, that cookie would never make it back on the /auth/refresh call.
const api = axios.create({ baseURL: API_URL, withCredentials: true });

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Deliberately does not queue writes for later replay — see the note
  // in vite.config.js's runtimeCaching section for why: this is a
  // financial system where a write validated against stale, offline
  // client state (an account balance, a stock level, a permission)
  // could silently conflict with what the server actually holds by the
  // time it's replayed. Better to tell someone plainly now that saving
  // requires a connection than to let them believe an action already
  // succeeded. navigator.onLine can occasionally under-report true
  // connectivity (e.g. on a captive portal), so this is a fast, clear
  // first check, not the only line of defense — a request that slips
  // through with a stale "online" reading still fails naturally via
  // the ordinary network error path below.
  if (!navigator.onLine && MUTATING_METHODS.has((config.method || '').toLowerCase())) {
    const offlineError = new Error('This action requires a connection. Reconnect and try again.');
    offlineError.isOfflineWriteBlock = true;
    return Promise.reject(offlineError);
  }

  return config;
});

let isRefreshing = false;
let queue = [];

function flushQueue(error, token) {
  queue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)));
  queue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // Don't try to refresh on the auth endpoints themselves.
    if (status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // No body needed — the refresh token travels as an httpOnly
        // cookie the browser attaches on its own; withCredentials makes
        // sure this specific request actually sends it.
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        setAccessToken(data.accessToken);
        flushQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        flushQueue(refreshError, null);
        clearAccessToken();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

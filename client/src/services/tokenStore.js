// The access token lives here — in memory only, never localStorage — so
// it doesn't persist across a page reload, a closed tab, or (more to the
// point) sit somewhere a future XSS bug could quietly read it back out
// long after the page that leaked it is gone. A plain module-level
// variable rather than React state, since api.js's axios interceptors
// run outside any component and need synchronous, non-hook access to
// the current token on every single request.
let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

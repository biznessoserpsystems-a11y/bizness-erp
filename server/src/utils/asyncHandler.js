// Wraps an async route handler so rejected promises reach Express's error middleware.
// Returns the promise chain rather than leaving it fire-and-forget - Express's own
// dispatch never awaits or inspects a middleware's return value, so this changes
// nothing about normal HTTP request handling, but it means a controller called
// directly (as any integration test that imports and calls one would do) can
// genuinely be awaited to completion, rather than the caller's await resolving to
// undefined before the real async work - and any error it throws - has happened.
module.exports = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// Must be registered last, after all routes.
const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) {
    console.error(err);
  }

  // An ApiError's message was written by this app's own code specifically
  // to be shown to whoever made the request ("Customer not found",
  // "Password must be 8+ characters...") — always safe to return as-is.
  // Anything else reaching here is unexpected: a raw database error, a
  // null-pointer exception, something that escaped without being
  // deliberately wrapped. Its message was written for a developer
  // reading logs, not a person using the app, and could easily mention
  // a table or column name, a file path, or some other internal detail
  // that was never meant to leave this server. The full error is still
  // logged above either way — only what's sent back to the client
  // changes here.
  const isKnownError = err instanceof ApiError;
  res.status(statusCode).json({
    error: isKnownError ? err.message : 'Something went wrong. Please try again.',
    details: isKnownError ? (err.details || undefined) : undefined,
  });
};

const ApiError = require('../utils/ApiError');

/**
 * Usage: router.post('/users', authenticate, requirePermission('system.users.manage'), handler)
 * Must run after `authenticate` so req.user.permissions is populated.
 */
function requirePermission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    const has = codes.some((code) => req.user.permissions.includes(code));
    if (!has) {
      return next(new ApiError(403, `Missing required permission: ${codes.join(' or ')}`));
    }
    next();
  };
}

module.exports = { requirePermission };

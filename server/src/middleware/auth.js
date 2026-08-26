const { verifyAccessToken } = require('../utils/jwt');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Requires a valid Bearer access token. Attaches req.user with
 * { id, companyId, email } and req.user.roles / req.user.permissions.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw new ApiError(401, 'Authentication required');

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const { rows } = await db.query(
    `SELECT u.id, u.company_id, u.email, u.first_name, u.last_name, u.is_active
     FROM users u WHERE u.id = $1`,
    [decoded.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new ApiError(401, 'Account is inactive or not found');

  const permsResult = await db.query(
    `SELECT DISTINCT p.code
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1`,
    [user.id]
  );

  req.user = {
    id: user.id,
    companyId: user.company_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    permissions: permsResult.rows.map((r) => r.code),
  };

  next();
});

module.exports = { authenticate };

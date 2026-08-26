const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { hashPassword, isStrongPassword } = require('../utils/password');
const { recordAudit } = require('../middleware/auditLog');

// GET /users
const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, u.mfa_enabled,
            u.last_login_at, u.created_at,
            COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.company_id = $1
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /users
const createUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password, roleIds } = req.body;
  if (!firstName || !lastName || !email || !password) {
    throw new ApiError(400, 'firstName, lastName, email, and password are required');
  }
  if (!isStrongPassword(password)) {
    throw new ApiError(400, 'Password must be 8+ characters with upper, lower, and a number');
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) throw new ApiError(409, 'A user with this email already exists');

  const passwordHash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (company_id, first_name, last_name, email, phone, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email`,
    [req.user.companyId, firstName, lastName, email.toLowerCase(), phone || null, passwordHash]
  );
  const newUser = rows[0];

  if (Array.isArray(roleIds) && roleIds.length) {
    for (const roleId of roleIds) {
      await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [newUser.id, roleId]);
    }
  }

  await recordAudit({
    companyId: req.user.companyId,
    userId: req.user.id,
    action: 'CREATE',
    entityType: 'user',
    entityId: newUser.id,
    newValues: { firstName, lastName, email },
    ip: req.ip,
  });

  res.status(201).json(newUser);
});

// PATCH /users/:id
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, phone, isActive, roleIds } = req.body;

  const existing = await db.query('SELECT * FROM users WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'User not found');
  const before = existing.rows[0];

  const { rows } = await db.query(
    `UPDATE users SET
       first_name = COALESCE($1, first_name),
       last_name  = COALESCE($2, last_name),
       phone      = COALESCE($3, phone),
       is_active  = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE id = $5 RETURNING id, first_name, last_name, email, phone, is_active`,
    [firstName, lastName, phone, isActive, id]
  );

  if (Array.isArray(roleIds)) {
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    for (const roleId of roleIds) {
      await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, roleId]);
    }
  }

  await recordAudit({
    companyId: req.user.companyId,
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: id,
    oldValues: before,
    newValues: req.body,
    ip: req.ip,
  });

  res.json(rows[0]);
});

// DELETE /users/:id  (soft delete: deactivate)
const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) throw new ApiError(400, 'You cannot deactivate your own account');

  const { rows } = await db.query(
    `UPDATE users SET is_active = FALSE WHERE id = $1 AND company_id = $2 RETURNING id`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'User not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'user', entityId: id, ip: req.ip });
  res.json({ message: 'User deactivated' });
});

module.exports = { listUsers, createUser, updateUser, deactivateUser };

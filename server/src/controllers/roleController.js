const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// GET /roles
const listRoles = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.id, r.name, r.description, r.is_system_role,
            COALESCE(json_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '[]') AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE r.company_id = $1
     GROUP BY r.id
     ORDER BY r.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /permissions  (full catalog, not company-scoped)
const listPermissions = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT id, module, action, code, description FROM permissions ORDER BY module, action');
  res.json(rows);
});

// POST /roles
const createRole = asyncHandler(async (req, res) => {
  const { name, description, permissionIds } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const { rows } = await db.query(
    `INSERT INTO roles (company_id, name, description) VALUES ($1, $2, $3) RETURNING id, name, description`,
    [req.user.companyId, name, description || null]
  );
  const role = rows[0];

  if (Array.isArray(permissionIds)) {
    for (const permId of permissionIds) {
      await db.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [role.id, permId]);
    }
  }

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'role', entityId: role.id, newValues: { name }, ip: req.ip });
  res.status(201).json(role);
});

// PATCH /roles/:id
const updateRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, permissionIds } = req.body;

  const existing = await db.query('SELECT * FROM roles WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Role not found');
  if (existing.rows[0].is_system_role) throw new ApiError(403, 'System roles cannot be modified');

  const { rows } = await db.query(
    `UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING id, name, description`,
    [name, description, id]
  );

  if (Array.isArray(permissionIds)) {
    await db.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
    for (const permId of permissionIds) {
      await db.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, permId]);
    }
  }

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'role', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /roles/:id
const deleteRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await db.query('SELECT * FROM roles WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Role not found');
  if (existing.rows[0].is_system_role) throw new ApiError(403, 'System roles cannot be deleted');

  await db.query('DELETE FROM roles WHERE id = $1', [id]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'role', entityId: id, ip: req.ip });
  res.json({ message: 'Role deleted' });
});

module.exports = { listRoles, listPermissions, createRole, updateRole, deleteRole };

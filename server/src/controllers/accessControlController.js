const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeToCidr, ipMatchesAllowlist } = require('../utils/ipAllowlist');
const { recordAudit } = require('../middleware/auditLog');

// GET /access-control/sessions
const listSessions = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.id, s.ip_address, s.user_agent, s.created_at, s.expires_at,
            u.id AS user_id, u.first_name, u.last_name, u.email
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE u.company_id = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
     ORDER BY s.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// DELETE /access-control/sessions/:id
const revokeSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Scoped through a join to users.company_id so one company can never
  // revoke a session belonging to a different company, even by guessing
  // a valid-looking session ID. Setting revoked_at (rather than
  // deleting the row) is what actually takes effect - /auth/refresh
  // already checks revoked_at IS NULL, so this forces the affected
  // session out the next time its short-lived access token expires.
  const { rows } = await db.query(
    `UPDATE user_sessions s SET revoked_at = NOW()
     FROM users u
     WHERE s.id = $1 AND s.user_id = u.id AND u.company_id = $2 AND s.revoked_at IS NULL
     RETURNING s.id`,
    [id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Session not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'REVOKE_SESSION', entityType: 'user_session', entityId: id });
  res.json({ message: 'Session revoked' });
});

// GET /access-control/ip-rules
const listIpRules = asyncHandler(async (req, res) => {
  const [rulesResult, companyResult] = await Promise.all([
    db.query('SELECT id, cidr, description, created_at FROM ip_allowlist_rules WHERE company_id = $1 ORDER BY created_at', [req.user.companyId]),
    db.query('SELECT ip_restriction_enabled FROM companies WHERE id = $1', [req.user.companyId]),
  ]);
  res.json({ rules: rulesResult.rows, enabled: companyResult.rows[0]?.ip_restriction_enabled || false, yourIp: req.ip });
});

// POST /access-control/ip-rules
const createIpRule = asyncHandler(async (req, res) => {
  const { cidr, description } = req.body;
  if (!cidr) throw new ApiError(400, 'cidr is required');

  let normalized;
  try {
    normalized = normalizeToCidr(cidr);
  } catch {
    throw new ApiError(400, `"${cidr}" is not a valid IP address or CIDR range`);
  }

  const { rows } = await db.query(
    `INSERT INTO ip_allowlist_rules (company_id, cidr, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.companyId, normalized, description || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// DELETE /access-control/ip-rules/:id
const deleteIpRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await db.query('DELETE FROM ip_allowlist_rules WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!rowCount) throw new ApiError(404, 'Rule not found');
  res.json({ message: 'Rule removed' });
});

// PATCH /access-control/ip-restriction  { enabled: boolean }
const setIpRestrictionEnabled = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') throw new ApiError(400, 'enabled must be true or false');

  if (enabled) {
    const rulesResult = await db.query('SELECT cidr FROM ip_allowlist_rules WHERE company_id = $1', [req.user.companyId]);
    if (!rulesResult.rows.length) {
      throw new ApiError(400, 'Add at least one allowed IP or range before enabling this - otherwise it would lock everyone out immediately.');
    }
    // The critical self-lockout safeguard: refuse to enable this if the
    // very request enabling it wouldn't itself be let through
    // afterward.
    const cidrs = rulesResult.rows.map((r) => r.cidr);
    if (!ipMatchesAllowlist(req.ip, cidrs)) {
      throw new ApiError(400, `Your current IP (${req.ip}) is not in the allowed list. Add it first, or you will be locked out immediately after enabling this.`);
    }
  }

  await db.query('UPDATE companies SET ip_restriction_enabled = $1 WHERE id = $2', [enabled, req.user.companyId]);
  await recordAudit({
    companyId: req.user.companyId, userId: req.user.id,
    action: enabled ? 'ENABLE_IP_RESTRICTION' : 'DISABLE_IP_RESTRICTION',
    entityType: 'company', entityId: req.user.companyId,
  });
  res.json({ enabled });
});

module.exports = { listSessions, revokeSession, listIpRules, createIpRule, deleteIpRule, setIpRestrictionEnabled };

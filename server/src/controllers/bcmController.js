const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('../middleware/auditLog');

const CATEGORIES = ['operational', 'financial', 'technology', 'supply_chain', 'regulatory', 'human_resources', 'natural_disaster', 'reputational', 'other'];

// ============================================================================
// Risk Register
// ============================================================================

// GET /bcm/risks
const listRisks = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.*, e.first_name AS owner_first_name, e.last_name AS owner_last_name
     FROM bcm_risks r LEFT JOIN employees e ON e.id = r.owner_employee_id
     WHERE r.company_id = $1 ORDER BY r.risk_score DESC, r.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /bcm/risks
const createRisk = asyncHandler(async (req, res) => {
  const { category, title, description, likelihood, impact, ownerEmployeeId, mitigationPlan, reviewDate } = req.body;
  if (!category || !CATEGORIES.includes(category)) throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  if (!title) throw new ApiError(400, 'title is required');
  if (!likelihood || likelihood < 1 || likelihood > 5) throw new ApiError(400, 'likelihood must be between 1 and 5');
  if (!impact || impact < 1 || impact > 5) throw new ApiError(400, 'impact must be between 1 and 5');

  const { rows } = await db.query(
    `INSERT INTO bcm_risks (company_id, category, title, description, likelihood, impact, owner_employee_id, mitigation_plan, review_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, category, title, description || null, likelihood, impact, ownerEmployeeId || null, mitigationPlan || null, reviewDate || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'bcm_risk', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /bcm/risks/:id
const updateRisk = asyncHandler(async (req, res) => {
  const { category, title, description, likelihood, impact, status, ownerEmployeeId, mitigationPlan, reviewDate } = req.body;
  if (category && !CATEGORIES.includes(category)) throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  if (likelihood !== undefined && (likelihood < 1 || likelihood > 5)) throw new ApiError(400, 'likelihood must be between 1 and 5');
  if (impact !== undefined && (impact < 1 || impact > 5)) throw new ApiError(400, 'impact must be between 1 and 5');
  const validStatuses = ['identified', 'monitoring', 'mitigating', 'resolved', 'accepted'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE bcm_risks SET
       category = COALESCE($1, category), title = COALESCE($2, title), description = COALESCE($3, description),
       likelihood = COALESCE($4, likelihood), impact = COALESCE($5, impact), status = COALESCE($6, status),
       owner_employee_id = COALESCE($7, owner_employee_id), mitigation_plan = COALESCE($8, mitigation_plan),
       review_date = COALESCE($9, review_date), updated_at = NOW()
     WHERE id = $10 AND company_id = $11 RETURNING *`,
    [category, title, description, likelihood, impact, status, ownerEmployeeId, mitigationPlan, reviewDate, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Risk not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'bcm_risk', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /bcm/risks/:id
// Safe to delete outright — linked continuity plans and incidents keep
// their own record, they just lose the risk reference (ON DELETE SET NULL).
const deleteRisk = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM bcm_risks WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Risk not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'bcm_risk', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Business Impact Analysis (Critical Functions)
// ============================================================================

// GET /bcm/critical-functions
const listCriticalFunctions = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM bcm_critical_functions WHERE company_id = $1 ORDER BY rto_hours ASC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /bcm/critical-functions
const createCriticalFunction = asyncHandler(async (req, res) => {
  const { functionName, department, rtoHours, rpoHours, impactIfDisrupted, keyDependencies, backupPlan } = req.body;
  if (!functionName) throw new ApiError(400, 'functionName is required');
  if (rtoHours === undefined || Number(rtoHours) < 0) throw new ApiError(400, 'rtoHours is required and cannot be negative');
  if (rpoHours === undefined || Number(rpoHours) < 0) throw new ApiError(400, 'rpoHours is required and cannot be negative');

  const { rows } = await db.query(
    `INSERT INTO bcm_critical_functions (company_id, function_name, department, rto_hours, rpo_hours, impact_if_disrupted, key_dependencies, backup_plan, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.companyId, functionName, department || null, rtoHours, rpoHours, impactIfDisrupted || null, keyDependencies || null, backupPlan || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'bcm_critical_function', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /bcm/critical-functions/:id
const updateCriticalFunction = asyncHandler(async (req, res) => {
  const { functionName, department, rtoHours, rpoHours, impactIfDisrupted, keyDependencies, backupPlan } = req.body;
  const { rows } = await db.query(
    `UPDATE bcm_critical_functions SET
       function_name = COALESCE($1, function_name), department = COALESCE($2, department),
       rto_hours = COALESCE($3, rto_hours), rpo_hours = COALESCE($4, rpo_hours),
       impact_if_disrupted = COALESCE($5, impact_if_disrupted), key_dependencies = COALESCE($6, key_dependencies),
       backup_plan = COALESCE($7, backup_plan), updated_at = NOW()
     WHERE id = $8 AND company_id = $9 RETURNING *`,
    [functionName, department, rtoHours, rpoHours, impactIfDisrupted, keyDependencies, backupPlan, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Critical function not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'bcm_critical_function', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /bcm/critical-functions/:id
const deleteCriticalFunction = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM bcm_critical_functions WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Critical function not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'bcm_critical_function', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Continuity Plans
// ============================================================================

// GET /bcm/continuity-plans
const listContinuityPlans = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, r.title AS risk_title, e.first_name AS responsible_first_name, e.last_name AS responsible_last_name
     FROM bcm_continuity_plans p
     LEFT JOIN bcm_risks r ON r.id = p.risk_id
     LEFT JOIN employees e ON e.id = p.responsible_employee_id
     WHERE p.company_id = $1 ORDER BY p.next_test_due ASC NULLS LAST, p.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /bcm/continuity-plans
const createContinuityPlan = asyncHandler(async (req, res) => {
  const { riskId, planName, scenario, actionSteps, responsibleEmployeeId, status, lastTestedDate, nextTestDue } = req.body;
  if (!planName) throw new ApiError(400, 'planName is required');
  if (!scenario) throw new ApiError(400, 'scenario is required');
  if (!actionSteps) throw new ApiError(400, 'actionSteps is required');
  const validStatuses = ['draft', 'active', 'needs_review'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  if (riskId) {
    const risk = await db.query('SELECT id FROM bcm_risks WHERE id = $1 AND company_id = $2', [riskId, req.user.companyId]);
    if (!risk.rows.length) throw new ApiError(404, 'Linked risk not found');
  }

  const { rows } = await db.query(
    `INSERT INTO bcm_continuity_plans (company_id, risk_id, plan_name, scenario, action_steps, responsible_employee_id, status, last_tested_date, next_test_due, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, riskId || null, planName, scenario, actionSteps, responsibleEmployeeId || null, status || 'draft', lastTestedDate || null, nextTestDue || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'bcm_continuity_plan', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /bcm/continuity-plans/:id
const updateContinuityPlan = asyncHandler(async (req, res) => {
  const { riskId, planName, scenario, actionSteps, responsibleEmployeeId, status, lastTestedDate, nextTestDue } = req.body;
  const validStatuses = ['draft', 'active', 'needs_review'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE bcm_continuity_plans SET
       risk_id = COALESCE($1, risk_id), plan_name = COALESCE($2, plan_name), scenario = COALESCE($3, scenario),
       action_steps = COALESCE($4, action_steps), responsible_employee_id = COALESCE($5, responsible_employee_id),
       status = COALESCE($6, status), last_tested_date = COALESCE($7, last_tested_date), next_test_due = COALESCE($8, next_test_due),
       updated_at = NOW()
     WHERE id = $9 AND company_id = $10 RETURNING *`,
    [riskId, planName, scenario, actionSteps, responsibleEmployeeId, status, lastTestedDate, nextTestDue, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Continuity plan not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'bcm_continuity_plan', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /bcm/continuity-plans/:id
const deleteContinuityPlan = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM bcm_continuity_plans WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Continuity plan not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'bcm_continuity_plan', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Incident Log
// ============================================================================

// GET /bcm/incidents
const listIncidents = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.*, r.title AS risk_title FROM bcm_incidents i LEFT JOIN bcm_risks r ON r.id = i.risk_id
     WHERE i.company_id = $1 ORDER BY i.incident_date DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /bcm/incidents
const createIncident = asyncHandler(async (req, res) => {
  const { riskId, incidentDate, category, title, description, severity, impactDurationHours, responseTaken } = req.body;
  if (!incidentDate) throw new ApiError(400, 'incidentDate is required');
  if (!category || !CATEGORIES.includes(category)) throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  if (!title) throw new ApiError(400, 'title is required');
  const validSeverities = ['low', 'medium', 'high', 'critical'];
  if (!severity || !validSeverities.includes(severity)) throw new ApiError(400, `severity must be one of: ${validSeverities.join(', ')}`);

  if (riskId) {
    const risk = await db.query('SELECT id FROM bcm_risks WHERE id = $1 AND company_id = $2', [riskId, req.user.companyId]);
    if (!risk.rows.length) throw new ApiError(404, 'Linked risk not found');
  }

  const { rows } = await db.query(
    `INSERT INTO bcm_incidents (company_id, risk_id, incident_date, category, title, description, severity, impact_duration_hours, response_taken, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, riskId || null, incidentDate, category, title, description || null, severity, impactDurationHours || null, responseTaken || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'bcm_incident', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /bcm/incidents/:id/resolve { resolvedDate, lessonsLearned }
const resolveIncident = asyncHandler(async (req, res) => {
  const { resolvedDate, lessonsLearned } = req.body;
  const { rows } = await db.query(
    `UPDATE bcm_incidents SET is_resolved = TRUE, resolved_date = $1, lessons_learned = $2, updated_at = NOW()
     WHERE id = $3 AND company_id = $4 RETURNING *`,
    [resolvedDate || new Date().toISOString().slice(0, 10), lessonsLearned || null, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Incident not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'bcm_incident', entityId: req.params.id, newValues: { resolved: true }, ip: req.ip });
  res.json(rows[0]);
});

// PATCH /bcm/incidents/:id — full edit, distinct from the /resolve action above
const updateIncident = asyncHandler(async (req, res) => {
  const { riskId, incidentDate, category, title, description, severity, impactDurationHours, responseTaken } = req.body;
  if (category && !CATEGORIES.includes(category)) throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  const validSeverities = ['low', 'medium', 'high', 'critical'];
  if (severity && !validSeverities.includes(severity)) throw new ApiError(400, `severity must be one of: ${validSeverities.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE bcm_incidents SET
       risk_id = COALESCE($1, risk_id), incident_date = COALESCE($2, incident_date), category = COALESCE($3, category),
       title = COALESCE($4, title), description = COALESCE($5, description), severity = COALESCE($6, severity),
       impact_duration_hours = COALESCE($7, impact_duration_hours), response_taken = COALESCE($8, response_taken), updated_at = NOW()
     WHERE id = $9 AND company_id = $10 RETURNING *`,
    [riskId, incidentDate, category, title, description, severity, impactDurationHours, responseTaken, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Incident not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'bcm_incident', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /bcm/incidents/:id
const deleteIncident = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM bcm_incidents WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Incident not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'bcm_incident', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Workspace dashboard — integrates with existing backup_logs and
// compliance_items rather than duplicating them.
// ============================================================================

// GET /bcm/workspace-dashboard
const getWorkspaceDashboard = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  const [risks, plans, incidents, criticalFunctions] = await Promise.all([
    db.query(`SELECT * FROM bcm_risks WHERE company_id = $1`, [companyId]),
    db.query(`SELECT * FROM bcm_continuity_plans WHERE company_id = $1`, [companyId]),
    db.query(`SELECT * FROM bcm_incidents WHERE company_id = $1 ORDER BY incident_date DESC LIMIT 5`, [companyId]),
    db.query(`SELECT * FROM bcm_critical_functions WHERE company_id = $1`, [companyId]),
  ]);

  const activeRisks = risks.rows.filter((r) => !['resolved', 'accepted'].includes(r.status));
  const highRisks = activeRisks.filter((r) => r.risk_score >= 15); // 5x3 or higher-equivalent — a real "needs attention" threshold, not just top-of-list
  const topRisks = [...risks.rows].sort((a, b) => b.risk_score - a.risk_score).slice(0, 5);

  const now = new Date();
  const plansNeedingReview = plans.rows.filter((p) => p.status === 'needs_review' || (p.next_test_due && new Date(p.next_test_due) < now));
  const unresolvedIncidents = incidents.rows.filter((i) => !i.is_resolved);

  // Real backup health signal, not a duplicated record — the last actual
  // successful backup this system has on file.
  const lastBackupResult = await db.query(
    `SELECT * FROM backup_logs WHERE action = 'backup' AND status = 'success' ORDER BY created_at DESC LIMIT 1`
  );
  const lastBackup = lastBackupResult.rows[0] || null;
  const daysSinceLastBackup = lastBackup ? Math.floor((now - new Date(lastBackup.created_at)) / 86400000) : null;

  // Real statutory compliance signal, not a duplicated record.
  const complianceResult = await db.query(
    `SELECT * FROM compliance_items WHERE company_id = $1 AND status IN ('expired', 'expiring_soon')`,
    [companyId]
  );

  res.json({
    totalRisks: risks.rows.length,
    activeRisksCount: activeRisks.length,
    highRisksCount: highRisks.length,
    topRisks,
    criticalFunctionsCount: criticalFunctions.rows.length,
    plansCount: plans.rows.length,
    plansNeedingReview,
    recentIncidents: incidents.rows,
    unresolvedIncidentsCount: unresolvedIncidents.length,
    lastBackup,
    daysSinceLastBackup,
    complianceGaps: complianceResult.rows,
  });
});

module.exports = {
  listRisks, createRisk, updateRisk, deleteRisk,
  listCriticalFunctions, createCriticalFunction, updateCriticalFunction, deleteCriticalFunction,
  listContinuityPlans, createContinuityPlan, updateContinuityPlan, deleteContinuityPlan,
  listIncidents, createIncident, resolveIncident, updateIncident, deleteIncident,
  getWorkspaceDashboard,
};

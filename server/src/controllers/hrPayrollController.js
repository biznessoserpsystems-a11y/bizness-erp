const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const payrollService = require('../services/payrollService');
const accountingService = require('../services/accountingService');
const { seedOnboardingSteps } = require('../services/onboardingService');
const { hashPassword, isStrongPassword } = require('../utils/password');

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'trainee'];
const EMPLOYMENT_STATUSES = ['active', 'on_leave', 'terminated'];
const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

// SSNIT rates and PAYE bands are configured per company in the database
// (payroll_settings / paye_tax_bands) and read at processing time, so they can
// be updated from the UI when the GRA revises them. See services/payrollService.js.

// ============================================================
// Employee Contract Terms (Part Time / Contract / Trainee / Internship)
// ============================================================

// GET /employees/:employeeId/contract-terms
const listContractTerms = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM employee_contract_terms WHERE employee_id = $1 AND company_id = $2 ORDER BY effective_from DESC`,
    [req.params.employeeId, req.user.companyId]
  );
  res.json(rows);
});

// POST /employees/:employeeId/contract-terms
// { salary, ssnitTier1Enabled, tier1EmployeeRate, tier1EmployerRate,
//   ssnitTier2Enabled, tier2EmployerRate, ssnitTier3Enabled, tier3EmployeeRate, tier3EmployerRate,
//   payeEnabled, withholdingEnabled, withholdingRate, effectiveFrom, notes }
// Creating a new term deactivates whichever was active before, so payroll
// always has exactly one unambiguous "how is this person taxed right now"
// per employee rather than resolving conflicting active rows itself.
const createContractTerm = asyncHandler(async (req, res) => {
  const {
    salary, ssnitTier1Enabled, tier1EmployeeRate, tier1EmployerRate,
    ssnitTier2Enabled, tier2EmployerRate, ssnitTier3Enabled, tier3EmployeeRate, tier3EmployerRate,
    payeEnabled, withholdingEnabled, withholdingRate, effectiveFrom, notes,
  } = req.body;

  if (!salary || Number(salary) <= 0) throw new ApiError(400, 'salary is required and must be greater than zero');
  if (!effectiveFrom) throw new ApiError(400, 'effectiveFrom is required');
  if (payeEnabled && withholdingEnabled) {
    throw new ApiError(400, 'A contract term is either an employment relationship (PAYE) or a contractor relationship (withholding tax), not both');
  }

  const employee = await db.query('SELECT id, employment_type FROM employees WHERE id = $1 AND company_id = $2', [req.params.employeeId, req.user.companyId]);
  if (!employee.rows.length) throw new ApiError(404, 'Employee not found');
  if (employee.rows[0].employment_type === 'full_time') {
    throw new ApiError(400, 'Full-time employees use the standard company-wide SSNIT/PAYE settings, not individual contract terms — see HR & Payroll Settings');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE employee_contract_terms SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1 AND is_active = TRUE`,
      [req.params.employeeId]
    );
    const { rows } = await client.query(
      `INSERT INTO employee_contract_terms (
         company_id, employee_id, salary,
         ssnit_tier1_enabled, tier1_employee_rate, tier1_employer_rate,
         ssnit_tier2_enabled, tier2_employer_rate,
         ssnit_tier3_enabled, tier3_employee_rate, tier3_employer_rate,
         paye_enabled, withholding_enabled, withholding_rate,
         effective_from, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.user.companyId, req.params.employeeId, salary,
        !!ssnitTier1Enabled, tier1EmployeeRate ?? 5.5, tier1EmployerRate ?? 8.0,
        !!ssnitTier2Enabled, tier2EmployerRate ?? 5.0,
        !!ssnitTier3Enabled, tier3EmployeeRate ?? 0, tier3EmployerRate ?? 0,
        !!payeEnabled, !!withholdingEnabled, withholdingRate ?? 15.0,
        effectiveFrom, notes || null, req.user.id,
      ]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'employee_contract_term', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /employees/:employeeId/contract-terms/:id
// Direct correction of a term's own fields — distinct from creating a new
// term (which deactivates this one and starts a fresh one). Useful for
// fixing a typo'd rate or salary without disturbing the effective-date
// history a brand new term would create.
const updateContractTerm = asyncHandler(async (req, res) => {
  const {
    salary, ssnitTier1Enabled, tier1EmployeeRate, tier1EmployerRate,
    ssnitTier2Enabled, tier2EmployerRate, ssnitTier3Enabled, tier3EmployeeRate, tier3EmployerRate,
    payeEnabled, withholdingEnabled, withholdingRate, effectiveFrom, notes,
  } = req.body;
  if (payeEnabled && withholdingEnabled) {
    throw new ApiError(400, 'A contract term is either an employment relationship (PAYE) or a contractor relationship (withholding tax), not both');
  }
  if (salary !== undefined && Number(salary) <= 0) throw new ApiError(400, 'salary must be greater than zero');

  const { rows } = await db.query(
    `UPDATE employee_contract_terms SET
       salary = COALESCE($1, salary),
       ssnit_tier1_enabled = COALESCE($2, ssnit_tier1_enabled), tier1_employee_rate = COALESCE($3, tier1_employee_rate), tier1_employer_rate = COALESCE($4, tier1_employer_rate),
       ssnit_tier2_enabled = COALESCE($5, ssnit_tier2_enabled), tier2_employer_rate = COALESCE($6, tier2_employer_rate),
       ssnit_tier3_enabled = COALESCE($7, ssnit_tier3_enabled), tier3_employee_rate = COALESCE($8, tier3_employee_rate), tier3_employer_rate = COALESCE($9, tier3_employer_rate),
       paye_enabled = COALESCE($10, paye_enabled), withholding_enabled = COALESCE($11, withholding_enabled), withholding_rate = COALESCE($12, withholding_rate),
       effective_from = COALESCE($13, effective_from), notes = COALESCE($14, notes), updated_at = NOW()
     WHERE id = $15 AND employee_id = $16 AND company_id = $17 RETURNING *`,
    [
      salary, ssnitTier1Enabled, tier1EmployeeRate, tier1EmployerRate,
      ssnitTier2Enabled, tier2EmployerRate, ssnitTier3Enabled, tier3EmployeeRate, tier3EmployerRate,
      payeEnabled, withholdingEnabled, withholdingRate, effectiveFrom, notes,
      req.params.id, req.params.employeeId, req.user.companyId,
    ]
  );
  if (!rows.length) throw new ApiError(404, 'Contract term not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'employee_contract_term', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /employees/:employeeId/contract-terms/:id
// Safe to delete outright — any payslip already computed off this term
// keeps its own stored figures and just loses the trace reference
// (ON DELETE SET NULL), so historical payroll numbers are never affected.
const deleteContractTerm = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM employee_contract_terms WHERE id = $1 AND employee_id = $2 AND company_id = $3 RETURNING id',
    [req.params.id, req.params.employeeId, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Contract term not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'employee_contract_term', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================
// Employees
// ============================================================

// GET /employees?status=active&department=Engineering
const listEmployees = asyncHandler(async (req, res) => {
  const { status, department } = req.query;
  const conditions = ['e.company_id = $1'];
  const params = [req.user.companyId];
  if (status) {
    conditions.push(`e.employment_status = $${params.length + 1}`);
    params.push(status);
  }
  if (department) {
    conditions.push(`e.department = $${params.length + 1}`);
    params.push(department);
  }
  const { rows } = await db.query(
    `SELECT e.*, m.first_name AS manager_first_name, m.last_name AS manager_last_name,
            s.name AS shift_name
     FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
     LEFT JOIN shifts s ON s.id = e.shift_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.created_at DESC`,
    params
  );
  res.json(rows);
});

// GET /employees/:id — includes leave history and payslip history
const getEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT e.*, m.first_name AS manager_first_name, m.last_name AS manager_last_name,
            s.name AS shift_name, s.start_time AS shift_start_time, s.end_time AS shift_end_time
     FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
     LEFT JOIN shifts s ON s.id = e.shift_id
     WHERE e.id = $1 AND e.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Employee not found');

  const leave = await db.query(
    `SELECT lr.*, lt.name AS leave_type_name FROM leave_requests lr
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.employee_id = $1 ORDER BY lr.start_date DESC`,
    [id]
  );
  const payslips = await db.query(
    `SELECT p.*, pr.period_month, pr.period_year, pr.status AS run_status FROM payslips p
     JOIN payroll_runs pr ON pr.id = p.payroll_run_id
     WHERE p.employee_id = $1 ORDER BY pr.period_year DESC, pr.period_month DESC`,
    [id]
  );
  res.json({ ...header.rows[0], leaveRequests: leave.rows, payslips: payslips.rows });
});

// POST /employees { firstName, lastName, email, phone, jobTitle, department, employmentType,
//                    managerId, hireDate, basicSalary, allowances, bankName, bankAccountNumber,
//                    ssnitNumber, tinNumber, notes }
const createEmployee = asyncHandler(async (req, res) => {
  const {
    firstName, lastName, email, phone, jobTitle, department, employmentType,
    managerId, hireDate, basicSalary, allowances, bankName, bankAccountNumber,
    ssnitNumber, tinNumber, notes,
    dateOfBirth, gender, maritalStatus, nationalId, address,
    emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
  } = req.body;

  if (!firstName || !lastName) throw new ApiError(400, 'firstName and lastName are required');
  if (!hireDate) throw new ApiError(400, 'hireDate is required');
  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType)) {
    throw new ApiError(400, `employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`);
  }

  const countResult = await db.query('SELECT COUNT(*)::int AS n FROM employees WHERE company_id = $1', [req.user.companyId]);
  const employeeNo = `EMP-${String(countResult.rows[0].n + 1).padStart(4, '0')}`;

  const { rows } = await db.query(
    `INSERT INTO employees (
       company_id, employee_no, first_name, last_name, email, phone, job_title, department,
       employment_type, manager_id, hire_date, basic_salary, allowances, bank_name,
       bank_account_number, ssnit_number, tin_number, notes, created_by,
       date_of_birth, gender, marital_status, national_id, address,
       emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
       probation_status, probation_end_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING *`,
    [
      req.user.companyId, employeeNo, firstName, lastName, email || null, phone || null,
      jobTitle || null, department || null, employmentType || 'full_time', managerId || null,
      hireDate, basicSalary || 0, allowances || 0, bankName || null, bankAccountNumber || null,
      ssnitNumber || null, tinNumber || null, notes || null, req.user.id,
      dateOfBirth || null, gender || null, maritalStatus || null, nationalId || null, address || null,
      emergencyContactName || null, emergencyContactPhone || null, emergencyContactRelationship || null,
      'on_probation', new Date(new Date(hireDate).getTime() + 90 * 86400000).toISOString().slice(0, 10),
    ]
  );

  await db.query(
    `INSERT INTO employee_history (company_id, employee_id, change_type, note, effective_date, changed_by)
     VALUES ($1,$2,'hired',$3,$4,$5)`,
    [req.user.companyId, rows[0].id, `Hired as ${jobTitle || 'employee'}${department ? ` in ${department}` : ''}`, hireDate, req.user.id]
  );

  await seedOnboardingSteps(req.user.companyId, rows[0].id, hireDate);

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'employee', entityId: rows[0].id, newValues: { firstName, lastName, employeeNo }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /employees/:id
const updateEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    firstName, lastName, email, phone, jobTitle, department, employmentType, employmentStatus,
    managerId, basicSalary, allowances, bankName, bankAccountNumber, ssnitNumber, tinNumber,
    notes, terminationDate,
    dateOfBirth, gender, maritalStatus, nationalId, address,
    emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    shiftId, probationEndDate, probationStatus,
  } = req.body;

  if (probationStatus && !['on_probation', 'confirmed', 'extended', 'not_applicable'].includes(probationStatus)) {
    throw new ApiError(400, 'probationStatus must be one of: on_probation, confirmed, extended, not_applicable');
  }

  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType)) {
    throw new ApiError(400, `employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`);
  }
  if (employmentStatus && !EMPLOYMENT_STATUSES.includes(employmentStatus)) {
    throw new ApiError(400, `employmentStatus must be one of: ${EMPLOYMENT_STATUSES.join(', ')}`);
  }

  const before = await db.query('SELECT * FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!before.rows.length) throw new ApiError(404, 'Employee not found');
  const prev = before.rows[0];

  const { rows } = await db.query(
    `UPDATE employees SET
       first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       email = COALESCE($3, email), phone = COALESCE($4, phone), job_title = COALESCE($5, job_title),
       department = COALESCE($6, department), employment_type = COALESCE($7, employment_type),
       employment_status = COALESCE($8, employment_status), manager_id = COALESCE($9, manager_id),
       basic_salary = COALESCE($10, basic_salary), allowances = COALESCE($11, allowances),
       bank_name = COALESCE($12, bank_name), bank_account_number = COALESCE($13, bank_account_number),
       ssnit_number = COALESCE($14, ssnit_number), tin_number = COALESCE($15, tin_number),
       notes = COALESCE($16, notes), termination_date = COALESCE($17, termination_date),
       date_of_birth = COALESCE($18, date_of_birth), gender = COALESCE($19, gender),
       marital_status = COALESCE($20, marital_status), national_id = COALESCE($21, national_id),
       address = COALESCE($22, address), emergency_contact_name = COALESCE($23, emergency_contact_name),
       emergency_contact_phone = COALESCE($24, emergency_contact_phone),
       emergency_contact_relationship = COALESCE($25, emergency_contact_relationship),
       shift_id = COALESCE($26, shift_id),
       probation_end_date = COALESCE($27, probation_end_date),
       probation_status = COALESCE($28, probation_status),
       updated_at = NOW()
     WHERE id = $29 AND company_id = $30 RETURNING *`,
    [
      firstName, lastName, email, phone, jobTitle, department, employmentType, employmentStatus,
      managerId, basicSalary, allowances, bankName, bankAccountNumber, ssnitNumber, tinNumber,
      notes, terminationDate, dateOfBirth, gender, maritalStatus, nationalId, address,
      emergencyContactName, emergencyContactPhone, emergencyContactRelationship, shiftId,
      probationEndDate, probationStatus, id, req.user.companyId,
    ]
  );

  const next = rows[0];
  const historyEntries = [];
  if (jobTitle !== undefined && jobTitle !== prev.job_title) {
    historyEntries.push(['job_title_change', 'job_title', prev.job_title, next.job_title]);
  }
  if (department !== undefined && department !== prev.department) {
    historyEntries.push(['department_change', 'department', prev.department, next.department]);
  }
  if (basicSalary !== undefined && Number(basicSalary) !== Number(prev.basic_salary)) {
    historyEntries.push(['salary_change', 'basic_salary', prev.basic_salary, next.basic_salary]);
  }
  if (managerId !== undefined && managerId !== prev.manager_id) {
    historyEntries.push(['manager_change', 'manager_id', prev.manager_id, next.manager_id]);
  }
  if (employmentStatus !== undefined && employmentStatus !== prev.employment_status) {
    historyEntries.push(['status_change', 'employment_status', prev.employment_status, next.employment_status]);
  }
  if (shiftId !== undefined && shiftId !== prev.shift_id) {
    historyEntries.push(['shift_change', 'shift_id', prev.shift_id, next.shift_id]);
  }
  if (probationStatus !== undefined && probationStatus !== prev.probation_status) {
    historyEntries.push(['probation_change', 'probation_status', prev.probation_status, next.probation_status]);
  }
  for (const [changeType, fieldName, oldValue, newValue] of historyEntries) {
    await db.query(
      `INSERT INTO employee_history (company_id, employee_id, change_type, field_name, old_value, new_value, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.companyId, id, changeType, fieldName, oldValue === null ? null : String(oldValue), newValue === null ? null : String(newValue), req.user.id]
    );
  }

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'employee', entityId: id, newValues: req.body, ip: req.ip });
  res.json(next);
});

// GET /employees/:id/history
const getEmployeeHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const owner = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!owner.rows.length) throw new ApiError(404, 'Employee not found');

  const { rows } = await db.query(
    `SELECT h.*, u.first_name AS changed_by_first_name, u.last_name AS changed_by_last_name
     FROM employee_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.company_id = $1 AND h.employee_id = $2
     ORDER BY h.effective_date DESC, h.created_at DESC`,
    [req.user.companyId, id]
  );
  res.json(rows);
});

// POST /employees/:id/terminate { terminationDate, terminationReason }
const terminateEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { terminationDate, terminationReason } = req.body;
  const validReasons = ['resignation', 'retirement', 'involuntary_termination', 'end_of_contract'];
  if (terminationReason && !validReasons.includes(terminationReason)) {
    throw new ApiError(400, `terminationReason must be one of: ${validReasons.join(', ')}`);
  }
  const { rows } = await db.query(
    `UPDATE employees SET employment_status = 'terminated', termination_date = COALESCE($1, CURRENT_DATE), updated_at = NOW()
     WHERE id = $2 AND company_id = $3 RETURNING *`,
    [terminationDate || null, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Employee not found');

  await db.query(
    `INSERT INTO employee_history (company_id, employee_id, change_type, field_name, old_value, new_value, effective_date, changed_by, termination_reason)
     VALUES ($1,$2,'terminated','employment_status','active','terminated',$3,$4,$5)`,
    [req.user.companyId, id, rows[0].termination_date, req.user.id, terminationReason || null]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'employee', entityId: id, newValues: { terminated: true, terminationReason }, ip: req.ip });
  res.json(rows[0]);
});

// ============================================================
// Onboarding
// ============================================================

const ONBOARDING_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'];

// GET /employees/:id/onboarding
const getOnboarding = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const owner = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!owner.rows.length) throw new ApiError(404, 'Employee not found');

  const { rows } = await db.query(
    `SELECT os.*, u.first_name AS assigned_to_first_name, u.last_name AS assigned_to_last_name
     FROM onboarding_steps os LEFT JOIN users u ON u.id = os.assigned_to
     WHERE os.company_id = $1 AND os.employee_id = $2
     ORDER BY os.due_date NULLS LAST, os.created_at`,
    [req.user.companyId, id]
  );
  res.json(rows);
});

// PATCH /onboarding-steps/:id { status, notes, dueDate, assignedTo }
const updateOnboardingStep = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, dueDate, assignedTo } = req.body;
  if (status && !ONBOARDING_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${ONBOARDING_STATUSES.join(', ')}`);

  const owner = await db.query('SELECT * FROM onboarding_steps WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!owner.rows.length) throw new ApiError(404, 'Onboarding step not found');

  const canManageAny = (req.user.permissions || []).includes('hr.onboarding.manage');
  if (!canManageAny && owner.rows[0].assigned_to !== req.user.id) {
    throw new ApiError(403, 'You can only update onboarding steps assigned to you');
  }

  const { rows } = await db.query(
    `UPDATE onboarding_steps SET
       status = COALESCE($1, status), notes = COALESCE($2, notes), due_date = COALESCE($3, due_date),
       assigned_to = COALESCE($4, assigned_to),
       completed_at = CASE WHEN COALESCE($1, status) = 'completed' THEN NOW() ELSE completed_at END,
       updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [status, notes, dueDate, assignedTo, id]
  );
  res.json(rows[0]);
});

// ============================================================
// Equipment allocation (asset assignments)
// ============================================================

// GET /employees/:id/asset-assignments
const listAssetAssignments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT aa.*, fa.asset_code, fa.name AS asset_name,
            (aa.returned_date IS NULL AND aa.expected_return_date IS NOT NULL AND aa.expected_return_date < CURRENT_DATE) AS is_overdue
     FROM asset_assignments aa JOIN fixed_assets fa ON fa.id = aa.asset_id
     WHERE aa.company_id = $1 AND aa.employee_id = $2
     ORDER BY aa.assigned_date DESC`,
    [req.user.companyId, id]
  );
  res.json(rows);
});

// POST /employees/:id/asset-assignments { assetId, notes, assignedDate }
const createAssetAssignment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assetId, notes, assignedDate, expectedReturnDate } = req.body;
  if (!assetId) throw new ApiError(400, 'assetId is required');

  const emp = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!emp.rows.length) throw new ApiError(404, 'Employee not found');
  const asset = await db.query(`SELECT status FROM fixed_assets WHERE id = $1 AND company_id = $2`, [assetId, req.user.companyId]);
  if (!asset.rows.length) throw new ApiError(404, 'Asset not found');
  if (asset.rows[0].status === 'disposed') throw new ApiError(400, 'This asset has been disposed and cannot be assigned');

  const existing = await db.query(
    `SELECT 1 FROM asset_assignments WHERE asset_id = $1 AND returned_date IS NULL`,
    [assetId]
  );
  if (existing.rows.length) throw new ApiError(400, 'This asset is already assigned to someone and has not been returned');

  const { rows } = await db.query(
    `INSERT INTO asset_assignments (company_id, asset_id, employee_id, assigned_date, expected_return_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.companyId, assetId, id, assignedDate || new Date().toISOString().slice(0, 10), expectedReturnDate || null, notes || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// POST /asset-assignments/:id/return { returnedDate }
const returnAssetAssignment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { returnedDate } = req.body;
  const { rows } = await db.query(
    `UPDATE asset_assignments SET returned_date = COALESCE($1, CURRENT_DATE) WHERE id = $2 AND company_id = $3 RETURNING *`,
    [returnedDate || null, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Asset assignment not found');
  res.json(rows[0]);
});

// ============================================================
// System account creation (Email & System Account)
// ============================================================

// POST /employees/:id/create-account { email, password, roleIds }
const createEmployeeAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, password, roleIds } = req.body;
  if (!email || !password) throw new ApiError(400, 'email and password are required');
  if (!isStrongPassword(password)) throw new ApiError(400, 'Password must be 8+ characters with upper, lower, and a number');

  const empRes = await db.query('SELECT * FROM employees WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!empRes.rows.length) throw new ApiError(404, 'Employee not found');
  const employee = empRes.rows[0];
  if (employee.user_id) throw new ApiError(400, 'This employee already has a system account');

  const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existingUser.rows.length) throw new ApiError(409, 'A user with this email already exists');

  const passwordHash = await hashPassword(password);
  const userRes = await db.query(
    `INSERT INTO users (company_id, first_name, last_name, email, phone, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, first_name, last_name, email`,
    [req.user.companyId, employee.first_name, employee.last_name, email.toLowerCase(), employee.phone, passwordHash]
  );
  const newUser = userRes.rows[0];

  if (Array.isArray(roleIds) && roleIds.length) {
    for (const roleId of roleIds) {
      await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [newUser.id, roleId]);
    }
  }

  await db.query('UPDATE employees SET user_id = $1, updated_at = NOW() WHERE id = $2', [newUser.id, id]);
  await db.query(
    `UPDATE onboarding_steps SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE employee_id = $1 AND step_key = 'account_creation'`,
    [id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'user', entityId: newUser.id, newValues: { forEmployee: id, email }, ip: req.ip });
  res.status(201).json({ user: newUser, employee: { ...employee, user_id: newUser.id } });
});

// ============================================================
// Shifts (Time & Shift Management)
// ============================================================

// GET /shifts
const listShifts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM employees e WHERE e.shift_id = s.id) AS employee_count
     FROM shifts s WHERE s.company_id = $1 ORDER BY s.start_time`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /shifts { name, startTime, endTime, graceMinutes }
const createShift = asyncHandler(async (req, res) => {
  const { name, startTime, endTime, graceMinutes } = req.body;
  if (!name || !startTime || !endTime) throw new ApiError(400, 'name, startTime, and endTime are required');

  const { rows } = await db.query(
    `INSERT INTO shifts (company_id, name, start_time, end_time, grace_minutes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.companyId, name, startTime, endTime, graceMinutes || 0]
  );
  res.status(201).json(rows[0]);
});

// PATCH /shifts/:id { name, startTime, endTime, graceMinutes, isActive }
const updateShift = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, startTime, endTime, graceMinutes, isActive } = req.body;

  const { rows } = await db.query(
    `UPDATE shifts SET
       name = COALESCE($1, name), start_time = COALESCE($2, start_time), end_time = COALESCE($3, end_time),
       grace_minutes = COALESCE($4, grace_minutes), is_active = COALESCE($5, is_active)
     WHERE id = $6 AND company_id = $7 RETURNING *`,
    [name, startTime, endTime, graceMinutes, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Shift not found');
  res.json(rows[0]);
});

// ============================================================
// Attendance Management
// ============================================================

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half_day', 'on_leave', 'holiday'];

function canManageAttendance(user) {
  return (user.permissions || []).includes('hr.attendance.manage');
}

async function findOwnEmployee(req) {
  const { rows } = await db.query('SELECT * FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
  return rows[0] || null;
}

// GET /attendance?employeeId=&from=&to=
const listAttendance = asyncHandler(async (req, res) => {
  const { employeeId, from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const conditions = ['a.company_id = $1', 'a.work_date >= $2', 'a.work_date <= $3'];
  const params = [req.user.companyId, from, to];

  if (employeeId) {
    if (!canManageAttendance(req.user)) {
      const own = await findOwnEmployee(req);
      if (!own || own.id !== employeeId) throw new ApiError(403, 'You can only view your own attendance');
    }
    params.push(employeeId);
    conditions.push(`a.employee_id = $${params.length}`);
  } else if (!canManageAttendance(req.user)) {
    const own = await findOwnEmployee(req);
    if (!own) throw new ApiError(403, 'Missing required permission: hr.attendance.manage');
    params.push(own.id);
    conditions.push(`a.employee_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT a.*, e.first_name, e.last_name, e.employee_no
     FROM attendance_records a JOIN employees e ON e.id = a.employee_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.work_date DESC, e.first_name`,
    params
  );
  res.json(rows);
});

function computeStatusForClockIn(employee, clockInTime) {
  if (!employee.shift_start_time) return 'present';
  const clockInMinutes = clockInTime.getHours() * 60 + clockInTime.getMinutes();
  const [h, m] = employee.shift_start_time.split(':').map(Number);
  const shiftStartMinutes = h * 60 + m + (employee.shift_grace_minutes || 0);
  return clockInMinutes > shiftStartMinutes ? 'late' : 'present';
}

// POST /attendance/clock-in
const clockIn = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const shiftRes = await db.query('SELECT start_time AS shift_start_time, grace_minutes AS shift_grace_minutes FROM shifts WHERE id = $1', [employee.shift_id]);
  const shiftInfo = shiftRes.rows[0] || {};

  const now = new Date();
  const workDate = now.toISOString().slice(0, 10);
  const status = computeStatusForClockIn(shiftInfo, now);

  const { rows } = await db.query(
    `INSERT INTO attendance_records (company_id, employee_id, work_date, clock_in, status, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (employee_id, work_date) DO UPDATE SET clock_in = COALESCE(attendance_records.clock_in, EXCLUDED.clock_in), updated_at = NOW()
     RETURNING *`,
    [req.user.companyId, employee.id, workDate, now, status, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// POST /attendance/clock-out
const clockOut = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  if (!employee) throw new ApiError(400, 'Your user account is not linked to an employee record');

  const workDate = new Date().toISOString().slice(0, 10);
  const { rows } = await db.query(
    `UPDATE attendance_records SET clock_out = NOW(), updated_at = NOW()
     WHERE employee_id = $1 AND work_date = $2 RETURNING *`,
    [employee.id, workDate]
  );
  if (!rows.length) throw new ApiError(400, 'No clock-in found for today');
  res.json(rows[0]);
});

// GET /attendance/me/today — convenience check for the ESS-lite clock widget
const getMyAttendanceToday = asyncHandler(async (req, res) => {
  const employee = await findOwnEmployee(req);
  if (!employee) return res.json(null);
  const workDate = new Date().toISOString().slice(0, 10);
  const { rows } = await db.query('SELECT * FROM attendance_records WHERE employee_id = $1 AND work_date = $2', [employee.id, workDate]);
  res.json(rows[0] || null);
});

// POST /attendance { employeeId, workDate, status, clockIn, clockOut, notes } — admin manual entry/correction
const recordAttendance = asyncHandler(async (req, res) => {
  const { employeeId, workDate, status, clockIn: clockInTime, clockOut: clockOutTime, notes } = req.body;
  if (!employeeId || !workDate) throw new ApiError(400, 'employeeId and workDate are required');
  if (status && !ATTENDANCE_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`);

  const owner = await db.query('SELECT 1 FROM employees WHERE id = $1 AND company_id = $2', [employeeId, req.user.companyId]);
  if (!owner.rows.length) throw new ApiError(404, 'Employee not found');

  const { rows } = await db.query(
    `INSERT INTO attendance_records (company_id, employee_id, work_date, clock_in, clock_out, status, notes, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (employee_id, work_date) DO UPDATE SET
       clock_in = COALESCE(EXCLUDED.clock_in, attendance_records.clock_in),
       clock_out = COALESCE(EXCLUDED.clock_out, attendance_records.clock_out),
       status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()
     RETURNING *`,
    [req.user.companyId, employeeId, workDate, clockInTime || null, clockOutTime || null, status || 'present', notes || null, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// PATCH /attendance/:id { status, clockIn, clockOut, notes }
const updateAttendance = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, clockIn: clockInTime, clockOut: clockOutTime, notes } = req.body;
  if (status && !ATTENDANCE_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE attendance_records SET
       status = COALESCE($1, status), clock_in = COALESCE($2, clock_in), clock_out = COALESCE($3, clock_out),
       notes = COALESCE($4, notes), updated_at = NOW()
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [status, clockInTime, clockOutTime, notes, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Attendance record not found');
  res.json(rows[0]);
});

// GET /hr-reports/attendance-summary?from=&to=
const getAttendanceSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const byStatus = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM attendance_records
     WHERE company_id = $1 AND work_date >= $2 AND work_date <= $3
     GROUP BY status`,
    [req.user.companyId, from, to]
  );

  const byEmployee = await db.query(
    `SELECT e.id AS employee_id, e.first_name, e.last_name,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present_count,
            COUNT(*) FILTER (WHERE a.status = 'late')::int AS late_count,
            COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent_count
     FROM attendance_records a JOIN employees e ON e.id = a.employee_id
     WHERE a.company_id = $1 AND a.work_date >= $2 AND a.work_date <= $3
     GROUP BY e.id, e.first_name, e.last_name
     ORDER BY e.first_name`,
    [req.user.companyId, from, to]
  );

  res.json({ byStatus: byStatus.rows, byEmployee: byEmployee.rows });
});

// ============================================================
// Leave types & requests
// ============================================================

// GET /leave-types
const listLeaveTypes = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM leave_types WHERE company_id = $1 ORDER BY name', [req.user.companyId]);
  res.json(rows);
});

// POST /leave-types { name, daysPerYear, isPaid }
const createLeaveType = asyncHandler(async (req, res) => {
  const { name, daysPerYear, isPaid } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query(
    `INSERT INTO leave_types (company_id, name, days_per_year, is_paid) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.companyId, name, daysPerYear || 0, isPaid === undefined ? true : !!isPaid]
  );
  res.status(201).json(rows[0]);
});

// GET /leave-requests?employeeId=...&status=pending
const listLeaveRequests = asyncHandler(async (req, res) => {
  const { employeeId, status } = req.query;
  const conditions = ['lr.company_id = $1'];
  const params = [req.user.companyId];
  const canSeeAll = (req.user.permissions || []).includes('hr.leave.manage') || (req.user.permissions || []).includes('hr.leave.approve');

  if (employeeId) {
    if (!canSeeAll) {
      const own = await db.query('SELECT id FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
      if (!own.rows.length || own.rows[0].id !== employeeId) throw new ApiError(403, 'You can only view your own leave requests');
    }
    conditions.push(`lr.employee_id = $${params.length + 1}`);
    params.push(employeeId);
  } else if (!canSeeAll) {
    const own = await db.query('SELECT id FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
    if (!own.rows.length) return res.json([]);
    conditions.push(`lr.employee_id = $${params.length + 1}`);
    params.push(own.rows[0].id);
  }
  if (status) {
    conditions.push(`lr.status = $${params.length + 1}`);
    params.push(status);
  }
  const { rows } = await db.query(
    `SELECT lr.*, lt.name AS leave_type_name, e.first_name, e.last_name
     FROM leave_requests lr
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     JOIN employees e ON e.id = lr.employee_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY lr.created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /leave-requests { employeeId, leaveTypeId, startDate, endDate, reason }
// Self-service: submitting for your own linked employee record needs no permission
// (mirrors tasks/attendance/onboarding). hr.leave.manage is required to submit on
// behalf of someone else.
const createLeaveRequest = asyncHandler(async (req, res) => {
  const { employeeId, leaveTypeId, startDate, endDate, reason } = req.body;
  if (!employeeId || !leaveTypeId || !startDate || !endDate) {
    throw new ApiError(400, 'employeeId, leaveTypeId, startDate, and endDate are required');
  }
  if (new Date(endDate) < new Date(startDate)) throw new ApiError(400, 'endDate must be on or after startDate');

  if (!(req.user.permissions || []).includes('hr.leave.manage')) {
    const own = await db.query('SELECT id FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
    if (!own.rows.length || own.rows[0].id !== employeeId) {
      throw new ApiError(403, 'You need hr.leave.manage to submit leave on behalf of someone else');
    }
  }

  const days = Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;

  const { rows } = await db.query(
    `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.companyId, employeeId, leaveTypeId, startDate, endDate, days, reason || null, req.user.id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'leave_request', entityId: rows[0].id, newValues: { employeeId, startDate, endDate }, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /leave-requests/:id/status { status: 'approved' | 'rejected' | 'cancelled' }
const updateLeaveRequestStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!LEAVE_STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${LEAVE_STATUSES.join(', ')}`);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE leave_requests SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [status, req.user.id, id, req.user.companyId]
    );
    if (!rows.length) throw new ApiError(404, 'Leave request not found');

    // Reflect an approved leave on the employee's current status so rosters/payroll can see it.
    if (status === 'approved') {
      const lr = rows[0];
      const today = new Date().toISOString().slice(0, 10);
      if (lr.start_date <= today && lr.end_date >= today) {
        await client.query(`UPDATE employees SET employment_status = 'on_leave', updated_at = NOW() WHERE id = $1`, [lr.employee_id]);
      }
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'leave_request', entityId: id, newValues: { status }, ip: req.ip });
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================
// Payroll
// ============================================================

// GET /payroll-runs
// GET /payroll-runs/auto-run-settings
const getPayrollAutoRunSettings = asyncHandler(async (req, res) => {
  await db.query(
    `INSERT INTO payroll_auto_run_settings (company_id, next_run_date)
     VALUES ($1, DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '24 days') ON CONFLICT (company_id) DO NOTHING`,
    [req.user.companyId]
  );
  const { rows } = await db.query(
    `SELECT s.*, ba.bank_name AS bank_account_name FROM payroll_auto_run_settings s
     LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
     WHERE s.company_id = $1`,
    [req.user.companyId]
  );
  res.json(rows[0]);
});

// PUT /payroll-runs/auto-run-settings
// { enabled, runDay, paymentMethod, bankAccountId, autoMarkPaid }
const updatePayrollAutoRunSettings = asyncHandler(async (req, res) => {
  const { enabled, runDay, paymentMethod, bankAccountId, autoMarkPaid } = req.body;

  if (runDay !== undefined && (Number(runDay) < 1 || Number(runDay) > 28)) {
    throw new ApiError(400, 'runDay must be between 1 and 28 (capped so it always falls in every month, including February)');
  }
  const validMethods = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    throw new ApiError(400, `paymentMethod must be one of: ${validMethods.join(', ')}`);
  }
  if (bankAccountId) {
    const bankAccount = await db.query('SELECT id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
    if (!bankAccount.rows.length) throw new ApiError(400, 'bankAccountId is not a bank account belonging to this company');
  }

  await db.query(
    `INSERT INTO payroll_auto_run_settings (company_id, next_run_date)
     VALUES ($1, DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '24 days') ON CONFLICT (company_id) DO NOTHING`,
    [req.user.companyId]
  );

  const { rows } = await db.query(
    `UPDATE payroll_auto_run_settings SET
       enabled = COALESCE($1, enabled),
       run_day = COALESCE($2, run_day),
       payment_method = COALESCE($3, payment_method),
       bank_account_id = CASE WHEN $4::UUID IS NULL AND $5::BOOLEAN THEN NULL ELSE COALESCE($4, bank_account_id) END,
       auto_mark_paid = COALESCE($6, auto_mark_paid),
       created_by = COALESCE(created_by, $7),
       updated_at = NOW()
     WHERE company_id = $8
     RETURNING *`,
    [enabled, runDay, paymentMethod, bankAccountId || null, bankAccountId === null, autoMarkPaid, req.user.id, req.user.companyId]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'payroll_auto_run_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

const listPayrollRuns = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM payroll_runs WHERE company_id = $1 ORDER BY period_year DESC, period_month DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /payroll-runs/:id — includes payslips
const getPayrollRun = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const run = await db.query(
    `SELECT pr.*, ba.bank_name AS bank_account_name FROM payroll_runs pr
     LEFT JOIN bank_accounts ba ON ba.id = pr.bank_account_id
     WHERE pr.id = $1 AND pr.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!run.rows.length) throw new ApiError(404, 'Payroll run not found');

  const payslips = await db.query(
    `SELECT p.*, e.first_name, e.last_name, e.employee_no, e.department
     FROM payslips p JOIN employees e ON e.id = p.employee_id
     WHERE p.payroll_run_id = $1 ORDER BY e.first_name`,
    [id]
  );
  res.json({ ...run.rows[0], payslips: payslips.rows });
});

// POST /payroll-runs { periodMonth, periodYear }
// Creates the run in 'draft' status. Use POST /payroll-runs/:id/process to generate payslips.
// Reusable core: creates a payroll run row. Used by the manual "create
// payroll run" endpoint AND the automatic payroll scheduler
// (payrollAutoRunService.js) so both paths share identical validation and
// can never drift apart. Works with either the shared pool or a
// transaction's client.
async function createPayrollRunCore(client, { companyId, userId, periodMonth, periodYear, paymentMethod, bankAccountId }) {
  if (!periodMonth || !periodYear) throw new ApiError(400, 'periodMonth and periodYear are required');
  if (periodMonth < 1 || periodMonth > 12) throw new ApiError(400, 'periodMonth must be between 1 and 12');

  const validMethods = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    throw new ApiError(400, `paymentMethod must be one of: ${validMethods.join(', ')}`);
  }
  if (bankAccountId) {
    const bankAccount = await client.query('SELECT id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, companyId]);
    if (!bankAccount.rows.length) throw new ApiError(400, 'bankAccountId is not a bank account belonging to this company');
  }

  const existing = await client.query(
    'SELECT id FROM payroll_runs WHERE company_id = $1 AND period_month = $2 AND period_year = $3',
    [companyId, periodMonth, periodYear]
  );
  if (existing.rows.length) throw new ApiError(409, 'A payroll run for this period already exists');

  const { rows } = await client.query(
    `INSERT INTO payroll_runs (company_id, period_month, period_year, payment_method, bank_account_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [companyId, periodMonth, periodYear, paymentMethod || 'bank_transfer', bankAccountId || null, userId]
  );
  return rows[0];
}

const createPayrollRun = asyncHandler(async (req, res) => {
  const { periodMonth, periodYear, paymentMethod, bankAccountId } = req.body;
  const run = await createPayrollRunCore(db, { companyId: req.user.companyId, userId: req.user.id, periodMonth, periodYear, paymentMethod, bankAccountId });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'payroll_run', entityId: run.id, newValues: { periodMonth, periodYear, paymentMethod }, ip: req.ip });
  res.status(201).json(run);
});

// Reusable core: generates one payslip per active employee, gated on the
// run currently being in draft status, and posts the payroll accrual
// journal entry. Owns its own transaction (BEGIN/COMMIT/ROLLBACK) so a
// caller — the manual "process" endpoint or the automatic scheduler — can
// just await it. Gross = basic + allowances, SSNIT employee = 5.5% of
// basic, PAYE computed on (gross - SSNIT), net = gross - deductions.
async function processPayrollRunCore(companyId, userId, payrollRunId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const runResult = await client.query('SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2 FOR UPDATE', [payrollRunId, companyId]);
    const run = runResult.rows[0];
    if (!run) throw new ApiError(404, 'Payroll run not found');
    if (run.status !== 'draft') throw new ApiError(409, 'Only a draft payroll run can be processed');

    // Only full-time employees go through the standard SSNIT/PAYE payroll
    // run. Ghana's SSNIT and PAYE withholding apply cleanly to a genuine
    // full-time employer-employee relationship; contract, part-time,
    // internship, and trainee arrangements are frequently compensated
    // differently (a flat withholding tax for contractors/consultants, a
    // stipend for interns/trainees, etc.) and shouldn't be silently run
    // through the same SSNIT/PAYE math just because they're marked active.
    const employees = await client.query(
      `SELECT * FROM employees WHERE company_id = $1 AND employment_status IN ('active', 'on_leave') AND employment_type = 'full_time'`,
      [companyId]
    );

    // Part Time / Contract / Trainee / Internship employees are only
    // included if they have an active Contract Term defining exactly how
    // they're taxed — no term means "we don't know how to treat this
    // person" and they're correctly skipped rather than guessed at.
    const contractEmployees = await client.query(
      `SELECT e.*, ct.id AS contract_term_id, ct.salary AS contract_salary,
              ct.ssnit_tier1_enabled, ct.tier1_employee_rate, ct.tier1_employer_rate,
              ct.ssnit_tier2_enabled, ct.tier2_employer_rate,
              ct.ssnit_tier3_enabled, ct.tier3_employee_rate, ct.tier3_employer_rate,
              ct.paye_enabled, ct.withholding_enabled, ct.withholding_rate
       FROM employees e JOIN employee_contract_terms ct ON ct.employee_id = e.id AND ct.is_active = TRUE
       WHERE e.company_id = $1 AND e.employment_status IN ('active', 'on_leave') AND e.employment_type != 'full_time'`,
      [companyId]
    );

    // Statutory rates and PAYE bands are read from the company's configuration.
    const { settings, bands } = await payrollService.loadConfig(client, companyId);

    let totalGross = 0, totalDeductions = 0, totalNet = 0;
    let totalSsnitEmployee = 0, totalSsnitEmployer = 0, totalPaye = 0, totalOtherDeductions = 0;
    let totalTier2 = 0, totalTier3Employee = 0, totalTier3Employer = 0, totalWithholding = 0;

    for (const emp of employees.rows) {
      const p = payrollService.computePayslip(emp, settings, bands);

      await client.query(
        `INSERT INTO payslips (
           company_id, payroll_run_id, employee_id, basic_salary, allowances, gross_pay,
           ssnit_employee, ssnit_employer, income_tax, other_deductions, total_deductions, net_pay
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (payroll_run_id, employee_id) DO NOTHING`,
        [companyId, payrollRunId, emp.id, p.basicSalary, p.allowances, p.grossPay,
         p.ssnitEmployee, p.ssnitEmployer, p.incomeTax, p.otherDeductions, p.totalDeductions, p.netPay]
      );

      totalGross += p.grossPay;
      totalDeductions += p.totalDeductions;
      totalNet += p.netPay;
      totalSsnitEmployee += p.ssnitEmployee;
      totalSsnitEmployer += p.ssnitEmployer;
      totalPaye += p.incomeTax;
      totalOtherDeductions += p.otherDeductions;
    }

    for (const emp of contractEmployees.rows) {
      const p = payrollService.computeContractPayslip({ salary: emp.contract_salary, ...emp }, bands);

      await client.query(
        `INSERT INTO payslips (
           company_id, payroll_run_id, employee_id, basic_salary, allowances, gross_pay,
           ssnit_employee, ssnit_employer, income_tax, other_deductions, total_deductions, net_pay,
           contract_term_id, tier2_employer, tier3_employee, tier3_employer, withholding_tax
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (payroll_run_id, employee_id) DO NOTHING`,
        [companyId, payrollRunId, emp.id, p.basicSalary, p.allowances, p.grossPay,
         p.ssnitEmployee, p.ssnitEmployer, p.incomeTax, p.otherDeductions, p.totalDeductions, p.netPay,
         emp.contract_term_id, p.tier2Employer, p.tier3Employee, p.tier3Employer, p.withholdingTax]
      );

      totalGross += p.grossPay;
      totalDeductions += p.totalDeductions;
      totalNet += p.netPay;
      totalSsnitEmployee += p.ssnitEmployee;
      totalSsnitEmployer += p.ssnitEmployer;
      totalPaye += p.incomeTax;
      totalOtherDeductions += p.otherDeductions;
      totalTier2 += p.tier2Employer;
      totalTier3Employee += p.tier3Employee;
      totalTier3Employer += p.tier3Employer;
      totalWithholding += p.withholdingTax;
    }

    totalGross = payrollService.round(totalGross);
    totalDeductions = payrollService.round(totalDeductions);
    totalNet = payrollService.round(totalNet);
    totalSsnitEmployee = payrollService.round(totalSsnitEmployee);
    totalSsnitEmployer = payrollService.round(totalSsnitEmployer);
    totalPaye = payrollService.round(totalPaye);
    totalOtherDeductions = payrollService.round(totalOtherDeductions);
    totalTier2 = payrollService.round(totalTier2);
    totalTier3Employee = payrollService.round(totalTier3Employee);
    totalTier3Employer = payrollService.round(totalTier3Employer);
    totalWithholding = payrollService.round(totalWithholding);

    // Post the payroll journal entry if the chart of accounts is set up. Gated by
    // hasAllMappings so payroll still runs for companies that haven't configured
    // accounting yet — same graceful-skip behaviour as Sales and Procurement.
    // Tier 2/Tier 3/withholding mappings are optional here (checked individually
    // below via buildPayrollJournalLines' own `accounts.xxx &&` guards) so a
    // company that's never touched contract terms doesn't need those three
    // extra accounts mapped just to run standard full-time payroll.
    const requiredMappings = ['salaries_expense', 'ssnit_employer_expense', 'paye_payable', 'ssnit_payable', 'salaries_payable', 'staff_deductions_payable'];
    const optionalMappings = ['tier2_pension_payable', 'tier3_provident_fund_payable', 'withholding_tax_payable'];
    let journalEntryId = null;

    if (totalGross > 0 && await accountingService.hasAllMappings(client, companyId, requiredMappings)) {
      const accounts = {};
      for (const key of requiredMappings) {
        accounts[key] = await accountingService.getMappedAccountId(client, companyId, key);
      }
      for (const key of optionalMappings) {
        if (await accountingService.hasAllMappings(client, companyId, [key])) {
          accounts[key] = await accountingService.getMappedAccountId(client, companyId, key);
        }
      }

      const lines = payrollService.buildPayrollJournalLines(
        {
          gross: totalGross, ssnitEmployee: totalSsnitEmployee, ssnitEmployer: totalSsnitEmployer, paye: totalPaye,
          otherDeductions: totalOtherDeductions, net: totalNet,
          tier2: totalTier2, tier3Employee: totalTier3Employee, tier3Employer: totalTier3Employer, withholding: totalWithholding,
        },
        accounts
      );

      const periodLabel = `${String(run.period_month).padStart(2, '0')}/${run.period_year}`;
      const entry = await accountingService.postJournalEntry(client, {
        companyId,
        userId,
        entryDate: new Date(run.period_year, run.period_month - 1 + 1, 0), // last day of the payroll month
        referenceType: 'payroll_run',
        referenceId: payrollRunId,
        description: `Payroll ${periodLabel}`,
        lines,
      });
      journalEntryId = entry.id;
    }

    const { rows } = await client.query(
      `UPDATE payroll_runs SET status = 'processed', total_gross = $1, total_deductions = $2, total_net = $3,
         total_ssnit_employee = $4, total_ssnit_employer = $5, total_paye = $6, journal_entry_id = $7,
         processed_by = $8, processed_at = NOW(), updated_at = NOW(),
         total_tier2 = $9, total_tier3_employee = $10, total_tier3_employer = $11, total_withholding = $12
       WHERE id = $13 RETURNING *`,
      [totalGross, totalDeductions, totalNet, totalSsnitEmployee, totalSsnitEmployer, totalPaye, journalEntryId, userId,
       totalTier2, totalTier3Employee, totalTier3Employer, totalWithholding, payrollRunId]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId, userId, action: 'UPDATE', entityType: 'payroll_run', entityId: payrollRunId, newValues: { status: 'processed', totalNet }, ip: null });
    return { ...rows[0], employeeCount: employees.rows.length + contractEmployees.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// POST /payroll-runs/:id/process
const processPayrollRun = asyncHandler(async (req, res) => {
  const result = await processPayrollRunCore(req.user.companyId, req.user.id, req.params.id);
  res.json(result);
});

// POST /payroll-runs/:id/mark-paid
// Reusable core: settles net pay against Cash or the run's selected bank
// account. Used by the manual "mark paid" endpoint AND, only when a
// company has explicitly opted into full automation, the automatic
// payroll scheduler.
async function markPayrollRunPaidCore(companyId, userId, payrollRunId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const runResult = await client.query(
      'SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [payrollRunId, companyId]
    );
    const run = runResult.rows[0];
    if (!run || run.status !== 'processed') throw new ApiError(409, 'Only a processed payroll run can be marked as paid');

    // Settling net pay clears the salaries payable liability against
    // however this run's Payment Option says it was actually disbursed —
    // Dr Net Salaries Payable / Cr [Cash, or the selected bank account].
    let paymentEntryId = null;
    const netPaid = Number(run.total_net) || 0;

    // A specific bank account (set when the run was created) always wins.
    // Otherwise fall back to the shared 'cash_default' mapping — the exact
    // behaviour every payroll run had before payment_method/bank_account_id
    // existed, preserved for any run that doesn't specify one.
    let paymentAccountId = null;
    if (run.payment_method !== 'cash' && run.bank_account_id) {
      const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1', [run.bank_account_id]);
      paymentAccountId = bankAccount.rows[0]?.account_id || null;
    }
    if (!paymentAccountId && await accountingService.hasAllMappings(client, companyId, ['cash_default'])) {
      paymentAccountId = await accountingService.getMappedAccountId(client, companyId, 'cash_default');
    }

    if (netPaid > 0 && paymentAccountId && await accountingService.hasAllMappings(client, companyId, ['salaries_payable'])) {
      const salariesPayable = await accountingService.getMappedAccountId(client, companyId, 'salaries_payable');
      const periodLabel = `${String(run.period_month).padStart(2, '0')}/${run.period_year}`;

      const entry = await accountingService.postJournalEntry(client, {
        companyId,
        userId,
        entryDate: new Date(),
        referenceType: 'payroll_payment',
        referenceId: payrollRunId,
        description: `Payroll payment ${periodLabel} (${run.payment_method.replace('_', ' ')})`,
        lines: [
          { accountId: salariesPayable, debit: netPaid, credit: 0, description: `Net salaries paid ${periodLabel}` },
          { accountId: paymentAccountId, debit: 0, credit: netPaid, description: `Net salaries paid ${periodLabel}` },
        ],
      });
      paymentEntryId = entry.id;
    }

    const { rows } = await client.query(
      `UPDATE payroll_runs SET status = 'paid', payment_journal_entry_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [paymentEntryId, payrollRunId]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId, userId, action: 'UPDATE', entityType: 'payroll_run', entityId: payrollRunId, newValues: { status: 'paid' }, ip: null });
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const markPayrollRunPaid = asyncHandler(async (req, res) => {
  const result = await markPayrollRunPaidCore(req.user.companyId, req.user.id, req.params.id);
  res.json(result);
});

// ============================================================
// Statutory settings (SSNIT rates + PAYE bands)
// ============================================================

const getPayrollSettings = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    const { settings, bands } = await payrollService.loadConfig(client, req.user.companyId);
    res.json({ ...settings, payeBands: bands });
  } finally {
    client.release();
  }
});

const updatePayrollSettings = asyncHandler(async (req, res) => {
  const { ssnitEmployeeRate, ssnitEmployerRate, ssnitInsurableCeiling, allowancesTaxable } = req.body;

  for (const [label, value] of [['ssnitEmployeeRate', ssnitEmployeeRate], ['ssnitEmployerRate', ssnitEmployerRate]]) {
    if (value !== undefined && value !== null && (Number(value) < 0 || Number(value) > 100)) {
      throw new ApiError(400, `${label} must be between 0 and 100`);
    }
  }

  const { rows } = await db.query(
    `UPDATE payroll_settings SET
       ssnit_employee_rate = COALESCE($1, ssnit_employee_rate),
       ssnit_employer_rate = COALESCE($2, ssnit_employer_rate),
       ssnit_insurable_ceiling = CASE WHEN $3::text IS NULL THEN ssnit_insurable_ceiling ELSE $4::numeric END,
       allowances_taxable = COALESCE($5, allowances_taxable),
       updated_at = NOW()
     WHERE company_id = $6 RETURNING *`,
    [ssnitEmployeeRate ?? null, ssnitEmployerRate ?? null,
     ssnitInsurableCeiling === undefined ? null : 'set', ssnitInsurableCeiling ?? null,
     allowancesTaxable ?? null, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Payroll settings not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'payroll_settings', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// PUT /hr/paye-bands — replaces the whole band table for the company.
const replacePayeBands = asyncHandler(async (req, res) => {
  const { bands } = req.body;
  if (!Array.isArray(bands) || !bands.length) throw new ApiError(400, 'bands must be a non-empty array');

  // Validate before writing: bands must be contiguous and ascending, with exactly
  // one open-ended top band, so no slice of income is untaxed or taxed twice.
  const sorted = [...bands].sort((a, b) => Number(a.lowerBound) - Number(b.lowerBound));
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const rate = Number(b.rate);
    if (!(rate >= 0 && rate <= 1)) throw new ApiError(400, 'Each rate must be a decimal between 0 and 1 (e.g. 0.175 for 17.5%)');
    const isLast = i === sorted.length - 1;
    const upper = b.upperBound === undefined || b.upperBound === null || b.upperBound === '' ? null : Number(b.upperBound);
    if (!isLast) {
      if (upper === null) throw new ApiError(400, 'Only the highest band may have an open upper bound');
      if (upper <= Number(b.lowerBound)) throw new ApiError(400, 'Each band upper bound must exceed its lower bound');
      if (Number(sorted[i + 1].lowerBound) !== upper) throw new ApiError(400, 'Bands must be contiguous — each band must start where the previous one ends');
    }
  }
  if (Number(sorted[0].lowerBound) !== 0) throw new ApiError(400, 'The lowest band must start at 0');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM paye_tax_bands WHERE company_id = $1', [req.user.companyId]);
    let order = 1;
    for (const b of sorted) {
      const upper = b.upperBound === undefined || b.upperBound === null || b.upperBound === '' ? null : Number(b.upperBound);
      await client.query(
        'INSERT INTO paye_tax_bands (company_id, band_order, lower_bound, upper_bound, rate) VALUES ($1,$2,$3,$4,$5)',
        [req.user.companyId, order++, Number(b.lowerBound), upper, Number(b.rate)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'paye_tax_bands', entityId: req.user.companyId, newValues: { bandCount: sorted.length }, ip: req.ip });
  const result = await db.query('SELECT * FROM paye_tax_bands WHERE company_id = $1 ORDER BY band_order', [req.user.companyId]);
  res.json(result.rows);
});

module.exports = {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STATUSES,
  LEAVE_STATUSES,
  listContractTerms,
  createContractTerm,
  updateContractTerm,
  deleteContractTerm,
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  getEmployeeHistory,
  getOnboarding,
  updateOnboardingStep,
  listAssetAssignments,
  createAssetAssignment,
  returnAssetAssignment,
  createEmployeeAccount,
  listShifts,
  createShift,
  updateShift,
  listAttendance,
  clockIn,
  clockOut,
  getMyAttendanceToday,
  recordAttendance,
  updateAttendance,
  getAttendanceSummary,
  listLeaveTypes,
  createLeaveType,
  listLeaveRequests,
  createLeaveRequest,
  updateLeaveRequestStatus,
  listPayrollRuns,
  getPayrollRun,
  createPayrollRun,
  createPayrollRunCore,
  processPayrollRun,
  processPayrollRunCore,
  markPayrollRunPaid,
  markPayrollRunPaidCore,
  getPayrollAutoRunSettings,
  updatePayrollAutoRunSettings,
  getPayrollSettings,
  updatePayrollSettings,
  replacePayeBands,
};

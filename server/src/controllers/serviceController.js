const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('../middleware/auditLog');
const salesService = require('../services/salesService');
const { generateInvoice } = require('./invoiceController');

// ============================================================================
// Service Catalog
// ============================================================================

// GET /services/catalog
const listCatalog = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT sc.*, p.sku, p.selling_price FROM service_catalog sc JOIN products p ON p.id = sc.product_id
     WHERE sc.company_id = $1 ORDER BY sc.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /services/catalog { name, category, description, pricingType, standardRate, uomId }
// Creates the backing 'service' product too, so this can be invoiced through
// the existing Sales pipeline without any new GL code.
const createCatalogItem = asyncHandler(async (req, res) => {
  const { name, category, description, pricingType, standardRate, uomId } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const validPricingTypes = ['hourly', 'fixed', 'per_unit'];
  if (pricingType && !validPricingTypes.includes(pricingType)) throw new ApiError(400, `pricingType must be one of: ${validPricingTypes.join(', ')}`);
  if (standardRate === undefined || Number(standardRate) < 0) throw new ApiError(400, 'standardRate is required and cannot be negative');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const sku = `SVC-${Date.now().toString(36).toUpperCase()}`;
    const productResult = await client.query(
      `INSERT INTO products (company_id, sku, name, description, uom_id, cost_price, selling_price, is_batch_tracked, is_expiry_tracked, product_type)
       VALUES ($1,$2,$3,$4,$5,0,$6,FALSE,FALSE,'service') RETURNING id`,
      [req.user.companyId, sku, name, description || null, uomId || null, standardRate]
    );
    const { rows } = await client.query(
      `INSERT INTO service_catalog (company_id, product_id, name, category, description, pricing_type, standard_rate, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.companyId, productResult.rows[0].id, name, category || null, description || null, pricingType || 'hourly', standardRate, req.user.id]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'service_catalog', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /services/catalog/:id
const updateCatalogItem = asyncHandler(async (req, res) => {
  const { name, category, description, pricingType, standardRate, isActive } = req.body;
  const validPricingTypes = ['hourly', 'fixed', 'per_unit'];
  if (pricingType && !validPricingTypes.includes(pricingType)) throw new ApiError(400, `pricingType must be one of: ${validPricingTypes.join(', ')}`);

  const { rows } = await db.query(
    `UPDATE service_catalog SET
       name = COALESCE($1, name), category = COALESCE($2, category), description = COALESCE($3, description),
       pricing_type = COALESCE($4, pricing_type), standard_rate = COALESCE($5, standard_rate), is_active = COALESCE($6, is_active), updated_at = NOW()
     WHERE id = $7 AND company_id = $8 RETURNING *`,
    [name, category, description, pricingType, standardRate, isActive, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Service catalog item not found');
  if (name || standardRate !== undefined) {
    await db.query('UPDATE products SET name = COALESCE($1, name), selling_price = COALESCE($2, selling_price) WHERE id = $3', [name, standardRate, rows[0].product_id]);
  }
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'service_catalog', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /services/catalog/:id
const deleteCatalogItem = asyncHandler(async (req, res) => {
  const inUse = await db.query('SELECT id FROM service_jobs WHERE service_catalog_id = $1 LIMIT 1', [req.params.id]);
  if (inUse.rows.length) throw new ApiError(400, 'This service is referenced by real jobs and cannot be deleted — mark it inactive instead');

  const { rows } = await db.query('DELETE FROM service_catalog WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Service catalog item not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'service_catalog', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Service Jobs
// ============================================================================

// GET /services/jobs
const listJobs = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT j.*, c.name AS customer_name, e.first_name AS employee_first_name, e.last_name AS employee_last_name, sc.name AS service_name
     FROM service_jobs j
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN employees e ON e.id = j.assigned_employee_id
     LEFT JOIN service_catalog sc ON sc.id = j.service_catalog_id
     WHERE j.company_id = $1 ORDER BY j.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /services/jobs/:id — includes time entries and expenses
const getJob = asyncHandler(async (req, res) => {
  const jobResult = await db.query(
    `SELECT j.*, c.name AS customer_name FROM service_jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = $1 AND j.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!jobResult.rows.length) throw new ApiError(404, 'Service job not found');

  const [timeEntries, expenses] = await Promise.all([
    db.query(`SELECT t.*, e.first_name, e.last_name FROM service_job_time_entries t LEFT JOIN employees e ON e.id = t.employee_id WHERE t.job_id = $1 ORDER BY t.entry_date`, [req.params.id]),
    db.query(`SELECT * FROM service_job_expenses WHERE job_id = $1 ORDER BY expense_date`, [req.params.id]),
  ]);

  const billableHoursValue = timeEntries.rows.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + Number(t.hours) * Number(t.hourly_rate), 0);
  const billableExpensesValue = expenses.rows.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0);

  res.json({ ...jobResult.rows[0], timeEntries: timeEntries.rows, expenses: expenses.rows, unbilledTotal: billableHoursValue + billableExpensesValue });
});

// POST /services/jobs
const createJob = asyncHandler(async (req, res) => {
  const { customerId, serviceCatalogId, title, description, assignedEmployeeId, scheduledDate, billingType, fixedPrice, notes } = req.body;
  if (!customerId) throw new ApiError(400, 'customerId is required');
  if (!title) throw new ApiError(400, 'title is required');
  const validBillingTypes = ['time_and_materials', 'fixed_price'];
  if (billingType && !validBillingTypes.includes(billingType)) throw new ApiError(400, `billingType must be one of: ${validBillingTypes.join(', ')}`);
  if (billingType === 'fixed_price' && (!fixedPrice || Number(fixedPrice) <= 0)) throw new ApiError(400, 'fixedPrice is required for a fixed-price job');

  const customer = await db.query('SELECT id FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.user.companyId]);
  if (!customer.rows.length) throw new ApiError(404, 'Customer not found');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const jobNo = await salesService.generateDocNo(client, req.user.companyId, 'SVC');
    const { rows } = await client.query(
      `INSERT INTO service_jobs (company_id, job_no, customer_id, service_catalog_id, title, description, assigned_employee_id, scheduled_date, billing_type, fixed_price, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.companyId, jobNo, customerId, serviceCatalogId || null, title, description || null, assignedEmployeeId || null, scheduledDate || null, billingType || 'time_and_materials', fixedPrice || null, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'service_job', entityId: rows[0].id, newValues: req.body, ip: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /services/jobs/:id
const updateJob = asyncHandler(async (req, res) => {
  const { title, description, assignedEmployeeId, scheduledDate, status, billingType, fixedPrice, notes } = req.body;
  const validStatuses = ['draft', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled'];
  if (status && !validStatuses.includes(status)) throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);

  const completionDate = status === 'completed' ? new Date().toISOString().slice(0, 10) : undefined;

  const { rows } = await db.query(
    `UPDATE service_jobs SET
       title = COALESCE($1, title), description = COALESCE($2, description), assigned_employee_id = COALESCE($3, assigned_employee_id),
       scheduled_date = COALESCE($4, scheduled_date), status = COALESCE($5, status), billing_type = COALESCE($6, billing_type),
       fixed_price = COALESCE($7, fixed_price), notes = COALESCE($8, notes),
       completion_date = COALESCE($9, completion_date), updated_at = NOW()
     WHERE id = $10 AND company_id = $11 RETURNING *`,
    [title, description, assignedEmployeeId, scheduledDate, status, billingType, fixedPrice, notes, completionDate, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Service job not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'service_job', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /services/jobs/:id
const deleteJob = asyncHandler(async (req, res) => {
  const job = await db.query('SELECT status FROM service_jobs WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!job.rows.length) throw new ApiError(404, 'Service job not found');
  if (job.rows[0].status === 'invoiced') throw new ApiError(400, 'An invoiced job cannot be deleted — it has a real invoice on record');

  await db.query('DELETE FROM service_jobs WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'service_job', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Time Entries & Expenses
// ============================================================================

// POST /services/jobs/:id/time-entries { employeeId, entryDate, hours, hourlyRate, billable, description }
const addTimeEntry = asyncHandler(async (req, res) => {
  const { employeeId, entryDate, hours, hourlyRate, billable, description } = req.body;
  if (!entryDate) throw new ApiError(400, 'entryDate is required');
  if (!hours || Number(hours) <= 0) throw new ApiError(400, 'hours is required and must be greater than zero');

  const job = await db.query('SELECT id FROM service_jobs WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!job.rows.length) throw new ApiError(404, 'Service job not found');

  const { rows } = await db.query(
    `INSERT INTO service_job_time_entries (job_id, company_id, employee_id, entry_date, hours, hourly_rate, billable, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, req.user.companyId, employeeId || null, entryDate, hours, hourlyRate || 0, billable !== false, description || null]
  );
  res.status(201).json(rows[0]);
});

// DELETE /services/jobs/:jobId/time-entries/:id
const deleteTimeEntry = asyncHandler(async (req, res) => {
  const entry = await db.query('SELECT invoiced FROM service_job_time_entries WHERE id = $1 AND job_id = $2 AND company_id = $3', [req.params.id, req.params.jobId, req.user.companyId]);
  if (!entry.rows.length) throw new ApiError(404, 'Time entry not found');
  if (entry.rows[0].invoiced) throw new ApiError(400, 'This time entry has already been invoiced and cannot be deleted');
  await db.query('DELETE FROM service_job_time_entries WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// POST /services/jobs/:id/expenses { expenseDate, description, amount, billable }
const addExpense = asyncHandler(async (req, res) => {
  const { expenseDate, description, amount, billable } = req.body;
  if (!expenseDate) throw new ApiError(400, 'expenseDate is required');
  if (!description) throw new ApiError(400, 'description is required');
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'amount is required and must be greater than zero');

  const job = await db.query('SELECT id FROM service_jobs WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!job.rows.length) throw new ApiError(404, 'Service job not found');

  const { rows } = await db.query(
    `INSERT INTO service_job_expenses (job_id, company_id, expense_date, description, amount, billable) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, req.user.companyId, expenseDate, description, amount, billable !== false]
  );
  res.status(201).json(rows[0]);
});

// DELETE /services/jobs/:jobId/expenses/:id
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await db.query('SELECT invoiced FROM service_job_expenses WHERE id = $1 AND job_id = $2 AND company_id = $3', [req.params.id, req.params.jobId, req.user.companyId]);
  if (!expense.rows.length) throw new ApiError(404, 'Expense not found');
  if (expense.rows[0].invoiced) throw new ApiError(400, 'This expense has already been invoiced and cannot be deleted');
  await db.query('DELETE FROM service_job_expenses WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ============================================================================
// Generate Invoice — reuses invoiceController's exact generateInvoice(...)
// core, the same function the manual "create invoice" endpoint and
// recurring invoices already share, so a service invoice posts the
// identical Dr AR / Cr Revenue / Cr VAT Payable entry proven elsewhere.
// ============================================================================

// POST /services/jobs/:id/generate-invoice
const generateJobInvoice = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const jobResult = await client.query('SELECT * FROM service_jobs WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!jobResult.rows.length) throw new ApiError(404, 'Service job not found');
    const job = jobResult.rows[0];
    if (job.sales_invoice_id) throw new ApiError(400, 'This job has already been invoiced');
    if (!['completed', 'in_progress'].includes(job.status)) throw new ApiError(400, 'Only an in-progress or completed job can be invoiced');

    let lines = [];
    if (job.billing_type === 'fixed_price') {
      const productId = job.service_catalog_id
        ? (await client.query('SELECT product_id FROM service_catalog WHERE id = $1', [job.service_catalog_id])).rows[0]?.product_id
        : null;
      if (!productId) throw new ApiError(400, 'A fixed-price job needs a linked service catalog item to invoice against');
      lines = [{ productId, description: job.title, quantity: 1, unitPrice: job.fixed_price, discountPercent: 0, taxPercent: 0 }];
    } else {
      const time = await client.query('SELECT * FROM service_job_time_entries WHERE job_id = $1 AND billable = TRUE AND invoiced = FALSE', [job.id]);
      const expenses = await client.query('SELECT * FROM service_job_expenses WHERE job_id = $1 AND billable = TRUE AND invoiced = FALSE', [job.id]);
      if (!time.rows.length && !expenses.rows.length) throw new ApiError(400, 'No unbilled time or expenses to invoice for this job');

      const productId = job.service_catalog_id
        ? (await client.query('SELECT product_id FROM service_catalog WHERE id = $1', [job.service_catalog_id])).rows[0]?.product_id
        : null;
      if (!productId) throw new ApiError(400, 'A time & materials job needs a linked service catalog item to invoice against');

      const totalHours = time.rows.reduce((s, t) => s + Number(t.hours), 0);
      if (totalHours > 0) {
        const totalValue = time.rows.reduce((s, t) => s + Number(t.hours) * Number(t.hourly_rate), 0);
        const blendedRate = totalValue / totalHours;
        lines.push({ productId, description: `${job.title} — labour (${totalHours} hrs)`, quantity: totalHours, unitPrice: blendedRate, discountPercent: 0, taxPercent: 0 });
      }
      for (const e of expenses.rows) {
        lines.push({ productId, description: `${job.title} — ${e.description}`, quantity: 1, unitPrice: Number(e.amount), discountPercent: 0, taxPercent: 0 });
      }

      await client.query('UPDATE service_job_time_entries SET invoiced = TRUE WHERE job_id = $1 AND billable = TRUE AND invoiced = FALSE', [job.id]);
      await client.query('UPDATE service_job_expenses SET invoiced = TRUE WHERE job_id = $1 AND billable = TRUE AND invoiced = FALSE', [job.id]);
    }

    const result = await generateInvoice(client, {
      companyId: req.user.companyId, userId: req.user.id, customerId: job.customer_id, notes: `Service job ${job.job_no}: ${job.title}`, lines,
    });

    const { rows } = await client.query(
      `UPDATE service_jobs SET sales_invoice_id = $1, status = 'invoiced', updated_at = NOW() WHERE id = $2 RETURNING *`,
      [result.invoice.id, job.id]
    );

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'service_job', entityId: job.id, newValues: { invoiced: true, invoiceId: result.invoice.id }, ip: req.ip });
    res.status(201).json({ job: rows[0], invoice: result.invoice });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Workspace dashboard
// ============================================================================

// GET /services/workspace-dashboard
const getWorkspaceDashboard = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const [jobs, catalog] = await Promise.all([
    db.query(`SELECT * FROM service_jobs WHERE company_id = $1`, [companyId]),
    db.query(`SELECT * FROM service_catalog WHERE company_id = $1 AND is_active = TRUE`, [companyId]),
  ]);

  const activeJobs = jobs.rows.filter((j) => ['scheduled', 'in_progress'].includes(j.status));
  const completedUnbilled = jobs.rows.filter((j) => j.status === 'completed' && !j.sales_invoice_id);

  const unbilledResult = await db.query(
    `SELECT
       COALESCE((SELECT SUM(hours * hourly_rate) FROM service_job_time_entries t JOIN service_jobs j ON j.id = t.job_id WHERE j.company_id = $1 AND t.billable = TRUE AND t.invoiced = FALSE), 0) AS unbilled_time,
       COALESCE((SELECT SUM(amount) FROM service_job_expenses e JOIN service_jobs j ON j.id = e.job_id WHERE j.company_id = $1 AND e.billable = TRUE AND e.invoiced = FALSE), 0) AS unbilled_expenses`,
    [companyId]
  );

  res.json({
    totalJobs: jobs.rows.length,
    activeJobsCount: activeJobs.length,
    completedUnbilledCount: completedUnbilled.length,
    invoicedJobsCount: jobs.rows.filter((j) => j.status === 'invoiced').length,
    catalogCount: catalog.rows.length,
    unbilledTime: Number(unbilledResult.rows[0].unbilled_time),
    unbilledExpenses: Number(unbilledResult.rows[0].unbilled_expenses),
    recentJobs: [...jobs.rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8),
  });
});

module.exports = {
  listCatalog, createCatalogItem, updateCatalogItem, deleteCatalogItem,
  listJobs, getJob, createJob, updateJob, deleteJob,
  addTimeEntry, deleteTimeEntry, addExpense, deleteExpense,
  generateJobInvoice,
  getWorkspaceDashboard,
};

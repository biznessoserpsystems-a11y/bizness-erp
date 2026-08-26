const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('../middleware/auditLog');

const CATEGORIES = ['tax_filing', 'labour_law', 'epa', 'fda', 'business_operating_permit', 'property_rate', 'business_registration', 'ssnit_filing', 'other'];
const FREQUENCIES = ['monthly', 'quarterly', 'annually', 'one_time'];

/** Advances a date by the number of months a given frequency represents. */
function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'annually') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// Calendar Items (the recurring schedule)
// ============================================================================

// GET /compliance-calendar/items
const listCalendarItems = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, e.first_name AS responsible_first_name, e.last_name AS responsible_last_name
     FROM compliance_calendar_items c LEFT JOIN employees e ON e.id = c.responsible_employee_id
     WHERE c.company_id = $1 ORDER BY c.next_due_date ASC`,
    [req.user.companyId]
  );
  const now = new Date();
  const withOverdue = rows.map((r) => ({ ...r, is_overdue: r.is_active && new Date(r.next_due_date) < now }));
  res.json(withOverdue);
});

// POST /compliance-calendar/items
// { category, title, description, frequency, dueDay, dueMonth, nextDueDate, responsibleEmployeeId }
const createCalendarItem = asyncHandler(async (req, res) => {
  const { category, title, description, frequency, dueDay, dueMonth, nextDueDate, responsibleEmployeeId } = req.body;
  if (!category || !CATEGORIES.includes(category)) throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  if (!title) throw new ApiError(400, 'title is required');
  if (!frequency || !FREQUENCIES.includes(frequency)) throw new ApiError(400, `frequency must be one of: ${FREQUENCIES.join(', ')}`);
  if (!dueDay || dueDay < 1 || dueDay > 28) throw new ApiError(400, 'dueDay must be between 1 and 28 (capped so it always falls in every month, including February)');
  if (!nextDueDate) throw new ApiError(400, 'nextDueDate is required — the first occurrence this schedule starts from');
  if ((frequency === 'annually' || frequency === 'one_time') && (!dueMonth || dueMonth < 1 || dueMonth > 12)) {
    throw new ApiError(400, 'dueMonth is required for an annual or one-time item');
  }

  const { rows } = await db.query(
    `INSERT INTO compliance_calendar_items (company_id, category, title, description, frequency, due_day, due_month, next_due_date, responsible_employee_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, category, title, description || null, frequency, dueDay, dueMonth || null, nextDueDate, responsibleEmployeeId || null, req.user.id]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'compliance_calendar_item', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// PATCH /compliance-calendar/items/:id
const updateCalendarItem = asyncHandler(async (req, res) => {
  const { category, title, description, frequency, dueDay, dueMonth, responsibleEmployeeId, isActive, nextDueDate } = req.body;
  if (category && !CATEGORIES.includes(category)) throw new ApiError(400, `category must be one of: ${CATEGORIES.join(', ')}`);
  if (frequency && !FREQUENCIES.includes(frequency)) throw new ApiError(400, `frequency must be one of: ${FREQUENCIES.join(', ')}`);
  if (dueDay !== undefined && (dueDay < 1 || dueDay > 28)) throw new ApiError(400, 'dueDay must be between 1 and 28');

  const { rows } = await db.query(
    `UPDATE compliance_calendar_items SET
       category = COALESCE($1, category), title = COALESCE($2, title), description = COALESCE($3, description),
       frequency = COALESCE($4, frequency), due_day = COALESCE($5, due_day), due_month = COALESCE($6, due_month),
       responsible_employee_id = COALESCE($7, responsible_employee_id),
       is_active = COALESCE($8, is_active), next_due_date = COALESCE($9, next_due_date), updated_at = NOW()
     WHERE id = $10 AND company_id = $11 RETURNING *`,
    [category, title, description, frequency, dueDay, dueMonth, responsibleEmployeeId, isActive, nextDueDate, req.params.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Calendar item not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'compliance_calendar_item', entityId: req.params.id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /compliance-calendar/items/:id
// Blocked if this item has any filing history — deleting it would cascade-
// delete that history (the FK is ON DELETE CASCADE), and a real filing
// record with a reference number and filed date is exactly the kind of
// audit trail that shouldn't quietly disappear because someone deleted the
// parent schedule. Deactivating (is_active=false via the edit above) is
// the right move for "stop tracking this" once real filings exist.
const deleteCalendarItem = asyncHandler(async (req, res) => {
  const filings = await db.query('SELECT id FROM compliance_calendar_filings WHERE calendar_item_id = $1 LIMIT 1', [req.params.id]);
  if (filings.rows.length) {
    throw new ApiError(400, 'This item has real filing history and cannot be deleted — mark it inactive instead to preserve the audit trail');
  }
  const { rows } = await db.query('DELETE FROM compliance_calendar_items WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Calendar item not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'compliance_calendar_item', entityId: req.params.id, ip: req.ip });
  res.status(204).end();
});

// ============================================================================
// Filings (completion history) — marking one filed advances the parent
// item's next_due_date, the same schedule-advancing idiom recurring
// invoices and automatic payroll already use for their own schedules.
// ============================================================================

// GET /compliance-calendar/items/:id/filings
const listFilings = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM compliance_calendar_filings WHERE calendar_item_id = $1 AND company_id = $2 ORDER BY due_date DESC`,
    [req.params.id, req.user.companyId]
  );
  res.json(rows);
});

// POST /compliance-calendar/items/:id/file
// { periodLabel, filedDate, referenceNo, notes }
const markFiled = asyncHandler(async (req, res) => {
  const { periodLabel, filedDate, referenceNo, notes } = req.body;
  if (!periodLabel) throw new ApiError(400, 'periodLabel is required (e.g. "July 2026", "Q3 2026", "FY2026")');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query('SELECT * FROM compliance_calendar_items WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!itemResult.rows.length) throw new ApiError(404, 'Calendar item not found');
    const item = itemResult.rows[0];
    if (!item.is_active) throw new ApiError(400, 'This calendar item is no longer active');

    const filing = await client.query(
      `INSERT INTO compliance_calendar_filings (calendar_item_id, company_id, period_label, due_date, filed_date, status, reference_no, notes, filed_by)
       VALUES ($1,$2,$3,$4,$5,'filed',$6,$7,$8) RETURNING *`,
      [item.id, req.user.companyId, periodLabel, item.next_due_date, filedDate || new Date().toISOString().slice(0, 10), referenceNo || null, notes || null, req.user.id]
    );

    // A one-time filing has no further occurrence — deactivate rather than
    // advance into a meaningless "next" date. Everything else moves
    // forward by exactly one cycle of its own frequency.
    let updatedItem;
    if (item.frequency === 'one_time') {
      const { rows } = await client.query(`UPDATE compliance_calendar_items SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`, [item.id]);
      updatedItem = rows[0];
    } else {
      const nextDate = advanceDate(item.next_due_date, item.frequency);
      const { rows } = await client.query(`UPDATE compliance_calendar_items SET next_due_date = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [nextDate, item.id]);
      updatedItem = rows[0];
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'compliance_calendar_item', entityId: item.id, newValues: { filed: true, periodLabel }, ip: req.ip });
    res.status(201).json({ filing: filing.rows[0], item: updatedItem });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Summary — for the compliance calendar's own widget on Statutory Compliance
// ============================================================================

// GET /compliance-calendar/summary
const getSummary = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM compliance_calendar_items WHERE company_id = $1 AND is_active = TRUE ORDER BY next_due_date ASC`,
    [req.user.companyId]
  );
  const now = new Date();
  const withDaysUntil = rows.map((r) => ({
    ...r,
    daysUntilDue: Math.ceil((new Date(r.next_due_date) - now) / 86400000),
    is_overdue: new Date(r.next_due_date) < now,
  }));
  const overdue = withDaysUntil.filter((r) => r.is_overdue);
  const dueWithin30Days = withDaysUntil.filter((r) => !r.is_overdue && r.daysUntilDue <= 30);

  res.json({
    totalActive: rows.length,
    overdueCount: overdue.length,
    dueWithin30DaysCount: dueWithin30Days.length,
    overdue,
    upcoming: withDaysUntil.slice(0, 10),
  });
});

module.exports = {
  listCalendarItems, createCalendarItem, updateCalendarItem, deleteCalendarItem,
  listFilings, markFiled,
  getSummary,
};

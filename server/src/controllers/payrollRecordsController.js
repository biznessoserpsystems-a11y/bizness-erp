const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');
const { getPayrollControlsRow } = require('../middleware/payrollControls');

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function inTransaction(fn) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// GET /payroll/record-controls — lets the Payroll page know whether editing/deleting is on,
// without needing the HR settings permission.
const getControls = asyncHandler(async (req, res) => {
  const row = await getPayrollControlsRow(db, req.user.companyId);
  res.json({ allow_edit: row.allow_record_edit !== false, allow_delete: !!row.allow_record_delete });
});

// PUT /payroll/record-controls { allowRecordEdit, allowRecordDelete }
const updateControls = asyncHandler(async (req, res) => {
  const { allowRecordEdit, allowRecordDelete } = req.body;
  await getPayrollControlsRow(db, req.user.companyId);
  const { rows } = await db.query(
    `UPDATE payroll_settings SET
       allow_record_edit = COALESCE($1, allow_record_edit),
       allow_record_delete = COALESCE($2, allow_record_delete),
       updated_at = NOW()
     WHERE company_id = $3 RETURNING allow_record_edit, allow_record_delete`,
    [typeof allowRecordEdit === 'boolean' ? allowRecordEdit : null, typeof allowRecordDelete === 'boolean' ? allowRecordDelete : null, req.user.companyId]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'payroll_record_controls', entityId: req.user.companyId, newValues: req.body, ip: req.ip });
  res.json({ allow_edit: rows[0].allow_record_edit, allow_delete: rows[0].allow_record_delete });
});

// PUT /payroll-runs/:id { periodMonth?, periodYear?, paymentMethod?, bankAccountId? }
// A draft run can change its period and payment option. A processed run keeps its period (its
// payslips and accrual entry were built for it) and can only change how it will be paid.
// A paid run can't be edited.
const updatePayrollRun = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { periodMonth, periodYear, paymentMethod, bankAccountId } = req.body;

  const updated = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Payroll run not found');
    const run = found.rows[0];
    if (run.status === 'paid') throw new ApiError(400, 'This payroll run has already been paid and can no longer be edited. Delete it and run payroll again if it was wrong.');

    const periodChanged = (periodMonth !== undefined && Number(periodMonth) !== run.period_month) || (periodYear !== undefined && Number(periodYear) !== run.period_year);
    if (periodChanged && run.status !== 'draft') {
      throw new ApiError(400, 'The period of a processed payroll run cannot be changed, because its payslips and ledger entry were built for it. Delete the run and create it again for the right month.');
    }
    const month = periodMonth !== undefined ? Number(periodMonth) : run.period_month;
    const year = periodYear !== undefined ? Number(periodYear) : run.period_year;
    if (!(month >= 1 && month <= 12)) throw new ApiError(400, 'periodMonth must be between 1 and 12');
    if (!(year >= 2000 && year <= 2100)) throw new ApiError(400, 'periodYear is not valid');

    if (paymentMethod !== undefined && !PAYMENT_METHODS.includes(paymentMethod)) {
      throw new ApiError(400, `paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }
    if (bankAccountId) {
      const bank = await client.query('SELECT id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
      if (!bank.rows.length) throw new ApiError(400, 'bankAccountId is not a bank account belonging to this company');
    }
    if (periodChanged) {
      const clash = await client.query(
        'SELECT 1 FROM payroll_runs WHERE company_id = $1 AND period_month = $2 AND period_year = $3 AND id <> $4',
        [req.user.companyId, month, year, id]
      );
      if (clash.rows.length) throw new ApiError(409, 'A payroll run for this period already exists');
    }

    const result = await client.query(
      `UPDATE payroll_runs SET
         period_month = $1, period_year = $2,
         payment_method = COALESCE($3, payment_method),
         bank_account_id = CASE WHEN $4::boolean THEN $5::uuid ELSE bank_account_id END,
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [month, year, paymentMethod || null, bankAccountId !== undefined, bankAccountId || null, id]
    );
    return result.rows[0];
  });

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'payroll_run', entityId: id, newValues: { edited: true, periodMonth, periodYear, paymentMethod }, ip: req.ip });
  res.json(updated);
});

// DELETE /payroll-runs/:id — removes the run and its payslips and reverses its ledger entries
// (the payment entry first if it was paid, then the accrual entry).
const deletePayrollRun = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const run = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Payroll run not found');
    const row = found.rows[0];
    const label = `${MONTHS[row.period_month - 1]} ${row.period_year}`;

    for (const entryId of [row.payment_journal_entry_id, row.journal_entry_id]) {
      if (!entryId) continue;
      const entry = await client.query('SELECT status FROM journal_entries WHERE id = $1', [entryId]);
      if (entry.rows.length && entry.rows[0].status === 'posted') {
        await accountingService.reverseJournalEntry(client, {
          companyId: req.user.companyId, userId: req.user.id, journalEntryId: entryId, reason: `Payroll run ${label} deleted`,
        });
      }
    }

    // payslips are removed with the run (ON DELETE CASCADE); the auto-run settings just forget it
    await client.query('DELETE FROM payroll_runs WHERE id = $1', [id]);
    return { ...row, label };
  });

  await recordAudit({
    companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'payroll_run', entityId: id,
    oldValues: { period: run.label, status: run.status, totalNet: run.total_net }, ip: req.ip,
  });

  // If automatic payroll is on, the scheduler may create this month's run again on its next pass.
  const now = new Date();
  let note = null;
  if (run.period_month === now.getMonth() + 1 && run.period_year === now.getFullYear()) {
    const auto = await db.query('SELECT enabled FROM payroll_auto_run_settings WHERE company_id = $1', [req.user.companyId]);
    if (auto.rows.length && auto.rows[0].enabled) {
      note = 'Automatic payroll is switched on, so it may create this month\'s run again on its next scheduled day. Switch it off under "Automatic payroll" if you do not want that.';
    }
  }
  res.json({ message: 'Payroll run deleted', note });
});

module.exports = { getControls, updateControls, updatePayrollRun, deletePayrollRun };

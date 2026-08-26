const db = require('../config/db');
const { createPayrollRunCore, processPayrollRunCore, markPayrollRunPaidCore } = require('../controllers/hrPayrollController');
const { notifyUsersWithPermission } = require('./notificationService');

/** Advances a run_day-based schedule to the same day next month. */
function nextRunDate(fromDate, runDay) {
  const d = new Date(fromDate);
  d.setMonth(d.getMonth() + 1);
  d.setDate(runDay);
  return d;
}

/**
 * Runs one company's due automatic payroll: creates the run for the
 * current period, processes it (generating a payslip for every active
 * employee), and — only if this company has explicitly opted in — marks
 * it paid too. Skips cleanly (without erroring) if a run for this period
 * already exists, since someone may have already created it manually.
 * Each step reuses the exact same core function the manual "New payroll
 * run" / "Process" / "Mark paid" buttons call, so automatic and manual
 * payroll can never compute different numbers for the same period.
 */
async function runAutoPayrollForCompany(setting) {
  const now = new Date();
  const periodMonth = now.getMonth() + 1;
  const periodYear = now.getFullYear();

  const existing = await db.query(
    'SELECT id, status FROM payroll_runs WHERE company_id = $1 AND period_month = $2 AND period_year = $3',
    [setting.company_id, periodMonth, periodYear]
  );

  let run;
  if (existing.rows.length) {
    // Already created (manually, or by an earlier scheduler tick that
    // partially completed) — pick up from wherever it left off rather
    // than erroring or creating a duplicate.
    run = existing.rows[0];
  } else {
    run = await createPayrollRunCore(db, {
      companyId: setting.company_id, userId: setting.created_by, periodMonth, periodYear,
      paymentMethod: setting.payment_method, bankAccountId: setting.bank_account_id,
    });
  }

  if (run.status === 'draft') {
    run = await processPayrollRunCore(setting.company_id, setting.created_by, run.id);
  }

  if (setting.auto_mark_paid && run.status === 'processed') {
    run = await markPayrollRunPaidCore(setting.company_id, setting.created_by, run.id);
  }

  await notifyUsersWithPermission(db, {
    companyId: setting.company_id, permissionCode: 'hr.payroll.manage',
    type: 'info', title: 'Automatic payroll run completed',
    body: `Payroll for ${String(periodMonth).padStart(2, '0')}/${periodYear} was generated automatically. Status: ${run.status}.`,
    link: '/hr/payroll', referenceType: 'payroll_run', referenceId: run.id,
  });

  await db.query(
    `UPDATE payroll_auto_run_settings
     SET next_run_date = $1, last_run_payroll_run_id = $2, last_run_at = NOW(), updated_at = NOW()
     WHERE company_id = $3`,
    [nextRunDate(now, setting.run_day).toISOString().slice(0, 10), run.id, setting.company_id]
  );

  return run;
}

/** Finds every company with automatic payroll enabled and due, and runs it. */
async function runDueAutoPayroll() {
  const { rows } = await db.query(
    `SELECT * FROM payroll_auto_run_settings WHERE enabled = TRUE AND next_run_date <= CURRENT_DATE`
  );
  const results = [];
  for (const setting of rows) {
    try {
      const run = await runAutoPayrollForCompany(setting);
      results.push({ companyId: setting.company_id, payrollRunId: run.id, ok: true });
    } catch (err) {
      console.error(`Automatic payroll run failed for company ${setting.company_id}:`, err.message);
      results.push({ companyId: setting.company_id, ok: false, error: err.message });
    }
  }
  return results;
}

/** Starts a recurring background check. Call once from server.js. */
function startPayrollAutoRunScheduler(intervalMs = 60 * 60 * 1000) {
  setTimeout(() => runDueAutoPayroll().catch((err) => console.error('Payroll auto-run scheduler error:', err.message)), 15000);
  setInterval(() => runDueAutoPayroll().catch((err) => console.error('Payroll auto-run scheduler error:', err.message)), intervalMs);
}

module.exports = { runAutoPayrollForCompany, runDueAutoPayroll, startPayrollAutoRunScheduler, nextRunDate };

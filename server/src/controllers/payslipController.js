const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { payslipToPdf } = require('../services/exportService');

// Loads everything a payslip PDF needs. When employeeId is given the payslip must belong to that
// employee (used for the self-service download, so nobody can fetch someone else's payslip).
async function buildPayslipPdf(payslipId, companyId, employeeId) {
  const params = [payslipId, companyId];
  let ownerClause = '';
  if (employeeId) { params.push(employeeId); ownerClause = ' AND p.employee_id = $3'; }
  const found = await db.query(
    `SELECT p.*, pr.period_month, pr.period_year
     FROM payslips p JOIN payroll_runs pr ON pr.id = p.payroll_run_id
     WHERE p.id = $1 AND pr.company_id = $2${ownerClause}`,
    params
  );
  if (!found.rows.length) throw new ApiError(404, 'Payslip not found');
  const payslip = found.rows[0];

  const employee = (await db.query('SELECT * FROM employees WHERE id = $1', [payslip.employee_id])).rows[0];
  const company = (await db.query('SELECT name, legal_name, base_currency FROM companies WHERE id = $1', [companyId])).rows[0] || {};

  const buffer = await payslipToPdf({
    companyName: company.legal_name || company.name,
    employee,
    run: { period_month: payslip.period_month, period_year: payslip.period_year },
    payslip,
    currency: company.base_currency,
  });
  const safe = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '');
  const filename = `Payslip-${safe(employee.employee_no)}-${payslip.period_year}-${String(payslip.period_month).padStart(2, '0')}.pdf`;
  return { buffer, filename };
}

function sendPdf(res, { buffer, filename }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

// GET /payslips/:id/pdf — any payslip in the company (payroll viewers)
const downloadPayslip = asyncHandler(async (req, res) => {
  sendPdf(res, await buildPayslipPdf(req.params.id, req.user.companyId, null));
});

// GET /me/payslips/:id/pdf — only the signed-in employee's own payslip
const downloadMyPayslip = asyncHandler(async (req, res) => {
  const own = await db.query('SELECT id FROM employees WHERE user_id = $1 AND company_id = $2', [req.user.id, req.user.companyId]);
  if (!own.rows.length) throw new ApiError(400, 'Your user account is not linked to an employee record');
  sendPdf(res, await buildPayslipPdf(req.params.id, req.user.companyId, own.rows[0].id));
});

module.exports = { downloadPayslip, downloadMyPayslip, buildPayslipPdf };

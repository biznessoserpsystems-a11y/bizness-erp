const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// GET /financial-years
const listFinancialYears = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT fy.*, COALESCE(json_agg(fp.* ORDER BY fp.start_date) FILTER (WHERE fp.id IS NOT NULL), '[]') AS periods
     FROM financial_years fy
     LEFT JOIN fiscal_periods fp ON fp.financial_year_id = fy.id
     WHERE fy.company_id = $1
     GROUP BY fy.id
     ORDER BY fy.start_date DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /financial-years  (optionally auto-generates 12 monthly periods)
const createFinancialYear = asyncHandler(async (req, res) => {
  const { name, startDate, endDate, generateMonthlyPeriods } = req.body;
  if (!name || !startDate || !endDate) throw new ApiError(400, 'name, startDate, and endDate are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const fyResult = await client.query(
      `INSERT INTO financial_years (company_id, name, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.companyId, name, startDate, endDate]
    );
    const fy = fyResult.rows[0];

    if (generateMonthlyPeriods) {
      let cursor = new Date(startDate);
      const end = new Date(endDate);
      while (cursor < end) {
        const periodStart = new Date(cursor);
        const periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0); // last day of month
        const label = periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        await client.query(
          `INSERT INTO fiscal_periods (financial_year_id, name, start_date, end_date) VALUES ($1, $2, $3, $4)`,
          [fy.id, label, periodStart, periodEnd > end ? end : periodEnd]
        );
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'financial_year', entityId: fy.id, newValues: req.body, ip: req.ip });
    res.status(201).json(fy);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /financial-years/:id/status  (open, closed, locked)
const updateFinancialYearStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['open', 'closed', 'locked'].includes(status)) throw new ApiError(400, 'status must be one of: open, closed, locked');

  const { rows } = await db.query(
    'UPDATE financial_years SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *',
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Financial year not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'financial_year', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

// PATCH /fiscal-periods/:id/status
const updateFiscalPeriodStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['open', 'closed', 'locked'].includes(status)) throw new ApiError(400, 'status must be one of: open, closed, locked');

  const { rows } = await db.query(
    `UPDATE fiscal_periods fp SET status = $1
     FROM financial_years fy
     WHERE fp.id = $2 AND fp.financial_year_id = fy.id AND fy.company_id = $3
     RETURNING fp.*`,
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Fiscal period not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'fiscal_period', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listFinancialYears, createFinancialYear, updateFinancialYearStatus, updateFiscalPeriodStatus };

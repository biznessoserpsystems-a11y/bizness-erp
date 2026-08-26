const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /procurement-reports/summary?from=&to=
const purchaseSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND pi.invoice_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [req.user.companyId, from, to] : [req.user.companyId];

  const totals = await db.query(
    `SELECT COALESCE(SUM(pi.total_amount), 0) AS total_purchases,
            COALESCE(SUM(pi.tax_amount), 0) AS total_tax,
            COUNT(*) AS invoice_count
     FROM purchase_invoices pi WHERE pi.company_id = $1 AND pi.status != 'void' ${dateFilter}`,
    params
  );

  const byProduct = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name, SUM(pil.quantity) AS quantity_purchased, SUM(pil.line_total) AS spend
     FROM purchase_invoice_lines pil
     JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
     JOIN products p ON p.id = pil.product_id
     WHERE pi.company_id = $1 AND pi.status != 'void' ${dateFilter}
     GROUP BY p.id, p.sku, p.name
     ORDER BY spend DESC
     LIMIT 20`,
    params
  );

  const bySupplier = await db.query(
    `SELECT s.id AS supplier_id, s.name, SUM(pi.total_amount) AS spend, COUNT(*) AS invoice_count
     FROM purchase_invoices pi
     JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.company_id = $1 AND pi.status != 'void' ${dateFilter}
     GROUP BY s.id, s.name
     ORDER BY spend DESC
     LIMIT 20`,
    params
  );

  res.json({ totals: totals.rows[0], byProduct: byProduct.rows, bySupplier: bySupplier.rows });
});

// GET /procurement-reports/payables-aging
const payablesAging = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT pi.id, pi.invoice_no, pi.invoice_date, pi.due_date, s.name AS supplier_name,
            (pi.total_amount - pi.amount_paid - pi.amount_credited) AS balance,
            GREATEST(0, CURRENT_DATE - pi.due_date) AS days_overdue
     FROM purchase_invoices pi
     JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.company_id = $1 AND pi.status NOT IN ('paid', 'void')
       AND (pi.total_amount - pi.amount_paid - pi.amount_credited) > 0.01
     ORDER BY days_overdue DESC`,
    [req.user.companyId]
  );

  const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
  for (const r of rows) {
    const balance = Number(r.balance);
    const days = Number(r.days_overdue);
    if (days <= 0) buckets.current += balance;
    else if (days <= 30) buckets.days1to30 += balance;
    else if (days <= 60) buckets.days31to60 += balance;
    else if (days <= 90) buckets.days61to90 += balance;
    else buckets.over90 += balance;
  }

  res.json({ buckets, invoices: rows });
});

// GET /procurement-reports/register?from=&to=
const purchaseRegister = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND pi.invoice_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [req.user.companyId, from, to] : [req.user.companyId];

  const { rows } = await db.query(
    `SELECT pi.id, pi.invoice_no, pi.supplier_invoice_no, pi.invoice_date, pi.status, s.name AS supplier_name,
            pi.subtotal, pi.discount_amount, pi.tax_amount, pi.total_amount,
            (pi.total_amount - pi.amount_paid - pi.amount_credited) AS balance
     FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.company_id = $1 ${dateFilter}
     ORDER BY pi.invoice_date DESC`,
    params
  );
  res.json(rows);
});

module.exports = { purchaseSummary, payablesAging, purchaseRegister };

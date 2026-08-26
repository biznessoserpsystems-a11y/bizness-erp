const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendExport } = require('../services/exportService');

// GET /sales-reports/summary?from=&to=
const salesSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND si.invoice_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [req.user.companyId, from, to] : [req.user.companyId];

  const totals = await db.query(
    `SELECT COALESCE(SUM(si.total_amount), 0) AS total_sales,
            COALESCE(SUM(si.tax_amount), 0) AS total_tax,
            COUNT(*) AS invoice_count
     FROM sales_invoices si WHERE si.company_id = $1 AND si.status != 'void' ${dateFilter}`,
    params
  );

  const byProduct = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name, SUM(sil.quantity) AS quantity_sold, SUM(sil.line_total) AS revenue
     FROM sales_invoice_lines sil
     JOIN sales_invoices si ON si.id = sil.sales_invoice_id
     JOIN products p ON p.id = sil.product_id
     WHERE si.company_id = $1 AND si.status != 'void' ${dateFilter}
     GROUP BY p.id, p.sku, p.name
     ORDER BY revenue DESC
     LIMIT 20`,
    params
  );

  const byCustomer = await db.query(
    `SELECT c.id AS customer_id, c.name, SUM(si.total_amount) AS revenue, COUNT(*) AS invoice_count
     FROM sales_invoices si
     JOIN customers c ON c.id = si.customer_id
     WHERE si.company_id = $1 AND si.status != 'void' ${dateFilter}
     GROUP BY c.id, c.name
     ORDER BY revenue DESC
     LIMIT 20`,
    params
  );

  res.json({ totals: totals.rows[0], byProduct: byProduct.rows, byCustomer: byCustomer.rows });
});

// GET /sales-reports/receivables-aging
const receivablesAging = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT si.id, si.invoice_no, si.invoice_date, si.due_date, c.name AS customer_name,
            (si.total_amount - si.amount_paid - si.amount_credited) AS balance,
            GREATEST(0, CURRENT_DATE - si.due_date) AS days_overdue
     FROM sales_invoices si
     JOIN customers c ON c.id = si.customer_id
     WHERE si.company_id = $1 AND si.status NOT IN ('paid', 'void')
       AND (si.total_amount - si.amount_paid - si.amount_credited) > 0.01
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

  if (req.query.format) {
    return sendExport(res, req.query.format, 'receivables-aging', {
      title: 'Receivables Aging',
      subtitle: `As of ${new Date().toLocaleDateString()}`,
      columns: [
        { key: 'invoice_no', label: 'Invoice #', width: 1.6 },
        { key: 'customer_name', label: 'Customer', width: 1.3 },
        { key: 'invoice_date', label: 'Invoice Date', format: 'date' },
        { key: 'due_date', label: 'Due Date', format: 'date' },
        { key: 'balance', label: 'Balance', format: 'currency', align: 'right' },
        { key: 'days_overdue', label: 'Days Overdue', format: 'number', align: 'right' },
      ],
      rows,
    });
  }

  res.json({ buckets, invoices: rows });
});

// GET /sales-reports/register?from=&to=
const salesRegister = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND si.invoice_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [req.user.companyId, from, to] : [req.user.companyId];

  const { rows } = await db.query(
    `SELECT si.id, si.invoice_no, si.invoice_date, si.status, c.name AS customer_name,
            si.subtotal, si.discount_amount, si.tax_amount, si.total_amount,
            (si.total_amount - si.amount_paid - si.amount_credited) AS balance
     FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
     WHERE si.company_id = $1 ${dateFilter}
     ORDER BY si.invoice_date DESC`,
    params
  );

  if (req.query.format) {
    return sendExport(res, req.query.format, 'sales-register', {
      title: 'Sales Register',
      subtitle: from && to ? `${from} to ${to}` : 'All time',
      columns: [
        { key: 'invoice_no', label: 'Invoice #', width: 1.6 },
        { key: 'invoice_date', label: 'Date', format: 'date' },
        { key: 'customer_name', label: 'Customer', width: 1.3 },
        { key: 'status', label: 'Status' },
        { key: 'subtotal', label: 'Subtotal', format: 'currency', align: 'right' },
        { key: 'discount_amount', label: 'Discount', format: 'currency', align: 'right' },
        { key: 'tax_amount', label: 'Tax', format: 'currency', align: 'right' },
        { key: 'total_amount', label: 'Total', format: 'currency', align: 'right' },
        { key: 'balance', label: 'Balance', format: 'currency', align: 'right' },
      ],
      rows,
    });
  }
  res.json(rows);
});

// GET /sales-reports/by-branch?from=&to=
// Invoices aren't directly tied to a branch in the schema, so branch is derived
// from the originating sales order's fulfilling warehouse. Invoices created
// without a sales order (or whose order's warehouse has no branch) are grouped
// under "Unassigned" rather than silently dropped.
const salesByBranch = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND si.invoice_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [req.user.companyId, from, to] : [req.user.companyId];

  const { rows } = await db.query(
    `SELECT COALESCE(br.id::text, 'unassigned') AS branch_id,
            COALESCE(br.name, 'Unassigned') AS branch_name,
            SUM(si.total_amount) AS revenue,
            COUNT(*) AS invoice_count
     FROM sales_invoices si
     LEFT JOIN sales_orders so ON so.id = si.sales_order_id
     LEFT JOIN warehouses w ON w.id = so.warehouse_id
     LEFT JOIN branches br ON br.id = w.branch_id
     WHERE si.company_id = $1 AND si.status != 'void' ${dateFilter}
     GROUP BY br.id, br.name
     ORDER BY revenue DESC`,
    params
  );

  if (req.query.format) {
    return sendExport(res, req.query.format, 'sales-by-branch', {
      title: 'Sales by Branch',
      subtitle: from && to ? `${from} to ${to}` : 'All time',
      columns: [
        { key: 'branch_name', label: 'Branch', width: 1.5 },
        { key: 'invoice_count', label: 'Invoices', format: 'number', align: 'right' },
        { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
      ],
      rows,
    });
  }

  res.json(rows);
});

// GET /sales-reports/by-category?from=&to=
// The Executive Dashboard spec calls for "Revenue by Department" — this
// data model has no way to honestly attribute a sale to an HR department
// (employees.department and a sales invoice have no relationship), so this
// is revenue by *product category* instead, the closest real business
// segment the schema actually supports. Same query shape as salesByBranch.
const salesByCategory = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = from && to ? 'AND si.invoice_date BETWEEN $2 AND $3' : '';
  const params = from && to ? [req.user.companyId, from, to] : [req.user.companyId];

  const { rows } = await db.query(
    `SELECT COALESCE(pc.id::text, 'unassigned') AS category_id,
            COALESCE(pc.name, 'Uncategorized') AS category_name,
            SUM(sil.line_total) AS revenue
     FROM sales_invoice_lines sil
     JOIN sales_invoices si ON si.id = sil.sales_invoice_id
     JOIN products p ON p.id = sil.product_id
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     WHERE si.company_id = $1 AND si.status != 'void' ${dateFilter}
     GROUP BY pc.id, pc.name
     ORDER BY revenue DESC`,
    params
  );

  if (req.query.format) {
    return sendExport(res, req.query.format, 'sales-by-category', {
      title: 'Revenue by Product Category',
      subtitle: from && to ? `${from} to ${to}` : 'All time',
      columns: [
        { key: 'category_name', label: 'Category', width: 1.5 },
        { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
      ],
      rows,
    });
  }

  res.json(rows);
});

module.exports = { salesSummary, receivablesAging, salesRegister, salesByBranch, salesByCategory };

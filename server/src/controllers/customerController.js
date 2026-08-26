const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

const listCustomers = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*,
            COALESCE(SUM(si.total_amount - si.amount_paid - si.amount_credited) FILTER (WHERE si.status NOT IN ('paid', 'void')), 0) AS outstanding_balance
     FROM customers c
     LEFT JOIN sales_invoices si ON si.customer_id = c.id
     WHERE c.company_id = $1
     GROUP BY c.id
     ORDER BY c.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query('SELECT * FROM customers WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Customer not found');
  res.json(rows[0]);
});

const createCustomer = asyncHandler(async (req, res) => {
  const { customerCode, name, email, phone, address, city, region, tin, creditLimit, paymentTermsDays } = req.body;
  if (!customerCode || !name) throw new ApiError(400, 'customerCode and name are required');

  const existing = await db.query('SELECT id FROM customers WHERE company_id = $1 AND customer_code = $2', [req.user.companyId, customerCode]);
  if (existing.rows.length) throw new ApiError(409, 'A customer with this code already exists');

  const { rows } = await db.query(
    `INSERT INTO customers (company_id, customer_code, name, email, phone, address, city, region, tin, credit_limit, payment_terms_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.companyId, customerCode, name, email || null, phone || null, address || null, city || null, region || null, tin || null, creditLimit || 0, paymentTermsDays || 0]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'customer', entityId: rows[0].id, newValues: { name, customerCode }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address, city, region, tin, creditLimit, paymentTermsDays, isActive } = req.body;

  const { rows } = await db.query(
    `UPDATE customers SET
       name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone),
       address = COALESCE($4, address), city = COALESCE($5, city), region = COALESCE($6, region),
       tin = COALESCE($7, tin), credit_limit = COALESCE($8, credit_limit),
       payment_terms_days = COALESCE($9, payment_terms_days), is_active = COALESCE($10, is_active),
       updated_at = NOW()
     WHERE id = $11 AND company_id = $12 RETURNING *`,
    [name, email, phone, address, city, region, tin, creditLimit, paymentTermsDays, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Customer not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'customer', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// GET /customers/:id/ledger — statement of invoices, payments, and credit notes
const getCustomerLedger = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await db.query('SELECT * FROM customers WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!customer.rows.length) throw new ApiError(404, 'Customer not found');

  const invoices = await db.query(
    `SELECT id, invoice_no, invoice_date, due_date, total_amount, amount_paid, amount_credited, status,
            (total_amount - amount_paid - amount_credited) AS balance
     FROM sales_invoices WHERE customer_id = $1 ORDER BY invoice_date DESC`,
    [id]
  );
  const payments = await db.query(
    `SELECT id, payment_no, payment_date, amount, unallocated_amount, payment_method, reference
     FROM customer_payments WHERE customer_id = $1 ORDER BY payment_date DESC`,
    [id]
  );
  const creditNotes = await db.query(
    `SELECT id, credit_note_no, credit_note_date, amount, unapplied_amount, status
     FROM credit_notes WHERE customer_id = $1 ORDER BY credit_note_date DESC`,
    [id]
  );

  const totalOutstanding = invoices.rows
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.balance), 0);

  res.json({ customer: customer.rows[0], invoices: invoices.rows, payments: payments.rows, creditNotes: creditNotes.rows, totalOutstanding });
});

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, getCustomerLedger };

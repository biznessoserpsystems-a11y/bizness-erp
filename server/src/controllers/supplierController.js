const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const procurementSettingsService = require('../services/procurementSettingsService');
const { recordAudit } = require('../middleware/auditLog');

const listSuppliers = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, g.name AS group_name,
            COALESCE(SUM(pi.total_amount - pi.amount_paid - pi.amount_credited) FILTER (WHERE pi.status NOT IN ('paid', 'void')), 0) AS outstanding_balance
     FROM suppliers s
     LEFT JOIN supplier_groups g ON g.id = s.supplier_group_id
     LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id
     WHERE s.company_id = $1
     GROUP BY s.id, g.name
     ORDER BY s.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query('SELECT * FROM suppliers WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Supplier not found');
  res.json(rows[0]);
});

const createSupplier = asyncHandler(async (req, res) => {
  const { supplierCode, name, email, phone, address, city, region, tin, paymentTermsDays, creditLimit, supplierGroupId } = req.body;
  if (!supplierCode || !name) throw new ApiError(400, 'supplierCode and name are required');

  const existing = await db.query('SELECT id FROM suppliers WHERE company_id = $1 AND supplier_code = $2', [req.user.companyId, supplierCode]);
  if (existing.rows.length) throw new ApiError(409, 'A supplier with this code already exists');

  // No payment terms given for this specific supplier? Fall back to the
  // company-wide default from Procurement Settings rather than silently
  // recording 0 (net-immediate) for every supplier that doesn't specify one.
  let effectivePaymentTerms = paymentTermsDays;
  if (effectivePaymentTerms === undefined || effectivePaymentTerms === null) {
    const settings = await procurementSettingsService.getSettings(db, req.user.companyId);
    effectivePaymentTerms = settings.default_payment_terms_days;
  }

  const { rows } = await db.query(
    `INSERT INTO suppliers (company_id, supplier_code, name, email, phone, address, city, region, tin, payment_terms_days, credit_limit, supplier_group_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.user.companyId, supplierCode, name, email || null, phone || null, address || null, city || null, region || null, tin || null, effectivePaymentTerms, creditLimit || 0, supplierGroupId || null]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'supplier', entityId: rows[0].id, newValues: { name, supplierCode }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address, city, region, tin, paymentTermsDays, isActive, creditLimit, supplierGroupId } = req.body;

  const { rows } = await db.query(
    `UPDATE suppliers SET
       name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone),
       address = COALESCE($4, address), city = COALESCE($5, city), region = COALESCE($6, region),
       tin = COALESCE($7, tin), payment_terms_days = COALESCE($8, payment_terms_days),
       is_active = COALESCE($9, is_active), credit_limit = COALESCE($10, credit_limit),
       supplier_group_id = COALESCE($11, supplier_group_id), updated_at = NOW()
     WHERE id = $12 AND company_id = $13 RETURNING *`,
    [name, email, phone, address, city, region, tin, paymentTermsDays, isActive, creditLimit, supplierGroupId, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Supplier not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'supplier', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// GET /suppliers/:id/ledger — statement of invoices, payments, and debit notes
const getSupplierLedger = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const supplier = await db.query('SELECT * FROM suppliers WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!supplier.rows.length) throw new ApiError(404, 'Supplier not found');

  const invoices = await db.query(
    `SELECT id, invoice_no, supplier_invoice_no, invoice_date, due_date, total_amount, amount_paid, amount_credited, status,
            (total_amount - amount_paid - amount_credited) AS balance
     FROM purchase_invoices WHERE supplier_id = $1 ORDER BY invoice_date DESC`,
    [id]
  );
  const payments = await db.query(
    `SELECT id, payment_no, payment_date, amount, unallocated_amount, payment_method, reference
     FROM supplier_payments WHERE supplier_id = $1 ORDER BY payment_date DESC`,
    [id]
  );
  const debitNotes = await db.query(
    `SELECT id, debit_note_no, debit_note_date, amount, unapplied_amount, status
     FROM debit_notes WHERE supplier_id = $1 ORDER BY debit_note_date DESC`,
    [id]
  );

  const totalOutstanding = invoices.rows
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.balance), 0);

  res.json({ supplier: supplier.rows[0], invoices: invoices.rows, payments: payments.rows, debitNotes: debitNotes.rows, totalOutstanding });
});

// GET /suppliers/:id/scorecard — on-time delivery, return rate, and price variance vs. market
const getSupplierScorecard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { companyId } = req.user;

  const supplier = await db.query('SELECT id, name FROM suppliers WHERE id = $1 AND company_id = $2', [id, companyId]);
  if (!supplier.rows.length) throw new ApiError(404, 'Supplier not found');

  // Spend: total value of (non-void) purchase invoices raised against this supplier.
  const spendResult = await db.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS invoiced_value, COUNT(*) AS invoice_count
     FROM purchase_invoices WHERE supplier_id = $1 AND company_id = $2 AND status != 'void'`,
    [id, companyId]
  );

  // Returns: value of purchase returns raised against this supplier, as a share of spend.
  const returnsResult = await db.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS returns_value, COUNT(*) AS return_count
     FROM purchase_returns WHERE supplier_id = $1 AND company_id = $2 AND status = 'completed'`,
    [id, companyId]
  );

  // On-time delivery: for POs with an expected date, was the last GRN against that PO
  // on or before the expected date? Only counts POs that have at least one GRN.
  const deliveryResult = await db.query(
    `SELECT po.id, po.order_date, po.expected_date,
            (SELECT MAX(grn.received_date) FROM goods_received_notes grn WHERE grn.purchase_order_id = po.id AND grn.status = 'completed') AS last_received_date
     FROM purchase_orders po
     WHERE po.supplier_id = $1 AND po.company_id = $2 AND po.status != 'cancelled'`,
    [id, companyId]
  );
  const deliveredOrders = deliveryResult.rows.filter((o) => o.last_received_date);
  const onTimeOrders = deliveredOrders.filter((o) => o.expected_date && new Date(o.last_received_date) <= new Date(o.expected_date));
  const ordersWithExpectedDate = deliveredOrders.filter((o) => o.expected_date);
  const onTimeDeliveryRate = ordersWithExpectedDate.length ? (onTimeOrders.length / ordersWithExpectedDate.length) * 100 : null;
  const avgLeadTimeDays = deliveredOrders.length
    ? deliveredOrders.reduce((sum, o) => sum + (new Date(o.last_received_date) - new Date(o.order_date)) / 86400000, 0) / deliveredOrders.length
    : null;

  // Price variance: this supplier's average unit price paid per product, weighted by
  // quantity, compared against the company-wide average price paid for the same products
  // across ALL suppliers. Positive = this supplier charges more than the company's average.
  const varianceResult = await db.query(
    `WITH supplier_lines AS (
       SELECT pol.product_id, pol.quantity, pol.unit_price
       FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.purchase_order_id
       WHERE po.supplier_id = $1 AND po.company_id = $2
     ),
     market_avg AS (
       SELECT pol.product_id, SUM(pol.quantity * pol.unit_price) / NULLIF(SUM(pol.quantity), 0) AS avg_price
       FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.purchase_order_id
       WHERE po.company_id = $2
       GROUP BY pol.product_id
     )
     SELECT COALESCE(SUM(sl.quantity * (sl.unit_price - ma.avg_price)), 0) AS variance_value,
            COALESCE(SUM(sl.quantity * ma.avg_price), 0) AS baseline_value
     FROM supplier_lines sl JOIN market_avg ma ON ma.product_id = sl.product_id`,
    [id, companyId]
  );
  const { variance_value, baseline_value } = varianceResult.rows[0];
  const priceVariancePercent = Number(baseline_value) > 0 ? (Number(variance_value) / Number(baseline_value)) * 100 : null;

  const invoicedValue = Number(spendResult.rows[0].invoiced_value);
  const returnsValue = Number(returnsResult.rows[0].returns_value);

  res.json({
    supplierId: id,
    supplierName: supplier.rows[0].name,
    totalSpend: invoicedValue,
    invoiceCount: Number(spendResult.rows[0].invoice_count),
    returnCount: Number(returnsResult.rows[0].return_count),
    returnRatePercent: invoicedValue > 0 ? (returnsValue / invoicedValue) * 100 : null,
    onTimeDeliveryRatePercent: onTimeDeliveryRate,
    ordersConsidered: ordersWithExpectedDate.length,
    avgLeadTimeDays,
    priceVariancePercent,
  });
});

// GET /supplier-groups
const listSupplierGroups = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT g.*, COUNT(s.id) AS supplier_count
     FROM supplier_groups g LEFT JOIN suppliers s ON s.supplier_group_id = g.id
     WHERE g.company_id = $1 GROUP BY g.id ORDER BY g.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const createSupplierGroup = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) throw new ApiError(400, 'name is required');

  const existing = await db.query('SELECT id FROM supplier_groups WHERE company_id = $1 AND name = $2', [req.user.companyId, name]);
  if (existing.rows.length) throw new ApiError(409, 'A supplier group with this name already exists');

  const { rows } = await db.query(
    `INSERT INTO supplier_groups (company_id, name, description) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.companyId, name, description || null]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'supplier_group', entityId: rows[0].id, newValues: { name }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateSupplierGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const { rows } = await db.query(
    `UPDATE supplier_groups SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND company_id = $4 RETURNING *`,
    [name, description, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Supplier group not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'supplier_group', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

module.exports = {
  listSuppliers, getSupplier, createSupplier, updateSupplier, getSupplierLedger, getSupplierScorecard,
  listSupplierGroups, createSupplierGroup, updateSupplierGroup,
};

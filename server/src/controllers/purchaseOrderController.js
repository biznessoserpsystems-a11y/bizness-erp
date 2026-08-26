const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const currencyService = require('../services/currencyService');
const procurementSettingsService = require('../services/procurementSettingsService');
const notificationService = require('../services/notificationService');
const { recordAudit } = require('../middleware/auditLog');

const listPurchaseOrders = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN warehouses w ON w.id = po.warehouse_id
     WHERE po.company_id = $1 ORDER BY po.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getPurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query(
    `SELECT po.*, s.name AS supplier_name, s.payment_terms_days, w.name AS warehouse_name
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN warehouses w ON w.id = po.warehouse_id
     WHERE po.id = $1 AND po.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!header.rows.length) throw new ApiError(404, 'Purchase order not found');

  const lines = await db.query(
    `SELECT pol.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol, p.is_batch_tracked, p.is_expiry_tracked
     FROM purchase_order_lines pol JOIN products p ON p.id = pol.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE pol.purchase_order_id = $1`,
    [id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /purchase-orders  { supplierId, warehouseId, requisitionId?, supplierQuotationId?, expectedDate, notes, lines }
const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { supplierId, warehouseId, requisitionId, supplierQuotationId, expectedDate, notes, lines } = req.body;
  if (!supplierId || !warehouseId) throw new ApiError(400, 'supplierId and warehouseId are required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const settings = await procurementSettingsService.getSettings(client, req.user.companyId);

    // A line that doesn't specify a tax rate falls back to Procurement
    // Settings' default VAT rate, rather than silently being treated as
    // zero-rated.
    const linesWithDefaults = lines.map((l) => ({
      ...l,
      taxPercent: l.taxPercent !== undefined && l.taxPercent !== null ? l.taxPercent : settings.default_vat_rate,
    }));
    const totals = salesService.calcHeaderTotals(linesWithDefaults);

    const companyResult = await client.query('SELECT base_currency FROM companies WHERE id = $1', [req.user.companyId]);
    const baseCurrency = companyResult.rows[0]?.base_currency || 'GHS';
    const supplierResult = await client.query('SELECT currency FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.user.companyId]);
    if (!supplierResult.rows.length) throw new ApiError(404, 'Supplier not found');

    const docCurrency = req.body.currency || supplierResult.rows[0].currency || settings.default_currency || baseCurrency;
    const rate = docCurrency === baseCurrency
      ? 1
      : Number(req.body.exchangeRate) || await currencyService.getRate(client, req.user.companyId, docCurrency, baseCurrency, new Date().toISOString().slice(0, 10));

    // Procurement Settings' po_auto_approve_limit: 0 means always flag,
    // otherwise a PO over the limit is surfaced to approvers rather than
    // going through unnoticed. This doesn't block creation or change the
    // status lifecycle — it's a review flag layered on top of it.
    const needsReview = Number(settings.po_auto_approve_limit) > 0
      ? totals.totalAmount > Number(settings.po_auto_approve_limit)
      : false;

    const orderNo = await salesService.generateDocNo(client, req.user.companyId, 'PO');
    const orderResult = await client.query(
      `INSERT INTO purchase_orders
         (company_id, supplier_id, requisition_id, supplier_quotation_id, warehouse_id, order_no, expected_date,
          subtotal, discount_amount, tax_amount, total_amount, notes, created_by, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.user.companyId, supplierId, requisitionId || null, supplierQuotationId || null, warehouseId, orderNo, expectedDate || null,
        totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount, notes || null, req.user.id, docCurrency, rate]
    );
    const order = orderResult.rows[0];

    for (const line of linesWithDefaults) {
      const calc = salesService.calcLine(line);
      await client.query(
        `INSERT INTO purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0, calc.lineTotal]
      );
    }

    if (needsReview) {
      await notificationService.notifyUsersWithPermission(client, {
        companyId: req.user.companyId, permissionCode: 'procurement.orders.manage', excludeUserId: req.user.id,
        type: 'approval_requested', title: `Purchase order ${orderNo} exceeds the review threshold`,
        body: `Total ${docCurrency} ${totals.totalAmount.toFixed(2)} is above the configured limit — please review.`,
        link: '/procurement/purchase-orders', referenceType: 'purchase_order', referenceId: order.id, createdBy: req.user.id,
      });
    }

    if (requisitionId) {
      await client.query(`UPDATE purchase_requisitions SET status = 'converted', updated_at = NOW() WHERE id = $1`, [requisitionId]);
    }
    if (supplierQuotationId) {
      await client.query(`UPDATE supplier_quotations SET status = 'selected' WHERE id = $1`, [supplierQuotationId]);
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'purchase_order', entityId: order.id, newValues: { orderNo }, ip: req.ip });
    res.status(201).json({ ...order, needsReview });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /purchase-orders/:id/status  { status: 'confirmed'|'cancelled' }
const updatePurchaseOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['confirmed', 'cancelled'].includes(status)) throw new ApiError(400, 'status must be "confirmed" or "cancelled"');

  const { rows } = await db.query(
    `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *`,
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Purchase order not found');

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'purchase_order', entityId: id, newValues: { status }, ip: req.ip });
  res.json(rows[0]);
});

module.exports = { listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrderStatus };

const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const procurementSettingsService = require('../services/procurementSettingsService');
const { recordAudit } = require('../middleware/auditLog');

const listRfqs = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('supplierId', rs.supplier_id, 'supplierName', s.name, 'status', rs.status)) FILTER (WHERE rs.id IS NOT NULL), '[]') AS invited_suppliers
     FROM rfqs r
     LEFT JOIN rfq_suppliers rs ON rs.rfq_id = r.id
     LEFT JOIN suppliers s ON s.id = rs.supplier_id
     WHERE r.company_id = $1
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getRfq = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query('SELECT * FROM rfqs WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!header.rows.length) throw new ApiError(404, 'RFQ not found');

  const lines = await db.query(
    `SELECT rl.*, p.name AS product_name, p.sku, u.symbol AS uom_symbol
     FROM rfq_lines rl JOIN products p ON p.id = rl.product_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE rl.rfq_id = $1`,
    [id]
  );
  const suppliers = await db.query(
    `SELECT rs.*, s.name AS supplier_name FROM rfq_suppliers rs JOIN suppliers s ON s.id = rs.supplier_id WHERE rs.rfq_id = $1`,
    [id]
  );
  const quotations = await db.query(
    `SELECT sq.*, s.name AS supplier_name,
            COALESCE(json_agg(jsonb_build_object(
              'productId', sql.product_id, 'productName', p.name, 'quantity', sql.quantity,
              'unitPrice', sql.unit_price, 'leadTimeDays', sql.lead_time_days
            )) FILTER (WHERE sql.id IS NOT NULL), '[]') AS lines
     FROM supplier_quotations sq
     JOIN suppliers s ON s.id = sq.supplier_id
     LEFT JOIN supplier_quotation_lines sql ON sql.supplier_quotation_id = sq.id
     LEFT JOIN products p ON p.id = sql.product_id
     WHERE sq.rfq_id = $1
     GROUP BY sq.id, s.name
     ORDER BY sq.created_at`,
    [id]
  );

  res.json({ ...header.rows[0], lines: lines.rows, suppliers: suppliers.rows, quotations: quotations.rows });
});

// POST /rfqs  { requisitionId?, notes, supplierIds: [...], lines: [{ productId, quantity }] }
const createRfq = asyncHandler(async (req, res) => {
  const { requisitionId, notes, supplierIds, lines } = req.body;
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');
  if (!Array.isArray(supplierIds) || !supplierIds.length) throw new ApiError(400, 'At least one supplier must be invited');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rfqNo = await salesService.generateDocNo(client, req.user.companyId, 'RFQ');
    const headerResult = await client.query(
      `INSERT INTO rfqs (company_id, requisition_id, rfq_no, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, requisitionId || null, rfqNo, notes || null, req.user.id]
    );
    const rfq = headerResult.rows[0];

    for (const line of lines) {
      await client.query('INSERT INTO rfq_lines (rfq_id, product_id, quantity) VALUES ($1,$2,$3)', [rfq.id, line.productId, line.quantity]);
    }
    for (const supplierId of supplierIds) {
      await client.query('INSERT INTO rfq_suppliers (rfq_id, supplier_id) VALUES ($1,$2)', [rfq.id, supplierId]);
    }

    if (requisitionId) {
      await client.query(`UPDATE purchase_requisitions SET status = 'converted', updated_at = NOW() WHERE id = $1`, [requisitionId]);
    }

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'rfq', entityId: rfq.id, newValues: { rfqNo }, ip: req.ip });
    res.status(201).json(rfq);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /rfqs/:id/status  { status: 'sent'|'closed' }
const updateRfqStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['sent', 'closed'].includes(status)) throw new ApiError(400, 'status must be "sent" or "closed"');

  const { rows } = await db.query(
    `UPDATE rfqs SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
    [status, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'RFQ not found');
  res.json(rows[0]);
});

// POST /rfqs/:id/quotations  { supplierId, lines: [{ productId, quantity, unitPrice, leadTimeDays }] }
const recordSupplierQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { supplierId, notes, lines } = req.body;
  if (!supplierId) throw new ApiError(400, 'supplierId is required');
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one line item is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const quotationNo = await salesService.generateDocNo(client, req.user.companyId, 'SQ');
    const headerResult = await client.query(
      `INSERT INTO supplier_quotations (company_id, rfq_id, supplier_id, quotation_no, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.companyId, id, supplierId, quotationNo, notes || null, req.user.id]
    );
    const quotation = headerResult.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO supplier_quotation_lines (supplier_quotation_id, product_id, quantity, unit_price, lead_time_days)
         VALUES ($1,$2,$3,$4,$5)`,
        [quotation.id, line.productId, line.quantity, line.unitPrice, line.leadTimeDays || 0]
      );
    }

    await client.query(`UPDATE rfq_suppliers SET status = 'responded' WHERE rfq_id = $1 AND supplier_id = $2`, [id, supplierId]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'supplier_quotation', entityId: quotation.id, newValues: { quotationNo }, ip: req.ip });
    res.status(201).json(quotation);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /supplier-quotations/:id/select — marks this quotation selected (and others for the same RFQ rejected)
const selectSupplierQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const quoteResult = await client.query('SELECT * FROM supplier_quotations WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!quoteResult.rows.length) throw new ApiError(404, 'Supplier quotation not found');
    const quotation = quoteResult.rows[0];

    const settings = await procurementSettingsService.getSettings(client, req.user.companyId);
    if (Number(settings.rfq_min_quotes) > 0) {
      const countResult = await client.query('SELECT COUNT(*) FROM supplier_quotations WHERE rfq_id = $1', [quotation.rfq_id]);
      const quoteCount = Number(countResult.rows[0].count);
      if (quoteCount < Number(settings.rfq_min_quotes)) {
        throw new ApiError(
          400,
          `At least ${settings.rfq_min_quotes} supplier quotation(s) are required before awarding this RFQ (${quoteCount} on file) — see Procurement & Purchasing → Settings.`
        );
      }
    }

    await client.query(`UPDATE supplier_quotations SET status = 'rejected' WHERE rfq_id = $1 AND id != $2`, [quotation.rfq_id, id]);
    await client.query(`UPDATE supplier_quotations SET status = 'selected' WHERE id = $1`, [id]);

    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'supplier_quotation', entityId: id, newValues: { status: 'selected' }, ip: req.ip });
    res.json({ message: 'Quotation selected' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listRfqs, getRfq, createRfq, updateRfqStatus, recordSupplierQuotation, selectSupplierQuotation };

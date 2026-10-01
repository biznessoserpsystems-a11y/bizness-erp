const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const salesService = require('../services/salesService');
const stockService = require('../services/stockService');
const accountingService = require('../services/accountingService');
const procurementSettingsService = require('../services/procurementSettingsService');
const { recordAudit } = require('../middleware/auditLog');

const num = Number;

// Runs fn(client) in a transaction; commits on success, rolls back on any error.
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

// Reverses every still-posted journal entry that a record created (its original
// entry is marked 'reversed' and a mirror entry is posted today).
async function reverseJournalsFor(client, req, referenceType, referenceId, reason) {
  const { rows } = await client.query(
    `SELECT id FROM journal_entries WHERE company_id = $1 AND reference_type = $2 AND reference_id = $3 AND status = 'posted'`,
    [req.user.companyId, referenceType, referenceId]
  );
  for (const entry of rows) {
    await accountingService.reverseJournalEntry(client, { companyId: req.user.companyId, userId: req.user.id, journalEntryId: entry.id, reason });
  }
}

// Recomputes a PO's status from its lines after a receipt/invoice was removed.
async function refreshPurchaseOrderStatus(client, purchaseOrderId) {
  const poResult = await client.query('SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE', [purchaseOrderId]);
  if (!poResult.rows.length || poResult.rows[0].status === 'cancelled') return;
  const { rows } = await client.query('SELECT quantity, received_quantity, invoiced_quantity FROM purchase_order_lines WHERE purchase_order_id = $1', [purchaseOrderId]);
  const fullyInvoiced = rows.length > 0 && rows.every((l) => num(l.invoiced_quantity) >= num(l.quantity));
  const fullyReceived = rows.length > 0 && rows.every((l) => num(l.received_quantity) >= num(l.quantity));
  const anyReceived = rows.some((l) => num(l.received_quantity) > 0);
  let status;
  if (fullyInvoiced) status = 'invoiced';
  else if (fullyReceived) status = 'received';
  else if (anyReceived) status = 'partially_received';
  else status = ['received', 'partially_received', 'invoiced'].includes(poResult.rows[0].status) ? 'confirmed' : poResult.rows[0].status;
  await client.query('UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, purchaseOrderId]);
}

// A requisition is marked 'converted' when an RFQ or PO is raised from it. When the
// last such document is deleted, it goes back to 'approved' so it can be used again.
async function releaseRequisition(client, requisitionId) {
  if (!requisitionId) return;
  const { rows } = await client.query(
    `SELECT (SELECT COUNT(*) FROM rfqs WHERE requisition_id = $1) AS rfqs,
            (SELECT COUNT(*) FROM purchase_orders WHERE requisition_id = $1) AS pos`,
    [requisitionId]
  );
  if (num(rows[0].rfqs) === 0 && num(rows[0].pos) === 0) {
    await client.query(`UPDATE purchase_requisitions SET status = 'approved', updated_at = NOW() WHERE id = $1 AND status = 'converted'`, [requisitionId]);
  }
}

async function refreshInvoiceStatus(client, invoiceId) {
  const { rows } = await client.query('SELECT * FROM purchase_invoices WHERE id = $1', [invoiceId]);
  const inv = rows[0];
  const settled = num(inv.amount_paid) + num(inv.amount_credited);
  let status = inv.status;
  if (status !== 'void') {
    if (settled >= num(inv.total_amount)) status = 'paid';
    else if (settled > 0) status = 'partially_paid';
    else status = 'issued';
  }
  await client.query('UPDATE purchase_invoices SET status = $1, updated_at = NOW() WHERE id = $2', [status, invoiceId]);
}

// GET /procurement/record-controls — lets the Procurement pages know whether the
// company has editing/deleting switched on, without needing settings permission.
const getControls = asyncHandler(async (req, res) => {
  const settings = await procurementSettingsService.getSettings(db, req.user.companyId);
  res.json({ allow_edit: !!settings.allow_record_edit, allow_delete: !!settings.allow_record_delete });
});

// ---------------------------------------------------------------- Requisitions

// PUT /requisitions/:id { warehouseId?, notes?, lines?: [{ productId, quantity }] }
const updateRequisition = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { warehouseId, notes, lines } = req.body;
  if (lines !== undefined && (!Array.isArray(lines) || !lines.length)) throw new ApiError(400, 'At least one line item is required');

  const updated = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM purchase_requisitions WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Requisition not found');
    const requisition = found.rows[0];
    if (!['draft', 'submitted', 'rejected'].includes(requisition.status)) {
      throw new ApiError(400, `A ${requisition.status} requisition can no longer be edited`);
    }
    const pending = await client.query(`SELECT 1 FROM workflow_instances WHERE entity_type = 'purchase_requisition' AND entity_id = $1 AND status = 'pending'`, [id]);
    if (pending.rows.length) throw new ApiError(400, 'This requisition is going through an approval workflow and cannot be edited');

    if (warehouseId) {
      const wh = await client.query('SELECT 1 FROM warehouses WHERE id = $1 AND company_id = $2', [warehouseId, req.user.companyId]);
      if (!wh.rows.length) throw new ApiError(404, 'Warehouse not found');
    }
    const result = await client.query(
      `UPDATE purchase_requisitions SET warehouse_id = COALESCE($1, warehouse_id), notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [warehouseId || null, notes !== undefined ? notes : null, id]
    );
    if (lines) {
      await client.query('DELETE FROM purchase_requisition_lines WHERE requisition_id = $1', [id]);
      for (const line of lines) {
        await client.query('INSERT INTO purchase_requisition_lines (requisition_id, product_id, quantity, notes) VALUES ($1,$2,$3,$4)', [id, line.productId, line.quantity, line.notes || null]);
      }
    }
    return result.rows[0];
  });

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'purchase_requisition', entityId: id, newValues: { edited: true }, ip: req.ip });
  res.json(updated);
});

// DELETE /requisitions/:id
const deleteRequisition = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requisitionNo = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM purchase_requisitions WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Requisition not found');
    const refs = await client.query(
      `SELECT (SELECT COUNT(*) FROM rfqs WHERE requisition_id = $1) AS rfqs, (SELECT COUNT(*) FROM purchase_orders WHERE requisition_id = $1) AS pos`,
      [id]
    );
    if (num(refs.rows[0].rfqs) > 0 || num(refs.rows[0].pos) > 0) {
      throw new ApiError(400, 'This requisition has an RFQ or purchase order raised from it. Delete those first.');
    }
    await client.query(`DELETE FROM workflow_instances WHERE entity_type = 'purchase_requisition' AND entity_id = $1`, [id]);
    await client.query('DELETE FROM purchase_requisitions WHERE id = $1', [id]);
    return found.rows[0].requisition_no;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'purchase_requisition', entityId: id, oldValues: { requisitionNo }, ip: req.ip });
  res.json({ message: 'Requisition deleted' });
});

// ------------------------------------------------------------------------ RFQs

// PUT /rfqs/:id { notes?, supplierIds?, lines?: [{ productId, quantity }] }
const updateRfq = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes, supplierIds, lines } = req.body;
  if (lines !== undefined && (!Array.isArray(lines) || !lines.length)) throw new ApiError(400, 'At least one line item is required');
  if (supplierIds !== undefined && (!Array.isArray(supplierIds) || !supplierIds.length)) throw new ApiError(400, 'At least one supplier must be invited');

  const updated = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM rfqs WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'RFQ not found');
    if (!['draft', 'sent'].includes(found.rows[0].status)) throw new ApiError(400, `A ${found.rows[0].status} RFQ can no longer be edited`);
    const quotes = await client.query('SELECT COUNT(*) AS n FROM supplier_quotations WHERE rfq_id = $1', [id]);
    if (num(quotes.rows[0].n) > 0) throw new ApiError(400, 'Suppliers have already quoted on this RFQ, so it can no longer be edited');

    const result = await client.query('UPDATE rfqs SET notes = COALESCE($1, notes) WHERE id = $2 RETURNING *', [notes !== undefined ? notes : null, id]);
    if (lines) {
      await client.query('DELETE FROM rfq_lines WHERE rfq_id = $1', [id]);
      for (const line of lines) await client.query('INSERT INTO rfq_lines (rfq_id, product_id, quantity) VALUES ($1,$2,$3)', [id, line.productId, line.quantity]);
    }
    if (supplierIds) {
      await client.query('DELETE FROM rfq_suppliers WHERE rfq_id = $1', [id]);
      for (const supplierId of supplierIds) await client.query('INSERT INTO rfq_suppliers (rfq_id, supplier_id) VALUES ($1,$2)', [id, supplierId]);
    }
    return result.rows[0];
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'rfq', entityId: id, newValues: { edited: true }, ip: req.ip });
  res.json(updated);
});

// DELETE /rfqs/:id
const deleteRfq = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rfqNo = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM rfqs WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'RFQ not found');
    const quotes = await client.query('SELECT COUNT(*) AS n FROM supplier_quotations WHERE rfq_id = $1', [id]);
    if (num(quotes.rows[0].n) > 0) throw new ApiError(400, 'Suppliers have already quoted on this RFQ. Delete the quotations first, or leave the RFQ in place.');
    await client.query('DELETE FROM rfqs WHERE id = $1', [id]);
    await releaseRequisition(client, found.rows[0].requisition_id);
    return found.rows[0].rfq_no;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'rfq', entityId: id, oldValues: { rfqNo }, ip: req.ip });
  res.json({ message: 'RFQ deleted' });
});

// ------------------------------------------------------------- Purchase orders

// A PO can only be changed or removed while nothing has been received or invoiced against it.
async function assertPurchaseOrderUntouched(client, order) {
  const refs = await client.query(
    `SELECT (SELECT COUNT(*) FROM goods_received_notes WHERE purchase_order_id = $1) AS grns,
            (SELECT COUNT(*) FROM purchase_invoices WHERE purchase_order_id = $1) AS invoices`,
    [order.id]
  );
  if (num(refs.rows[0].grns) > 0) throw new ApiError(400, 'Goods have been received against this order. Delete the goods received notes first.');
  if (num(refs.rows[0].invoices) > 0) throw new ApiError(400, 'A purchase invoice exists for this order. Delete the invoice first.');
}

// PUT /purchase-orders/:id { warehouseId?, expectedDate?, notes?, lines?: [{ productId, quantity, unitPrice, discountPercent?, taxPercent?, description? }] }
const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { warehouseId, expectedDate, notes, lines } = req.body;
  if (lines !== undefined && (!Array.isArray(lines) || !lines.length)) throw new ApiError(400, 'At least one line item is required');

  const updated = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Purchase order not found');
    const order = found.rows[0];
    if (!['pending', 'confirmed'].includes(order.status)) throw new ApiError(400, `A ${order.status.replace('_', ' ')} order can no longer be edited`);
    await assertPurchaseOrderUntouched(client, order);

    if (warehouseId) {
      const wh = await client.query('SELECT 1 FROM warehouses WHERE id = $1 AND company_id = $2', [warehouseId, req.user.companyId]);
      if (!wh.rows.length) throw new ApiError(404, 'Warehouse not found');
    }

    let totals = null;
    if (lines) {
      const settings = await procurementSettingsService.getSettings(client, req.user.companyId);
      const withDefaults = lines.map((l) => ({ ...l, taxPercent: l.taxPercent !== undefined && l.taxPercent !== null ? l.taxPercent : settings.default_vat_rate }));
      totals = salesService.calcHeaderTotals(withDefaults);
      await client.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [id]);
      for (const line of withDefaults) {
        const calc = salesService.calcLine(line);
        await client.query(
          `INSERT INTO purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price, discount_percent, tax_percent, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, line.productId, line.description || null, line.quantity, line.unitPrice, line.discountPercent || 0, line.taxPercent || 0, calc.lineTotal]
        );
      }
    }

    const result = await client.query(
      `UPDATE purchase_orders SET
         warehouse_id = COALESCE($1, warehouse_id),
         expected_date = COALESCE($2, expected_date),
         notes = COALESCE($3, notes),
         subtotal = COALESCE($4, subtotal), discount_amount = COALESCE($5, discount_amount),
         tax_amount = COALESCE($6, tax_amount), total_amount = COALESCE($7, total_amount),
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [warehouseId || null, expectedDate || null, notes !== undefined ? notes : null,
        totals ? totals.subtotal : null, totals ? totals.discountAmount : null, totals ? totals.taxAmount : null, totals ? totals.totalAmount : null, id]
    );
    return result.rows[0];
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'purchase_order', entityId: id, newValues: { edited: true }, ip: req.ip });
  res.json(updated);
});

// DELETE /purchase-orders/:id
const deletePurchaseOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const orderNo = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Purchase order not found');
    const order = found.rows[0];
    await assertPurchaseOrderUntouched(client, order);

    await client.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
    await releaseRequisition(client, order.requisition_id);
    if (order.supplier_quotation_id) {
      const others = await client.query('SELECT COUNT(*) AS n FROM purchase_orders WHERE supplier_quotation_id = $1', [order.supplier_quotation_id]);
      if (num(others.rows[0].n) === 0) {
        await client.query(`UPDATE supplier_quotations SET status = 'received' WHERE id = $1 AND status = 'selected'`, [order.supplier_quotation_id]);
      }
    }
    return order.order_no;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'purchase_order', entityId: id, oldValues: { orderNo }, ip: req.ip });
  res.json({ message: 'Purchase order deleted' });
});

// ------------------------------------------------------------------------ GRNs

// PUT /grns/:id { notes }  — quantities/costs can't be edited (they posted stock and ledger entries); delete and re-receive instead.
const updateGrn = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    'UPDATE goods_received_notes SET notes = $1 WHERE id = $2 AND company_id = $3 RETURNING *',
    [req.body.notes || null, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Goods received note not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'grn', entityId: id, newValues: { notes: req.body.notes || null }, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /grns/:id — takes the received stock back out, reverses the ledger entry and un-receives the PO lines.
const deleteGrn = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const grnNo = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM goods_received_notes WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Goods received note not found');
    const grn = found.rows[0];
    const lines = (await client.query('SELECT * FROM grn_lines WHERE grn_id = $1', [id])).rows;

    if (grn.purchase_order_id) await client.query('SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE', [grn.purchase_order_id]);

    for (const line of lines) {
      if (!line.purchase_order_line_id) continue;
      const pol = (await client.query('SELECT * FROM purchase_order_lines WHERE id = $1 FOR UPDATE', [line.purchase_order_line_id])).rows[0];
      if (pol && num(pol.invoiced_quantity) > num(pol.received_quantity) - num(line.quantity) + 0.00001) {
        throw new ApiError(400, 'Some of these goods have already been invoiced. Delete the purchase invoice first.');
      }
    }

    for (const line of lines) {
      const productResult = await client.query('SELECT name, is_batch_tracked FROM products WHERE id = $1', [line.product_id]);
      const product = productResult.rows[0];
      if (!product.is_batch_tracked) {
        // Never let a deletion push stock negative, even if the company allows negative stock for sales.
        const level = await client.query('SELECT quantity FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2', [line.product_id, grn.warehouse_id]);
        const onHand = level.rows.length ? num(level.rows[0].quantity) : 0;
        if (onHand < num(line.quantity)) {
          throw new ApiError(400, `Cannot delete: only ${onHand} of "${product.name}" is in stock, but ${num(line.quantity)} was received on this note. Some has already been used or sold.`);
        }
      }
      try {
        await stockService.issueStock(client, {
          companyId: req.user.companyId, userId: req.user.id, productId: line.product_id, warehouseId: grn.warehouse_id,
          quantity: num(line.quantity), batchId: line.batch_id || undefined,
          movementType: 'purchase_receipt_reversal', referenceType: 'grn', referenceId: grn.id, reason: `Goods received ${grn.grn_no} deleted`,
        });
      } catch (err) {
        if (err.statusCode === 400 || err.status === 400) throw new ApiError(400, `Cannot delete: "${product.name}" from this note has already been used or sold. ${err.message}`);
        throw err;
      }
      if (line.purchase_order_line_id) {
        await client.query('UPDATE purchase_order_lines SET received_quantity = received_quantity - $1 WHERE id = $2', [line.quantity, line.purchase_order_line_id]);
      }
    }

    await reverseJournalsFor(client, req, 'grn', grn.id, `Goods received ${grn.grn_no} deleted`);
    if (grn.purchase_order_id) await refreshPurchaseOrderStatus(client, grn.purchase_order_id);
    await client.query('DELETE FROM goods_received_notes WHERE id = $1', [id]);
    return grn.grn_no;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'grn', entityId: id, oldValues: { grnNo }, ip: req.ip });
  res.json({ message: 'Goods received note deleted' });
});

// ------------------------------------------------------------ Purchase invoices

// PUT /purchase-invoices/:id { supplierInvoiceNo?, dueDate?, notes? } — amounts/lines posted to the ledger, so they can't be edited.
const updateInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { supplierInvoiceNo, dueDate, notes } = req.body;
  const { rows } = await db.query(
    `UPDATE purchase_invoices SET
       supplier_invoice_no = COALESCE($1, supplier_invoice_no), due_date = COALESCE($2, due_date), notes = COALESCE($3, notes), updated_at = NOW()
     WHERE id = $4 AND company_id = $5 AND status <> 'void' RETURNING *`,
    [supplierInvoiceNo !== undefined ? supplierInvoiceNo : null, dueDate || null, notes !== undefined ? notes : null, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Invoice not found, or it has been voided');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'purchase_invoice', entityId: id, newValues: { supplierInvoiceNo, dueDate, notes }, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /purchase-invoices/:id — reverses the ledger entry and un-invoices the PO lines.
const deleteInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const invoiceNo = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM purchase_invoices WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Invoice not found');
    const invoice = found.rows[0];
    if (num(invoice.amount_paid) > 0) throw new ApiError(400, 'Payments have been applied to this invoice. Delete or reallocate the payment first.');
    if (num(invoice.amount_credited) > 0) throw new ApiError(400, 'A debit note has been applied to this invoice, so it cannot be deleted.');
    const refs = await client.query(
      `SELECT (SELECT COUNT(*) FROM supplier_payment_allocations WHERE purchase_invoice_id = $1) AS allocations,
              (SELECT COUNT(*) FROM purchase_returns WHERE purchase_invoice_id = $1) AS returns,
              (SELECT COUNT(*) FROM debit_notes WHERE purchase_invoice_id = $1) AS debit_notes,
              (SELECT COUNT(*) FROM fixed_assets WHERE purchase_invoice_id = $1) AS fixed_assets`,
      [id]
    );
    if (num(refs.rows[0].fixed_assets) > 0) throw new ApiError(400, 'A fixed asset was registered from this invoice, so it cannot be deleted.');
    if (num(refs.rows[0].allocations) > 0) throw new ApiError(400, 'A supplier payment is allocated to this invoice. Delete or reallocate the payment first.');
    if (num(refs.rows[0].returns) > 0 || num(refs.rows[0].debit_notes) > 0) throw new ApiError(400, 'A purchase return or debit note refers to this invoice, so it cannot be deleted.');

    if (invoice.purchase_order_id) await client.query('SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE', [invoice.purchase_order_id]);
    const lines = (await client.query('SELECT * FROM purchase_invoice_lines WHERE purchase_invoice_id = $1', [id])).rows;
    for (const line of lines) {
      if (line.purchase_order_line_id) {
        await client.query('UPDATE purchase_order_lines SET invoiced_quantity = GREATEST(invoiced_quantity - $1, 0) WHERE id = $2', [line.quantity, line.purchase_order_line_id]);
      }
    }

    await reverseJournalsFor(client, req, 'purchase_invoice', id, `Purchase invoice ${invoice.invoice_no} deleted`);
    if (invoice.purchase_order_id) await refreshPurchaseOrderStatus(client, invoice.purchase_order_id);
    await client.query('DELETE FROM purchase_invoices WHERE id = $1', [id]);
    return invoice.invoice_no;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'purchase_invoice', entityId: id, oldValues: { invoiceNo }, ip: req.ip });
  res.json({ message: 'Purchase invoice deleted' });
});

// ------------------------------------------------------------ Supplier payments

// PUT /supplier-payments/:id { paymentMethod?, reference?, notes? } — the amount posted to the ledger, so it can't be edited.
const updatePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, reference, notes } = req.body;
  if (paymentMethod && !['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'].includes(paymentMethod)) throw new ApiError(400, 'Invalid payment method');
  const { rows } = await db.query(
    `UPDATE supplier_payments SET payment_method = COALESCE($1, payment_method), reference = COALESCE($2, reference), notes = COALESCE($3, notes)
     WHERE id = $4 AND company_id = $5 RETURNING *`,
    [paymentMethod || null, reference !== undefined ? reference : null, notes !== undefined ? notes : null, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Payment not found');
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'supplier_payment', entityId: id, newValues: { paymentMethod, reference, notes }, ip: req.ip });
  res.json(rows[0]);
});

// DELETE /supplier-payments/:id — reverses the ledger entry and re-opens the invoices it paid.
const deletePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const paymentNo = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM supplier_payments WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Payment not found');
    const payment = found.rows[0];

    const allocations = (await client.query('SELECT * FROM supplier_payment_allocations WHERE payment_id = $1', [id])).rows;
    for (const alloc of allocations) {
      await client.query('SELECT id FROM purchase_invoices WHERE id = $1 FOR UPDATE', [alloc.purchase_invoice_id]);
      await client.query('UPDATE purchase_invoices SET amount_paid = GREATEST(amount_paid - $1, 0) WHERE id = $2', [alloc.amount_allocated, alloc.purchase_invoice_id]);
      await refreshInvoiceStatus(client, alloc.purchase_invoice_id);
    }

    await reverseJournalsFor(client, req, 'supplier_payment', id, `Supplier payment ${payment.payment_no} deleted`);
    await client.query('DELETE FROM supplier_payments WHERE id = $1', [id]);
    return payment.payment_no;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'supplier_payment', entityId: id, oldValues: { paymentNo }, ip: req.ip });
  res.json({ message: 'Supplier payment deleted' });
});

module.exports = {
  getControls,
  updateRequisition, deleteRequisition, updateRfq, deleteRfq, updatePurchaseOrder, deletePurchaseOrder,
  updateGrn, deleteGrn, updateInvoice, deleteInvoice, updatePayment, deletePayment,
};

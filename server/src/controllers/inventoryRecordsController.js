const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const inventorySettingsService = require('../services/inventorySettingsService');
const { recordAudit } = require('../middleware/auditLog');

// Readable names for the tables that may refer to a record, used in the "in use" message.
const FRIENDLY = {
  bill_of_materials: 'bills of materials', bom_lines: 'bills of materials', damaged_goods: 'damaged goods reports',
  delivery_note_lines: 'delivery notes', delivery_notes: 'delivery notes', grn_lines: 'goods received notes',
  goods_received_notes: 'goods received notes', inventory_count_lines: 'inventory counts', inventory_counts: 'inventory counts',
  purchase_invoice_lines: 'purchase invoices', purchase_order_lines: 'purchase orders', purchase_orders: 'purchase orders',
  purchase_requisition_lines: 'purchase requisitions', purchase_requisitions: 'purchase requisitions',
  purchase_return_lines: 'purchase returns', purchase_returns: 'purchase returns', quotation_lines: 'sales quotations',
  recurring_invoice_lines: 'recurring invoices', rental_items: 'rental items', rfq_lines: 'RFQs',
  sales_invoice_lines: 'sales invoices', sales_order_lines: 'sales orders', sales_orders: 'sales orders',
  sales_return_lines: 'sales returns', sales_returns: 'sales returns', service_catalog: 'the service catalogue',
  stock_transfer_lines: 'stock transfers', stock_transfers: 'stock transfers', supplier_quotation_lines: 'supplier quotations',
  work_order_material_issues: 'work orders', work_orders: 'work orders', stock_movements: 'stock movements',
  stock_batches: 'stock batches',
};
const friendly = (table) => FRIENDLY[table] || table.replace(/_/g, ' ');

// Finds every table that holds a restricting (NO ACTION) reference to this record and
// reports which of them actually contain rows pointing at it.
async function referencingTables(client, targetTable, id) {
  const { rows } = await client.query(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
     FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.contype = 'f' AND c.confrelid = $1::regclass AND c.confdeltype = 'a'`,
    [targetTable]
  );
  const used = new Set();
  for (const { tbl, col } of rows) {
    const hit = await client.query(`SELECT 1 FROM ${tbl} WHERE "${col.replace(/"/g, '""')}" = $1 LIMIT 1`, [id]);
    if (hit.rows.length) used.add(friendly(tbl.replace(/^public\./, '').replace(/"/g, '')));
  }
  return [...used];
}

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

// GET /inventory/record-controls — lets the Inventory pages know whether the company has
// editing/deleting switched on, without needing the settings permission.
const getControls = asyncHandler(async (req, res) => {
  const settings = await inventorySettingsService.getSettings(db, req.user.companyId);
  res.json({ allow_edit: settings.allow_record_edit !== false, allow_delete: !!settings.allow_record_delete });
});

// DELETE /products/:id — only a product that has never been used. Anything with history
// (stock movements, batches, on-hand stock, or any document line) must be deactivated instead.
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sku = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Product not found');
    const product = found.rows[0];

    const used = await referencingTables(client, 'products', id);
    const movements = await client.query('SELECT 1 FROM stock_movements WHERE product_id = $1 LIMIT 1', [id]);
    const batches = await client.query('SELECT 1 FROM stock_batches WHERE product_id = $1 LIMIT 1', [id]);
    const onHand = await client.query('SELECT 1 FROM stock_levels WHERE product_id = $1 AND quantity <> 0 LIMIT 1', [id]);
    if (movements.rows.length) used.push('stock movements');
    if (batches.rows.length) used.push('stock batches');
    if (onHand.rows.length) used.push('on-hand stock');
    const reasons = [...new Set(used)];
    if (reasons.length) {
      throw new ApiError(400, `"${product.name}" cannot be deleted because it is used by ${reasons.join(', ')}. Deactivate it instead.`);
    }

    // Nothing else refers to it. Its empty stock levels, bins and warehouse settings go with it.
    await client.query('DELETE FROM products WHERE id = $1', [id]);
    return product.sku;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'product', entityId: id, oldValues: { sku }, ip: req.ip });
  res.json({ message: 'Product deleted' });
});

// DELETE /brands/:id — blocked while any product still uses it (deleting would silently strip the brand).
const deleteBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const name = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM brands WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Brand not found');
    const used = await client.query('SELECT COUNT(*) AS n FROM products WHERE brand_id = $1', [id]);
    if (Number(used.rows[0].n) > 0) {
      throw new ApiError(400, `"${found.rows[0].name}" is used by ${used.rows[0].n} product(s). Change those products to another brand first, or deactivate it instead.`);
    }
    await client.query('DELETE FROM brands WHERE id = $1', [id]);
    return found.rows[0].name;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'brand', entityId: id, oldValues: { name }, ip: req.ip });
  res.json({ message: 'Brand deleted' });
});

// DELETE /product-categories/:id — blocked while any product or sub-category still uses it.
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const name = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM product_categories WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Category not found');
    const products = await client.query('SELECT COUNT(*) AS n FROM products WHERE category_id = $1', [id]);
    if (Number(products.rows[0].n) > 0) {
      throw new ApiError(400, `"${found.rows[0].name}" is used by ${products.rows[0].n} product(s). Move those products to another category first, or deactivate it instead.`);
    }
    const children = await client.query('SELECT COUNT(*) AS n FROM product_categories WHERE parent_id = $1', [id]);
    if (Number(children.rows[0].n) > 0) {
      throw new ApiError(400, `"${found.rows[0].name}" has ${children.rows[0].n} sub-categor${Number(children.rows[0].n) === 1 ? 'y' : 'ies'}. Delete or move those first.`);
    }
    await client.query('DELETE FROM product_categories WHERE id = $1', [id]);
    return found.rows[0].name;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'product_category', entityId: id, oldValues: { name }, ip: req.ip });
  res.json({ message: 'Category deleted' });
});

// DELETE /warehouses/:id — only a warehouse that has never held or moved stock and no document refers to.
const deleteWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const name = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM warehouses WHERE id = $1 AND company_id = $2 FOR UPDATE', [id, req.user.companyId]);
    if (!found.rows.length) throw new ApiError(404, 'Warehouse not found');
    const warehouse = found.rows[0];

    const used = await referencingTables(client, 'warehouses', id);
    const movements = await client.query('SELECT 1 FROM stock_movements WHERE warehouse_id = $1 LIMIT 1', [id]);
    const batches = await client.query('SELECT 1 FROM stock_batches WHERE warehouse_id = $1 LIMIT 1', [id]);
    const onHand = await client.query('SELECT 1 FROM stock_levels WHERE warehouse_id = $1 AND quantity <> 0 LIMIT 1', [id]);
    const isInventoryDefault = await client.query('SELECT 1 FROM inventory_settings WHERE default_warehouse_id = $1 LIMIT 1', [id]);
    const isManufacturingDefault = await client.query('SELECT 1 FROM manufacturing_settings WHERE default_warehouse_id = $1 LIMIT 1', [id]);
    if (movements.rows.length) used.push('stock movements');
    if (batches.rows.length) used.push('stock batches');
    if (onHand.rows.length) used.push('on-hand stock');
    if (isInventoryDefault.rows.length) used.push('the default warehouse in Inventory Settings');
    if (isManufacturingDefault.rows.length) used.push('the default warehouse in Manufacturing Settings');
    const reasons = [...new Set(used)];
    if (reasons.length) {
      throw new ApiError(400, `"${warehouse.name}" cannot be deleted because it is used by ${reasons.join(', ')}. Deactivate it instead.`);
    }

    await client.query('DELETE FROM warehouses WHERE id = $1', [id]);
    return warehouse.name;
  });
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'DELETE', entityType: 'warehouse', entityId: id, oldValues: { name }, ip: req.ip });
  res.json({ message: 'Warehouse deleted' });
});

module.exports = { getControls, deleteProduct, deleteBrand, deleteCategory, deleteWarehouse };

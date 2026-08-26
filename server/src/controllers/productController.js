const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');
const inventorySettingsService = require('../services/inventorySettingsService');

const listProducts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, c.name AS category_name, b.name AS brand_name, u.symbol AS uom_symbol,
            COALESCE(SUM(sl.quantity), 0) AS total_stock,
            COALESCE(SUM(sl.quantity * sl.average_cost), 0) AS total_stock_value
     FROM products p
     LEFT JOIN product_categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     LEFT JOIN stock_levels sl ON sl.product_id = p.id
     WHERE p.company_id = $1
     GROUP BY p.id, c.name, b.name, u.symbol
     ORDER BY p.name`,
    [req.user.companyId]
  );
  res.json(rows);
});

const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const productResult = await db.query(
    `SELECT p.*, c.name AS category_name, b.name AS brand_name, u.symbol AS uom_symbol
     FROM products p
     LEFT JOIN product_categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE p.id = $1 AND p.company_id = $2`,
    [id, req.user.companyId]
  );
  if (!productResult.rows.length) throw new ApiError(404, 'Product not found');

  const stockResult = await db.query(
    `SELECT sl.*, w.name AS warehouse_name,
            COALESCE(pws.reorder_level, p.reorder_level) AS effective_reorder_level
     FROM stock_levels sl
     JOIN warehouses w ON w.id = sl.warehouse_id
     JOIN products p ON p.id = sl.product_id
     LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
     WHERE sl.product_id = $1
     ORDER BY w.name`,
    [id]
  );

  let batches = [];
  if (productResult.rows[0].is_batch_tracked) {
    const batchResult = await db.query(
      `SELECT sb.*, w.name AS warehouse_name FROM stock_batches sb
       JOIN warehouses w ON w.id = sb.warehouse_id
       WHERE sb.product_id = $1 AND sb.quantity_remaining > 0
       ORDER BY sb.expiry_date ASC NULLS LAST, sb.received_date ASC`,
      [id]
    );
    batches = batchResult.rows;
  }

  res.json({ ...productResult.rows[0], stockByWarehouse: stockResult.rows, batches });
});

const createProduct = asyncHandler(async (req, res) => {
  const {
    sku, barcode, name, description, categoryId, brandId, uomId,
    costPrice, sellingPrice, isBatchTracked, isExpiryTracked, reorderLevel, reorderQuantity, productType,
  } = req.body;
  if (!sku || !name) throw new ApiError(400, 'sku and name are required');
  const validTypes = ['trading', 'raw_material', 'finished_good'];
  if (productType && !validTypes.includes(productType)) throw new ApiError(400, `productType must be one of: ${validTypes.join(', ')}`);

  const existing = await db.query('SELECT id FROM products WHERE company_id = $1 AND sku = $2', [req.user.companyId, sku]);
  if (existing.rows.length) throw new ApiError(409, 'A product with this SKU already exists');

  // Falls back to this company's configured defaults (Inventory & Warehouse
  // → Settings) rather than a hardcoded 0, so a newly-created product isn't
  // silently invisible to the Low Stock report until someone remembers to
  // set a threshold for it.
  const settings = await inventorySettingsService.getSettings(db, req.user.companyId);

  const { rows } = await db.query(
    `INSERT INTO products
       (company_id, sku, barcode, name, description, category_id, brand_id, uom_id,
        cost_price, selling_price, is_batch_tracked, is_expiry_tracked, reorder_level, reorder_quantity, product_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      req.user.companyId, sku, barcode || null, name, description || null, categoryId || null, brandId || null, uomId || null,
      costPrice || 0, sellingPrice || 0, !!isBatchTracked, !!isExpiryTracked,
      reorderLevel != null ? reorderLevel : settings.default_reorder_level,
      reorderQuantity != null ? reorderQuantity : settings.default_reorder_quantity,
      productType || 'trading',
    ]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'product', entityId: rows[0].id, newValues: { sku, name }, ip: req.ip });
  res.status(201).json(rows[0]);
});

const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name, description, categoryId, brandId, uomId, barcode,
    costPrice, sellingPrice, reorderLevel, reorderQuantity, isActive, productType,
  } = req.body;
  const validTypes = ['trading', 'raw_material', 'finished_good'];
  if (productType && !validTypes.includes(productType)) throw new ApiError(400, `productType must be one of: ${validTypes.join(', ')}`);

  const existing = await db.query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!existing.rows.length) throw new ApiError(404, 'Product not found');

  // is_batch_tracked / is_expiry_tracked are intentionally not editable after
  // creation, since flipping them mid-stream would orphan existing stock_levels
  // vs stock_batches accounting.
  const { rows } = await db.query(
    `UPDATE products SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       category_id = COALESCE($3, category_id), brand_id = COALESCE($4, brand_id),
       uom_id = COALESCE($5, uom_id), barcode = COALESCE($6, barcode),
       cost_price = COALESCE($7, cost_price), selling_price = COALESCE($8, selling_price),
       reorder_level = COALESCE($9, reorder_level), reorder_quantity = COALESCE($10, reorder_quantity),
       is_active = COALESCE($11, is_active), product_type = COALESCE($12, product_type), updated_at = NOW()
     WHERE id = $13 RETURNING *`,
    [name, description, categoryId, brandId, uomId, barcode, costPrice, sellingPrice, reorderLevel, reorderQuantity, isActive, productType, id]
  );

  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'product', entityId: id, newValues: req.body, ip: req.ip });
  res.json(rows[0]);
});

// PATCH /products/:id/warehouse-settings/:warehouseId — per-warehouse reorder overrides
const setWarehouseSettings = asyncHandler(async (req, res) => {
  const { id, warehouseId } = req.params;
  const { reorderLevel, reorderQuantity } = req.body;

  const { rows } = await db.query(
    `INSERT INTO product_warehouse_settings (product_id, warehouse_id, reorder_level, reorder_quantity)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, warehouse_id)
     DO UPDATE SET reorder_level = EXCLUDED.reorder_level, reorder_quantity = EXCLUDED.reorder_quantity
     RETURNING *`,
    [id, warehouseId, reorderLevel ?? null, reorderQuantity ?? null]
  );
  res.json(rows[0]);
});

module.exports = { listProducts, getProduct, createProduct, updateProduct, setWarehouseSettings };

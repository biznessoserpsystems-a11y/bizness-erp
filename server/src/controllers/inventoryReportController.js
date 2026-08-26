const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendExport } = require('../services/exportService');

// GET /inventory-reports/low-stock
const lowStockReport = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name, w.id AS warehouse_id, w.name AS warehouse_name,
            sl.quantity, COALESCE(pws.reorder_level, p.reorder_level) AS reorder_level,
            COALESCE(pws.reorder_quantity, p.reorder_quantity) AS reorder_quantity,
            u.symbol AS uom_symbol
     FROM stock_levels sl
     JOIN products p ON p.id = sl.product_id
     JOIN warehouses w ON w.id = sl.warehouse_id
     LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE p.company_id = $1 AND p.is_active = TRUE
       AND sl.quantity <= COALESCE(pws.reorder_level, p.reorder_level)
     ORDER BY (sl.quantity - COALESCE(pws.reorder_level, p.reorder_level)) ASC`,
    [req.user.companyId]
  );

  if (req.query.format) {
    return sendExport(res, req.query.format, 'low-stock', {
      title: 'Low Stock Report',
      subtitle: `As of ${new Date().toLocaleDateString()}`,
      columns: [
        { key: 'sku', label: 'SKU', width: 1.2 },
        { key: 'name', label: 'Product', width: 1.6 },
        { key: 'warehouse_name', label: 'Warehouse' },
        { key: 'quantity', label: 'Quantity', format: 'number', align: 'right' },
        { key: 'reorder_level', label: 'Reorder Level', format: 'number', align: 'right' },
        { key: 'reorder_quantity', label: 'Reorder Qty', format: 'number', align: 'right' },
      ],
      rows,
    });
  }
  res.json(rows);
});

// GET /inventory-reports/valuation?warehouseId=
const valuationReport = asyncHandler(async (req, res) => {
  const { warehouseId } = req.query;
  const params = [req.user.companyId];
  let filter = '';
  if (warehouseId) { params.push(warehouseId); filter = `AND sl.warehouse_id = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name, w.id AS warehouse_id, w.name AS warehouse_name,
            sl.quantity, sl.average_cost, (sl.quantity * sl.average_cost) AS stock_value,
            u.symbol AS uom_symbol
     FROM stock_levels sl
     JOIN products p ON p.id = sl.product_id
     JOIN warehouses w ON w.id = sl.warehouse_id
     LEFT JOIN units_of_measure u ON u.id = p.uom_id
     WHERE p.company_id = $1 AND sl.quantity > 0 ${filter}
     ORDER BY stock_value DESC`,
    params
  );

  const totalValue = rows.reduce((sum, r) => sum + Number(r.stock_value), 0);

  if (req.query.format) {
    return sendExport(res, req.query.format, 'stock-valuation', {
      title: 'Stock Valuation Report',
      subtitle: `Total value: ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      columns: [
        { key: 'sku', label: 'SKU', width: 1.2 },
        { key: 'name', label: 'Product', width: 1.6 },
        { key: 'warehouse_name', label: 'Warehouse' },
        { key: 'quantity', label: 'Quantity', format: 'number', align: 'right' },
        { key: 'average_cost', label: 'Avg Cost', format: 'currency', align: 'right' },
        { key: 'stock_value', label: 'Stock Value', format: 'currency', align: 'right' },
      ],
      rows,
    });
  }
  res.json({ totalValue, lines: rows });
});

// GET /inventory-reports/expiry?withinDays=30
const expiryReport = asyncHandler(async (req, res) => {
  const { withinDays = 30 } = req.query;
  const { rows } = await db.query(
    `SELECT sb.*, p.name AS product_name, p.sku, w.name AS warehouse_name,
            (sb.expiry_date - CURRENT_DATE) AS days_until_expiry
     FROM stock_batches sb
     JOIN products p ON p.id = sb.product_id
     JOIN warehouses w ON w.id = sb.warehouse_id
     WHERE p.company_id = $1 AND sb.quantity_remaining > 0 AND sb.expiry_date IS NOT NULL
       AND sb.expiry_date <= CURRENT_DATE + $2::int
     ORDER BY sb.expiry_date ASC`,
    [req.user.companyId, parseInt(withinDays, 10) || 30]
  );

  if (req.query.format) {
    return sendExport(res, req.query.format, 'stock-expiry', {
      title: 'Stock Expiry Report',
      subtitle: `Expiring within ${withinDays} days`,
      columns: [
        { key: 'sku', label: 'SKU', width: 1.2 },
        { key: 'product_name', label: 'Product', width: 1.6 },
        { key: 'warehouse_name', label: 'Warehouse' },
        { key: 'batch_no', label: 'Batch #' },
        { key: 'quantity_remaining', label: 'Qty Remaining', format: 'number', align: 'right' },
        { key: 'expiry_date', label: 'Expiry Date', format: 'date' },
        { key: 'days_until_expiry', label: 'Days Left', format: 'number', align: 'right' },
      ],
      rows,
    });
  }
  res.json(rows);
});

module.exports = { lowStockReport, valuationReport, expiryReport };

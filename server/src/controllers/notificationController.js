const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /notifications — the current user's own feed. No permission gate: like your inbox,
// it's scoped to you by user_id regardless of role.
const listNotifications = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE company_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 100`,
    [req.user.companyId, req.user.id]
  );
  const unreadCount = rows.filter((n) => !n.is_read).length;
  res.json({ notifications: rows, unreadCount });
});

// PATCH /notifications/:id/read
const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 AND company_id = $3 RETURNING *`,
    [id, req.user.id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Notification not found');
  res.json(rows[0]);
});

// POST /notifications/mark-all-read
const markAllRead = asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND company_id = $2 AND is_read = FALSE`,
    [req.user.id, req.user.companyId]
  );
  res.json({ message: 'All notifications marked as read' });
});

// GET /notifications/alerts — live-computed operational alerts (not persisted; always
// reflects current data). Each section is only computed if the user holds the permission
// that already gates the underlying list, so this never leaks figures someone can't
// otherwise see via the Invoices/Purchase Invoices/Inventory Reports pages themselves.
const getAlerts = asyncHandler(async (req, res) => {
  const perms = req.user.permissions || [];
  const alerts = { overdueSalesInvoices: [], overduePurchaseInvoices: [], lowStock: [] };

  if (perms.includes('sales.invoices.manage')) {
    const { rows } = await db.query(
      `SELECT si.id, si.invoice_no, si.due_date, si.total_amount,
              (si.total_amount - si.amount_paid - si.amount_credited) AS balance,
              c.name AS customer_name
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE si.company_id = $1 AND si.status NOT IN ('paid', 'void') AND si.due_date < CURRENT_DATE
       ORDER BY si.due_date ASC LIMIT 50`,
      [req.user.companyId]
    );
    alerts.overdueSalesInvoices = rows;
  }

  if (perms.includes('procurement.invoices.manage')) {
    const { rows } = await db.query(
      `SELECT pi.id, pi.invoice_no, pi.due_date, pi.total_amount,
              (pi.total_amount - pi.amount_paid - pi.amount_credited) AS balance,
              s.name AS supplier_name
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.company_id = $1 AND pi.status NOT IN ('paid', 'void') AND pi.due_date < CURRENT_DATE
       ORDER BY pi.due_date ASC LIMIT 50`,
      [req.user.companyId]
    );
    alerts.overduePurchaseInvoices = rows;
  }

  if (perms.includes('inventory.reports.view')) {
    // Same query as inventoryReportController's low-stock report, kept in sync deliberately.
    const { rows } = await db.query(
      `SELECT p.id AS product_id, p.sku, p.name, w.id AS warehouse_id, w.name AS warehouse_name,
              sl.quantity, COALESCE(pws.reorder_level, p.reorder_level) AS reorder_level,
              u.symbol AS uom_symbol
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       JOIN warehouses w ON w.id = sl.warehouse_id
       LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
       LEFT JOIN units_of_measure u ON u.id = p.uom_id
       WHERE p.company_id = $1 AND p.is_active = TRUE
         AND sl.quantity <= COALESCE(pws.reorder_level, p.reorder_level)
       ORDER BY (sl.quantity - COALESCE(pws.reorder_level, p.reorder_level)) ASC LIMIT 50`,
      [req.user.companyId]
    );
    alerts.lowStock = rows;
  }

  res.json(alerts);
});

module.exports = { listNotifications, markRead, markAllRead, getAlerts };

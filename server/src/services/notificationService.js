const db = require('../config/db');

// ============================================================
// Part 1: Thin helpers for writing to the notifications table
// ============================================================
// (used by requisition approval events, announcement fan-out, etc.)
// All three helpers take a `client` so they can be called inside an
// existing transaction.

async function notifyUser(client, { companyId, userId, type, title, body, link, referenceType, referenceId, createdBy }) {
  await client.query(
    `INSERT INTO notifications (company_id, user_id, type, title, body, link, reference_type, reference_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [companyId, userId, type, title, body || null, link || null, referenceType || null, referenceId || null, createdBy || null]
  );
}

// Notifies every active user in the company who holds `permissionCode` through any role.
async function notifyUsersWithPermission(client, { companyId, permissionCode, type, title, body, link, referenceType, referenceId, createdBy, excludeUserId }) {
  const { rows } = await client.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.company_id = $1 AND u.is_active = TRUE AND p.code = $2 AND u.id != COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [companyId, permissionCode, excludeUserId || null]
  );
  for (const row of rows) {
    await notifyUser(client, { companyId, userId: row.id, type, title, body, link, referenceType, referenceId, createdBy });
  }
  return rows.length;
}

// Notifies every active user in the company (used for announcement fan-out).
async function notifyAllActiveUsers(client, { companyId, excludeUserId, type, title, body, link, referenceType, referenceId, createdBy }) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE company_id = $1 AND is_active = TRUE AND id != COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [companyId, excludeUserId || null]
  );
  for (const row of rows) {
    await notifyUser(client, { companyId, userId: row.id, type, title, body, link, referenceType, referenceId, createdBy });
  }
  return rows.length;
}

// ============================================================
// Part 2: Background notification scanner
// ============================================================
// Scans for standing issues and keeps the `notifications` table in sync:
//   1. low_stock              — stock_levels at/under reorder level
//   2. sales_invoice_overdue  — customer invoices past due_date with a balance owing
//   3. purchase_invoice_overdue — supplier bills past due_date with a balance owing
//   4. crm_followup_overdue   — CRM activities with a past-due due_date that aren't done
//
// Each issue has a stable dedupe_key. Re-running the scan:
//   - inserts a fresh notification for a newly-detected issue,
//   - refreshes the message on an already-active notification for the same issue
//     (without resetting is_read),
//   - auto-resolves (marks read + resolved_at) any active notification whose issue
//     no longer matches.
//
// Scanner rows are company-scoped (user_id IS NULL); personal notification
// rows (user_id NOT NULL) written by Part 1 are untouched.

async function upsertActive(client, companyId, { type, severity, title, message, relatedEntityType, relatedEntityId, dedupeKey }) {
  await client.query(
    `INSERT INTO notifications
       (company_id, type, severity, title, message, related_entity_type, related_entity_id, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (company_id, dedupe_key) WHERE resolved_at IS NULL
     DO UPDATE SET message = EXCLUDED.message, severity = EXCLUDED.severity, updated_at = NOW()`,
    [companyId, type, severity, title, message, relatedEntityType, relatedEntityId, dedupeKey]
  );
}

async function resolveStale(client, companyId, type, activeDedupeKeys) {
  if (activeDedupeKeys.length === 0) {
    await client.query(
      `UPDATE notifications SET resolved_at = NOW(), is_read = TRUE, updated_at = NOW()
       WHERE company_id = $1 AND type = $2 AND resolved_at IS NULL`,
      [companyId, type]
    );
    return;
  }
  await client.query(
    `UPDATE notifications SET resolved_at = NOW(), is_read = TRUE, updated_at = NOW()
     WHERE company_id = $1 AND type = $2 AND resolved_at IS NULL AND dedupe_key <> ALL($3::text[])`,
    [companyId, type, activeDedupeKeys]
  );
}

async function scanLowStock(client, companyId) {
  const { rows } = await client.query(
    `SELECT sl.product_id, sl.warehouse_id, sl.quantity, p.name AS product_name, p.sku,
            w.name AS warehouse_name,
            COALESCE(pws.reorder_level, p.reorder_level) AS reorder_level
     FROM stock_levels sl
     JOIN products p ON p.id = sl.product_id
     JOIN warehouses w ON w.id = sl.warehouse_id
     LEFT JOIN product_warehouse_settings pws ON pws.product_id = sl.product_id AND pws.warehouse_id = sl.warehouse_id
     WHERE p.company_id = $1 AND w.company_id = $1 AND p.is_active = TRUE
       AND COALESCE(pws.reorder_level, p.reorder_level) > 0
       AND sl.quantity <= COALESCE(pws.reorder_level, p.reorder_level)`,
    [companyId]
  );

  const activeKeys = [];
  for (const r of rows) {
    const dedupeKey = `low_stock:${r.product_id}:${r.warehouse_id}`;
    activeKeys.push(dedupeKey);
    const severity = Number(r.quantity) <= 0 ? 'critical' : 'warning';
    await upsertActive(client, companyId, {
      type: 'low_stock',
      severity,
      title: `Low stock: ${r.product_name}`,
      message: `${r.product_name} (${r.sku}) at ${r.warehouse_name} is at ${Number(r.quantity)} units — at or below the reorder level of ${Number(r.reorder_level)}.`,
      relatedEntityType: 'product',
      relatedEntityId: r.product_id,
      dedupeKey,
    });
  }
  await resolveStale(client, companyId, 'low_stock', activeKeys);
}

async function scanSalesInvoicesOverdue(client, companyId) {
  const { rows } = await client.query(
    `SELECT si.id, si.invoice_no, si.due_date, si.total_amount, si.amount_paid, si.amount_credited,
            c.name AS customer_name,
            (si.total_amount - si.amount_paid - si.amount_credited) AS balance,
            (CURRENT_DATE - si.due_date) AS days_overdue
     FROM sales_invoices si
     JOIN customers c ON c.id = si.customer_id
     WHERE si.company_id = $1 AND si.status NOT IN ('paid', 'void', 'draft')
       AND si.due_date IS NOT NULL AND si.due_date < CURRENT_DATE
       AND (si.total_amount - si.amount_paid - si.amount_credited) > 0.001`,
    [companyId]
  );

  const activeKeys = [];
  for (const r of rows) {
    const dedupeKey = `sales_invoice_overdue:${r.id}`;
    activeKeys.push(dedupeKey);
    const severity = r.days_overdue > 30 ? 'critical' : 'warning';
    await upsertActive(client, companyId, {
      type: 'sales_invoice_overdue',
      severity,
      title: `Overdue invoice: ${r.invoice_no}`,
      message: `Invoice ${r.invoice_no} for ${r.customer_name} is ${r.days_overdue} day(s) overdue, GHS ${Number(r.balance).toFixed(2)} outstanding.`,
      relatedEntityType: 'sales_invoice',
      relatedEntityId: r.id,
      dedupeKey,
    });
  }
  await resolveStale(client, companyId, 'sales_invoice_overdue', activeKeys);
}

async function scanPurchaseInvoicesOverdue(client, companyId) {
  const { rows } = await client.query(
    `SELECT pi.id, pi.invoice_no, pi.due_date, pi.total_amount, pi.amount_paid, pi.amount_credited,
            s.name AS supplier_name,
            (pi.total_amount - pi.amount_paid - pi.amount_credited) AS balance,
            (CURRENT_DATE - pi.due_date) AS days_overdue
     FROM purchase_invoices pi
     JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.company_id = $1 AND pi.status NOT IN ('paid', 'void', 'draft')
       AND pi.due_date IS NOT NULL AND pi.due_date < CURRENT_DATE
       AND (pi.total_amount - pi.amount_paid - pi.amount_credited) > 0.001`,
    [companyId]
  );

  const activeKeys = [];
  for (const r of rows) {
    const dedupeKey = `purchase_invoice_overdue:${r.id}`;
    activeKeys.push(dedupeKey);
    const severity = r.days_overdue > 30 ? 'critical' : 'warning';
    await upsertActive(client, companyId, {
      type: 'purchase_invoice_overdue',
      severity,
      title: `Overdue bill: ${r.invoice_no}`,
      message: `Bill ${r.invoice_no} from ${r.supplier_name} is ${r.days_overdue} day(s) overdue, GHS ${Number(r.balance).toFixed(2)} owed.`,
      relatedEntityType: 'purchase_invoice',
      relatedEntityId: r.id,
      dedupeKey,
    });
  }
  await resolveStale(client, companyId, 'purchase_invoice_overdue', activeKeys);
}

async function scanCrmFollowupsOverdue(client, companyId) {
  const { rows } = await client.query(
    `SELECT a.id, a.subject, a.related_type, a.related_id, a.due_date,
            (CURRENT_DATE - a.due_date) AS days_overdue,
            COALESCE(c.name, l.name) AS related_name
     FROM crm_activities a
     LEFT JOIN customers c ON c.id = a.related_id AND a.related_type = 'customer'
     LEFT JOIN leads l ON l.id = a.related_id AND a.related_type = 'lead'
     WHERE a.company_id = $1 AND a.is_done = FALSE
       AND a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE`,
    [companyId]
  );

  const activeKeys = [];
  for (const r of rows) {
    const dedupeKey = `crm_followup_overdue:${r.id}`;
    activeKeys.push(dedupeKey);
    const severity = r.days_overdue > 7 ? 'critical' : 'warning';
    await upsertActive(client, companyId, {
      type: 'crm_followup_overdue',
      severity,
      title: `Overdue follow-up: ${r.subject}`,
      message: `"${r.subject}" for ${r.related_name || 'a contact'} was due ${r.days_overdue} day(s) ago.`,
      relatedEntityType: r.related_type,
      relatedEntityId: r.related_id,
      dedupeKey,
    });
  }
  await resolveStale(client, companyId, 'crm_followup_overdue', activeKeys);
}

async function scanCompany(companyId) {
  const client = await db.getClient();
  try {
    await scanLowStock(client, companyId);
    await scanSalesInvoicesOverdue(client, companyId);
    await scanPurchaseInvoicesOverdue(client, companyId);
    await scanCrmFollowupsOverdue(client, companyId);
  } finally {
    client.release();
  }
}

async function scanAllCompanies() {
  const { rows } = await db.query(`SELECT id FROM companies WHERE is_active = TRUE`);
  for (const { id } of rows) {
    try {
      await scanCompany(id);
    } catch (err) {
      console.error(`Notification scan failed for company ${id}:`, err.message);
    }
  }
}

/** Starts a recurring background scan. Call once from server.js. */
function startBackgroundScanner(intervalMs = 15 * 60 * 1000) {
  setTimeout(() => scanAllCompanies().catch((err) => console.error('Notification scan error:', err.message)), 5000);
  setInterval(() => scanAllCompanies().catch((err) => console.error('Notification scan error:', err.message)), intervalMs);
}

module.exports = {
  notifyUser,
  notifyUsersWithPermission,
  notifyAllActiveUsers,
  scanLowStock,
  scanSalesInvoicesOverdue,
  scanPurchaseInvoicesOverdue,
  scanCrmFollowupsOverdue,
  scanCompany,
  scanAllCompanies,
  startBackgroundScanner,
};

/**
 * A real in-memory fake of the notifications table plus the source
 * tables each scan reads from, matching exact query text the same way
 * stockService.test.js does. Genuinely implements the upsert/resolve
 * dedupe semantics (partial unique index on (company_id, dedupe_key)
 * WHERE resolved_at IS NULL) rather than mocking a return value, so the
 * full lifecycle — an issue appears, persists, then disappears — is
 * actually exercised end to end.
 */
function createMockDb() {
  const state = {
    notifications: [], // {company_id, type, severity, title, message, dedupe_key, resolved_at, is_read}
    stockLevels: [], products: [], warehouses: [], productWarehouseSettings: [],
    salesInvoices: [], customers: [],
    purchaseInvoices: [], suppliers: [],
    crmActivities: [], leads: [],
  };

  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

  const query = jest.fn(async (sql, params = []) => {
    const s = norm(sql);

    if (s.startsWith('INSERT INTO notifications (company_id, type, severity, title, message, related_entity_type, related_entity_id, dedupe_key)')) {
      const [companyId, type, severity, title, message, relatedEntityType, relatedEntityId, dedupeKey] = params;
      const existing = state.notifications.find((n) => n.company_id === companyId && n.dedupe_key === dedupeKey && n.resolved_at === null);
      if (existing) {
        existing.message = message;
        existing.severity = severity;
      } else {
        state.notifications.push({
          company_id: companyId, type, severity, title, message,
          related_entity_type: relatedEntityType, related_entity_id: relatedEntityId,
          dedupe_key: dedupeKey, resolved_at: null, is_read: false,
        });
      }
      return { rows: [] };
    }

    if (s.startsWith('UPDATE notifications SET resolved_at = NOW(), is_read = TRUE, updated_at = NOW() WHERE company_id = $1 AND type = $2 AND resolved_at IS NULL AND dedupe_key <> ALL')) {
      const [companyId, type, activeKeys] = params;
      state.notifications.forEach((n) => {
        if (n.company_id === companyId && n.type === type && n.resolved_at === null && !activeKeys.includes(n.dedupe_key)) {
          n.resolved_at = 'resolved';
          n.is_read = true;
        }
      });
      return { rows: [] };
    }

    if (s === 'UPDATE notifications SET resolved_at = NOW(), is_read = TRUE, updated_at = NOW() WHERE company_id = $1 AND type = $2 AND resolved_at IS NULL') {
      const [companyId, type] = params;
      state.notifications.forEach((n) => {
        if (n.company_id === companyId && n.type === type && n.resolved_at === null) {
          n.resolved_at = 'resolved';
          n.is_read = true;
        }
      });
      return { rows: [] };
    }

    if (s.includes('FROM stock_levels sl')) {
      const [companyId] = params;
      const rows = state.stockLevels
        .map((sl) => {
          const p = state.products.find((x) => x.id === sl.product_id && x.company_id === companyId && x.is_active);
          const w = state.warehouses.find((x) => x.id === sl.warehouse_id && x.company_id === companyId);
          if (!p || !w) return null;
          const pws = state.productWarehouseSettings.find((x) => x.product_id === sl.product_id && x.warehouse_id === sl.warehouse_id);
          const reorderLevel = pws?.reorder_level ?? p.reorder_level;
          if (!(reorderLevel > 0) || !(sl.quantity <= reorderLevel)) return null;
          return { product_id: sl.product_id, warehouse_id: sl.warehouse_id, quantity: sl.quantity, product_name: p.name, sku: p.sku, warehouse_name: w.name, reorder_level: reorderLevel };
        })
        .filter(Boolean);
      return { rows };
    }

    if (s.includes('FROM sales_invoices si')) {
      const [companyId] = params;
      const today = new Date().toISOString().slice(0, 10);
      const rows = state.salesInvoices
        .filter((si) => si.company_id === companyId && !['paid', 'void', 'draft'].includes(si.status) && si.due_date && si.due_date < today)
        .map((si) => {
          const c = state.customers.find((x) => x.id === si.customer_id);
          const balance = si.total_amount - si.amount_paid - si.amount_credited;
          const daysOverdue = Math.round((new Date(today) - new Date(si.due_date)) / 86400000);
          return { ...si, customer_name: c?.name, balance, days_overdue: daysOverdue };
        })
        .filter((r) => r.balance > 0.001);
      return { rows };
    }

    if (s.includes('FROM purchase_invoices pi')) {
      const [companyId] = params;
      const today = new Date().toISOString().slice(0, 10);
      const rows = state.purchaseInvoices
        .filter((pi) => pi.company_id === companyId && !['paid', 'void', 'draft'].includes(pi.status) && pi.due_date && pi.due_date < today)
        .map((pi) => {
          const sup = state.suppliers.find((x) => x.id === pi.supplier_id);
          const balance = pi.total_amount - pi.amount_paid - pi.amount_credited;
          const daysOverdue = Math.round((new Date(today) - new Date(pi.due_date)) / 86400000);
          return { ...pi, supplier_name: sup?.name, balance, days_overdue: daysOverdue };
        })
        .filter((r) => r.balance > 0.001);
      return { rows };
    }

    if (s.includes('FROM crm_activities a')) {
      const [companyId] = params;
      const today = new Date().toISOString().slice(0, 10);
      const rows = state.crmActivities
        .filter((a) => a.company_id === companyId && !a.is_done && a.due_date && a.due_date < today)
        .map((a) => {
          const c = a.related_type === 'customer' ? state.customers.find((x) => x.id === a.related_id) : null;
          const l = a.related_type === 'lead' ? state.leads.find((x) => x.id === a.related_id) : null;
          const daysOverdue = Math.round((new Date(today) - new Date(a.due_date)) / 86400000);
          return { ...a, related_name: c?.name || l?.name, days_overdue: daysOverdue };
        });
      return { rows };
    }

    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, state };
}

const {
  scanLowStock, scanSalesInvoicesOverdue, scanPurchaseInvoicesOverdue, scanCrmFollowupsOverdue,
} = require('../services/notificationService');

const COMPANY = 'co-1';

function activeOf(db, type) {
  return db.state.notifications.filter((n) => n.company_id === COMPANY && n.type === type && n.resolved_at === null);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('scanLowStock', () => {
  test('an item at or below its reorder level is flagged; one comfortably above is not', async () => {
    const db = createMockDb();
    db.state.products.push(
      { id: 'p1', company_id: COMPANY, name: 'Low Item', sku: 'LOW1', reorder_level: 10, is_active: true },
      { id: 'p2', company_id: COMPANY, name: 'Fine Item', sku: 'FINE1', reorder_level: 10, is_active: true }
    );
    db.state.warehouses.push({ id: 'w1', company_id: COMPANY, name: 'Main' });
    db.state.stockLevels.push(
      { product_id: 'p1', warehouse_id: 'w1', quantity: 5 },
      { product_id: 'p2', warehouse_id: 'w1', quantity: 50 }
    );

    await scanLowStock(db, COMPANY);
    const active = activeOf(db, 'low_stock');
    expect(active).toHaveLength(1);
    expect(active[0].related_entity_id).toBe('p1');
  });

  test('a warehouse-specific reorder level override takes precedence over the product default', async () => {
    const db = createMockDb();
    db.state.products.push({ id: 'p1', company_id: COMPANY, name: 'Item', sku: 'SKU1', reorder_level: 10, is_active: true });
    db.state.warehouses.push({ id: 'w1', company_id: COMPANY, name: 'Main' });
    db.state.productWarehouseSettings.push({ product_id: 'p1', warehouse_id: 'w1', reorder_level: 20 });
    db.state.stockLevels.push({ product_id: 'p1', warehouse_id: 'w1', quantity: 15 });

    await scanLowStock(db, COMPANY);
    expect(activeOf(db, 'low_stock')).toHaveLength(1);
  });

  test('severity is critical at exactly zero quantity, warning above zero', async () => {
    const db = createMockDb();
    db.state.products.push(
      { id: 'p1', company_id: COMPANY, name: 'Out of stock', sku: 'OUT1', reorder_level: 10, is_active: true },
      { id: 'p2', company_id: COMPANY, name: 'Low but present', sku: 'LOW2', reorder_level: 10, is_active: true }
    );
    db.state.warehouses.push({ id: 'w1', company_id: COMPANY, name: 'Main' });
    db.state.stockLevels.push(
      { product_id: 'p1', warehouse_id: 'w1', quantity: 0 },
      { product_id: 'p2', warehouse_id: 'w1', quantity: 1 }
    );

    await scanLowStock(db, COMPANY);
    const active = activeOf(db, 'low_stock');
    expect(active.find((n) => n.related_entity_id === 'p1').severity).toBe('critical');
    expect(active.find((n) => n.related_entity_id === 'p2').severity).toBe('warning');
  });

  test('restocking above the reorder level auto-resolves the notification on the next scan', async () => {
    const db = createMockDb();
    db.state.products.push({ id: 'p1', company_id: COMPANY, name: 'Item', sku: 'SKU1', reorder_level: 10, is_active: true });
    db.state.warehouses.push({ id: 'w1', company_id: COMPANY, name: 'Main' });
    const level = { product_id: 'p1', warehouse_id: 'w1', quantity: 3 };
    db.state.stockLevels.push(level);

    await scanLowStock(db, COMPANY);
    expect(activeOf(db, 'low_stock')).toHaveLength(1);

    level.quantity = 50;
    await scanLowStock(db, COMPANY);
    expect(activeOf(db, 'low_stock')).toHaveLength(0);
  });

  test('re-running the scan with the same ongoing issue does not create a duplicate notification', async () => {
    const db = createMockDb();
    db.state.products.push({ id: 'p1', company_id: COMPANY, name: 'Item', sku: 'SKU1', reorder_level: 10, is_active: true });
    db.state.warehouses.push({ id: 'w1', company_id: COMPANY, name: 'Main' });
    db.state.stockLevels.push({ product_id: 'p1', warehouse_id: 'w1', quantity: 3 });

    await scanLowStock(db, COMPANY);
    await scanLowStock(db, COMPANY);
    await scanLowStock(db, COMPANY);
    expect(db.state.notifications.filter((n) => n.dedupe_key === 'low_stock:p1:w1')).toHaveLength(1);
  });
});

describe('scanSalesInvoicesOverdue', () => {
  test('severity is warning at exactly 30 days overdue, critical at 31', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme' });
    db.state.salesInvoices.push(
      { id: 'inv1', company_id: COMPANY, invoice_no: 'INV-1', customer_id: 'c1', status: 'sent', due_date: daysAgo(30), total_amount: 100, amount_paid: 0, amount_credited: 0 },
      { id: 'inv2', company_id: COMPANY, invoice_no: 'INV-2', customer_id: 'c1', status: 'sent', due_date: daysAgo(31), total_amount: 100, amount_paid: 0, amount_credited: 0 }
    );

    await scanSalesInvoicesOverdue(db, COMPANY);
    const active = activeOf(db, 'sales_invoice_overdue');
    expect(active.find((n) => n.related_entity_id === 'inv1').severity).toBe('warning');
    expect(active.find((n) => n.related_entity_id === 'inv2').severity).toBe('critical');
  });

  test('an invoice due today is not yet overdue', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme' });
    db.state.salesInvoices.push({ id: 'inv1', company_id: COMPANY, invoice_no: 'INV-1', customer_id: 'c1', status: 'sent', due_date: new Date().toISOString().slice(0, 10), total_amount: 100, amount_paid: 0, amount_credited: 0 });

    await scanSalesInvoicesOverdue(db, COMPANY);
    expect(activeOf(db, 'sales_invoice_overdue')).toHaveLength(0);
  });

  test('a fully paid invoice past its due date is not flagged as overdue', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme' });
    db.state.salesInvoices.push({ id: 'inv1', company_id: COMPANY, invoice_no: 'INV-1', customer_id: 'c1', status: 'sent', due_date: daysAgo(10), total_amount: 100, amount_paid: 100, amount_credited: 0 });

    await scanSalesInvoicesOverdue(db, COMPANY);
    expect(activeOf(db, 'sales_invoice_overdue')).toHaveLength(0);
  });

  test('paying off an overdue invoice auto-resolves its notification on the next scan', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme' });
    const invoice = { id: 'inv1', company_id: COMPANY, invoice_no: 'INV-1', customer_id: 'c1', status: 'sent', due_date: daysAgo(10), total_amount: 100, amount_paid: 0, amount_credited: 0 };
    db.state.salesInvoices.push(invoice);

    await scanSalesInvoicesOverdue(db, COMPANY);
    expect(activeOf(db, 'sales_invoice_overdue')).toHaveLength(1);

    invoice.amount_paid = 100;
    await scanSalesInvoicesOverdue(db, COMPANY);
    expect(activeOf(db, 'sales_invoice_overdue')).toHaveLength(0);
  });
});

describe('scanPurchaseInvoicesOverdue', () => {
  test('severity is warning at exactly 30 days, critical at 31', async () => {
    const db = createMockDb();
    db.state.suppliers.push({ id: 's1', name: 'Global Supplies' });
    db.state.purchaseInvoices.push(
      { id: 'pinv1', company_id: COMPANY, invoice_no: 'PINV-1', supplier_id: 's1', status: 'received', due_date: daysAgo(30), total_amount: 500, amount_paid: 0, amount_credited: 0 },
      { id: 'pinv2', company_id: COMPANY, invoice_no: 'PINV-2', supplier_id: 's1', status: 'received', due_date: daysAgo(31), total_amount: 500, amount_paid: 0, amount_credited: 0 }
    );

    await scanPurchaseInvoicesOverdue(db, COMPANY);
    const active = activeOf(db, 'purchase_invoice_overdue');
    expect(active.find((n) => n.related_entity_id === 'pinv1').severity).toBe('warning');
    expect(active.find((n) => n.related_entity_id === 'pinv2').severity).toBe('critical');
  });
});

describe('scanCrmFollowupsOverdue', () => {
  test('severity is warning at exactly 7 days overdue, critical at 8', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme' });
    db.state.crmActivities.push(
      { id: 'act1', company_id: COMPANY, subject: 'Call back', related_type: 'customer', related_id: 'c1', is_done: false, due_date: daysAgo(7) },
      { id: 'act2', company_id: COMPANY, subject: 'Follow up', related_type: 'customer', related_id: 'c1', is_done: false, due_date: daysAgo(8) }
    );

    await scanCrmFollowupsOverdue(db, COMPANY);
    const active = activeOf(db, 'crm_followup_overdue');
    expect(active.find((n) => n.dedupe_key === 'crm_followup_overdue:act1').severity).toBe('warning');
    expect(active.find((n) => n.dedupe_key === 'crm_followup_overdue:act2').severity).toBe('critical');
  });

  test('a completed activity is never flagged, even with a long-past due date', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme' });
    db.state.crmActivities.push({ id: 'act1', company_id: COMPANY, subject: 'Old task', related_type: 'customer', related_id: 'c1', is_done: true, due_date: daysAgo(100) });

    await scanCrmFollowupsOverdue(db, COMPANY);
    expect(activeOf(db, 'crm_followup_overdue')).toHaveLength(0);
  });

  test('resolves correctly whether the activity relates to a customer or a lead', async () => {
    const db = createMockDb();
    db.state.customers.push({ id: 'c1', name: 'Acme Ltd' });
    db.state.leads.push({ id: 'l1', name: 'Prospective Co' });
    db.state.crmActivities.push(
      { id: 'act1', company_id: COMPANY, subject: 'Customer follow-up', related_type: 'customer', related_id: 'c1', is_done: false, due_date: daysAgo(5) },
      { id: 'act2', company_id: COMPANY, subject: 'Lead follow-up', related_type: 'lead', related_id: 'l1', is_done: false, due_date: daysAgo(5) }
    );

    await scanCrmFollowupsOverdue(db, COMPANY);
    const active = activeOf(db, 'crm_followup_overdue');
    expect(active.find((n) => n.related_entity_id === 'c1').message).toContain('Acme Ltd');
    expect(active.find((n) => n.related_entity_id === 'l1').message).toContain('Prospective Co');
  });
});

/**
 * Demo data seeder.
 *
 * Populates a demo company with sample products, customers, suppliers,
 * sales orders, invoices, a payment, and a purchase invoice — so the
 * dashboards and reports have something real to show instead of empty
 * tables.
 *
 * This talks to the REAL API over HTTP (not the database directly), so it
 * reuses all the same business logic (stock costing, GL posting, doc
 * numbering) that the app itself uses. That means the server MUST be
 * running before you execute this script.
 *
 * Usage:
 *   1. In one terminal: npm run dev   (starts the API on :5000)
 *   2. In another:       npm run seed:demo
 */

const BASE_URL = process.env.SEED_API_URL || 'http://localhost:5000/api';
// Registration now requires a license token, and issuing one is
// deliberately not an HTTP-exposed operation (see
// scripts/generateLicenseToken.js) - the one exception to this
// script's own "talk to the real API over HTTP" rule, since there's no
// API for this by design and a token has to come from somewhere before
// the very first registration call can even be attempted.
const db = require('../config/db');
const { generateLicenseTokenString } = require('../utils/licenseToken');

const DEMO = {
  companyName: 'Kwame Traders',
  firstName: 'Kwame',
  lastName: 'Admin',
  email: 'kwame@kwametraders.com',
  password: 'StrongPass123',
  // Registration requires this field, but the demo company's real,
  // persisted value has always been left empty (NULL) since this field
  // became mandatory — several features (the sidebar's Nature-of-
  // Business module filtering in particular) were deliberately built
  // and tested against that empty-value case, since a real company
  // predating the mandatory requirement needs to keep working
  // correctly. Whoever runs this script fresh should clear it back to
  // NULL afterward if they want that same test condition:
  //   UPDATE companies SET nature_of_business = NULL WHERE name = 'Kwame Traders';
  natureOfBusiness: 'Trading & Distribution',
};

async function request(method, path, body, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const err = new Error(data?.error || `${method} ${path} failed with ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function ensureDemoAccount() {
  try {
    DEMO.licenseToken = await generateDemoLicenseToken();
    await request('POST', '/auth/register-company', DEMO);
    console.log(`✔ Registered demo company "${DEMO.companyName}"`);
  } catch (err) {
    if (err.status === 409) {
      console.log(`↺ Demo account already exists — logging in instead`);
    } else {
      throw err;
    }
  }

  const login = await request('POST', '/auth/login', { email: DEMO.email, password: DEMO.password });
  if (login.mfaRequired) {
    throw new Error('Demo account has MFA enabled — disable it or log in manually to seed data.');
  }
  console.log(`✔ Logged in as ${DEMO.email}`);
  return login.accessToken;
}

async function generateDemoLicenseToken() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateLicenseTokenString();
    try {
      await db.query('INSERT INTO license_tokens (token) VALUES ($1)', [candidate]);
      return candidate;
    } catch (err) {
      if (err.code !== '23505' || attempt === 4) throw err; // 23505 = unique_violation, retry on the astronomically unlikely collision
    }
  }
}

async function main() {
  const token = await ensureDemoAccount();
  const api = (method, path, body) => request(method, path, body, token);

  // --- Catalog basics ---
  const uom = await api('POST', '/uom', { name: 'Pieces', symbol: 'pcs' });
  const brand = await api('POST', '/brands', { name: 'Generic', description: 'Generic house brand' });
  const category = await api('POST', '/product-categories', { name: 'General Goods', description: 'Miscellaneous products' });
  console.log('✔ Catalog basics created (UoM, brand, category)');

  // --- Warehouse ---
  const warehouse = await api('POST', '/warehouses', { name: 'Main Warehouse', code: 'WH1', location: 'Accra' });
  console.log('✔ Warehouse created');

  // --- Products ---
  const productDefs = [
    { sku: 'SKU-001', name: 'Office Chair', costPrice: 250, sellingPrice: 400, reorderLevel: 5 },
    { sku: 'SKU-002', name: 'Office Desk', costPrice: 500, sellingPrice: 800, reorderLevel: 3 },
    { sku: 'SKU-003', name: 'Wireless Mouse', costPrice: 30, sellingPrice: 60, reorderLevel: 20 },
    { sku: 'SKU-004', name: 'Mechanical Keyboard', costPrice: 80, sellingPrice: 150, reorderLevel: 15 },
    { sku: 'SKU-005', name: '24" Monitor', costPrice: 400, sellingPrice: 650, reorderLevel: 8 },
  ];
  const products = [];
  for (const p of productDefs) {
    const product = await api('POST', '/products', {
      ...p,
      categoryId: category.id,
      brandId: brand.id,
      uomId: uom.id,
      reorderQuantity: p.reorderLevel * 2,
    });
    products.push(product);
  }
  console.log(`✔ ${products.length} products created`);

  // --- Opening stock ---
  for (const product of products) {
    await api('POST', '/stock/in', {
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: 50,
      unitCost: product.cost_price,
      reason: 'Opening stock (demo seed)',
    });
  }
  console.log('✔ Opening stock received into Main Warehouse');

  // --- Customers ---
  const customerDefs = [
    { customerCode: 'CUST-001', name: 'Kofi Traders Ltd', email: 'kofi@example.com', paymentTermsDays: 30 },
    { customerCode: 'CUST-002', name: 'Ama Retail Group', email: 'ama@example.com', paymentTermsDays: 15 },
    { customerCode: 'CUST-003', name: 'Nana Enterprises', email: 'nana@example.com', paymentTermsDays: 0 },
  ];
  const customers = [];
  for (const c of customerDefs) customers.push(await api('POST', '/customers', c));
  console.log(`✔ ${customers.length} customers created`);

  // --- Suppliers ---
  const supplierDefs = [
    { supplierCode: 'SUP-001', name: 'Global Furniture Supplies', email: 'sales@globalfurniture.example', paymentTermsDays: 30 },
    { supplierCode: 'SUP-002', name: 'TechParts Wholesale', email: 'orders@techparts.example', paymentTermsDays: 30 },
  ];
  const suppliers = [];
  for (const s of supplierDefs) suppliers.push(await api('POST', '/suppliers', s));
  console.log(`✔ ${suppliers.length} suppliers created`);

  // --- Sales orders + invoices ---
  const invoices = [];
  const orderPlans = [
    { customer: customers[0], lines: [{ product: products[0], qty: 4 }, { product: products[2], qty: 10 }] },
    { customer: customers[1], lines: [{ product: products[1], qty: 2 }, { product: products[4], qty: 3 }] },
    { customer: customers[2], lines: [{ product: products[3], qty: 6 }] },
  ];
  for (const plan of orderPlans) {
    const lines = plan.lines.map((l) => ({
      productId: l.product.id,
      quantity: l.qty,
      unitPrice: l.product.selling_price,
      taxPercent: 0,
    }));
    const order = await api('POST', '/sales-orders', { customerId: plan.customer.id, warehouseId: warehouse.id, lines });
    const invoice = await api('POST', '/invoices', { customerId: plan.customer.id, salesOrderId: order.id, lines });
    invoices.push(invoice);
  }
  console.log(`✔ ${orderPlans.length} sales orders + invoices created`);

  // --- Payment against the first invoice (partial) ---
  const firstInvoice = invoices[0];
  const partialAmount = Number(firstInvoice.total_amount) * 0.6;
  await api('POST', '/payments', {
    customerId: orderPlans[0].customer.id,
    amount: partialAmount,
    paymentMethod: 'bank_transfer',
    reference: 'Demo partial payment',
    allocations: [{ salesInvoiceId: firstInvoice.id, amount: partialAmount }],
  });
  console.log('✔ Partial payment recorded against first invoice');

  // --- Purchase invoice (expense/AP side) ---
  const purchaseInvoice = await api('POST', '/purchase-invoices', {
    supplierId: suppliers[0].id,
    supplierInvoiceNo: 'SUPINV-1001',
    lines: [
      { productId: products[0].id, quantity: 10, unitPrice: products[0].cost_price, taxPercent: 0 },
      { productId: products[1].id, quantity: 5, unitPrice: products[1].cost_price, taxPercent: 0 },
    ],
  });
  console.log(`✔ Purchase invoice ${purchaseInvoice.invoice_no} created against ${suppliers[0].name}`);

  console.log('\n--- Demo data seeding complete ---');
  console.log(`Log in at http://localhost:5173/login with:`);
  console.log(`  email:    ${DEMO.email}`);
  console.log(`  password: ${DEMO.password}`);
}

main()
  .catch((err) => {
    console.error('\n✘ Seeding failed:', err.message);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());

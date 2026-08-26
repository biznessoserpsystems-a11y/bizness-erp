const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const salesService = require('../services/salesService');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

// ============================================================================
// Rental Items
// ============================================================================

// GET /rental/items
const listRentalItems = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ri.*,
            fa.name AS fixed_asset_name, fa.asset_code,
            p.name AS product_name, p.sku AS product_sku
     FROM rental_items ri
     LEFT JOIN fixed_assets fa ON fa.id = ri.fixed_asset_id
     LEFT JOIN products p ON p.id = ri.product_id
     WHERE ri.company_id = $1 ORDER BY ri.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// POST /rental/items { name, itemType, fixedAssetId, productId, dailyRate, weeklyRate, monthlyRate, depositAmount, notes }
const createRentalItem = asyncHandler(async (req, res) => {
  const { name, itemType, fixedAssetId, productId, dailyRate, weeklyRate, monthlyRate, depositAmount, notes } = req.body;
  if (!name || !itemType) throw new ApiError(400, 'name and itemType are required');
  if (itemType === 'fixed_asset' && !fixedAssetId) throw new ApiError(400, 'fixedAssetId is required when itemType is fixed_asset');
  if (itemType === 'product' && !productId) throw new ApiError(400, 'productId is required when itemType is product');
  if (!dailyRate && !weeklyRate && !monthlyRate) throw new ApiError(400, 'Set at least one rate (daily, weekly, or monthly)');

  if (fixedAssetId) {
    const asset = await db.query('SELECT id FROM fixed_assets WHERE id = $1 AND company_id = $2', [fixedAssetId, req.user.companyId]);
    if (!asset.rows.length) throw new ApiError(404, 'Fixed asset not found');
  }
  if (productId) {
    const product = await db.query('SELECT id FROM products WHERE id = $1 AND company_id = $2', [productId, req.user.companyId]);
    if (!product.rows.length) throw new ApiError(404, 'Product not found');
  }

  const { rows } = await db.query(
    `INSERT INTO rental_items (company_id, name, item_type, fixed_asset_id, product_id, daily_rate, weekly_rate, monthly_rate, deposit_amount, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.companyId, name, itemType, fixedAssetId || null, productId || null, dailyRate || null, weeklyRate || null, monthlyRate || null, depositAmount || 0, notes || null]
  );
  await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'rental_item', entityId: rows[0].id, newValues: req.body, ip: req.ip });
  res.status(201).json(rows[0]);
});

// ============================================================================
// Rental Agreements
// ============================================================================

// GET /rental/agreements
const listRentalAgreements = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ra.*, ri.name AS item_name, c.name AS customer_name
     FROM rental_agreements ra
     JOIN rental_items ri ON ri.id = ra.rental_item_id
     JOIN customers c ON c.id = ra.customer_id
     WHERE ra.company_id = $1 ORDER BY ra.created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

// GET /rental/agreements/:id
const getRentalAgreement = asyncHandler(async (req, res) => {
  const agreement = await db.query(
    `SELECT ra.*, ri.name AS item_name, ri.item_type, c.name AS customer_name
     FROM rental_agreements ra
     JOIN rental_items ri ON ri.id = ra.rental_item_id
     JOIN customers c ON c.id = ra.customer_id
     WHERE ra.id = $1 AND ra.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');

  const [charges, depositTx] = await Promise.all([
    db.query('SELECT * FROM rental_charges WHERE agreement_id = $1 ORDER BY charged_at', [req.params.id]),
    db.query('SELECT * FROM rental_deposit_transactions WHERE agreement_id = $1 ORDER BY transacted_at', [req.params.id]),
  ]);

  const totalCharged = charges.rows.reduce((s, c) => s + Number(c.amount) * (1 + Number(c.tax_percent) / 100), 0);
  res.json({ ...agreement.rows[0], charges: charges.rows, depositTransactions: depositTx.rows, totalCharged });
});

// POST /rental/agreements { customerId, rentalItemId, rateType, rateAmount, startDate, expectedReturnDate, depositAmount, notes }
// Checks for a conflicting active/draft agreement on the same item over an
// overlapping date range before allowing this one to be created.
const createRentalAgreement = asyncHandler(async (req, res) => {
  const { customerId, rentalItemId, rateType, rateAmount, startDate, expectedReturnDate, depositAmount, notes } = req.body;
  if (!customerId || !rentalItemId || !rateType || !rateAmount || !startDate || !expectedReturnDate) {
    throw new ApiError(400, 'customerId, rentalItemId, rateType, rateAmount, startDate, and expectedReturnDate are required');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const item = await client.query('SELECT * FROM rental_items WHERE id = $1 AND company_id = $2 FOR UPDATE', [rentalItemId, req.user.companyId]);
    if (!item.rows.length) throw new ApiError(404, 'Rental item not found');
    if (item.rows[0].status === 'retired') throw new ApiError(400, 'This item has been retired and cannot be rented');

    const conflict = await client.query(
      `SELECT id FROM rental_agreements
       WHERE rental_item_id = $1 AND status IN ('draft', 'active')
         AND start_date <= $3 AND expected_return_date >= $2`,
      [rentalItemId, startDate, expectedReturnDate]
    );
    if (conflict.rows.length) throw new ApiError(400, 'This item already has a draft or active agreement overlapping these dates');

    const agreementNo = await salesService.generateDocNo(client, req.user.companyId, 'RA');
    const { rows } = await client.query(
      `INSERT INTO rental_agreements (company_id, agreement_no, customer_id, rental_item_id, rate_type, rate_amount, start_date, expected_return_date, deposit_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.companyId, agreementNo, customerId, rentalItemId, rateType, rateAmount, startDate, expectedReturnDate, depositAmount || item.rows[0].deposit_amount, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /rental/agreements/:id/check-out
// Marks the item rented and the agreement active. Does NOT auto-collect the
// deposit — that's a distinct action (see collectDeposit) so a company that
// doesn't require deposits isn't forced through an extra step.
// POST /rental/agreements/:id/check-out { condition, notes }
const checkOutAgreement = asyncHandler(async (req, res) => {
  const { condition, notes } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query('SELECT * FROM rental_agreements WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');
    if (agreement.rows[0].status !== 'draft') throw new ApiError(400, `Cannot check out an agreement with status "${agreement.rows[0].status}"`);

    await client.query(`UPDATE rental_items SET status = 'rented' WHERE id = $1`, [agreement.rows[0].rental_item_id]);
    const { rows } = await client.query(
      `UPDATE rental_agreements SET status = 'active', condition_at_checkout = $1, checkout_notes = $2 WHERE id = $3 RETURNING *`,
      [condition || null, notes || null, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /rental/agreements/:id/check-in { actualReturnDate, condition, notes }
// Marks the item available again — unless it's checked in "damaged", in
// which case it goes to maintenance instead, since a damaged item isn't
// actually ready to rent out again just because the paperwork is done.
// If returned after expected_return_date, flags the number of overdue days
// in the response so the front end can prompt for a late fee charge —
// doesn't auto-charge it, since the late fee policy (a flat fee, per-day,
// waived, etc.) is a business decision, not something to assume.
const checkInAgreement = asyncHandler(async (req, res) => {
  const { actualReturnDate, condition, notes } = req.body;
  const returnDate = actualReturnDate || new Date().toISOString().slice(0, 10);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query('SELECT * FROM rental_agreements WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');
    if (agreement.rows[0].status !== 'active') throw new ApiError(400, `Cannot check in an agreement with status "${agreement.rows[0].status}"`);

    const newItemStatus = condition === 'damaged' ? 'maintenance' : 'available';
    await client.query(`UPDATE rental_items SET status = $1 WHERE id = $2`, [newItemStatus, agreement.rows[0].rental_item_id]);
    const { rows } = await client.query(
      `UPDATE rental_agreements SET status = 'returned', actual_return_date = $1, condition_at_checkin = $2, checkin_notes = $3 WHERE id = $4 RETURNING *`,
      [returnDate, condition || null, notes || null, req.params.id]
    );
    await client.query('COMMIT');

    const overdueDays = Math.max(0, Math.round((new Date(returnDate) - new Date(agreement.rows[0].expected_return_date)) / 86400000));
    res.json({ ...rows[0], overdueDays, itemSentToMaintenance: newItemStatus === 'maintenance' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Rental Charges — Dr Accounts Receivable / Cr Rental Income (+ VAT)
// ============================================================================

// POST /rental/agreements/:id/charges { chargeType, description, amount, taxPercent }
const billRentalCharge = asyncHandler(async (req, res) => {
  const { chargeType, description, amount, taxPercent } = req.body;
  if (!chargeType || !description || !amount) throw new ApiError(400, 'chargeType, description, and amount are required');
  if (Number(amount) <= 0) throw new ApiError(400, 'amount must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query(
      `SELECT ra.*, c.name AS customer_name FROM rental_agreements ra JOIN customers c ON c.id = ra.customer_id WHERE ra.id = $1 AND ra.company_id = $2 FOR UPDATE`,
      [req.params.id, req.user.companyId]
    );
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');
    if (agreement.rows[0].status === 'cancelled') throw new ApiError(400, 'Cannot bill charges on a cancelled agreement');

    const tax = Number(taxPercent) || 0;
    const taxAmount = Number(amount) * (tax / 100);
    const totalAmount = Number(amount) + taxAmount;

    const arAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_receivable');
    const rentalIncomeAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'rental_income');
    const glLines = [{ accountId: arAccountId, debit: totalAmount, credit: 0 }, { accountId: rentalIncomeAccountId, debit: 0, credit: amount }];
    if (taxAmount > 0) {
      const vatAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'vat_payable');
      glLines.push({ accountId: vatAccountId, debit: 0, credit: taxAmount });
    }

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'rental_charge', referenceId: agreement.rows[0].id,
      description: `${chargeType === 'rental' ? 'Rental charge' : chargeType === 'late_fee' ? 'Late fee' : 'Damage charge'} — ${agreement.rows[0].agreement_no}: ${description}`,
      lines: glLines,
    });

    const { rows } = await client.query(
      `INSERT INTO rental_charges (agreement_id, charge_type, description, amount, tax_percent, journal_entry_id, charged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, chargeType, description, amount, tax, entry.id, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Deposit transactions
// ============================================================================

// POST /rental/agreements/:id/deposit/collect { amount, bankAccountId }
const collectDeposit = asyncHandler(async (req, res) => {
  const { amount, bankAccountId } = req.body;
  if (!amount || !bankAccountId) throw new ApiError(400, 'amount and bankAccountId are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query('SELECT * FROM rental_agreements WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');
    if (agreement.rows[0].deposit_status === 'held') throw new ApiError(400, 'A deposit is already held for this agreement');

    const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
    if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
    const depositsHeldAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'rental_deposits_held');

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'rental_deposit', referenceId: agreement.rows[0].id,
      description: `Security deposit collected — ${agreement.rows[0].agreement_no}`,
      lines: [
        { accountId: bankAccount.rows[0].account_id, debit: amount, credit: 0 },
        { accountId: depositsHeldAccountId, debit: 0, credit: amount },
      ],
    });

    const tx = await client.query(
      `INSERT INTO rental_deposit_transactions (agreement_id, transaction_type, amount, bank_account_id, journal_entry_id, transacted_by)
       VALUES ($1,'collected',$2,$3,$4,$5) RETURNING *`,
      [req.params.id, amount, bankAccountId, entry.id, req.user.id]
    );
    await client.query(`UPDATE rental_agreements SET deposit_status = 'held' WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(tx.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /rental/agreements/:id/deposit/refund { amount, bankAccountId }
const refundDeposit = asyncHandler(async (req, res) => {
  const { amount, bankAccountId } = req.body;
  if (!amount || !bankAccountId) throw new ApiError(400, 'amount and bankAccountId are required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query('SELECT * FROM rental_agreements WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');
    if (agreement.rows[0].deposit_status !== 'held') throw new ApiError(400, `Cannot refund — deposit status is "${agreement.rows[0].deposit_status}"`);

    const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
    if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
    const depositsHeldAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'rental_deposits_held');

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'rental_deposit', referenceId: agreement.rows[0].id,
      description: `Security deposit refunded — ${agreement.rows[0].agreement_no}`,
      lines: [
        { accountId: depositsHeldAccountId, debit: amount, credit: 0 },
        { accountId: bankAccount.rows[0].account_id, debit: 0, credit: amount },
      ],
    });

    const tx = await client.query(
      `INSERT INTO rental_deposit_transactions (agreement_id, transaction_type, amount, bank_account_id, journal_entry_id, transacted_by)
       VALUES ($1,'refunded',$2,$3,$4,$5) RETURNING *`,
      [req.params.id, amount, bankAccountId, entry.id, req.user.id]
    );
    const newStatus = Number(amount) >= Number(agreement.rows[0].deposit_amount) ? 'refunded' : 'partially_forfeited';
    await client.query(`UPDATE rental_agreements SET deposit_status = $1 WHERE id = $2`, [newStatus, req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(tx.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /rental/agreements/:id/deposit/forfeit { amount, reason }
// Recognised as Rental Income once forfeited — it's no longer a refundable
// obligation, so it stops being a liability at that point.
const forfeitDeposit = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount) throw new ApiError(400, 'amount is required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query('SELECT * FROM rental_agreements WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');
    if (agreement.rows[0].deposit_status !== 'held') throw new ApiError(400, `Cannot forfeit — deposit status is "${agreement.rows[0].deposit_status}"`);

    const depositsHeldAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'rental_deposits_held');
    const rentalIncomeAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'rental_income');

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'rental_deposit', referenceId: agreement.rows[0].id,
      description: `Security deposit forfeited — ${agreement.rows[0].agreement_no}${reason ? `: ${reason}` : ''}`,
      lines: [
        { accountId: depositsHeldAccountId, debit: amount, credit: 0 },
        { accountId: rentalIncomeAccountId, debit: 0, credit: amount },
      ],
    });

    const tx = await client.query(
      `INSERT INTO rental_deposit_transactions (agreement_id, transaction_type, amount, journal_entry_id, transacted_by)
       VALUES ($1,'forfeited',$2,$3,$4) RETURNING *`,
      [req.params.id, amount, entry.id, req.user.id]
    );
    const newStatus = Number(amount) >= Number(agreement.rows[0].deposit_amount) ? 'forfeited' : 'partially_forfeited';
    await client.query(`UPDATE rental_agreements SET deposit_status = $1 WHERE id = $2`, [newStatus, req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(tx.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Rental Asset Management — maintenance
// ============================================================================

// GET /rental/items/:id/maintenance
const listMaintenanceForItem = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM rental_asset_maintenance WHERE rental_item_id = $1 AND company_id = $2 ORDER BY scheduled_date DESC`,
    [req.params.id, req.user.companyId]
  );
  res.json(rows);
});

// POST /rental/items/:id/maintenance { maintenanceType, description, scheduledDate }
// Scheduling doesn't require the item to be available yet — you can plan
// ahead — but taking it out of rotation (see startMaintenance below) does.
const scheduleMaintenance = asyncHandler(async (req, res) => {
  const { maintenanceType, description, scheduledDate } = req.body;
  if (!description || !scheduledDate) throw new ApiError(400, 'description and scheduledDate are required');

  const item = await db.query('SELECT id FROM rental_items WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!item.rows.length) throw new ApiError(404, 'Rental item not found');

  const { rows } = await db.query(
    `INSERT INTO rental_asset_maintenance (company_id, rental_item_id, maintenance_type, description, scheduled_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.companyId, req.params.id, maintenanceType || 'routine', description, scheduledDate, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// POST /rental/maintenance/:id/start
// Takes the item out of rotation. Refuses if it's currently rented — you
// can't pull an item off a customer mid-rental just to service it.
const startMaintenance = asyncHandler(async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      `SELECT m.*, ri.status AS item_status FROM rental_asset_maintenance m JOIN rental_items ri ON ri.id = m.rental_item_id
       WHERE m.id = $1 AND m.company_id = $2 FOR UPDATE`,
      [req.params.id, req.user.companyId]
    );
    if (!record.rows.length) throw new ApiError(404, 'Maintenance record not found');
    if (record.rows[0].status !== 'scheduled') throw new ApiError(400, `Cannot start maintenance with status "${record.rows[0].status}"`);
    if (record.rows[0].item_status === 'rented') throw new ApiError(400, 'This item is currently rented out — check it in before starting maintenance');

    await client.query(`UPDATE rental_items SET status = 'maintenance' WHERE id = $1`, [record.rows[0].rental_item_id]);
    const { rows } = await client.query(`UPDATE rental_asset_maintenance SET status = 'in_progress' WHERE id = $1 RETURNING *`, [req.params.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /rental/maintenance/:id/complete { cost, bankAccountId, completedDate }
// Posts a real expense (Dr Repairs & Maintenance / Cr Cash-or-Bank) and
// returns the item to available — a maintenance record can be completed
// with no cost at all (a free warranty repair, or a pure inspection).
const completeMaintenance = asyncHandler(async (req, res) => {
  const { cost, bankAccountId, completedDate } = req.body;
  if (cost && !bankAccountId) throw new ApiError(400, 'bankAccountId is required when recording a cost');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const record = await client.query('SELECT * FROM rental_asset_maintenance WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.user.companyId]);
    if (!record.rows.length) throw new ApiError(404, 'Maintenance record not found');
    if (record.rows[0].status !== 'in_progress') throw new ApiError(400, `Cannot complete maintenance with status "${record.rows[0].status}"`);

    let journalEntryId = null;
    if (Number(cost) > 0) {
      const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
      if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
      const maintenanceExpenseId = await accountingService.getMappedAccountId(client, req.user.companyId, 'repairs_maintenance_expense');

      const entry = await accountingService.postJournalEntry(client, {
        companyId: req.user.companyId, userId: req.user.id, entryDate: completedDate || new Date().toISOString().slice(0, 10),
        referenceType: 'rental_maintenance', referenceId: record.rows[0].id,
        description: `Maintenance completed: ${record.rows[0].description}`,
        lines: [
          { accountId: maintenanceExpenseId, debit: cost, credit: 0 },
          { accountId: bankAccount.rows[0].account_id, debit: 0, credit: cost },
        ],
      });
      journalEntryId = entry.id;
    }

    await client.query(`UPDATE rental_items SET status = 'available' WHERE id = $1`, [record.rows[0].rental_item_id]);
    const { rows } = await client.query(
      `UPDATE rental_asset_maintenance SET status = 'completed', completed_date = $1, cost = $2, journal_entry_id = $3 WHERE id = $4 RETURNING *`,
      [completedDate || new Date().toISOString().slice(0, 10), cost || null, journalEntryId, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /rental/reports/asset-utilization?from=&to=
// For each item: how many days in the period it was actually rented out
// (clipped to the period boundaries) vs. how many days the period covers,
// revenue earned, and maintenance cost incurred — the numbers that answer
// "is this item worth what we paid for it".
const assetUtilizationReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;
  const periodDays = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;

  const { rows: items } = await db.query(`SELECT id, name, status FROM rental_items WHERE company_id = $1`, [companyId]);

  const results = [];
  for (const item of items) {
    const { rows: agreements } = await db.query(
      `SELECT start_date, expected_return_date, actual_return_date, status
       FROM rental_agreements
       WHERE rental_item_id = $1 AND status IN ('active', 'returned')
         AND start_date <= $3 AND COALESCE(actual_return_date, expected_return_date) >= $2`,
      [item.id, from, to]
    );
    let rentedDays = 0;
    for (const a of agreements) {
      const effectiveEnd = a.actual_return_date || a.expected_return_date;
      const clippedStart = new Date(Math.max(new Date(a.start_date), new Date(from)));
      const clippedEnd = new Date(Math.min(new Date(effectiveEnd), new Date(to)));
      rentedDays += Math.max(0, Math.round((clippedEnd - clippedStart) / 86400000) + 1);
    }

    const { rows: revenueRows } = await db.query(
      `SELECT COALESCE(SUM(rc.amount), 0) AS total
       FROM rental_charges rc JOIN rental_agreements ra ON ra.id = rc.agreement_id
       WHERE ra.rental_item_id = $1 AND rc.charged_at::date BETWEEN $2 AND $3`,
      [item.id, from, to]
    );
    const { rows: maintenanceRows } = await db.query(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM rental_asset_maintenance
       WHERE rental_item_id = $1 AND status = 'completed' AND completed_date BETWEEN $2 AND $3`,
      [item.id, from, to]
    );

    const revenue = Number(revenueRows[0].total);
    const maintenanceCost = Number(maintenanceRows[0].total);
    results.push({
      itemId: item.id, itemName: item.name, currentStatus: item.status,
      rentedDays, periodDays, utilizationRate: periodDays > 0 ? (rentedDays / periodDays) * 100 : 0,
      revenue, maintenanceCost, netContribution: revenue - maintenanceCost,
    });
  }

  res.json({ from, to, periodDays, items: results });
});

// POST /rental/agreements/:id/payments { amount, bankAccountId, notes }
// The other half of billRentalCharge: that posts Dr AR / Cr Rental Income
// when a charge is billed; this posts Dr Bank / Cr AR when the customer
// actually pays it. Without this, there'd be no way to know an agreement
// has been settled versus still outstanding.
const recordRentalPayment = asyncHandler(async (req, res) => {
  const { amount, bankAccountId, notes } = req.body;
  if (!amount || !bankAccountId) throw new ApiError(400, 'amount and bankAccountId are required');
  if (Number(amount) <= 0) throw new ApiError(400, 'amount must be greater than zero');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const agreement = await client.query(
      `SELECT ra.*, c.name AS customer_name FROM rental_agreements ra JOIN customers c ON c.id = ra.customer_id WHERE ra.id = $1 AND ra.company_id = $2 FOR UPDATE`,
      [req.params.id, req.user.companyId]
    );
    if (!agreement.rows.length) throw new ApiError(404, 'Rental agreement not found');

    const bankAccount = await client.query('SELECT account_id FROM bank_accounts WHERE id = $1 AND company_id = $2', [bankAccountId, req.user.companyId]);
    if (!bankAccount.rows.length) throw new ApiError(404, 'Bank account not found');
    const arAccountId = await accountingService.getMappedAccountId(client, req.user.companyId, 'accounts_receivable');

    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'rental_payment', referenceId: agreement.rows[0].id,
      description: `Payment received — ${agreement.rows[0].agreement_no} (${agreement.rows[0].customer_name})`,
      lines: [
        { accountId: bankAccount.rows[0].account_id, debit: amount, credit: 0 },
        { accountId: arAccountId, debit: 0, credit: amount },
      ],
    });

    const { rows } = await client.query(
      `INSERT INTO rental_payments (agreement_id, amount, bank_account_id, journal_entry_id, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, amount, bankAccountId, entry.id, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ============================================================================
// Reports
// ============================================================================

// GET /rental/reports/summary?from=&to=
const rentalSummaryReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;

  const [itemCounts, revenue, activeAgreements, overdueAgreements] = await Promise.all([
    db.query(`SELECT status, COUNT(*) AS count FROM rental_items WHERE company_id = $1 GROUP BY status`, [companyId]),
    db.query(
      `SELECT rc.charge_type, COALESCE(SUM(rc.amount), 0) AS total
       FROM rental_charges rc JOIN rental_agreements ra ON ra.id = rc.agreement_id
       WHERE ra.company_id = $1 AND rc.charged_at::date BETWEEN $2 AND $3 GROUP BY rc.charge_type`,
      [companyId, from, to]
    ),
    db.query(`SELECT COUNT(*) AS count FROM rental_agreements WHERE company_id = $1 AND status = 'active'`, [companyId]),
    db.query(`SELECT COUNT(*) AS count FROM rental_agreements WHERE company_id = $1 AND status = 'active' AND expected_return_date < CURRENT_DATE`, [companyId]),
  ]);

  const itemsByStatus = itemCounts.rows.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {});
  const revenueByType = revenue.rows.reduce((acc, r) => ({ ...acc, [r.charge_type]: Number(r.total) }), {});
  const totalRevenue = Object.values(revenueByType).reduce((s, v) => s + v, 0);

  res.json({
    from, to, itemsByStatus, revenueByType, totalRevenue,
    activeAgreements: Number(activeAgreements.rows[0].count),
    overdueAgreements: Number(overdueAgreements.rows[0].count),
  });
});


// GET /rental/reports/workspace-dashboard?from=&to=
// Everything the Rental Workspace's KPI row needs in one call. Two
// different time bases, same discipline as every other dashboard in this
// system: current-moment counts (available/reserved/maintenance assets,
// overdue returns, expiring contracts, outstanding payments) describe the
// state of things RIGHT NOW regardless of the period selected; revenue,
// utilization, and profit are scoped to the selected from/to range.
const rentalWorkspaceDashboard = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw new ApiError(400, 'from and to are required');
  const companyId = req.user.companyId;
  const periodDays = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;

  const [items, agreements] = await Promise.all([
    db.query(`SELECT id, status, fixed_asset_id FROM rental_items WHERE company_id = $1`, [companyId]),
    db.query(`SELECT id, rental_item_id, status, expected_return_date, start_date, actual_return_date, deposit_amount FROM rental_agreements WHERE company_id = $1`, [companyId]),
  ]);

  const activeAgreements = agreements.rows.filter((a) => a.status === 'active');
  const draftAgreements = agreements.rows.filter((a) => a.status === 'draft');
  const now = new Date();
  const overdueReturns = activeAgreements.filter((a) => new Date(a.expected_return_date) < now).length;
  const expiringWithin7Days = activeAgreements.filter((a) => {
    const daysUntil = (new Date(a.expected_return_date) - now) / 86400000;
    return daysUntil >= 0 && daysUntil <= 7;
  }).length;

  const availableAssets = items.rows.filter((i) => i.status === 'available').length;
  const assetsUnderMaintenance = items.rows.filter((i) => i.status === 'maintenance').length;
  // "Reserved" = has a draft agreement (booked ahead) that hasn't been
  // checked out yet - distinct from "rented" (already checked out).
  const reservedAssetIds = new Set(draftAgreements.map((a) => a.rental_item_id));
  const reservedAssets = items.rows.filter((i) => reservedAssetIds.has(i.id)).length;

  // ---- Rental Revenue + Monthly Profit (period-scoped) ----
  const { rows: chargeRows } = await db.query(
    `SELECT rc.charge_type, COALESCE(SUM(rc.amount), 0) AS total
     FROM rental_charges rc JOIN rental_agreements ra ON ra.id = rc.agreement_id
     WHERE ra.company_id = $1 AND rc.charged_at::date BETWEEN $2 AND $3 GROUP BY rc.charge_type`,
    [companyId, from, to]
  );
  const rentalRevenue = chargeRows.reduce((s, r) => s + Number(r.total), 0);

  const { rows: maintenanceRows } = await db.query(
    `SELECT COALESCE(SUM(cost), 0) AS total FROM rental_asset_maintenance
     WHERE company_id = $1 AND status = 'completed' AND completed_date BETWEEN $2 AND $3`,
    [companyId, from, to]
  );
  const maintenanceCost = Number(maintenanceRows[0].total);

  // Depreciation only applies to the subset of rental items backed by a
  // real Fixed Asset - product-backed items (stock) don't depreciate.
  const fixedAssetIds = items.rows.filter((i) => i.fixed_asset_id).map((i) => i.fixed_asset_id);
  let depreciation = 0;
  if (fixedAssetIds.length) {
    const { rows: depRows } = await db.query(
      `SELECT COALESCE(SUM(depreciation_amount), 0) AS total FROM asset_depreciation_entries
       WHERE company_id = $1 AND asset_id = ANY($2::uuid[]) AND period_end BETWEEN $3 AND $4`,
      [companyId, fixedAssetIds, from, to]
    );
    depreciation = Number(depRows[0].total);
  }
  const netProfit = rentalRevenue - maintenanceCost - depreciation;

  // ---- Outstanding Customer Payments (point-in-time, not period-scoped -
  // an unpaid charge from 3 months ago is still outstanding today) ----
  const { rows: billedRows } = await db.query(
    `SELECT COALESCE(SUM(rc.amount * (1 + rc.tax_percent / 100)), 0) AS total
     FROM rental_charges rc JOIN rental_agreements ra ON ra.id = rc.agreement_id WHERE ra.company_id = $1`,
    [companyId]
  );
  const { rows: paidRows } = await db.query(
    `SELECT COALESCE(SUM(rp.amount), 0) AS total
     FROM rental_payments rp JOIN rental_agreements ra ON ra.id = rp.agreement_id WHERE ra.company_id = $1`,
    [companyId]
  );
  const outstandingCustomerPayments = Number(billedRows[0].total) - Number(paidRows[0].total);

  // ---- Asset Utilization Rate (aggregate across all items, period-scoped) ----
  let totalRentedDays = 0;
  for (const item of items.rows) {
    const overlapping = agreements.rows.filter((a) =>
      a.rental_item_id === item.id && ['active', 'returned'].includes(a.status) &&
      new Date(a.start_date) <= new Date(to) && new Date(a.actual_return_date || a.expected_return_date) >= new Date(from)
    );
    for (const a of overlapping) {
      const effectiveEnd = a.actual_return_date || a.expected_return_date;
      const clippedStart = new Date(Math.max(new Date(a.start_date), new Date(from)));
      const clippedEnd = new Date(Math.min(new Date(effectiveEnd), new Date(to)));
      totalRentedDays += Math.max(0, Math.round((clippedEnd - clippedStart) / 86400000) + 1);
    }
  }
  const totalPossibleDays = items.rows.length * periodDays;
  const assetUtilizationRate = totalPossibleDays > 0 ? (totalRentedDays / totalPossibleDays) * 100 : 0;

  res.json({
    from, to,
    activeRentals: activeAgreements.length,
    availableAssets, reservedAssets, assetsUnderMaintenance,
    rentalRevenue, overdueReturns, expiringContracts: expiringWithin7Days,
    outstandingCustomerPayments,
    assetUtilizationRate,
    monthlyProfit: { revenue: rentalRevenue, maintenanceCost, depreciation, netProfit },
  });
});

module.exports = {
  listRentalItems, createRentalItem,
  listRentalAgreements, getRentalAgreement, createRentalAgreement, checkOutAgreement, checkInAgreement,
  billRentalCharge, collectDeposit, refundDeposit, forfeitDeposit, recordRentalPayment,
  listMaintenanceForItem, scheduleMaintenance, startMaintenance, completeMaintenance,
  rentalSummaryReport, assetUtilizationReport, rentalWorkspaceDashboard,
};

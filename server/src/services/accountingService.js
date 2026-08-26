const ApiError = require('../utils/ApiError');

const NORMAL_BALANCE = {
  asset: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
  expense: 'debit',
};

function generateEntryNo(prefix = 'JE') {
  return `${prefix}-${Date.now()}`;
}

/** Looks up a semantic GL mapping (e.g. 'accounts_receivable') to a real account. */
async function getMappedAccountId(client, companyId, mappingKey) {
  const { rows } = await client.query(
    'SELECT account_id FROM gl_account_mappings WHERE company_id = $1 AND mapping_key = $2',
    [companyId, mappingKey]
  );
  if (!rows.length) {
    throw new ApiError(
      400,
      `No GL account is mapped for "${mappingKey}". Set it up under Accounting > Chart of Accounts > GL Mappings first.`
    );
  }
  return rows[0].account_id;
}

/**
 * Finds the fiscal period covering a date, if the company has set one up.
 * Returns null if no periods exist yet (so posting isn't blocked before
 * System Admin > Financial Years has been configured). Throws if a period
 * exists for that date but is closed/locked.
 */
async function getOpenFiscalPeriod(client, companyId, entryDate) {
  const { rows } = await client.query(
    `SELECT fp.* FROM fiscal_periods fp
     JOIN financial_years fy ON fy.id = fp.financial_year_id
     WHERE fy.company_id = $1 AND $2::date BETWEEN fp.start_date AND fp.end_date`,
    [companyId, entryDate]
  );
  if (!rows.length) return null;
  const period = rows[0];
  if (period.status !== 'open') {
    throw new ApiError(400, `The fiscal period covering ${entryDate} is ${period.status} and cannot accept new postings.`);
  }
  return period;
}

/**
 * Posts a balanced double-entry journal entry.
 * lines: [{ accountId, debit, credit, description, customerId }] — always in the
 * company's BASE currency. If the source document was in a foreign currency, pass
 * currency/exchangeRate/foreignTotal purely as audit trail; nothing here uses them
 * for arithmetic — the caller converts foreign amounts to base currency first.
 * Throws if debits don't equal credits, or the period is locked.
 */
async function postJournalEntry(client, { companyId, userId, entryDate, referenceType, referenceId, description, lines, entryNoPrefix = 'JE', currency, exchangeRate, foreignTotal }) {
  if (!Array.isArray(lines) || lines.length < 2) throw new ApiError(400, 'A journal entry needs at least two lines');

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new ApiError(400, `Journal entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`);
  }

  const date = entryDate || new Date().toISOString().slice(0, 10);
  const period = await getOpenFiscalPeriod(client, companyId, date);

  const entryNo = generateEntryNo(entryNoPrefix);
  const entryResult = await client.query(
    `INSERT INTO journal_entries (company_id, entry_no, entry_date, fiscal_period_id, reference_type, reference_id, description, total_debit, total_credit, created_by, currency, exchange_rate, foreign_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [companyId, entryNo, date, period?.id || null, referenceType || 'manual', referenceId || null, description || null, totalDebit, totalCredit, userId || null, currency || null, exchangeRate || null, foreignTotal || null]
  );
  const entry = entryResult.rows[0];

  let order = 0;
  for (const line of lines) {
    await client.query(
      `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, customer_id, line_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entry.id, line.accountId, line.debit || 0, line.credit || 0, line.description || null, line.customerId || null, order++]
    );
  }

  return entry;
}

/** Reverses a posted entry by creating an equal-and-opposite entry. */
async function reverseJournalEntry(client, { companyId, userId, journalEntryId, reason }) {
  const original = await client.query('SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2', [journalEntryId, companyId]);
  if (!original.rows.length) throw new ApiError(404, 'Journal entry not found');
  if (original.rows[0].status === 'reversed') throw new ApiError(400, 'This entry has already been reversed');

  const lines = await client.query('SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1', [journalEntryId]);
  const reversedLines = lines.rows.map((l) => ({
    accountId: l.account_id, debit: l.credit, credit: l.debit, description: `Reversal: ${l.description || ''}`, customerId: l.customer_id,
  }));

  const reversal = await postJournalEntry(client, {
    companyId, userId, entryDate: new Date().toISOString().slice(0, 10),
    referenceType: 'reversal', referenceId: journalEntryId,
    description: `Reversal of ${original.rows[0].entry_no}: ${reason || ''}`, lines: reversedLines, entryNoPrefix: 'REV',
  });

  await client.query('UPDATE journal_entries SET status = $1, reversed_by_entry_id = $2 WHERE id = $3', ['reversed', reversal.id, journalEntryId]);
  return reversal;
}

/**
 * Seeds a standard Ghanaian SME chart of accounts and the GL mappings the
 * Sales module needs to auto-post. Safe to call once per company; does
 * nothing (per-account) if that account_code already exists.
 */
async function seedDefaultChartOfAccounts(client, companyId) {
  const accounts = [
    // code, name, type, subtype
    ['1000', 'Cash on Hand', 'asset', 'current_asset'],
    ['1010', 'Bank Account', 'asset', 'current_asset'],
    ['1100', 'Accounts Receivable', 'asset', 'current_asset'],
    ['1200', 'Inventory', 'asset', 'current_asset'],
    ['1500', 'Fixed Assets', 'asset', 'fixed_asset'],
    ['1510', 'Accumulated Depreciation', 'asset', 'fixed_asset'],
    ['1520', 'Capital Work in Progress', 'asset', 'fixed_asset'],
    ['2000', 'Accounts Payable', 'liability', 'current_liability'],
    ['2500', 'Long-term Loans Payable', 'liability', 'long_term_liability'],
    ['1300', 'Input VAT Recoverable', 'asset', 'current_asset'],
    ['2050', 'Goods Received Not Invoiced (GRNI)', 'liability', 'current_liability'],
    ['2100', 'VAT Payable', 'liability', 'current_liability'],
    ['2200', 'Customer Advances', 'liability', 'current_liability'],
    ['2300', 'Accrued Payroll & Statutory', 'liability', 'current_liability'],
    ['3000', "Owner's Equity", 'equity', 'equity'],
    ['3100', 'Retained Earnings', 'equity', 'equity'],
    ['3200', 'Revaluation Surplus', 'equity', 'equity'],
    ['4000', 'Sales Revenue', 'revenue', 'operating_revenue'],
    ['4900', 'Other Revenue', 'revenue', 'other_revenue'],
    ['4910', 'Gain on Disposal of Assets', 'revenue', 'other_revenue'],
    ['4920', 'Reversal of Impairment Loss', 'revenue', 'other_revenue'],
    ['4930', 'Foreign Exchange Gain', 'revenue', 'other_revenue'],
    ['5000', 'Cost of Goods Sold', 'expense', 'cogs'],
    ['6000', 'Rent Expense', 'expense', 'operating_expense'],
    ['6010', 'Salaries & Wages', 'expense', 'operating_expense'],
    ['6020', 'Utilities Expense', 'expense', 'operating_expense'],
    ['6030', 'Office Supplies', 'expense', 'operating_expense'],
    ['6040', 'Bank Charges', 'expense', 'operating_expense'],
    ['6050', 'Depreciation Expense', 'expense', 'operating_expense'],
    ['6800', 'Finance Costs', 'expense', 'finance_cost'],
    ['6900', 'Miscellaneous Expense', 'expense', 'other_expense'],
    ['6910', 'Loss on Disposal of Assets', 'expense', 'other_expense'],
    ['6920', 'Impairment Loss', 'expense', 'other_expense'],
    ['6930', 'Foreign Exchange Loss', 'expense', 'other_expense'],
    ['6950', 'Income Tax Expense', 'expense', 'tax_expense'],
  ];

  const idByCode = {};
  for (const [code, name, type, subtype] of accounts) {
    const existing = await client.query('SELECT id FROM chart_of_accounts WHERE company_id = $1 AND account_code = $2', [companyId, code]);
    if (existing.rows.length) {
      idByCode[code] = existing.rows[0].id;
      continue;
    }
    const { rows } = await client.query(
      `INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id`,
      [companyId, code, name, type, subtype, NORMAL_BALANCE[type]]
    );
    idByCode[code] = rows[0].id;
  }

  const mappings = [
    ['accounts_receivable', '1100'],
    ['accounts_payable', '2000'],
    ['sales_revenue', '4000'],
    ['vat_payable', '2100'],
    ['vat_input', '1300'],
    ['customer_advances', '2200'],
    ['cash_default', '1000'],
    ['inventory_asset', '1200'],
    ['grni_clearing', '2050'],
    ['cogs', '5000'],
    ['retained_earnings', '3100'],
    ['asset_revaluation_surplus', '3200'],
    ['asset_disposal_gain', '4910'],
    ['asset_impairment_reversal_gain', '4920'],
    ['asset_disposal_loss', '6910'],
    ['asset_impairment_loss', '6920'],
    ['fx_gain', '4930'],
    ['fx_loss', '6930'],
  ];
  for (const [key, code] of mappings) {
    await client.query(
      `INSERT INTO gl_account_mappings (company_id, mapping_key, account_id) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, mapping_key) DO NOTHING`,
      [companyId, key, idByCode[code]]
    );
  }
}

/** Checks whether every given mapping key is configured, without throwing. Used to skip
 *  auto-posting gracefully for companies that haven't set up their chart of accounts yet. */
async function hasAllMappings(client, companyId, mappingKeys) {
  const { rows } = await client.query(
    'SELECT mapping_key FROM gl_account_mappings WHERE company_id = $1 AND mapping_key = ANY($2::text[])',
    [companyId, mappingKeys]
  );
  return rows.length === mappingKeys.length;
}

module.exports = {
  NORMAL_BALANCE,
  generateEntryNo,
  getMappedAccountId,
  hasAllMappings,
  getOpenFiscalPeriod,
  postJournalEntry,
  reverseJournalEntry,
  seedDefaultChartOfAccounts,
};

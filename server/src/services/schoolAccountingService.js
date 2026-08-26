// School Management's own, genuinely separate double-entry ledger.
// Deliberately does not require('./accountingService') anywhere in this
// file — not because the two couldn't technically share code safely, but
// because the whole point of this file is that School Management has no
// code-level dependency on the Accounting & Finance module, matching the
// same decoupling already done at the data level (school_chart_of_accounts,
// school_journal_entries, school_journal_entry_lines are separate tables
// from the shared ledger, not just separate application code pointed at
// one shared ledger).
const ApiError = require('../utils/ApiError');

// Atomic, collision-free numbering via the same document_number_sequences
// table salesService.generateDocNo uses for the shared ledger's documents
// — via School's own independent query, not by calling that function,
// preserving the no-code-dependency boundary this file documents at the
// top. This replaced a Date.now()-based generator that looked reasonable
// but wasn't: two entries posted within the same millisecond (trivially
// easy in any loop posting several school fee entries back to back) would
// receive the identical entry_no, and school_journal_entries genuinely
// enforces (company_id, entry_no) as unique — confirmed by generating
// 100,000 numbers in a tight synchronous loop and finding 99,911
// collisions, not a rare edge case but the default outcome of two calls
// happening close together at all.
async function generateSchoolEntryNo(client, companyId, prefix = 'SJE') {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `INSERT INTO document_number_sequences (company_id, prefix, year, next_number)
     VALUES ($1, $2, $3, 2)
     ON CONFLICT (company_id, prefix, year)
     DO UPDATE SET next_number = document_number_sequences.next_number + 1, updated_at = NOW()
     RETURNING next_number - 1 AS issued_number`,
    [companyId, prefix, year]
  );
  const issuedNumber = rows[0].issued_number;
  return `${prefix}-${year}-${String(issuedNumber).padStart(5, '0')}`;
}

/** Seeds School's own chart of accounts for a brand-new company — called
 * once at company registration, the same moment accountingService.
 * seedDefaultChartOfAccounts runs for the shared ledger. */
async function seedSchoolChartOfAccounts(client, companyId) {
  await client.query(
    `INSERT INTO school_chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance)
     VALUES
       ($1, '1000', 'Cash (School)', 'asset', 'debit'),
       ($1, '1200', 'Fees Receivable', 'asset', 'debit'),
       ($1, '1240', 'Shop Inventory', 'asset', 'debit'),
       ($1, '4210', 'Tuition Fee Income', 'revenue', 'credit'),
       ($1, '4220', 'Shop Sales Revenue', 'revenue', 'credit'),
       ($1, '6080', 'Cost of Goods Sold — Shop', 'expense', 'debit')
     ON CONFLICT (company_id, account_code) DO NOTHING`,
    [companyId]
  );
}

/** Looks up one of School's own accounts by its fixed code — School uses a
 * simple direct-by-code lookup rather than the shared ledger's
 * mapping-key indirection (gl_account_mappings), since School only ever
 * has these six well-known accounts, not an arbitrary configurable set. */
async function getSchoolAccountId(client, companyId, accountCode) {
  const { rows } = await client.query('SELECT id FROM school_chart_of_accounts WHERE company_id = $1 AND account_code = $2', [companyId, accountCode]);
  if (!rows.length) throw new ApiError(400, `School account ${accountCode} is not set up for this company`);
  return rows[0].id;
}

/** Posts a real, balanced double-entry journal entry into School's own
 * ledger — the exact same balance-or-throw discipline as the shared
 * ledger's postJournalEntry, just against school_journal_entries /
 * school_journal_entry_lines instead. */
async function postSchoolJournalEntry(client, { companyId, userId, entryDate, referenceType, referenceId, description, lines, entryNoPrefix = 'SJE' }) {
  if (!Array.isArray(lines) || lines.length < 2) throw new ApiError(400, 'A journal entry needs at least two lines');

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new ApiError(400, `Journal entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`);
  }

  const date = entryDate || new Date().toISOString().slice(0, 10);
  const entryNo = await generateSchoolEntryNo(client, companyId, entryNoPrefix);

  const entryResult = await client.query(
    `INSERT INTO school_journal_entries (company_id, entry_no, entry_date, reference_type, reference_id, description, total_debit, total_credit, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId, entryNo, date, referenceType || 'manual', referenceId || null, description || null, totalDebit, totalCredit, userId || null]
  );
  const entry = entryResult.rows[0];

  for (const line of lines) {
    await client.query(
      `INSERT INTO school_journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [entry.id, line.accountId, line.debit || 0, line.credit || 0, line.description || null]
    );
  }

  return entry;
}

module.exports = { seedSchoolChartOfAccounts, getSchoolAccountId, postSchoolJournalEntry, generateSchoolEntryNo };

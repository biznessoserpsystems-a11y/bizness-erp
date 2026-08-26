'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Simple app-level error carrying an HTTP status code, so route handlers
 * upstream can respond with the right status without re-inspecting the
 * error message.
 */
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

const BALANCE_TOLERANCE = 0.01;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function generateEntryNo() {
  return `JE-${Date.now()}-${uuidv4().slice(0, 8)}`;
}

/**
 * Looks up the fiscal period (if any) that entryDate falls into for this
 * company. Returns null if no period has been configured to cover that
 * date — callers treat that as "posting allowed, just not tied to a period".
 */
async function getFiscalPeriod(client, companyId, entryDate) {
  const { rows } = await client.query(
    `SELECT * FROM fiscal_periods
     WHERE company_id = $1
       AND $2::date BETWEEN start_date AND end_date
     LIMIT 1`,
    [companyId, entryDate]
  );
  return rows[0] || null;
}

/**
 * Validates and posts a balanced double-entry journal entry.
 *
 * lines: [{ accountId, debit, credit, description?, customerId? }, ...]
 */
async function postJournalEntry(client, {
  companyId,
  userId = null,
  entryDate,
  referenceType = null,
  referenceId = null,
  description = null,
  lines = [],
}) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new AppError(400, 'A journal entry must have at least two lines.');
  }

  const totalDebit = round2(lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0));

  if (round2(Math.abs(totalDebit - totalCredit)) > BALANCE_TOLERANCE) {
    throw new AppError(
      400,
      `Journal entry does not balance: total debit ${totalDebit} vs total credit ${totalCredit}.`
    );
  }

  const period = await getFiscalPeriod(client, companyId, entryDate);

  if (period) {
    if (period.status === 'closed') {
      throw new AppError(400, `Cannot post into a closed fiscal period (${period.id}).`);
    }
    if (period.status === 'locked') {
      throw new AppError(400, `Cannot post into a locked fiscal period (${period.id}).`);
    }
  }

  const entryNo = generateEntryNo();
  const fiscalPeriodId = period ? period.id : null;

  const { rows: entryRows } = await client.query(
    `INSERT INTO journal_entries
      (company_id, entry_no, entry_date, fiscal_period_id, reference_type, reference_id, description, total_debit, total_credit, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [companyId, entryNo, entryDate, fiscalPeriodId, referenceType, referenceId, description, totalDebit, totalCredit, userId]
  );

  const entry = entryRows[0];

  for (const line of lines) {
    await client.query(
      `INSERT INTO journal_entry_lines
        (journal_entry_id, account_id, debit, credit, description, customer_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.id,
        line.accountId,
        Number(line.debit) || 0,
        Number(line.credit) || 0,
        line.description || null,
        line.customerId || null,
      ]
    );
  }

  return entry;
}

/**
 * Reverses a previously posted journal entry by creating a new entry with
 * every line's debit/credit swapped, then marking the original as reversed.
 * Reversal itself goes through postJournalEntry so it gets the same
 * balance/period validation as any other entry.
 */
async function reverseJournalEntry(client, {
  companyId,
  userId = null,
  journalEntryId,
  reason = null,
}) {
  const { rows: found } = await client.query(
    `SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2`,
    [journalEntryId, companyId]
  );

  const original = found[0];
  if (!original) {
    throw new AppError(404, `Journal entry ${journalEntryId} was not found.`);
  }

  if (original.status === 'reversed') {
    throw new AppError(400, `Journal entry ${original.entry_no} has already been reversed.`);
  }

  const { rows: originalLines } = await client.query(
    `SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1`,
    [journalEntryId]
  );

  const reversalDescription = reason ? `Reversal: ${reason}` : `Reversal of ${original.entry_no}`;

  const reversalLines = originalLines.map((line) => ({
    accountId: line.account_id,
    debit: Number(line.credit) || 0,
    credit: Number(line.debit) || 0,
    description: reversalDescription,
    customerId: line.customer_id || null,
  }));

  const reversalEntry = await postJournalEntry(client, {
    companyId,
    userId,
    entryDate: original.entry_date || new Date().toISOString().slice(0, 10),
    referenceType: 'journal_reversal',
    referenceId: original.id,
    description: reversalDescription,
    lines: reversalLines,
  });

  await client.query(
    `UPDATE journal_entries SET status = 'reversed' WHERE id = $1`,
    [original.id]
  );

  return reversalEntry;
}

module.exports = { postJournalEntry, reverseJournalEntry, AppError };

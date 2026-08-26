const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const accountingService = require('../services/accountingService');
const { recordAudit } = require('../middleware/auditLog');

const listEntries = asyncHandler(async (req, res) => {
  const { from, to, referenceType } = req.query;
  const conditions = ['je.company_id = $1'];
  const params = [req.user.companyId];

  if (from && to) { params.push(from, to); conditions.push(`je.entry_date BETWEEN $${params.length - 1} AND $${params.length}`); }
  if (referenceType) { params.push(referenceType); conditions.push(`je.reference_type = $${params.length}`); }

  const { rows } = await db.query(
    `SELECT je.*, u.first_name, u.last_name
     FROM journal_entries je LEFT JOIN users u ON u.id = je.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY je.entry_date DESC, je.created_at DESC`,
    params
  );
  res.json(rows);
});

const getEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const header = await db.query('SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
  if (!header.rows.length) throw new ApiError(404, 'Journal entry not found');

  const lines = await db.query(
    `SELECT jel.*, coa.account_code, coa.account_name, c.name AS customer_name
     FROM journal_entry_lines jel
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     LEFT JOIN customers c ON c.id = jel.customer_id
     WHERE jel.journal_entry_id = $1 ORDER BY jel.line_order`,
    [id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// POST /journal-entries  { entryDate, description, lines: [{ accountId, debit, credit, description }] }
const createEntry = asyncHandler(async (req, res) => {
  const { entryDate, description, lines } = req.body;
  if (!description) throw new ApiError(400, 'description is required');
  if (!Array.isArray(lines) || lines.length < 2) throw new ApiError(400, 'At least two lines are required for a balanced entry');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const entry = await accountingService.postJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, entryDate, referenceType: 'manual',
      description, lines,
    });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'CREATE', entityType: 'journal_entry', entityId: entry.id, newValues: { description }, ip: req.ip });
    res.status(201).json(entry);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /journal-entries/:id/reverse  { reason }
const reverseEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const reversal = await accountingService.reverseJournalEntry(client, {
      companyId: req.user.companyId, userId: req.user.id, journalEntryId: id, reason,
    });
    await client.query('COMMIT');
    await recordAudit({ companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE', entityType: 'journal_entry', entityId: id, newValues: { reversedBy: reversal.id }, ip: req.ip });
    res.json(reversal);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listEntries, getEntry, createEntry, reverseEntry };

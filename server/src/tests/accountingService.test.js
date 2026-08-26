const { postJournalEntry, reverseJournalEntry } = require('../accountingService');

/**
 * Builds a fake pg client whose `.query` inspects the SQL text and returns
 * canned rows. This avoids needing a real Postgres connection for logic
 * that doesn't depend on actual SQL execution (balance checks, period
 * locking, reversal line construction) — only on what the DB *would* return.
 */
function createMockClient({ period = { id: 'period-1', status: 'open' }, entryRow = {} } = {}) {
  const inserted = { journalEntries: [], journalEntryLines: [] };

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.includes('FROM fiscal_periods')) {
      return { rows: period ? [period] : [] };
    }

    if (s.startsWith('INSERT INTO journal_entries')) {
      const [companyId, entryNo, entryDate, fiscalPeriodId, referenceType, referenceId, description, totalDebit, totalCredit, createdBy] = params;
      const row = {
        id: `je-${inserted.journalEntries.length + 1}`,
        company_id: companyId,
        entry_no: entryNo,
        entry_date: entryDate,
        fiscal_period_id: fiscalPeriodId,
        reference_type: referenceType,
        reference_id: referenceId,
        description,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: createdBy,
        status: 'posted',
        ...entryRow,
      };
      inserted.journalEntries.push(row);
      return { rows: [row] };
    }

    if (s.startsWith('INSERT INTO journal_entry_lines')) {
      inserted.journalEntryLines.push(params);
      return { rows: [] };
    }

    if (s.startsWith('SELECT * FROM journal_entries WHERE')) {
      return { rows: [{ id: params[0], company_id: params[1], status: 'posted', entry_no: 'JE-100' }] };
    }

    if (s.startsWith('SELECT * FROM journal_entry_lines WHERE')) {
      return {
        rows: [
          { account_id: 'acct-ar', debit: 100, credit: 0, description: 'Original sale', customer_id: 'cust-1' },
          { account_id: 'acct-rev', debit: 0, credit: 100, description: 'Original sale', customer_id: null },
        ],
      };
    }

    if (s.startsWith('UPDATE journal_entries SET status')) {
      return { rows: [] };
    }

    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, inserted };
}

describe('postJournalEntry', () => {
  const balancedLines = [
    { accountId: 'acct-ar', debit: 100, credit: 0 },
    { accountId: 'acct-rev', debit: 0, credit: 100 },
  ];

  test('rejects an entry with fewer than two lines', async () => {
    const client = createMockClient();
    await expect(
      postJournalEntry(client, { companyId: 'co-1', lines: [{ accountId: 'acct-ar', debit: 100, credit: 0 }] })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('at least two lines') });
  });

  test('rejects an entry where debits and credits do not match', async () => {
    const client = createMockClient();
    const unbalanced = [
      { accountId: 'acct-ar', debit: 100, credit: 0 },
      { accountId: 'acct-rev', debit: 0, credit: 90 },
    ];
    await expect(
      postJournalEntry(client, { companyId: 'co-1', lines: unbalanced })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('does not balance') });
  });

  test('tolerates rounding differences under 0.01', async () => {
    const client = createMockClient();
    const almostBalanced = [
      { accountId: 'acct-ar', debit: 100.005, credit: 0 },
      { accountId: 'acct-rev', debit: 0, credit: 100 },
    ];
    await expect(
      postJournalEntry(client, { companyId: 'co-1', lines: almostBalanced })
    ).resolves.toBeDefined();
  });

  test('rejects posting into a closed fiscal period', async () => {
    const client = createMockClient({ period: { id: 'period-1', status: 'closed' } });
    await expect(
      postJournalEntry(client, { companyId: 'co-1', entryDate: '2026-01-15', lines: balancedLines })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('closed') });
  });

  test('rejects posting into a locked fiscal period', async () => {
    const client = createMockClient({ period: { id: 'period-1', status: 'locked' } });
    await expect(
      postJournalEntry(client, { companyId: 'co-1', entryDate: '2026-01-15', lines: balancedLines })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('allows posting when no fiscal period has been set up yet', async () => {
    const client = createMockClient({ period: null });
    const entry = await postJournalEntry(client, { companyId: 'co-1', entryDate: '2026-01-15', lines: balancedLines });
    expect(entry.fiscal_period_id).toBeNull();
  });

  test('posts a balanced entry into an open period and writes one line per input line', async () => {
    const client = createMockClient();
    const entry = await postJournalEntry(client, {
      companyId: 'co-1',
      userId: 'user-1',
      entryDate: '2026-01-15',
      referenceType: 'sales_invoice',
      referenceId: 'inv-1',
      description: 'Invoice #1',
      lines: balancedLines,
    });

    expect(entry.total_debit).toBe(100);
    expect(entry.total_credit).toBe(100);
    expect(entry.fiscal_period_id).toBe('period-1');
    expect(client.inserted.journalEntryLines).toHaveLength(2);
  });
});

describe('reverseJournalEntry', () => {
  test('rejects reversing an entry that is already reversed', async () => {
    const client = createMockClient();
    client.query.mockImplementationOnce(async () => ({
      rows: [{ id: 'je-1', status: 'reversed', entry_no: 'JE-100' }],
    }));

    await expect(
      reverseJournalEntry(client, { companyId: 'co-1', journalEntryId: 'je-1' })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already been reversed') });
  });

  test('rejects reversing an entry that does not exist', async () => {
    const client = createMockClient();
    client.query.mockImplementationOnce(async () => ({ rows: [] }));

    await expect(
      reverseJournalEntry(client, { companyId: 'co-1', journalEntryId: 'missing' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('builds equal-and-opposite lines from the original entry', async () => {
    const client = createMockClient();
    await reverseJournalEntry(client, { companyId: 'co-1', userId: 'user-1', journalEntryId: 'je-1', reason: 'Customer dispute' });

    // The reversal is itself posted via postJournalEntry, so its lines
    // should appear in the mock's captured journal_entry_lines inserts,
    // with debit/credit swapped relative to the original (100/0 and 0/100).
    const [line1, line2] = client.inserted.journalEntryLines;
    expect(line1[2]).toBe(0);   // debit swapped from original credit=0
    expect(line1[3]).toBe(100); // credit swapped from original debit=100
    expect(line2[2]).toBe(100);
    expect(line2[3]).toBe(0);
  });
});

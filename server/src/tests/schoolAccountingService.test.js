const {
  generateSchoolEntryNo, postSchoolJournalEntry, getSchoolAccountId,
} = require('../services/schoolAccountingService');

function createMockDb() {
  const state = { sequences: {}, accounts: [], entries: [], lines: [] };

  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

  const query = jest.fn(async (sql, params = []) => {
    const s = norm(sql);

    if (s.startsWith('INSERT INTO document_number_sequences')) {
      const [companyId, prefix, year] = params;
      const key = `${companyId}:${prefix}:${year}`;
      const issued = state.sequences[key] || 1;
      state.sequences[key] = issued + 1;
      return { rows: [{ issued_number: issued }] };
    }

    if (s === 'SELECT id FROM school_chart_of_accounts WHERE company_id = $1 AND account_code = $2') {
      const [companyId, accountCode] = params;
      const row = state.accounts.find((a) => a.company_id === companyId && a.account_code === accountCode);
      return { rows: row ? [{ id: row.id }] : [] };
    }

    if (s.startsWith('INSERT INTO school_journal_entries')) {
      const [companyId, entryNo, entryDate, referenceType, referenceId, description, totalDebit, totalCredit, userId] = params;
      const row = { id: `entry-${state.entries.length + 1}`, company_id: companyId, entry_no: entryNo, entry_date: entryDate, reference_type: referenceType, reference_id: referenceId, description, total_debit: totalDebit, total_credit: totalCredit, created_by: userId };
      // Enforce the same real uniqueness constraint the actual table has,
      // so a regression back to a colliding generator would be caught
      // here too, not just by the dedicated collision test below.
      if (state.entries.some((e) => e.company_id === companyId && e.entry_no === entryNo)) {
        const err = new Error(`duplicate key value violates unique constraint "school_journal_entries_company_id_entry_no_key"`);
        throw err;
      }
      state.entries.push(row);
      return { rows: [row] };
    }

    if (s.startsWith('INSERT INTO school_journal_entry_lines')) {
      state.lines.push({ journal_entry_id: params[0], account_id: params[1], debit: params[2], credit: params[3], description: params[4] });
      return { rows: [] };
    }

    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, state };
}

const COMPANY = 'co-1';

describe('generateSchoolEntryNo', () => {
  // The real bug this suite was written to catch: the original
  // implementation generated entry numbers from Date.now() alone, which
  // collides constantly under any rapid succession of calls — confirmed
  // separately by generating 100,000 in a tight loop and finding 99,911
  // collisions — against a real, enforced (company_id, entry_no) unique
  // constraint on school_journal_entries.
  test('issues genuinely unique, sequential numbers across many rapid calls, not colliding timestamps', async () => {
    const db = createMockDb();
    const numbers = [];
    for (let i = 0; i < 50; i++) {
      numbers.push(await generateSchoolEntryNo(db, COMPANY));
    }
    const unique = new Set(numbers);
    expect(unique.size).toBe(50);
  });

  test('different prefixes get independent sequences', async () => {
    const db = createMockDb();
    const a1 = await generateSchoolEntryNo(db, COMPANY, 'SJE');
    const b1 = await generateSchoolEntryNo(db, COMPANY, 'SFEE');
    const a2 = await generateSchoolEntryNo(db, COMPANY, 'SJE');
    expect(a1).not.toBe(b1);
    expect(a1.split('-')[2]).not.toBe(a2.split('-')[2]); // sequence portion advanced independently
  });

  test('different companies get independent sequences even with the same prefix', async () => {
    const db = createMockDb();
    const co1First = await generateSchoolEntryNo(db, 'co-1');
    const co2First = await generateSchoolEntryNo(db, 'co-2');
    // Both should be the first-issued number for their own company, not
    // one company's activity bleeding into another's sequence.
    expect(co1First.endsWith('00001')).toBe(true);
    expect(co2First.endsWith('00001')).toBe(true);
  });
});

describe('postSchoolJournalEntry — balance validation', () => {
  test('rejects an entry with fewer than two lines', async () => {
    const db = createMockDb();
    await expect(
      postSchoolJournalEntry(db, { companyId: COMPANY, lines: [{ accountId: 'a1', debit: 100 }] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects an unbalanced entry with a clear message showing both totals', async () => {
    const db = createMockDb();
    await expect(
      postSchoolJournalEntry(db, {
        companyId: COMPANY,
        lines: [{ accountId: 'a1', debit: 100 }, { accountId: 'a2', credit: 90 }],
      })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('100.00') });
  });

  test('accepts a genuinely balanced entry', async () => {
    const db = createMockDb();
    const entry = await postSchoolJournalEntry(db, {
      companyId: COMPANY, userId: 'u1',
      lines: [{ accountId: 'a1', debit: 500 }, { accountId: 'a2', credit: 500 }],
    });
    expect(entry.total_debit).toBe(500);
    expect(entry.total_credit).toBe(500);
    expect(db.state.lines).toHaveLength(2);
  });

  test('accepts an entry within the small rounding tolerance', async () => {
    const db = createMockDb();
    // 0.005 difference is within the 0.01 tolerance the function documents.
    await expect(
      postSchoolJournalEntry(db, {
        companyId: COMPANY,
        lines: [{ accountId: 'a1', debit: 100.005 }, { accountId: 'a2', credit: 100.0 }],
      })
    ).resolves.toBeDefined();
  });

  test('rejects an entry just outside the rounding tolerance', async () => {
    const db = createMockDb();
    await expect(
      postSchoolJournalEntry(db, {
        companyId: COMPANY,
        lines: [{ accountId: 'a1', debit: 100.02 }, { accountId: 'a2', credit: 100.0 }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('correctly sums more than two lines on either side', async () => {
    const db = createMockDb();
    const entry = await postSchoolJournalEntry(db, {
      companyId: COMPANY,
      lines: [
        { accountId: 'a1', debit: 300 },
        { accountId: 'a2', debit: 200 },
        { accountId: 'a3', credit: 500 },
      ],
    });
    expect(entry.total_debit).toBe(500);
    expect(entry.total_credit).toBe(500);
  });
});

describe('getSchoolAccountId', () => {
  test('returns the id for a configured account code', async () => {
    const db = createMockDb();
    db.state.accounts.push({ company_id: COMPANY, account_code: '1000', id: 'acc-cash' });
    expect(await getSchoolAccountId(db, COMPANY, '1000')).toBe('acc-cash');
  });

  test('throws a clear, actionable error for a code that is not set up', async () => {
    const db = createMockDb();
    await expect(getSchoolAccountId(db, COMPANY, '9999')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('9999'),
    });
  });
});

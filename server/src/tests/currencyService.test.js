const { getRate, convertToBase } = require('../services/currencyService');

/**
 * A small in-memory fake answering the exact queries currencyService.js
 * issues, the same approach used in stockService.test.js — this exercises
 * the real "most recent rate on or before this date" and "fall back to
 * the inverse of the reverse direction" logic for real, rather than
 * mocking a return value and just re-encoding an assumption about what
 * the code does.
 */
function createMockDb() {
  const state = { rates: [], companies: [] }; // rates: { company_id, from_currency, to_currency, rate, effective_date }

  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

  const query = jest.fn(async (sql, params = []) => {
    const s = norm(sql);
    const EXCHANGE_RATE_QUERY =
      'SELECT rate FROM exchange_rates WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4 ORDER BY effective_date DESC LIMIT 1';

    // Exact match on the full query text, ORDER BY/LIMIT included — not
    // a loose startsWith match. The "most recent effective_date on or
    // before this date" behavior is the entire point of this query;
    // matching loosely and then re-sorting in JS regardless of what the
    // real SQL actually says would silently pass even if a future edit
    // broke the ORDER BY direction or dropped the LIMIT.
    if (s === EXCHANGE_RATE_QUERY) {
      const [companyId, from, to, asOf] = params;
      const matches = state.rates.filter(
        (r) => r.company_id === companyId && r.from_currency === from && r.to_currency === to && r.effective_date <= asOf
      );
      matches.sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1)); // mirrors ORDER BY effective_date DESC
      return { rows: matches.length ? [{ rate: matches[0].rate }] : [] };
    }

    if (s === 'SELECT base_currency FROM companies WHERE id = $1') {
      const [companyId] = params;
      const row = state.companies.find((c) => c.id === companyId);
      return { rows: row ? [{ base_currency: row.base_currency }] : [] };
    }

    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, state };
}

const COMPANY = 'co-1';

describe('getRate', () => {
  test('same currency always returns 1, without querying the database at all', async () => {
    const db = createMockDb();
    expect(await getRate(db, COMPANY, 'GHS', 'GHS', '2026-01-15')).toBe(1);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('finds a direct rate on file', async () => {
    const db = createMockDb();
    db.state.rates.push({ company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 15, effective_date: '2026-01-01' });
    expect(await getRate(db, COMPANY, 'USD', 'GHS', '2026-01-15')).toBe(15);
  });

  test('picks the most recent rate on or before the given date, not the newest rate overall', async () => {
    const db = createMockDb();
    db.state.rates.push(
      { company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 15, effective_date: '2026-01-01' },
      { company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 16, effective_date: '2026-02-01' }
    );
    expect(await getRate(db, COMPANY, 'USD', 'GHS', '2026-01-20')).toBe(15);
    expect(await getRate(db, COMPANY, 'USD', 'GHS', '2026-02-15')).toBe(16);
  });

  test('falls back to the inverse of the reverse-direction rate when no direct rate exists', async () => {
    const db = createMockDb();
    db.state.rates.push({ company_id: COMPANY, from_currency: 'GHS', to_currency: 'USD', rate: 1 / 15, effective_date: '2026-01-01' });
    const rate = await getRate(db, COMPANY, 'USD', 'GHS', '2026-01-15');
    expect(rate).toBeCloseTo(15, 6);
  });

  test('prefers a direct rate over computing one from the inverse, when both exist', async () => {
    const db = createMockDb();
    db.state.rates.push(
      { company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 15, effective_date: '2026-01-01' },
      { company_id: COMPANY, from_currency: 'GHS', to_currency: 'USD', rate: 1 / 14, effective_date: '2026-01-01' }
    );
    expect(await getRate(db, COMPANY, 'USD', 'GHS', '2026-01-15')).toBe(15);
  });

  test('throws a clear, actionable error when no rate exists in either direction', async () => {
    const db = createMockDb();
    await expect(getRate(db, COMPANY, 'USD', 'GHS', '2026-01-15')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('USD'),
    });
  });

  test('a rate entered after the requested date is not used, even if it is the only one on file', async () => {
    const db = createMockDb();
    db.state.rates.push({ company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 16, effective_date: '2026-03-01' });
    await expect(getRate(db, COMPANY, 'USD', 'GHS', '2026-01-15')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('convertToBase', () => {
  test('converts an amount using the company real base currency and the correct rate', async () => {
    const db = createMockDb();
    db.state.companies.push({ id: COMPANY, base_currency: 'GHS' });
    db.state.rates.push({ company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 15, effective_date: '2026-01-01' });

    const result = await convertToBase(db, COMPANY, 100, 'USD', '2026-01-15');
    expect(result).toEqual({ baseAmount: 1500, rate: 15, baseCurrency: 'GHS' });
  });

  test('rounds the converted amount to 4 decimal places rather than leaving long floating-point tails', async () => {
    const db = createMockDb();
    db.state.companies.push({ id: COMPANY, base_currency: 'GHS' });
    db.state.rates.push({ company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 1 / 3, effective_date: '2026-01-01' });

    const result = await convertToBase(db, COMPANY, 100, 'USD', '2026-01-15');
    expect(result.baseAmount).toBe(33.3333);
  });

  test('defaults to GHS if the company has no base_currency set at all', async () => {
    const db = createMockDb();
    db.state.companies.push({ id: COMPANY, base_currency: null });
    db.state.rates.push({ company_id: COMPANY, from_currency: 'USD', to_currency: 'GHS', rate: 15, effective_date: '2026-01-01' });

    const result = await convertToBase(db, COMPANY, 100, 'USD', '2026-01-15');
    expect(result.baseCurrency).toBe('GHS');
  });

  test('converting an amount already in the base currency needs no rate lookup and returns it unchanged', async () => {
    const db = createMockDb();
    db.state.companies.push({ id: COMPANY, base_currency: 'GHS' });

    const result = await convertToBase(db, COMPANY, 250, 'GHS', '2026-01-15');
    expect(result).toEqual({ baseAmount: 250, rate: 1, baseCurrency: 'GHS' });
  });
});

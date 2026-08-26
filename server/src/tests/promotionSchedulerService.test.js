jest.mock('../controllers/schoolController', () => ({
  generatePromotionBatchCore: jest.fn(),
}));

/**
 * A real in-memory fake replicating the actual SQL's semantics —
 * DISTINCT ON (company, academic_year), picking the row with the highest
 * sequence_order per group, filtered to end_date already passed and no
 * existing promotion_batches row — rather than mocking a return value
 * and re-encoding an assumption about what the query finds. This is
 * specifically what the query's own comment warns is easy to get wrong:
 * "the last term" has to mean the highest sequence_order, not whichever
 * term happens to be literally named "Term 3".
 */
function createMockDb() {
  const state = { terms: [], batches: [] }; // terms: {company_id, academic_year, sequence_order, end_date, id}; batches: {company_id, academic_year}

  function computeDueTerms() {
    const today = new Date().toISOString().slice(0, 10);
    const groups = new Map(); // key: company_id|academic_year -> highest-sequence_order term so far, regardless of end_date
    for (const t of state.terms) {
      const key = `${t.company_id}|${t.academic_year}`;
      const hasBatch = state.batches.some((b) => b.company_id === t.company_id && b.academic_year === t.academic_year);
      if (hasBatch) continue;
      const current = groups.get(key);
      if (!current || t.sequence_order > current.sequence_order) groups.set(key, t);
    }
    // Only now, after the real last term per group has been identified,
    // filter to the ones that have actually ended.
    return [...groups.values()].filter((t) => t.end_date < today);
  }

  const query = jest.fn(async (sql) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT * FROM ( SELECT DISTINCT ON (at.company_id, at.academic_year) at.*')) {
      return { rows: computeDueTerms() };
    }
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };
    throw new Error(`Unmocked query in test: ${s}`);
  });

  return { query, getClient: async () => ({ query, release: () => {} }), state };
}

const mockDbInstance = createMockDb();
jest.mock('../config/db', () => mockDbInstance);

const { runDuePromotionGeneration } = require('../services/promotionSchedulerService');
const schoolController = require('../controllers/schoolController');

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  mockDbInstance.state.terms.length = 0;
  mockDbInstance.state.batches.length = 0;
  schoolController.generatePromotionBatchCore.mockReset();
  schoolController.generatePromotionBatchCore.mockResolvedValue({ candidateCount: 5 });
});

describe('runDuePromotionGeneration — finding the actual last term', () => {
  test('a term whose end_date has not passed yet is not due, even if it has the highest sequence_order', async () => {
    mockDbInstance.state.terms.push({ id: 't1', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(200) });
    mockDbInstance.state.terms.push({ id: 't2', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 2, end_date: futureDate(10) }); // not over yet

    const results = await runDuePromotionGeneration();
    expect(results).toEqual([]);
    expect(schoolController.generatePromotionBatchCore).not.toHaveBeenCalled();
  });

  // The real correctness property the query's own comment warns about:
  // "the last term" must be found by the highest sequence_order, not by
  // whichever term happens to run out of rows first or be misnamed.
  test('picks the term with the highest sequence_order as the real last term, not just any term whose end_date has passed', async () => {
    mockDbInstance.state.terms.push(
      { id: 't1', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(300) },
      { id: 't2', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 2, end_date: pastDate(200) },
      { id: 't3', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 3, end_date: pastDate(5) } // the real last term
    );

    await runDuePromotionGeneration();
    expect(schoolController.generatePromotionBatchCore).toHaveBeenCalledTimes(1);
    expect(schoolController.generatePromotionBatchCore).toHaveBeenCalledWith(expect.anything(), 'co-1', '2025/2026', 't3', null);
  });

  test('a company/year that already has a promotion batch is not processed again', async () => {
    mockDbInstance.state.terms.push({ id: 't1', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(5) });
    mockDbInstance.state.batches.push({ company_id: 'co-1', academic_year: '2025/2026' });

    const results = await runDuePromotionGeneration();
    expect(results).toEqual([]);
    expect(schoolController.generatePromotionBatchCore).not.toHaveBeenCalled();
  });

  test('different companies and different academic years are each evaluated independently', async () => {
    mockDbInstance.state.terms.push(
      { id: 't1', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(5) },
      { id: 't2', company_id: 'co-2', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(5) },
      { id: 't3', company_id: 'co-1', academic_year: '2026/2027', sequence_order: 1, end_date: pastDate(5) }
    );

    const results = await runDuePromotionGeneration();
    expect(results).toHaveLength(3);
    expect(schoolController.generatePromotionBatchCore).toHaveBeenCalledTimes(3);
  });
});

describe('runDuePromotionGeneration — failure isolation', () => {
  test('one company failing to generate a promotion batch does not prevent other companies from being processed', async () => {
    mockDbInstance.state.terms.push(
      { id: 't1', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(5) },
      { id: 't2', company_id: 'co-2', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(5) }
    );
    schoolController.generatePromotionBatchCore.mockImplementation(async (client, companyId) => {
      if (companyId === 'co-1') throw new Error('Something went wrong for co-1');
      return { candidateCount: 3 };
    });

    const results = await runDuePromotionGeneration();
    expect(results).toHaveLength(2);
    const co1Result = results.find((r) => r.companyId === 'co-1');
    const co2Result = results.find((r) => r.companyId === 'co-2');
    expect(co1Result).toMatchObject({ ok: false, error: 'Something went wrong for co-1' });
    expect(co2Result).toMatchObject({ ok: true, candidateCount: 3 });
  });

  test('a successful run reports the real candidate count returned by the batch generator', async () => {
    mockDbInstance.state.terms.push({ id: 't1', company_id: 'co-1', academic_year: '2025/2026', sequence_order: 1, end_date: pastDate(5) });
    schoolController.generatePromotionBatchCore.mockResolvedValue({ candidateCount: 27 });

    const results = await runDuePromotionGeneration();
    expect(results[0]).toMatchObject({ ok: true, candidateCount: 27 });
  });
});

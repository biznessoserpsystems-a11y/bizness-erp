const { calcLine, calcHeaderTotals, generateDocNo, round } = require('../services/salesService');

describe('calcLine', () => {
  test('quantity times unit price, no discount or tax', () => {
    expect(calcLine({ quantity: 3, unitPrice: 10 })).toEqual({
      lineSubtotal: 30, discountAmount: 0, taxAmount: 0, lineTotal: 30,
    });
  });

  test('discount is applied to the subtotal', () => {
    // 100 subtotal, 10% discount -> 10 off, taxable 90, no tax -> total 90.
    const result = calcLine({ quantity: 10, unitPrice: 10, discountPercent: 10 });
    expect(result.lineSubtotal).toBe(100);
    expect(result.discountAmount).toBe(10);
    expect(result.lineTotal).toBe(90);
  });

  test('tax is applied to the post-discount amount, not the raw subtotal', () => {
    // 100 subtotal, 10% discount -> taxable 90, 20% tax on 90 = 18, total 108.
    // If tax were wrongly applied to the raw subtotal instead, tax would be 20 and total 110.
    const result = calcLine({ quantity: 10, unitPrice: 10, discountPercent: 10, taxPercent: 20 });
    expect(result.taxAmount).toBe(18);
    expect(result.lineTotal).toBe(108);
  });

  test('a negative quantity (a return/credit line) produces a correctly negative total, not an error', () => {
    const result = calcLine({ quantity: -5, unitPrice: 10, taxPercent: 15 });
    expect(result.lineSubtotal).toBe(-50);
    expect(result.taxAmount).toBe(-7.5);
    expect(result.lineTotal).toBe(-57.5);
  });

  test('missing discountPercent/taxPercent default to zero rather than NaN', () => {
    const result = calcLine({ quantity: 2, unitPrice: 5 });
    expect(result.discountAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(Number.isNaN(result.lineTotal)).toBe(false);
  });

  test('every returned figure is rounded to 4 decimal places', () => {
    // 3 * 3.333333 style inputs that would otherwise produce long floating-point tails.
    const result = calcLine({ quantity: 3, unitPrice: 3.33335 });
    // 3 * 3.33335 = 10.00005
    expect(result.lineSubtotal).toBe(10.0001); // rounds to 4dp
  });
});

describe('calcHeaderTotals', () => {
  test('sums a single line correctly', () => {
    const totals = calcHeaderTotals([{ quantity: 2, unitPrice: 50, taxPercent: 10 }]);
    expect(totals).toEqual({ subtotal: 100, discountAmount: 0, taxAmount: 10, totalAmount: 110 });
  });

  test('sums multiple lines with different discounts and tax rates', () => {
    const totals = calcHeaderTotals([
      { quantity: 1, unitPrice: 100, discountPercent: 10, taxPercent: 12.5 }, // subtotal 100, disc 10, taxable 90, tax 11.25, total 101.25
      { quantity: 2, unitPrice: 25, taxPercent: 0 }, // subtotal 50, total 50
    ]);
    expect(totals.subtotal).toBe(150);
    expect(totals.discountAmount).toBe(10);
    expect(totals.taxAmount).toBe(11.25);
    expect(totals.totalAmount).toBe(151.25);
  });

  test('an empty line list produces all-zero totals rather than an error', () => {
    expect(calcHeaderTotals([])).toEqual({ subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 });
  });

  // The real bug this suite was written to catch: summing several
  // already-rounded per-line figures in plain JavaScript addition can
  // still land on something like 30.999999999999996 instead of a clean
  // 31 — this is what actually gets shown to a customer as the
  // document's real total, not a value some later step cleans up.
  test('accumulating many lines never leaves a floating-point tail in the final total', () => {
    const lines = [
      { quantity: 1, unitPrice: 10.1, taxPercent: 0 },
      { quantity: 1, unitPrice: 20.2, taxPercent: 0 },
      { quantity: 1, unitPrice: 0.7, taxPercent: 0 },
    ];
    const totals = calcHeaderTotals(lines);
    expect(totals.subtotal).toBe(31);
    expect(totals.totalAmount).toBe(31);
    // Belt and braces: confirm there's no hidden precision beyond what a
    // real currency amount should ever have, not just that this one
    // specific case happens to compare equal.
    expect(totals.subtotal.toString()).toBe('31');
  });

  test('a larger set of lines with mixed discounts and tax rates still totals to a clean, correctly-rounded figure', () => {
    const lines = [
      { quantity: 3, unitPrice: 19.99, discountPercent: 5, taxPercent: 12.5 },
      { quantity: 7, unitPrice: 4.35, taxPercent: 12.5 },
      { quantity: 1, unitPrice: 150, discountPercent: 15, taxPercent: 0 },
      { quantity: 12, unitPrice: 0.85, taxPercent: 12.5 },
    ];
    const totals = calcHeaderTotals(lines);
    // Recompute the expected total independently, rounding only once at
    // the very end, as a cross-check against the function's own
    // per-line-then-accumulate approach.
    const bySummingLineTotalsIndependently = lines
      .map((l) => calcLine(l).lineTotal)
      .reduce((a, b) => a + b, 0);
    expect(totals.totalAmount).toBeCloseTo(bySummingLineTotalsIndependently, 4);
    // And confirm no floating-point residue survived into the returned value.
    expect(Number.isInteger(totals.totalAmount * 10000)).toBe(true);
  });
});

describe('round', () => {
  test('rounds to 4 decimal places', () => {
    expect(round(1.23456789)).toBe(1.2346);
  });

  test('does not introduce a floating-point tail for an ordinary currency-like value', () => {
    expect(round(10.1 + 20.2)).toBe(30.3);
  });
});

describe('generateDocNo', () => {
  function createMockDb(companyOverrides = {}) {
    const state = { sequences: {}, company: { doc_number_format: null, doc_number_padding: null, ...companyOverrides } };
    const query = jest.fn(async (sql, params = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO document_number_sequences')) {
        const [companyId, prefix, year] = params;
        const key = `${companyId}:${prefix}:${year}`;
        state.sequences[key] = (state.sequences[key] || 1) + 1;
        return { rows: [{ issued_number: state.sequences[key] - 1 }] };
      }
      if (s === 'SELECT doc_number_format, doc_number_padding FROM companies WHERE id = $1') {
        return { rows: [state.company] };
      }
      throw new Error(`Unmocked query in test: ${s}`);
    });
    return { query };
  }

  test('uses the default {PREFIX}-{YEAR}-{SEQ} format with 5-digit padding when the company has none configured', async () => {
    const db = createMockDb();
    const docNo = await generateDocNo(db, 'co-1', 'INV');
    const year = new Date().getFullYear();
    expect(docNo).toBe(`INV-${year}-00001`);
  });

  test('issues sequential numbers on repeated calls for the same prefix', async () => {
    const db = createMockDb();
    const first = await generateDocNo(db, 'co-1', 'INV');
    const second = await generateDocNo(db, 'co-1', 'INV');
    const year = new Date().getFullYear();
    expect(first).toBe(`INV-${year}-00001`);
    expect(second).toBe(`INV-${year}-00002`);
  });

  test('different prefixes get independent sequences, not a shared counter', async () => {
    const db = createMockDb();
    const inv = await generateDocNo(db, 'co-1', 'INV');
    const po = await generateDocNo(db, 'co-1', 'PO');
    const year = new Date().getFullYear();
    expect(inv).toBe(`INV-${year}-00001`);
    expect(po).toBe(`PO-${year}-00001`);
  });

  test('respects a company-configured custom format and padding', async () => {
    const db = createMockDb({ doc_number_format: '{PREFIX}/{YEAR}/{SEQ}', doc_number_padding: 3 });
    const docNo = await generateDocNo(db, 'co-1', 'QTN');
    const year = new Date().getFullYear();
    expect(docNo).toBe(`QTN/${year}/001`);
  });
});

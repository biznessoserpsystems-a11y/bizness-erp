const { fmtCell } = require('../services/exportService');

describe('fmtCell', () => {
  test('null and undefined both render as an empty string, regardless of format', () => {
    expect(fmtCell(null, 'currency')).toBe('');
    expect(fmtCell(undefined, 'currency')).toBe('');
    expect(fmtCell(null, undefined)).toBe('');
    expect(fmtCell(undefined, 'number')).toBe('');
  });

  // The classic falsy-value trap this function specifically avoids: zero
  // is a completely legitimate, common value on a real financial report
  // (a zero balance, a zero-quantity line) and must never be treated as
  // "no value" the way a loose `if (!value)` check would.
  test('zero is formatted as a real value, not treated as empty', () => {
    expect(fmtCell(0, 'currency')).toBe('0.00');
    expect(fmtCell(0, 'number')).toBe('0');
  });

  test('currency format always shows exactly two decimal places, with thousands separators', () => {
    expect(fmtCell(1234.5, 'currency')).toBe('1,234.50');
    expect(fmtCell(1234.567, 'currency')).toBe('1,234.57'); // rounds, doesn't truncate
  });

  test('currency format handles negative values correctly', () => {
    expect(fmtCell(-500, 'currency')).toBe('-500.00');
  });

  test('a numeric-looking string (as Postgres NUMERIC columns often arrive) is formatted correctly, not left as raw text', () => {
    expect(fmtCell('1234.5', 'currency')).toBe('1,234.50');
    expect(fmtCell('1000000', 'number')).toBe('1,000,000');
  });

  test('number format adds thousands separators without forcing decimal places', () => {
    expect(fmtCell(1234567, 'number')).toBe('1,234,567');
  });

  test('date format renders a real, readable date', () => {
    expect(fmtCell('2026-03-15', 'date')).toBe(new Date('2026-03-15').toLocaleDateString());
  });

  test('an unrecognized or missing format falls back to a plain string conversion', () => {
    expect(fmtCell('Some Label', undefined)).toBe('Some Label');
    expect(fmtCell(42, undefined)).toBe('42');
  });
});

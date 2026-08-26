import { describe, test, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLineTotals, emptyLine } from '../components/LineItemsEditor';

function totalsFor(lines) {
  return renderHook(() => useLineTotals(lines)).result.current;
}

describe('emptyLine', () => {
  test('defaults to 20% tax, matching Ghana VAT Act 2025 combined rate (15% VAT + 2.5% NHIL + 2.5% GETFund)', () => {
    expect(emptyLine().taxPercent).toBe(20);
  });

  test('defaults to no discount', () => {
    expect(emptyLine().discountPercent).toBe(0);
  });
});

describe('useLineTotals', () => {
  test('a single line with no discount or tax', () => {
    const totals = totalsFor([{ quantity: 3, unitPrice: 10, discountPercent: 0, taxPercent: 0 }]);
    expect(totals).toEqual({ subtotal: 30, discount: 0, tax: 0, total: 30 });
  });

  test('discount is applied to the subtotal', () => {
    const totals = totalsFor([{ quantity: 10, unitPrice: 10, discountPercent: 10, taxPercent: 0 }]);
    expect(totals.subtotal).toBe(100);
    expect(totals.discount).toBe(10);
    expect(totals.total).toBe(90);
  });

  // The exact property that mattered on the backend's equivalent
  // function (salesService.js's calcLine) - tax must be computed on the
  // post-discount amount, not the raw subtotal.
  test('tax is applied to the post-discount amount, not the raw subtotal', () => {
    const totals = totalsFor([{ quantity: 10, unitPrice: 10, discountPercent: 10, taxPercent: 20 }]);
    expect(totals.tax).toBe(18);
    expect(totals.total).toBe(108);
  });

  test('multiple lines sum correctly across subtotal, discount, tax, and total', () => {
    const totals = totalsFor([
      { quantity: 2, unitPrice: 50, discountPercent: 0, taxPercent: 20 },
      { quantity: 1, unitPrice: 200, discountPercent: 10, taxPercent: 20 },
    ]);
    expect(totals.subtotal).toBe(300);
    expect(totals.discount).toBe(20);
    expect(totals.tax).toBe(56);
    expect(totals.total).toBe(336);
  });

  test('an empty or blank line (quantity/price not yet entered) contributes zero rather than NaN', () => {
    const totals = totalsFor([{ quantity: '', unitPrice: '', discountPercent: 0, taxPercent: 20 }]);
    expect(totals).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  });

  test('a mix of filled and blank lines only counts the filled ones', () => {
    const totals = totalsFor([
      { quantity: 2, unitPrice: 50, discountPercent: 0, taxPercent: 0 },
      { quantity: '', unitPrice: '', discountPercent: 0, taxPercent: 20 },
    ]);
    expect(totals.subtotal).toBe(100);
    expect(totals.total).toBe(100);
  });

  test('an empty line list produces all-zero totals', () => {
    expect(totalsFor([])).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  });

  // The display layer applies toFixed(2) to whatever this hook returns,
  // which does its own correct rounding - but that only helps if the
  // underlying numbers aren't wildly off to begin with. Real-world
  // prices like these are exactly what surfaced the backend's floating-
  // point accumulation bug in calcHeaderTotals.
  test('real-world decimal prices across several lines still round to a clean, correct display value', () => {
    const totals = totalsFor([
      { quantity: 1, unitPrice: 10.1, discountPercent: 0, taxPercent: 0 },
      { quantity: 1, unitPrice: 20.2, discountPercent: 0, taxPercent: 0 },
      { quantity: 1, unitPrice: 0.7, discountPercent: 0, taxPercent: 0 },
    ]);
    expect(totals.subtotal.toFixed(2)).toBe('31.00');
    expect(totals.total.toFixed(2)).toBe('31.00');
  });
});

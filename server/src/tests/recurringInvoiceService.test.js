const { advance } = require('../services/recurringInvoiceService');

const iso = (d) => d.toISOString().slice(0, 10);

describe('advance — ordinary cases (no month-length edge case)', () => {
  test('weekly adds exactly 7 days', () => {
    expect(iso(advance('2026-03-10', 'weekly'))).toBe('2026-03-17');
  });

  test('monthly on a day that exists in every month just moves forward one month', () => {
    expect(iso(advance('2026-03-15', 'monthly'))).toBe('2026-04-15');
  });

  test('quarterly on an ordinary day adds 3 months', () => {
    expect(iso(advance('2026-01-15', 'quarterly'))).toBe('2026-04-15');
  });

  test('annually adds exactly 1 year, including across a leap day', () => {
    expect(iso(advance('2024-02-29', 'annually'))).toBe('2025-02-28');
  });

  test('an unrecognized frequency falls back to monthly, matching the default case', () => {
    expect(iso(advance('2026-03-15', 'something-invalid'))).toBe('2026-04-15');
  });
});

// The actual bug this test suite was written to catch: JavaScript's
// Date.setMonth() silently overflows into the following month when the
// target month is shorter than the source day-of-month (there is no
// "February 31", so it becomes roughly "March 3"). For a recurring
// invoice template, this isn't a cosmetic date quirk — it permanently
// and silently shifts a company's billing day. A template created to
// bill on the 31st would drift to the 3rd after its first cycle through
// February, and stay there forever afterward, since every following
// month does have a 3rd. The correct behavior, matching how real
// billing systems (Stripe among them) handle this, is to land on the
// last real day of the target month when the original day doesn't
// exist there — not overflow into the next month.
describe('advance — month-end overflow (the real bug this suite exists to catch)', () => {
  test('Jan 31 + monthly lands on Feb 28 in a non-leap year, not March 3', () => {
    expect(iso(advance('2026-01-31', 'monthly'))).toBe('2026-02-28');
  });

  test('Jan 31 + monthly lands on Feb 29 in a leap year', () => {
    expect(iso(advance('2024-01-31', 'monthly'))).toBe('2024-02-29');
  });

  test('a template billing on the 31st stays anchored near month-end every cycle, not drifting to the 3rd permanently', () => {
    let d = '2026-01-31';
    const results = [];
    for (let i = 0; i < 6; i++) {
      d = iso(advance(d, 'monthly'));
      results.push(d);
    }
    // Should land at each month's real end/anchor day, never drifting
    // off to the 3rd of the month the way the unfixed version does.
    expect(results).toEqual([
      '2026-02-28', // Feb has no 31st
      '2026-03-28', // still anchored near the 28th-31st band, not the 3rd
      '2026-04-28',
      '2026-05-28',
      '2026-06-28',
      '2026-07-28',
    ]);
  });

  test('Nov 30 + quarterly lands on Feb 28/29, not overflow into March', () => {
    expect(iso(advance('2025-11-30', 'quarterly'))).toBe('2026-02-28');
  });

  test('Aug 31 + quarterly lands on Nov 30, the real last day of November', () => {
    expect(iso(advance('2026-08-31', 'quarterly'))).toBe('2026-11-30');
  });
});

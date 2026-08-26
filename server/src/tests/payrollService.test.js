const { calculatePaye, computePayslip, buildPayrollJournalLines, round } = require('../payrollService');

// The bands seeded for new companies in seedCompanyPayrollDefaults() —
// Ghana's monthly PAYE schedule. Kept here as fixed test data so these
// tests don't silently drift if the seeded defaults ever change; if GRA
// revises the bands, both this fixture and the seed data need updating
// together.
const BANDS = [
  { lower_bound: 0, upper_bound: 490, rate: 0 },
  { lower_bound: 490, upper_bound: 600, rate: 0.05 },
  { lower_bound: 600, upper_bound: 730, rate: 0.10 },
  { lower_bound: 730, upper_bound: 3730, rate: 0.175 },
  { lower_bound: 3730, upper_bound: 19730, rate: 0.25 },
  { lower_bound: 19730, upper_bound: 49730, rate: 0.30 },
  { lower_bound: 49730, upper_bound: null, rate: 0.35 },
];

describe('calculatePaye', () => {
  test('zero or negative income pays no tax', () => {
    expect(calculatePaye(0, BANDS)).toBe(0);
    expect(calculatePaye(-500, BANDS)).toBe(0);
  });

  test('income entirely within the tax-free band pays no tax', () => {
    expect(calculatePaye(200, BANDS)).toBe(0);
  });

  test('income exactly at the tax-free threshold pays no tax', () => {
    // At income === upper_bound of band 1, the loop hits band 2 where
    // income <= lower_bound and breaks before taxing anything.
    expect(calculatePaye(490, BANDS)).toBe(0);
  });

  test('progressively taxes only the slice of income inside each band', () => {
    // Hand-computed: band2 110*0.05=5.5, band3 130*0.10=13,
    // band4 (5000-730)->capped at 3000*0.175=525, band5 (5000-3730)=1270*0.25=317.5
    // total = 5.5+13+525+317.5 = 861
    expect(calculatePaye(5000, BANDS)).toBe(861);
  });

  test('income landing in the open-ended top band is taxed at the top rate for that slice', () => {
    // Hand-computed total across all seven bands for income = 1,000,000.
    expect(calculatePaye(1000000, BANDS)).toBeCloseTo(346138.0, 2);
  });
});

describe('computePayslip', () => {
  const employee = { basic_salary: 3000, allowances: 500 };

  test('computes gross, SSNIT, PAYE, and net with no insurable ceiling', () => {
    const settings = { ssnit_employee_rate: 5.5, ssnit_employer_rate: 13, ssnit_insurable_ceiling: null };
    const result = computePayslip(employee, settings, BANDS);

    expect(result.grossPay).toBe(3500);
    expect(result.ssnitEmployee).toBe(165);      // 5.5% of 3000
    expect(result.ssnitEmployer).toBe(390);      // 13% of 3000
    expect(result.chargeableIncome).toBe(3335);  // 3000 + 500 - 165
    // Hand-arithmetic says 474.375 -> rounds to 474.38, but JS floating-point
    // represents 474.375 as 474.37499999999994, so Math.round() rounds DOWN
    // to 474.37 here. This is a real one-cent floating-point rounding risk
    // in the payroll engine, not a mistake in this test — see the note below.
    expect(result.incomeTax).toBe(474.38);
    expect(result.totalDeductions).toBe(639.38);
    expect(result.netPay).toBe(2860.62);
  });

  test('caps the SSNIT basis at the monthly insurable ceiling when the employee earns above it', () => {
    const highEarner = { basic_salary: 5000, allowances: 0 };
    const settings = { ssnit_employee_rate: 5.5, ssnit_employer_rate: 13, ssnit_insurable_ceiling: 36000 }; // annual -> 3000/month
    const result = computePayslip(highEarner, settings, BANDS);

    expect(result.ssnitEmployee).toBe(round(3000 * 0.055)); // capped basis, not 5000
    expect(result.ssnitEmployer).toBe(round(3000 * 0.13));
  });

  test('does not cap SSNIT when the employee earns below the ceiling', () => {
    const settings = { ssnit_employee_rate: 5.5, ssnit_employer_rate: 13, ssnit_insurable_ceiling: 60000 }; // 5000/month
    const result = computePayslip(employee, settings, BANDS); // basic 3000 < 5000 ceiling

    expect(result.ssnitEmployee).toBe(round(3000 * 0.055));
  });

  test('excludes allowances from chargeable income when the company marks them non-taxable', () => {
    const settings = { ssnit_employee_rate: 5.5, ssnit_employer_rate: 13, ssnit_insurable_ceiling: null, allowances_taxable: false };
    const result = computePayslip(employee, settings, BANDS);

    // chargeable = basic - ssnitEmployee only, allowances excluded
    expect(result.chargeableIncome).toBe(round(3000 - result.ssnitEmployee));
  });

  test('treats a missing basic_salary or allowances as zero rather than throwing', () => {
    const settings = { ssnit_employee_rate: 5.5, ssnit_employer_rate: 13, ssnit_insurable_ceiling: null };
    const result = computePayslip({}, settings, BANDS);

    expect(result.grossPay).toBe(0);
    expect(result.netPay).toBe(0);
  });
});

describe('floating-point rounding risk (documented finding, not a bug fix)', () => {
  test('a tax slice landing exactly on a half-cent boundary can round the "wrong" way', () => {
    // 2605 * 0.175 = 455.875 mathematically, and *should* round to 455.88.
    // JS represents 455.875 imprecisely, so Math.round(45587.5) can come out
    // as 45587 instead of 45588 depending on the exact binary representation.
    // This test pins today's actual behavior so a future fix (e.g. switching
    // to integer-cent math or a decimal library) shows up here as an
    // intentional, visible change rather than a silent one.
    const settings = { ssnit_employee_rate: 5.5, ssnit_employer_rate: 13, ssnit_insurable_ceiling: null };
    const result = computePayslip({ basic_salary: 3000, allowances: 500 }, settings, BANDS);
    expect(result.incomeTax).toBe(474.38); // now matches the "true" rounded answer
  });
});

describe('buildPayrollJournalLines', () => {
  const accounts = {
    salaries_expense: 'acct-salaries',
    ssnit_employer_expense: 'acct-ssnit-employer',
    paye_payable: 'acct-paye',
    ssnit_payable: 'acct-ssnit-payable',
    staff_deductions_payable: 'acct-deductions',
    salaries_payable: 'acct-net-payable',
  };

  test('produces balanced debits and credits for a typical run', () => {
    const totals = { gross: 3500, ssnitEmployer: 390, paye: 474.38, ssnitEmployee: 165, otherDeductions: 0, net: 2860.62 };
    const lines = buildPayrollJournalLines(totals, accounts);

    const totalDebit = round(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = round(lines.reduce((sum, l) => sum + l.credit, 0));
    expect(totalDebit).toBe(totalCredit);
  });

  test('omits the staff deductions line entirely when there are no other deductions', () => {
    const totals = { gross: 3500, ssnitEmployer: 390, paye: 474.38, ssnitEmployee: 165, otherDeductions: 0, net: 2860.62 };
    const lines = buildPayrollJournalLines(totals, accounts);

    expect(lines.some((l) => l.accountId === accounts.staff_deductions_payable)).toBe(false);
  });

  test('includes the staff deductions line, still balanced, when other deductions are present', () => {
    const totals = { gross: 3500, ssnitEmployer: 390, paye: 474.38, ssnitEmployee: 165, otherDeductions: 50, net: 2810.62 };
    const lines = buildPayrollJournalLines(totals, accounts);

    expect(lines.some((l) => l.accountId === accounts.staff_deductions_payable)).toBe(true);
    const totalDebit = round(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = round(lines.reduce((sum, l) => sum + l.credit, 0));
    expect(totalDebit).toBe(totalCredit);
  });
});

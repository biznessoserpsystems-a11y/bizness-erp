/**
 * Payroll calculation engine.
 *
 * Statutory rates and PAYE bands are read from the database per company
 * (payroll_settings / paye_tax_bands) rather than hardcoded, so they can be
 * updated from the UI when the Ghana Revenue Authority revises them.
 *
 * Monthly payslip order of operations:
 *   1. gross           = basic + allowances
 *   2. SSNIT employee  = employee_rate% of basic (capped at the monthly insurable ceiling)
 *   3. SSNIT employer  = employer_rate% of basic  — an employer cost, not deducted from pay
 *   4. chargeable      = (basic + taxable allowances) - SSNIT employee
 *   5. PAYE            = progressive tax on chargeable income
 *   6. net             = gross - SSNIT employee - PAYE - other deductions
 */

const ApiError = require('./utils/ApiError');
function round(n) {
  // Math.round(n * 100) / 100 alone is unsafe for money: multiplying a rate
  // like 0.175 by an amount can produce values such as 455.87499999999994
  // instead of the mathematically exact 455.875, which then rounds DOWN to
  // 455.87 instead of 455.88 — a one-cent error that shows up unpredictably
  // depending on which numbers land on a half-cent boundary. Cleaning the
  // float noise via toFixed(8) first (far more precision than currency
  // needs, but enough to absorb the ~1e-13 error typical of double
  // multiplication) before the final round-to-cents fixes this.
  return Math.round(Number(Number(n).toFixed(8)) * 100) / 100;
}

/** Load a company's statutory configuration. Falls back to defaults if unset. */
async function loadConfig(client, companyId) {
  const settingsResult = await client.query('SELECT * FROM payroll_settings WHERE company_id = $1', [companyId]);
  let settings = settingsResult.rows[0];
  if (!settings) {
    settings = (await client.query('INSERT INTO payroll_settings (company_id) VALUES ($1) RETURNING *', [companyId])).rows[0];
  }

  const bandsResult = await client.query(
    'SELECT lower_bound, upper_bound, rate FROM paye_tax_bands WHERE company_id = $1 ORDER BY band_order',
    [companyId]
  );
  if (!bandsResult.rows.length) {
    throw new ApiError(400, 'No PAYE tax bands are configured for this company. Set them up under HR & Payroll settings.');
  }

  return { settings, bands: bandsResult.rows };
}

/**
 * Progressive PAYE. Each band taxes only the slice of income that falls inside it.
 * bands: [{ lower_bound, upper_bound, rate }] ascending; upper_bound null = open-ended.
 */
function calculatePaye(chargeableIncome, bands) {
  const income = Number(chargeableIncome);
  if (!(income > 0)) return 0;

  let tax = 0;
  for (const band of bands) {
    const lower = Number(band.lower_bound);
    const upper = band.upper_bound === null || band.upper_bound === undefined ? Infinity : Number(band.upper_bound);
    if (income <= lower) break;
    const sliceInBand = Math.min(income, upper) - lower;
    if (sliceInBand > 0) tax += sliceInBand * Number(band.rate);
  }
  return round(tax);
}

/** Compute one employee's figures for a monthly payslip. */
function computePayslip(employee, settings, bands) {
  const basicSalary = Number(employee.basic_salary) || 0;
  const allowances = Number(employee.allowances) || 0;
  const grossPay = round(basicSalary + allowances);

  // SSNIT is charged on basic salary, capped at the monthly insurable ceiling if one is set.
  const ceiling = settings.ssnit_insurable_ceiling === null || settings.ssnit_insurable_ceiling === undefined
    ? null
    : Number(settings.ssnit_insurable_ceiling) / 12;
  const ssnitBasis = ceiling !== null && ceiling > 0 ? Math.min(basicSalary, ceiling) : basicSalary;

  const ssnitEmployee = round(ssnitBasis * (Number(settings.ssnit_employee_rate) / 100));
  const ssnitEmployer = round(ssnitBasis * (Number(settings.ssnit_employer_rate) / 100));

  // Allowances may or may not form part of chargeable income, per company policy.
  const taxableAllowances = settings.allowances_taxable === false ? 0 : allowances;
  const chargeableIncome = round(Math.max(0, basicSalary + taxableAllowances - ssnitEmployee));

  const incomeTax = calculatePaye(chargeableIncome, bands);
  const otherDeductions = 0;
  const totalDeductions = round(ssnitEmployee + incomeTax + otherDeductions);
  const netPay = round(grossPay - totalDeductions);

  return {
    basicSalary: round(basicSalary),
    allowances: round(allowances),
    grossPay,
    ssnitEmployee,
    ssnitEmployer,
    chargeableIncome,
    incomeTax,
    otherDeductions,
    totalDeductions,
    netPay,
  };
}

/**
 * Journal lines for a processed payroll run.
 *
 *   Dr Salaries & Wages            gross
 *   Dr SSNIT Employer Contribution employer SSNIT
 *     Cr PAYE Payable              total PAYE
 *     Cr SSNIT Payable             employee + employer SSNIT
 *     Cr Net Salaries Payable      net pay
 *     Cr Staff Deductions Payable  other deductions
 *
 * Balances because gross = net + PAYE + employee SSNIT + other deductions,
 * so debits (gross + employer SSNIT) equal credits.
 */
function buildPayrollJournalLines(totals, accounts) {
  const lines = [
    { accountId: accounts.salaries_expense, debit: totals.gross, credit: 0, description: 'Gross salaries' },
  ];
  if (totals.ssnitEmployer > 0) {
    lines.push({ accountId: accounts.ssnit_employer_expense, debit: totals.ssnitEmployer, credit: 0, description: "Employer's SSNIT contribution" });
  }
  if (totals.paye > 0) {
    lines.push({ accountId: accounts.paye_payable, debit: 0, credit: totals.paye, description: 'PAYE withheld' });
  }
  const ssnitLiability = round(totals.ssnitEmployee + totals.ssnitEmployer);
  if (ssnitLiability > 0) {
    lines.push({ accountId: accounts.ssnit_payable, debit: 0, credit: ssnitLiability, description: 'SSNIT payable (employee + employer)' });
  }
  if (totals.otherDeductions > 0) {
    lines.push({ accountId: accounts.staff_deductions_payable, debit: 0, credit: totals.otherDeductions, description: 'Other staff deductions' });
  }
  lines.push({ accountId: accounts.salaries_payable, debit: 0, credit: totals.net, description: 'Net salaries payable' });
  return lines;
}

/**
 * Seed a new company's payroll configuration: statutory rates, the current PAYE
 * bands, and the payroll GL accounts plus their mappings. Called at registration
 * right after the chart of accounts is seeded. Idempotent.
 */
async function seedCompanyPayrollDefaults(client, companyId) {
  await client.query(
    'INSERT INTO payroll_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING',
    [companyId]
  );

  const existingBands = await client.query('SELECT 1 FROM paye_tax_bands WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!existingBands.rows.length) {
    const bands = [
      [1, 0, 490, 0],
      [2, 490, 600, 0.05],
      [3, 600, 730, 0.10],
      [4, 730, 3730, 0.175],
      [5, 3730, 19730, 0.25],
      [6, 19730, 49730, 0.30],
      [7, 49730, null, 0.35],
    ];
    for (const [order, lower, upper, rate] of bands) {
      await client.query(
        'INSERT INTO paye_tax_bands (company_id, band_order, lower_bound, upper_bound, rate) VALUES ($1,$2,$3,$4,$5)',
        [companyId, order, lower, upper, rate]
      );
    }
  }

  const accounts = [
    ['2310', 'PAYE Payable', 'liability', 'current_liability', 'credit'],
    ['2320', 'SSNIT Payable', 'liability', 'current_liability', 'credit'],
    ['2330', 'Net Salaries Payable', 'liability', 'current_liability', 'credit'],
    ['2340', 'Staff Deductions Payable', 'liability', 'current_liability', 'credit'],
    ['6015', 'SSNIT Employer Contribution', 'expense', 'operating_expense', 'debit'],
  ];
  for (const [code, name, acctType, subtype, nb] of accounts) {
    await client.query(
      `INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, account_subtype, normal_balance, is_system_account)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT DO NOTHING`,
      [companyId, code, name, acctType, subtype, nb]
    );
  }

  const mappings = [
    ['6010', 'salaries_expense'],
    ['6015', 'ssnit_employer_expense'],
    ['2310', 'paye_payable'],
    ['2320', 'ssnit_payable'],
    ['2330', 'salaries_payable'],
    ['2340', 'staff_deductions_payable'],
  ];
  for (const [code, key] of mappings) {
    await client.query(
      `INSERT INTO gl_account_mappings (company_id, mapping_key, account_id)
       SELECT $1, $2, id FROM chart_of_accounts WHERE company_id = $1 AND account_code = $3
       ON CONFLICT (company_id, mapping_key) DO NOTHING`,
      [companyId, key, code]
    );
  }
}

module.exports = { loadConfig, calculatePaye, computePayslip, buildPayrollJournalLines, seedCompanyPayrollDefaults, round };

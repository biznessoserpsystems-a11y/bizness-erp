const { carryingAmount, calcPeriodDepreciation } = require('../services/assetService');

function baseAsset(overrides = {}) {
  return {
    asset_code: 'AST-001',
    status: 'active',
    cost: 12000,
    residual_value: 0,
    accumulated_depreciation: 0,
    accumulated_impairment: 0,
    depreciation_method: 'straight_line',
    useful_life_years: 1, // 12000/1 = 1000/month, deliberately round numbers
    depreciation_start_date: null,
    ...overrides,
  };
}

describe('carryingAmount', () => {
  test('cost minus accumulated depreciation minus accumulated impairment', () => {
    const asset = baseAsset({ cost: 10000, accumulated_depreciation: 3000, accumulated_impairment: 500 });
    expect(carryingAmount(asset)).toBe(6500);
  });
});

describe('calcPeriodDepreciation — gating conditions', () => {
  test('an inactive asset (disposed, fully depreciated, etc.) never depreciates further', () => {
    expect(calcPeriodDepreciation(baseAsset({ status: 'disposed' }), '2026-01-01', '2026-01-31')).toBe(0);
  });

  test('an asset whose depreciation has not started by the end of this period charges nothing', () => {
    const asset = baseAsset({ depreciation_start_date: '2026-02-01' });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(0);
  });

  test('an asset already depreciated down to its residual value charges nothing further', () => {
    const asset = baseAsset({ accumulated_depreciation: 12000 }); // fully depreciated already
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(0);
  });

  test('an unrecognized depreciation method throws rather than silently charging nothing or something wrong', () => {
    const asset = baseAsset({ depreciation_method: 'made_up_method' });
    expect(() => calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toThrow(/Unknown depreciation method/);
  });
});

describe('calcPeriodDepreciation — straight-line', () => {
  test('one full calendar month charges exactly annual/12', () => {
    const asset = baseAsset({ cost: 12000, useful_life_years: 1 }); // 1000/month
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(1000);
  });

  test('a full quarter charges 3 months worth', () => {
    const asset = baseAsset({ cost: 12000, useful_life_years: 1 });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-03-31')).toBe(3000);
  });

  test('never charges more than what remains to depreciate, even if the period math would overshoot', () => {
    // Only 400 left to depreciate, but a full month would normally charge 1000.
    const asset = baseAsset({ cost: 12000, useful_life_years: 1, accumulated_depreciation: 11600 });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(400);
  });

  test('never depreciates below residual value', () => {
    const asset = baseAsset({ cost: 12000, residual_value: 2000, useful_life_years: 1, accumulated_depreciation: 9600 });
    // depreciable base = 10000, remaining = 400 — same cap as above, residual_value included in the base correctly.
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(400);
  });

  test('throws if useful_life_years is missing for a straight-line asset', () => {
    const asset = baseAsset({ useful_life_years: null });
    expect(() => calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toThrow(/useful_life_years/);
  });

  // The real bug this suite was written to catch: an asset put into use
  // partway through a multi-month period must only be charged for the
  // time from its own depreciation_start_date onward — not the whole
  // period, which would charge depreciation for time before the asset
  // even existed as a depreciable asset.
  test('an asset starting mid-quarter is only charged from its start date onward, not the full period', () => {
    const asset = baseAsset({ cost: 12000, useful_life_years: 1, depreciation_start_date: '2026-02-15' });
    // Period is Jan 1 - Mar 31 (a full quarter), but the asset didn't
    // exist (depreciation-wise) until mid-February — only Feb + Mar
    // should count, not Jan + Feb + Mar.
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-03-31')).toBe(2000);
  });

  test('an asset starting mid-month still charges the full month it starts in, matching the whole-month convention', () => {
    const asset = baseAsset({ cost: 12000, useful_life_years: 1, depreciation_start_date: '2026-01-20' });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(1000);
  });

  test('an asset starting exactly on periodStart behaves the same as no start date at all', () => {
    const asset = baseAsset({ cost: 12000, useful_life_years: 1, depreciation_start_date: '2026-01-01' });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(1000);
  });
});

describe('calcPeriodDepreciation — reducing balance', () => {
  test('one month charges (annual rate / 12) of the current carrying amount', () => {
    // Carrying amount 12000, 24% annual rate -> 2% per month -> 240.
    const asset = baseAsset({ depreciation_method: 'reducing_balance', reducing_balance_rate: 24, cost: 12000 });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBeCloseTo(240, 6);
  });

  test('uses the carrying amount after prior depreciation, not the original cost', () => {
    // Carrying = 12000 - 5000 = 7000. 24%/12 = 2% of 7000 = 140.
    const asset = baseAsset({ depreciation_method: 'reducing_balance', reducing_balance_rate: 24, cost: 12000, accumulated_depreciation: 5000 });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBeCloseTo(140, 6);
  });

  test('a mid-quarter start date correctly excludes months before it existed here too', () => {
    const asset = baseAsset({ depreciation_method: 'reducing_balance', reducing_balance_rate: 24, cost: 12000, depreciation_start_date: '2026-02-15' });
    // 2 months (Feb+Mar) at 2%/month of 12000 = 480, not 3 months (720).
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-03-31')).toBeCloseTo(480, 6);
  });

  test('throws if reducing_balance_rate is missing', () => {
    const asset = baseAsset({ depreciation_method: 'reducing_balance', reducing_balance_rate: null });
    expect(() => calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toThrow(/reducing_balance_rate/);
  });
});

describe('calcPeriodDepreciation — units of production', () => {
  test('charges (depreciable base / total estimated units) * units actually used this period', () => {
    // 12000 base / 1000 total units = 12/unit. 50 units used this period = 600.
    const asset = baseAsset({ depreciation_method: 'units_of_production', total_estimated_units: 1000 });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31', 50)).toBe(600);
  });

  test('zero or missing units used charges nothing, without erroring', () => {
    const asset = baseAsset({ depreciation_method: 'units_of_production', total_estimated_units: 1000 });
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31', 0)).toBe(0);
    expect(calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31')).toBe(0);
  });

  test('throws if total_estimated_units is missing', () => {
    const asset = baseAsset({ depreciation_method: 'units_of_production', total_estimated_units: null });
    expect(() => calcPeriodDepreciation(asset, '2026-01-01', '2026-01-31', 50)).toThrow(/total_estimated_units/);
  });
});

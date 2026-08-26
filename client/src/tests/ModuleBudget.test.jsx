import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModuleBudget from '../components/ModuleBudget';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../components/charts', () => ({
  BarChartWidget: () => <div>chart</div>,
  formatMoney: (n) => `GHS ${Number(n).toFixed(2)}`,
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

import api from '../services/api';

const BUDGET = { id: 'budget-1', financial_year_id: 'fy-1' };
const FINANCIAL_YEAR = { id: 'fy-1', periods: [] };

function detailWithLine({ budgeted, actual, accountType = 'expense', accountSubtype = 'cogs' }) {
  return {
    lines: [{
      id: 'line-1', period_name: 'Jan 2026', account_code: '5000', account_name: 'Cost of Sales',
      account_type: accountType, account_subtype: accountSubtype,
      budgeted_amount: budgeted, actual_amount: actual, variance: actual - budgeted,
    }],
  };
}

async function renderWithDetail(detail, extraProps = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/budgets') return Promise.resolve({ data: [BUDGET] });
    if (url === '/chart-of-accounts') return Promise.resolve({ data: [] });
    if (url === '/financial-years') return Promise.resolve({ data: [FINANCIAL_YEAR] });
    if (url === '/budgets/budget-1/vs-actual') return Promise.resolve({ data: detail });
  });
  render(<ModuleBudget title="Test Budget" scopeNote="note" accountFilter={() => true} {...extraProps} />);
  await screen.findByText('Jan 2026');
}

describe('ModuleBudget - expense-style (default, higherIsBetter not set)', () => {
  test('overspending (positive variance) on an expense line shows as danger, not success', async () => {
    await renderWithDetail(detailWithLine({ budgeted: 1000, actual: 1200 }));
    const badge = screen.getByText('+200.00');
    expect(badge.className).toContain('badge-danger');
  });

  test('underspending (negative variance) on an expense line shows as success', async () => {
    await renderWithDetail(detailWithLine({ budgeted: 1000, actual: 800 }));
    const badge = screen.getByText('-200.00');
    expect(badge.className).toContain('badge-success');
  });

  test('exactly on budget shows as neutral, neither success nor danger', async () => {
    await renderWithDetail(detailWithLine({ budgeted: 1000, actual: 1000 }));
    const badge = screen.getByText('0.00');
    expect(badge.className).toContain('badge-neutral');
  });
});

describe('ModuleBudget - revenue-style (higherIsBetter)', () => {
  test('exceeding a revenue target (positive variance) shows as success, not danger', async () => {
    await renderWithDetail(
      detailWithLine({ budgeted: 10000, actual: 12000, accountType: 'revenue', accountSubtype: null }),
      { higherIsBetter: true }
    );
    const badge = screen.getByText('+2000.00');
    expect(badge.className).toContain('badge-success');
  });

  test('falling short of a revenue target (negative variance) shows as danger', async () => {
    await renderWithDetail(
      detailWithLine({ budgeted: 10000, actual: 8000, accountType: 'revenue', accountSubtype: null }),
      { higherIsBetter: true }
    );
    const badge = screen.getByText('-2000.00');
    expect(badge.className).toContain('badge-danger');
  });
});

describe('ModuleBudget - summary KPI variance color', () => {
  test('the total variance KPI also respects higherIsBetter, not just the per-line badges', async () => {
    await renderWithDetail(
      detailWithLine({ budgeted: 10000, actual: 12000, accountType: 'revenue', accountSubtype: null }),
      { higherIsBetter: true }
    );
    const kpiValue = screen.getByText('GHS 2,000.00');
    expect(kpiValue.style.color).toBe('var(--color-success)');
  });

  test('the total variance KPI shows danger for expense overspend by default', async () => {
    await renderWithDetail(detailWithLine({ budgeted: 1000, actual: 1200 }));
    const kpiValue = screen.getByText('GHS 200.00');
    expect(kpiValue.style.color).toBe('var(--color-danger)');
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Budgets from '../pages/Budgets';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children, title }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('../components/charts', () => ({
  BarChartWidget: () => <div>chart</div>,
  formatMoney: (n) => `GHS ${Number(n).toFixed(2)}`,
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

import api from '../services/api';

// A single budget with both a revenue line exceeding target (good news)
// and an expense line overspending (bad news) - the exact mixed-type
// scenario this page's own account filter (revenue + expense together)
// makes possible, and the case a single page-wide "higher is better"
// direction can never get right for both lines at once.
const MIXED_VS_ACTUAL = {
  budget: { id: 'budget-1', name: 'FY2026 Company Budget' },
  lines: [
    {
      id: 'line-revenue', period_name: 'Jan 2026', account_code: '4000', account_name: 'Sales Revenue',
      account_type: 'revenue', budgeted_amount: 10000, actual_amount: 12000, variance: 2000,
    },
    {
      id: 'line-expense', period_name: 'Jan 2026', account_code: '5000', account_name: 'Office Supplies',
      account_type: 'expense', budgeted_amount: 1000, actual_amount: 1300, variance: 300,
    },
  ],
};

async function renderVsActual() {
  api.get.mockImplementation((url) => {
    if (url === '/budgets') return Promise.resolve({ data: [{ id: 'budget-1', name: 'FY2026 Company Budget', status: 'draft' }] });
    if (url === '/financial-years') return Promise.resolve({ data: [] });
    if (url === '/chart-of-accounts') return Promise.resolve({ data: [] });
    if (url === '/budgets/budget-1/vs-actual') return Promise.resolve({ data: MIXED_VS_ACTUAL });
  });
  render(<Budgets />);
  fireEvent.click(await screen.findByText('Vs actual'));
  await screen.findByText('Sales Revenue', { exact: false });
}

describe('Budgets - vs-actual variance direction, per line', () => {
  test('a revenue line exceeding its target shows success, even though its variance is positive', async () => {
    await renderVsActual();
    const badge = screen.getByText('+2000.00');
    expect(badge.className).toContain('badge-success');
  });

  test('an expense line overspending shows danger, for the same positive-variance shape', async () => {
    await renderVsActual();
    const badge = screen.getByText('+300.00');
    expect(badge.className).toContain('badge-danger');
  });
});

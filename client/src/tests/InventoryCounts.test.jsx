import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InventoryCounts from '../pages/InventoryCounts';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children, title }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const mockConfirm = vi.fn();
vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => mockConfirm,
}));

import api from '../services/api';

const DRAFT_COUNT = {
  id: 'count-1', count_no: 'CNT-001', status: 'draft', warehouse_name: 'Main Warehouse',
  lines: [
    { id: 'line-1', sku: 'SKU1', product_name: 'Widget A', batch_no: null, system_quantity: 100, counted_quantity: 95, variance: -5, uom_symbol: 'pcs' },
    { id: 'line-2', sku: 'SKU2', product_name: 'Widget B', batch_no: null, system_quantity: 50, counted_quantity: 53, variance: 3, uom_symbol: 'pcs' },
    { id: 'line-3', sku: 'SKU3', product_name: 'Widget C', batch_no: null, system_quantity: 20, counted_quantity: 20, variance: 0, uom_symbol: 'pcs' },
  ],
};

async function renderAndOpenCount() {
  api.get.mockImplementation((url) => {
    if (url === '/inventory-counts') return Promise.resolve({ data: [{ id: 'count-1', count_no: 'CNT-001', status: 'draft', warehouse_name: 'Main Warehouse' }] });
    if (url === '/warehouses') return Promise.resolve({ data: [] });
    if (url === '/inventory-counts/count-1') return Promise.resolve({ data: DRAFT_COUNT });
  });
  render(<InventoryCounts />);
  fireEvent.click(await screen.findByText('Continue'));
  await screen.findByText('Widget A');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InventoryCounts - variance badge convention', () => {
  test('a shortage (counted less than system quantity) shows as danger', async () => {
    await renderAndOpenCount();
    const row = screen.getByText('Widget A').closest('tr');
    const badge = within(row).getByText('-5');
    expect(badge.className).toContain('badge-danger');
  });

  test('a surplus (counted more than system quantity) shows as success', async () => {
    await renderAndOpenCount();
    const row = screen.getByText('Widget B').closest('tr');
    const badge = within(row).getByText('+3');
    expect(badge.className).toContain('badge-success');
  });

  test('an exact match shows as neutral, neither success nor danger', async () => {
    await renderAndOpenCount();
    const row = screen.getByText('Widget C').closest('tr');
    const badge = within(row).getByText('0');
    expect(badge.className).toContain('badge-neutral');
  });
});

describe('InventoryCounts - saving a counted quantity', () => {
  test('saving a line sends the entered quantity to the right endpoint', async () => {
    api.patch.mockResolvedValue({ data: {} });
    await renderAndOpenCount();

    const row = screen.getByText('Widget A').closest('tr');
    const input = within(row).getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '97' } });
    fireEvent.click(within(row).getByText('Save'));

    await vi.waitFor(() => expect(api.patch).toHaveBeenCalledWith('/inventory-counts/count-1/lines/line-1', { countedQuantity: 97 }));
  });
});

// The safety-critical property worth real scrutiny here: completing a
// count immediately applies stock adjustments - an irreversible,
// financially real action, not a draft save. It must never fire without
// the person explicitly confirming, and canceling that confirmation
// must leave the count untouched.
describe('InventoryCounts - completing a count requires confirmation', () => {
  test('canceling the confirmation does not complete the count', async () => {
    mockConfirm.mockResolvedValue(false);
    await renderAndOpenCount();

    fireEvent.click(screen.getByText('Complete count'));
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
  });

  test('confirming completes the count via the real endpoint', async () => {
    mockConfirm.mockResolvedValue(true);
    api.post.mockResolvedValue({ data: {} });
    await renderAndOpenCount();

    fireEvent.click(screen.getByText('Complete count'));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledWith('/inventory-counts/count-1/complete'));
  });

  test('the confirmation message is explicit that adjustments apply immediately, not vague about it', async () => {
    mockConfirm.mockResolvedValue(false);
    await renderAndOpenCount();
    fireEvent.click(screen.getByText('Complete count'));
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockConfirm.mock.calls[0][0]).toMatch(/applied as stock adjustments immediately/i);
  });
});

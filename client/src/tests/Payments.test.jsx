import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Payments from '../pages/Payments';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../services/api';

const CUSTOMERS = [{ id: 'cust-1', name: 'Acme Ltd' }];
const OUTSTANDING_INVOICES = [
  { id: 'inv-1', invoice_no: 'INV-001', status: 'sent', balance: 200 },
  { id: 'inv-2', invoice_no: 'INV-002', status: 'sent', balance: 150 },
  { id: 'inv-3', invoice_no: 'INV-003', status: 'paid', balance: 0 },
];

async function renderAndSelectCustomer() {
  api.get.mockImplementation((url) => {
    if (url === '/payments') return Promise.resolve({ data: [] });
    if (url === '/customers') return Promise.resolve({ data: CUSTOMERS });
    if (url === '/customers/cust-1/ledger') return Promise.resolve({ data: { invoices: OUTSTANDING_INVOICES } });
  });
  render(<Payments />);
  fireEvent.click(await screen.findByText('+ Record payment'));
  await screen.findByText('Record customer payment');
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'cust-1' } });
  await screen.findByText('INV-001');
}

function amountInput() {
  return screen.getByText('Amount received (GHS)').closest('.form-group').querySelector('input');
}
function allocationInputFor(invoiceNo) {
  const row = screen.getByText(invoiceNo).closest('tr');
  return within(row).getByRole('spinbutton');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Payments - customer selection', () => {
  test('only unpaid, non-void invoices with a real balance are offered for allocation', async () => {
    await renderAndSelectCustomer();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.queryByText('INV-003')).not.toBeInTheDocument();
  });
});

describe('Payments - allocation validation', () => {
  test('allocating within the payment amount across multiple invoices succeeds', async () => {
    api.post.mockResolvedValue({ data: {} });
    await renderAndSelectCustomer();
    fireEvent.change(amountInput(), { target: { value: '300' } });
    fireEvent.change(allocationInputFor('INV-001'), { target: { value: '200' } });
    fireEvent.change(allocationInputFor('INV-002'), { target: { value: '100' } });

    fireEvent.click(screen.getByText('Record payment'));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());

    const payload = api.post.mock.calls[0][1];
    expect(payload.allocations).toEqual([
      { salesInvoiceId: 'inv-1', amount: 200 },
      { salesInvoiceId: 'inv-2', amount: 100 },
    ]);
  });

  test('allocations that each individually fit their own invoice, but together exceed the payment amount, are rejected', async () => {
    await renderAndSelectCustomer();
    fireEvent.change(amountInput(), { target: { value: '100' } });
    fireEvent.change(allocationInputFor('INV-001'), { target: { value: '200' } });
    fireEvent.change(allocationInputFor('INV-002'), { target: { value: '150' } });

    fireEvent.click(screen.getByText('Record payment'));

    expect(await screen.findByText('Allocated amount cannot exceed the payment amount')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('a tiny over-allocation within the documented rounding tolerance is still accepted', async () => {
    api.post.mockResolvedValue({ data: {} });
    await renderAndSelectCustomer();
    fireEvent.change(amountInput(), { target: { value: '100' } });
    fireEvent.change(allocationInputFor('INV-001'), { target: { value: '100.005' } });

    fireEvent.click(screen.getByText('Record payment'));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());
  });

  test('an allocation left at zero or blank is excluded from what is actually submitted', async () => {
    api.post.mockResolvedValue({ data: {} });
    await renderAndSelectCustomer();
    fireEvent.change(amountInput(), { target: { value: '200' } });
    fireEvent.change(allocationInputFor('INV-001'), { target: { value: '200' } });

    fireEvent.click(screen.getByText('Record payment'));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());

    const payload = api.post.mock.calls[0][1];
    expect(payload.allocations).toEqual([{ salesInvoiceId: 'inv-1', amount: 200 }]);
  });

  test('the running "Allocated: X of Y" total updates live as amounts are entered', async () => {
    await renderAndSelectCustomer();
    fireEvent.change(amountInput(), { target: { value: '300' } });
    fireEvent.change(allocationInputFor('INV-001'), { target: { value: '120.5' } });
    expect(screen.getByText('Allocated: GHS 120.50 of GHS 300.00')).toBeInTheDocument();
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Roles from '../pages/Roles';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children, title }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn(),
}));

import api from '../services/api';

const PERMISSIONS = [
  { id: 1, module: 'accounting', action: 'view_ledger', code: 'accounting.view_ledger' },
  { id: 2, module: 'accounting', action: 'manage_journal', code: 'accounting.manage_journal' },
  { id: 3, module: 'crm', action: 'manage_contacts', code: 'crm.manage_contacts' },
];

const EXISTING_ROLE = {
  id: 'role-1', name: 'Accountant', description: '', is_system_role: false,
  permissions: ['accounting.view_ledger'],
};

async function renderAndOpenExistingRole() {
  api.get.mockImplementation((url) => {
    if (url === '/roles') return Promise.resolve({ data: [EXISTING_ROLE] });
    if (url === '/permissions') return Promise.resolve({ data: PERMISSIONS });
  });
  render(<Roles />);
  fireEvent.click(await screen.findByText('Edit'));
  await screen.findByText('Edit role');
}

function moduleRow(moduleName) {
  return screen.getByText(moduleName).closest('tr');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Roles - by-module access matrix', () => {
  test('defaults to the by-module view, showing the correct starting level from existing permissions', async () => {
    await renderAndOpenExistingRole();
    const row = moduleRow('accounting');
    expect(within(row).getByRole('radio', { name: 'View' }).checked).toBe(true);
    expect(within(row).getByRole('radio', { name: 'No access' }).checked).toBe(false);
  });

  test('a module with no view-tier permission does not show a "View" option at all', async () => {
    await renderAndOpenExistingRole();
    const row = moduleRow('crm');
    expect(within(row).queryByRole('radio', { name: 'View' })).not.toBeInTheDocument();
    expect(within(row).getByRole('radio', { name: 'No access' })).toBeInTheDocument();
    expect(within(row).getByRole('radio', { name: 'Edit' })).toBeInTheDocument();
  });

  test('selecting "Edit" for a module and saving submits every permission ID for that module', async () => {
    api.patch.mockResolvedValue({ data: {} });
    await renderAndOpenExistingRole();
    fireEvent.click(within(moduleRow('accounting')).getByRole('radio', { name: 'Edit' }));
    fireEvent.click(screen.getByText('Save'));

    await vi.waitFor(() => expect(api.patch).toHaveBeenCalled());
    const payload = api.patch.mock.calls[0][1];
    expect(payload.permissionIds.sort()).toEqual([1, 2]);
  });

  test("changing one module's level in the UI does not disturb another module's own selection", async () => {
    const roleWithBoth = { ...EXISTING_ROLE, permissions: ['accounting.view_ledger', 'crm.manage_contacts'] };
    api.get.mockImplementation((url) => {
      if (url === '/roles') return Promise.resolve({ data: [roleWithBoth] });
      if (url === '/permissions') return Promise.resolve({ data: PERMISSIONS });
    });
    api.patch.mockResolvedValue({ data: {} });
    render(<Roles />);
    fireEvent.click(await screen.findByText('Edit'));
    await screen.findByText('Edit role');

    fireEvent.click(within(moduleRow('accounting')).getByRole('radio', { name: 'No access' }));
    fireEvent.click(screen.getByText('Save'));

    await vi.waitFor(() => expect(api.patch).toHaveBeenCalled());
    const payload = api.patch.mock.calls[0][1];
    expect(payload.permissionIds).toEqual([3]);
  });

  test('switching to "All permissions" shows the original flat checkbox grid', async () => {
    await renderAndOpenExistingRole();
    fireEvent.click(screen.getByText('All permissions'));
    expect(screen.getByText('accounting.view_ledger')).toBeInTheDocument();
    expect(screen.getByText('crm.manage_contacts')).toBeInTheDocument();
  });

  test('a hand-tuned partial selection shows honestly as "Custom", not silently normalized', async () => {
    const customRole = { ...EXISTING_ROLE, permissions: ['accounting.manage_journal'] };
    api.get.mockImplementation((url) => {
      if (url === '/roles') return Promise.resolve({ data: [customRole] });
      if (url === '/permissions') return Promise.resolve({ data: PERMISSIONS });
    });
    render(<Roles />);
    fireEvent.click(await screen.findByText('Edit'));
    await screen.findByText('Edit role');

    const row = moduleRow('accounting');
    expect(within(row).getByText('Custom')).toBeInTheDocument();
    expect(within(row).getByRole('radio', { name: 'View' }).checked).toBe(false);
    expect(within(row).getByRole('radio', { name: 'Edit' }).checked).toBe(false);
  });
});

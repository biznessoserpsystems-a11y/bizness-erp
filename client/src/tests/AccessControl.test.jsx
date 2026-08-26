import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AccessControl from '../pages/AccessControl';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children, title }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const mockConfirm = vi.fn();
vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => mockConfirm,
}));

import api from '../services/api';

const SESSIONS = [
  { id: 'sess-1', first_name: 'Kwame', last_name: 'Admin', email: 'kwame@kwametraders.com', ip_address: '127.0.0.1', user_agent: 'Chrome', created_at: new Date().toISOString() },
];

function mockGets({ rules = [], enabled = false, yourIp = '127.0.0.1', sessions = SESSIONS } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/access-control/sessions') return Promise.resolve({ data: sessions });
    if (url === '/access-control/ip-rules') return Promise.resolve({ data: { rules, enabled, yourIp } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccessControl - active sessions', () => {
  test('renders the session list with user, IP, and device', async () => {
    mockGets({ yourIp: '198.51.100.1' });
    render(<AccessControl />);
    expect(await screen.findByText('kwame@kwametraders.com')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('Chrome')).toBeInTheDocument();
  });

  test('canceling the revoke confirmation does not revoke the session', async () => {
    mockGets();
    mockConfirm.mockResolvedValue(false);
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Revoke'));
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('confirming revoke calls the real endpoint', async () => {
    mockGets();
    mockConfirm.mockResolvedValue(true);
    api.delete.mockResolvedValue({ data: {} });
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Revoke'));
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledWith('/access-control/sessions/sess-1'));
  });
});

describe('AccessControl - IP rules', () => {
  test('shows the current user their own IP address', async () => {
    mockGets({ yourIp: '203.0.113.99' });
    render(<AccessControl />);
    expect(await screen.findByText('203.0.113.99')).toBeInTheDocument();
  });

  test('adding a rule sends the entered CIDR and description', async () => {
    mockGets();
    api.post.mockResolvedValue({ data: {} });
    render(<AccessControl />);
    await screen.findByText('IP sign-in restriction');

    fireEvent.change(screen.getByPlaceholderText('203.0.113.5 or 203.0.113.0/24'), { target: { value: '203.0.113.5' } });
    fireEvent.change(screen.getByPlaceholderText('Head office'), { target: { value: 'Test office' } });
    fireEvent.click(screen.getByText('+ Add rule'));

    await vi.waitFor(() => expect(api.post).toHaveBeenCalledWith('/access-control/ip-rules', { cidr: '203.0.113.5', description: 'Test office' }));
  });

  test('a server-side rejection when adding a rule is shown, not swallowed', async () => {
    mockGets();
    api.post.mockRejectedValue({ response: { data: { error: '"nonsense" is not a valid IP address or CIDR range' } } });
    render(<AccessControl />);
    await screen.findByText('IP sign-in restriction');

    fireEvent.change(screen.getByPlaceholderText('203.0.113.5 or 203.0.113.0/24'), { target: { value: 'nonsense' } });
    fireEvent.click(screen.getByText('+ Add rule'));

    expect(await screen.findByText('"nonsense" is not a valid IP address or CIDR range')).toBeInTheDocument();
  });

  test('removing a rule requires confirmation', async () => {
    mockGets({ rules: [{ id: 'rule-1', cidr: '203.0.113.0/24', description: 'Office' }] });
    mockConfirm.mockResolvedValue(false);
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Remove'));
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(api.delete).not.toHaveBeenCalled();
  });
});

// The safety-critical property worth real scrutiny: enabling the
// restriction is a genuinely dangerous action (it can lock people out
// of the whole system), so it must always be confirmed with a message
// that says so plainly, and a server-side rejection (the self-lockout
// safeguard on the backend) must be surfaced clearly, not lost.
describe('AccessControl - enabling IP restriction', () => {
  test('enabling requires confirmation with an explicit warning about being locked out', async () => {
    mockGets({ rules: [{ id: 'rule-1', cidr: '203.0.113.0/24', description: 'Office' }] });
    mockConfirm.mockResolvedValue(false);
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Enable restriction'));
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockConfirm.mock.calls[0][0]).toMatch(/blocked from any IP address not covered/i);
    expect(api.patch).not.toHaveBeenCalled();
  });

  test('a self-lockout rejection from the server is shown to the user, not silently dropped', async () => {
    mockGets({ rules: [{ id: 'rule-1', cidr: '203.0.113.0/24', description: 'Office' }], yourIp: '198.51.100.1' });
    mockConfirm.mockResolvedValue(true);
    api.patch.mockRejectedValue({ response: { data: { error: 'Your current IP (198.51.100.1) is not in the allowed list. Add it first, or you will be locked out immediately after enabling this.' } } });
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Enable restriction'));

    expect(await screen.findByText(/you will be locked out immediately/i)).toBeInTheDocument();
  });

  test('confirming a successful enable calls the endpoint with enabled: true', async () => {
    mockGets({ rules: [{ id: 'rule-1', cidr: '127.0.0.1/32', description: 'Me' }] });
    mockConfirm.mockResolvedValue(true);
    api.patch.mockResolvedValue({ data: { enabled: true } });
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Enable restriction'));
    await vi.waitFor(() => expect(api.patch).toHaveBeenCalledWith('/access-control/ip-restriction', { enabled: true }));
  });

  test('disabling does not require confirmation - it is always the safe direction', async () => {
    mockGets({ rules: [{ id: 'rule-1', cidr: '127.0.0.1/32', description: 'Me' }], enabled: true });
    api.patch.mockResolvedValue({ data: { enabled: false } });
    render(<AccessControl />);
    fireEvent.click(await screen.findByText('Disable restriction'));
    expect(mockConfirm).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(api.patch).toHaveBeenCalledWith('/access-control/ip-restriction', { enabled: false }));
  });
});

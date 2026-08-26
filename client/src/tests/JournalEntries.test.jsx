import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import JournalEntries from '../pages/JournalEntries';

vi.mock('../layouts/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ company: { id: 'company-1' } }),
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../services/api';
import { saveDraft, getDraft } from '../services/offlineDrafts';

const ACCOUNTS = [
  { id: 'acc-1', account_code: '1000', account_name: 'Cash' },
  { id: 'acc-2', account_code: '5000', account_name: 'Office Rent Expense' },
];

async function renderAndOpenModal() {
  api.get.mockImplementation((url) => {
    if (url === '/journal-entries') return Promise.resolve({ data: [] });
    if (url === '/chart-of-accounts') return Promise.resolve({ data: ACCOUNTS });
  });
  render(<JournalEntries />);
  fireEvent.click(await screen.findByText('+ New entry'));
  await screen.findByText('New journal entry');
  fireEvent.change(screen.getByPlaceholderText('e.g. July office rent'), { target: { value: 'Test entry' } });
}

function getLineRows() {
  return screen.getAllByRole('row').filter((row) => within(row).queryAllByRole('combobox').length > 0);
}

function fillLine(row, { account, debit, credit }) {
  if (account !== undefined) fireEvent.change(within(row).getByRole('combobox'), { target: { value: account } });
  const numberInputs = within(row).getAllByRole('spinbutton');
  if (debit !== undefined) fireEvent.change(numberInputs[0], { target: { value: debit } });
  if (credit !== undefined) fireEvent.change(numberInputs[1], { target: { value: credit } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JournalEntries - new entry balance calculation', () => {
  test('two empty lines start out not balanced, with the submit button disabled', async () => {
    await renderAndOpenModal();
    expect(screen.getByText(/Not balanced/)).toBeInTheDocument();
    expect(screen.getByText('Post entry')).toBeDisabled();
  });

  test('matching debit and credit on the two default lines is balanced and enables submit', async () => {
    await renderAndOpenModal();
    const [line1, line2] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '100' });
    fillLine(line2, { account: 'acc-1', credit: '100' });

    expect(screen.getByText(/Balanced ✓/)).toBeInTheDocument();
    expect(screen.getByText('Post entry')).not.toBeDisabled();
  });

  test('mismatched debit and credit is not balanced, submit stays disabled', async () => {
    await renderAndOpenModal();
    const [line1, line2] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '100' });
    fillLine(line2, { account: 'acc-1', credit: '90' });

    expect(screen.getByText(/Not balanced/)).toBeInTheDocument();
    expect(screen.getByText('Post entry')).toBeDisabled();
  });

  test('a difference within the documented rounding tolerance is treated as balanced', async () => {
    await renderAndOpenModal();
    const [line1, line2] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '100.009' });
    fillLine(line2, { account: 'acc-1', credit: '100' });

    expect(screen.getByText(/Balanced ✓/)).toBeInTheDocument();
  });

  test('a difference just outside the tolerance is correctly rejected as not balanced', async () => {
    await renderAndOpenModal();
    const [line1, line2] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '100.02' });
    fillLine(line2, { account: 'acc-1', credit: '100' });

    expect(screen.getByText(/Not balanced/)).toBeInTheDocument();
  });

  test('three lines split across both sides sum correctly, not just the simple two-line case', async () => {
    await renderAndOpenModal();
    fireEvent.click(screen.getByText('+ Add line'));
    const [line1, line2, line3] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '60' });
    fillLine(line2, { account: 'acc-2', debit: '40' });
    fillLine(line3, { account: 'acc-1', credit: '100' });

    expect(screen.getByText(/Balanced ✓/)).toBeInTheDocument();
  });

  test('the remove-line button is not shown when only the minimum two lines remain', async () => {
    await renderAndOpenModal();
    const removeButtons = screen.queryAllByText('✕');
    expect(removeButtons).toHaveLength(0);
  });

  test('an extra line with an account selected but no amount entered is silently excluded from the submitted payload', async () => {
    api.post.mockResolvedValue({ data: {} });
    await renderAndOpenModal();
    fireEvent.click(screen.getByText('+ Add line'));
    const [line1, line2, line3] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '100' });
    fillLine(line2, { account: 'acc-1', credit: '100' });
    fillLine(line3, { account: 'acc-1' }); // account picked, but no debit or credit entered

    fireEvent.click(screen.getByText('Post entry'));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());

    const payload = api.post.mock.calls[0][1];
    expect(payload.lines).toHaveLength(2);
  });
});

describe('JournalEntries - offline draft integration', () => {
  beforeEach(async () => {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('bizness-os-drafts');
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });

  test('a genuinely blank, untouched form does not save a draft', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/journal-entries') return Promise.resolve({ data: [] });
      if (url === '/chart-of-accounts') return Promise.resolve({ data: ACCOUNTS });
    });
    render(<JournalEntries />);
    fireEvent.click(await screen.findByText('+ New entry'));
    await screen.findByText('New journal entry');
    // Deliberately does not fill in the description field (unlike
    // renderAndOpenModal's own helper, which does so purely to satisfy
    // native HTML5 validation for tests that need to submit) - this is
    // the genuinely untouched, blank-form case the auto-save guard
    // exists for.

    await new Promise((r) => setTimeout(r, 900));
    expect(await getDraft('company-1', 'journal-entry', 'default')).toBeNull();
  });

  test('typing a description eventually auto-saves a real draft', async () => {
    await renderAndOpenModal();
    fireEvent.change(screen.getByPlaceholderText('e.g. July office rent'), { target: { value: 'Draft in progress' } });

    await new Promise((r) => setTimeout(r, 900));

    const stored = await getDraft('company-1', 'journal-entry', 'default');
    expect(stored.description).toBe('Draft in progress');
  });

  test('opening the modal with an existing draft shows the restore banner', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', {
      entryDate: '2026-01-15', description: 'Restored entry',
      lines: [{ accountId: 'acc-2', debit: '50', credit: '' }, { accountId: 'acc-1', debit: '', credit: '50' }],
    });
    await renderAndOpenModal();
    expect(await screen.findByText('You have an unsaved draft of an entry.')).toBeInTheDocument();
  });

  test('opening the modal with no existing draft does not show the restore banner', async () => {
    await renderAndOpenModal();
    await new Promise((r) => setTimeout(r, 50)); // let the async draft check settle
    expect(screen.queryByText('You have an unsaved draft of an entry.')).not.toBeInTheDocument();
  });

  test('clicking Restore populates the form with the draft\'s data', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', {
      entryDate: '2026-01-15', description: 'Restored entry',
      lines: [{ accountId: 'acc-2', debit: '50', credit: '' }, { accountId: 'acc-1', debit: '', credit: '50' }],
    });
    await renderAndOpenModal();
    fireEvent.click(await screen.findByText('Restore'));

    expect(screen.getByPlaceholderText('e.g. July office rent').value).toBe('Restored entry');
    expect(screen.getByText(/Balanced/)).toBeInTheDocument();
  });

  test('clicking Discard removes the draft and hides the banner, without applying the draft\'s own data', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { entryDate: '2026-01-15', description: 'To be discarded', lines: [] });
    await renderAndOpenModal();
    fireEvent.click(await screen.findByText('Discard'));

    expect(screen.queryByText('You have an unsaved draft of an entry.')).not.toBeInTheDocument();
    // renderAndOpenModal's own helper fills the description field to
    // satisfy native required-field validation - discarding the found
    // draft must not overwrite that with the discarded draft's own
    // description, and must not leave the draft behind in storage.
    expect(screen.getByPlaceholderText('e.g. July office rent').value).toBe('Test entry');
    expect(await getDraft('company-1', 'journal-entry', 'default')).toBeNull();
  });

  // The property that matters most for this integration: once a
  // document is genuinely, successfully submitted, it's no longer a
  // draft - leaving it in offline storage after a real submission
  // would be a stale, pointless leftover, not a safety net.
  test('a successful submission discards the draft, not just closes the modal', async () => {
    api.post.mockResolvedValue({ data: {} });
    // Establish a real precondition first - a draft that genuinely
    // exists before submitting - rather than relying on the debounced
    // auto-save happening incidentally within this test's own timing,
    // which wouldn't actually prove discardDraft() runs on success.
    await saveDraft('company-1', 'journal-entry', 'default', { entryDate: '2026-01-15', description: 'Pre-existing draft', lines: [] });
    await renderAndOpenModal();
    const [line1, line2] = getLineRows();
    fillLine(line1, { account: 'acc-2', debit: '100' });
    fillLine(line2, { account: 'acc-1', credit: '100' });

    fireEvent.click(screen.getByText('Post entry'));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalled());

    expect(await getDraft('company-1', 'journal-entry', 'default')).toBeNull();
  });
});

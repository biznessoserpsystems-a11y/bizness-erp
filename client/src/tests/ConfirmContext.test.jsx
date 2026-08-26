import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from '../context/ConfirmContext';

// A minimal consumer that exposes confirm() results as rendered text, so
// the actual promise resolution triggered by clicking the real rendered
// modal buttons can be observed, not simulated separately from it.
function TestConsumer({ onResult }) {
  const confirm = useConfirm();
  return (
    <button onClick={async () => onResult(await confirm('Are you sure?', { title: 'Confirm this', confirmLabel: 'Yes, do it', danger: true }))}>
      trigger
    </button>
  );
}

function renderWithProvider(onResult) {
  render(
    <ConfirmProvider>
      <TestConsumer onResult={onResult} />
    </ConfirmProvider>
  );
}

describe('ConfirmContext', () => {
  test('clicking Confirm resolves the promise with true', async () => {
    const results = [];
    renderWithProvider((r) => results.push(r));

    fireEvent.click(screen.getByText('trigger'));
    expect(await screen.findByText('Are you sure?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes, do it'));

    await act(async () => {});
    expect(results).toEqual([true]);
  });

  test('clicking Cancel resolves the promise with false', async () => {
    const results = [];
    renderWithProvider((r) => results.push(r));

    fireEvent.click(screen.getByText('trigger'));
    await screen.findByText('Are you sure?');
    fireEvent.click(screen.getByText('Cancel'));

    await act(async () => {});
    expect(results).toEqual([false]);
  });

  test('clicking the overlay background also resolves with false, same as Cancel', async () => {
    const results = [];
    renderWithProvider((r) => results.push(r));

    fireEvent.click(screen.getByText('trigger'));
    await screen.findByText('Are you sure?');
    fireEvent.click(document.querySelector('.modal-overlay'));

    await act(async () => {});
    expect(results).toEqual([false]);
  });

  test('clicking inside the dialog itself does not close it (click does not bubble to the overlay)', async () => {
    const results = [];
    renderWithProvider((r) => results.push(r));

    fireEvent.click(screen.getByText('trigger'));
    await screen.findByText('Are you sure?');
    fireEvent.click(document.querySelector('.confirm-modal'));

    expect(results).toEqual([]);
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  test('custom title and confirm label are actually rendered, not just the defaults', async () => {
    renderWithProvider(() => {});
    fireEvent.click(screen.getByText('trigger'));
    expect(await screen.findByText('Confirm this')).toBeInTheDocument();
    expect(screen.getByText('Yes, do it')).toBeInTheDocument();
  });

  test('the dialog closes after resolving, and a second, independent confirm() call works correctly afterward', async () => {
    const results = [];
    renderWithProvider((r) => results.push(r));

    fireEvent.click(screen.getByText('trigger'));
    await screen.findByText('Are you sure?');
    fireEvent.click(screen.getByText('Yes, do it'));
    await act(async () => {});
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('trigger'));
    await screen.findByText('Are you sure?');
    fireEvent.click(screen.getByText('Cancel'));
    await act(async () => {});

    expect(results).toEqual([true, false]);
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../context/ToastContext';

function TestConsumer() {
  const { showToast, dismiss } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Saved successfully', 'success')}>show-default</button>
      <button onClick={() => showToast('Pinned message', 'info', 0)}>show-pinned</button>
      <button onClick={() => showToast('Quick', 'info', 100)}>show-quick</button>
      <button onClick={() => dismiss(1)}>dismiss-1</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>
  );
}

describe('ToastContext', () => {
  test('showToast renders the message on screen', () => {
    renderWithProvider();
    act(() => screen.getByText('show-default').click());
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  test('a toast auto-dismisses after its duration elapses', () => {
    vi.useFakeTimers();
    try {
      renderWithProvider();
      act(() => screen.getByText('show-quick').click());
      expect(screen.getByText('Quick')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(99));
      expect(screen.getByText('Quick')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByText('Quick')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // The real property worth locking in: duration=0 is a deliberate,
  // documented way to pin a toast until it's manually dismissed - since
  // `if (duration)` treats 0 as falsy, this is exactly the kind of
  // one-character regression (duration=0 accidentally scheduling an
  // immediate dismiss) this test exists to catch.
  test('a toast with duration 0 never auto-dismisses, even after a long time passes', () => {
    vi.useFakeTimers();
    try {
      renderWithProvider();
      act(() => screen.getByText('show-pinned').click());
      expect(screen.getByText('Pinned message')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(60000));
      expect(screen.getByText('Pinned message')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('multiple toasts can be shown at once, each independently timed', () => {
    vi.useFakeTimers();
    try {
      renderWithProvider();
      act(() => screen.getByText('show-quick').click());
      act(() => vi.advanceTimersByTime(50));
      act(() => screen.getByText('show-default').click());

      expect(screen.getByText('Quick')).toBeInTheDocument();
      expect(screen.getByText('Saved successfully')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(50));
      expect(screen.queryByText('Quick')).not.toBeInTheDocument();
      expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('clicking a toast dismisses it immediately, without waiting for its timer', () => {
    vi.useFakeTimers();
    try {
      renderWithProvider();
      act(() => screen.getByText('show-pinned').click());
      const toast = screen.getByText('Pinned message');
      act(() => toast.click());
      expect(screen.queryByText('Pinned message')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

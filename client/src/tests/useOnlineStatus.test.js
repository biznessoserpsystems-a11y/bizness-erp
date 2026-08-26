import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

function setNavigatorOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true, writable: true });
}

beforeEach(() => {
  setNavigatorOnline(true);
});

describe('useOnlineStatus', () => {
  test('reflects navigator.onLine as its initial value', () => {
    setNavigatorOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
  });

  test('an offline event flips isOnline to false', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.isOnline).toBe(false);
  });

  test('a subsequent online event flips isOnline back to true', () => {
    const { result } = renderHook(() => useOnlineStatus());
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current.isOnline).toBe(true);
  });

  // The real property worth locking in: lastOnlineAt has to reflect the
  // moment connectivity was actually lost, not the moment the hook was
  // first mounted — a session open for hours before losing connection
  // needs an accurate "last known good" timestamp, not a stale one from
  // page load.
  describe('lastOnlineAt', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test('updates to the moment connectivity is lost, not the original mount time', () => {
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const { result } = renderHook(() => useOnlineStatus());

      vi.setSystemTime(new Date('2026-01-01T14:30:00Z')); // hours pass while still online
      act(() => window.dispatchEvent(new Event('offline')));

      expect(result.current.lastOnlineAt.toISOString()).toBe('2026-01-01T14:30:00.000Z');
    });

    test('updates again on reconnecting', () => {
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const { result } = renderHook(() => useOnlineStatus());
      act(() => window.dispatchEvent(new Event('offline')));

      vi.setSystemTime(new Date('2026-01-01T11:15:00Z'));
      act(() => window.dispatchEvent(new Event('online')));

      expect(result.current.lastOnlineAt.toISOString()).toBe('2026-01-01T11:15:00.000Z');
    });
  });
});

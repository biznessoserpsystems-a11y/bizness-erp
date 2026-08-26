import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineDraft } from '../hooks/useOfflineDraft';
import { saveDraft, getDraft } from '../services/offlineDrafts';
import * as offlineDraftsModule from '../services/offlineDrafts';

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('bizness-os-drafts');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
  mockUseAuth.mockReturnValue({ company: { id: 'company-1' } });
});

describe('useOfflineDraft - restoring on mount', () => {
  test('finds and exposes an existing draft', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'Existing draft' });
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    await waitFor(() => expect(result.current.restoredDraft).toEqual({ description: 'Existing draft' }));
  });

  test('stays null when no draft exists', async () => {
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    await waitFor(() => {});
    expect(result.current.restoredDraft).toBeNull();
  });
});

describe('useOfflineDraft - save', () => {
  // The final stored value alone can't tell debouncing apart from no
  // debouncing at all - saveDraft overwrites the same key, so the last
  // call always wins either way. What actually distinguishes them is
  // how many times the real save function gets invoked.
  test('debounces - three quick calls only trigger one real save', async () => {
    const saveSpy = vi.spyOn(offlineDraftsModule, 'saveDraft');
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    act(() => result.current.save({ description: 'v1' }, { debounceMs: 50 }));
    act(() => result.current.save({ description: 'v2' }, { debounceMs: 50 }));
    act(() => result.current.save({ description: 'v3' }, { debounceMs: 50 }));

    await new Promise((r) => setTimeout(r, 150));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith('company-1', 'journal-entry', 'default', { description: 'v3' });
    saveSpy.mockRestore();
  });

  test('genuinely persists to the real store once the debounce elapses', async () => {
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    act(() => result.current.save({ description: 'Saved via hook' }, { debounceMs: 50 }));
    await new Promise((r) => setTimeout(r, 150));

    const stored = await getDraft('company-1', 'journal-entry', 'default');
    expect(stored).toEqual({ description: 'Saved via hook' });
  });

  test('does nothing, without throwing, when no company is signed in', async () => {
    mockUseAuth.mockReturnValue({ company: null });
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    expect(() => act(() => result.current.save({ description: 'orphaned' }, { debounceMs: 50 }))).not.toThrow();
    await new Promise((r) => setTimeout(r, 150));
  });
});

describe('useOfflineDraft - discard', () => {
  test('genuinely removes the draft and clears restoredDraft locally', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'To be discarded' });
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    await waitFor(() => expect(result.current.restoredDraft).not.toBeNull());

    await act(async () => {
      await result.current.discard();
    });

    expect(result.current.restoredDraft).toBeNull();
    expect(await getDraft('company-1', 'journal-entry', 'default')).toBeNull();
  });
});

describe('useOfflineDraft - isolation between document types', () => {
  test('a draft saved under one docType does not appear under a different one', async () => {
    await saveDraft('company-1', 'inventory-count', 'default', { n: 1 });
    const { result } = renderHook(() => useOfflineDraft('journal-entry'));
    await waitFor(() => {});
    expect(result.current.restoredDraft).toBeNull();
  });
});

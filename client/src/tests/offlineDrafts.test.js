import { describe, test, expect, beforeEach } from 'vitest';
import { saveDraft, getDraft, deleteDraft, listDrafts, clearCompanyDrafts, requestPersistence } from '../services/offlineDrafts';

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('bizness-os-drafts');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('saveDraft / getDraft', () => {
  test('a saved draft round-trips back exactly', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'Test entry', lines: [1, 2, 3] });
    const result = await getDraft('company-1', 'journal-entry', 'default');
    expect(result).toEqual({ description: 'Test entry', lines: [1, 2, 3] });
  });

  test('a draft that was never saved returns null', async () => {
    const result = await getDraft('company-1', 'journal-entry', 'default');
    expect(result).toBeNull();
  });

  test('saving to the same key twice overwrites rather than duplicating', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'First version' });
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'Second version' });
    const result = await getDraft('company-1', 'journal-entry', 'default');
    expect(result).toEqual({ description: 'Second version' });

    const all = await listDrafts('company-1', 'journal-entry');
    expect(all).toHaveLength(1);
  });
});

describe('deleteDraft', () => {
  test('removes a draft - called after a real, successful submission', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'To be submitted' });
    await deleteDraft('company-1', 'journal-entry', 'default');
    expect(await getDraft('company-1', 'journal-entry', 'default')).toBeNull();
  });

  test('deleting a draft that never existed does not throw', async () => {
    await expect(deleteDraft('company-1', 'journal-entry', 'never-existed')).resolves.not.toThrow();
  });
});

describe('listDrafts', () => {
  test('lists every draft for a company and document type, newest first', async () => {
    await saveDraft('company-1', 'journal-entry', 'draft-a', { n: 1 });
    await new Promise((r) => setTimeout(r, 2));
    await saveDraft('company-1', 'journal-entry', 'draft-b', { n: 2 });

    const results = await listDrafts('company-1', 'journal-entry');
    expect(results.map((r) => r.draftId)).toEqual(['draft-b', 'draft-a']);
  });

  test('does not include drafts of a different document type, even for the same company', async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { n: 1 });
    await saveDraft('company-1', 'inventory-count', 'default', { n: 2 });

    const journalDrafts = await listDrafts('company-1', 'journal-entry');
    expect(journalDrafts).toHaveLength(1);
    expect(journalDrafts[0].data).toEqual({ n: 1 });
  });
});

describe('company isolation', () => {
  test("getDraft for one company never returns a different company's draft, even with the identical docType and draftId", async () => {
    await saveDraft('company-1', 'journal-entry', 'default', { description: 'Company 1 secret entry' });
    const resultForCompany2 = await getDraft('company-2', 'journal-entry', 'default');
    expect(resultForCompany2).toBeNull();
  });

  test("listDrafts for one company never includes a different company's drafts", async () => {
    await saveDraft('company-1', 'journal-entry', 'a', { n: 1 });
    await saveDraft('company-2', 'journal-entry', 'b', { n: 2 });

    const company1Drafts = await listDrafts('company-1', 'journal-entry');
    expect(company1Drafts).toHaveLength(1);
    expect(company1Drafts[0].companyId).toBe('company-1');
  });
});

describe('clearCompanyDrafts', () => {
  test('removes every draft for a company across every document type', async () => {
    await saveDraft('company-1', 'journal-entry', 'a', { n: 1 });
    await saveDraft('company-1', 'inventory-count', 'b', { n: 2 });

    await clearCompanyDrafts('company-1');

    expect(await getDraft('company-1', 'journal-entry', 'a')).toBeNull();
    expect(await getDraft('company-1', 'inventory-count', 'b')).toBeNull();
  });

  test("does not touch a different company's drafts", async () => {
    await saveDraft('company-1', 'journal-entry', 'a', { n: 1 });
    await saveDraft('company-2', 'journal-entry', 'b', { n: 2 });

    await clearCompanyDrafts('company-1');

    expect(await getDraft('company-1', 'journal-entry', 'a')).toBeNull();
    expect(await getDraft('company-2', 'journal-entry', 'b')).toEqual({ n: 2 });
  });
});

describe('requestPersistence', () => {
  test('does not throw when navigator.storage.persist is unavailable', async () => {
    const original = navigator.storage;
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    await expect(requestPersistence()).resolves.toBe(false);
    Object.defineProperty(navigator, 'storage', { value: original, configurable: true });
  });
});

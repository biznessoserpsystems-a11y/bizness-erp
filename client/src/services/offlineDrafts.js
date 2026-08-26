const DB_NAME = 'bizness-os-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

/**
 * Offline document drafts, stored in IndexedDB so composing a journal
 * entry, an inventory count, or an invoice survives a closed tab or a
 * dead battery while offline. Deliberately storage-only: this module
 * never validates, never submits, never talks to the server. A draft
 * is scratch space, not a source of truth - the real balance checks,
 * stock levels, and permission checks this app already relies on only
 * mean something against the server's current state, so submission
 * always goes through the normal, fully-validated API call once back
 * online. See api.js and vite.config.js for the reasoning behind why
 * this app does not queue and replay financial writes.
 *
 * Every record is keyed by companyId, since this app supports one
 * login switching between companies on a shared device - without this,
 * a draft composed for one company could leak into a different
 * company's session on the same browser. clearCompanyDrafts() is
 * called on every logout for exactly this reason (see AuthContext).
 */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('companyId', 'companyId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function draftKey(companyId, docType, draftId) {
  return `${companyId}:${docType}:${draftId}`;
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Saves (creates or overwrites) a draft. data must be JSON-serializable. */
async function saveDraft(companyId, docType, draftId, data) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await promisifyRequest(tx.objectStore(STORE_NAME).put({
    key: draftKey(companyId, docType, draftId),
    companyId, docType, draftId, data,
    updatedAt: new Date().toISOString(),
  }));
  db.close();
}

/** Returns a draft's stored data, or null if none exists. */
async function getDraft(companyId, docType, draftId) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const record = await promisifyRequest(tx.objectStore(STORE_NAME).get(draftKey(companyId, docType, draftId)));
  db.close();
  return record ? record.data : null;
}

/** Removes one draft - called after a successful, real submission. */
async function deleteDraft(companyId, docType, draftId) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await promisifyRequest(tx.objectStore(STORE_NAME).delete(draftKey(companyId, docType, draftId)));
  db.close();
}

/** Lists every draft for a company and document type, newest first. */
async function listDrafts(companyId, docType) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.objectStore(STORE_NAME).index('companyId');
  const all = await promisifyRequest(index.getAll(companyId));
  db.close();
  return all
    .filter((r) => r.docType === docType)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Deletes every draft belonging to a company, regardless of document
 * type. Called on every logout (see AuthContext) - the critical
 * multi-tenancy safeguard that keeps one company's in-progress work
 * from ever being visible in a different company's session on a
 * shared device, even briefly.
 */
async function clearCompanyDrafts(companyId) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.objectStore(STORE_NAME).index('companyId');
  const matches = await promisifyRequest(index.getAll(companyId));
  const store = tx.objectStore(STORE_NAME);
  await Promise.all(matches.map((record) => promisifyRequest(store.delete(record.key))));
  db.close();
}

/**
 * Best-effort request that the browser not silently evict this data
 * under storage pressure. Not supported everywhere (notably limited on
 * iOS Safari) - failure here is not an error, just means eviction is
 * possible, same as it always was without this call.
 */
async function requestPersistence() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export { saveDraft, getDraft, deleteDraft, listDrafts, clearCompanyDrafts, requestPersistence };

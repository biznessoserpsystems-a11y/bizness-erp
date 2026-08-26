import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { saveDraft, getDraft, deleteDraft } from '../services/offlineDrafts';

/**
 * Offers a form a small, deliberately narrow surface for offline draft
 * support: check for an existing draft on mount, save the current form
 * state (debounced, so typing doesn't hit IndexedDB on every
 * keystroke), and discard it once the real submission has actually
 * succeeded. Scoped to the signed-in company automatically - a form
 * using this hook never needs to think about company isolation itself.
 *
 * Deliberately does not auto-restore a found draft into the form -
 * restoredDraft is handed back so the caller can ask first ("You have
 * an unsaved draft from 10:42am - restore it?") rather than silently
 * overwriting whatever the person was about to type.
 */
export function useOfflineDraft(docType, draftId = 'default') {
  const { company } = useAuth();
  const [restoredDraft, setRestoredDraft] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    getDraft(company.id, docType, draftId).then((draft) => {
      if (!cancelled) setRestoredDraft(draft);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, docType, draftId]);

  const save = useCallback((data, { debounceMs = 800 } = {}) => {
    if (!company?.id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveDraft(company.id, docType, draftId, data);
    }, debounceMs);
  }, [company?.id, docType, draftId]);

  const discard = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!company?.id) return Promise.resolve();
    setRestoredDraft(null);
    return deleteDraft(company.id, docType, draftId);
  }, [company?.id, docType, draftId]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { restoredDraft, save, discard };
}

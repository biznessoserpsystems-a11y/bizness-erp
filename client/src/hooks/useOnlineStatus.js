import { useEffect, useState } from 'react';

/**
 * Tracks the browser's own online/offline state via the standard
 * `online`/`offline` window events, seeded from navigator.onLine on
 * first render. This is the same signal api.js's request interceptor
 * checks before blocking a write — this hook exists so the UI (the
 * offline banner, disabled submit buttons) can react to the same
 * state, not a separately-computed guess at connectivity.
 *
 * Also tracks lastOnlineAt — the last moment the app was known to be
 * connected — so the offline banner can give an honest, specific
 * timestamp for how stale any cached data being viewed might be,
 * rather than a vague "you might be seeing old data" warning.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [lastOnlineAt, setLastOnlineAt] = useState(() => new Date());

  useEffect(() => {
    function goOnline() {
      setIsOnline(true);
      setLastOnlineAt(new Date());
    }
    function goOffline() {
      // The moment connectivity is lost is itself the most accurate
      // "last known good" timestamp — without this, a session that had
      // been open and online for hours before losing connection would
      // still show its original page-load time instead.
      setLastOnlineAt(new Date());
      setIsOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline, lastOnlineAt };
}

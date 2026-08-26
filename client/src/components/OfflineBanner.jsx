import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Rendered once, near the root of the app, so it's visible regardless
 * of which page someone is on. Deliberately doesn't say anything about
 * writes being queued for later — see api.js and vite.config.js for
 * why this app doesn't do that. The message here is meant to be
 * honestly boring: you can keep looking at what's already loaded, you
 * can't save anything new until you're back online.
 */
export default function OfflineBanner() {
  const { isOnline, lastOnlineAt } = useOnlineStatus();

  if (isOnline) return null;

  const timeLabel = lastOnlineAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="offline-banner" role="status">
      You're offline — showing data as of {timeLabel}. Changes can't be saved until you reconnect.
    </div>
  );
}

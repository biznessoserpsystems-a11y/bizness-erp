import { useEffect, useState } from 'react';

/**
 * Shows the dashboard is live without any motion — a static dot plus text
 * that ticks itself every second ("Live · updated 12s ago"). The liveness
 * comes from the data actually refreshing on an interval (see the caller),
 * not from decorative animation.
 */
export default function LiveIndicator({ lastUpdated }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!lastUpdated) return null;

  const seconds = Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
  const label = seconds < 5 ? 'updated just now'
    : seconds < 60 ? `updated ${seconds}s ago`
    : `updated ${Math.floor(seconds / 60)}m ago`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} aria-hidden="true" />
      <span>Live · {label}</span>
    </div>
  );
}

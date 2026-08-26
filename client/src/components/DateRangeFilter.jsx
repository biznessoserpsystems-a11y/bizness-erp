import { useEffect, useRef, useState } from 'react';

const PRESETS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'last_6_months', label: 'Last 6 months' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'this_year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves a preset key (or explicit custom dates) into a concrete
 * { from, to } range — the single source of truth every dashboard fetch
 * derives its period from. Exported so the page using this filter can
 * compute the same range without re-deriving the logic.
 */
export function resolveDateRange(mode, customFrom, customTo) {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (mode) {
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(from), to: fmt(endOfToday) };
    }
    case 'last_3_months': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: fmt(from), to: fmt(endOfToday) };
    }
    case 'this_quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const from = new Date(now.getFullYear(), qStartMonth, 1);
      return { from: fmt(from), to: fmt(endOfToday) };
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: fmt(from), to: fmt(endOfToday) };
    }
    case 'custom': {
      if (customFrom && customTo) return { from: customFrom, to: customTo };
      // Incomplete custom selection — fall back to last 6 months rather than an invalid range.
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { from: fmt(from), to: fmt(endOfToday) };
    }
    case 'last_6_months':
    default: {
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { from: fmt(from), to: fmt(endOfToday) };
    }
  }
}

/**
 * Splits a { from, to } range into calendar-month buckets for trend charts
 * (one bar/point per month), capped at 12 buckets — a custom range spanning
 * several years would otherwise render an unreadable chart. Each bucket
 * itself is a { from, to, label } sub-range, clipped to the outer range's
 * actual boundaries (so a range starting mid-month doesn't pull in data
 * from before it).
 */
export function monthBucketsInRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  const buckets = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end && buckets.length < 12) {
    const bucketStart = cursor > start ? cursor : start;
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const bucketEnd = monthEnd < end ? monthEnd : end;
    buckets.push({
      from: fmt(bucketStart),
      to: fmt(bucketEnd),
      label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return buckets;
}

export default function DateRangeFilter({ mode, onModeChange, customFrom, customTo, onCustomChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel = PRESETS.find((p) => p.key === mode)?.label || 'Last 6 months';

  return (
    <div ref={ref} className="dropdown-anchor" style={{ display: 'inline-block' }}>
      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setOpen((o) => !o)}>
        📅 {currentLabel} ▾
      </button>
      {open && (
        <div className="dropdown-menu" style={{ minWidth: 220 }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="dropdown-menu-item"
              onClick={() => { onModeChange(p.key); if (p.key !== 'custom') setOpen(false); }}
              style={p.key === mode ? { fontWeight: 700, color: 'var(--color-primary)' } : undefined}
            >
              {p.label}
            </button>
          ))}
          {mode === 'custom' && (
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="date" value={customFrom || ''} onChange={(e) => onCustomChange(e.target.value, customTo)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              <input type="date" value={customTo || ''} onChange={(e) => onCustomChange(customFrom, e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              <button type="button" className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setOpen(false)}>Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { SEMANTIC } from './theme';

/**
 * Small inline badge showing percentage change vs. a comparison period.
 * Drop into a KPI card next to the headline value.
 *
 * props:
 *  - current, previous: raw numbers to diff (percent computed automatically)
 *  - pct: pass a pre-computed percent change directly instead of current/previous
 *  - goodDirection: 'up' (default, growth is good) or 'down' (decline is good — e.g. overdue balances)
 *  - label: caption after the percentage, e.g. "vs last period"
 */
export default function TrendIndicator({ current, previous, pct, goodDirection = 'up', label = 'vs last period' }) {
  let change = pct;
  if (change === undefined && previous !== undefined && previous !== null) {
    if (Number(previous) === 0) {
      change = Number(current) === 0 ? 0 : null; // undefined % change from a zero base
    } else {
      change = ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
    }
  }

  if (change === null || change === undefined || Number.isNaN(change)) {
    return <span className="trend-indicator trend-flat">— {label}</span>;
  }

  const isFlat = Math.abs(change) < 0.05;
  const isUp = change > 0;
  const isGood = isFlat ? true : (goodDirection === 'up' ? isUp : !isUp);
  const color = isFlat ? SEMANTIC.neutral : (isGood ? SEMANTIC.positive : SEMANTIC.negative);
  const arrow = isFlat ? '→' : (isUp ? '▲' : '▼');

  return (
    <span className="trend-indicator" style={{ color }}>
      {arrow} {Math.abs(change).toFixed(1)}% <span className="trend-caption">{label}</span>
    </span>
  );
}

/**
 * Renders a numeric value with an optional formatter. No count-up motion —
 * the "live" feeling comes from the value itself refreshing on a polling
 * interval upstream (see Dashboard.jsx), not from animating between values.
 * Kept as its own component so callers didn't need to change when the
 * animation was removed.
 */
export default function AnimatedNumber({ value, formatter }) {
  const display = Number(value) || 0;
  return <>{formatter ? formatter(display) : Math.round(display).toLocaleString()}</>;
}

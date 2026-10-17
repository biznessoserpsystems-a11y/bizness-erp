// Shared visual language for every chart/gauge/trend widget in the app.
// Colors are plain hex (not CSS vars) because Recharts/SVG props can't
// resolve custom properties reliably across browsers for fill/stroke.
// Kept in sync with the palette in styles.css :root.

export const CHART_COLORS = [
  '#0B6E4F', // cedi green (primary)
  '#C9971F', // trading gold
  '#2B6CB0', // muted steel blue
  '#B3541E', // terracotta
  '#6B7B2A', // olive
  '#7A3B54', // muted plum
  '#1F7A72', // deep teal
  '#8A5B08', // ochre
];

export const SEMANTIC = {
  positive: '#2F9E6E',
  negative: '#B3261E',
  neutral: '#726B5C',
  primary: '#0B6E4F',
  warning: '#B9790A',
};

export const GRID_COLOR = '#E7E0D2';
export const AXIS_COLOR = '#726B5C';
export const TOOLTIP_STYLE = {
  background: 'white',
  border: '1px solid #E7E0D2',
  borderRadius: 10,
  boxShadow: '0 4px 12px rgba(33,30,25,0.08)',
  fontSize: 13,
  padding: '8px 12px',
};

export const AXIS_TICK_STYLE = { fontSize: 12, fill: AXIS_COLOR };

export function colorAt(i) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

export function formatCompactNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
}

export function formatMoney(n, currency = 'GHS') {
  const num = Number(n) || 0;
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Accounting convention for statements: negatives in brackets, e.g. GHS (5,258.50).
// Positives get a trailing non-breaking space so decimal points line up with the
// closing bracket on negatives when the column is right-aligned.
export function formatAccounting(n, currency = 'GHS') {
  const num = Number(n) || 0;
  // Rounding is left to toLocaleString, exactly as formatMoney does, so figures
  // never differ by a cent from the rest of the app; only the sign display changes.
  const text = Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // A tiny negative that rounds to 0.00 shows as 0.00, not (0.00).
  const isNegative = num < 0 && Math.abs(num) >= 0.005;
  return isNegative ? `${currency} (${text})` : `${currency} ${text}\u00A0`;
}

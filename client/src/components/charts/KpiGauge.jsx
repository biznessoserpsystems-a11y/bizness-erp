import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { SEMANTIC } from './theme';
import AnimatedNumber from '../AnimatedNumber';

/**
 * Radial gauge for a single metric against a min/max range — e.g. current
 * ratio, gross margin %, budget utilization, stock cover days.
 *
 * props:
 *  - label: metric name
 *  - value: raw numeric value (for display)
 *  - display: pre-formatted string to show instead of `value` (e.g. "42.3%") —
 *      used as-is (no count-up) when `formatter` isn't provided, or as the
 *      fallback shown when `value` isn't a finite number (e.g. null ratios)
 *  - formatter: (n) => string — if provided and `value` is finite, the center
 *      number animates from 0 using this formatter (e.g. `pct` or `fmt`)
 *  - min / max: range the gauge represents
 *  - target: optional — if provided, color reflects distance from target
 *  - goodDirection: 'up' (higher is better, default) or 'down' (lower is better)
 *  - hint: small caption under the value
 */
export default function KpiGauge({ label, value, display, formatter, isNull = false, min = 0, max = 100, target, goodDirection = 'up', hint, size = 150 }) {
  const clamped = Math.max(min, Math.min(max, Number(value) || 0));
  const pct = max === min ? 0 : ((clamped - min) / (max - min)) * 100;
  const isFinite = !isNull && value !== null && value !== undefined && !Number.isNaN(Number(value));

  let color = SEMANTIC.primary;
  if (target !== undefined && target !== null) {
    const meetsTarget = goodDirection === 'up' ? clamped >= target : clamped <= target;
    color = meetsTarget ? SEMANTIC.positive : (pct < 35 ? SEMANTIC.negative : SEMANTIC.warning);
  }

  const data = [{ value: pct, fill: color }];

  return (
    <div className="kpi-gauge-card">
      <div style={{ width: '100%', height: size, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            barSize={12}
            data={data}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#eef1f5' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="kpi-gauge-value">
          <div className="kpi-gauge-number">
            {formatter && isFinite ? <AnimatedNumber value={value} formatter={formatter} /> : (display ?? value)}
          </div>
        </div>
      </div>
      <div className="kpi-gauge-label">{label}</div>
      {hint && <div className="kpi-gauge-hint">{hint}</div>}
    </div>
  );
}

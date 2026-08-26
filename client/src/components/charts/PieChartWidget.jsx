import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartCard from './ChartCard';
import { CHART_COLORS, TOOLTIP_STYLE, formatCompactNumber } from './theme';

/**
 * Pie / donut chart for composition (share of revenue by customer,
 * receivables aging split, stock value by warehouse, ...).
 *
 * props:
 *  - data: [{ name, value }]
 *  - donut: render as a donut with a center label
 *  - centerLabel / centerValue: shown in the middle when donut=true
 */
export default function PieChartWidget({
  title, subtitle, action, height = 300, loading, data = [],
  donut = true, centerLabel, centerValue, valueFormatter = formatCompactNumber,
}) {
  const empty = !loading && (!data || data.length === 0 || data.every((d) => !d.value));

  return (
    <ChartCard title={title} subtitle={subtitle} action={action} height={height} loading={loading} empty={empty}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={donut ? '58%' : 0}
              outerRadius="85%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="white"
              strokeWidth={2}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => valueFormatter(v)} />
            <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        {donut && (centerLabel || centerValue) && (
          <div className="pie-center-label" style={{ right: '18%' }}>
            {centerValue && <div className="pie-center-value">{centerValue}</div>}
            {centerLabel && <div className="pie-center-caption">{centerLabel}</div>}
          </div>
        )}
      </div>
    </ChartCard>
  );
}

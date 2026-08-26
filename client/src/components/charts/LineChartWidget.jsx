import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartCard from './ChartCard';
import { CHART_COLORS, GRID_COLOR, TOOLTIP_STYLE, AXIS_TICK_STYLE, formatCompactNumber } from './theme';

/**
 * Line chart for time series (revenue over time, stock levels, headcount, ...).
 *
 * props:
 *  - data: [{ name, <seriesKey>: number, ... }]  — `name` is the x-axis label (date/period)
 *  - lines: [{ key, label, color? }]
 */
export default function LineChartWidget({
  title, subtitle, action, height = 300, loading, data = [],
  lines, valueFormatter = formatCompactNumber,
}) {
  const empty = !loading && (!data || data.length === 0);

  return (
    <ChartCard title={title} subtitle={subtitle} action={action} height={height} loading={loading} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={valueFormatter} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => valueFormatter(v)} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l, i) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label || l.key}
              stroke={l.color || CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

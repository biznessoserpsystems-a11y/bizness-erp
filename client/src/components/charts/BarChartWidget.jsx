import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import ChartCard from './ChartCard';
import { CHART_COLORS, GRID_COLOR, TOOLTIP_STYLE, AXIS_TICK_STYLE, formatCompactNumber } from './theme';

/**
 * Bar chart for comparing discrete categories (top products, top customers,
 * aging buckets, revenue vs. expense, etc).
 *
 * props:
 *  - data: [{ name, <seriesKey>: number, ... }]
 *  - bars: [{ key, label, color? }]  — one entry per series/bar
 *  - colorByCategory: if true and there's a single bar, color each bar
 *      individually instead of using one color for the whole series
 *  - valueFormatter: (n) => string, used in tooltip + axis
 *  - horizontal: render as a horizontal bar chart (good for long category names)
 */
export default function BarChartWidget({
  title, subtitle, action, height = 300, loading, data = [],
  bars, colorByCategory = false, valueFormatter = formatCompactNumber, horizontal = false, stacked = false,
}) {
  const empty = !loading && (!data || data.length === 0);

  return (
    <ChartCard title={title} subtitle={subtitle} action={action} height={height} loading={loading} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={valueFormatter} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} width={110} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 50 : 30} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={valueFormatter} axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => valueFormatter(v)} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b, i) => (
            <Bar key={b.key} dataKey={b.key} name={b.label || b.key} fill={b.color || CHART_COLORS[i % CHART_COLORS.length]} radius={stacked ? 0 : [6, 6, 0, 0]} maxBarSize={40} stackId={stacked ? 'stack' : undefined}>
              {colorByCategory && bars.length === 1 && data.map((d, di) => (
                <Cell key={di} fill={d.color || CHART_COLORS[di % CHART_COLORS.length]} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

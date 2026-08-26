import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartCard from './ChartCard';
import { CHART_COLORS, GRID_COLOR, TOOLTIP_STYLE, AXIS_TICK_STYLE, formatCompactNumber } from './theme';

/**
 * Area chart — good for cumulative totals, stacked composition over time,
 * or emphasizing volume/magnitude of a trend (e.g. cash balance, stock value).
 *
 * props:
 *  - data: [{ name, <seriesKey>: number, ... }]
 *  - areas: [{ key, label, color? }]
 *  - stacked: stack multiple series on top of each other
 */
export default function AreaChartWidget({
  title, subtitle, action, height = 300, loading, data = [],
  areas, stacked = false, valueFormatter = formatCompactNumber,
}) {
  const empty = !loading && (!data || data.length === 0);

  return (
    <ChartCard title={title} subtitle={subtitle} action={action} height={height} loading={loading} empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            {areas.map((a, i) => {
              const color = a.color || CHART_COLORS[i % CHART_COLORS.length];
              return (
                <linearGradient key={a.key} id={`areaFill-${a.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={valueFormatter} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => valueFormatter(v)} />
          {areas.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {areas.map((a, i) => {
            const color = a.color || CHART_COLORS[i % CHART_COLORS.length];
            return (
              <Area
                key={a.key}
                type="monotone"
                dataKey={a.key}
                name={a.label || a.key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#areaFill-${a.key})`}
                stackId={stacked ? 'stack' : undefined}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, PieChartWidget, LineChartWidget, formatMoney } from '../components/charts';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

// Result vs Target -> a status badge. For "lower is better" KPIs (stock-out,
// overstock, dead stock, shrinkage) the comparison direction flips.
function kpiStatus(result, target, lowerIsBetter) {
  if (result === null || result === undefined) return { label: 'No data', className: 'badge-neutral' };
  if (lowerIsBetter) {
    if (result <= target) return { label: 'Good', className: 'badge-success' };
    if (result <= target * 1.5) return { label: 'Warning', className: 'badge-warning' };
    return { label: 'Critical', className: 'badge-danger' };
  }
  if (result >= target) return { label: 'Good', className: 'badge-success' };
  if (result >= target * 0.7) return { label: 'Warning', className: 'badge-warning' };
  return { label: 'Critical', className: 'badge-danger' };
}

const KPI_LABELS = {
  inventoryTurnover: 'Inventory Turnover',
  fillRate: 'Fill Rate',
  stockAccuracy: 'Stock Accuracy',
  orderFulfilmentRate: 'Order Fulfilment Rate',
  stockOutRate: 'Stock-out Rate',
  overstockRate: 'Overstock Rate',
  deadStockPct: 'Dead Stock %',
  shrinkagePct: 'Shrinkage %',
};

function formatKpi(result, unit) {
  if (result === null || result === undefined) return '—';
  return unit === '%' ? `${result.toFixed(1)}%` : `${result.toFixed(2)}${unit}`;
}

export default function InventoryWorkspace() {
  const { hasPermission: can } = useAuth();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [warehouses, setWarehouses] = useState(null);
  const [lowStock, setLowStock] = useState(null); // null = loading, false = no permission
  const [expiry, setExpiry] = useState(null);
  const [damagedGoods, setDamagedGoods] = useState(null);
  const [counts, setCounts] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});
    api.get('/warehouses').then(({ data }) => setWarehouses(data)).catch(() => setWarehouses([]));

    if (can('inventory.reports.view')) {
      api.get('/inventory-reports/low-stock').then(({ data }) => setLowStock(data)).catch(() => setLowStock([]));
      api.get('/inventory-reports/expiry?withinDays=30').then(({ data }) => setExpiry(data)).catch(() => setExpiry([]));
      api.get('/stock/damaged-goods?limit=10').then(({ data }) => setDamagedGoods(data)).catch(() => setDamagedGoods([]));
      api.get(`/inventory-reports/workspace-dashboard?from=${from}&to=${to}`).then(({ data }) => setDashboard(data)).catch(() => setDashboard(null));
    } else {
      setLowStock(false);
      setExpiry(false);
      setDamagedGoods(false);
      setDashboard(false);
    }

    if (can('inventory.counts.manage')) {
      api.get('/inventory-counts').then(({ data }) => setCounts(data)).catch(() => setCounts([]));
    } else {
      setCounts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const currency = company?.base_currency || 'GHS';
  const money = (v) => formatMoney(v, currency);

  const lowStockSorted = lowStock
    ? [...lowStock].sort((a, b) => (Number(a.quantity) - Number(a.reorder_level)) - (Number(b.quantity) - Number(b.reorder_level)))
    : [];
  const outOfStock = lowStockSorted.filter((l) => Number(l.quantity) <= 0);
  const reorderSoon = lowStockSorted.filter((l) => Number(l.quantity) > 0);

  const draftCounts = counts ? counts.filter((c) => c.status === 'draft') : [];
  const noExceptions = lowStockSorted.length === 0 && (!expiry || expiry.length === 0) && (!damagedGoods || damagedGoods.length === 0);

  const fastSlowChart = dashboard
    ? [
        ...dashboard.charts.fastMoving.map((p) => ({ name: p.name, quantity: p.quantity, color: '#0B6E4F' })),
        ...dashboard.charts.slowMoving.map((p) => ({ name: p.name, quantity: p.quantity, color: '#B3261E' })),
      ]
    : [];

  return (
    <DashboardLayout
      title="Inventory & Warehouse"
      subtitle="Your stock and warehouse workspace"
      actions={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/inventory/products')}>Products</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/inventory/warehouses')}>Warehouses</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/inventory/stock')}>Stock Ops</button>
        </div>
      )}
    >
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total stock value</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard === false ? '—' : money(dashboard.totalStockValue)}</div>
        </div>
        {lowStock !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Low stock items</div>
            <div className="kpi-value" style={lowStockSorted.length > 0 ? { color: 'var(--color-error)' } : undefined}>
              {lowStock === null ? '...' : lowStockSorted.length}
            </div>
          </div>
        )}
        {expiry !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Expiring within 30 days</div>
            <div className="kpi-value">{expiry === null ? '...' : expiry.length}</div>
          </div>
        )}
        <div className="kpi-card">
          <div className="kpi-label">Warehouses</div>
          <div className="kpi-value">{warehouses === null ? '...' : warehouses.length}</div>
        </div>
      </div>

      {dashboard && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Inventory KPIs</h2>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
            Turnover, fill rate, order fulfilment, and shrinkage are for the selected period ({from} to {to}). Stock-out rate, overstock rate, and dead stock (90-day lookback, fixed) reflect stock on hand right now regardless of the period selected. Overstock uses a 3× reorder-level heuristic — this schema has no explicit maximum-stock field.
          </p>
          <table>
            <thead><tr><th>KPI</th><th>Result</th><th>Target</th><th>Status</th></tr></thead>
            <tbody>
              {Object.entries(dashboard.kpis).map(([key, k]) => {
                const status = kpiStatus(k.result, k.target, k.lowerIsBetter);
                return (
                  <tr key={key}>
                    <td>{KPI_LABELS[key]}</td>
                    <td className="statement-amount" style={{ fontFamily: 'var(--font-mono)' }}>{formatKpi(k.result, k.unit)}</td>
                    <td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{k.lowerIsBetter ? '≤ ' : '≥ '}{k.target}{k.unit}</td>
                    <td><span className={`badge ${status.className}`}>{status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dashboard && (
        <div className="chart-grid" style={{ marginBottom: 16 }}>
          <PieChartWidget
            title="Inventory value by category"
            data={dashboard.charts.valueByCategory}
            donut
            valueFormatter={(v) => money(v)}
          />
          <BarChartWidget
            title="Stock movement analysis"
            subtitle={`${from} to ${to}, by month`}
            data={dashboard.charts.movementAnalysis}
            bars={[
              { key: 'in', label: 'Stock in', color: '#0B6E4F' },
              { key: 'out', label: 'Stock out', color: '#B3261E' },
              { key: 'countAdjustment', label: 'Count adjustments', color: '#C9971F' },
            ]}
          />
          <BarChartWidget
            title="Warehouse inventory distribution"
            subtitle="By category, stacked"
            data={dashboard.charts.warehouseDistribution.data}
            bars={dashboard.charts.warehouseDistribution.categories.map((c) => ({ key: c, label: c }))}
            stacked
            valueFormatter={(v) => money(v)}
          />
          <BarChartWidget
            title="Inventory ageing"
            subtitle="By value, days since last received"
            data={dashboard.charts.aging}
            bars={[{ key: 'value', label: 'Stock value' }]}
            colorByCategory
            horizontal
            valueFormatter={(v) => money(v)}
          />
          <PieChartWidget
            title="ABC classification"
            subtitle="By cumulative value contribution"
            data={dashboard.charts.abcClassification}
            valueFormatter={(v) => money(v)}
          />
          <BarChartWidget
            title="Fast vs. slow moving items"
            subtitle={`By units moved out, ${from} to ${to}`}
            data={fastSlowChart}
            bars={[{ key: 'quantity', label: 'Units moved' }]}
            colorByCategory
            horizontal
          />
          <BarChartWidget
            title="Top 10 inventory items by value"
            data={dashboard.charts.topItemsByValue}
            bars={[{ key: 'value', label: 'Stock value' }]}
            colorByCategory
            horizontal
            valueFormatter={(v) => money(v)}
          />
          <LineChartWidget
            title="Inventory turnover trend"
            subtitle="COGS per month ÷ current stock value (approximation)"
            data={dashboard.charts.turnoverTrend}
            lines={[{ key: 'turnover', label: 'Turnover ratio', color: '#0B6E4F' }]}
          />
        </div>
      )}

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Quick alerts</h2>
            {lowStock === false && expiry === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to inventory reports.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing low on stock, expiring, or reported damaged right now.</p>
            ) : (
              <ul className="feed-list">
                {outOfStock.slice(0, 5).map((l) => (
                  <li key={`oos-${l.product_id}-${l.warehouse_id}`}>
                    <span className="feed-list-title">
                      <span className="badge badge-danger" style={{ marginRight: 6 }}>Out of stock</span>
                      {l.name} at {l.warehouse_name}
                    </span>
                    <span className="feed-list-detail">Reorder at {Number(l.reorder_level).toLocaleString()} {l.uom_symbol}</span>
                  </li>
                ))}
                {reorderSoon.slice(0, 5).map((l) => (
                  <li key={`ro-${l.product_id}-${l.warehouse_id}`}>
                    <span className="feed-list-title">
                      <span className="badge badge-warning" style={{ marginRight: 6 }}>Reorder</span>
                      {l.name} is below reorder level at {l.warehouse_name}
                    </span>
                    <span className="feed-list-detail">
                      {Number(l.quantity).toLocaleString()} {l.uom_symbol} on hand · reorder at {Number(l.reorder_level).toLocaleString()}
                    </span>
                  </li>
                ))}
                {(expiry || []).slice(0, 5).map((e) => (
                  <li key={`exp-${e.id}`}>
                    <span className="feed-list-title">{e.product_name} (batch {e.batch_no}) expires in {e.days_until_expiry} day{e.days_until_expiry === 1 ? '' : 's'}</span>
                    <span className="feed-list-detail">
                      {Number(e.quantity_remaining).toLocaleString()} remaining at {e.warehouse_name}
                    </span>
                  </li>
                ))}
                {(damagedGoods || []).slice(0, 5).map((d) => (
                  <li key={`dmg-${d.id}`}>
                    <span className="feed-list-title">
                      <span className="badge badge-neutral" style={{ marginRight: 6 }}>Damaged</span>
                      {d.product_name} at {d.warehouse_name}
                    </span>
                    <span className="feed-list-detail">
                      {Number(d.quantity).toLocaleString()} units · {d.reason} · {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="factsheet-rail">
          <div className="card">
            <h2>Warehouses</h2>
            {warehouses === null ? (
              <p>Loading...</p>
            ) : warehouses.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No warehouses set up yet.</p>
            ) : (
              warehouses.slice(0, 6).map((w) => (
                <div key={w.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>{w.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{w.branch_name || 'No branch assigned'}</p>
                </div>
              ))
            )}
          </div>

          {counts !== false && (
            <div className="card">
              <h2>Counts in progress</h2>
              {counts === null ? (
                <p>Loading...</p>
              ) : draftCounts.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No draft counts open.</p>
              ) : (
                draftCounts.slice(0, 5).map((c) => (
                  <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                    <p style={{ fontSize: 13, margin: '0 0 2px' }}>{c.count_no} — {c.warehouse_name}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{c.line_count} line{c.line_count === '1' ? '' : 's'} · started {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

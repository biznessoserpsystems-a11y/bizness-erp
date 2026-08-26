import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, PieChartWidget, LineChartWidget, formatMoney, formatCompactNumber } from '../components/charts';
import ExportMenu from '../components/ExportMenu';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const TABS = [
  { key: 'low-stock', label: 'Reorder / Low Stock' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'expiry', label: 'Expiry Watch' },
  { key: 'bin-card', label: 'Bin Card' },
  { key: 'management-report', label: 'Management Report' },
];

export default function InventoryReports() {
  const [tab, setTab] = useState('low-stock');

  return (
    <DashboardLayout title="Inventory Reports">
      <div className="toolbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ width: 'auto' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'low-stock' && <LowStockReport />}
      {tab === 'valuation' && <ValuationReport />}
      {tab === 'expiry' && <ExpiryReport />}
      {tab === 'bin-card' && <BinCardReport />}
      {tab === 'management-report' && <ManagementReport />}
    </DashboardLayout>
  );
}

function LowStockReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory-reports/low-stock').then(({ data }) => setRows(data)).finally(() => setLoading(false));
  }, []);

  const shortfallChart = rows
    .slice(0, 8)
    .map((r) => ({ name: r.name, shortfall: Math.max(0, Number(r.reorder_level) - Number(r.quantity)) }));

  return (
    <>
      {!loading && rows.length > 0 && (
        <BarChartWidget
          title="Biggest shortfalls"
          subtitle="Reorder level minus quantity on hand"
          data={shortfallChart}
          bars={[{ key: 'shortfall', label: 'Units short', color: '#B3261E' }]}
          colorByCategory={false}
          horizontal
          valueFormatter={formatCompactNumber}
        />
      )}
    <div className="card">
      <div className="card-header">
        <h2>Items at or below reorder level</h2>
        {rows.length > 0 && <ExportMenu path="/inventory-reports/low-stock" filename="low-stock" />}
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Nothing needs reordering right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Warehouse</th>
              <th>On hand</th>
              <th>Reorder level</th>
              <th>Suggested reorder qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.sku}</td>
                <td>{r.name}</td>
                <td>{r.warehouse_name}</td>
                <td><span className="badge badge-danger">{Number(r.quantity).toLocaleString()} {r.uom_symbol}</span></td>
                <td>{Number(r.reorder_level).toLocaleString()}</td>
                <td>{Number(r.reorder_quantity).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </>
  );
}

function BinCardReport() {
  const [bins, setBins] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [binId, setBinId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/warehouses').then(({ data }) => setWarehouses(data));
  }, []);

  useEffect(() => {
    const q = warehouseId ? `?warehouseId=${warehouseId}` : '';
    api.get(`/inventory-reports/bins${q}`).then(({ data }) => {
      setBins(data);
      // Keep the current selection if it's still in the (possibly filtered) list; otherwise pick the first.
      setBinId((prev) => (data.some((b) => b.id === prev) ? prev : data[0]?.id || ''));
    });
  }, [warehouseId]);

  useEffect(() => {
    if (!binId) { setData(null); return; }
    setLoading(true);
    api.get(`/inventory-reports/bin-card?binId=${binId}`).then(({ data }) => setData(data)).finally(() => setLoading(false));
  }, [binId]);

  const balanceTrend = data ? data.charts.balanceTrend.map((p) => ({ name: new Date(p.date).toLocaleDateString(), balance: p.balance })) : [];
  const monthlyInOut = data ? data.charts.monthlyInOut.map((m) => ({ name: m.month, in: m.in, out: m.out })) : [];
  const movementBreakdown = data ? data.charts.movementTypeBreakdown : [];

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Select bin</h2>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Every product gets its own bin automatically the first time stock is received into a warehouse — via a
          purchase (GRN), a production receipt, or a stock transfer. Pick one below to see its full card.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={binId} onChange={(e) => setBinId(e.target.value)} style={{ flex: 1, minWidth: 260, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            {bins.length === 0 && <option value="">No bins yet</option>}
            {bins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bin_code} — {b.sku} · {b.product_name} ({b.warehouse_name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="card"><p>Loading...</p></div>}

      {!loading && data && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <div className="kpi-card">
              <div className="kpi-label">Bin</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>{data.bin.binCode}</div>
              <div className="kpi-footer">{data.bin.sku} · {data.bin.warehouseName}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Current balance</div>
              <div className="kpi-value">{data.totals.currentBalance.toLocaleString()} {data.bin.uomSymbol}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total received</div>
              <div className="kpi-value">{data.totals.totalIn.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total issued</div>
              <div className="kpi-value">{data.totals.totalOut.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Average cost</div>
              <div className="kpi-value">{formatMoney(data.bin.averageCost)}</div>
            </div>
          </div>

          <div className="chart-grid">
            <LineChartWidget
              title="Stock balance over time"
              subtitle="Running balance after each movement"
              data={balanceTrend}
              lines={[{ key: 'balance', label: 'Balance', color: 'var(--color-primary)' }]}
              valueFormatter={formatCompactNumber}
            />
            <BarChartWidget
              title="Receipts vs issues by month"
              data={monthlyInOut}
              bars={[
                { key: 'in', label: 'Received', color: '#1F9D55' },
                { key: 'out', label: 'Issued', color: '#B3261E' },
              ]}
              valueFormatter={formatCompactNumber}
            />
            <PieChartWidget
              title="Movement type breakdown"
              subtitle="Quantity by movement type, all-time"
              data={movementBreakdown}
              valueFormatter={formatCompactNumber}
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Bin card — {data.bin.sku} · {data.bin.productName}</h2>
              <ExportMenu path="/inventory-reports/bin-card" params={{ binId }} filename={`bin-card-${data.bin.binCode}`} />
            </div>
            {data.ledger.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>No movements recorded for this bin yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Movement</th>
                    <th>Reference</th>
                    <th>Qty In</th>
                    <th>Qty Out</th>
                    <th>Balance</th>
                    <th>Unit Cost</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((l) => (
                    <tr key={l.id}>
                      <td>{new Date(l.date).toLocaleDateString()}</td>
                      <td>{l.movementLabel}</td>
                      <td>{l.referenceType || '—'}{l.reason ? ` · ${l.reason}` : ''}</td>
                      <td>{l.qtyIn > 0 ? <span className="badge badge-success">+{l.qtyIn.toLocaleString()}</span> : '—'}</td>
                      <td>{l.qtyOut > 0 ? <span className="badge badge-danger">-{l.qtyOut.toLocaleString()}</span> : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{l.balance.toLocaleString()}</td>
                      <td>{formatMoney(l.unitCost)}</td>
                      <td>{l.performedBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!loading && !data && bins.length === 0 && (
        <div className="card">
          <p style={{ color: 'var(--color-text-muted)' }}>
            No bins yet — a bin is created automatically the first time a product is received into a warehouse
            (via Goods Received against a purchase order, a production receipt, or a stock transfer).
          </p>
        </div>
      )}
    </>
  );
}

function ValuationReport() {
  const [data, setData] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const q = warehouseId ? `?warehouseId=${warehouseId}` : '';
    api.get(`/inventory-reports/valuation${q}`).then(({ data }) => setData(data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get('/warehouses').then(({ data }) => setWarehouses(data));
  }, []);

  useEffect(load, [warehouseId]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Current stock value</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {data && <ExportMenu path="/inventory-reports/valuation" params={warehouseId ? { warehouseId } : {}} filename="stock-valuation" />}
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="kpi-card" style={{ marginBottom: 16, maxWidth: 260 }}>
            <div className="kpi-label">Total inventory value</div>
            <div className="kpi-value">GHS {data.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>

          <div className="chart-grid">
            <PieChartWidget
              title="Value by warehouse"
              data={Object.values(
                data.lines.reduce((acc, r) => {
                  acc[r.warehouse_name] = acc[r.warehouse_name] || { name: r.warehouse_name, value: 0 };
                  acc[r.warehouse_name].value += Number(r.stock_value);
                  return acc;
                }, {})
              )}
              valueFormatter={(v) => formatMoney(v)}
            />
            <BarChartWidget
              title="Highest-value items"
              data={[...data.lines].sort((a, b) => Number(b.stock_value) - Number(a.stock_value)).slice(0, 8).map((r) => ({ name: r.name, value: Number(r.stock_value) }))}
              bars={[{ key: 'value', label: 'Stock value' }]}
              colorByCategory
              horizontal
              valueFormatter={(v) => formatMoney(v)}
            />
          </div>

          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Qty</th>
                <th>Avg. unit cost</th>
                <th>Stock value</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((r, i) => (
                <tr key={i}>
                  <td>{r.sku}</td>
                  <td>{r.name}</td>
                  <td>{r.warehouse_name}</td>
                  <td>{Number(r.quantity).toLocaleString()} {r.uom_symbol}</td>
                  <td>GHS {Number(r.average_cost).toFixed(2)}</td>
                  <td>GHS {Number(r.stock_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ExpiryReport() {
  const [rows, setRows] = useState([]);
  const [withinDays, setWithinDays] = useState(30);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get(`/inventory-reports/expiry?withinDays=${withinDays}`).then(({ data }) => setRows(data)).finally(() => setLoading(false));
  }

  useEffect(load, [withinDays]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Batches expiring soon</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={withinDays} onChange={(e) => setWithinDays(e.target.value)} style={{ width: 180, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <option value={7}>Next 7 days</option>
            <option value={30}>Next 30 days</option>
            <option value={90}>Next 90 days</option>
          </select>
          {rows.length > 0 && <ExportMenu path="/inventory-reports/expiry" params={{ withinDays }} filename="stock-expiry" />}
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Nothing expiring in this window.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Warehouse</th>
              <th>Batch</th>
              <th>Qty remaining</th>
              <th>Expiry date</th>
              <th>Days left</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.sku}</td>
                <td>{r.product_name}</td>
                <td>{r.warehouse_name}</td>
                <td>{r.batch_no}</td>
                <td>{Number(r.quantity_remaining).toLocaleString()}</td>
                <td>{new Date(r.expiry_date).toLocaleDateString()}</td>
                <td>
                  <span className={`badge ${r.days_until_expiry <= 7 ? 'badge-danger' : 'badge-neutral'}`}>
                    {r.days_until_expiry} days
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SUMMARY_LABELS = {
  totalInventoryValue: 'Total Inventory Value',
  numberOfItems: 'Number of Items',
  totalQuantityOnHand: 'Total Quantity on Hand',
  inventoryTurnover: 'Inventory Turnover',
  stockDays: 'Stock Days',
  slowMovingItems: 'Slow Moving Items',
  deadStockItems: 'Dead Stock Items',
  outOfStockItems: 'Out of Stock Items',
  overstockItems: 'Overstock Items',
};

function fmtSummary(key, value) {
  if (value === null || value === undefined) return '—';
  if (key === 'totalInventoryValue') return `GHS ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  if (key === 'inventoryTurnover') return `${Number(value).toFixed(1)}x`;
  if (key === 'stockDays') return `${Number(value).toFixed(0)} Days`;
  return Number(value).toLocaleString();
}

function ManagementReport() {
  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/inventory-reports/management-report?from=${from}&to=${to}`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [from, to]);

  const money = (v) => `GHS ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const num = (v) => Number(v || 0).toLocaleString();
  const dateStr = (d) => (d ? new Date(d).toLocaleDateString() : '—');

  return (
    <div className="card">
      <div className="statement-header">
        <div>
          <h2 className="statement-title">Inventory Management Report</h2>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            "Previous Period" compares against the period of the same length immediately before the one selected — not the same period last year.
          </p>
        </div>
        <div className="statement-actions">
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          {data && <ExportMenu path="/inventory-reports/management-report" params={{ from, to }} filename={`inventory-management-report-${from}-to-${to}`} />}
        </div>
      </div>

      {!data ? <p>Loading...</p> : (
        <>
          {/* ---- 1. Executive Summary ---- */}
          <h3 style={{ fontSize: 14, marginTop: 20 }}>1. Executive Summary</h3>
          <table className="statement-table">
            <thead><tr><th>KPI</th><th style={{ textAlign: 'right' }}>Current Period</th><th style={{ textAlign: 'right' }}>Previous Period</th><th style={{ textAlign: 'right' }}>Variance</th></tr></thead>
            <tbody>
              {data.executiveSummary.map((row) => (
                <tr className="statement-line-row" key={row.key}>
                  <td>{SUMMARY_LABELS[row.key]}</td>
                  <td className="statement-amount">{fmtSummary(row.key, row.current)}</td>
                  <td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{fmtSummary(row.key, row.previous)}</td>
                  <td className="statement-amount">{row.variancePct === null ? '—' : `${row.variancePct >= 0 ? '+' : ''}${row.variancePct.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---- 2. Inventory Valuation ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>2. Inventory Valuation by Category</h3>
          <table>
            <thead><tr><th>Category</th><th>Qty</th><th>Value (GHS)</th><th>% of Total</th></tr></thead>
            <tbody>
              {data.valuationByCategory.map((c) => (
                <tr key={c.category}><td>{c.category}</td><td>{num(c.qty)}</td><td>{money(c.value)}</td><td>{c.pctOfTotal?.toFixed(1)}%</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 3. Inventory by Warehouse ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>3. Inventory by Warehouse</h3>
          <table>
            <thead><tr><th>Warehouse</th><th>Items</th><th>Quantity</th><th>Value (GHS)</th></tr></thead>
            <tbody>
              {data.byWarehouse.map((w) => (
                <tr key={w.warehouse}><td>{w.warehouse}</td><td>{num(w.items)}</td><td>{num(w.quantity)}</td><td>{money(w.value)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 4. Stock Movement Summary ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>4. Stock Movement Summary</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -6 }}>Opening Stock is derived by working backward from today's actual stock through this period's movements — this system doesn't keep historical point-in-time snapshots.</p>
          <table>
            <thead><tr><th>Movement</th><th>Quantity</th><th>Value (GHS)</th></tr></thead>
            <tbody>
              <tr><td>Opening Stock</td><td>—</td><td>{money(data.movementSummary.openingStock.value)}</td></tr>
              <tr><td>Purchases</td><td>{num(data.movementSummary.purchases.qty)}</td><td>{money(data.movementSummary.purchases.value)}</td></tr>
              <tr><td>Sales</td><td>{num(data.movementSummary.sales.qty)}</td><td>{money(data.movementSummary.sales.value)}</td></tr>
              <tr><td>Customer Returns</td><td>{num(data.movementSummary.customerReturns.qty)}</td><td>{money(data.movementSummary.customerReturns.value)}</td></tr>
              <tr><td>Supplier Returns</td><td>{num(data.movementSummary.supplierReturns.qty)}</td><td>{money(data.movementSummary.supplierReturns.value)}</td></tr>
              <tr><td>Stock Transfers In</td><td>{num(data.movementSummary.transfersIn.qty)}</td><td>{money(data.movementSummary.transfersIn.value)}</td></tr>
              <tr><td>Stock Transfers Out</td><td>{num(data.movementSummary.transfersOut.qty)}</td><td>{money(data.movementSummary.transfersOut.value)}</td></tr>
              <tr><td>Stock Adjustments</td><td>{num(data.movementSummary.adjustments.qty)}</td><td>{money(data.movementSummary.adjustments.value)}</td></tr>
              <tr className="statement-total-row"><td>Closing Stock</td><td>{num(data.movementSummary.closingStock.qty)}</td><td>{money(data.movementSummary.closingStock.value)}</td></tr>
            </tbody>
          </table>

          {/* ---- 5. Fast Moving Items ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>5. Fast Moving Items</h3>
          <table>
            <thead><tr><th>Item Code</th><th>Description</th><th>Qty Sold</th><th>Revenue</th><th>Closing Stock</th></tr></thead>
            <tbody>
              {data.fastMoving.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>No sales movement in this period.</td></tr> : data.fastMoving.map((f, i) => (
                <tr key={i}><td>{f.itemCode}</td><td>{f.description}</td><td>{num(f.qtySold)}</td><td>{money(f.revenue)}</td><td>{num(f.closingStock)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 6. Slow Moving Inventory ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>6. Slow Moving Inventory <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-muted)' }}>(31–90 days since last sold)</span></h3>
          <table>
            <thead><tr><th>Item</th><th>Quantity</th><th>Value</th><th>Last Sold</th><th>Days in Stock</th></tr></thead>
            <tbody>
              {data.slowMoving.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>Nothing in this range.</td></tr> : data.slowMoving.map((s, i) => (
                <tr key={i}><td>{s.item}</td><td>{num(s.quantity)}</td><td>{money(s.value)}</td><td>{dateStr(s.lastSold)}</td><td>{s.daysInStock}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 7. Dead Stock Report ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>7. Dead Stock Report <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-muted)' }}>(over 90 days without movement, or never)</span></h3>
          <table>
            <thead><tr><th>Item</th><th>Quantity</th><th>Value</th><th>Days Without Movement</th></tr></thead>
            <tbody>
              {data.deadStock.length === 0 ? <tr><td colSpan={4} style={{ color: 'var(--color-text-muted)' }}>None.</td></tr> : data.deadStock.map((d, i) => (
                <tr key={i}><td>{d.item}</td><td>{num(d.quantity)}</td><td>{money(d.value)}</td><td>{d.daysWithoutMovement ?? 'No record'}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 8. Reorder Level Report ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>8. Reorder Level Report</h3>
          <table>
            <thead><tr><th>Item</th><th>Current Stock</th><th>Reorder Level</th><th>Recommended Purchase</th></tr></thead>
            <tbody>
              {data.reorderLevel.length === 0 ? <tr><td colSpan={4} style={{ color: 'var(--color-text-muted)' }}>Nothing at or below reorder level.</td></tr> : data.reorderLevel.map((r, i) => (
                <tr key={i}><td>{r.item}</td><td>{num(r.currentStock)}</td><td>{num(r.reorderLevel)}</td><td>{num(r.recommendedPurchase)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 9. Overstock Report ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>9. Overstock Report <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-muted)' }}>(maximum level = 3× reorder level — no explicit max-stock field exists)</span></h3>
          <table>
            <thead><tr><th>Item</th><th>Quantity</th><th>Maximum Level</th><th>Excess Quantity</th><th>Value</th></tr></thead>
            <tbody>
              {data.overstock.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>Nothing overstocked.</td></tr> : data.overstock.map((o, i) => (
                <tr key={i}><td>{o.item}</td><td>{num(o.quantity)}</td><td>{num(o.maximumLevel)}</td><td>{num(o.excessQuantity)}</td><td>{money(o.value)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 10. Stock Ageing Analysis ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>10. Stock Ageing Analysis</h3>
          <table>
            <thead><tr><th>Age</th><th>Quantity</th><th>Value (GHS)</th></tr></thead>
            <tbody>
              {data.stockAgeing.map((a) => (
                <tr key={a.age}><td>{a.age}</td><td>{num(a.qty)}</td><td>{money(a.value)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 11. Inventory Turnover Analysis ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>11. Inventory Turnover Analysis</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -6 }}>Cost of Goods Sold is apportioned across categories by their share of current inventory value — this system doesn't post COGS per category directly. Formula: Turnover = COGS ÷ Average Inventory.</p>
          <table>
            <thead><tr><th>Category</th><th>Average Inventory</th><th>Cost of Goods Sold</th><th>Turnover Ratio</th></tr></thead>
            <tbody>
              {data.turnoverByCategory.map((t) => (
                <tr key={t.category}><td>{t.category}</td><td>{money(t.averageInventory)}</td><td>{money(t.costOfGoodsSold)}</td><td>{t.turnoverRatio !== null ? `${t.turnoverRatio.toFixed(2)}x` : '—'}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 12. Stock Adjustment Report ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>12. Stock Adjustment Report</h3>
          <table>
            <thead><tr><th>Date</th><th>Item</th><th>Adjustment Type</th><th>Quantity</th><th>Value</th></tr></thead>
            <tbody>
              {data.stockAdjustments.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>No adjustments in this period.</td></tr> : data.stockAdjustments.map((a, i) => (
                <tr key={i}><td>{dateStr(a.date)}</td><td>{a.item}</td><td>{a.adjustmentType}</td><td>{num(a.quantity)}</td><td>{money(a.value)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 13. Damaged & Expired Stock ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>13. Damaged &amp; Expired Stock</h3>
          <table>
            <thead><tr><th>Item</th><th>Quantity</th><th>Value</th><th>Expiry Date</th><th>Action Required</th></tr></thead>
            <tbody>
              {data.damagedExpired.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>None.</td></tr> : data.damagedExpired.map((d, i) => (
                <tr key={i}><td>{d.item}</td><td>{num(d.quantity)}</td><td>{money(d.value)}</td><td>{d.expiryDate ? dateStr(d.expiryDate) : '—'}</td><td>{d.actionRequired}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 14. Batch & Serial Number Tracking ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>14. Batch &amp; Serial Number Tracking</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -6 }}>This system tracks a batch's received date, not a separate manufacturing date — shown here in that column rather than mislabeled.</p>
          <table>
            <thead><tr><th>Batch/Serial</th><th>Item</th><th>Qty</th><th>Received Date</th><th>Expiry Date</th><th>Warehouse</th></tr></thead>
            <tbody>
              {data.batchTracking.length === 0 ? <tr><td colSpan={6} style={{ color: 'var(--color-text-muted)' }}>No batch-tracked stock on hand.</td></tr> : data.batchTracking.map((b, i) => (
                <tr key={i}><td>{b.batch_no}</td><td>{b.product_name}</td><td>{num(b.quantity_remaining)}</td><td>{dateStr(b.received_date)}</td><td>{b.expiry_date ? dateStr(b.expiry_date) : '—'}</td><td>{b.warehouse_name}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 15. Inventory Variance Report ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>15. Inventory Variance Report <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-muted)' }}>(completed counts in this period)</span></h3>
          <table>
            <thead><tr><th>Item</th><th>System Qty</th><th>Physical Count</th><th>Variance</th><th>Value Difference</th></tr></thead>
            <tbody>
              {data.varianceReport.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>No completed stock counts in this period.</td></tr> : data.varianceReport.map((v, i) => (
                <tr key={i}><td>{v.item}</td><td>{num(v.systemQty)}</td><td>{num(v.physicalCount)}</td><td>{num(v.variance)}</td><td>{money(v.valueDifference)}</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 16. ABC Classification ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>16. ABC Inventory Classification</h3>
          <table>
            <thead><tr><th>Category</th><th>Number of Items</th><th>Inventory Value</th><th>% of Total</th></tr></thead>
            <tbody>
              {data.abcClassification.map((a) => (
                <tr key={a.category}><td>Class {a.category}</td><td>{num(a.numberOfItems)}</td><td>{money(a.inventoryValue)}</td><td>{a.pctOfTotal?.toFixed(1)}%</td></tr>
              ))}
            </tbody>
          </table>

          {/* ---- 17. Top 20 Most Valuable Items ---- */}
          <h3 style={{ fontSize: 14, marginTop: 24 }}>17. Top 20 Most Valuable Items</h3>
          <table>
            <thead><tr><th>Rank</th><th>Item</th><th>Quantity</th><th>Unit Cost</th><th>Total Value</th></tr></thead>
            <tbody>
              {data.top20ByValue.map((t) => (
                <tr key={t.rank}><td>{t.rank}</td><td>{t.item}</td><td>{num(t.quantity)}</td><td>{money(t.unitCost)}</td><td>{money(t.totalValue)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

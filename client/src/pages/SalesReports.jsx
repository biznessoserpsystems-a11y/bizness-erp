import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, PieChartWidget, TrendIndicator, formatMoney } from '../components/charts';
import AnimatedNumber from '../components/AnimatedNumber';
import ExportMenu from '../components/ExportMenu';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const TABS = [
  { key: 'summary', label: 'Sales Summary' },
  { key: 'aging', label: 'Receivables Aging' },
  { key: 'register', label: 'Sales Register' },
];

export default function SalesReports() {
  const [tab, setTab] = useState('summary');

  return (
    <DashboardLayout title="Sales Reports">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <SummaryReport />}
      {tab === 'aging' && <AgingReport />}
      {tab === 'register' && <RegisterReport />}
    </DashboardLayout>
  );
}

// Helper: this-month and last-month date ranges (YYYY-MM-DD) for trend comparisons.
function monthRange(offset) {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

function SummaryReport() {
  const [data, setData] = useState(null);
  const [prevTotals, setPrevTotals] = useState(null);

  useEffect(() => {
    api.get('/sales-reports/summary').then(({ data }) => setData(data));
    const thisMonth = monthRange(0);
    const lastMonth = monthRange(-1);
    api.get(`/sales-reports/summary?from=${lastMonth.from}&to=${lastMonth.to}`)
      .then(({ data }) => setPrevTotals(data.totals))
      .catch(() => setPrevTotals(null));
  }, []);

  if (!data) return <div className="card"><p>Loading...</p></div>;

  const productChart = data.byProduct.slice(0, 8).map((p) => ({ name: p.name, revenue: Number(p.revenue) }));
  const customerPie = data.byCustomer.slice(0, 6).map((c) => ({ name: c.name, value: Number(c.revenue) }));

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total sales</div>
          <div className="kpi-value">GHS <AnimatedNumber value={data.totals.total_sales} formatter={(v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /></div>
          <div className="kpi-footer">
            {prevTotals && <TrendIndicator current={data.totals.total_sales} previous={prevTotals.total_sales} label="vs last month" />}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total tax collected</div>
          <div className="kpi-value">GHS <AnimatedNumber value={data.totals.total_tax} formatter={(v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Invoices issued</div>
          <div className="kpi-value"><AnimatedNumber value={data.totals.invoice_count} /></div>
          <div className="kpi-footer">
            {prevTotals && <TrendIndicator current={data.totals.invoice_count} previous={prevTotals.invoice_count} label="vs last month" />}
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <BarChartWidget
          title="Top products by revenue"
          data={productChart}
          bars={[{ key: 'revenue', label: 'Revenue' }]}
          colorByCategory
          horizontal
          valueFormatter={(v) => formatMoney(v)}
        />
        <PieChartWidget
          title="Revenue share by customer"
          data={customerPie}
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      <div className="card">
        <h2>Top products by revenue</h2>
        <table>
          <thead><tr><th>SKU</th><th>Product</th><th>Qty sold</th><th>Revenue</th></tr></thead>
          <tbody>
            {data.byProduct.map((p) => (
              <tr key={p.product_id}>
                <td>{p.sku}</td><td>{p.name}</td><td>{Number(p.quantity_sold).toLocaleString()}</td>
                <td>GHS {Number(p.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {data.byProduct.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Top customers by revenue</h2>
        <table>
          <thead><tr><th>Customer</th><th>Invoices</th><th>Revenue</th></tr></thead>
          <tbody>
            {data.byCustomer.map((c) => (
              <tr key={c.customer_id}>
                <td>{c.name}</td><td>{c.invoice_count}</td>
                <td>GHS {Number(c.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {data.byCustomer.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AgingReport() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/sales-reports/receivables-aging').then(({ data }) => setData(data));
  }, []);

  if (!data) return <div className="card"><p>Loading...</p></div>;

  const bucketPie = [
    { name: 'Current', value: Number(data.buckets.current) },
    { name: '1-30 days', value: Number(data.buckets.days1to30) },
    { name: '31-60 days', value: Number(data.buckets.days31to60) },
    { name: '61-90 days', value: Number(data.buckets.days61to90) },
    { name: '90+ days', value: Number(data.buckets.over90) },
  ];
  const totalOutstanding = bucketPie.reduce((s, b) => s + b.value, 0);

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Current</div><div className="kpi-value">GHS {data.buckets.current.toFixed(2)}</div></div>
        <div className="kpi-card"><div className="kpi-label">1–30 days</div><div className="kpi-value">GHS {data.buckets.days1to30.toFixed(2)}</div></div>
        <div className="kpi-card"><div className="kpi-label">31–60 days</div><div className="kpi-value">GHS {data.buckets.days31to60.toFixed(2)}</div></div>
        <div className="kpi-card"><div className="kpi-label">61–90 days</div><div className="kpi-value">GHS {data.buckets.days61to90.toFixed(2)}</div></div>
        <div className="kpi-card"><div className="kpi-label">90+ days</div><div className="kpi-value">GHS {data.buckets.over90.toFixed(2)}</div></div>
      </div>

      <PieChartWidget
        title="Aging composition"
        subtitle="Share of outstanding receivables by age bucket"
        data={bucketPie}
        centerLabel="Outstanding"
        centerValue={formatMoney(totalOutstanding).replace(/\.\d\d$/, '')}
        valueFormatter={(v) => formatMoney(v)}
        height={280}
      />

      <div className="card">
        <div className="card-header">
          <h2>Outstanding invoices</h2>
          <ExportMenu path="/sales-reports/receivables-aging" filename="receivables-aging" />
        </div>
        <table>
          <thead><tr><th>Invoice #</th><th>Customer</th><th>Due date</th><th>Balance</th><th>Days overdue</th></tr></thead>
          <tbody>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.invoice_no}</td>
                <td>{i.customer_name}</td>
                <td>{i.due_date ? new Date(i.due_date).toLocaleDateString() : '—'}</td>
                <td>GHS {Number(i.balance).toFixed(2)}</td>
                <td>
                  <span className={`badge ${i.days_overdue > 30 ? 'badge-danger' : 'badge-neutral'}`}>{i.days_overdue} days</span>
                </td>
              </tr>
            ))}
            {data.invoices.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Nothing outstanding. 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RegisterReport() {
  const [rows, setRows] = useState([]);
  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);

  function load() {
    api.get(`/sales-reports/register?from=${from}&to=${to}`).then(({ data }) => setRows(data));
  }

  useEffect(load, [from, to]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Sales register</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          <ExportMenu path="/sales-reports/register" params={{ from, to }} filename="sales-register" />
        </div>
      </div>
      <table>
        <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.invoice_no}</td>
              <td>{r.customer_name}</td>
              <td>{new Date(r.invoice_date).toLocaleDateString()}</td>
              <td>GHS {Number(r.subtotal).toFixed(2)}</td>
              <td>GHS {Number(r.tax_amount).toFixed(2)}</td>
              <td>GHS {Number(r.total_amount).toFixed(2)}</td>
              <td>GHS {Number(r.balance).toFixed(2)}</td>
              <td><span className={`badge ${r.status === 'paid' ? 'badge-success' : r.status === 'void' ? 'badge-neutral' : 'badge-danger'}`}>{r.status}</span></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No invoices in range.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatMoney, KpiGauge } from '../components/charts';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';
import AnimatedNumber from '../components/AnimatedNumber';
import CreateTaskFromInsight from '../components/CreateTaskFromInsight';
import StructuredInsight from '../components/StructuredInsight';
import { IconBadge } from '../Style';
import { IconProcurement, IconManufacturing } from '../components/icons';

const money = (n) => formatMoney(n);

// The first page of the planned Executive Dashboard Suite — Operations,
// spanning Inventory, Procurement, and Manufacturing together, since all
// three genuinely describe one continuous flow (buy materials, hold
// stock, turn it into product). Deliberately reuses each module's own
// existing dashboard/summary endpoint rather than re-deriving the same
// numbers a second time — Inventory's workspace-dashboard and
// Procurement's summary/payables-aging already existed and are already
// exercised elsewhere in the app; only Manufacturing needed a new
// lightweight summary endpoint, since nothing equivalent existed for it.
export default function Operations() {
  const { hasPermission } = useAuth();
  const can = (code) => hasPermission(code);

  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = resolveDateRange(rangeMode, customFrom, customTo);

  const [inventory, setInventory] = useState(null);
  const [procurement, setProcurement] = useState(null);
  const [payablesAging, setPayablesAging] = useState(null);
  const [manufacturing, setManufacturing] = useState(null);

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  useEffect(() => {
    if (can('inventory.reports.view')) {
      api.get(`/inventory-reports/workspace-dashboard?from=${range.from}&to=${range.to}`)
        .then(({ data }) => setInventory(data)).catch(() => setInventory(null));
    }
    if (can('procurement.reports.view')) {
      api.get(`/procurement-reports/summary?from=${range.from}&to=${range.to}`)
        .then(({ data }) => setProcurement(data)).catch(() => setProcurement(null));
      api.get('/procurement-reports/payables-aging')
        .then(({ data }) => setPayablesAging(data)).catch(() => setPayablesAging(null));
    }
    if (can('manufacturing.reports.view')) {
      api.get('/operations/manufacturing-summary')
        .then(({ data }) => setManufacturing(data)).catch(() => setManufacturing(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // Deliberately not fetched automatically on page load — a live AI call
  // has real latency and, for anyone who's configured a paid API key,
  // real cost. The person explicitly asks for it via the button below.
  async function generateInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const { data } = await api.get('/operations/ai-insights');
      setInsight(data);
    } catch (err) {
      setInsightError(err.response?.data?.error || 'Could not generate an insight right now.');
    } finally {
      setInsightLoading(false);
    }
  }

  const payablesTotal = payablesAging ? Object.values(payablesAging.buckets).reduce((s, v) => s + Number(v), 0) : null;
  const payablesOverdue = payablesAging ? Number(payablesAging.buckets.days61to90) + Number(payablesAging.buckets.over90) : null;

  return (
    <DashboardLayout
      title="Operations Dashboard"
      subtitle="Inventory, Procurement, and Manufacturing together"
      actions={<DateRangeFilter mode={rangeMode} onModeChange={setRangeMode} customFrom={customFrom} customTo={customTo} onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />}
    >
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>AI Insight</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={generateInsight} disabled={insightLoading}>
            {insightLoading ? 'Generating…' : 'Generate Insight'}
          </button>
        </div>
        {insightError && <div className="error-banner">{insightError}</div>}
        {!insight && !insightError && (
          <p className="dashboard-empty-note">Ask for a real, current-data narrative summary of how Operations is doing right now.</p>
        )}
        {insight && insight.available === false && (
          <p className="dashboard-empty-note">{insight.message}</p>
        )}
        {insight && insight.available && (
          <>
            <StructuredInsight insight={insight.insight} />
            <CreateTaskFromInsight insightText={`${insight.insight.whatHappened} ${insight.insight.why} ${insight.insight.whatsLikely} ${insight.insight.whatToDo}`} sourceLabel="Operations" />
          </>
        )}
      </div>

      {can('inventory.reports.view') && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2>Inventory</h2>
            <Link to="/inventory/reports" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Inventory Reports</Link>
          </div>
          {!inventory ? <p className="dashboard-empty-note">Loading…</p> : (
            <>
              <p style={{ fontSize: 14, marginBottom: 16 }}>Total stock value: <strong>{money(inventory.totalStockValue)}</strong></p>
              <div className="gauge-grid">
                <KpiGauge label="Inventory Turnover" value={inventory.kpis.inventoryTurnover.result} target={inventory.kpis.inventoryTurnover.target} min={0} max={12} formatter={(n) => `${n.toFixed(1)}x`} />
                <KpiGauge label="Fill Rate" value={inventory.kpis.fillRate.result} target={inventory.kpis.fillRate.target} min={0} max={100} formatter={(n) => `${n.toFixed(0)}%`} />
                <KpiGauge label="Stock Accuracy" value={inventory.kpis.stockAccuracy.result} target={inventory.kpis.stockAccuracy.target} min={0} max={100} formatter={(n) => `${n.toFixed(0)}%`} />
                <KpiGauge label="Order Fulfilment" value={inventory.kpis.orderFulfilmentRate.result} target={inventory.kpis.orderFulfilmentRate.target} min={0} max={100} formatter={(n) => `${n.toFixed(0)}%`} />
                <KpiGauge label="Stock-Out Rate" value={inventory.kpis.stockOutRate.result} target={inventory.kpis.stockOutRate.target} goodDirection="down" min={0} max={20} formatter={(n) => `${n.toFixed(1)}%`} />
                <KpiGauge label="Overstock Rate" value={inventory.kpis.overstockRate.result} target={inventory.kpis.overstockRate.target} goodDirection="down" min={0} max={30} formatter={(n) => `${n.toFixed(1)}%`} />
                <KpiGauge label="Dead Stock %" value={inventory.kpis.deadStockPct.result} target={inventory.kpis.deadStockPct.target} goodDirection="down" min={0} max={15} formatter={(n) => `${n.toFixed(1)}%`} />
                <KpiGauge label="Shrinkage %" value={inventory.kpis.shrinkagePct.result} target={inventory.kpis.shrinkagePct.target} goodDirection="down" min={0} max={5} formatter={(n) => `${n.toFixed(2)}%`} />
              </div>
            </>
          )}
        </div>
      )}

      {can('procurement.reports.view') && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2>Procurement</h2>
            <Link to="/procurement" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Procurement</Link>
          </div>
          <div className="kpi-grid">
            <Link to="/procurement/purchase-invoices" className="kpi-card kpi-card-link">
              <IconBadge icon={IconProcurement} tone="primary" />
              <div className="kpi-label">Total Purchases</div>
              <div className="kpi-value">{procurement ? money(procurement.totals.total_purchases) : '—'}</div>
              <div className="kpi-footer">{procurement ? `${procurement.totals.invoice_count} invoices this period` : ''}</div>
            </Link>
            <Link to="/procurement/purchase-invoices" className="kpi-card kpi-card-link">
              <IconBadge icon={IconProcurement} tone={payablesOverdue > 0 ? 'warning' : 'primary'} />
              <div className="kpi-label">Outstanding Payables</div>
              <div className="kpi-value">{payablesTotal !== null ? money(payablesTotal) : '—'}</div>
              <div className="kpi-footer" style={payablesOverdue > 0 ? { color: 'var(--color-error)' } : undefined}>
                {payablesOverdue !== null ? `${money(payablesOverdue)} overdue 61+ days` : ''}
              </div>
            </Link>
          </div>
        </div>
      )}

      {can('manufacturing.reports.view') && (
        <div className="card">
          <div className="card-header">
            <h2>Manufacturing</h2>
            <Link to="/manufacturing/menu" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Manufacturing</Link>
          </div>
          {!manufacturing ? <p className="dashboard-empty-note">Loading…</p> : (
            <div className="kpi-grid">
              <Link to="/manufacturing" className="kpi-card kpi-card-link">
                <IconBadge icon={IconManufacturing} tone="primary" />
                <div className="kpi-label">Active Work Orders</div>
                <div className="kpi-value"><AnimatedNumber value={manufacturing.activeWorkOrders} /></div>
                <div className="kpi-footer">Materials issued or in progress</div>
              </Link>
              <Link to="/manufacturing" className="kpi-card kpi-card-link">
                <IconBadge icon={IconManufacturing} tone="success" />
                <div className="kpi-label">Completed This Month</div>
                <div className="kpi-value"><AnimatedNumber value={manufacturing.completedThisMonth.count} /></div>
                <div className="kpi-footer">{manufacturing.completedThisMonth.totalQuantity} units produced</div>
              </Link>
              <Link to="/manufacturing" className="kpi-card kpi-card-link">
                <IconBadge icon={IconManufacturing} tone="info" />
                <div className="kpi-label">Draft Work Orders</div>
                <div className="kpi-value"><AnimatedNumber value={manufacturing.statusCounts.draft} /></div>
                <div className="kpi-footer">Not yet started</div>
              </Link>
              <Link to="/manufacturing" className="kpi-card kpi-card-link">
                <IconBadge icon={IconManufacturing} tone="neutral" />
                <div className="kpi-label">Cancelled</div>
                <div className="kpi-value"><AnimatedNumber value={manufacturing.statusCounts.cancelled} /></div>
                <div className="kpi-footer">All time</div>
              </Link>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

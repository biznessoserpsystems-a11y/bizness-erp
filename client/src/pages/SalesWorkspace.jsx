import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatMoney, BarChartWidget, PieChartWidget } from '../components/charts';

function currentMonthRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

// Which workflow entity type shows up in "My approvals" here — the one
// sales document registered in ENTITY_META on the server. Everything else
// (journal entries, purchase orders, etc.) belongs to other workspaces.
const SALES_APPROVAL_TYPES = new Set(['sales_order']);

// Sales orders in these statuses still have goods outstanding to deliver.
const OPEN_ORDER_STATUSES = new Set(['pending', 'confirmed', 'partially_delivered']);

export default function SalesWorkspace() {
  const { hasPermission: can } = useAuth();
  const { showToast } = useToast();

  const [company, setCompany] = useState(null);

  // Each stat starts at null (loading). If the user lacks the permission
  // that stat needs, it's set to `false` and the tile is hidden entirely —
  // same pattern the other workspace pages use.
  const [receivables, setReceivables] = useState(null);
  const [monthlySales, setMonthlySales] = useState(null);
  const [quotations, setQuotations] = useState(null);
  const [orders, setOrders] = useState(null);
  const [approvals, setApprovals] = useState(null);

  function loadApprovals() {
    api.get('/workflow-instances/my-approvals')
      .then(({ data }) => setApprovals(data.filter((a) => SALES_APPROVAL_TYPES.has(a.entity_type))))
      .catch(() => setApprovals([]));
  }

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('sales.reports.view')) {
      api.get('/sales-reports/receivables-aging').then(({ data }) => setReceivables(data)).catch(() => setReceivables(null));

      const { from, to } = currentMonthRange();
      api.get(`/sales-reports/summary?from=${from}&to=${to}`)
        .then(({ data }) => setMonthlySales(Number(data.totals.total_sales)))
        .catch(() => setMonthlySales(null));
    } else {
      setReceivables(false);
      setMonthlySales(false);
    }

    if (can('sales.quotations.manage')) {
      api.get('/quotations').then(({ data }) => setQuotations(data)).catch(() => setQuotations(null));
    } else {
      setQuotations(false);
    }

    if (can('sales.orders.manage')) {
      api.get('/sales-orders').then(({ data }) => setOrders(data)).catch(() => setOrders(null));
    } else {
      setOrders(false);
    }

    loadApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function actOnApproval(id, action) {
    try {
      await api.post(`/workflow-instances/${id}/action`, { action });
      showToast(action === 'approved' ? 'Approved.' : 'Declined.', 'success');
      loadApprovals();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record decision', 'error');
    }
  }

  const currency = company?.base_currency || 'GHS';
  const money = (v) => formatMoney(v, currency);

  const receivablesTotal = receivables ? Object.values(receivables.buckets).reduce((s, v) => s + Number(v), 0) : null;
  const pendingQuotations = quotations ? quotations.filter((q) => q.status === 'sent') : [];
  const openOrders = orders ? orders.filter((o) => OPEN_ORDER_STATUSES.has(o.status)) : [];
  const overdueReceivables = receivables ? receivables.invoices.filter((i) => Number(i.days_overdue) > 0).slice(0, 5) : [];
  const staleQuotations = quotations
    ? quotations.filter((q) => q.status === 'sent' && q.valid_until && new Date(q.valid_until) < new Date()).slice(0, 5)
    : [];
  const noExceptions = overdueReceivables.length === 0 && staleQuotations.length === 0;

  return (
    <DashboardLayout title="Sales" subtitle="Your sales & distribution workspace">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {receivables !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Receivables outstanding</div>
            <div className="kpi-value">{receivablesTotal === null ? '...' : money(receivablesTotal)}</div>
            {receivables && Number(receivables.buckets.over90) > 0 && (
              <div className="kpi-footer" style={{ color: 'var(--color-error)' }}>{money(receivables.buckets.over90)} over 90 days</div>
            )}
          </div>
        )}
        {monthlySales !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Sales (this month)</div>
            <div className="kpi-value">{monthlySales === null ? '...' : money(monthlySales)}</div>
          </div>
        )}
        {quotations !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Quotations awaiting response</div>
            <div className="kpi-value">{quotations === null ? '...' : pendingQuotations.length}</div>
          </div>
        )}
        {orders !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Open sales orders</div>
            <div className="kpi-value">{orders === null ? '...' : openOrders.length}</div>
          </div>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {receivables && (
          <BarChartWidget
            title="Receivables Aging"
            data={[
              { name: 'Current', value: Number(receivables.buckets.current) },
              { name: '1–30 days', value: Number(receivables.buckets.days1to30) },
              { name: '31–60 days', value: Number(receivables.buckets.days31to60) },
              { name: '61–90 days', value: Number(receivables.buckets.days61to90) },
              { name: '90+ days', value: Number(receivables.buckets.over90) },
            ]}
            bars={[{ key: 'value', label: 'Outstanding' }]}
            colorByCategory
            valueFormatter={money}
          />
        )}
        {orders && (
          <PieChartWidget
            title="Open Sales Orders by Status"
            data={Object.entries(
              orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {})
            ).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
        {quotations && (
          <PieChartWidget
            title="Quotations by Status"
            data={Object.entries(
              quotations.reduce((acc, q) => ({ ...acc, [q.status]: (acc[q.status] || 0) + 1 }), {})
            ).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {receivables === false && quotations === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to sales reports or quotations.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing overdue or waiting on you right now.</p>
            ) : (
              <ul className="feed-list">
                {staleQuotations.map((q) => (
                  <li key={`quote-${q.id}`}>
                    <span className="feed-list-title">Quotation {q.quotation_no} has passed its valid-until date</span>
                    <span className="feed-list-detail">{q.customer_name} — {money(q.total_amount)}</span>
                  </li>
                ))}
                {overdueReceivables.map((i) => (
                  <li key={`ar-${i.id}`}>
                    <span className="feed-list-title">Invoice {i.invoice_no} is {i.days_overdue} day{i.days_overdue === 1 ? '' : 's'} overdue</span>
                    <span className="feed-list-detail">{i.customer_name} — {money(i.balance)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="factsheet-rail">
          <div className="card">
            <h2>My approvals</h2>
            {approvals === null ? (
              <p>Loading...</p>
            ) : approvals.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Nothing waiting on you.</p>
            ) : (
              approvals.map((a) => (
                <div key={a.id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>{a.entity_label} — {a.workflow_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                    {money(a.amount)} · requested by {a.submitted_by_first_name} {a.submitted_by_last_name}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => actOnApproval(a.id, 'approved')}>Approve</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => actOnApproval(a.id, 'rejected')}>Decline</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

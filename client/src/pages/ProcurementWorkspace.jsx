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

// Which workflow entity types show up in "My approvals" here — the three
// procurement documents registered in ENTITY_META on the server.
// Everything else (journal entries, leave requests, etc.) belongs to
// other workspaces, not this one.
const PROCUREMENT_APPROVAL_TYPES = new Set(['purchase_requisition', 'purchase_order', 'purchase_invoice']);

// Purchase orders in these statuses still have goods outstanding.
const OPEN_PO_STATUSES = new Set(['pending', 'confirmed', 'partially_received']);

export default function ProcurementWorkspace() {
  const { hasPermission: can } = useAuth();
  const { showToast } = useToast();

  const [company, setCompany] = useState(null);

  // Each stat starts at null (loading). If the user lacks the permission
  // that stat needs, it's set to `false` and the tile is hidden entirely —
  // same pattern AccountingWorkspace.jsx uses.
  const [payables, setPayables] = useState(null);
  const [monthlyPurchases, setMonthlyPurchases] = useState(null);
  const [requisitions, setRequisitions] = useState(null);
  const [openOrders, setOpenOrders] = useState(null);
  const [approvals, setApprovals] = useState(null);

  function loadApprovals() {
    api.get('/workflow-instances/my-approvals')
      .then(({ data }) => setApprovals(data.filter((a) => PROCUREMENT_APPROVAL_TYPES.has(a.entity_type))))
      .catch(() => setApprovals([]));
  }

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('procurement.reports.view')) {
      api.get('/procurement-reports/payables-aging').then(({ data }) => setPayables(data)).catch(() => setPayables(null));

      const { from, to } = currentMonthRange();
      api.get(`/procurement-reports/summary?from=${from}&to=${to}`)
        .then(({ data }) => setMonthlyPurchases(Number(data.totals.total_purchases)))
        .catch(() => setMonthlyPurchases(null));
    } else {
      setPayables(false);
      setMonthlyPurchases(false);
    }

    if (can('procurement.requisitions.manage')) {
      api.get('/requisitions').then(({ data }) => setRequisitions(data)).catch(() => setRequisitions(null));
    } else {
      setRequisitions(false);
    }

    if (can('procurement.orders.manage')) {
      api.get('/purchase-orders').then(({ data }) => setOpenOrders(data)).catch(() => setOpenOrders(null));
    } else {
      setOpenOrders(false);
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

  const payablesTotal = payables ? Object.values(payables.buckets).reduce((s, v) => s + Number(v), 0) : null;
  const pendingRequisitions = requisitions ? requisitions.filter((r) => r.status === 'submitted') : [];
  const openPurchaseOrders = openOrders ? openOrders.filter((o) => OPEN_PO_STATUSES.has(o.status)) : [];
  const overduePayables = payables ? payables.invoices.filter((i) => Number(i.days_overdue) > 0).slice(0, 5) : [];
  const overduePOs = openOrders
    ? openOrders
        .filter((o) => OPEN_PO_STATUSES.has(o.status) && o.expected_date && new Date(o.expected_date) < new Date())
        .slice(0, 5)
    : [];
  const noExceptions = overduePayables.length === 0 && overduePOs.length === 0 && pendingRequisitions.length === 0;

  return (
    <DashboardLayout title="Procurement" subtitle="Your procurement & purchasing workspace">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {payables !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Payables outstanding</div>
            <div className="kpi-value">{payablesTotal === null ? '...' : money(payablesTotal)}</div>
            {payables && Number(payables.buckets.over90) > 0 && (
              <div className="kpi-footer" style={{ color: 'var(--color-error)' }}>{money(payables.buckets.over90)} over 90 days</div>
            )}
          </div>
        )}
        {monthlyPurchases !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Purchases (this month)</div>
            <div className="kpi-value">{monthlyPurchases === null ? '...' : money(monthlyPurchases)}</div>
          </div>
        )}
        {requisitions !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Requisitions awaiting approval</div>
            <div className="kpi-value">{requisitions === null ? '...' : pendingRequisitions.length}</div>
          </div>
        )}
        {openOrders !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Open purchase orders</div>
            <div className="kpi-value">{openOrders === null ? '...' : openPurchaseOrders.length}</div>
            {overduePOs.length > 0 && (
              <div className="kpi-footer" style={{ color: 'var(--color-error)' }}>{overduePOs.length} past expected date</div>
            )}
          </div>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {payables && (
          <BarChartWidget
            title="Payables Aging"
            data={[
              { name: 'Current', value: Number(payables.buckets.current) },
              { name: '1–30 days', value: Number(payables.buckets.days1to30) },
              { name: '31–60 days', value: Number(payables.buckets.days31to60) },
              { name: '61–90 days', value: Number(payables.buckets.days61to90) },
              { name: '90+ days', value: Number(payables.buckets.over90) },
            ]}
            bars={[{ key: 'value', label: 'Outstanding' }]}
            colorByCategory
            valueFormatter={money}
          />
        )}
        {requisitions && (
          <PieChartWidget
            title="Requisitions by Status"
            data={Object.entries(
              requisitions.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
            ).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
        {openOrders && (
          <PieChartWidget
            title="Purchase Orders by Status"
            data={Object.entries(
              openOrders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {})
            ).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {payables === false && requisitions === false && openOrders === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to procurement reports, requisitions, or purchase orders.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing overdue or waiting on you right now.</p>
            ) : (
              <ul className="feed-list">
                {pendingRequisitions.map((r) => (
                  <li key={`req-${r.id}`}>
                    <span className="feed-list-title">Requisition {r.requisition_no} is awaiting approval</span>
                    <span className="feed-list-detail">Submitted {new Date(r.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
                {overduePOs.map((o) => (
                  <li key={`po-${o.id}`}>
                    <span className="feed-list-title">PO {o.order_no} is past its expected delivery date</span>
                    <span className="feed-list-detail">{o.supplier_name || 'Supplier'} — {money(o.total_amount)}</span>
                  </li>
                ))}
                {overduePayables.map((i) => (
                  <li key={`ap-${i.id}`}>
                    <span className="feed-list-title">Bill {i.invoice_no} is {i.days_overdue} day{i.days_overdue === 1 ? '' : 's'} overdue</span>
                    <span className="feed-list-detail">{i.supplier_name} — {money(i.balance)}</span>
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

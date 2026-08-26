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

// Which workflow entity types show up in "My approvals" here. journal_entry
// and purchase_invoice are the two accounting-relevant types registered in
// ENTITY_META on the server; everything else (purchase orders, leave
// requests, etc.) belongs to other workspaces, not this one.
const ACCOUNTING_APPROVAL_TYPES = new Set(['journal_entry', 'purchase_invoice']);

export default function AccountingWorkspace() {
  const { hasPermission: can } = useAuth();
  const { showToast } = useToast();

  const [company, setCompany] = useState(null);

  // Each stat starts at null (loading). If the user lacks the permission
  // that stat needs, it's set to `false` and the tile is hidden entirely —
  // same pattern Dashboard.jsx already uses per-section.
  const [cashTotal, setCashTotal] = useState(null);
  const [cashByAccount, setCashByAccount] = useState(null);
  const [netIncome, setNetIncome] = useState(null);
  const [incomeBreakdown, setIncomeBreakdown] = useState(null);
  const [receivables, setReceivables] = useState(null); // { buckets, invoices }
  const [payables, setPayables] = useState(null);
  const [approvals, setApprovals] = useState(null);

  function loadApprovals() {
    api.get('/workflow-instances/my-approvals')
      .then(({ data }) => setApprovals(data.filter((a) => ACCOUNTING_APPROVAL_TYPES.has(a.entity_type))))
      .catch(() => setApprovals([]));
  }

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('accounting.banking.manage') && can('accounting.ledger.view')) {
      Promise.all([api.get('/bank-accounts'), api.get('/financial-statements/balance-sheet')])
        .then(([bankRes, bsRes]) => {
          const bankAccountIds = new Set(bankRes.data.map((b) => b.account_id));
          const bankMatches = bsRes.data.assets.filter((a) => bankAccountIds.has(a.id));
          const total = bankMatches.reduce((s, a) => s + Number(a.balance), 0);
          setCashTotal(total);
          setCashByAccount(bankMatches.map((a) => ({ name: a.account_name, value: Number(a.balance) })));
        })
        .catch(() => { setCashTotal(null); setCashByAccount(null); });
    } else {
      setCashTotal(false);
      setCashByAccount(false);
    }

    if (can('accounting.ledger.view')) {
      const { from, to } = currentMonthRange();
      api.get(`/financial-statements/income-statement?from=${from}&to=${to}`)
        .then(({ data }) => {
          setNetIncome(data.totals.netIncome);
          setIncomeBreakdown([
            { name: 'Revenue', value: Number(data.totals.totalRevenue) },
            { name: 'COGS', value: Number(data.totals.totalCogs) },
            { name: 'Operating Expense', value: Number(data.totals.totalOperatingExpense) },
          ]);
        })
        .catch(() => { setNetIncome(null); setIncomeBreakdown(null); });
    } else {
      setNetIncome(false);
      setIncomeBreakdown(false);
    }

    if (can('sales.reports.view')) {
      api.get('/sales-reports/receivables-aging').then(({ data }) => setReceivables(data)).catch(() => setReceivables(null));
    } else {
      setReceivables(false);
    }

    if (can('procurement.reports.view')) {
      api.get('/procurement-reports/payables-aging').then(({ data }) => setPayables(data)).catch(() => setPayables(null));
    } else {
      setPayables(false);
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
  const payablesTotal = payables ? Object.values(payables.buckets).reduce((s, v) => s + Number(v), 0) : null;

  const overdueReceivables = receivables ? receivables.invoices.filter((i) => Number(i.days_overdue) > 0).slice(0, 5) : [];
  const overduePayables = payables ? payables.invoices.filter((i) => Number(i.days_overdue) > 0).slice(0, 5) : [];
  const noExceptions = overdueReceivables.length === 0 && overduePayables.length === 0;

  return (
    <DashboardLayout title="Accounting" subtitle="Your accounting workspace" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Workspace' }]}>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {cashTotal !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Cash on hand</div>
            <div className="kpi-value">{cashTotal === null ? '...' : money(cashTotal)}</div>
          </div>
        )}
        {netIncome !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Net income (this month)</div>
            <div className="kpi-value">{netIncome === null ? '...' : money(netIncome)}</div>
          </div>
        )}
        {receivables !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Receivables outstanding</div>
            <div className="kpi-value">{receivablesTotal === null ? '...' : money(receivablesTotal)}</div>
            {receivables && Number(receivables.buckets.over90) > 0 && (
              <div className="kpi-footer" style={{ color: 'var(--color-error)' }}>{money(receivables.buckets.over90)} over 90 days</div>
            )}
          </div>
        )}
        {payables !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Payables outstanding</div>
            <div className="kpi-value">{payablesTotal === null ? '...' : money(payablesTotal)}</div>
            {payables && Number(payables.buckets.over90) > 0 && (
              <div className="kpi-footer" style={{ color: 'var(--color-error)' }}>{money(payables.buckets.over90)} over 90 days</div>
            )}
          </div>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {cashByAccount && cashByAccount.length > 0 && (
          <BarChartWidget title="Cash by Bank Account" data={cashByAccount} bars={[{ key: 'value', label: 'Balance' }]} colorByCategory valueFormatter={money} />
        )}
        {receivables && payables && (
          <BarChartWidget
            title="Receivables vs Payables Aging"
            data={[
              { name: 'Current', receivables: Number(receivables.buckets.current), payables: Number(payables.buckets.current) },
              { name: '1–30d', receivables: Number(receivables.buckets.days1to30), payables: Number(payables.buckets.days1to30) },
              { name: '31–60d', receivables: Number(receivables.buckets.days31to60), payables: Number(payables.buckets.days31to60) },
              { name: '61–90d', receivables: Number(receivables.buckets.days61to90), payables: Number(payables.buckets.days61to90) },
              { name: '90+d', receivables: Number(receivables.buckets.over90), payables: Number(payables.buckets.over90) },
            ]}
            bars={[{ key: 'receivables', label: 'Receivables' }, { key: 'payables', label: 'Payables' }]}
            valueFormatter={money}
          />
        )}
        {incomeBreakdown && (
          <PieChartWidget title="Income Statement Composition (this month)" data={incomeBreakdown} valueFormatter={money} />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {receivables === false && payables === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to receivables or payables reports.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing overdue right now.</p>
            ) : (
              <ul className="feed-list">
                {overdueReceivables.map((i) => (
                  <li key={`ar-${i.id}`}>
                    <span className="feed-list-title">Invoice {i.invoice_no} is {i.days_overdue} day{i.days_overdue === 1 ? '' : 's'} overdue</span>
                    <span className="feed-list-detail">{i.customer_name} — {money(i.balance)}</span>
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

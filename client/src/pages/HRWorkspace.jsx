import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatMoney, BarChartWidget, PieChartWidget } from '../components/charts';

// Which workflow entity types show up in "My approvals" here — the two
// HR documents registered in ENTITY_META on the server. Everything else
// (journal entries, purchase orders, etc.) belongs to other workspaces.
const HR_APPROVAL_TYPES = new Set(['leave_request', 'expense_claim']);

export default function HRWorkspace() {
  const { hasPermission: can } = useAuth();
  const { showToast } = useToast();

  const [company, setCompany] = useState(null);

  // Each stat starts at null (loading). If the user lacks the permission
  // that stat needs, it's set to `false` and the tile is hidden entirely —
  // same pattern AccountingWorkspace.jsx / ProcurementWorkspace.jsx use.
  const [headcount, setHeadcount] = useState(null);
  const [pendingLeave, setPendingLeave] = useState(null);
  const [payrollRuns, setPayrollRuns] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [approvals, setApprovals] = useState(null);

  function loadApprovals() {
    api.get('/workflow-instances/my-approvals')
      .then(({ data }) => setApprovals(data.filter((a) => HR_APPROVAL_TYPES.has(a.entity_type))))
      .catch(() => setApprovals([]));
  }

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('hr.reports.view')) {
      api.get('/hr-reports/headcount-summary').then(({ data }) => setHeadcount(data)).catch(() => setHeadcount(null));
    } else {
      setHeadcount(false);
    }

    // Always fetch — the endpoint itself scopes to "my own requests" for
    // users without hr.leave.manage/hr.leave.approve, so there's nothing
    // to hide behind a `false` state here.
    api.get('/leave-requests', { params: { status: 'pending' } }).then(({ data }) => setPendingLeave(data)).catch(() => setPendingLeave([]));

    if (can('hr.payroll.view')) {
      api.get('/payroll-runs').then(({ data }) => setPayrollRuns(data)).catch(() => setPayrollRuns(null));
    } else {
      setPayrollRuns(false);
    }

    if (can('hr.compliance.manage')) {
      api.get('/hr-reports/compliance-summary').then(({ data }) => setCompliance(data)).catch(() => setCompliance(null));
    } else {
      setCompliance(false);
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

  const activeHeadcount = headcount ? headcount.byStatus.find((s) => s.employment_status === 'active')?.count || 0 : null;
  const monthlyPayrollCost = headcount ? headcount.byDepartment.reduce((s, d) => s + Number(d.monthly_cost), 0) : null;
  const latestPayrollRun = payrollRuns && payrollRuns.length > 0 ? payrollRuns[0] : null;
  const complianceExceptions = compliance
    ? compliance.documentsByExpiryState.filter((d) => d.expiry_state === 'expired' || d.expiry_state === 'expiring_soon').reduce((s, d) => s + d.count, 0)
    : null;
  const openIncidents = compliance
    ? compliance.incidentsByStatus.filter((i) => i.status === 'open' || i.status === 'investigating').reduce((s, i) => s + i.count, 0)
    : null;

  const noExceptions = (!pendingLeave || pendingLeave.length === 0) && (openIncidents === null || openIncidents === 0) && (complianceExceptions === null || complianceExceptions === 0);

  return (
    <DashboardLayout title="HR" subtitle="Your HR & payroll workspace">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {headcount !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Active headcount</div>
            <div className="kpi-value">{activeHeadcount === null ? '...' : activeHeadcount}</div>
            {headcount && headcount.newHiresLast30Days > 0 && (
              <div className="kpi-footer">{headcount.newHiresLast30Days} new hire{headcount.newHiresLast30Days === 1 ? '' : 's'} (30 days)</div>
            )}
          </div>
        )}
        {headcount !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Monthly payroll cost</div>
            <div className="kpi-value">{monthlyPayrollCost === null ? '...' : money(monthlyPayrollCost)}</div>
          </div>
        )}
        <div className="kpi-card">
          <div className="kpi-label">Leave requests pending</div>
          <div className="kpi-value">{pendingLeave === null ? '...' : pendingLeave.length}</div>
        </div>
        {payrollRuns !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Latest payroll run</div>
            <div className="kpi-value" style={{ fontSize: 18, textTransform: 'capitalize' }}>
              {payrollRuns === null ? '...' : latestPayrollRun ? latestPayrollRun.status : 'None yet'}
            </div>
            {latestPayrollRun && (
              <div className="kpi-footer">{latestPayrollRun.period_month}/{latestPayrollRun.period_year}</div>
            )}
          </div>
        )}
        {compliance !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Compliance exceptions</div>
            <div className="kpi-value">{complianceExceptions === null ? '...' : complianceExceptions}</div>
            {openIncidents > 0 && (
              <div className="kpi-footer" style={{ color: 'var(--color-error)' }}>{openIncidents} open incident{openIncidents === 1 ? '' : 's'}</div>
            )}
          </div>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {headcount && (
          <>
            <BarChartWidget
              title="Headcount by Department"
              data={headcount.byDepartment.map((d) => ({ name: d.department, value: Number(d.active_count) }))}
              bars={[{ key: 'value', label: 'Active Employees' }]}
              colorByCategory
              valueFormatter={(v) => `${v}`}
            />
            <PieChartWidget
              title="Employees by Status"
              data={headcount.byStatus.map((s) => ({ name: s.employment_status.replace('_', ' '), value: Number(s.count) }))}
              valueFormatter={(v) => `${v}`}
            />
          </>
        )}
        {compliance && (
          <PieChartWidget
            title="HR Compliance Incidents by Status"
            data={compliance.incidentsByStatus.map((i) => ({ name: i.status.replace('_', ' '), value: Number(i.count) }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing waiting on you right now.</p>
            ) : (
              <ul className="feed-list">
                {(pendingLeave || []).slice(0, 5).map((lr) => (
                  <li key={`leave-${lr.id}`}>
                    <span className="feed-list-title">{lr.first_name} {lr.last_name} requested {lr.leave_type_name}</span>
                    <span className="feed-list-detail">{new Date(lr.start_date).toLocaleDateString()} – {new Date(lr.end_date).toLocaleDateString()}</span>
                  </li>
                ))}
                {compliance && compliance.incidentsByStatus
                  .filter((i) => i.status === 'open' || i.status === 'investigating')
                  .map((i) => (
                    <li key={`incident-${i.status}`}>
                      <span className="feed-list-title">{i.count} compliance incident{i.count === 1 ? '' : 's'} {i.status}</span>
                      <span className="feed-list-detail">See HR Compliance for details</span>
                    </li>
                  ))}
                {compliance && compliance.documentsByExpiryState
                  .filter((d) => d.expiry_state === 'expired' || d.expiry_state === 'expiring_soon')
                  .map((d) => (
                    <li key={`doc-${d.expiry_state}`}>
                      <span className="feed-list-title">{d.count} compliance document{d.count === 1 ? '' : 's'} {d.expiry_state === 'expired' ? 'expired' : 'expiring soon'}</span>
                      <span className="feed-list-detail">See HR Compliance for details</span>
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

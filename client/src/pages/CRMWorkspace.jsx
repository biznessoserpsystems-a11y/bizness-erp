import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatMoney, BarChartWidget, PieChartWidget } from '../components/charts';

const CLOSED_STAGES = new Set(['won', 'lost']);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isSameMonth(dateStr, ref) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export default function CRMWorkspace() {
  const { hasPermission: can } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [leads, setLeads] = useState(null); // null = loading, false = no permission
  const [followUps, setFollowUps] = useState(null);

  function loadFollowUps() {
    if (!can('crm.activities.manage')) {
      setFollowUps(false);
      return;
    }
    api.get('/activities/follow-ups').then(({ data }) => setFollowUps(data)).catch(() => setFollowUps([]));
  }

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('crm.leads.manage')) {
      api.get('/leads').then(({ data }) => setLeads(data)).catch(() => setLeads([]));
    } else {
      setLeads(false);
    }

    loadFollowUps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markDone(id) {
    try {
      await api.patch(`/activities/${id}`, { isDone: true });
      showToast('Marked as done.', 'success');
      loadFollowUps();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update follow-up', 'error');
    }
  }

  const currency = company?.base_currency || 'GHS';
  const money = (v) => formatMoney(v, currency);
  const now = new Date();
  const t = today();

  const openLeads = leads ? leads.filter((l) => !CLOSED_STAGES.has(l.stage)) : [];
  const openPipelineValue = openLeads.reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);
  const wonThisMonth = leads ? leads.filter((l) => l.stage === 'won' && isSameMonth(l.updated_at, now)) : [];
  const wonThisMonthValue = wonThisMonth.reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);
  const closedThisMonth = leads ? leads.filter((l) => CLOSED_STAGES.has(l.stage) && isSameMonth(l.updated_at, now)) : [];
  const winRate = closedThisMonth.length ? Math.round((wonThisMonth.length / closedThisMonth.length) * 100) : null;
  const stalePastClose = openLeads.filter((l) => l.expected_close_date && l.expected_close_date < t);

  const overdueFollowUps = followUps ? followUps.filter((f) => f.due_date < t) : [];
  const upcomingFollowUps = followUps ? followUps.filter((f) => f.due_date >= t).slice(0, 6) : [];

  const noExceptions = stalePastClose.length === 0 && overdueFollowUps.length === 0;

  return (
    <DashboardLayout
      title="CRM"
      subtitle="Your customer relationship workspace"
      actions={(
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/crm/leads')}>Leads</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/sales/customers')}>Customers</button>
        </>
      )}
    >
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {leads !== false && (
          <>
            <div className="kpi-card">
              <div className="kpi-label">Open pipeline value</div>
              <div className="kpi-value">{leads === null ? '...' : money(openPipelineValue)}</div>
              {leads && <div className="kpi-footer">{openLeads.length} open lead{openLeads.length === 1 ? '' : 's'}</div>}
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Won this month</div>
              <div className="kpi-value">{leads === null ? '...' : money(wonThisMonthValue)}</div>
              {leads && <div className="kpi-footer">{wonThisMonth.length} deal{wonThisMonth.length === 1 ? '' : 's'}</div>}
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Win rate (this month)</div>
              <div className="kpi-value">{leads === null ? '...' : winRate === null ? '—' : `${winRate}%`}</div>
              {leads && closedThisMonth.length > 0 && <div className="kpi-footer">{closedThisMonth.length} closed</div>}
            </div>
          </>
        )}
        {followUps !== false && (
          <div className="kpi-card">
            <div className="kpi-label">Follow-ups overdue</div>
            <div className="kpi-value" style={overdueFollowUps.length > 0 ? { color: 'var(--color-error)' } : undefined}>
              {followUps === null ? '...' : overdueFollowUps.length}
            </div>
          </div>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {leads && leads.length > 0 && (
          <>
            <PieChartWidget
              title="Leads by Stage"
              data={Object.entries(leads.reduce((acc, l) => ({ ...acc, [l.stage]: (acc[l.stage] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }))}
              valueFormatter={(v) => `${v}`}
            />
            <PieChartWidget
              title="Leads by Source"
              data={Object.entries(leads.reduce((acc, l) => ({ ...acc, [l.source || 'Unknown']: (acc[l.source || 'Unknown'] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }))}
              valueFormatter={(v) => `${v}`}
            />
            <BarChartWidget
              title="Pipeline Value by Stage"
              data={Object.entries(
                leads.reduce((acc, l) => ({ ...acc, [l.stage]: (acc[l.stage] || 0) + Number(l.estimated_value || 0) }), {})
              ).map(([name, value]) => ({ name, value }))}
              bars={[{ key: 'value', label: 'Estimated Value' }]}
              colorByCategory
              valueFormatter={money}
            />
          </>
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {leads === false && followUps === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to leads or follow-ups.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing overdue or stale right now.</p>
            ) : (
              <ul className="feed-list">
                {overdueFollowUps.map((f) => (
                  <li key={`fu-${f.id}`}>
                    <span className="feed-list-title">{f.subject}</span>
                    <span className="feed-list-detail">
                      {f.lead_name || f.customer_name} — due {f.due_date}
                    </span>
                  </li>
                ))}
                {stalePastClose.map((l) => (
                  <li key={`lead-${l.id}`}>
                    <span className="feed-list-title">{l.name} passed its expected close date</span>
                    <span className="feed-list-detail">
                      {l.company_name ? `${l.company_name} — ` : ''}{money(l.estimated_value)} · {l.stage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="factsheet-rail">
          <div className="card">
            <h2>Upcoming follow-ups</h2>
            {followUps === false ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>You don't have access to activities.</p>
            ) : followUps === null ? (
              <p>Loading...</p>
            ) : upcomingFollowUps.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Nothing scheduled.</p>
            ) : (
              upcomingFollowUps.map((f) => (
                <div key={f.id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>{f.subject}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                    {f.lead_name || f.customer_name} · due {f.due_date}
                  </p>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => markDone(f.id)}>Mark done</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

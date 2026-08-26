import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { formatMoney } from '../components/charts';

export default function ServicesWorkspace() {
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    api.get('/services/workspace-dashboard').then(({ data }) => setDashboard(data)).catch(() => setDashboard(false));
  }, []);

  const toServices = (tab, jobId) => ({ pathname: '/services', state: { tab, ...(jobId ? { jobId } : {}) } });

  if (dashboard === false) {
    return <DashboardLayout title="Service Business"><div className="card"><p>You don't have access to the Service Business module.</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Service Business" subtitle="Jobs, time, and billing at a glance">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Link to={toServices('jobs')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Active Jobs</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.activeJobsCount}</div>
        </Link>
        <Link to={toServices('jobs')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Completed, Not Yet Invoiced</div>
          <div className="kpi-value" style={dashboard && dashboard.completedUnbilledCount > 0 ? { color: 'var(--color-warning-text)' } : undefined}>
            {dashboard === null ? '...' : dashboard.completedUnbilledCount}
          </div>
        </Link>
        <Link to={toServices('jobs')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Invoiced Jobs</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.invoicedJobsCount}</div>
        </Link>
        <Link to={toServices('catalog')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Active Services</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.catalogCount}</div>
        </Link>
        <div className="kpi-card">
          <div className="kpi-label">Unbilled Time</div>
          <div className="kpi-value">{dashboard === null ? '...' : formatMoney(dashboard.unbilledTime)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Unbilled Expenses</div>
          <div className="kpi-value">{dashboard === null ? '...' : formatMoney(dashboard.unbilledExpenses)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Recent Jobs</h2>
        {dashboard === null ? (
          <p>Loading...</p>
        ) : dashboard.recentJobs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No service jobs yet.</p>
        ) : (
          <ul className="feed-list">
            {dashboard.recentJobs.map((j) => (
              <li key={j.id}>
                <Link to={toServices('jobs', j.id)} className="feed-list-link">
                  <span className="feed-list-title">
                    <span className="badge badge-neutral" style={{ marginRight: 6, textTransform: 'capitalize' }}>{j.status.replace('_', ' ')}</span>
                    {j.job_no} — {j.title}
                  </span>
                  <span className="feed-list-detail">{j.billing_type.replace(/_/g, ' ')}{j.scheduled_date ? ` — scheduled ${new Date(j.scheduled_date).toLocaleDateString()}` : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}

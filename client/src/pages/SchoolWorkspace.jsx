import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

export default function SchoolWorkspace() {
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    api.get('/school/workspace-dashboard').then(({ data }) => setDashboard(data)).catch(() => setDashboard(false));
  }, []);

  const toSchool = (tab) => ({ pathname: '/school', state: { tab } });

  if (dashboard === false) {
    return <DashboardLayout title="School Management"><div className="card"><p>You don't have access to School Management.</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="School Management" subtitle="Students, admissions, and classes at a glance">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Link to={toSchool('students')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Enrolled Students</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.enrolledCount}</div>
        </Link>
        <Link to={toSchool('admissions')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Pending Admissions</div>
          <div className="kpi-value" style={dashboard && dashboard.pendingAdmissionsCount > 0 ? { color: 'var(--color-warning-text)' } : undefined}>
            {dashboard === null ? '...' : dashboard.pendingAdmissionsCount}
          </div>
        </Link>
        <Link to={toSchool('classes')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Active Classes</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.activeClassesCount}</div>
        </Link>
        <Link to={toSchool('students')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Withdrawn / Graduated</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{dashboard === null ? '...' : `${dashboard.withdrawnCount} / ${dashboard.graduatedCount}`}</div>
        </Link>
      </div>

      <div className="card">
        <h2>Recent Admissions</h2>
        {dashboard === null ? (
          <p>Loading...</p>
        ) : dashboard.recentAdmissions.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No admissions applications yet.</p>
        ) : (
          <ul className="feed-list">
            {dashboard.recentAdmissions.map((a) => (
              <li key={a.id}>
                <Link to={toSchool('admissions')} className="feed-list-link">
                  <span className="feed-list-title">
                    <span className="badge badge-neutral" style={{ marginRight: 6, textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</span>
                    {a.applicant_first_name} {a.applicant_last_name}
                  </span>
                  <span className="feed-list-detail">{a.application_no}{a.desired_class_name ? ` — ${a.desired_class_name}` : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}

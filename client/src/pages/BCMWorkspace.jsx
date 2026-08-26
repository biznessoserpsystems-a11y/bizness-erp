import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, PieChartWidget } from '../components/charts';

export default function BCMWorkspace() {
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    api.get('/bcm/workspace-dashboard').then(({ data }) => setDashboard(data)).catch(() => setDashboard(false));
  }, []);

  const toBCM = (tab) => ({ pathname: '/bcm', state: { tab } });

  if (dashboard === false) {
    return <DashboardLayout title="Business Continuity"><div className="card"><p>You don't have access to Business Continuity Monitoring.</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Business Continuity" subtitle="Risk, resilience, and continuity at a glance">
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Link to={toBCM('risks')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Active Risks</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.activeRisksCount}</div>
        </Link>
        <Link to={toBCM('risks')} className="kpi-card kpi-card-link">
          <div className="kpi-label">High-Severity Risks</div>
          <div className="kpi-value" style={dashboard && dashboard.highRisksCount > 0 ? { color: 'var(--color-error)' } : undefined}>
            {dashboard === null ? '...' : dashboard.highRisksCount}
          </div>
          <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Score ≥ 15</div>
        </Link>
        <Link to={toBCM('bia')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Critical Functions Mapped</div>
          <div className="kpi-value">{dashboard === null ? '...' : dashboard.criticalFunctionsCount}</div>
        </Link>
        <Link to={toBCM('plans')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Plans Needing Review</div>
          <div className="kpi-value" style={dashboard && dashboard.plansNeedingReview.length > 0 ? { color: 'var(--color-warning-text)' } : undefined}>
            {dashboard === null ? '...' : dashboard.plansNeedingReview.length}
          </div>
          <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>of {dashboard?.plansCount ?? 0} total</div>
        </Link>
        <Link to={toBCM('incidents')} className="kpi-card kpi-card-link">
          <div className="kpi-label">Unresolved Incidents</div>
          <div className="kpi-value" style={dashboard && dashboard.unresolvedIncidentsCount > 0 ? { color: 'var(--color-error)' } : undefined}>
            {dashboard === null ? '...' : dashboard.unresolvedIncidentsCount}
          </div>
        </Link>
        <div className="kpi-card">
          <div className="kpi-label">Last Backup</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>
            {dashboard === null ? '...' : dashboard.daysSinceLastBackup === null ? 'Never' : `${dashboard.daysSinceLastBackup}d ago`}
          </div>
          <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>
            {dashboard?.lastBackup ? new Date(dashboard.lastBackup.created_at).toLocaleString() : 'No successful backup on record'}
          </div>
        </div>
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {dashboard && dashboard.topRisks && dashboard.topRisks.length > 0 && (
          <>
            <BarChartWidget
              title="Top Risks by Score"
              data={dashboard.topRisks.map((r) => ({ name: r.title, value: r.risk_score }))}
              bars={[{ key: 'value', label: 'Risk Score' }]}
              colorByCategory
              horizontal
              valueFormatter={(v) => `${v}`}
            />
            <PieChartWidget
              title="Risks by Category"
              data={Object.entries(dashboard.topRisks.reduce((acc, r) => ({ ...acc, [r.category]: (acc[r.category] || 0) + 1 }), {})).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}
              valueFormatter={(v) => `${v}`}
            />
          </>
        )}
        {dashboard && dashboard.recentIncidents && dashboard.recentIncidents.length > 0 && (
          <PieChartWidget
            title="Recent Incidents by Severity"
            data={Object.entries(dashboard.recentIncidents.reduce((acc, i) => ({ ...acc, [i.severity]: (acc[i.severity] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Top Risks</h2>
            {dashboard === null ? <p>Loading...</p> : dashboard.topRisks.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>No risks recorded yet.</p>
            ) : (
              <ul className="feed-list">
                {dashboard.topRisks.map((r) => (
                  <li key={r.id}>
                    <Link to={toBCM('risks')} className="feed-list-link">
                      <span className="feed-list-title">
                        <span className={`badge ${r.risk_score >= 15 ? 'badge-danger' : r.risk_score >= 8 ? 'badge-warning' : 'badge-neutral'}`} style={{ marginRight: 6 }}>Score {r.risk_score}</span>
                        {r.title}
                      </span>
                      <span className="feed-list-detail">{r.category.replace('_', ' ')} — status: {r.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {dashboard && dashboard.complianceGaps.length > 0 && (
            <div className="card">
              <h2>Compliance Gaps (from Statutory Compliance)</h2>
              <ul className="feed-list">
                {dashboard.complianceGaps.map((c) => (
                  <li key={c.id}>
                    <span className="feed-list-title">
                      <span className={`badge ${c.status === 'expired' ? 'badge-danger' : 'badge-warning'}`} style={{ marginRight: 6 }}>{c.status.replace('_', ' ')}</span>
                      {c.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="factsheet-rail">
          <div className="card">
            <h2>Recent Incidents</h2>
            {dashboard === null ? (
              <p>Loading...</p>
            ) : dashboard.recentIncidents.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No incidents logged.</p>
            ) : (
              dashboard.recentIncidents.map((i) => (
                <Link key={i.id} to={toBCM('incidents')} style={{ display: 'block', padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px', color: 'var(--color-text)' }}>{i.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{new Date(i.incident_date).toLocaleDateString()} — {i.severity}{i.is_resolved ? ' (resolved)' : ''}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

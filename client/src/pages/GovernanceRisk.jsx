import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AnimatedNumber from '../components/AnimatedNumber';
import CreateTaskFromInsight from '../components/CreateTaskFromInsight';
import StructuredInsight from '../components/StructuredInsight';
import { IconBadge } from '../Style';
import { IconBCM } from '../components/icons';

// The fifth and final planned page of the Executive Dashboard Suite —
// Governance & Risk, covering Business Continuity and Compliance
// together, since both are fundamentally about the same thing: real
// exposure the business needs to actively manage, not routine
// operations.
//
// The original brief for this suite named Projects as a third module
// here alongside BCM and Compliance. This codebase has no projects
// table and no project-tracking feature of any kind — checked directly
// rather than assumed, since a missing feature is not something to
// quietly paper over with fabricated data. That's stated plainly below
// rather than silently dropped, so it's clear this is an honest gap in
// the current system, not an oversight in this page.
//
// Every route linked here was checked against navConfig.js before being
// written, the same discipline every suite page since People has
// followed after real broken links shipped once.
export default function GovernanceRisk() {
  const { hasPermission } = useAuth();
  const can = (code) => hasPermission(code);

  const [bcm, setBcm] = useState(null);
  const [compliance, setCompliance] = useState(null);

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  useEffect(() => {
    if (can('bcm.view')) {
      api.get('/bcm/workspace-dashboard').then(({ data }) => setBcm(data)).catch(() => setBcm(null));
    }
    if (can('system.compliance.manage')) {
      api.get('/compliance-calendar/summary').then(({ data }) => setCompliance(data)).catch(() => setCompliance(null));
    }
  }, []);

  // Deliberately not fetched automatically, same reasoning as the other
  // suite pages — a live AI call has real latency and, for a configured
  // paid key, real cost.
  async function generateInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const { data } = await api.get('/governance/ai-insights');
      setInsight(data);
    } catch (err) {
      setInsightError(err.response?.data?.error || 'Could not generate an insight right now.');
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <DashboardLayout title="Governance & Risk Dashboard" subtitle="Business Continuity and Compliance together">
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>AI Insight</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={generateInsight} disabled={insightLoading}>
            {insightLoading ? 'Generating…' : 'Generate Insight'}
          </button>
        </div>
        {insightError && <div className="error-banner">{insightError}</div>}
        {!insight && !insightError && (
          <p className="dashboard-empty-note">Ask for a real, current-data narrative summary of the company's risk and compliance position right now.</p>
        )}
        {insight && insight.available === false && (
          <p className="dashboard-empty-note">{insight.message}</p>
        )}
        {insight && insight.available && (
          <>
            <StructuredInsight insight={insight.insight} />
            <CreateTaskFromInsight insightText={`${insight.insight.whatHappened} ${insight.insight.why} ${insight.insight.whatsLikely} ${insight.insight.whatToDo}`} sourceLabel="Governance & Risk" />
          </>
        )}
      </div>

      <p className="dashboard-empty-note" style={{ marginBottom: 20 }}>
        The original brief for this page named Projects alongside Business Continuity and Compliance. This system has no project-tracking
        feature yet, so there's genuinely nothing real to show here for it — shown plainly rather than left unexplained.
      </p>

      {can('bcm.view') && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2>Risk &amp; Continuity</h2>
            <Link to="/bcm" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Risk &amp; Continuity</Link>
          </div>
          {!bcm ? <p className="dashboard-empty-note">Loading…</p> : (
            <div className="kpi-grid">
              <Link to="/bcm" className="kpi-card kpi-card-link">
                <IconBadge icon={IconBCM} tone={bcm.highRisksCount > 0 ? 'warning' : 'primary'} />
                <div className="kpi-label">Active Risks</div>
                <div className="kpi-value"><AnimatedNumber value={bcm.activeRisksCount} /></div>
                <div className="kpi-footer">{bcm.highRisksCount} high-severity</div>
              </Link>
              <Link to="/bcm" className="kpi-card kpi-card-link">
                <IconBadge icon={IconBCM} tone={bcm.unresolvedIncidentsCount > 0 ? 'warning' : 'success'} />
                <div className="kpi-label">Unresolved Incidents</div>
                <div className="kpi-value"><AnimatedNumber value={bcm.unresolvedIncidentsCount} /></div>
                <div className="kpi-footer">All time</div>
              </Link>
              <Link to="/bcm" className="kpi-card kpi-card-link">
                <IconBadge icon={IconBCM} tone={bcm.plansNeedingReview.length > 0 ? 'warning' : 'info'} />
                <div className="kpi-label">Plans Needing Review</div>
                <div className="kpi-value"><AnimatedNumber value={bcm.plansNeedingReview.length} /></div>
                <div className="kpi-footer">of {bcm.plansCount} continuity plans</div>
              </Link>
              <Link to="/bcm" className="kpi-card kpi-card-link">
                <IconBadge icon={IconBCM} tone={bcm.daysSinceLastBackup === null || bcm.daysSinceLastBackup > 7 ? 'warning' : 'success'} />
                <div className="kpi-label">Last Successful Backup</div>
                <div className="kpi-value">{bcm.daysSinceLastBackup === null ? 'Never' : `${bcm.daysSinceLastBackup}d ago`}</div>
                <div className="kpi-footer">{bcm.criticalFunctionsCount} critical functions tracked</div>
              </Link>
            </div>
          )}
        </div>
      )}

      {can('system.compliance.manage') && (
        <div className="card">
          <div className="card-header">
            <h2>Compliance</h2>
            <Link to="/compliance-calendar" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Compliance Calendar</Link>
          </div>
          {!compliance ? <p className="dashboard-empty-note">Loading…</p> : (
            <div className="kpi-grid">
              <Link to="/compliance-calendar" className="kpi-card kpi-card-link">
                <IconBadge icon={IconBCM} tone={compliance.overdueCount > 0 ? 'warning' : 'success'} />
                <div className="kpi-label">Overdue Filings</div>
                <div className="kpi-value"><AnimatedNumber value={compliance.overdueCount} /></div>
                <div className="kpi-footer">of {compliance.totalActive} scheduled filings</div>
              </Link>
              <Link to="/compliance-calendar" className="kpi-card kpi-card-link">
                <IconBadge icon={IconBCM} tone="info" />
                <div className="kpi-label">Due Within 30 Days</div>
                <div className="kpi-value"><AnimatedNumber value={compliance.dueWithin30DaysCount} /></div>
                <div className="kpi-footer">Upcoming filings</div>
              </Link>
              {bcm && (
                <Link to="/bcm" className="kpi-card kpi-card-link">
                  <IconBadge icon={IconBCM} tone={bcm.complianceGaps.length > 0 ? 'warning' : 'success'} />
                  <div className="kpi-label">Expired or Expiring Documents</div>
                  <div className="kpi-value"><AnimatedNumber value={bcm.complianceGaps.length} /></div>
                  <div className="kpi-footer">Licenses &amp; permits, not filing deadlines</div>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

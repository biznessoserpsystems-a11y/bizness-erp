import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatMoney, PieChartWidget } from '../components/charts';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';
import AnimatedNumber from '../components/AnimatedNumber';
import CreateTaskFromInsight from '../components/CreateTaskFromInsight';
import StructuredInsight from '../components/StructuredInsight';
import { IconBadge } from '../Style';
import { IconSales, IconCRM } from '../components/icons';

const money = (n) => formatMoney(n);

// The third page of the Executive Dashboard Suite — Sales & CRM
// together, since a pipeline and the revenue it eventually turns into
// are one continuous story, not two separate ones.
//
// Every route linked from this page was checked directly against
// navConfig.js and App.jsx's real route table before being written —
// not guessed — after an earlier suite page's first draft shipped with
// four broken links found only by checking afterward. Sales & CRM
// turned out to be two genuinely separate top-level sections in this
// app (Sales & Distribution vs. CRM), not one — confirmed before
// assuming otherwise.
export default function SalesCrm() {
  const { hasPermission } = useAuth();
  const can = (code) => hasPermission(code);

  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = resolveDateRange(rangeMode, customFrom, customTo);

  const [salesSummary, setSalesSummary] = useState(null);
  const [receivablesAging, setReceivablesAging] = useState(null);
  const [pipeline, setPipeline] = useState(null);

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  useEffect(() => {
    if (can('sales.reports.view')) {
      api.get(`/sales-reports/summary?from=${range.from}&to=${range.to}`)
        .then(({ data }) => setSalesSummary(data)).catch(() => setSalesSummary(null));
      api.get('/sales-reports/receivables-aging')
        .then(({ data }) => setReceivablesAging(data)).catch(() => setReceivablesAging(null));
    }
    api.get('/sales-crm/pipeline-summary')
      .then(({ data }) => setPipeline(data)).catch(() => setPipeline(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // Deliberately not fetched automatically, same reasoning as the other
  // suite pages — a live AI call has real latency and, for a configured
  // paid key, real cost.
  async function generateInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const { data } = await api.get('/sales-crm/ai-insights');
      setInsight(data);
    } catch (err) {
      setInsightError(err.response?.data?.error || 'Could not generate an insight right now.');
    } finally {
      setInsightLoading(false);
    }
  }

  const receivablesTotal = receivablesAging ? Object.values(receivablesAging.buckets).reduce((s, v) => s + Number(v), 0) : null;
  const receivablesOverdue = receivablesAging ? Number(receivablesAging.buckets.days61to90) + Number(receivablesAging.buckets.over90) : null;

  const pipelineChartData = pipeline
    ? Object.entries(pipeline.valueByStage)
        .filter(([stage]) => ['new', 'contacted', 'qualified', 'proposal'].includes(stage))
        .filter(([, value]) => value > 0)
        .map(([stage, value]) => ({ name: stage.charAt(0).toUpperCase() + stage.slice(1), value }))
    : [];

  return (
    <DashboardLayout
      title="Sales & CRM Dashboard"
      subtitle="Pipeline and revenue together"
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
          <p className="dashboard-empty-note">Ask for a real, current-data narrative summary of how Sales & CRM is doing right now.</p>
        )}
        {insight && insight.available === false && (
          <p className="dashboard-empty-note">{insight.message}</p>
        )}
        {insight && insight.available && (
          <>
            <StructuredInsight insight={insight.insight} />
            <CreateTaskFromInsight insightText={`${insight.insight.whatHappened} ${insight.insight.why} ${insight.insight.whatsLikely} ${insight.insight.whatToDo}`} sourceLabel="Sales & CRM" />
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>Pipeline</h2>
          <Link to="/crm/leads" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open CRM Leads</Link>
        </div>
        {!pipeline ? <p className="dashboard-empty-note">Loading…</p> : (
          <>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
              <Link to="/crm/leads" className="kpi-card kpi-card-link">
                <IconBadge icon={IconCRM} tone="primary" />
                <div className="kpi-label">Open Pipeline Value</div>
                <div className="kpi-value">{money(pipeline.openPipelineValue)}</div>
                <div className="kpi-footer">{pipeline.openLeadCount} open leads</div>
              </Link>
              <Link to="/crm/leads" className="kpi-card kpi-card-link">
                <IconBadge icon={IconCRM} tone={pipeline.winRate !== null && pipeline.winRate < 40 ? 'warning' : 'success'} />
                <div className="kpi-label">Win Rate</div>
                <div className="kpi-value">{pipeline.winRate !== null ? `${pipeline.winRate.toFixed(0)}%` : '—'}</div>
                <div className="kpi-footer">{pipeline.counts.won} won, {pipeline.counts.lost} lost</div>
              </Link>
              <Link to="/crm/leads" className="kpi-card kpi-card-link">
                <IconBadge icon={IconCRM} tone="info" />
                <div className="kpi-label">Leads in Proposal</div>
                <div className="kpi-value"><AnimatedNumber value={pipeline.counts.proposal} /></div>
                <div className="kpi-footer">{money(pipeline.valueByStage.proposal)} at stake</div>
              </Link>
            </div>
            {pipelineChartData.length > 0 && (
              <PieChartWidget title="Open pipeline by stage" data={pipelineChartData} valueFormatter={(v) => money(v)} height={260} />
            )}
          </>
        )}
      </div>

      {can('sales.reports.view') && (
        <div className="card">
          <div className="card-header">
            <h2>Sales & Receivables</h2>
            <Link to="/sales/reports" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Sales Reports</Link>
          </div>
          <div className="kpi-grid">
            <Link to="/sales/invoices" className="kpi-card kpi-card-link">
              <IconBadge icon={IconSales} tone="primary" />
              <div className="kpi-label">Total Sales</div>
              <div className="kpi-value">{salesSummary ? money(salesSummary.totals.total_sales) : '—'}</div>
              <div className="kpi-footer">{salesSummary ? `${salesSummary.totals.invoice_count} invoices this period` : ''}</div>
            </Link>
            <Link to="/sales/reports" className="kpi-card kpi-card-link">
              <IconBadge icon={IconSales} tone={receivablesOverdue > 0 ? 'warning' : 'primary'} />
              <div className="kpi-label">Outstanding Receivables</div>
              <div className="kpi-value">{receivablesTotal !== null ? money(receivablesTotal) : '—'}</div>
              <div className="kpi-footer" style={receivablesOverdue > 0 ? { color: 'var(--color-error)' } : undefined}>
                {receivablesOverdue !== null ? `${money(receivablesOverdue)} overdue 61+ days` : ''}
              </div>
            </Link>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

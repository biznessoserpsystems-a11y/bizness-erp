import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatMoney } from '../components/charts';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';
import AnimatedNumber from '../components/AnimatedNumber';
import CreateTaskFromInsight from '../components/CreateTaskFromInsight';
import StructuredInsight from '../components/StructuredInsight';
import { IconBadge } from '../Style';
import { IconServices, IconRental } from '../components/icons';

const money = (n) => formatMoney(n);

// The fourth page of the Executive Dashboard Suite — Service Business
// and Rental Business together, two genuinely different business models
// sharing one page because both are asset/labor-utilization businesses
// at heart rather than product-sales ones, and both are comparatively
// small modules that don't each warrant a full page of their own.
//
// Every route linked here was checked directly against navConfig.js
// before being written, the same discipline that caught real broken
// links on an earlier suite page and paid off again building Sales & CRM.
// No new summary endpoint was needed for either module this time —
// services/workspace-dashboard and rental/reports/workspace-dashboard
// already existed and were already comprehensive; only the AI insight
// endpoint is genuinely new backend code for this page.
export default function Specialty() {
  const { hasPermission } = useAuth();
  const can = (code) => hasPermission(code);

  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = resolveDateRange(rangeMode, customFrom, customTo);

  const [service, setService] = useState(null);
  const [rental, setRental] = useState(null);

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  useEffect(() => {
    if (can('services.view')) {
      api.get('/services/workspace-dashboard').then(({ data }) => setService(data)).catch(() => setService(null));
    }
    if (can('rental.reports.view')) {
      api.get(`/rental/reports/workspace-dashboard?from=${range.from}&to=${range.to}`)
        .then(({ data }) => setRental(data)).catch(() => setRental(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // Deliberately not fetched automatically, same reasoning as the other
  // suite pages — a live AI call has real latency and, for a configured
  // paid key, real cost.
  async function generateInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const { data } = await api.get('/specialty/ai-insights');
      setInsight(data);
    } catch (err) {
      setInsightError(err.response?.data?.error || 'Could not generate an insight right now.');
    } finally {
      setInsightLoading(false);
    }
  }

  const unbilledServiceRevenue = service ? Number(service.unbilledTime) + Number(service.unbilledExpenses) : null;

  return (
    <DashboardLayout
      title="Specialty Businesses Dashboard"
      subtitle="Service Business and Rental Business together"
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
          <p className="dashboard-empty-note">Ask for a real, current-data narrative summary of how Service and Rental Business are doing right now.</p>
        )}
        {insight && insight.available === false && (
          <p className="dashboard-empty-note">{insight.message}</p>
        )}
        {insight && insight.available && (
          <>
            <StructuredInsight insight={insight.insight} />
            <CreateTaskFromInsight insightText={`${insight.insight.whatHappened} ${insight.insight.why} ${insight.insight.whatsLikely} ${insight.insight.whatToDo}`} sourceLabel="Specialty Businesses" />
          </>
        )}
      </div>

      {can('services.view') && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2>Service Business</h2>
            <Link to="/services" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Catalog & Jobs</Link>
          </div>
          {!service ? <p className="dashboard-empty-note">Loading…</p> : (
            <div className="kpi-grid">
              <Link to="/services" className="kpi-card kpi-card-link">
                <IconBadge icon={IconServices} tone="primary" />
                <div className="kpi-label">Active Jobs</div>
                <div className="kpi-value"><AnimatedNumber value={service.activeJobsCount} /></div>
                <div className="kpi-footer">Scheduled or in progress</div>
              </Link>
              <Link to="/services" className="kpi-card kpi-card-link">
                <IconBadge icon={IconServices} tone={service.completedUnbilledCount > 0 ? 'warning' : 'success'} />
                <div className="kpi-label">Completed, Unbilled</div>
                <div className="kpi-value"><AnimatedNumber value={service.completedUnbilledCount} /></div>
                <div className="kpi-footer">Jobs finished but not yet invoiced</div>
              </Link>
              <Link to="/services" className="kpi-card kpi-card-link">
                <IconBadge icon={IconServices} tone={unbilledServiceRevenue > 0 ? 'warning' : 'info'} />
                <div className="kpi-label">Unbilled Revenue</div>
                <div className="kpi-value">{money(unbilledServiceRevenue)}</div>
                <div className="kpi-footer">Billable time + expenses not yet invoiced</div>
              </Link>
              <Link to="/services" className="kpi-card kpi-card-link">
                <IconBadge icon={IconServices} tone="neutral" />
                <div className="kpi-label">Catalog Items</div>
                <div className="kpi-value"><AnimatedNumber value={service.catalogCount} /></div>
                <div className="kpi-footer">Active service offerings</div>
              </Link>
            </div>
          )}
        </div>
      )}

      {can('rental.reports.view') && (
        <div className="card">
          <div className="card-header">
            <h2>Rental Business</h2>
            <Link to="/rental" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Rental Agreements</Link>
          </div>
          {!rental ? <p className="dashboard-empty-note">Loading…</p> : (
            <div className="kpi-grid">
              <Link to="/rental" className="kpi-card kpi-card-link">
                <IconBadge icon={IconRental} tone="primary" />
                <div className="kpi-label">Active Rentals</div>
                <div className="kpi-value"><AnimatedNumber value={rental.activeRentals} /></div>
                <div className="kpi-footer">{rental.availableAssets} assets available</div>
              </Link>
              <Link to="/rental" className="kpi-card kpi-card-link">
                <IconBadge icon={IconRental} tone={rental.overdueReturns > 0 ? 'warning' : 'success'} />
                <div className="kpi-label">Overdue Returns</div>
                <div className="kpi-value"><AnimatedNumber value={rental.overdueReturns} /></div>
                <div className="kpi-footer">{rental.expiringContracts} due within 7 days</div>
              </Link>
              <Link to="/rental" className="kpi-card kpi-card-link">
                <IconBadge icon={IconRental} tone="success" />
                <div className="kpi-label">Rental Revenue</div>
                <div className="kpi-value">{money(rental.rentalRevenue)}</div>
                <div className="kpi-footer">This period</div>
              </Link>
              <Link to="/rental" className="kpi-card kpi-card-link">
                <IconBadge icon={IconRental} tone={rental.monthlyProfit.netProfit >= 0 ? 'info' : 'warning'} />
                <div className="kpi-label">Net Profit</div>
                <div className="kpi-value">{money(rental.monthlyProfit.netProfit)}</div>
                <div className="kpi-footer">After maintenance &amp; depreciation</div>
              </Link>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

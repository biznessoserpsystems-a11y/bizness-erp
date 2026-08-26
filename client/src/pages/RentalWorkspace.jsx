import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatMoney, BarChartWidget, PieChartWidget } from '../components/charts';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const UPCOMING_RETURN_WINDOW_DAYS = 7;

export default function RentalWorkspace() {
  const { hasPermission: can } = useAuth();
  const [company, setCompany] = useState(null);

  const [rangeMode, setRangeMode] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);

  // Each stat starts at null (loading). If the user lacks the permission
  // that stat needs, it's set to `false` and the tile is hidden entirely —
  // same pattern every other workspace page (Procurement, Accounting, etc.)
  // uses, rather than showing a broken/empty tile.
  const [items, setItems] = useState(null);
  const [agreements, setAgreements] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  function load() {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('rental.items.manage')) {
      api.get('/rental/items').then(({ data }) => setItems(data)).catch(() => setItems(null));
    } else {
      setItems(false);
    }

    if (can('rental.agreements.manage')) {
      api.get('/rental/agreements').then(({ data }) => setAgreements(data)).catch(() => setAgreements(null));
    } else {
      setAgreements(false);
    }

    if (can('rental.reports.view')) {
      api.get(`/rental/reports/workspace-dashboard?from=${from}&to=${to}`).then(({ data }) => setDashboard(data)).catch(() => setDashboard(null));
    } else {
      setDashboard(false);
    }
  }

  useEffect(load, [from, to]);

  const currency = company?.base_currency || 'GHS';
  const money = (v) => formatMoney(v, currency);

  const activeAgreements = agreements ? agreements.filter((a) => a.status === 'active') : [];
  const overdueAgreements = activeAgreements.filter((a) => new Date(a.expected_return_date) < new Date());
  const upcomingReturns = activeAgreements
    .filter((a) => {
      const daysUntil = (new Date(a.expected_return_date) - new Date()) / 86400000;
      return daysUntil >= 0 && daysUntil <= UPCOMING_RETURN_WINDOW_DAYS;
    })
    .sort((a, b) => new Date(a.expected_return_date) - new Date(b.expected_return_date));
  const depositsNotCollected = activeAgreements.filter((a) => a.deposit_status === 'not_collected' && Number(a.deposit_amount) > 0);
  const itemsInMaintenance = items ? items.filter((i) => i.status === 'maintenance') : [];

  const noExceptions = overdueAgreements.length === 0 && itemsInMaintenance.length === 0 && depositsNotCollected.length === 0;

  return (
    <DashboardLayout
      title="Rental Services"
      subtitle="Your rental agreements & asset workspace"
      actions={(
        <DateRangeFilter
          mode={rangeMode}
          onModeChange={setRangeMode}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
        />
      )}
    >
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {dashboard !== false && (
          <>
            <div className="kpi-card">
              <div className="kpi-label">Active Rentals</div>
              <div className="kpi-value">{dashboard === null ? '...' : dashboard.activeRentals}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Available Assets</div>
              <div className="kpi-value">{dashboard === null ? '...' : dashboard.availableAssets}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Reserved Assets</div>
              <div className="kpi-value">{dashboard === null ? '...' : dashboard.reservedAssets}</div>
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Booked, not yet checked out</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Assets Under Maintenance</div>
              <div className="kpi-value" style={dashboard?.assetsUnderMaintenance > 0 ? { color: 'var(--color-warning-text)' } : undefined}>
                {dashboard === null ? '...' : dashboard.assetsUnderMaintenance}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Rental Revenue</div>
              <div className="kpi-value">{dashboard === null ? '...' : money(dashboard.rentalRevenue)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Overdue Returns</div>
              <div className="kpi-value" style={dashboard?.overdueReturns > 0 ? { color: 'var(--color-error)' } : undefined}>
                {dashboard === null ? '...' : dashboard.overdueReturns}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Expiring Contracts</div>
              <div className="kpi-value">{dashboard === null ? '...' : dashboard.expiringContracts}</div>
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Due back within 7 days</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Outstanding Customer Payments</div>
              <div className="kpi-value" style={dashboard?.outstandingCustomerPayments > 0 ? { color: 'var(--color-warning-text)' } : undefined}>
                {dashboard === null ? '...' : money(dashboard.outstandingCustomerPayments)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Asset Utilization Rate</div>
              <div className="kpi-value">{dashboard === null ? '...' : `${dashboard.assetUtilizationRate.toFixed(1)}%`}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Monthly Profit Analysis</div>
              <div className="kpi-value" style={dashboard && dashboard.monthlyProfit.netProfit < 0 ? { color: 'var(--color-error)' } : undefined}>
                {dashboard === null ? '...' : money(dashboard.monthlyProfit.netProfit)}
              </div>
              {dashboard && (
                <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>
                  Revenue {money(dashboard.monthlyProfit.revenue)} − Maintenance {money(dashboard.monthlyProfit.maintenanceCost)} − Depreciation {money(dashboard.monthlyProfit.depreciation)}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {items && items.length > 0 && (
          <PieChartWidget
            title="Rental Items by Status"
            data={Object.entries(items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
        {agreements && agreements.length > 0 && (
          <PieChartWidget
            title="Agreements by Status"
            data={Object.entries(agreements.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
        {dashboard && dashboard.monthlyProfit && (
          <BarChartWidget
            title="Monthly Profit Breakdown"
            data={[
              { name: 'Revenue', value: Number(dashboard.monthlyProfit.revenue) },
              { name: 'Maintenance Cost', value: Number(dashboard.monthlyProfit.maintenanceCost) },
              { name: 'Depreciation', value: Number(dashboard.monthlyProfit.depreciation) },
              { name: 'Net Profit', value: Number(dashboard.monthlyProfit.netProfit) },
            ]}
            bars={[{ key: 'value', label: 'Amount' }]}
            colorByCategory
            valueFormatter={money}
          />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {items === false && agreements === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to rental items or agreements.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing overdue, in maintenance, or waiting on a deposit right now.</p>
            ) : (
              <ul className="feed-list">
                {overdueAgreements.map((a) => (
                  <li key={`overdue-${a.id}`}>
                    <span className="feed-list-title">
                      <span className="badge badge-danger" style={{ marginRight: 6 }}>Overdue</span>
                      {a.agreement_no} — {a.item_name}
                    </span>
                    <span className="feed-list-detail">{a.customer_name} — expected back {new Date(a.expected_return_date).toLocaleDateString()}</span>
                  </li>
                ))}
                {depositsNotCollected.map((a) => (
                  <li key={`deposit-${a.id}`}>
                    <span className="feed-list-title">
                      <span className="badge badge-warning" style={{ marginRight: 6 }}>Deposit pending</span>
                      {a.agreement_no} — {a.item_name}
                    </span>
                    <span className="feed-list-detail">{a.customer_name} — {money(a.deposit_amount)} not yet collected</span>
                  </li>
                ))}
                {itemsInMaintenance.map((i) => (
                  <li key={`maint-${i.id}`}>
                    <span className="feed-list-title">
                      <span className="badge badge-neutral" style={{ marginRight: 6 }}>In maintenance</span>
                      {i.name}
                    </span>
                    <span className="feed-list-detail">Off the rental floor until maintenance is completed</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="factsheet-rail">
          <div className="card">
            <h2>Upcoming returns</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -8 }}>Due within {UPCOMING_RETURN_WINDOW_DAYS} days</p>
            {agreements === null ? (
              <p>Loading...</p>
            ) : upcomingReturns.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Nothing due back soon.</p>
            ) : (
              upcomingReturns.slice(0, 8).map((a) => (
                <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px' }}>{a.item_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{a.customer_name} — due {new Date(a.expected_return_date).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

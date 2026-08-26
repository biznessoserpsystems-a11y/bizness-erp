import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatMoney, BarChartWidget, PieChartWidget } from '../components/charts';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const ACTIVE_STATUSES = new Set(['materials_issued', 'in_progress']);

export default function ManufacturingWorkspace() {
  const { hasPermission: can } = useAuth();
  const [company, setCompany] = useState(null);

  const [rangeMode, setRangeMode] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);

  // Each stat starts at null (loading). If the user lacks the permission
  // that stat needs, it's set to `false` and the tile is hidden entirely —
  // same pattern every other workspace page (Procurement, Rental,
  // Accounting, etc.) uses, rather than showing a broken/empty tile.
  const [workOrders, setWorkOrders] = useState(null);
  const [manufacturingAccount, setManufacturingAccount] = useState(null);
  const [overheadVariance, setOverheadVariance] = useState(null);

  useEffect(() => {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});

    if (can('manufacturing.work_orders.manage')) {
      api.get('/manufacturing/work-orders').then(({ data }) => setWorkOrders(data)).catch(() => setWorkOrders(null));
    } else {
      setWorkOrders(false);
    }

    if (can('manufacturing.reports.view')) {
      api.get(`/manufacturing/manufacturing-account?from=${from}&to=${to}`).then(({ data }) => setManufacturingAccount(data)).catch(() => setManufacturingAccount(null));
      api.get(`/manufacturing/overhead-variance?from=${from}&to=${to}`).then(({ data }) => setOverheadVariance(data)).catch(() => setOverheadVariance(null));
    } else {
      setManufacturingAccount(false);
      setOverheadVariance(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const currency = company?.base_currency || 'GHS';
  const money = (v) => formatMoney(v, currency);

  const draftWorkOrders = workOrders ? workOrders.filter((wo) => wo.status === 'draft') : [];
  const activeWorkOrders = workOrders ? workOrders.filter((wo) => ACTIVE_STATUSES.has(wo.status)) : [];
  const recentlyCompleted = workOrders
    ? workOrders.filter((wo) => wo.status === 'completed').sort((a, b) => new Date(b.completion_date) - new Date(a.completion_date))
    : [];

  const variance = overheadVariance ? overheadVariance.variance : null;
  const varianceIsSignificant = overheadVariance && overheadVariance.applied > 0 && Math.abs(variance) / overheadVariance.applied > 0.1;

  const noExceptions = draftWorkOrders.length === 0 && !varianceIsSignificant;

  // Every KPI, feed item, and rail item is a real navigation link into the
  // Manufacturing page — since that page is one route with internal tabs
  // (not separate routes per section), drilling down means landing on the
  // right tab (and, for a specific work order, that record pre-selected)
  // via location.state rather than a plain URL. See Manufacturing.jsx's
  // top-level component, which reads this state on arrival.
  const toWorkOrders = (workOrderId) => ({ pathname: '/manufacturing', state: { tab: 'work-orders', ...(workOrderId ? { workOrderId } : {}) } });
  const toManufacturingAccount = { pathname: '/manufacturing', state: { tab: 'manufacturing-account' } };
  const toReports = { pathname: '/manufacturing', state: { tab: 'reports' } };

  return (
    <DashboardLayout
      title="Manufacturing"
      subtitle="Your production & costing workspace"
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
        {workOrders !== false && (
          <>
            <Link to={toWorkOrders()} className="kpi-card kpi-card-link">
              <div className="kpi-label">Active work orders</div>
              <div className="kpi-value">{workOrders === null ? '...' : activeWorkOrders.length}</div>
            </Link>
            <Link to={toWorkOrders()} className="kpi-card kpi-card-link">
              <div className="kpi-label">Draft work orders</div>
              <div className="kpi-value" style={draftWorkOrders.length > 0 ? { color: 'var(--color-warning-text)' } : undefined}>
                {workOrders === null ? '...' : draftWorkOrders.length}
              </div>
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Awaiting material issue</div>
            </Link>
            <Link to={toWorkOrders()} className="kpi-card kpi-card-link">
              <div className="kpi-label">Completed (selected period)</div>
              <div className="kpi-value">
                {workOrders === null ? '...' : workOrders.filter((wo) => wo.status === 'completed' && wo.completion_date && wo.completion_date.slice(0, 10) >= from && wo.completion_date.slice(0, 10) <= to).length}
              </div>
            </Link>
          </>
        )}
        {manufacturingAccount !== false && (
          <>
            <Link to={toManufacturingAccount} className="kpi-card kpi-card-link">
              <div className="kpi-label">Work in Progress</div>
              <div className="kpi-value">{manufacturingAccount === null ? '...' : money(manufacturingAccount.closingWip)}</div>
            </Link>
            <Link to={toManufacturingAccount} className="kpi-card kpi-card-link">
              <div className="kpi-label">Raw materials on hand</div>
              <div className="kpi-value">{manufacturingAccount === null ? '...' : money(manufacturingAccount.closingRawMaterials)}</div>
            </Link>
            <Link to={toManufacturingAccount} className="kpi-card kpi-card-link">
              <div className="kpi-label">Cost of Goods Manufactured</div>
              <div className="kpi-value">{manufacturingAccount === null ? '...' : money(manufacturingAccount.costOfGoodsManufactured)}</div>
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Selected period</div>
            </Link>
          </>
        )}
        {overheadVariance !== false && (
          <Link to={toReports} className="kpi-card kpi-card-link">
            <div className="kpi-label">Overhead variance</div>
            <div className="kpi-value" style={varianceIsSignificant ? { color: 'var(--color-warning-text)' } : undefined}>
              {overheadVariance === null ? '...' : money(variance)}
            </div>
            {overheadVariance && (
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>
                {overheadVariance.isOverApplied ? 'Over-applied' : 'Under-applied'} — actual {money(overheadVariance.actual)} vs applied {money(overheadVariance.applied)}
              </div>
            )}
          </Link>
        )}
      </div>

      <div className="chart-grid" style={{ marginBottom: 16 }}>
        {workOrders && workOrders.length > 0 && (
          <PieChartWidget
            title="Work Orders by Status"
            data={Object.entries(workOrders.reduce((acc, wo) => ({ ...acc, [wo.status]: (acc[wo.status] || 0) + 1 }), {})).map(([name, value]) => ({ name: name.replace('_', ' '), value }))}
            valueFormatter={(v) => `${v}`}
          />
        )}
        {manufacturingAccount && (
          <BarChartWidget
            title="Manufacturing Cost Breakdown"
            data={[
              { name: 'Raw Materials', value: Number(manufacturingAccount.rawMaterialsConsumed) },
              { name: 'Direct Labour', value: Number(manufacturingAccount.directLabour) },
              { name: 'Factory Overheads', value: Number(manufacturingAccount.factoryOverheads) },
            ]}
            bars={[{ key: 'value', label: 'Cost' }]}
            colorByCategory
            valueFormatter={money}
          />
        )}
        {manufacturingAccount && manufacturingAccount.factoryOverheadsByCategory.some((c) => c.amount > 0) && (
          <PieChartWidget
            title="Factory Overheads by Category"
            data={manufacturingAccount.factoryOverheadsByCategory.filter((c) => c.amount > 0).map((c) => ({ name: c.category, value: Number(c.amount) }))}
            valueFormatter={money}
          />
        )}
      </div>

      <div className="factsheet-body">
        <div className="factsheet-main">
          <div className="card">
            <h2>Needs your attention</h2>
            {workOrders === false && overheadVariance === false ? (
              <p style={{ color: 'var(--color-text-muted)' }}>You don't have access to work orders or manufacturing reports.</p>
            ) : noExceptions ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Nothing awaiting material issue, and overhead variance is within a normal range.</p>
            ) : (
              <ul className="feed-list">
                {draftWorkOrders.map((wo) => (
                  <li key={`draft-${wo.id}`}>
                    <Link to={toWorkOrders(wo.id)} className="feed-list-link">
                      <span className="feed-list-title">
                        <span className="badge badge-neutral" style={{ marginRight: 6 }}>Draft</span>
                        {wo.work_order_no} — {wo.product_name}
                      </span>
                      <span className="feed-list-detail">{wo.warehouse_name} — created {new Date(wo.created_at).toLocaleDateString()}, materials not yet issued</span>
                    </Link>
                  </li>
                ))}
                {varianceIsSignificant && (
                  <li key="variance">
                    <Link to={toReports} className="feed-list-link">
                      <span className="feed-list-title">
                        <span className="badge badge-warning" style={{ marginRight: 6 }}>Variance</span>
                        Overhead is {overheadVariance.isOverApplied ? 'over' : 'under'}-applied by more than 10% this period
                      </span>
                      <span className="feed-list-detail">{money(overheadVariance.actual)} actual vs {money(overheadVariance.applied)} applied — consider closing the variance on the Reports tab</span>
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="factsheet-rail">
          <div className="card">
            <h2>Recently completed</h2>
            {workOrders === null ? (
              <p>Loading...</p>
            ) : recentlyCompleted.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No completed work orders yet.</p>
            ) : (
              recentlyCompleted.slice(0, 8).map((wo) => (
                <Link key={wo.id} to={toWorkOrders(wo.id)} style={{ display: 'block', padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, margin: '0 0 2px', color: 'var(--color-text)' }}>{wo.work_order_no} — {wo.product_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{Number(wo.quantity_to_produce).toLocaleString()} units — completed {new Date(wo.completion_date).toLocaleDateString()}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

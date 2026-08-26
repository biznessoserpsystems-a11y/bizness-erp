import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, LineChartWidget, PieChartWidget, AreaChartWidget, KpiGauge, TrendIndicator, formatMoney } from '../components/charts';
import AnimatedNumber from '../components/AnimatedNumber';
import LiveIndicator from '../components/LiveIndicator';
import MiniCalendar from '../components/MiniCalendar';
import BusinessInsights, { generateInsights } from '../components/BusinessInsights';
import { ACTIONS as QUICK_ACTIONS } from '../components/QuickCreateMenu';
import DateRangeFilter, { resolveDateRange, monthBucketsInRange } from '../components/DateRangeFilter';
import { IconAlertTriangle, IconClock, IconFinance, IconSales, IconCRM, IconInventory, IconHR, IconProcurement, IconAssets } from '../components/icons';
import { IconBadge, TrendPill, Breadcrumb } from '../Style';
import DashboardHeroGraphic from '../components/DashboardHeroGraphic';
import AlertExplainer from '../components/AlertExplainer';
import { formatComplianceCategory } from './ComplianceCalendar';

export default function Dashboard() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const can = (code) => perms.includes(code);

  const [company, setCompany] = useState(null);
  const [userCount, setUserCount] = useState(null);
  const [branchCount, setBranchCount] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  const [financeSeries, setFinanceSeries] = useState(null);
  const [expenseBreakdown, setExpenseBreakdown] = useState(null);

  const [cashTotal, setCashTotal] = useState(null);
  const [cashFlowSeries, setCashFlowSeries] = useState(null);

  const [inventoryValue, setInventoryValue] = useState(null);
  const [receivablesTotal, setReceivablesTotal] = useState(null);
  const [agingBuckets, setAgingBuckets] = useState(null);
  const [lowStockCount, setLowStockCount] = useState(null);

  const [pendingApprovals, setPendingApprovals] = useState(null);
  const [pendingLeave, setPendingLeave] = useState(null);
  const [myTasks, setMyTasks] = useState(null);
  const [dueSoon, setDueSoon] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState(null);

  const [topCustomers, setTopCustomers] = useState(null);
  const [topProducts, setTopProducts] = useState(null);
  const [branchSales, setBranchSales] = useState(null);
  const [categoryRevenue, setCategoryRevenue] = useState(null);
  const [budgetVsActual, setBudgetVsActual] = useState(null);

  const [payablesTotal, setPayablesTotal] = useState(null);
  const [savedReports, setSavedReports] = useState(null);
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [reportRunResult, setReportRunResult] = useState(null);
  const [reportRunning, setReportRunning] = useState(false);
  const [reportRunError, setReportRunError] = useState('');
  const [payablesAging, setPayablesAging] = useState(null);
  const [assetsValue, setAssetsValue] = useState(null);
  const [pettyCashTotal, setPettyCashTotal] = useState(null);
  const [customerCount, setCustomerCount] = useState(null);
  const [supplierCount, setSupplierCount] = useState(null);
  const [employeeCount, setEmployeeCount] = useState(null);
  const [ratios, setRatios] = useState(null);
  const [workingCapital, setWorkingCapital] = useState(null);
  const [productGrowth, setProductGrowth] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [calendarSummary, setCalendarSummary] = useState(null);

  const [lastUpdated, setLastUpdated] = useState(null);

  const [rangeMode, setRangeMode] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = resolveDateRange(rangeMode, customFrom, customTo);
  const monthBuckets = monthBucketsInRange(range.from, range.to);
  const rangeDisplayLabel = monthBuckets.length > 1
    ? `${monthBuckets[0].label} – ${monthBuckets[monthBuckets.length - 1].label}`
    : (monthBuckets[0]?.label || 'Selected period');

  useEffect(() => {
    function loadDashboard() {
    api.get('/company').then(({ data }) => setCompany(data)).catch(() => {});
    if (can('system.users.manage')) {
      api.get('/users').then(({ data }) => setUserCount(data.length)).catch(() => {});
    }
    api.get('/branches').then(({ data }) => setBranchCount(data.length)).catch(() => {});
    api.get('/customers').then(({ data }) => setCustomerCount(data.length)).catch(() => setCustomerCount(null));
    api.get('/suppliers').then(({ data }) => setSupplierCount(data.length)).catch(() => setSupplierCount(null));
    if (can('hr.reports.view')) {
      api.get('/hr-reports/headcount-summary').then(({ data }) => {
        const active = data.byStatus.find((s) => s.employment_status === 'active');
        setEmployeeCount(active ? active.count : 0);
      }).catch(() => setEmployeeCount(null));
    } else {
      setEmployeeCount(null);
    }
    if (can('system.audit.view')) {
      api.get('/activity-logs?limit=8').then(({ data }) => setRecentActivity(data)).catch(() => {});
    }

    // Pending approvals — no extra permission gate on this endpoint.
    api.get('/workflow-instances/my-approvals').then(({ data }) => setPendingApprovals(data)).catch(() => setPendingApprovals([]));

    // Business Intelligence — surfacing the person's own saved ad-hoc
    // reports right here, so the Executive Dashboard isn't a dead end
    // pointing off to a separate BI page but an actual home for both the
    // built-in KPIs and whatever custom reports someone has built for
    // themselves. No extra permission gate here either — listing a
    // saved report's name is the same list already visible on the BI
    // page itself; running one still re-checks that data source's real
    // permission on the backend, the same as it always has.
    api.get('/bi/saved-reports').then(({ data }) => setSavedReports(data)).catch(() => setSavedReports([]));

    // Tasks — everyone can manage their own, no permission gate needed.
    api.get('/tasks?assignedTo=me&status=open').then(({ data }) => setMyTasks(data)).catch(() => setMyTasks([]));

    // Upcoming calendar events — everyone can see their own, no permission gate needed.
    {
      const now = new Date();
      const in7 = new Date();
      in7.setDate(now.getDate() + 7);
      api.get(`/calendar-events?from=${now.toISOString()}&to=${in7.toISOString()}`)
        .then(({ data }) => setUpcomingEvents(data.slice(0, 3)))
        .catch(() => setUpcomingEvents([]));
    }

    if (can('hr.leave.approve')) {
      api.get('/leave-requests?status=pending').then(({ data }) => setPendingLeave(data)).catch(() => setPendingLeave([]));
    } else {
      setPendingLeave([]);
    }

    if (can('accounting.ledger.view')) {
      Promise.all(
        monthBuckets.map((bucket) =>
          api.get(`/financial-statements/income-statement?from=${bucket.from}&to=${bucket.to}`).then(({ data }) => ({ label: bucket.label, data }))
        )
      )
        .then((results) => {
          const series = results.map((r) => ({
            name: r.label,
            Revenue: r.data.totals.totalRevenue,
            Expenses: r.data.totals.totalCogs + r.data.totals.totalOperatingExpense,
            Profit: r.data.totals.netIncome,
          }));
          setFinanceSeries(series);
          const current = results[results.length - 1].data;
          setExpenseBreakdown([...current.cogs, ...current.operatingExpense]);
        })
        .catch(() => { setFinanceSeries([]); setExpenseBreakdown([]); });
    } else {
      setFinanceSeries([]);
      setExpenseBreakdown([]);
    }

    if (can('inventory.reports.view')) {
      api.get('/inventory-reports/valuation').then(({ data }) => setInventoryValue(data.totalValue)).catch(() => setInventoryValue(null));
      api.get('/inventory-reports/low-stock').then(({ data }) => setLowStockCount(data.length)).catch(() => setLowStockCount(null));
    }

    if (can('sales.reports.view')) {
      api.get('/sales-reports/receivables-aging').then(({ data }) => {
        setAgingBuckets(data.buckets);
        setReceivablesTotal(Object.values(data.buckets).reduce((s, v) => s + Number(v), 0));
      }).catch(() => {});

      // Uses the dashboard's selected date range filter, not a fixed window.
      const { from, to } = range;
      api.get(`/sales-reports/summary?from=${from}&to=${to}`).then(({ data }) => {
        setTopCustomers(data.byCustomer.slice(0, 8));
        setTopProducts(data.byProduct.slice(0, 8));
      }).catch(() => { setTopCustomers([]); setTopProducts([]); });

      api.get(`/sales-reports/by-branch?from=${from}&to=${to}`).then(({ data }) => setBranchSales(data)).catch(() => setBranchSales([]));
      api.get(`/sales-reports/by-category?from=${from}&to=${to}`).then(({ data }) => setCategoryRevenue(data)).catch(() => setCategoryRevenue([]));

      // Fastest-growing product: compare the two most recent month buckets
      // within the selected range (falls back gracefully if the range is
      // under a month — then there's only one bucket and growth can't be computed).
      if (monthBuckets.length >= 2) {
        const curBucket = monthBuckets[monthBuckets.length - 1];
        const prevBucket = monthBuckets[monthBuckets.length - 2];
        Promise.all([
          api.get(`/sales-reports/summary?from=${curBucket.from}&to=${curBucket.to}`),
          api.get(`/sales-reports/summary?from=${prevBucket.from}&to=${prevBucket.to}`),
        ]).then(([curRes, prevRes]) => {
          const prevByName = new Map(prevRes.data.byProduct.map((p) => [p.name, Number(p.revenue)]));
          const growth = curRes.data.byProduct
            .map((p) => {
              const cur = Number(p.revenue);
              const prev = prevByName.get(p.name) || 0;
              return { name: p.name, current: cur, previous: prev, change: cur - prev, pctChange: prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? Infinity : 0) };
            })
            .filter((p) => p.current > 0)
            .sort((a, b) => b.pctChange - a.pctChange);
          setProductGrowth(growth[0] || null);
        }).catch(() => setProductGrowth(null));
      } else {
        setProductGrowth(null);
      }
    } else {
      setTopCustomers([]);
      setTopProducts([]);
      setBranchSales([]);
      setCategoryRevenue([]);
      setProductGrowth(null);
      setAgingBuckets({ current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 });
      setReceivablesTotal(0);
    }

    if (can('procurement.reports.view')) {
      api.get('/procurement-reports/payables-aging').then(({ data }) => {
        setPayablesTotal(Object.values(data.buckets).reduce((s, v) => s + Number(v), 0));
        setPayablesAging(data.buckets);
      }).catch(() => { setPayablesTotal(null); setPayablesAging(null); });
    } else {
      setPayablesTotal(null);
      setPayablesAging(null);
    }

    if (can('accounting.ledger.view')) {
      api.get('/financial-statements/ratios').then(({ data }) => setRatios(data)).catch(() => setRatios(null));
    } else {
      setRatios(null);
    }

    if (can('system.compliance.manage')) {
      api.get('/statutory-compliance-status').then(({ data }) => setCompliance(data)).catch(() => setCompliance(null));
      api.get('/compliance-calendar/summary').then(({ data }) => setCalendarSummary(data)).catch(() => setCalendarSummary(null));
    } else {
      setCompliance(null);
      setCalendarSummary(null);
    }

    if (can('accounting.budgets.manage')) {
      api.get('/budgets').then(({ data }) => {
        const current = data.find((b) => b.status === 'approved') || data[0];
        if (!current) { setBudgetVsActual([]); return; }
        api.get(`/budgets/${current.id}/vs-actual`).then(({ data: vsActual }) => {
          const totals = {};
          for (const line of vsActual.lines) {
            const type = line.account_type === 'revenue' ? 'Revenue' : line.account_type === 'expense' ? 'Expense' : null;
            if (!type) continue;
            totals[type] = totals[type] || { name: type, Budgeted: 0, Actual: 0 };
            totals[type].Budgeted += Number(line.budgeted_amount);
            totals[type].Actual += Number(line.actual_amount);
          }
          setBudgetVsActual(Object.values(totals));
        }).catch(() => setBudgetVsActual([]));
      }).catch(() => setBudgetVsActual([]));
    } else {
      setBudgetVsActual([]);
    }

    if (can('accounting.ledger.view')) {
      api.get(`/financial-statements/balance-sheet?asOf=${range.to}`).then(({ data: bsData }) => {
        setAssetsValue(bsData.totals.totalNonCurrentAssets);
        setWorkingCapital(bsData.totals.totalCurrentAssets - bsData.totals.totalCurrentLiabilities);

        if (can('accounting.petty_cash.manage')) {
          api.get('/petty-cash-accounts').then(({ data: pettyCashAccounts }) => {
            const pettyCashAccountIds = new Set(pettyCashAccounts.map((p) => p.account_id));
            const total = bsData.assets
              .filter((a) => pettyCashAccountIds.has(a.id))
              .reduce((s, a) => s + Number(a.balance), 0);
            setPettyCashTotal(total);
          }).catch(() => setPettyCashTotal(null));
        } else {
          setPettyCashTotal(null);
        }

        if (can('accounting.banking.manage')) {
          api.get('/bank-accounts').then(({ data: bankAccounts }) => {
            const bankAccountIds = new Set(bankAccounts.map((b) => b.account_id));
            const total = bsData.assets
              .filter((a) => bankAccountIds.has(a.id))
              .reduce((s, a) => s + Number(a.balance), 0);
            setCashTotal(total);

            Promise.all(
              bankAccounts.map((b) => api.get(`/bank-accounts/${b.id}/statement-lines`).then(({ data }) => data).catch(() => []))
            ).then((lists) => {
              const allLines = lists.flat();
              const series = monthBuckets.map((bucket) => {
                const net = allLines
                  .filter((l) => l.transaction_date >= bucket.from && l.transaction_date <= bucket.to)
                  .reduce((s, l) => s + Number(l.amount), 0);
                return { name: bucket.label, net };
              });
              setCashFlowSeries(series);
            });
          }).catch(() => { setCashTotal(null); setCashFlowSeries([]); });
        } else {
          setCashFlowSeries([]);
        }
      }).catch(() => { setAssetsValue(null); setWorkingCapital(null); setPettyCashTotal(null); });
    } else {
      setAssetsValue(null);
      setWorkingCapital(null);
      setPettyCashTotal(null);
      setCashFlowSeries([]);
    }

    if (can('sales.invoices.manage')) {
      api.get('/invoices').then(({ data }) => {
        const now = new Date();
        const in7 = new Date();
        in7.setDate(now.getDate() + 7);
        const upcoming = data
          .filter((inv) => inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && new Date(inv.due_date) >= now && new Date(inv.due_date) <= in7)
          .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
          .slice(0, 5);
        setDueSoon(upcoming);
      }).catch(() => setDueSoon([]));
    } else {
      setDueSoon([]);
    }
      setLastUpdated(new Date());
    }

    loadDashboard();
    // Keep the dashboard live: refresh in the background while the tab is
    // actually visible, rather than burning API calls on a hidden tab.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadDashboard();
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, rangeMode, customFrom, customTo]);

  const currency = company?.base_currency || 'GHS';
  const money = (v) => formatMoney(v, currency);

  const latestFinance = financeSeries && financeSeries.length > 0 ? financeSeries[financeSeries.length - 1] : null;
  const prevFinance = financeSeries && financeSeries.length > 1 ? financeSeries[financeSeries.length - 2] : null;

  const expenseChart = (expenseBreakdown || [])
    .filter((a) => Number(a.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 6)
    .map((a) => ({ name: a.account_name, value: Number(a.balance) }));

  const agingChart = agingBuckets
    ? [
        { name: 'Current', value: Number(agingBuckets.current), color: '#2F9E6E' },
        { name: '1-30 days', value: Number(agingBuckets.days1to30), color: '#2B6CB0' },
        { name: '31-60 days', value: Number(agingBuckets.days31to60), color: '#B9790A' },
        { name: '61-90 days', value: Number(agingBuckets.days61to90), color: '#f97316' },
        { name: '90+ days', value: Number(agingBuckets.over90), color: '#B3261E' },
      ]
    : [];

  const branchChart = (branchSales || []).map((b) => ({ name: b.branch_name, value: Number(b.revenue) }));
  const categoryChart = (categoryRevenue || []).map((c) => ({ name: c.category_name, value: Number(c.revenue) }));

  const sortedBranches = (branchSales || []).slice().sort((a, b) => Number(b.revenue) - Number(a.revenue));
  const highestBranch = sortedBranches[0] || null;
  const lowestBranch = sortedBranches.length > 1 ? sortedBranches[sortedBranches.length - 1] : null;
  const topCategory = (categoryRevenue || []).slice().sort((a, b) => Number(b.revenue) - Number(a.revenue))[0] || null;
  const cashPosition = (cashTotal !== null ? cashTotal : 0) + (pettyCashTotal !== null ? pettyCashTotal : 0);
  const customerChart = (topCustomers || []).map((c) => ({ name: c.name, revenue: Number(c.revenue) }));
  const productChart = (topProducts || []).map((p) => ({ name: p.name, revenue: Number(p.revenue) }));

  const insightsReady = financeSeries !== null && cashFlowSeries !== null && agingBuckets !== null
    && topCustomers !== null && branchSales !== null && budgetVsActual !== null;
  const insights = insightsReady
    ? generateInsights({
        financeSeries, cashFlowSeries, agingBuckets, receivablesTotal,
        topCustomers, branchSales, budgetVsActual, lowStockCount, money,
      })
    : [];

  async function updateComplianceStatus(itemId, status) {
    try {
      await api.patch(`/statutory-compliance-items/${itemId}`, { status });
      const { data } = await api.get('/statutory-compliance-status');
      setCompliance(data);
    } catch {
      // Silently ignore — the widget just won't reflect the change; the person can retry.
    }
  }

  async function runSavedReport(id) {
    if (expandedReportId === id) { setExpandedReportId(null); return; }
    setExpandedReportId(id);
    setReportRunResult(null);
    setReportRunError('');
    setReportRunning(true);
    try {
      const { data } = await api.get(`/bi/saved-reports/${id}/run`);
      setReportRunResult(data);
    } catch (err) {
      setReportRunError(err.response?.data?.error || 'Could not run this report.');
    } finally {
      setReportRunning(false);
    }
  }

  const alerts = [];
  if (lowStockCount) alerts.push({ text: `${lowStockCount} product${lowStockCount === 1 ? '' : 's'} at or below reorder level`, to: '/inventory/reports' });
  if (agingBuckets && Number(agingBuckets.over90) > 0) alerts.push({ text: `${money(agingBuckets.over90)} in receivables over 90 days overdue`, to: '/sales/reports' });
  if (agingBuckets && Number(agingBuckets.days61to90) > 0) alerts.push({ text: `${money(agingBuckets.days61to90)} in receivables 61-90 days overdue`, to: '/sales/reports' });
  if (payablesAging && Number(payablesAging.over90) > 0) alerts.push({ text: `${money(payablesAging.over90)} owed to suppliers over 90 days overdue`, to: '/procurement/purchase-invoices' });
  if (payablesAging && Number(payablesAging.days61to90) > 0) alerts.push({ text: `${money(payablesAging.days61to90)} owed to suppliers 61-90 days overdue`, to: '/procurement/purchase-invoices' });
  if (calendarSummary && Number(calendarSummary.overdueCount) > 0) {
    alerts.push({ text: `${calendarSummary.overdueCount} compliance item${calendarSummary.overdueCount === 1 ? '' : 's'} overdue`, to: '/compliance-calendar' });
  }
  const overdueTaskCount = (myTasks || []).filter((t) => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())).length;
  if (overdueTaskCount > 0) alerts.push({ text: `${overdueTaskCount} of your task${overdueTaskCount === 1 ? '' : 's'} overdue`, to: '/tasks' });

  return (
    <DashboardLayout
      title="Executive Dashboard"
      subtitle={company?.name}
      breadcrumb={[{ label: 'Home', to: '/' }]}
      actions={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          <LiveIndicator lastUpdated={lastUpdated} />
        </div>
      )}
    >
      <div className="dashboard-layout">
        <div className="dashboard-main">
          <DashboardHeroGraphic firstName={user?.firstName} />
          <div className="kpi-grid">
            <Link to="/accounting/statements" className="kpi-card kpi-card-link">
              <IconBadge icon={IconFinance} tone="primary" />
              <div className="kpi-label">Total revenue (latest period)</div>
              <div className="kpi-value">{latestFinance ? money(latestFinance.Revenue) : '—'}</div>
              {latestFinance && prevFinance && (
                <div className="kpi-footer"><TrendPill current={latestFinance.Revenue} previous={prevFinance.Revenue} label="vs last month" /></div>
              )}
            </Link>
            <Link to="/accounting/statements" className="kpi-card kpi-card-link">
              <IconBadge icon={IconFinance} tone="success" />
              <div className="kpi-label">Net profit (latest period)</div>
              <div className="kpi-value">{latestFinance ? money(latestFinance.Profit) : '—'}</div>
              {latestFinance && prevFinance && (
                <div className="kpi-footer"><TrendPill current={latestFinance.Profit} previous={prevFinance.Profit} label="vs last month" /></div>
              )}
            </Link>
            <Link to="/accounting/petty-cash" className="kpi-card kpi-card-link">
              <IconBadge icon={IconFinance} tone="info" />
              <div className="kpi-label">Cash balance</div>
              <div className="kpi-value">{pettyCashTotal !== null ? money(pettyCashTotal) : '—'}</div>
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Petty cash on hand</div>
            </Link>
            <Link to="/accounting/banking" className="kpi-card kpi-card-link">
              <IconBadge icon={IconFinance} tone="info" />
              <div className="kpi-label">Bank balance</div>
              <div className="kpi-value">{cashTotal !== null ? money(cashTotal) : '—'}</div>
            </Link>
            <Link to="/sales/reports" className="kpi-card kpi-card-link">
              <IconBadge icon={IconCRM} tone="error" />
              <div className="kpi-label">Accounts receivable</div>
              <div className="kpi-value">{receivablesTotal !== null && receivablesTotal !== undefined ? money(receivablesTotal) : '—'}</div>
            </Link>
            <Link to="/procurement/purchase-invoices" className="kpi-card kpi-card-link">
              <IconBadge icon={IconProcurement} tone="warning" />
              <div className="kpi-label">Accounts payable</div>
              <div className="kpi-value">{payablesTotal !== null ? money(payablesTotal) : '—'}</div>
            </Link>
            <Link to="/inventory/reports" className="kpi-card kpi-card-link">
              <IconBadge icon={IconInventory} tone="neutral" />
              <div className="kpi-label">Inventory value</div>
              <div className="kpi-value">{inventoryValue !== null && inventoryValue !== undefined ? money(inventoryValue) : '—'}</div>
            </Link>
            <Link to="/assets" className="kpi-card kpi-card-link">
              <IconBadge icon={IconAssets} tone="neutral" />
              <div className="kpi-label">Assets value</div>
              <div className="kpi-value">{assetsValue !== null ? money(assetsValue) : '—'}</div>
              <div className="kpi-footer" style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>Non-current (fixed) assets</div>
            </Link>
            <Link to="/sales/customers" className="kpi-card kpi-card-link">
              <IconBadge icon={IconCRM} tone="primary" />
              <div className="kpi-label">Customers</div>
              <div className="kpi-value">{customerCount !== null ? customerCount : '—'}</div>
            </Link>
            <Link to="/procurement/suppliers" className="kpi-card kpi-card-link">
              <IconBadge icon={IconProcurement} tone="neutral" />
              <div className="kpi-label">Suppliers</div>
              <div className="kpi-value">{supplierCount !== null ? supplierCount : '—'}</div>
            </Link>
            <Link to="/hr/payroll" className="kpi-card kpi-card-link">
              <IconBadge icon={IconHR} tone="success" />
              <div className="kpi-label">Employees</div>
              <div className="kpi-value">{employeeCount !== null ? employeeCount : '—'}</div>
            </Link>
          </div>

          <BusinessInsights loading={!insightsReady} insights={insights} />

          <div className="card">
            <h2>Quick insights</h2>
            <div className="quick-insights-grid">
              <div className="quick-insight">
                <div className="quick-insight-label">Highest revenue branch</div>
                <div className="quick-insight-value">{highestBranch ? highestBranch.branch_name : '—'}</div>
                {highestBranch && <div className="quick-insight-sub">{money(highestBranch.revenue)}</div>}
              </div>
              <div className="quick-insight">
                <div className="quick-insight-label">Lowest performing branch</div>
                <div className="quick-insight-value">{lowestBranch ? lowestBranch.branch_name : '—'}</div>
                {lowestBranch && <div className="quick-insight-sub">{money(lowestBranch.revenue)}</div>}
              </div>
              <div className="quick-insight">
                <div className="quick-insight-label">Fastest growing product</div>
                <div className="quick-insight-value">{productGrowth ? productGrowth.name : '—'}</div>
                {productGrowth && (
                  <div className="quick-insight-sub">
                    {productGrowth.pctChange === Infinity ? 'New this month' : `${productGrowth.pctChange >= 0 ? '▲' : '▼'} ${Math.abs(productGrowth.pctChange).toFixed(0)}% vs last month`}
                  </div>
                )}
              </div>
              <div className="quick-insight">
                <div className="quick-insight-label">Most profitable category</div>
                <div className="quick-insight-value">{topCategory ? topCategory.category_name : '—'}</div>
                {topCategory && <div className="quick-insight-sub">{money(topCategory.revenue)} revenue</div>}
              </div>
              <div className="quick-insight">
                <div className="quick-insight-label">Cash position</div>
                <div className="quick-insight-value">{cashTotal !== null || pettyCashTotal !== null ? money(cashPosition) : '—'}</div>
                <div className="quick-insight-sub">Bank + petty cash</div>
              </div>
              <div className="quick-insight">
                <div className="quick-insight-label">Liquidity ratio</div>
                <div className="quick-insight-value">{ratios?.currentRatio !== null && ratios?.currentRatio !== undefined ? ratios.currentRatio.toFixed(2) : '—'}</div>
                <div className="quick-insight-sub">Current assets ÷ current liabilities</div>
              </div>
              <div className="quick-insight">
                <div className="quick-insight-label">Working capital</div>
                <div className="quick-insight-value">{workingCapital !== null ? money(workingCapital) : '—'}</div>
                <div className="quick-insight-sub">Current assets − current liabilities</div>
              </div>
            </div>
          </div>

          <div className="chart-grid">
            <LineChartWidget
              title="Revenue trend"
              subtitle={rangeDisplayLabel}
              loading={financeSeries === null}
              data={financeSeries || []}
              lines={[{ key: 'Revenue', label: 'Revenue', color: '#0B6E4F' }]}
              valueFormatter={(v) => money(v)}
            />
            <BarChartWidget
              title="Profit vs. expenses"
              subtitle={rangeDisplayLabel}
              loading={financeSeries === null}
              data={financeSeries || []}
              bars={[
                { key: 'Expenses', label: 'Expenses', color: '#B3261E' },
                { key: 'Profit', label: 'Profit', color: '#2F9E6E' },
              ]}
              valueFormatter={(v) => money(v)}
            />
            <AreaChartWidget
              title="Cash flow trend"
              subtitle={`Net bank movement, ${rangeDisplayLabel}`}
              loading={cashFlowSeries === null}
              data={cashFlowSeries || []}
              areas={[{ key: 'net', label: 'Net cash flow', color: '#0B6E4F' }]}
              valueFormatter={(v) => money(v)}
            />
            <PieChartWidget
              title="Revenue by category"
              subtitle={`${rangeDisplayLabel}, by product category`}
              loading={categoryRevenue === null}
              data={categoryChart}
              donut
              valueFormatter={(v) => money(v)}
            />
            <PieChartWidget
              title="Expense analysis"
              subtitle="This month, by account"
              loading={expenseBreakdown === null}
              data={expenseChart}
              valueFormatter={(v) => money(v)}
            />
            <BarChartWidget
              title="Aging analysis"
              subtitle="Outstanding receivables by age"
              loading={agingBuckets === null}
              data={agingChart}
              bars={[{ key: 'value', label: 'Outstanding' }]}
              colorByCategory
              valueFormatter={(v) => money(v)}
            />
          </div>

          <div className="chart-grid">
            <div className="card">
              <h2>Executive scorecard</h2>
              <div className="gauge-grid">
                <KpiGauge
                  label="Liquidity (current ratio)"
                  value={ratios?.currentRatio}
                  isNull={!ratios || ratios.currentRatio === null}
                  formatter={(n) => n.toFixed(2)}
                  min={0} max={3} target={1.5}
                  hint="Target: 1.5+"
                />
                <KpiGauge
                  label="Net profit margin"
                  value={ratios?.netProfitMargin !== null && ratios?.netProfitMargin !== undefined ? ratios.netProfitMargin * 100 : null}
                  isNull={!ratios || ratios.netProfitMargin === null}
                  formatter={(n) => `${n.toFixed(1)}%`}
                  min={-20} max={40} target={10}
                  hint="Target: 10%+"
                />
                <KpiGauge
                  label="Return on assets"
                  value={ratios?.returnOnAssets !== null && ratios?.returnOnAssets !== undefined ? ratios.returnOnAssets * 100 : null}
                  isNull={!ratios || ratios.returnOnAssets === null}
                  formatter={(n) => `${n.toFixed(1)}%`}
                  min={-10} max={30} target={5}
                  hint="Target: 5%+"
                />
                <KpiGauge
                  label="Debt to equity"
                  value={ratios?.debtToEquity}
                  isNull={!ratios || ratios.debtToEquity === null}
                  formatter={(n) => n.toFixed(2)}
                  min={0} max={3} target={1} goodDirection="down"
                  hint="Lower is safer"
                />
              </div>
            </div>
          </div>

          {can('sales.reports.view') && (
            <div className="chart-grid">
              <BarChartWidget
                title="Top customers"
                subtitle={`By revenue, ${rangeDisplayLabel}`}
                loading={topCustomers === null}
                data={customerChart}
                bars={[{ key: 'revenue', label: 'Revenue' }]}
                horizontal
                valueFormatter={(v) => money(v)}
              />
              <BarChartWidget
                title="Top-selling products"
                subtitle={`By revenue, ${rangeDisplayLabel}`}
                loading={topProducts === null}
                data={productChart}
                bars={[{ key: 'revenue', label: 'Revenue' }]}
                horizontal
                valueFormatter={(v) => money(v)}
              />
              <BarChartWidget
                title="Sales by branch"
                subtitle={rangeDisplayLabel}
                loading={branchSales === null}
                data={branchChart}
                bars={[{ key: 'value', label: 'Revenue' }]}
                colorByCategory
                valueFormatter={(v) => money(v)}
              />
            </div>
          )}

          {can('sales.reports.view') && branchSales && branchSales.length > 0 && (
            <div className="card">
              <h2>Branch performance</h2>
              <table>
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Revenue</th>
                    <th>Invoices</th>
                    <th>Avg. invoice value</th>
                  </tr>
                </thead>
                <tbody>
                  {branchSales.map((b) => (
                    <tr key={b.branch_id}>
                      <td>{b.branch_name}</td>
                      <td>{money(b.revenue)}</td>
                      <td>{b.invoice_count}</td>
                      <td>{money(b.invoice_count > 0 ? Number(b.revenue) / Number(b.invoice_count) : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {can('accounting.budgets.manage') && budgetVsActual && budgetVsActual.length > 0 && (
            <div className="chart-grid">
              <BarChartWidget
                title="Budget vs Actual"
                subtitle="Current approved budget, revenue & expense"
                loading={budgetVsActual === null}
                data={budgetVsActual}
                bars={[
                  { key: 'Budgeted', label: 'Budgeted', color: '#9B9284' },
                  { key: 'Actual', label: 'Actual', color: '#0B6E4F' },
                ]}
                valueFormatter={(v) => money(v)}
              />
            </div>
          )}

          {can('system.compliance.manage') && (
            <div className="card">
              <div className="card-header">
                <h2>Compliance</h2>
                <Link to="/reports/tax" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Tax Reports</Link>
              </div>
              {!compliance ? (
                <p className="dashboard-empty-note">Loading…</p>
              ) : (
                <table>
                  <thead><tr><th>Item</th><th>Status</th><th>Detail</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>SSNIT Payable</td>
                      <td><span className="badge badge-info">GL balance</span></td>
                      <td>{compliance.computed.ssnitPayable !== null ? money(compliance.computed.ssnitPayable) : 'Not configured'}</td>
                    </tr>
                    <tr>
                      <td>PAYE</td>
                      <td><span className="badge badge-info">GL balance</span></td>
                      <td>{compliance.computed.payePayable !== null ? money(compliance.computed.payePayable) : 'Not configured'}</td>
                    </tr>
                    <tr>
                      <td>Output VAT</td>
                      <td><span className="badge badge-info">GL balance</span></td>
                      <td>{compliance.computed.outputVatPayable !== null ? money(compliance.computed.outputVatPayable) : 'Not configured'}</td>
                    </tr>
                    <tr>
                      <td>Input VAT</td>
                      <td><span className="badge badge-info">GL balance</span></td>
                      <td>{compliance.computed.inputVatRecoverable !== null ? money(compliance.computed.inputVatRecoverable) : 'Not configured'}</td>
                    </tr>
                    {compliance.manual.map((item) => (
                      <tr key={item.id}>
                        <td>{item.label}</td>
                        <td>
                          <select
                            value={item.status}
                            onChange={(e) => updateComplianceStatus(item.id, e.target.value)}
                            className={`badge-select badge-select-${item.status}`}
                            style={{ padding: '2px 6px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)' }}
                          >
                            <option value="unknown">Unknown</option>
                            <option value="valid">Valid</option>
                            <option value="expiring_soon">Expiring soon</option>
                            <option value="expired">Expired</option>
                            <option value="not_applicable">N/A</option>
                          </select>
                        </td>
                        <td>{item.expiry_date ? `Expires ${new Date(item.expiry_date).toLocaleDateString()}` : (item.reference_no || '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {can('system.compliance.manage') && (
            <div className="card">
              <div className="card-header">
                <h2>Compliance Calendar</h2>
                <Link to="/compliance-calendar" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Calendar</Link>
              </div>
              {!calendarSummary ? (
                <p className="dashboard-empty-note">Loading…</p>
              ) : calendarSummary.totalActive === 0 ? (
                <p className="dashboard-empty-note">No scheduled filings set up yet — Tax Filings, EPA, FDA, SSNIT, and more.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                    <span style={{ fontSize: 13 }}><strong style={{ color: calendarSummary.overdueCount > 0 ? 'var(--color-error)' : undefined }}>{calendarSummary.overdueCount}</strong> overdue</span>
                    <span style={{ fontSize: 13 }}><strong>{calendarSummary.dueWithin30DaysCount}</strong> due within 30 days</span>
                  </div>
                  <table>
                    <thead><tr><th>Filing</th><th>Category</th><th>Next Due</th></tr></thead>
                    <tbody>
                      {(() => {
                        // Every overdue item, in full — the same items a
                        // person would see filtering the real Compliance
                        // Calendar page down to "overdue" — plus a few
                        // upcoming ones for context. Not simply the first
                        // few rows sorted by date: that would silently
                        // drop overdue items from view once there were
                        // more than fit in a short slice, even though
                        // every one of them still exists and still needs
                        // attention.
                        const overdueItems = calendarSummary.overdue || [];
                        const overdueIds = new Set(overdueItems.map((i) => i.id));
                        const upcomingContext = (calendarSummary.upcoming || []).filter((i) => !overdueIds.has(i.id)).slice(0, 3);
                        return [...overdueItems, ...upcomingContext];
                      })().map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td>{formatComplianceCategory(item.category)}</td>
                          <td style={item.is_overdue ? { color: 'var(--color-error)', fontWeight: 600 } : undefined}>
                            {new Date(item.next_due_date).toLocaleDateString()}{item.is_overdue ? ' (overdue)' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          <div className="chart-grid dashboard-secondary-row">
            <div className="card">
              <h2>Recent activity</h2>
              {recentActivity.length === 0 ? (
                <p className="dashboard-empty-note">{can('system.audit.view') ? 'No recent activity.' : 'You need audit trail access to see this.'}</p>
              ) : (
                <ul className="feed-list">
                  {recentActivity.map((a) => (
                    <li key={a.id}>
                      <span className="feed-list-title">{a.first_name} {a.last_name}</span>
                      <span className="feed-list-detail">{a.activity}</span>
                      <span className="feed-list-time">{new Date(a.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2>Pending approvals</h2>
              {pendingApprovals === null ? (
                <p className="dashboard-empty-note">Loading…</p>
              ) : pendingApprovals.length === 0 ? (
                <p className="dashboard-empty-note">Nothing waiting on you right now.</p>
              ) : (
                <ul className="feed-list">
                  {pendingApprovals.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      <Link to={a.entity_link || '/workflows'} className="feed-list-title">{a.entity_label}</Link>
                      <span className="feed-list-detail">{a.workflow_name} · submitted by {a.submitted_by_first_name} {a.submitted_by_last_name}</span>
                      <span className="feed-list-time">{new Date(a.created_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2>Alerts</h2>
              {alerts.length === 0 ? (
                <p className="dashboard-empty-note">No alerts — everything looks healthy.</p>
              ) : (
                <ul className="alert-list">
                  {alerts.map((al, i) => (
                    <li key={i} className="alert-item-row">
                      <Link to={al.to} className="alert-item">
                        <IconAlertTriangle />
                        <span>{al.text}</span>
                      </Link>
                      <AlertExplainer issueText={al.text} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Business Intelligence</h2>
              <Link to="/business-intelligence" className="btn btn-secondary btn-sm" style={{ width: 'auto' }}>Open Report Builder</Link>
            </div>
            {savedReports === null ? (
              <p className="dashboard-empty-note">Loading…</p>
            ) : savedReports.length === 0 ? (
              <p className="dashboard-empty-note">No saved reports yet — build one in the Report Builder and it'll show up here too.</p>
            ) : (
              <ul className="feed-list">
                {savedReports.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="feed-list-title"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                      onClick={() => runSavedReport(r.id)}
                    >
                      {r.name} {expandedReportId === r.id ? '▲' : '▶'}
                    </button>
                    <span className="feed-list-detail">Data source: {r.definition.dataSource}</span>
                    {expandedReportId === r.id && (
                      <div style={{ marginTop: 8 }}>
                        {reportRunning && <p className="dashboard-empty-note">Running…</p>}
                        {reportRunError && <p className="dashboard-empty-note">{reportRunError}</p>}
                        {reportRunResult && (
                          reportRunResult.rows.length === 0 ? (
                            <p className="dashboard-empty-note">No rows matched this report.</p>
                          ) : (
                            <table>
                              <thead>
                                <tr>{reportRunResult.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                              </thead>
                              <tbody>
                                {reportRunResult.rows.slice(0, 10).map((row, i) => (
                                  <tr key={i}>
                                    {reportRunResult.columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>Quick actions</h2>
            <div className="quick-actions-row">
              {QUICK_ACTIONS.filter((a) => !a.permission || can(a.permission)).map((a) => (
                <Link key={a.to + a.label} to={a.to} className="btn btn-secondary quick-action-btn">
                  + {a.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <aside className="dashboard-insights">
          <div className="card insights-card">
            <h2>Approvals</h2>
            <div className="insights-count">
              <AnimatedNumber value={pendingApprovals ? pendingApprovals.length : 0} />
            </div>
            <p className="dashboard-empty-note">waiting on your decision</p>
            <Link to="/workflows" className="btn btn-secondary btn-sm" style={{ width: '100%' }}>Review</Link>
          </div>

          <div className="card insights-card" style={{ textAlign: 'left' }}>
            <h2>Tasks</h2>
            {myTasks === null ? (
              <p className="dashboard-empty-note">Loading…</p>
            ) : myTasks.length === 0 ? (
              <p className="dashboard-empty-note">No open tasks assigned to you.</p>
            ) : (
              <ul className="feed-list">
                {myTasks.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <span className="feed-list-title">{t.title}</span>
                    <span className="feed-list-detail">
                      {t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString()}` : 'No due date'} · {t.priority} priority
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/tasks" className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 12 }}>
              {myTasks && myTasks.length > 0 ? `View all ${myTasks.length}` : 'Open Tasks'}
            </Link>
          </div>

          {can('hr.leave.approve') && (
            <div className="card insights-card">
              <h2>Leave approvals</h2>
              <div className="insights-count">
                <AnimatedNumber value={pendingLeave ? pendingLeave.length : 0} />
              </div>
              <p className="dashboard-empty-note">leave requests pending review</p>
              <Link to="/hr/payroll" className="btn btn-secondary btn-sm" style={{ width: '100%' }}>Open HR &amp; Payroll</Link>
            </div>
          )}

          <div className="card insights-card">
            <h2>Calendar</h2>
            <MiniCalendar />
            {upcomingEvents !== null && (
              <div className="due-soon-list">
                <div className="due-soon-title">Upcoming events</div>
                {upcomingEvents.length === 0 ? (
                  <p className="dashboard-empty-note">Nothing on your calendar this week.</p>
                ) : (
                  <ul className="feed-list">
                    {upcomingEvents.map((ev) => (
                      <li key={ev.id}>
                        <span className="feed-list-title">{ev.title}</span>
                        <span className="feed-list-time">
                          <IconClock /> {new Date(ev.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {!ev.all_day && ` \u00b7 ${new Date(ev.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/calendar" className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 10 }}>Open Calendar</Link>
              </div>
            )}
            {can('sales.invoices.manage') && dueSoon !== null && (
              <div className="due-soon-list">
                <div className="due-soon-title">Due within 7 days</div>
                {dueSoon.length === 0 ? (
                  <p className="dashboard-empty-note">Nothing due soon.</p>
                ) : (
                  <ul className="feed-list">
                    {dueSoon.map((inv) => (
                      <li key={inv.id}>
                        <span className="feed-list-title">{inv.customer_name}</span>
                        <span className="feed-list-detail">{money(inv.balance_due)}</span>
                        <span className="feed-list-time"><IconClock /> {new Date(inv.due_date).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, formatMoney } from '../components/charts';
import ExportMenu from '../components/ExportMenu';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const money = (n) => `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

// A trend chip: color communicates direction, no motion — consistent with
// the rest of the app since animations were deliberately removed elsewhere.
// "Up" isn't always good (e.g. rising expenses), so callers pass whether a
// rise is favorable for that particular line.
export function TrendChip({ change, pctChange, favorableDirection = 'up' }) {
  if (change === undefined || change === null || pctChange === null) {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>;
  }
  const rose = change > 0;
  const isFavorable = favorableDirection === 'up' ? rose : !rose;
  const color = Math.abs(change) < 0.005 ? 'var(--color-text-muted)' : (isFavorable ? 'var(--color-success)' : 'var(--color-danger)');
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '—';
  return (
    <span style={{ color, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
      {arrow} {Math.abs(pctChange).toFixed(1)}%
    </span>
  );
}

// Sections of the full 20-part Management Accounts pack that already exist
// as their own dedicated, fully-built pages elsewhere in the app — rather
// than rebuild Budget vs Actual, AR Aging, Inventory Analysis, etc. a second
// time on this page (and risk them drifting from the real ones), this links
// straight to each. Every entry's `permission` is gated the same way the
// destination route itself is gated, so nothing appears as a dead link.
const PACK_SECTIONS = [
  { label: 'Budget vs Actual Analysis', to: '/accounting/budgets', permission: 'accounting.budgets.manage', blurb: 'Section 6 of the template' },
  { label: 'Departmental Performance', to: '/reports/departmental', permission: 'hr.reports.view', blurb: 'Section 9' },
  { label: 'Accounts Receivable Analysis', to: '/sales/reports', permission: 'sales.reports.view', blurb: 'Sections 12–13 (aging, top debtors)' },
  { label: 'Inventory Analysis', to: '/inventory/reports', permission: 'inventory.reports.view', blurb: 'Section 14' },
  { label: 'Fixed Assets Schedule', to: '/assets', permission: 'assets.register.manage', blurb: 'Section 15' },
  { label: 'Bank Reconciliation Summary', to: '/accounting/banking', permission: 'accounting.banking.manage', blurb: 'Section 16' },
  { label: 'Tax Position (VAT/NHIL/GETFund, PAYE)', to: '/reports/tax', permission: 'accounting.tax_reports.view', blurb: 'Appendix D — tax computation' },
];

export default function ManagementAccountReport() {
  const { hasPermission } = useAuth();
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  const [commentary, setCommentary] = useState('');
  const [commentaryMeta, setCommentaryMeta] = useState(null);
  const [commentaryDirty, setCommentaryDirty] = useState(false);
  const [savingCommentary, setSavingCommentary] = useState(false);

  function load() {
    api.get(`/financial-statements/management-accounts?from=${from}&to=${to}`).then(({ data }) => setData(data));
    api.get(`/financial-statements/management-accounts/commentary?from=${from}&to=${to}`).then(({ data }) => {
      setCommentary(data.commentary);
      setCommentaryMeta(data.updatedAt ? { updatedAt: data.updatedAt, updatedBy: data.updatedBy } : null);
      setCommentaryDirty(false);
    });
  }

  useEffect(load, [from, to]);

  async function saveCommentary() {
    setSavingCommentary(true);
    try {
      const { data } = await api.put('/financial-statements/management-accounts/commentary', { from, to, commentary });
      setCommentaryMeta({ updatedAt: data.updatedAt, updatedBy: null });
      setCommentaryDirty(false);
    } finally {
      setSavingCommentary(false);
    }
  }

  return (
    <DashboardLayout title="Management Account Report">
      <div className="card">
        <div className="statement-header">
          <h2 className="statement-title">Management Account Report</h2>
          <div className="statement-actions">
            <DateRangeFilter
              mode={rangeMode}
              onModeChange={setRangeMode}
              customFrom={customFrom}
              customTo={customTo}
              onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
            />
            {data && <ExportMenu path="/financial-statements/management-accounts" params={{ from, to }} filename={`management-accounts-${from}-to-${to}`} />}
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
          A single internal view combining the P&amp;L, balance sheet snapshot, cash position, and key ratios — compared against the same period last year ({data ? `${data.priorFrom} to ${data.priorTo}` : '…'}). Every figure is computed the exact same way as its dedicated page, so nothing here can drift from Financial Statements or Financial Ratios.
        </p>

        {!data ? <p>Loading...</p> : (
          <>
            {/* ---- 1. Executive Summary ---- */}
            <div className="card" style={{ marginTop: 0 }}>
              <h2>Executive Summary</h2>
              <table className="statement-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Item</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Current Period</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Previous Year</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Revenue', data.comparison.revenue],
                    ['Gross Profit', data.comparison.grossProfit],
                    ['Operating Profit', data.comparison.operatingProfit],
                    ['Net Profit', data.comparison.netIncome],
                    ['Cash Balance', data.comparison.cashAndBank],
                  ].map(([label, c]) => (
                    <tr className="statement-line-row" key={label}>
                      <td>{label}</td>
                      <td className="statement-amount">{money(c.current)}</td>
                      <td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(c.previous)}</td>
                      <td className="statement-amount"><TrendChip change={c.change} pctChange={c.pctChange} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', margin: '20px 0 8px' }}>
                Management Commentary
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 8 }}>
                A short written explanation of the numbers above — revenue performance, cost management, profitability — for whoever reads this report next. Saved per reporting period, and included in the Excel/PDF/Word export.
              </p>
              <textarea
                value={commentary}
                onChange={(e) => { setCommentary(e.target.value); setCommentaryDirty(true); }}
                placeholder="e.g. Revenue grew steadily on stronger retail sales, though gross margin narrowed slightly from higher input costs. Operating expenses stayed in line with budget. Cash position remains healthy going into next quarter…"
                rows={5}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--color-text)', background: 'var(--color-surface)', resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: 'auto' }}
                  onClick={saveCommentary}
                  disabled={!commentaryDirty || savingCommentary}
                >
                  {savingCommentary ? 'Saving...' : 'Save commentary'}
                </button>
                {!commentaryDirty && commentaryMeta?.updatedAt && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Last saved {new Date(commentaryMeta.updatedAt).toLocaleString()}
                    {commentaryMeta.updatedBy ? ` by ${commentaryMeta.updatedBy}` : ''}
                  </span>
                )}
                {commentaryDirty && <span style={{ fontSize: 12, color: 'var(--color-warning-text)' }}>Unsaved changes</span>}
              </div>
            </div>

            {/* ---- 2. Financial Highlights Dashboard ---- */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Net Income</div>
                <div className="kpi-value" style={{ color: data.profitAndLoss.netIncome >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{money(data.profitAndLoss.netIncome)}</div>
                <div className="kpi-footer"><TrendChip change={data.comparison.netIncome.change} pctChange={data.comparison.netIncome.pctChange} /> <span style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>vs last year</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Total Assets</div>
                <div className="kpi-value">{money(data.financialPosition.totalAssets)}</div>
                <div className="kpi-footer"><TrendChip change={data.comparison.totalAssets.change} pctChange={data.comparison.totalAssets.pctChange} /> <span style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>vs last year</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Cash &amp; Bank</div>
                <div className="kpi-value">{money(data.cashAndBank)}</div>
                <div className="kpi-footer"><TrendChip change={data.comparison.cashAndBank.change} pctChange={data.comparison.cashAndBank.pctChange} /> <span style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>vs last year</span></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Current Ratio</div>
                <div className="kpi-value">{data.ratios.currentRatio !== null ? data.ratios.currentRatio.toFixed(2) : '—'}</div>
                <div className="kpi-footer"><span style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>was {data.ratiosPrior.currentRatio !== null ? data.ratiosPrior.currentRatio.toFixed(2) : '—'} last year</span></div>
              </div>
            </div>

            <BarChartWidget
              title="Current period vs. same period last year"
              data={[
                { name: 'Revenue', Current: data.profitAndLoss.totalRevenue, 'Prior Year': data.profitAndLossPrior.totalRevenue },
                { name: 'Gross Profit', Current: data.profitAndLoss.grossProfit, 'Prior Year': data.profitAndLossPrior.grossProfit },
                { name: 'Operating Profit', Current: data.profitAndLoss.operatingProfit, 'Prior Year': data.profitAndLossPrior.operatingProfit },
                { name: 'Net Income', Current: data.profitAndLoss.netIncome, 'Prior Year': data.profitAndLossPrior.netIncome },
              ]}
              bars={[{ key: 'Current', label: 'Current Period' }, { key: 'Prior Year', label: 'Prior Year' }]}
              valueFormatter={(v) => formatMoney(v)}
              height={260}
            />

            {/* ---- 3 & 4. Comparative statements ---- */}
            <div className="chart-grid">
              <div className="card">
                <h2>Comparative Income Statement</h2>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--color-text-muted)' }}>Current</th>
                      <th style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--color-text-muted)' }}>Prior Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="statement-line-row"><td>Revenue</td><td className="statement-amount">{money(data.profitAndLoss.totalRevenue)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.totalRevenue)}</td></tr>
                    <tr className="statement-line-row"><td>Cost of Sales</td><td className="statement-amount">{money(data.profitAndLoss.totalCogs)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.totalCogs)}</td></tr>
                    <tr className="statement-total-row"><td>Gross Profit</td><td className="statement-amount">{money(data.profitAndLoss.grossProfit)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.grossProfit)}</td></tr>
                    <tr className="statement-line-row"><td>Operating Expenses</td><td className="statement-amount">{money(data.profitAndLoss.totalOperatingExpense)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.totalOperatingExpense)}</td></tr>
                    <tr className="statement-total-row"><td>Operating Profit</td><td className="statement-amount">{money(data.profitAndLoss.operatingProfit)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.operatingProfit)}</td></tr>
                    <tr className="statement-line-row"><td>Finance Costs</td><td className="statement-amount">{money(data.profitAndLoss.totalFinanceCosts)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.totalFinanceCosts)}</td></tr>
                    <tr className="statement-line-row"><td>Income Tax Expense</td><td className="statement-amount">{money(data.profitAndLoss.totalTaxExpense)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.totalTaxExpense)}</td></tr>
                    <tr className="statement-grand-total-row"><td>Net Profit</td><td className="statement-amount">{money(data.profitAndLoss.netIncome)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.profitAndLossPrior.netIncome)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h2>Comparative Statement of Financial Position</h2>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--color-text-muted)' }}>Current</th>
                      <th style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--color-text-muted)' }}>Prior Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="statement-line-row"><td>Total Assets</td><td className="statement-amount">{money(data.financialPosition.totalAssets)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.financialPositionPrior.totalAssets)}</td></tr>
                    <tr className="statement-line-row"><td>Total Liabilities</td><td className="statement-amount">{money(data.financialPosition.totalLiabilities)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.financialPositionPrior.totalLiabilities)}</td></tr>
                    <tr className="statement-total-row"><td>Total Equity</td><td className="statement-amount">{money(data.financialPosition.totalEquity)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.financialPositionPrior.totalEquity)}</td></tr>
                    <tr className="statement-line-row"><td>Cash &amp; Bank Position</td><td className="statement-amount">{money(data.cashAndBank)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{money(data.cashAndBankPrior)}</td></tr>
                    <tr className="statement-line-row"><td>Current Ratio</td><td className="statement-amount">{data.ratios.currentRatio !== null ? data.ratios.currentRatio.toFixed(2) : '—'}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{data.ratiosPrior.currentRatio !== null ? data.ratiosPrior.currentRatio.toFixed(2) : '—'}</td></tr>
                    <tr className="statement-line-row"><td>Net Profit Margin</td><td className="statement-amount">{pct(data.ratios.netProfitMargin)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{pct(data.ratiosPrior.netProfitMargin)}</td></tr>
                    <tr className="statement-line-row"><td>Return on Assets</td><td className="statement-amount">{pct(data.ratios.returnOnAssets)}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{pct(data.ratiosPrior.returnOnAssets)}</td></tr>
                    <tr className="statement-line-row"><td>Debt to Equity</td><td className="statement-amount">{data.ratios.debtToEquity !== null ? data.ratios.debtToEquity.toFixed(2) : '—'}</td><td className="statement-amount" style={{ color: 'var(--color-text-muted)' }}>{data.ratiosPrior.debtToEquity !== null ? data.ratiosPrior.debtToEquity.toFixed(2) : '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- Report pack index: the rest of the 20-section template, linked to where each already lives ---- */}
            <div className="card">
              <h2>Rest of the report pack</h2>
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
                A full management accounts pack also covers budget variance, departmental performance, receivables, inventory, fixed assets, bank reconciliation, and tax — each of those already has its own dedicated, fully-built page rather than a second copy living here.
              </p>
              <div className="tile-grid">
                {PACK_SECTIONS.filter((s) => hasPermission(s.permission)).map((s) => (
                  <Link key={s.to} to={s.to} className="tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="tile-label">{s.label}</div>
                    <div className="tile-sub">{s.blurb}</div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, PieChartWidget, KpiGauge, formatMoney } from '../components/charts';
import ExportMenu from '../components/ExportMenu';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const TABS = [
  { key: 'income', label: 'Statement of Profit or Loss' },
  { key: 'balance', label: 'Statement of Financial Position' },
  { key: 'cashflow', label: 'Statement of Cash Flows' },
  { key: 'equity', label: 'Changes in Equity' },
  { key: 'ratios', label: 'Financial Ratios' },
];

export default function FinancialStatements() {
  const [tab, setTab] = useState('income');

  return (
    <DashboardLayout title="Financial Statements">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'income' && <IncomeStatement />}
      {tab === 'balance' && <BalanceSheet />}
      {tab === 'cashflow' && <CashFlowStatement />}
      {tab === 'equity' && <ChangesInEquity />}
      {tab === 'ratios' && <Ratios />}
    </DashboardLayout>
  );
}

const money = (n) => `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function IncomeStatement() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  function load() {
    api.get(`/financial-statements/income-statement?from=${from}&to=${to}`).then(({ data }) => setData(data));
  }

  useEffect(load, [from, to]);

  return (
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">Statement of Profit or Loss <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>(Income Statement)</span></h2>
        <div className="statement-actions">
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          {data && (
            <ExportMenu
              path="/financial-statements/income-statement"
              params={{ from, to }}
              filename={`income-statement-${from}-to-${to}`}
            />
          )}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        IFRS presentation (IAS 1) — expenses classified by function; finance costs and income tax shown as their own lines.
      </p>

      {!data ? <p>Loading...</p> : (
        <>
          <BarChartWidget
            data={[
              { name: 'Revenue', value: data.totals.totalRevenue },
              { name: 'COGS', value: data.totals.totalCogs },
              { name: 'Gross profit', value: data.totals.grossProfit },
              { name: 'Opex', value: data.totals.totalOperatingExpense },
              { name: 'Operating profit', value: data.totals.operatingProfit },
              { name: 'Profit for the period', value: data.totals.netIncome },
            ]}
            bars={[{ key: 'value', label: 'Amount' }]}
            colorByCategory
            valueFormatter={(v) => formatMoney(v)}
            height={260}
          />
          <table className="statement-table">
            <tbody>
              <tr className="statement-subheader-row"><td colSpan={2}>Revenue</td></tr>
              {data.revenue.map((a) => (
                <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
              ))}
              <tr className="statement-total-row"><td>Total Revenue</td><td className="statement-amount">{money(data.totals.totalRevenue)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={2}>Cost of Sales</td></tr>
              {data.cogs.map((a) => (
                <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
              ))}
              <tr className="statement-total-row"><td>Gross Profit</td><td className="statement-amount">{money(data.totals.grossProfit)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={2}>Operating Expenses</td></tr>
              {data.operatingExpense.map((a) => (
                <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
              ))}
              <tr className="statement-total-row"><td>Operating Profit</td><td className="statement-amount">{money(data.totals.operatingProfit)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={2}>Finance Costs</td></tr>
              {data.financeCosts.length === 0
                ? <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>None</td><td className="statement-amount">{money(0)}</td></tr>
                : data.financeCosts.map((a) => (
                  <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
                ))}
              <tr className="statement-total-row"><td>Profit Before Tax</td><td className="statement-amount">{money(data.totals.profitBeforeTax)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={2}>Income Tax Expense</td></tr>
              {data.taxExpense.length === 0
                ? <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>None</td><td className="statement-amount">{money(0)}</td></tr>
                : data.taxExpense.map((a) => (
                  <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
                ))}

              <tr className="statement-grand-total-row">
                <td>Profit for the Period</td>
                <td className="statement-amount" style={{ color: data.totals.netIncome >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{money(data.totals.netIncome)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function BalanceSheet() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  function load() {
    api.get(`/financial-statements/balance-sheet?asOf=${asOf}`).then(({ data }) => setData(data));
  }

  useEffect(load, []);

  return (
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">
          Statement of Financial Position <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>(Balance Sheet)</span>{' '}
          {data && (data.totals.isBalanced ? <span className="badge badge-success">balanced</span> : <span className="badge badge-danger">out of balance</span>)}
        </h2>
        <div className="statement-actions">
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13, alignSelf: 'center' }}>As of</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={load}>Run</button>
          {data && (
            <ExportMenu
              path="/financial-statements/balance-sheet"
              params={{ asOf }}
              filename={`balance-sheet-${asOf}`}
            />
          )}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        IFRS presentation (IAS 1.60-76) — assets and liabilities split into non-current and current.
      </p>

      {!data ? <p>Loading...</p> : (
        <>
          <PieChartWidget
            title="Assets vs. liabilities vs. equity"
            data={[
              { name: 'Assets', value: data.totals.totalAssets, color: '#0B6E4F' },
              { name: 'Liabilities', value: data.totals.totalLiabilities, color: '#B3261E' },
              { name: 'Equity', value: data.totals.totalEquity, color: '#2F9E6E' },
            ]}
            valueFormatter={(v) => formatMoney(v)}
            height={260}
          />
          <table className="statement-table">
            <tbody>
              <tr className="statement-section-row"><td colSpan={2}>Assets</td></tr>
              <tr className="statement-subheader-row"><td colSpan={2}>Non-current Assets</td></tr>
              {data.nonCurrentAssets.length === 0
                ? <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>None</td><td className="statement-amount">{money(0)}</td></tr>
                : data.nonCurrentAssets.map((a) => (
                  <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
                ))}
              <tr className="statement-total-row"><td>Total Non-current Assets</td><td className="statement-amount">{money(data.totals.totalNonCurrentAssets)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={2}>Current Assets</td></tr>
              {data.currentAssets.map((a) => (
                <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
              ))}
              <tr className="statement-total-row"><td>Total Current Assets</td><td className="statement-amount">{money(data.totals.totalCurrentAssets)}</td></tr>
              <tr className="statement-grand-total-row"><td>Total Assets</td><td className="statement-amount">{money(data.totals.totalAssets)}</td></tr>

              <tr className="statement-section-row"><td colSpan={2}>Liabilities</td></tr>
              <tr className="statement-subheader-row"><td colSpan={2}>Non-current Liabilities</td></tr>
              {data.nonCurrentLiabilities.length === 0
                ? <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>None</td><td className="statement-amount">{money(0)}</td></tr>
                : data.nonCurrentLiabilities.map((a) => (
                  <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
                ))}
              <tr className="statement-total-row"><td>Total Non-current Liabilities</td><td className="statement-amount">{money(data.totals.totalNonCurrentLiabilities)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={2}>Current Liabilities</td></tr>
              {data.currentLiabilities.map((a) => (
                <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
              ))}
              <tr className="statement-total-row"><td>Total Current Liabilities</td><td className="statement-amount">{money(data.totals.totalCurrentLiabilities)}</td></tr>
              <tr className="statement-total-row"><td>Total Liabilities</td><td className="statement-amount">{money(data.totals.totalLiabilities)}</td></tr>

              <tr className="statement-section-row"><td colSpan={2}>Equity</td></tr>
              {data.equity.map((a) => (
                <tr className="statement-line-row" key={a.id}><td>{a.account_name}</td><td className="statement-amount">{money(a.balance)}</td></tr>
              ))}
              <tr className="statement-line-row"><td>Current Year Earnings</td><td className="statement-amount">{money(data.currentYearEarnings)}</td></tr>
              <tr className="statement-total-row"><td>Total Equity</td><td className="statement-amount">{money(data.totals.totalEquity)}</td></tr>

              <tr className="statement-grand-total-row">
                <td>Total Liabilities &amp; Equity</td>
                <td className="statement-amount">{money(data.totals.totalLiabilitiesAndEquity)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Ratios() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/financial-statements/ratios').then(({ data }) => setData(data));
  }, []);

  if (!data) return <div className="card"><p>Loading...</p></div>;

  const fmt = (v, suffix = '') => (v === null ? '—' : `${v.toFixed(2)}${suffix}`);
  const pct = (v) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

  const gauges = [
    { label: 'Current Ratio', value: data.currentRatio, display: fmt(data.currentRatio), isNull: data.currentRatio === null, formatter: (v) => v.toFixed(2), min: 0, max: 3, target: 1.5, hint: 'Current assets ÷ current liabilities' },
    { label: 'Quick Ratio', value: data.quickRatio, display: fmt(data.quickRatio), isNull: data.quickRatio === null, formatter: (v) => v.toFixed(2), min: 0, max: 2, target: 1, hint: '(Current assets − inventory) ÷ current liabilities' },
    { label: 'Debt to Equity', value: data.debtToEquity, display: fmt(data.debtToEquity), isNull: data.debtToEquity === null, formatter: (v) => v.toFixed(2), min: 0, max: 3, target: 1, goodDirection: 'down', hint: 'Total liabilities ÷ total equity' },
    { label: 'Net Profit Margin', value: data.netProfitMargin === null ? 0 : data.netProfitMargin * 100, display: pct(data.netProfitMargin), isNull: data.netProfitMargin === null, formatter: (v) => `${v.toFixed(1)}%`, min: 0, max: 40, target: 10, hint: 'Net income ÷ revenue' },
    { label: 'Return on Assets', value: data.returnOnAssets === null ? 0 : data.returnOnAssets * 100, display: pct(data.returnOnAssets), isNull: data.returnOnAssets === null, formatter: (v) => `${v.toFixed(1)}%`, min: 0, max: 30, target: 5, hint: 'Net income ÷ total assets' },
    { label: 'Return on Equity', value: data.returnOnEquity === null ? 0 : data.returnOnEquity * 100, display: pct(data.returnOnEquity), isNull: data.returnOnEquity === null, formatter: (v) => `${v.toFixed(1)}%`, min: 0, max: 40, target: 10, hint: 'Net income ÷ total equity' },
  ];

  return (
    <>
      <div className="gauge-grid">
        {gauges.map((g) => (
          <KpiGauge key={g.label} {...g} />
        ))}
      </div>
      <div className="card">
        <h2>Underlying figures</h2>
        <table>
          <tbody>
            {Object.entries(data.raw).map(([k, v]) => (
              <tr key={k}><td style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</td><td style={{ textAlign: 'right' }}>{money(v)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CashFlowStatement() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/financial-statements/cash-flow?from=${from}&to=${to}`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [from, to]);

  return (
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">
          Statement of Cash Flows {data && (data.isReconciled ? <span className="badge badge-success">reconciled</span> : <span className="badge badge-danger">discrepancy</span>)}
        </h2>
        <div className="statement-actions">
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          {data && <ExportMenu path="/financial-statements/cash-flow" params={{ from, to }} filename={`cash-flow-statement-${from}-to-${to}`} />}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Indirect method (IAS 7) — starts from net income, adjusts for non-cash items and working capital movement. The "reconciled" badge confirms the computed net change in cash matches the actual change in bank + petty cash balances over the period.
      </p>

      {!data ? <p>Loading...</p> : (
        <table className="statement-table">
          <tbody>
            <tr className="statement-section-row"><td colSpan={2}>Operating Activities</td></tr>
            <tr className="statement-line-row"><td>Net Income for the Period</td><td className="statement-amount">{money(data.operating.netIncome)}</td></tr>
            <tr className="statement-line-row"><td>Add: Depreciation</td><td className="statement-amount">{money(data.operating.depreciation)}</td></tr>
            {data.operating.workingCapitalChanges.map((m, i) => (
              <tr className="statement-line-row" key={i}><td>{m.label}</td><td className="statement-amount">{money(m.amount)}</td></tr>
            ))}
            <tr className="statement-total-row"><td>Net Cash from Operating Activities</td><td className="statement-amount">{money(data.operating.netCashFromOperations)}</td></tr>

            <tr className="statement-section-row"><td colSpan={2}>Investing Activities</td></tr>
            <tr className="statement-line-row"><td>Purchase of Fixed Assets</td><td className="statement-amount">{money(-data.investing.capex)}</td></tr>
            <tr className="statement-line-row"><td>Proceeds from Disposal of Assets</td><td className="statement-amount">{money(data.investing.disposalProceeds)}</td></tr>
            <tr className="statement-total-row"><td>Net Cash from Investing Activities</td><td className="statement-amount">{money(data.investing.netCashFromInvesting)}</td></tr>

            <tr className="statement-section-row"><td colSpan={2}>Financing Activities</td></tr>
            <tr className="statement-line-row"><td>Net Movement in Long-term Loans</td><td className="statement-amount">{money(data.financing.netLoanChange)}</td></tr>
            <tr className="statement-line-row"><td>Net Owner Contributions/(Drawings)</td><td className="statement-amount">{money(data.financing.netEquityContribution)}</td></tr>
            <tr className="statement-total-row"><td>Net Cash from Financing Activities</td><td className="statement-amount">{money(data.financing.netCashFromFinancing)}</td></tr>

            <tr className="statement-total-row"><td>Net Increase/(Decrease) in Cash</td><td className="statement-amount">{money(data.netChangeInCash)}</td></tr>
            <tr className="statement-line-row"><td>Cash at Beginning of Period</td><td className="statement-amount">{money(data.openingCash)}</td></tr>
            <tr className="statement-grand-total-row"><td>Cash at End of Period</td><td className="statement-amount">{money(data.closingCash)}</td></tr>
            {!data.isReconciled && (
              <tr className="statement-line-row"><td style={{ color: 'var(--color-danger)' }}>Unreconciled difference</td><td className="statement-amount" style={{ color: 'var(--color-danger)' }}>{money(data.reconcilingDifference)}</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ChangesInEquity() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/financial-statements/changes-in-equity?from=${from}&to=${to}`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [from, to]);

  return (
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">Statement of Changes in Equity</h2>
        <div className="statement-actions">
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          {data && <ExportMenu path="/financial-statements/changes-in-equity" params={{ from, to }} filename={`statement-of-changes-in-equity-${from}-to-${to}`} />}
        </div>
      </div>
      {data && data.financialYearStatus === null && (
        <p style={{ fontSize: 12.5, color: 'var(--color-warning-text)' }}>No financial year covers this date range yet — set one up under Settings → Financial Years so current-year profit shows correctly here and on the Balance Sheet.</p>
      )}

      {!data ? <p>Loading...</p> : (
        <table className="statement-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}></th>
              {data.accounts.map((a) => (
                <th key={a.accountId} style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{a.name}</th>
              ))}
              <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="statement-line-row">
              <td>Opening Balance</td>
              {data.accounts.map((a) => <td key={a.accountId} className="statement-amount">{money(a.opening)}</td>)}
              <td className="statement-amount">{money(data.totals.opening)}</td>
            </tr>
            <tr className="statement-line-row">
              <td>Profit for the Year Transferred</td>
              {data.accounts.map((a) => <td key={a.accountId} className="statement-amount">{money(a.profitTransferred)}</td>)}
              <td className="statement-amount">{money(data.totals.profitTransferred)}</td>
            </tr>
            <tr className="statement-line-row">
              <td>Revaluation Surplus Movement</td>
              {data.accounts.map((a) => <td key={a.accountId} className="statement-amount">{money(a.revaluation)}</td>)}
              <td className="statement-amount">{money(data.totals.revaluation)}</td>
            </tr>
            <tr className="statement-line-row">
              <td>Other Movements (Contributions/Drawings)</td>
              {data.accounts.map((a) => <td key={a.accountId} className="statement-amount">{money(a.otherMovements)}</td>)}
              <td className="statement-amount">{money(data.totals.otherMovements)}</td>
            </tr>
            <tr className="statement-line-row">
              <td>Current Year Earnings (Unappropriated)</td>
              {data.accounts.map((a) => <td key={a.accountId} className="statement-amount">{money(a.unappropriated)}</td>)}
              <td className="statement-amount">{money(data.totals.unappropriated)}</td>
            </tr>
            <tr className="statement-grand-total-row">
              <td>Closing Balance</td>
              {data.accounts.map((a) => <td key={a.accountId} className="statement-amount">{money(a.closing)}</td>)}
              <td className="statement-amount">{money(data.totals.closing)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

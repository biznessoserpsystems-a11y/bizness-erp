import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import ExportMenu from '../components/ExportMenu';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const TABS = [
  { key: 'vat', label: 'VAT Summary' },
  { key: 'paye', label: 'PAYE Summary' },
];

export default function TaxReports() {
  const [tab, setTab] = useState('vat');

  return (
    <DashboardLayout title="Tax Reports">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'vat' && <VatSummary />}
      {tab === 'paye' && <PayeSummary />}
    </DashboardLayout>
  );
}

const money = (n) => `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function VatSummary() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  function load() {
    api.get(`/tax-reports/vat-summary?from=${from}&to=${to}`).then(({ data }) => setData(data));
  }

  useEffect(load, [from, to]);

  return (
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">VAT, NHIL &amp; GETFund Summary</h2>
        <div className="statement-actions">
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          {data && <ExportMenu path="/tax-reports/vat-summary" params={{ from, to }} filename={`vat-summary-${from}-to-${to}`} />}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Under the VAT Act, 2025 (Act 1151), effective 1 January 2026, VAT (15%), NHIL (2.5%), and GETFund Levy (2.5%) are all calculated on the same base — a combined 20% — and NHIL/GETFund paid on purchases are now creditable input tax, just like VAT.
      </p>

      {!data ? <p>Loading...</p> : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Output Tax (charged on sales)</div>
              <div className="kpi-value">{money(data.totals.totalOutputVat)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Input Tax (paid on purchases)</div>
              <div className="kpi-value">{money(data.totals.totalInputVat)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">{data.totals.netVatPayable >= 0 ? 'Net Payable to GRA' : 'Net Credit'}</div>
              <div className="kpi-value">{money(Math.abs(data.totals.netVatPayable))}</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 0 }}>
            <h2>Net position by component</h2>
            <table>
              <thead><tr><th>Component</th><th>Rate</th><th>Output</th><th>Input</th><th>Net</th></tr></thead>
              <tbody>
                <tr>
                  <td>VAT</td><td>15%</td>
                  <td>{money(data.totals.outputComponents.vat)}</td>
                  <td>{money(data.totals.inputComponents.vat)}</td>
                  <td>{money(data.totals.netComponents.vat)}</td>
                </tr>
                <tr>
                  <td>NHIL</td><td>2.5%</td>
                  <td>{money(data.totals.outputComponents.nhil)}</td>
                  <td>{money(data.totals.inputComponents.nhil)}</td>
                  <td>{money(data.totals.netComponents.nhil)}</td>
                </tr>
                <tr>
                  <td>GETFund Levy</td><td>2.5%</td>
                  <td>{money(data.totals.outputComponents.getfund)}</td>
                  <td>{money(data.totals.inputComponents.getfund)}</td>
                  <td>{money(data.totals.netComponents.getfund)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 8, marginBottom: 0 }}>
              Components are computed from each document's tax total, split by the fixed statutory ratio (15 : 2.5 : 2.5) — exact for tax charged at the standard combined 20% rate.
            </p>
          </div>

          <table className="statement-table">
            <tbody>
              <tr className="statement-section-row"><td colSpan={3}>Output Tax — Sales Invoices</td></tr>
              <tr className="statement-subheader-row"><td>Invoice #</td><td>Customer</td><td style={{ textAlign: 'right' }}>Tax</td></tr>
              {data.output.map((r) => (
                <tr className="statement-line-row" key={r.doc_no}><td>{r.doc_no}</td><td>{r.party_name}</td><td className="statement-amount">{money(r.tax_amount)}</td></tr>
              ))}
              {data.output.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No sales invoices in range.</td></tr>}
              <tr className="statement-total-row"><td colSpan={2}>Total Output Tax</td><td className="statement-amount">{money(data.totals.totalOutputVat)}</td></tr>

              <tr className="statement-section-row"><td colSpan={3}>Input Tax — Purchase Invoices</td></tr>
              <tr className="statement-subheader-row"><td>Invoice #</td><td>Supplier</td><td style={{ textAlign: 'right' }}>Tax</td></tr>
              {data.input.map((r) => (
                <tr className="statement-line-row" key={r.doc_no}><td>{r.doc_no}</td><td>{r.party_name}</td><td className="statement-amount">{money(r.tax_amount)}</td></tr>
              ))}
              {data.input.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No purchase invoices in range.</td></tr>}
              <tr className="statement-total-row"><td colSpan={2}>Total Input Tax</td><td className="statement-amount">{money(data.totals.totalInputVat)}</td></tr>

              <tr className="statement-grand-total-row">
                <td colSpan={2}>{data.totals.netVatPayable >= 0 ? 'Net Payable to GRA' : 'Net Credit (carried forward)'}</td>
                <td className="statement-amount">{money(Math.abs(data.totals.netVatPayable))}</td>
              </tr>
            </tbody>
          </table>

          {data.filingNote && (
            <div className="card" style={{ background: 'var(--color-bg)', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              {data.filingNote}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PayeSummary() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  function load() {
    api.get(`/tax-reports/paye-summary?from=${from}&to=${to}`).then(({ data }) => setData(data));
  }

  useEffect(load, [from, to]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>PAYE & Statutory Deductions Summary</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DateRangeFilter
            mode={rangeMode}
            onModeChange={setRangeMode}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          {data && <ExportMenu path="/tax-reports/paye-summary" params={{ from, to }} filename={`paye-summary-${from}-to-${to}`} />}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        PAYE withheld from employees by payroll run. SSNIT employee contributions are shown alongside since they're filed together in practice.
      </p>

      {!data ? <p>Loading...</p> : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total PAYE withheld</div>
              <div className="kpi-value">{money(data.totals.totalPaye)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total SSNIT (employee)</div>
              <div className="kpi-value">{money(data.totals.totalSsnitEmployee)}</div>
            </div>
          </div>

          <table>
            <thead><tr><th>Period</th><th>Status</th><th>Gross Pay</th><th>PAYE</th><th>SSNIT (Employee)</th></tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.payroll_run_id}>
                  <td>{r.period_year}-{String(r.period_month).padStart(2, '0')}</td>
                  <td><span className={`badge ${r.status === 'paid' ? 'badge-success' : 'badge-neutral'}`}>{r.status}</span></td>
                  <td>{money(r.total_gross)}</td>
                  <td>{money(r.total_paye)}</td>
                  <td>{money(r.total_ssnit_employee)}</td>
                </tr>
              ))}
              {data.runs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No payroll runs in range.</td></tr>}
            </tbody>
          </table>

          {data.filingNote && (
            <div className="card" style={{ background: 'var(--color-bg)', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              {data.filingNote}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, formatMoney } from '../components/charts';

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [vsActual, setVsActual] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/budgets'), api.get('/financial-years'), api.get('/chart-of-accounts')])
      .then(([b, fy, a]) => {
        setBudgets(b.data);
        setFinancialYears(fy.data);
        setAccounts(a.data.filter((acc) => ['revenue', 'expense'].includes(acc.account_type)));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openVsActual(id) {
    const { data } = await api.get(`/budgets/${id}/vs-actual`);
    setVsActual(data);
  }

  async function approve(id) {
    await api.patch(`/budgets/${id}/status`, { status: 'approved' });
    load();
  }

  if (vsActual) {
    const byAccount = Object.values(
      vsActual.lines.reduce((acc, l) => {
        const key = l.account_name;
        acc[key] = acc[key] || { name: key, Budgeted: 0, Actual: 0 };
        acc[key].Budgeted += Number(l.budgeted_amount);
        acc[key].Actual += Number(l.actual_amount);
        return acc;
      }, {})
    );

    return (
      <DashboardLayout title={`Budget vs Actual — ${vsActual.budget.name}`}>
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => setVsActual(null)}>← Back to budgets</button>
        <BarChartWidget
          title="Budgeted vs. actual by account"
          data={byAccount}
          bars={[{ key: 'Budgeted', label: 'Budgeted', color: '#2B6CB0' }, { key: 'Actual', label: 'Actual', color: '#0B6E4F' }]}
          valueFormatter={(v) => formatMoney(v)}
        />
        <div className="card">
          <h2>Budget vs actual</h2>
          <table>
            <thead><tr><th>Period</th><th>Account</th><th>Budgeted</th><th>Actual</th><th>Variance</th></tr></thead>
            <tbody>
              {vsActual.lines.map((l) => {
                // Unlike ModuleBudget.jsx (always scoped to one account
                // type per page), this view genuinely mixes revenue and
                // expense lines together — accounts is filtered to both
                // types above. A single page-wide "higher is better"
                // direction would be wrong for whichever type it didn't
                // match, so each line's own account_type decides its own
                // direction: exceeding a revenue target is good news,
                // exceeding an expense budget is overspending.
                const higherIsBetterForLine = l.account_type === 'revenue';
                const isGood = Number(l.variance) === 0
                  ? null
                  : (higherIsBetterForLine ? Number(l.variance) > 0 : Number(l.variance) < 0);
                return (
                <tr key={l.id}>
                  <td>{l.period_name}</td>
                  <td>{l.account_code} — {l.account_name}</td>
                  <td>GHS {Number(l.budgeted_amount).toFixed(2)}</td>
                  <td>GHS {Number(l.actual_amount).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${isGood === null ? 'badge-neutral' : isGood ? 'badge-success' : 'badge-danger'}`}>
                      {Number(l.variance) > 0 ? '+' : ''}{Number(l.variance).toFixed(2)}
                    </span>
                  </td>
                </tr>
                );
              })}
              {vsActual.lines.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No budget lines.</td></tr>}
            </tbody>
          </table>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Budgets" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Budgets' }]}>
      <div className="card">
        <div className="card-header">
          <h2>Budgets</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New budget</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Name</th><th>Financial year</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.financial_year_name}</td>
                  <td><span className={`badge ${b.status === 'approved' ? 'badge-success' : 'badge-neutral'}`}>{b.status}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openVsActual(b.id)}>Vs actual</button>{' '}
                    {b.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => approve(b.id)}>Approve</button>}
                  </td>
                </tr>
              ))}
              {budgets.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No budgets yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <BudgetModal
          financialYears={financialYears}
          accounts={accounts}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function BudgetModal({ financialYears, accounts, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [financialYearId, setFinancialYearId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [lines, setLines] = useState([{ accountId: '', fiscalPeriodId: '', budgetedAmount: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function selectFy(id) {
    setFinancialYearId(id);
    const fy = financialYears.find((f) => f.id === id);
    setPeriods(fy?.periods || []);
  }

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/budgets', {
        name, financialYearId,
        lines: lines.filter((l) => l.accountId && l.fiscalPeriodId).map((l) => ({
          accountId: l.accountId, fiscalPeriodId: l.fiscalPeriodId, budgetedAmount: Number(l.budgetedAmount) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create budget');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <h2>New budget</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Financial year</label>
            <select value={financialYearId} onChange={(e) => selectFy(e.target.value)} required>
              <option value="">Select</option>
              {financialYears.map((fy) => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
            </select>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Budget lines</label>
          <table style={{ marginBottom: 8 }}>
            <thead><tr><th>Account</th><th>Period</th><th style={{ width: 110 }}>Amount</th></tr></thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx}>
                  <td>
                    <select value={line.accountId} onChange={(e) => updateLine(idx, 'accountId', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                      <option value="">Select</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={line.fiscalPeriodId} onChange={(e) => updateLine(idx, 'fiscalPeriodId', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} disabled={!periods.length}>
                      <option value="">Select</option>
                      {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" step="0.01" value={line.budgetedAmount} onChange={(e) => updateLine(idx, 'budgetedAmount', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((p) => [...p, { accountId: '', fiscalPeriodId: '', budgetedAmount: '' }])} style={{ marginBottom: 16 }}>+ Add line</button>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create budget'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, formatMoney } from '../components/charts';

const money = (n) => `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

/**
 * Shared by ProcurementBudget.jsx and SalesBudget.jsx — both are scoped
 * read/write views onto the exact same budgets/budget_lines tables
 * Accounting & Finance's own Budgets page manages, filtered to the accounts
 * relevant to that module (Cost of Sales for Procurement, Revenue for
 * Sales). Since it's literally the same rows, not a second calculation,
 * these can never fail to reconcile with the company-wide budget — there's
 * only one number for any given account/period, however many pages show it.
 *
 * variance is always actual − budgeted (see budgetController.js), but
 * whether a positive variance is good or bad depends entirely on which
 * kind of account is being shown. Overspending on Cost of Sales is bad
 * (actual > budgeted, and higher-than-planned expense is the wrong
 * direction) — but exceeding a revenue target is the opposite: actual >
 * budgeted there is good news, not a warning. higherIsBetter lets each
 * caller say which direction is actually favorable for its own accounts,
 * defaulting to the expense-style reading Procurement already relied on.
 */
export default function ModuleBudget({ title, scopeNote, accountFilter, higherIsBetter = false }) {
  const [budgets, setBudgets] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [detail, setDetail] = useState(null);
  const [financialYears, setFinancialYears] = useState([]);
  const [error, setError] = useState('');
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({ accountId: '', fiscalPeriodId: '', budgetedAmount: '' });
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    Promise.all([api.get('/budgets'), api.get('/chart-of-accounts'), api.get('/financial-years')]).then(([b, a, fy]) => {
      setBudgets(b.data);
      setAccounts(a.data.filter(accountFilter));
      setFinancialYears(fy.data);
      if (b.data.length > 0) setSelectedBudgetId(b.data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDetail(id) {
    if (!id) { setDetail(null); return; }
    api.get(`/budgets/${id}/vs-actual`).then(({ data }) => setDetail(data)).catch(() => setDetail(null));
  }

  useEffect(() => { loadDetail(selectedBudgetId); }, [selectedBudgetId]);

  const scopedLines = detail ? detail.lines.filter((l) => accountFilter({ account_type: l.account_type, account_subtype: l.account_subtype })) : [];
  const totalBudgeted = scopedLines.reduce((s, l) => s + Number(l.budgeted_amount), 0);
  const totalActual = scopedLines.reduce((s, l) => s + Number(l.actual_amount), 0);

  const selectedFy = selectedBudgetId ? financialYears.find((f) => f.id === budgets?.find((b) => b.id === selectedBudgetId)?.financial_year_id) : null;
  const periods = selectedFy?.periods || [];

  async function saveEdit(lineId) {
    setError('');
    try {
      await api.patch(`/budgets/${selectedBudgetId}/lines/${lineId}`, { budgetedAmount: Number(editValue) || 0 });
      setEditingId(null);
      loadDetail(selectedBudgetId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  async function submitNewLine(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/budgets/${selectedBudgetId}/lines`, {
        accountId: newLine.accountId, fiscalPeriodId: newLine.fiscalPeriodId, budgetedAmount: Number(newLine.budgetedAmount) || 0,
      });
      setNewLine({ accountId: '', fiscalPeriodId: '', budgetedAmount: '' });
      setAddingLine(false);
      loadDetail(selectedBudgetId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add line');
    }
  }

  return (
    <DashboardLayout title={title}>
      <div className="card">
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4 }}>
          {scopeNote} These are the exact same figures shown under Accounting &amp; Finance → Budgets — editing here changes the one shared company budget, it doesn't create a separate number.
        </p>

        {budgets === null ? <p>Loading...</p> : budgets.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            No company budget exists yet. Ask an admin to create one under Accounting &amp; Finance → Budgets, then come back here to manage this module's lines.
          </p>
        ) : (
          <>
            <div className="form-group" style={{ maxWidth: 320 }}>
              <label>Budget</label>
              <select value={selectedBudgetId} onChange={(e) => setSelectedBudgetId(e.target.value)}>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.financial_year_name}) — {b.status}</option>
                ))}
              </select>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {detail && (
              <>
                <div className="kpi-grid" style={{ marginBottom: 16 }}>
                  <div className="kpi-card">
                    <div className="kpi-label">Total budgeted</div>
                    <div className="kpi-value">{money(totalBudgeted)}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Total actual</div>
                    <div className="kpi-value">{money(totalActual)}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Variance</div>
                    <div className="kpi-value" style={{
                      color: (higherIsBetter ? (totalActual - totalBudgeted >= 0) : (totalActual - totalBudgeted <= 0))
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                    }}>
                      {money(totalActual - totalBudgeted)}
                    </div>
                  </div>
                </div>

                {scopedLines.length > 0 && (
                  <BarChartWidget
                    title="Budgeted vs. actual, by account"
                    data={Object.values(scopedLines.reduce((acc, l) => {
                      acc[l.account_name] = acc[l.account_name] || { name: l.account_name, Budgeted: 0, Actual: 0 };
                      acc[l.account_name].Budgeted += Number(l.budgeted_amount);
                      acc[l.account_name].Actual += Number(l.actual_amount);
                      return acc;
                    }, {}))}
                    bars={[{ key: 'Budgeted', label: 'Budgeted', color: '#2B6CB0' }, { key: 'Actual', label: 'Actual', color: '#0B6E4F' }]}
                    valueFormatter={(v) => formatMoney(v)}
                  />
                )}

                <table>
                  <thead><tr><th>Period</th><th>Account</th><th>Budgeted</th><th>Actual</th><th>Variance</th><th></th></tr></thead>
                  <tbody>
                    {scopedLines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.period_name}</td>
                        <td>{l.account_code} — {l.account_name}</td>
                        <td>
                          {editingId === l.id ? (
                            <input type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus style={{ width: 110, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
                          ) : money(l.budgeted_amount)}
                        </td>
                        <td>{money(l.actual_amount)}</td>
                        <td>
                          <span className={`badge ${
                            Number(l.variance) === 0
                              ? 'badge-neutral'
                              : (higherIsBetter ? Number(l.variance) > 0 : Number(l.variance) < 0)
                                ? 'badge-success'
                                : 'badge-danger'
                          }`}>
                            {Number(l.variance) > 0 ? '+' : ''}{Number(l.variance).toFixed(2)}
                          </span>
                        </td>
                        <td>
                          {editingId === l.id ? (
                            <>
                              <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => saveEdit(l.id)}>Save</button>{' '}
                              <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setEditingId(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => { setEditingId(l.id); setEditValue(l.budgeted_amount); }}>Edit</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {scopedLines.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No lines yet for this scope in this budget.</td></tr>
                    )}
                  </tbody>
                </table>

                {addingLine ? (
                  <form onSubmit={submitNewLine} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Account</label>
                      <select value={newLine.accountId} onChange={(e) => setNewLine((n) => ({ ...n, accountId: e.target.value }))} required>
                        <option value="">Select</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Period</label>
                      <select value={newLine.fiscalPeriodId} onChange={(e) => setNewLine((n) => ({ ...n, fiscalPeriodId: e.target.value }))} required>
                        <option value="">Select</option>
                        {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Amount</label>
                      <input type="number" step="0.01" value={newLine.budgetedAmount} onChange={(e) => setNewLine((n) => ({ ...n, budgetedAmount: e.target.value }))} style={{ width: 120 }} />
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Add</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="button" onClick={() => setAddingLine(false)}>Cancel</button>
                  </form>
                ) : (
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginTop: 12 }} onClick={() => setAddingLine(true)}>+ Add line</button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

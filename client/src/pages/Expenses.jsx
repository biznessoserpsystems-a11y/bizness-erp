import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, formatMoney } from '../components/charts';

const money = (n) => `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function Expenses() {
  const [data, setData] = useState(null);
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get('/expense-entries'), api.get('/chart-of-accounts')])
      .then(([e, c]) => {
        setData(e.data);
        setGlAccounts(c.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const expenseAccounts = glAccounts.filter((a) => a.account_type === 'expense');
  const paymentAccounts = glAccounts.filter((a) => a.account_type === 'asset');

  return (
    <DashboardLayout title="Expenses" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Expenses' }]}>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        IFRS presentation (IAS 1.99-105) — expenses are classified by function into the same four
        lines used on the Income Statement: Cost of Sales, Operating Expenses, Finance Costs, and
        Income Tax Expense, in that order.
      </p>

      {!loading && data && data.totals.totalExpenses > 0 && (
        <BarChartWidget
          title="Expenses by category"
          data={[
            { name: 'Cost of Sales', value: data.totals.totalCostOfSales },
            { name: 'Operating Expenses', value: data.totals.totalOperatingExpenses },
            { name: 'Finance Costs', value: data.totals.totalFinanceCosts },
            { name: 'Income Tax Expense', value: data.totals.totalTaxExpense },
          ]}
          bars={[{ key: 'value', label: 'Amount' }]}
          colorByCategory
          valueFormatter={(v) => formatMoney(v)}
          height={220}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2>Expense entries</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Record expense</button>
        </div>

        {loading ? <p>Loading...</p> : (
          <table className="statement-table">
            <tbody>
              {data.buckets.map((bucket) => (
                <BucketRows key={bucket.key} bucket={bucket} />
              ))}
              <tr className="statement-grand-total-row"><td colSpan={5}>Total Expenses</td><td className="statement-amount">{money(data.totals.totalExpenses)}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ExpenseModal
          expenseAccounts={expenseAccounts}
          paymentAccounts={paymentAccounts}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function BucketRows({ bucket }) {
  return (
    <>
      <tr className="statement-subheader-row"><td colSpan={6}>{bucket.label}</td></tr>
      {bucket.entries.length === 0 ? (
        <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>No entries yet</td><td /><td /><td /><td /><td /></tr>
      ) : bucket.entries.map((e) => <ExpenseRow key={e.id} entry={e} />)}
      <tr className="statement-total-row"><td colSpan={5}>Total {bucket.label}</td><td className="statement-amount">{money(bucket.total)}</td></tr>
    </>
  );
}

function ExpenseRow({ entry }) {
  return (
    <tr className="statement-line-row">
      <td>{entry.entry_no}</td>
      <td>{new Date(entry.entry_date).toLocaleDateString()}</td>
      <td>{entry.payee || '—'}</td>
      <td>{entry.description}</td>
      <td>{entry.expense_account_name} → {entry.payment_account_name}</td>
      <td className="statement-amount">{money(entry.amount)}</td>
    </tr>
  );
}

function ExpenseModal({ expenseAccounts, paymentAccounts, onClose, onSaved }) {
  const cogs = expenseAccounts.filter((a) => a.account_subtype === 'cogs');
  const financeCosts = expenseAccounts.filter((a) => a.account_subtype === 'finance_cost');
  const taxExpense = expenseAccounts.filter((a) => a.account_subtype === 'tax_expense');
  const operating = expenseAccounts.filter((a) => !['cogs', 'finance_cost', 'tax_expense'].includes(a.account_subtype));

  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    payee: '', description: '', amount: '', expenseAccountId: '', paymentAccountId: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/expense-entries', { ...form, amount: Number(form.amount) });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Record expense</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Payee</label>
            <input value={form.payee} onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))} placeholder="e.g. landlord, ECG, bank" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Amount (GHS)</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Expense account</label>
            <select value={form.expenseAccountId} onChange={(e) => setForm((f) => ({ ...f, expenseAccountId: e.target.value }))} required>
              <option value="">Select</option>
              {cogs.length > 0 && (
                <optgroup label="Cost of Sales">
                  {cogs.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </optgroup>
              )}
              {operating.length > 0 && (
                <optgroup label="Operating Expenses">
                  {operating.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </optgroup>
              )}
              {financeCosts.length > 0 && (
                <optgroup label="Finance Costs">
                  {financeCosts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </optgroup>
              )}
              {taxExpense.length > 0 && (
                <optgroup label="Income Tax Expense">
                  {taxExpense.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Paid from</label>
            <select value={form.paymentAccountId} onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))} required>
              <option value="">Select</option>
              {paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

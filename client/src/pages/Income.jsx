import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, formatMoney } from '../components/charts';

const money = (n) => `GHS ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function Income() {
  const [data, setData] = useState(null);
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get('/income-entries'), api.get('/chart-of-accounts')])
      .then(([i, c]) => {
        setData(i.data);
        setGlAccounts(c.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const incomeAccounts = glAccounts.filter((a) => a.account_type === 'revenue');
  const depositAccounts = glAccounts.filter((a) => a.account_type === 'asset');

  return (
    <DashboardLayout title="Income" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Income' }]}>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        IFRS presentation (IAS 1) — operating revenue is presented first, with other income shown as its own,
        separate line below it.
      </p>

      {!loading && data && (data.totals.totalIncome > 0) && (
        <BarChartWidget
          title="Income by category"
          data={[
            { name: 'Operating Revenue', value: data.totals.totalOperatingRevenue },
            { name: 'Other Income', value: data.totals.totalOtherIncome },
          ]}
          bars={[{ key: 'value', label: 'Amount' }]}
          colorByCategory
          valueFormatter={(v) => formatMoney(v)}
          height={220}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2>Income entries</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Record income</button>
        </div>

        {loading ? <p>Loading...</p> : (
          <table className="statement-table">
            <tbody>
              <tr className="statement-subheader-row"><td colSpan={6}>Operating Revenue</td></tr>
              {data.operatingRevenue.length === 0 ? (
                <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>No entries yet</td><td /><td /><td /><td /><td /></tr>
              ) : data.operatingRevenue.map((e) => <IncomeRow key={e.id} entry={e} />)}
              <tr className="statement-total-row"><td colSpan={5}>Total Operating Revenue</td><td className="statement-amount">{money(data.totals.totalOperatingRevenue)}</td></tr>

              <tr className="statement-subheader-row"><td colSpan={6}>Other Income</td></tr>
              {data.otherIncome.length === 0 ? (
                <tr className="statement-line-row"><td style={{ color: 'var(--color-text-muted)' }}>No entries yet</td><td /><td /><td /><td /><td /></tr>
              ) : data.otherIncome.map((e) => <IncomeRow key={e.id} entry={e} />)}
              <tr className="statement-total-row"><td colSpan={5}>Total Other Income</td><td className="statement-amount">{money(data.totals.totalOtherIncome)}</td></tr>

              <tr className="statement-grand-total-row"><td colSpan={5}>Total Income</td><td className="statement-amount">{money(data.totals.totalIncome)}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <IncomeModal
          incomeAccounts={incomeAccounts}
          depositAccounts={depositAccounts}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function IncomeRow({ entry }) {
  return (
    <tr className="statement-line-row">
      <td>{entry.entry_no}</td>
      <td>{new Date(entry.entry_date).toLocaleDateString()}</td>
      <td>{entry.payer || '—'}</td>
      <td>{entry.description}</td>
      <td>{entry.income_account_name} → {entry.deposit_account_name}</td>
      <td className="statement-amount">{money(entry.amount)}</td>
    </tr>
  );
}

function IncomeModal({ incomeAccounts, depositAccounts, onClose, onSaved }) {
  const operating = incomeAccounts.filter((a) => a.account_subtype === 'operating_revenue');
  const other = incomeAccounts.filter((a) => a.account_subtype !== 'operating_revenue');

  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    payer: '', description: '', amount: '', incomeAccountId: '', depositAccountId: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/income-entries', { ...form, amount: Number(form.amount) });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record income');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Record income</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Payer / source</label>
            <input value={form.payer} onChange={(e) => setForm((f) => ({ ...f, payer: e.target.value }))} placeholder="e.g. tenant, bank, customer" />
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
            <label>Income account</label>
            <select value={form.incomeAccountId} onChange={(e) => setForm((f) => ({ ...f, incomeAccountId: e.target.value }))} required>
              <option value="">Select</option>
              {operating.length > 0 && (
                <optgroup label="Operating Revenue">
                  {operating.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </optgroup>
              )}
              {other.length > 0 && (
                <optgroup label="Other Income">
                  {other.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Deposited into</label>
            <select value={form.depositAccountId} onChange={(e) => setForm((f) => ({ ...f, depositAccountId: e.target.value }))} required>
              <option value="">Select</option>
              {depositAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
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

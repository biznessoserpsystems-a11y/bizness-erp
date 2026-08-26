import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

export default function Banking() {
  const [accounts, setAccounts] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [reconcileAccount, setReconcileAccount] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/bank-accounts'), api.get('/chart-of-accounts')])
      .then(([b, c]) => {
        setAccounts(b.data);
        setGlAccounts(c.data.filter((a) => a.account_type === 'asset'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openReconcile(id) {
    const { data } = await api.get(`/bank-accounts/${id}/reconciliation`);
    setReconcileAccount(data);
  }

  if (reconcileAccount) {
    return <Reconciliation data={reconcileAccount} onBack={() => setReconcileAccount(null)} onRefresh={() => openReconcile(reconcileAccount.bankAccount.id)} />;
  }

  return (
    <DashboardLayout title="Banking" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Banking' }]}>
      <div className="card">
        <div className="card-header">
          <h2>Bank accounts</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add bank account</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Bank</th><th>Account #</th><th>GL account</th><th>Currency</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.bank_name}</td>
                  <td>{a.account_number || '—'}</td>
                  <td>{a.account_code} — {a.account_name}</td>
                  <td>{a.currency}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openReconcile(a.id)}>Reconcile</button>
                    <Link to={`/accounting/banking/${a.id}/reconciliation-statement`} className="btn btn-secondary btn-sm">Statement</Link>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No bank accounts yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <BankModal glAccounts={glAccounts} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </DashboardLayout>
  );
}

function BankModal({ glAccounts, onClose, onSaved }) {
  const [form, setForm] = useState({ accountId: '', bankName: '', accountNumber: '', branch: '', currency: 'GHS' });
  const [currencies, setCurrencies] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/currencies').then(({ data }) => setCurrencies(data.filter((c) => c.is_active))).catch(() => setCurrencies([]));
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/bank-accounts', form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add bank account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add bank account</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Bank name</label>
            <input value={form.bankName} onChange={update('bankName')} required placeholder="e.g. GCB Bank" />
          </div>
          <div className="form-group">
            <label>Account number</label>
            <input value={form.accountNumber} onChange={update('accountNumber')} />
          </div>
          <div className="form-group">
            <label>Branch</label>
            <input value={form.branch} onChange={update('branch')} />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <select value={form.currency} onChange={update('currency')}>
              {(currencies || []).map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
              The currency this account is actually held in — statement lines and reconciliation will use this, not the company's base currency.
            </p>
          </div>
          <div className="form-group">
            <label>Linked GL account</label>
            <select value={form.accountId} onChange={update('accountId')} required>
              <option value="">Select</option>
              {glAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
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

function Reconciliation({ data, onBack, onRefresh }) {
  const [importing, setImporting] = useState(false);
  const [autoReconciling, setAutoReconciling] = useState(false);
  const [autoResult, setAutoResult] = useState(null);

  async function autoReconcile() {
    setAutoReconciling(true);
    setAutoResult(null);
    try {
      const { data: result } = await api.post(`/bank-accounts/${data.bankAccount.id}/auto-reconcile`);
      setAutoResult(result);
      onRefresh();
    } finally {
      setAutoReconciling(false);
    }
  }

  async function importSample() {
    // Quick manual-entry importer: prompts for a single statement line.
    const desc = prompt('Statement line description?');
    if (!desc) return;
    const amount = prompt('Amount (positive for deposit, negative for withdrawal)?');
    if (amount === null) return;
    setImporting(true);
    try {
      await api.post(`/bank-accounts/${data.bankAccount.id}/statement-lines`, {
        lines: [{ transactionDate: new Date().toISOString().slice(0, 10), description: desc, amount: Number(amount) }],
      });
      onRefresh();
    } finally {
      setImporting(false);
    }
  }

  async function reconcile(lineId, glLineId) {
    await api.patch(`/bank-statement-lines/${lineId}/reconcile`, { matchedJournalEntryLineId: glLineId || null });
    onRefresh();
  }

  return (
    <DashboardLayout title={`Reconcile — ${data.bankAccount.bank_name}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to banking</button>

      <div className="card">
        <div className="card-header">
          <h2>Bank statement lines</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={autoReconcile} disabled={autoReconciling}>
              {autoReconciling ? 'Matching...' : 'Auto-reconcile'}
            </button>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={importSample} disabled={importing}>+ Add statement line</button>
          </div>
        </div>
        {autoResult && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Matched {autoResult.matchedCount} line{autoResult.matchedCount === 1 ? '' : 's'} automatically
            {autoResult.unmatchedCount > 0 ? ` — ${autoResult.unmatchedCount} left for manual review.` : '.'}
          </p>
        )}
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Unreconciled statement total: GHS {Number(data.unreconciledStatementTotal).toFixed(2)}</p>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.statementLines.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.transaction_date).toLocaleDateString()}</td>
                <td>{l.description}</td>
                <td>GHS {Number(l.amount).toFixed(2)}</td>
                <td><span className={`badge ${l.is_reconciled ? 'badge-success' : 'badge-neutral'}`}>{l.is_reconciled ? 'Reconciled' : 'Unreconciled'}</span></td>
                <td>{!l.is_reconciled && <button className="btn btn-secondary btn-sm" onClick={() => reconcile(l.id)}>Mark reconciled</button>}</td>
              </tr>
            ))}
            {data.statementLines.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No statement lines imported yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>GL movements on this account</h2>
        <table>
          <thead><tr><th>Date</th><th>Entry #</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead>
          <tbody>
            {data.glLines.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.entry_date).toLocaleDateString()}</td>
                <td>{l.entry_no}</td>
                <td>{l.description || '—'}</td>
                <td>{Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ''}</td>
                <td>{Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ''}</td>
              </tr>
            ))}
            {data.glLines.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No GL movements on this account.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

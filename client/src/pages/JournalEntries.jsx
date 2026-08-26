import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useOfflineDraft } from '../hooks/useOfflineDraft';

export default function JournalEntries() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/journal-entries'), api.get('/chart-of-accounts')])
      .then(([e, a]) => {
        setEntries(e.data);
        setAccounts(a.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(id) {
    const { data } = await api.get(`/journal-entries/${id}`);
    setDetail(data);
  }

  async function handleReverse(id) {
    const reason = prompt('Reason for reversing this entry?');
    if (reason === null) return;
    try {
      await api.post(`/journal-entries/${id}/reverse`, { reason });
      setDetail(null);
      load();
      showToast('Journal entry reversed.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reverse entry', 'error');
    }
  }

  if (detail) {
    return (
      <DashboardLayout title={`Journal Entry — ${detail.entry_no}`}>
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => setDetail(null)}>← Back to journal</button>
        <div className="card">
          <div className="card-header">
            <h2>{detail.description} <span className={`badge ${detail.status === 'posted' ? 'badge-success' : detail.status === 'reversed' ? 'badge-danger' : 'badge-neutral'}`}>{detail.status}</span></h2>
            {detail.status === 'posted' && (
              <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => handleReverse(detail.id)}>Reverse entry</button>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Date: {new Date(detail.entry_date).toLocaleDateString()} · Reference: {detail.reference_type}
          </p>
          <table>
            <thead><tr><th>Account</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.account_code} — {l.account_name}</td>
                  <td>{l.description || '—'}{l.customer_name ? ` (${l.customer_name})` : ''}</td>
                  <td>{Number(l.debit) > 0 ? `GHS ${Number(l.debit).toFixed(2)}` : ''}</td>
                  <td>{Number(l.credit) > 0 ? `GHS ${Number(l.credit).toFixed(2)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 12, fontWeight: 700 }}>
            <span>Total debit: GHS {Number(detail.total_debit).toFixed(2)}</span>
            <span>Total credit: GHS {Number(detail.total_credit).toFixed(2)}</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="General Journal" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Journal Entries' }]}>
      <div className="card">
        <div className="card-header">
          <h2>Journal entries</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New entry</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Entry #</th><th>Date</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.entry_no}</td>
                  <td>{new Date(e.entry_date).toLocaleDateString()}</td>
                  <td>{e.description}</td>
                  <td><span className="badge badge-neutral">{e.reference_type}</span></td>
                  <td>GHS {Number(e.total_debit).toFixed(2)}</td>
                  <td>GHS {Number(e.total_credit).toFixed(2)}</td>
                  <td><span className={`badge ${e.status === 'posted' ? 'badge-success' : e.status === 'reversed' ? 'badge-danger' : 'badge-neutral'}`}>{e.status}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(e.id)}>View</button></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No journal entries yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <JournalModal accounts={accounts} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </DashboardLayout>
  );
}

function JournalModal({ accounts, onClose, onSaved }) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { restoredDraft, save: saveDraft, discard: discardDraft } = useOfflineDraft('journal-entry');

  // Auto-save as a real, meaningful edit happens - guarded against
  // persisting a completely untouched blank form on every mount, which
  // would just clutter offline storage with nothing worth restoring.
  useEffect(() => {
    const hasContent = description.trim() || lines.some((l) => l.accountId || l.debit || l.credit);
    if (hasContent) saveDraft({ entryDate, description, lines });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate, description, lines]);

  function applyRestoredDraft() {
    if (!restoredDraft) return;
    setEntryDate(restoredDraft.entryDate);
    setDescription(restoredDraft.description);
    setLines(restoredDraft.lines);
    discardDraft();
  }

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { accountId: '', debit: '', credit: '' }]);
  }
  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/journal-entries', {
        entryDate, description,
        lines: lines.filter((l) => l.accountId && (l.debit || l.credit)).map((l) => ({
          accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
        })),
      });
      discardDraft();
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post journal entry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>New journal entry</h2>
        {error && <div className="error-banner">{error}</div>}
        {restoredDraft && (
          <div className="info-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>You have an unsaved draft of an entry.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={applyRestoredDraft}>Restore</button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={discardDraft}>Discard</button>
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="e.g. July office rent" />
          </div>

          <table style={{ marginBottom: 8 }}>
            <thead><tr><th>Account</th><th style={{ width: 100 }}>Debit</th><th style={{ width: 100 }}>Credit</th><th></th></tr></thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx}>
                  <td>
                    <select value={line.accountId} onChange={(e) => updateLine(idx, 'accountId', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required>
                      <option value="">Select account</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" step="0.01" value={line.debit} onChange={(e) => updateLine(idx, 'debit', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                  <td><input type="number" step="0.01" value={line.credit} onChange={(e) => updateLine(idx, 'credit', e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                  <td>{lines.length > 2 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeLine(idx)}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>+ Add line</button>

          <div style={{ background: balanced ? '#EAF6EF' : '#FBEAE8', borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 16 }}>
            Debit: GHS {totalDebit.toFixed(2)} · Credit: GHS {totalCredit.toFixed(2)} · {balanced ? 'Balanced ✓' : 'Not balanced'}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !balanced}>
              {submitting ? 'Posting...' : 'Post entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

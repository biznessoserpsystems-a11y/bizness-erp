import { useEffect, useState } from 'react';
import api from '../services/api';

const CHANNELS = ['call', 'email', 'meeting', 'note', 'sms', 'visit'];

// Embeds a communication history log + "add entry" form for a single customer or supplier.
// relatedType must be 'customer' or 'supplier'; canManage gates adding/deleting entries
// (pass the same permission check the parent page already uses for editing that record).
export default function CommunicationLog({ relatedType, relatedId, canManage }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    api.get('/communication-logs', { params: { relatedType, relatedId } })
      .then(({ data }) => setLogs(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [relatedType, relatedId]);

  async function handleDelete(id) {
    if (!confirm('Delete this log entry?')) return;
    await api.delete(`/communication-logs/${id}`);
    load();
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Communication log</h2>
        {canManage && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Log a communication'}
          </button>
        )}
      </div>

      {showForm && (
        <LogForm
          relatedType={relatedType}
          relatedId={relatedId}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Date</th><th>Channel</th><th>Subject</th><th>Notes</th><th>Logged by</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.occurred_at).toLocaleString()}</td>
                <td><span className="badge badge-neutral">{l.channel}{l.direction === 'inbound' ? ' (in)' : ''}</span></td>
                <td>{l.subject || '—'}</td>
                <td style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{l.notes}</td>
                <td>{l.first_name ? `${l.first_name} ${l.last_name}` : '—'}</td>
                {canManage && (
                  <td><button className="btn btn-secondary btn-sm" onClick={() => handleDelete(l.id)}>Delete</button></td>
                )}
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={canManage ? 6 : 5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No communications logged yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LogForm({ relatedType, relatedId, onSaved, onCancel }) {
  const [channel, setChannel] = useState('call');
  const [direction, setDirection] = useState('outbound');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [contactName, setContactName] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/communication-logs', {
        relatedType, relatedId, channel, direction, subject, notes,
        contactName, followUpDate: followUpDate || null,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save log entry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#F7F4EC', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Direction</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Follow-up date</label>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label>Contact name</label>
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Who you spoke with" />
      </div>
      <div className="form-group">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
      </div>
      <div className="form-group">
        <label>Notes</label>
        <textarea
          rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} required
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontFamily: 'inherit' }}
        />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
          {submitting ? 'Saving...' : 'Save entry'}
        </button>
      </div>
    </form>
  );
}

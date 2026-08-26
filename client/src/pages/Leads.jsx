import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, formatMoney } from '../components/charts';

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const STAGE_BADGE = {
  new: 'badge-neutral',
  contacted: 'badge-neutral',
  qualified: 'badge-success',
  proposal: 'badge-success',
  won: 'badge-success',
  lost: 'badge-danger',
};

export default function Leads() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('crm.leads.manage');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalLead, setModalLead] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [stageFilter, setStageFilter] = useState('');

  function load() {
    setLoading(true);
    api
      .get(`/leads${stageFilter ? `?stage=${stageFilter}` : ''}`)
      .then(({ data }) => setLeads(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [stageFilter]);

  if (detailId) {
    return <LeadDetail id={detailId} canManage={canManage} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <DashboardLayout title="Leads">
      {!loading && !stageFilter && leads.length > 0 && (
        <div className="chart-grid">
          <BarChartWidget
            title="Pipeline by stage"
            data={STAGES.map((s) => ({ name: s[0].toUpperCase() + s.slice(1), count: leads.filter((l) => l.stage === s).length }))}
            bars={[{ key: 'count', label: 'Leads' }]}
            colorByCategory
          />
          <BarChartWidget
            title="Estimated value by stage"
            data={STAGES.map((s) => ({ name: s[0].toUpperCase() + s.slice(1), value: leads.filter((l) => l.stage === s).reduce((sum, l) => sum + Number(l.estimated_value || 0), 0) }))}
            bars={[{ key: 'value', label: 'Estimated value' }]}
            colorByCategory
            valueFormatter={(v) => formatMoney(v)}
          />
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <h2>Pipeline</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            {canManage && (
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalLead({})}>
                + Add lead
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : leads.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No leads yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Stage</th>
                <th>Est. value</th>
                <th>Owner</th>
                <th>Expected close</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>{l.company_name || '—'}</td>
                  <td>
                    <span className={`badge ${STAGE_BADGE[l.stage] || 'badge-neutral'}`}>{l.stage}</span>
                  </td>
                  <td>{l.estimated_value ? `GHS ${Number(l.estimated_value).toFixed(2)}` : '—'}</td>
                  <td>{l.owner_first_name ? `${l.owner_first_name} ${l.owner_last_name}` : '—'}</td>
                  <td>{l.expected_close_date ? new Date(l.expected_close_date).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(l.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalLead && (
        <LeadModal
          lead={modalLead}
          onClose={() => setModalLead(null)}
          onSaved={() => {
            setModalLead(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function LeadModal({ lead, onClose, onSaved }) {
  const [name, setName] = useState(lead.name || '');
  const [companyName, setCompanyName] = useState(lead.company_name || '');
  const [email, setEmail] = useState(lead.email || '');
  const [phone, setPhone] = useState(lead.phone || '');
  const [source, setSource] = useState(lead.source || '');
  const [estimatedValue, setEstimatedValue] = useState(lead.estimated_value || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(lead.expected_close_date?.slice(0, 10) || '');
  const [notes, setNotes] = useState(lead.notes || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/leads', {
        name, companyName, email, phone, source,
        estimatedValue: Number(estimatedValue) || 0,
        expectedCloseDate: expectedCloseDate || null,
        notes,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New lead</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Contact name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Company</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Source</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Referral, website, walk-in..." />
          </div>
          <div className="form-group">
            <label>Estimated value (GHS)</label>
            <input type="number" min="0" step="0.01" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Expected close date</label>
            <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeadDetail({ id, canManage, onBack }) {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get(`/leads/${id}`).then(({ data }) => setLead(data)).finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  function updateStage(stage) {
    api.patch(`/leads/${id}`, { stage }).then(load);
  }

  function toggleActivityDone(activityId, isDone) {
    api.patch(`/activities/${activityId}`, { isDone: !isDone }).then(load);
  }

  if (loading || !lead) {
    return (
      <DashboardLayout title="Lead">
        <p>Loading...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={lead.name}>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to pipeline
      </button>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>{lead.name} {lead.company_name && `· ${lead.company_name}`}</h2>
          {canManage && lead.stage !== 'won' && !lead.converted_customer_id && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowConvertModal(true)}>
              Convert to customer
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Stage</div>
            {canManage ? (
              <select value={lead.stage} onChange={(e) => updateStage(e.target.value)} style={{ marginTop: 4 }}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontWeight: 600 }}>{lead.stage}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Estimated value</div>
            <div style={{ fontWeight: 600 }}>{lead.estimated_value ? `GHS ${Number(lead.estimated_value).toFixed(2)}` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Email</div>
            <div style={{ fontWeight: 600 }}>{lead.email || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Phone</div>
            <div style={{ fontWeight: 600 }}>{lead.phone || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Source</div>
            <div style={{ fontWeight: 600 }}>{lead.source || '—'}</div>
          </div>
        </div>
        {lead.converted_customer_id && (
          <div style={{ marginTop: 12 }}>
            <span className="badge badge-success">Converted to customer</span>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Contacts</h2>
          {canManage && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowContactModal(true)}>
              + Add contact
            </button>
          )}
        </div>
        {lead.contacts.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No contact people added yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Email</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lead.contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.first_name} {c.last_name} {c.is_primary && <span className="badge badge-success">Primary</span>}
                  </td>
                  <td>{c.title || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Activity timeline</h2>
          {canManage && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowActivityModal(true)}>
              + Log activity
            </button>
          )}
        </div>
        {lead.activities.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No activity logged yet.</p>
        ) : (
          <div>
            {lead.activities.map((a) => (
              <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="badge badge-neutral" style={{ textTransform: 'capitalize', flexShrink: 0 }}>{a.type}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{a.subject}</div>
                  {a.notes && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{a.notes}</div>}
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {a.first_name} {a.last_name} · {new Date(a.created_at).toLocaleString()}
                    {a.due_date && ` · due ${new Date(a.due_date).toLocaleDateString()}`}
                  </div>
                </div>
                {a.due_date && (
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleActivityDone(a.id, a.is_done)}>
                    {a.is_done ? 'Reopen' : 'Mark done'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showContactModal && (
        <ContactModal
          leadId={id}
          onClose={() => setShowContactModal(false)}
          onSaved={() => {
            setShowContactModal(false);
            load();
          }}
        />
      )}
      {showActivityModal && (
        <ActivityModal
          leadId={id}
          onClose={() => setShowActivityModal(false)}
          onSaved={() => {
            setShowActivityModal(false);
            load();
          }}
        />
      )}
      {showConvertModal && (
        <ConvertModal
          leadId={id}
          onClose={() => setShowConvertModal(false)}
          onSaved={() => {
            setShowConvertModal(false);
            load();
          }}
          onError={setError}
        />
      )}
    </DashboardLayout>
  );
}

function ContactModal({ leadId, onClose, onSaved }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/contacts', { leadId, firstName, lastName, title, email, phone, isPrimary });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add contact</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Title / role</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Procurement Manager" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> Primary contact
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityModal({ leadId, onClose, onSaved }) {
  const [type, setType] = useState('note');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/activities', { leadId, type, subject, notes, dueDate: dueDate || null });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log activity</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="task">Task / follow-up</option>
            </select>
          </div>
          <div className="form-group">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Follow-up due date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              If set and left undone, this'll show up as an overdue-follow-up alert once the date passes.
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Log activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConvertModal({ leadId, onClose, onSaved, onError }) {
  const [customerCode, setCustomerCode] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [paymentTermsDays, setPaymentTermsDays] = useState('0');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/leads/${leadId}/convert`, {
        customerCode: customerCode || undefined,
        creditLimit: Number(creditLimit) || 0,
        paymentTermsDays: Number(paymentTermsDays) || 0,
      });
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to convert lead';
      setError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Convert to customer</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Customer code (optional, auto-generated if blank)</label>
            <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Credit limit (GHS)</label>
            <input type="number" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Payment terms (days)</label>
            <input type="number" min="0" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Converting...' : 'Convert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

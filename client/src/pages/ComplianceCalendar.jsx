import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const CATEGORIES = ['tax_filing', 'labour_law', 'epa', 'fda', 'business_operating_permit', 'property_rate', 'business_registration', 'ssnit_filing', 'other'];

// Exported so the Dashboard's own compliance widget can show categories
// formatted exactly the same way, not a second, separately-maintained
// copy of this logic. Fixed a real bug in the version this replaced —
// String.replace('_', ' ') only replaces the FIRST underscore, so
// "business_operating_permit" (two underscores) rendered as "Business
// Operating_permit" with a literal underscore and lowercase word still
// showing through. Also gives EPA, FDA, and SSNIT their real acronym
// casing instead of title-casing them into "Epa", "Fda", "Ssnit".
const ACRONYMS = { epa: 'EPA', fda: 'FDA', ssnit: 'SSNIT' };
export const formatComplianceCategory = (s) =>
  s.split('_').map((word) => ACRONYMS[word] || word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const label = formatComplianceCategory;

export default function ComplianceCalendar() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [filingItem, setFilingItem] = useState(null);
  const [filingForm, setFilingForm] = useState({ periodLabel: '', filedDate: new Date().toISOString().slice(0, 10), referenceNo: '', notes: '' });
  const blankForm = {
    category: 'tax_filing', title: '', description: '', frequency: 'monthly',
    dueDay: 28, dueMonth: '', nextDueDate: '', responsibleEmployeeId: '',
  };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/compliance-calendar/items').then(({ data }) => setItems(data)); }
  useEffect(() => { load(); api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, []);

  function startCreate() {
    setEditingId(null);
    setForm(blankForm);
    setCreating((c) => !c);
  }

  function startEdit(i) {
    setCreating(false);
    setEditingId(i.id);
    setForm({
      category: i.category, title: i.title, description: i.description || '', frequency: i.frequency,
      dueDay: i.due_day, dueMonth: i.due_month || '', nextDueDate: i.next_due_date.slice(0, 10), responsibleEmployeeId: i.responsible_employee_id || '',
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, dueDay: Number(form.dueDay), dueMonth: form.dueMonth ? Number(form.dueMonth) : null, responsibleEmployeeId: form.responsibleEmployeeId || null };
    try {
      if (editingId) {
        await api.patch(`/compliance-calendar/items/${editingId}`, payload);
        setEditingId(null);
      } else {
        await api.post('/compliance-calendar/items', payload);
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save calendar item');
    }
  }

  async function remove(i) {
    const ok = await confirm(`Delete "${i.title}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/compliance-calendar/items/${i.id}`);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete calendar item', 'error');
    }
  }

  async function submitFiling(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/compliance-calendar/items/${filingItem.id}/file`, filingForm);
      showToast('Filing recorded.', 'success');
      setFilingItem(null);
      setFilingForm({ periodLabel: '', filedDate: new Date().toISOString().slice(0, 10), referenceNo: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record filing');
    }
  }

  const needsMonth = form.frequency === 'annually' || form.frequency === 'one_time';
  const formOpen = creating || editingId;

  return (
    <DashboardLayout title="Compliance Calendar">
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        Recurring statutory filing deadlines — Tax Filings, Labour Act, EPA, FDA, Business Operating Permit, Property Rate,
        Business Registrations, and SSNIT Filings. Every overdue item here also appears on the Executive Dashboard's own
        Compliance Calendar section — the same list, not a separate one.
      </p>

      <div className="card">
        <div className="card-header">
          <h2>Scheduled Filings</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Calendar Item'}</button>
        </div>
        {error && <div className="error-banner">{error}</div>}

        {creating || editingId ? (
          <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
              <div className="form-group">
                <label>Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option><option value="one_time">One-time</option>
                </select>
              </div>
              <div className="form-group">
                <label>Due day (1–28)</label>
                <input type="number" min="1" max="28" value={form.dueDay} onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))} style={{ width: 90 }} required />
              </div>
              {needsMonth && (
                <div className="form-group">
                  <label>Due month</label>
                  <input type="number" min="1" max="12" value={form.dueMonth} onChange={(e) => setForm((f) => ({ ...f, dueMonth: e.target.value }))} style={{ width: 90 }} required />
                </div>
              )}
              <div className="form-group">
                <label>{editingId ? 'Next due date' : 'First occurrence due date'}</label>
                <input type="date" value={form.nextDueDate} onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Responsible</label>
                <select value={form.responsibleEmployeeId} onChange={(e) => setForm((f) => ({ ...f, responsibleEmployeeId: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
          </form>
        ) : null}

        {items === null ? <p>Loading...</p> : items.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No calendar items yet.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Category</th><th>Frequency</th><th>Next Due</th><th>Responsible</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} style={!i.is_active ? { opacity: 0.5 } : undefined}>
                  <td>{i.title}</td>
                  <td style={{ textTransform: 'capitalize' }}>{label(i.category)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{i.frequency.replace('_', '-')}</td>
                  <td style={i.is_overdue ? { color: 'var(--color-error)', fontWeight: 600 } : undefined}>
                    {new Date(i.next_due_date).toLocaleDateString()}{i.is_overdue ? ' (overdue)' : ''}
                  </td>
                  <td>{i.responsible_first_name ? `${i.responsible_first_name} ${i.responsible_last_name}` : '—'}</td>
                  <td>{i.is_active ? <span className="badge badge-info">Active</span> : <span className="badge badge-neutral">Inactive</span>}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {i.is_active && (
                      <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => { setFilingItem(i); setFilingForm((f) => ({ ...f, periodLabel: '' })); }}>
                        Mark Filed
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(i)}>Edit</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(i)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filingItem && (
        <div className="modal-overlay" onClick={() => setFilingItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Mark Filed: {filingItem.title}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              Due {new Date(filingItem.next_due_date).toLocaleDateString()}. Recording this filing advances the schedule to the next occurrence.
            </p>
            <form onSubmit={submitFiling}>
              <div className="form-group"><label>Period label</label><input value={filingForm.periodLabel} onChange={(e) => setFilingForm((f) => ({ ...f, periodLabel: e.target.value }))} placeholder="e.g. July 2026, Q3 2026, FY2026" required /></div>
              <div className="form-group"><label>Filed date</label><input type="date" value={filingForm.filedDate} onChange={(e) => setFilingForm((f) => ({ ...f, filedDate: e.target.value }))} required /></div>
              <div className="form-group"><label>Reference number</label><input value={filingForm.referenceNo} onChange={(e) => setFilingForm((f) => ({ ...f, referenceNo: e.target.value }))} /></div>
              <div className="form-group"><label>Notes</label><textarea value={filingForm.notes} onChange={(e) => setFilingForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFilingItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>Record Filing</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

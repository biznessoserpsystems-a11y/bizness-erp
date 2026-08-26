import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../components/charts';

const money = (n) => formatMoney(n);
const label = (s) => s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TABS = [
  { key: 'catalog', label: 'Service Catalog' },
  { key: 'jobs', label: 'Service Jobs' },
];

export default function Services() {
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab || 'jobs');
  const [selectedJobId, setSelectedJobId] = useState(location.state?.jobId || null);

  return (
    <DashboardLayout title="Service Business">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => { setTab(t.key); setSelectedJobId(null); }}>{t.label}</button>
        ))}
      </div>
      {tab === 'catalog' && <ServiceCatalog />}
      {tab === 'jobs' && (selectedJobId ? <JobDetail id={selectedJobId} onBack={() => setSelectedJobId(null)} /> : <JobList onSelect={setSelectedJobId} />)}
    </DashboardLayout>
  );
}

// ============================================================================
function ServiceCatalog() {
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { name: '', category: '', description: '', pricingType: 'hourly', standardRate: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/services/catalog').then(({ data }) => setList(data)); }
  useEffect(load, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(item) {
    setCreating(false);
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category || '', description: item.description || '', pricingType: item.pricing_type, standardRate: item.standard_rate });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, standardRate: Number(form.standardRate) };
    try {
      if (editingId) {
        await api.patch(`/services/catalog/${editingId}`, payload);
        setEditingId(null);
      } else {
        await api.post('/services/catalog', payload);
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save service');
    }
  }

  async function remove(item) {
    const ok = await confirm(`Delete service "${item.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/services/catalog/${item.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete service');
    }
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Service Catalog</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Service'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Each service is backed by a real product record behind the scenes, so jobs can be invoiced through the same Sales pipeline every other invoice uses — no separate accounting path.
      </p>

      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 220px' }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div className="form-group"><label>Category</label><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
            <div className="form-group">
              <label>Pricing type</label>
              <select value={form.pricingType} onChange={(e) => setForm((f) => ({ ...f, pricingType: e.target.value }))}>
                <option value="hourly">Hourly</option><option value="fixed">Fixed</option><option value="per_unit">Per Unit</option>
              </select>
            </div>
            <div className="form-group"><label>Standard rate</label><input type="number" step="0.01" value={form.standardRate} onChange={(e) => setForm((f) => ({ ...f, standardRate: e.target.value }))} style={{ width: 120 }} required /></div>
          </div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No services in the catalog yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Pricing</th><th>Standard Rate</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td><td>{i.category || '—'}</td><td style={{ textTransform: 'capitalize' }}>{i.pricing_type.replace('_', ' ')}</td><td>{money(i.standard_rate)}</td>
                <td>{i.is_active ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Inactive</span>}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(i)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(i)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
function JobList({ onSelect }) {
  const [list, setList] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', serviceCatalogId: '', title: '', description: '', assignedEmployeeId: '', scheduledDate: '', billingType: 'time_and_materials', fixedPrice: '' });

  function load() { api.get('/services/jobs').then(({ data }) => setList(data)); }
  useEffect(() => {
    load();
    api.get('/customers').then(({ data }) => setCustomers(data)).catch(() => setCustomers([]));
    api.get('/services/catalog').then(({ data }) => setCatalog(data.filter((c) => c.is_active))).catch(() => setCatalog([]));
    api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => setEmployees([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/services/jobs', { ...form, fixedPrice: form.fixedPrice ? Number(form.fixedPrice) : null });
      setCreating(false);
      setForm({ customerId: '', serviceCatalogId: '', title: '', description: '', assignedEmployeeId: '', scheduledDate: '', billingType: 'time_and_materials', fixedPrice: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create job');
    }
  }

  const statusColor = (s) => ({ draft: 'badge-neutral', scheduled: 'badge-info', in_progress: 'badge-warning', completed: 'badge-success', invoiced: 'badge-success', cancelled: 'badge-danger' }[s] || 'badge-neutral');

  return (
    <div className="card">
      <div className="card-header">
        <h2>Service Jobs</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Job'}</button>
      </div>

      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group">
              <label>Customer</label>
              <select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} required>
                <option value="">Select</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 220px' }}><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="form-group">
              <label>Service</label>
              <select value={form.serviceCatalogId} onChange={(e) => setForm((f) => ({ ...f, serviceCatalogId: e.target.value }))}>
                <option value="">None</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Assigned to</label>
              <select value={form.assignedEmployeeId} onChange={(e) => setForm((f) => ({ ...f, assignedEmployeeId: e.target.value }))}>
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Scheduled date</label><input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></div>
            <div className="form-group">
              <label>Billing type</label>
              <select value={form.billingType} onChange={(e) => setForm((f) => ({ ...f, billingType: e.target.value }))}>
                <option value="time_and_materials">Time & Materials</option><option value="fixed_price">Fixed Price</option>
              </select>
            </div>
            {form.billingType === 'fixed_price' && (
              <div className="form-group"><label>Fixed price</label><input type="number" step="0.01" value={form.fixedPrice} onChange={(e) => setForm((f) => ({ ...f, fixedPrice: e.target.value }))} style={{ width: 120 }} required /></div>
            )}
          </div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save Job</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No service jobs yet.</p> : (
        <table>
          <thead><tr><th>Job #</th><th>Title</th><th>Customer</th><th>Assigned</th><th>Status</th><th>Billing</th></tr></thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(j.id)}>
                <td>{j.job_no}</td><td>{j.title}</td><td>{j.customer_name}</td>
                <td>{j.employee_first_name ? `${j.employee_first_name} ${j.employee_last_name}` : '—'}</td>
                <td><span className={`badge ${statusColor(j.status)}`}>{label(j.status)}</span></td>
                <td style={{ textTransform: 'capitalize' }}>{j.billing_type.replace(/_/g, ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
function JobDetail({ id, onBack }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [job, setJob] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [timeForm, setTimeForm] = useState({ employeeId: '', entryDate: new Date().toISOString().slice(0, 10), hours: '', hourlyRate: '', billable: true, description: '' });
  const [expenseForm, setExpenseForm] = useState({ expenseDate: new Date().toISOString().slice(0, 10), description: '', amount: '', billable: true });
  const [addingTime, setAddingTime] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  function load() { api.get(`/services/jobs/${id}`).then(({ data }) => setJob(data)); }
  useEffect(() => { load(); api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, [id]);

  async function updateStatus(status) {
    await api.patch(`/services/jobs/${id}`, { status });
    load();
  }

  async function submitTime(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/services/jobs/${id}/time-entries`, { ...timeForm, hours: Number(timeForm.hours), hourlyRate: Number(timeForm.hourlyRate) || 0 });
      setAddingTime(false);
      setTimeForm({ employeeId: '', entryDate: new Date().toISOString().slice(0, 10), hours: '', hourlyRate: '', billable: true, description: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log time');
    }
  }

  async function submitExpense(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/services/jobs/${id}/expenses`, { ...expenseForm, amount: Number(expenseForm.amount) });
      setAddingExpense(false);
      setExpenseForm({ expenseDate: new Date().toISOString().slice(0, 10), description: '', amount: '', billable: true });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log expense');
    }
  }

  async function removeTime(entryId) {
    try { await api.delete(`/services/jobs/${id}/time-entries/${entryId}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete entry', 'error'); }
  }

  async function removeExpense(expenseId) {
    try { await api.delete(`/services/jobs/${id}/expenses/${expenseId}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete expense', 'error'); }
  }

  async function generateInvoice() {
    const ok = await confirm(`Generate an invoice for ${money(job.unbilledTotal)} of unbilled work?`, { confirmLabel: 'Generate Invoice' });
    if (!ok) return;
    try {
      await api.post(`/services/jobs/${id}/generate-invoice`);
      showToast('Invoice generated.', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to generate invoice', 'error');
    }
  }

  if (!job) return <div className="card"><p>Loading...</p></div>;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to jobs</button>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h2 style={{ marginBottom: 4 }}>{job.job_no} — {job.title}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: 0 }}>{job.customer_name} · Status: {label(job.status)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {job.status === 'draft' && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => updateStatus('in_progress')}>Start Job</button>}
            {job.status === 'in_progress' && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => updateStatus('completed')}>Mark Completed</button>}
            {['completed', 'in_progress'].includes(job.status) && !job.sales_invoice_id && (
              <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={generateInvoice}>Generate Invoice ({money(job.unbilledTotal)})</button>
            )}
          </div>
        </div>
        {job.sales_invoice_id && <p style={{ fontSize: 13 }}>Invoiced — see Sales & Distribution for the invoice record.</p>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Time Entries</h2>
          {!job.sales_invoice_id && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setAddingTime((c) => !c)}>{addingTime ? 'Cancel' : '+ Log Time'}</button>}
        </div>
        {addingTime && (
          <form onSubmit={submitTime} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}><label>Date</label><input type="date" value={timeForm.entryDate} onChange={(e) => setTimeForm((f) => ({ ...f, entryDate: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Employee</label>
              <select value={timeForm.employeeId} onChange={(e) => setTimeForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}><label>Hours</label><input type="number" step="0.25" value={timeForm.hours} onChange={(e) => setTimeForm((f) => ({ ...f, hours: e.target.value }))} style={{ width: 90 }} required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Rate/hr</label><input type="number" step="0.01" value={timeForm.hourlyRate} onChange={(e) => setTimeForm((f) => ({ ...f, hourlyRate: e.target.value }))} style={{ width: 100 }} /></div>
            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={timeForm.billable} onChange={(e) => setTimeForm((f) => ({ ...f, billable: e.target.checked }))} style={{ width: 'auto' }} /><label style={{ margin: 0 }}>Billable</label>
            </div>
            <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Notes</label><input value={timeForm.description} onChange={(e) => setTimeForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Add</button>
          </form>
        )}
        {job.timeEntries.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No time logged yet.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Employee</th><th>Hours</th><th>Rate</th><th>Value</th><th>Billable</th><th></th></tr></thead>
            <tbody>
              {job.timeEntries.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.entry_date).toLocaleDateString()}</td><td>{t.first_name ? `${t.first_name} ${t.last_name}` : '—'}</td>
                  <td>{t.hours}</td><td>{money(t.hourly_rate)}</td><td>{money(t.hours * t.hourly_rate)}</td>
                  <td>{t.billable ? (t.invoiced ? 'Invoiced' : 'Yes') : 'No'}</td>
                  <td>{!t.invoiced && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeTime(t.id)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Expenses</h2>
          {!job.sales_invoice_id && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setAddingExpense((c) => !c)}>{addingExpense ? 'Cancel' : '+ Log Expense'}</button>}
        </div>
        {addingExpense && (
          <form onSubmit={submitExpense} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}><label>Date</label><input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((f) => ({ ...f, expenseDate: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Description</label><input value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Amount</label><input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} style={{ width: 100 }} required /></div>
            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={expenseForm.billable} onChange={(e) => setExpenseForm((f) => ({ ...f, billable: e.target.checked }))} style={{ width: 'auto' }} /><label style={{ margin: 0 }}>Billable</label>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Add</button>
          </form>
        )}
        {job.expenses.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No expenses logged yet.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Billable</th><th></th></tr></thead>
            <tbody>
              {job.expenses.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.expense_date).toLocaleDateString()}</td><td>{e.description}</td><td>{money(e.amount)}</td>
                  <td>{e.billable ? (e.invoiced ? 'Invoiced' : 'Yes') : 'No'}</td>
                  <td>{!e.invoiced && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeExpense(e.id)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

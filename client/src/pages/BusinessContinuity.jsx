import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';

const CATEGORIES = ['operational', 'financial', 'technology', 'supply_chain', 'regulatory', 'human_resources', 'natural_disaster', 'reputational', 'other'];
const label = (s) => s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TABS = [
  { key: 'risks', label: 'Risk Register' },
  { key: 'bia', label: 'Business Impact Analysis' },
  { key: 'plans', label: 'Continuity Plans' },
  { key: 'incidents', label: 'Incident Log' },
];

export default function BusinessContinuity() {
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab || 'risks');
  return (
    <DashboardLayout title="Business Continuity Monitoring">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'risks' && <RiskRegister />}
      {tab === 'bia' && <BusinessImpactAnalysis />}
      {tab === 'plans' && <ContinuityPlans />}
      {tab === 'incidents' && <IncidentLog />}
    </DashboardLayout>
  );
}

function riskBadgeColor(score) {
  if (score >= 15) return 'badge-danger';
  if (score >= 8) return 'badge-warning';
  return 'badge-neutral';
}

// ============================================================================
function RiskRegister() {
  const confirm = useConfirm();
  const [risks, setRisks] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { category: 'operational', title: '', description: '', likelihood: 3, impact: 3, ownerEmployeeId: '', mitigationPlan: '', reviewDate: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/bcm/risks').then(({ data }) => setRisks(data)); }
  useEffect(() => { load(); api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, []);

  function startCreate() {
    setEditingId(null);
    setForm(blankForm);
    setCreating((c) => !c);
  }

  function startEdit(r) {
    setCreating(false);
    setEditingId(r.id);
    setForm({
      category: r.category, title: r.title, description: r.description || '',
      likelihood: r.likelihood, impact: r.impact, ownerEmployeeId: r.owner_employee_id || '',
      mitigationPlan: r.mitigation_plan || '', reviewDate: r.review_date ? r.review_date.slice(0, 10) : '',
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, likelihood: Number(form.likelihood), impact: Number(form.impact), ownerEmployeeId: form.ownerEmployeeId || null };
    try {
      if (editingId) {
        await api.patch(`/bcm/risks/${editingId}`, payload);
        setEditingId(null);
      } else {
        await api.post('/bcm/risks', payload);
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save risk');
    }
  }

  async function updateStatus(id, status) {
    await api.patch(`/bcm/risks/${id}`, { status });
    load();
  }

  async function remove(r) {
    const ok = await confirm(`Delete risk "${r.title}"? This cannot be undone.`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/bcm/risks/${r.id}`);
    load();
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Risk Register</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Risk'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Risk score = Likelihood × Impact (1–5 each). A score of 15+ is treated as needing active attention.</p>

      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          {editingId && <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 0 }}>Editing risk — <button type="button" onClick={() => { setEditingId(null); setForm(blankForm); }} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>cancel</button></p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 250px' }}><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="form-group"><label>Likelihood (1–5)</label><input type="number" min="1" max="5" value={form.likelihood} onChange={(e) => setForm((f) => ({ ...f, likelihood: e.target.value }))} style={{ width: 80 }} /></div>
            <div className="form-group"><label>Impact (1–5)</label><input type="number" min="1" max="5" value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value }))} style={{ width: 80 }} /></div>
            <div className="form-group">
              <label>Owner</label>
              <select value={form.ownerEmployeeId} onChange={(e) => setForm((f) => ({ ...f, ownerEmployeeId: e.target.value }))}>
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Review date</label><input type="date" value={form.reviewDate} onChange={(e) => setForm((f) => ({ ...f, reviewDate: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="form-group"><label>Mitigation plan</label><textarea value={form.mitigationPlan} onChange={(e) => setForm((f) => ({ ...f, mitigationPlan: e.target.value }))} rows={2} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save Risk'}</button>
        </form>
      )}

      {risks === null ? <p>Loading...</p> : risks.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No risks recorded yet.</p> : (
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Score</th><th>Status</th><th>Owner</th><th>Review Date</th><th></th></tr></thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td style={{ textTransform: 'capitalize' }}>{label(r.category)}</td>
                <td><span className={`badge ${riskBadgeColor(r.risk_score)}`}>{r.risk_score}</span></td>
                <td>
                  <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ padding: '2px 6px', borderRadius: 6, fontSize: 12.5 }}>
                    <option value="identified">Identified</option><option value="monitoring">Monitoring</option>
                    <option value="mitigating">Mitigating</option><option value="resolved">Resolved</option><option value="accepted">Accepted</option>
                  </select>
                </td>
                <td>{r.owner_first_name ? `${r.owner_first_name} ${r.owner_last_name}` : '—'}</td>
                <td>{r.review_date ? new Date(r.review_date).toLocaleDateString() : '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(r)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(r)}>Delete</button>
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
function BusinessImpactAnalysis() {
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { functionName: '', department: '', rtoHours: '', rpoHours: '', impactIfDisrupted: '', keyDependencies: '', backupPlan: '' };
  const [form, setForm] = useState(blankForm);
  const confirm = useConfirm();

  function load() { api.get('/bcm/critical-functions').then(({ data }) => setList(data)); }
  useEffect(load, []);

  function startCreate() {
    setEditingId(null);
    setForm(blankForm);
    setCreating((c) => !c);
  }

  function startEdit(f) {
    setCreating(false);
    setEditingId(f.id);
    setForm({
      functionName: f.function_name, department: f.department || '', rtoHours: f.rto_hours, rpoHours: f.rpo_hours,
      impactIfDisrupted: f.impact_if_disrupted || '', keyDependencies: f.key_dependencies || '', backupPlan: f.backup_plan || '',
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, rtoHours: Number(form.rtoHours), rpoHours: Number(form.rpoHours) };
    try {
      if (editingId) {
        await api.patch(`/bcm/critical-functions/${editingId}`, payload);
        setEditingId(null);
      } else {
        await api.post('/bcm/critical-functions', payload);
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save critical function');
    }
  }

  async function remove(f) {
    const ok = await confirm(`Delete critical function "${f.function_name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/bcm/critical-functions/${f.id}`);
    load();
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Business Impact Analysis</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Critical Function'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Which business functions actually need to keep running, how long they can tolerate being down (RTO), and how much data loss they can tolerate (RPO).
      </p>

      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 220px' }}><label>Function name</label><input value={form.functionName} onChange={(e) => setForm((f) => ({ ...f, functionName: e.target.value }))} required /></div>
            <div className="form-group"><label>Department</label><input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></div>
            <div className="form-group"><label>RTO (hours)</label><input type="number" step="0.5" value={form.rtoHours} onChange={(e) => setForm((f) => ({ ...f, rtoHours: e.target.value }))} style={{ width: 100 }} required /></div>
            <div className="form-group"><label>RPO (hours)</label><input type="number" step="0.5" value={form.rpoHours} onChange={(e) => setForm((f) => ({ ...f, rpoHours: e.target.value }))} style={{ width: 100 }} required /></div>
          </div>
          <div className="form-group"><label>Impact if disrupted</label><textarea value={form.impactIfDisrupted} onChange={(e) => setForm((f) => ({ ...f, impactIfDisrupted: e.target.value }))} rows={2} /></div>
          <div className="form-group"><label>Key dependencies</label><textarea value={form.keyDependencies} onChange={(e) => setForm((f) => ({ ...f, keyDependencies: e.target.value }))} rows={2} /></div>
          <div className="form-group"><label>Backup plan</label><textarea value={form.backupPlan} onChange={(e) => setForm((f) => ({ ...f, backupPlan: e.target.value }))} rows={2} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No critical functions defined yet.</p> : (
        <table>
          <thead><tr><th>Function</th><th>Department</th><th>RTO (hrs)</th><th>RPO (hrs)</th><th>Key Dependencies</th><th></th></tr></thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td>{f.function_name}</td><td>{f.department || '—'}</td><td>{f.rto_hours}</td><td>{f.rpo_hours}</td><td>{f.key_dependencies || '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(f)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(f)}>Delete</button>
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
function ContinuityPlans() {
  const [list, setList] = useState(null);
  const [risks, setRisks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { riskId: '', planName: '', scenario: '', actionSteps: '', status: 'draft', lastTestedDate: '', nextTestDue: '' };
  const [form, setForm] = useState(blankForm);
  const confirm = useConfirm();

  function load() { api.get('/bcm/continuity-plans').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/bcm/risks').then(({ data }) => setRisks(data)).catch(() => setRisks([])); }, []);

  function startCreate() {
    setEditingId(null);
    setForm(blankForm);
    setCreating((c) => !c);
  }

  function startEdit(p) {
    setCreating(false);
    setEditingId(p.id);
    setForm({
      riskId: p.risk_id || '', planName: p.plan_name, scenario: p.scenario, actionSteps: p.action_steps, status: p.status,
      lastTestedDate: p.last_tested_date ? p.last_tested_date.slice(0, 10) : '', nextTestDue: p.next_test_due ? p.next_test_due.slice(0, 10) : '',
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, riskId: form.riskId || null };
    try {
      if (editingId) {
        await api.patch(`/bcm/continuity-plans/${editingId}`, payload);
        setEditingId(null);
      } else {
        await api.post('/bcm/continuity-plans', payload);
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save continuity plan');
    }
  }

  async function remove(p) {
    const ok = await confirm(`Delete continuity plan "${p.plan_name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/bcm/continuity-plans/${p.id}`);
    load();
  }

  const isOverdue = (p) => p.next_test_due && new Date(p.next_test_due) < new Date();
  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Continuity Plans</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Plan'}</button>
      </div>

      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 220px' }}><label>Plan name</label><input value={form.planName} onChange={(e) => setForm((f) => ({ ...f, planName: e.target.value }))} required /></div>
            <div className="form-group">
              <label>Linked risk (optional)</label>
              <select value={form.riskId} onChange={(e) => setForm((f) => ({ ...f, riskId: e.target.value }))}>
                <option value="">None</option>
                {risks.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option><option value="active">Active</option><option value="needs_review">Needs Review</option>
              </select>
            </div>
            <div className="form-group"><label>Last tested</label><input type="date" value={form.lastTestedDate} onChange={(e) => setForm((f) => ({ ...f, lastTestedDate: e.target.value }))} /></div>
            <div className="form-group"><label>Next test due</label><input type="date" value={form.nextTestDue} onChange={(e) => setForm((f) => ({ ...f, nextTestDue: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Scenario (what triggers this plan)</label><textarea value={form.scenario} onChange={(e) => setForm((f) => ({ ...f, scenario: e.target.value }))} rows={2} required /></div>
          <div className="form-group"><label>Action steps</label><textarea value={form.actionSteps} onChange={(e) => setForm((f) => ({ ...f, actionSteps: e.target.value }))} rows={3} required /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save Plan'}</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No continuity plans yet.</p> : (
        <table>
          <thead><tr><th>Plan</th><th>Linked Risk</th><th>Status</th><th>Last Tested</th><th>Next Test Due</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.plan_name}</td><td>{p.risk_title || '—'}</td>
                <td><span className={`badge ${p.status === 'active' ? 'badge-success' : p.status === 'needs_review' ? 'badge-warning' : 'badge-neutral'}`}>{label(p.status)}</span></td>
                <td>{p.last_tested_date ? new Date(p.last_tested_date).toLocaleDateString() : 'Never'}</td>
                <td style={isOverdue(p) ? { color: 'var(--color-error)' } : undefined}>{p.next_test_due ? new Date(p.next_test_due).toLocaleDateString() : '—'}{isOverdue(p) ? ' (overdue)' : ''}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(p)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(p)}>Delete</button>
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
function IncidentLog() {
  const [list, setList] = useState(null);
  const [risks, setRisks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { riskId: '', incidentDate: new Date().toISOString().slice(0, 10), category: 'operational', title: '', description: '', severity: 'medium', impactDurationHours: '', responseTaken: '' };
  const [form, setForm] = useState(blankForm);
  const confirm = useConfirm();

  function load() { api.get('/bcm/incidents').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/bcm/risks').then(({ data }) => setRisks(data)).catch(() => setRisks([])); }, []);

  function startCreate() {
    setEditingId(null);
    setForm(blankForm);
    setCreating((c) => !c);
  }

  function startEdit(i) {
    setCreating(false);
    setEditingId(i.id);
    setForm({
      riskId: i.risk_id || '', incidentDate: i.incident_date.slice(0, 10), category: i.category, title: i.title,
      description: i.description || '', severity: i.severity, impactDurationHours: i.impact_duration_hours || '', responseTaken: i.response_taken || '',
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, riskId: form.riskId || null, impactDurationHours: form.impactDurationHours ? Number(form.impactDurationHours) : null };
    try {
      if (editingId) {
        await api.patch(`/bcm/incidents/${editingId}`, payload);
        setEditingId(null);
      } else {
        await api.post('/bcm/incidents', payload);
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save incident');
    }
  }

  async function resolve(id) {
    const lessonsLearned = window.prompt('Lessons learned (optional):') || '';
    await api.patch(`/bcm/incidents/${id}/resolve`, { lessonsLearned });
    load();
  }

  async function remove(i) {
    const ok = await confirm(`Delete incident "${i.title}"? This cannot be undone.`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/bcm/incidents/${i.id}`);
    load();
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Incident Log</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ Log Incident'}</button>
      </div>

      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group"><label>Date</label><input type="date" value={form.incidentDate} onChange={(e) => setForm((f) => ({ ...f, incidentDate: e.target.value }))} required /></div>
            <div className="form-group">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Severity</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 220px' }}><label>Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="form-group"><label>Duration (hrs)</label><input type="number" step="0.25" value={form.impactDurationHours} onChange={(e) => setForm((f) => ({ ...f, impactDurationHours: e.target.value }))} style={{ width: 100 }} /></div>
            <div className="form-group">
              <label>Linked risk (optional)</label>
              <select value={form.riskId} onChange={(e) => setForm((f) => ({ ...f, riskId: e.target.value }))}>
                <option value="">None</option>
                {risks.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="form-group"><label>Response taken</label><textarea value={form.responseTaken} onChange={(e) => setForm((f) => ({ ...f, responseTaken: e.target.value }))} rows={2} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Log Incident'}</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No incidents logged yet.</p> : (
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Severity</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>{new Date(i.incident_date).toLocaleDateString()}</td><td>{i.title}</td><td style={{ textTransform: 'capitalize' }}>{label(i.category)}</td>
                <td><span className={`badge ${i.severity === 'critical' || i.severity === 'high' ? 'badge-danger' : i.severity === 'medium' ? 'badge-warning' : 'badge-neutral'}`}>{label(i.severity)}</span></td>
                <td>{i.is_resolved ? <span className="badge badge-success">Resolved</span> : <span className="badge badge-neutral">Open</span>}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!i.is_resolved && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => resolve(i.id)}>Resolve</button>}
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

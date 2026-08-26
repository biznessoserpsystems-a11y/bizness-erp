import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BarChartWidget, PieChartWidget } from '../components/charts';

const CYCLE_STATUS_BADGE = { draft: 'badge-neutral', active: 'badge-success', closed: 'badge-danger' };

export default function Performance() {
  const [tab, setTab] = useState('kpis');

  return (
    <DashboardLayout title="Performance Management">
      <div className="toolbar">
        {[['kpis', 'KPIs'], ['cycles', 'Review Cycles'], ['reports', 'Reports']].map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'kpis' && <KpisTab />}
      {tab === 'cycles' && <CyclesTab />}
      {tab === 'reports' && <ReportsTab />}
    </DashboardLayout>
  );
}

// ============================================================
// KPIs
// ============================================================

function KpisTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.performance.manage');
  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/kpis').then(({ data }) => setKpis(data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggleActive(kpi) {
    try {
      await api.patch(`/kpis/${kpi.id}`, { isActive: !kpi.is_active });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update KPI', 'error');
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>KPI catalog</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New KPI</button>}
        </div>
        {loading ? <p>Loading...</p> : kpis.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <h3>No KPIs defined yet</h3>
            <p>Define one to attach measurable goals to.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Department</th><th>Unit</th><th>Direction</th><th>Status</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.name}</td>
                  <td>{k.department || 'Company-wide'}</td>
                  <td>{k.unit || '—'}</td>
                  <td>{k.target_direction === 'higher_is_better' ? 'Higher is better' : 'Lower is better'}</td>
                  <td><span className={`badge ${k.is_active ? 'badge-success' : 'badge-neutral'}`}>{k.is_active ? 'active' : 'inactive'}</span></td>
                  {canManage && <td><button className="btn btn-secondary btn-sm" onClick={() => toggleActive(k)}>{k.is_active ? 'Deactivate' : 'Activate'}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <KpiModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function KpiModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [unit, setUnit] = useState('');
  const [targetDirection, setTargetDirection] = useState('higher_is_better');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/kpis', { name, department: department || undefined, unit: unit || undefined, targetDirection, description: description || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create KPI');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New KPI</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Sales Growth" /></div>
          <div className="form-group"><label>Department</label><input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Leave blank for company-wide" /></div>
          <div className="form-group"><label>Unit</label><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. %, GHS, count" /></div>
          <div className="form-group">
            <label>Direction</label>
            <select value={targetDirection} onChange={(e) => setTargetDirection(e.target.value)}>
              <option value="higher_is_better">Higher is better</option>
              <option value="lower_is_better">Lower is better</option>
            </select>
          </div>
          <div className="form-group"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create KPI'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Review Cycles
// ============================================================

function CyclesTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.performance.manage');
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/performance-cycles').then(({ data }) => setCycles(data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function updateStatus(cycle, status) {
    try {
      await api.patch(`/performance-cycles/${cycle.id}`, { status });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update cycle', 'error');
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Review cycles</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New cycle</button>}
        </div>
        {loading ? <p>Loading...</p> : cycles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔄</div>
            <h3>No review cycles yet</h3>
            <p>Create one to start collecting reviews.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th><th>Status</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.cycle_type.replace('_', ' ')}</td>
                  <td>{new Date(c.start_date).toLocaleDateString()}</td>
                  <td>{new Date(c.end_date).toLocaleDateString()}</td>
                  <td><span className={`badge ${CYCLE_STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                  {canManage && (
                    <td>
                      <select value={c.status} onChange={(e) => updateStatus(c, e.target.value)}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <CycleModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function CycleModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [cycleType, setCycleType] = useState('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/performance-cycles', { name, cycleType, startDate, endDate });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create cycle');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New review cycle</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. 2026 Annual Review" /></div>
          <div className="form-group">
            <label>Type</label>
            <select value={cycleType} onChange={(e) => setCycleType(e.target.value)}>
              <option value="annual">Annual</option>
              <option value="semi_annual">Semi-annual</option>
              <option value="quarterly">Quarterly</option>
              <option value="probation">Probation</option>
              <option value="ad_hoc">Ad hoc</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Start date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
            <div className="form-group" style={{ flex: 1 }}><label>End date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create cycle'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Reports
// ============================================================

function ReportsTab() {
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/performance-cycles').then(({ data }) => {
      setCycles(data);
      if (data.length > 0) setCycleId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (cycleId) api.get(`/hr-reports/performance-summary?cycleId=${cycleId}`).then(({ data }) => setSummary(data)).catch(() => setSummary(null));
  }, [cycleId]);

  if (cycles.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <h3>No review cycles yet</h3>
          <p>Create a review cycle first to see reports.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="chart-grid">
        <BarChartWidget
          title="Average supervisor rating by department"
          loading={summary === null}
          data={(summary?.byDepartment || []).map((d) => ({ name: d.department, rating: Number(d.avg_rating) }))}
          bars={[{ key: 'rating', label: 'Avg rating (1-5)' }]}
          colorByCategory
        />
        <PieChartWidget
          title="Goal completion (all-time)"
          loading={summary === null}
          data={(summary?.goalCompletion || []).map((g) => ({ name: g.status.replace('_', ' '), value: g.count }))}
        />
      </div>

      <div className="card">
        <h2>Promotion recommendations</h2>
        {summary === null ? <p>Loading...</p> : summary.promotions.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No promotion recommendations in this cycle.</p>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Job title</th><th>Department</th><th>Rating</th><th>Notes</th></tr></thead>
            <tbody>
              {summary.promotions.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</td>
                  <td>{p.job_title || '—'}</td>
                  <td>{p.department || '—'}</td>
                  <td>{p.overall_rating || '—'}</td>
                  <td>{p.promotion_notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

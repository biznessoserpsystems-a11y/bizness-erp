import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import AttachmentsPanel from '../components/AttachmentsPanel';
import { PieChartWidget, BarChartWidget } from '../components/charts';

const DOC_TYPES = ['work_permit', 'professional_license', 'ssnit_certificate', 'background_check', 'drug_test', 'business_license', 'other'];
const EXPIRY_BADGE = { expired: 'badge-danger', expiring_soon: 'badge-danger', valid: 'badge-success', no_expiry: 'badge-neutral' };
const EXPIRY_LABEL = { expired: 'Expired', expiring_soon: 'Expiring soon', valid: 'Valid', no_expiry: 'No expiry' };
const INCIDENT_TYPES = ['grievance', 'disciplinary', 'safety_incident', 'harassment_complaint', 'other'];
const INCIDENT_STATUS_BADGE = { open: 'badge-danger', investigating: 'badge-neutral', resolved: 'badge-success', closed: 'badge-neutral' };

export default function Compliance() {
  const { user } = useAuth();
  const canManage = (user?.permissions || []).includes('hr.compliance.manage');
  const [tab, setTab] = useState('documents');

  return (
    <DashboardLayout title="HR Compliance">
      <div className="toolbar">
        {[
          ['documents', 'Compliance Documents'],
          ['policies', 'Policies'],
          ['incidents', 'Incidents & Grievances'],
          ...(canManage ? [['reports', 'Reports']] : []),
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'documents' && <DocumentsTab canManage={canManage} />}
      {tab === 'policies' && <PoliciesTab canManage={canManage} />}
      {tab === 'incidents' && <IncidentsTab canManage={canManage} />}
      {tab === 'reports' && canManage && <ReportsTab />}
    </DashboardLayout>
  );
}

// ============================================================
// Compliance documents
// ============================================================

function DocumentsTab({ canManage }) {
  const [documents, setDocuments] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filesDoc, setFilesDoc] = useState(null);
  const { showToast } = useToast();

  function load() {
    api.get('/compliance-documents').then(({ data }) => setDocuments(data)).catch(() => setDocuments([]));
  }
  useEffect(load, []);
  useEffect(() => { if (canManage) api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => {}); }, [canManage]);

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Compliance documents</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New document</button>}
        </div>
        {documents === null ? <p>Loading...</p> : documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No compliance documents yet</h3>
            <p>Track work permits, licenses, certifications, and other statutory documents here.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Document</th><th>Employee</th><th>Type</th><th>Issuing authority</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.document_name}</td>
                  <td>{d.first_name ? `${d.first_name} ${d.last_name}` : <em style={{ color: 'var(--color-text-muted)' }}>Company-wide</em>}</td>
                  <td>{d.document_type.replace(/_/g, ' ')}</td>
                  <td>{d.issuing_authority || '—'}</td>
                  <td>
                    {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : '—'}
                    {' '}<span className={`badge ${EXPIRY_BADGE[d.expiry_state]}`}>{EXPIRY_LABEL[d.expiry_state]}</span>
                  </td>
                  <td><span className="badge badge-neutral">{d.status.replace('_', ' ')}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => setFilesDoc(d)}>Files</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <DocumentModal employees={employees} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); showToast('Document added.', 'success'); }} />
      )}
      {filesDoc && (
        <div className="modal-overlay" onClick={() => setFilesDoc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Files — {filesDoc.document_name}</h2>
            <AttachmentsPanel relatedType="compliance_document" relatedId={filesDoc.id} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setFilesDoc(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DocumentModal({ employees, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState('');
  const [documentType, setDocumentType] = useState('work_permit');
  const [documentName, setDocumentName] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/compliance-documents', {
        employeeId: employeeId || undefined, documentType, documentName,
        issuingAuthority: issuingAuthority || undefined, issueDate: issueDate || undefined, expiryDate: expiryDate || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create document');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New compliance document</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Company-wide (not tied to an employee)</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Document type</label>
            <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} required>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Document name</label><input value={documentName} onChange={(e) => setDocumentName(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Issuing authority</label><input value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} placeholder="Optional" /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Expiry date</label><input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create document'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Policies
// ============================================================

function PoliciesTab({ canManage }) {
  const [policies, setPolicies] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [ackList, setAckList] = useState(null);
  const { showToast } = useToast();

  function load() {
    api.get('/company-policies').then(({ data }) => setPolicies(data)).catch(() => setPolicies([]));
  }
  useEffect(load, []);

  async function acknowledge(policy) {
    try {
      await api.post(`/company-policies/${policy.id}/acknowledge`, {});
      load();
      showToast('Policy acknowledged.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to acknowledge policy', 'error');
    }
  }

  async function viewAcknowledgments(policy) {
    const { data } = await api.get(`/company-policies/${policy.id}/acknowledgments`);
    setAckList({ policy, rows: data });
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Company policies</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New policy</button>}
        </div>
        {policies === null ? <p>Loading...</p> : policies.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No policies published yet.</p>
        ) : (
          <table>
            <thead><tr><th>Policy</th><th>Version</th><th>Effective</th><th>Acknowledgments</th><th></th></tr></thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.version}</td>
                  <td>{new Date(p.effective_date).toLocaleDateString()}</td>
                  <td>{p.acknowledgment_count}</td>
                  <td>
                    {p.acknowledged_by_me ? (
                      <span className="badge badge-success">Acknowledged</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => acknowledge(p)}>Acknowledge</button>
                    )}
                    {canManage && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => viewAcknowledgments(p)}>Who's acknowledged?</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <PolicyModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}

      {ackList && (
        <div className="modal-overlay" onClick={() => setAckList(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{ackList.policy.name} — acknowledgments</h2>
            <ul className="feed-list">
              {ackList.rows.map((r) => (
                <li key={r.employee_id}>
                  <span className="feed-list-title">{r.first_name} {r.last_name}</span>
                  <span className="feed-list-detail">
                    {r.acknowledged_at ? <span className="badge badge-success">Acknowledged {new Date(r.acknowledged_at).toLocaleDateString()}</span> : <span className="badge badge-danger">Not yet</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setAckList(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PolicyModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/company-policies', { name, description: description || undefined, version, effectiveDate: effectiveDate || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New policy</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
          <div className="form-group"><label>Version</label><input value={version} onChange={(e) => setVersion(e.target.value)} /></div>
          <div className="form-group"><label>Effective date</label><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Publish policy'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Incidents & grievances
// ============================================================

function IncidentsTab({ canManage }) {
  const [incidents, setIncidents] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    api.get('/compliance-incidents').then(({ data }) => setIncidents(data)).catch(() => setIncidents([]));
  }
  useEffect(load, []);
  useEffect(() => { if (canManage) api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => {}); }, [canManage]);

  async function updateStatus(incident, status) {
    try {
      await api.patch(`/compliance-incidents/${incident.id}`, { status });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update incident', 'error');
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>{canManage ? 'Incidents & grievances' : 'Incidents about me'}</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Log incident</button>}
        </div>
        {incidents === null ? <p>Loading...</p> : incidents.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No incidents recorded.</p>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>Severity</th><th>Description</th><th>Date</th><th>Status</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td>{i.first_name ? `${i.first_name} ${i.last_name}` : '—'}</td>
                  <td>{i.incident_type.replace(/_/g, ' ')}</td>
                  <td><span className={`badge ${i.severity === 'high' ? 'badge-danger' : 'badge-neutral'}`}>{i.severity}</span></td>
                  <td style={{ maxWidth: 260 }}>{i.description}</td>
                  <td>{new Date(i.incident_date).toLocaleDateString()}</td>
                  <td><span className={`badge ${INCIDENT_STATUS_BADGE[i.status]}`}>{i.status}</span></td>
                  {canManage && (
                    <td>
                      {i.status !== 'resolved' && i.status !== 'closed' && (
                        <select value={i.status} onChange={(e) => updateStatus(i, e.target.value)}>
                          <option value="open">Open</option>
                          <option value="investigating">Investigating</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <IncidentModal employees={employees} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); showToast('Incident logged.', 'success'); }} />
      )}
    </>
  );
}

function IncidentModal({ employees, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState('');
  const [incidentType, setIncidentType] = useState('grievance');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/compliance-incidents', {
        employeeId: employeeId || undefined, incidentType, severity, description, incidentDate: incidentDate || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log incident');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log incident</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">General / not employee-specific</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
              {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Incident date</label><input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !description}>{submitting ? 'Saving...' : 'Log incident'}</button>
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
  const [summary, setSummary] = useState(null);

  useEffect(() => { api.get('/hr-reports/compliance-summary').then(({ data }) => setSummary(data)).catch(() => setSummary({ documentsByExpiryState: [], incidentsByStatus: [] })); }, []);

  const docChart = (summary?.documentsByExpiryState || []).map((d) => ({ name: EXPIRY_LABEL[d.expiry_state] || d.expiry_state, value: d.count }));
  const incidentChart = (summary?.incidentsByStatus || []).map((i) => ({ name: i.status, count: i.count }));

  return (
    <div className="chart-grid">
      <PieChartWidget title="Compliance documents by expiry state" loading={summary === null} data={docChart} />
      <BarChartWidget title="Incidents by status" loading={summary === null} data={incidentChart} bars={[{ key: 'count', label: 'Incidents' }]} colorByCategory />
    </div>
  );
}

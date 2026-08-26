import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import AttachmentsPanel from '../components/AttachmentsPanel';
import { BarChartWidget } from '../components/charts';

const POSTING_STATUS_BADGE = { open: 'badge-success', on_hold: 'badge-neutral', closed: 'badge-danger' };
const STAGE_BADGE = {
  applied: 'badge-neutral', screening: 'badge-neutral', interview: 'badge-success',
  offer: 'badge-success', hired: 'badge-success', rejected: 'badge-danger',
};
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const SOURCES = ['referral', 'job_board', 'direct', 'agency', 'other'];

function money(n) {
  return `GHS ${Number(n || 0).toFixed(2)}`;
}

export default function Recruitment() {
  const [tab, setTab] = useState('postings');
  const [detailId, setDetailId] = useState(null);

  if (detailId) {
    return <CandidateDetail id={detailId} onBack={() => setDetailId(null)} />;
  }

  return (
    <DashboardLayout title="Recruitment & Hiring">
      <div className="toolbar">
        {[['postings', 'Job Postings'], ['candidates', 'Candidates']].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ width: 'auto' }}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'postings' && <JobPostingsTab />}
      {tab === 'candidates' && <CandidatesTab onSelect={setDetailId} />}
    </DashboardLayout>
  );
}

// ============================================================
// Job Postings
// ============================================================

function JobPostingsTab() {
  const [postings, setPostings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/job-postings').then(({ data }) => setPostings(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateStatus(posting, status) {
    try {
      await api.patch(`/job-postings/${posting.id}`, { status });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update posting', 'error');
    }
  }

  return (
    <>
      {!loading && postings.length > 0 && (
        <BarChartWidget
          title="Open positions by department"
          data={Object.values(
            postings.filter((p) => p.status === 'open').reduce((acc, p) => {
              const key = p.department || 'Unassigned';
              acc[key] = acc[key] || { name: key, positions: 0 };
              acc[key].positions += p.positions_available;
              return acc;
            }, {})
          )}
          bars={[{ key: 'positions', label: 'Open positions' }]}
          colorByCategory
          height={260}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Job postings</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New posting</button>
        </div>
        {loading ? <p>Loading...</p> : postings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💼</div>
            <h3>No job postings yet</h3>
            <p>Create one to start building a candidate pipeline.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Title</th><th>Department</th><th>Positions</th><th>Active candidates</th><th>Target hire date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {postings.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.title}</td>
                  <td>{p.department || '—'}</td>
                  <td>{p.positions_available}</td>
                  <td>{p.active_candidate_count}</td>
                  <td>{p.target_hire_date ? new Date(p.target_hire_date).toLocaleDateString() : '—'}</td>
                  <td><span className={`badge ${POSTING_STATUS_BADGE[p.status]}`}>{p.status.replace('_', ' ')}</span></td>
                  <td>
                    <select value={p.status} onChange={(e) => updateStatus(p, e.target.value)}>
                      <option value="open">Open</option>
                      <option value="on_hold">On hold</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <JobPostingModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function JobPostingModal({ onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [positionsAvailable, setPositionsAvailable] = useState('1');
  const [targetHireDate, setTargetHireDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/job-postings', {
        title, department: department || undefined, description: description || undefined,
        positionsAvailable: Number(positionsAvailable) || 1, targetHireDate: targetHireDate || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create posting');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New job posting</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Department</label><input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          <div className="form-group"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="form-group"><label>Positions available</label><input type="number" min="1" value={positionsAvailable} onChange={(e) => setPositionsAvailable(e.target.value)} /></div>
          <div className="form-group"><label>Target hire date</label><input type="date" value={targetHireDate} onChange={(e) => setTargetHireDate(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create posting'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Candidates
// ============================================================

function CandidatesTab({ onSelect }) {
  const [candidates, setCandidates] = useState([]);
  const [postings, setPostings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    api.get(`/candidates${stageFilter ? `?stage=${stageFilter}` : ''}`).then(({ data }) => setCandidates(data)).finally(() => setLoading(false));
  }

  useEffect(load, [stageFilter]);
  useEffect(() => { api.get('/job-postings').then(({ data }) => setPostings(data)).catch(() => {}); }, []);

  return (
    <>
      {!loading && !stageFilter && candidates.length > 0 && (
        <BarChartWidget
          title="Pipeline by stage"
          data={STAGES.map((s) => ({ name: s[0].toUpperCase() + s.slice(1), count: candidates.filter((c) => c.stage === s).length }))}
          bars={[{ key: 'count', label: 'Candidates' }]}
          colorByCategory
          height={260}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Candidates</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add candidate</button>
          </div>
        </div>
        {loading ? <p>Loading...</p> : candidates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧑‍💼</div>
            <h3>No candidates yet</h3>
            <p>Add one to start moving them through the pipeline.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Applying for</th><th>Source</th><th>Expected salary</th><th>Applied</th><th>Stage</th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{c.first_name} {c.last_name}</td>
                  <td>{c.job_posting_title || '—'}</td>
                  <td>{c.source.replace('_', ' ')}</td>
                  <td>{c.expected_salary ? money(c.expected_salary) : '—'}</td>
                  <td>{new Date(c.applied_date).toLocaleDateString()}</td>
                  <td><span className={`badge ${STAGE_BADGE[c.stage]}`}>{c.stage}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <CandidateModal postings={postings} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </>
  );
}

function CandidateModal({ postings, onClose, onSaved }) {
  const [jobPostingId, setJobPostingId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('other');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/candidates', {
        jobPostingId: jobPostingId || undefined, firstName, lastName, email: email || undefined,
        phone: phone || undefined, source, expectedSalary: expectedSalary ? Number(expectedSalary) : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add candidate');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add candidate</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Applying for</label>
            <select value={jobPostingId} onChange={(e) => setJobPostingId(e.target.value)}>
              <option value="">No specific posting</option>
              {postings.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="form-group"><label>First name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Last name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></div>
          <div className="form-group"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="form-group"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="form-group">
            <label>Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Expected salary (GHS/month)</label><input type="number" min="0" value={expectedSalary} onChange={(e) => setExpectedSalary(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Add candidate'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Candidate detail
// ============================================================

function CandidateDetail({ id, onBack }) {
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get(`/candidates/${id}`).then(({ data }) => setCandidate(data)).finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function moveStage(stage) {
    try {
      await api.patch(`/candidates/${id}`, { stage });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update stage', 'error');
    }
  }

  if (loading || !candidate) return <DashboardLayout title="Candidate"><p>Loading...</p></DashboardLayout>;

  return (
    <DashboardLayout title={`${candidate.first_name} ${candidate.last_name}`}>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>← Back to candidates</button>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>{candidate.first_name} {candidate.last_name}</h2>
          <span className={`badge ${STAGE_BADGE[candidate.stage]}`}>{candidate.stage}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Applying for</div><div style={{ fontWeight: 600 }}>{candidate.job_posting_title || '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Email</div><div style={{ fontWeight: 600 }}>{candidate.email || '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Phone</div><div style={{ fontWeight: 600 }}>{candidate.phone || '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Source</div><div style={{ fontWeight: 600 }}>{candidate.source.replace('_', ' ')}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Expected salary</div><div style={{ fontWeight: 600 }}>{candidate.expected_salary ? money(candidate.expected_salary) : '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Applied</div><div style={{ fontWeight: 600 }}>{new Date(candidate.applied_date).toLocaleDateString()}</div></div>
        </div>

        {candidate.stage !== 'hired' && candidate.stage !== 'rejected' && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STAGES.filter((s) => !['hired', 'rejected'].includes(s) && s !== candidate.stage).map((s) => (
              <button key={s} className="btn btn-secondary btn-sm" onClick={() => moveStage(s)}>Move to {s}</button>
            ))}
            {candidate.stage === 'offer' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowHireModal(true)}>Hire</button>
            )}
            <RejectBox candidateId={id} onDone={load} />
          </div>
        )}
        {candidate.stage === 'hired' && (
          <p style={{ marginTop: 12, color: 'var(--color-success)', fontWeight: 600 }}>Hired — converted to an employee record.</p>
        )}
        {candidate.stage === 'rejected' && candidate.rejected_reason && (
          <p style={{ marginTop: 12, color: 'var(--color-text-muted)' }}>Rejected: {candidate.rejected_reason}</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Interviews</h2>
          {candidate.stage !== 'hired' && candidate.stage !== 'rejected' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowInterviewModal(true)}>+ Add interview</button>
          )}
        </div>
        {candidate.interviews.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No interviews recorded yet.</p>
        ) : (
          <ul className="feed-list">
            {candidate.interviews.map((iv) => (
              <li key={iv.id}>
                <span className="feed-list-title">{iv.round_name} {iv.rating ? `· ${'★'.repeat(iv.rating)}${'☆'.repeat(5 - iv.rating)}` : ''}</span>
                <span className="feed-list-detail">
                  <span className={`badge ${iv.outcome === 'pass' ? 'badge-success' : iv.outcome === 'fail' ? 'badge-danger' : 'badge-neutral'}`}>{iv.outcome}</span>
                  {' '}{iv.interviewer_notes}
                </span>
                <span className="feed-list-time">{iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : 'Not scheduled'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Resume &amp; documents</h2>
        <AttachmentsPanel relatedType="candidate" relatedId={id} />
      </div>

      {showInterviewModal && (
        <InterviewModal candidateId={id} onClose={() => setShowInterviewModal(false)} onSaved={() => { setShowInterviewModal(false); load(); }} />
      )}
      {showHireModal && (
        <HireModal candidate={candidate} onClose={() => setShowHireModal(false)} onHired={() => { setShowHireModal(false); load(); }} />
      )}
    </DashboardLayout>
  );
}

function RejectBox({ candidateId, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  async function submit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await api.patch(`/candidates/${candidateId}`, { stage: 'rejected', rejectedReason: reason });
      onDone();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reject candidate', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Reject</button>;
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minWidth: 200 }} />
      <button className="btn btn-danger btn-sm" style={{ width: 'auto' }} onClick={submit} disabled={submitting || !reason.trim()}>Confirm reject</button>
    </div>
  );
}

function InterviewModal({ candidateId, onClose, onSaved }) {
  const [roundName, setRoundName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [outcome, setOutcome] = useState('pending');
  const [rating, setRating] = useState('');
  const [interviewerNotes, setInterviewerNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/candidates/${candidateId}/interviews`, {
        roundName, scheduledAt: scheduledAt || undefined, outcome,
        rating: rating ? Number(rating) : undefined, interviewerNotes: interviewerNotes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add interview');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add interview round</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Round name</label><input value={roundName} onChange={(e) => setRoundName(e.target.value)} required autoFocus placeholder="e.g. Phone Screen" /></div>
          <div className="form-group"><label>Scheduled at</label><input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          <div className="form-group">
            <label>Outcome</label>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
            </select>
          </div>
          <div className="form-group">
            <label>Rating (1-5)</label>
            <input type="number" min="1" max="5" value={rating} onChange={(e) => setRating(e.target.value)} />
          </div>
          <div className="form-group"><label>Notes</label><input value={interviewerNotes} onChange={(e) => setInterviewerNotes(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Add interview'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HireModal({ candidate, onClose, onHired }) {
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [basicSalary, setBasicSalary] = useState(candidate.expected_salary || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/candidates/${candidate.id}/hire`, {
        jobTitle: jobTitle || undefined, department: department || undefined, hireDate,
        basicSalary: basicSalary ? Number(basicSalary) : undefined,
      });
      onHired();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to hire candidate');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Hire {candidate.first_name} {candidate.last_name}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This creates a new employee record and marks this candidate as hired.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Job title</label><input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={candidate.job_posting_title || ''} /></div>
          <div className="form-group"><label>Department</label><input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          <div className="form-group"><label>Hire date</label><input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} required /></div>
          <div className="form-group"><label>Basic salary (GHS/month)</label><input type="number" min="0" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Hiring...' : 'Confirm hire'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

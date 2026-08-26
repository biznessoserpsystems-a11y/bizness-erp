import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BarChartWidget, formatMoney } from '../components/charts';

const DELIVERY_BADGE = { internal: 'badge-neutral', external: 'badge-info' };
const SESSION_STATUS_BADGE = { scheduled: 'badge-neutral', ongoing: 'badge-success', completed: 'badge-success', cancelled: 'badge-danger' };
const PRIORITY_BADGE = { low: 'badge-neutral', medium: 'badge-neutral', high: 'badge-danger' };
const NEED_STATUS_BADGE = { identified: 'badge-neutral', planned: 'badge-neutral', addressed: 'badge-success' };

function money(n) { return formatMoney(n); }

export default function Learning() {
  const [tab, setTab] = useState('courses');
  const [detailSessionId, setDetailSessionId] = useState(null);

  if (detailSessionId) {
    return <SessionDetail id={detailSessionId} onBack={() => setDetailSessionId(null)} />;
  }

  return (
    <DashboardLayout title="Learning &amp; Development">
      <div className="toolbar">
        {[['courses', 'Courses'], ['calendar', 'Training Calendar'], ['needs', 'Needs Assessment']].map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'courses' && <CoursesTab />}
      {tab === 'calendar' && <CalendarTab onSelectSession={setDetailSessionId} />}
      {tab === 'needs' && <NeedsTab />}
    </DashboardLayout>
  );
}

// ============================================================
// Courses
// ============================================================

function CoursesTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.training.manage');
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/training-courses').then(({ data }) => setCourses(data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggleActive(course) {
    try {
      await api.patch(`/training-courses/${course.id}`, { isActive: !course.is_active });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update course', 'error');
    }
  }

  return (
    <>
      {!loading && courses.length > 0 && (
        <BarChartWidget
          title="Courses by category"
          data={Object.values(courses.reduce((acc, c) => {
            const key = c.category || 'Uncategorized';
            acc[key] = acc[key] || { name: key, count: 0 };
            acc[key].count += 1;
            return acc;
          }, {}))}
          bars={[{ key: 'count', label: 'Courses' }]}
          colorByCategory
          height={240}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Course catalog</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New course</button>}
        </div>
        {loading ? <p>Loading...</p> : courses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <h3>No courses yet</h3>
            <p>Add one to start building your training calendar.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Title</th><th>Category</th><th>Type</th><th>Provider</th><th>Duration</th><th>Cost/participant</th><th>Sessions</th><th>Status</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td>{c.category || '—'}</td>
                  <td><span className={`badge ${DELIVERY_BADGE[c.delivery_type]}`}>{c.delivery_type}</span></td>
                  <td>{c.provider || '—'}</td>
                  <td>{c.duration_hours ? `${c.duration_hours}h` : '—'}</td>
                  <td>{money(c.cost_per_participant)}</td>
                  <td>{c.session_count}</td>
                  <td><span className={`badge ${c.is_active ? 'badge-success' : 'badge-neutral'}`}>{c.is_active ? 'active' : 'inactive'}</span></td>
                  {canManage && <td><button className="btn btn-secondary btn-sm" onClick={() => toggleActive(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <CourseModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function CourseModal({ onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [deliveryType, setDeliveryType] = useState('internal');
  const [provider, setProvider] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [costPerParticipant, setCostPerParticipant] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/training-courses', {
        title, category: category || undefined, deliveryType, provider: provider || undefined,
        durationHours: durationHours ? Number(durationHours) : undefined,
        costPerParticipant: costPerParticipant ? Number(costPerParticipant) : undefined,
        description: description || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create course');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New course</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Category</label><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Compliance, Technical, Leadership" /></div>
          <div className="form-group">
            <label>Delivery type</label>
            <select value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)}>
              <option value="internal">Internal</option>
              <option value="external">External</option>
            </select>
          </div>
          <div className="form-group"><label>Provider</label><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Internal team or vendor name" /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Duration (hours)</label><input type="number" min="0" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Cost/participant (GHS)</label><input type="number" min="0" value={costPerParticipant} onChange={(e) => setCostPerParticipant(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create course'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Training Calendar (sessions)
// ============================================================

function CalendarTab({ onSelectSession }) {
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission('hr.training.manage');
  const [sessions, setSessions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/training-sessions').then(({ data }) => setSessions(data)).finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => { api.get('/training-courses').then(({ data }) => setCourses(data.filter((c) => c.is_active))).catch(() => {}); }, []);

  async function selfEnroll(session) {
    try {
      await api.post(`/training-sessions/${session.id}/enroll`, {});
      showToast('Enrolled!', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to enroll', 'error');
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Upcoming &amp; past sessions</h2>
          {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Schedule session</button>}
        </div>
        {loading ? <p>Loading...</p> : sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗓️</div>
            <h3>No sessions scheduled</h3>
            <p>Schedule one from a course in your catalog.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Date</th><th>Location</th><th>Instructor</th><th>Enrolled</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && onSelectSession(s.id)}>{s.course_title}</td>
                  <td>{new Date(s.starts_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td>{s.location || '—'}</td>
                  <td>{s.instructor || '—'}</td>
                  <td>{s.enrolled_count}{s.capacity ? ` / ${s.capacity}` : ''}</td>
                  <td><span className={`badge ${SESSION_STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                  <td>
                    {s.status === 'scheduled' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => selfEnroll(s)}>Enroll me</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <SessionModal courses={courses} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function SessionModal({ courses, onClose, onSaved }) {
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [location, setLocation] = useState('');
  const [instructor, setInstructor] = useState('');
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/training-sessions', {
        courseId, startsAt: `${date}T${startTime}:00`, endsAt: `${date}T${endTime}:00`,
        location: location || undefined, instructor: instructor || undefined,
        capacity: capacity ? Number(capacity) : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to schedule session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Schedule session</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Course</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required autoFocus>
              <option value="">Select a course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Start time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>End time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div className="form-group"><label>Instructor</label><input value={instructor} onChange={(e) => setInstructor(e.target.value)} /></div>
          <div className="form-group"><label>Capacity</label><input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Scheduling...' : 'Schedule'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Session detail (roster, evaluation, certification)
// ============================================================

function SessionDetail({ id, onBack }) {
  const [session, setSession] = useState(null);
  const [roster, setRoster] = useState(null);
  const [recordingFor, setRecordingFor] = useState(null);

  function load() {
    api.get('/training-sessions').then(({ data }) => setSession(data.find((s) => s.id === id)));
    api.get(`/training-sessions/${id}/enrollments`).then(({ data }) => setRoster(data)).catch(() => setRoster([]));
  }
  useEffect(load, [id]);

  if (!session) return <DashboardLayout title="Session"><p>Loading...</p></DashboardLayout>;

  return (
    <DashboardLayout title={session.course_title}>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>← Back to calendar</button>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Session details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Date</div><div style={{ fontWeight: 600 }}>{new Date(session.starts_at).toLocaleString()}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Location</div><div style={{ fontWeight: 600 }}>{session.location || '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Instructor</div><div style={{ fontWeight: 600 }}>{session.instructor || '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Status</div><span className={`badge ${SESSION_STATUS_BADGE[session.status]}`}>{session.status}</span></div>
        </div>
      </div>
      <div className="card">
        <h2>Roster</h2>
        {roster === null ? <p>Loading...</p> : roster.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No one enrolled yet.</p>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Status</th><th>Result</th><th>Score</th><th>Certificate</th><th></th></tr></thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</td>
                  <td>{r.status}</td>
                  <td>{r.completion_status}</td>
                  <td>{r.evaluation_score ?? '—'}</td>
                  <td>{r.certificate_issued ? `Yes (exp. ${r.certificate_expiry_date ? new Date(r.certificate_expiry_date).toLocaleDateString() : 'n/a'})` : 'No'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRecordingFor(r)}>Record result</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {recordingFor && (
        <RecordResultModal
          enrollment={recordingFor}
          onClose={() => setRecordingFor(null)}
          onSaved={() => { setRecordingFor(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function RecordResultModal({ enrollment, onClose, onSaved }) {
  const [completionStatus, setCompletionStatus] = useState(enrollment.completion_status === 'pending' ? 'passed' : enrollment.completion_status);
  const [evaluationScore, setEvaluationScore] = useState(enrollment.evaluation_score || '');
  const [evaluationNotes, setEvaluationNotes] = useState(enrollment.evaluation_notes || '');
  const [certificateIssued, setCertificateIssued] = useState(enrollment.certificate_issued);
  const [certificateExpiryDate, setCertificateExpiryDate] = useState(enrollment.certificate_expiry_date ? enrollment.certificate_expiry_date.slice(0, 10) : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.patch(`/training-enrollments/${enrollment.id}`, {
        status: 'attended', completionStatus,
        evaluationScore: evaluationScore ? Number(evaluationScore) : undefined,
        evaluationNotes: evaluationNotes || undefined,
        certificateIssued,
        certificateExpiryDate: certificateIssued && certificateExpiryDate ? certificateExpiryDate : undefined,
      });
      showToast('Result recorded.', 'success');
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record result');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Record result — {enrollment.first_name} {enrollment.last_name}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Outcome</label>
            <select value={completionStatus} onChange={(e) => setCompletionStatus(e.target.value)}>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="not_applicable">Not applicable</option>
            </select>
          </div>
          <div className="form-group"><label>Evaluation score (0-100)</label><input type="number" min="0" max="100" value={evaluationScore} onChange={(e) => setEvaluationScore(e.target.value)} /></div>
          <div className="form-group"><label>Notes</label><input value={evaluationNotes} onChange={(e) => setEvaluationNotes(e.target.value)} /></div>
          <div className="checkbox-row">
            <input type="checkbox" checked={certificateIssued} onChange={(e) => setCertificateIssued(e.target.checked)} />
            <label style={{ margin: 0 }}>Certificate issued</label>
          </div>
          {certificateIssued && (
            <div className="form-group"><label>Certificate expiry date</label><input type="date" value={certificateExpiryDate} onChange={(e) => setCertificateExpiryDate(e.target.value)} /></div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save result'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Training Needs Assessment
// ============================================================

function NeedsTab() {
  const [needs, setNeeds] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/training-needs').then(({ data }) => setNeeds(data)).finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => {});
    api.get('/training-courses').then(({ data }) => setCourses(data)).catch(() => {});
  }, []);

  async function updateStatus(need, status) {
    try {
      await api.patch(`/training-needs/${need.id}`, { status });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update', 'error');
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Training needs</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Log a need</button>
        </div>
        {loading ? <p>Loading...</p> : needs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <h3>No training needs logged</h3>
            <p>Identify a skill gap to get started.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Who</th><th>Skill gap</th><th>Recommended course</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.id}>
                  <td>{n.first_name ? `${n.first_name} ${n.last_name}` : n.department}</td>
                  <td>{n.skill_gap}</td>
                  <td>{n.recommended_course_title || '—'}</td>
                  <td><span className={`badge ${PRIORITY_BADGE[n.priority]}`}>{n.priority}</span></td>
                  <td>
                    <select value={n.status} onChange={(e) => updateStatus(n, e.target.value)}>
                      <option value="identified">Identified</option>
                      <option value="planned">Planned</option>
                      <option value="addressed">Addressed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <NeedModal employees={employees} courses={courses} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </>
  );
}

function NeedModal({ employees, courses, onClose, onSaved }) {
  const [targetType, setTargetType] = useState('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [skillGap, setSkillGap] = useState('');
  const [recommendedCourseId, setRecommendedCourseId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/training-needs', {
        employeeId: targetType === 'employee' ? employeeId : undefined,
        department: targetType === 'department' ? department : undefined,
        skillGap, recommendedCourseId: recommendedCourseId || undefined, priority,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log training need');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log a training need</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Applies to</label>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="employee">A specific employee</option>
              <option value="department">A whole department</option>
            </select>
          </div>
          {targetType === 'employee' ? (
            <div className="form-group">
              <label>Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group"><label>Department</label><input value={department} onChange={(e) => setDepartment(e.target.value)} required /></div>
          )}
          <div className="form-group"><label>Skill gap</label><input value={skillGap} onChange={(e) => setSkillGap(e.target.value)} required placeholder="e.g. Advanced Excel, project management" /></div>
          <div className="form-group">
            <label>Recommended course</label>
            <select value={recommendedCourseId} onChange={(e) => setRecommendedCourseId(e.target.value)}>
              <option value="">None yet</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Log need'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

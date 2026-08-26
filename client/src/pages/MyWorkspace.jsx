import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

function money(n) {
  return `GHS ${Number(n || 0).toFixed(2)}`;
}

const LEAVE_STATUS_BADGE = { pending: 'badge-neutral', approved: 'badge-success', rejected: 'badge-danger', cancelled: 'badge-neutral' };
const TIMESHEET_STATUS_BADGE = { draft: 'badge-neutral', submitted: 'badge-neutral', approved: 'badge-success', rejected: 'badge-danger' };
const LOAN_STATUS_BADGE = { pending: 'badge-neutral', approved: 'badge-success', rejected: 'badge-danger', repaying: 'badge-neutral', completed: 'badge-success' };

export default function MyWorkspace() {
  const [tab, setTab] = useState('leave');
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/me/employee').then(({ data }) => setEmployee(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardLayout title="My Workspace"><p>Loading...</p></DashboardLayout>;

  if (!employee) {
    return (
      <DashboardLayout title="My Workspace">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🔗</div>
            <h3>No employee record linked</h3>
            <p>Your login isn't linked to an employee record yet, so self-service features like leave, payslips, and timesheets aren't available. Ask an admin to link your account from your employee profile.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="My Workspace" subtitle={`${employee.first_name} ${employee.last_name} · ${employee.job_title || 'No title set'}`}>
      <div className="toolbar">
        {[
          ['leave', 'Leave'],
          ['payslips', 'Payslips'],
          ['attendance', 'Attendance'],
          ['timesheets', 'Timesheets'],
          ['loans', 'Loans'],
          ['performance', 'Performance Reviews'],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'leave' && <LeaveTab employee={employee} />}
      {tab === 'payslips' && <PayslipsTab />}
      {tab === 'attendance' && <AttendanceTab employee={employee} />}
      {tab === 'timesheets' && <TimesheetsTab />}
      {tab === 'loans' && <LoansTab />}
      {tab === 'performance' && <PerformanceTab employee={employee} />}
    </DashboardLayout>
  );
}

// ============================================================
// Leave
// ============================================================

function LeaveTab({ employee }) {
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    api.get('/me/leave-balance').then(({ data }) => setBalance(data)).catch(() => setBalance([]));
    api.get('/leave-requests').then(({ data }) => setRequests(data)).catch(() => setRequests([]));
  }
  useEffect(load, []);
  useEffect(() => { api.get('/leave-types').then(({ data }) => setLeaveTypes(data)).catch(() => {}); }, []);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Leave balance</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Apply for leave</button>
        </div>
        {balance === null ? <p>Loading...</p> : (
          <div className="kpi-grid">
            {balance.map((b) => (
              <div className="kpi-card" key={b.id}>
                <div className="kpi-label">{b.name}</div>
                <div className="kpi-value">{b.days_remaining} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)' }}>/ {b.days_per_year} days</span></div>
              </div>
            ))}
            {balance.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No leave types configured yet.</p>}
          </div>
        )}
      </div>

      <div className="card">
        <h2>My leave requests</h2>
        {requests === null ? <p>Loading...</p> : requests.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No leave requests yet.</p>
        ) : (
          <table>
            <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.leave_type_name}</td>
                  <td>{new Date(r.start_date).toLocaleDateString()} – {new Date(r.end_date).toLocaleDateString()}</td>
                  <td>{r.days}</td>
                  <td>{r.reason || '—'}</td>
                  <td><span className={`badge ${LEAVE_STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <LeaveRequestModal
          employee={employee}
          leaveTypes={leaveTypes}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); showToast('Leave request submitted.', 'success'); }}
        />
      )}
    </>
  );
}

function LeaveRequestModal({ employee, leaveTypes, onClose, onSaved }) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/leave-requests', { employeeId: employee.id, leaveTypeId, startDate, endDate, reason: reason || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Apply for leave</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Leave type</label>
            <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
              <option value="">Select a leave type</option>
              {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Start date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
            <div className="form-group" style={{ flex: 1 }}><label>End date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
          </div>
          <div className="form-group"><label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !leaveTypeId}>{submitting ? 'Submitting...' : 'Submit request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Payslips
// ============================================================

function PayslipsTab() {
  const [payslips, setPayslips] = useState(null);

  useEffect(() => { api.get('/me/payslips').then(({ data }) => setPayslips(data)).catch(() => setPayslips([])); }, []);

  return (
    <div className="card">
      <h2>My payslips</h2>
      {payslips === null ? <p>Loading...</p> : payslips.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No payslips yet.</p>
      ) : (
        <table>
          <thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Status</th></tr></thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id}>
                <td>{new Date(0, p.period_month - 1).toLocaleString(undefined, { month: 'long' })} {p.period_year}</td>
                <td>{money(p.gross_pay)}</td>
                <td>{money(p.total_deductions)}</td>
                <td style={{ fontWeight: 600 }}>{money(p.net_pay)}</td>
                <td><span className="badge badge-neutral">{p.run_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// Attendance (reuses the same self-scoped endpoints as the HR tab)
// ============================================================

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthAgoStr() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }

function AttendanceTab() {
  const [today, setToday] = useState(null);
  const [records, setRecords] = useState(null);
  const [clocking, setClocking] = useState(false);
  const { showToast } = useToast();

  function loadToday() { api.get('/attendance/me/today').then(({ data }) => setToday(data)).catch(() => setToday(null)); }
  function loadHistory() { api.get(`/attendance?from=${monthAgoStr()}&to=${todayStr()}`).then(({ data }) => setRecords(data)).catch(() => setRecords([])); }
  useEffect(loadToday, []);
  useEffect(loadHistory, []);

  async function clockIn() {
    setClocking(true);
    try { await api.post('/attendance/clock-in'); loadToday(); loadHistory(); showToast('Clocked in.', 'success'); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to clock in', 'error'); }
    finally { setClocking(false); }
  }
  async function clockOut() {
    setClocking(true);
    try { await api.post('/attendance/clock-out'); loadToday(); loadHistory(); showToast('Clocked out.', 'success'); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to clock out', 'error'); }
    finally { setClocking(false); }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Today</h2>
        {today && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <span className="badge badge-neutral">{today.status}</span>
            <span>In: {today.clock_in ? new Date(today.clock_in).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
            <span>Out: {today.clock_out ? new Date(today.clock_out).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={clockIn} disabled={clocking || (today && today.clock_in)}>Clock in</button>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={clockOut} disabled={clocking || !today || !today.clock_in || today.clock_out}>Clock out</button>
        </div>
      </div>
      <div className="card">
        <h2>Last 30 days</h2>
        {records === null ? <p>Loading...</p> : records.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No records yet.</p> : (
          <table>
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.work_date).toLocaleDateString()}</td>
                  <td>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td><span className="badge badge-neutral">{r.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ============================================================
// Timesheets
// ============================================================

function TimesheetsTab() {
  const [timesheets, setTimesheets] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() { api.get('/timesheets').then(({ data }) => setTimesheets(data)).catch(() => setTimesheets([])); }
  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>My timesheets</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Submit timesheet</button>
      </div>
      {timesheets === null ? <p>Loading...</p> : timesheets.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No timesheets submitted yet.</p>
      ) : (
        <table>
          <thead><tr><th>Period</th><th>Hours</th><th>Notes</th><th>Status</th></tr></thead>
          <tbody>
            {timesheets.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.period_start).toLocaleDateString()} – {new Date(t.period_end).toLocaleDateString()}</td>
                <td>{t.total_hours}</td>
                <td>{t.notes || '—'}</td>
                <td>
                  <span className={`badge ${TIMESHEET_STATUS_BADGE[t.status]}`}>{t.status}</span>
                  {t.status === 'rejected' && t.rejection_reason && <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{t.rejection_reason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <TimesheetModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); showToast('Timesheet submitted.', 'success'); }} />
      )}
    </div>
  );
}

function TimesheetModal({ onClose, onSaved }) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [totalHours, setTotalHours] = useState('40');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/timesheets', { periodStart, periodEnd, totalHours: Number(totalHours), notes: notes || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit timesheet');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Submit timesheet</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Period start</label><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Period end</label><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required /></div>
          </div>
          <div className="form-group"><label>Total hours</label><input type="number" min="0" step="0.5" value={totalHours} onChange={(e) => setTotalHours(e.target.value)} required /></div>
          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Loans
// ============================================================

function LoansTab() {
  const [loans, setLoans] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() { api.get('/loans').then(({ data }) => setLoans(data)).catch(() => setLoans([])); }
  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>My loans</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Apply for a loan</button>
      </div>
      {loans === null ? <p>Loading...</p> : loans.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No loan requests yet.</p>
      ) : (
        <table>
          <thead><tr><th>Amount</th><th>Reason</th><th>Requested</th><th>Monthly deduction</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td>{money(l.amount)}</td>
                <td>{l.reason || '—'}</td>
                <td>{new Date(l.requested_date).toLocaleDateString()}</td>
                <td>{l.monthly_deduction ? money(l.monthly_deduction) : '—'}</td>
                <td>{l.balance_remaining !== null ? money(l.balance_remaining) : '—'}</td>
                <td>
                  <span className={`badge ${LOAN_STATUS_BADGE[l.status]}`}>{l.status}</span>
                  {l.status === 'rejected' && l.rejection_reason && <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{l.rejection_reason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <LoanModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); showToast('Loan request submitted.', 'success'); }} />
      )}
    </div>
  );
}

function LoanModal({ onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/loans', { amount: Number(amount), reason: reason || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit loan request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Apply for a loan</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Amount (GHS)</label><input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !amount}>{submitting ? 'Submitting...' : 'Submit request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Performance reviews (reuses the existing self-scoped endpoint)
// ============================================================

function PerformanceTab({ employee }) {
  const [reviews, setReviews] = useState(null);

  useEffect(() => {
    api.get(`/employees/${employee.id}/performance-reviews`).then(({ data }) => setReviews(data)).catch(() => setReviews([]));
  }, [employee.id]);

  return (
    <div className="card">
      <h2>My performance reviews</h2>
      {reviews === null ? <p>Loading...</p> : reviews.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No reviews yet.</p>
      ) : (
        <ul className="feed-list">
          {reviews.map((r) => (
            <li key={r.id}>
              <span className="feed-list-title">{r.cycle_name} · {r.review_type}</span>
              <span className="feed-list-detail">
                {r.overall_rating ? `Rating: ${r.overall_rating}/5` : 'No rating yet'} · Reviewer: {r.reviewer_first_name} {r.reviewer_last_name}
              </span>
              {r.comments && <span className="feed-list-detail">{r.comments}</span>}
              <span className="feed-list-time"><span className="badge badge-neutral">{r.status}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { BarChartWidget, LineChartWidget, PieChartWidget, formatMoney } from '../components/charts';
import AttachmentsPanel from '../components/AttachmentsPanel';
import { EmptyState } from '../Style';
import { IconHR } from '../components/icons';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'trainee'];
const EMPLOYMENT_STATUSES = ['active', 'on_leave', 'terminated'];
const STATUS_BADGE = {
  active: 'badge-success',
  on_leave: 'badge-neutral',
  terminated: 'badge-danger',
  pending: 'badge-neutral',
  approved: 'badge-success',
  rejected: 'badge-danger',
  cancelled: 'badge-neutral',
  draft: 'badge-neutral',
  processed: 'badge-success',
  paid: 'badge-success',
};

const HISTORY_LABELS = {
  hired: 'Hired',
  job_title_change: 'Job title changed',
  department_change: 'Department changed',
  salary_change: 'Salary changed',
  manager_change: 'Manager changed',
  status_change: 'Status changed',
  terminated: 'Terminated',
  shift_change: 'Shift changed',
  probation_change: 'Probation status changed',
};

const ONBOARDING_STEP_LABELS = {
  orientation: 'Employee orientation',
  department_assignment: 'Department assignment',
  supervisor_assignment: 'Supervisor assignment',
  equipment_allocation: 'Equipment allocation',
  account_creation: 'Email & system account',
  training_schedule: 'Training schedule',
  probation_review: 'Probation review',
};

const ONBOARDING_STATUS_BADGE = {
  pending: 'badge-neutral', in_progress: 'badge-neutral', completed: 'badge-success', skipped: 'badge-danger',
};

const GOAL_STATUS_BADGE = {
  not_started: 'badge-neutral', in_progress: 'badge-neutral', completed: 'badge-success', missed: 'badge-danger',
};

const REVIEW_TYPE_BADGE = {
  supervisor: 'badge-success', self: 'badge-neutral', peer: 'badge-neutral',
};

function money(n) {
  return `GHS ${Number(n || 0).toFixed(2)}`;
}

export default function HRPayroll() {
  const [tab, setTab] = useState('employees');

  return (
    <DashboardLayout title="HR & Payroll">
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ display: 'flex', gap: 4, padding: 8 }}>
          {[
            ['employees', 'Employees'],
            ['leave', 'Leave'],
            ['shifts', 'Shifts'],
            ['attendance', 'Attendance'],
            ['payroll', 'Payroll'],
            ['reports', 'Reports & Analytics'],
            ['settings', 'Statutory Settings'],
          ].map(([key, label]) => (
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
      </div>

      {tab === 'employees' && <EmployeesTab />}
      {tab === 'leave' && <LeaveTab />}
      {tab === 'shifts' && <ShiftsTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'payroll' && <PayrollTab />}
      {tab === 'reports' && <HRReportsTab />}
      {tab === 'settings' && <SettingsTab />}
    </DashboardLayout>
  );
}

// ============================================================
// Employees
// ============================================================

function EmployeesTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.employees.manage');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  function load() {
    setLoading(true);
    api
      .get(`/employees${statusFilter ? `?status=${statusFilter}` : ''}`)
      .then(({ data }) => setEmployees(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  if (detailId) {
    return <EmployeeDetail id={detailId} canManage={canManage} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <>
      {!loading && employees.length > 0 && (
        <div className="chart-grid">
          <PieChartWidget
            title="Headcount by department"
            data={Object.values(
              employees.reduce((acc, e) => {
                const key = e.department || 'Unassigned';
                acc[key] = acc[key] || { name: key, value: 0 };
                acc[key].value += 1;
                return acc;
              }, {})
            )}
            valueFormatter={(v) => `${v} employee${v === 1 ? '' : 's'}`}
          />
          <BarChartWidget
            title="Total basic salary by department"
            data={Object.values(
              employees.reduce((acc, e) => {
                const key = e.department || 'Unassigned';
                acc[key] = acc[key] || { name: key, salary: 0 };
                acc[key].salary += Number(e.basic_salary) || 0;
                return acc;
              }, {})
            )}
            bars={[{ key: 'salary', label: 'Basic salary' }]}
            colorByCategory
            horizontal
            valueFormatter={(v) => formatMoney(v)}
          />
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <h2>Employees</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalOpen(true)}>
              + Add employee
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={IconHR}
          title="No employees yet"
          description="Add your first employee to start tracking payroll, leave, and attendance."
          primaryAction={canManage ? { label: '+ Add employee', onClick: () => setModalOpen(true) } : undefined}
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Employee #</th>
              <th>Name</th>
              <th>Job title</th>
              <th>Department</th>
              <th>Status</th>
              <th>Basic salary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.employee_no}</td>
                <td>{e.first_name} {e.last_name}</td>
                <td>{e.job_title || '—'}</td>
                <td>{e.department || '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[e.employment_status] || 'badge-neutral'}`}>{e.employment_status.replace('_', ' ')}</span></td>
                <td>{money(e.basic_salary)}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(e.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <EmployeeModal
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
    </>
  );
}

function EmployeeModal({ onClose, onSaved }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('full_time');
  const [hireDate, setHireDate] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [allowances, setAllowances] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [ssnitNumber, setSsnitNumber] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/employees', {
        firstName, lastName, email, phone, jobTitle, department, employmentType,
        hireDate,
        basicSalary: Number(basicSalary) || 0,
        allowances: Number(allowances) || 0,
        bankName, bankAccountNumber, ssnitNumber, tinNumber,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save employee');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New employee</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
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
            <label>Job title</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Department</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Employment type</label>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Hire date</label>
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Basic salary (GHS/month)</label>
            <input type="number" min="0" step="0.01" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Allowances (GHS/month)</label>
            <input type="number" min="0" step="0.01" value={allowances} onChange={(e) => setAllowances(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Bank name</label>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Bank account number</label>
            <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
          </div>
          <div className="form-group">
            <label>SSNIT number</label>
            <input value={ssnitNumber} onChange={(e) => setSsnitNumber(e.target.value)} />
          </div>
          <div className="form-group">
            <label>TIN</label>
            <input value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContractTermsCard({ employeeId, canManage }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [terms, setTerms] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = {
    salary: '', ssnitTier1Enabled: false, tier1EmployeeRate: 5.5, tier1EmployerRate: 8.0,
    ssnitTier2Enabled: false, tier2EmployerRate: 5.0,
    ssnitTier3Enabled: false, tier3EmployeeRate: 0, tier3EmployerRate: 0,
    payeEnabled: false, withholdingEnabled: false, withholdingRate: 15.0,
    effectiveFrom: new Date().toISOString().slice(0, 10), notes: '',
  };
  const [form, setForm] = useState(blankForm);

  function load() {
    api.get(`/employees/${employeeId}/contract-terms`).then(({ data }) => setTerms(data)).catch(() => setTerms([]));
  }
  useEffect(load, [employeeId]);

  const active = terms && terms.find((t) => t.is_active);

  function startEdit() {
    setCreating(false);
    setEditingId(active.id);
    setForm({
      salary: active.salary, ssnitTier1Enabled: active.ssnit_tier1_enabled, tier1EmployeeRate: active.tier1_employee_rate, tier1EmployerRate: active.tier1_employer_rate,
      ssnitTier2Enabled: active.ssnit_tier2_enabled, tier2EmployerRate: active.tier2_employer_rate,
      ssnitTier3Enabled: active.ssnit_tier3_enabled, tier3EmployeeRate: active.tier3_employee_rate, tier3EmployerRate: active.tier3_employer_rate,
      payeEnabled: active.paye_enabled, withholdingEnabled: active.withholding_enabled, withholdingRate: active.withholding_rate,
      effectiveFrom: active.effective_from.slice(0, 10), notes: active.notes || '',
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.payeEnabled && form.withholdingEnabled) {
      setError('Choose either PAYE (employment) or Withholding Tax (contractor), not both.');
      return;
    }
    try {
      if (editingId) {
        await api.patch(`/employees/${employeeId}/contract-terms/${editingId}`, form);
        setEditingId(null);
      } else {
        await api.post(`/employees/${employeeId}/contract-terms`, form);
        setCreating(false);
      }
      showToast('Contract term saved.', 'success');
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save contract term');
    }
  }

  async function remove() {
    const ok = await confirm('Delete this contract term? The employee will be skipped by payroll until a new one is set.', { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/employees/${employeeId}/contract-terms/${active.id}`);
      showToast('Contract term deleted.', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete contract term', 'error');
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2>Contract terms</h2>
        {canManage && (
          <button
            className="btn btn-secondary btn-sm" style={{ width: 'auto' }}
            onClick={() => { if (editingId) { setEditingId(null); } else if (active) { setCreating((c) => !c); } else { setCreating((c) => !c); } }}
          >
            {creating || editingId ? 'Cancel' : active ? '+ New term (deactivates current)' : '+ Set contract terms'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Defines exactly which statutory components apply to this specific engagement — full-time employees use the
        company-wide SSNIT/PAYE settings instead. Payroll skips this person entirely until a contract term exists.
      </p>

      {!creating && !editingId && (
        active ? (
          <>
            <table>
              <tbody>
                <tr><td>Salary</td><td>{formatMoney(active.salary)}</td></tr>
                <tr><td>SSNIT Tier 1</td><td>{active.ssnit_tier1_enabled ? `${active.tier1_employee_rate}% employee / ${active.tier1_employer_rate}% employer` : 'Not applied'}</td></tr>
                <tr><td>SSNIT Tier 2</td><td>{active.ssnit_tier2_enabled ? `${active.tier2_employer_rate}% employer` : 'Not applied'}</td></tr>
                <tr><td>SSNIT Tier 3</td><td>{active.ssnit_tier3_enabled ? `${active.tier3_employee_rate}% employee / ${active.tier3_employer_rate}% employer` : 'Not applied'}</td></tr>
                <tr><td>PAYE</td><td>{active.paye_enabled ? 'Applied' : 'Not applied'}</td></tr>
                <tr><td>Withholding Tax</td><td>{active.withholding_enabled ? `${active.withholding_rate}%` : 'Not applied'}</td></tr>
                <tr><td>Effective from</td><td>{new Date(active.effective_from).toLocaleDateString()}</td></tr>
              </tbody>
            </table>
            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={startEdit}>Edit these terms</button>
                <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={remove}>Delete</button>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>No contract terms set yet — this person will be skipped by payroll until terms are defined.</p>
        )
      )}

      {(creating || editingId) && (
        <form onSubmit={submit}>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-group"><label>Salary</label><input type="number" step="0.01" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} required /></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <input type="checkbox" checked={form.ssnitTier1Enabled} onChange={(e) => setForm((f) => ({ ...f, ssnitTier1Enabled: e.target.checked }))} style={{ width: 'auto' }} />
            <label style={{ margin: 0 }}>SSNIT Tier 1 (mandatory basic scheme, paid to SSNIT)</label>
            {form.ssnitTier1Enabled && (
              <>
                <input type="number" step="0.01" value={form.tier1EmployeeRate} onChange={(e) => setForm((f) => ({ ...f, tier1EmployeeRate: e.target.value }))} style={{ width: 70 }} title="Employee %" />
                <span style={{ fontSize: 12 }}>% emp /</span>
                <input type="number" step="0.01" value={form.tier1EmployerRate} onChange={(e) => setForm((f) => ({ ...f, tier1EmployerRate: e.target.value }))} style={{ width: 70 }} title="Employer %" />
                <span style={{ fontSize: 12 }}>% empr</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <input type="checkbox" checked={form.ssnitTier2Enabled} onChange={(e) => setForm((f) => ({ ...f, ssnitTier2Enabled: e.target.checked }))} style={{ width: 'auto' }} />
            <label style={{ margin: 0 }}>SSNIT Tier 2 (occupational scheme, paid to a private trustee — employer only)</label>
            {form.ssnitTier2Enabled && (
              <><input type="number" step="0.01" value={form.tier2EmployerRate} onChange={(e) => setForm((f) => ({ ...f, tier2EmployerRate: e.target.value }))} style={{ width: 70 }} /><span style={{ fontSize: 12 }}>% empr</span></>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <input type="checkbox" checked={form.ssnitTier3Enabled} onChange={(e) => setForm((f) => ({ ...f, ssnitTier3Enabled: e.target.checked }))} style={{ width: 'auto' }} />
            <label style={{ margin: 0 }}>SSNIT Tier 3 (voluntary provident fund)</label>
            {form.ssnitTier3Enabled && (
              <>
                <input type="number" step="0.01" value={form.tier3EmployeeRate} onChange={(e) => setForm((f) => ({ ...f, tier3EmployeeRate: e.target.value }))} style={{ width: 70 }} />
                <span style={{ fontSize: 12 }}>% emp /</span>
                <input type="number" step="0.01" value={form.tier3EmployerRate} onChange={(e) => setForm((f) => ({ ...f, tier3EmployerRate: e.target.value }))} style={{ width: 70 }} />
                <span style={{ fontSize: 12 }}>% empr</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <input type="checkbox" checked={form.payeEnabled} onChange={(e) => setForm((f) => ({ ...f, payeEnabled: e.target.checked, withholdingEnabled: e.target.checked ? false : f.withholdingEnabled }))} style={{ width: 'auto' }} />
            <label style={{ margin: 0 }}>PAYE (genuine employment relationship)</label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <input type="checkbox" checked={form.withholdingEnabled} onChange={(e) => setForm((f) => ({ ...f, withholdingEnabled: e.target.checked, payeEnabled: e.target.checked ? false : f.payeEnabled }))} style={{ width: 'auto' }} />
            <label style={{ margin: 0 }}>Withholding Tax (independent contractor / consultant)</label>
            {form.withholdingEnabled && (
              <><input type="number" step="0.01" value={form.withholdingRate} onChange={(e) => setForm((f) => ({ ...f, withholdingRate: e.target.value }))} style={{ width: 70 }} /><span style={{ fontSize: 12 }}>%</span></>
            )}
          </div>

          <div className="form-group"><label>Effective from</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} required /></div>
          <div className="form-group"><label>Notes</label><input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>

          <button className="btn btn-primary" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save contract term'}</button>
        </form>
      )}
    </div>
  );
}

function EmployeeDetail({ id, canManage, onBack }) {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [history, setHistory] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [assetAssignments, setAssetAssignments] = useState(null);
  const [learningHistory, setLearningHistory] = useState(null);
  const [goals, setGoals] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddReview, setShowAddReview] = useState(false);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showAssignAsset, setShowAssignAsset] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [personalSaving, setPersonalSaving] = useState(false);
  const canManageOnboarding = (user?.permissions || []).includes('hr.onboarding.manage');
  const canManageAssets = (user?.permissions || []).includes('assets.register.manage');
  const canCreateAccount = (user?.permissions || []).includes('system.users.manage');
  const canViewLearning = (user?.permissions || []).includes('hr.training.manage');
  const canViewPerformance = (user?.permissions || []).includes('hr.performance.manage');
  const [personal, setPersonal] = useState({
    dateOfBirth: '', gender: '', maritalStatus: '', nationalId: '', address: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '',
  });
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get(`/employees/${id}`).then(({ data }) => {
      setEmployee(data);
      setPersonal({
        dateOfBirth: data.date_of_birth ? data.date_of_birth.slice(0, 10) : '',
        gender: data.gender || '',
        maritalStatus: data.marital_status || '',
        nationalId: data.national_id || '',
        address: data.address || '',
        emergencyContactName: data.emergency_contact_name || '',
        emergencyContactPhone: data.emergency_contact_phone || '',
        emergencyContactRelationship: data.emergency_contact_relationship || '',
      });
    }).finally(() => setLoading(false));
    api.get(`/employees/${id}/history`).then(({ data }) => setHistory(data)).catch(() => setHistory([]));
  }

  useEffect(load, [id]);
  useEffect(() => { if (canManage) api.get('/shifts').then(({ data }) => setShifts(data)).catch(() => {}); }, [canManage]);

  function loadOnboarding() {
    api.get(`/employees/${id}/onboarding`).then(({ data }) => setOnboarding(data)).catch(() => setOnboarding([]));
  }
  function loadAssetAssignments() {
    api.get(`/employees/${id}/asset-assignments`).then(({ data }) => setAssetAssignments(data)).catch(() => setAssetAssignments([]));
  }
  useEffect(loadOnboarding, [id]);
  useEffect(loadAssetAssignments, [id]);
  useEffect(() => {
    if (canViewLearning) {
      api.get(`/employees/${id}/learning-history`).then(({ data }) => setLearningHistory(data)).catch(() => setLearningHistory([]));
    }
  }, [id, canViewLearning]);

  function loadGoals() {
    if (!canViewPerformance) return;
    api.get(`/employees/${id}/goals`).then(({ data }) => setGoals(data)).catch(() => setGoals([]));
  }
  function loadReviews() {
    if (!canViewPerformance) return;
    api.get(`/employees/${id}/performance-reviews`).then(({ data }) => setReviews(data)).catch(() => setReviews([]));
  }
  useEffect(loadGoals, [id, canViewPerformance]);
  useEffect(loadReviews, [id, canViewPerformance]);
  useEffect(() => {
    if (canManageAssets) {
      api.get('/fixed-assets').then(({ data }) => setAvailableAssets(data.filter((a) => a.status === 'active'))).catch(() => {});
    }
  }, [canManageAssets]);

  async function updateOnboardingStep(step, patch) {
    try {
      await api.patch(`/onboarding-steps/${step.id}`, patch);
      loadOnboarding();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update onboarding step', 'error');
    }
  }

  async function returnAsset(assignment) {
    try {
      await api.post(`/asset-assignments/${assignment.id}/return`, {});
      loadAssetAssignments();
      showToast('Asset marked as returned.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to return asset', 'error');
    }
  }

  async function updateShift(shiftId) {
    try {
      await api.patch(`/employees/${id}`, { shiftId });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update shift');
    }
  }

  async function updateProbation(probationStatus) {
    try {
      await api.patch(`/employees/${id}`, { probationStatus });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update probation status');
    }
  }

  async function savePersonal(e) {
    e.preventDefault();
    setPersonalSaving(true);
    try {
      await api.patch(`/employees/${id}`, personal);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save personal details');
    } finally {
      setPersonalSaving(false);
    }
  }

  async function updateStatus(employmentStatus) {
    try {
      await api.patch(`/employees/${id}`, { employmentStatus });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  }

  const [terminationReason, setTerminationReason] = useState('');

  async function handleTerminate() {
    const ok = await confirm('Terminate this employee? This can be reversed later by editing their status.', { danger: true, confirmLabel: 'Terminate' });
    if (!ok) return;
    try {
      await api.post(`/employees/${id}/terminate`, { terminationReason: terminationReason || undefined });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to terminate employee');
    }
  }

  if (loading || !employee) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to employees
      </button>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>{employee.first_name} {employee.last_name} · {employee.employee_no}</h2>
          {canManage && employee.employment_status !== 'terminated' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}
              >
                <option value="">Reason (optional)</option>
                <option value="resignation">Resignation</option>
                <option value="retirement">Retirement</option>
                <option value="involuntary_termination">Involuntary termination</option>
                <option value="end_of_contract">End of contract</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={handleTerminate}>Terminate</button>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Status</div>
            {canManage && employee.employment_status !== 'terminated' ? (
              <select value={employee.employment_status} onChange={(e) => updateStatus(e.target.value)} style={{ marginTop: 4 }}>
                {EMPLOYMENT_STATUSES.filter((s) => s !== 'terminated').map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontWeight: 600 }}>{employee.employment_status.replace('_', ' ')}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Job title</div>
            <div style={{ fontWeight: 600 }}>{employee.job_title || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Department</div>
            <div style={{ fontWeight: 600 }}>{employee.department || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Basic salary</div>
            <div style={{ fontWeight: 600 }}>{money(employee.basic_salary)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Allowances</div>
            <div style={{ fontWeight: 600 }}>{money(employee.allowances)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Hire date</div>
            <div style={{ fontWeight: 600 }}>{new Date(employee.hire_date).toLocaleDateString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Shift</div>
            {canManage ? (
              <select value={employee.shift_id || ''} onChange={(e) => updateShift(e.target.value || null)} style={{ marginTop: 4 }}>
                <option value="">No shift assigned</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>
                ))}
              </select>
            ) : (
              <div style={{ fontWeight: 600 }}>{employee.shift_name || '—'}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Probation</div>
            {canManage ? (
              <select value={employee.probation_status} onChange={(e) => updateProbation(e.target.value)} style={{ marginTop: 4 }}>
                <option value="not_applicable">Not applicable</option>
                <option value="on_probation">On probation</option>
                <option value="extended">Extended</option>
                <option value="confirmed">Confirmed</option>
              </select>
            ) : (
              <div style={{ fontWeight: 600 }}>{employee.probation_status.replace('_', ' ')}</div>
            )}
            {employee.probation_end_date && employee.probation_status === 'on_probation' && (
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>Ends {new Date(employee.probation_end_date).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>Personal &amp; emergency contact</h2></div>
        {canManage ? (
          <form onSubmit={savePersonal}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label>Date of birth</label>
                <input type="date" value={personal.dateOfBirth} onChange={(e) => setPersonal({ ...personal, dateOfBirth: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Gender</label>
                <select value={personal.gender} onChange={(e) => setPersonal({ ...personal, gender: e.target.value })}>
                  <option value="">Not specified</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Marital status</label>
                <select value={personal.maritalStatus} onChange={(e) => setPersonal({ ...personal, maritalStatus: e.target.value })}>
                  <option value="">Not specified</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </div>
              <div className="form-group">
                <label>National ID</label>
                <input value={personal.nationalId} onChange={(e) => setPersonal({ ...personal, nationalId: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <input value={personal.address} onChange={(e) => setPersonal({ ...personal, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Emergency contact name</label>
                <input value={personal.emergencyContactName} onChange={(e) => setPersonal({ ...personal, emergencyContactName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Emergency contact phone</label>
                <input value={personal.emergencyContactPhone} onChange={(e) => setPersonal({ ...personal, emergencyContactPhone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Relationship</label>
                <input value={personal.emergencyContactRelationship} onChange={(e) => setPersonal({ ...personal, emergencyContactRelationship: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto', marginTop: 8 }} disabled={personalSaving}>
              {personalSaving ? 'Saving...' : 'Save personal details'}
            </button>
          </form>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Date of birth</div><div style={{ fontWeight: 600 }}>{employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : '—'}</div></div>
            <div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Emergency contact</div><div style={{ fontWeight: 600 }}>{employee.emergency_contact_name || '—'} {employee.emergency_contact_phone && `(${employee.emergency_contact_phone})`}</div></div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>Employment history</h2></div>
        {history === null ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : history.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No history recorded yet.</p>
        ) : (
          <ul className="feed-list">
            {history.map((h) => (
              <li key={h.id}>
                <span className="feed-list-title">{HISTORY_LABELS[h.change_type] || h.change_type}</span>
                <span className="feed-list-detail">
                  {h.field_name && h.old_value !== null && h.new_value !== null
                    ? `${h.old_value || '—'} → ${h.new_value || '—'}`
                    : h.note}
                  {' · '}{h.changed_by_first_name} {h.changed_by_last_name}
                </span>
                <span className="feed-list-time">{new Date(h.effective_date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Onboarding checklist</h2>
          {onboarding && (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {onboarding.filter((s) => s.status === 'completed').length} of {onboarding.length} complete
            </span>
          )}
        </div>
        {onboarding === null ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Step</th><th>Due</th><th>Status</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {onboarding.map((s) => {
                const canEditStep = canManageOnboarding || s.assigned_to === user?.id || (!s.assigned_to && canManage);
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{ONBOARDING_STEP_LABELS[s.step_key] || s.step_key}</td>
                    <td>{s.due_date ? new Date(s.due_date).toLocaleDateString() : '—'}</td>
                    <td><span className={`badge ${ONBOARDING_STATUS_BADGE[s.status]}`}>{s.status.replace('_', ' ')}</span></td>
                    <td style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{s.notes || '—'}</td>
                    <td>
                      {canEditStep && s.status !== 'completed' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => updateOnboardingStep(s, { status: 'completed' })}>Mark complete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Equipment allocation</h2>
          {canManageAssets && <button className="btn btn-secondary btn-sm" onClick={() => setShowAssignAsset(true)}>+ Assign asset</button>}
        </div>
        {assetAssignments === null ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : assetAssignments.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No equipment assigned yet.</p>
        ) : (
          <table>
            <thead><tr><th>Asset</th><th>Assigned</th><th>Returned</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {assetAssignments.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.asset_code} — {a.asset_name}</td>
                  <td>{new Date(a.assigned_date).toLocaleDateString()}</td>
                  <td>{a.returned_date ? new Date(a.returned_date).toLocaleDateString() : '—'}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{a.notes || '—'}</td>
                  <td>
                    {canManageAssets && !a.returned_date && (
                      <button className="btn btn-secondary btn-sm" onClick={() => returnAsset(a)}>Return</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>System account</h2></div>
        {employee.user_id ? (
          <p style={{ color: 'var(--color-success)', fontWeight: 600 }}>This employee has a system login.</p>
        ) : canCreateAccount ? (
          <>
            <p style={{ color: 'var(--color-text-muted)' }}>This employee doesn't have a system login yet.</p>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowCreateAccount(true)}>Create system account</button>
          </>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>This employee doesn't have a system login yet.</p>
        )}
      </div>

      {employee.employment_type !== 'full_time' && <ContractTermsCard employeeId={id} canManage={canManage} />}

      {canViewLearning && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2>Learning history</h2></div>
          {learningHistory === null ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
          ) : learningHistory.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No training completed yet.</p>
          ) : (
            <table>
              <thead><tr><th>Course</th><th>Date</th><th>Result</th><th>Score</th><th>Certificate</th></tr></thead>
              <tbody>
                {learningHistory.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>{h.course_title}</td>
                    <td>{new Date(h.starts_at).toLocaleDateString()}</td>
                    <td>{h.completion_status.replace('_', ' ')}</td>
                    <td>{h.evaluation_score ?? '—'}</td>
                    <td>{h.certificate_issued ? `Yes${h.certificate_expiry_date ? ` (exp. ${new Date(h.certificate_expiry_date).toLocaleDateString()})` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {canViewPerformance && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h2>Goals</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddGoal(true)}>+ Add goal</button>
            </div>
            {goals === null ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : goals.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>No goals set yet.</p>
            ) : (
              <table>
                <thead><tr><th>Goal</th><th>KPI</th><th>Target</th><th>Actual</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>
                  {goals.map((g) => (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.title}</td>
                      <td>{g.kpi_name ? `${g.kpi_name}${g.kpi_unit ? ` (${g.kpi_unit})` : ''}` : '—'}</td>
                      <td>{g.target_value ?? '—'}</td>
                      <td>{g.actual_value ?? '—'}</td>
                      <td>{g.due_date ? new Date(g.due_date).toLocaleDateString() : '—'}</td>
                      <td><span className={`badge ${GOAL_STATUS_BADGE[g.status]}`}>{g.status.replace('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h2>Performance reviews</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddReview(true)}>+ Add review</button>
            </div>
            {reviews === null ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
            ) : reviews.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>No reviews recorded yet.</p>
            ) : (
              <table>
                <thead><tr><th>Cycle</th><th>Type</th><th>Reviewer</th><th>Rating</th><th>Promotion?</th><th>Status</th></tr></thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id}>
                      <td>{r.cycle_name}</td>
                      <td><span className={`badge ${REVIEW_TYPE_BADGE[r.review_type]}`}>{r.review_type}</span></td>
                      <td>{r.reviewer_first_name} {r.reviewer_last_name}</td>
                      <td>{r.overall_rating ?? '—'}</td>
                      <td>{r.promotion_recommended ? 'Yes' : '—'}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>Documents</h2></div>
        <AttachmentsPanel relatedType="employee" relatedId={id} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>Leave history</h2></div>
        {employee.leaveRequests.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No leave requests yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Status</th></tr>
            </thead>
            <tbody>
              {employee.leaveRequests.map((lr) => (
                <tr key={lr.id}>
                  <td>{lr.leave_type_name}</td>
                  <td>{new Date(lr.start_date).toLocaleDateString()}</td>
                  <td>{new Date(lr.end_date).toLocaleDateString()}</td>
                  <td>{lr.days}</td>
                  <td><span className={`badge ${STATUS_BADGE[lr.status] || 'badge-neutral'}`}>{lr.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h2>Payslip history</h2></div>
        {employee.payslips.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No payslips generated yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Run status</th></tr>
            </thead>
            <tbody>
              {employee.payslips.map((p) => (
                <tr key={p.id}>
                  <td>{MONTH_NAMES[p.period_month - 1]} {p.period_year}</td>
                  <td>{money(p.gross_pay)}</td>
                  <td>{money(p.total_deductions)}</td>
                  <td>{money(p.net_pay)}</td>
                  <td><span className={`badge ${STATUS_BADGE[p.run_status] || 'badge-neutral'}`}>{p.run_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAssignAsset && (
        <AssignAssetModal
          assets={availableAssets}
          onClose={() => setShowAssignAsset(false)}
          onSaved={() => { setShowAssignAsset(false); loadAssetAssignments(); }}
          employeeId={id}
        />
      )}
      {showCreateAccount && (
        <CreateAccountModal
          employee={employee}
          onClose={() => setShowCreateAccount(false)}
          onCreated={() => { setShowCreateAccount(false); load(); }}
        />
      )}
      {showAddGoal && (
        <AddGoalModal
          employeeId={id}
          onClose={() => setShowAddGoal(false)}
          onSaved={() => { setShowAddGoal(false); loadGoals(); }}
        />
      )}
      {showAddReview && (
        <AddReviewModal
          employee={employee}
          onClose={() => setShowAddReview(false)}
          onSaved={() => { setShowAddReview(false); loadReviews(); }}
        />
      )}
    </div>
  );
}

function AssignAssetModal({ assets, employeeId, onClose, onSaved }) {
  const [assetId, setAssetId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/employees/${employeeId}/asset-assignments`, { assetId, notes: notes || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign asset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Assign equipment</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Asset</label>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} required autoFocus>
              <option value="">Select an asset</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.asset_code} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !assetId}>{submitting ? 'Assigning...' : 'Assign'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateAccountModal({ employee, onClose, onCreated }) {
  const [email, setEmail] = useState(employee.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/employees/${employee.id}/create-account`, { email, password });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create system account</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Creates a login for {employee.first_name} {employee.last_name} and links it to this employee record.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
          <div className="form-group">
            <label>Temporary password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 4 }}>8+ characters with upper, lower, and a number.</div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Creating...' : 'Create account'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Leave
// ============================================================

function LeaveTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.leave.manage');
  const canApprove = hasPermission('hr.leave.approve');
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([
      api.get(`/leave-requests${statusFilter ? `?status=${statusFilter}` : ''}`),
      api.get('/employees'),
      api.get('/leave-types'),
    ])
      .then(([reqRes, empRes, typeRes]) => {
        setRequests(reqRes.data);
        setEmployees(empRes.data);
        setLeaveTypes(typeRes.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  async function decide(id, status) {
    setError('');
    try {
      await api.patch(`/leave-requests/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update leave request');
    }
  }

  return (
    <>
      {!loading && requests.length > 0 && (
        <PieChartWidget
          title="Leave requests by type"
          data={Object.values(
            requests.reduce((acc, r) => {
              acc[r.leave_type_name] = acc[r.leave_type_name] || { name: r.leave_type_name, value: 0 };
              acc[r.leave_type_name].value += 1;
              return acc;
            }, {})
          )}
          valueFormatter={(v) => `${v} request${v === 1 ? '' : 's'}`}
          height={260}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Leave types</h2>
          {canManage && (
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setTypeModalOpen(true)}>
              + Add leave type
            </button>
          )}
        </div>
        {leaveTypes.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            No leave types set up yet{canManage ? ' — add one to start accepting leave requests.' : '.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {leaveTypes.map((t) => (
              <span key={t.id} className="badge badge-neutral" title={t.is_paid ? 'Paid leave' : 'Unpaid leave'}>
                {t.name} · {t.days_per_year}d/yr{t.is_paid ? '' : ' · unpaid'}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Leave requests</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalOpen(true)}>
              + Request leave
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No leave requests yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.first_name} {r.last_name}</td>
                <td>{r.leave_type_name}</td>
                <td>{new Date(r.start_date).toLocaleDateString()}</td>
                <td>{new Date(r.end_date).toLocaleDateString()}</td>
                <td>{r.days}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-neutral'}`}>{r.status}</span></td>
                <td>
                  {canApprove && r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => decide(r.id, 'approved')}>Approve</button>
                      <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => decide(r.id, 'rejected')}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {typeModalOpen && (
        <LeaveTypeModal
          onClose={() => setTypeModalOpen(false)}
          onSaved={() => { setTypeModalOpen(false); load(); showToast('Leave type added.', 'success'); }}
        />
      )}

      {modalOpen && (
        <LeaveRequestModal
          employees={employees}
          leaveTypes={leaveTypes}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
    </>
  );
}

function LeaveTypeModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [daysPerYear, setDaysPerYear] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter a name for this leave type');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/leave-types', { name: name.trim(), daysPerYear: Number(daysPerYear) || 0, isPaid });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add leave type');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add leave type</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual, Sick, Maternity" required />
          </div>
          <div className="form-group">
            <label>Days per year</label>
            <input type="number" min="0" step="1" value={daysPerYear} onChange={(e) => setDaysPerYear(e.target.value)} placeholder="e.g. 15" />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} style={{ width: 'auto', minHeight: 'auto' }} />
              Paid leave
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save leave type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeaveRequestModal({ employees, leaveTypes, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!employeeId || !leaveTypeId) {
      setError('Please select an employee and a leave type');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/leave-requests', { employeeId, leaveTypeId, startDate, endDate, reason });
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
        <h2>Request leave</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_no})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Leave type</label>
            <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
              <option value="">Select leave type</option>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {leaveTypes.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No leave types set up yet — add one first (Annual, Sick, etc.).</p>
            )}
          </div>
          <div className="form-group">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Reason</label>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Shifts (Time & Shift Management)
// ============================================================

function ShiftsTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.shifts.manage');
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    api.get('/shifts').then(({ data }) => setShifts(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleActive(shift) {
    try {
      await api.patch(`/shifts/${shift.id}`, { isActive: !shift.is_active });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update shift', 'error');
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Shifts</h2>
        {canManage && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New shift</button>}
      </div>
      {loading ? <p>Loading...</p> : shifts.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No shifts defined yet.</p>
      ) : (
        <table>
          <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Grace (min)</th><th>Employees</th><th>Status</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.start_time.slice(0, 5)}</td>
                <td>{s.end_time.slice(0, 5)}</td>
                <td>{s.grace_minutes}</td>
                <td>{s.employee_count}</td>
                <td><span className={`badge ${s.is_active ? 'badge-success' : 'badge-neutral'}`}>{s.is_active ? 'active' : 'inactive'}</span></td>
                {canManage && <td><button className="btn btn-secondary btn-sm" onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <ShiftModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </div>
  );
}

function ShiftModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [graceMinutes, setGraceMinutes] = useState('10');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/shifts', { name, startTime, endTime, graceMinutes: Number(graceMinutes) || 0 });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create shift');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New shift</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Morning Shift" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Start time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>End time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label>Grace period (minutes before marked late)</label>
            <input type="number" min="0" value={graceMinutes} onChange={(e) => setGraceMinutes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Create shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Attendance
// ============================================================

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

const ATTENDANCE_BADGE = {
  present: 'badge-success', late: 'badge-danger', absent: 'badge-danger',
  half_day: 'badge-neutral', on_leave: 'badge-neutral', holiday: 'badge-neutral',
};

function AttendanceTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.attendance.manage');
  const [today, setToday] = useState(null);
  const [clocking, setClocking] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const { showToast } = useToast();

  function loadToday() {
    api.get('/attendance/me/today').then(({ data }) => setToday(data)).catch(() => setToday(null));
  }

  function loadRecords() {
    setLoading(true);
    api.get(`/attendance?from=${from}&to=${to}`).then(({ data }) => setRecords(data)).finally(() => setLoading(false));
  }

  useEffect(loadToday, []);
  useEffect(loadRecords, [from, to]);

  async function handleClockIn() {
    setClocking(true);
    try {
      await api.post('/attendance/clock-in');
      loadToday();
      loadRecords();
      showToast('Clocked in.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to clock in', 'error');
    } finally {
      setClocking(false);
    }
  }

  async function handleClockOut() {
    setClocking(true);
    try {
      await api.post('/attendance/clock-out');
      loadToday();
      loadRecords();
      showToast('Clocked out.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to clock out', 'error');
    } finally {
      setClocking(false);
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>My attendance today</h2>
        {today === null ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            Not clocked in yet. Your user account needs to be linked to an employee record to clock in.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span className={`badge ${ATTENDANCE_BADGE[today.status] || 'badge-neutral'}`}>{today.status}</span>
            <span>In: {today.clock_in ? new Date(today.clock_in).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
            <span>Out: {today.clock_out ? new Date(today.clock_out).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleClockIn} disabled={clocking || (today && today.clock_in)}>Clock in</button>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleClockOut} disabled={clocking || !today || !today.clock_in || today.clock_out}>Clock out</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{canManage ? 'Company attendance' : 'My attendance history'}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {loading ? <p>Loading...</p> : records.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No attendance records in this range.</p>
        ) : (
          <table>
            <thead><tr>{canManage && <th>Employee</th>}<th>Date</th><th>In</th><th>Out</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  {canManage && <td>{r.first_name} {r.last_name}</td>}
                  <td>{new Date(r.work_date).toLocaleDateString()}</td>
                  <td>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td><span className={`badge ${ATTENDANCE_BADGE[r.status] || 'badge-neutral'}`}>{r.status.replace('_', ' ')}</span></td>
                  <td>{r.notes || '—'}</td>
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
// HR Reports & Analytics
// ============================================================

function HRReportsTab() {
  const [summary, setSummary] = useState(null);
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());

  function load() {
    api.get(`/hr-reports/attendance-summary?from=${from}&to=${to}`).then(({ data }) => setSummary(data)).catch(() => setSummary({ byStatus: [], byEmployee: [] }));
  }

  useEffect(load, [from, to]);

  const statusChart = (summary?.byStatus || []).map((s) => ({ name: s.status.replace('_', ' '), count: s.count }));
  const employeeChart = (summary?.byEmployee || [])
    .map((e) => ({ name: `${e.first_name} ${e.last_name}`, Present: e.present_count, Late: e.late_count, Absent: e.absent_count }))
    .filter((e) => e.Present + e.Late + e.Absent > 0);

  return (
    <>
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="chart-grid">
        <PieChartWidget
          title="Attendance by status"
          subtitle="Company-wide, selected range"
          loading={summary === null}
          data={statusChart}
        />
        <BarChartWidget
          title="Attendance by employee"
          subtitle="Present / Late / Absent"
          loading={summary === null}
          data={employeeChart}
          bars={[
            { key: 'Present', label: 'Present', color: '#2F9E6E' },
            { key: 'Late', label: 'Late', color: '#B9790A' },
            { key: 'Absent', label: 'Absent', color: '#B3261E' },
          ]}
          horizontal
        />
      </div>
    </>
  );
}

// ============================================================
// Payroll
// ============================================================

function PayrollTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.payroll.manage');
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [autoRunModalOpen, setAutoRunModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get('/payroll-runs').then(({ data }) => setRuns(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (detailId) {
    return <PayrollRunDetail id={detailId} canManage={canManage} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <>
      {!loading && runs.length > 1 && (
        <LineChartWidget
          title="Payroll cost trend"
          data={[...runs]
            .sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month))
            .map((r) => ({ name: `${MONTH_NAMES[r.period_month - 1].slice(0, 3)} ${r.period_year}`, Gross: Number(r.total_gross), Net: Number(r.total_net) }))}
          lines={[{ key: 'Gross', label: 'Gross', color: '#2B6CB0' }, { key: 'Net', label: 'Net', color: '#0B6E4F' }]}
          valueFormatter={(v) => formatMoney(v)}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Payroll runs</h2>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setAutoRunModalOpen(true)}>
              Automatic payroll
            </button>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalOpen(true)}>
              + New payroll run
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : runs.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No payroll runs yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Period</th><th>Status</th><th>Total gross</th><th>Total net</th><th></th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{MONTH_NAMES[r.period_month - 1]} {r.period_year}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-neutral'}`}>{r.status}</span></td>
                <td>{money(r.total_gross)}</td>
                <td>{money(r.total_net)}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(r.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <PayrollRunModal
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
      {autoRunModalOpen && (
        <AutoRunSettingsModal onClose={() => setAutoRunModalOpen(false)} />
      )}
    </div>
    </>
  );
}

function PayrollRunModal({ onClose, onSaved }) {
  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/bank-accounts').then(({ data }) => setBankAccounts(data)).catch(() => setBankAccounts([]));
  }, []);

  const needsBankAccount = ['bank_transfer', 'mobile_money', 'cheque', 'card'].includes(paymentMethod);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/payroll-runs', {
        periodMonth: Number(periodMonth), periodYear: Number(periodYear),
        paymentMethod, bankAccountId: needsBankAccount && bankAccountId ? bankAccountId : null,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create payroll run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New payroll run</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Only full-time employees are included when this run is processed — contract, part-time, internship,
          and trainee staff are excluded, since they're often compensated differently and shouldn't be run
          through the same SSNIT/PAYE calculation automatically.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Month</label>
            <select value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Year</label>
            <input type="number" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Payment option</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
            </select>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
              How net salaries for this run will actually be disbursed — decides which account the payment posts against when you mark the run as paid.
            </p>
          </div>
          {needsBankAccount && (
            <div className="form-group">
              <label>Pay from account</label>
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">Use default cash account</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
              </select>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AutoRunSettingsModal({ onClose }) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/payroll-runs/auto-run-settings'), api.get('/bank-accounts')])
      .then(([s, b]) => {
        setSettings(s.data);
        setForm({
          enabled: s.data.enabled,
          runDay: s.data.run_day,
          paymentMethod: s.data.payment_method,
          bankAccountId: s.data.bank_account_id || '',
          autoMarkPaid: s.data.auto_mark_paid,
        });
        setBankAccounts(b.data);
      })
      .catch(() => setError('Failed to load settings'));
  }, []);

  const needsBankAccount = form && ['bank_transfer', 'mobile_money', 'cheque', 'card'].includes(form.paymentMethod);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.put('/payroll-runs/auto-run-settings', {
        ...form,
        bankAccountId: needsBankAccount && form.bankAccountId ? form.bankAccountId : null,
      });
      setSettings(data);
      showToast('Automatic payroll settings saved.', 'success');
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2>Automatic payroll</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
          When enabled, a background job creates and processes a payroll run — one payslip for every active
          employee — on the chosen day each month, with no one needing to click anything. It stops short of
          actually marking the run paid unless you turn that on separately below, since that step moves real
          money out of a real account.
        </p>
        {error && <div className="error-banner">{error}</div>}

        {!form ? <p>Loading...</p> : (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox" id="autoRunEnabled" checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                style={{ width: 'auto' }}
              />
              <label htmlFor="autoRunEnabled" style={{ margin: 0 }}>Enable automatic payroll</label>
            </div>

            <div className="form-group">
              <label>Run day of month</label>
              <input
                type="number" min="1" max="28" value={form.runDay}
                onChange={(e) => setForm((f) => ({ ...f, runDay: e.target.value }))}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                Capped at 28 so it always falls in every month, including February.
              </p>
            </div>

            <div className="form-group">
              <label>Payment option</label>
              <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
            </div>

            {needsBankAccount && (
              <div className="form-group">
                <label>Pay from account</label>
                <select value={form.bankAccountId} onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}>
                  <option value="">Use default cash account</option>
                  {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox" id="autoMarkPaid" checked={form.autoMarkPaid}
                onChange={(e) => setForm((f) => ({ ...f, autoMarkPaid: e.target.checked }))}
                style={{ width: 'auto' }}
              />
              <label htmlFor="autoMarkPaid" style={{ margin: 0 }}>Also mark the run as paid automatically</label>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-warning-text)', margin: '-8px 0 12px' }}>
              This posts the actual cash/bank payment entry with no review step — only turn this on if you're confident in the setup above.
            </p>

            {settings?.last_run_at && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Last automatic run: {new Date(settings.last_run_at).toLocaleString()}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PayrollRunDetail({ id, canManage, onBack }) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get(`/payroll-runs/${id}`).then(({ data }) => setRun(data)).finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function handleProcess() {
    setError('');
    setProcessing(true);
    try {
      await api.post(`/payroll-runs/${id}/process`, {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process payroll run');
    } finally {
      setProcessing(false);
    }
  }

  async function handleMarkPaid() {
    setError('');
    try {
      await api.post(`/payroll-runs/${id}/mark-paid`, {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to mark run as paid');
    }
  }

  if (loading || !run) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to payroll runs
      </button>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h2 style={{ marginBottom: 4 }}>{MONTH_NAMES[run.period_month - 1]} {run.period_year}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: 0, textTransform: 'capitalize' }}>
              Payment option: {run.payment_method?.replace('_', ' ')}{run.bank_account_name ? ` — ${run.bank_account_name}` : ''}
            </p>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              {run.status === 'draft' && (
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleProcess} disabled={processing}>
                  {processing ? 'Processing...' : 'Process payroll'}
                </button>
              )}
              {run.status === 'processed' && (
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleMarkPaid}>
                  Mark as paid
                </button>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Status</div>
            <span className={`badge ${STATUS_BADGE[run.status] || 'badge-neutral'}`}>{run.status}</span>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Total gross</div>
            <div style={{ fontWeight: 600 }}>{money(run.total_gross)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Total deductions</div>
            <div style={{ fontWeight: 600 }}>{money(run.total_deductions)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Total net</div>
            <div style={{ fontWeight: 600 }}>{money(run.total_net)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Payslips</h2></div>
        {run.payslips.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {run.status === 'draft' ? 'Not processed yet — click "Process payroll" to generate payslips.' : 'No payslips found.'}
          </p>
        ) : (
          <>
            <BarChartWidget
              title="Gross vs. net pay by employee"
              data={run.payslips.map((p) => ({ name: `${p.first_name} ${p.last_name}`, Gross: Number(p.gross_pay), Net: Number(p.net_pay) }))}
              bars={[{ key: 'Gross', label: 'Gross', color: '#2B6CB0' }, { key: 'Net', label: 'Net', color: '#0B6E4F' }]}
              horizontal
              valueFormatter={(v) => formatMoney(v)}
              height={Math.max(220, run.payslips.length * 34)}
            />
            <table>
            <thead>
              <tr>
                <th>Employee</th><th>Basic</th><th>Allowances</th><th>Gross</th>
                <th>SSNIT (5.5%)</th><th>PAYE</th><th>Net pay</th>
              </tr>
            </thead>
            <tbody>
              {run.payslips.map((p) => (
                <tr key={p.id}>
                  <td>{p.first_name} {p.last_name} ({p.employee_no})</td>
                  <td>{money(p.basic_salary)}</td>
                  <td>{money(p.allowances)}</td>
                  <td>{money(p.gross_pay)}</td>
                  <td>{money(p.ssnit_employee)}</td>
                  <td>{money(p.income_tax)}</td>
                  <td>{money(p.net_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Statutory settings: SSNIT rates + PAYE bands
// ============================================================

function SettingsTab() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission ? hasPermission('hr.settings.manage') : true;

  const [settings, setSettings] = useState(null);
  const [bands, setBands] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/payroll-settings');
      setSettings(data);
      setBands((data.payeBands || []).map((b) => ({
        lowerBound: b.lower_bound,
        upperBound: b.upper_bound === null ? '' : b.upper_bound,
        rate: b.rate,
      })));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load payroll settings');
    }
  }

  useEffect(() => { load(); }, []);

  async function saveRates(e) {
    e.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      await api.patch('/payroll-settings', {
        ssnitEmployeeRate: Number(settings.ssnit_employee_rate),
        ssnitEmployerRate: Number(settings.ssnit_employer_rate),
        ssnitInsurableCeiling: settings.ssnit_insurable_ceiling === '' || settings.ssnit_insurable_ceiling === null
          ? null : Number(settings.ssnit_insurable_ceiling),
        allowancesTaxable: !!settings.allowances_taxable,
      });
      setNotice('Contribution rates saved.');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save rates');
    } finally {
      setSaving(false);
    }
  }

  async function saveBands(e) {
    e.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      await api.put('/paye-bands', {
        bands: bands.map((b) => ({
          lowerBound: Number(b.lowerBound),
          upperBound: b.upperBound === '' ? null : Number(b.upperBound),
          rate: Number(b.rate),
        })),
      });
      setNotice('PAYE bands saved.');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save PAYE bands');
    } finally {
      setSaving(false);
    }
  }

  function updateBand(idx, field, value) {
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  }

  function addBand() {
    const last = bands[bands.length - 1];
    setBands((prev) => [...prev, { lowerBound: last ? (last.upperBound || '') : 0, upperBound: '', rate: 0 }]);
  }

  function removeBand(idx) {
    setBands((prev) => prev.filter((_, i) => i !== idx));
  }

  if (!settings) {
    return <div className="card">{error ? <div className="error-banner">{error}</div> : 'Loading…'}</div>;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="card" style={{ marginBottom: 16, color: '#1F7A54' }}>{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>SSNIT contribution rates</h3>
        <p style={{ color: '#726B5C', fontSize: 14, marginTop: 0 }}>
          Applied to basic salary. The employee share is withheld from pay; the employer share is a
          business cost posted to SSNIT Employer Contribution. Both are credited to SSNIT Payable
          until remitted.
        </p>
        <form onSubmit={saveRates}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label>Employee rate (% of basic)</label>
              <input type="number" step="0.001" min="0" max="100" disabled={!canEdit}
                value={settings.ssnit_employee_rate ?? ''}
                onChange={(e) => setSettings({ ...settings, ssnit_employee_rate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Employer rate (% of basic)</label>
              <input type="number" step="0.001" min="0" max="100" disabled={!canEdit}
                value={settings.ssnit_employer_rate ?? ''}
                onChange={(e) => setSettings({ ...settings, ssnit_employer_rate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Annual insurable ceiling (blank = uncapped)</label>
              <input type="number" step="0.01" min="0" disabled={!canEdit}
                value={settings.ssnit_insurable_ceiling ?? ''}
                onChange={(e) => setSettings({ ...settings, ssnit_insurable_ceiling: e.target.value })} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px' }}>
            <input type="checkbox" disabled={!canEdit}
              checked={!!settings.allowances_taxable}
              onChange={(e) => setSettings({ ...settings, allowances_taxable: e.target.checked })} />
            Allowances form part of chargeable income
          </label>
          {canEdit && <button className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>Save rates</button>}
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>PAYE tax bands</h3>
        <p style={{ color: '#726B5C', fontSize: 14, marginTop: 0 }}>
          Monthly bands applied progressively to chargeable income (gross less SSNIT). Enter rates as
          decimals — 0.175 means 17.5%. Bands must start at 0, be contiguous, and the highest band
          must have a blank upper bound. Update these whenever the GRA revises the tax schedule.
        </p>
        <form onSubmit={saveBands}>
          <table className="table">
            <thead>
              <tr>
                <th>From (GHS)</th>
                <th>To (GHS)</th>
                <th>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i}>
                  <td>
                    <input type="number" step="0.01" disabled={!canEdit} value={b.lowerBound}
                      onChange={(e) => updateBand(i, 'lowerBound', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.01" disabled={!canEdit} value={b.upperBound}
                      placeholder={i === bands.length - 1 ? 'no limit' : ''}
                      onChange={(e) => updateBand(i, 'upperBound', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.0001" min="0" max="1" disabled={!canEdit} value={b.rate}
                      onChange={(e) => updateBand(i, 'rate', e.target.value)} />
                  </td>
                  <td>
                    {canEdit && (
                      <button type="button" className="btn btn-danger" style={{ width: 'auto' }}
                        onClick={() => removeBand(i)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={addBand}>Add band</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>Save bands</button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}

// ============================================================
// Goals & Performance Reviews (Employee Detail)
// ============================================================

function AddGoalModal({ employeeId, onClose, onSaved }) {
  const [kpis, setKpis] = useState([]);
  const [kpiId, setKpiId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [weightPct, setWeightPct] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get('/kpis').then(({ data }) => setKpis(data.filter((k) => k.is_active))).catch(() => {}); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/employees/${employeeId}/goals`, {
        kpiId: kpiId || undefined, title, description: description || undefined,
        targetValue: targetValue ? Number(targetValue) : undefined,
        weightPct: weightPct ? Number(weightPct) : undefined,
        dueDate: dueDate || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add goal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add goal</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></div>
          <div className="form-group">
            <label>Linked KPI</label>
            <select value={kpiId} onChange={(e) => setKpiId(e.target.value)}>
              <option value="">None</option>
              {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}{k.unit ? ` (${k.unit})` : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Target value</label><input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Weight (%)</label><input type="number" min="0" max="100" value={weightPct} onChange={(e) => setWeightPct(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="form-group"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Add goal'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddReviewModal({ employee, onClose, onSaved }) {
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [reviewType, setReviewType] = useState('supervisor');
  const [overallRating, setOverallRating] = useState('');
  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [comments, setComments] = useState('');
  const [promotionRecommended, setPromotionRecommended] = useState(false);
  const [promotionNotes, setPromotionNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get('/performance-cycles').then(({ data }) => setCycles(data)).catch(() => {}); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/employees/${employee.id}/performance-reviews`, {
        cycleId, reviewType, overallRating: overallRating ? Number(overallRating) : undefined,
        strengths: strengths || undefined, areasForImprovement: areasForImprovement || undefined,
        comments: comments || undefined, promotionRecommended, promotionNotes: promotionNotes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add review');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add review — {employee.first_name} {employee.last_name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          Self-assessments must be written by the employee themselves; supervisor evaluations require you to be their manager (or hold hr.performance.manage).
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Cycle</label>
            <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} required>
              <option value="">Select a cycle</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Review type</label>
            <select value={reviewType} onChange={(e) => setReviewType(e.target.value)}>
              <option value="supervisor">Supervisor evaluation</option>
              <option value="self">Self-assessment</option>
              <option value="peer">Peer review</option>
            </select>
          </div>
          <div className="form-group"><label>Overall rating (1-5)</label><input type="number" min="1" max="5" step="0.5" value={overallRating} onChange={(e) => setOverallRating(e.target.value)} /></div>
          <div className="form-group"><label>Strengths</label><input value={strengths} onChange={(e) => setStrengths(e.target.value)} /></div>
          <div className="form-group"><label>Areas for improvement</label><input value={areasForImprovement} onChange={(e) => setAreasForImprovement(e.target.value)} /></div>
          <div className="form-group"><label>Comments</label><input value={comments} onChange={(e) => setComments(e.target.value)} /></div>
          {reviewType === 'supervisor' && (
            <>
              <div className="checkbox-row">
                <input type="checkbox" checked={promotionRecommended} onChange={(e) => setPromotionRecommended(e.target.checked)} />
                <label style={{ margin: 0 }}>Recommend for promotion</label>
              </div>
              {promotionRecommended && (
                <div className="form-group"><label>Promotion notes</label><input value={promotionNotes} onChange={(e) => setPromotionNotes(e.target.value)} /></div>
              )}
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save review'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

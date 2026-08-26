import { useEffect, useState, Fragment } from 'react';
import { useLocation, Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../components/charts';
import WorkspaceHeroGraphic from '../components/WorkspaceHeroGraphic';
import StructuredInsight from '../components/StructuredInsight';
import PrintButton from '../components/PrintButton';
import {
  IconModStudents, IconModAttendance, IconModExams, IconModFees, IconModTimetable, IconModLibrary,
  IconModTransport, IconModLearning, IconModPromotions, IconModAdmissions, IconModClasses,
  IconModCalendar, IconModSubjects, IconModGuardians, IconModStructure, IconModShop, IconModFinances, IconModReports,
} from '../components/icons';

const money = (n) => formatMoney(n);

const label = (s) => s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TABS = [
  { key: 'students', label: 'Students', icon: IconModStudents, color: '#0B6E4F', bg: '#E7F5EF' },
  { key: 'attendance', label: 'Attendance', icon: IconModAttendance, color: '#2B6CB0', bg: '#EAF1F8' },
  { key: 'exams', label: 'Exams & Marks', icon: IconModExams, color: '#B9790A', bg: '#FBF1DE' },
  { key: 'fees', label: 'Fees', icon: IconModFees, color: '#1E7A6E', bg: '#E6F3F1' },
  { key: 'timetable', label: 'Timetable', icon: IconModTimetable, color: '#6B4FA0', bg: '#F1EBF8' },
  { key: 'library', label: 'Library', icon: IconModLibrary, color: '#8A6A2F', bg: '#F5EEDF' },
  { key: 'transport', label: 'Transport', icon: IconModTransport, color: '#C9971F', bg: '#FBF3DF' },
  { key: 'learning', label: 'Learning', icon: IconModLearning, color: '#C25B2C', bg: '#FBEBE2' },
  { key: 'promotions', label: 'Promotions', icon: IconModPromotions, color: '#2F9E6E', bg: '#EAF6EF' },
  { key: 'admissions', label: 'Admissions', icon: IconModAdmissions, color: '#A8425C', bg: '#F7E9ED' },
  { key: 'classes', label: 'Classes', icon: IconModClasses, color: '#3D6B99', bg: '#E8F0F7' },
  { key: 'calendar', label: 'Academic Calendar', icon: IconModCalendar, color: '#4F7942', bg: '#EDF3E9' },
  { key: 'subjects', label: 'Subjects', icon: IconModSubjects, color: '#7A4F9E', bg: '#F0E9F7' },
  { key: 'guardians', label: 'Guardians', icon: IconModGuardians, color: '#A0522D', bg: '#F5E9E1' },
  { key: 'structure', label: 'School Structure', icon: IconModStructure, color: '#5B7B8A', bg: '#EAF0F2' },
  { key: 'shop', label: 'School Shop', icon: IconModShop, color: '#D4763A', bg: '#FBEDE3' },
  { key: 'finances', label: 'Finances', icon: IconModFinances, color: '#1B5E63', bg: '#E5F0F0' },
  { key: 'reports', label: 'Reports', icon: IconModReports, color: '#6D5A8C', bg: '#EFEAF5' },
  // Navigates to School's own Academic Intelligence page — a genuinely
  // separate report builder scoped to School's own data sources
  // (Students, Attendance, Exam Results, Fee Payments), not the general
  // Business Intelligence page. The two share the same underlying
  // ReportBuilder component and the same /bi/* endpoints, but the
  // backend itself restricts which data sources and saved reports each
  // page can see (?domain=school), so this page genuinely cannot surface
  // Sales Invoices or the General Ledger, not merely hide them from
  // view. `route` (rather than a `key` matched against activeModule) is
  // what tells the tile grid below to navigate to a real page instead
  // of switching in-page tabs.
  { key: 'academic-intelligence', label: 'Academic Intelligence', icon: IconModReports, color: '#0B6E4F', bg: '#E7F5EF', route: '/school/academic-intelligence' },
];

export default function SchoolManagement() {
  const location = useLocation();
  // If we arrived via a workspace drill-down link with a specific tab in
  // mind (e.g. "Recent Admissions" on the School Workspace), land directly
  // on that module's focused view rather than the grid — the same
  // "don't bury the thing someone actually clicked through to" behavior
  // the sidebar's own auto-open logic already follows.
  const [activeModule, setActiveModule] = useState(location.state?.tab || null);
  const activeTab = TABS.find((t) => t.key === activeModule);
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  async function generateInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const { data } = await api.get('/school/academic-insights');
      setInsight(data);
    } catch (err) {
      setInsightError(err.response?.data?.error || 'Could not generate an insight right now.');
    } finally {
      setInsightLoading(false);
    }
  }

  if (activeModule && activeTab) {
    return (
      <DashboardLayout title={`School Management — ${activeTab.label}`}>
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 16 }} onClick={() => setActiveModule(null)}>
          ← Back to School Management
        </button>
        {activeModule === 'students' && <Students />}
        {activeModule === 'attendance' && <Attendance />}
        {activeModule === 'exams' && <ExamsAndMarks />}
        {activeModule === 'fees' && <Fees />}
        {activeModule === 'timetable' && <Timetable />}
        {activeModule === 'library' && <Library />}
        {activeModule === 'transport' && <Transport />}
        {activeModule === 'learning' && <Learning />}
        {activeModule === 'promotions' && <Promotions />}
        {activeModule === 'calendar' && <AcademicCalendar />}
        {activeModule === 'admissions' && <Admissions />}
        {activeModule === 'classes' && <Classes />}
        {activeModule === 'guardians' && <Guardians />}
        {activeModule === 'structure' && <SchoolStructure />}
        {activeModule === 'shop' && <SchoolShop />}
        {activeModule === 'finances' && <SchoolFinances />}
        {activeModule === 'reports' && <SchoolReports />}
        {activeModule === 'subjects' && <Subjects />}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="School Management">
      <WorkspaceHeroGraphic variant="school" />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>Academic Intelligence — AI Insight</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={generateInsight} disabled={insightLoading}>
            {insightLoading ? 'Generating…' : 'Generate Insight'}
          </button>
        </div>
        {insightError && <div className="error-banner">{insightError}</div>}
        {!insight && !insightError && (
          <p className="dashboard-empty-note">Ask for a real, current-data narrative on enrollment, attendance, exam performance, and at-risk students.</p>
        )}
        {insight && insight.available === false && (
          <p className="dashboard-empty-note">{insight.message}</p>
        )}
        {insight && insight.available && <StructuredInsight insight={insight.insight} />}
      </div>

      <div className="module-launcher-grid">
        {TABS.map((t) => {
          const TileIcon = t.icon;
          if (t.route) {
            return (
              <Link key={t.key} to={t.route} className="module-tile" style={{ '--tile-color': t.color, '--tile-bg': t.bg }}>
                <span className="module-tile-icon"><TileIcon /></span>
                <span className="module-tile-label">{t.label}</span>
              </Link>
            );
          }
          return (
            <button
              key={t.key}
              className="module-tile"
              style={{ '--tile-color': t.color, '--tile-bg': t.bg }}
              onClick={() => setActiveModule(t.key)}
            >
              <span className="module-tile-icon"><TileIcon /></span>
              <span className="module-tile-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
const REPORT_SECTIONS = [
  { key: 'outstanding-fees', label: 'Outstanding Fees' },
  { key: 'class-roster', label: 'Class Roster' },
  { key: 'attendance-summary', label: 'Attendance Summary' },
];

function SchoolReports() {
  const [section, setSection] = useState('outstanding-fees');
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {REPORT_SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      {section === 'outstanding-fees' && <OutstandingFeesReport />}
      {section === 'class-roster' && <ClassRosterReport />}
      {section === 'attendance-summary' && <AttendanceSummaryReport />}
    </div>
  );
}

function OutstandingFeesReport() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/school/reports/outstanding-fees').then(({ data }) => setData(data)); }, []);

  if (data === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Outstanding Fees</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700 }}>Total: {money(data.totalOutstanding)}</span>
          <PrintButton />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Every student with an unpaid or partially-paid invoice, sorted by the largest balance first — {data.studentCount} student{data.studentCount === 1 ? '' : 's'} in total.
      </p>
      {data.students.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No outstanding fees — everyone is paid up.</p> : (
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Class</th><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.id}>
                <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td><td>{s.class_name || '—'}</td><td>{s.invoice_no}</td>
                <td>{money(s.total_amount)}</td><td>{money(s.amount_paid)}</td>
                <td style={{ fontWeight: 600, color: 'var(--color-error)' }}>{money(s.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ClassRosterReport() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/school/classes').then(({ data }) => setClasses(data)); }, []);
  useEffect(() => {
    if (!classId) { setData(null); return; }
    api.get('/school/reports/class-roster?classId=' + classId).then(({ data }) => setData(data));
  }, [classId]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Class Roster</h2>
        {data && <PrintButton />}
      </div>
      <div className="form-group" style={{ maxWidth: 280 }}>
        <label>Class</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select a class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {data && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{data.students.length} enrolled student{data.students.length === 1 ? '' : 's'} in {data.class.name}.</p>
          <table>
            <thead><tr><th>Student #</th><th>Name</th><th>Gender</th><th>Date of Birth</th><th>Guardian</th><th>Guardian Phone</th></tr></thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id}>
                  <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td><td style={{ textTransform: 'capitalize' }}>{s.gender || '—'}</td>
                  <td>{s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString() : '—'}</td>
                  <td>{s.guardian_first_name ? `${s.guardian_first_name} ${s.guardian_last_name}` : '—'}</td>
                  <td>{s.guardian_phone || '—'}</td>
                </tr>
              ))}
              {data.students.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No enrolled students in this class.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function AttendanceSummaryReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);

  function load() { api.get(`/school/reports/attendance-summary?from=${from}&to=${to}`).then(({ data }) => setData(data)); }
  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Attendance Summary</h2>
        <PrintButton />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group" style={{ margin: 0 }}><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={load}>Refresh</button>
      </div>
      {data === null ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Class</th><th>Days Marked</th><th>Days Present</th><th>Attendance Rate</th></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td><td>{s.class_name || '—'}</td>
                <td>{s.total_marked}</td><td>{s.present_count}</td>
                <td style={{ fontWeight: 600, color: s.attendanceRate !== null && s.attendanceRate < 0.75 ? 'var(--color-error)' : 'var(--color-text)' }}>
                  {s.attendanceRate === null ? '—' : `${Math.round(s.attendanceRate * 100)}%`}
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No enrolled students.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
const FINANCE_SECTIONS = [
  { key: 'trial-balance', label: 'Trial Balance' },
  { key: 'income-statement', label: 'Income Statement' },
  { key: 'financial-position', label: 'Statement of Financial Position' },
  { key: 'cash-flows', label: 'Statement of Cash Flows' },
];

function SchoolFinances() {
  const [section, setSection] = useState('trial-balance');
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {FINANCE_SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      {section === 'trial-balance' && <SchoolTrialBalance />}
      {section === 'income-statement' && <SchoolIncomeStatement />}
      {section === 'financial-position' && <SchoolStatementOfFinancialPosition />}
      {section === 'cash-flows' && <SchoolStatementOfCashFlows />}
    </div>
  );
}

function SchoolTrialBalance() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/school/finance/trial-balance').then(({ data }) => setData(data)); }, []);

  if (data === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Trial Balance</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge ${data.balanced ? 'badge-success' : 'badge-danger'}`}>{data.balanced ? 'Balanced' : 'Out of balance'}</span>
          <PrintButton />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        School's own books — separate from Accounting &amp; Finance's ledger. Every fee invoice, fee payment, shop purchase, and shop sale lands here.
      </p>
      <table>
        <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Total Debit</th><th>Total Credit</th><th>Balance</th></tr></thead>
        <tbody>
          {data.accounts.map((a) => (
            <tr key={a.account_code}>
              <td>{a.account_code}</td><td>{a.account_name}</td><td style={{ textTransform: 'capitalize' }}>{a.account_type}</td>
              <td>{money(a.total_debit)}</td><td>{money(a.total_credit)}</td>
              <td style={{ fontWeight: 600, color: a.balance < 0 ? 'var(--color-error)' : 'var(--color-text)' }}>{money(a.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
            <td colSpan={3}>Total</td><td>{money(data.totalDebit)}</td><td>{money(data.totalCredit)}</td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SchoolIncomeStatement() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/school/finance/income-statement').then(({ data }) => setData(data)); }, []);

  if (data === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Income Statement</h2>
        <PrintButton />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Revenue from fees and shop sales, less the cost of goods sold.</p>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Revenue</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          {data.revenue.map((r) => <tr key={r.account_code}><td>{r.account_name}</td><td style={{ textAlign: 'right' }}>{money(r.amount)}</td></tr>)}
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Total Revenue</td><td style={{ textAlign: 'right' }}>{money(data.totalRevenue)}</td></tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Expenses</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          {data.expenses.map((r) => <tr key={r.account_code}><td>{r.account_name}</td><td style={{ textAlign: 'right' }}>{money(r.amount)}</td></tr>)}
          {data.expenses.length === 0 && <tr><td style={{ color: 'var(--color-text-muted)' }}>No expenses recorded yet.</td></tr>}
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Total Expenses</td><td style={{ textAlign: 'right' }}>{money(data.totalExpenses)}</td></tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, paddingTop: 12, borderTop: '2px solid var(--color-border)' }}>
        <span>Net Income</span>
        <span style={{ color: data.netIncome >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>{money(data.netIncome)}</span>
      </div>
    </div>
  );
}

function SchoolStatementOfFinancialPosition() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/school/finance/statement-of-financial-position').then(({ data }) => setData(data)); }, []);

  if (data === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Statement of Financial Position</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge ${data.balanced ? 'badge-success' : 'badge-danger'}`}>{data.balanced ? 'Balanced' : 'Out of balance'}</span>
          <PrintButton />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Assets = Liabilities + Equity. "Retained Earnings" here is a genuinely computed figure — accumulated revenue minus accumulated expenses — not a stored balance, since nothing in School's books closes revenue and expenses into an equity account at period-end.
      </p>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Assets</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          {data.assets.map((a) => <tr key={a.account_code}><td>{a.account_name}</td><td style={{ textAlign: 'right' }}>{money(a.amount)}</td></tr>)}
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Total Assets</td><td style={{ textAlign: 'right' }}>{money(data.totalAssets)}</td></tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Liabilities</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          {data.liabilities.map((l) => <tr key={l.account_code}><td>{l.account_name}</td><td style={{ textAlign: 'right' }}>{money(l.amount)}</td></tr>)}
          {data.liabilities.length === 0 && <tr><td style={{ color: 'var(--color-text-muted)' }}>No liabilities recorded.</td></tr>}
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Total Liabilities</td><td style={{ textAlign: 'right' }}>{money(data.totalLiabilities)}</td></tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Equity</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          {data.equity.map((e, i) => <tr key={i}><td>{e.account_name}</td><td style={{ textAlign: 'right' }}>{money(e.amount)}</td></tr>)}
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Total Equity</td><td style={{ textAlign: 'right' }}>{money(data.totalEquity)}</td></tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, paddingTop: 12, borderTop: '2px solid var(--color-border)' }}>
        <span>Liabilities + Equity</span>
        <span>{money(data.totalLiabilities + data.totalEquity)}</span>
      </div>
    </div>
  );
}

function SchoolStatementOfCashFlows() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/school/finance/statement-of-cash-flows').then(({ data }) => setData(data)); }, []);

  if (data === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Statement of Cash Flows</h2>
        <PrintButton />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        The direct method — real cash movements, grouped by what actually caused them. Generating a fee invoice doesn't appear here, since that only affects Fees Receivable; only actually collecting the payment does.
      </p>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Operating Activities</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          {data.operatingActivities.map((a) => (
            <tr key={a.referenceType}>
              <td>{a.label}</td>
              <td style={{ textAlign: 'right', color: a.amount < 0 ? 'var(--color-error)' : 'var(--color-text)' }}>{money(a.amount)}</td>
            </tr>
          ))}
          {data.operatingActivities.length === 0 && <tr><td style={{ color: 'var(--color-text-muted)' }}>No cash activity yet.</td></tr>}
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Net Cash from Operating Activities</td><td style={{ textAlign: 'right' }}>{money(data.netCashFromOperating)}</td></tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Investing Activities</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          <tr><td style={{ color: 'var(--color-text-muted)' }}>None recorded.</td></tr>
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Net Cash from Investing Activities</td><td style={{ textAlign: 'right' }}>{money(data.netCashFromInvesting)}</td></tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Financing Activities</h3>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          <tr><td style={{ color: 'var(--color-text-muted)' }}>None recorded.</td></tr>
          <tr style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)' }}><td>Net Cash from Financing Activities</td><td style={{ textAlign: 'right' }}>{money(data.netCashFromFinancing)}</td></tr>
        </tbody>
      </table>

      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Opening Cash</span><span>{money(data.openingCash)}</span></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, paddingTop: 12, borderTop: '2px solid var(--color-border)' }}>
        <span>Closing Cash</span>
        <span style={{ color: 'var(--color-primary)' }}>{money(data.closingCash)}</span>
      </div>
    </div>
  );
}

// ============================================================================
const SHOP_SECTIONS = [
  { key: 'shelves', label: 'Shelves' },
  { key: 'items', label: 'Items' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'sales', label: 'Sales' },
];

function SchoolShop() {
  const [section, setSection] = useState('shelves');
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {SHOP_SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      {section === 'shelves' && <ShopShelves />}
      {section === 'items' && <ShopItems />}
      {section === 'purchases' && <ShopPurchases />}
      {section === 'sales' && <ShopSales />}
    </div>
  );
}

function ShopShelves() {
  const [list, setList] = useState(null);

  useEffect(() => { api.get('/school/shop/items').then(({ data }) => setList(data)); }, []);

  if (list === null) return <div className="card"><p>Loading...</p></div>;
  if (list.length === 0) return <div className="card"><p style={{ color: 'var(--color-text-muted)' }}>No items on the shelves yet — add some under the Items tab.</p></div>;

  // Grouped by category, mirroring how a real shop organizes its physical
  // shelves — items with no category land on a shared "General" shelf
  // rather than being dropped or hidden.
  const shelves = list.reduce((acc, item) => {
    const shelfName = item.category || 'General';
    acc[shelfName] = acc[shelfName] || [];
    acc[shelfName].push(item);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(shelves).map(([shelfName, items]) => (
        <div key={shelfName} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{shelfName}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, paddingBottom: 14, borderBottom: '6px solid var(--color-gold)', borderRadius: '4px 4px 0 0' }}>
            {items.map((item) => {
              const low = item.stock_quantity <= item.reorder_level;
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10,
                    padding: '14px 14px 12px', boxShadow: 'var(--shadow-soft)', opacity: item.is_active ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, minHeight: 34 }}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: low ? 'var(--color-error)' : 'var(--color-text)' }}>{item.stock_quantity}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>in stock</span>
                    {low && <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>Reorder</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CP</span><strong style={{ color: 'var(--color-text)' }}>{money(item.cost_price)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SP</span><strong style={{ color: 'var(--color-text)' }}>{money(item.selling_price)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Reorder Level</span><strong style={{ color: 'var(--color-text)' }}>{item.reorder_level}</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShopItems() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { name: '', sku: '', category: '', sellingPrice: '', costPrice: '', stockQuantity: 0, reorderLevel: 0 };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/shop/items').then(({ data }) => setList(data)); }
  useEffect(load, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(item) {
    setCreating(false);
    setEditingId(item.id);
    setForm({ name: item.name, sku: item.sku || '', category: item.category || '', sellingPrice: item.selling_price, costPrice: item.cost_price, stockQuantity: item.stock_quantity, reorderLevel: item.reorder_level });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.patch(`/school/shop/items/${editingId}`, { name: form.name, sku: form.sku, category: form.category, sellingPrice: Number(form.sellingPrice), costPrice: Number(form.costPrice), reorderLevel: Number(form.reorderLevel) });
        setEditingId(null);
      } else {
        await api.post('/school/shop/items', { ...form, sellingPrice: Number(form.sellingPrice), costPrice: Number(form.costPrice || 0), stockQuantity: Number(form.stockQuantity || 0), reorderLevel: Number(form.reorderLevel || 0) });
        setCreating(false);
      }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save item');
    }
  }

  async function remove(item) {
    const ok = await confirm(`Delete "${item.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/shop/items/${item.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete item', 'error'); }
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Shop Items</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Item'}</button>
      </div>
      {formOpen && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>SKU</label><input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Category</label><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ width: 120 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Selling price</label><input type="number" step="0.01" value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} style={{ width: 100 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Cost price</label><input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} style={{ width: 100 }} /></div>
          {!editingId && <div className="form-group" style={{ margin: 0 }}><label>Opening stock</label><input type="number" value={form.stockQuantity} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} style={{ width: 90 }} /></div>}
          <div className="form-group" style={{ margin: 0 }}><label>Reorder level</label><input type="number" value={form.reorderLevel} onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))} style={{ width: 90 }} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No shop items yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Selling Price</th><th>Cost</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id} style={!item.is_active ? { opacity: 0.5 } : undefined}>
                <td>{item.name}</td><td>{item.sku || '—'}</td><td>{item.category || '—'}</td>
                <td>{money(item.selling_price)}</td><td>{money(item.cost_price)}</td>
                <td style={item.stock_quantity <= item.reorder_level ? { color: 'var(--color-error)', fontWeight: 600 } : undefined}>{item.stock_quantity}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(item)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(item)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShopPurchases() {
  const { showToast } = useToast();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [lines, setLines] = useState([{ itemId: '', quantity: 1, unitCost: '' }]);
  const [error, setError] = useState('');

  function load() { api.get('/school/shop/purchases').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/school/shop/items').then(({ data }) => setItems(data)).catch(() => setItems([])); }, []);

  function addLine() { setLines((l) => [...l, { itemId: '', quantity: 1, unitCost: '' }]); }
  function updateLine(i, field, value) { setLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line))); }
  function removeLine(i) { setLines((l) => l.filter((_, idx) => idx !== i)); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/shop/purchases', {
        supplierName,
        items: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      });
      setCreating(false);
      setSupplierName('');
      setLines([{ itemId: '', quantity: 1, unitCost: '' }]);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record purchase');
    }
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Purchases (Restocking)</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Purchase'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-group" style={{ maxWidth: 280 }}><label>Supplier</label><input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Accra Stationers Ltd" /></div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                <label>Item</label>
                <select value={line.itemId} onChange={(e) => updateLine(i, 'itemId', e.target.value)} required>
                  <option value="">Select</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}><label>Qty</label><input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={{ width: 80 }} required /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Unit cost</label><input type="number" step="0.01" min="0" value={line.unitCost} onChange={(e) => updateLine(i, 'unitCost', e.target.value)} style={{ width: 100 }} required /></div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeLine(i)}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 10 }} onClick={addLine}>+ Add Line</button>
          <p style={{ fontWeight: 600 }}>Total: {money(total)}</p>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Record Purchase</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No purchases recorded yet.</p> : (
        <table>
          <thead><tr><th>Purchase #</th><th>Supplier</th><th>Date</th><th>Total</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.purchase_no}</td><td>{p.supplier_name || '—'}</td><td>{new Date(p.purchase_date).toLocaleDateString()}</td><td>{money(p.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShopSales() {
  const { showToast } = useToast();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [lines, setLines] = useState([{ itemId: '', quantity: 1 }]);
  const [error, setError] = useState('');

  function load() { api.get('/school/shop/sales').then(({ data }) => setList(data)); }
  useEffect(() => {
    load();
    api.get('/school/shop/items').then(({ data }) => setItems(data.filter((i) => i.is_active))).catch(() => setItems([]));
    api.get('/school/students?status=enrolled').then(({ data }) => setStudents(data)).catch(() => setStudents([]));
  }, []);

  function addLine() { setLines((l) => [...l, { itemId: '', quantity: 1 }]); }
  function updateLine(i, field, value) { setLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line))); }
  function removeLine(i) { setLines((l) => l.filter((_, idx) => idx !== i)); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/shop/sales', {
        studentId: studentId || null,
        paymentMethod,
        items: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })),
      });
      setCreating(false);
      setStudentId('');
      setLines([{ itemId: '', quantity: 1 }]);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record sale', 'error');
    }
  }

  const total = lines.reduce((sum, l) => {
    const item = items.find((it) => it.id === l.itemId);
    return sum + (item ? Number(item.selling_price) * (Number(l.quantity) || 0) : 0);
  }, 0);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Sales</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Sale'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
              <label>Student (optional)</label>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Walk-in / Staff</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_no})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Payment method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="card">Card</option>
              </select>
            </div>
          </div>
          {lines.map((line, i) => {
            const item = items.find((it) => it.id === line.itemId);
            return (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
                  <label>Item</label>
                  <select value={line.itemId} onChange={(e) => updateLine(i, 'itemId', e.target.value)} required>
                    <option value="">Select</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.stock_quantity} in stock)</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}><label>Qty</label><input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={{ width: 80 }} required /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Line total</label><input value={item ? money(item.selling_price * (Number(line.quantity) || 0)) : '—'} disabled style={{ width: 100 }} /></div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeLine(i)}>Remove</button>
              </div>
            );
          })}
          <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 10 }} onClick={addLine}>+ Add Line</button>
          <p style={{ fontWeight: 600 }}>Total: {money(total)}</p>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Record Sale</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No sales recorded yet.</p> : (
        <table>
          <thead><tr><th>Sale #</th><th>Student</th><th>Payment</th><th>Date</th><th>Total</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>{s.sale_no}</td><td>{s.student_first_name ? `${s.student_first_name} ${s.student_last_name}` : 'Walk-in / Staff'}</td>
                <td style={{ textTransform: 'capitalize' }}>{s.payment_method.replace('_', ' ')}</td>
                <td>{new Date(s.sale_date).toLocaleDateString()}</td><td>{money(s.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
const STRUCTURE_SECTIONS = [
  { key: 'departments', label: 'Departments' },
  { key: 'gradeLevels', label: 'Grade Levels' },
  { key: 'houses', label: 'Houses' },
];

function SchoolStructure() {
  const [section, setSection] = useState('departments');
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {STRUCTURE_SECTIONS.map((s) => (
          <button key={s.key} className={section === s.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      {section === 'departments' && <Departments />}
      {section === 'gradeLevels' && <GradeLevels />}
      {section === 'houses' && <Houses />}
    </div>
  );
}

function Departments() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { name: '', description: '', headStaffId: '', sequenceOrder: 0 };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/departments').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/school/staff').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(d) {
    setCreating(false);
    setEditingId(d.id);
    setForm({ name: d.name, description: d.description || '', headStaffId: d.head_staff_id || '', sequenceOrder: d.sequence_order });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, sequenceOrder: Number(form.sequenceOrder) };
    try {
      if (editingId) { await api.patch(`/school/departments/${editingId}`, payload); setEditingId(null); }
      else { await api.post('/school/departments', payload); setCreating(false); }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save department');
    }
  }

  async function remove(d) {
    const ok = await confirm(`Delete department "${d.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/departments/${d.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete department', 'error'); }
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Departments</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Department'}</button>
      </div>
      {formOpen && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Primary School" required /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Head</label>
            <select value={form.headStaffId} onChange={(e) => setForm((f) => ({ ...f, headStaffId: e.target.value }))}>
              <option value="">Unassigned</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Order</label><input type="number" value={form.sequenceOrder} onChange={(e) => setForm((f) => ({ ...f, sequenceOrder: e.target.value }))} style={{ width: 70 }} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No departments yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Head</th><th>Grade Levels</th><th></th></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td><td>{d.head_first_name ? `${d.head_first_name} ${d.head_last_name}` : '—'}</td><td>{d.grade_level_count}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(d)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(d)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GradeLevels() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { name: '', departmentId: '', sequenceOrder: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/grade-levels').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/school/departments').then(({ data }) => setDepartments(data)).catch(() => setDepartments([])); }, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(g) {
    setCreating(false);
    setEditingId(g.id);
    setForm({ name: g.name, departmentId: g.department_id || '', sequenceOrder: g.sequence_order });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, sequenceOrder: Number(form.sequenceOrder) };
    try {
      if (editingId) { await api.patch(`/school/grade-levels/${editingId}`, payload); setEditingId(null); }
      else { await api.post('/school/grade-levels', payload); setCreating(false); }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save grade level');
    }
  }

  async function remove(g) {
    const ok = await confirm(`Delete grade level "${g.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/grade-levels/${g.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete grade level', 'error'); }
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Grade Levels</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Grade Level'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>The order number is the real, school-wide ladder — used to tell which level genuinely comes before another, not just what it's labeled.</p>
      {formOpen && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Primary 4" required /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Department</label>
            <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
              <option value="">None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Order</label><input type="number" min="1" value={form.sequenceOrder} onChange={(e) => setForm((f) => ({ ...f, sequenceOrder: e.target.value }))} style={{ width: 70 }} required /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No grade levels yet.</p> : (
        <table>
          <thead><tr><th>Order</th><th>Name</th><th>Department</th><th>Classes</th><th></th></tr></thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id}>
                <td>{g.sequence_order}</td><td>{g.name}</td><td>{g.department_name || '—'}</td><td>{g.class_count}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(g)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(g)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Houses() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { name: '', color: '#0B6E4F', houseMasterId: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/houses').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/school/staff').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(h) {
    setCreating(false);
    setEditingId(h.id);
    setForm({ name: h.name, color: h.color || '#0B6E4F', houseMasterId: h.house_master_id || '' });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) { await api.patch(`/school/houses/${editingId}`, form); setEditingId(null); }
      else { await api.post('/school/houses', form); setCreating(false); }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save house');
    }
  }

  async function remove(h) {
    const ok = await confirm(`Delete house "${h.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/houses/${h.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete house', 'error'); }
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Houses</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New House'}</button>
      </div>
      {formOpen && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Red House" required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Color</label><input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ width: 60, padding: 2 }} /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>House master</label>
            <select value={form.houseMasterId} onChange={(e) => setForm((f) => ({ ...f, houseMasterId: e.target.value }))}>
              <option value="">Unassigned</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No houses yet.</p> : (
        <table>
          <thead><tr><th>House</th><th>Master</th><th>Students</th><th></th></tr></thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id}>
                <td><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: h.color || '#999', marginRight: 6, verticalAlign: 'middle' }} />{h.name}</td>
                <td>{h.master_first_name ? `${h.master_first_name} ${h.master_last_name}` : '—'}</td><td>{h.student_count}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(h)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(h)}>Delete</button>
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
function AcademicCalendar() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [terms, setTerms] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const blankForm = { academicYear: '', termName: '', sequenceOrder: 1, startDate: '', endDate: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/academic-terms').then(({ data }) => setTerms(data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/academic-terms', { ...form, sequenceOrder: Number(form.sequenceOrder) });
      setCreating(false);
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save term');
    }
  }

  async function editTerm(t) {
    const startDate = window.prompt('Start date (YYYY-MM-DD):', t.start_date.slice(0, 10));
    if (startDate === null) return;
    const endDate = window.prompt('End date (YYYY-MM-DD):', t.end_date.slice(0, 10));
    if (endDate === null) return;
    try { await api.patch(`/school/academic-terms/${t.id}`, { startDate, endDate }); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update term', 'error'); }
  }

  async function removeTerm(t) {
    const ok = await confirm(`Delete "${t.term_name}" (${t.academic_year})?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/academic-terms/${t.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete term', 'error'); }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Academic Calendar</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Term'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        The sequence number marks which term is genuinely last for the year — that's the one whose end date triggers promotion, regardless of what it's named.
      </p>
      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Academic year</label><input value={form.academicYear} onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2026/2027" required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Term name</label><input value={form.termName} onChange={(e) => setForm((f) => ({ ...f, termName: e.target.value }))} placeholder="e.g. Term 1" required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Sequence #</label><input type="number" min="1" value={form.sequenceOrder} onChange={(e) => setForm((f) => ({ ...f, sequenceOrder: e.target.value }))} style={{ width: 80 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Start date</label><input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>End date</label><input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}
      {terms === null ? <p>Loading...</p> : terms.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No academic terms defined yet.</p> : (
        <table>
          <thead><tr><th>Academic Year</th><th>Term</th><th>Seq</th><th>Start</th><th>End</th><th></th></tr></thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.id}>
                <td>{t.academic_year}</td><td>{t.term_name}</td><td>{t.sequence_order}</td>
                <td>{new Date(t.start_date).toLocaleDateString()}</td><td>{new Date(t.end_date).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => editTerm(t)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeTerm(t)}>Delete</button>
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
function Promotions() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [batches, setBatches] = useState(null);
  const [terms, setTerms] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genForm, setGenForm] = useState({ academicYear: '', termId: '' });
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [error, setError] = useState('');

  function load() { api.get('/school/promotions').then(({ data }) => setBatches(data)); }
  useEffect(() => { load(); api.get('/school/academic-terms').then(({ data }) => setTerms(data)).catch(() => setTerms([])); }, []);

  async function submitGenerate(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/school/promotions/generate', genForm);
      setGenerating(false);
      setGenForm({ academicYear: '', termId: '' });
      showToast(`Generated ${data.candidateCount} promotion candidate(s).`, 'success');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate promotion batch');
    }
  }

  if (selectedBatch) return <PromotionBatchDetail id={selectedBatch} onBack={() => { setSelectedBatch(null); load(); }} showToast={showToast} confirm={confirm} />;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Promotions</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setGenerating((g) => !g)}>{generating ? 'Cancel' : '+ Generate Batch'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Generating a batch only proposes promotions — nothing moves until a teacher reviews and approves each one, and the batch is applied.
        A batch is also generated automatically once a year's final term has ended, if one doesn't already exist.
      </p>
      {generating && (
        <form onSubmit={submitGenerate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Academic year</label><input value={genForm.academicYear} onChange={(e) => setGenForm((f) => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2026/2027" required /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Triggering term (optional)</label>
            <select value={genForm.termId} onChange={(e) => setGenForm((f) => ({ ...f, termId: e.target.value }))}>
              <option value="">None</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.academic_year} — {t.term_name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Generate</button>
        </form>
      )}
      {batches === null ? <p>Loading...</p> : batches.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No promotion batches yet.</p> : (
        <table>
          <thead><tr><th>Academic Year</th><th>Status</th><th>Pending</th><th>Approved</th><th>Rejected</th><th></th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedBatch(b.id)}>
                <td>{b.academic_year}</td>
                <td><span className={`badge ${b.status === 'completed' ? 'badge-success' : 'badge-warning'}`} style={{ textTransform: 'capitalize' }}>{b.status.replace('_', ' ')}</span></td>
                <td>{b.pending_count}</td><td>{b.approved_count}</td><td>{b.rejected_count}</td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setSelectedBatch(b.id)}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PromotionBatchDetail({ id, onBack, showToast, confirm }) {
  const [batch, setBatch] = useState(null);
  const [applying, setApplying] = useState(false);

  function load() { api.get(`/school/promotions/${id}`).then(({ data }) => setBatch(data)); }
  useEffect(load, [id]);

  async function review(candidateId, status) {
    try { await api.patch(`/school/promotions/candidates/${candidateId}`, { status }); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update review', 'error'); }
  }

  async function apply() {
    const approvedCount = batch.candidates.filter((c) => c.status === 'approved' && !c.applied).length;
    if (approvedCount === 0) { showToast('No approved (unapplied) candidates to apply.', 'error'); return; }
    const ok = await confirm(`Apply ${approvedCount} approved promotion(s)? Each student's class will actually change.`, { confirmLabel: 'Apply' });
    if (!ok) return;
    setApplying(true);
    try {
      const { data } = await api.post(`/school/promotions/${id}/apply`);
      showToast(`Applied ${data.appliedCount} promotion(s).`, 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to apply promotions', 'error');
    } finally {
      setApplying(false);
    }
  }

  if (!batch) return <div className="card"><p>Loading...</p></div>;

  const statusBadge = (s) => ({ pending: 'badge-neutral', approved: 'badge-success', rejected: 'badge-danger' }[s] || 'badge-neutral');

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to promotions</button>
      <div className="card">
        <div className="card-header">
          <h2>{batch.academic_year} Promotion Batch</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={apply} disabled={applying}>{applying ? 'Applying...' : 'Apply Approved'}</button>
        </div>
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>From</th><th>To</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {batch.candidates.map((c) => (
              <tr key={c.id}>
                <td>{c.student_no}</td><td>{c.first_name} {c.last_name}</td><td>{c.from_class_name || '—'}</td><td>{c.to_class_name || '—'}</td>
                <td><span className={`badge ${statusBadge(c.status)}`} style={{ textTransform: 'capitalize' }}>{c.status}</span>{c.applied && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>(applied)</span>}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!c.applied && (
                    <>
                      <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => review(c.id, 'approved')} disabled={c.status === 'approved'}>Approve</button>
                      <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => review(c.id, 'rejected')} disabled={c.status === 'rejected'}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
function Learning() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [materials, setMaterials] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  const [materialForm, setMaterialForm] = useState({ classId: '', subjectId: '', title: '', description: '', resourceUrl: '' });
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ classId: '', subjectId: '', title: '', description: '', dueDate: '', maxScore: 100 });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [error, setError] = useState('');

  function loadMaterials() { api.get('/school/study-materials').then(({ data }) => setMaterials(data)); }
  function loadAssignments() { api.get('/school/assignments').then(({ data }) => setAssignments(data)); }
  useEffect(() => {
    loadMaterials();
    loadAssignments();
    api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([]));
    api.get('/school/subjects').then(({ data }) => setSubjects(data)).catch(() => setSubjects([]));
  }, []);

  async function submitMaterial(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/study-materials', materialForm);
      setCreatingMaterial(false);
      setMaterialForm({ classId: '', subjectId: '', title: '', description: '', resourceUrl: '' });
      loadMaterials();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save material');
    }
  }

  async function removeMaterial(m) {
    const ok = await confirm(`Delete "${m.title}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/school/study-materials/${m.id}`);
    loadMaterials();
  }

  async function editMaterial(m) {
    const title = window.prompt('Title:', m.title);
    if (title === null) return;
    const resourceUrl = window.prompt('Resource URL:', m.resource_url || '');
    if (resourceUrl === null) return;
    try { await api.patch(`/school/study-materials/${m.id}`, { title, resourceUrl }); loadMaterials(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update material', 'error'); }
  }

  async function submitAssignment(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/assignments', { ...assignmentForm, maxScore: Number(assignmentForm.maxScore) });
      setCreatingAssignment(false);
      setAssignmentForm({ classId: '', subjectId: '', title: '', description: '', dueDate: '', maxScore: 100 });
      loadAssignments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save assignment');
    }
  }

  async function removeAssignment(a) {
    const ok = await confirm(`Delete "${a.title}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/assignments/${a.id}`); loadAssignments(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete assignment', 'error'); }
  }

  async function editAssignment(a) {
    const title = window.prompt('Title:', a.title);
    if (title === null) return;
    const dueDate = window.prompt('Due date (YYYY-MM-DD):', a.due_date.slice(0, 10));
    if (dueDate === null) return;
    try { await api.patch(`/school/assignments/${a.id}`, { title, dueDate }); loadAssignments(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update assignment', 'error'); }
  }

  if (selectedAssignment) return <AssignmentDetail id={selectedAssignment} onBack={() => { setSelectedAssignment(null); loadAssignments(); }} showToast={showToast} />;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Study Materials</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingMaterial((c) => !c)}>{creatingMaterial ? 'Cancel' : '+ New Material'}</button>
        </div>
        {creatingMaterial && (
          <form onSubmit={submitMaterial} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
            {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
            <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Title</label><input value={materialForm.title} onChange={(e) => setMaterialForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Class</label>
              <select value={materialForm.classId} onChange={(e) => setMaterialForm((f) => ({ ...f, classId: e.target.value }))}>
                <option value="">Any</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Subject</label>
              <select value={materialForm.subjectId} onChange={(e) => setMaterialForm((f) => ({ ...f, subjectId: e.target.value }))}>
                <option value="">Any</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Resource URL</label><input value={materialForm.resourceUrl} onChange={(e) => setMaterialForm((f) => ({ ...f, resourceUrl: e.target.value }))} placeholder="https://..." /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        )}
        {materials === null ? <p>Loading...</p> : materials.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No study materials yet.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Class</th><th>Subject</th><th>Resource</th><th></th></tr></thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>{m.title}</td><td>{m.class_name || 'Any'}</td><td>{m.subject_name || 'Any'}</td>
                  <td>{m.resource_url ? <a href={m.resource_url} target="_blank" rel="noreferrer">Open</a> : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => editMaterial(m)}>Edit</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeMaterial(m)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Assignments</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingAssignment((c) => !c)}>{creatingAssignment ? 'Cancel' : '+ New Assignment'}</button>
        </div>
        {creatingAssignment && (
          <form onSubmit={submitAssignment} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
            {error && <div className="error-banner">{error}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}><label>Title</label><input value={assignmentForm.title} onChange={(e) => setAssignmentForm((f) => ({ ...f, title: e.target.value }))} required /></div>
              <div className="form-group">
                <label>Class</label>
                <select value={assignmentForm.classId} onChange={(e) => setAssignmentForm((f) => ({ ...f, classId: e.target.value }))} required>
                  <option value="">Select</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Subject</label>
                <select value={assignmentForm.subjectId} onChange={(e) => setAssignmentForm((f) => ({ ...f, subjectId: e.target.value }))} required>
                  <option value="">Select</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Due date</label><input type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm((f) => ({ ...f, dueDate: e.target.value }))} required /></div>
              <div className="form-group"><label>Max score</label><input type="number" value={assignmentForm.maxScore} onChange={(e) => setAssignmentForm((f) => ({ ...f, maxScore: e.target.value }))} style={{ width: 90 }} /></div>
            </div>
            <div className="form-group"><label>Description</label><textarea value={assignmentForm.description} onChange={(e) => setAssignmentForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save Assignment</button>
          </form>
        )}
        {assignments === null ? <p>Loading...</p> : assignments.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No assignments yet.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Class</th><th>Subject</th><th>Due</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setSelectedAssignment(a.id)}>{a.title}</td>
                  <td>{a.class_name}</td><td>{a.subject_name}</td><td>{new Date(a.due_date).toLocaleDateString()}</td>
                  <td>{a.submitted_count} / {a.enrolled_count}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setSelectedAssignment(a.id)}>Grade</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => editAssignment(a)}>Edit</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeAssignment(a)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AssignmentDetail({ id, onBack, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [grading, setGrading] = useState(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });

  function load() { api.get(`/school/assignments/${id}`).then(({ data }) => setAssignment(data)); }
  useEffect(load, [id]);

  async function submitGrade() {
    try {
      await api.patch(`/school/submissions/${grading.submission_id}`, { score: Number(gradeForm.score), feedback: gradeForm.feedback });
      setGrading(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save grade', 'error');
    }
  }

  if (!assignment) return <div className="card"><p>Loading...</p></div>;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to assignments</button>
      <div className="card">
        <h2>{assignment.title}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{assignment.class_name} — {assignment.subject_name} · Due {new Date(assignment.due_date).toLocaleDateString()} · Max score {assignment.max_score}</p>
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Submitted</th><th>Score</th><th></th></tr></thead>
          <tbody>
            {assignment.students.map((s) => (
              <tr key={s.student_id}>
                <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td>
                <td>{s.submission_id ? (s.isLate ? <span style={{ color: 'var(--color-error)' }}>Late</span> : 'On time') : '—'}</td>
                <td>{s.score !== null && s.score !== undefined ? s.score : '—'}</td>
                <td>
                  {s.submission_id && (
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => { setGrading(s); setGradeForm({ score: s.score || '', feedback: s.feedback || '' }); }}>
                      Grade
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {grading && (
        <div className="modal-overlay" onClick={() => setGrading(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Grade: {grading.first_name} {grading.last_name}</h2>
            <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{grading.content}</p>
            <div className="form-group"><label>Score (max {assignment.max_score})</label><input type="number" max={assignment.max_score} value={gradeForm.score} onChange={(e) => setGradeForm((f) => ({ ...f, score: e.target.value }))} /></div>
            <div className="form-group"><label>Feedback</label><textarea value={gradeForm.feedback} onChange={(e) => setGradeForm((f) => ({ ...f, feedback: e.target.value }))} rows={2} /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setGrading(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={submitGrade}>Save Grade</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
function Transport() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [vehicles, setVehicles] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ registrationNo: '', capacity: '', driverId: '' });
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [routeForm, setRouteForm] = useState({ name: '', vehicleId: '', stops: [] });
  const [error, setError] = useState('');

  function loadVehicles() { api.get('/school/transport/vehicles').then(({ data }) => setVehicles(data)); }
  function loadRoutes() { api.get('/school/transport/routes').then(({ data }) => setRoutes(data)); }
  useEffect(() => { loadVehicles(); loadRoutes(); api.get('/school/staff').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, []);

  async function submitVehicle(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/transport/vehicles', { ...vehicleForm, capacity: Number(vehicleForm.capacity) });
      setCreatingVehicle(false);
      setVehicleForm({ registrationNo: '', capacity: '', driverId: '' });
      loadVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save vehicle');
    }
  }

  async function removeVehicle(v) {
    const ok = await confirm(`Delete vehicle "${v.registration_no}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/transport/vehicles/${v.id}`); loadVehicles(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete vehicle', 'error'); }
  }

  function addRouteStop() { setRouteForm((f) => ({ ...f, stops: [...f.stops, { stopName: '', pickupTime: '' }] })); }
  function updateRouteStop(i, field, value) { setRouteForm((f) => ({ ...f, stops: f.stops.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)) })); }
  function removeRouteStop(i) { setRouteForm((f) => ({ ...f, stops: f.stops.filter((_, idx) => idx !== i) })); }

  async function submitRoute(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/transport/routes', routeForm);
      setCreatingRoute(false);
      setRouteForm({ name: '', vehicleId: '', stops: [] });
      loadRoutes();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save route');
    }
  }

  async function removeRoute(r) {
    const ok = await confirm(`Delete route "${r.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/transport/routes/${r.id}`); loadRoutes(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete route', 'error'); }
  }

  if (selectedRoute) return <RouteDetail id={selectedRoute} onBack={() => { setSelectedRoute(null); loadRoutes(); }} showToast={showToast} />;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Vehicles</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingVehicle((c) => !c)}>{creatingVehicle ? 'Cancel' : '+ New Vehicle'}</button>
        </div>
        {creatingVehicle && (
          <form onSubmit={submitVehicle} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
            {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
            <div className="form-group" style={{ margin: 0 }}><label>Registration #</label><input value={vehicleForm.registrationNo} onChange={(e) => setVehicleForm((f) => ({ ...f, registrationNo: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Capacity</label><input type="number" min="1" value={vehicleForm.capacity} onChange={(e) => setVehicleForm((f) => ({ ...f, capacity: e.target.value }))} style={{ width: 90 }} required /></div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Driver</label>
              <select value={vehicleForm.driverId} onChange={(e) => setVehicleForm((f) => ({ ...f, driverId: e.target.value }))}>
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        )}
        {vehicles === null ? <p>Loading...</p> : vehicles.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No vehicles yet.</p> : (
          <table>
            <thead><tr><th>Registration #</th><th>Driver</th><th>Occupancy</th><th></th></tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>{v.registration_no}</td><td>{v.driver_first_name ? `${v.driver_first_name} ${v.driver_last_name}` : '—'}</td>
                  <td>{v.assigned_count} / {v.capacity}</td>
                  <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeVehicle(v)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Routes</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingRoute((c) => !c)}>{creatingRoute ? 'Cancel' : '+ New Route'}</button>
        </div>
        {creatingRoute && (
          <form onSubmit={submitRoute} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
            {error && <div className="error-banner">{error}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}><label>Route name</label><input value={routeForm.name} onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group">
                <label>Vehicle</label>
                <select value={routeForm.vehicleId} onChange={(e) => setRouteForm((f) => ({ ...f, vehicleId: e.target.value }))}>
                  <option value="">None</option>
                  {(vehicles || []).map((v) => <option key={v.id} value={v.id}>{v.registration_no} ({v.capacity} seats)</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Stops</label>
              {routeForm.stops.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input value={s.stopName} onChange={(e) => updateRouteStop(i, 'stopName', e.target.value)} placeholder="Stop name" required />
                  <input type="time" value={s.pickupTime} onChange={(e) => updateRouteStop(i, 'pickupTime', e.target.value)} />
                  <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeRouteStop(i)}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={addRouteStop}>+ Add Stop</button>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto', marginTop: 10 }} type="submit">Save Route</button>
          </form>
        )}
        {routes === null ? <p>Loading...</p> : routes.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No routes yet.</p> : (
          <table>
            <thead><tr><th>Route</th><th>Vehicle</th><th>Riders</th><th></th></tr></thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setSelectedRoute(r.id)}>{r.name}</td>
                  <td>{r.registration_no || '—'}</td><td>{r.assigned_count}{r.capacity ? ` / ${r.capacity}` : ''}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setSelectedRoute(r.id)}>Manage</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeRoute(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RouteDetail({ id, onBack, showToast }) {
  const confirm = useConfirm();
  const [route, setRoute] = useState(null);
  const [students, setStudents] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({ studentId: '', stopId: '' });

  function load() { api.get(`/school/transport/routes/${id}`).then(({ data }) => setRoute(data)); }
  useEffect(() => { load(); api.get('/school/students?status=enrolled').then(({ data }) => setStudents(data)).catch(() => setStudents([])); }, [id]);

  async function submitAssign(e) {
    e.preventDefault();
    try {
      await api.post(`/school/transport/routes/${id}/assign`, assignForm);
      setAssigning(false);
      setAssignForm({ studentId: '', stopId: '' });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to assign student', 'error');
    }
  }

  async function editStop(s) {
    const stopName = window.prompt('Stop name:', s.stop_name);
    if (stopName === null) return;
    const pickupTime = window.prompt('Pickup time (HH:MM):', s.pickup_time ? s.pickup_time.slice(0, 5) : '');
    if (pickupTime === null) return;
    try { await api.patch(`/school/transport/stops/${s.id}`, { stopName, pickupTime }); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update stop', 'error'); }
  }

  async function removeStop(s) {
    const ok = await confirm(`Delete stop "${s.stop_name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/transport/stops/${s.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete stop', 'error'); }
  }

  async function unassign(studentId) {
    await api.delete(`/school/transport/routes/${id}/students/${studentId}`);
    load();
  }

  if (!route) return <div className="card"><p>Loading...</p></div>;
  const unassignedStudents = students.filter((s) => !route.students.some((rs) => rs.student_id === s.id));

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to routes</button>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>{route.name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{route.registration_no ? `${route.registration_no} (${route.capacity} seats)` : 'No vehicle assigned'}</p>
        <table>
          <thead><tr><th>Stop</th><th>Pickup Time</th><th></th></tr></thead>
          <tbody>
            {route.stops.map((s) => (
              <tr key={s.id}>
                <td>{s.stop_name}</td><td>{s.pickup_time ? s.pickup_time.slice(0, 5) : '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => editStop(s)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeStop(s)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Assigned Students</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setAssigning((a) => !a)}>{assigning ? 'Cancel' : '+ Assign Student'}</button>
        </div>
        {assigning && (
          <form onSubmit={submitAssign} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Student</label>
              <select value={assignForm.studentId} onChange={(e) => setAssignForm((f) => ({ ...f, studentId: e.target.value }))} required>
                <option value="">Select</option>
                {unassignedStudents.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Stop</label>
              <select value={assignForm.stopId} onChange={(e) => setAssignForm((f) => ({ ...f, stopId: e.target.value }))}>
                <option value="">None</option>
                {route.stops.map((s) => <option key={s.id} value={s.id}>{s.stop_name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Assign</button>
          </form>
        )}
        {route.students.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No students assigned yet.</p> : (
          <table>
            <thead><tr><th>Student #</th><th>Name</th><th>Stop</th><th></th></tr></thead>
            <tbody>
              {route.students.map((s) => (
                <tr key={s.id}>
                  <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td><td>{s.stop_name || '—'}</td>
                  <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => unassign(s.student_id)}>Unassign</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
function Library() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [books, setBooks] = useState(null);
  const [loans, setLoans] = useState(null);
  const [students, setStudents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [creatingBook, setCreatingBook] = useState(false);
  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
  const [issuing, setIssuing] = useState(null); // book being issued
  const [issueForm, setIssueForm] = useState({ studentId: '' });
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ loanPeriodDays: '', finePerDay: '' });
  const [error, setError] = useState('');

  function loadBooks() { api.get('/school/library/books').then(({ data }) => setBooks(data)); }
  function loadLoans() { api.get('/school/library/loans?status=issued').then(({ data }) => setLoans(data)); }
  function loadSettings() { api.get('/school/library/settings').then(({ data }) => { setSettings(data); setSettingsForm({ loanPeriodDays: data.loan_period_days, finePerDay: data.fine_per_day }); }); }
  useEffect(() => { loadBooks(); loadLoans(); loadSettings(); api.get('/school/students').then(({ data }) => setStudents(data.filter((s) => s.status === 'enrolled'))).catch(() => setStudents([])); }, []);

  async function submitBook(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/library/books', bookForm);
      setCreatingBook(false);
      setBookForm({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
      loadBooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add book');
    }
  }

  async function removeBook(b) {
    const ok = await confirm(`Delete "${b.title}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/library/books/${b.id}`); loadBooks(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete book', 'error'); }
  }

  async function submitIssue() {
    try {
      await api.post('/school/library/loans', { bookId: issuing.id, studentId: issueForm.studentId });
      showToast('Book issued.', 'success');
      setIssuing(null);
      setIssueForm({ studentId: '' });
      loadBooks();
      loadLoans();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to issue book', 'error');
    }
  }

  async function returnLoan(loan) {
    try {
      const { data } = await api.post(`/school/library/loans/${loan.id}/return`);
      showToast(data.fine_amount > 0 ? `Returned — fine of ${money(data.fine_amount)} applies.` : 'Returned, no fine.', 'success');
      loadBooks();
      loadLoans();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to return book', 'error');
    }
  }

  async function markLost(loan) {
    const ok = await confirm(`Mark "${loan.book_title}" as lost for ${loan.first_name} ${loan.last_name}?`, { confirmLabel: 'Mark Lost' });
    if (!ok) return;
    await api.post(`/school/library/loans/${loan.id}/mark-lost`);
    loadBooks();
    loadLoans();
  }

  async function submitSettings(e) {
    e.preventDefault();
    try {
      await api.patch('/school/library/settings', { loanPeriodDays: Number(settingsForm.loanPeriodDays), finePerDay: Number(settingsForm.finePerDay) });
      setEditingSettings(false);
      loadSettings();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save settings', 'error');
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Library Settings</h2>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setEditingSettings((c) => !c)}>{editingSettings ? 'Cancel' : 'Edit'}</button>
        </div>
        {editingSettings ? (
          <form onSubmit={submitSettings} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}><label>Loan period (days)</label><input type="number" value={settingsForm.loanPeriodDays} onChange={(e) => setSettingsForm((f) => ({ ...f, loanPeriodDays: e.target.value }))} style={{ width: 100 }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Fine per day</label><input type="number" step="0.01" value={settingsForm.finePerDay} onChange={(e) => setSettingsForm((f) => ({ ...f, finePerDay: e.target.value }))} style={{ width: 100 }} /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        ) : settings && (
          <p style={{ fontSize: 13 }}>Loan period: <strong>{settings.loan_period_days} days</strong> · Overdue fine: <strong>{money(settings.fine_per_day)}/day</strong></p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Book Catalog</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingBook((c) => !c)}>{creatingBook ? 'Cancel' : '+ New Book'}</button>
        </div>
        {creatingBook && (
          <form onSubmit={submitBook} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
            {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
            <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}><label>Title</label><input value={bookForm.title} onChange={(e) => setBookForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Author</label><input value={bookForm.author} onChange={(e) => setBookForm((f) => ({ ...f, author: e.target.value }))} /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Category</label><input value={bookForm.category} onChange={(e) => setBookForm((f) => ({ ...f, category: e.target.value }))} /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Copies</label><input type="number" min="1" value={bookForm.totalCopies} onChange={(e) => setBookForm((f) => ({ ...f, totalCopies: e.target.value }))} style={{ width: 80 }} /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        )}
        {books === null ? <p>Loading...</p> : books.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No books in the catalog yet.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Available</th><th></th></tr></thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id} style={!b.is_active ? { opacity: 0.5 } : undefined}>
                  <td>{b.title}</td><td>{b.author || '—'}</td><td>{b.category || '—'}</td>
                  <td>{b.available_copies} / {b.total_copies}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {b.is_active && b.available_copies > 0 && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setIssuing(b)}>Issue</button>}
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeBook(b)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Books Currently on Loan</h2>
        {loans === null ? <p>Loading...</p> : loans.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>Nothing currently on loan.</p> : (
          <table>
            <thead><tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td>{l.book_title}</td><td>{l.first_name} {l.last_name}</td>
                  <td>{new Date(l.issue_date).toLocaleDateString()}</td>
                  <td style={l.isOverdue ? { color: 'var(--color-error)', fontWeight: 600 } : undefined}>{new Date(l.due_date).toLocaleDateString()}{l.isOverdue ? ' (overdue)' : ''}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => returnLoan(l)}>Return</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => markLost(l)}>Mark Lost</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {issuing && (
        <div className="modal-overlay" onClick={() => setIssuing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Issue "{issuing.title}"</h2>
            <div className="form-group">
              <label>Student</label>
              <select value={issueForm.studentId} onChange={(e) => setIssueForm({ studentId: e.target.value })}>
                <option value="">Select</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_no})</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setIssuing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={submitIssue} disabled={!issueForm.studentId}>Issue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const dayLabel = (d) => d.charAt(0).toUpperCase() + d.slice(1);

function Timetable() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [periods, setPeriods] = useState(null);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState('Term 1');
  const [academicYear, setAcademicYear] = useState('');
  const [grid, setGrid] = useState(null);
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: '', startTime: '', endTime: '', sortOrder: 0 });
  const [assigning, setAssigning] = useState(null); // { day, periodId }
  const [assignForm, setAssignForm] = useState({ subjectId: '', teacherId: '' });
  const [error, setError] = useState('');

  function loadPeriods() { api.get('/school/periods').then(({ data }) => setPeriods(data)); }
  useEffect(() => {
    loadPeriods();
    api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([]));
    api.get('/school/subjects').then(({ data }) => setSubjects(data)).catch(() => setSubjects([]));
    api.get('/school/staff').then(({ data }) => setEmployees(data)).catch(() => setEmployees([]));
  }, []);

  function loadGrid() {
    if (!classId || !term || !academicYear) { setGrid(null); return; }
    api.get(`/school/timetable?classId=${classId}&term=${term}&academicYear=${academicYear}`).then(({ data }) => setGrid(data));
  }
  useEffect(loadGrid, [classId, term, academicYear]);

  async function submitPeriod(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/periods', { ...periodForm, sortOrder: Number(periodForm.sortOrder) || 0 });
      setCreatingPeriod(false);
      setPeriodForm({ name: '', startTime: '', endTime: '', sortOrder: 0 });
      loadPeriods();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save period');
    }
  }

  async function removePeriod(p) {
    const ok = await confirm(`Delete period "${p.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/periods/${p.id}`); loadPeriods(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete period', 'error'); }
  }

  async function editPeriod(p) {
    const name = window.prompt('Period name:', p.name);
    if (name === null) return;
    const startTime = window.prompt('Start time (HH:MM):', p.start_time.slice(0, 5));
    if (startTime === null) return;
    const endTime = window.prompt('End time (HH:MM):', p.end_time.slice(0, 5));
    if (endTime === null) return;
    try { await api.patch(`/school/periods/${p.id}`, { name, startTime, endTime }); loadPeriods(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update period', 'error'); }
  }

  function cellEntry(day, periodId) {
    return grid && grid.find((g) => g.day_of_week === day && g.period_id === periodId);
  }

  function openAssign(day, periodId, existing) {
    setAssigning({ day, periodId, existingId: existing?.id });
    setAssignForm({ subjectId: existing?.subject_id || '', teacherId: existing?.teacher_id || '' });
  }

  async function submitAssign() {
    try {
      if (assigning.existingId) {
        await api.patch(`/school/timetable/${assigning.existingId}`, assignForm);
      } else {
        await api.post('/school/timetable', { classId, dayOfWeek: assigning.day, periodId: assigning.periodId, term, academicYear, ...assignForm });
      }
      setAssigning(null);
      loadGrid();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save timetable entry', 'error');
    }
  }

  async function removeEntry(id) {
    await api.delete(`/school/timetable/${id}`);
    setAssigning(null);
    loadGrid();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Periods</h2>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingPeriod((c) => !c)}>{creatingPeriod ? 'Cancel' : '+ New Period'}</button>
        </div>
        {creatingPeriod && (
          <form onSubmit={submitPeriod} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
            <div className="form-group" style={{ margin: 0 }}><label>Name</label><input value={periodForm.name} onChange={(e) => setPeriodForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Period 1" required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Start</label><input type="time" value={periodForm.startTime} onChange={(e) => setPeriodForm((f) => ({ ...f, startTime: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>End</label><input type="time" value={periodForm.endTime} onChange={(e) => setPeriodForm((f) => ({ ...f, endTime: e.target.value }))} required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Order</label><input type="number" value={periodForm.sortOrder} onChange={(e) => setPeriodForm((f) => ({ ...f, sortOrder: e.target.value }))} style={{ width: 70 }} /></div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        )}
        {periods === null ? <p>Loading...</p> : periods.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No periods defined yet.</p> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {periods.map((p) => (
              <span key={p.id} className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.name} ({p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}) <button onClick={() => removePeriod(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Class Timetable</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select a class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Term</label><input value={term} onChange={(e) => setTerm(e.target.value)} style={{ width: 120 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Academic year</label><input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="e.g. 2026/2027" style={{ width: 140 }} /></div>
        </div>

        {!classId || !academicYear ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Select a class and academic year to view its timetable.</p>
        ) : !periods || periods.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Define at least one period above first.</p>
        ) : (
          <table>
            <thead><tr><th>Period</th>{DAYS.map((d) => <th key={d}>{dayLabel(d)}</th>)}</tr></thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}<br /><span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}</span></td>
                  {DAYS.map((day) => {
                    const entry = cellEntry(day, p.id);
                    return (
                      <td key={day} style={{ cursor: 'pointer', minWidth: 110 }} onClick={() => openAssign(day, p.id, entry)}>
                        {entry ? (<><strong>{entry.subject_name}</strong><br /><span style={{ fontSize: 11 }}>{entry.teacher_first_name || 'Unassigned'}</span></>) : <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>+ Assign</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assigning && (
        <div className="modal-overlay" onClick={() => setAssigning(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{dayLabel(assigning.day)} — {periods.find((p) => p.id === assigning.periodId)?.name}</h2>
            <div className="form-group">
              <label>Subject</label>
              <select value={assignForm.subjectId} onChange={(e) => setAssignForm((f) => ({ ...f, subjectId: e.target.value }))}>
                <option value="">Select</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Teacher</label>
              <select value={assignForm.teacherId} onChange={(e) => setAssignForm((f) => ({ ...f, teacherId: e.target.value }))}>
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              {assigning.existingId && <button className="btn btn-secondary" onClick={() => removeEntry(assigning.existingId)}>Remove</button>}
              <button className="btn btn-secondary" onClick={() => setAssigning(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={submitAssign} disabled={!assignForm.subjectId}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
function SchoolBankAccounts() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ bankName: '', accountNumber: '' });
  const [error, setError] = useState('');

  function load() { api.get('/school/bank-accounts').then(({ data }) => setList(data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/bank-accounts', form);
      setCreating(false);
      setForm({ bankName: '', accountNumber: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add bank account');
    }
  }

  async function remove(b) {
    const ok = await confirm(`Delete "${b.bank_name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/bank-accounts/${b.id}`); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete bank account', 'error'); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2>School Bank Accounts</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Bank Account'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        School's own bank accounts, used for non-cash fee payments — kept separate from Accounting & Finance's own banking.
      </p>
      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Bank name</label><input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Account number</label><input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No school bank accounts yet.</p> : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {list.map((b) => (
            <span key={b.id} className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}
              <button onClick={() => remove(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Fees() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [categories, setCategories] = useState(null);
  const [structures, setStructures] = useState(null);
  const [classes, setClasses] = useState([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [error, setError] = useState('');
  const blankStructForm = { name: '', classId: '', term: '', academicYear: '', dueDate: '', items: [] };
  const [structForm, setStructForm] = useState(blankStructForm);

  function loadCategories() { api.get('/school/fee-categories').then(({ data }) => setCategories(data)); }
  function loadStructures() { api.get('/school/fee-structures').then(({ data }) => setStructures(data)); }
  useEffect(() => { loadCategories(); loadStructures(); api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([])); }, []);

  async function addCategory(e) {
    e.preventDefault();
    try { await api.post('/school/fee-categories', { name: categoryName }); setCreatingCategory(false); setCategoryName(''); loadCategories(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to add category', 'error'); }
  }

  async function removeCategory(c) {
    const ok = await confirm(`Delete fee category "${c.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/fee-categories/${c.id}`); loadCategories(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete category', 'error'); }
  }

  async function renameCategory(c) {
    const name = window.prompt('Rename category:', c.name);
    if (!name || name === c.name) return;
    try { await api.patch(`/school/fee-categories/${c.id}`, { name }); loadCategories(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to rename category', 'error'); }
  }

  function addStructItem() { setStructForm((f) => ({ ...f, items: [...f.items, { feeCategoryId: '', amount: '' }] })); }
  function updateStructItem(i, field, value) {
    setStructForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)) }));
  }
  function removeStructItem(i) { setStructForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) })); }

  async function submitStructure(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/fee-structures', { ...structForm, items: structForm.items.map((i) => ({ ...i, amount: Number(i.amount) })) });
      setCreatingStructure(false);
      setStructForm(blankStructForm);
      loadStructures();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create fee structure');
    }
  }

  async function removeStructure(s) {
    const ok = await confirm(`Delete fee structure "${s.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/fee-structures/${s.id}`); loadStructures(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to delete structure', 'error'); }
  }

  async function renameStructure(s) {
    const name = window.prompt('Rename fee structure:', s.name);
    if (!name || name === s.name) return;
    try { await api.patch(`/school/fee-structures/${s.id}`, { name }); loadStructures(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to rename structure', 'error'); }
  }

  if (selectedStructure) return <FeeStructureDetail id={selectedStructure} onBack={() => { setSelectedStructure(null); loadStructures(); }} showToast={showToast} />;

  return (
    <div>
      <SchoolBankAccounts />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2>Fee Categories</h2>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingCategory((c) => !c)}>{creatingCategory ? 'Cancel' : '+ New Category'}</button>
        </div>
        {creatingCategory && (
          <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Tuition, Feeding, Transport" required />
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        )}
        {categories === null ? <p>Loading...</p> : categories.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No fee categories yet.</p> : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map((c) => (
              <span key={c.id} className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span onClick={() => renameCategory(c)} style={{ cursor: 'pointer' }} title="Click to rename">{c.name}</span> <button onClick={() => removeCategory(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Fee Structures</h2>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreatingStructure((c) => !c)}>{creatingStructure ? 'Cancel' : '+ New Fee Structure'}</button>
        </div>
        {creatingStructure && (
          <form onSubmit={submitStructure} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
            {error && <div className="error-banner">{error}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}><label>Name</label><input value={structForm.name} onChange={(e) => setStructForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Grade 5 - Term 1 Fees" required /></div>
              <div className="form-group">
                <label>Class</label>
                <select value={structForm.classId} onChange={(e) => setStructForm((f) => ({ ...f, classId: e.target.value }))}>
                  <option value="">None (individual billing only)</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Term</label><input value={structForm.term} onChange={(e) => setStructForm((f) => ({ ...f, term: e.target.value }))} placeholder="e.g. Term 1" required /></div>
              <div className="form-group"><label>Academic year</label><input value={structForm.academicYear} onChange={(e) => setStructForm((f) => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2026/2027" required /></div>
              <div className="form-group"><label>Due date</label><input type="date" value={structForm.dueDate} onChange={(e) => setStructForm((f) => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="form-group">
              <label>Fee items</label>
              {structForm.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <select value={item.feeCategoryId} onChange={(e) => updateStructItem(i, 'feeCategoryId', e.target.value)} required>
                    <option value="">Select category</option>
                    {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="number" step="0.01" value={item.amount} onChange={(e) => updateStructItem(i, 'amount', e.target.value)} placeholder="Amount" style={{ width: 120 }} required />
                  <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeStructItem(i)}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={addStructItem}>+ Add Item</button>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto', marginTop: 10 }} type="submit">Save Fee Structure</button>
          </form>
        )}
        {structures === null ? <p>Loading...</p> : structures.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No fee structures yet.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Class</th><th>Term</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {structures.map((s) => (
                <tr key={s.id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setSelectedStructure(s.id)}>{s.name}</td>
                  <td>{s.class_name || '—'}</td><td>{s.term} ({s.academic_year})</td><td>{money(s.total_amount)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setSelectedStructure(s.id)}>Manage</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => renameStructure(s)}>Rename</button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeStructure(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FeeStructureDetail({ id, onBack, showToast }) {
  const confirm = useConfirm();
  const [struct, setStruct] = useState(null);
  const [generating, setGenerating] = useState(false);

  function load() { api.get(`/school/fee-structures/${id}`).then(({ data }) => setStruct(data)); }
  useEffect(load, [id]);

  async function bulkGenerate() {
    const ok = await confirm('Generate an invoice for every enrolled student in this structure\'s class?', { confirmLabel: 'Generate Invoices' });
    if (!ok) return;
    setGenerating(true);
    try {
      const { data } = await api.post(`/school/fee-structures/${id}/generate-invoices-bulk`);
      showToast(`Generated ${data.generatedCount} invoice(s), skipped ${data.skippedCount} already invoiced.`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to generate invoices', 'error');
    } finally {
      setGenerating(false);
    }
  }

  if (!struct) return <div className="card"><p>Loading...</p></div>;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to fee structures</button>
      <div className="card">
        <h2>{struct.name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{struct.class_name || 'No class'} — {struct.term} ({struct.academic_year})</p>
        <table style={{ marginBottom: 16 }}>
          <thead><tr><th>Category</th><th>Amount</th></tr></thead>
          <tbody>
            {struct.items.map((i) => <tr key={i.id}><td>{i.category_name}</td><td>{money(i.amount)}</td></tr>)}
          </tbody>
        </table>
        <p><strong>Total: {money(struct.totalAmount)}</strong></p>
        {struct.class_id && (
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={bulkGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Invoices for Whole Class'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
function Subjects() {
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', code: '' });

  function load() { api.get('/school/subjects').then(({ data }) => setList(data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/subjects', form);
      setCreating(false);
      setForm({ name: '', code: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save subject');
    }
  }

  async function remove(s) {
    const ok = await confirm(`Delete subject "${s.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/subjects/${s.id}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to delete subject'); }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Subjects</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Subject'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Code</label><input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} style={{ width: 100 }} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No subjects yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Code</th><th></th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{s.code || '—'}</td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(s)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
function ExamsAndMarks() {
  const { showToast } = useToast();
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [creating, setCreating] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', term: '', academicYear: '', classId: '', examDate: '', subjectIds: [] });

  function load() { api.get('/school/exams').then(({ data }) => setList(data)); }
  useEffect(() => {
    load();
    api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([]));
    api.get('/school/subjects').then(({ data }) => setSubjects(data)).catch(() => setSubjects([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/exams', form);
      setCreating(false);
      setForm({ name: '', term: '', academicYear: '', classId: '', examDate: '', subjectIds: [] });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create exam');
    }
  }

  function toggleSubject(id) {
    setForm((f) => ({ ...f, subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id] }));
  }

  if (selectedExam) return <ExamMarksEntry examId={selectedExam} onBack={() => { setSelectedExam(null); load(); }} showToast={showToast} />;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Exams</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Exam'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}><label>Exam name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Mid-Term Exam" required /></div>
            <div className="form-group"><label>Term</label><input value={form.term} onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))} placeholder="e.g. Term 1" required /></div>
            <div className="form-group"><label>Academic year</label><input value={form.academicYear} onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2026/2027" required /></div>
            <div className="form-group">
              <label>Class</label>
              <select value={form.classId} onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))} required>
                <option value="">Select</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Exam date</label><input type="date" value={form.examDate} onChange={(e) => setForm((f) => ({ ...f, examDate: e.target.value }))} /></div>
          </div>
          <div className="form-group">
            <label>Subjects examined</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {subjects.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={form.subjectIds.includes(s.id)} onChange={() => toggleSubject(s.id)} style={{ width: 'auto' }} /> {s.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save Exam</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No exams yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Term</th><th>Class</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedExam(e.id)}>
                <td>{e.name}</td><td>{e.term} ({e.academic_year})</td><td>{e.class_name || '—'}</td>
                <td>{e.exam_date ? new Date(e.exam_date).toLocaleDateString() : '—'}</td>
                <td><span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>{e.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExamMarksEntry({ examId, onBack, showToast }) {
  const [exam, setExam] = useState(null);
  const [subjectId, setSubjectId] = useState('');
  const [sheet, setSheet] = useState(null);
  const [saving, setSaving] = useState(false);

  function loadExam() { api.get(`/school/exams/${examId}`).then(({ data }) => setExam(data)); }
  useEffect(loadExam, [examId]);

  function loadSheet() {
    if (!subjectId) return;
    api.get(`/school/exams/${examId}/marks-sheet?subjectId=${subjectId}`).then(({ data }) => setSheet(data));
  }
  useEffect(loadSheet, [subjectId, examId]);

  function setScore(studentId, score) {
    setSheet((prev) => ({ ...prev, students: prev.students.map((s) => (s.student_id === studentId ? { ...s, score } : s)) }));
  }

  async function saveMarks() {
    setSaving(true);
    try {
      await api.post(`/school/exams/${examId}/marks/bulk`, {
        subjectId,
        entries: sheet.students.filter((s) => s.score !== null && s.score !== '').map((s) => ({ studentId: s.student_id, score: Number(s.score) })),
      });
      showToast('Marks saved.', 'success');
      loadSheet();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save marks', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!exam) return <div className="card"><p>Loading...</p></div>;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to exams</button>
      <div className="card">
        <h2>{exam.name} — {exam.term} ({exam.academic_year})</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{exam.class_name}</p>
        <div className="form-group" style={{ maxWidth: 300 }}>
          <label>Subject</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Select a subject</option>
            {exam.subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} (max {s.max_score})</option>)}
          </select>
        </div>

        {subjectId && sheet && (
          <>
            <table>
              <thead><tr><th>Student #</th><th>Name</th><th>Score (max {sheet.maxScore})</th></tr></thead>
              <tbody>
                {sheet.students.map((s) => (
                  <tr key={s.student_id}>
                    <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td>
                    <td><input type="number" min="0" max={sheet.maxScore} value={s.score ?? ''} onChange={(e) => setScore(s.student_id, e.target.value)} style={{ width: 90 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto', marginTop: 12 }} onClick={saveMarks} disabled={saving}>{saving ? 'Saving...' : 'Save Marks'}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
function Attendance() {
  const { showToast } = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [register, setRegister] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([])); }, []);

  function loadRegister() {
    if (!classId) return;
    api.get(`/school/attendance/register?classId=${classId}&date=${date}`).then(({ data }) => setRegister(data.map((r) => ({ ...r, status: r.status || 'present' }))));
  }
  useEffect(loadRegister, [classId, date]);

  function setStatus(studentId, status) {
    setRegister((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)));
  }
  function setRemarks(studentId, remarks) {
    setRegister((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, remarks } : r)));
  }

  async function saveAll() {
    setSaving(true);
    try {
      await api.post('/school/attendance/bulk', {
        classId, date,
        entries: register.map((r) => ({ studentId: r.student_id, status: r.status, remarks: r.remarks || null })),
      });
      showToast('Attendance saved.', 'success');
      loadRegister();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save attendance', 'error');
    } finally {
      setSaving(false);
    }
  }

  function markAll(status) {
    setRegister((prev) => prev.map((r) => ({ ...r, status })));
  }

  return (
    <div className="card">
      <div className="card-header"><h2>Attendance Register</h2></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select a class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {register && register.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => markAll('present')}>Mark All Present</button>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={saveAll} disabled={saving}>{saving ? 'Saving...' : 'Save Register'}</button>
          </div>
        )}
      </div>

      {!classId ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Select a class and date to take attendance.</p>
      ) : register === null ? (
        <p>Loading...</p>
      ) : register.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No enrolled students in this class.</p>
      ) : (
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody>
            {register.map((r) => (
              <tr key={r.student_id}>
                <td>{r.student_no}</td><td>{r.first_name} {r.last_name}</td>
                <td>
                  <select value={r.status} onChange={(e) => setStatus(r.student_id, e.target.value)} style={{ padding: '2px 6px', borderRadius: 6, fontSize: 12.5 }}>
                    <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option>
                  </select>
                </td>
                <td><input value={r.remarks || ''} onChange={(e) => setRemarks(r.student_id, e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
function Classes() {
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { name: '', gradeLevel: '', academicYear: '', classTeacherId: '', capacity: '', nextClassId: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/classes').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/school/staff').then(({ data }) => setEmployees(data)).catch(() => setEmployees([])); }, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(c) {
    setCreating(false);
    setEditingId(c.id);
    setForm({ name: c.name, gradeLevel: c.grade_level, academicYear: c.academic_year, classTeacherId: c.class_teacher_id || '', capacity: c.capacity || '', nextClassId: c.next_class_id || '' });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, capacity: form.capacity ? Number(form.capacity) : null, nextClassId: form.nextClassId || null };
    try {
      if (editingId) { await api.patch(`/school/classes/${editingId}`, payload); setEditingId(null); }
      else { await api.post('/school/classes', payload); setCreating(false); }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save class');
    }
  }

  async function remove(c) {
    const ok = await confirm(`Delete class "${c.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/school/classes/${c.id}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to delete class'); }
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Classes</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Class'}</button>
      </div>
      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group"><label>Class name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Grade 5A" required /></div>
            <div className="form-group"><label>Grade level</label><input value={form.gradeLevel} onChange={(e) => setForm((f) => ({ ...f, gradeLevel: e.target.value }))} placeholder="e.g. Grade 5" required /></div>
            <div className="form-group"><label>Academic year</label><input value={form.academicYear} onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2026/2027" required /></div>
            <div className="form-group">
              <label>Class teacher</label>
              <select value={form.classTeacherId} onChange={(e) => setForm((f) => ({ ...f, classTeacherId: e.target.value }))}>
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Capacity</label><input type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} style={{ width: 100 }} /></div>
            <div className="form-group">
              <label>Promotes to</label>
              <select value={form.nextClassId} onChange={(e) => setForm((f) => ({ ...f, nextClassId: e.target.value }))}>
                <option value="">Not configured</option>
                {(list || []).filter((c) => c.id !== editingId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No classes yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Grade Level</th><th>Academic Year</th><th>Teacher</th><th>Enrolled</th><th>Capacity</th><th>Promotes To</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.grade_level}</td><td>{c.academic_year}</td>
                <td>{c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : '—'}</td>
                <td>{c.enrolled_count}</td><td>{c.capacity || '—'}</td><td>{c.next_class_name || '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(c)}>Delete</button>
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
function Guardians() {
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { firstName: '', lastName: '', relationship: '', phone: '', email: '', address: '', occupation: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/guardians').then(({ data }) => setList(data)); }
  useEffect(load, []);

  function startCreate() { setEditingId(null); setForm(blankForm); setCreating((c) => !c); }
  function startEdit(g) {
    setCreating(false);
    setEditingId(g.id);
    setForm({ firstName: g.first_name, lastName: g.last_name, relationship: g.relationship || '', phone: g.phone || '', email: g.email || '', address: g.address || '', occupation: g.occupation || '' });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) { await api.patch(`/school/guardians/${editingId}`, form); setEditingId(null); }
      else { await api.post('/school/guardians', form); setCreating(false); }
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save guardian');
    }
  }

  async function remove(g) {
    const ok = await confirm(`Delete guardian "${g.first_name} ${g.last_name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/school/guardians/${g.id}`);
    load();
  }

  const formOpen = creating || editingId;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Guardians</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={startCreate}>{creating ? 'Cancel' : '+ New Guardian'}</button>
      </div>
      {formOpen && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group"><label>First name</label><input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required /></div>
            <div className="form-group"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required /></div>
            <div className="form-group">
              <label>Relationship</label>
              <select value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}>
                <option value="">Select</option><option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option><option value="other">Other</option>
              </select>
            </div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="form-group"><label>Occupation</label><input value={form.occupation} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Address</label><textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} rows={2} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">{editingId ? 'Save Changes' : 'Save'}</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No guardians yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id}>
                <td>{g.first_name} {g.last_name}</td><td style={{ textTransform: 'capitalize' }}>{g.relationship || '—'}</td><td>{g.phone || '—'}</td><td>{g.email || '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startEdit(g)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(g)}>Delete</button>
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
function Students() {
  const { showToast } = useToast();
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const blankForm = { firstName: '', lastName: '', dateOfBirth: '', gender: '', classId: '', bloodGroup: '', address: '', guardianIds: [] };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/students').then(({ data }) => setList(data)); }
  useEffect(() => {
    load();
    api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([]));
    api.get('/school/guardians').then(({ data }) => setGuardians(data)).catch(() => setGuardians([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/students', form);
      setCreating(false);
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create student');
    }
  }

  const statusColor = (s) => ({ applicant: 'badge-neutral', enrolled: 'badge-success', withdrawn: 'badge-warning', graduated: 'badge-info' }[s] || 'badge-neutral');

  if (selected) return <StudentDetail id={selected} onBack={() => { setSelected(null); load(); }} classes={classes} guardians={guardians} showToast={showToast} />;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Students</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Student'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group"><label>First name</label><input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required /></div>
            <div className="form-group"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required /></div>
            <div className="form-group"><label>Date of birth</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} /></div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
              </select>
            </div>
            <div className="form-group">
              <label>Class</label>
              <select value={form.classId} onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}>
                <option value="">Unassigned</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Guardian</label>
              <select value={form.guardianIds[0] || ''} onChange={(e) => setForm((f) => ({ ...f, guardianIds: e.target.value ? [e.target.value] : [] }))}>
                <option value="">None</option>
                {guardians.map((g) => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save Student</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No students yet.</p> : (
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Class</th><th>Status</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(s.id)}>
                <td>{s.student_no}</td><td>{s.first_name} {s.last_name}</td><td>{s.class_name || '—'}</td>
                <td><span className={`badge ${statusColor(s.status)}`}>{label(s.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StudentDetail({ id, onBack, classes, guardians, showToast }) {
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [reportCard, setReportCard] = useState(null);
  const [skills, setSkills] = useState(null);
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillForm, setSkillForm] = useState({ term: '', academicYear: '', skillType: 'reading', rating: 'developing', notes: '' });
  const [feeInvoices, setFeeInvoices] = useState(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'cash', bankAccountId: '' });
  const [schoolBankAccounts, setSchoolBankAccounts] = useState([]);
  const [addingGuardian, setAddingGuardian] = useState(false);
  const [guardianToAdd, setGuardianToAdd] = useState('');

  function load() { api.get(`/school/students/${id}`).then(({ data }) => setStudent(data)); }
  function loadSkills() { api.get(`/school/students/${id}/skill-assessments`).then(({ data }) => setSkills(data)).catch(() => setSkills([])); }
  function loadFeeInvoices() { api.get(`/school/students/${id}/fee-invoices`).then(({ data }) => setFeeInvoices(data)).catch(() => setFeeInvoices([])); }
  useEffect(() => {
    load();
    loadSkills();
    loadFeeInvoices();
    api.get('/school/exams').then(({ data }) => setExams(data)).catch(() => setExams([]));
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    api.get(`/school/attendance/student/${id}?from=${from}&to=${to}`).then(({ data }) => setAttendance(data)).catch(() => setAttendance(null));
    api.get('/school/bank-accounts').then(({ data }) => setSchoolBankAccounts(data)).catch(() => setSchoolBankAccounts([]));
  }, [id]);

  async function submitPayment(invoiceId) {
    try {
      await api.post(`/school/fee-invoices/${invoiceId}/payments`, { ...paymentForm, amount: Number(paymentForm.amount), bankAccountId: paymentForm.paymentMethod !== 'cash' ? paymentForm.bankAccountId : null });
      showToast('Payment recorded.', 'success');
      setPayingInvoiceId(null);
      setPaymentForm({ amount: '', paymentMethod: 'cash', bankAccountId: '' });
      loadFeeInvoices();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record payment', 'error');
    }
  }

  useEffect(() => {
    if (!selectedExamId) { setReportCard(null); return; }
    api.get(`/school/students/${id}/report-card?examId=${selectedExamId}`).then(({ data }) => setReportCard(data)).catch(() => setReportCard(null));
  }, [selectedExamId, id]);

  async function submitSkill(e) {
    e.preventDefault();
    try {
      await api.post(`/school/students/${id}/skill-assessments`, skillForm);
      setAddingSkill(false);
      loadSkills();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save assessment', 'error');
    }
  }

  async function updateStatus(status) { await api.patch(`/school/students/${id}`, { status }); load(); }
  async function updateClass(classId) { await api.patch(`/school/students/${id}`, { classId: classId || null }); load(); }

  async function addGuardian() {
    if (!guardianToAdd) return;
    try {
      await api.post(`/school/students/${id}/guardians`, { guardianId: guardianToAdd, isPrimaryContact: student.guardians.length === 0 });
      setAddingGuardian(false);
      setGuardianToAdd('');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to link guardian', 'error');
    }
  }

  async function removeGuardian(guardianId) {
    await api.delete(`/school/students/${id}/guardians/${guardianId}`);
    load();
  }

  if (!student) return <div className="card"><p>Loading...</p></div>;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 12 }} onClick={onBack}>← Back to students</button>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>{student.first_name} {student.last_name}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{student.student_no}</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Status</label>
            <select value={student.status} onChange={(e) => updateStatus(e.target.value)}>
              <option value="applicant">Applicant</option><option value="enrolled">Enrolled</option><option value="withdrawn">Withdrawn</option><option value="graduated">Graduated</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Class</label>
            <select value={student.class_id || ''} onChange={(e) => updateClass(e.target.value)}>
              <option value="">Unassigned</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Guardians</h2>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setAddingGuardian((a) => !a)}>{addingGuardian ? 'Cancel' : '+ Link Guardian'}</button>
        </div>
        {addingGuardian && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={guardianToAdd} onChange={(e) => setGuardianToAdd(e.target.value)}>
              <option value="">Select a guardian</option>
              {guardians.filter((g) => !student.guardians.some((sg) => sg.id === g.id)).map((g) => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={addGuardian}>Link</button>
          </div>
        )}
        {student.guardians.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No guardians linked yet.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Primary Contact</th><th></th></tr></thead>
            <tbody>
              {student.guardians.map((g) => (
                <tr key={g.id}>
                  <td>{g.first_name} {g.last_name}</td><td style={{ textTransform: 'capitalize' }}>{g.relationship || '—'}</td><td>{g.phone || '—'}</td>
                  <td>{g.is_primary_contact ? 'Yes' : 'No'}</td>
                  <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeGuardian(g.id)}>Unlink</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Attendance (this month)</h2>
        {attendance === null ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No attendance recorded yet this month.</p>
        ) : (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>Present: <strong>{attendance.counts.present}</strong></span>
            <span>Absent: <strong>{attendance.counts.absent}</strong></span>
            <span>Late: <strong>{attendance.counts.late}</strong></span>
            <span>Excused: <strong>{attendance.counts.excused}</strong></span>
            {attendance.attendanceRate !== null && <span>Attendance rate: <strong>{attendance.attendanceRate}%</strong></span>}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Report Card</h2>
        <div className="form-group" style={{ maxWidth: 300 }}>
          <label>Exam</label>
          <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)}>
            <option value="">Select an exam</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.term} ({e.academic_year})</option>)}
          </select>
        </div>
        {reportCard && (
          <>
            <table>
              <thead><tr><th>Subject</th><th>Score</th><th>%</th><th>Grade</th><th>Remark</th></tr></thead>
              <tbody>
                {reportCard.subjects.map((s, i) => (
                  <tr key={i}><td>{s.subjectName}</td><td>{s.score}/{s.maxScore}</td><td>{s.percent}%</td><td>{s.label || '—'}</td><td>{s.remark || '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 10 }}><strong>Overall: {reportCard.totalScore}/{reportCard.totalMax} ({reportCard.overallPercent}%) — {reportCard.overallGrade.label} {reportCard.overallGrade.remark}</strong></p>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2>Skill Assessment</h2>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setAddingSkill((a) => !a)}>{addingSkill ? 'Cancel' : '+ Record Assessment'}</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Reading, Writing, and Fluency tracking — a qualitative rating, not a numeric score.</p>
        {addingSkill && (
          <form onSubmit={submitSkill} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}><label>Term</label><input value={skillForm.term} onChange={(e) => setSkillForm((f) => ({ ...f, term: e.target.value }))} placeholder="e.g. Term 1" required /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Academic year</label><input value={skillForm.academicYear} onChange={(e) => setSkillForm((f) => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2026/2027" required /></div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Skill</label>
              <select value={skillForm.skillType} onChange={(e) => setSkillForm((f) => ({ ...f, skillType: e.target.value }))}>
                <option value="reading">Reading</option><option value="writing">Writing</option><option value="fluency">Fluency</option><option value="numeracy">Numeracy</option><option value="other">Other</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Rating</label>
              <select value={skillForm.rating} onChange={(e) => setSkillForm((f) => ({ ...f, rating: e.target.value }))}>
                <option value="emerging">Emerging</option><option value="developing">Developing</option><option value="proficient">Proficient</option><option value="advanced">Advanced</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
          </form>
        )}
        {!skills || skills.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No assessments recorded yet.</p> : (
          <table>
            <thead><tr><th>Term</th><th>Skill</th><th>Rating</th></tr></thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.id}><td>{s.term} ({s.academic_year})</td><td style={{ textTransform: 'capitalize' }}>{s.skill_type}</td><td style={{ textTransform: 'capitalize' }}>{s.rating}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Fee Invoices</h2>
        {!feeInvoices || feeInvoices.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No fee invoices yet.</p> : (
          <table>
            <thead><tr><th>Invoice #</th><th>Structure</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {feeInvoices.map((inv) => (
                <Fragment key={inv.id}>
                  <tr>
                    <td>{inv.invoice_no}</td><td>{inv.structure_name || '—'}</td><td>{money(inv.total_amount)}</td><td>{money(inv.amount_paid)}</td>
                    <td><span className={`badge ${inv.status === 'paid' ? 'badge-success' : inv.status === 'partial' ? 'badge-warning' : 'badge-neutral'}`} style={{ textTransform: 'capitalize' }}>{inv.status}</span></td>
                    <td>
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => { setPayingInvoiceId(inv.id); setPaymentForm({ amount: (Number(inv.total_amount) - Number(inv.amount_paid)).toFixed(2), paymentMethod: 'cash' }); }}>
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>
                  {payingInvoiceId === inv.id && (
                    <tr>
                      <td colSpan={6}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
                          <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} style={{ width: 120 }} />
                          <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentMethod: e.target.value, bankAccountId: '' }))}>
                            <option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="mobile_money">Mobile Money</option><option value="cheque">Cheque</option>
                          </select>
                          {paymentForm.paymentMethod !== 'cash' && (
                            <select value={paymentForm.bankAccountId} onChange={(e) => setPaymentForm((f) => ({ ...f, bankAccountId: e.target.value }))} required>
                              <option value="">Select bank account</option>
                              {schoolBankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}</option>)}
                            </select>
                          )}
                          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => submitPayment(inv.id)}>Submit</button>
                          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setPayingInvoiceId(null)}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
function Admissions() {
  const { showToast } = useToast();
  const [list, setList] = useState(null);
  const [classes, setClasses] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const blankForm = { applicantFirstName: '', applicantLastName: '', dateOfBirth: '', desiredClassId: '', guardianName: '', guardianPhone: '', guardianEmail: '', notes: '' };
  const [form, setForm] = useState(blankForm);

  function load() { api.get('/school/admissions').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/school/classes').then(({ data }) => setClasses(data)).catch(() => setClasses([])); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/school/admissions', form);
      setCreating(false);
      setForm(blankForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create application');
    }
  }

  async function updateStatus(a, status) {
    try { await api.patch(`/school/admissions/${a.id}`, { status }); load(); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update status', 'error'); }
  }

  async function enroll(a) {
    try {
      await api.post(`/school/admissions/${a.id}/enroll`, {});
      showToast(`${a.applicant_first_name} ${a.applicant_last_name} enrolled.`, 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to enroll', 'error');
    }
  }

  const statusColor = (s) => ({ submitted: 'badge-neutral', under_review: 'badge-info', documents_pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', enrolled: 'badge-success' }[s] || 'badge-neutral');

  return (
    <div className="card">
      <div className="card-header">
        <h2>Admissions</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Application'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group"><label>First name</label><input value={form.applicantFirstName} onChange={(e) => setForm((f) => ({ ...f, applicantFirstName: e.target.value }))} required /></div>
            <div className="form-group"><label>Last name</label><input value={form.applicantLastName} onChange={(e) => setForm((f) => ({ ...f, applicantLastName: e.target.value }))} required /></div>
            <div className="form-group"><label>Date of birth</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} /></div>
            <div className="form-group">
              <label>Desired class</label>
              <select value={form.desiredClassId} onChange={(e) => setForm((f) => ({ ...f, desiredClassId: e.target.value }))}>
                <option value="">None</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Guardian name</label><input value={form.guardianName} onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))} /></div>
            <div className="form-group"><label>Guardian phone</label><input value={form.guardianPhone} onChange={(e) => setForm((f) => ({ ...f, guardianPhone: e.target.value }))} /></div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Submit Application</button>
        </form>
      )}
      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No applications yet.</p> : (
        <table>
          <thead><tr><th>App #</th><th>Applicant</th><th>Desired Class</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>{a.application_no}</td><td>{a.applicant_first_name} {a.applicant_last_name}</td><td>{a.desired_class_name || '—'}</td>
                <td><span className={`badge ${statusColor(a.status)}`}>{label(a.status)}</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!['enrolled', 'rejected'].includes(a.status) && (
                    <select defaultValue="" onChange={(e) => { if (e.target.value) updateStatus(a, e.target.value); }} style={{ fontSize: 12.5 }}>
                      <option value="">Update status...</option>
                      <option value="under_review">Under Review</option><option value="documents_pending">Documents Pending</option>
                      <option value="approved">Approved</option><option value="rejected">Rejected</option>
                    </select>
                  )}
                  {a.status === 'approved' && <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => enroll(a)}>Enroll</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

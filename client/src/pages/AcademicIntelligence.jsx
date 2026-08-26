import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import ReportBuilder from '../components/ReportBuilder';
import StructuredInsight from '../components/StructuredInsight';
import AlertExplainer from '../components/AlertExplainer';
import { BarChartWidget, LineChartWidget, KpiGauge } from '../components/charts';

// The full menu structure requested, in the order given. Three items
// (Curriculum Intelligence, Academic Forecasting, Intervention
// Tracking) are marked disabled rather than built, because each
// genuinely needs a new data model this schema doesn't have yet —
// curriculum/syllabus coverage, an interventions/action-plan table,
// and real historical forecasting all need tables that don't exist.
// Building a shallow version of any of them just to fill the menu
// would be worse than being upfront that they're not ready.
const MENU = [
  { key: 'overview', label: 'Executive Academic Overview' },
  { key: 'students', label: 'Student Intelligence' },
  { key: 'classes', label: 'Class Intelligence' },
  { key: 'subjects', label: 'Subject Intelligence' },
  { key: 'teachers', label: 'Teacher Intelligence' },
  { key: 'attendance', label: 'Attendance Intelligence' },
  { key: 'assessments', label: 'Assessment Intelligence' },
  { key: 'curriculum', label: 'Curriculum Intelligence', disabled: true },
  { key: 'trends', label: 'Performance Trends' },
  { key: 'at-risk', label: 'At-Risk Students' },
  { key: 'forecasting', label: 'Academic Forecasting', disabled: true },
  { key: 'comparative', label: 'Comparative Analysis' },
  { key: 'interventions', label: 'Intervention Tracking', disabled: true },
  { key: 'alerts', label: 'Academic Alerts' },
  { key: 'kpis', label: 'Academic KPIs' },
  { key: 'reports', label: 'Academic Reports' },
];

// Every built section's endpoint, keyed the same way as MENU. 'reports'
// has no endpoint here — it renders the existing ReportBuilder directly.
const ENDPOINTS = {
  overview: '/school/academic-intelligence/executive-overview',
  students: '/school/academic-intelligence/students',
  classes: '/school/academic-intelligence/classes',
  subjects: '/school/academic-intelligence/subjects',
  teachers: '/school/academic-intelligence/teachers',
  attendance: '/school/academic-intelligence/attendance',
  assessments: '/school/academic-intelligence/assessments',
  trends: '/school/academic-intelligence/performance-trends',
  'at-risk': '/school/academic-intelligence/at-risk-students',
  comparative: '/school/academic-intelligence/comparative-analysis',
  alerts: '/school/academic-intelligence/alerts',
  kpis: '/school/academic-intelligence/kpis',
};

const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
const score = (n) => (n === null || n === undefined ? '—' : n);

export default function AcademicIntelligence() {
  const [activeSection, setActiveSection] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    if (activeSection === 'reports') return;
    setLoading(true);
    setError('');
    setData(null);
    api.get(ENDPOINTS[activeSection])
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load this section.'))
      .finally(() => setLoading(false));
  }, [activeSection]);

  async function generateInsight() {
    setInsightLoading(true);
    try {
      const { data } = await api.get('/school/academic-insights');
      setInsight(data);
    } catch {
      setInsight({ available: false, message: 'Could not generate an insight right now.' });
    } finally {
      setInsightLoading(false);
    }
  }

  function renderSection() {
    if (activeSection === 'reports') {
      return <ReportBuilder domain="school" title="Academic Reports" subtitle="Build your own report from Students, Attendance, Exam Results, or Fee Payments" reportLabel="Academic Report" />;
    }

    const item = MENU.find((m) => m.key === activeSection);
    if (item?.disabled) {
      return (
        <div className="card">
          <h2>{item.label}</h2>
          <p className="dashboard-empty-note">
            Not built yet — this needs a data model this system doesn't have yet
            {activeSection === 'curriculum' && ' (a curriculum or syllabus-coverage table)'}
            {activeSection === 'forecasting' && ' (enough historical data plus a real forecasting method, not just a trend line)'}
            {activeSection === 'interventions' && ' (an interventions or action-plan table)'}
            . Flagged honestly rather than built shallow just to fill this menu.
          </p>
        </div>
      );
    }

    if (loading) return <p className="dashboard-empty-note">Loading…</p>;
    if (error) return <div className="error-banner">{error}</div>;
    if (!data) return null;

    switch (activeSection) {
      case 'overview':
        return (
          <>
            <div className="gauge-grid">
              <KpiGauge label="Enrolled Students" value={data.enrolledStudents} min={0} max={Math.max(data.enrolledStudents, 10)} formatter={(n) => `${n}`} />
              <KpiGauge label="Attendance Rate (30d)" value={data.attendanceRateLast30Days ?? 0} isNull={data.attendanceRateLast30Days === null} min={0} max={100} target={75} formatter={(n) => `${n}%`} />
              <KpiGauge label="Avg Score (90d)" value={data.averageExamScoreLast90Days ?? 0} isNull={data.averageExamScoreLast90Days === null} min={0} max={100} target={50} formatter={(n) => `${n}`} />
              <KpiGauge label="At-Risk Students" value={data.atRiskStudentCount} min={0} max={Math.max(data.atRiskStudentCount, 5)} goodDirection="down" formatter={(n) => `${n}`} />
            </div>
            <div className="card">
              <div className="card-header">
                <h2>AI Insight</h2>
                <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={generateInsight} disabled={insightLoading}>
                  {insightLoading ? 'Generating…' : 'Generate Insight'}
                </button>
              </div>
              {!insight && <p className="dashboard-empty-note">A real, current-data narrative on enrollment, attendance, exam performance, and at-risk students.</p>}
              {insight && insight.available === false && <p className="dashboard-empty-note">{insight.message}</p>}
              {insight && insight.available && <StructuredInsight insight={insight.insight} />}
            </div>
          </>
        );

      case 'students':
        return (
          <div className="card">
            <h2>Student Intelligence</h2>
            <table>
              <thead><tr><th>Student No</th><th>Name</th><th>Class</th><th>Attendance</th><th>Avg Score</th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.student_no}</td>
                    <td>{s.first_name} {s.last_name}</td>
                    <td>{s.class_name || '—'}</td>
                    <td>{pct(s.attendance_rate)}</td>
                    <td>{score(s.avg_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && <p className="dashboard-empty-note">No enrolled students yet.</p>}
          </div>
        );

      case 'classes':
        return (
          <>
            <BarChartWidget title="Average Score by Class" data={data.map((c) => ({ name: c.name, score: Number(c.avg_score) || 0 }))} bars={[{ key: 'score', label: 'Avg Score' }]} valueFormatter={(n) => `${n}`} />
            <div className="card">
              <h2>Class Intelligence</h2>
              <table>
                <thead><tr><th>Class</th><th>Grade Level</th><th>Students</th><th>Attendance</th><th>Avg Score</th></tr></thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td><td>{c.grade_level}</td><td>{c.student_count}</td>
                      <td>{pct(c.attendance_rate)}</td><td>{score(c.avg_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 && <p className="dashboard-empty-note">No active classes yet.</p>}
            </div>
          </>
        );

      case 'subjects':
        return (
          <>
            <BarChartWidget title="Average Score by Subject" data={data.map((s) => ({ name: s.name, score: Number(s.avg_score) || 0 }))} bars={[{ key: 'score', label: 'Avg Score' }]} valueFormatter={(n) => `${n}`} />
            <div className="card">
              <h2>Subject Intelligence</h2>
              <table>
                <thead><tr><th>Subject</th><th>Results Recorded</th><th>Avg Score</th><th>Pass Rate</th></tr></thead>
                <tbody>
                  {data.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td><td>{s.result_count}</td><td>{score(s.avg_score)}</td><td>{pct(s.pass_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 && <p className="dashboard-empty-note">No subjects yet.</p>}
            </div>
          </>
        );

      case 'teachers':
        return (
          <div className="card">
            <h2>Teacher Intelligence</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Every staff member currently assigned as a class teacher.</p>
            <table>
              <thead><tr><th>Teacher</th><th>Role</th><th>Classes Taught</th><th>Attendance</th><th>Avg Score</th></tr></thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.teacher_id}>
                    <td>{t.first_name} {t.last_name}</td><td>{t.role || '—'}</td><td>{t.classes_taught}</td>
                    <td>{pct(t.attendance_rate)}</td><td>{score(t.avg_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && <p className="dashboard-empty-note">No class teachers assigned yet.</p>}
          </div>
        );

      case 'attendance':
        return (
          <>
            <div className="gauge-grid">
              <KpiGauge label="Overall Attendance Rate" value={data.overallRate ?? 0} isNull={data.overallRate === null} min={0} max={100} target={75} formatter={(n) => `${n}%`} />
            </div>
            <BarChartWidget title="Attendance Rate by Class" data={data.byClass.map((c) => ({ name: c.class_name, rate: Number(c.rate) || 0 }))} bars={[{ key: 'rate', label: 'Rate %' }]} valueFormatter={(n) => `${n}%`} />
            <LineChartWidget title="Attendance Rate by Month" data={data.byMonth.map((m) => ({ name: m.month, rate: Number(m.rate) || 0 }))} lines={[{ key: 'rate', label: 'Rate %' }]} valueFormatter={(n) => `${n}%`} />
            <div className="card">
              <h2>Lowest Attendance</h2>
              <table>
                <thead><tr><th>Student</th><th>Class</th><th>Rate</th><th>Records</th></tr></thead>
                <tbody>
                  {data.lowestAttendance.map((s, i) => (
                    <tr key={i}><td>{s.first_name} {s.last_name}</td><td>{s.class_name || '—'}</td><td>{pct(s.rate)}</td><td>{s.records}</td></tr>
                  ))}
                </tbody>
              </table>
              {data.lowestAttendance.length === 0 && <p className="dashboard-empty-note">Not enough attendance history yet.</p>}
            </div>
          </>
        );

      case 'assessments':
        return (
          <>
            <div className="gauge-grid">
              <KpiGauge label="Below 50" value={data.scoreDistribution.below_50} min={0} max={Math.max(data.scoreDistribution.below_50, 5)} goodDirection="down" formatter={(n) => `${n}`} />
              <KpiGauge label="50–69" value={data.scoreDistribution.band_50_69} min={0} max={Math.max(data.scoreDistribution.band_50_69, 5)} formatter={(n) => `${n}`} />
              <KpiGauge label="70 and above" value={data.scoreDistribution.band_70_plus} min={0} max={Math.max(data.scoreDistribution.band_70_plus, 5)} formatter={(n) => `${n}`} />
            </div>
            <div className="card">
              <h2>Assessment Intelligence — by Exam</h2>
              <table>
                <thead><tr><th>Exam</th><th>Term</th><th>Academic Year</th><th>Avg Score</th><th>Results</th></tr></thead>
                <tbody>
                  {data.byExam.map((e) => (
                    <tr key={e.id}><td>{e.name}</td><td>{e.term}</td><td>{e.academic_year}</td><td>{score(e.avg_score)}</td><td>{e.result_count}</td></tr>
                  ))}
                </tbody>
              </table>
              {data.byExam.length === 0 && <p className="dashboard-empty-note">No exams recorded yet.</p>}
            </div>
          </>
        );

      case 'trends':
        return (
          <LineChartWidget
            title="Performance Trends"
            subtitle="Average exam score by term"
            data={data.map((t) => ({ name: `${t.term} (${t.academic_year})`, score: Number(t.avg_score) || 0 }))}
            lines={[{ key: 'score', label: 'Avg Score' }]}
            valueFormatter={(n) => `${n}`}
          />
        );

      case 'at-risk':
        return (
          <div className="card">
            <h2>At-Risk Students</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
              Attendance under 75% or average score under 50, over the last 30/90 days.
            </p>
            <table>
              <thead><tr><th>Student</th><th>Class</th><th>Attendance (30d)</th><th>Avg Score (90d)</th><th>Reason</th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.first_name} {s.last_name}</td><td>{s.class_name || '—'}</td>
                    <td>{pct(s.attendance_rate)}</td><td>{score(s.avg_score)}</td>
                    <td style={{ color: '#C0392B' }}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && <p className="dashboard-empty-note">No students currently flagged — nothing to review.</p>}
          </div>
        );

      case 'comparative':
        return (
          <>
            <BarChartWidget title="Classes Compared" data={data.byClass.map((c) => ({ name: c.class_name, score: Number(c.avg_score) || 0, attendance: Number(c.attendance_rate) || 0 }))} bars={[{ key: 'score', label: 'Avg Score' }, { key: 'attendance', label: 'Attendance %' }]} valueFormatter={(n) => `${n}`} />
            <BarChartWidget title="Terms Compared" data={data.byTerm.map((t) => ({ name: `${t.term} (${t.academic_year})`, score: Number(t.avg_score) || 0 }))} bars={[{ key: 'score', label: 'Avg Score' }]} valueFormatter={(n) => `${n}`} />
          </>
        );

      case 'alerts':
        return (
          <div className="card">
            <h2>Academic Alerts</h2>
            {data.length === 0 ? (
              <p className="dashboard-empty-note">No alerts — everything looks healthy.</p>
            ) : (
              <ul className="alert-list">
                {data.map((al, i) => (
                  <li key={i} className="alert-item-row">
                    <Link to={al.to} className="alert-item">{al.text}</Link>
                    <AlertExplainer issueText={al.text} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );

      case 'kpis':
        return (
          <div className="gauge-grid">
            <KpiGauge label="Students" value={data.students} min={0} max={Math.max(data.students, 10)} formatter={(n) => `${n}`} />
            <KpiGauge label="Classes" value={data.classes} min={0} max={Math.max(data.classes, 5)} formatter={(n) => `${n}`} />
            <KpiGauge label="Subjects" value={data.subjects} min={0} max={Math.max(data.subjects, 5)} formatter={(n) => `${n}`} />
            <KpiGauge label="Teachers" value={data.teachers} min={0} max={Math.max(data.teachers, 5)} formatter={(n) => `${n}`} />
            <KpiGauge label="Student:Teacher Ratio" value={data.studentTeacherRatio ?? 0} isNull={data.studentTeacherRatio === null} min={0} max={30} formatter={(n) => `${n}:1`} />
            <KpiGauge label="Attendance Rate" value={data.attendance_rate ?? 0} isNull={data.attendance_rate === null} min={0} max={100} target={75} formatter={(n) => `${n}%`} />
            <KpiGauge label="Average Score" value={data.avg_score ?? 0} isNull={data.avg_score === null} min={0} max={100} target={50} formatter={(n) => `${n}`} />
            <KpiGauge label="Pass Rate" value={data.pass_rate ?? 0} isNull={data.pass_rate === null} min={0} max={100} target={50} formatter={(n) => `${n}%`} />
            <KpiGauge label="Fee Collection Rate" value={data.fee_collection_rate ?? 0} isNull={data.fee_collection_rate === null} min={0} max={100} formatter={(n) => `${n}%`} />
          </div>
        );

      default:
        return null;
    }
  }

  const menu = (
    <nav className="ai-hub-menu">
      {MENU.map((m) => (
        <button
          key={m.key}
          className={`ai-hub-menu-item ${activeSection === m.key ? 'active' : ''} ${m.disabled ? 'disabled' : ''}`}
          onClick={() => !m.disabled && setActiveSection(m.key)}
          disabled={m.disabled}
        >
          {m.label}
          {m.disabled && <span className="ai-hub-menu-badge">Soon</span>}
        </button>
      ))}
    </nav>
  );

  // Academic Reports renders ReportBuilder, which brings its own
  // DashboardLayout — avoid nesting a second one around it.
  if (activeSection === 'reports') {
    return (
      <div className="ai-hub-layout" style={{ padding: '0 24px' }}>
        {menu}
        <div className="ai-hub-content">{renderSection()}</div>
      </div>
    );
  }

  return (
    <DashboardLayout title="Academic Intelligence" subtitle="School's own intelligence suite — enrollment, attendance, performance, and more">
      <div className="ai-hub-layout">
        {menu}
        <div className="ai-hub-content">{renderSection()}</div>
      </div>
    </DashboardLayout>
  );
}

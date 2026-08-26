import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, LineChartWidget, formatMoney } from '../components/charts';

const TABS = [
  { key: 'headcount', label: 'Headcount' },
  { key: 'payroll', label: 'Payroll Cost Trend' },
  { key: 'training', label: 'Training Costs' },
  { key: 'attendance', label: 'Attendance' },
];

export default function HRReport() {
  const [tab, setTab] = useState('headcount');

  return (
    <DashboardLayout title="HR Report">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'headcount' && <Headcount />}
      {tab === 'payroll' && <PayrollTrend />}
      {tab === 'training' && <TrainingCosts />}
      {tab === 'attendance' && <Attendance />}
    </DashboardLayout>
  );
}

function Headcount() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/hr-reports/headcount-summary').then(({ data }) => setData(data));
  }, []);

  if (!data) return <div className="card"><p>Loading...</p></div>;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total headcount (active)</div>
          <div className="kpi-value">{data.byStatus.find((s) => s.employment_status === 'active')?.count || 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">New hires (last 30 days)</div>
          <div className="kpi-value">{data.newHiresLast30Days}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Departments</div>
          <div className="kpi-value">{data.byDepartment.length}</div>
        </div>
      </div>

      {data.byDepartment.length > 0 && (
        <BarChartWidget
          title="Headcount by department"
          data={data.byDepartment.map((d) => ({ name: d.department, value: d.active_count }))}
          bars={[{ key: 'value', label: 'Active employees' }]}
          colorByCategory
          horizontal
        />
      )}

      <div className="card">
        <h2>By department</h2>
        <table>
          <thead><tr><th>Department</th><th>Active</th><th>Total</th><th>Monthly cost</th></tr></thead>
          <tbody>
            {data.byDepartment.map((d) => (
              <tr key={d.department}>
                <td>{d.department}</td><td>{d.active_count}</td><td>{d.total_count}</td>
                <td>GHS {Number(d.monthly_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {data.byDepartment.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No employees yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>By employment status</h2>
        <table>
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {data.byStatus.map((s) => (
              <tr key={s.employment_status}><td style={{ textTransform: 'capitalize' }}>{s.employment_status}</td><td>{s.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PayrollTrend() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get('/hr-reports/payroll-cost-trend?periods=6').then(({ data }) => setRows(data));
  }, []);

  if (!rows) return <div className="card"><p>Loading...</p></div>;

  const chartData = rows.map((r) => ({
    name: `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
    Gross: Number(r.total_gross), Deductions: Number(r.total_deductions), Net: Number(r.total_net),
  }));

  return (
    <>
      <LineChartWidget
        title="Payroll cost over time"
        data={chartData}
        lines={[{ key: 'Gross', label: 'Gross' }, { key: 'Net', label: 'Net' }]}
        valueFormatter={(v) => formatMoney(v)}
      />
      <div className="card">
        <h2>Payroll runs</h2>
        <table>
          <thead><tr><th>Period</th><th>Status</th><th>Gross</th><th>Deductions</th><th>Net</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.period_year}-${r.period_month}`}>
                <td>{r.period_year}-{String(r.period_month).padStart(2, '0')}</td>
                <td><span className={`badge ${r.status === 'paid' ? 'badge-success' : 'badge-neutral'}`}>{r.status}</span></td>
                <td>GHS {Number(r.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>GHS {Number(r.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>GHS {Number(r.total_net).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No payroll runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TrainingCosts() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [data, setData] = useState(null);

  function load() {
    api.get(`/hr-reports/training-costs?from=${from}&to=${to}`).then(({ data }) => setData(data));
  }

  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Training costs by course</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
          <span style={{ color: 'var(--color-text-muted)' }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
          <button className="btn btn-secondary btn-sm" onClick={load}>Run</button>
        </div>
      </div>
      {!data ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Course</th><th>Delivery</th><th>Sessions</th><th>Participants</th><th>Budgeted cost</th><th>Actual cost</th></tr></thead>
          <tbody>
            {data.byCourse.map((c) => (
              <tr key={c.course_id}>
                <td>{c.title}</td><td style={{ textTransform: 'capitalize' }}>{c.delivery_type}</td>
                <td>{c.session_count}</td><td>{c.participant_count}</td>
                <td>GHS {Number(c.total_budgeted_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>GHS {Number(c.total_actual_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {data.byCourse.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No training sessions in range.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Attendance() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [data, setData] = useState(null);

  function load() {
    api.get(`/hr-reports/attendance-summary?from=${from}&to=${to}`).then(({ data }) => setData(data));
  }

  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Attendance summary</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
          <span style={{ color: 'var(--color-text-muted)' }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
          <button className="btn btn-secondary btn-sm" onClick={load}>Run</button>
        </div>
      </div>
      {!data ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Employee</th><th>Present</th><th>Late</th><th>Absent</th></tr></thead>
          <tbody>
            {data.byEmployee.map((e) => (
              <tr key={e.employee_id}>
                <td>{e.first_name} {e.last_name}</td><td>{e.present_count}</td><td>{e.late_count}</td><td>{e.absent_count}</td>
              </tr>
            ))}
            {data.byEmployee.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No attendance records in range.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

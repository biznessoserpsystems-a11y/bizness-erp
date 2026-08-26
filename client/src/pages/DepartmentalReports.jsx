import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, PieChartWidget } from '../components/charts';

export default function DepartmentalReports() {
  const [headcount, setHeadcount] = useState(null);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [attendance, setAttendance] = useState(null);

  useEffect(() => {
    api.get('/hr-reports/headcount-summary').then(({ data }) => setHeadcount(data));
    loadAttendance();
  }, []);

  function loadAttendance() {
    api.get(`/hr-reports/attendance-by-department?from=${from}&to=${to}`).then(({ data }) => setAttendance(data));
  }

  const byDept = headcount?.byDepartment || [];
  const costPie = byDept.filter((d) => Number(d.monthly_cost) > 0).map((d) => ({ name: d.department, value: Number(d.monthly_cost) }));

  return (
    <DashboardLayout title="Departmental Reports">
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        Headcount, payroll cost, and attendance grouped by each employee's department.
      </p>

      {!headcount ? <p>Loading...</p> : (
        <>
          <div className="chart-grid">
            {byDept.length > 0 && (
              <BarChartWidget
                title="Active headcount by department"
                data={byDept.map((d) => ({ name: d.department, value: d.active_count }))}
                bars={[{ key: 'value', label: 'Active employees' }]}
                colorByCategory
              />
            )}
            {costPie.length > 0 && (
              <PieChartWidget title="Monthly payroll cost share by department" data={costPie} valueFormatter={(v) => `GHS ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
            )}
          </div>

          <div className="card">
            <h2>Headcount & cost by department</h2>
            <table>
              <thead><tr><th>Department</th><th>Active</th><th>Total</th><th>Monthly cost</th></tr></thead>
              <tbody>
                {byDept.map((d) => (
                  <tr key={d.department}>
                    <td>{d.department}</td><td>{d.active_count}</td><td>{d.total_count}</td>
                    <td>GHS {Number(d.monthly_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {byDept.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No employees yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Attendance by department</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
            <span style={{ color: 'var(--color-text-muted)' }}>to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
            <button className="btn btn-secondary btn-sm" onClick={loadAttendance}>Run</button>
          </div>
        </div>
        {!attendance ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Department</th><th>Present</th><th>Late</th><th>Absent</th><th>Total records</th></tr></thead>
            <tbody>
              {attendance.map((d) => (
                <tr key={d.department}>
                  <td>{d.department}</td><td>{d.present_count}</td><td>{d.late_count}</td><td>{d.absent_count}</td><td>{d.total_records}</td>
                </tr>
              ))}
              {attendance.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No attendance records in range.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}

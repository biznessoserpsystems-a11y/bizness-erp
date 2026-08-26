import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

function initials(first, last) {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
}

const STATUS_LABELS = { active: 'Active', on_leave: 'On leave', terminated: 'Terminated' };

// Builds a forest from the flat employee list: anyone whose manager isn't
// in the (filtered) list becomes a root — this naturally covers real roots
// (no manager_id), managers who are filtered out (e.g. terminated and
// hidden), and any stray/broken manager_id without special-casing.
function buildTree(employees) {
  const byId = new Map(employees.map((e) => [e.id, { ...e, reports: [] }]));
  const roots = [];
  for (const e of byId.values()) {
    if (e.manager_id && byId.has(e.manager_id)) {
      byId.get(e.manager_id).reports.push(e);
    } else {
      roots.push(e);
    }
  }
  const sortByName = (list) => list.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  for (const e of byId.values()) sortByName(e.reports);
  return sortByName(roots);
}

function matchesSearch(e, query) {
  if (!query) return false;
  const q = query.toLowerCase();
  return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q)
    || (e.job_title || '').toLowerCase().includes(q)
    || (e.department || '').toLowerCase().includes(q);
}

function subtreeHasMatch(e, query) {
  if (matchesSearch(e, query)) return true;
  return e.reports.some((r) => subtreeHasMatch(r, query));
}

function OrgNode({ employee, query, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasReports = employee.reports.length > 0;
  const isMatch = matchesSearch(employee, query);
  const show = !query || subtreeHasMatch(employee, query);
  if (!show) return null;

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 20 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', margin: '4px 0',
          borderRadius: 'var(--radius-card)', background: isMatch && query ? 'var(--color-info-bg)' : 'var(--color-surface)',
          border: '1px solid var(--color-border)', maxWidth: 460,
        }}
      >
        {hasReports ? (
          <button
            onClick={() => setCollapsed((c) => !c)}
            style={{ width: 20, height: 20, flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12 }}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span style={{ width: 20, flexShrink: 0 }} />
        )}
        <span style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--color-primary)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>
          {initials(employee.first_name, employee.last_name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {employee.first_name} {employee.last_name}
            {employee.employment_status !== 'active' && (
              <span className={`badge badge-${employee.employment_status === 'terminated' ? 'danger' : 'warning'}`} style={{ marginLeft: 8, fontSize: 10 }}>
                {STATUS_LABELS[employee.employment_status] || employee.employment_status}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {employee.job_title || 'No title'}{employee.department ? ` · ${employee.department}` : ''}
          </div>
        </div>
        {hasReports && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {employee.reports.length} report{employee.reports.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {hasReports && !collapsed && (
        <div style={{ borderLeft: '1px dashed var(--color-border)', marginLeft: 10 }}>
          {employee.reports.map((r) => <OrgNode key={r.id} employee={r} query={query} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function OrgStructure() {
  const [employees, setEmployees] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useState('hierarchy'); // 'hierarchy' | 'department'
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data)).catch(() => setEmployees([]));
  }, []);

  const visible = useMemo(() => {
    if (!employees) return [];
    return showInactive ? employees : employees.filter((e) => e.employment_status !== 'terminated');
  }, [employees, showInactive]);

  const tree = useMemo(() => buildTree(visible), [visible]);

  const byDepartment = useMemo(() => {
    const groups = new Map();
    for (const e of visible) {
      const key = e.department || 'Unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  return (
    <DashboardLayout title="Organization Structure" breadcrumb={[{ label: 'HR & Payroll' }, { label: 'Organization Structure' }]}>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={view === 'hierarchy' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setView('hierarchy')}>Reporting hierarchy</button>
            <button className={view === 'department' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setView('department')}>By department</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show terminated
            </label>
            {view === 'hierarchy' && (
              <input
                placeholder="Search name, title, or department..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-border)', minWidth: 220 }}
              />
            )}
          </div>
        </div>

        {employees === null ? (
          <p>Loading...</p>
        ) : employees.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No employees yet — add your team under Employees, Leave & Payroll.</p>
        ) : view === 'hierarchy' ? (
          tree.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No results for that search.</p>
          ) : (
            <div>{tree.map((e) => <OrgNode key={e.id} employee={e} query={query} />)}</div>
          )
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {byDepartment.map(([dept, members]) => (
              <div key={dept} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{dept}</h3>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{members.length}</span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {members
                    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
                    .map((e) => (
                      <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{e.first_name} {e.last_name}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{e.job_title || '—'}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

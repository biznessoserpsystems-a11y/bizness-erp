import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

const ACTION_BADGE = {
  CREATE: 'badge-success',
  UPDATE: 'badge-neutral',
  DELETE: 'badge-danger',
  LOGIN: 'badge-neutral',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');

  function load() {
    setLoading(true);
    const params = entityType ? `?entityType=${entityType}` : '';
    api.get(`/audit-logs${params}`).then(({ data }) => setLogs(data)).finally(() => setLoading(false));
  }

  useEffect(load, [entityType]);

  return (
    <DashboardLayout title="Audit Trail">
      <div className="card">
        <div className="card-header">
          <h2>System-wide change log</h2>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ width: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <option value="">All entities</option>
            <option value="user">Users</option>
            <option value="role">Roles</option>
            <option value="company">Company</option>
            <option value="branch">Branches</option>
            <option value="financial_year">Financial years</option>
            <option value="fiscal_period">Fiscal periods</option>
          </select>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No audit entries yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                  <td>{l.first_name ? `${l.first_name} ${l.last_name}` : 'System'}</td>
                  <td>
                    <span className={`badge ${ACTION_BADGE[l.action] || 'badge-neutral'}`}>{l.action}</span>
                  </td>
                  <td>{l.entity_type || '—'}</td>
                  <td>{l.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

const SEVERITY_BADGE = {
  critical: 'badge-danger',
  warning: 'badge-neutral',
  info: 'badge-success',
};

const TYPE_LABEL = {
  low_stock: 'Low stock',
  sales_invoice_overdue: 'Overdue invoice',
  purchase_invoice_overdue: 'Overdue bill',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [scanning, setScanning] = useState(false);

  function load() {
    setLoading(true);
    api
      .get(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`)
      .then(({ data }) => setNotifications(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [unreadOnly]);

  function markRead(id) {
    api.patch(`/notifications/${id}/read`).then(() => load());
  }

  function markAllRead() {
    api.post('/notifications/mark-all-read').then(() => load());
  }

  function rescan() {
    setScanning(true);
    api.post('/notifications/scan').then(load).finally(() => setScanning(false));
  }

  return (
    <DashboardLayout title="Notifications">
      <div className="card">
        <div className="card-header">
          <h2>Alerts &amp; reminders</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <button className="btn btn-secondary btn-sm" onClick={rescan} disabled={scanning}>
              {scanning ? 'Checking…' : 'Check now'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={markAllRead}>
              Mark all read
            </button>
          </div>
        </div>

        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          Automatically watches for low stock, overdue customer invoices, and overdue supplier bills.
          Refreshed live whenever you open this page, and in the background every 15 minutes.
        </p>

        {loading ? (
          <p>Loading...</p>
        ) : notifications.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {unreadOnly ? 'No unread notifications.' : "All clear — nothing needs your attention right now."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} style={{ opacity: n.is_read ? 0.6 : 1 }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString()}</td>
                  <td>{TYPE_LABEL[n.type] || n.type}</td>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[n.severity] || 'badge-neutral'}`}>{n.severity}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{n.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{n.message}</div>
                  </td>
                  <td>
                    {!n.is_read && (
                      <button className="btn btn-secondary btn-sm" onClick={() => markRead(n.id)}>
                        Mark read
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}

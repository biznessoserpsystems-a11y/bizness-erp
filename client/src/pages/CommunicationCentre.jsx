import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

const TABS = ['Alerts', 'Notifications', 'Announcements'];

export default function CommunicationCentre() {
  const { hasPermission } = useAuth();
  const canPostAnnouncements = hasPermission('communications.announcements.manage');
  const [tab, setTab] = useState('Alerts');

  return (
    <DashboardLayout title="Communication Centre">
      <div className="toolbar">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ width: 'auto' }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Alerts' && <AlertsPanel />}
      {tab === 'Notifications' && <NotificationsPanel />}
      {tab === 'Announcements' && <AnnouncementsPanel canPost={canPostAnnouncements} />}
    </DashboardLayout>
  );
}

function AlertsPanel() {
  const [alerts, setAlerts] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/notifications/alerts').then(({ data }) => setAlerts(data));
  }, []);

  if (!alerts) return <p>Loading...</p>;

  const noAlerts = alerts.overdueSalesInvoices.length === 0 && alerts.overduePurchaseInvoices.length === 0 && alerts.lowStock.length === 0;

  return (
    <>
      {noAlerts && (
        <div className="card"><p style={{ color: 'var(--color-text-muted)' }}>No active alerts — everything's current.</p></div>
      )}

      {alerts.overdueSalesInvoices.length > 0 && (
        <div className="card">
          <h2>Overdue receivables ({alerts.overdueSalesInvoices.length})</h2>
          <table>
            <thead><tr><th>Invoice #</th><th>Customer</th><th>Due date</th><th>Balance</th></tr></thead>
            <tbody>
              {alerts.overdueSalesInvoices.map((i) => (
                <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/sales/invoices')}>
                  <td>{i.invoice_no}</td>
                  <td>{i.customer_name}</td>
                  <td>{new Date(i.due_date).toLocaleDateString()}</td>
                  <td><span className="badge badge-danger">GHS {Number(i.balance).toFixed(2)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alerts.overduePurchaseInvoices.length > 0 && (
        <div className="card">
          <h2>Overdue payables ({alerts.overduePurchaseInvoices.length})</h2>
          <table>
            <thead><tr><th>Invoice #</th><th>Supplier</th><th>Due date</th><th>Balance</th></tr></thead>
            <tbody>
              {alerts.overduePurchaseInvoices.map((i) => (
                <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/procurement/purchase-invoices')}>
                  <td>{i.invoice_no}</td>
                  <td>{i.supplier_name}</td>
                  <td>{new Date(i.due_date).toLocaleDateString()}</td>
                  <td><span className="badge badge-danger">GHS {Number(i.balance).toFixed(2)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alerts.lowStock.length > 0 && (
        <div className="card">
          <h2>Low stock ({alerts.lowStock.length})</h2>
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th>Warehouse</th><th>On hand</th><th>Reorder level</th></tr></thead>
            <tbody>
              {alerts.lowStock.map((p) => (
                <tr key={`${p.product_id}-${p.warehouse_id}`} style={{ cursor: 'pointer' }} onClick={() => navigate('/inventory/reports')}>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.warehouse_name}</td>
                  <td><span className="badge badge-danger">{Number(p.quantity).toLocaleString()} {p.uom_symbol}</span></td>
                  <td>{Number(p.reorder_level).toLocaleString()} {p.uom_symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function NotificationsPanel() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    api.get('/notifications').then(({ data }) => setNotifications(data.notifications)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function open(n) {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`);
    if (n.link) navigate(n.link);
    load();
  }

  async function markAllRead() {
    await api.post('/notifications/mark-all-read');
    load();
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>All notifications</h2>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={markAllRead}>Mark all read</button>
      </div>
      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th></th><th>Title</th><th>Details</th><th>Date</th></tr></thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id} style={{ cursor: n.link ? 'pointer' : 'default' }} onClick={() => open(n)}>
                <td>{!n.is_read && <span className="badge badge-danger" style={{ padding: '2px 6px' }}>New</span>}</td>
                <td style={{ fontWeight: n.is_read ? 400 : 700 }}>{n.title}</td>
                <td>{n.body || '—'}</td>
                <td>{new Date(n.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {notifications.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No notifications yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AnnouncementsPanel({ canPost }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const confirm = useConfirm();

  function load() {
    setLoading(true);
    api.get('/announcements').then(({ data }) => setAnnouncements(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(id) {
    const ok = await confirm('Delete this announcement?', { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/announcements/${id}`);
    load();
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Company announcements</h2>
        {canPost && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Post announcement</button>
        )}
      </div>

      {loading ? <p>Loading...</p> : announcements.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No announcements yet.</p>
      ) : (
        announcements.map((a) => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--color-border)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong style={{ fontSize: 15 }}>{a.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {a.first_name ? `${a.first_name} ${a.last_name}` : 'System'} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              {canPost && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(a.id)}>Delete</button>
              )}
            </div>
            <p style={{ marginTop: 8, fontSize: 14, whiteSpace: 'pre-wrap' }}>{a.body}</p>
          </div>
        ))
      )}

      {showModal && (
        <AnnouncementModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function AnnouncementModal({ onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/announcements', { title, body });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Post an announcement</h2>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          This posts to the company noticeboard and notifies every active user.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Message</label>
            <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} required style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontFamily: 'inherit' }} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Posting...' : 'Post announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

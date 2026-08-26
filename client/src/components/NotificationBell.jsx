import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { IconBell } from './icons';

const POLL_INTERVAL_MS = 30000;

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  function load() {
    api.get('/notifications').then(({ data }) => {
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }).catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function openNotification(n) {
    if (!n.is_read) {
      await api.patch(`/notifications/${n.id}/read`);
      load();
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAllRead() {
    await api.post('/notifications/mark-all-read');
    load();
  }

  return (
    <div ref={containerRef} className="dropdown-anchor">
      <button
        className="btn btn-secondary btn-sm icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="dropdown-menu" style={{ width: 340, maxWidth: 340, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {unreadCount > 0 && (
              <button className="btn btn-secondary btn-sm" style={{ width: 'auto', fontSize: 12 }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ padding: 14, fontSize: 13, color: 'var(--color-text-muted)' }}>No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => openNotification(n)}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer',
                    background: n.is_read ? 'transparent' : 'var(--color-info-bg, #f0f7ff)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 700 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{n.body}</div>}
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: '8px 14px', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => { setOpen(false); navigate('/communications'); }}>
              Open Communication Centre
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

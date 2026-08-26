import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconChevron } from './icons';

function formatNow() {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(formatNow());
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(formatNow()), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={containerRef} className="dropdown-anchor">
      <button className="topbar-user user-menu-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="topbar-avatar">{initials || '?'}</span>
        <span className="topbar-user-text">
          <span className="topbar-username">{user?.firstName} {user?.lastName}</span>
          <span className="topbar-user-clock">{now}</span>
        </span>
        <IconChevron className={'sidebar-chevron' + (open ? ' open' : '')} />
      </button>
      {open && (
        <div className="dropdown-menu" style={{ right: 0 }}>
          <div className="dropdown-menu-title">{user?.firstName} {user?.lastName}</div>
          <div className="help-menu-item" style={{ paddingTop: 0 }}>
            <p style={{ margin: 0 }}>{user?.email}</p>
          </div>
          <button className="dropdown-menu-item" onClick={() => { setOpen(false); navigate('/admin/company'); }}>
            Company profile
          </button>
          <button className="dropdown-menu-item" onClick={logout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

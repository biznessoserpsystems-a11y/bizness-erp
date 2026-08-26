import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/NotificationBell';
import GlobalSearch from '../components/GlobalSearch';
import QuickCreateMenu from '../components/QuickCreateMenu';
import HelpMenu from '../components/HelpMenu';
import UserMenu from '../components/UserMenu';
import PrintLetterhead from '../components/PrintLetterhead';
import { IconMenu, IconComms, IconSidebarToggle } from '../components/icons';
import { Breadcrumb } from '../Style';
import { NAV } from '../navConfig';

const RAIL_KEY = 'bizness-os:sidebar-rail-only';

function loadRailOnly() {
  try {
    return localStorage.getItem(RAIL_KEY) === 'true';
  } catch {
    return false;
  }
}

// For any page that didn't pass its own `breadcrumb` prop explicitly, but
// does live under a sidebar section with its own large-icon-grid launcher
// (see `launcherPath` in navConfig.js), derive one automatically: "[Section
// Name] / [Page Label]", with the section name linking back to that
// launcher. This is what lets every page under a launcher-enabled section
// get a real way back to its icon grid without each page needing to say so
// itself — new sections that opt into launcherPath get this for free.
function autoBreadcrumbFor(pathname) {
  for (const group of NAV) {
    if (!group.launcherPath) continue;
    const item = group.items.find((i) => pathname === i.to || pathname.startsWith(i.to + '/'));
    if (item) return [{ label: group.section, to: group.launcherPath }, { label: item.label }];
  }
  return null;
}

export default function DashboardLayout({ title, subtitle, breadcrumb, actions, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [railOnly, setRailOnly] = useState(loadRailOnly);
  const navigate = useNavigate();
  const location = useLocation();
  const resolvedBreadcrumb = breadcrumb || autoBreadcrumbFor(location.pathname);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, String(railOnly));
    } catch {
      // localStorage unavailable (private browsing, etc.) — the toggle just won't persist, not fatal.
    }
  }, [railOnly]);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} railOnly={railOnly} onExpandRail={() => setRailOnly(false)} />
      <div className="main-content">
        <PrintLetterhead />
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="topbar-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <IconMenu />
            </button>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setRailOnly((v) => !v)}
              aria-label={railOnly ? 'Expand sidebar' : 'Collapse sidebar to icons'}
              title={railOnly ? 'Expand sidebar' : 'Collapse sidebar to icons'}
            >
              <IconSidebarToggle />
            </button>
            <div>
              {resolvedBreadcrumb && <Breadcrumb items={resolvedBreadcrumb} />}
              <h1>{title}</h1>
              {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
            </div>
          </div>
          <GlobalSearch />
          <div className="topbar-actions">
            {actions}
            <QuickCreateMenu />
            <div className="topbar-divider" />
            <div className="topbar-icon-group">
              <button className="btn btn-secondary btn-sm icon-btn" aria-label="Messages" onClick={() => navigate('/communications')}>
                <IconComms />
              </button>
              <NotificationBell />
              <HelpMenu />
            </div>
            <div className="topbar-divider" />
            <UserMenu />
          </div>
        </header>
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}

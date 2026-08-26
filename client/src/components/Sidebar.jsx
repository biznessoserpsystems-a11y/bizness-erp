import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSidebarLogoSrc } from '../context/ThemeContext';
import { IconChevron, IconSearch, IconX } from './icons';
import { NAV } from '../navConfig';
import { isModuleApplicable } from '../moduleApplicability';

const OPEN_SECTION_KEY = 'bizness-os:sidebar-open-section';

function loadOpenSection() {
  try {
    return localStorage.getItem(OPEN_SECTION_KEY) || null;
  } catch {
    return null;
  }
}

// Which nav section (if any) contains the given path — used to auto-open
// the right module on load/navigation instead of leaving the active page
// buried in a collapsed group. Sections with their own launcher page (see
// `launcherPath`) are deliberately excluded here — they never drop down
// as a text accordion regardless of which of their own pages you're on,
// so there's nothing for this to auto-open for them.
function sectionForPath(pathname) {
  const group = NAV.find((g) => !g.launcherPath && g.items.some((item) => pathname === item.to || pathname.startsWith(item.to + '/')));
  return group?.section || null;
}

export default function Sidebar({ mobileOpen, onClose, railOnly, onExpandRail }) {
  const { hasPermission, company } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [openSection, setOpenSection] = useState(() => loadOpenSection() || sectionForPath(location.pathname));

  // Rail mode is a desktop concept — the collapse toggle button itself is
  // already hidden below 900px via CSS, but the persisted preference could
  // still be `true` from a previous desktop session (or a resize mid-visit).
  // Track the viewport directly rather than trust CSS alone, so a user who
  // toggled rail mode on desktop and then opens the app on a phone still
  // sees the normal full mobile drawer, not a shrunken one.
  const [isDesktopWidth, setIsDesktopWidth] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > 900
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 901px)');
    const handler = (e) => setIsDesktopWidth(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  const effectiveRail = railOnly && isDesktopWidth;

  useEffect(() => {
    try {
      if (openSection) localStorage.setItem(OPEN_SECTION_KEY, openSection);
      else localStorage.removeItem(OPEN_SECTION_KEY);
    } catch {
      // localStorage unavailable (private browsing, quota, etc.) — the
      // accordion still works for this session, it just won't persist.
    }
  }, [openSection]);

  // Close the mobile drawer automatically whenever navigation happens, and
  // keep the accordion in sync with wherever navigation actually landed
  // (a sidebar click, browser back/forward, or a direct link) so the
  // active page's module is always the one left open.
  useEffect(() => {
    onClose?.();
    const activeSection = sectionForPath(location.pathname);
    if (activeSection) setOpenSection(activeSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Rail mode hides the search box (see below), but leaves no way to clear a
  // leftover query. Without this, a stale/no-match search from full-width
  // mode would leave rail mode showing zero icons with no visible way out.
  const q = effectiveRail ? '' : query.trim().toLowerCase();

  const visibleNav = useMemo(() => {
    return NAV.filter((group) => isModuleApplicable(group.section, company?.nature_of_business)).map((group) => {
      const items = group.items.filter((item) => {
        if (item.permission && !hasPermission(item.permission)) return false;
        if (!q) return true;
        return item.label.toLowerCase().includes(q) || group.section.toLowerCase().includes(q);
      });
      return { ...group, items };
    }).filter((group) => group.items.length > 0);
  }, [q, hasPermission, company?.nature_of_business]);

  // The section containing whatever page is actually selected right now —
  // once a submenu item is selected, its parent section is "static": it
  // stays open and can't be collapsed away by re-clicking its own header,
  // so the active link is never hidden while you're still on that page.
  const activeSection = useMemo(() => sectionForPath(location.pathname), [location.pathname]);

  const toggleSection = (group) => {
    // A section with its own large-icon-grid launcher page (e.g. Accounting
    // & Finance) navigates straight there on click, rather than dropping
    // down the small text accordion — the grid page itself is where a
    // user picks a sub-module now, not a list of links in the sidebar.
    if (group.launcherPath) {
      navigate(group.launcherPath);
      onClose?.();
      return;
    }
    const section = group.section;
    if (effectiveRail) {
      // Clicking an icon in rail mode should feel like "opening that
      // section", not just toggling an accordion you can no longer see —
      // so make sure it lands open, then hand control back to the parent
      // to widen the sidebar back out.
      setOpenSection(section);
      onExpandRail?.();
      return;
    }
    // Opening a module closes whichever one was open — only one at a time.
    // Clicking the already-open module's header collapses it back down —
    // unless that module contains the currently selected page, in which
    // case it stays open (see activeSection above).
    setOpenSection((prev) => (prev === section ? (section === activeSection ? section : null) : section));
  };

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={'sidebar' + (mobileOpen ? ' sidebar-open' : '') + (effectiveRail ? ' sidebar-rail' : '')}>
        <div className="sidebar-brand">
          {effectiveRail ? (
            <img src={getSidebarLogoSrc('mark')} alt="Bizness-OS" className="sidebar-brand-mark" />
          ) : (
            <img src={getSidebarLogoSrc('full')} alt="Bizness-OS" className="sidebar-brand-logo" />
          )}
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <IconX />
          </button>
        </div>

        {!effectiveRail && (
          <div className="sidebar-search">
            <IconSearch />
            <input
              type="text"
              placeholder="Search menu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search navigation"
            />
            {query && (
              <button className="sidebar-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <IconX />
              </button>
            )}
          </div>
        )}

        <nav className="sidebar-nav">
          {visibleNav.length === 0 && (
            <div className="sidebar-empty">No menu items match "{query}".</div>
          )}
          {visibleNav.map((group) => {
            const isCollapsed = !q && openSection !== group.section;
            const GroupIcon = group.icon;
            return (
              <div key={group.section} className="sidebar-group">
                <button
                  className="sidebar-section"
                  onClick={() => toggleSection(group)}
                  aria-expanded={group.launcherPath ? undefined : !isCollapsed}
                  title={effectiveRail ? group.section : (group.launcherPath ? `Open ${group.section}` : undefined)}
                >
                  <span className="sidebar-section-icon-badge">
                    <GroupIcon className="sidebar-section-icon" />
                  </span>
                  <span>{group.section}</span>
                  {!group.launcherPath && <IconChevron className={'sidebar-chevron' + (isCollapsed ? '' : ' open')} />}
                </button>
                <div className={'sidebar-group-items' + (isCollapsed ? '' : ' open')}>
                  <div className="sidebar-group-items-inner">
                    {group.items.map((item) => {
                      if (!item.enabled) {
                        return (
                          <div key={item.label} className="sidebar-link disabled" title="Coming soon">
                            {item.label}
                          </div>
                        );
                      }
                      return (
                        <NavLink
                          key={item.label}
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
                        >
                          {item.label}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

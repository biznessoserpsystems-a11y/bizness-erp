import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { NAV } from '../navConfig';

// A rotating palette of hex pairs — cycled by position rather than
// hand-picked per item, since a launcher with dozens of items across
// several sections would otherwise need dozens of hand-chosen colors.
// The label is still what actually identifies a tile; color here is
// purely for visual variety, not semantic meaning.
const PALETTE = [
  { color: '#0B6E4F', bg: '#E7F5EF' }, { color: '#2B6CB0', bg: '#EAF1F8' },
  { color: '#B9790A', bg: '#FBF1DE' }, { color: '#6B4FA0', bg: '#F1EBF8' },
  { color: '#1E7A6E', bg: '#E6F3F1' }, { color: '#C25B2C', bg: '#FBEBE2' },
  { color: '#2F9E6E', bg: '#EAF6EF' }, { color: '#A8425C', bg: '#F7E9ED' },
  { color: '#3D6B99', bg: '#E8F0F7' }, { color: '#8A6A2F', bg: '#F5EEDF' },
  { color: '#7A4F9E', bg: '#F0E9F7' }, { color: '#A0522D', bg: '#F5E9E1' },
];

// A generic launcher for any sidebar section — used by every section that
// opted into `launcherPath` in navConfig.js. Deliberately reuses that
// section's own single sidebar icon for every tile (scaled up) rather than
// requiring a bespoke hand-drawn icon per item, which wouldn't scale across
// the dozens of items spread over the sections using this component.
export default function ModuleLauncher({ sectionName }) {
  const { hasPermission } = useAuth();
  const group = NAV.find((g) => g.section === sectionName);
  if (!group) {
    return <DashboardLayout title={sectionName}><div className="card"><p>Unknown section.</p></div></DashboardLayout>;
  }

  const SectionIcon = group.icon;
  const visibleItems = group.items.filter((item) => item.enabled && (!item.permission || hasPermission(item.permission)));

  return (
    <DashboardLayout title={sectionName}>
      {visibleItems.length === 0 ? (
        <div className="card"><p>You don't have access to any pages in {sectionName}.</p></div>
      ) : (
        <div className="module-launcher-grid">
          {visibleItems.map((item, i) => {
            const { color, bg } = PALETTE[i % PALETTE.length];
            return (
              <Link key={item.to} to={item.to} className="module-tile" style={{ '--tile-color': color, '--tile-bg': bg }}>
                <span className="module-tile-icon"><SectionIcon /></span>
                <span className="module-tile-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

/**
 * Generic entity "fact sheet" detail page — fetches a header record by id
 * from the route, then renders a status badge + stat strip, a tab strip
 * (each tab is a small self-fetching component, same pattern as the tabs
 * in MyWorkspace.jsx), and an optional right rail of extra widgets.
 *
 * Everything about what to show is driven by a config object, so the same
 * component can back a customer detail page, a supplier detail page, etc.
 * — see pages/CustomerDetail.jsx for the simplest possible usage, and
 * factsheets/customer.jsx for what a config looks like.
 *
 * config shape:
 *   entityLabel: string                        e.g. 'customer' (used in the not-found message)
 *   headerEndpoint: (id) => string             GET url for the header record
 *   title: (header) => string                  page title
 *   statusBadge?: (header) => { label, variant }   variant matches badge-<variant> CSS classes
 *   stats?: (header) => [{ label, value }]     shown as kpi-cards
 *   tabs: [{ key, label, render: Component }]  Component receives { header, entityId }
 *   rightRail?: [{ key, label, render: Component }]  same props as tabs
 */
export default function FactSheet({ config }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [header, setHeader] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState(config.tabs[0]?.key);

  useEffect(() => {
    setHeader(null);
    setNotFound(false);
    setTab(config.tabs[0]?.key);
    api.get(config.headerEndpoint(id))
      .then(({ data }) => setHeader(data))
      .catch(() => setNotFound(true));
    // Re-fetch whenever the route id changes (e.g. navigating from one
    // customer's detail page straight to another's via a link).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (notFound) {
    return (
      <DashboardLayout title="Not found">
        <div className="card">
          <p>We couldn't find this {config.entityLabel}. It may have been deleted.</p>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => navigate(-1)}>← Go back</button>
        </div>
      </DashboardLayout>
    );
  }

  if (!header) {
    return (
      <DashboardLayout title="Loading…">
        <div className="card"><p>Loading...</p></div>
      </DashboardLayout>
    );
  }

  const badge = config.statusBadge?.(header);
  const stats = config.stats?.(header) || [];
  const activeTab = config.tabs.find((t) => t.key === tab) || config.tabs[0];
  const TabComponent = activeTab?.render;

  return (
    <DashboardLayout
      title={config.title(header)}
      actions={<button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>}
    >
      <div className="card" style={{ marginBottom: 20 }}>
        {badge && (
          <div style={{ marginBottom: stats.length ? 16 : 0 }}>
            <span className={`badge badge-${badge.variant}`}>{badge.label}</span>
          </div>
        )}
        {stats.length > 0 && (
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            {stats.map((s, i) => (
              <div className="kpi-card" key={i}>
                <div className="kpi-label">{s.label}</div>
                <div className="kpi-value">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fact-sheet-layout">
        <div className="fact-sheet-main">
          <div className="toolbar">
            {config.tabs.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ width: 'auto' }}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="card">
            {TabComponent && <TabComponent header={header} entityId={id} />}
          </div>
        </div>

        {config.rightRail && config.rightRail.length > 0 && (
          <div className="fact-sheet-rail">
            {config.rightRail.map((r) => (
              <div className="card" key={r.key}>
                <h2>{r.label}</h2>
                <r.render header={header} entityId={id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

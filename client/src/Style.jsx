import { Link } from 'react-router-dom';
import { IconAlertTriangle } from './components/icons';

/**
 * Style.jsx — a small hybrid design module, combining what worked best out
 * of two reference UIs we studied against Bizness-OS's existing design
 * system (styles.css):
 *
 *  - Colored icon badges + pill-shaped trend indicators on KPI cards
 *    (from the "Lovable ERP Evolution" mockup)
 *  - A breadcrumb trail in the page header (same mockup)
 *  - A richer empty state — icon, heading, description, and up to two
 *    next-step actions instead of a single line of gray text
 *    (from the Enerpize-style "No Records Added Yet" pattern)
 *
 * These are additive: nothing here replaces styles.css as the source of
 * truth for colors/spacing/radius — TOKENS below just mirrors the same
 * values for the rare case a component needs a literal JS value (e.g.
 * picking an icon-badge tone) rather than a CSS custom property.
 */

export const TOKENS = {
  color: {
    primary: '#0B6E4F',
    secondary: '#211E19',
    success: '#2F9E6E',
    warning: '#B9790A',
    error: '#B3261E',
    info: '#2B6CB0',
    background: '#FAF8F3',
  },
  radius: { card: 12, button: 8 },
  shadow: '0 2px 10px rgba(33, 30, 25, 0.07), 0 1px 2px rgba(33, 30, 25, 0.05)',
};

const TONE_CLASS = {
  primary: 'icon-badge-primary',
  success: 'icon-badge-success',
  warning: 'icon-badge-warning',
  error: 'icon-badge-error',
  info: 'icon-badge-info',
  neutral: 'icon-badge-neutral',
};

/**
 * Small colored rounded-square icon, meant to sit in the corner of a KPI
 * card so its metric is recognizable at a glance, not just from its label.
 *
 *   <IconBadge icon={IconFinance} tone="primary" />
 */
export function IconBadge({ icon: Icon, tone = 'primary' }) {
  return (
    <span className={`icon-badge ${TONE_CLASS[tone] || TONE_CLASS.primary}`}>
      <Icon />
    </span>
  );
}

/**
 * Trend indicator as a filled pill (not just colored text), with a plain
 * caption underneath — e.g. "↗ +12.4%" over "vs last month". Same percent
 * math as the original TrendIndicator; only the visual treatment changed,
 * so existing current/previous/pct/goodDirection usage still works.
 */
export function TrendPill({ current, previous, pct, goodDirection = 'up', label = 'vs last period' }) {
  let change = pct;
  if (change === undefined && previous !== undefined && previous !== null) {
    if (Number(previous) === 0) {
      change = Number(current) === 0 ? 0 : null;
    } else {
      change = ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
    }
  }

  if (change === null || change === undefined || Number.isNaN(change)) {
    return (
      <div className="trend-pill-row">
        <span className="trend-pill trend-pill-neutral">— 0%</span>
        <span className="trend-pill-caption">{label}</span>
      </div>
    );
  }

  const isFlat = Math.abs(change) < 0.05;
  const isUp = change > 0;
  const isGood = isFlat ? true : (goodDirection === 'up' ? isUp : !isUp);
  const tone = isFlat ? 'neutral' : (isGood ? 'success' : 'error');
  const arrow = isFlat ? '→' : (isUp ? '↗' : '↘');

  return (
    <div className="trend-pill-row">
      <span className={`trend-pill trend-pill-${tone}`}>{arrow} {Math.abs(change).toFixed(1)}%</span>
      <span className="trend-pill-caption">{label}</span>
    </div>
  );
}

/**
 * Breadcrumb trail for the page header — pass a list of { label, to? }.
 * The last item is rendered as plain text (current page); earlier ones
 * link if they have a `to`.
 *
 *   <Breadcrumb items={[{ label: 'HR & Payroll', to: '/hr/payroll' }, { label: 'Employees' }]} />
 */
export function Breadcrumb({ items = [] }) {
  if (items.length === 0) return null;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumb-item">
            {item.to && !isLast ? <Link to={item.to}>{item.label}</Link> : <span className={isLast ? 'breadcrumb-current' : ''}>{item.label}</span>}
            {!isLast && <span className="breadcrumb-sep">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Richer empty state: icon + heading + description + up to two actions,
 * instead of a single line of gray text. Actions can be a Link ({ label,
 * to }) or a button-like action ({ label, onClick }).
 *
 *   <EmptyState
 *     title="No employees yet"
 *     description="Add your first employee to start building your HR records."
 *     primaryAction={{ label: '+ Add employee', onClick: () => setModalOpen(true) }}
 *     secondaryAction={{ label: '← Go back', to: '/hr/payroll' }}
 *   />
 */
export function EmptyState({ icon: Icon = IconAlertTriangle, title, description, primaryAction, secondaryAction }) {
  return (
    <div className="empty-state-rich">
      <div className="empty-state-rich-icon"><Icon /></div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      <div className="empty-state-rich-actions">
        {secondaryAction && (
          secondaryAction.to
            ? <Link to={secondaryAction.to} className="btn btn-secondary" style={{ width: 'auto' }}>{secondaryAction.label}</Link>
            : <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={secondaryAction.onClick}>{secondaryAction.label}</button>
        )}
        {primaryAction && (
          primaryAction.to
            ? <Link to={primaryAction.to} className="btn btn-primary" style={{ width: 'auto' }}>{primaryAction.label}</Link>
            : <button className="btn btn-primary" style={{ width: 'auto' }} onClick={primaryAction.onClick}>{primaryAction.label}</button>
        )}
      </div>
    </div>
  );
}

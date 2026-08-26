import DashboardLayout from '../layouts/DashboardLayout';
import { useTheme, ACCENT_PRESETS } from '../context/ThemeContext';

const MODES = [
  { key: 'light', label: 'Light', blurb: 'Warm paper background, dark text — the default.' },
  { key: 'dark', label: 'Dark', blurb: 'Warm charcoal background, light text.' },
  { key: 'system', label: 'Match device', blurb: "Follows your OS's light/dark setting automatically." },
];

export default function ThemeSettings() {
  const { mode, setMode, accent, setAccent, secondary, setSecondary, secondaryPresets } = useTheme();

  return (
    <DashboardLayout title="Theme Settings" breadcrumb={[{ label: 'Settings' }, { label: 'Theme' }]}>
      <div className="card">
        <h2>Appearance</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Applies instantly and remembers your choice on this device — no page reload needed.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={mode === m.key ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto', flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '14px 18px', textAlign: 'left', gap: 4 }}
            >
              <span style={{ fontWeight: 700 }}>{m.label}</span>
              <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.85 }}>{m.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Accent color</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Sets the primary and highlight colors used throughout the app — buttons, active navigation, links. Each option is a matched pair, so everything stays visually consistent whichever you pick.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setAccent(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                borderRadius: 'var(--radius-card)', cursor: 'pointer', textAlign: 'left',
                border: accent === key ? `2px solid ${preset.swatch}` : '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: preset.swatch, flexShrink: 0, boxShadow: accent === key ? '0 0 0 3px var(--color-bg), 0 0 0 5px ' + preset.swatch : 'none' }} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Secondary color</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Sets the sidebar/navigation background, independently of your accent color above.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {Object.entries(secondaryPresets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setSecondary(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                borderRadius: 'var(--radius-card)', cursor: 'pointer', textAlign: 'left',
                border: secondary === key ? `2px solid ${preset.swatch}` : '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: preset.swatch, flexShrink: 0, boxShadow: secondary === key ? '0 0 0 3px var(--color-bg), 0 0 0 5px ' + preset.swatch : 'none' }} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Preview</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className="btn btn-primary" style={{ width: 'auto' }}>Primary button</button>
          <button className="btn btn-secondary" style={{ width: 'auto' }}>Secondary button</button>
          <span className="badge badge-success">Paid</span>
          <span className="badge badge-warning">Pending</span>
          <span className="badge badge-danger">Overdue</span>
          <span className="badge badge-info">Draft</span>
        </div>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Sample KPI</div>
            <div className="kpi-value">GHS 12,450.00</div>
            <div className="kpi-footer"><span className="trend-pill trend-pill-success">▲ 8.2%</span></div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

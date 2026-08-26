export default function ChartCard({ title, subtitle, action, height = 280, loading, empty, emptyLabel = 'No data for this period yet.', children }) {
  return (
    <div className="card chart-card">
      {(title || action) && (
        <div className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="chart-subtitle">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{ height }}>
        {loading ? (
          <div className="chart-skeleton skeleton" style={{ height: '100%', borderRadius: 10 }} />
        ) : empty ? (
          <div className="chart-empty">{emptyLabel}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

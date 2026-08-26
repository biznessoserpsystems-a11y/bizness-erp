import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import StructuredInsight from './StructuredInsight';
import BiExportMenu from './BiExportMenu';

// The actual ad-hoc report builder — pick a data source, pick which
// fields to group by, pick which fields to aggregate (and how), pick
// filters, run it. Every dimension/metric/filter key sent to the
// backend is validated there against biRegistry.js's whitelist.
//
// `domain` scopes which data sources this instance can see at all — the
// backend does the actual filtering (GET /bi/data-sources?domain=school
// only returns School's sources; the general Business Intelligence page
// passes no domain and sees everything), so a school user genuinely
// cannot select "Sales Invoices" from this page, not merely have it
// hidden from a shared list client-side. Two pages, BusinessIntelligence
// and AcademicIntelligence, both render this same component with
// different domain/title/subtitle props rather than each maintaining
// their own copy of this ~350-line builder.
export default function ReportBuilder({ domain, title, subtitle, reportLabel }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [dataSources, setDataSources] = useState(null);
  const [aggregations, setAggregations] = useState([]);
  const [sourceKey, setSourceKey] = useState('');

  const [dimensions, setDimensions] = useState([]);
  const [metricRows, setMetricRows] = useState([]);
  const [filterRows, setFilterRows] = useState([]);

  const [result, setResult] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  const [savedReports, setSavedReports] = useState(null);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const domainQuery = domain ? `?domain=${encodeURIComponent(domain)}` : '';

  useEffect(() => {
    api.get(`/bi/data-sources${domainQuery}`).then(({ data }) => {
      setDataSources(data.dataSources);
      setAggregations(data.aggregations);
      if (data.dataSources.length > 0) setSourceKey(data.dataSources[0].key);
    }).catch(() => setDataSources([]));
    refreshSavedReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  function refreshSavedReports() {
    api.get(`/bi/saved-reports${domainQuery}`).then(({ data }) => setSavedReports(data)).catch(() => setSavedReports([]));
  }

  const source = dataSources?.find((s) => s.key === sourceKey);

  // Switching data source invalidates everything built against the
  // previous one's fields — a dimension or metric key from Sales
  // Invoices means nothing against Employees.
  function selectSource(key) {
    setSourceKey(key);
    setDimensions([]);
    setMetricRows([]);
    setFilterRows([]);
    setResult(null);
  }

  function toggleDimension(key) {
    setDimensions((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]));
  }

  function addMetricRow() {
    if (!source?.metrics.length) return;
    setMetricRows((prev) => [...prev, { field: source.metrics[0].key, aggregation: 'sum' }]);
  }
  function updateMetricRow(index, patch) {
    setMetricRows((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function removeMetricRow(index) {
    setMetricRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addFilterRow() {
    const firstField = [...(source?.dimensions || []), ...(source?.metrics || [])][0];
    if (!firstField) return;
    setFilterRows((prev) => [...prev, { field: firstField.key, operator: '=', value: '' }]);
  }
  function updateFilterRow(index, patch) {
    setFilterRows((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function removeFilterRow(index) {
    setFilterRows((prev) => prev.filter((_, i) => i !== index));
  }

  function currentDefinition() {
    return { dataSource: sourceKey, dimensions, metrics: metricRows, filters: filterRows.filter((f) => f.value !== '') };
  }

  async function runReport() {
    setRunning(true);
    setRunError('');
    setResult(null);
    setExplanation(null);
    setExplainError('');
    try {
      const { data } = await api.post('/bi/run', currentDefinition());
      setResult(data);
    } catch (err) {
      setRunError(err.response?.data?.error || 'Could not run this report.');
    } finally {
      setRunning(false);
    }
  }

  async function saveReport() {
    if (!saveName.trim()) { showToast('Give the report a name first', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/bi/saved-reports', { name: saveName.trim(), definition: currentDefinition() });
      showToast('Report saved', 'success');
      setSaveName('');
      refreshSavedReports();
    } catch (err) {
      showToast(err.response?.data?.error || 'Could not save this report', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runSavedReport(id) {
    setRunning(true);
    setRunError('');
    setResult(null);
    setExplanation(null);
    setExplainError('');
    try {
      const { data } = await api.get(`/bi/saved-reports/${id}/run`);
      setResult(data);
    } catch (err) {
      setRunError(err.response?.data?.error || 'Could not run this saved report.');
    } finally {
      setRunning(false);
    }
  }

  async function explainReport(mode) {
    if (!result) return;
    setExplaining(true);
    setExplainError('');
    setExplanation(null);
    try {
      const { data } = await api.post('/bi/explain', { columns: result.columns, rows: result.rows, mode });
      if (data.available === false) setExplainError(data.message);
      else setExplanation(data);
    } catch (err) {
      setExplainError(err.response?.data?.error || 'Could not explain this report right now.');
    } finally {
      setExplaining(false);
    }
  }

  async function deleteSavedReport(id, name) {
    const ok = await confirm(`Delete "${name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/bi/saved-reports/${id}`);
      showToast('Report deleted', 'success');
      refreshSavedReports();
    } catch (err) {
      showToast(err.response?.data?.error || 'Could not delete this report', 'error');
    }
  }

  const fieldOptions = source ? [...source.dimensions, ...source.metrics] : [];

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      {dataSources === null ? (
        <p className="dashboard-empty-note">Loading…</p>
      ) : dataSources.length === 0 ? (
        <div className="card"><p>You don't have access to any data source this report builder can query.</p></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Build a Report</h2>

            <div style={{ marginBottom: 16 }}>
              <label>Data Source</label>
              <select value={sourceKey} onChange={(e) => selectSource(e.target.value)}>
                {dataSources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>

            {source && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label>Group By (dimensions)</label>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {source.dimensions.map((d) => (
                      <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                        <input type="checkbox" checked={dimensions.includes(d.key)} onChange={() => toggleDimension(d.key)} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ marginBottom: 0 }}>Metrics</label>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={addMetricRow}>+ Add Metric</button>
                  </div>
                  {metricRows.length === 0 && <p className="dashboard-empty-note">Add at least one metric to summarize.</p>}
                  {metricRows.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      <select value={m.aggregation} onChange={(e) => updateMetricRow(i, { aggregation: e.target.value })} style={{ width: 140 }}>
                        {aggregations.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                      </select>
                      <span>of</span>
                      <select value={m.field} onChange={(e) => updateMetricRow(i, { field: e.target.value })} style={{ flex: 1 }}>
                        {source.metrics.map((mf) => <option key={mf.key} value={mf.key}>{mf.label}</option>)}
                      </select>
                      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeMetricRow(i)}>Remove</button>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ marginBottom: 0 }}>Filters</label>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={addFilterRow}>+ Add Filter</button>
                  </div>
                  {filterRows.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      <select value={f.field} onChange={(e) => updateFilterRow(i, { field: e.target.value })} style={{ flex: 1 }}>
                        {fieldOptions.map((fo) => <option key={fo.key} value={fo.key}>{fo.label}</option>)}
                      </select>
                      <select value={f.operator} onChange={(e) => updateFilterRow(i, { operator: e.target.value })} style={{ width: 90 }}>
                        <option value="=">=</option>
                        <option value="!=">≠</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                      </select>
                      <input value={f.value} onChange={(e) => updateFilterRow(i, { value: e.target.value })} placeholder="Value" style={{ flex: 1 }} />
                      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeFilterRow(i)}>Remove</button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn btn-primary" style={{ width: 'auto' }} onClick={runReport} disabled={running || metricRows.length === 0}>
                    {running ? 'Running…' : 'Run Report'}
                  </button>
                  <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Report name to save" style={{ flex: 1 }} />
                  <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={saveReport} disabled={saving || metricRows.length === 0}>
                    {saving ? 'Saving…' : 'Save Report'}
                  </button>
                </div>
              </>
            )}
          </div>

          {runError && <div className="error-banner" style={{ marginBottom: 20 }}>{runError}</div>}

          {result && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2>Results</h2>
                {result.rows.length > 0 && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <BiExportMenu columns={result.columns} rows={result.rows} title={reportLabel} />
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => explainReport('bi')} disabled={explaining}>
                      {explaining ? 'Explaining…' : 'Explain with BI'}
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => explainReport('ai')} disabled={explaining}>
                      {explaining ? 'Explaining…' : 'Explain with AI'}
                    </button>
                  </div>
                )}
              </div>
              {explainError && <p className="dashboard-empty-note" style={{ marginBottom: 12 }}>{explainError}</p>}
              {explanation && explanation.mode === 'ai' && (
                <div style={{ marginBottom: 16 }}><StructuredInsight insight={explanation.explanation} /></div>
              )}
              {explanation && explanation.mode === 'bi' && (
                <div style={{ marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>Metric</th><th>Count</th><th>Sum</th><th>Average</th><th>Min</th><th>Max</th></tr></thead>
                    <tbody>
                      {explanation.stats.map((s) => (
                        <tr key={s.label}>
                          <td>{s.label}</td>
                          <td>{s.count}</td>
                          <td>{s.count > 0 ? s.sum : '—'}</td>
                          <td>{s.count > 0 ? s.avg : '—'}</td>
                          <td>{s.count > 0 ? s.min : '—'}</td>
                          <td>{s.count > 0 ? s.max : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                    Computed directly from all {explanation.rowCount} row{explanation.rowCount === 1 ? '' : 's'} — no AI involved.
                  </p>
                </div>
              )}
              {result.rows.length === 0 ? (
                <p className="dashboard-empty-note">No rows matched this report.</p>
              ) : (
                <table>
                  <thead>
                    <tr>{result.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {result.columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="card">
            <h2>Saved Reports</h2>
            {savedReports === null ? (
              <p className="dashboard-empty-note">Loading…</p>
            ) : savedReports.length === 0 ? (
              <p className="dashboard-empty-note">No saved reports yet — build one above and save it.</p>
            ) : (
              <table>
                <thead><tr><th>Name</th><th>Data Source</th><th></th></tr></thead>
                <tbody>
                  {savedReports.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.definition.dataSource}</td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => runSavedReport(r.id)}>Run</button>
                        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => deleteSavedReport(r.id, r.name)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

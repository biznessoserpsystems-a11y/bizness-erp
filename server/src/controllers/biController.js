const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { DATA_SOURCES, AGGREGATIONS, OPERATORS, MAX_DIMENSIONS, MAX_METRICS, MAX_FILTERS, ROW_LIMIT } = require('../services/biRegistry');
const { generateStructuredInsight } = require('../utils/aiInsight');
const { sendExport } = require('../services/exportService');

// GET /bi/data-sources
// Only lists sources the person actually has the underlying report
// permission for — the same permission that already gates the module's
// own existing reports, not a new BI-specific one.
const listDataSources = asyncHandler(async (req, res) => {
  const { domain } = req.query;
  const sources = Object.entries(DATA_SOURCES)
    .filter(([, def]) => req.user.permissions.includes(def.requiredPermission))
    .filter(([, def]) => !domain || def.domain === domain)
    .map(([key, def]) => ({
      key,
      label: def.label,
      dimensions: Object.entries(def.dimensions).map(([fKey, f]) => ({ key: fKey, label: f.label })),
      metrics: Object.entries(def.metrics).map(([fKey, f]) => ({ key: fKey, label: f.label })),
    }));
  res.json({ dataSources: sources, aggregations: Object.entries(AGGREGATIONS).map(([key, a]) => ({ key, label: a.label })) });
});

// Shared by both the live "run" endpoint and the "run a saved report"
// endpoint, so a saved report is re-validated against the current
// whitelist and the current user's current permissions every time it
// runs — never trusted as already-safe just because it validated when
// it was first saved. Returns { rows, columns } or throws ApiError.
async function buildAndRunReport(req, { dataSource: dataSourceKey, dimensions = [], metrics = [], filters = [] }) {
  const dataSource = DATA_SOURCES[dataSourceKey];
  if (!dataSource) throw new ApiError(400, `Unknown data source: ${dataSourceKey}`);
  if (!req.user.permissions.includes(dataSource.requiredPermission)) {
    throw new ApiError(403, `Missing required permission: ${dataSource.requiredPermission}`);
  }

  if (!Array.isArray(dimensions) || !Array.isArray(metrics) || !Array.isArray(filters)) {
    throw new ApiError(400, 'dimensions, metrics, and filters must all be arrays');
  }
  if (dimensions.length > MAX_DIMENSIONS) throw new ApiError(400, `A report can use at most ${MAX_DIMENSIONS} dimensions`);
  if (metrics.length > MAX_METRICS) throw new ApiError(400, `A report can use at most ${MAX_METRICS} metrics`);
  if (filters.length > MAX_FILTERS) throw new ApiError(400, `A report can use at most ${MAX_FILTERS} filters`);
  if (dimensions.length === 0 && metrics.length === 0) throw new ApiError(400, 'At least one dimension or metric is required');

  // Every dimension/metric/filter field is looked up against the
  // whitelist by key — the actual SQL that ends up in the query always
  // comes from biRegistry.js, never from anything the request body
  // supplied directly.
  const selectParts = [];
  const groupByParts = [];
  const columns = [];

  for (const dimKey of dimensions) {
    const dim = dataSource.dimensions[dimKey];
    if (!dim) throw new ApiError(400, `Unknown dimension "${dimKey}" for data source "${dataSourceKey}"`);
    selectParts.push(`${dim.sql} AS "${dimKey}"`);
    groupByParts.push(dim.sql);
    columns.push({ key: dimKey, label: dim.label, type: 'dimension' });
  }

  for (const m of metrics) {
    const metricDef = dataSource.metrics[m.field];
    if (!metricDef) throw new ApiError(400, `Unknown metric "${m.field}" for data source "${dataSourceKey}"`);
    const agg = AGGREGATIONS[m.aggregation];
    if (!agg) throw new ApiError(400, `Unknown aggregation "${m.aggregation}"`);
    const alias = `${m.field}_${m.aggregation}`;
    selectParts.push(`${agg.sql}(${metricDef.sql}) AS "${alias}"`);
    columns.push({ key: alias, label: `${agg.label} of ${metricDef.label}`, type: 'metric' });
  }

  // Mandatory tenant-isolation filter — always the first parameter,
  // never something a request could override or omit.
  const whereParts = [`${dataSource.companyIdColumn} = $1`];
  const params = [req.user.companyId];

  for (const f of filters) {
    // A filter's field can be either a dimension or a metric of this
    // data source — both are looked up the same whitelisted way.
    const fieldDef = dataSource.dimensions[f.field] || dataSource.metrics[f.field];
    if (!fieldDef) throw new ApiError(400, `Unknown filter field "${f.field}" for data source "${dataSourceKey}"`);
    const operator = OPERATORS[f.operator];
    if (!operator) throw new ApiError(400, `Unknown filter operator "${f.operator}"`);
    if (f.value === undefined || f.value === null || f.value === '') throw new ApiError(400, `Filter on "${f.field}" needs a value`);

    params.push(f.value);
    whereParts.push(`${fieldDef.sql} ${operator} $${params.length}`);
  }

  const sql = `
    SELECT ${selectParts.join(', ')}
    FROM ${dataSource.from}
    WHERE ${whereParts.join(' AND ')}
    ${groupByParts.length ? `GROUP BY ${groupByParts.join(', ')}` : ''}
    ORDER BY 1
    LIMIT ${ROW_LIMIT}
  `;

  const { rows } = await db.query(sql, params);
  return { rows, columns };
}

// POST /bi/run — runs a report definition live, without saving it.
const runReport = asyncHandler(async (req, res) => {
  const result = await buildAndRunReport(req, req.body);
  res.json(result);
});

// ---------- Saved Reports ----------

// GET /bi/saved-reports
const listSavedReports = asyncHandler(async (req, res) => {
  const { domain } = req.query;
  const { rows } = await db.query(
    'SELECT id, name, definition, created_at, updated_at FROM bi_saved_reports WHERE company_id = $1 ORDER BY name',
    [req.user.companyId]
  );
  const filtered = domain
    ? rows.filter((r) => DATA_SOURCES[r.definition.dataSource]?.domain === domain)
    : rows;
  res.json(filtered);
});

// POST /bi/saved-reports { name, definition }
const createSavedReport = asyncHandler(async (req, res) => {
  const { name, definition } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  if (!definition || !definition.dataSource) throw new ApiError(400, 'definition with a dataSource is required');

  // Validated by actually running it once before saving — a report that
  // can't run shouldn't be saved as if it could.
  await buildAndRunReport(req, definition);

  const { rows } = await db.query(
    'INSERT INTO bi_saved_reports (company_id, name, definition, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.companyId, name, JSON.stringify(definition), req.user.id]
  );
  res.status(201).json(rows[0]);
});

// GET /bi/saved-reports/:id/run
const runSavedReport = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM bi_saved_reports WHERE id = $1 AND company_id = $2', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Saved report not found');
  const result = await buildAndRunReport(req, rows[0].definition);
  res.json(result);
});

// DELETE /bi/saved-reports/:id
const deleteSavedReport = asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM bi_saved_reports WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.companyId]);
  if (!rows.length) throw new ApiError(404, 'Saved report not found');
  res.status(204).end();
});

// POST /bi/explain { columns, rows }
//
// The second half of "add AI help for reports and every issue" — the
// Dashboard's per-alert explainer handles the "issue" side; this is the
// harder "report" side, since a report's shape is genuinely open-ended
// (any data source, any combination of dimensions, any number of
// metrics) rather than one pre-written sentence.
//
// Deliberately does not re-run the report or touch the database at all
// — it takes the exact { rows, columns } shape /bi/run and
// /bi/saved-reports/:id/run already return, which the person has
// already legitimately seen on screen by the time they ask for an
// explanation. Summarized server-side before it ever reaches the
// prompt: up to 500 raw rows is too much to hand an AI model directly
// (expensive, slow, and mostly redundant repetition), so this computes
// real sum/min/max/avg per metric column and includes only a small
// sample of rows for concrete grounding, rather than the full result.
const MAX_EXPLAIN_ROWS = 500;

const explainReport = asyncHandler(async (req, res) => {
  const { columns, rows, mode } = req.body;
  if (!Array.isArray(columns) || columns.length === 0) throw new ApiError(400, 'columns is required');
  if (!Array.isArray(rows)) throw new ApiError(400, 'rows is required');
  if (rows.length > MAX_EXPLAIN_ROWS) throw new ApiError(400, `Cannot explain more than ${MAX_EXPLAIN_ROWS} rows`);
  if (mode && mode !== 'ai' && mode !== 'bi') throw new ApiError(400, "mode must be 'ai' or 'bi'");

  const metricColumns = columns.filter((c) => c.type === 'metric');
  // Kept as real structured numbers, not pre-joined strings — BI mode
  // renders these directly as a table with no formatting to undo, and
  // AI mode formats them into prose for the prompt from the exact same
  // underlying figures, so the two modes can never quietly disagree
  // with each other about what the data actually says.
  const stats = metricColumns.map((c) => {
    const values = rows.map((r) => Number(r[c.key])).filter((v) => !Number.isNaN(v));
    if (values.length === 0) return { label: c.label, count: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      label: c.label, count: values.length,
      sum: Number(sum.toFixed(2)), avg: Number((sum / values.length).toFixed(2)),
      min: Number(Math.min(...values).toFixed(2)), max: Number(Math.max(...values).toFixed(2)),
    };
  });

  // BI mode: the exact same computation every AI explanation is
  // grounded in, handed back directly with no interpretation layered on
  // top — instant, free, and deterministic, since it never calls out to
  // any external model at all. The genuinely useful option when someone
  // just wants the real numbers, not a narrative about them.
  if (mode === 'bi') {
    return res.json({ available: true, mode: 'bi', rowCount: rows.length, columns, stats });
  }

  const statsText = stats.map((s) => s.count === 0
    ? `${s.label}: no numeric values`
    : `${s.label}: sum=${s.sum}, avg=${s.avg}, min=${s.min}, max=${s.max}`);
  const sampleRows = rows.slice(0, 10).map((r) => columns.map((c) => `${c.label}=${r[c.key]}`).join(', ')).join('\n');

  const dataSummaryText = `Columns: ${columns.map((c) => `${c.label} (${c.type})`).join(', ')}
Total rows: ${rows.length}${rows.length >= MAX_EXPLAIN_ROWS ? ` (capped at ${MAX_EXPLAIN_ROWS}, there may be more)` : ''}

${statsText.length > 0 ? `Summary statistics:\n${statsText.join('\n')}\n` : ''}
Sample of the first ${Math.min(10, rows.length)} rows:
${sampleRows || '(no rows)'}`;

  const result = await generateStructuredInsight('a custom Business Intelligence report someone just built', dataSummaryText);
  res.json(result.available ? { available: true, mode: 'ai', explanation: result.insight } : result);
});

// POST /bi/export { columns, rows, format, title }
// Reuses the exact same PDF/Excel/Word generation already built for
// every other report in this app (see exportService.js) rather than a
// second, BI-specific export implementation — the same tableToPdf,
// tableToExcel, and tableToDocx builders every other report's Export
// menu already calls. The only reason this is its own POST endpoint
// rather than the existing GET-with-?format= pattern used elsewhere:
// a BI report's shape is whatever the person just built (any data
// source, any dimensions, any metrics), so there's no fixed query the
// server could re-run from a query string — the already-computed
// columns and rows the person is already looking at on screen are the
// only source of truth here.
const exportReport = asyncHandler(async (req, res) => {
  const { columns, rows, format, title } = req.body;
  if (!Array.isArray(columns) || columns.length === 0) throw new ApiError(400, 'columns is required');
  if (!Array.isArray(rows)) throw new ApiError(400, 'rows is required');
  if (rows.length > MAX_EXPLAIN_ROWS) throw new ApiError(400, `Cannot export more than ${MAX_EXPLAIN_ROWS} rows`);

  await sendExport(res, format, 'bi-report', {
    title: title || 'Business Intelligence Report',
    subtitle: `${rows.length} row${rows.length === 1 ? '' : 's'} · generated ${new Date().toLocaleDateString()}`,
    columns: columns.map((c) => ({
      key: c.key,
      label: c.label,
      // Metrics are numeric aggregates (sums, counts, averages) —
      // formatted with thousand separators. Dimensions are grouping
      // values (an account name, a department) and print as-is.
      format: c.type === 'metric' ? 'number' : undefined,
    })),
    rows,
  });
});

module.exports = { listDataSources, runReport, listSavedReports, createSavedReport, runSavedReport, deleteSavedReport, explainReport, exportReport };

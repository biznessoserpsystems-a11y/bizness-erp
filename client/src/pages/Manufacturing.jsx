import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';
import { useConfirm } from '../context/ConfirmContext';

const TABS = [
  { key: 'work-orders', label: 'Work Orders' },
  { key: 'boms', label: 'Bill of Materials' },
  { key: 'overhead-rates', label: 'Overhead Rates' },
  { key: 'reports', label: 'COGM & Variance' },
  { key: 'manufacturing-account', label: 'Manufacturing Account' },
  { key: 'costing-methods', label: 'Costing Methods' },
];

const money = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function Manufacturing() {
  const location = useLocation();
  // Drill-down entry point: the Workspace dashboard navigates here with
  // { tab, workOrderId } in location.state so a KPI or feed item can land
  // directly on the relevant tab (and, for work orders, the specific
  // record) rather than always opening on the default Work Orders list.
  const [tab, setTab] = useState(location.state?.tab || 'work-orders');
  return (
    <DashboardLayout title="Manufacturing">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'work-orders' && <WorkOrders initialSelectedId={location.state?.workOrderId} />}
      {tab === 'boms' && <BOMs />}
      {tab === 'overhead-rates' && <OverheadRates />}
      {tab === 'reports' && <ManufacturingReports />}
      {tab === 'manufacturing-account' && <ManufacturingAccountStatement />}
      {tab === 'costing-methods' && <CostingMethods />}
    </DashboardLayout>
  );
}

// ============================================================================
function WorkOrders({ initialSelectedId }) {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(initialSelectedId || null);
  const [boms, setBoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [overheadRates, setOverheadRates] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ bomId: '', warehouseId: '', quantityToProduce: '', overheadRateId: '' });
  const [error, setError] = useState('');

  function load() {
    api.get('/manufacturing/work-orders').then(({ data }) => setList(data));
  }
  useEffect(() => {
    load();
    api.get('/manufacturing/boms').then(({ data }) => setBoms(data.filter((b) => b.is_active)));
    api.get('/warehouses').then(({ data }) => setWarehouses(data));
    api.get('/manufacturing/overhead-rates').then(({ data }) => setOverheadRates(data.filter((r) => r.is_active)));
  }, []);

  async function submitCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/manufacturing/work-orders', form);
      setCreating(false);
      setForm({ bomId: '', warehouseId: '', quantityToProduce: '', overheadRateId: '' });
      load();
      setSelectedId(data.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create work order');
    }
  }

  if (selectedId) return <WorkOrderDetail id={selectedId} onBack={() => { setSelectedId(null); load(); }} />;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Work Orders</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Work Order'}</button>
      </div>

      {creating && (
        <form onSubmit={submitCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Bill of Materials</label>
            <select value={form.bomId} onChange={(e) => setForm((f) => ({ ...f, bomId: e.target.value }))} required>
              <option value="">Select</option>
              {boms.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.product_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Warehouse</label>
            <select value={form.warehouseId} onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Quantity to produce</label>
            <input type="number" step="0.01" value={form.quantityToProduce} onChange={(e) => setForm((f) => ({ ...f, quantityToProduce: e.target.value }))} style={{ width: 120 }} required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Overhead rate</label>
            <select value={form.overheadRateId} onChange={(e) => setForm((f) => ({ ...f, overheadRateId: e.target.value }))}>
              <option value="">None</option>
              {overheadRates.map((r) => <option key={r.id} value={r.id}>{r.name} ({Number(r.rate_per_unit).toFixed(2)}/{r.allocation_base === 'labour_hours' ? 'hr' : 'unit'})</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Create</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No work orders yet.</p>
      ) : (
        <table>
          <thead><tr><th>Work Order #</th><th>Product</th><th>Warehouse</th><th>Qty</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((wo) => (
              <tr key={wo.id}>
                <td>{wo.work_order_no}</td>
                <td>{wo.product_name}</td>
                <td>{wo.warehouse_name}</td>
                <td>{Number(wo.quantity_to_produce).toLocaleString()}</td>
                <td><span className={`badge ${wo.status === 'completed' ? 'badge-success' : wo.status === 'cancelled' ? 'badge-danger' : 'badge-info'}`}>{wo.status.replace('_', ' ')}</span></td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setSelectedId(wo.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WorkOrderDetail({ id, onBack }) {
  const [wo, setWo] = useState(null);
  const [error, setError] = useState('');
  const [labourForm, setLabourForm] = useState({ hours: '', ratePerHour: '' });
  const [overheadActivity, setOverheadActivity] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/manufacturing/work-orders/${id}`).then(({ data }) => setWo(data)).catch(() => setWo(null));
  }
  useEffect(load, [id]);

  async function runAction(action, body) {
    setError('');
    setBusy(true);
    try {
      await api.post(`/manufacturing/work-orders/${id}/${action}`, body || {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (!wo) return <div className="card"><p>Loading...</p></div>;
  const { costSummary } = wo;

  return (
    <div className="card">
      <div className="card-header">
        <h2>{wo.work_order_no} — {wo.product_name}</h2>
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={onBack}>&larr; Back to list</button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card"><div className="kpi-label">Status</div><div className="kpi-value" style={{ fontSize: 18, textTransform: 'capitalize' }}>{wo.status.replace('_', ' ')}</div></div>
        <div className="kpi-card"><div className="kpi-label">Materials cost</div><div className="kpi-value">{money(costSummary.materialsCost)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Labour cost</div><div className="kpi-value">{money(costSummary.labourCost)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Overhead applied</div><div className="kpi-value">{money(costSummary.overheadCost)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Unit cost so far</div><div className="kpi-value">{money(costSummary.unitCostSoFar)}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {wo.status === 'draft' && (
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction('issue-materials')}>1. Issue Materials</button>
        )}
        {(wo.status === 'materials_issued' || wo.status === 'in_progress') && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); runAction('log-labour', { hours: Number(labourForm.hours), ratePerHour: Number(labourForm.ratePerHour) }).then(() => setLabourForm({ hours: '', ratePerHour: '' })); }} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}><label>Hours</label><input type="number" step="0.01" value={labourForm.hours} onChange={(e) => setLabourForm((f) => ({ ...f, hours: e.target.value }))} style={{ width: 80 }} required /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Rate/hr</label><input type="number" step="0.01" value={labourForm.ratePerHour} onChange={(e) => setLabourForm((f) => ({ ...f, ratePerHour: e.target.value }))} style={{ width: 90 }} required /></div>
              <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>2. Log Labour</button>
            </form>
            {wo.overhead_rate_id && (
              <form onSubmit={(e) => { e.preventDefault(); runAction('apply-overhead', { activityQuantity: Number(overheadActivity) }).then(() => setOverheadActivity('')); }} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0 }}><label>Activity ({wo.allocation_base === 'labour_hours' ? 'hours' : 'units'})</label><input type="number" step="0.01" value={overheadActivity} onChange={(e) => setOverheadActivity(e.target.value)} style={{ width: 100 }} required /></div>
                <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>3. Apply Overhead</button>
              </form>
            )}
            <button className="btn btn-success btn-sm" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction('complete')}>4. Complete Work Order</button>
          </>
        )}
        {wo.status === 'completed' && <p style={{ color: 'var(--color-success)', margin: 0 }}>Completed on {new Date(wo.completion_date).toLocaleDateString()} — {Number(wo.quantity_to_produce).toLocaleString()} units received into stock at {money(costSummary.unitCostSoFar)} each.</p>}
      </div>

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Material Issues</h3>
      <table style={{ marginBottom: 16 }}>
        <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead>
        <tbody>
          {wo.materialIssues.length === 0 ? <tr><td colSpan={4} style={{ color: 'var(--color-text-muted)' }}>None yet.</td></tr> : wo.materialIssues.map((m) => (
            <tr key={m.id}><td>{m.product_name}</td><td>{Number(m.quantity_issued).toLocaleString()}</td><td>{money(m.unit_cost)}</td><td>{money(m.total_cost)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Labour Entries</h3>
      <table style={{ marginBottom: 16 }}>
        <thead><tr><th>Hours</th><th>Rate/hr</th><th>Total</th></tr></thead>
        <tbody>
          {wo.labourEntries.length === 0 ? <tr><td colSpan={3} style={{ color: 'var(--color-text-muted)' }}>None yet.</td></tr> : wo.labourEntries.map((l) => (
            <tr key={l.id}><td>{Number(l.hours).toLocaleString()}</td><td>{money(l.rate_per_hour)}</td><td>{money(l.total_cost)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Overhead Applications</h3>
      <table>
        <thead><tr><th>Activity Qty</th><th>Applied Cost</th></tr></thead>
        <tbody>
          {wo.overheadApplications.length === 0 ? <tr><td colSpan={2} style={{ color: 'var(--color-text-muted)' }}>None yet.</td></tr> : wo.overheadApplications.map((o) => (
            <tr key={o.id}><td>{Number(o.activity_quantity).toLocaleString()}</td><td>{money(o.applied_cost)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
function BOMs() {
  const [list, setList] = useState(null);
  const [products, setProducts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ productId: '', name: '', yieldQuantity: '1', labourHoursPerBatch: '0', lines: [{ componentProductId: '', quantityPerBatch: '' }] });
  const [error, setError] = useState('');

  function load() { api.get('/manufacturing/boms').then(({ data }) => setList(data)); }
  useEffect(() => { load(); api.get('/products').then(({ data }) => setProducts(data)); }, []);

  const finishedGoods = products.filter((p) => p.product_type === 'finished_good');
  const components = products.filter((p) => p.product_type !== 'finished_good');

  function updateLine(i, field, value) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/manufacturing/boms', form);
      setCreating(false);
      setForm({ productId: '', name: '', yieldQuantity: '1', labourHoursPerBatch: '0', lines: [{ componentProductId: '', quantityPerBatch: '' }] });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create BOM');
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Bills of Materials</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New BOM'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        A finished good's recipe: which components go into it, and how much of each per batch. Set a product's type to "Finished Good" (Products page) before it can have a BOM.
      </p>

      {creating && (
        <form onSubmit={submit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group"><label>Finished good</label>
              <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} required>
                <option value="">Select</option>
                {finishedGoods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>BOM name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div className="form-group"><label>Yield qty per batch</label><input type="number" step="0.01" value={form.yieldQuantity} onChange={(e) => setForm((f) => ({ ...f, yieldQuantity: e.target.value }))} style={{ width: 100 }} /></div>
            <div className="form-group"><label>Labour hrs per batch</label><input type="number" step="0.01" value={form.labourHoursPerBatch} onChange={(e) => setForm((f) => ({ ...f, labourHoursPerBatch: e.target.value }))} style={{ width: 100 }} /></div>
          </div>
          <h4 style={{ fontSize: 13 }}>Components</h4>
          {form.lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <select value={line.componentProductId} onChange={(e) => updateLine(i, 'componentProductId', e.target.value)} required style={{ flex: 2 }}>
                <option value="">Select component</option>
                {components.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Qty per batch" value={line.quantityPerBatch} onChange={(e) => updateLine(i, 'quantityPerBatch', e.target.value)} required style={{ width: 130 }} />
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { componentProductId: '', quantityPerBatch: '' }] }))}>+ Add component</button>
          {' '}<button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }}>Save BOM</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No Bills of Materials yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Product</th><th>Version</th><th>Yield</th><th>Components</th><th>Costing Method</th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td><td>{b.product_name}</td><td>{b.version}</td><td>{Number(b.yield_quantity).toLocaleString()}</td><td>{b.line_count}</td>
                <td>
                  <select
                    defaultValue={b.costing_method}
                    onChange={(e) => api.patch(`/manufacturing/boms/${b.id}/costing-method`, { costingMethod: e.target.value }).then(load)}
                    style={{ padding: '2px 6px', borderRadius: 6, fontSize: 12.5 }}
                  >
                    <option value="actual">Actual Costing</option>
                    <option value="standard">Standard Costing</option>
                    <option value="job">Job Costing</option>
                    <option value="process">Process Costing</option>
                    <option value="abc">Activity-Based Costing</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
function OverheadRates() {
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', allocationBase: 'labour_hours', budgetedOverheadCost: '', normalCapacity: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');

  function load() { api.get('/manufacturing/overhead-rates').then(({ data }) => setList(data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/manufacturing/overhead-rates', form);
      setCreating(false);
      setForm({ name: '', allocationBase: 'labour_hours', budgetedOverheadCost: '', normalCapacity: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create rate');
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Manufacturing Overhead Rates</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Rate'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        IAS 2.13: overhead is applied to production at a <strong>predetermined rate based on normal capacity</strong> — not actual output. Set Normal Capacity to your budgeted/expected labour hours (or units) for a typical period, never to what actually happened; that's what keeps idle-capacity cost out of inventory value.
      </p>

      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Allocation base</label>
            <select value={form.allocationBase} onChange={(e) => setForm((f) => ({ ...f, allocationBase: e.target.value }))}>
              <option value="labour_hours">Labour hours</option>
              <option value="units_produced">Units produced</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Budgeted overhead (period)</label><input type="number" step="0.01" value={form.budgetedOverheadCost} onChange={(e) => setForm((f) => ({ ...f, budgetedOverheadCost: e.target.value }))} style={{ width: 140 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Normal capacity</label><input type="number" step="0.01" value={form.normalCapacity} onChange={(e) => setForm((f) => ({ ...f, normalCapacity: e.target.value }))} style={{ width: 120 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Effective from</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} required /></div>
          <button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }}>Save</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No overhead rates configured yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Base</th><th>Budgeted</th><th>Normal Capacity</th><th>Rate</th><th>Effective From</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{r.allocation_base === 'labour_hours' ? 'Labour hours' : 'Units produced'}</td>
                <td>{money(r.budgeted_overhead_cost)}</td><td>{Number(r.normal_capacity).toLocaleString()}</td>
                <td>{money(r.rate_per_unit)}</td><td>{new Date(r.effective_from).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
function ManufacturingReports() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [cogm, setCogm] = useState(null);
  const [variance, setVariance] = useState(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [recordForm, setRecordForm] = useState({ category: 'indirect_labour', amount: '', bankAccountId: '', description: '', date: new Date().toISOString().slice(0, 10) });
  const [recording, setRecording] = useState(false);

  function load() {
    api.get(`/manufacturing/cogm-statement?from=${from}&to=${to}`).then(({ data }) => setCogm(data)).catch(() => setCogm(null));
    api.get(`/manufacturing/overhead-variance?from=${from}&to=${to}`).then(({ data }) => setVariance(data)).catch(() => setVariance(null));
  }
  useEffect(load, [from, to]);
  useEffect(() => { api.get('/bank-accounts').then(({ data }) => setBankAccounts(data)); }, []);

  async function closeVariance() {
    setError('');
    setClosing(true);
    try {
      await api.post('/manufacturing/overhead-variance/close', { from, to });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to close variance');
    } finally {
      setClosing(false);
    }
  }

  async function recordOverhead(e) {
    e.preventDefault();
    setError('');
    setRecording(true);
    try {
      await api.post('/manufacturing/overhead-actual', recordForm);
      setRecordForm((f) => ({ ...f, amount: '', description: '' }));
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record overhead');
    } finally {
      setRecording(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="statement-header">
          <h2 className="statement-title">Cost of Goods Manufactured</h2>
          <div className="statement-actions">
            <DateRangeFilter mode={rangeMode} onModeChange={setRangeMode} customFrom={customFrom} customTo={customTo} onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />
          </div>
        </div>
        {!cogm ? <p>Loading...</p> : (
          <table className="statement-table">
            <tbody>
              <tr className="statement-line-row"><td>Beginning Work in Progress</td><td className="statement-amount">{money(cogm.beginningWip)}</td></tr>
              <tr className="statement-section-row"><td colSpan={2}>Manufacturing Costs for the Period</td></tr>
              <tr className="statement-line-row"><td>Direct Materials</td><td className="statement-amount">{money(cogm.directMaterials)}</td></tr>
              <tr className="statement-line-row"><td>Direct Labour</td><td className="statement-amount">{money(cogm.directLabour)}</td></tr>
              <tr className="statement-line-row"><td>Manufacturing Overhead Applied</td><td className="statement-amount">{money(cogm.manufacturingOverheadApplied)}</td></tr>
              <tr className="statement-total-row"><td>Total Manufacturing Costs</td><td className="statement-amount">{money(cogm.totalManufacturingCosts)}</td></tr>
              <tr className="statement-line-row"><td>Ending Work in Progress</td><td className="statement-amount">({money(cogm.endingWip)})</td></tr>
              <tr className="statement-grand-total-row"><td>Cost of Goods Manufactured</td><td className="statement-amount">{money(cogm.costOfGoodsManufactured)}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Manufacturing Overhead Variance {variance && (variance.isOverApplied ? <span className="badge badge-success">Over-applied</span> : <span className="badge badge-warning">Under-applied</span>)}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
          IAS 2.13: the difference between overhead applied at the predetermined rate and actual overhead incurred must be recognised as an expense (or income) in the period, never absorbed into ending inventory.
        </p>
        {error && <div className="error-banner">{error}</div>}
        {!variance ? <p>Loading...</p> : (
          <>
            <table style={{ marginBottom: 12 }}>
              <thead><tr><th>Actual Overhead</th><th>Applied Overhead</th><th>Variance</th></tr></thead>
              <tbody>
                <tr><td>{money(variance.actual)}</td><td>{money(variance.applied)}</td><td>{money(variance.variance)}</td></tr>
              </tbody>
            </table>

            <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '16px 0 8px' }}>Actual Overhead by Category</h4>
            <table style={{ marginBottom: 16 }}>
              <thead><tr><th>Category</th><th>Amount</th></tr></thead>
              <tbody>
                {variance.byCategory.every((c) => c.amount === 0) ? (
                  <tr><td colSpan={2} style={{ color: 'var(--color-text-muted)' }}>No actual overhead recorded for this period yet.</td></tr>
                ) : variance.byCategory.map((c) => (
                  <tr key={c.accountId}><td>{c.category}</td><td>{money(c.amount)}</td></tr>
                ))}
              </tbody>
            </table>

            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={closeVariance} disabled={closing || Math.abs(variance.variance) < 0.01}>
              {closing ? 'Closing...' : 'Close variance for this period'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Record Actual Manufacturing Overhead</h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Record real factory overhead spend as it's incurred — indirect labour, factory rent, utilities, insurance, security, cleaning, factory depreciation, factory maintenance, and factory management salaries each post to their own account, so you can see exactly where overhead cost is going, not just one lump total.
        </p>
        <form onSubmit={recordOverhead} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Category</label>
            <select value={recordForm.category} onChange={(e) => setRecordForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="indirect_labour">Indirect Labour</option>
              <option value="factory_rent">Factory Rent</option>
              <option value="utilities">Utilities</option>
              <option value="insurance">Insurance</option>
              <option value="security">Security</option>
              <option value="cleaning">Cleaning</option>
              <option value="factory_depreciation">Factory Depreciation</option>
              <option value="factory_maintenance">Factory Maintenance</option>
              <option value="factory_management_salaries">Factory Management Salaries</option>
              <option value="internet">Internet</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Amount</label><input type="number" step="0.01" value={recordForm.amount} onChange={(e) => setRecordForm((f) => ({ ...f, amount: e.target.value }))} style={{ width: 110 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Paid from</label>
            <select value={recordForm.bankAccountId} onChange={(e) => setRecordForm((f) => ({ ...f, bankAccountId: e.target.value }))} required>
              <option value="">Select bank account</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Date</label><input type="date" value={recordForm.date} onChange={(e) => setRecordForm((f) => ({ ...f, date: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}><label>Description (optional)</label><input value={recordForm.description} onChange={(e) => setRecordForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit" disabled={recording}>{recording ? 'Recording...' : 'Record'}</button>
        </form>
      </div>
    </>
  );
}

// ============================================================================
function ManufacturingAccountStatement() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/manufacturing/manufacturing-account?from=${from}&to=${to}`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [from, to]);

  return (
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">Manufacturing Account</h2>
        <div className="statement-actions">
          <DateRangeFilter mode={rangeMode} onModeChange={setRangeMode} customFrom={customFrom} customTo={customTo} onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        The classic cost-accounting build-up — Raw Materials Consumed, Prime Cost, Factory Cost, and Cost of Goods Manufactured. Uses <strong>actual</strong> factory overhead incurred (the real cost categories on the Reports tab), not the predetermined-rate overhead <em>applied</em> to individual work orders — the two are complementary views, and will only match in a period with zero overhead variance. Raw material Opening/Closing figures are reconstructed from stock movements (this system doesn't keep a separate Raw Materials ledger account) — accurate when the period ends today; a documented approximation otherwise.
      </p>

      {!data ? <p>Loading...</p> : (
        <table className="statement-table">
          <tbody>
            <tr className="statement-section-row"><td colSpan={2}>Raw Materials</td></tr>
            <tr className="statement-line-row"><td>Opening Raw Materials</td><td className="statement-amount">{money(data.openingRawMaterials)}</td></tr>
            <tr className="statement-line-row"><td>Add: Purchases</td><td className="statement-amount">{money(data.purchases)}</td></tr>
            <tr className="statement-line-row"><td>Add: Carriage Inward</td><td className="statement-amount">{money(data.carriageInward)}</td></tr>
            <tr className="statement-line-row"><td>Less: Closing Raw Materials</td><td className="statement-amount">({money(data.closingRawMaterials)})</td></tr>
            <tr className="statement-total-row"><td>Raw Materials Consumed</td><td className="statement-amount">{money(data.rawMaterialsConsumed)}</td></tr>

            <tr className="statement-line-row"><td>Add: Direct Labour</td><td className="statement-amount">{money(data.directLabour)}</td></tr>
            <tr className="statement-line-row"><td>Add: Direct Expenses</td><td className="statement-amount">{money(data.directExpenses)}</td></tr>
            <tr className="statement-total-row"><td>Prime Cost</td><td className="statement-amount">{money(data.primeCost)}</td></tr>

            <tr className="statement-line-row"><td>Add: Factory Overheads</td><td className="statement-amount">{money(data.factoryOverheads)}</td></tr>
            <tr className="statement-total-row"><td>Factory Cost</td><td className="statement-amount">{money(data.factoryCost)}</td></tr>

            <tr className="statement-line-row"><td>Add: Opening Work in Progress</td><td className="statement-amount">{money(data.openingWip)}</td></tr>
            <tr className="statement-line-row"><td>Less: Closing Work in Progress</td><td className="statement-amount">({money(data.closingWip)})</td></tr>
            <tr className="statement-grand-total-row"><td>Cost of Goods Manufactured</td><td className="statement-amount">{money(data.costOfGoodsManufactured)}</td></tr>
          </tbody>
        </table>
      )}

      {data && data.factoryOverheadsByCategory.some((c) => c.amount > 0) && (
        <>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginTop: 24 }}>Factory Overheads by Category</h3>
          <table>
            <thead><tr><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              {data.factoryOverheadsByCategory.filter((c) => c.amount > 0).map((c) => (
                <tr key={c.category}><td>{c.category}</td><td>{money(c.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ============================================================================
function CostingMethods() {
  const [subTab, setSubTab] = useState('standard');
  const SUB_TABS = [
    { key: 'standard', label: 'Standard Costing' },
    { key: 'job', label: 'Job Costing' },
    { key: 'process', label: 'Process Costing' },
    { key: 'abc', label: 'Activity-Based Costing' },
  ];

  return (
    <div className="card">
      <h2>Costing Methods</h2>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Every Bill of Materials can be flagged with the costing method that fits it best. <strong>Actual Costing</strong> is covered by the Manufacturing Account tab (real materials at FIFO/weighted-average cost, real labour, real factory overhead incurred) — every Work Order already uses actual costs for materials and labour regardless of which method below is layered on top.
      </p>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {SUB_TABS.map((t) => (
          <button key={t.key} className={subTab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSubTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {subTab === 'standard' && <StandardCosting />}
      {subTab === 'job' && <JobCosting />}
      {subTab === 'process' && <ProcessCosting />}
      {subTab === 'abc' && <ActivityBasedCosting />}
    </div>
  );
}

function StandardCosting() {
  const confirm = useConfirm();
  const [cards, setCards] = useState(null);
  const [boms, setBoms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ bomId: '', standardMaterialCost: '', standardLabourCost: '', standardOverheadCost: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [variance, setVariance] = useState(null);
  const [varianceError, setVarianceError] = useState('');

  function load() { api.get('/manufacturing/standard-cost-cards').then(({ data }) => setCards(data)); }
  useEffect(() => { load(); api.get('/manufacturing/boms').then(({ data }) => setBoms(data)); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/manufacturing/standard-cost-cards', {
        ...form, standardMaterialCost: Number(form.standardMaterialCost), standardLabourCost: Number(form.standardLabourCost), standardOverheadCost: Number(form.standardOverheadCost),
      });
      setCreating(false);
      setForm({ bomId: '', standardMaterialCost: '', standardLabourCost: '', standardOverheadCost: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create standard cost card');
    }
  }

  async function checkVariance(e) {
    e.preventDefault();
    setVarianceError('');
    setVariance(null);
    try {
      const { data } = await api.get(`/manufacturing/work-orders/${workOrderId}/standard-variance`);
      setVariance(data);
    } catch (err) {
      setVarianceError(err.response?.data?.error || 'Failed to compute variance');
    }
  }

  async function remove(c) {
    const ok = await confirm(`Delete this standard cost card for ${c.bom_name}?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/manufacturing/standard-cost-cards/${c.id}`);
    load();
  }

  return (
    <div>
      <div className="card-header">
        <h3 style={{ fontSize: 14 }}>Standard Cost Cards</h3>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Standard Cost Card'}</button>
      </div>
      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Bill of Materials</label>
            <select value={form.bomId} onChange={(e) => setForm((f) => ({ ...f, bomId: e.target.value }))} required>
              <option value="">Select</option>
              {boms.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.product_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Std. Material/unit</label><input type="number" step="0.01" value={form.standardMaterialCost} onChange={(e) => setForm((f) => ({ ...f, standardMaterialCost: e.target.value }))} style={{ width: 110 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Std. Labour/unit</label><input type="number" step="0.01" value={form.standardLabourCost} onChange={(e) => setForm((f) => ({ ...f, standardLabourCost: e.target.value }))} style={{ width: 110 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Std. Overhead/unit</label><input type="number" step="0.01" value={form.standardOverheadCost} onChange={(e) => setForm((f) => ({ ...f, standardOverheadCost: e.target.value }))} style={{ width: 110 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Effective from</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} required /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}
      {cards === null ? <p>Loading...</p> : cards.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No standard cost cards yet.</p> : (
        <table style={{ marginBottom: 24 }}>
          <thead><tr><th>BOM</th><th>Material</th><th>Labour</th><th>Overhead</th><th>Standard Unit Cost</th><th>Effective From</th><th></th></tr></thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td>{c.bom_name} — {c.product_name}</td>
                <td>{money(c.standard_material_cost)}</td><td>{money(c.standard_labour_cost)}</td><td>{money(c.standard_overhead_cost)}</td>
                <td>{money(c.standard_unit_cost)}</td><td>{new Date(c.effective_from).toLocaleDateString()}</td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(c)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 14 }}>Check Variance for a Work Order</h3>
      <form onSubmit={checkVariance} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input placeholder="Work Order ID" value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)} style={{ width: 320 }} required />
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit">Check Variance</button>
      </form>
      {varianceError && <div className="error-banner">{varianceError}</div>}
      {variance && (
        <table>
          <thead><tr><th></th><th>Standard</th><th>Actual</th><th>Variance</th></tr></thead>
          <tbody>
            <tr><td>Material</td><td>{money(variance.material.standard)}</td><td>{money(variance.material.actual)}</td><td style={{ color: variance.material.isFavourable ? 'var(--color-success)' : 'var(--color-error)' }}>{money(variance.material.variance)} ({variance.material.isFavourable ? 'F' : 'U'})</td></tr>
            <tr><td>Labour</td><td>{money(variance.labour.standard)}</td><td>{money(variance.labour.actual)}</td><td style={{ color: variance.labour.isFavourable ? 'var(--color-success)' : 'var(--color-error)' }}>{money(variance.labour.variance)} ({variance.labour.isFavourable ? 'F' : 'U'})</td></tr>
            <tr><td>Overhead</td><td>{money(variance.overhead.standard)}</td><td>{money(variance.overhead.actual)}</td><td style={{ color: variance.overhead.isFavourable ? 'var(--color-success)' : 'var(--color-error)' }}>{money(variance.overhead.variance)} ({variance.overhead.isFavourable ? 'F' : 'U'})</td></tr>
            <tr className="statement-total-row"><td>Total</td><td>{money(variance.totalStandardCost)}</td><td>{money(variance.totalActualCost)}</td><td>{money(variance.totalVariance)}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function JobCosting() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);

  useEffect(() => { api.get(`/manufacturing/job-cost-report?from=${from}&to=${to}`).then(({ data }) => setData(data)); }, [from, to]);

  return (
    <div>
      <div className="card-header">
        <h3 style={{ fontSize: 14 }}>Job Cost Report</h3>
        <DateRangeFilter mode={rangeMode} onModeChange={setRangeMode} customFrom={customFrom} customTo={customTo} onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Every Work Order is its own job — this is that same cost data, presented as a job costing report.</p>
      {!data ? <p>Loading...</p> : data.jobs.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No jobs in this period.</p> : (
        <table>
          <thead><tr><th>Job #</th><th>Product</th><th>Status</th><th>Qty</th><th>Material</th><th>Labour</th><th>Overhead</th><th>Total</th><th>Unit Cost</th></tr></thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.workOrderId}>
                <td>{j.jobNo}</td><td>{j.productName}</td><td style={{ textTransform: 'capitalize' }}>{j.status.replace('_', ' ')}</td><td>{j.quantity}</td>
                <td>{money(j.materialCost)}</td><td>{money(j.labourCost)}</td><td>{money(j.overheadCost)}</td><td>{money(j.totalCost)}</td><td>{money(j.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProcessCosting() {
  const confirm = useConfirm();
  const [batches, setBatches] = useState(null);
  const [boms, setBoms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ bomId: '', periodStart: '', periodEnd: '', unitsCompleted: '', unitsInProcess: '', percentCompleteInProcess: '', materialCost: '', labourCost: '', overheadCost: '' });
  const [error, setError] = useState('');

  function load() { api.get('/manufacturing/process-cost-batches').then(({ data }) => setBatches(data)); }
  useEffect(() => { load(); api.get('/manufacturing/boms').then(({ data }) => setBoms(data)); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/manufacturing/process-cost-batches', {
        ...form,
        unitsCompleted: Number(form.unitsCompleted), unitsInProcess: Number(form.unitsInProcess), percentCompleteInProcess: Number(form.percentCompleteInProcess),
        materialCost: Number(form.materialCost), labourCost: Number(form.labourCost), overheadCost: Number(form.overheadCost),
      });
      setCreating(false);
      setForm({ bomId: '', periodStart: '', periodEnd: '', unitsCompleted: '', unitsInProcess: '', percentCompleteInProcess: '', materialCost: '', labourCost: '', overheadCost: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create process cost batch');
    }
  }

  async function remove(b) {
    const ok = await confirm(`Delete this process cost batch for ${b.bom_name}?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    await api.delete(`/manufacturing/process-cost-batches/${b.id}`);
    load();
  }

  return (
    <div>
      <div className="card-header">
        <h3 style={{ fontSize: 14 }}>Process Cost Batches</h3>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Batch'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        For continuous, homogeneous production tracked per period rather than per job. Equivalent units = units completed + (units in process × % complete) — the % complete is a real production judgement call this system has no sensor data to infer, so enter it directly.
      </p>
      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}>
            <label>BOM</label>
            <select value={form.bomId} onChange={(e) => setForm((f) => ({ ...f, bomId: e.target.value }))} required>
              <option value="">Select</option>
              {boms.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.product_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Period start</label><input type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Period end</label><input type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Units completed</label><input type="number" step="0.01" value={form.unitsCompleted} onChange={(e) => setForm((f) => ({ ...f, unitsCompleted: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Units in process</label><input type="number" step="0.01" value={form.unitsInProcess} onChange={(e) => setForm((f) => ({ ...f, unitsInProcess: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>% complete (in process)</label><input type="number" step="0.01" value={form.percentCompleteInProcess} onChange={(e) => setForm((f) => ({ ...f, percentCompleteInProcess: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Material cost</label><input type="number" step="0.01" value={form.materialCost} onChange={(e) => setForm((f) => ({ ...f, materialCost: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Labour cost</label><input type="number" step="0.01" value={form.labourCost} onChange={(e) => setForm((f) => ({ ...f, labourCost: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Overhead cost</label><input type="number" step="0.01" value={form.overheadCost} onChange={(e) => setForm((f) => ({ ...f, overheadCost: e.target.value }))} style={{ width: 100 }} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}
      {batches === null ? <p>Loading...</p> : batches.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No process cost batches yet.</p> : (
        <table>
          <thead><tr><th>BOM</th><th>Period</th><th>Completed</th><th>In Process</th><th>% Complete</th><th>Equiv. Units</th><th>Total Cost</th><th>Cost/Equiv. Unit</th><th></th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.bom_name}</td><td>{new Date(b.period_start).toLocaleDateString()} – {new Date(b.period_end).toLocaleDateString()}</td>
                <td>{Number(b.units_completed).toLocaleString()}</td><td>{Number(b.units_in_process).toLocaleString()}</td><td>{b.percent_complete_in_process}%</td>
                <td>{b.equivalentUnits.toFixed(2)}</td><td>{money(b.totalCost)}</td><td>{money(b.costPerEquivalentUnit)}</td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(b)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ActivityBasedCosting() {
  const confirm = useConfirm();
  const [pools, setPools] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', costDriverUnit: '', poolCost: '', totalDriverVolume: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');
  const [allocForm, setAllocForm] = useState({ workOrderId: '', activityPoolId: '', driverQuantity: '' });
  const [allocError, setAllocError] = useState('');
  const [allocSuccess, setAllocSuccess] = useState('');

  function load() { api.get('/manufacturing/abc-activity-pools').then(({ data }) => setPools(data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/manufacturing/abc-activity-pools', { ...form, poolCost: Number(form.poolCost), totalDriverVolume: Number(form.totalDriverVolume) });
      setCreating(false);
      setForm({ name: '', costDriverUnit: '', poolCost: '', totalDriverVolume: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create activity pool');
    }
  }

  async function remove(p) {
    const ok = await confirm(`Delete activity pool "${p.name}"?`, { confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/manufacturing/abc-activity-pools/${p.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete activity pool');
    }
  }

  async function allocate(e) {
    e.preventDefault();
    setAllocError('');
    setAllocSuccess('');
    try {
      const { data } = await api.post(`/manufacturing/work-orders/${allocForm.workOrderId}/abc-allocations`, {
        activityPoolId: allocForm.activityPoolId, driverQuantity: Number(allocForm.driverQuantity),
      });
      setAllocSuccess(`Allocated ${money(data.allocated_cost)} to Work in Progress.`);
      setAllocForm({ workOrderId: '', activityPoolId: '', driverQuantity: '' });
    } catch (err) {
      setAllocError(err.response?.data?.error || 'Failed to allocate');
    }
  }

  return (
    <div>
      <div className="card-header">
        <h3 style={{ fontSize: 14 }}>Activity Pools</h3>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Activity Pool'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Overhead allocated by multiple cost drivers (machine setups, inspections, material moves) rather than one single rate — an alternative to the Overhead Rates tab's single-rate method, not a replacement of it. A Work Order can use either or both.
      </p>
      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Machine Setups" required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Driver unit</label><input value={form.costDriverUnit} onChange={(e) => setForm((f) => ({ ...f, costDriverUnit: e.target.value }))} placeholder="e.g. setup" required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Pool cost (period)</label><input type="number" step="0.01" value={form.poolCost} onChange={(e) => setForm((f) => ({ ...f, poolCost: e.target.value }))} style={{ width: 120 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Total driver volume</label><input type="number" step="0.01" value={form.totalDriverVolume} onChange={(e) => setForm((f) => ({ ...f, totalDriverVolume: e.target.value }))} style={{ width: 130 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Effective from</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} required /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}
      {pools === null ? <p>Loading...</p> : pools.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No activity pools yet.</p> : (
        <table style={{ marginBottom: 24 }}>
          <thead><tr><th>Name</th><th>Driver Unit</th><th>Pool Cost</th><th>Total Driver Volume</th><th>Rate/Driver</th><th></th></tr></thead>
          <tbody>
            {pools.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.cost_driver_unit}</td><td>{money(p.pool_cost)}</td><td>{Number(p.total_driver_volume).toLocaleString()}</td><td>{money(p.rate_per_driver)}</td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => remove(p)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 14 }}>Allocate to a Work Order</h3>
      <form onSubmit={allocate} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {allocError && <div className="error-banner" style={{ width: '100%' }}>{allocError}</div>}
        {allocSuccess && <div className="success-banner" style={{ width: '100%', color: 'var(--color-success)' }}>{allocSuccess}</div>}
        <div className="form-group" style={{ margin: 0 }}><label>Work Order ID</label><input value={allocForm.workOrderId} onChange={(e) => setAllocForm((f) => ({ ...f, workOrderId: e.target.value }))} style={{ width: 300 }} required /></div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Activity Pool</label>
          <select value={allocForm.activityPoolId} onChange={(e) => setAllocForm((f) => ({ ...f, activityPoolId: e.target.value }))} required>
            <option value="">Select</option>
            {(pools || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.rate_per_driver)}/{p.cost_driver_unit})</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}><label>Driver quantity</label><input type="number" step="0.01" value={allocForm.driverQuantity} onChange={(e) => setAllocForm((f) => ({ ...f, driverQuantity: e.target.value }))} style={{ width: 100 }} required /></div>
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit">Allocate</button>
      </form>
    </div>
  );
}

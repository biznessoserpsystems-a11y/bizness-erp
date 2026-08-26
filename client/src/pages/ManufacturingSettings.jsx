import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

const COSTING_METHODS = [
  { value: 'actual', label: 'Actual Costing' },
  { value: 'standard', label: 'Standard Costing' },
  { value: 'job', label: 'Job Costing' },
  { value: 'process', label: 'Process Costing' },
  { value: 'abc', label: 'Activity-Based Costing' },
];

export default function ManufacturingSettings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([api.get('/manufacturing/settings'), api.get('/warehouses')])
      .then(([s, w]) => {
        setSettings(s.data);
        setForm({
          defaultWarehouseId: s.data.default_warehouse_id || '',
          defaultOverheadAllocationBase: s.data.default_overhead_allocation_base,
          defaultCostingMethod: s.data.default_costing_method,
          overheadVarianceThresholdPct: s.data.overhead_variance_threshold_pct,
        });
        setWarehouses(w.data);
      })
      .catch(() => setSettings(false));
  }
  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/manufacturing/settings', {
        ...form,
        defaultWarehouseId: form.defaultWarehouseId || null,
      });
      setSettings(data);
      showToast('Manufacturing settings saved.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (settings === null || form === null) return <DashboardLayout title="Manufacturing Settings"><div className="card"><p>Loading...</p></div></DashboardLayout>;
  if (settings === false) return <DashboardLayout title="Manufacturing Settings"><div className="card"><p>Failed to load settings.</p></div></DashboardLayout>;

  return (
    <DashboardLayout title="Manufacturing Settings">
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        Company-wide defaults for the Manufacturing module — the same pattern as Procurement's
        and HR's settings pages.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><h2>Production defaults</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Used to pre-fill a new Work Order when a specific warehouse isn't given. If left blank,
            the company's first warehouse (alphabetically) is used automatically.
          </p>
          <div className="form-group">
            <label>Default production warehouse</label>
            <select
              value={form.defaultWarehouseId}
              onChange={(e) => setForm((f) => ({ ...f, defaultWarehouseId: e.target.value }))}
            >
              <option value="">None — use the first warehouse automatically</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Costing defaults</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Applied to new Bills of Materials and overhead rates when not overridden per record.
          </p>
          <div className="form-group">
            <label>Default costing method for new Bills of Materials</label>
            <select
              value={form.defaultCostingMethod}
              onChange={(e) => setForm((f) => ({ ...f, defaultCostingMethod: e.target.value }))}
            >
              {COSTING_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Default overhead allocation base</label>
            <select
              value={form.defaultOverheadAllocationBase}
              onChange={(e) => setForm((f) => ({ ...f, defaultOverheadAllocationBase: e.target.value }))}
            >
              <option value="labour_hours">Labour hours</option>
              <option value="units_produced">Units produced</option>
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Overhead variance</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            The Overhead Variance report (IAS 2.13) flags a period as significant once
            |actual − applied| exceeds this percentage of applied overhead.
          </p>
          <div className="form-group">
            <label>Significant variance threshold (%)</label>
            <input
              type="number" min="0" max="100" step="0.01" value={form.overheadVarianceThresholdPct}
              onChange={(e) => setForm((f) => ({ ...f, overheadVarianceThresholdPct: e.target.value }))}
            />
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}

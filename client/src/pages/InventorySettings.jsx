import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function InventorySettings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([api.get('/inventory/settings'), api.get('/warehouses')])
      .then(([s, w]) => {
        setSettings(s.data);
        setForm({
          defaultWarehouseId: s.data.default_warehouse_id || '',
          allowNegativeStock: s.data.allow_negative_stock,
          defaultReorderLevel: s.data.default_reorder_level,
          defaultReorderQuantity: s.data.default_reorder_quantity,
          expiryAlertWindowDays: s.data.expiry_alert_window_days,
          stockCountVarianceTolerancePct: s.data.stock_count_variance_tolerance_pct,
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
      const { data } = await api.put('/inventory/settings', {
        ...form,
        defaultWarehouseId: form.defaultWarehouseId || null,
      });
      setSettings(data);
      showToast('Inventory settings saved.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (settings === null || form === null) return <DashboardLayout title="Inventory Settings"><div className="card"><p>Loading...</p></div></DashboardLayout>;
  if (settings === false) return <DashboardLayout title="Inventory Settings"><div className="card"><p>Failed to load settings.</p></div></DashboardLayout>;

  return (
    <DashboardLayout title="Inventory Settings">
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        Company-wide defaults for the Inventory & Warehouse module — the same pattern as Procurement's,
        HR's, and Manufacturing's settings pages.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><h2>Warehouse defaults</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Used to pre-fill a stock operation when a specific warehouse isn't given.
          </p>
          <div className="form-group">
            <label>Default warehouse</label>
            <select
              value={form.defaultWarehouseId}
              onChange={(e) => setForm((f) => ({ ...f, defaultWarehouseId: e.target.value }))}
            >
              <option value="">None — always choose explicitly</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Stock levels</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            <strong>Allow negative stock</strong> is a real change in behaviour, not just a display preference: with it off (the default),
            issuing more of a product than is on hand is always rejected. Turning it on lets a sale or issue
            be recorded before the matching receipt is entered — useful for backdated paperwork — with the
            balance trued up once the receipt arrives. Only applies to products that aren't batch-tracked;
            a specific physical batch can never go negative, since that has no real-world meaning.
          </p>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox" id="allowNegativeStock" checked={form.allowNegativeStock}
              onChange={(e) => setForm((f) => ({ ...f, allowNegativeStock: e.target.checked }))}
              style={{ width: 'auto' }}
            />
            <label htmlFor="allowNegativeStock" style={{ margin: 0 }}>Allow negative stock for non-batch-tracked products</label>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>New product defaults</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Pre-fills a newly-created product's reorder fields when not specified, so it isn't silently
            invisible to the Low Stock report until someone remembers to set a threshold.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Default reorder level</label>
              <input
                type="number" min="0" step="0.01" value={form.defaultReorderLevel}
                onChange={(e) => setForm((f) => ({ ...f, defaultReorderLevel: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Default reorder quantity</label>
              <input
                type="number" min="0" step="0.01" value={form.defaultReorderQuantity}
                onChange={(e) => setForm((f) => ({ ...f, defaultReorderQuantity: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Alerts & tolerances</h2></div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 260px' }}>
              <label>Expiry alert window (days)</label>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                Default "expiring within" window the Expiry report and Inventory Workspace use when no window is explicitly requested.
              </p>
              <input
                type="number" min="1" step="1" value={form.expiryAlertWindowDays}
                onChange={(e) => setForm((f) => ({ ...f, expiryAlertWindowDays: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: '1 1 260px' }}>
              <label>Stock count variance tolerance (%)</label>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                A completed inventory count line is flagged as materially significant once |variance| exceeds this percentage of system quantity.
              </p>
              <input
                type="number" min="0" max="100" step="0.01" value={form.stockCountVarianceTolerancePct}
                onChange={(e) => setForm((f) => ({ ...f, stockCountVarianceTolerancePct: e.target.value }))}
              />
            </div>
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

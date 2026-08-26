import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';

export default function InventoryCounts() {
  const [counts, setCounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeCount, setActiveCount] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/inventory-counts'), api.get('/warehouses')])
      .then(([c, w]) => {
        setCounts(c.data);
        setWarehouses(w.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openCount(id) {
    const { data } = await api.get(`/inventory-counts/${id}`);
    setActiveCount(data);
  }

  if (activeCount) {
    return (
      <CountDetail
        count={activeCount}
        onBack={() => {
          setActiveCount(null);
          load();
        }}
        onRefresh={() => openCount(activeCount.id)}
      />
    );
  }

  return (
    <DashboardLayout title="Inventory Count">
      <div className="card">
        <div className="card-header">
          <h2>Physical stock takes</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowNewModal(true)}>
            + New count
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Count #</th>
                <th>Warehouse</th>
                <th>Items</th>
                <th>Status</th>
                <th>Started by</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id}>
                  <td>{c.count_no}</td>
                  <td>{c.warehouse_name}</td>
                  <td>{c.line_count}</td>
                  <td>
                    <span className={`badge ${c.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{c.status}</span>
                  </td>
                  <td>{c.first_name ? `${c.first_name} ${c.last_name}` : '—'}</td>
                  <td>{new Date(c.count_date).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openCount(c.id)}>
                      {c.status === 'draft' ? 'Continue' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No inventory counts yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showNewModal && (
        <NewCountModal
          warehouses={warehouses}
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            openCount(id);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function NewCountModal({ warehouses, onClose, onCreated }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/inventory-counts', { warehouseId, notes });
      onCreated(data.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start count');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Start a physical count</h2>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          This snapshots the current system quantity for every active product in the chosen warehouse —
          one line per batch for batch-tracked products, so counts reconcile at the batch level.
          You'll enter what you actually counted on the next screen.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Monthly count — July" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Starting...' : 'Start count'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CountDetail({ count, onBack, onRefresh }) {
  const [editing, setEditing] = useState({});
  const [completing, setCompleting] = useState(false);
  const isDraft = count.status === 'draft';
  const confirm = useConfirm();

  async function saveLine(lineId) {
    const countedQuantity = editing[lineId];
    if (countedQuantity === undefined || countedQuantity === '') return;
    await api.patch(`/inventory-counts/${count.id}/lines/${lineId}`, { countedQuantity: Number(countedQuantity) });
    onRefresh();
  }

  async function handleComplete() {
    const ok = await confirm('Complete this count? Any variances will be applied as stock adjustments immediately.', { confirmLabel: 'Complete count' });
    if (!ok) return;
    setCompleting(true);
    try {
      await api.post(`/inventory-counts/${count.id}/complete`);
      onRefresh();
    } finally {
      setCompleting(false);
    }
  }

  return (
    <DashboardLayout title={`Inventory Count — ${count.count_no}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>
        ← Back to counts
      </button>

      <div className="card">
        <div className="card-header">
          <h2>{count.warehouse_name} — <span className={`badge ${count.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{count.status}</span></h2>
          {isDraft && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleComplete} disabled={completing}>
              {completing ? 'Completing...' : 'Complete count'}
            </button>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Batch</th>
              <th>System qty</th>
              <th>Counted qty</th>
              <th>Variance</th>
              {isDraft && <th></th>}
            </tr>
          </thead>
          <tbody>
            {count.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.sku}</td>
                <td>{line.product_name}</td>
                <td>{line.batch_no || '—'}</td>
                <td>{Number(line.system_quantity).toLocaleString()} {line.uom_symbol}</td>
                <td>
                  {isDraft ? (
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: 90, padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                      defaultValue={line.counted_quantity ?? ''}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    />
                  ) : (
                    line.counted_quantity ?? '—'
                  )}
                </td>
                <td>
                  {line.variance !== null && line.variance !== undefined && (
                    <span className={`badge ${Number(line.variance) === 0 ? 'badge-neutral' : Number(line.variance) < 0 ? 'badge-danger' : 'badge-success'}`}>
                      {Number(line.variance) > 0 ? '+' : ''}{line.variance}
                    </span>
                  )}
                </td>
                {isDraft && (
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => saveLine(line.id)}>Save</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

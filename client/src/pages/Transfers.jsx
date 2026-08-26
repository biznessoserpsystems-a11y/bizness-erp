import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get('/transfers'), api.get('/products'), api.get('/warehouses')])
      .then(([t, p, w]) => {
        setTransfers(t.data);
        setProducts(p.data);
        setWarehouses(w.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Stock Transfers">
      <div className="card">
        <div className="card-header">
          <h2>Warehouse-to-warehouse transfers</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
            + New transfer
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>From</th>
                <th>To</th>
                <th>Items</th>
                <th>Status</th>
                <th>By</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td>{t.transfer_no}</td>
                  <td>{t.from_warehouse_name}</td>
                  <td>{t.to_warehouse_name}</td>
                  <td>{t.lines.map((l) => `${l.productName} (${l.quantity})`).join(', ')}</td>
                  <td><span className="badge badge-success">{t.status}</span></td>
                  <td>{t.first_name ? `${t.first_name} ${t.last_name}` : '—'}</td>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No transfers yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <TransferModal
          products={products}
          warehouses={warehouses}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function TransferModal({ products, warehouses, onClose, onSaved }) {
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ productId: '', quantity: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: '' }]);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/transfers', {
        fromWarehouseId,
        toWarehouseId,
        notes,
        lines: lines
          .filter((l) => l.productId && l.quantity)
          .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New stock transfer</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>From warehouse</label>
            <select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>To warehouse</label>
            <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.filter((w) => w.id !== fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Items</label>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select
                value={line.productId}
                onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                style={{ flex: 2, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}
                required
              >
                <option value="">Select product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8 }}
                required
              />
              {lines.length > 1 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeLine(idx)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>
            + Add item
          </button>

          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Transferring...' : 'Complete transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

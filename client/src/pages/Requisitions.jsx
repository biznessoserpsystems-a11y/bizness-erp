import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import useProcurementControls from '../hooks/useProcurementControls';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

const STATUS_BADGE = { draft: 'badge-neutral', submitted: 'badge-neutral', approved: 'badge-success', rejected: 'badge-danger', converted: 'badge-success' };

export default function Requisitions() {
  const [requisitions, setRequisitions] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRequisition, setEditRequisition] = useState(null);
  const { canEdit, canDelete } = useProcurementControls();
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/requisitions'), api.get('/products'), api.get('/warehouses')])
      .then(([r, p, w]) => { setRequisitions(r.data); setProducts(p.data); setWarehouses(w.data); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateStatus(id, status) {
    await api.patch(`/requisitions/${id}/status`, { status });
    load();
  }

  async function openEdit(id) {
    try {
      const { data } = await api.get(`/requisitions/${id}`);
      setEditRequisition(data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load requisition', 'error');
    }
  }

  async function handleDelete(r) {
    const ok = await confirm(`Delete requisition ${r.requisition_no}? This cannot be undone.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/requisitions/${r.id}`);
      showToast('Requisition deleted.', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete requisition', 'error');
    }
  }

  return (
    <DashboardLayout title="Purchase Requisitions">
      <div className="card">
        <div className="card-header">
          <h2>Requisitions</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New requisition</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Requisition #</th><th>Warehouse</th><th>Requested by</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {requisitions.map((r) => (
                <tr key={r.id}>
                  <td>{r.requisition_no}</td>
                  <td>{r.warehouse_name}</td>
                  <td>{r.first_name ? `${r.first_name} ${r.last_name}` : '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    {r.status === 'submitted' && (
                      <>
                        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => updateStatus(r.id, 'approved')}>Approve</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => updateStatus(r.id, 'rejected')}>Reject</button>
                      </>
                    )}
                    {canEdit && ['draft', 'submitted', 'rejected'].includes(r.status) && (
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => openEdit(r.id)}>Edit</button>
                    )}
                    {canDelete && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6, color: 'var(--color-danger, #B3261E)' }} onClick={() => handleDelete(r)}>Delete</button>}
                  </td>
                </tr>
              ))}
              {requisitions.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No requisitions yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {(showModal || editRequisition) && (
        <RequisitionModal
          products={products} warehouses={warehouses} existing={editRequisition}
          onClose={() => { setShowModal(false); setEditRequisition(null); }}
          onSaved={() => { setShowModal(false); setEditRequisition(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function RequisitionModal({ products, warehouses, existing, onClose, onSaved }) {
  const [warehouseId, setWarehouseId] = useState(existing?.warehouse_id || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [lines, setLines] = useState(existing?.lines?.length ? existing.lines.map((l) => ({ productId: l.product_id, quantity: Number(l.quantity) })) : [{ productId: '', quantity: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { productId: '', quantity: '' }]); }
  function removeLine(idx) { setLines((prev) => prev.filter((_, i) => i !== idx)); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body = {
        warehouseId, notes,
        lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      };
      if (existing) await api.put(`/requisitions/${existing.id}`, body);
      else await api.post('/requisitions', body);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || (existing ? 'Failed to update requisition' : 'Failed to create requisition'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>{existing ? `Edit requisition ${existing.requisition_no}` : 'New purchase requisition'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Destination warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Items needed</label>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={line.productId} onChange={(e) => updateLine(idx, 'productId', e.target.value)} style={{ flex: 2, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required>
                <option value="">Select product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required />
              {lines.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeLine(idx)}>✕</button>}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>+ Add item</button>

          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : existing ? 'Save changes' : 'Submit requisition'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

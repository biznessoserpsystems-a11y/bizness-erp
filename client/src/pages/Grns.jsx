import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import SimpleEditModal from '../components/SimpleEditModal';
import useProcurementControls from '../hooks/useProcurementControls';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

export default function Grns() {
  const [grns, setGrns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editGrn, setEditGrn] = useState(null);
  const { canEdit, canDelete } = useProcurementControls();
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/grns'), api.get('/purchase-orders')])
      .then(([g, o]) => {
        setGrns(g.data);
        setOrders(o.data.filter((order) => ['confirmed', 'partially_received'].includes(order.status)));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(g) {
    const ok = await confirm(`Delete ${g.grn_no}? The received stock is taken back out of the warehouse and its ledger entry is reversed. This cannot be undone.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/grns/${g.id}`);
      showToast('Goods received note deleted.', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete goods received note', 'error');
    }
  }

  const showActions = canEdit || canDelete;

  return (
    <DashboardLayout title="Goods Received Notes">
      <div className="card">
        <div className="card-header">
          <h2>Received deliveries</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New GRN</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>GRN #</th><th>Order #</th><th>Supplier</th><th>Warehouse</th><th>Items</th><th>Date</th>{showActions && <th></th>}</tr></thead>
            <tbody>
              {grns.map((g) => (
                <tr key={g.id}>
                  <td>{g.grn_no}</td>
                  <td>{g.order_no || '—'}</td>
                  <td>{g.supplier_name}</td>
                  <td>{g.warehouse_name}</td>
                  <td>{g.lines.map((l) => `${l.productName} (${l.quantity})`).join(', ')}</td>
                  <td>{new Date(g.created_at).toLocaleString()}</td>
                  {showActions && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEditGrn(g)}>Edit note</button>}
                      {canDelete && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6, color: 'var(--color-danger, #B3261E)' }} onClick={() => handleDelete(g)}>Delete</button>}
                    </td>
                  )}
                </tr>
              ))}
              {grns.length === 0 && <tr><td colSpan={showActions ? 7 : 6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No goods received yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <GrnModal orders={orders} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}

      {editGrn && (
        <SimpleEditModal
          title={`Edit ${editGrn.grn_no}`}
          hint="Quantities and costs posted stock and ledger entries, so they can't be edited here. To correct them, delete this note and receive the goods again."
          fields={[{ key: 'notes', label: 'Notes', type: 'textarea' }]}
          initial={{ notes: editGrn.notes }}
          onSave={async (v) => { await api.put(`/grns/${editGrn.id}`, { notes: v.notes }); setEditGrn(null); load(); showToast('Goods received note updated.', 'success'); }}
          onClose={() => setEditGrn(null)}
        />
      )}
    </DashboardLayout>
  );
}

function GrnModal({ orders, onClose, onSaved }) {
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);
  const [lines, setLines] = useState({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function selectOrder(id) {
    setPurchaseOrderId(id);
    setLines({});
    if (!id) { setOrderDetail(null); return; }
    const { data } = await api.get(`/purchase-orders/${id}`);
    setOrderDetail(data);
  }

  function updateLine(lineId, field, value) {
    setLines((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const payloadLines = Object.entries(lines)
      .filter(([, v]) => v.quantity && Number(v.quantity) > 0)
      .map(([purchaseOrderLineId, v]) => ({
        purchaseOrderLineId, quantity: Number(v.quantity), unitCost: v.unitCost ? Number(v.unitCost) : undefined,
        batchNo: v.batchNo || undefined, expiryDate: v.expiryDate || undefined,
      }));
    if (!payloadLines.length) { setError('Enter a quantity for at least one line'); return; }

    setSubmitting(true);
    try {
      await api.post('/grns', { purchaseOrderId, notes, lines: payloadLines });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record goods received');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <h2>New goods received note</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Purchase order</label>
            <select value={purchaseOrderId} onChange={(e) => selectOrder(e.target.value)} required>
              <option value="">Select a confirmed order</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_no} — {o.supplier_name}</option>)}
            </select>
          </div>

          {orderDetail && (
            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Product</th><th>Remaining</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 90 }}>Unit cost</th>
                  {orderDetail.lines.some((l) => l.is_batch_tracked) && <th style={{ width: 100 }}>Batch #</th>}
                </tr>
              </thead>
              <tbody>
                {orderDetail.lines.map((l) => {
                  const remaining = Number(l.quantity) - Number(l.received_quantity);
                  if (remaining <= 0) return null;
                  return (
                    <tr key={l.id}>
                      <td>{l.product_name}</td>
                      <td>{remaining} {l.uom_symbol}</td>
                      <td><input type="number" step="0.01" max={remaining} value={lines[l.id]?.quantity || ''} onChange={(e) => updateLine(l.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                      <td><input type="number" step="0.01" placeholder={l.unit_price} value={lines[l.id]?.unitCost || ''} onChange={(e) => updateLine(l.id, 'unitCost', e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                      {l.is_batch_tracked && (
                        <td><input value={lines[l.id]?.batchNo || ''} onChange={(e) => updateLine(l.id, 'batchNo', e.target.value)} placeholder="LOT-..." style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !orderDetail}>{submitting ? 'Recording...' : 'Record receipt'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

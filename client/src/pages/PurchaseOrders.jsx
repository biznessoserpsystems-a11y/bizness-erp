import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor';
import AttachmentsPanel from '../components/AttachmentsPanel';

const STATUS_BADGE = {
  pending: 'badge-neutral', confirmed: 'badge-neutral', partially_received: 'badge-neutral',
  received: 'badge-success', invoiced: 'badge-success', cancelled: 'badge-danger',
};

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/purchase-orders'), api.get('/suppliers'), api.get('/products'), api.get('/warehouses')])
      .then(([o, s, p, w]) => { setOrders(o.data); setSuppliers(s.data); setProducts(p.data); setWarehouses(w.data); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(id) {
    const { data } = await api.get(`/purchase-orders/${id}`);
    setDetailOrder(data);
  }

  async function updateStatus(id, status) {
    await api.patch(`/purchase-orders/${id}/status`, { status });
    load();
    if (detailOrder?.id === id) openDetail(id);
  }

  if (detailOrder) {
    return <OrderDetail order={detailOrder} onBack={() => { setDetailOrder(null); load(); }} onUpdateStatus={updateStatus} />;
  }

  return (
    <DashboardLayout title="Purchase Orders">
      <div className="card">
        <div className="card-header">
          <h2>Purchase orders</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New order</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Order #</th><th>Supplier</th><th>Warehouse</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.order_no}</td>
                  <td>{o.supplier_name}</td>
                  <td>{o.warehouse_name}</td>
                  <td>{new Date(o.order_date).toLocaleDateString()}</td>
                  <td>GHS {Number(o.total_amount).toFixed(2)}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status.replace('_', ' ')}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(o.id)}>View</button></td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No purchase orders yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <OrderModal suppliers={suppliers} products={products} warehouses={warehouses} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </DashboardLayout>
  );
}

function OrderModal({ suppliers, products, warehouses, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/purchase-orders', {
        supplierId, warehouseId, expectedDate: expectedDate || undefined, notes,
        lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({
          productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || 0, taxPercent: Number(l.taxPercent) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <h2>New purchase order</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Select</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Receiving warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Expected delivery date</label>
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Line items</label>
          <LineItemsEditor lines={lines} setLines={setLines} products={products} priceField="cost_price" />

          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Create order'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrderDetail({ order, onBack, onUpdateStatus }) {
  return (
    <DashboardLayout title={`Purchase Order — ${order.order_no}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to orders</button>

      <div className="card">
        <div className="card-header">
          <h2>{order.supplier_name} <span className={`badge ${STATUS_BADGE[order.status]}`}>{order.status.replace('_', ' ')}</span></h2>
          {order.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => onUpdateStatus(order.id, 'confirmed')}>Confirm order</button>
              <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => onUpdateStatus(order.id, 'cancelled')}>Cancel</button>
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Warehouse: {order.warehouse_name} · Order date: {new Date(order.order_date).toLocaleDateString()}</p>

        <table>
          <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Invoiced</th><th>Unit price</th><th>Line total</th></tr></thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product_name} <span style={{ color: 'var(--color-text-muted)' }}>({l.sku})</span></td>
                <td>{Number(l.quantity).toLocaleString()} {l.uom_symbol}</td>
                <td>{Number(l.received_quantity).toLocaleString()}</td>
                <td>{Number(l.invoiced_quantity).toLocaleString()}</td>
                <td>GHS {Number(l.unit_price).toFixed(2)}</td>
                <td>GHS {Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign: 'right', marginTop: 16, fontSize: 15, fontWeight: 700 }}>Total: GHS {Number(order.total_amount).toFixed(2)}</div>
      </div>

      <div className="card">
        <h2>Attachments</h2>
        <AttachmentsPanel relatedType="purchase_order" relatedId={order.id} />
      </div>
    </DashboardLayout>
  );
}

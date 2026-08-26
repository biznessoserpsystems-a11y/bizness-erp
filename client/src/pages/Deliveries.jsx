import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get('/deliveries'), api.get('/sales-orders')])
      .then(([d, o]) => {
        setDeliveries(d.data);
        setOrders(o.data.filter((order) => ['confirmed', 'partially_delivered'].includes(order.status)));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Delivery Notes">
      <div className="card">
        <div className="card-header">
          <h2>Dispatched deliveries</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New delivery</button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Delivery #</th><th>Order #</th><th>Customer</th><th>Warehouse</th><th>Items</th><th>Date</th></tr></thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{d.delivery_no}</td>
                  <td>{d.order_no || '—'}</td>
                  <td>{d.customer_name}</td>
                  <td>{d.warehouse_name}</td>
                  <td>{d.lines.map((l) => `${l.productName} (${l.quantity})`).join(', ')}</td>
                  <td>{new Date(d.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {deliveries.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No deliveries yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <DeliveryModal
          orders={orders}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function DeliveryModal({ orders, onClose, onSaved }) {
  const [salesOrderId, setSalesOrderId] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function selectOrder(id) {
    setSalesOrderId(id);
    setQuantities({});
    if (!id) { setOrderDetail(null); return; }
    const { data } = await api.get(`/sales-orders/${id}`);
    setOrderDetail(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const lines = Object.entries(quantities)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([salesOrderLineId, qty]) => ({ salesOrderLineId, quantity: Number(qty) }));
    if (!lines.length) { setError('Enter a quantity for at least one line'); return; }

    setSubmitting(true);
    try {
      await api.post('/deliveries', { salesOrderId, notes, lines });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create delivery');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>New delivery note</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Sales order</label>
            <select value={salesOrderId} onChange={(e) => selectOrder(e.target.value)} required>
              <option value="">Select a confirmed order</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_no} — {o.customer_name}</option>)}
            </select>
          </div>

          {orderDetail && (
            <table style={{ marginBottom: 16 }}>
              <thead><tr><th>Product</th><th>Remaining</th><th style={{ width: 100 }}>Deliver qty</th></tr></thead>
              <tbody>
                {orderDetail.lines.map((l) => {
                  const remaining = Number(l.quantity) - Number(l.delivered_quantity);
                  if (remaining <= 0) return null;
                  return (
                    <tr key={l.id}>
                      <td>{l.product_name}</td>
                      <td>{remaining} {l.uom_symbol}</td>
                      <td>
                        <input
                          type="number" step="0.01" max={remaining}
                          value={quantities[l.id] || ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !orderDetail}>
              {submitting ? 'Dispatching...' : 'Dispatch delivery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor';
import { BarChartWidget, PieChartWidget, formatMoney } from '../components/charts';
import AttachmentsPanel from '../components/AttachmentsPanel';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

const STATUS_BADGE = {
  draft: 'badge-neutral', issued: 'badge-neutral', partially_paid: 'badge-danger',
  paid: 'badge-success', overdue: 'badge-danger', void: 'badge-neutral',
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/invoices'), api.get('/customers'), api.get('/products'), api.get('/sales-orders')])
      .then(([i, c, p, o]) => {
        setInvoices(i.data);
        setCustomers(c.data);
        setProducts(p.data);
        setOrders(o.data.filter((ord) => ['confirmed', 'partially_delivered', 'delivered'].includes(ord.status)));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(id) {
    const { data } = await api.get(`/invoices/${id}`);
    setDetailInvoice(data);
  }

  async function handleVoid(id) {
    const ok = await confirm('Void this invoice? This only works if no payments have been applied.', { danger: true, confirmLabel: 'Void invoice' });
    if (!ok) return;
    try {
      await api.patch(`/invoices/${id}/void`);
      load();
      setDetailInvoice(null);
      showToast('Invoice voided.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to void invoice', 'error');
    }
  }

  if (detailInvoice) {
    return <InvoiceDetail invoice={detailInvoice} onBack={() => { setDetailInvoice(null); load(); }} onVoid={handleVoid} />;
  }

  return (
    <DashboardLayout title="Sales Invoices">
      {!loading && invoices.length > 0 && (
        <div className="chart-grid">
          <BarChartWidget
            title="Revenue by customer"
            data={Object.values(
              invoices.reduce((acc, i) => {
                acc[i.customer_name] = acc[i.customer_name] || { name: i.customer_name, revenue: 0 };
                acc[i.customer_name].revenue += Number(i.total_amount);
                return acc;
              }, {})
            ).sort((a, b) => b.revenue - a.revenue).slice(0, 8)}
            bars={[{ key: 'revenue', label: 'Revenue' }]}
            colorByCategory
            horizontal
            valueFormatter={(v) => formatMoney(v)}
          />
          <PieChartWidget
            title="Invoices by status"
            data={Object.values(
              invoices.reduce((acc, i) => {
                const key = i.status.replace('_', ' ');
                acc[key] = acc[key] || { name: key, value: 0 };
                acc[key].value += 1;
                return acc;
              }, {})
            )}
            valueFormatter={(v) => `${v} invoice${v === 1 ? '' : 's'}`}
          />
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <h2>Invoices</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New invoice</button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoice_no}</td>
                  <td>{i.customer_name}</td>
                  <td>{new Date(i.invoice_date).toLocaleDateString()}</td>
                  <td>{i.due_date ? new Date(i.due_date).toLocaleDateString() : '—'}</td>
                  <td>GHS {Number(i.total_amount).toFixed(2)}</td>
                  <td>GHS {Number(i.balance_due).toFixed(2)}</td>
                  <td><span className={`badge ${STATUS_BADGE[i.status]}`}>{i.status.replace('_', ' ')}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(i.id)}>View</button></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No invoices yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <InvoiceModal
          customers={customers}
          products={products}
          orders={orders}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function InvoiceModal({ customers, products, orders, onClose, onSaved }) {
  const [mode, setMode] = useState('standalone'); // 'standalone' | 'fromOrder'
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([emptyLine()]);

  const [salesOrderId, setSalesOrderId] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);
  const [orderQuantities, setOrderQuantities] = useState({});

  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function selectOrder(id) {
    setSalesOrderId(id);
    setOrderQuantities({});
    if (!id) { setOrderDetail(null); return; }
    const { data } = await api.get(`/sales-orders/${id}`);
    setOrderDetail(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setWarning('');
    setSubmitting(true);
    try {
      let payload;
      if (mode === 'fromOrder') {
        const invoiceLines = orderDetail.lines
          .filter((l) => orderQuantities[l.id] && Number(orderQuantities[l.id]) > 0)
          .map((l) => ({
            salesOrderLineId: l.id, productId: l.product_id, quantity: Number(orderQuantities[l.id]),
            unitPrice: Number(l.unit_price), discountPercent: 0, taxPercent: 0,
          }));
        if (!invoiceLines.length) throw new Error('Enter a quantity for at least one line');
        payload = { customerId: orderDetail.customer_id, salesOrderId, lines: invoiceLines, notes };
      } else {
        payload = {
          customerId, notes,
          lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({
            productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
            discountPercent: Number(l.discountPercent) || 0, taxPercent: Number(l.taxPercent) || 0,
          })),
        };
      }
      const { data } = await api.post('/invoices', payload);
      if (data.creditWarning) setWarning(data.creditWarning);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <h2>New invoice</h2>
        {error && <div className="error-banner">{error}</div>}
        {warning && <div className="error-banner" style={{ background: '#FBF1DE', color: '#8A5B08', borderColor: '#EEDBAE' }}>{warning}</div>}

        <div className="toolbar">
          <button type="button" className={mode === 'standalone' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setMode('standalone')}>Standalone</button>
          <button type="button" className={mode === 'fromOrder' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setMode('fromOrder')}>From sales order</button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'standalone' ? (
            <>
              <div className="form-group">
                <label>Customer</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                  <option value="">Select</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Line items</label>
              <LineItemsEditor lines={lines} setLines={setLines} products={products} />
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Sales order</label>
                <select value={salesOrderId} onChange={(e) => selectOrder(e.target.value)} required>
                  <option value="">Select an order</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.order_no} — {o.customer_name}</option>)}
                </select>
              </div>
              {orderDetail && (
                <table style={{ marginBottom: 16 }}>
                  <thead><tr><th>Product</th><th>Remaining to invoice</th><th style={{ width: 100 }}>Qty</th></tr></thead>
                  <tbody>
                    {orderDetail.lines.map((l) => {
                      const remaining = Number(l.quantity) - Number(l.invoiced_quantity);
                      if (remaining <= 0) return null;
                      return (
                        <tr key={l.id}>
                          <td>{l.product_name}</td>
                          <td>{remaining} {l.uom_symbol}</td>
                          <td>
                            <input
                              type="number" step="0.01" max={remaining}
                              value={orderQuantities[l.id] || ''}
                              onChange={(e) => setOrderQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))}
                              style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Create invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InvoiceDetail({ invoice, onBack, onVoid }) {
  return (
    <DashboardLayout title={`Invoice — ${invoice.invoice_no}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to invoices</button>

      <div className="card">
        <div className="card-header">
          <h2>{invoice.customer_name} <span className={`badge ${STATUS_BADGE[invoice.status]}`}>{invoice.status.replace('_', ' ')}</span></h2>
          {invoice.status === 'issued' && Number(invoice.amount_paid) === 0 && (
            <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => onVoid(invoice.id)}>Void invoice</button>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Date: {new Date(invoice.invoice_date).toLocaleDateString()} · Due: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
        </p>

        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Disc %</th><th>Tax %</th><th>Line total</th></tr></thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product_name}</td>
                <td>{Number(l.quantity).toLocaleString()} {l.uom_symbol}</td>
                <td>GHS {Number(l.unit_price).toFixed(2)}</td>
                <td>{l.discount_percent}%</td>
                <td>{l.tax_percent}%</td>
                <td>GHS {Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ background: '#F7F4EC', borderRadius: 8, padding: 12, fontSize: 14, marginTop: 16, maxWidth: 300, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>GHS {Number(invoice.subtotal).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>-GHS {Number(invoice.discount_amount).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>GHS {Number(invoice.tax_amount).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Total</span><span>GHS {Number(invoice.total_amount).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}><span>Paid</span><span>GHS {Number(invoice.amount_paid).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}><span>Credited</span><span>GHS {Number(invoice.amount_credited).toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 6, marginTop: 6 }}><span>Balance due</span><span>GHS {Number(invoice.balance_due).toFixed(2)}</span></div>
        </div>
      </div>

      {invoice.payments.length > 0 && (
        <div className="card">
          <h2>Payments applied</h2>
          <table>
            <thead><tr><th>Receipt #</th><th>Date</th><th>Method</th><th>Amount allocated</th></tr></thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_no}</td>
                  <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td>{p.payment_method}</td>
                  <td>GHS {Number(p.amount_allocated).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Attachments</h2>
        <AttachmentsPanel relatedType="invoice" relatedId={invoice.id} />
      </div>
    </DashboardLayout>
  );
}

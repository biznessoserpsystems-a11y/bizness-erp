import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

const METHODS = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get('/payments'), api.get('/customers')])
      .then(([p, c]) => {
        setPayments(p.data);
        setCustomers(c.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Customer Payments">
      <div className="card">
        <div className="card-header">
          <h2>Receipts</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Record payment</button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Receipt #</th><th>Customer</th><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th>Unallocated</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_no}</td>
                  <td>{p.customer_name}</td>
                  <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td>{p.payment_method.replace('_', ' ')}</td>
                  <td>{p.reference || '—'}</td>
                  <td>GHS {Number(p.amount).toFixed(2)}</td>
                  <td>
                    {Number(p.unallocated_amount) > 0 ? (
                      <span className="badge badge-danger">GHS {Number(p.unallocated_amount).toFixed(2)}</span>
                    ) : (
                      <span className="badge badge-success">Fully allocated</span>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No payments recorded yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <PaymentModal
          customers={customers}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function PaymentModal({ customers, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function selectCustomer(id) {
    setCustomerId(id);
    setAllocations({});
    if (!id) { setInvoices([]); return; }
    const { data } = await api.get(`/customers/${id}/ledger`);
    setInvoices(data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void' && Number(i.balance) > 0));
  }

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (totalAllocated > Number(amount) + 0.01) {
      setError('Allocated amount cannot exceed the payment amount');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/payments', {
        customerId, amount: Number(amount), paymentMethod, reference,
        allocations: Object.entries(allocations)
          .filter(([, amt]) => amt && Number(amt) > 0)
          .map(([salesInvoiceId, amt]) => ({ salesInvoiceId, amount: Number(amt) })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>Record customer payment</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Customer</label>
            <select value={customerId} onChange={(e) => selectCustomer(e.target.value)} required>
              <option value="">Select</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Amount received (GHS)</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Payment method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reference (transaction ID, cheque #, etc.)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          {invoices.length > 0 && (
            <div className="form-group">
              <label>Allocate to outstanding invoices (optional — leftover stays as credit on account)</label>
              <table>
                <thead><tr><th>Invoice #</th><th>Balance</th><th style={{ width: 110 }}>Allocate</th></tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.invoice_no}</td>
                      <td>GHS {Number(inv.balance).toFixed(2)}</td>
                      <td>
                        <input
                          type="number" step="0.01" max={inv.balance}
                          value={allocations[inv.id] || ''}
                          onChange={(e) => setAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                Allocated: GHS {totalAllocated.toFixed(2)} of GHS {(Number(amount) || 0).toFixed(2)}
              </p>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

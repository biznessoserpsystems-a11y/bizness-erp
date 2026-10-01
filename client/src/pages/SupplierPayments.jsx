import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import SimpleEditModal from '../components/SimpleEditModal';
import useProcurementControls from '../hooks/useProcurementControls';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

const METHODS = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'card'];

export default function SupplierPayments() {
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const { canEdit, canDelete } = useProcurementControls();
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/supplier-payments'), api.get('/suppliers')])
      .then(([p, s]) => { setPayments(p.data); setSuppliers(s.data); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(p) {
    const ok = await confirm(`Delete payment ${p.payment_no}? The invoices it paid are re-opened and its ledger entry is reversed. This cannot be undone.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/supplier-payments/${p.id}`);
      showToast('Payment deleted.', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete payment', 'error');
    }
  }

  const showActions = canEdit || canDelete;

  return (
    <DashboardLayout title="Supplier Payments" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Payment' }]}>
      <div className="card">
        <div className="card-header">
          <h2>Payments made</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Record payment</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Payment #</th><th>Supplier</th><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th>Unallocated</th>{showActions && <th></th>}</tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_no}</td>
                  <td>{p.supplier_name}</td>
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
                  {showActions && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEditPayment(p)}>Edit</button>}
                      {canDelete && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6, color: 'var(--color-danger, #B3261E)' }} onClick={() => handleDelete(p)}>Delete</button>}
                    </td>
                  )}
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={showActions ? 8 : 7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No payments recorded yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <PaymentModal suppliers={suppliers} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}

      {editPayment && (
        <SimpleEditModal
          title={`Edit ${editPayment.payment_no}`}
          hint="The amount posted to the ledger, so it can't be edited here. To correct it, delete this payment and record it again."
          fields={[
            { key: 'paymentMethod', label: 'Payment method', type: 'select', options: METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') })) },
            { key: 'reference', label: 'Reference' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ]}
          initial={{ paymentMethod: editPayment.payment_method, reference: editPayment.reference, notes: editPayment.notes }}
          onSave={async (v) => { await api.put(`/supplier-payments/${editPayment.id}`, { paymentMethod: v.paymentMethod, reference: v.reference, notes: v.notes }); setEditPayment(null); load(); showToast('Payment updated.', 'success'); }}
          onClose={() => setEditPayment(null)}
        />
      )}
    </DashboardLayout>
  );
}

function PaymentModal({ suppliers, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function selectSupplier(id) {
    setSupplierId(id);
    setAllocations({});
    if (!id) { setInvoices([]); return; }
    const { data } = await api.get(`/suppliers/${id}/ledger`);
    setInvoices(data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void' && Number(i.balance) > 0));
  }

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (totalAllocated > Number(amount) + 0.01) { setError('Allocated amount cannot exceed the payment amount'); return; }
    setSubmitting(true);
    try {
      await api.post('/supplier-payments', {
        supplierId, amount: Number(amount), paymentMethod, reference,
        allocations: Object.entries(allocations).filter(([, amt]) => amt && Number(amt) > 0).map(([purchaseInvoiceId, amt]) => ({ purchaseInvoiceId, amount: Number(amt) })),
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
        <h2>Record supplier payment</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Supplier</label>
            <select value={supplierId} onChange={(e) => selectSupplier(e.target.value)} required>
              <option value="">Select</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Amount paid (GHS)</label><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
          <div className="form-group">
            <label>Payment method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Reference</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div>

          {invoices.length > 0 && (
            <div className="form-group">
              <label>Allocate to outstanding invoices</label>
              <table>
                <thead><tr><th>Invoice #</th><th>Balance</th><th style={{ width: 110 }}>Allocate</th></tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.invoice_no}</td>
                      <td>GHS {Number(inv.balance).toFixed(2)}</td>
                      <td><input type="number" step="0.01" max={inv.balance} value={allocations[inv.id] || ''} onChange={(e) => setAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>Allocated: GHS {totalAllocated.toFixed(2)} of GHS {(Number(amount) || 0).toFixed(2)}</p>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Record payment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

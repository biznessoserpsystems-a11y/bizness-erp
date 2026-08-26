import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor';

export default function Returns() {
  const [tab, setTab] = useState('returns');
  const [returns, setReturns] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [applyTarget, setApplyTarget] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/returns'), api.get('/credit-notes'), api.get('/customers'), api.get('/products'), api.get('/warehouses')])
      .then(([r, cn, c, p, w]) => {
        setReturns(r.data);
        setCreditNotes(cn.data);
        setCustomers(c.data);
        setProducts(p.data);
        setWarehouses(w.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Sales Returns & Credit Notes">
      <div className="toolbar">
        <button className={tab === 'returns' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab('returns')}>Returns</button>
        <button className={tab === 'credit-notes' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab('credit-notes')}>Credit Notes</button>
      </div>

      {tab === 'returns' && (
        <div className="card">
          <div className="card-header">
            <h2>Customer returns</h2>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New return</button>
          </div>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead><tr><th>Return #</th><th>Customer</th><th>Invoice</th><th>Reason</th><th>Total</th><th>Date</th></tr></thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id}>
                    <td>{r.return_no}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.invoice_no || '—'}</td>
                    <td>{r.reason}</td>
                    <td>GHS {Number(r.total_amount).toFixed(2)}</td>
                    <td>{new Date(r.return_date).toLocaleDateString()}</td>
                  </tr>
                ))}
                {returns.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No returns yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'credit-notes' && (
        <div className="card">
          <h2>Credit notes</h2>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead><tr><th>Credit note #</th><th>Customer</th><th>Related invoice</th><th>Amount</th><th>Unapplied</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {creditNotes.map((cn) => (
                  <tr key={cn.id}>
                    <td>{cn.credit_note_no}</td>
                    <td>{cn.customer_name}</td>
                    <td>{cn.invoice_no || '—'}</td>
                    <td>GHS {Number(cn.amount).toFixed(2)}</td>
                    <td>GHS {Number(cn.unapplied_amount).toFixed(2)}</td>
                    <td><span className={`badge ${cn.status === 'applied' ? 'badge-success' : 'badge-neutral'}`}>{cn.status}</span></td>
                    <td>
                      {cn.status === 'open' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setApplyTarget(cn)}>Apply to invoice</button>
                      )}
                    </td>
                  </tr>
                ))}
                {creditNotes.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No credit notes yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <ReturnModal
          customers={customers}
          products={products}
          warehouses={warehouses}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {applyTarget && (
        <ApplyCreditNoteModal
          creditNote={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={() => { setApplyTarget(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function ReturnModal({ customers, products, warehouses, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [salesInvoiceId, setSalesInvoiceId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([{ ...emptyLine(), discountPercent: undefined }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function selectCustomer(id) {
    setCustomerId(id);
    setSalesInvoiceId('');
    if (!id) { setInvoices([]); return; }
    const { data } = await api.get(`/customers/${id}/ledger`);
    setInvoices(data.invoices);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/returns', {
        customerId, salesInvoiceId: salesInvoiceId || undefined, warehouseId, reason,
        lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({
          productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxPercent: Number(l.taxPercent) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process return');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <h2>New sales return</h2>
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
            <label>Related invoice (optional)</label>
            <select value={salesInvoiceId} onChange={(e) => setSalesInvoiceId(e.target.value)}>
              <option value="">None</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_no}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Return to warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Damaged, wrong item, customer changed mind" />
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Returned items</label>
          <LineItemsEditor lines={lines} setLines={setLines} products={products} />

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Processing...' : 'Process return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApplyCreditNoteModal({ creditNote, onClose, onApplied }) {
  const [invoices, setInvoices] = useState([]);
  const [salesInvoiceId, setSalesInvoiceId] = useState('');
  const [amount, setAmount] = useState(creditNote.unapplied_amount);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/customers/${creditNote.customer_id}/ledger`).then(({ data }) => {
      setInvoices(data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void' && Number(i.balance) > 0));
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/credit-notes/${creditNote.id}/apply`, { salesInvoiceId, amount: Number(amount) });
      onApplied();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply credit note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Apply credit note {creditNote.credit_note_no}</h2>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Unapplied balance: GHS {Number(creditNote.unapplied_amount).toFixed(2)}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Apply to invoice</label>
            <select value={salesInvoiceId} onChange={(e) => setSalesInvoiceId(e.target.value)} required>
              <option value="">Select</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_no} — balance GHS {Number(i.balance).toFixed(2)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Amount to apply</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

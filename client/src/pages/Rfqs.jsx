import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';

export default function Rfqs() {
  const [rfqs, setRfqs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailRfq, setDetailRfq] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/rfqs'), api.get('/suppliers'), api.get('/products')])
      .then(([r, s, p]) => { setRfqs(r.data); setSuppliers(s.data); setProducts(p.data); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(id) {
    const { data } = await api.get(`/rfqs/${id}`);
    setDetailRfq(data);
  }

  if (detailRfq) {
    return <RfqDetail rfq={detailRfq} suppliers={suppliers} products={products} onBack={() => { setDetailRfq(null); load(); }} onRefresh={() => openDetail(detailRfq.id)} />;
  }

  return (
    <DashboardLayout title="Requests for Quotation">
      <div className="card">
        <div className="card-header">
          <h2>RFQs</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New RFQ</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>RFQ #</th><th>Invited suppliers</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {rfqs.map((r) => (
                <tr key={r.id}>
                  <td>{r.rfq_no}</td>
                  <td>{r.invited_suppliers.map((s) => s.supplierName).join(', ') || '—'}</td>
                  <td><span className="badge badge-neutral">{r.status}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(r.id)}>View</button></td>
                </tr>
              ))}
              {rfqs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No RFQs yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <RfqModal suppliers={suppliers} products={products} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />
      )}
    </DashboardLayout>
  );
}

function RfqModal({ suppliers, products, onClose, onSaved }) {
  const [supplierIds, setSupplierIds] = useState([]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ productId: '', quantity: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function toggleSupplier(id) {
    setSupplierIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }
  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { productId: '', quantity: '' }]); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/rfqs', {
        supplierIds, notes,
        lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create RFQ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>New RFQ</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Invite suppliers</label>
            <div className="permission-grid" style={{ gridTemplateColumns: '1fr' }}>
              {suppliers.map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={supplierIds.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Items</label>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={line.productId} onChange={(e) => updateLine(idx, 'productId', e.target.value)} style={{ flex: 2, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required>
                <option value="">Select product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required />
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>+ Add item</button>

          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Send RFQ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RfqDetail({ rfq, suppliers, products, onBack, onRefresh }) {
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const confirm = useConfirm();

  async function selectQuotation(id) {
    const ok = await confirm('Select this quotation? Others for this RFQ will be marked rejected.', { confirmLabel: 'Select' });
    if (!ok) return;
    await api.patch(`/supplier-quotations/${id}/select`);
    onRefresh();
  }

  return (
    <DashboardLayout title={`RFQ — ${rfq.rfq_no}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to RFQs</button>

      <div className="card">
        <h2>Requested items</h2>
        <table>
          <thead><tr><th>Product</th><th>Quantity</th></tr></thead>
          <tbody>
            {rfq.lines.map((l) => <tr key={l.id}><td>{l.product_name}</td><td>{l.quantity} {l.uom_symbol}</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Supplier quotations</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowQuoteModal(true)}>+ Record quotation</button>
        </div>
        <table>
          <thead><tr><th>Quote #</th><th>Supplier</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rfq.quotations.map((q) => (
              <tr key={q.id}>
                <td>{q.quotation_no}</td>
                <td>{q.supplier_name}</td>
                <td>{q.lines.map((l) => `${l.productName}: GHS ${Number(l.unitPrice).toFixed(2)} (${l.leadTimeDays}d)`).join(', ')}</td>
                <td><span className={`badge ${q.status === 'selected' ? 'badge-success' : q.status === 'rejected' ? 'badge-danger' : 'badge-neutral'}`}>{q.status}</span></td>
                <td>
                  {q.status === 'received' && (
                    <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => selectQuotation(q.id)}>Select</button>
                  )}
                </td>
              </tr>
            ))}
            {rfq.quotations.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No quotations recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {showQuoteModal && (
        <QuotationModal rfq={rfq} onClose={() => setShowQuoteModal(false)} onSaved={() => { setShowQuoteModal(false); onRefresh(); }} />
      )}
    </DashboardLayout>
  );
}

function QuotationModal({ rfq, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState('');
  const [prices, setPrices] = useState({});
  const [leadTimes, setLeadTimes] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/rfqs/${rfq.id}/quotations`, {
        supplierId,
        lines: rfq.lines.map((l) => ({
          productId: l.product_id, quantity: l.quantity,
          unitPrice: Number(prices[l.id] || 0), leadTimeDays: Number(leadTimes[l.id] || 0),
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record quotation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>Record supplier quotation</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Select</option>
              {rfq.suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
            </select>
          </div>

          <table style={{ marginBottom: 16 }}>
            <thead><tr><th>Product</th><th>Qty</th><th style={{ width: 100 }}>Unit price</th><th style={{ width: 100 }}>Lead time (days)</th></tr></thead>
            <tbody>
              {rfq.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.product_name}</td>
                  <td>{l.quantity}</td>
                  <td><input type="number" step="0.01" value={prices[l.id] || ''} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} required /></td>
                  <td><input type="number" value={leadTimes[l.id] || ''} onChange={(e) => setLeadTimes((p) => ({ ...p, [l.id]: e.target.value }))} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save quotation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor';
import AttachmentsPanel from '../components/AttachmentsPanel';

const STATUS_BADGE = {
  draft: 'badge-neutral', sent: 'badge-neutral', accepted: 'badge-success',
  rejected: 'badge-danger', expired: 'badge-danger', converted: 'badge-success',
};

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [detailQuotation, setDetailQuotation] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/quotations'), api.get('/customers'), api.get('/products'), api.get('/warehouses')])
      .then(([q, c, p, w]) => {
        setQuotations(q.data);
        setCustomers(c.data);
        setProducts(p.data);
        setWarehouses(w.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(id) {
    const { data } = await api.get(`/quotations/${id}`);
    setDetailQuotation(data);
  }

  async function updateStatus(id, status) {
    await api.patch(`/quotations/${id}/status`, { status });
    load();
    if (detailQuotation?.id === id) openDetail(id);
  }

  if (detailQuotation) {
    return (
      <QuotationDetail
        quotation={detailQuotation}
        onBack={() => { setDetailQuotation(null); load(); }}
        onUpdateStatus={updateStatus}
      />
    );
  }

  return (
    <DashboardLayout title="Quotations">
      <div className="card">
        <div className="card-header">
          <h2>Sales quotations</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New quotation</button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Quote #</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id}>
                  <td>{q.quotation_no}</td>
                  <td>{q.customer_name}</td>
                  <td>{new Date(q.quotation_date).toLocaleDateString()}</td>
                  <td>GHS {Number(q.total_amount).toFixed(2)}</td>
                  <td><span className={`badge ${STATUS_BADGE[q.status]}`}>{q.status}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetail(q.id)}>View</button>
                    {q.status === 'draft' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(q.id, 'sent')}>Mark sent</button>
                    )}
                    {(q.status === 'draft' || q.status === 'sent') && (
                      <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(q.id, 'accepted')}>Mark accepted</button>
                    )}
                    {q.status === 'accepted' && (
                      <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setConvertTarget(q)}>Convert to order</button>
                    )}
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No quotations yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <QuotationModal
          customers={customers}
          products={products}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {convertTarget && (
        <ConvertModal
          quotation={convertTarget}
          warehouses={warehouses}
          onClose={() => setConvertTarget(null)}
          onConverted={() => { setConvertTarget(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function QuotationModal({ customers, products, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/quotations', {
        customerId, validUntil: validUntil || undefined, notes,
        lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({
          productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || 0, taxPercent: Number(l.taxPercent) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create quotation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <h2>New quotation</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Valid until</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Line items</label>
          <LineItemsEditor lines={lines} setLines={setLines} products={products} />

          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Create quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConvertModal({ quotation, warehouses, onClose, onConverted }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/quotations/${quotation.id}/convert`, { warehouseId });
      onConverted();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to convert quotation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Convert {quotation.quotation_no} to a sales order</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Fulfilling warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Converting...' : 'Convert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuotationDetail({ quotation, onBack, onUpdateStatus }) {
  return (
    <DashboardLayout title={`Quotation — ${quotation.quotation_no}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to quotations</button>

      <div className="card">
        <div className="card-header">
          <h2>{quotation.customer_name} <span className={`badge ${STATUS_BADGE[quotation.status]}`}>{quotation.status}</span></h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {quotation.status === 'draft' && (
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => onUpdateStatus(quotation.id, 'sent')}>Mark sent</button>
            )}
            {(quotation.status === 'draft' || quotation.status === 'sent') && (
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => onUpdateStatus(quotation.id, 'accepted')}>Mark accepted</button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Quotation date: {new Date(quotation.quotation_date).toLocaleDateString()}
          {quotation.valid_until && <> · Valid until: {new Date(quotation.valid_until).toLocaleDateString()}</>}
        </p>

        <table>
          <thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead>
          <tbody>
            {quotation.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product_name} <span style={{ color: 'var(--color-text-muted)' }}>({l.sku})</span></td>
                <td>{Number(l.quantity).toLocaleString()} {l.uom_symbol}</td>
                <td>GHS {Number(l.unit_price).toFixed(2)}</td>
                <td>GHS {Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: 'right', marginTop: 16, fontSize: 15, fontWeight: 700 }}>
          Total: GHS {Number(quotation.total_amount).toFixed(2)}
        </div>
      </div>

      <div className="card">
        <h2>Attachments</h2>
        <AttachmentsPanel relatedType="quotation" relatedId={quotation.id} />
      </div>
    </DashboardLayout>
  );
}

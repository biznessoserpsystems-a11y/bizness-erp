import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor';

const STATUS_BADGE = { active: 'badge-success', paused: 'badge-warning', ended: 'badge-neutral' };
const FREQUENCY_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' };

export default function RecurringInvoices() {
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    Promise.all([api.get('/recurring-invoices'), api.get('/customers'), api.get('/products')])
      .then(([t, c, p]) => {
        setTemplates(t.data);
        setCustomers(c.data);
        setProducts(p.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(id) {
    const { data } = await api.get(`/recurring-invoices/${id}`);
    setDetailTemplate(data);
  }

  async function updateStatus(id, status) {
    await api.patch(`/recurring-invoices/${id}/status`, { status });
    load();
    if (detailTemplate?.id === id) openDetail(id);
  }

  async function runNow(id) {
    setError('');
    setRunningId(id);
    try {
      await api.post(`/recurring-invoices/${id}/run-now`);
      load();
      if (detailTemplate?.id === id) openDetail(id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate invoice');
    } finally {
      setRunningId(null);
    }
  }

  if (detailTemplate) {
    return (
      <RecurringInvoiceDetail
        template={detailTemplate}
        onBack={() => { setDetailTemplate(null); load(); }}
        onUpdateStatus={updateStatus}
        onRunNow={runNow}
        running={runningId === detailTemplate.id}
        error={error}
      />
    );
  }

  return (
    <DashboardLayout
      title="Recurring Invoices"
      breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Sales & Distribution' }, { label: 'Recurring Invoices' }]}
    >
      <div className="card">
        <div className="card-header">
          <h2>Recurring invoice templates</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New template</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Due templates are generated automatically in the background. Use "Run now" to generate a cycle's invoice early.
        </p>
        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Template</th><th>Customer</th><th>Frequency</th><th>Next run</th><th>Generated</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.template_name}</td>
                  <td>{t.customer_name}</td>
                  <td>{FREQUENCY_LABEL[t.frequency]}</td>
                  <td>{t.status === 'ended' ? '—' : new Date(t.next_run_date).toLocaleDateString()}</td>
                  <td>{t.invoices_generated}</td>
                  <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetail(t.id)}>View</button>
                    {t.status === 'active' && (
                      <button className="btn btn-secondary btn-sm" disabled={runningId === t.id} onClick={() => runNow(t.id)}>
                        {runningId === t.id ? 'Running...' : 'Run now'}
                      </button>
                    )}
                    {t.status === 'active' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(t.id, 'paused')}>Pause</button>
                    )}
                    {t.status === 'paused' && (
                      <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => updateStatus(t.id, 'active')}>Resume</button>
                    )}
                    {t.status !== 'ended' && (
                      <button className="btn btn-danger btn-sm" onClick={() => updateStatus(t.id, 'ended')}>End</button>
                    )}
                  </td>
                </tr>
              ))}
              {templates.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No recurring invoice templates yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <RecurringInvoiceModal
          customers={customers}
          products={products}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function RecurringInvoiceModal({ customers, products, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/recurring-invoices', {
        customerId, templateName, frequency, startDate, endDate: endDate || undefined, notes,
        lines: lines.filter((l) => l.productId && l.quantity).map((l) => ({
          productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || 0, taxPercent: Number(l.taxPercent) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create recurring invoice template');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <h2>New recurring invoice template</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Template name</label>
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Monthly retainer — Kofi Traders" required />
          </div>
          <div className="form-group">
            <label>Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>End date (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Line items (repeated every cycle)</label>
          <LineItemsEditor lines={lines} setLines={setLines} products={products} />

          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Carried onto every generated invoice" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Create template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecurringInvoiceDetail({ template, onBack, onUpdateStatus, onRunNow, running, error }) {
  return (
    <DashboardLayout title={`Recurring invoice — ${template.template_name}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to recurring invoices</button>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h2>{template.customer_name} <span className={`badge ${STATUS_BADGE[template.status]}`}>{template.status}</span></h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {template.status === 'active' && (
              <button className="btn btn-secondary" style={{ width: 'auto' }} disabled={running} onClick={() => onRunNow(template.id)}>
                {running ? 'Running...' : 'Run now'}
              </button>
            )}
            {template.status === 'active' && (
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => onUpdateStatus(template.id, 'paused')}>Pause</button>
            )}
            {template.status === 'paused' && (
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => onUpdateStatus(template.id, 'active')}>Resume</button>
            )}
            {template.status !== 'ended' && (
              <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => onUpdateStatus(template.id, 'ended')}>End</button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {FREQUENCY_LABEL[template.frequency]} · Started {new Date(template.start_date).toLocaleDateString()}
          {template.status !== 'ended' && <> · Next run {new Date(template.next_run_date).toLocaleDateString()}</>}
          {template.end_date && <> · Ends {new Date(template.end_date).toLocaleDateString()}</>}
        </p>
        {template.notes && <p style={{ fontSize: 13 }}>{template.notes}</p>}

        <table>
          <thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th></tr></thead>
          <tbody>
            {template.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product_name} <span style={{ color: 'var(--color-text-muted)' }}>({l.sku})</span></td>
                <td>{Number(l.quantity).toLocaleString()} {l.uom_symbol}</td>
                <td>GHS {Number(l.unit_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Generated invoices</h2>
        <table>
          <thead><tr><th>Invoice #</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {template.generatedInvoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.invoice_no}</td>
                <td>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                <td>GHS {Number(inv.total_amount).toFixed(2)}</td>
                <td><span className={`badge ${inv.status === 'paid' ? 'badge-success' : 'badge-neutral'}`}>{inv.status}</span></td>
              </tr>
            ))}
            {template.generatedInvoices.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No invoices generated yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

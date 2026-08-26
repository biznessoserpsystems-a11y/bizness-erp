import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, formatMoney } from '../components/charts';
import { useConfirm } from '../context/ConfirmContext';
import AttachmentsPanel from '../components/AttachmentsPanel';

export default function Suppliers() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('procurement.suppliers.manage');
  const [suppliers, setSuppliers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalSupplier, setModalSupplier] = useState(null);
  const [workspaceSupplier, setWorkspaceSupplier] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/suppliers'), api.get('/supplier-groups')])
      .then(([s, g]) => { setSuppliers(s.data); setGroups(g.data); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (workspaceSupplier) {
    return <SupplierWorkspace supplierId={workspaceSupplier} canManage={canManage} onBack={() => setWorkspaceSupplier(null)} />;
  }

  return (
    <DashboardLayout title="Suppliers">
      {!loading && suppliers.some((s) => Number(s.outstanding_balance) > 0) && (
        <BarChartWidget
          title="Highest outstanding payables"
          data={[...suppliers]
            .filter((s) => Number(s.outstanding_balance) > 0)
            .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance))
            .slice(0, 8)
            .map((s) => ({ name: s.name, balance: Number(s.outstanding_balance) }))}
          bars={[{ key: 'balance', label: 'Outstanding', color: '#B9790A' }]}
          colorByCategory={false}
          horizontal
          valueFormatter={(v) => formatMoney(v)}
          height={260}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Supplier accounts</h2>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalSupplier({})}>
              + Add supplier
            </button>
          )}
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Group</th><th>Contact</th><th>Terms</th><th>Credit limit</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.supplier_code}</td>
                  <td>{s.name}</td>
                  <td>{s.group_name || '—'}</td>
                  <td>{s.phone || s.email || '—'}</td>
                  <td>{s.payment_terms_days} days</td>
                  <td>{Number(s.credit_limit) > 0 ? `GHS ${Number(s.credit_limit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td>
                    <span style={Number(s.credit_limit) > 0 && Number(s.outstanding_balance) > Number(s.credit_limit) ? { color: 'var(--color-danger, #B3261E)', fontWeight: 600 } : undefined}>
                      GHS {Number(s.outstanding_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td><span className={`badge ${s.is_active ? 'badge-success' : 'badge-danger'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setWorkspaceSupplier(s.id)}>Manage</button>{' '}
                    {canManage && <button className="btn btn-secondary btn-sm" onClick={() => setModalSupplier(s)}>Edit</button>}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No suppliers yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modalSupplier && (
        <SupplierModal
          supplier={modalSupplier}
          groups={groups}
          onClose={() => setModalSupplier(null)}
          onSaved={() => { setModalSupplier(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}

function SupplierModal({ supplier, groups, onClose, onSaved }) {
  const isNew = !supplier.id;
  const [form, setForm] = useState({
    supplierCode: supplier.supplier_code || '',
    name: supplier.name || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    address: supplier.address || '',
    city: supplier.city || '',
    region: supplier.region || '',
    tin: supplier.tin || '',
    paymentTermsDays: supplier.payment_terms_days || 0,
    creditLimit: supplier.credit_limit || 0,
    supplierGroupId: supplier.supplier_group_id || '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form, supplierGroupId: form.supplierGroupId || null };
      if (isNew) await api.post('/suppliers', payload);
      else await api.patch(`/suppliers/${supplier.id}`, payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add supplier' : 'Edit supplier'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Supplier code</label><input value={form.supplierCode} onChange={update('supplierCode')} required disabled={!isNew} /></div>
          <div className="form-group"><label>Name</label><input value={form.name} onChange={update('name')} required /></div>
          <div className="form-group">
            <label>Group</label>
            <select value={form.supplierGroupId} onChange={update('supplierGroupId')}>
              <option value="">— No group —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={update('email')} /></div>
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={update('phone')} /></div>
          <div className="form-group"><label>Address</label><input value={form.address} onChange={update('address')} /></div>
          <div className="form-group"><label>City</label><input value={form.city} onChange={update('city')} /></div>
          <div className="form-group"><label>Region</label><input value={form.region} onChange={update('region')} /></div>
          <div className="form-group"><label>TIN</label><input value={form.tin} onChange={update('tin')} /></div>
          <div className="form-group"><label>Payment terms (days)</label><input type="number" value={form.paymentTermsDays} onChange={update('paymentTermsDays')} /></div>
          <div className="form-group">
            <label>Credit limit (GHS)</label>
            <input type="number" step="0.01" value={form.creditLimit} onChange={update('creditLimit')} />
            <small style={{ color: 'var(--color-text-muted)' }}>0 = no limit enforced. Exceeding it only shows a warning, it never blocks a purchase.</small>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const WORKSPACE_TABS = [
  { key: 'ledger', label: 'Ledger' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'communications', label: 'Communications' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'attachments', label: 'Attachments' },
];

function SupplierWorkspace({ supplierId, canManage, onBack }) {
  const [tab, setTab] = useState('ledger');
  const [supplierName, setSupplierName] = useState('');

  useEffect(() => {
    api.get(`/suppliers/${supplierId}`).then(({ data }) => setSupplierName(data.name));
  }, [supplierId]);

  return (
    <DashboardLayout title={supplierName ? `${supplierName}` : 'Supplier'}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to suppliers</button>

      <div className="toolbar">
        {WORKSPACE_TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ width: 'auto' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ledger' && <SupplierLedgerTab supplierId={supplierId} />}
      {tab === 'contacts' && <SupplierContactsTab supplierId={supplierId} canManage={canManage} />}
      {tab === 'communications' && <SupplierCommunicationsTab supplierId={supplierId} canManage={canManage} />}
      {tab === 'scorecard' && <SupplierScorecardTab supplierId={supplierId} />}
      {tab === 'attachments' && (
        <div className="card">
          <h2>Attachments</h2>
          <AttachmentsPanel relatedType="supplier" relatedId={supplierId} />
        </div>
      )}
    </DashboardLayout>
  );
}

function SupplierLedgerTab({ supplierId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/suppliers/${supplierId}/ledger`).then(({ data }) => setData(data));
  }, [supplierId]);

  if (!data) return <p>Loading...</p>;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Total outstanding</div><div className="kpi-value">GHS {data.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
      </div>

      <div className="card">
        <h2>Invoices</h2>
        <table>
          <thead><tr><th>Invoice #</th><th>Supplier ref</th><th>Date</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {data.invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.invoice_no}</td>
                <td>{i.supplier_invoice_no || '—'}</td>
                <td>{new Date(i.invoice_date).toLocaleDateString()}</td>
                <td>{i.due_date ? new Date(i.due_date).toLocaleDateString() : '—'}</td>
                <td>GHS {Number(i.total_amount).toFixed(2)}</td>
                <td>GHS {Number(i.balance).toFixed(2)}</td>
                <td><span className={`badge ${i.status === 'paid' ? 'badge-success' : i.status === 'void' ? 'badge-neutral' : 'badge-danger'}`}>{i.status}</span></td>
              </tr>
            ))}
            {data.invoices.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No invoices.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Payments made</h2>
        <table>
          <thead><tr><th>Receipt #</th><th>Date</th><th>Method</th><th>Amount</th><th>Unallocated</th></tr></thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.payment_no}</td>
                <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                <td>{p.payment_method}</td>
                <td>GHS {Number(p.amount).toFixed(2)}</td>
                <td>GHS {Number(p.unallocated_amount).toFixed(2)}</td>
              </tr>
            ))}
            {data.payments.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No payments.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Debit notes</h2>
        <table>
          <thead><tr><th>Debit note #</th><th>Date</th><th>Amount</th><th>Unapplied</th><th>Status</th></tr></thead>
          <tbody>
            {data.debitNotes.map((d) => (
              <tr key={d.id}>
                <td>{d.debit_note_no}</td>
                <td>{new Date(d.debit_note_date).toLocaleDateString()}</td>
                <td>GHS {Number(d.amount).toFixed(2)}</td>
                <td>GHS {Number(d.unapplied_amount).toFixed(2)}</td>
                <td><span className={`badge ${d.status === 'applied' ? 'badge-success' : 'badge-neutral'}`}>{d.status}</span></td>
              </tr>
            ))}
            {data.debitNotes.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No debit notes.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SupplierContactsTab({ supplierId, canManage }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const confirm = useConfirm();

  function load() {
    setLoading(true);
    api.get(`/suppliers/${supplierId}/contacts`).then(({ data }) => setContacts(data)).finally(() => setLoading(false));
  }

  useEffect(load, [supplierId]);

  async function handleDelete(id) {
    const ok = await confirm('Remove this contact?', { danger: true, confirmLabel: 'Remove' });
    if (!ok) return;
    await api.delete(`/supplier-contacts/${id}`);
    load();
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Contacts</h2>
        {canManage && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { setEditContact({}); setShowForm(true); }}>
            + Add contact
          </button>
        )}
      </div>

      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th><th>Primary</th><th></th></tr></thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.job_title || '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{c.phone || '—'}</td>
                <td>{c.is_primary ? <span className="badge badge-success">Primary</span> : '—'}</td>
                <td>
                  {canManage && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditContact(c); setShowForm(true); }}>Edit</button>{' '}
                      <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(c.id)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {contacts.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No contacts recorded yet.</td></tr>}
          </tbody>
        </table>
      )}

      {showForm && (
        <ContactModal
          supplierId={supplierId}
          contact={editContact}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function ContactModal({ supplierId, contact, onClose, onSaved }) {
  const isNew = !contact.id;
  const [form, setForm] = useState({
    name: contact.name || '',
    jobTitle: contact.job_title || '',
    email: contact.email || '',
    phone: contact.phone || '',
    isPrimary: contact.is_primary || false,
    notes: contact.notes || '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isNew) await api.post(`/suppliers/${supplierId}/contacts`, form);
      else await api.patch(`/supplier-contacts/${contact.id}`, form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add contact' : 'Edit contact'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Name</label><input value={form.name} onChange={update('name')} required /></div>
          <div className="form-group"><label>Job title</label><input value={form.jobTitle} onChange={update('jobTitle')} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={update('email')} /></div>
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={update('phone')} /></div>
          <div className="form-group">
            <label><input type="checkbox" checked={form.isPrimary} onChange={update('isPrimary')} style={{ width: 'auto', marginRight: 8 }} />Primary contact</label>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={update('notes')} rows={3} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CHANNEL_LABELS = { call: 'Call', email: 'Email', meeting: 'Meeting', site_visit: 'Site visit', note: 'Note' };

function SupplierCommunicationsTab({ supplierId, canManage }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    api.get(`/suppliers/${supplierId}/communications`).then(({ data }) => setItems(data)).finally(() => setLoading(false));
  }

  useEffect(load, [supplierId]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Communication log</h2>
        {canManage && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowForm(true)}>
            + Log interaction
          </button>
        )}
      </div>

      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Date</th><th>Channel</th><th>Subject</th><th>Notes</th><th>Logged by</th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.contact_date).toLocaleDateString()}</td>
                <td><span className="badge badge-neutral">{CHANNEL_LABELS[c.channel] || c.channel}</span></td>
                <td>{c.subject}</td>
                <td>{c.notes || '—'}</td>
                <td>{c.first_name ? `${c.first_name} ${c.last_name}` : '—'}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No interactions logged yet.</td></tr>}
          </tbody>
        </table>
      )}

      {showForm && (
        <CommunicationModal
          supplierId={supplierId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function CommunicationModal({ supplierId, onClose, onSaved }) {
  const [form, setForm] = useState({ channel: 'call', subject: '', notes: '', contactDate: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/suppliers/${supplierId}/communications`, form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log an interaction</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Channel</label>
            <select value={form.channel} onChange={update('channel')}>
              {Object.entries(CHANNEL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Date</label><input type="date" value={form.contactDate} onChange={update('contactDate')} /></div>
          <div className="form-group"><label>Subject</label><input value={form.subject} onChange={update('subject')} required /></div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={update('notes')} rows={4} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SupplierScorecardTab({ supplierId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/suppliers/${supplierId}/scorecard`).then(({ data }) => setData(data));
  }, [supplierId]);

  if (!data) return <p>Loading...</p>;

  const fmtPct = (v) => (v === null || v === undefined ? 'N/A' : `${v >= 0 ? '' : ''}${v.toFixed(1)}%`);

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Total spend</div><div className="kpi-value">GHS {data.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div className="kpi-card"><div className="kpi-label">On-time delivery</div><div className="kpi-value">{fmtPct(data.onTimeDeliveryRatePercent)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Avg lead time</div><div className="kpi-value">{data.avgLeadTimeDays === null ? 'N/A' : `${data.avgLeadTimeDays.toFixed(1)} days`}</div></div>
        <div className="kpi-card"><div className="kpi-label">Return rate</div><div className="kpi-value">{fmtPct(data.returnRatePercent)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Price vs. company avg</div><div className="kpi-value">{data.priceVariancePercent === null ? 'N/A' : `${data.priceVariancePercent > 0 ? '+' : ''}${data.priceVariancePercent.toFixed(1)}%`}</div></div>
      </div>

      <div className="card">
        <h2>How to read this</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          <strong>On-time delivery</strong> is the share of received purchase orders (with an expected date) where the last goods receipt landed on or before that date — based on {data.ordersConsidered} order{data.ordersConsidered === 1 ? '' : 's'}.
        </p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          <strong>Return rate</strong> is the value of purchase returns raised against this supplier as a share of total invoiced spend ({data.returnCount} return{data.returnCount === 1 ? '' : 's'} across {data.invoiceCount} invoice{data.invoiceCount === 1 ? '' : 's'}).
        </p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          <strong>Price vs. company average</strong> compares this supplier's unit prices, weighted by quantity, against the company-wide average paid for the same products across every supplier. A positive number means this supplier tends to charge more than others for the same items.
        </p>
      </div>
    </>
  );
}

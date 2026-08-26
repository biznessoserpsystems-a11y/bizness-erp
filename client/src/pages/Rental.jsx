import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import DateRangeFilter, { resolveDateRange } from '../components/DateRangeFilter';

const TABS = [
  { key: 'agreements', label: 'Rental Agreements' },
  { key: 'items', label: 'Rental Items' },
  { key: 'reports', label: 'Reports' },
];

const money = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function Rental() {
  const [tab, setTab] = useState('agreements');
  return (
    <DashboardLayout title="Rental Services">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'agreements' && <Agreements />}
      {tab === 'items' && <Items />}
      {tab === 'reports' && <Reports />}
    </DashboardLayout>
  );
}

// ============================================================================
function Items() {
  const [list, setList] = useState(null);
  const [products, setProducts] = useState([]);
  const [assets, setAssets] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', itemType: 'product', productId: '', fixedAssetId: '', dailyRate: '', weeklyRate: '', monthlyRate: '', depositAmount: '' });

  function load() { api.get('/rental/items').then(({ data }) => setList(data)); }
  useEffect(() => {
    load();
    api.get('/products').then(({ data }) => setProducts(data)).catch(() => setProducts([]));
    api.get('/fixed-assets').then(({ data }) => setAssets(data.data || data)).catch(() => setAssets([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/rental/items', form);
      setCreating(false);
      setForm({ name: '', itemType: 'product', productId: '', fixedAssetId: '', dailyRate: '', weeklyRate: '', monthlyRate: '', depositAmount: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create rental item');
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Rental Items</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Rental Item'}</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        A rentable item is either an existing Fixed Asset (equipment you own, already depreciating on its own schedule) or an existing Product (identical units held as stock). Either way, this just tracks the rental lifecycle on top — it doesn't duplicate the underlying record.
      </p>

      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Source</label>
            <select value={form.itemType} onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value }))}>
              <option value="product">Product (stock)</option>
              <option value="fixed_asset">Fixed Asset</option>
            </select>
          </div>
          {form.itemType === 'product' ? (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Product</label>
              <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} required>
                <option value="">Select</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Fixed Asset</label>
              <select value={form.fixedAssetId} onChange={(e) => setForm((f) => ({ ...f, fixedAssetId: e.target.value }))} required>
                <option value="">Select</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}><label>Daily rate</label><input type="number" step="0.01" value={form.dailyRate} onChange={(e) => setForm((f) => ({ ...f, dailyRate: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Weekly rate</label><input type="number" step="0.01" value={form.weeklyRate} onChange={(e) => setForm((f) => ({ ...f, weeklyRate: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Monthly rate</label><input type="number" step="0.01" value={form.monthlyRate} onChange={(e) => setForm((f) => ({ ...f, monthlyRate: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Deposit</label><input type="number" step="0.01" value={form.depositAmount} onChange={(e) => setForm((f) => ({ ...f, depositAmount: e.target.value }))} style={{ width: 100 }} /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Save</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No rental items yet.</p> : (
        <table>
          <thead><tr><th>Name</th><th>Source</th><th>Daily</th><th>Weekly</th><th>Monthly</th><th>Deposit</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((i) => (
              <ItemRow key={i.id} item={i} onChanged={load} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ItemRow({ item, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [maintenance, setMaintenance] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ maintenanceType: 'routine', description: '', scheduledDate: '' });
  const [completeForm, setCompleteForm] = useState({});
  const [error, setError] = useState('');

  function loadMaintenance() {
    api.get(`/rental/items/${item.id}/maintenance`).then(({ data }) => setMaintenance(data));
  }
  useEffect(() => {
    if (expanded && maintenance === null) {
      loadMaintenance();
      api.get('/bank-accounts').then(({ data }) => setBankAccounts(data));
    }
  }, [expanded]);

  async function scheduleMaintenance(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/rental/items/${item.id}/maintenance`, scheduleForm);
      setScheduleForm({ maintenanceType: 'routine', description: '', scheduledDate: '' });
      loadMaintenance();
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to schedule maintenance');
    }
  }

  async function startMaintenance(maintId) {
    setError('');
    try {
      await api.post(`/rental/maintenance/${maintId}/start`);
      loadMaintenance();
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start maintenance');
    }
  }

  async function completeMaintenance(maintId) {
    setError('');
    try {
      await api.post(`/rental/maintenance/${maintId}/complete`, {
        cost: completeForm[maintId]?.cost ? Number(completeForm[maintId].cost) : undefined,
        bankAccountId: completeForm[maintId]?.bankAccountId,
      });
      loadMaintenance();
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to complete maintenance');
    }
  }

  return (
    <>
      <tr>
        <td>{item.name}</td>
        <td>{item.item_type === 'fixed_asset' ? `Asset: ${item.fixed_asset_name || '—'}` : `Product: ${item.product_name || '—'}`}</td>
        <td>{item.daily_rate ? money(item.daily_rate) : '—'}</td>
        <td>{item.weekly_rate ? money(item.weekly_rate) : '—'}</td>
        <td>{item.monthly_rate ? money(item.monthly_rate) : '—'}</td>
        <td>{money(item.deposit_amount)}</td>
        <td><span className={`badge ${item.status === 'available' ? 'badge-success' : item.status === 'rented' ? 'badge-info' : item.status === 'maintenance' ? 'badge-warning' : 'badge-neutral'}`}>{item.status}</span></td>
        <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setExpanded((e) => !e)}>{expanded ? 'Hide' : 'Maintenance'}</button></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--color-bg)' }}>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={scheduleMaintenance} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
              <select value={scheduleForm.maintenanceType} onChange={(e) => setScheduleForm((f) => ({ ...f, maintenanceType: e.target.value }))}>
                <option value="routine">Routine</option><option value="repair">Repair</option><option value="inspection">Inspection</option>
              </select>
              <input placeholder="Description" value={scheduleForm.description} onChange={(e) => setScheduleForm((f) => ({ ...f, description: e.target.value }))} required style={{ width: 200 }} />
              <input type="date" value={scheduleForm.scheduledDate} onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledDate: e.target.value }))} required />
              <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Schedule</button>
            </form>

            {maintenance === null ? <p>Loading...</p> : maintenance.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No maintenance history.</p> : (
              <table>
                <thead><tr><th>Type</th><th>Description</th><th>Scheduled</th><th>Status</th><th>Cost</th><th></th></tr></thead>
                <tbody>
                  {maintenance.map((m) => (
                    <tr key={m.id}>
                      <td style={{ textTransform: 'capitalize' }}>{m.maintenance_type}</td>
                      <td>{m.description}</td>
                      <td>{new Date(m.scheduled_date).toLocaleDateString()}</td>
                      <td><span className={`badge ${m.status === 'completed' ? 'badge-success' : m.status === 'in_progress' ? 'badge-info' : 'badge-neutral'}`}>{m.status.replace('_', ' ')}</span></td>
                      <td>{m.cost ? money(m.cost) : '—'}</td>
                      <td>
                        {m.status === 'scheduled' && <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startMaintenance(m.id)}>Start</button>}
                        {m.status === 'in_progress' && (
                          <span style={{ display: 'flex', gap: 6 }}>
                            <input type="number" step="0.01" placeholder="Cost" style={{ width: 80 }} onChange={(e) => setCompleteForm((f) => ({ ...f, [m.id]: { ...f[m.id], cost: e.target.value } }))} />
                            <select style={{ width: 110 }} onChange={(e) => setCompleteForm((f) => ({ ...f, [m.id]: { ...f[m.id], bankAccountId: e.target.value } }))}>
                              <option value="">Bank</option>
                              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
                            </select>
                            <button className="btn btn-success btn-sm" style={{ width: 'auto' }} onClick={() => completeMaintenance(m.id)}>Complete</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================================
function Agreements() {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ customerId: '', rentalItemId: '', rateType: 'daily', rateAmount: '', startDate: '', expectedReturnDate: '', depositAmount: '' });

  function load() { api.get('/rental/agreements').then(({ data }) => setList(data)); }
  useEffect(() => {
    load();
    api.get('/rental/items').then(({ data }) => setItems(data.filter((i) => i.status === 'available')));
    api.get('/customers').then(({ data }) => setCustomers(data));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/rental/agreements', form);
      setCreating(false);
      setForm({ customerId: '', rentalItemId: '', rateType: 'daily', rateAmount: '', startDate: '', expectedReturnDate: '', depositAmount: '' });
      load();
      setSelectedId(data.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create agreement');
    }
  }

  if (selectedId) return <AgreementDetail id={selectedId} onBack={() => { setSelectedId(null); load(); }} />;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Rental Agreements</h2>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Agreement'}</button>
      </div>

      {creating && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          {error && <div className="error-banner" style={{ width: '100%' }}>{error}</div>}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Customer</label>
            <select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} required>
              <option value="">Select</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Item</label>
            <select value={form.rentalItemId} onChange={(e) => setForm((f) => ({ ...f, rentalItemId: e.target.value }))} required>
              <option value="">Select (available only)</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Rate type</label>
            <select value={form.rateType} onChange={(e) => setForm((f) => ({ ...f, rateType: e.target.value }))}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Rate amount</label><input type="number" step="0.01" value={form.rateAmount} onChange={(e) => setForm((f) => ({ ...f, rateAmount: e.target.value }))} style={{ width: 100 }} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Start date</label><input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Expected return</label><input type="date" value={form.expectedReturnDate} onChange={(e) => setForm((f) => ({ ...f, expectedReturnDate: e.target.value }))} required /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Deposit</label><input type="number" step="0.01" value={form.depositAmount} onChange={(e) => setForm((f) => ({ ...f, depositAmount: e.target.value }))} style={{ width: 100 }} placeholder="Item default" /></div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit">Create</button>
        </form>
      )}

      {list === null ? <p>Loading...</p> : list.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No rental agreements yet.</p> : (
        <table>
          <thead><tr><th>Agreement #</th><th>Customer</th><th>Item</th><th>Start</th><th>Expected Return</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>{a.agreement_no}</td><td>{a.customer_name}</td><td>{a.item_name}</td>
                <td>{new Date(a.start_date).toLocaleDateString()}</td><td>{new Date(a.expected_return_date).toLocaleDateString()}</td>
                <td><span className={`badge ${a.status === 'active' ? 'badge-info' : a.status === 'returned' ? 'badge-success' : a.status === 'cancelled' ? 'badge-danger' : 'badge-neutral'}`}>{a.status}</span></td>
                <td><button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setSelectedId(a.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AgreementDetail({ id, onBack }) {
  const [agreement, setAgreement] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [chargeForm, setChargeForm] = useState({ chargeType: 'rental', description: '', amount: '', taxPercent: '0' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', bankAccountId: '' });
  const [checkoutForm, setCheckoutForm] = useState({ condition: 'good', notes: '' });
  const [checkinForm, setCheckinForm] = useState({ actualReturnDate: '', condition: 'good', notes: '' });
  const [depositAction, setDepositAction] = useState({ amount: '', bankAccountId: '' });

  function load() { api.get(`/rental/agreements/${id}`).then(({ data }) => setAgreement(data)).catch(() => setAgreement(null)); }
  useEffect(() => { load(); api.get('/bank-accounts').then(({ data }) => setBankAccounts(data)); }, [id]);

  async function runAction(fn) {
    setError('');
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (!agreement) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>{agreement.agreement_no} — {agreement.item_name}</h2>
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={onBack}>&larr; Back to list</button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card"><div className="kpi-label">Customer</div><div className="kpi-value" style={{ fontSize: 16 }}>{agreement.customer_name}</div></div>
        <div className="kpi-card"><div className="kpi-label">Status</div><div className="kpi-value" style={{ fontSize: 18, textTransform: 'capitalize' }}>{agreement.status}</div></div>
        <div className="kpi-card"><div className="kpi-label">Deposit status</div><div className="kpi-value" style={{ fontSize: 16, textTransform: 'capitalize' }}>{agreement.deposit_status.replace('_', ' ')}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total charged</div><div className="kpi-value">{money(agreement.totalCharged)}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {agreement.status === 'draft' && (
          <form onSubmit={(e) => { e.preventDefault(); runAction(() => api.post(`/rental/agreements/${id}/check-out`, { condition: checkoutForm.condition, notes: checkoutForm.notes })); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <h4 style={{ width: '100%', fontSize: 13, margin: 0 }}>Check out</h4>
            <select value={checkoutForm.condition} onChange={(e) => setCheckoutForm((f) => ({ ...f, condition: e.target.value }))}>
              <option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option>
            </select>
            <input placeholder="Notes (optional)" value={checkoutForm.notes} onChange={(e) => setCheckoutForm((f) => ({ ...f, notes: e.target.value }))} style={{ width: 220 }} />
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>Check Out</button>
          </form>
        )}
        {agreement.status === 'active' && (
          <form onSubmit={(e) => { e.preventDefault(); runAction(() => api.post(`/rental/agreements/${id}/check-in`, { actualReturnDate: checkinForm.actualReturnDate || undefined, condition: checkinForm.condition, notes: checkinForm.notes })); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <h4 style={{ width: '100%', fontSize: 13, margin: 0 }}>Check in</h4>
            <input type="date" value={checkinForm.actualReturnDate} onChange={(e) => setCheckinForm((f) => ({ ...f, actualReturnDate: e.target.value }))} placeholder="Today" />
            <select value={checkinForm.condition} onChange={(e) => setCheckinForm((f) => ({ ...f, condition: e.target.value }))}>
              <option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged (sends to maintenance)</option>
            </select>
            <input placeholder="Notes (optional)" value={checkinForm.notes} onChange={(e) => setCheckinForm((f) => ({ ...f, notes: e.target.value }))} style={{ width: 220 }} />
            <button className="btn btn-success btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>Check In</button>
          </form>
        )}
        {agreement.status === 'returned' && (agreement.condition_at_checkout || agreement.condition_at_checkin) && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {agreement.condition_at_checkout && <p style={{ margin: '0 0 4px' }}>Checked out: <strong style={{ textTransform: 'capitalize' }}>{agreement.condition_at_checkout}</strong>{agreement.checkout_notes ? ` — ${agreement.checkout_notes}` : ''}</p>}
            {agreement.condition_at_checkin && <p style={{ margin: 0 }}>Checked in: <strong style={{ textTransform: 'capitalize' }}>{agreement.condition_at_checkin}</strong>{agreement.checkin_notes ? ` — ${agreement.checkin_notes}` : ''}</p>}
          </div>
        )}
      </div>

      {(agreement.status === 'draft' || agreement.status === 'active') && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
          <form onSubmit={(e) => { e.preventDefault(); runAction(() => api.post(`/rental/agreements/${id}/charges`, { ...chargeForm, amount: Number(chargeForm.amount), taxPercent: Number(chargeForm.taxPercent) })).then(() => setChargeForm({ chargeType: 'rental', description: '', amount: '', taxPercent: '0' })); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <h4 style={{ width: '100%', fontSize: 13, margin: 0 }}>Bill a charge</h4>

            <select value={chargeForm.chargeType} onChange={(e) => setChargeForm((f) => ({ ...f, chargeType: e.target.value }))}>
              <option value="rental">Rental</option><option value="late_fee">Late fee</option><option value="damage">Damage</option>
            </select>
            <input placeholder="Description" value={chargeForm.description} onChange={(e) => setChargeForm((f) => ({ ...f, description: e.target.value }))} required style={{ width: 180 }} />
            <input type="number" step="0.01" placeholder="Amount" value={chargeForm.amount} onChange={(e) => setChargeForm((f) => ({ ...f, amount: e.target.value }))} required style={{ width: 100 }} />
            <input type="number" step="0.01" placeholder="Tax %" value={chargeForm.taxPercent} onChange={(e) => setChargeForm((f) => ({ ...f, taxPercent: e.target.value }))} style={{ width: 80 }} />
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>Bill Charge</button>
          </form>

          <form onSubmit={(e) => { e.preventDefault(); runAction(() => api.post(`/rental/agreements/${id}/payments`, { amount: Number(paymentForm.amount), bankAccountId: paymentForm.bankAccountId })).then(() => setPaymentForm({ amount: '', bankAccountId: '' })); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <h4 style={{ width: '100%', fontSize: 13, margin: 0 }}>Record a payment</h4>
            <input type="number" step="0.01" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} required style={{ width: 100 }} />
            <select value={paymentForm.bankAccountId} onChange={(e) => setPaymentForm((f) => ({ ...f, bankAccountId: e.target.value }))} required>
              <option value="">Bank account</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>Record Payment</button>
          </form>

          {agreement.deposit_status === 'not_collected' && (
            <form onSubmit={(e) => { e.preventDefault(); runAction(() => api.post(`/rental/agreements/${id}/deposit/collect`, { amount: Number(depositAction.amount), bankAccountId: depositAction.bankAccountId })); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <h4 style={{ width: '100%', fontSize: 13, margin: 0 }}>Collect deposit</h4>
              <input type="number" step="0.01" placeholder="Amount" defaultValue={agreement.deposit_amount} onChange={(e) => setDepositAction((d) => ({ ...d, amount: e.target.value }))} style={{ width: 100 }} required />
              <select onChange={(e) => setDepositAction((d) => ({ ...d, bankAccountId: e.target.value }))} required>
                <option value="">Bank account</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} type="submit" disabled={busy}>Collect</button>
            </form>
          )}
          {agreement.deposit_status === 'held' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div>
                <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Deposit held</h4>
                <select onChange={(e) => setDepositAction((d) => ({ ...d, bankAccountId: e.target.value }))} style={{ marginRight: 6 }}>
                  <option value="">Bank account</option>
                  {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Amount" defaultValue={agreement.deposit_amount} onChange={(e) => setDepositAction((d) => ({ ...d, amount: e.target.value }))} style={{ width: 100, marginRight: 6 }} />
                <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginRight: 6 }} disabled={busy} onClick={() => runAction(() => api.post(`/rental/agreements/${id}/deposit/refund`, { amount: Number(depositAction.amount || agreement.deposit_amount), bankAccountId: depositAction.bankAccountId }))}>Refund</button>
                <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction(() => api.post(`/rental/agreements/${id}/deposit/forfeit`, { amount: Number(depositAction.amount || agreement.deposit_amount), reason: 'Damage/loss' }))}>Forfeit</button>
              </div>
            </div>
          )}
        </div>
      )}

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Charges</h3>
      <table style={{ marginBottom: 16 }}>
        <thead><tr><th>Type</th><th>Description</th><th>Amount</th><th>Tax %</th><th>Date</th></tr></thead>
        <tbody>
          {agreement.charges.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)' }}>None yet.</td></tr> : agreement.charges.map((c) => (
            <tr key={c.id}><td style={{ textTransform: 'capitalize' }}>{c.charge_type.replace('_', ' ')}</td><td>{c.description}</td><td>{money(c.amount)}</td><td>{c.tax_percent}%</td><td>{new Date(c.charged_at).toLocaleDateString()}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Deposit Transactions</h3>
      <table>
        <thead><tr><th>Type</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody>
          {agreement.depositTransactions.length === 0 ? <tr><td colSpan={3} style={{ color: 'var(--color-text-muted)' }}>None yet.</td></tr> : agreement.depositTransactions.map((t) => (
            <tr key={t.id}><td style={{ textTransform: 'capitalize' }}>{t.transaction_type}</td><td>{money(t.amount)}</td><td>{new Date(t.transacted_at).toLocaleDateString()}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
function Reports() {
  const [rangeMode, setRangeMode] = useState('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = resolveDateRange(rangeMode, customFrom, customTo);
  const [data, setData] = useState(null);
  const [utilization, setUtilization] = useState(null);

  useEffect(() => {
    api.get(`/rental/reports/summary?from=${from}&to=${to}`).then(({ data }) => setData(data)).catch(() => setData(null));
    api.get(`/rental/reports/asset-utilization?from=${from}&to=${to}`).then(({ data }) => setUtilization(data)).catch(() => setUtilization(null));
  }, [from, to]);

  return (
    <>
    <div className="card">
      <div className="statement-header">
        <h2 className="statement-title">Rental Summary</h2>
        <div className="statement-actions">
          <DateRangeFilter mode={rangeMode} onModeChange={setRangeMode} customFrom={customFrom} customTo={customTo} onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />
        </div>
      </div>
      {!data ? <p>Loading...</p> : (
        <>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <div className="kpi-card"><div className="kpi-label">Total revenue</div><div className="kpi-value">{money(data.totalRevenue)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Active agreements</div><div className="kpi-value">{data.activeAgreements}</div></div>
            <div className="kpi-card"><div className="kpi-label">Overdue agreements</div><div className="kpi-value" style={data.overdueAgreements > 0 ? { color: 'var(--color-error)' } : undefined}>{data.overdueAgreements}</div></div>
            <div className="kpi-card"><div className="kpi-label">Available items</div><div className="kpi-value">{data.itemsByStatus.available || 0}</div></div>
            <div className="kpi-card"><div className="kpi-label">Rented items</div><div className="kpi-value">{data.itemsByStatus.rented || 0}</div></div>
          </div>
          <table>
            <thead><tr><th>Revenue by charge type</th><th>Amount</th></tr></thead>
            <tbody>
              {Object.entries(data.revenueByType).map(([type, amount]) => (
                <tr key={type}><td style={{ textTransform: 'capitalize' }}>{type.replace('_', ' ')}</td><td>{money(amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>

    <div className="card">
      <h2>Asset Utilization</h2>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
        Rented days vs. period days, revenue earned, and maintenance cost incurred per item — is this item worth what you paid for it?
      </p>
      {!utilization ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Item</th><th>Status</th><th>Rented Days</th><th>Utilization</th><th>Revenue</th><th>Maintenance Cost</th><th>Net Contribution</th></tr></thead>
          <tbody>
            {utilization.items.length === 0 ? <tr><td colSpan={7} style={{ color: 'var(--color-text-muted)' }}>No rental items yet.</td></tr> : utilization.items.map((i) => (
              <tr key={i.itemId}>
                <td>{i.itemName}</td>
                <td style={{ textTransform: 'capitalize' }}>{i.currentStatus}</td>
                <td>{i.rentedDays} / {i.periodDays}</td>
                <td>{i.utilizationRate.toFixed(1)}%</td>
                <td>{money(i.revenue)}</td>
                <td>{money(i.maintenanceCost)}</td>
                <td style={i.netContribution < 0 ? { color: 'var(--color-error)' } : undefined}>{money(i.netContribution)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </>
  );
}

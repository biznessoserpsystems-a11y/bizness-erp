import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

const TABS = [
  { key: 'currencies', label: 'Currencies' },
  { key: 'rates', label: 'Exchange Rates' },
];

export default function CurrencySettings() {
  const [tab, setTab] = useState('currencies');

  return (
    <DashboardLayout title="Currencies & Exchange Rates">
      <div className="toolbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'currencies' && <CurrenciesTab />}
      {tab === 'rates' && <ExchangeRatesTab />}
    </DashboardLayout>
  );
}

function CurrenciesTab() {
  const { showToast } = useToast();
  const [currencies, setCurrencies] = useState(null);
  const [showModal, setShowModal] = useState(false);

  function load() {
    api.get('/currencies').then(({ data }) => setCurrencies(data)).catch(() => setCurrencies([]));
  }
  useEffect(load, []);

  async function toggleActive(currency) {
    try {
      await api.patch(`/currencies/${currency.code}`, { isActive: !currency.is_active });
      showToast(`${currency.code} ${currency.is_active ? 'deactivated' : 'activated'}.`, 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update currency', 'error');
    }
  }

  if (currencies === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Currencies</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add currency</button>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Symbol</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {currencies.map((c) => (
            <tr key={c.code}>
              <td>{c.code}</td>
              <td>{c.name}</td>
              <td>{c.symbol || '—'}</td>
              <td><span className={`badge ${c.is_active ? 'badge-success' : 'badge-neutral'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
              <td><button className="btn btn-secondary btn-sm" onClick={() => toggleActive(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>
          ))}
          {currencies.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No currencies configured.</td></tr>}
        </tbody>
      </table>
      {showModal && (
        <CurrencyModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); showToast('Currency saved.', 'success'); }}
        />
      )}
    </div>
  );
}

function CurrencyModal({ onClose, onSaved }) {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/currencies', { code, name, symbol });
      onSaved();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save currency', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add currency</h2>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Code (ISO 4217)</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} placeholder="e.g. USD" required />
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. US Dollar" required />
          </div>
          <div className="form-group">
            <label>Symbol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. $" maxLength={10} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save currency'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExchangeRatesTab() {
  const { showToast } = useToast();
  const [rates, setRates] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [showModal, setShowModal] = useState(false);

  function load() {
    api.get('/exchange-rates').then(({ data }) => setRates(data)).catch(() => setRates([]));
  }
  useEffect(() => {
    load();
    api.get('/currencies').then(({ data }) => setCurrencies(data.filter((c) => c.is_active))).catch(() => setCurrencies([]));
  }, []);

  async function remove(id) {
    if (!window.confirm('Delete this exchange rate?')) return;
    try {
      await api.delete(`/exchange-rates/${id}`);
      showToast('Exchange rate deleted.', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete exchange rate', 'error');
    }
  }

  if (rates === null) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Exchange rates</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add rate</button>
      </div>
      <table>
        <thead><tr><th>From</th><th>To</th><th>Rate</th><th>Effective date</th><th></th></tr></thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id}>
              <td>{r.from_currency} — {r.from_currency_name}</td>
              <td>{r.to_currency} — {r.to_currency_name}</td>
              <td>{Number(r.rate).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</td>
              <td>{new Date(r.effective_date).toLocaleDateString()}</td>
              <td><button className="btn btn-secondary btn-sm" onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}
          {rates.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No exchange rates recorded yet.</td></tr>}
        </tbody>
      </table>
      {showModal && (
        <ExchangeRateModal
          currencies={currencies}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); showToast('Exchange rate saved.', 'success'); }}
        />
      )}
    </div>
  );
}

function ExchangeRateModal({ currencies, onClose, onSaved }) {
  const { showToast } = useToast();
  const [fromCurrency, setFromCurrency] = useState('');
  const [toCurrency, setToCurrency] = useState('');
  const [rate, setRate] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/exchange-rates', { fromCurrency, toCurrency, rate: Number(rate), effectiveDate });
      onSaved();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save exchange rate', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add exchange rate</h2>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>From currency</label>
            <select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} required>
              <option value="">Select…</option>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>To currency</label>
            <select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} required>
              <option value="">Select…</option>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Rate (1 From = ? To)</label>
            <input type="number" step="0.000001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Effective date</label>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save rate'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function ProcurementSettings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([api.get('/procurement/settings'), api.get('/currencies')])
      .then(([s, c]) => {
        setSettings(s.data);
        setForm({
          defaultPaymentTermsDays: s.data.default_payment_terms_days,
          defaultVatRate: s.data.default_vat_rate,
          defaultCurrency: s.data.default_currency,
          requisitionAutoApproveLimit: s.data.requisition_auto_approve_limit,
          poAutoApproveLimit: s.data.po_auto_approve_limit,
          rfqMinQuotes: s.data.rfq_min_quotes,
        });
        setCurrencies(c.data.filter((cur) => cur.is_active));
      })
      .catch(() => setSettings(false));
  }
  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/procurement/settings', form);
      setSettings(data);
      showToast('Procurement settings saved.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (settings === null || form === null) return <DashboardLayout title="Procurement Settings"><div className="card"><p>Loading...</p></div></DashboardLayout>;
  if (settings === false) return <DashboardLayout title="Procurement Settings"><div className="card"><p>Failed to load settings.</p></div></DashboardLayout>;

  return (
    <DashboardLayout title="Procurement Settings">
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        Company-wide defaults and approval rules for the Procurement & Purchasing module — the same
        pattern as HR & Payroll's Statutory Settings.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><h2>Purchasing defaults</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Used to pre-fill new suppliers and purchase orders whenever a specific one isn't given.
          </p>
          <div className="form-group">
            <label>Default payment terms (days)</label>
            <input
              type="number" min="0" value={form.defaultPaymentTermsDays}
              onChange={(e) => setForm((f) => ({ ...f, defaultPaymentTermsDays: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Default VAT rate (%)</label>
            <input
              type="number" min="0" max="100" step="0.01" value={form.defaultVatRate}
              onChange={(e) => setForm((f) => ({ ...f, defaultVatRate: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Default currency</label>
            <select value={form.defaultCurrency} onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))}>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Approval thresholds</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            A limit of <strong>0</strong> means always require approval / always flag for review.
            Requisitions carry no line price, so their limit is compared against an estimated value
            (quantity × each product's current cost).
          </p>
          <div className="form-group">
            <label>Requisition auto-approve limit (GHS)</label>
            <input
              type="number" min="0" step="0.01" value={form.requisitionAutoApproveLimit}
              onChange={(e) => setForm((f) => ({ ...f, requisitionAutoApproveLimit: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Purchase order review threshold (GHS)</label>
            <input
              type="number" min="0" step="0.01" value={form.poAutoApproveLimit}
              onChange={(e) => setForm((f) => ({ ...f, poAutoApproveLimit: e.target.value }))}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>RFQ rules</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            A value of <strong>0</strong> disables the check.
          </p>
          <div className="form-group">
            <label>Minimum supplier quotes required before awarding an RFQ</label>
            <input
              type="number" min="0" step="1" value={form.rfqMinQuotes}
              onChange={(e) => setForm((f) => ({ ...f, rfqMinQuotes: e.target.value }))}
            />
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const MAPPING_KEYS = [
  { key: 'accounts_receivable', label: 'Accounts Receivable' },
  { key: 'accounts_payable', label: 'Accounts Payable' },
  { key: 'sales_revenue', label: 'Sales Revenue' },
  { key: 'vat_payable', label: 'VAT Payable' },
  { key: 'customer_advances', label: 'Customer Advances' },
  { key: 'cash_default', label: 'Default Cash Account' },
  { key: 'inventory_asset', label: 'Inventory Asset' },
  { key: 'cogs', label: 'Cost of Goods Sold' },
  { key: 'retained_earnings', label: 'Retained Earnings' },
];

export default function ChartOfAccounts() {
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.get('/chart-of-accounts'), api.get('/gl-mappings')])
      .then(([a, m]) => {
        setAccounts(a.data);
        setMappings(m.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSetupDefaults() {
    setSettingUp(true);
    try {
      await api.post('/accounting/setup-defaults');
      load();
    } finally {
      setSettingUp(false);
    }
  }

  async function updateMapping(mappingKey, accountId) {
    if (!accountId) return;
    await api.put(`/gl-mappings/${mappingKey}`, { accountId });
    load();
  }

  return (
    <DashboardLayout title="Chart of Accounts" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Chart of Accounts' }]}>
      <div className="toolbar">
        <button className={tab === 'accounts' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab('accounts')}>Accounts</button>
        <button className={tab === 'mappings' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab('mappings')}>GL Mappings</button>
      </div>

      {tab === 'accounts' && (
        <div className="card">
          <div className="card-header">
            <h2>Accounts</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleSetupDefaults} disabled={settingUp}>
                {settingUp ? 'Setting up...' : 'Set up defaults'}
              </button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add account</button>
            </div>
          </div>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Subtype</th><th>Normal balance</th><th>Status</th></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.account_code}</td>
                    <td>{a.account_name} {a.is_system_account && <span className="badge badge-neutral">system</span>}</td>
                    <td style={{ textTransform: 'capitalize' }}>{a.account_type}</td>
                    <td>{a.account_subtype || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{a.normal_balance}</td>
                    <td><span className={`badge ${a.is_active ? 'badge-success' : 'badge-danger'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No accounts yet. Click "Set up defaults" for a standard chart of accounts, or add your own.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'mappings' && (
        <div className="card">
          <h2>GL account mappings</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            These tell Sales & Distribution where to auto-post — e.g. which account is "Accounts Receivable".
            Without these set, invoices and payments still work, they just won't create journal entries.
          </p>
          <table>
            <thead><tr><th>Role</th><th>Mapped account</th></tr></thead>
            <tbody>
              {MAPPING_KEYS.map((mk) => {
                const current = mappings.find((m) => m.mapping_key === mk.key);
                return (
                  <tr key={mk.key}>
                    <td>{mk.label}</td>
                    <td>
                      <select
                        defaultValue={current?.account_id || ''}
                        onChange={(e) => updateMapping(mk.key, e.target.value)}
                        style={{ width: 320, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                      >
                        <option value="">Not set</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AccountModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} accounts={accounts} />
      )}
    </DashboardLayout>
  );
}

function AccountModal({ accounts, onClose, onSaved }) {
  const [form, setForm] = useState({ accountCode: '', accountName: '', accountType: 'asset', accountSubtype: '', parentAccountId: '', description: '' });
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
      await api.post('/chart-of-accounts', form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add account</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Account code</label>
            <input value={form.accountCode} onChange={update('accountCode')} placeholder="e.g. 6050" required />
          </div>
          <div className="form-group">
            <label>Account name</label>
            <input value={form.accountName} onChange={update('accountName')} required />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={form.accountType} onChange={update('accountType')}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Subtype (optional)</label>
            <input value={form.accountSubtype} onChange={update('accountSubtype')} placeholder="e.g. operating_expense" />
          </div>
          <div className="form-group">
            <label>Parent account (optional)</label>
            <select value={form.parentAccountId} onChange={update('parentAccountId')}>
              <option value="">None</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

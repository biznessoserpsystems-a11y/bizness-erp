import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

export default function GeneralLedger() {
  const [tab, setTab] = useState('trial-balance');

  return (
    <DashboardLayout title="General Ledger" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'General Ledger' }]}>
      <div className="toolbar">
        <button className={tab === 'trial-balance' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab('trial-balance')}>Trial Balance</button>
        <button className={tab === 'ledger' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setTab('ledger')}>Account Ledger</button>
      </div>
      {tab === 'trial-balance' && <TrialBalance />}
      {tab === 'ledger' && <AccountLedger />}
    </DashboardLayout>
  );
}

function TrialBalance() {
  const [data, setData] = useState(null);
  const [asOf, setAsOf] = useState('');

  function load() {
    const q = asOf ? `?asOf=${asOf}` : '';
    api.get(`/trial-balance${q}`).then(({ data }) => setData(data));
  }

  useEffect(load, [asOf]);

  if (!data) return <div className="card"><p>Loading...</p></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Trial balance {data.isBalanced ? <span className="badge badge-success">balanced</span> : <span className="badge badge-danger">out of balance</span>}</h2>
        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
      </div>
      <table>
        <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th></tr></thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.account_code}</td>
              <td>{l.account_name}</td>
              <td style={{ textTransform: 'capitalize' }}>{l.account_type}</td>
              <td>{Number(l.debit_balance) > 0 ? `GHS ${Number(l.debit_balance).toFixed(2)}` : ''}</td>
              <td>{Number(l.credit_balance) > 0 ? `GHS ${Number(l.credit_balance).toFixed(2)}` : ''}</td>
            </tr>
          ))}
          {data.lines.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No account activity yet.</td></tr>}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
            <td colSpan={3}>Totals</td>
            <td>GHS {data.totalDebitBalances.toFixed(2)}</td>
            <td>GHS {data.totalCreditBalances.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AccountLedger() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/chart-of-accounts').then(({ data }) => setAccounts(data));
  }, []);

  useEffect(() => {
    if (!accountId) { setData(null); return; }
    api.get(`/ledger/${accountId}`).then(({ data }) => setData(data));
  }, [accountId]);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Account ledger</h2>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: 320, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          <option value="">Select an account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
        </select>
      </div>

      {!data ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Choose an account to view its ledger.</p>
      ) : (
        <>
          <p style={{ fontSize: 14, marginBottom: 12 }}>
            <strong>{data.account.account_code} — {data.account.account_name}</strong> · Closing balance: GHS {Number(data.closingBalance).toFixed(2)}
          </p>
          <table>
            <thead><tr><th>Date</th><th>Entry #</th><th>Description</th><th>Debit</th><th>Credit</th><th>Running balance</th></tr></thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.entry_date).toLocaleDateString()}</td>
                  <td>{l.entry_no}</td>
                  <td>{l.entry_description || l.description || '—'}</td>
                  <td>{Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ''}</td>
                  <td>{Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ''}</td>
                  <td>GHS {Number(l.running_balance).toFixed(2)}</td>
                </tr>
              ))}
              {data.lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No transactions on this account.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

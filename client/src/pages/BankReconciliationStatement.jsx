import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { formatMoney } from '../components/charts';
import PrintButton from '../components/PrintButton';

const money = (n) => formatMoney(n);

// The formal accounting document, reached from a specific bank account's
// row on the Banking page — distinct from that page's "Reconcile" button,
// which opens the working tool for actually matching individual lines.
// This is the resulting statement: balance per bank and balance per
// books, each adjusted for the items timing hasn't caught up on yet,
// which should converge to the same figure if reconciliation is genuinely
// complete. An out-of-balance result is itself real, useful information
// here, not an error state to hide.
export default function BankReconciliationStatement() {
  const { id } = useParams();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/bank-accounts/${id}/reconciliation-statement?asOf=${asOf}`)
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load the reconciliation statement.'));
  }, [id, asOf]);

  return (
    <DashboardLayout
      title="Bank Reconciliation Statement"
      breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Banking', to: '/accounting/banking' }, { label: 'Reconciliation Statement' }]}
    >
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h2>{data ? `${data.bankAccount.bank_name} — ${data.bankAccount.account_code} ${data.bankAccount.account_name}` : 'Loading…'}</h2>
            {data?.bankAccount.account_number && (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Account #{data.bankAccount.account_number}</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ marginBottom: 0, fontSize: 13 }}>As of</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 'auto' }} />
            {data && <PrintButton />}
          </div>
        </div>
        <div style={{ marginBottom: 4 }}>
          <Link to="/accounting/banking" style={{ fontSize: 13 }}>← Back to Banking</Link>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

      {data && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h2>Reconciliation Result</h2>
              <span className={`badge ${data.isReconciled ? 'badge-success' : 'badge-danger'}`}>
                {data.isReconciled ? 'Reconciled' : `Out of balance by ${money(Math.abs(data.difference))}`}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
              As of {new Date(data.asOf).toLocaleDateString()}. Timing differences — items recorded on one side but not yet reflected
              on the other — are normal; an out-of-balance result after accounting for all of them below means something still needs
              investigating.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8 }}>
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Bank Side</h3>
                <table>
                  <tbody>
                    <tr><td>Balance per bank statement</td><td style={{ textAlign: 'right' }}>{money(data.balancePerBank)}</td></tr>
                    <tr><td>Add: Deposits in transit</td><td style={{ textAlign: 'right' }}>{money(data.depositsInTransitTotal)}</td></tr>
                    <tr><td>Less: Outstanding payments</td><td style={{ textAlign: 'right' }}>({money(data.outstandingPaymentsTotal)})</td></tr>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
                      <td>Adjusted bank balance</td><td style={{ textAlign: 'right' }}>{money(data.adjustedBankBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Book Side</h3>
                <table>
                  <tbody>
                    <tr><td>Balance per books</td><td style={{ textAlign: 'right' }}>{money(data.balancePerBooks)}</td></tr>
                    <tr><td>Add: Unrecorded bank credits</td><td style={{ textAlign: 'right' }}>{money(data.unrecordedBankCreditsTotal)}</td></tr>
                    <tr><td>Less: Unrecorded bank charges</td><td style={{ textAlign: 'right' }}>({money(data.unrecordedBankChargesTotal)})</td></tr>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
                      <td>Adjusted book balance</td><td style={{ textAlign: 'right' }}>{money(data.adjustedBookBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Deposits in Transit</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Recorded in the books, not yet cleared by the bank.</p>
            {data.depositsInTransit.length === 0 ? <p className="dashboard-empty-note">None.</p> : (
              <table>
                <thead><tr><th>Entry</th><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {data.depositsInTransit.map((r) => (
                    <tr key={r.id}>
                      <td>{r.entry_no}</td>
                      <td>{new Date(r.entry_date).toLocaleDateString()}</td>
                      <td>{r.description || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{money(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Outstanding Payments</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>Recorded in the books, not yet cleared by the bank.</p>
            {data.outstandingPayments.length === 0 ? <p className="dashboard-empty-note">None.</p> : (
              <table>
                <thead><tr><th>Entry</th><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {data.outstandingPayments.map((r) => (
                    <tr key={r.id}>
                      <td>{r.entry_no}</td>
                      <td>{new Date(r.entry_date).toLocaleDateString()}</td>
                      <td>{r.description || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{money(Math.abs(r.net))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Unrecorded Bank Credits</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>On the bank statement, not yet recorded in the books.</p>
            {data.unrecordedBankCredits.length === 0 ? <p className="dashboard-empty-note">None.</p> : (
              <table>
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {data.unrecordedBankCredits.map((l) => (
                    <tr key={l.id}>
                      <td>{new Date(l.transaction_date).toLocaleDateString()}</td>
                      <td>{l.description || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Unrecorded Bank Charges</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -8 }}>On the bank statement, not yet recorded in the books.</p>
            {data.unrecordedBankCharges.length === 0 ? <p className="dashboard-empty-note">None.</p> : (
              <table>
                <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {data.unrecordedBankCharges.map((l) => (
                    <tr key={l.id}>
                      <td>{new Date(l.transaction_date).toLocaleDateString()}</td>
                      <td>{l.description || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{money(Math.abs(l.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

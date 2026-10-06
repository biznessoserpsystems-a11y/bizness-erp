import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABEL = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses' };
const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function LedgerReset() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [offsetAccountId, setOffsetAccountId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [lastReset, setLastReset] = useState(null);

  function load(date = asOf) {
    setData(null);
    setFailed('');
    api.get('/ledger-reset/accounts', { params: { asOf: date } })
      .then(({ data: d }) => {
        setData(d);
        setSelected(new Set());
        setOffsetAccountId((cur) => cur || d.defaultOffsetAccountId || '');
      })
      .catch((err) => setFailed(err.response?.data?.error || 'Failed to load accounts'));
  }
  useEffect(() => { load(asOf); /* eslint-disable-next-line */ }, [asOf]);

  const grouped = useMemo(() => {
    const out = {};
    (data?.accounts || []).forEach((a) => { (out[a.account_type] = out[a.account_type] || []).push(a); });
    return out;
  }, [data]);

  const chosen = (data?.accounts || []).filter((a) => selected.has(a.id));
  const net = chosen.reduce((s, a) => s + a.balance, 0);
  const needsOffset = Math.abs(net) > 0.004;
  const everythingChosen = data && data.accounts.length > 0 && chosen.length === data.accounts.length;

  function toggle(id) {
    setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function setMany(accounts, on) {
    setSelected((cur) => { const next = new Set(cur); accounts.forEach((a) => (on ? next.add(a.id) : next.delete(a.id))); return next; });
  }

  async function handleReset() {
    const ok = await confirm(
      `Set ${chosen.length} account${chosen.length === 1 ? '' : 's'} to zero as of ${asOf}? One adjusting journal entry is posted. Nothing is deleted, and the entry can be reversed from Journal Entries if you change your mind.`,
      { danger: true, confirmLabel: 'Reset to zero' }
    );
    if (!ok) return;
    setWorking(true);
    try {
      const { data: res } = await api.post('/ledger-reset', {
        accountIds: chosen.map((a) => a.id), asOf, confirm: confirmText,
        offsetAccountId: needsOffset ? offsetAccountId : undefined,
      });
      setLastReset(res);
      setConfirmText('');
      showToast(`${res.accountsReset} account(s) reset to zero (entry ${res.entryNo}).`, 'success');
      load(asOf);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reset the ledger', 'error');
    } finally {
      setWorking(false);
    }
  }

  const canSubmit = chosen.length > 0 && confirmText === 'RESET' && (!needsOffset || offsetAccountId) && !working;

  if (failed) return <DashboardLayout title="Reset Ledger Balances"><div className="card"><div className="error-banner">{failed}</div></div></DashboardLayout>;

  return (
    <DashboardLayout title="Reset Ledger Balances">
      <div className="card">
        <div className="card-header"><h2>Reset chosen ledgers to zero</h2></div>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          Pick the accounts whose figures you want cleared and they are set to zero with a single adjusting journal entry.
          Nothing is deleted: the original entries stay in the ledger and the reset appears as its own entry, which you can
          reverse from Journal Entries to bring the figures back. Whatever the chosen accounts add up to is moved to an equity
          account so the books still balance (choose every account and nothing needs moving). Reports for periods that end
          before the date below still show the original figures. Resetting cash or bank accounts changes your book balance,
          not the real money in the bank.
        </p>
        <div className="form-group" style={{ maxWidth: 220 }}>
          <label>Reset as of</label>
          <input type="date" value={asOf} max={today()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </div>
      </div>

      {lastReset && (
        <div className="success-banner" style={{ marginBottom: 16 }}>
          Done: {lastReset.accountsReset} account(s) reset in journal entry {lastReset.entryNo}. To undo, reverse that entry under Journal Entries.
        </div>
      )}

      <div className="card">
        {!data ? <p>Loading...</p> : data.accounts.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Every account is already at zero as of {asOf}.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setMany(data.accounts, true)}>Select all</button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setMany(data.accounts, false)}>Clear selection</button>
            </div>
            {TYPE_ORDER.filter((t) => grouped[t]).map((type) => (
              <div key={type} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h3 style={{ margin: 0 }}>{TYPE_LABEL[type]}</h3>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setMany(grouped[type], !grouped[type].every((a) => selected.has(a.id)))}>
                    {grouped[type].every((a) => selected.has(a.id)) ? 'Unselect group' : 'Select group'}
                  </button>
                </div>
                <table>
                  <thead><tr><th style={{ width: 40 }}></th><th>Code</th><th>Account</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                  <tbody>
                    {grouped[type].map((a) => (
                      <tr key={a.id} onClick={() => toggle(a.id)} style={{ cursor: 'pointer' }}>
                        <td><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} onClick={(e) => e.stopPropagation()} style={{ width: 'auto' }} /></td>
                        <td>{a.account_code}</td>
                        <td>{a.account_name}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>GHS {fmt(Math.abs(a.balance))} {a.balance >= 0 ? 'Dr' : 'Cr'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}
      </div>

      {data && data.accounts.length > 0 && (
        <div className="card">
          <div className="card-header"><h2>Confirm</h2></div>
          <p style={{ marginTop: 0 }}>
            <strong>{chosen.length}</strong> account{chosen.length === 1 ? '' : 's'} selected.
            {chosen.length > 0 && (needsOffset
              ? <> They add up to <strong>GHS {fmt(Math.abs(net))} {net > 0 ? 'Dr' : 'Cr'}</strong>, which will be moved to the equity account below.</>
              : <> They add up to zero{everythingChosen ? ' (every account), so nothing needs moving.' : ', so nothing needs moving.'}</>)}
          </p>
          {needsOffset && (
            <div className="form-group" style={{ maxWidth: 420 }}>
              <label>Move the difference to this equity account</label>
              <select value={offsetAccountId} onChange={(e) => setOffsetAccountId(e.target.value)}>
                <option value="">Select an equity account...</option>
                {data.equityAccounts.filter((e) => !selected.has(e.id)).map((e) => (
                  <option key={e.id} value={e.id}>{e.account_code} — {e.account_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group" style={{ maxWidth: 260 }}>
            <label>Type RESET to confirm</label>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" />
          </div>
          <button type="button" className="btn btn-danger" style={{ width: 'auto' }} disabled={!canSubmit} onClick={handleReset}>
            {working ? 'Resetting...' : 'Reset selected ledgers to zero'}
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}

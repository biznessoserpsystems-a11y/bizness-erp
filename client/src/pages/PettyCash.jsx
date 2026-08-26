import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, PieChartWidget, formatMoney } from '../components/charts';

export default function PettyCash() {
  const [accounts, setAccounts] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/petty-cash-accounts'), api.get('/chart-of-accounts')])
      .then(([p, c]) => {
        setAccounts(p.data);
        setGlAccounts(c.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openDetail(account) {
    const [vouchersRes, receiptsRes] = await Promise.all([
      api.get(`/petty-cash-accounts/${account.id}/vouchers`),
      api.get(`/petty-cash-accounts/${account.id}/receipts`),
    ]);
    setDetail({ account, vouchers: vouchersRes.data, receipts: receiptsRes.data });
  }

  if (detail) {
    return <PettyCashDetailView detail={detail} glAccounts={glAccounts} onBack={() => { setDetail(null); load(); }} onRefresh={() => openDetail(detail.account)} />;
  }

  return (
    <DashboardLayout title="Petty Cash" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Petty Cash' }]}>
      {!loading && accounts.length > 0 && (
        <BarChartWidget
          title="Float vs. spent by account"
          data={accounts.map((a) => ({ name: a.name, Float: Number(a.float_amount), Spent: Number(a.total_spent) }))}
          bars={[{ key: 'Float', label: 'Float', color: '#2B6CB0' }, { key: 'Spent', label: 'Spent', color: '#B3261E' }]}
          valueFormatter={(v) => formatMoney(v)}
          height={260}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Petty cash accounts</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add account</button>
        </div>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead><tr><th>Name</th><th>Custodian</th><th>Float</th><th>Received</th><th>Spent</th><th>Balance</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.first_name ? `${a.first_name} ${a.last_name}` : '—'}</td>
                  <td>GHS {Number(a.float_amount).toFixed(2)}</td>
                  <td>GHS {Number(a.total_receipts).toFixed(2)}</td>
                  <td>GHS {Number(a.total_spent).toFixed(2)}</td>
                  <td><span className={`badge ${Number(a.balance) > 0 ? 'badge-success' : 'badge-danger'}`}>GHS {Number(a.balance).toFixed(2)}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(a)}>Vouchers</button></td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No petty cash accounts yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <PettyCashModal glAccounts={glAccounts} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </DashboardLayout>
  );
}

function PettyCashModal({ glAccounts, onClose, onSaved }) {
  const assetAccounts = glAccounts.filter((a) => a.account_type === 'asset');
  const [form, setForm] = useState({ accountId: '', name: '', floatAmount: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/petty-cash-accounts', { ...form, floatAmount: Number(form.floatAmount) || 0 });
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
        <h2>Add petty cash account</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Linked GL cash account</label>
            <select value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))} required>
              <option value="">Select</option>
              {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Float amount (GHS)</label>
            <input type="number" step="0.01" value={form.floatAmount} onChange={(e) => setForm((f) => ({ ...f, floatAmount: e.target.value }))} required />
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

function PettyCashDetailView({ detail, glAccounts, onBack, onRefresh }) {
  const expenseAccounts = glAccounts.filter((a) => a.account_type === 'expense');
  const [section, setSection] = useState('vouchers');
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => { api.get('/bank-accounts').then(({ data }) => setBankAccounts(data)).catch(() => setBankAccounts([])); }, []);

  return (
    <DashboardLayout title={`Petty Cash — ${detail.account.name}`}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to petty cash</button>

      {detail.vouchers.length > 0 && (
        <PieChartWidget
          title="Spend by expense account"
          data={Object.values(
            detail.vouchers.reduce((acc, v) => {
              const key = v.expense_account_name;
              acc[key] = acc[key] || { name: key, value: 0 };
              acc[key].value += Number(v.amount);
              return acc;
            }, {})
          )}
          valueFormatter={(v) => formatMoney(v)}
          height={260}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2>Balance: GHS {Number(detail.account.balance).toFixed(2)}</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          A real running balance — opening float (GHS {Number(detail.account.float_amount).toFixed(2)}) plus every receipt, minus every voucher paid out.
        </p>
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <button className={section === 'vouchers' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSection('vouchers')}>Payments (Vouchers)</button>
          <button className={section === 'receipts' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setSection('receipts')}>Receipts</button>
        </div>

        {section === 'vouchers' && (
          <>
            <div className="card-header"><h3 style={{ margin: 0 }}>Payments (Expenses)</h3><button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setShowVoucherModal(true)}>+ New Payment</button></div>
            <table>
              <thead><tr><th>Voucher #</th><th>Date</th><th>Payee</th><th>Description</th><th>Expense account</th><th>Amount</th></tr></thead>
              <tbody>
                {detail.vouchers.map((v) => (
                  <tr key={v.id}>
                    <td>{v.voucher_no}</td>
                    <td>{new Date(v.voucher_date).toLocaleDateString()}</td>
                    <td>{v.payee || '—'}</td>
                    <td>{v.description}</td>
                    <td>{v.expense_account_name}</td>
                    <td>GHS {Number(v.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {detail.vouchers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No payments yet.</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {section === 'receipts' && (
          <>
            <div className="card-header"><h3 style={{ margin: 0 }}>Receipts</h3><button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setShowReceiptModal(true)}>+ New Receipt</button></div>
            <table>
              <thead><tr><th>Receipt #</th><th>Date</th><th>Received From</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
              <tbody>
                {detail.receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.receipt_no}</td>
                    <td>{new Date(r.receipt_date).toLocaleDateString()}</td>
                    <td>{r.received_from || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.payment_method.replace('_', ' ')}{r.bank_name ? ` — ${r.bank_name}` : ''}</td>
                    <td>{r.reference_no || '—'}</td>
                    <td>GHS {Number(r.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {detail.receipts.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No receipts yet.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>

      {showVoucherModal && (
        <VoucherModal
          accountId={detail.account.id}
          expenseAccounts={expenseAccounts}
          onClose={() => setShowVoucherModal(false)}
          onSaved={() => { setShowVoucherModal(false); onRefresh(); }}
        />
      )}
      {showReceiptModal && (
        <ReceiptModal
          accountId={detail.account.id}
          bankAccounts={bankAccounts}
          onClose={() => setShowReceiptModal(false)}
          onSaved={() => { setShowReceiptModal(false); onRefresh(); }}
        />
      )}
    </DashboardLayout>
  );
}

function VoucherModal({ accountId, expenseAccounts, onClose, onSaved }) {
  const [form, setForm] = useState({ payee: '', description: '', amount: '', expenseAccountId: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/petty-cash-accounts/${accountId}/vouchers`, { ...form, amount: Number(form.amount) });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create voucher');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New petty cash voucher</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Payee</label>
            <input value={form.payee} onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Amount (GHS)</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Expense account</label>
            <select value={form.expenseAccountId} onChange={(e) => setForm((f) => ({ ...f, expenseAccountId: e.target.value }))} required>
              <option value="">Select</option>
              {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save voucher'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiptModal({ accountId, bankAccounts, onClose, onSaved }) {
  const [form, setForm] = useState({ receivedFrom: '', paymentMethod: 'cash', bankAccountId: '', referenceNo: '', amount: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const needsBankAccount = form.paymentMethod !== 'cash';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/petty-cash-accounts/${accountId}/receipts`, { ...form, amount: Number(form.amount), bankAccountId: needsBankAccount ? form.bankAccountId : null });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record receipt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New petty cash receipt</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Received from</label>
            <input value={form.receivedFrom} onChange={(e) => setForm((f) => ({ ...f, receivedFrom: e.target.value }))} placeholder="e.g. Owner top-up, Main Cashier" />
          </div>
          <div className="form-group">
            <label>Payment method</label>
            <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value, bankAccountId: '' }))}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
            </select>
          </div>
          {needsBankAccount && (
            <div className="form-group">
              <label>Bank account</label>
              <select value={form.bankAccountId} onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))} required>
                <option value="">Select</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Reference # <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input value={form.referenceNo} onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))} placeholder="Cheque #, MoMo transaction ID, etc." />
          </div>
          <div className="form-group">
            <label>Amount (GHS)</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save receipt'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

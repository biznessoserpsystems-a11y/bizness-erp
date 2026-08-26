import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, formatMoney } from '../components/charts';

export default function Customers() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canManage = hasPermission('sales.customers.manage');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalCustomer, setModalCustomer] = useState(null);

  function load() {
    setLoading(true);
    api.get('/customers').then(({ data }) => setCustomers(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Customers">
      {!loading && customers.some((c) => Number(c.outstanding_balance) > 0) && (
        <BarChartWidget
          title="Highest outstanding balances"
          data={[...customers]
            .filter((c) => Number(c.outstanding_balance) > 0)
            .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance))
            .slice(0, 8)
            .map((c) => ({ name: c.name, balance: Number(c.outstanding_balance) }))}
          bars={[{ key: 'balance', label: 'Outstanding' }]}
          colorByCategory
          horizontal
          valueFormatter={(v) => formatMoney(v)}
          height={260}
        />
      )}
      <div className="card">
        <div className="card-header">
          <h2>Customer accounts</h2>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalCustomer({})}>
              + Add customer
            </button>
          )}
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Credit limit</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const overLimit = Number(c.credit_limit) > 0 && Number(c.outstanding_balance) > Number(c.credit_limit);
                return (
                  <tr key={c.id}>
                    <td>{c.customer_code}</td>
                    <td>{c.name}</td>
                    <td>{c.phone || c.email || '—'}</td>
                    <td>GHS {Number(c.credit_limit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`badge ${overLimit ? 'badge-danger' : 'badge-neutral'}`}>
                        GHS {Number(c.outstanding_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/sales/customers/${c.id}`)}>View profile</button>{' '}
                      {canManage && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setModalCustomer(c)}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {customers.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalCustomer && (
        <CustomerModal
          customer={modalCustomer}
          onClose={() => setModalCustomer(null)}
          onSaved={() => {
            setModalCustomer(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function CustomerModal({ customer, onClose, onSaved }) {
  const isNew = !customer.id;
  const [form, setForm] = useState({
    customerCode: customer.customer_code || '',
    name: customer.name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || '',
    city: customer.city || '',
    region: customer.region || '',
    tin: customer.tin || '',
    creditLimit: customer.credit_limit || 0,
    paymentTermsDays: customer.payment_terms_days || 0,
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
      if (isNew) await api.post('/customers', form);
      else await api.patch(`/customers/${customer.id}`, form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add customer' : 'Edit customer'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Customer code</label>
            <input value={form.customerCode} onChange={update('customerCode')} required disabled={!isNew} />
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={update('email')} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={form.phone} onChange={update('phone')} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address} onChange={update('address')} />
          </div>
          <div className="form-group">
            <label>City</label>
            <input value={form.city} onChange={update('city')} />
          </div>
          <div className="form-group">
            <label>Region</label>
            <input value={form.region} onChange={update('region')} />
          </div>
          <div className="form-group">
            <label>TIN</label>
            <input value={form.tin} onChange={update('tin')} />
          </div>
          <div className="form-group">
            <label>Credit limit (GHS, 0 = cash only)</label>
            <input type="number" step="0.01" value={form.creditLimit} onChange={update('creditLimit')} />
          </div>
          <div className="form-group">
            <label>Payment terms (days)</label>
            <input type="number" value={form.paymentTermsDays} onChange={update('paymentTermsDays')} />
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


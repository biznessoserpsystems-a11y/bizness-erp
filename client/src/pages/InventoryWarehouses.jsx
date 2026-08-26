import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function InventoryWarehouses() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('inventory.warehouses.manage');
  const [warehouses, setWarehouses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalWarehouse, setModalWarehouse] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([api.get('/warehouses'), api.get('/branches')])
      .then(([w, b]) => {
        setWarehouses(w.data);
        setBranches(b.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Warehouses">
      <div className="card">
        <div className="card-header">
          <h2>Storage locations</h2>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalWarehouse({})}>
              + Add warehouse
            </button>
          )}
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Branch</th>
                <th>Location</th>
                <th>Status</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.code || '—'}</td>
                  <td>{w.branch_name || '—'}</td>
                  <td>{w.location || '—'}</td>
                  <td>
                    <span className={`badge ${w.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setModalWarehouse(w)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {warehouses.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No warehouses yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalWarehouse && (
        <WarehouseModal
          warehouse={modalWarehouse}
          branches={branches}
          onClose={() => setModalWarehouse(null)}
          onSaved={() => {
            setModalWarehouse(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function WarehouseModal({ warehouse, branches, onClose, onSaved }) {
  const isNew = !warehouse.id;
  const [form, setForm] = useState({
    name: warehouse.name || '',
    code: warehouse.code || '',
    branchId: warehouse.branch_id || '',
    location: warehouse.location || '',
    isActive: warehouse.is_active ?? true,
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
      if (isNew) {
        await api.post('/warehouses', form);
      } else {
        await api.patch(`/warehouses/${warehouse.id}`, form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save warehouse');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add warehouse' : 'Edit warehouse'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="form-group">
            <label>Code</label>
            <input value={form.code} onChange={update('code')} placeholder="e.g. WH-01" />
          </div>
          <div className="form-group">
            <label>Branch</label>
            <select value={form.branchId} onChange={update('branchId')}>
              <option value="">None</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Location / address</label>
            <input value={form.location} onChange={update('location')} />
          </div>
          {!isNew && (
            <div className="checkbox-row">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <label style={{ margin: 0 }}>Active</label>
            </div>
          )}
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

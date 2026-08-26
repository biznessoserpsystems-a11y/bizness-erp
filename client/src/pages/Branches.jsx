import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Branches() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('system.company.manage');
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalBranch, setModalBranch] = useState(null);

  function load() {
    setLoading(true);
    api.get('/branches').then(({ data }) => setBranches(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <DashboardLayout title="Branches">
      <div className="card">
        <div className="card-header">
          <h2>Locations</h2>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalBranch({})}>
              + Add branch
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
                <th>City / Region</th>
                <th>Phone</th>
                <th>Status</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name} {b.is_head_office && <span className="badge badge-neutral">HQ</span>}</td>
                  <td>{b.code || '—'}</td>
                  <td>{[b.city, b.region].filter(Boolean).join(', ') || '—'}</td>
                  <td>{b.phone || '—'}</td>
                  <td>
                    <span className={`badge ${b.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setModalBranch(b)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalBranch && (
        <BranchModal
          branch={modalBranch}
          onClose={() => setModalBranch(null)}
          onSaved={() => {
            setModalBranch(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function BranchModal({ branch, onClose, onSaved }) {
  const isNew = !branch.id;
  const [form, setForm] = useState({
    name: branch.name || '',
    code: branch.code || '',
    address: branch.address || '',
    city: branch.city || '',
    region: branch.region || '',
    phone: branch.phone || '',
    isActive: branch.is_active ?? true,
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
        await api.post('/branches', form);
      } else {
        await api.patch(`/branches/${branch.id}`, form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save branch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add branch' : 'Edit branch'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Branch name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="form-group">
            <label>Code</label>
            <input value={form.code} onChange={update('code')} placeholder="e.g. KMS-01" />
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
            <label>Phone</label>
            <input value={form.phone} onChange={update('phone')} />
          </div>
          {!isNew && (
            <div className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <label style={{ margin: 0 }}>Active</label>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalUser, setModalUser] = useState(null); // null = closed, {} = new, {...} = edit
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/users'), api.get('/roles')])
      .then(([u, r]) => {
        setUsers(u.data);
        setRoles(r.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDeactivate(id) {
    const ok = await confirm('Deactivate this user? They will lose access immediately.', { danger: true, confirmLabel: 'Deactivate' });
    if (!ok) return;
    try {
      await api.delete(`/users/${id}`);
      load();
      showToast('User deactivated.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to deactivate user', 'error');
    }
  }

  return (
    <DashboardLayout title="Users">
      <div className="card">
        <div className="card-header">
          <h2>Team members</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalUser({})}>
            + Add user
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>MFA</th>
                <th>Status</th>
                <th>Last login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.first_name} {u.last_name}</td>
                  <td>{u.email}</td>
                  <td>{u.roles.join(', ') || '—'}</td>
                  <td>
                    <span className={`badge ${u.mfa_enabled ? 'badge-success' : 'badge-neutral'}`}>
                      {u.mfa_enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setModalUser(u)}>
                      Edit
                    </button>{' '}
                    {u.is_active && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(u.id)}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalUser && (
        <UserModal
          user={modalUser}
          roles={roles}
          onClose={() => setModalUser(null)}
          onSaved={() => {
            setModalUser(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function UserModal({ user, roles, onClose, onSaved }) {
  const isNew = !user.id;
  const [firstName, setFirstName] = useState(user.first_name || '');
  const [lastName, setLastName] = useState(user.last_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isNew) {
      // Map role names back to ids for the checkboxes.
      const currentIds = roles.filter((r) => user.roles.includes(r.name)).map((r) => r.id);
      setRoleIds(currentIds);
    }
  }, []);

  function toggleRole(id) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isNew) {
        await api.post('/users', { firstName, lastName, email, password, roleIds });
      } else {
        await api.patch(`/users/${user.id}`, { firstName, lastName, roleIds });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add user' : 'Edit user'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!isNew} />
          </div>
          {isNew && (
            <div className="form-group">
              <label>Temporary password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <div className="form-group">
            <label>Roles</label>
            <div className="permission-grid" style={{ gridTemplateColumns: '1fr' }}>
              {roles.map((r) => (
                <label key={r.id}>
                  <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
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

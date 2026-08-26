import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { groupPermissionsByModule, deriveAccessLevel, applyModuleLevel } from '../moduleAccessLevels';
import { useToast } from '../context/ToastContext';

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalRole, setModalRole] = useState(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    Promise.all([api.get('/roles'), api.get('/permissions')])
      .then(([r, p]) => {
        setRoles(r.data);
        setPermissions(p.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(role) {
    const ok = await confirm(`Delete the "${role.name}" role? Users assigned to it will lose those permissions.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/roles/${role.id}`);
      load();
      showToast('Role deleted.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete role', 'error');
    }
  }

  return (
    <DashboardLayout title="Roles & Permissions">
      <div className="card">
        <div className="card-header">
          <h2>Roles</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalRole({})}>
            + Add role
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Permissions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    {r.is_system_role && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>system</span>}
                  </td>
                  <td>{r.description || '—'}</td>
                  <td>{r.permissions.length} of {permissions.length}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setModalRole(r)}
                      disabled={r.is_system_role}
                    >
                      Edit
                    </button>{' '}
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(r)}
                      disabled={r.is_system_role}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalRole && (
        <RoleModal
          role={modalRole}
          permissions={permissions}
          onClose={() => setModalRole(null)}
          onSaved={() => {
            setModalRole(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function RoleModal({ role, permissions, onClose, onSaved }) {
  const isNew = !role.id;
  const [name, setName] = useState(role.name || '');
  const [description, setDescription] = useState(role.description || '');
  const [permissionIds, setPermissionIds] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('byModule');

  const moduleGroups = groupPermissionsByModule(permissions);

  useEffect(() => {
    if (!isNew) {
      const currentIds = permissions.filter((p) => role.permissions.includes(p.code)).map((p) => p.id);
      setPermissionIds(currentIds);
    }
  }, []);

  function togglePermission(id) {
    setPermissionIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleModuleLevelChange(moduleGroup, newLevel) {
    setPermissionIds((prev) => applyModuleLevel(moduleGroup, prev, newLevel));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isNew) {
        await api.post('/roles', { name, description, permissionIds });
      } else {
        await api.patch(`/roles/${role.id}`, { name, description, permissionIds });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save role');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add role' : 'Edit role'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Role name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Permissions</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" className={`btn btn-sm ${viewMode === 'byModule' ? 'btn-primary' : 'btn-secondary'}`} style={{ width: 'auto' }} onClick={() => setViewMode('byModule')}>
                By module
              </button>
              <button type="button" className={`btn btn-sm ${viewMode === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ width: 'auto' }} onClick={() => setViewMode('all')}>
                All permissions
              </button>
            </div>

            {viewMode === 'byModule' ? (
              <table>
                <thead>
                  <tr><th>Module</th><th>Access</th></tr>
                </thead>
                <tbody>
                  {moduleGroups.map((group) => {
                    const level = deriveAccessLevel(group, permissionIds);
                    return (
                      <tr key={group.module}>
                        <td style={{ textTransform: 'capitalize' }}>{group.module.replace(/_/g, ' ')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {group.availableLevels.map((lvl) => (
                              <label key={lvl} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
                                <input
                                  type="radio"
                                  name={`module-access-${group.module}`}
                                  checked={level === lvl}
                                  onChange={() => handleModuleLevelChange(group, lvl)}
                                />
                                {lvl === 'none' ? 'No access' : lvl === 'view' ? 'View' : 'Edit'}
                              </label>
                            ))}
                            {level === 'custom' && (
                              <span className="badge badge-neutral" title="This role has a hand-picked mix of permissions for this module that doesn't match any single level below. Pick a level here to replace it with a clean one.">
                                Custom
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="permission-grid">
                {permissions.map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" checked={permissionIds.includes(p.id)} onChange={() => togglePermission(p.id)} />
                    {p.code}
                  </label>
                ))}
              </div>
            )}
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

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import AttachmentsPanel from '../components/AttachmentsPanel';

const STATUS_BADGE = { open: 'badge-neutral', done: 'badge-success', cancelled: 'badge-danger' };
const PRIORITY_BADGE = { low: 'badge-neutral', normal: 'badge-info', high: 'badge-danger' };

export default function Tasks() {
  const { user } = useAuth();
  const canManageAll = (user?.permissions || []).includes('tasks.manage_all');
  const canSeeUsers = (user?.permissions || []).includes('system.users.manage');

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [showModal, setShowModal] = useState(false);
  const [filesTask, setFilesTask] = useState(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    setLoading(true);
    const q = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
    api.get(`/tasks${q}`).then(({ data }) => setTasks(data)).finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  useEffect(() => {
    if (canManageAll && canSeeUsers) {
      api.get('/users').then(({ data }) => setUsers(data)).catch(() => {});
    }
  }, [canManageAll, canSeeUsers]);

  async function toggleDone(task) {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: nextStatus });
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update task', 'error');
    }
  }

  async function handleDelete(task) {
    const ok = await confirm(`Delete "${task.title}"?`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      load();
      showToast('Task deleted.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete task', 'error');
    }
  }

  const isOverdue = (t) => t.status === 'open' && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());

  return (
    <DashboardLayout title="Tasks" subtitle={canManageAll ? 'Everyone\u2019s tasks' : 'Your tasks'}>
      <div className="card">
        <div className="card-header">
          <h2>Tasks</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New task</button>
        </div>

        <div className="toolbar">
          {[
            { key: 'open', label: 'Open' },
            { key: 'done', label: 'Done' },
            { key: 'cancelled', label: 'Cancelled' },
            { key: 'all', label: 'All' },
          ].map((t) => (
            <button
              key={t.key}
              className={statusFilter === t.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ width: 'auto' }}
              onClick={() => setStatusFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h3>Nothing here</h3>
            <p>{statusFilter === 'open' ? 'No open tasks \u2014 create one to get started.' : 'No tasks match this filter.'}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Priority</th>
                <th>Due</th>
                {canManageAll && <th>Assigned to</th>}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleDone(t)} aria-label={`Mark "${t.title}" ${t.status === 'done' ? 'open' : 'done'}`} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--color-text-muted)' : 'inherit' }}>{t.title}</div>
                    {t.notes && <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{t.notes}</div>}
                  </td>
                  <td><span className={`badge ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span></td>
                  <td>
                    {t.due_date ? (
                      <span className={isOverdue(t) ? 'badge badge-danger' : ''}>{new Date(t.due_date).toLocaleDateString()}</span>
                    ) : '\u2014'}
                  </td>
                  {canManageAll && <td>{t.assignee_first_name ? `${t.assignee_first_name} ${t.assignee_last_name}` : '\u2014'}</td>}
                  <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setFilesTask(t)}>Files</button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <TaskModal
          users={users}
          canManageAll={canManageAll}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {filesTask && (
        <div className="modal-overlay" onClick={() => setFilesTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Files &mdash; {filesTask.title}</h2>
            <AttachmentsPanel relatedType="task" relatedId={filesTask.id} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setFilesTask(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function TaskModal({ users, canManageAll, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/tasks', {
        title, notes: notes || undefined, dueDate: dueDate || undefined, priority,
        assignedTo: assignedTo || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New task</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
          {canManageAll && users.length > 0 && (
            <div className="form-group">
              <label>Assign to</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Myself</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

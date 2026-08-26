import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ENTITY_TYPE_OPTIONS = [
  { value: 'purchase_requisition', label: 'Purchase Requisition' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'journal_entry', label: 'Journal Entry' },
  { value: 'leave_request', label: 'Leave Request' },
  { value: 'expense_claim', label: 'Expense Claim' },
];

const STATUS_BADGE = { pending: 'badge-neutral', approved: 'badge-success', rejected: 'badge-danger', cancelled: 'badge-neutral' };

export default function ApprovalWorkflows() {
  const { hasPermission } = useAuth();
  const canConfigure = hasPermission('workflows.definitions.manage');
  const [tab, setTab] = useState('my-approvals');

  return (
    <DashboardLayout title="Approval Workflows">
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ display: 'flex', gap: 4, padding: 8 }}>
          {[
            ['my-approvals', 'My Approvals'],
            ...(canConfigure ? [['configuration', 'Configure Workflows']] : []),
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto' }}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'my-approvals' && <MyApprovalsTab />}
      {tab === 'configuration' && canConfigure && <ConfigurationTab />}
    </DashboardLayout>
  );
}

function MyApprovalsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [comment, setComment] = useState('');

  function load() {
    setLoading(true);
    api.get('/workflow-instances/my-approvals').then((r) => setItems(r.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function act(id, action) {
    await api.post(`/workflow-instances/${id}/action`, { action, comment: comment || undefined });
    setActingId(null);
    setComment('');
    load();
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Awaiting your approval</h2>
      </div>
      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Item</th><th>Workflow step</th><th>Submitted by</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <a href={it.entity_link}>{it.entity_label}</a>
                </td>
                <td>{it.step_name}</td>
                <td>{it.submitted_by_first_name ? `${it.submitted_by_first_name} ${it.submitted_by_last_name}` : '—'}</td>
                <td>{new Date(it.created_at).toLocaleDateString()}</td>
                <td>
                  {actingId === it.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        placeholder="Comment (optional)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        style={{ width: 160 }}
                      />
                      <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => act(it.id, 'approved')}>Approve</button>
                      <button className="btn btn-danger btn-sm" style={{ width: 'auto' }} onClick={() => act(it.id, 'rejected')}>Reject</button>
                      <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => { setActingId(null); setComment(''); }}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setActingId(it.id)}>Act</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Nothing awaiting your approval.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ConfigurationTab() {
  const [definitions, setDefinitions] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { entityType, name, isActive, steps: [...] } or null

  function load() {
    setLoading(true);
    Promise.all([api.get('/workflow-definitions'), api.get('/permissions')])
      .then(([d, p]) => { setDefinitions(d.data); setPermissions(p.data); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startNew(entityType) {
    const existing = definitions.find((d) => d.entity_type === entityType);
    if (existing) {
      setEditing({
        entityType,
        name: existing.name,
        isActive: existing.is_active,
        steps: existing.steps.map((s) => ({ name: s.name, approverPermissionCode: s.approver_permission_code, minAmount: s.min_amount })),
      });
    } else {
      setEditing({
        entityType,
        name: `${ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType).label} Approval`,
        isActive: true,
        steps: [{ name: 'Step 1', approverPermissionCode: '', minAmount: 0 }],
      });
    }
  }

  function updateStep(idx, field, value) {
    setEditing((e) => ({ ...e, steps: e.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)) }));
  }

  function addStep() {
    setEditing((e) => ({ ...e, steps: [...e.steps, { name: `Step ${e.steps.length + 1}`, approverPermissionCode: '', minAmount: 0 }] }));
  }

  function removeStep(idx) {
    setEditing((e) => ({ ...e, steps: e.steps.filter((_, i) => i !== idx) }));
  }

  async function save() {
    await api.post('/workflow-definitions', editing);
    setEditing(null);
    load();
  }

  async function toggleActive(def) {
    await api.patch(`/workflow-definitions/${def.id}/active`, { isActive: !def.is_active });
    load();
  }

  if (loading) return <div className="card"><p>Loading...</p></div>;

  if (editing) {
    return (
      <div className="card">
        <div className="card-header"><h2>{editing.name || 'New workflow'}</h2></div>
        <label>Entity type</label>
        <select value={editing.entityType} disabled style={{ marginBottom: 12 }}>
          <option value={editing.entityType}>{ENTITY_TYPE_OPTIONS.find((o) => o.value === editing.entityType)?.label}</option>
        </select>
        <label>Workflow name</label>
        <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ marginBottom: 12 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
          Active
        </label>

        <h3 style={{ marginBottom: 8 }}>Approval steps (in order)</h3>
        {editing.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 24 }}>{i + 1}.</span>
            <input placeholder="Step name" value={s.name} onChange={(e) => updateStep(i, 'name', e.target.value)} style={{ flex: 1 }} />
            <select value={s.approverPermissionCode} onChange={(e) => updateStep(i, 'approverPermissionCode', e.target.value)} style={{ flex: 2 }}>
              <option value="">Select approver permission...</option>
              {permissions.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.description}</option>)}
            </select>
            <input
              type="number"
              placeholder="Min amount"
              value={s.minAmount}
              onChange={(e) => updateStep(i, 'minAmount', e.target.value)}
              style={{ width: 120 }}
              title="Only require this step once the record's amount reaches this threshold (0 = always required)"
            />
            <button className="btn btn-danger btn-sm" style={{ width: 'auto' }} onClick={() => removeStep(i)} disabled={editing.steps.length === 1}>Remove</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginBottom: 16 }} onClick={addStep}>+ Add step</button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={save} disabled={editing.steps.some((s) => !s.approverPermissionCode)}>Save workflow</button>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Configured workflows</h2>
      </div>
      <table>
        <thead><tr><th>Entity type</th><th>Workflow</th><th>Steps</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {ENTITY_TYPE_OPTIONS.map((opt) => {
            const def = definitions.find((d) => d.entity_type === opt.value);
            return (
              <tr key={opt.value}>
                <td>{opt.label}</td>
                <td>{def ? def.name : <span style={{ color: 'var(--color-text-muted)' }}>Not configured — falls back to the module's own approval</span>}</td>
                <td>{def ? def.steps.map((s) => s.name).join(' → ') : '—'}</td>
                <td>{def && <span className={`badge ${def.is_active ? 'badge-success' : 'badge-neutral'}`}>{def.is_active ? 'active' : 'inactive'}</span>}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => startNew(opt.value)}>{def ? 'Edit' : 'Set up'}</button>
                  {def && (
                    <>{' '}<button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => toggleActive(def)}>{def.is_active ? 'Deactivate' : 'Activate'}</button></>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'scorecards', label: 'Supplier Scorecards' },
  { key: 'groups', label: 'Supplier Groups' },
];

export default function SupplierManagement() {
  const [tab, setTab] = useState('scorecards');

  return (
    <DashboardLayout title="Supplier Management">
      <div className="toolbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ width: 'auto' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scorecards' && <ScorecardOverview />}
      {tab === 'groups' && <SupplierGroups />}
    </DashboardLayout>
  );
}

function ScorecardOverview() {
  const [suppliers, setSuppliers] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/suppliers').then(async ({ data }) => {
      setSuppliers(data);
      const active = data.filter((s) => s.is_active);
      const results = await Promise.all(active.map((s) => api.get(`/suppliers/${s.id}/scorecard`).then(({ data }) => data).catch(() => null)));
      const byId = {};
      active.forEach((s, i) => { byId[s.id] = results[i]; });
      setScores(byId);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading...</p>;

  const activeSuppliers = suppliers.filter((s) => s.is_active);
  const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`);

  return (
    <div className="card">
      <h2>Scorecards across all active suppliers</h2>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Ranked by total spend. On-time delivery and return rate only reflect orders/invoices that already have goods receipts or invoices to measure against.
      </p>
      <table>
        <thead>
          <tr>
            <th>Supplier</th><th>Group</th><th>Total spend</th><th>On-time delivery</th><th>Avg lead time</th><th>Return rate</th><th>Price vs. avg</th>
          </tr>
        </thead>
        <tbody>
          {[...activeSuppliers]
            .sort((a, b) => (scores[b.id]?.totalSpend || 0) - (scores[a.id]?.totalSpend || 0))
            .map((s) => {
              const sc = scores[s.id];
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.group_name || '—'}</td>
                  <td>{sc ? `GHS ${Number(sc.totalSpend).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td>{sc ? fmtPct(sc.onTimeDeliveryRatePercent) : '—'}</td>
                  <td>{sc && sc.avgLeadTimeDays !== null ? `${sc.avgLeadTimeDays.toFixed(1)} days` : '—'}</td>
                  <td>{sc ? fmtPct(sc.returnRatePercent) : '—'}</td>
                  <td>{sc && sc.priceVariancePercent !== null ? `${sc.priceVariancePercent > 0 ? '+' : ''}${sc.priceVariancePercent.toFixed(1)}%` : '—'}</td>
                </tr>
              );
            })}
          {activeSuppliers.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No active suppliers yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SupplierGroups() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('procurement.suppliers.manage');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGroup, setEditGroup] = useState(null);

  function load() {
    setLoading(true);
    api.get('/supplier-groups').then(({ data }) => setGroups(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Supplier groups</h2>
        {canManage && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { setEditGroup({}); setShowForm(true); }}>
            + Add group
          </button>
        )}
      </div>

      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Name</th><th>Description</th><th>Suppliers</th><th></th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.description || '—'}</td>
                <td>{g.supplier_count}</td>
                <td>
                  {canManage && <button className="btn btn-secondary btn-sm" onClick={() => { setEditGroup(g); setShowForm(true); }}>Edit</button>}
                </td>
              </tr>
            ))}
            {groups.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No supplier groups yet.</td></tr>}
          </tbody>
        </table>
      )}

      {showForm && (
        <GroupModal
          group={editGroup}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function GroupModal({ group, onClose, onSaved }) {
  const isNew = !group.id;
  const [name, setName] = useState(group.name || '');
  const [description, setDescription] = useState(group.description || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isNew) await api.post('/supplier-groups', { name, description });
      else await api.patch(`/supplier-groups/${group.id}`, { name, description });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save group');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add supplier group' : 'Edit supplier group'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="form-group"><label>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

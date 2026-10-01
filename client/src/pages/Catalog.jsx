import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import SimpleEditModal from '../components/SimpleEditModal';
import useInventoryControls from '../hooks/useInventoryControls';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

const TABS = [
  { key: 'categories', label: 'Categories', endpoint: '/product-categories' },
  { key: 'brands', label: 'Brands', endpoint: '/brands' },
  { key: 'uom', label: 'Units of Measure', endpoint: '/uom' },
];

export default function Catalog() {
  const { editEnabled, canDelete } = useInventoryControls();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [editItem, setEditItem] = useState(null);
  const [tab, setTab] = useState('categories');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const activeTab = TABS.find((t) => t.key === tab);

  function load() {
    setLoading(true);
    api.get(activeTab.endpoint).then(({ data }) => setItems(data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    setShowForm(false);
    setError('');
  }, [tab]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      if (tab === 'uom') {
        await api.post('/uom', { name, symbol });
      } else if (tab === 'brands') {
        await api.post('/brands', { name, description });
      } else {
        await api.post('/product-categories', { name, description });
      }
      setName('');
      setSymbol('');
      setDescription('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    }
  }

  // Delete is offered for categories and brands (units of measure are only activated/deactivated).
  const canDeleteHere = canDelete && tab !== 'uom';
  const showActions = editEnabled || canDeleteHere;

  async function handleDelete(item) {
    const noun = tab === 'brands' ? 'brand' : 'category';
    const ok = await confirm(`Delete ${noun} "${item.name}"? This only works if no product uses it. This cannot be undone.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`${activeTab.endpoint}/${item.id}`);
      showToast(`${noun[0].toUpperCase()}${noun.slice(1)} deleted.`, 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || `Failed to delete ${noun}`, 'error');
    }
  }

  async function toggleActive(item) {
    const patchBody = { isActive: !item.is_active };
    if (tab === 'uom') await api.patch(`/uom/${item.id}`, patchBody);
    else if (tab === 'brands') await api.patch(`/brands/${item.id}`, patchBody);
    else await api.patch(`/product-categories/${item.id}`, patchBody);
    load();
  }

  return (
    <DashboardLayout title="Product Catalog">
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

      <div className="card">
        <div className="card-header">
          <h2>{activeTab.label}</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : `+ Add ${activeTab.label.toLowerCase().replace(/s$/, '')}`}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
            {error && <div className="error-banner">{error}</div>}
            <div className="form-group">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            {tab === 'uom' && (
              <div className="form-group">
                <label>Symbol</label>
                <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. kg, pc, L" required />
              </div>
            )}
            {tab !== 'uom' && (
              <div className="form-group">
                <label>Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>Save</button>
          </form>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {tab === 'uom' && <th>Symbol</th>}
                {tab !== 'uom' && <th>Description</th>}
                <th>Status</th>
                {showActions && <th></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  {tab === 'uom' && <td>{item.symbol}</td>}
                  {tab !== 'uom' && <td>{item.description || '—'}</td>}
                  <td>
                    <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {showActions && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editEnabled && tab !== 'uom' && (
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => setEditItem(item)}>Edit</button>
                      )}
                      {editEnabled && (
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(item)}>
                          {item.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {canDeleteHere && (
                        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6, color: 'var(--color-danger, #B3261E)' }} onClick={() => handleDelete(item)}>Delete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={showActions ? 4 : 3} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Nothing here yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {editItem && (
        <SimpleEditModal
          title={`Edit ${tab === 'brands' ? 'brand' : 'category'}`}
          fields={[{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description', type: 'textarea' }]}
          initial={{ name: editItem.name, description: editItem.description }}
          onSave={async (v) => {
            await api.patch(`${activeTab.endpoint}/${editItem.id}`, { name: v.name, description: v.description });
            setEditItem(null);
            load();
            showToast('Saved.', 'success');
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </DashboardLayout>
  );
}

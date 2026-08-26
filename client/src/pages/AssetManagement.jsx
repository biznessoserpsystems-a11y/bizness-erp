import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { BarChartWidget, LineChartWidget, PieChartWidget, formatMoney } from '../components/charts';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

const TABS = [
  { key: 'register', label: 'Asset Register' },
  { key: 'categories', label: 'Categories' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'depreciation', label: 'Depreciation Run' },
  { key: 'reports', label: 'Reports' },
];

const GHS = (v) => `GHS ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AssetManagement() {
  const [tab, setTab] = useState('register');
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  return (
    <DashboardLayout title="Asset Management" breadcrumb={[{ label: 'Accounting & Finance', to: '/accounting' }, { label: 'Assets' }]}>
      <div className="toolbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ width: 'auto' }}
            onClick={() => { setTab(t.key); setSelectedAssetId(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'register' && (
        selectedAssetId
          ? <AssetDetail assetId={selectedAssetId} onBack={() => setSelectedAssetId(null)} />
          : <AssetRegister onSelect={setSelectedAssetId} />
      )}
      {tab === 'categories' && <AssetCategories />}
      {tab === 'assignments' && <AssetAssignments />}
      {tab === 'depreciation' && <DepreciationRun />}
      {tab === 'reports' && <AssetReports />}
    </DashboardLayout>
  );
}

// ================== Asset Register ==================

function AssetRegister({ onSelect }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  function load() {
    setLoading(true);
    api.get('/fixed-assets', { params: statusFilter ? { status: statusFilter } : {} })
      .then(({ data }) => setAssets(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  const badgeClass = (status) => ({
    active: 'badge-success', fully_depreciated: 'badge-neutral', disposed: 'badge-danger', under_construction: 'badge-neutral',
  }[status] || 'badge-neutral');

  return (
    <div className="card">
      <div className="card-header">
        <h2>Fixed Asset Register</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="fully_depreciated">Fully depreciated</option>
            <option value="disposed">Disposed</option>
            <option value="under_construction">Under construction</option>
          </select>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New asset</button>
        </div>
      </div>
      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Cost</th><th>Acc. Depreciation</th><th>Carrying amount</th><th>Status</th></tr></thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(a.id)}>
                <td>{a.asset_code}</td>
                <td>{a.name}</td>
                <td>{a.category_name}</td>
                <td>{GHS(a.cost)}</td>
                <td>{GHS(a.accumulated_depreciation)}</td>
                <td>{GHS(a.carrying_amount)}</td>
                <td><span className={`badge ${badgeClass(a.status)}`}>{a.status.replace(/_/g, ' ')}</span></td>
              </tr>
            ))}
            {assets.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No assets yet.</td></tr>}
          </tbody>
        </table>
      )}
      {showModal && <NewAssetModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function NewAssetModal({ onClose, onSaved }) {
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    categoryId: '', assetCode: '', name: '', description: '', serialNumber: '', location: '', custodian: '',
    acquisitionDate: new Date().toISOString().slice(0, 10), cost: '', residualValue: '0',
    depreciationMethod: '', usefulLifeYears: '', reducingBalanceRate: '', totalEstimatedUnits: '',
    depreciationStartDate: '', postAcquisition: true, paymentSource: 'cash_default',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/asset-categories').then(({ data }) => setCategories(data));
    api.get('/chart-of-accounts').then(({ data }) => setAccounts(data));
  }, []);

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  function selectCategory(id) {
    const cat = categories.find((c) => c.id === id);
    set('categoryId', id);
    if (cat) set('depreciationMethod', cat.default_depreciation_method);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/fixed-assets', {
        ...form,
        cost: Number(form.cost),
        residualValue: Number(form.residualValue) || 0,
        usefulLifeYears: form.usefulLifeYears ? Number(form.usefulLifeYears) : null,
        reducingBalanceRate: form.reducingBalanceRate ? Number(form.reducingBalanceRate) : null,
        totalEstimatedUnits: form.totalEstimatedUnits ? Number(form.totalEstimatedUnits) : null,
        depreciationStartDate: form.depreciationStartDate || form.acquisitionDate,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create asset');
    } finally {
      setSubmitting(false);
    }
  }

  const cashLikeAccounts = accounts.filter((a) => a.account_type === 'asset');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>New fixed asset</h2>
        <form onSubmit={handleSubmit}>
          <label>Category</label>
          <select required value={form.categoryId} onChange={(e) => selectCategory(e.target.value)}>
            <option value="">Select a category...</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Asset code</label>
              <input required value={form.assetCode} onChange={(e) => set('assetCode', e.target.value)} />
            </div>
            <div style={{ flex: 2 }}>
              <label>Name</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
          </div>

          <label>Description</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Acquisition date</label>
              <input type="date" required value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Cost (GHS)</label>
              <input type="number" step="0.01" required value={form.cost} onChange={(e) => set('cost', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Residual value (GHS)</label>
              <input type="number" step="0.01" value={form.residualValue} onChange={(e) => set('residualValue', e.target.value)} />
            </div>
          </div>

          <label>Depreciation method</label>
          <select value={form.depreciationMethod} onChange={(e) => set('depreciationMethod', e.target.value)}>
            <option value="straight_line">Straight-line</option>
            <option value="reducing_balance">Reducing balance</option>
            <option value="units_of_production">Units of production</option>
          </select>

          <div style={{ display: 'flex', gap: 12 }}>
            {form.depreciationMethod !== 'units_of_production' && (
              <div style={{ flex: 1 }}>
                <label>Useful life (years)</label>
                <input type="number" step="0.1" value={form.usefulLifeYears} onChange={(e) => set('usefulLifeYears', e.target.value)} />
              </div>
            )}
            {form.depreciationMethod === 'reducing_balance' && (
              <div style={{ flex: 1 }}>
                <label>Reducing balance rate (% p.a.)</label>
                <input type="number" step="0.1" value={form.reducingBalanceRate} onChange={(e) => set('reducingBalanceRate', e.target.value)} />
              </div>
            )}
            {form.depreciationMethod === 'units_of_production' && (
              <div style={{ flex: 1 }}>
                <label>Total estimated units</label>
                <input type="number" step="1" value={form.totalEstimatedUnits} onChange={(e) => set('totalEstimatedUnits', e.target.value)} />
              </div>
            )}
          </div>

          <label>Depreciation start date (defaults to acquisition date)</label>
          <input type="date" value={form.depreciationStartDate} onChange={(e) => set('depreciationStartDate', e.target.value)} />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Location</label>
              <input value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Custodian</label>
              <input value={form.custodian} onChange={(e) => set('custodian', e.target.value)} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={form.postAcquisition} onChange={(e) => set('postAcquisition', e.target.checked)} />
            Post the acquisition to the general ledger now
          </label>
          {form.postAcquisition && (
            <>
              <label>Paid via</label>
              <select value={form.paymentSource} onChange={(e) => set('paymentSource', e.target.value)}>
                <option value="cash_default">Cash / bank (default cash account)</option>
                <option value="accounts_payable">On credit (Accounts Payable)</option>
              </select>
            </>
          )}

          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Create asset'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================== Asset Detail ==================

function AssetDetail({ assetId, onBack }) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null); // 'revalue' | 'impair' | 'dispose'
  const [assignments, setAssignments] = useState(null);

  function load() {
    setLoading(true);
    api.get(`/fixed-assets/${assetId}`).then(({ data }) => setAsset(data)).finally(() => setLoading(false));
  }
  useEffect(load, [assetId]);
  useEffect(() => { api.get(`/fixed-assets/${assetId}/assignments`).then(({ data }) => setAssignments(data)).catch(() => setAssignments([])); }, [assetId]);

  if (loading || !asset) return <p>Loading...</p>;

  const carrying = Number(asset.carrying_amount);
  const disposed = asset.status === 'disposed';

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={onBack}>← Back to register</button>

      <div className="card">
        <div className="card-header">
          <h2>{asset.asset_code} — {asset.name}</h2>
          {!disposed && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveModal('revalue')}>Revalue</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveModal('impair')}>Impairment test</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveModal('dispose')}>Dispose</button>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Stat label="Original cost" value={GHS(asset.original_cost)} />
          <Stat label="Current cost basis" value={GHS(asset.cost)} />
          <Stat label="Accumulated depreciation" value={GHS(asset.accumulated_depreciation)} />
          <Stat label="Accumulated impairment" value={GHS(asset.accumulated_impairment)} />
          <Stat label="Carrying amount" value={GHS(carrying)} emphasize />
          <Stat label="Measurement model" value={asset.measurement_model === 'revaluation' ? 'Revaluation model' : 'Cost model'} />
          <Stat label="Revaluation surplus" value={GHS(asset.revaluation_surplus_balance)} />
          <Stat label="Method" value={asset.depreciation_method.replace(/_/g, ' ')} />
        </div>
      </div>

      <div className="card">
        <h2>Depreciation history</h2>
        <table>
          <thead><tr><th>Period</th><th>Amount</th><th>Accumulated after</th><th>Carrying after</th></tr></thead>
          <tbody>
            {asset.depreciationEntries.map((e) => (
              <tr key={e.id}>
                <td>{e.period_start} to {e.period_end}</td>
                <td>{GHS(e.depreciation_amount)}</td>
                <td>{GHS(e.accumulated_depreciation_after)}</td>
                <td>{GHS(e.carrying_amount_after)}</td>
              </tr>
            ))}
            {asset.depreciationEntries.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No depreciation posted yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Assignment history</h2>
        {assignments === null ? <p>Loading...</p> : assignments.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>This asset has never been assigned to an employee.</p>
        ) : (
          <table>
            <thead><tr><th>Employee</th><th>Assigned</th><th>Expected return</th><th>Returned</th><th>Status</th></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.first_name} {a.last_name}</td>
                  <td>{new Date(a.assigned_date).toLocaleDateString()}</td>
                  <td>{a.expected_return_date ? new Date(a.expected_return_date).toLocaleDateString() : '—'}</td>
                  <td>{a.returned_date ? new Date(a.returned_date).toLocaleDateString() : '—'}</td>
                  <td>
                    {a.returned_date ? <span className="badge badge-neutral">Returned</span>
                      : a.is_overdue ? <span className="badge badge-danger">Overdue</span>
                      : <span className="badge badge-success">Assigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {asset.valueAdjustments.length > 0 && (
        <div className="card">
          <h2>Revaluations & impairment</h2>
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Carrying before</th><th>New amount</th><th>To OCI</th><th>To P&amp;L</th></tr></thead>
            <tbody>
              {asset.valueAdjustments.map((a) => (
                <tr key={a.id}>
                  <td>{a.adjustment_date}</td>
                  <td>{a.adjustment_type.replace(/_/g, ' ')}</td>
                  <td>{GHS(a.carrying_amount_before)}</td>
                  <td>{GHS(a.new_amount)}</td>
                  <td>{GHS(a.amount_to_oci)}</td>
                  <td>{GHS(a.amount_to_pl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {asset.disposal && (
        <div className="card">
          <h2>Disposal</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Stat label="Disposal date" value={asset.disposal.disposal_date} />
            <Stat label="Method" value={asset.disposal.disposal_method} />
            <Stat label="Proceeds" value={GHS(asset.disposal.proceeds)} />
            <Stat label={Number(asset.disposal.gain_loss_amount) >= 0 ? 'Gain on disposal' : 'Loss on disposal'} value={GHS(Math.abs(asset.disposal.gain_loss_amount))} />
          </div>
        </div>
      )}

      {activeModal === 'revalue' && <RevalueModal asset={asset} onClose={() => setActiveModal(null)} onSaved={() => { setActiveModal(null); load(); }} />}
      {activeModal === 'impair' && <ImpairModal asset={asset} onClose={() => setActiveModal(null)} onSaved={() => { setActiveModal(null); load(); }} />}
      {activeModal === 'dispose' && <DisposeModal asset={asset} onClose={() => setActiveModal(null)} onSaved={() => { setActiveModal(null); load(); }} />}
    </div>
  );
}

function Stat({ label, value, emphasize }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: emphasize ? 20 : 16, fontWeight: emphasize ? 700 : 500 }}>{value}</div>
    </div>
  );
}

function RevalueModal({ asset, onClose, onSaved }) {
  const [newFairValue, setNewFairValue] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      await api.post(`/fixed-assets/${asset.id}/revalue`, { newFairValue: Number(newFairValue), adjustmentDate, notes });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record revaluation');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Revalue asset (IAS 16 revaluation model)</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          Current carrying amount: {GHS(asset.carrying_amount)}. An increase is credited to Revaluation Surplus (equity),
          reversing any prior decrease of this asset through profit or loss first. A decrease is debited against this
          asset's existing surplus first, with any excess expensed.
        </p>
        <form onSubmit={handleSubmit}>
          <label>New fair value (GHS)</label>
          <input type="number" step="0.01" required value={newFairValue} onChange={(e) => setNewFairValue(e.target.value)} />
          <label>Revaluation date</label>
          <input type="date" required value={adjustmentDate} onChange={(e) => setAdjustmentDate(e.target.value)} />
          <label>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. independent valuer's report reference" />
          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Record revaluation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImpairModal({ asset, onClose, onSaved }) {
  const [recoverableAmount, setRecoverableAmount] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      await api.post(`/fixed-assets/${asset.id}/impair`, { recoverableAmount: Number(recoverableAmount), adjustmentDate, notes });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record impairment assessment');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Impairment test (IAS 36)</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          Current carrying amount: {GHS(asset.carrying_amount)}. Enter the recoverable amount (the higher of fair value
          less costs to sell and value in use). If it's lower, an impairment loss is expensed; if higher, any previously
          recognised impairment is reversed, capped at depreciated historical cost.
        </p>
        <form onSubmit={handleSubmit}>
          <label>Recoverable amount (GHS)</label>
          <input type="number" step="0.01" required value={recoverableAmount} onChange={(e) => setRecoverableAmount(e.target.value)} />
          <label>Assessment date</label>
          <input type="date" required value={adjustmentDate} onChange={(e) => setAdjustmentDate(e.target.value)} />
          <label>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. basis of the recoverable amount estimate" />
          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Record assessment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DisposeModal({ asset, onClose, onSaved }) {
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [disposalMethod, setDisposalMethod] = useState('sale');
  const [proceeds, setProceeds] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gainLoss = Number(proceeds || 0) - Number(asset.carrying_amount);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      await api.post(`/fixed-assets/${asset.id}/dispose`, { disposalDate, disposalMethod, proceeds: Number(proceeds) || 0, notes });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record disposal');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Dispose of asset</h2>
        <form onSubmit={handleSubmit}>
          <label>Disposal date</label>
          <input type="date" required value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
          <label>Method</label>
          <select value={disposalMethod} onChange={(e) => setDisposalMethod(e.target.value)}>
            <option value="sale">Sale</option>
            <option value="scrap">Scrap</option>
            <option value="donation">Donation</option>
            <option value="write_off">Write-off</option>
          </select>
          <label>Proceeds (GHS)</label>
          <input type="number" step="0.01" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
          <p style={{ fontSize: 14 }}>
            Carrying amount at disposal: {GHS(asset.carrying_amount)} — {gainLoss >= 0 ? 'gain' : 'loss'} of {GHS(Math.abs(gainLoss))}
          </p>
          <label>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Confirm disposal'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================== Categories ==================

function AssetCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  function load() {
    setLoading(true);
    api.get('/asset-categories').then(({ data }) => setCategories(data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Asset Categories</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New category</button>
      </div>
      {loading ? <p>Loading...</p> : (
        <table>
          <thead><tr><th>Name</th><th>Default method</th><th>Default useful life</th><th>Asset account</th><th>Accum. depreciation account</th><th>Expense account</th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.default_depreciation_method.replace(/_/g, ' ')}</td>
                <td>{c.default_useful_life_years || '—'}</td>
                <td>{c.asset_account_code} — {c.asset_account_name}</td>
                <td>{c.accum_dep_account_code}</td>
                <td>{c.expense_account_code}</td>
              </tr>
            ))}
            {categories.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No categories yet.</td></tr>}
          </tbody>
        </table>
      )}
      {showModal && <NewCategoryModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function NewCategoryModal({ onClose, onSaved }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    name: '', description: '', defaultDepreciationMethod: 'straight_line', defaultUsefulLifeYears: '',
    defaultResidualPct: '0', assetAccountId: '', accumulatedDepreciationAccountId: '', depreciationExpenseAccountId: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get('/chart-of-accounts').then(({ data }) => setAccounts(data)); }, []);

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  const assetAccounts = accounts.filter((a) => a.account_type === 'asset');
  const expenseAccounts = accounts.filter((a) => a.account_type === 'expense');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      await api.post('/asset-categories', {
        ...form,
        defaultUsefulLifeYears: form.defaultUsefulLifeYears ? Number(form.defaultUsefulLifeYears) : null,
        defaultResidualPct: Number(form.defaultResidualPct) || 0,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>New asset category</h2>
        <form onSubmit={handleSubmit}>
          <label>Name</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Motor Vehicles" />
          <label>Description</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} />

          <label>Default depreciation method</label>
          <select value={form.defaultDepreciationMethod} onChange={(e) => set('defaultDepreciationMethod', e.target.value)}>
            <option value="straight_line">Straight-line</option>
            <option value="reducing_balance">Reducing balance</option>
            <option value="units_of_production">Units of production</option>
          </select>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Default useful life (years)</label>
              <input type="number" step="0.1" value={form.defaultUsefulLifeYears} onChange={(e) => set('defaultUsefulLifeYears', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Default residual (%)</label>
              <input type="number" step="0.1" value={form.defaultResidualPct} onChange={(e) => set('defaultResidualPct', e.target.value)} />
            </div>
          </div>

          <label>Asset (cost) account</label>
          <select required value={form.assetAccountId} onChange={(e) => set('assetAccountId', e.target.value)}>
            <option value="">Select...</option>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
          </select>

          <label>Accumulated depreciation account</label>
          <select required value={form.accumulatedDepreciationAccountId} onChange={(e) => set('accumulatedDepreciationAccountId', e.target.value)}>
            <option value="">Select...</option>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
          </select>

          <label>Depreciation expense account</label>
          <select required value={form.depreciationExpenseAccountId} onChange={(e) => set('depreciationExpenseAccountId', e.target.value)}>
            <option value="">Select...</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
          </select>

          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Create category'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================== Depreciation Run ==================

// ================== Asset Assignments ==================

const ASSIGNMENT_FILTERS = [
  ['', 'All'],
  ['current', 'Currently assigned'],
  ['overdue', 'Overdue'],
  ['returned', 'Returned'],
];

function AssetAssignments() {
  const [assignments, setAssignments] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('');
  const [transferTarget, setTransferTarget] = useState(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    api.get(`/asset-assignments${filter ? `?status=${filter}` : ''}`).then(({ data }) => setAssignments(data)).catch(() => setAssignments([]));
  }
  useEffect(load, [filter]);
  useEffect(() => { api.get('/asset-reports/assignment-summary').then(({ data }) => setSummary(data)).catch(() => {}); }, []);

  async function returnAsset(a) {
    const ok = await confirm(`Mark "${a.asset_code}" as returned?`, { confirmLabel: 'Mark returned' });
    if (!ok) return;
    try {
      await api.post(`/asset-assignments/${a.id}/return`, {});
      load();
      showToast('Asset marked as returned.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to return asset', 'error');
    }
  }

  return (
    <>
      {summary && (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Active assets</div><div className="kpi-value">{summary.total_active_assets}</div></div>
          <div className="kpi-card"><div className="kpi-label">Currently assigned</div><div className="kpi-value">{summary.currently_assigned}</div></div>
          <div className="kpi-card"><div className="kpi-label">Available</div><div className="kpi-value">{summary.available}</div></div>
          <div className="kpi-card"><div className="kpi-label">Overdue</div><div className="kpi-value">{summary.overdue}</div></div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Asset assignments</h2>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            {ASSIGNMENT_FILTERS.map(([key, label]) => (
              <button key={key} className={filter === key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} style={{ width: 'auto' }} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {assignments === null ? <p>Loading...</p> : assignments.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No assignments match this filter.</p>
        ) : (
          <table>
            <thead><tr><th>Asset</th><th>Employee</th><th>Assigned</th><th>Expected return</th><th>Returned</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.asset_code} — {a.asset_name}</td>
                  <td>{a.first_name} {a.last_name}</td>
                  <td>{new Date(a.assigned_date).toLocaleDateString()}</td>
                  <td>{a.expected_return_date ? new Date(a.expected_return_date).toLocaleDateString() : '—'}</td>
                  <td>{a.returned_date ? new Date(a.returned_date).toLocaleDateString() : '—'}</td>
                  <td>
                    {a.returned_date ? <span className="badge badge-neutral">Returned</span>
                      : a.is_overdue ? <span className="badge badge-danger">Overdue</span>
                      : <span className="badge badge-success">Assigned</span>}
                  </td>
                  <td>
                    {!a.returned_date && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setTransferTarget(a)}>Transfer</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => returnAsset(a)}>Return</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {transferTarget && (
        <TransferModal
          assignment={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => { setTransferTarget(null); load(); showToast('Asset transferred.', 'success'); }}
        />
      )}
    </>
  );
}

function TransferModal({ assignment, onClose, onTransferred }) {
  const [employees, setEmployees] = useState([]);
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get('/employees').then(({ data }) => setEmployees(data.filter((e) => e.id !== assignment.employee_id))).catch(() => {}); }, [assignment.employee_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/asset-assignments/${assignment.id}/transfer`, {
        newEmployeeId, expectedReturnDate: expectedReturnDate || undefined, notes: notes || undefined,
      });
      onTransferred();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to transfer asset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Transfer {assignment.asset_code}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Currently with {assignment.first_name} {assignment.last_name}. This marks the current assignment returned and assigns it to the new employee immediately.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Transfer to</label>
            <select value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)} required autoFocus>
              <option value="">Select an employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Expected return date</label><input type="date" value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} /></div>
          <div className="form-group"><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting || !newEmployeeId}>{submitting ? 'Transferring...' : 'Transfer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DepreciationRun() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [categories, setCategories] = useState([]);
  const [periodStart, setPeriodStart] = useState(firstOfMonth);
  const [periodEnd, setPeriodEnd] = useState(lastOfMonth);
  const [categoryId, setCategoryId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get('/asset-categories').then(({ data }) => setCategories(data)); }, []);

  async function handleRun(e) {
    e.preventDefault();
    setError(''); setSubmitting(true); setResult(null);
    try {
      const { data } = await api.post('/fixed-assets/depreciation-run', { periodStart, periodEnd, categoryId: categoryId || undefined });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run depreciation');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="card">
      <h2>Run periodic depreciation</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
        Calculates straight-line, reducing-balance, or units-of-production depreciation for every active asset that
        hasn't already been depreciated for this period, and posts one aggregated journal entry per expense/accumulated-depreciation
        account pair. Assets using units-of-production are skipped in a bulk run — record their usage individually.
      </p>
      <form onSubmit={handleRun} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Period start</label>
            <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Period end</label>
            <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <label>Category (optional — leave blank to run for all)</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }} disabled={submitting}>
          {submitting ? 'Running...' : 'Run depreciation'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 24 }}>
          <p><strong>{result.message}</strong></p>
          {result.entries.length > 0 && (
            <table>
              <thead><tr><th>Asset</th><th>Amount</th><th>Accumulated after</th><th>Carrying after</th></tr></thead>
              <tbody>
                {result.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.asset_id}</td>
                    <td>{GHS(e.depreciation_amount)}</td>
                    <td>{GHS(e.accumulated_depreciation_after)}</td>
                    <td>{GHS(e.carrying_amount_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ================== Reports ==================

function AssetReports() {
  const [report, setReport] = useState('register');
  return (
    <div>
      <div className="toolbar">
        {[
          { key: 'register', label: 'Asset Register (NBV)' },
          { key: 'depreciation', label: 'Depreciation History' },
          { key: 'disposals', label: 'Disposals' },
        ].map((r) => (
          <button key={r.key} className={report === r.key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ width: 'auto' }} onClick={() => setReport(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      {report === 'register' && <RegisterReport />}
      {report === 'depreciation' && <DepreciationHistoryReport />}
      {report === 'disposals' && <DisposalsReport />}
    </div>
  );
}

function RegisterReport() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/asset-reports/register').then(({ data }) => setData(data)); }, []);
  if (!data) return <p>Loading...</p>;

  return (
    <>
      <div className="chart-grid">
        <PieChartWidget
          title="Carrying value by category"
          data={Object.values(
            data.assets.reduce((acc, a) => {
              acc[a.category_name] = acc[a.category_name] || { name: a.category_name, value: 0 };
              acc[a.category_name].value += Number(a.carrying_amount);
              return acc;
            }, {})
          )}
          valueFormatter={(v) => formatMoney(v)}
        />
        <BarChartWidget
          title="Cost, depreciation & carrying value"
          data={[
            { name: 'Cost basis', value: data.totals.cost },
            { name: 'Acc. depreciation', value: data.totals.accumulated_depreciation },
            { name: 'Acc. impairment', value: data.totals.accumulated_impairment },
            { name: 'Carrying amount', value: data.totals.carrying_amount },
          ]}
          bars={[{ key: 'value', label: 'Amount' }]}
          colorByCategory
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>
      <div className="card">
        <h2>Asset register — net book value</h2>
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Original cost</th><th>Cost basis</th><th>Acc. Depreciation</th><th>Acc. Impairment</th><th>Carrying amount</th><th>Status</th></tr></thead>
        <tbody>
          {data.assets.map((a) => (
            <tr key={a.asset_code}>
              <td>{a.asset_code}</td><td>{a.name}</td><td>{a.category_name}</td>
              <td>{GHS(a.original_cost)}</td><td>{GHS(a.cost)}</td><td>{GHS(a.accumulated_depreciation)}</td>
              <td>{GHS(a.accumulated_impairment)}</td><td>{GHS(a.carrying_amount)}</td><td>{a.status.replace(/_/g, ' ')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={3}>Totals</td>
            <td></td><td>{GHS(data.totals.cost)}</td><td>{GHS(data.totals.accumulated_depreciation)}</td>
            <td>{GHS(data.totals.accumulated_impairment)}</td><td>{GHS(data.totals.carrying_amount)}</td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}

function DepreciationHistoryReport() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/asset-reports/depreciation-history').then(({ data }) => setRows(data)); }, []);

  const byPeriod = Object.values(
    rows.reduce((acc, r) => {
      const key = r.period_start;
      acc[key] = acc[key] || { name: key, amount: 0 };
      acc[key].amount += Number(r.depreciation_amount);
      return acc;
    }, {})
  ).sort((a, b) => new Date(a.name) - new Date(b.name));

  return (
    <>
      {rows.length > 0 && (
        <LineChartWidget
          title="Depreciation expense by period"
          data={byPeriod}
          lines={[{ key: 'amount', label: 'Depreciation' }]}
          valueFormatter={(v) => formatMoney(v)}
        />
      )}
      <div className="card">
        <h2>Depreciation history</h2>
      <table>
        <thead><tr><th>Period</th><th>Asset</th><th>Category</th><th>Amount</th><th>Accumulated after</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.period_start} to {r.period_end}</td><td>{r.asset_code} — {r.asset_name}</td><td>{r.category_name}</td>
              <td>{GHS(r.depreciation_amount)}</td><td>{GHS(r.accumulated_depreciation_after)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No depreciation posted yet.</td></tr>}
        </tbody>
      </table>
    </div>
    </>
  );
}

function DisposalsReport() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/asset-reports/disposals').then(({ data }) => setRows(data)); }, []);

  return (
    <>
      {rows.length > 0 && (
        <BarChartWidget
          title="Gain / (loss) on disposal"
          data={rows.map((r) => ({ name: `${r.asset_code}`, gainLoss: Number(r.gain_loss_amount) }))}
          bars={[{ key: 'gainLoss', label: 'Gain / (Loss)' }]}
          colorByCategory
          horizontal
          valueFormatter={(v) => formatMoney(v)}
        />
      )}
      <div className="card">
        <h2>Disposals</h2>
      <table>
        <thead><tr><th>Date</th><th>Asset</th><th>Method</th><th>Proceeds</th><th>Carrying amount</th><th>Gain / (Loss)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.disposal_date}</td><td>{r.asset_code} — {r.asset_name}</td><td>{r.disposal_method}</td>
              <td>{GHS(r.proceeds)}</td><td>{GHS(r.carrying_amount_at_disposal)}</td>
              <td style={{ color: Number(r.gain_loss_amount) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{GHS(r.gain_loss_amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No disposals recorded yet.</td></tr>}
        </tbody>
      </table>
    </div>
    </>
  );
}

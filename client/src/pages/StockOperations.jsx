import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'in', label: 'Stock In', permission: 'inventory.stock_in.create' },
  { key: 'out', label: 'Stock Out', permission: 'inventory.stock_out.create' },
  { key: 'adjust', label: 'Adjustment', permission: 'inventory.adjustments.manage' },
  { key: 'damage', label: 'Damaged Goods', permission: 'inventory.damage.manage' },
];

const MOVEMENT_LABEL = {
  stock_in: 'Stock In',
  stock_out: 'Stock Out',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  adjustment_increase: 'Adjustment (+)',
  adjustment_decrease: 'Adjustment (-)',
  damaged: 'Damaged',
  count_adjustment: 'Count Adjustment',
};

export default function StockOperations() {
  const { hasPermission } = useAuth();
  const availableTabs = TABS.filter((t) => hasPermission(t.permission));
  const [tab, setTab] = useState(availableTabs[0]?.key || 'in');
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(true);

  function loadMovements() {
    setLoadingMovements(true);
    api.get('/stock/movements?limit=25').then(({ data }) => setMovements(data)).finally(() => setLoadingMovements(false));
  }

  useEffect(() => {
    Promise.all([api.get('/products'), api.get('/warehouses')]).then(([p, w]) => {
      setProducts(p.data);
      setWarehouses(w.data);
    });
    loadMovements();
  }, []);

  return (
    <DashboardLayout title="Stock Operations">
      <div className="toolbar">
        {availableTabs.map((t) => (
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

      <div className="card" style={{ maxWidth: 560 }}>
        {tab === 'in' && <StockInForm products={products} warehouses={warehouses} onDone={loadMovements} />}
        {tab === 'out' && <StockOutForm products={products} warehouses={warehouses} onDone={loadMovements} />}
        {tab === 'adjust' && <AdjustForm products={products} warehouses={warehouses} onDone={loadMovements} />}
        {tab === 'damage' && <DamageForm products={products} warehouses={warehouses} onDone={loadMovements} />}
      </div>

      <div className="card">
        <h2>Recent stock movements</h2>
        {loadingMovements ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Unit cost</th>
                <th>Batch</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString()}</td>
                  <td>{m.product_name} <span style={{ color: 'var(--color-text-muted)' }}>({m.sku})</span></td>
                  <td>{m.warehouse_name}</td>
                  <td><span className="badge badge-neutral">{MOVEMENT_LABEL[m.movement_type] || m.movement_type}</span></td>
                  <td>{Number(m.quantity).toLocaleString()}</td>
                  <td>GHS {Number(m.unit_cost).toFixed(2)}</td>
                  <td>{m.batch_no || '—'}</td>
                  <td>{m.first_name ? `${m.first_name} ${m.last_name}` : '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No movements yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}

function ProductWarehouseFields({ products, warehouses, productId, setProductId, warehouseId, setWarehouseId }) {
  return (
    <>
      <div className="form-group">
        <label>Product</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="">Select a product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Warehouse</label>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
          <option value="">Select a warehouse</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}

function StockInForm({ products, warehouses, onDone }) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const product = products.find((p) => p.id === productId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post('/stock/in', { productId, warehouseId, quantity: Number(quantity), unitCost: Number(unitCost) || 0, batchNo: batchNo || undefined, expiryDate: expiryDate || undefined, reason });
      setSuccess(true);
      setQuantity(''); setUnitCost(''); setBatchNo(''); setExpiryDate(''); setReason('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to receive stock');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Receive stock</h2>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">Stock received successfully.</div>}
      <ProductWarehouseFields {...{ products, warehouses, productId, setProductId, warehouseId, setWarehouseId }} />
      <div className="form-group">
        <label>Quantity {product?.uom_symbol ? `(${product.uom_symbol})` : ''}</label>
        <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </div>
      <div className="form-group">
        <label>Unit cost (GHS)</label>
        <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
      </div>
      {product?.is_batch_tracked && (
        <div className="form-group">
          <label>Batch / lot number</label>
          <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required placeholder="e.g. LOT-2026-07" />
        </div>
      )}
      {product?.is_expiry_tracked && (
        <div className="form-group">
          <label>Expiry date</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
      )}
      <div className="form-group">
        <label>Reason / reference</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Purchase from supplier" />
      </div>
      <button className="btn btn-primary" style={{ width: 'auto' }} type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Receive stock'}
      </button>
    </form>
  );
}

function useBatchesForProduct(productId, warehouseId) {
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    if (!productId) { setBatches([]); return; }
    api.get(`/products/${productId}`).then(({ data }) => {
      setBatches((data.batches || []).filter((b) => !warehouseId || b.warehouse_id === warehouseId));
    });
  }, [productId, warehouseId]);
  return batches;
}

function StockOutForm({ products, warehouses, onDone }) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const product = products.find((p) => p.id === productId);
  const batches = useBatchesForProduct(product?.is_batch_tracked ? productId : null, warehouseId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post('/stock/out', { productId, warehouseId, quantity: Number(quantity), batchId: batchId || undefined, reason });
      setSuccess(true);
      setQuantity(''); setBatchId(''); setReason('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to issue stock');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Issue stock</h2>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">Stock issued successfully.</div>}
      <ProductWarehouseFields {...{ products, warehouses, productId, setProductId, warehouseId, setWarehouseId }} />
      <div className="form-group">
        <label>Quantity {product?.uom_symbol ? `(${product.uom_symbol})` : ''}</label>
        <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </div>
      {product?.is_batch_tracked && (
        <div className="form-group">
          <label>Batch (optional — leave blank to auto-select oldest/soonest-expiring first)</label>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Auto (FIFO by expiry)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_no} — {b.quantity_remaining} available{b.expiry_date ? `, expires ${new Date(b.expiry_date).toLocaleDateString()}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label>Reason / reference</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sale, internal use" />
      </div>
      <button className="btn btn-primary" style={{ width: 'auto' }} type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Issue stock'}
      </button>
    </form>
  );
}

function AdjustForm({ products, warehouses, onDone }) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState('increase');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const product = products.find((p) => p.id === productId);
  const batches = useBatchesForProduct(product?.is_batch_tracked && direction === 'decrease' ? productId : null, warehouseId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post('/stock/adjust', {
        productId, warehouseId, quantity: Number(quantity), direction,
        unitCost: direction === 'increase' ? Number(unitCost) || 0 : undefined,
        batchId: direction === 'decrease' ? (batchId || undefined) : undefined,
        reason,
      });
      setSuccess(true);
      setQuantity(''); setUnitCost(''); setBatchId(''); setReason('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to adjust stock');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Adjust stock</h2>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">Adjustment applied successfully.</div>}
      <ProductWarehouseFields {...{ products, warehouses, productId, setProductId, warehouseId, setWarehouseId }} />
      <div className="form-group">
        <label>Direction</label>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="increase">Increase</option>
          <option value="decrease">Decrease</option>
        </select>
      </div>
      <div className="form-group">
        <label>Quantity {product?.uom_symbol ? `(${product.uom_symbol})` : ''}</label>
        <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </div>
      {direction === 'increase' && (
        <div className="form-group">
          <label>Unit cost (GHS)</label>
          <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </div>
      )}
      {direction === 'decrease' && product?.is_batch_tracked && (
        <div className="form-group">
          <label>Batch</label>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
            <option value="">Select a batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batch_no} — {b.quantity_remaining} available</option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label>Reason (required)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Stock count correction" />
      </div>
      <button className="btn btn-primary" style={{ width: 'auto' }} type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Apply adjustment'}
      </button>
    </form>
  );
}

function DamageForm({ products, warehouses, onDone }) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const product = products.find((p) => p.id === productId);
  const batches = useBatchesForProduct(product?.is_batch_tracked ? productId : null, warehouseId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post('/stock/damage', { productId, warehouseId, quantity: Number(quantity), batchId: batchId || undefined, reason });
      setSuccess(true);
      setQuantity(''); setBatchId(''); setReason('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log damaged goods');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Log damaged / written-off goods</h2>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">Damaged goods logged and stock adjusted.</div>}
      <ProductWarehouseFields {...{ products, warehouses, productId, setProductId, warehouseId, setWarehouseId }} />
      <div className="form-group">
        <label>Quantity {product?.uom_symbol ? `(${product.uom_symbol})` : ''}</label>
        <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </div>
      {product?.is_batch_tracked && (
        <div className="form-group">
          <label>Batch (optional — leave blank to auto-select)</label>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Auto (FIFO by expiry)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batch_no} — {b.quantity_remaining} available</option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label>Reason (required)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Broken in warehouse, water damage" />
      </div>
      <button className="btn btn-danger" style={{ width: 'auto' }} type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Log damaged goods'}
      </button>
    </form>
  );
}

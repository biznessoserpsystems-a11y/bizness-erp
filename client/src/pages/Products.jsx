import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BarChartWidget, PieChartWidget, formatMoney } from '../components/charts';
import ProductImage from '../components/ProductImage';
import AttachmentsPanel from '../components/AttachmentsPanel';

export default function Products() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('inventory.products.manage');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalProduct, setModalProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'grid' (picture view)

  function load() {
    setLoading(true);
    Promise.all([
      api.get('/products'),
      api.get('/product-categories'),
      api.get('/brands'),
      api.get('/uom'),
    ])
      .then(([p, c, b, u]) => {
        setProducts(p.data);
        setCategories(c.data);
        setBrands(b.data);
        setUoms(u.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || '').includes(search)
  );

  return (
    <DashboardLayout title="Product Master">
      {!loading && products.length > 0 && (
        <div className="chart-grid">
          <PieChartWidget
            title="Stock value by category"
            data={Object.values(
              products.reduce((acc, p) => {
                const key = p.category_name || 'Uncategorized';
                acc[key] = acc[key] || { name: key, value: 0 };
                acc[key].value += Number(p.total_stock_value) || 0;
                return acc;
              }, {})
            )}
            valueFormatter={(v) => formatMoney(v)}
          />
          <BarChartWidget
            title="Most-stocked products"
            data={[...products]
              .sort((a, b) => Number(b.total_stock) - Number(a.total_stock))
              .slice(0, 8)
              .map((p) => ({ name: p.name, qty: Number(p.total_stock) }))}
            bars={[{ key: 'qty', label: 'Qty on hand' }]}
            colorByCategory
            horizontal
          />
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <h2>Products</h2>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setModalProduct({})}>
              + Add product
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Search by name, SKU, or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14 }}
          />
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto' }}
              onClick={() => setView('list')}
            >
              List
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto' }}
              onClick={() => setView('grid')}
            >
              Picture view
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : view === 'grid' ? (
          <div className="product-grid">
            {filtered.map((p) => (
              <div key={p.id} className="product-card" onClick={() => canManage && setModalProduct(p)}>
                <div className="product-card-image">
                  <ProductImage productId={p.id} fill />
                </div>
                <div className="product-card-body">
                  <p className="product-card-name" title={p.name}>{p.name}</p>
                  <p className="product-card-meta">{p.sku}</p>
                  <p className="product-card-meta">
                    {Number(p.total_stock).toLocaleString()} {p.uom_symbol} in stock
                  </p>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p style={{ color: 'var(--color-text-muted)' }}>No products found.</p>
            )}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Brand</th>
                <th>Stock (all warehouses)</th>
                <th>Stock value</th>
                <th>Tracking</th>
                <th>Status</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.category_name || '—'}</td>
                  <td>{p.brand_name || '—'}</td>
                  <td>{Number(p.total_stock).toLocaleString()} {p.uom_symbol}</td>
                  <td>GHS {Number(p.total_stock_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>
                    {p.is_batch_tracked && <span className="badge badge-neutral">Batch</span>}{' '}
                    {p.is_expiry_tracked && <span className="badge badge-neutral">Expiry</span>}
                  </td>
                  <td>
                    <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setModalProduct(p)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalProduct && (
        <ProductModal
          product={modalProduct}
          categories={categories}
          brands={brands}
          uoms={uoms}
          onClose={() => setModalProduct(null)}
          onSaved={() => {
            setModalProduct(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function ProductModal({ product, categories, brands, uoms, onClose, onSaved }) {
  const isNew = !product.id;
  const [form, setForm] = useState({
    sku: product.sku || '',
    name: product.name || '',
    description: product.description || '',
    categoryId: product.category_id || '',
    brandId: product.brand_id || '',
    uomId: product.uom_id || '',
    barcode: product.barcode || '',
    costPrice: product.cost_price || 0,
    sellingPrice: product.selling_price || 0,
    isBatchTracked: product.is_batch_tracked || false,
    isExpiryTracked: product.is_expiry_tracked || false,
    reorderLevel: product.reorder_level || 0,
    reorderQuantity: product.reorder_quantity || 0,
    productType: product.product_type || 'trading',
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
        await api.post('/products', form);
      } else {
        await api.patch(`/products/${product.id}`, form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add product' : 'Edit product'}</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>SKU</label>
            <input value={form.sku} onChange={update('sku')} required disabled={!isNew} />
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="form-group">
            <label>Barcode</label>
            <input value={form.barcode} onChange={update('barcode')} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.categoryId} onChange={update('categoryId')}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Brand</label>
            <select value={form.brandId} onChange={update('brandId')}>
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Unit of measure</label>
            <select value={form.uomId} onChange={update('uomId')}>
              <option value="">None</option>
              {uoms.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Selling price (GHS)</label>
            <input type="number" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} />
          </div>
          <div className="form-group">
            <label>Product type</label>
            <select value={form.productType} onChange={update('productType')}>
              <option value="trading">Trading (bought and sold as-is)</option>
              <option value="raw_material">Raw Material (consumed in manufacturing)</option>
              <option value="finished_good">Finished Good (produced by a Work Order)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Default reorder level</label>
            <input type="number" step="0.01" value={form.reorderLevel} onChange={update('reorderLevel')} />
          </div>
          <div className="form-group">
            <label>Default reorder quantity</label>
            <input type="number" step="0.01" value={form.reorderQuantity} onChange={update('reorderQuantity')} />
          </div>
          {isNew && (
            <>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isBatchTracked}
                  onChange={(e) => setForm((f) => ({ ...f, isBatchTracked: e.target.checked }))}
                />
                <label style={{ margin: 0 }}>Track by batch/lot number</label>
              </div>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isExpiryTracked}
                  onChange={(e) => setForm((f) => ({ ...f, isExpiryTracked: e.target.checked }))}
                />
                <label style={{ margin: 0 }}>Track expiry dates</label>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                These two settings can't be changed after the product is created.
              </p>
            </>
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
        {!isNew && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
            <h2 style={{ fontSize: 14, marginBottom: 8 }}>Photos</h2>
            <AttachmentsPanel relatedType="product" relatedId={product.id} />
          </div>
        )}
      </div>
    </div>
  );
}

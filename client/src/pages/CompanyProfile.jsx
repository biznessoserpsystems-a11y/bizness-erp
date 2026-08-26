import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import CompanyLogo from '../components/CompanyLogo';

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Volta', 'Northern',
  'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Savannah', 'North East',
  'Oti', 'Western North',
];

export default function CompanyProfile() {
  const { hasPermission, setCompany } = useAuth();
  const canManage = hasPermission('system.company.manage');
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRefreshKey, setLogoRefreshKey] = useState(0);
  const [natureOptions, setNatureOptions] = useState([]);
  const logoInputRef = useRef(null);
  const { showToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api.get('/company').then(({ data }) => setForm(data));
    api.get('/company/document-numbering').then(({ data }) => setSequences(data.sequences));
    api.get('/auth/nature-of-business-options').then(({ data }) => setNatureOptions(data)).catch(() => setNatureOptions([]));
  }, []);

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setLogoUploading(true);
    try {
      // Only one logo at a time — clear out any previous upload(s) first so
      // this behaves like "replace", not "add another".
      const { data: existing } = await api.get(`/attachments?relatedType=company&relatedId=${form.id}`);
      await Promise.all((existing || []).map((a) => api.delete(`/attachments/${a.id}`)));

      const body = new FormData();
      body.append('file', file);
      body.append('relatedType', 'company');
      body.append('relatedId', form.id);
      await api.post('/attachments', body);

      setLogoRefreshKey((k) => k + 1);
      showToast('Logo updated.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to upload logo', 'error');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    const ok = await confirm('Remove the company logo?', { danger: true, confirmLabel: 'Remove' });
    if (!ok) return;
    try {
      const { data: existing } = await api.get(`/attachments?relatedType=company&relatedId=${form.id}`);
      await Promise.all((existing || []).map((a) => api.delete(`/attachments/${a.id}`)));
      setLogoRefreshKey((k) => k + 1);
      showToast('Logo removed.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove logo', 'error');
    }
  }

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSubmitting(true);
    try {
      const { data } = await api.patch('/company', {
        name: form.name,
        legalName: form.legal_name,
        natureOfBusiness: form.nature_of_business || null,
        tin: form.tin,
        registrationNo: form.registration_no,
        address: form.address,
        city: form.city,
        region: form.region,
        phone: form.phone,
        email: form.email,
        baseCurrency: form.base_currency,
        docNumberFormat: form.doc_number_format,
        docNumberPadding: Number(form.doc_number_padding),
      });
      setForm(data);
      setCompany(data);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save company profile');
    } finally {
      setSubmitting(false);
    }
  }

  if (!form) return <DashboardLayout title="Company Profile"><p>Loading...</p></DashboardLayout>;

  return (
    <DashboardLayout title="Company Profile">
      <div className="card" style={{ maxWidth: 640 }}>
        <h2>Company Logo</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Shown on invoices, purchase orders, and other printed documents. PNG or JPG works best, ideally with a transparent or white background.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <CompanyLogo companyId={form.id} size={96} refreshKey={logoRefreshKey} />
          {canManage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="btn btn-secondary btn-sm" style={{ width: 'auto', cursor: 'pointer' }}>
                {logoUploading ? 'Uploading...' : 'Upload logo'}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  disabled={logoUploading}
                  style={{ display: 'none' }}
                />
              </label>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={handleRemoveLogo} disabled={logoUploading}>
                Remove logo
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        {error && <div className="error-banner">{error}</div>}
        {saved && <div className="success-banner">Company profile updated.</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Company name</label>
            <input value={form.name || ''} onChange={update('name')} disabled={!canManage} required />
          </div>
          <div className="form-group">
            <label>Legal / registered name</label>
            <input value={form.legal_name || ''} onChange={update('legal_name')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Nature of business</label>
            <select value={form.nature_of_business || ''} onChange={update('nature_of_business')} disabled={!canManage}>
              <option value="">Select the nature of your business</option>
              {natureOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          {form.license_token && (
            <div className="form-group">
              <label>License token</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', flex: 1 }}>{form.license_token}</code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(form.license_token); showToast('License token copied', 'success'); }}
                >
                  Copy
                </button>
              </div>
              <small style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                {form.license_token_companies >= 2
                  ? 'This token is already used by 2 companies — the maximum for one license.'
                  : `Used by ${form.license_token_companies} of 2 companies. Share this token when registering a second, related company.`}
              </small>
            </div>
          )}
          <div className="form-group">
            <label>GRA Tax ID (TIN)</label>
            <input value={form.tin || ''} onChange={update('tin')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Business registration number</label>
            <input value={form.registration_no || ''} onChange={update('registration_no')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address || ''} onChange={update('address')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>City</label>
            <input value={form.city || ''} onChange={update('city')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Region</label>
            <select value={form.region || ''} onChange={update('region')} disabled={!canManage}>
              <option value="">Select a region</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={form.phone || ''} onChange={update('phone')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email || ''} onChange={update('email')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Base currency</label>
            <select value={form.base_currency || 'GHS'} onChange={update('base_currency')} disabled={!canManage}>
              <option value="GHS">GHS — Ghanaian Cedi</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </div>
          {canManage && (
            <button className="btn btn-primary" style={{ width: 'auto' }} type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save changes'}
            </button>
          )}
        </form>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h2>Document Numbering</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -8 }}>
          Applies to every document type — invoices, purchase orders, quotations, GRNs, receipts, and more. The counter resets every calendar year automatically.
        </p>
        <div className="form-group">
          <label>Format</label>
          <input
            value={form.doc_number_format || ''}
            onChange={update('doc_number_format')}
            disabled={!canManage}
            placeholder="{PREFIX}-{YEAR}-{SEQ}"
          />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Placeholders: <code>{'{PREFIX}'}</code> (e.g. INV, PO, QUO), <code>{'{YEAR}'}</code>, <code>{'{SEQ}'}</code> (required — sequence number, zero-padded).
          </p>
        </div>
        <div className="form-group">
          <label>Sequence padding (digits)</label>
          <input
            type="number" min={1} max={10}
            value={form.doc_number_padding ?? 5}
            onChange={update('doc_number_padding')}
            disabled={!canManage}
            style={{ maxWidth: 120 }}
          />
        </div>
        <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, marginBottom: 16 }}>
          Preview: <strong style={{ fontFamily: 'var(--font-mono)' }}>
            {(form.doc_number_format || '{PREFIX}-{YEAR}-{SEQ}')
              .replace('{PREFIX}', 'INV')
              .replace('{YEAR}', String(new Date().getFullYear()))
              .replace('{SEQ}', String(1).padStart(Number(form.doc_number_padding) || 5, '0'))}
          </strong>
        </div>

        {sequences.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', margin: '0 0 8px' }}>Current counters</h3>
            <table>
              <thead><tr><th>Document type</th><th>Year</th><th>Next number</th></tr></thead>
              <tbody>
                {sequences.map((s) => (
                  <tr key={`${s.prefix}-${s.year}`}>
                    <td>{s.prefix}</td>
                    <td>{s.year}</td>
                    <td>{s.next_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

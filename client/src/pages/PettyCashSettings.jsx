import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function PettyCashSettings() {
  const { showToast } = useToast();
  const [form, setForm] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/petty-cash/settings')
      .then(({ data }) => setForm({ allowEdit: !!data.allow_edit, allowDelete: !!data.allow_delete }))
      .catch(() => setFailed(true));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/petty-cash/settings', form);
      setForm({ allowEdit: !!data.allow_edit, allowDelete: !!data.allow_delete });
      showToast('Petty cash settings saved.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <DashboardLayout title="Petty Cash Settings"><div className="card"><p>Failed to load settings.</p></div></DashboardLayout>;
  if (!form) return <DashboardLayout title="Petty Cash Settings"><div className="card"><p>Loading...</p></div></DashboardLayout>;

  return (
    <DashboardLayout title="Petty Cash Settings">
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><h2>Editing and deleting</h2></div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            These switches apply to the whole company. Even when a switch is on, only users whose role has the
            matching petty cash permission (edit or delete) will see the buttons. Editing or deleting a voucher
            or receipt reverses its ledger entry, and editing also posts a new one.
          </p>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox" id="allowEdit" checked={form.allowEdit}
              onChange={(e) => setForm((f) => ({ ...f, allowEdit: e.target.checked }))}
              style={{ width: 'auto' }}
            />
            <label htmlFor="allowEdit" style={{ margin: 0 }}>Allow editing petty cash accounts, vouchers and receipts</label>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox" id="allowDelete" checked={form.allowDelete}
              onChange={(e) => setForm((f) => ({ ...f, allowDelete: e.target.checked }))}
              style={{ width: 'auto' }}
            />
            <label htmlFor="allowDelete" style={{ margin: 0 }}>Allow deleting petty cash accounts, vouchers and receipts</label>
          </div>
        </div>
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}

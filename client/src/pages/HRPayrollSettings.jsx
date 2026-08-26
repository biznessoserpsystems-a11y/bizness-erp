import { useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function HRPayrollSettings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [ratesForm, setRatesForm] = useState(null);
  const [bands, setBands] = useState([]);
  const [savingRates, setSavingRates] = useState(false);
  const [savingBands, setSavingBands] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/payroll-settings').then(({ data }) => {
      setSettings(data);
      setRatesForm({
        ssnitEmployeeRate: data.ssnit_employee_rate,
        ssnitEmployerRate: data.ssnit_employer_rate,
        ssnitInsurableCeiling: data.ssnit_insurable_ceiling ?? '',
        allowancesTaxable: data.allowances_taxable,
      });
      // Working copy in percentage terms (e.g. 17.5) for the form — the
      // backend stores/validates rate as a decimal (0.175) since that's
      // what payroll calculations actually multiply by.
      setBands(data.payeBands.map((b) => ({
        lowerBound: Number(b.lower_bound),
        upperBound: b.upper_bound === null ? '' : Number(b.upper_bound),
        ratePercent: Number(b.rate) * 100,
      })));
    }).catch(() => setError('Failed to load payroll settings'));
  }
  useEffect(load, []);

  async function saveRates(e) {
    e.preventDefault();
    setError('');
    setSavingRates(true);
    try {
      await api.patch('/payroll-settings', {
        ...ratesForm,
        ssnitInsurableCeiling: ratesForm.ssnitInsurableCeiling === '' ? null : Number(ratesForm.ssnitInsurableCeiling),
      });
      showToast('Statutory rates saved.', 'success');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save statutory rates');
    } finally {
      setSavingRates(false);
    }
  }

  // Editing a band's upper bound re-derives the next band's lower bound
  // automatically, so the table can never drift out of the contiguous,
  // no-gap shape the backend requires — the same discipline the backend's
  // own validation already enforces, just applied live as you type instead
  // of only at save time.
  function updateBandUpperBound(index, value) {
    setBands((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], upperBound: value };
      if (index + 1 < next.length && value !== '') {
        next[index + 1] = { ...next[index + 1], lowerBound: Number(value) };
      }
      return next;
    });
  }

  function updateBandRate(index, value) {
    setBands((prev) => prev.map((b, i) => (i === index ? { ...b, ratePercent: value } : b)));
  }

  function addBand() {
    setBands((prev) => {
      const last = prev[prev.length - 1];
      if (last.upperBound === '' || last.upperBound === null) {
        showToast('Set an upper bound on the last band before adding another.', 'error');
        return prev;
      }
      return [...prev, { lowerBound: Number(last.upperBound), upperBound: '', ratePercent: last.ratePercent }];
    });
  }

  function removeBand(index) {
    if (bands.length <= 1) return;
    setBands((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Re-derive lower bounds down the chain so removing a middle band
      // doesn't leave a gap or overlap.
      for (let i = 1; i < next.length; i++) {
        next[i] = { ...next[i], lowerBound: Number(next[i - 1].upperBound) || next[i].lowerBound };
      }
      return next;
    });
  }

  async function saveBands() {
    setError('');
    setSavingBands(true);
    try {
      const payload = bands.map((b) => ({
        lowerBound: b.lowerBound,
        upperBound: b.upperBound === '' ? null : Number(b.upperBound),
        rate: Number(b.ratePercent) / 100,
      }));
      await api.put('/paye-bands', { bands: payload });
      showToast('PAYE tax bands saved.', 'success');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save PAYE tax bands');
    } finally {
      setSavingBands(false);
    }
  }

  if (settings === null || ratesForm === null) {
    return <DashboardLayout title="HR & Payroll Settings"><div className="card"><p>Loading...</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="HR & Payroll Settings">
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: -4, marginBottom: 16 }}>
        Company-wide statutory configuration — the same rates and bands every payroll run already reads from,
        now editable directly rather than only through a fresh company registration. For the automatic
        monthly payroll schedule, see the "Automatic payroll" button on the Payroll tab.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={saveRates}>
        <div className="card">
          <div className="card-header"><h2>SSNIT rates</h2></div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Employee rate (%)</label>
              <input
                type="number" min="0" max="100" step="0.001" value={ratesForm.ssnitEmployeeRate}
                onChange={(e) => setRatesForm((f) => ({ ...f, ssnitEmployeeRate: e.target.value }))}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Withheld from the employee's basic salary — Ghana's current Tier 1 rate is 5.5%.</p>
            </div>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Employer rate (%)</label>
              <input
                type="number" min="0" max="100" step="0.001" value={ratesForm.ssnitEmployerRate}
                onChange={(e) => setRatesForm((f) => ({ ...f, ssnitEmployerRate: e.target.value }))}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>An employer cost on top of gross salary — Ghana's current rate is 13%.</p>
            </div>
          </div>
          <div className="form-group">
            <label>Insurable ceiling (annual, optional)</label>
            <input
              type="number" min="0" step="0.01" value={ratesForm.ssnitInsurableCeiling}
              onChange={(e) => setRatesForm((f) => ({ ...f, ssnitInsurableCeiling: e.target.value }))}
              placeholder="Leave blank for uncapped"
            />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox" id="allowancesTaxable" checked={ratesForm.allowancesTaxable}
              onChange={(e) => setRatesForm((f) => ({ ...f, allowancesTaxable: e.target.checked }))}
              style={{ width: 'auto' }}
            />
            <label htmlFor="allowancesTaxable" style={{ margin: 0 }}>Allowances count toward chargeable income for PAYE</label>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={savingRates}>
              {savingRates ? 'Saving...' : 'Save SSNIT rates'}
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <div className="card-header"><h2>PAYE tax bands</h2></div>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          Progressive monthly bands applied to chargeable income (gross minus SSNIT). Bands must be contiguous
          with no gaps — editing a band's upper bound automatically moves the next band's lower bound to match.
        </p>
        <table style={{ marginBottom: 16 }}>
          <thead><tr><th>Lower bound</th><th>Upper bound</th><th>Rate (%)</th><th></th></tr></thead>
          <tbody>
            {bands.map((b, i) => (
              <tr key={i}>
                <td>{b.lowerBound.toLocaleString()}</td>
                <td>
                  {i === bands.length - 1 ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>No limit</span>
                  ) : (
                    <input type="number" min="0" step="0.01" value={b.upperBound} onChange={(e) => updateBandUpperBound(i, e.target.value)} style={{ width: 120 }} />
                  )}
                </td>
                <td><input type="number" min="0" max="100" step="0.01" value={b.ratePercent} onChange={(e) => updateBandRate(i, e.target.value)} style={{ width: 90 }} /></td>
                <td>
                  {bands.length > 1 && (
                    <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => removeBand(i)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={addBand}>+ Add band</button>
          <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={saveBands} disabled={savingBands}>
            {savingBands ? 'Saving...' : 'Save PAYE bands'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}

import { Fragment, useEffect, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';

export default function FinancialYears() {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);

  function load() {
    setLoading(true);
    api.get('/financial-years').then(({ data }) => setYears(data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateYearStatus(id, status) {
    await api.patch(`/financial-years/${id}/status`, { status });
    load();
  }

  async function updatePeriodStatus(id, status) {
    await api.patch(`/fiscal-periods/${id}/status`, { status });
    load();
  }

  return (
    <DashboardLayout title="Financial Years">
      <div className="card">
        <div className="card-header">
          <h2>Financial years</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
            + Add financial year
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : years.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No financial years set up yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Periods</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <Fragment key={y.id}>
                  <tr>
                    <td>{y.name}</td>
                    <td>{new Date(y.start_date).toLocaleDateString()}</td>
                    <td>{new Date(y.end_date).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${y.status === 'open' ? 'badge-success' : y.status === 'locked' ? 'badge-danger' : 'badge-neutral'}`}>
                        {y.status}
                      </span>
                    </td>
                    <td>{y.periods.length}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(expanded === y.id ? null : y.id)}>
                        {expanded === y.id ? 'Hide periods' : 'View periods'}
                      </button>{' '}
                      {y.status !== 'closed' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => updateYearStatus(y.id, 'closed')}>
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === y.id &&
                    y.periods.map((p) => (
                      <tr key={p.id} style={{ background: '#F7F4EC' }}>
                        <td style={{ paddingLeft: 24 }}>{p.name}</td>
                        <td colSpan={2}>
                          {new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`badge ${p.status === 'open' ? 'badge-success' : p.status === 'locked' ? 'badge-danger' : 'badge-neutral'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td></td>
                        <td>
                          {p.status === 'open' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => updatePeriodStatus(p.id, 'closed')}>
                              Close period
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <FinancialYearModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function FinancialYearModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generateMonthlyPeriods, setGenerateMonthlyPeriods] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/financial-years', { name, startDate, endDate, generateMonthlyPeriods });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create financial year');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add financial year</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY2026" required />
          </div>
          <div className="form-group">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div className="checkbox-row">
            <input type="checkbox" checked={generateMonthlyPeriods} onChange={(e) => setGenerateMonthlyPeriods(e.target.checked)} />
            <label style={{ margin: 0 }}>Automatically generate monthly fiscal periods</label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

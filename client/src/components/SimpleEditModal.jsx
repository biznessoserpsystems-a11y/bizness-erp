import { useState } from 'react';

// A small edit dialog for a record's header fields (notes, reference, due date...).
// fields: [{ key, label, type: 'text' | 'date' | 'textarea' | 'select', options?: [{ value, label }] }]
// onSave(values) should perform the API call and throw on failure; the error is shown in the dialog.
export default function SimpleEditModal({ title, fields, initial, onSave, onClose, hint }) {
  const [values, setValues] = useState(() => {
    const v = {};
    fields.forEach((f) => { v[f.key] = initial?.[f.key] ?? ''; });
    return v;
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSave(values);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {hint && <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{hint}</p>}
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          {fields.map((f) => (
            <div className="form-group" key={f.key}>
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea rows={3} value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              ) : (
                <input type={f.type || 'text'} value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>{submitting ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

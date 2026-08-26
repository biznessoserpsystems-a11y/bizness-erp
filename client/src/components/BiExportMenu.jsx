import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

const FORMATS = [
  { format: 'pdf', label: 'Export as PDF' },
  { format: 'xlsx', label: 'Export as Excel' },
  { format: 'docx', label: 'Export as Word' },
];

// The BI counterpart to the app's existing ExportMenu — same dropdown
// look and feel, same three formats, same underlying PDF/Excel/Word
// generation on the backend (see exportService.js). Built as its own
// component rather than reusing ExportMenu directly because that one is
// GET-plus-query-string, re-running a fixed report from its own known
// endpoint and params; a BI report's shape is whatever the person just
// built — any data source, any dimensions, any metrics — so there's no
// fixed query to re-run from a URL. The columns and rows already on
// screen are POSTed directly instead.
export default function BiExportMenu({ columns, rows, title }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleExport(format) {
    setOpen(false);
    setError('');
    setDownloading(format);
    try {
      const res = await api.post('/bi/export', { columns, rows, format, title }, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bi-report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Export failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div ref={containerRef} className="dropdown-anchor" style={{ display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ width: 'auto' }}
        disabled={!!downloading}
        onClick={() => setOpen((o) => !o)}
      >
        {downloading ? 'Exporting...' : '⬇ Export ▾'}
      </button>
      {open && (
        <div className="dropdown-menu">
          {FORMATS.map((f) => (
            <button key={f.format} type="button" className="dropdown-menu-item" onClick={() => handleExport(f.format)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      {error && <div className="error-banner" style={{ marginTop: 8, fontSize: 12.5 }}>{error}</div>}
    </div>
  );
}

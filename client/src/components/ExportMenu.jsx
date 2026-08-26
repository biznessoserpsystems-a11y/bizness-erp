import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

const FORMATS = [
  { format: 'xlsx', label: 'Export as Excel' },
  { format: 'pdf', label: 'Export as PDF' },
  { format: 'docx', label: 'Export as Word' },
];

/**
 * Drop into any report toolbar to add Excel/PDF/Word export. Reuses the
 * exact same GET endpoint the page already calls for its on-screen data —
 * the backend just returns a file instead of JSON when `?format=` is
 * present (see exportService.js) — so there's no separate export route to
 * keep in sync with the report's own filters.
 *
 * Props:
 *   path       — the report's API path, e.g. '/financial-statements/income-statement'
 *   params     — the same query params the page's own load() call uses (from/to/warehouseId/etc)
 *   filename   — base filename without extension, e.g. 'income-statement-2026-01-01-to-2026-12-31'
 */
export default function ExportMenu({ path, params, filename }) {
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
      const res = await api.get(path, {
        params: { ...params, format },
        responseType: 'blob',
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.${format}`;
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

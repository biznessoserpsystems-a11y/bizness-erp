import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';

function formatBytes(n) {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupRestore() {
  const confirm = useConfirm();
  const [logs, setLogs] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const [file, setFile] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const fileInputRef = useRef(null);

  function loadLogs() {
    api.get('/settings/backup-logs').then(({ data }) => setLogs(data)).catch(() => {});
  }

  useEffect(loadLogs, []);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError('');
    try {
      const res = await api.get('/settings/backup', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bizness-os-backup-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      loadLogs();
    } catch (err) {
      setDownloadError('Backup failed. Check the server logs, or below once refreshed.');
      loadLogs();
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore() {
    if (!file) return;
    if (confirmText !== 'RESTORE') return;
    const ok = await confirm(
      'This replaces every table in the database with the contents of this backup file. All current data — every company, every transaction — will be gone. This cannot be undone. Are you absolutely sure?',
      { danger: true, confirmLabel: 'Restore and replace everything' }
    );
    if (!ok) return;

    setRestoring(true);
    setRestoreResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('confirm', confirmText);
      const { data } = await api.post('/settings/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRestoreResult({ success: true, message: 'Restore completed successfully.' });
      setFile(null);
      setConfirmText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setRestoreResult({ success: false, message: err.response?.data?.error || 'Restore failed.' });
    } finally {
      setRestoring(false);
      loadLogs();
    }
  }

  return (
    <DashboardLayout title="Backup &amp; Restore" breadcrumb={[{ label: 'Settings' }, { label: 'Backup & Restore' }]}>
      <div className="card">
        <h2>Download a backup</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Downloads a complete database dump — every company, every table, every transaction currently in the system — as a plain <code>.sql</code> file, generated live via <code>pg_dump</code>. Nothing is stored on the server; the file streams straight to your browser.
        </p>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Preparing backup...' : '⬇ Download backup now'}
        </button>
        {downloadError && <div className="error-banner" style={{ marginTop: 12 }}>{downloadError}</div>}
      </div>

      <div className="card">
        <h2>Restore from a backup</h2>
        <div className="warning-banner" style={{ marginBottom: 16 }}>
          <strong>This replaces all existing data.</strong> Restoring a backup drops and recreates every table in the database from the uploaded file. There is no way to undo this except restoring a different backup. Only proceed if you're certain.
        </div>

        <div className="form-group">
          <label>Backup file (.sql)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="form-group">
          <label>Type <strong>RESTORE</strong> to confirm</label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESTORE"
            style={{ maxWidth: 240 }}
          />
        </div>

        <button
          className="btn btn-danger"
          style={{ width: 'auto' }}
          onClick={handleRestore}
          disabled={!file || confirmText !== 'RESTORE' || restoring}
        >
          {restoring ? 'Restoring... do not close this page' : 'Restore from backup'}
        </button>

        {restoreResult && (
          <div className={restoreResult.success ? 'success-banner' : 'error-banner'} style={{ marginTop: 16 }}>
            {restoreResult.message}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Backup &amp; restore history</h2>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13.5 }}>No backups or restores have been run yet.</p>
        ) : (
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Status</th><th>Size</th><th>By</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ textTransform: 'capitalize' }}>{l.action}</td>
                  <td><span className={`badge ${l.status === 'success' ? 'badge-success' : 'badge-danger'}`}>{l.status}</span></td>
                  <td>{formatBytes(l.file_size_bytes)}</td>
                  <td>{l.first_name ? `${l.first_name} ${l.last_name}` : '—'}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--color-text-muted)' }} title={l.error_message || ''}>
                    {l.error_message || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}

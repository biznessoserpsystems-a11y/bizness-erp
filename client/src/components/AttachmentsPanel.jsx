import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsPanel({ relatedType, relatedId }) {
  const [attachments, setAttachments] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  function load() {
    api.get(`/attachments?relatedType=${relatedType}&relatedId=${relatedId}`)
      .then(({ data }) => setAttachments(data))
      .catch(() => setAttachments([]));
  }

  useEffect(load, [relatedType, relatedId]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('relatedType', relatedType);
      form.append('relatedId', relatedId);
      await api.post('/attachments', form);
      load();
      showToast('File uploaded.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to upload file', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDownload(att) {
    try {
      const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = att.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Failed to download file', 'error');
    }
  }

  async function handleDelete(att) {
    const ok = await confirm(`Delete "${att.file_name}"?`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/attachments/${att.id}`);
      load();
      showToast('Attachment deleted.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete attachment', 'error');
    }
  }

  return (
    <div className="attachments-panel">
      <div className="attachments-header">
        <span className="attachments-count">
          {attachments === null ? 'Loading...' : `${attachments.length} file${attachments.length === 1 ? '' : 's'}`}
        </span>
        <label className="btn btn-secondary btn-sm attachments-upload-btn">
          {uploading ? 'Uploading...' : '+ Upload file'}
          <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={uploading} style={{ display: 'none' }} />
        </label>
      </div>

      {attachments && attachments.length === 0 && (
        <p className="dashboard-empty-note">No files attached yet.</p>
      )}

      {attachments && attachments.length > 0 && (
        <ul className="attachments-list">
          {attachments.map((a) => (
            <li key={a.id}>
              <button className="attachment-name" onClick={() => handleDownload(a)} title="Download">
                📎 {a.file_name}
              </button>
              <span className="attachment-meta">
                {formatSize(a.size_bytes)} · {a.uploaded_by_first_name} {a.uploaded_by_last_name} · {new Date(a.created_at).toLocaleDateString()}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(a)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

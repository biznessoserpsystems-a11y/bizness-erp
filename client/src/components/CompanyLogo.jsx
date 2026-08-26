import { useEffect, useState } from 'react';
import api from '../services/api';

// Displays the company's logo (an attachment with relatedType="company"),
// or a placeholder tile if none has been uploaded yet. Images are
// auth-gated like every other attachment, so this fetches the file as a
// blob and renders it via an object URL rather than a plain
// <img src="..."> (which can't carry the Authorization header).
export default function CompanyLogo({ companyId, size = 96, radius = 12, refreshKey }) {
  const [url, setUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setUrl(null);
    setLoaded(false);
    if (!companyId) return undefined;

    api.get(`/attachments?relatedType=company&relatedId=${companyId}`)
      .then(({ data }) => {
        const image = (data || []).find((a) => (a.mime_type || '').startsWith('image/'));
        if (!image || cancelled) return null;
        return api.get(`/attachments/${image.id}/download`, { responseType: 'blob' });
      })
      .then((res) => {
        if (cancelled) return;
        if (res) {
          objectUrl = window.URL.createObjectURL(res.data);
          setUrl(objectUrl);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, refreshKey]);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {url ? (
        <img src={url} alt="Company logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ fontSize: size * 0.36, color: 'var(--color-text-muted)', opacity: loaded ? 1 : 0.4 }}>🏢</span>
      )}
    </div>
  );
}

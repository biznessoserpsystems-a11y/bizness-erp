import { useEffect, useState } from 'react';
import api from '../services/api';

// Displays a product's first uploaded photo (an attachment with
// relatedType="product"), or a placeholder tile if none has been uploaded
// yet. Images are auth-gated like every other attachment, so this fetches
// the file as a blob and renders it via an object URL rather than a plain
// <img src="..."> (which can't carry the Authorization header).
export default function ProductImage({ productId, size = 64, radius = 8, fill = false }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setUrl(null);

    api.get(`/attachments?relatedType=product&relatedId=${productId}`)
      .then(({ data }) => {
        const image = (data || []).find((a) => (a.mime_type || '').startsWith('image/'));
        if (!image || cancelled) return null;
        return api.get(`/attachments/${image.id}/download`, { responseType: 'blob' });
      })
      .then((res) => {
        if (!res || cancelled) return;
        objectUrl = window.URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [productId]);

  return (
    <div
      className="product-thumb"
      style={
        fill
          ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }
          : {
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
            }
      }
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: fill ? 32 : size * 0.42, color: 'var(--color-text-muted)' }}>📦</span>
      )}
    </div>
  );
}

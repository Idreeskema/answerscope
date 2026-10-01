import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export type AuthenticatedImageStatus = 'loading' | 'ready' | 'unavailable';

/**
 * Fetches an image from our own API (which requires a JWT bearer header,
 * so a plain <img src="/api/..."> can't be used directly) as a blob via the
 * authenticated axios client, and exposes it as an object URL. Revokes the
 * object URL on cleanup/url change to avoid leaking memory.
 */
export function useAuthenticatedImage(url: string | null): { src: string | null; status: AuthenticatedImageStatus } {
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthenticatedImageStatus>('loading');

  useEffect(() => {
    if (!url) {
      setSrc(null);
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setStatus('loading');
    setSrc(null);

    apiClient
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, status };
}

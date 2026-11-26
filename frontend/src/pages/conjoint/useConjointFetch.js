/**
 * useConjointFetch(url, { token, enabled, deps })
 *
 * GET `url` with the bearer token; returns { data, loading, error, refetch }.
 * Errors are kept as a Thai message (never thrown) so each card can render its own
 * error state. A later request supersedes an earlier one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { apiErrorTextAsync } from '@/lib/apiError';

export const useConjointFetch = (url, { token, enabled = true } = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const run = useCallback(async () => {
    if (!url || !enabled) return;
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const r = await axios.get(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, timeout: 120000 });
      if (id === seq.current) setData(r.data);
    } catch (e) {
      const msg = await apiErrorTextAsync(e, 'โหลดข้อมูลไม่สำเร็จ');
      if (id === seq.current) { setError(msg); setData(null); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [url, token, enabled]);

  useEffect(() => { run(); }, [run]);
  return { data, loading, error, refetch: run };
};

export default useConjointFetch;

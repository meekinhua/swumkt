/**
 * useImportBodyExtra(url, extra)
 *
 * <ExternalAiDialog> / <AiActionButton> POST only { part_key, content, model_label }
 * to `importUrl`. Several Conjoint imports need more in the body (the interpretation
 * import needs {method, compare_all}; the thesis import needs {methods, chapters,
 * extra_prompt}; the qualitative import can carry {qualitative_data}).
 *
 * Until the shared dialog gets an `importExtra` prop (reported to the lead), this
 * hook merges `extra` into the body of POSTs to exactly `url` for as long as the
 * calling component is mounted. `extra` may change between renders — the latest
 * value is always used.
 */
import { useEffect, useRef } from 'react';
import axios from 'axios';

export const useImportBodyExtra = (url, extra) => {
  const ref = useRef(extra);
  ref.current = extra;
  useEffect(() => {
    if (!url) return undefined;
    const id = axios.interceptors.request.use((config) => {
      if ((config.method || '').toLowerCase() === 'post' && config.url === url) {
        const body = config.data && typeof config.data === 'object' ? config.data : {};
        config.data = { ...(ref.current || {}), ...body };
      }
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, [url]);
};

export default useImportBodyExtra;

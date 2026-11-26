/**
 * apiErrorText(error, fallback) — always returns a STRING that is safe to pass
 * to toast.error().
 *
 * FastAPI's `detail` can be a string, a list of validation errors (422) or an
 * object (e.g. the 409 `llm_external_only` body `{code, feature, message, hint}`).
 * Passing the latter two straight to a toast makes React throw "Objects are not
 * valid as a React child", which is worse than the original error.
 */
export const apiErrorText = (error, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง') => {
  const d = error && error.response && error.response.data && error.response.data.detail;
  if (typeof d === 'string' && d.trim()) return d;
  if (d && typeof d === 'object' && !Array.isArray(d) && typeof d.message === 'string' && d.message) return d.message;
  if (Array.isArray(d) && d.length) {
    const first = d[0];
    if (first && typeof first.msg === 'string') return first.msg;
  }
  return fallback;
};

export default apiErrorText;

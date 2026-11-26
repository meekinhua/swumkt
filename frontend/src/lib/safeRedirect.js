/**
 * safeRedirect(fallback) — the `?redirect=` target of the current URL if it is a
 * same-origin path ("/alumni/invite/abc"), else `fallback`.
 *
 * Rejects absolute URLs, protocol-relative "//evil.com", "/\evil.com" (browsers
 * treat a backslash like a slash) and anything with a scheme or control chars.
 */
export const safeRedirect = (fallback = '/dashboard', search = (typeof window !== 'undefined' ? window.location.search : '')) => {
  let r = null;
  try { r = new URLSearchParams(search).get('redirect'); } catch { r = null; }
  if (!r || typeof r !== 'string') return fallback;
  if (!r.startsWith('/') || r.startsWith('//') || r.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(r)) return fallback;
  return r;
};

export default safeRedirect;

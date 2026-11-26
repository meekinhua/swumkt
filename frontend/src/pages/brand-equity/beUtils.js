/**
 * Small shared helpers for the Brand Equity pages: URL/filter building,
 * number formatting, error text, authenticated downloads.
 *
 * Number conventions used everywhere on these pages (keep them consistent):
 *   - dimension scores / BES ............ integer 0-100 in rings, 1 decimal in tables
 *   - percentages ....................... 1 decimal, and ALWAYS next to an n
 *   - p-values .......................... 3 decimals, "< 0.001" below that
 *   - t / effect sizes / alpha .......... 2 decimals
 */
import axios from 'axios';

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

/** `?from=&to=&wave=&segments=` — the SAME params the dashboard sends, so AI
 *  results land in the slice the user is looking at. Empty values are skipped. */
export const buildFilterParams = (f) => {
  const parts = [];
  if (!f) return parts;
  if (f.from) parts.push(`from=${encodeURIComponent(f.from)}`);
  if (f.to) parts.push(`to=${encodeURIComponent(f.to)}`);
  if (f.wave && f.wave !== 'all') parts.push(`wave=${encodeURIComponent(f.wave)}`);
  const segs = Object.fromEntries(
    Object.entries(f.segments || {}).filter(([, vs]) => (vs || []).length),
  );
  if (Object.keys(segs).length) parts.push(`segments=${encodeURIComponent(JSON.stringify(segs))}`);
  return parts;
};

export const buildFilterQS = (f, extra = []) => {
  const parts = [...buildFilterParams(f), ...extra.filter(Boolean)];
  return parts.length ? `?${parts.join('&')}` : '';
};

export const isFilterActive = (f) => !!(f && (
  f.from || f.to || (f.wave && f.wave !== 'all')
  || Object.values(f.segments || {}).some((v) => (v || []).length)
));

// ---------- formatting ----------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const fmt0 = (v) => (isNum(v) ? String(Math.round(v)) : '—');
export const fmt1 = (v) => (isNum(v) ? (Math.round(v * 10) / 10).toFixed(1) : '—');
export const fmt2 = (v) => (isNum(v) ? (Math.round(v * 100) / 100).toFixed(2) : '—');
export const fmtPct = (v) => (isNum(v) ? `${fmt1(v)}%` : '—');
export const fmtSigned = (v, d = 1) => {
  if (!isNum(v)) return '—';
  const s = d === 0 ? String(Math.round(v)) : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
  return v > 0 ? `+${s}` : s;
};
export const fmtP = (p) => (isNum(p) ? (p < 0.001 ? '< 0.001' : p.toFixed(3)) : '—');
export const fmtCI = (ci, d = 1) => (Array.isArray(ci) && ci.length === 2 && isNum(ci[0]) && isNum(ci[1])
  ? `${ci[0].toFixed(d)}–${ci[1].toFixed(d)}` : '—');

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
};

/** Deterministic 0..1 from a string — replaces Math.random() jitter that made
 *  word clouds re-shuffle on every render. */
export const hash01 = (s) => {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
};

// ---------- errors ----------
/** Human-readable text from an axios error (string detail, {message}, or FastAPI list). */
export const errText = (e, fallback = 'เกิดข้อผิดพลาด') => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && !Array.isArray(d) && d.message) return d.message;
  if (Array.isArray(d) && d[0]?.msg) return d.map((x) => x.msg).join('; ');
  if (e?.response?.status === 403) return 'ไม่มีสิทธิ์ใช้งานส่วนนี้';
  if (e?.response && e.response.status >= 500) return 'เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง';
  if (e?.message === 'Network Error') return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่';
  return e?.message || fallback;
};

/** For the 422 `external_import_invalid` shape: { message, errors: [..] }. */
export const importErrors = (e) => {
  const d = e?.response?.data?.detail;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    return { message: d.message || 'นำเข้าไม่สำเร็จ', errors: Array.isArray(d.errors) ? d.errors : [] };
  }
  return { message: errText(e, 'นำเข้าไม่สำเร็จ'), errors: [] };
};

// ---------- downloads ----------
export const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1500);
};

const filenameFromHeaders = (headers, fallback) => {
  const cd = headers?.['content-disposition'] || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : fallback;
};

/** GET/POST a file with the auth header and save it. Returns the filename used. */
export const downloadFile = async ({ url, token, method = 'GET', data, fallbackName = 'download' }) => {
  const r = await axios({
    method, url, data, responseType: 'blob', headers: authHeaders(token), timeout: 180000,
  });
  const name = filenameFromHeaders(r.headers, fallbackName);
  saveBlob(r.data, name);
  return name;
};

/** Blob error bodies are Blobs — read the JSON `detail` out of them. */
export const blobErrText = async (e, fallback) => {
  try {
    const b = e?.response?.data;
    if (b instanceof Blob) {
      const t = await b.text();
      const j = JSON.parse(t);
      const d = j?.detail;
      if (typeof d === 'string') return d;
      if (d?.message) return d.message;
    }
  } catch { /* fall through */ }
  return errText(e, fallback);
};

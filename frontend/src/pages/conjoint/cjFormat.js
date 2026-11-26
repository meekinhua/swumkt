/**
 * Shared number / label helpers for the Conjoint pages.
 * One place so every card prints numbers the same way (Thai-first copy).
 */

export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Fixed decimals, "—" when missing. */
export const fmtNum = (x, d = 2) => (isNum(x) ? x.toFixed(d) : '—');

/** Signed decimals (+0.123 / -0.123) for utilities and coefficients. */
export const fmtSigned = (x, d = 3) => (isNum(x) ? `${x > 0 ? '+' : ''}${x.toFixed(d)}` : '—');

/** Percent where the input is already 0-100. */
export const fmtPct = (x, d = 1) => (isNum(x) ? `${x.toFixed(d)}%` : '—');

/** Percent where the input is a 0-1 share. */
export const fmtShare = (x, d = 1) => (isNum(x) ? `${(x * 100).toFixed(d)}%` : '—');

/** APA-ish p-value: "< .001", ".042". */
export const fmtP = (p) => {
  if (!isNum(p)) return '—';
  if (p < 0.001) return '< .001';
  return p.toFixed(3).replace(/^0/, '');
};

export const stars = (p) => {
  if (!isNum(p)) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
};

/** "[lo, hi]" confidence interval. */
export const fmtCI = (lo, hi, d = 3) => (isNum(lo) && isNum(hi) ? `[${lo.toFixed(d)}, ${hi.toFixed(d)}]` : '—');

/** Thousands separator, no decimals unless asked. */
export const fmtInt = (x) => (isNum(x) ? Math.round(x).toLocaleString('th-TH') : '—');

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
};

/**
 * Method picker copy: plain Thai first, the technical name beside it.
 * `short` is used inside sentences, `label` in the picker.
 */
export const METHOD_INFO = {
  mnl: {
    short: 'MNL (วิธีมาตรฐาน)',
    label: '⭐ วิธีมาตรฐาน — ทดสอบนัยสำคัญได้ (Multinomial Logit, MNL)',
    full: 'Multinomial Logit (MNL)',
    why: 'เหมาะกับงานส่วนใหญ่และวิทยานิพนธ์ — ให้ค่าความคลาดเคลื่อน ช่วงความเชื่อมั่น 95% และ p-value',
  },
  counting: {
    short: 'นับความถี่',
    label: '📊 นับความถี่แบบง่าย — ดูภาพคร่าวๆ (Counting)',
    full: 'Counting Method (นับความถี่)',
    why: 'ดูว่าระดับไหนถูกเลือกบ่อย ไม่มีการทดสอบทางสถิติ ใช้เป็นภาพเบื้องต้นเท่านั้น',
  },
  mixed_logit: {
    short: 'Mixed Logit',
    label: '🔀 เมื่อคนแต่ละกลุ่มชอบไม่เหมือนกัน (Mixed Logit)',
    full: 'Mixed Logit',
    why: 'ดูว่าความชอบของผู้ตอบ “กระจาย” แค่ไหน ใช้เมื่อข้อมูลมากพอ (ราว 150 คนขึ้นไป)',
  },
  hierarchical_bayes: {
    short: 'ผลรายบุคคล (HB)',
    label: '🎯 เมื่อต้องการผลรายบุคคล (Hierarchical Bayes / Empirical Bayes)',
    full: 'Hierarchical Bayes (Empirical Bayes)',
    why: 'ให้ค่าความชอบรายคน ประมาณแบบ Empirical Bayes จาก Mixed Logit (ไม่ใช่ MCMC เต็มรูปแบบ)',
  },
  linear_regression: {
    short: 'OLS (เส้นฐาน)',
    label: '📈 เส้นฐานเชิงพรรณนา (Linear Regression, OLS)',
    full: 'Linear Regression (OLS)',
    why: 'ใช้เป็นเส้นฐานเปรียบเทียบเท่านั้น ไม่ใช่แบบจำลองการเลือกที่แท้จริง',
  },
};

export const methodName = (m) => (METHOD_INFO[m] ? METHOD_INFO[m].full : m);

/** Save a Blob as a file. */
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

// Error text: use apiErrorText / apiErrorTextAsync (blob downloads) from '@/lib/apiError'.

/** Read a File as a data: URL (for image upload to the existing upload endpoints). */
export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error || new Error('read failed'));
  r.readAsDataURL(file);
});

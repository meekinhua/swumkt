// Brand Health verdict tiers based on Brand Equity Score (0-100).
// Used on hero featured card and showcase summary blocks.

export const BRAND_HEALTH_TIERS = [
  {
    min: 80, max: 100,
    label: 'Champion', labelTh: 'ผู้นำตลาด',
    color: '#1B75BC', bg: 'rgba(27,117,188,0.10)', border: 'rgba(27,117,188,0.35)',
    note: 'Top of mind, สร้าง defensive moat ได้',
  },
  {
    min: 65, max: 79.99,
    label: 'Strong', labelTh: 'แข็งแกร่ง',
    color: '#10B981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.35)',
    note: 'แบรนด์มี loyalty + identity ชัด',
  },
  {
    min: 50, max: 64.99,
    label: 'Healthy', labelTh: 'สุขภาพดี',
    color: '#06B6D4', bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.35)',
    note: 'มี base ดี · ต้องปั้น edge เพิ่ม',
  },
  {
    min: 35, max: 49.99,
    label: 'At Watch', labelTh: 'เฝ้าระวัง',
    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.40)',
    note: 'สัญญาณอ่อนใน 1-2 มิติ ต้องลงมือ',
  },
  {
    min: 0, max: 34.99,
    label: 'At Risk', labelTh: 'เสี่ยง',
    color: '#E53935', bg: 'rgba(229,57,53,0.10)', border: 'rgba(229,57,53,0.40)',
    note: 'หลุดจากใจลูกค้าเร็ว · ต้อง reposition',
  },
];

export function getBrandHealthTier(bes) {
  // Classify the value the user SEES. Every surface displays a rounded BES, so
  // classifying the raw number made 49.7 display as "50 · At Watch" on the list
  // card and "50 · Healthy" on the dashboard hero.
  const v = Math.round(Number(bes ?? 0));
  return BRAND_HEALTH_TIERS.find(t => v >= t.min && v <= t.max) || BRAND_HEALTH_TIERS[BRAND_HEALTH_TIERS.length - 1];
}

// Identify the weakest dimension for a "watch this" callout.
// `scores._measured` (served by the backend) lists the dimensions that actually
// produced a score; unmeasured ones arrive as 0 and must not be named as the
// brand's weak point.
export function getWeakestDimension(scores) {
  if (!scores) return null;
  const measured = Array.isArray(scores._measured) ? scores._measured : null;
  const dims = [
    { key: 'awareness', label: 'Awareness', labelTh: 'การรู้จัก' },
    { key: 'quality', label: 'Perceived Quality', labelTh: 'คุณภาพที่รับรู้' },
    { key: 'identity', label: 'Identity vs Image', labelTh: 'ภาพลักษณ์' },
    { key: 'loyalty', label: 'Loyalty', labelTh: 'ความภักดี' },
  ].filter(d => !measured || measured.includes(d.key));
  let weakest = null;
  for (const d of dims) {
    const v = Number(scores[d.key] ?? 0);
    if (weakest === null || v < weakest.value) weakest = { ...d, value: v };
  }
  return weakest;
}

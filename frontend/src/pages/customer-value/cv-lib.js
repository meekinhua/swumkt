// Customer Value Lab — shared data + math (mirrors backend routes/customer_value.py)
// Principle (CBS04):  Customer Value = Benefit − Price (Cost)

export const INDUSTRIES = [
  { id: 'food', label: 'ร้านอาหาร / เครื่องดื่ม', min: 30, mid: 120, max: 400 },
  { id: 'hotel', label: 'โรงแรม / ที่พัก', min: 500, mid: 2500, max: 8000 },
  { id: 'service', label: 'บริการ', min: 200, mid: 1500, max: 6000 },
  { id: 'retail', label: 'ค้าปลีก / สินค้า', min: 50, mid: 500, max: 3000 },
  { id: 'generic', label: 'ทั่วไป', min: 0, mid: 100, max: 200 },
];

export const industryRange = (id) =>
  INDUSTRIES.find((x) => x.id === id) || INDUSTRIES[INDUSTRIES.length - 1];

// Benefit categories (3) + Cost categories (3 — time folded into inconvenience,
// effort folded into money, per the agreed model).
export const BENEFIT_CATS = [
  { id: 'functional', label: 'Functional', th: 'ประโยชน์ใช้สอย / คุณภาพ', icon: 'fa-gears' },
  { id: 'economic', label: 'Economic', th: 'ความคุ้มค่า / ประหยัด', icon: 'fa-coins' },
  { id: 'psychological', label: 'Psychological', th: 'อารมณ์ · สังคม · สถานะ', icon: 'fa-heart' },
];

export const COST_CATS = [
  { id: 'money', label: 'Money', th: 'ราคา / เงิน (รวม effort)', icon: 'fa-money-bill-wave' },
  { id: 'inconvenience', label: 'Inconvenience', th: 'ความไม่สะดวก (รวมเวลา)', icon: 'fa-hourglass-half' },
  { id: 'risk', label: 'Risk', th: 'ความเสี่ยง / จิตใจ', icon: 'fa-triangle-exclamation' },
];

export const PRINCIPLE_TAGS = {
  'kotler-value': { label: 'Kotler · Value', color: '#1B75BC' },
  'kotler-engagement': { label: 'Kotler · Engagement', color: '#0E5538' },
  'drucker-selfsell': { label: 'Drucker · Self-sell', color: '#C8102E' },
};

// Default factor library (suggested, unchecked) per industry. Generic fallback used
// when an industry has no specific entry for a category.
const G = {
  functional: ['คุณภาพดี / ทนทาน', 'ใช้งานง่าย', 'ตรงตามที่โฆษณา', 'ตัวเลือกหลากหลาย'],
  economic: ['ราคาคุ้มค่า', 'มีโปรโมชัน / ส่วนลด', 'สะสมแต้ม / สิทธิพิเศษ'],
  psychological: ['ภูมิใจที่ได้ใช้', 'แบรนด์น่าเชื่อถือ', 'รู้สึกเป็นส่วนหนึ่งของกลุ่ม'],
  inconvenience: ['รอนาน / คิวยาว', 'เดินทางลำบาก', 'ขั้นตอนยุ่งยาก'],
  risk: ['กลัวไม่คุ้มเงิน', 'ไม่มั่นใจคุณภาพ', 'กลัวบริการหลังการขายแย่'],
};

const LIB = {
  food: {
    functional: ['รสชาติอร่อย', 'วัตถุดิบสด / สะอาด', 'ปริมาณคุ้มอิ่ม', 'เมนูหลากหลาย'],
    economic: ['ราคาเข้าถึงได้', 'เซ็ตคุ้มค่า', 'โปรโมชันบ่อย'],
    psychological: ['บรรยากาศร้านดี', 'ถ่ายรูปสวย / น่าแชร์', 'แบรนด์ที่คนยอมรับ'],
    inconvenience: ['คิวยาว / รอนาน', 'ที่จอดรถยาก', 'สั่งออนไลน์ยุ่งยาก'],
    risk: ['กลัวไม่อร่อยตามรีวิว', 'กังวลความสะอาด', 'กลัวราคาแพงเกินคุณภาพ'],
  },
  hotel: {
    functional: ['ห้องสะอาด', 'สิ่งอำนวยความสะดวกครบ', 'ทำเลดี', 'เตียงนอนสบาย'],
    economic: ['ราคาคุ้มต่อคืน', 'รวมอาหารเช้า', 'ยกเลิกฟรี'],
    psychological: ['บริการประทับใจ', 'หรูหรา / ได้หน้า', 'วิวสวย'],
    inconvenience: ['เช็คอินช้า', 'ไกลแหล่งท่องเที่ยว', 'จองยุ่งยาก'],
    risk: ['กลัวไม่ตรงปก', 'กังวลความปลอดภัย', 'กลัวเสียงดัง / ไม่สงบ'],
  },
  service: {
    functional: ['ผลงานมีคุณภาพ', 'ตรงเวลา', 'ทีมงานเชี่ยวชาญ', 'แก้ปัญหาได้จริง'],
    economic: ['ราคาสมเหตุผล', 'มีแพ็กเกจคุ้ม', 'รับประกันงาน'],
    psychological: ['ดูแลใส่ใจ', 'สื่อสารดี / ไว้ใจได้', 'แบรนด์มืออาชีพ'],
    inconvenience: ['นัดหมายยาก', 'ขั้นตอนเยอะ', 'ตอบกลับช้า'],
    risk: ['กลัวงานไม่ได้ดั่งใจ', 'กลัวมีค่าใช้จ่ายแฝง', 'ไม่มั่นใจการรับประกัน'],
  },
  retail: {
    functional: ['สินค้าคุณภาพ', 'ของแท้ / รับประกัน', 'มีให้เลือกครบ'],
    economic: ['ราคาดี', 'ส่งฟรี', 'แลกเปลี่ยน / คืนได้'],
    psychological: ['แบรนด์มีระดับ', 'แพ็กเกจสวย', 'รู้สึกพิเศษ'],
    inconvenience: ['ส่งช้า', 'หาซื้อยาก', 'คืนสินค้ายุ่งยาก'],
    risk: ['กลัวได้ของปลอม', 'กลัวของเสีย / ชำรุด', 'ไม่มั่นใจไซซ์ / สเปก'],
  },
};

export function defaultFactorPool(industry, category) {
  const pool = (LIB[industry] && LIB[industry][category]) || G[category] || [];
  return pool;
}

let _seq = 0;
export const newFactor = (label, weight = 2, checked = true) => ({
  id: `f${Date.now()}_${_seq++}`,
  label,
  weight: Math.max(1, Math.min(3, weight)),
  checked,
});

// ---- scoring (must match backend score_brand) ----
const catScore = (factors) =>
  Math.min(10, (factors || []).reduce((s, f) => (f.checked ? s + (Number(f.weight) || 1) : s), 0));

const moneyScore = (price, min, max) => {
  if (max <= min) return 5;
  const t = (Number(price) - min) / (max - min);
  return Math.max(1, Math.min(10, 1 + t * 9));
};

export function scoreBrand(brand, range) {
  const b = brand.benefits || {};
  const c = brand.costs || {};
  const func = catScore(b.functional);
  const econ = catScore(b.economic);
  const psych = catScore(b.psychological);
  const benefit = +(((func + econ + psych) / 3) * 10).toFixed(1);
  const money = moneyScore(brand.price_value ?? range.mid, range.min, range.max);
  const inconv = catScore(c.inconvenience);
  const risk = catScore(c.risk);
  const cost = +(((money + inconv + risk) / 3) * 10).toFixed(1);
  return {
    benefit,
    cost,
    net: +(benefit - cost).toFixed(1),
    breakdown: {
      functional: +func.toFixed(1), economic: +econ.toFixed(1), psychological: +psych.toFixed(1),
      money: +money.toFixed(1), inconvenience: +inconv.toFixed(1), risk: +risk.toFixed(1),
    },
  };
}

// ---- perception timeline (over/under/balanced promise) ----
// expectation is the promise level the marketing sets; experienced value converges
// to the brand's actual value; satisfaction = experienced − expectation.
export const PERCEPTION_PROFILES = [
  { id: 'A', label: 'Over-promise', th: 'โฆษณาเกินจริง', mult: 1.45,
    note: 'สร้างความคาดหวังสูงเกินของจริง → ระยะยาวลูกค้าผิดหวัง' },
  { id: 'C', label: 'Balanced', th: 'พอดี / ตรงปก', mult: 1.0,
    note: 'สื่อสารตรงกับของจริง → ความพึงพอใจคงที่ ไว้ใจได้' },
  { id: 'B', label: 'Under-promise', th: 'พูดน้อยทำมาก', mult: 0.7,
    note: 'คาดหวังต่ำกว่าของจริง → ลูกค้าประทับใจเกินคาด (delight)' },
];

export function perceptionSeries(actualValue, profileId, steps = 12) {
  const prof = PERCEPTION_PROFILES.find((p) => p.id === profileId) || PERCEPTION_PROFILES[1];
  const expectation = Math.max(0, Math.min(100, actualValue * prof.mult));
  const tau = 3.0;
  const out = [];
  for (let t = 0; t <= steps; t++) {
    const experienced = expectation + (actualValue - expectation) * (1 - Math.exp(-t / tau));
    out.push({
      t,
      expectation: +expectation.toFixed(1),
      experienced: +experienced.toFixed(1),
      satisfaction: +(experienced - expectation).toFixed(1),
    });
  }
  return { expectation, series: out, profile: prof };
}

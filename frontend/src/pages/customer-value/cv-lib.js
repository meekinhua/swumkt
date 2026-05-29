// Customer Value Lab — shared data + math (mirrors backend routes/customer_value.py)
// Full CBS04 framework: 3 marketing definitions, Value = Benefit − Price,
// Actual vs Perceived (exact formulas), 5-Step Process, Need/Want/Demand.

export const INDUSTRIES = [
  { id: 'food', label: 'ร้านอาหาร / เครื่องดื่ม', min: 30, mid: 120, max: 400 },
  { id: 'hotel', label: 'โรงแรม / ที่พัก', min: 500, mid: 2500, max: 8000 },
  { id: 'service', label: 'บริการ', min: 200, mid: 1500, max: 6000 },
  { id: 'retail', label: 'ค้าปลีก / สินค้า', min: 50, mid: 500, max: 3000 },
  { id: 'generic', label: 'ทั่วไป', min: 0, mid: 100, max: 200 },
];

export const industryRange = (id) =>
  INDUSTRIES.find((x) => x.id === id) || INDUSTRIES[INDUSTRIES.length - 1];

// Benefit: 3 dimensions (Psychological = Love&Belonging + Esteem&Status sub-dims).
export const BENEFIT_CATS = [
  { id: 'functional', label: 'Functional', th: 'ประโยชน์ตามฟังก์ชัน / คุณภาพ', icon: 'fa-gears', group: 'core' },
  { id: 'economic', label: 'Economic', th: 'ปริมาณ / ของแถม / ความคุ้ม', icon: 'fa-box-open', group: 'core' },
  { id: 'love_belonging', label: 'Love & Belonging', th: 'ความรัก / ความผูกพัน', icon: 'fa-hand-holding-heart', group: 'psych' },
  { id: 'esteem_status', label: 'Esteem & Status', th: 'ความภูมิใจ / สถานะ', icon: 'fa-crown', group: 'psych' },
];

// Cost: money (price input), inconvenience, risk.
export const COST_CATS = [
  { id: 'money', label: 'Monetary', th: 'ราคาที่เป็นตัวเงิน', icon: 'fa-money-bill-wave' },
  { id: 'inconvenience', label: 'Inconvenience', th: 'ความยากลำบากในการเข้าถึง (รวมเวลา)', icon: 'fa-hourglass-half' },
  { id: 'risk', label: 'Risk', th: 'ความเสี่ยงแฝง / ความไม่มั่นใจ', icon: 'fa-triangle-exclamation' },
];

export const PRINCIPLE_TAGS = {
  'kotler-value': { label: 'Kotler · Value', color: '#1B75BC' },
  'kotler-engagement': { label: 'Kotler · Engagement', color: '#0E5538' },
  'drucker-selfsell': { label: 'Drucker · Self-sell', color: '#C8102E' },
};

// 3 marketing definitions (section 1).
export const MARKETING_LENSES = [
  { id: 'basic', tag: 'Basic Concept', quote: 'How to make people choose your choice',
    th: 'ทำอย่างไรให้คนอื่นเลือกตัวเลือกของคุณ — ใช้ได้ทุกเรื่อง (การเมือง ศาสนา ความสัมพันธ์)', icon: 'fa-hand-pointer' },
  { id: 'drucker', tag: "Drucker's View", quote: 'To make selling unnecessary',
    th: 'การตลาดที่ดีสร้างระบบ+คุณค่าจนสินค้า "ขายได้ด้วยตัวเอง" ไม่ต้องพึ่งพนักงานขายเก่งคนเดียว', icon: 'fa-robot' },
  { id: 'kotler', tag: "Kotler's View", quote: 'Managing customer value & engagement',
    th: 'บริหารคุณค่า (Value) + สร้างความผูกพัน (Engagement) เพื่อผลตอบแทนที่คุ้มค่า', icon: 'fa-handshake' },
];

// 5-step marketing process (section 4).
export const PROCESS_STEPS = [
  { id: 'research', no: 1, label: 'Market Research', th: 'เข้าใจตลาดและความต้องการ (Need & Want)', icon: 'fa-magnifying-glass' },
  { id: 'stp', no: 2, label: 'STP', th: 'วางกลยุทธ์ Segmentation · Targeting · Positioning', icon: 'fa-bullseye' },
  { id: 'fourps', no: 3, label: '4Ps', th: 'สร้างโปรแกรมคุณค่า Product · Price · Place · Promotion', icon: 'fa-cubes' },
  { id: 'engagement', no: 4, label: 'Engagement', th: 'สร้างความสัมพันธ์และความรักแบรนด์', icon: 'fa-heart' },
  { id: 'returns', no: 5, label: 'Return / ROI', th: 'เก็บเกี่ยวผลตอบแทนเชิงคุณค่า', icon: 'fa-trophy' },
];

// Default factor library (suggested, unchecked) per industry/category.
const G = {
  functional: ['คุณภาพดี / ทนทาน', 'ใช้งานง่าย', 'ทำงานเสถียร', 'ตัวเลือกหลากหลาย'],
  economic: ['ปริมาณคุ้มค่า', 'มีของแถม', 'ซื้อ 1 แถม 1', 'แพ็กคุ้ม'],
  love_belonging: ['บรรยากาศอบอุ่นเป็นกันเอง', 'พื้นที่สำหรับครอบครัว/กลุ่มเพื่อน', 'Pet-friendly'],
  esteem_status: ['ภาพลักษณ์พรีเมียม', 'น่าถ่ายรูปอวด', 'แบรนด์ได้รับการยอมรับ'],
  inconvenience: ['รอนาน / คิวยาว', 'เดินทางลำบาก', 'ที่จอดรถไม่พอ', 'ขั้นตอนยุ่งยาก'],
  risk: ['กลัวคุณภาพไม่ตรงปก', 'กังวลความสะอาด', 'กลัวบริการหลังการขายแย่'],
};

const LIB = {
  food: {
    functional: ['รสชาติอร่อย', 'วัตถุดิบสด / สะอาด', 'ปรุงสดใหม่', 'เมนูหลากหลาย'],
    economic: ['จานใหญ่พูนพิเศษ', 'แถมน้ำซุป/ของแถม', 'เซ็ตคุ้มค่า', 'ซื้อ 1 แถม 1'],
    love_belonging: ['บรรยากาศอบอุ่นนั่งได้นาน', 'โต๊ะใหญ่สำหรับครอบครัว', 'Pet-friendly', 'พนักงานเป็นกันเอง'],
    esteem_status: ['ร้านน่าถ่ายรูปลงโซเชียล', 'วัตถุดิบพรีเมียม/นำเข้า', 'แบรนด์ดังที่คนยอมรับ'],
    inconvenience: ['คิวยาว / รอนาน', 'ที่จอดรถไม่พอ', 'สั่งออนไลน์ยุ่งยาก', 'ทำเลหายาก'],
    risk: ['กลัวไม่อร่อยตามรีวิว', 'กังวลความสะอาด/สุขอนามัย', 'กลัวแพ้อาหาร'],
  },
  hotel: {
    functional: ['ห้องสะอาด', 'สิ่งอำนวยความสะดวกครบ', 'ทำเลดี', 'เตียงนอนสบาย'],
    economic: ['รวมอาหารเช้า', 'อัปเกรดห้องฟรี', 'ยกเลิกฟรี', 'แพ็กเกจคุ้ม'],
    love_belonging: ['เหมาะพักผ่อนกับครอบครัว', 'บริการอบอุ่นใส่ใจ', 'รับสัตว์เลี้ยง'],
    esteem_status: ['ภาพลักษณ์หรูหรา', 'วิว/ล็อบบี้น่าถ่ายรูป', 'แบรนด์โรงแรมระดับโลก'],
    inconvenience: ['เช็คอินช้า', 'ไกลแหล่งท่องเที่ยว', 'จองยุ่งยาก'],
    risk: ['กลัวไม่ตรงปก', 'กังวลความปลอดภัย', 'กลัวเสียงดัง/ไม่สะอาด'],
  },
  service: {
    functional: ['ผลงานมีคุณภาพ', 'ตรงเวลา', 'ทีมงานเชี่ยวชาญ', 'แก้ปัญหาได้จริง'],
    economic: ['แพ็กเกจคุ้ม', 'บริการเสริมฟรี', 'รับประกันงาน'],
    love_belonging: ['ดูแลใส่ใจเหมือนคนรู้จัก', 'สื่อสารเป็นกันเอง'],
    esteem_status: ['แบรนด์มืออาชีพระดับท็อป', 'ลูกค้าเป็นองค์กรชั้นนำ'],
    inconvenience: ['นัดหมายยาก', 'ขั้นตอนเยอะ', 'ตอบกลับช้า'],
    risk: ['กลัวงานไม่ได้ดั่งใจ', 'กลัวค่าใช้จ่ายแฝง', 'ไม่มั่นใจการรับประกัน'],
  },
  retail: {
    functional: ['สินค้าคุณภาพ', 'ของแท้/รับประกัน', 'มีให้เลือกครบ'],
    economic: ['ส่งฟรี', 'แถมของ', 'แลกเปลี่ยน/คืนได้'],
    love_belonging: ['แพ็กของขวัญให้คนที่รัก', 'คอมมูนิตี้แฟนแบรนด์'],
    esteem_status: ['แบรนด์เนมมีระดับ', 'แพ็กเกจสวยน่าอวด', 'รุ่น Limited'],
    inconvenience: ['ส่งช้า', 'หาซื้อยาก', 'คืนสินค้ายุ่งยาก'],
    risk: ['กลัวได้ของปลอม', 'กลัวของเสีย/ชำรุด', 'ไม่มั่นใจไซซ์/สเปก'],
  },
};

export function defaultFactorPool(industry, category) {
  return (LIB[industry] && LIB[industry][category]) || G[category] || [];
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
  const love = catScore(b.love_belonging);
  const esteem = catScore(b.esteem_status);
  const psych = Math.min(10, love + esteem);
  const benefit = +(((func + econ + psych) / 3) * 10).toFixed(1);
  const money = moneyScore(brand.price_value ?? range.mid, range.min, range.max);
  const inconv = catScore(c.inconvenience);
  const risk = catScore(c.risk);
  const cost = +(((money + inconv + risk) / 3) * 10).toFixed(1);
  return {
    benefit, cost, net: +(benefit - cost).toFixed(1),
    breakdown: {
      functional: +func.toFixed(1), economic: +econ.toFixed(1),
      love_belonging: +love.toFixed(1), esteem_status: +esteem.toFixed(1),
      psychological: +psych.toFixed(1), money: +money.toFixed(1),
      inconvenience: +inconv.toFixed(1), risk: +risk.toFixed(1),
    },
  };
}

// ---- perception timeline — EXACT formulas from the CBS04 doc (section 3) ----
// t∈[0,1]. Perceived value converges to Actual value over time.
//  A Over-promise : y = Actual + Δy·(1−t)^4     (starts high, fast decay → Dissatisfaction)
//  B Under-promise: y = Actual − Δy·(1−t)^2.5   (starts low, rises → Delight)
//  C Balanced     : y = Actual                  (constant → Sustainable)
export const PERCEPTION_PROFILES = [
  { id: 'A', label: 'Over-promising', th: 'โฆษณาเกินจริง', exp: 4, dir: +1,
    note: 'คาดหวังสูงเกินจริง → ใช้จริงแล้วดิ่งลง เกิด Dissatisfaction',
    apply: 'เหมาะเฉพาะเกมระยะสั้น (ตีหัวเข้าบ้าน) เช่น ออกบูธงานเทศกาล' },
  { id: 'C', label: 'Balanced', th: 'สมดุล จริงใจ ยั่งยืน', exp: 0, dir: 0,
    note: 'สื่อสารตรงคุณค่าจริง → พึงพอใจสม่ำเสมอ ซื้อซ้ำ',
    apply: 'วิถีที่ยั่งยืนที่สุด สร้างลูกค้าประจำระยะยาว' },
  { id: 'B', label: 'Under-promising', th: 'ของดีแต่เงียบ', exp: 2.5, dir: -1,
    note: 'คาดหวังต่ำกว่าจริง → ใช้แล้วดีเกินคาด เกิด Delight',
    apply: 'เสี่ยงต่อธุรกิจเกิดใหม่ ต้องรอสะสมชื่อเสียงนาน อาจเจ๊งก่อน' },
];

export function perceptionSeries(actualValue, profileId, steps = 12) {
  const prof = PERCEPTION_PROFILES.find((p) => p.id === profileId) || PERCEPTION_PROFILES[1];
  const actual = Math.max(1, Math.min(100, actualValue || 50));
  const gap = actual * 0.45;
  const series = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let perceived = actual;
    if (prof.dir !== 0) perceived = actual + prof.dir * gap * Math.pow(1 - t, prof.exp);
    perceived = Math.max(0, Math.min(100, perceived));
    series.push({ t: i, actual: +actual.toFixed(1), perceived: +perceived.toFixed(1) });
  }
  const expectation = series[0].perceived;          // perceived at purchase
  const satisfaction = +(actual - expectation).toFixed(1); // experienced(actual) − expectation
  return { actual, expectation, satisfaction, series, profile: prof };
}

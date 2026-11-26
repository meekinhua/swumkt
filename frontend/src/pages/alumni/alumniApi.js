import axios from 'axios';

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const authCfg = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Pull a human Thai message out of any FastAPI/axios error.
export const errMsg = (e, fallback = 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง') => {
  if (!e) return fallback;
  if (e.response) {
    const d = e.response.data?.detail;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object' && d.message) return d.message;
    if (Array.isArray(d) && d[0]?.msg) return 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
    if (e.response.status === 429) return 'ทำบ่อยไปหน่อย ลองใหม่พรุ่งนี้นะ';
    if (e.response.status === 403) return 'คุณยังไม่มีสิทธิ์ทำรายการนี้';
    return fallback;
  }
  return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง';
};

export const errCode = (e) => {
  const d = e?.response?.data?.detail;
  return d && typeof d === 'object' ? d.code : null;
};

export const api = {
  get: (token, path, params) => axios.get(`${API}${path}`, { ...authCfg(token), params }),
  post: (token, path, body) => axios.post(`${API}${path}`, body || {}, authCfg(token)),
  put: (token, path, body) => axios.put(`${API}${path}`, body || {}, authCfg(token)),
  del: (token, path) => axios.delete(`${API}${path}`, authCfg(token)),
};

// ---- relation states, in plain Thai ----
export const STATUS = {
  claimed: {
    label: 'รอยืนยัน',
    short: 'มีคนบอกว่าเชื่อมกัน',
    desc: 'มีคนบอกว่าสองคนนี้เป็นพี่น้องเทคกัน แต่ยังไม่มีใครยืนยัน',
    cls: 'al-st-claimed',
  },
  vouched: {
    label: 'เพื่อนรับรอง',
    short: 'สมาชิกในสายช่วยกันรับรอง',
    desc: 'สมาชิกในสายอย่างน้อย 2 คนช่วยกันรับรองแล้ว (เจ้าตัวยังไม่ได้กดยืนยันเอง)',
    cls: 'al-st-vouched',
  },
  confirmed: {
    label: 'ยืนยันแล้ว',
    short: 'เจ้าตัวยืนยันเอง',
    desc: 'ทั้งสองคนยืนยันความสัมพันธ์นี้ด้วยตัวเอง',
    cls: 'al-st-confirmed',
  },
  disputed: {
    label: 'มีข้อโต้แย้ง',
    short: 'ข้อมูลขัดกัน',
    desc: 'มีคนบอกไม่ตรงกัน เช่น มีพี่เทคหลายคนที่ยังไม่ได้ยืนยัน ต้องให้เจ้าตัวหรือเพื่อนในสายช่วยตัดสิน',
    cls: 'al-st-disputed',
  },
};
export const statusOf = (s) => STATUS[s === 'pending' ? 'claimed' : s] || null;

export const GENDER_OPTS = [
  { v: 'u', l: 'ไม่ระบุ' },
  { v: 'm', l: 'ชาย' },
  { v: 'f', l: 'หญิง' },
];

export const PDPA_LINE = 'เก็บเฉพาะชื่อเล่น + รุ่น · เห็นเฉพาะสมาชิก · เจ้าตัวลบได้ทุกเมื่อ · ห้ามใส่อีเมลหรือเบอร์โทร';

export const shortName = (p) => (p ? (p.nickname || p.name || 'ไม่ทราบชื่อ') : '');

export const absUrl = (path) => (path && path.startsWith('http') ? path : `${window.location.origin}${path || ''}`);

export const lineShareUrl = (text) => `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;

export const formatDateTh = (iso) => {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso || ''; }
};

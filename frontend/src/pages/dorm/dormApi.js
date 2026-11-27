import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

export const API = `${process.env.REACT_APP_BACKEND_URL}/api/dorm`;

export const authHeaders = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export const errMsg = (e, fallback = 'เกิดข้อผิดพลาด') => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(', ');
  return d || fallback;
};

// The sign-in endpoints (/api/auth, shared with the rest of the site) answer in English; the sheet shows Thai.
const AUTH_TH = [
  [/invalid credentials/i, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
  [/already registered|already exists/i, 'อีเมลนี้สมัครไว้แล้ว ลองแท็บ “มีบัญชีแล้ว”'],
  [/valid email|email address/i, 'รูปแบบอีเมลไม่ถูกต้อง'],
  [/expired|invalid token/i, 'การเข้าสู่ระบบหมดอายุ ลองใหม่อีกครั้ง'],
  [/google/i, 'เข้าด้วย Google ไม่สำเร็จ ลองอีกครั้ง'],
];
export const authErrMsg = (e, fallback) => {
  if (!e?.response) return 'เชื่อมต่อไม่ได้ ลองเช็กอินเทอร์เน็ตแล้วลองใหม่';
  const d = e.response.data?.detail;
  const text = Array.isArray(d) ? d.map((x) => x.msg).join(' ') : String(d || '');
  const hit = AUTH_TH.find(([rx]) => rx.test(text));
  if (hit) return hit[1];
  if (e.response.status === 429) return 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่';
  return fallback;
};

// Vocabulary (zones, tags, kinds…) lives in the backend; fetched once per page load.
let metaCache = null;
let metaPromise = null;
export const useDormMeta = () => {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return;
    metaPromise = metaPromise || axios.get(`${API}/meta`).then((r) => (metaCache = r.data));
    metaPromise.then(setMeta).catch(() => { metaPromise = null; });
  }, []);
  return meta;
};

// Buildings (minutes_to_swu, travel_mode, active_listings, ratings), so listing cards can show "~N นาที" from
// building_slug. Every building count on the site reads this payload or GET /buildings/{slug}; both use the same
// backend summary. The copy is refreshed when it is older than a minute, or right away after this tab creates,
// closes, reopens or deletes a listing (invalidateBuildings), so room counts don't go stale.
const B_TTL = 60 * 1000;
const B_EVENT = 'dorm-buildings-change';
let bCache = null;
let bAt = 0;
let bPromise = null;
const bFresh = () => bCache && Date.now() - bAt < B_TTL;
export const loadBuildings = (fresh = false) => {
  if (fresh) { bAt = 0; bPromise = null; }
  if (bFresh()) return Promise.resolve(bCache);
  bPromise = bPromise || axios.get(`${API}/buildings`)
    .then((r) => {
      bCache = r.data.items; bAt = Date.now(); bPromise = null;
      window.dispatchEvent(new CustomEvent(B_EVENT));
      return bCache;
    })
    .catch((e) => { bPromise = null; throw e; });
  return bPromise;
};
// Call after this tab changes a listing's visibility: mounted cards refetch the counts.
export const invalidateBuildings = () => { loadBuildings(true).catch(() => {}); };
// null while loading (cards then show a placeholder, never a zone guess); a failed load is retried a few times
// before settling on [] (never cached), so one dropped request doesn't leave zone guesses for the whole visit.
export const useBuildings = () => {
  const [items, setItems] = useState(bCache);
  useEffect(() => {
    let on = true;
    let tries = 0;
    let t = null;
    const get = () => loadBuildings().then((x) => on && setItems(x)).catch(() => {
      tries += 1;
      if (!on) return;
      if (tries < 4) t = setTimeout(get, 1500 * tries);
      else setItems((cur) => cur || []);
    });
    if (!bFresh()) get();
    const onChange = () => on && bCache && setItems(bCache);
    window.addEventListener(B_EVENT, onChange);
    return () => { on = false; clearTimeout(t); window.removeEventListener(B_EVENT, onChange); };
  }, []);
  return items;
};
export const useBuildingMap = () => {
  const items = useBuildings();
  return items ? Object.fromEntries(items.map((b) => [b.slug, b])) : {};
};

export const labelOf = (list, id) => (list || []).find((x) => x.id === id)?.label || id || '';

// '' for missing numbers so callers hide the value instead of printing a dash.
export const baht = (n) => (n || n === 0 ? Number(n).toLocaleString('th-TH') : '');
export const has = (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v));

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thDate = (s) => {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!m) return s;
  return d ? `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}` : `${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
};

// "วันนี้", "เมื่อวาน", "3 วันก่อน", otherwise a date
export const agoTh = (iso) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';
  if (days < 14) return `${days} วันก่อน`;
  return thDate(iso);
};

export const daysLeft = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
};

// Next n months as YYYY-MM, for move-in pickers.
export const upcomingMonths = (n = 8) => {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

export const useMediaQuery = (q) => {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
};

// LINE / Facebook read OG tags from this URL, then it redirects people to the page
export const shareLinkFor = (id) => `${process.env.REACT_APP_BACKEND_URL || window.location.origin}/api/dorm/og/rooms/${id}`;
export const lineShareUrl = (text) => `https://line.me/R/share?text=${encodeURIComponent(text)}`;

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Remember the last rooms query so nav links return to the same filters.
const ROOMS_KEY = 'dm_rooms_qs';
export const rememberRooms = (qs) => { try { sessionStorage.setItem(ROOMS_KEY, qs || ''); } catch { /* storage blocked */ } };
export const roomsHref = () => {
  let qs = '';
  try { qs = sessionStorage.getItem(ROOMS_KEY) || ''; } catch { /* storage blocked */ }
  return `/dorm/rooms${qs ? `?${qs}` : ''}`;
};

// Zone-level travel estimate for listings without a building: the median building of that zone.
// Rough typical trips for zones with no listed building yet (MRT Blue Line / bus to Phetchaburi).
const ZONE_GUESS = { asoke: [10, 'walk'], rama9: [15, 'mrt'], huaikwang: [20, 'mrt'], ratchada: [20, 'mrt'],
  dindaeng: [25, 'bus'], ramkhamhaeng: [25, 'mrt'], ladprao: [30, 'mrt'] };
export const zoneMinutes = (buildings, zone) => {
  const bs = (buildings || []).filter((b) => b.zone === zone && b.minutes_to_swu).sort((a, b) => a.minutes_to_swu - b.minutes_to_swu);
  if (!bs.length) return ZONE_GUESS[zone] ? { minutes: ZONE_GUESS[zone][0], mode: ZONE_GUESS[zone][1] } : null;
  const m = bs[Math.floor((bs.length - 1) / 2)];
  return { minutes: m.minutes_to_swu, mode: m.travel_mode };
};

export const perPersonOf = (x) => x.price_per_person || (x.people_total > 0 && x.price_total ? Math.round(x.price_total / x.people_total) : null);

// "title\n6,000 บาท/คน/เดือน ที่ Life Asoke เข้าอยู่ 1 ธ.ค. 69\nlink"
export const shareTextFor = (x, buildingName) => {
  const where = buildingName || x.building_name;
  const line2 = [priceLine(x), where && !(x.title || '').includes(where) && `ที่ ${where}`,
    x.move_in && `เข้าอยู่ ${thDate(x.move_in)}`].filter(Boolean).join(' ');
  return [x.title, line2, shareLinkFor(x.id)].filter(Boolean).join('\n');
};

export const mapsUrl = (name) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} Bangkok`)}`;
// Google Maps directions (official api=1 URL scheme) from the building to the SWU Prasarnmit campus.
export const directionsUrl = (name, mode) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${name} Bangkok`)}`
  + `&destination=${encodeURIComponent('Srinakharinwirot University Prasarnmit')}&travelmode=${mode === 'walk' ? 'walking' : 'transit'}`;

// Seed/demo listings are titled "[ตัวอย่าง] ..." in the DB. Display code strips the tag and shows a small
// neutral "ตัวอย่าง" pill instead; share text, my-listings and edit forms keep the original title.
const DEMO_RX = /^\s*\[ตัวอย่าง\]\s*/;
const DEMO_NAME_RX = /\s*\(ตัวอย่าง\)\s*$/;
export const splitDemo = (title) => {
  const t = title || '';
  if (DEMO_RX.test(t)) return { title: t.replace(DEMO_RX, ''), demo: true };
  if (DEMO_NAME_RX.test(t)) return { title: t.replace(DEMO_NAME_RX, ''), demo: true };  // mate names "มิ้น (ตัวอย่าง)"
  return { title: t, demo: false };
};

// Stable small hash, so the same listing always gets the same cover variant.
export const hashOf = (s) => {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) % 100003;
  return h;
};
// Illustration per listing kind; two variants per kind, picked by id so a rail doesn't repeat one picture.
export const coverFor = (kind, id) => `/dorm/illustrations/cover-${kind || 'room'}${id && hashOf(id) % 2 ? '-2' : ''}.svg`;

// Budget presets (per person per month) shared by the home search card and the rooms quick chips.
export const BUDGET_PRESETS = [
  { id: '', label: 'ทุกงบ' },
  { id: 'lt4', label: 'ไม่เกิน 4,000', max: 4000 },
  { id: '4-6', label: '4,000–6,000', min: 4000, max: 6000 },
  { id: '6-8', label: '6,000–8,000', min: 6000, max: 8000 },
  { id: 'gt8', label: '8,000 ขึ้นไป', min: 8000 },
];
export const budgetPreset = (id) => BUDGET_PRESETS.find((b) => b.id === id) || BUDGET_PRESETS[0];
// The preset matching a URL's min_price/max_price, or null when the range is custom.
export const presetFromRange = (min, max) => {
  const lo = Number(min) || undefined;
  const hi = Number(max) || undefined;
  return BUDGET_PRESETS.find((b) => b.min === lo && b.max === hi) || null;
};

/* ---------------------------------------------------------------- saved rooms (this device only) */
const SAVED_KEY = 'dorm_saved';
const SAVED_EVENT = 'dorm-saved-change';
const SAVED_MAX = 50;
const ANON_KEY = 'dorm_anon_id';
let anonMem = '';
export const anonId = () => {
  if (anonMem) return anonMem;
  try {
    const cur = localStorage.getItem(ANON_KEY);
    if (cur && /^[A-Za-z0-9_-]{8,64}$/.test(cur)) { anonMem = cur; return cur; }
    const gen = `a_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(ANON_KEY, gen);
    anonMem = gen;
    return gen;
  } catch {
    anonMem = `m_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    return anonMem;
  }
};
// In-memory copy: the source of truth for this page view. When storage is blocked (private mode,
// some in-app browsers) reads would always return [], so a room could never be unsaved.
let savedMem = null;
const clean = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string'))].slice(0, SAVED_MAX) : []);
const readSaved = () => {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw !== null || savedMem === null) savedMem = clean(JSON.parse(raw || '[]'));
  } catch { if (savedMem === null) savedMem = []; }
  return savedMem;
};
const writeSaved = (ids) => {
  savedMem = clean(ids);
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedMem)); } catch { /* storage blocked: the in-memory copy keeps working */ }
  window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: savedMem }));
};
// { ids, has(id), toggle(id) -> true when it is now saved }. Every mounted copy stays in sync
// (same tab via a window event, other tabs via the storage event). Newest first, max 50.
export const useSaved = () => {
  const [ids, setIds] = useState(readSaved);
  useEffect(() => {
    const on = (e) => setIds(e?.detail && Array.isArray(e.detail) ? e.detail : readSaved());
    const onStorage = (e) => { if (!e.key || e.key === SAVED_KEY) setIds(readSaved()); };
    window.addEventListener(SAVED_EVENT, on);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(SAVED_EVENT, on); window.removeEventListener('storage', onStorage); };
  }, []);
  const hasId = useCallback((id) => ids.includes(id), [ids]);
  const toggle = useCallback((id) => {
    const cur = readSaved();
    const isNow = !cur.includes(id);
    const now = isNow ? [id, ...cur].slice(0, SAVED_MAX) : cur.filter((x) => x !== id);
    writeSaved(now);
    setIds(now);
    axios.post(`${API}/listings/${id}/peek`, { anon_id: anonId(), active: isNow }).catch(() => {});
    return isNow;
  }, []);
  return { ids, has: hasId, toggle };
};
// The saved listings that are still open (GET /listings?ids=..., does not count views).
// null while loading. Closed/expired ones are pruned from the saved list, so they never
// count toward the cap of 50.
export const useSavedListings = () => {
  const { ids } = useSaved();
  const [items, setItems] = useState(null);
  const key = ids.join(',');
  useEffect(() => {
    if (!key) { setItems([]); return undefined; }
    let on = true;
    axios.get(`${API}/listings`, { params: { ids: key } })
      .then((r) => {
        if (!on) return;
        const got = new Set(r.data.items.map((x) => x.id));
        const asked = key.split(',');
        // prune against the current list (a room saved meanwhile is not in this answer: keep it)
        if (asked.some((id) => !got.has(id))) writeSaved(readSaved().filter((id) => got.has(id) || !asked.includes(id)));
        setItems(r.data.items);
      })
      .catch(() => on && setItems([]));
    return () => { on = false; };
  }, [key]);
  return items;
};

/* ---------------------------------------------------------------- post-form draft (sessionStorage) */
// Kept here so the shell can drop it on sign-out; the post page reads/writes it with an owner tag.
export const DRAFT_KEY = 'dorm_post_draft';
export const draftOwner = (user) => (user ? String(user.id || user.email || 'user') : 'guest');
// Photos a guest picked before signing in: compressed data: URLs kept in memory only (they survive the
// sign-in and moving between pages, not a reload). The draft stores just how many there were, so the post
// page can say they need re-adding after a reload instead of losing them silently.
export const pendingPhotos = { list: [] };
export const dropDraft = () => {
  pendingPhotos.list = [];
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
};

/* ---------------------------------------------------------------- whole-room price + split, interest */
// { total, n, per }: the whole-room rent, the share count and the rent each person pays, or null without a total.
export const splitOf = (x) => {
  const total = Number(x?.price_total) || 0;
  if (!total) return null;
  const n = Math.max(1, Number(x.people_total) || 1);
  return { total, n, per: x.price_per_person || Math.round(total / n) };
};
// The whole-room rent is the headline for a room for one (single_room) and for every listing posted on the site
// except "มีห้องแล้ว หาเมท" (a landlord's room, a transfer, a short stay are rented whole; splitting is an option).
// Shared rooms lead with the per-person price. Server flag whole_first; the post form preview has none, so the
// same rule runs here (backend whole_first()).
export const wholeFirst = (x) => (x?.whole_first != null ? !!x.whole_first
  : x?.external ? !!x.single_room : (x?.kind || 'mate_wanted') !== 'mate_wanted');
// A room whose whole rent is the headline that a per-person budget found only through a split: its whole rent is
// over the budget, so the card must say the split is what matches.
export const matchesBySharing = (x, maxPrice) => {
  const sp = splitOf(x);
  return !!(sp && sp.n > 1 && wholeFirst(x) && Number(maxPrice) > 0 && sp.total > Number(maxPrice));
};
// Every price on the site in one shape: { head, unit, unitLong, tag, sub: { lead, per } | { text }, match, aria }.
//   shared:          7,500 ฿/คน/ด.        sub "ทั้งห้อง 15,000 หาร 2"
//   room for one:    6,500 ฿/ด. อยู่คนเดียว  sub "หรือหาร 2 คนละ 3,250" (or "ตรงงบเมื่อหาร 2 คนละ ..." when the budget needs it)
//   posted, max 1:   7,000 ฿/ด.           no sub
//   posted, max 2+: 14,000 ฿/ด.           sub "หารได้ 2 คนละ 7,000"
export const priceView = (x, budgetMax) => {
  const sp = splitOf(x);
  if (!sp) return null;
  if (wholeFirst(x)) {
    const single = !!x.single_room || sp.n < 2;
    const match = matchesBySharing(x, budgetMax);
    const lead = sp.n < 2 ? '' : match ? `ตรงงบเมื่อหาร ${sp.n} คนละ` : x.single_room ? `หรือหาร ${sp.n} คนละ` : `หารได้ ${sp.n} คนละ`;
    return {
      head: sp.total, unit: '฿/ด.', unitLong: 'บาท/เดือน', tag: single ? 'อยู่คนเดียว' : '', match,
      sub: lead ? { lead, per: sp.per } : null,
      aria: `${baht(sp.total)} บาทต่อเดือน${single ? ' อยู่คนเดียว' : ''}${lead ? ` ${lead} ${baht(sp.per)}` : ''}`,
    };
  }
  return {
    head: sp.per, unit: sp.n > 1 ? '฿/คน/ด.' : '฿/ด.', unitLong: sp.n > 1 ? 'บาท/คน/เดือน' : 'บาท/เดือน', tag: '', match: false,
    sub: sp.n > 1 ? { text: `ทั้งห้อง ${baht(sp.total)} หาร ${sp.n}` } : null,
    aria: sp.n > 1 ? `คนละ ${baht(sp.per)} บาทต่อเดือน ทั้งห้อง ${baht(sp.total)} หาร ${sp.n}` : `${baht(sp.total)} บาทต่อเดือน`,
  };
};
// The same price as one line of text (share text, OpenChat caption, interest sheet); mirrors backend price_text().
export const priceLine = (x) => {
  const sp = splitOf(x);
  if (!sp) return '';
  if (wholeFirst(x)) {
    if (sp.n < 2) return `${baht(sp.total)} บาท/เดือน`;
    return `${baht(sp.total)} บาท/เดือน ${x.single_room ? 'อยู่คนเดียว หรือหาร' : 'หารได้'} ${sp.n} คนละ ${baht(sp.per)}`;
  }
  return sp.n > 1 ? `${baht(sp.per)} บาท/คน/เดือน (ทั้งห้อง ${baht(sp.total)} หาร ${sp.n})` : `${baht(sp.total)} บาท/เดือน`;
};

/* ---------------------------------------------------------------- "someone is interested in my listing" marker */
// Last interest count the owner has seen per listing (this device). The nav shows a dot while any own listing has
// more people interested than that; opening the listing's interested section marks it seen.
const ISEEN_KEY = 'dorm_interest_seen';
export const ISEEN_EVENT = 'dorm-interest-seen';
export const readInterestSeen = () => {
  try { const v = JSON.parse(localStorage.getItem(ISEEN_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
export const markInterestSeen = (id, count) => {
  const seen = readInterestSeen();
  if (seen[id] === count) return;
  seen[id] = count;
  try { localStorage.setItem(ISEEN_KEY, JSON.stringify(seen)); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent(ISEEN_EVENT));
};
export const hasUnseenInterest = (counts) => {
  const seen = readInterestSeen();
  return Object.entries(counts || {}).some(([id, n]) => n > (seen[id] || 0));
};

// List views collapse 3+ external rows of one building and source that have no room photo of their own
// (server flag shared_photo: they all show the building's cover) into one group card, placed where the first
// of them would be. Returns [{ x }] or [{ group: { key, slug, name, source, rows } }] in the original order.
export const GROUP_MIN = 3;
export const groupLookalikes = (items) => {
  const keyOf = (x) => (!x.is_gone && x.external && x.shared_photo && x.building_slug ? `${x.building_slug}|${x.source}` : null);
  const count = {};
  (items || []).forEach((x) => { const k = keyOf(x); if (k) count[k] = (count[k] || 0) + 1; });
  const groups = {};
  const out = [];
  (items || []).forEach((x) => {
    const k = keyOf(x);
    if (!k || count[k] < GROUP_MIN) { out.push({ x }); return; }
    if (!groups[k]) {
      groups[k] = { key: k, slug: x.building_slug, name: x.building_name, source: x.source, rows: [] };
      out.push({ group: groups[k] });
    }
    groups[k].rows.push(x);
  });
  return out;
};

// The neutral total: "3 คนสนใจห้องนี้" ("... รวมคุณ" when the viewer is one of them); '' when nobody is.
// The interested people are not one group that fills up (the two-way gender gate splits them), so there is no
// "ครบแล้ว" or "ขาดอีก" (spots_* from the API are kept only for compatibility).
export const interestText = (x) => {
  const people = Number(x?.interest_people) || 0;
  if (!people) return '';
  return `${people} คนสนใจห้องนี้${x.my_interest ? ' รวมคุณ' : ''}`;
};
// Next month as YYYY-MM (the default move-in month of a quick profile).
export const nextMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

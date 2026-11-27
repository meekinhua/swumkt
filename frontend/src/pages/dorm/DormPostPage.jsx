import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { CalendarDays, Check, ChevronDown, ChevronsUpDown, CircleAlert, ClipboardCopy, Copy, Eye, ImagePlus, MessageCircle, RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useAuth } from '@/context/AuthContext';
import DormLayout, { Empty, ListingCard, PageHead, Pick, SelectBox, Skeleton, buildingThumb, coverFor, useShell } from './DormLayout';
import PhotoPicker from './PhotoPicker';
import {
  API, DRAFT_KEY, authHeaders, baht, draftOwner, dropDraft, errMsg, invalidateBuildings, labelOf, lineShareUrl, localToday, pendingPhotos, priceLine,
  shareLinkFor, shareTextFor, thDate, useBuildings, useDormMeta,
} from './dormApi';

const BLANK = {
  kind: '', poster_role: 'student', title: '', building_slug: '', building_name: '', zone: 'asoke',
  price_total: '', people_total: '', price_per_person: '', deposit: '', utilities_note: '', move_in: '',
  contract_months_left: '', min_months: '', gender_pref: 'any', bedrooms: '', size_sqm: '',
  amenities: [], description: '', photo_links: [], contact_line: '', contact_phone: '',
};
const KIND_HINT = {
  mate_wanted: 'เช่าอยู่แล้ว อยากได้คนมาหาร',
  transfer: 'จะย้ายออก หาคนอยู่แทน',
  room: 'เจ้าของหรือหอ มีห้องว่าง',
  short_term: 'เช่า 1 ถึง 6 เดือน เช่นฝึกงาน',
};
const GENDER_TXT = { any: 'ได้ทุกเพศ', female: 'ผู้หญิง', male: 'ผู้ชาย' };
const STEPS = ['ประเภท', 'ที่ตั้ง', 'ราคา', 'รูปและติดต่อ'];
const STEP_TITLE = ['ห้องของคุณเป็นแบบไหน', 'ห้องอยู่ที่ไหน', 'ราคาและเงื่อนไข', 'รูปและช่องทางติดต่อ'];
const LAST = STEPS.length - 1;
const num = (v) => (v === '' || v == null ? null : Number(v));
const MAX_SHORT_MONTHS = 6;       // "ระยะสั้น 1–6 เดือน" (the API refuses more)
// Only "มีห้องแล้ว หาเมท" is split by default (the poster plus one); a landlord's room, a transfer and a short stay
// are for one person unless the poster says more can live there.
const defaultPeople = (kind) => (kind === 'mate_wanted' ? 2 : 1);

// Default move-in: the 1st of next month (most contracts start on the 1st).
const nextMonthFirst = () => {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
};

// The draft lives in sessionStorage so nothing is lost when a guest signs in (sheet or a Google redirect).
// It remembers whose it is: a draft written by a signed-in account is never shown to anyone else on the
// tab (logout / auto-logout / another account); a guest's draft may be adopted by whoever signs in next.
const readDraft = (owner) => {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (!d || !d.f || typeof d.f !== 'object') return null;
    if (d.owner && d.owner !== 'guest' && d.owner !== owner) { sessionStorage.removeItem(DRAFT_KEY); return null; }
    return d;
  } catch { return null; }
};

const FieldErr = ({ msg }) => (msg ? <span className="dm-field-err" role="alert"><CircleAlert size={15} aria-hidden="true" />{msg}</span> : null);
const Opt = () => <span className="dm-optional">ไม่บังคับ</span>;

// onJump (edit mode): every step name is a button, so changing the price doesn't mean stepping through.
const Progress = ({ step, onJump }) => (
  <div className="dm-prog" role="group" aria-label={`ขั้นที่ ${step + 1} จาก ${STEPS.length}: ${STEPS[step]}`}>
    <div className="dm-prog-bar"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
    {onJump ? (
      <ol className="dm-prog-steps is-jump">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'now' : 'done'}>
            <button type="button" onClick={() => onJump(i)} aria-current={i === step ? 'step' : undefined} aria-label={`ไปที่ขั้น ${s}`}>{s}</button>
          </li>
        ))}
      </ol>
    ) : (
      <ol className="dm-prog-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{i < step && <Check size={13} strokeWidth={2.6} />}{s}</li>
        ))}
      </ol>
    )}
  </div>
);

// A small CSS-only burst around the check badge (hidden with reduced motion).
const COLORS = ['var(--swu)', 'var(--sun)', 'var(--khlong-bright)', 'var(--coral)', 'var(--leaf)', '#5B8DEF'];
const PIECES = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2 + (i % 2 ? 0.17 : -0.11);
  const d = 70 + (i % 3) * 26;
  return { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d * 0.8 - 26), r: 160 + ((i * 67) % 300), c: COLORS[i % COLORS.length], delay: (i % 4) * 35 };
});
const Confetti = () => (
  <span className="dm-confetti" aria-hidden="true">
    {PIECES.map((p, i) => <i key={i} style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--r': `${p.r}deg`, '--c': p.c, '--d': `${p.delay}ms` }} />)}
  </span>
);

// Ready-to-paste post for the OpenChat: title, price, move-in, link (the link shows the LINE preview card).
const captionFor = (x, link) => {
  const price = priceLine(x) ? `ราคา ${priceLine(x)}` : '';
  return [x.title, price, x.move_in && `เข้าอยู่ได้ ${thDate(x.move_in)}`, `ดูรูปและรายละเอียด ${link}`].filter(Boolean).join('\n');
};
// Copy text; when the clipboard API is blocked, select the element's text so a long-press copies it.
const copyText = async (text, el, toast, ok) => {
  try { await navigator.clipboard.writeText(text); toast(ok); } catch {
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    toast('กดค้างที่ข้อความเพื่อคัดลอก');
  }
};

const Done = ({ id, kind, listing }) => {
  const { toast } = useShell();
  const link = shareLinkFor(id);
  const caption = captionFor(listing, link);
  const copy = () => copyText(link, document.getElementById('dm-share-link'), toast, 'คัดลอกลิงก์แล้ว');
  const copyCaption = () => copyText(caption, document.getElementById('dm-share-caption'), toast, 'คัดลอกข้อความแล้ว วางในกลุ่มได้เลย');
  return (
    <div className="dm-done" data-testid="dorm-post-done">
      <div className="dm-done-hero">
        <img src={coverFor(kind, id)} alt="" className="dm-done-art" />
        <div className="dm-done-badgewrap">
          <Confetti />
          <span className="dm-done-badge"><Check size={30} strokeWidth={3} aria-hidden="true" /></span>
        </div>
      </div>
      <h1>ลงประกาศแล้ว</h1>
      <p className="dm-lede">แสดง 30 วัน แชร์เข้ากลุ่ม OpenChat หรือส่งให้เพื่อน คนจะเห็นเร็วขึ้น</p>
      <div className="dm-done-actions">
        <a className="dm-btn dm-btn-line dm-btn-lg" href={lineShareUrl(shareTextFor({ ...listing, id }))} target="_blank" rel="noreferrer">
          <MessageCircle size={19} fill="currentColor" strokeWidth={0} aria-hidden="true" />แชร์ทาง LINE
        </a>
        <div className="dm-done-link">
          <span className="dm-done-k">ลิงก์ประกาศ</span>
          <p id="dm-share-link" className="dm-done-url">{link}</p>
          <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={copy}><Copy size={16} aria-hidden="true" />คัดลอกลิงก์</button>
        </div>
        <div className="dm-done-caption">
          <span className="dm-done-k">ข้อความสำหรับโพสต์ในกลุ่ม OpenChat</span>
          <p id="dm-share-caption" className="dm-done-captext">{caption}</p>
          <button type="button" className="dm-btn dm-btn-ink" onClick={copyCaption} data-testid="dorm-copy-caption">
            <ClipboardCopy size={17} aria-hidden="true" />คัดลอกข้อความไปโพสต์ในกลุ่ม
          </button>
        </div>
      </div>
      <div className="dm-done-more">
        <Link to={`/dorm/rooms/${id}`} className="dm-btn dm-btn-tint" data-testid="dorm-done-view">ดูประกาศ</Link>
        <Link to="/dorm/me" className="dm-btn dm-btn-quiet" data-testid="dorm-done-manage">จัดการประกาศของฉัน</Link>
      </div>
    </div>
  );
};

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
// Day + month shown in Thai ("1" + "ธ.ค. 69"); value stays YYYY-MM-DD for the API. The day opens a small
// month grid (7 columns, 44px cells) instead of a 31-row dropdown: no scrolling, every day one thumb tap away.
const ThaiDate = ({ value, onChange, id, invalid }) => {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const months = [];
  // only this month onward (a move-in date in the past makes no sense for a new listing)
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${TH_MON[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}` });
  }
  const ym = (value || '').slice(0, 7) || months[1].id;
  if (!months.some((m) => m.id === ym)) months.unshift({ id: ym, label: thDate(ym) });
  const day = value ? Number(value.slice(8, 10)) : 0;
  const [y, m] = ym.split('-').map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  // the day is clamped to the chosen month (31 -> 28 in Feb) and, in the current month, to today or later
  const emit = (d, mm) => {
    const [yy, mo] = mm.split('-').map(Number);
    let dd = Math.min(Number(d) || 1, new Date(yy, mo, 0).getDate());
    if (mm === months[0].id && yy === now.getFullYear() && mo === now.getMonth() + 1) dd = Math.max(dd, now.getDate());
    onChange(`${mm}-${String(dd).padStart(2, '0')}`);
  };
  return (
    <div className="dm-datepick" id={id}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={`dm-select dm-daybtn ${invalid ? 'is-invalid' : ''}`} aria-label={`วันที่เข้าอยู่${day ? ` ${day}` : ''}`} aria-haspopup="dialog">
            <span>{day || 'วันที่'}</span><ChevronDown size={16} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="dorm-portal dm-daygrid-pop" align="start" sideOffset={6} collisionPadding={12}>
          <div className="dm-daygrid-head"><CalendarDays size={15} aria-hidden="true" />{thDate(ym)}</div>
          <div className="dm-daygrid" role="group" aria-label={`เลือกวันที่ ${thDate(ym)}`}>
            {WD.map((w) => <span key={w} className="dm-daygrid-wd" aria-hidden="true">{w}</span>)}
            {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} aria-hidden="true" />)}
            {Array.from({ length: nDays }, (_, i) => i + 1).map((d) => (
              <button key={d} type="button" className={d === day ? 'on' : ''} aria-pressed={d === day} disabled={ym === months[0].id && d < now.getDate()}
                      onClick={() => { emit(d, ym); setOpen(false); }}>{d}</button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <SelectBox value={ym} onChange={(mm) => emit(day || 1, mm)} placeholder="เดือน" label="เดือนที่เข้าอยู่" options={months} invalid={invalid} />
    </div>
  );
};

// Searchable building list (cmdk). '' = not in the list, type the name yourself.
const BuildingPicker = ({ buildings, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const cur = (buildings || []).find((b) => b.slug === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="dm-combo-btn" role="combobox" aria-expanded={open} aria-label="เลือกตึก">
          {cur ? <span>{cur.name}</span> : <span className="ph">ไม่มีในรายการ (พิมพ์ชื่อเอง)</span>}
          <ChevronsUpDown size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="dorm-portal dm-combo" align="start">
        <Command>
          <CommandInput placeholder="พิมพ์ชื่อตึก เช่น Life, Ideo" />
          <CommandList>
            <CommandEmpty>ไม่เจอตึกนี้ เลือก “ไม่มีในรายการ” แล้วพิมพ์ชื่อเอง</CommandEmpty>
            <CommandGroup>
              <CommandItem value="ไม่มีในรายการ พิมพ์ชื่อเอง" onSelect={() => { onChange(''); setOpen(false); }}>
                <Check size={15} style={{ opacity: value ? 0 : 1 }} aria-hidden="true" />ไม่มีในรายการ (พิมพ์ชื่อเอง)
              </CommandItem>
              {(buildings || []).map((b) => (
                <CommandItem key={b.slug} value={`${b.name} ${b.slug}`} onSelect={() => { onChange(b.slug); setOpen(false); }}>
                  <Check size={15} style={{ opacity: value === b.slug ? 1 : 0 }} aria-hidden="true" />{b.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Every visit to /dorm/post (and every switch between editing A, editing B and a new listing) gets a
// fresh form: the key drops all state, including the success screen.
export default function DormPostPage() {
  const { token, loading: authLoading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  // wait for a stored sign-in to resolve, so the draft is matched to the right account
  if (authLoading && token) {
    return <DormLayout title={editId ? 'แก้ไขประกาศ' : 'ลงประกาศ'}><Skeleton w="50%" h={30} /><div style={{ height: 16 }} /><Skeleton h={320} r={24} /></DormLayout>;
  }
  return <PostForm key={`${editId || 'new'}|${location.key}`} editId={editId} />;
}

function PostForm({ editId }) {
  const meta = useDormMeta();
  const { token, user, loading: authLoading } = useAuth();
  const { requireLogin, toast } = useShell();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preBuilding = params.get('building') || '';
  const kindParam = params.get('kind') || '';
  const buildings = useBuildings();
  const owner = draftOwner(user);
  const [draft0] = useState(() => (editId ? null : readDraft(owner)));
  const stepParam = params.get('step');
  const [step, setStep] = useState(() => (editId ? (/^[0-3]$/.test(stepParam || '') ? Number(stepParam) : 1)
    : draft0 ? Math.min(Number(draft0.step) || 0, LAST) : kindParam ? 1 : 0));
  // photos chosen before sign-in (memory only, see pendingPhotos); lost: how many a reload threw away
  const [pending, setPendingState] = useState(() => (editId ? [] : pendingPhotos.list));
  const setPending = (up) => setPendingState((cur) => { const n = typeof up === 'function' ? up(cur) : up; pendingPhotos.list = n; return n; });
  const [lost, setLost] = useState(() => (!editId && draft0?.pendingN > 0 && !pendingPhotos.list.length ? draft0.pendingN : 0));
  const lastMove = useRef(0);
  const [f, setF] = useState(() => {
    const base = { ...BLANK, move_in: nextMonthFirst(), building_slug: preBuilding };
    if (draft0) {
      const d = { ...base, ...draft0.f, ...(kindParam ? { kind: kindParam } : {}), ...(preBuilding ? { building_slug: preBuilding } : {}) };
      return { ...d, people_total: d.people_total || (d.kind ? defaultPeople(d.kind) : '') };
    }
    return { ...base, kind: kindParam, people_total: kindParam ? defaultPeople(kindParam) : '' };
  });
  // the head count follows the kind until the poster types their own
  const [peopleTouched, setPeopleTouched] = useState(() => !!editId || !!draft0?.peopleTouched);
  const [restored, setRestored] = useState(!!draft0?.f?.kind);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const [titleTouched, setTitleTouched] = useState(() => !!draft0?.titleTouched);
  const [done, setDone] = useState(null);
  const submitRef = useRef(null);
  const advanceT = useRef(null);

  useEffect(() => {
    const pre = (buildings || []).find((b) => b.slug === preBuilding);
    if (pre) setF((x) => ({ ...x, building_slug: pre.slug, building_name: pre.name, zone: pre.zone }));
  }, [buildings, preBuilding]);
  useEffect(() => {
    if (!editId || !token) return;
    axios.get(`${API}/my`, authHeaders(token)).then((r) => {
      const x = r.data.listings.find((l) => l.id === editId);
      if (!x) return setErr('ไม่พบประกาศนี้ในบัญชีของคุณ');
      const y = { ...BLANK, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v ?? ''])) };
      y.price_per_person = '';      // derived by the server from the total and the head count
      setF(y);
      setTitleTouched(true);
    }).catch((e) => setErr(errMsg(e)));
  }, [editId, token]);
  // keep the draft (new listings only) so a sign-in in the middle loses nothing
  useEffect(() => {
    if (editId || done || authLoading) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ f, step, titleTouched, peopleTouched, owner, pendingN: pending.length || lost })); } catch { /* storage blocked */ }
  }, [f, step, titleTouched, peopleTouched, editId, done, authLoading, owner, pending.length, lost]);
  useEffect(() => () => clearTimeout(advanceT.current), []);

  const setV = (k, v) => { setF((x) => ({ ...x, [k]: v })); if (fe[k]) setFe((o) => ({ ...o, [k]: '' })); };
  const set = (k) => (e) => setV(k, e?.target ? e.target.value : e);
  const shared = f.kind === 'mate_wanted';
  // the server always splits the total evenly over the occupants (backend per_person_of); the preview does the same
  const perPerson = useMemo(() => {
    if (f.price_total && f.people_total) return Math.round(Number(f.price_total) / Number(f.people_total));
    return null;
  }, [f.price_total, f.people_total]);

  // Suggest a title until the person writes their own
  const suggested = useMemo(() => {
    const where = f.building_name || labelOf(meta?.zones, f.zone);
    const g = { female: 'หญิง', male: 'ชาย', any: '' }[f.gender_pref] || '';
    return {
      mate_wanted: `หาเมท${g} 1 คน ที่ ${where}`,
      transfer: `ส่งต่อสัญญา ${where}`,
      room: `ห้องว่างให้เช่า ${where}`,
      short_term: `ห้องระยะสั้น ${where}`,
    }[f.kind] || '';
  }, [f.kind, f.building_name, f.zone, f.gender_pref, meta]);
  const title = titleTouched ? f.title : suggested;

  if (editId && !user) {
    if (authLoading && token) return <DormLayout title="แก้ไขประกาศ" robots="noindex, nofollow"><Skeleton w="50%" h={30} /><div style={{ height: 16 }} /><Skeleton h={320} r={24} /></DormLayout>;
    return (
      <DormLayout title="แก้ไขประกาศ" robots="noindex, nofollow">
        <Empty title="เข้าสู่ระบบเพื่อแก้ไขประกาศ" art={coverFor('room')}
               action={<button type="button" className="dm-btn dm-btn-primary" onClick={() => requireLogin('เข้าสู่ระบบด้วยบัญชีที่ลงประกาศนี้')}>เข้าสู่ระบบ</button>}>
          แก้ได้เฉพาะบัญชีที่ลงประกาศนี้
        </Empty>
      </DormLayout>
    );
  }
  if (done) return <DormLayout title="ลงประกาศแล้ว" robots="noindex, nofollow"><Done {...done} /></DormLayout>;

  const pickBuilding = (slug) => {
    const b = (buildings || []).find((x) => x.slug === slug);
    setF((x) => ({ ...x, building_slug: slug, building_name: b ? b.name : '', zone: b ? b.zone : x.zone }));
  };
  const validate = (s) => {
    const e = {};
    if (s === 0 && !f.kind) e.kind = 'เลือกประเภทประกาศก่อน';
    if (s === 1 && (title || '').trim().length < 4) e.title = 'ใส่หัวข้ออย่างน้อย 4 ตัวอักษร';
    if (s === 2) {
      if (!(Number(f.price_total) >= 500)) e.price_total = 'ใส่ค่าเช่าต่อเดือน อย่างน้อย 500';
      if (!(Number(f.people_total) >= 1)) e.people_total = 'ใส่จำนวนคน อย่างน้อย 1';
      if (!f.move_in) e.move_in = 'เลือกวันที่เข้าอยู่ได้';
      else if (!editId && f.move_in < localToday()) e.move_in = 'วันที่เข้าอยู่ต้องไม่ก่อนวันนี้';
      if (f.kind === 'short_term' && f.min_months !== '' && f.min_months != null
        && !(Number(f.min_months) >= 1 && Number(f.min_months) <= MAX_SHORT_MONTHS)) e.min_months = `อยู่ขั้นต่ำได้ 1 ถึง ${MAX_SHORT_MONTHS} เดือน`;
    }
    if (s === 3 && !(f.contact_line || f.contact_phone)) e.contact_line = 'ใส่ LINE ID หรือเบอร์โทรอย่างน้อยหนึ่งช่อง';
    return e;
  };
  const FIELD_ID = { kind: 'dm-kinds', title: 'dm-title', price_total: 'dm-price', people_total: 'dm-people', move_in: 'dm-movein', min_months: 'dm-minmonths', contact_line: 'dm-line' };
  const goStep = (s) => {
    lastMove.current = Date.now();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setErr('');
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const focusField = (k) => {
    const el = document.getElementById(FIELD_ID[k]);
    if (el) { (el.matches('input,button') ? el : el.querySelector('button,input') || el).focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' }); }
  };

  const submit = async () => {
    const tok = token || localStorage.getItem('token');
    setSaving(true);
    // photos picked as a guest: upload now that there is an account, then publish with them
    let links = f.photo_links;
    if (pending.length) {
      try {
        const urls = [];
        for (const p of pending) {
          const r = await axios.post(`${API}/photos`, { data_url: p.url }, authHeaders(tok));
          urls.push(r.data.url);
        }
        const isOwn = (p) => p.startsWith('/api/dorm/photos/');
        links = [...links.filter(isOwn), ...urls].slice(0, 8).concat(links.filter((p) => !isOwn(p)));
        setF((x) => ({ ...x, photo_links: links }));
        setPending([]);
      } catch (e) {
        setErr(errMsg(e, 'อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง'));
        setSaving(false);
        return;
      }
    }
    const body = {
      ...f, photo_links: links, title: title.trim(), building_slug: f.building_slug || null,
      price_total: num(f.price_total), people_total: num(f.people_total) || 1,
      // the server splits the total over the occupants itself and ignores any per-person price sent
      price_per_person: null, deposit: num(f.deposit),
      contract_months_left: f.kind === 'transfer' ? num(f.contract_months_left) : null,
      min_months: f.kind === 'short_term' ? num(f.min_months) : null,
      bedrooms: num(f.bedrooms), size_sqm: num(f.size_sqm),
    };
    ['id', 'owner_id', 'status', 'featured', 'views', 'contact_reveals', 'reports', 'created_at', 'renewed_at',
      'expires_at', 'expired', 'poster_swu_verified', 'is_mine'].forEach((k) => delete body[k]);
    try {
      if (editId) {
        await axios.put(`${API}/listings/${editId}`, body, authHeaders(tok));
        invalidateBuildings();
        toast('บันทึกการแก้ไขแล้ว');
        navigate(`/dorm/rooms/${editId}`);
      } else {
        const r = await axios.post(`${API}/listings`, body, authHeaders(tok));
        dropDraft();
        setPendingState([]);
        invalidateBuildings();
        // the success screen uses the saved listing (server-derived per-person price), not the form body
        setDone({ id: r.data.id, kind: f.kind, listing: { ...body, ...r.data } });
        window.scrollTo({ top: 0 });
      }
    } catch (e) { setErr(errMsg(e, 'บันทึกไม่สำเร็จ')); }
    setSaving(false);
  };
  submitRef.current = submit;

  // edit mode saves from any step; check every step first and jump to the first one with a problem
  const saveEdit = () => {
    for (let s2 = 0; s2 <= LAST; s2++) {
      const e = validate(s2);
      if (Object.keys(e).length) {
        setFe(e);
        if (s2 !== step) { goStep(s2); setTimeout(() => focusField(Object.keys(e)[0]), 60); } else focusField(Object.keys(e)[0]);
        return;
      }
    }
    setFe({});
    submitRef.current();
  };
  const next = () => {
    // a double tap lands its second tap on the next step's button (same place): ignore taps right after a move
    if (Date.now() - lastMove.current < 500) return;
    const e = validate(step);
    setFe(e);
    const first = Object.keys(e)[0];
    if (first) { focusField(first); return; }
    setErr('');
    if (step < LAST) goStep(step + 1);
    // the first step that truly needs an account: publishing (photos ask on their own)
    else requireLogin('เข้าสู่ระบบเพื่อลงประกาศ ข้อมูลที่กรอกไว้ยังอยู่ครบ', () => submitRef.current && submitRef.current());
  };
  const pickKind = (v) => {
    if (v) setF((x) => ({ ...x, kind: v, ...(peopleTouched ? {} : { people_total: defaultPeople(v) }) }));
    if (!v && !f.kind) return;
    clearTimeout(advanceT.current);
    advanceT.current = setTimeout(() => goStep(1), 260);
  };
  const startOver = () => {
    dropDraft();
    setPendingState([]); setLost(0);
    setF({ ...BLANK, move_in: nextMonthFirst() });
    setTitleTouched(false); setPeopleTouched(false); setFe({}); setErr(''); setRestored(false); setStep(0);
  };

  const preview = { ...f, id: 'preview', external: false, title: title || 'หัวข้อประกาศ', price_per_person: perPerson || null,
    price_total: Number(f.price_total) || 0, deposit: num(f.deposit), people_total: Number(f.people_total) || 1,
    photo_links: [...f.photo_links, ...pending.map((p) => p.url)] };
  const hasOwnPhoto = preview.photo_links.some((p) => p.startsWith('/api/dorm/photos/') || p.startsWith('data:'));
  const projectCover = !!buildingThumb((buildings || []).find((b) => b.slug === f.building_slug));
  const addPhotos = () => {
    if (step !== 3) goStep(3);
    // still inside the tap, so the browser lets the file chooser open
    setTimeout(() => document.getElementById('dm-photo-input')?.click(), step === 3 ? 0 : 80);
  };
  const noPhotoNote = !hasOwnPhoto && (
    <div className="dm-nophoto">
      <span>ยังไม่มีรูปห้อง ตอนนี้ใช้{projectCover ? 'ภาพโครงการ' : 'ภาพประกอบ'}แทน</span>
      <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={addPhotos}><ImagePlus size={15} aria-hidden="true" />เพิ่มรูปห้อง</button>
    </div>
  );

  return (
    <DormLayout title={editId ? 'แก้ไขประกาศ' : 'ลงประกาศ'} robots="noindex, nofollow" className="dm-postpage dm-has-formbar">
      <PageHead title={editId ? 'แก้ไขประกาศ' : 'ลงประกาศฟรี'}
                sub={editId ? 'แตะชื่อขั้นเพื่อไปแก้ตรงนั้น แล้วกดบันทึกได้เลย' : user ? 'ใช้เวลา 2 นาที แสดง 30 วัน' : 'กรอกก่อนได้เลย เข้าสู่ระบบตอนกดลงประกาศ'} />
      <Progress step={step} onJump={editId ? (s2) => { setFe({}); goStep(s2); } : undefined} />

      <div className="dm-layout-form">
        <div key={`step-${step}`} className="dm-formcard dm-form dm-formpad">
          <h2 className="dm-step-title">{STEP_TITLE[step]}</h2>
          {step === 0 && (
            <>
              {restored && !editId && (
                <p className="dm-draftline">
                  <span>กรอกค้างไว้ เราเก็บไว้ให้แล้ว</span>
                  <button type="button" className="dm-textbtn" onClick={startOver}><RotateCcw size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />เริ่มใหม่</button>
                </p>
              )}
              <div className="dm-field">
                <span id="dm-kind-label" className="dm-sr">ประเภทประกาศ</span>
                <ToggleGroup.Root type="single" id="dm-kinds" className="dm-kindcards" aria-labelledby="dm-kind-label"
                                  value={f.kind} onValueChange={pickKind}>
                  {(meta?.kinds || []).map((k, i) => (
                    <ToggleGroup.Item key={k.id} value={k.id} className="dm-kindcard dm-rise" style={{ '--i': i }} aria-label={`${k.label}: ${KIND_HINT[k.id] || ''}`}>
                      <img src={coverFor(k.id, i % 2 ? 'b' : 'a')} alt="" />
                      <span className="dm-kindcard-check" aria-hidden="true"><Check size={16} strokeWidth={2.6} /></span>
                      <span className="dm-kindcard-txt"><b>{k.label.split(' / ')[0]}</b><small>{KIND_HINT[k.id]}</small></span>
                    </ToggleGroup.Item>
                  ))}
                  {!meta && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={200} r={18} />)}
                </ToggleGroup.Root>
                <FieldErr msg={fe.kind} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="dm-field"><span>อยู่ตึกไหน</span>
                <BuildingPicker buildings={buildings} value={f.building_slug} onChange={pickBuilding} />
                <small>เลือกจากรายการ ประกาศจะขึ้นในหน้ารีวิวตึก และบอกเวลาเดินทางถึง มศว ให้เอง</small>
              </div>
              {!f.building_slug && (
                <label className="dm-field"><span>ชื่อตึกหรือหอ<Opt /></span>
                  <input value={f.building_name} onChange={set('building_name')} maxLength={120} placeholder="เช่น ธนชัยเพลส" />
                </label>
              )}
              <div className="dm-field"><span>โซน</span>
                {f.building_slug ? (
                  <>
                    <input value={labelOf(meta?.zones, f.zone)} readOnly aria-label="โซนของตึกที่เลือก" style={{ background: 'var(--paper)', color: 'var(--ink-2)' }} />
                    <small>ผูกตามตึกที่เลือกให้อัตโนมัติ (เปลี่ยนได้เมื่อเลือก “ไม่มีในรายการ”)</small>
                  </>
                ) : (
                  <SelectBox value={f.zone} onChange={(v) => setV('zone', v)} label="โซน" options={meta?.zones || []} />
                )}
              </div>
              <div className="dm-field"><span>รับเพศ</span>
                <Pick options={(meta?.gender_prefs || []).map((g) => ({ id: g.id, label: GENDER_TXT[g.id] || g.label }))}
                      value={f.gender_pref} onChange={(v) => setV('gender_pref', v)} label="รับเพศ" />
              </div>
              <label className="dm-field"><span>หัวข้อ</span>
                <input id="dm-title" value={title} maxLength={120} className={fe.title ? 'is-invalid' : ''} aria-invalid={!!fe.title}
                       onChange={(e) => { setTitleTouched(true); set('title')(e); }} />
                {fe.title ? <FieldErr msg={fe.title} /> : <small>เขียนให้แล้ว แก้ได้ตามใจ</small>}
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div className="dm-two">
                <label className="dm-field"><span>ค่าเช่าทั้งห้อง/เดือน</span>
                  <input id="dm-price" type="number" inputMode="numeric" min="500" value={f.price_total} onChange={set('price_total')}
                         placeholder="เช่น 12000" className={fe.price_total ? 'is-invalid' : ''} aria-invalid={!!fe.price_total} />
                  <FieldErr msg={fe.price_total} />
                </label>
                <label className="dm-field"><span>{shared ? 'อยู่ทั้งหมดกี่คน' : 'อยู่ได้สูงสุดกี่คน'}</span>
                  <input id="dm-people" type="number" inputMode="numeric" min="1" max="8" value={f.people_total}
                         onChange={(e) => { setPeopleTouched(true); set('people_total')(e); }}
                         className={fe.people_total ? 'is-invalid' : ''} aria-invalid={!!fe.people_total} />
                  {fe.people_total ? <FieldErr msg={fe.people_total} /> : <small>{shared ? 'รวมคนใหม่แล้ว' : 'ห้องสำหรับคนเดียวใส่ 1'}</small>}
                </label>
              </div>
              {/* always rendered (fixed height) so the fields below never jump when the split appears */}
              <div className={`dm-perperson ${perPerson ? '' : 'is-empty'}`} aria-live="polite">
                {!perPerson ? (shared ? 'ตกคนละเท่าไร จะคำนวณให้ตรงนี้' : 'ราคาที่คนเห็น จะขึ้นตรงนี้')
                  : shared ? <>ตกคนละ <b>{baht(perPerson)}</b> บาท/เดือน</>
                    : Number(f.people_total) > 1 ? <>ประกาศจะขึ้นว่า <b>{baht(f.price_total)}</b> บาท/เดือน หารได้ {f.people_total} คนละ {baht(perPerson)}</>
                      : <>ประกาศจะขึ้นว่า <b>{baht(f.price_total)}</b> บาท/เดือน อยู่คนเดียว</>}
              </div>
              <div className="dm-field"><span>เข้าอยู่ได้ตั้งแต่</span>
                <ThaiDate id="dm-movein" value={f.move_in} onChange={(v) => setV('move_in', v)} invalid={!!fe.move_in} />
                <FieldErr msg={fe.move_in} />
              </div>
              <label className="dm-field"><span>มัดจำ/ประกัน (ทั้งห้อง)<Opt /></span>
                <input type="number" inputMode="numeric" min="0" value={f.deposit} onChange={set('deposit')} placeholder="เช่น 12000" />
              </label>
              <label className="dm-field"><span>ค่าน้ำไฟ<Opt /></span>
                <input value={f.utilities_note} onChange={set('utilities_note')} maxLength={120} placeholder="เช่น ไฟหน่วยละ 8 น้ำเหมา 150" />
              </label>
              {f.kind === 'transfer' && (
                <label className="dm-field"><span>สัญญาเหลืออีกกี่เดือน<Opt /></span>
                  <input type="number" inputMode="numeric" min="0" max="60" value={f.contract_months_left} onChange={set('contract_months_left')} />
                </label>
              )}
              {f.kind === 'short_term' && (
                <label className="dm-field"><span>อยู่ขั้นต่ำกี่เดือน<Opt /></span>
                  <input id="dm-minmonths" type="number" inputMode="numeric" min="1" max={MAX_SHORT_MONTHS} value={f.min_months} onChange={set('min_months')}
                         className={fe.min_months ? 'is-invalid' : ''} aria-invalid={!!fe.min_months} />
                  {fe.min_months ? <FieldErr msg={fe.min_months} /> : <small>1 ถึง {MAX_SHORT_MONTHS} เดือน</small>}
                </label>
              )}
              <div className="dm-two">
                <label className="dm-field"><span>ห้องนอน<Opt /></span>
                  <input type="number" inputMode="numeric" min="0" max="10" value={f.bedrooms} onChange={set('bedrooms')} />
                </label>
                <label className="dm-field"><span>ขนาด ตร.ม.<Opt /></span>
                  <input type="number" inputMode="decimal" min="5" max="500" value={f.size_sqm} onChange={set('size_sqm')} />
                </label>
              </div>
              <div className="dm-field"><span>ห้องนี้มี<Opt /></span>
                <Pick options={meta?.amenities || []} value={f.amenities} onChange={(v) => setV('amenities', v)} multi label="สิ่งที่ห้องนี้มี" />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="dm-field"><span>รูปห้อง<Opt /></span>
                {lost > 0 && (
                  <div className="dm-lostphotos" role="status">
                    <span>รูปที่เลือกไว้ {lost} รูปหายไปตอนโหลดหน้าใหม่ (เบราว์เซอร์เก็บรูปข้ามการรีโหลดไม่ได้) เลือกใหม่อีกครั้งได้เลย</span>
                    <button type="button" className="dm-textbtn" onClick={() => setLost(0)}>รับทราบ</button>
                  </div>
                )}
                <PhotoPicker value={f.photo_links} pending={pending}
                             onPending={(up) => { setLost(0); setPending(up); }}
                             onChange={(v) => { setLost(0); setF((x) => ({ ...x, photo_links: typeof v === 'function' ? v(x.photo_links) : v })); }} />
              </div>
              <label className="dm-field"><span>รายละเอียดเพิ่มเติม<Opt /></span>
                <textarea rows={4} value={f.description} onChange={set('description')} maxLength={2000}
                          placeholder="ของในห้อง ส่วนกลาง ร้านรอบๆ นิสัยเมทที่อยากได้" />
              </label>
              <div className="dm-two">
                <label className="dm-field"><span>LINE ID</span>
                  <input id="dm-line" value={f.contact_line} onChange={set('contact_line')} maxLength={60} autoCapitalize="none"
                         className={fe.contact_line ? 'is-invalid' : ''} aria-invalid={!!fe.contact_line} />
                </label>
                <label className="dm-field"><span>เบอร์โทร</span>
                  <input value={f.contact_phone} onChange={(e) => { set('contact_phone')(e); if (fe.contact_line) setFe({}); }} maxLength={30} inputMode="tel"
                         className={fe.contact_line ? 'is-invalid' : ''} />
                </label>
              </div>
              {fe.contact_line ? <FieldErr msg={fe.contact_line} />
                : <small className="dm-hint">ช่องทางติดต่อโชว์เฉพาะคนที่เข้าสู่ระบบแล้วกดดู และคุณจะเห็นว่ามีคนกดดูกี่ครั้ง</small>}
              <div className="dm-field"><span>คุณเป็น</span>
                <Pick options={meta?.poster_roles || []} value={f.poster_role} onChange={(v) => setV('poster_role', v)} label="คุณเป็น" />
              </div>
              <div className="dm-preview-m">
                <div className="dm-preview-label"><Eye size={14} aria-hidden="true" />หน้าตาประกาศของคุณในรายการ</div>
                <ListingCard x={preview} preview />
                {noPhotoNote}
              </div>
            </>
          )}

          {err && <div className="dm-err" role="alert">{err}</div>}
          {editId ? (
            <div className="dm-formbar">
              {step < LAST && <button type="button" className="dm-btn dm-btn-quiet" onClick={next}>ถัดไป</button>}
              <button type="button" className="dm-btn dm-btn-primary" onClick={saveEdit} disabled={saving} data-testid="dorm-submit-listing">
                {saving ? 'กำลังบันทึก' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          ) : (
            <div className="dm-formbar">
              {step > 0 && <button type="button" className="dm-btn dm-btn-quiet" onClick={() => { setFe({}); goStep(step - 1); }}>ย้อนกลับ</button>}
              <button type="button" className="dm-btn dm-btn-primary" onClick={next} disabled={saving} data-testid="dorm-submit-listing">
                {step < LAST ? 'ถัดไป' : saving ? 'กำลังบันทึก' : user ? 'ลงประกาศ' : 'เข้าสู่ระบบแล้วลงประกาศ'}
              </button>
            </div>
          )}
        </div>
        <aside className="dm-preview">
          <div className="dm-preview-label"><Eye size={14} aria-hidden="true" />หน้าตาประกาศของคุณในรายการ</div>
          <ListingCard x={preview} preview />
          {noPhotoNote}
        </aside>
      </div>
    </DormLayout>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { CalendarDays, Check, Globe, HandHeart, Lock, Minus, Pencil, Plus, TriangleAlert, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  Avatar, ContactButton, DemoPill, InterestChip, MatchRing, Note, Pick, SelectBox, Seg, Sheet, Skeleton, useShell, zoneShort,
} from './DormLayout';
import {
  API, anonId, authHeaders, baht, daysLeft, errMsg, invalidateBuildings, labelOf, localToday, markInterestSeen, nextMonth, priceLine, splitDemo, splitOf, thDate, upcomingMonths, useDormMeta,
} from './dormApi';

const ART = '/dorm/illustrations';
const tok = (t) => t || (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
const SUMMARY_KEYS = ['interest_count', 'interest_people', 'interest_avatars', 'interest_match', 'interest_blocked', 'spots_total', 'spots_taken', 'spots_left', 'my_interest'];
const pickSummary = (d) => Object.fromEntries(SUMMARY_KEYS.filter((k) => k in (d || {})).map((k) => [k, d[k]]));
const NEXT_LINE = 'คนที่สนใจห้องนี้และเข้ากับคุณได้ จะเห็นการ์ดของคุณและทักคุยในเว็บได้ทันที (หรือแลก LINE ทีหลัง)';
const GENDER_ONLY = { female: 'ประกาศนี้รับเฉพาะเมทหญิง', male: 'ประกาศนี้รับเฉพาะเมทชาย' };
// Why this person cannot press interest (a listing posted on the site that takes one gender only), or ''.
// Mirrors the API's listing_refuses(); the API refuses too.
const refuses = (x, gender) => (!x.external && GENDER_ONLY[x.gender_pref] && gender && gender !== x.gender_pref ? GENDER_ONLY[x.gender_pref] : '');

// A quick mate profile made from the room: budget around its split, its zone, the month it frees up
// (or next month). Shown as one editable line in the sheet, so nothing is filled in silently.
const round500 = (n, up = false) => (up ? Math.ceil(n / 500) : Math.floor(n / 500)) * 500;
const roomDefaults = (x) => {
  const per = splitOf(x)?.per || x.price_per_person || 5000;
  const today = localToday().slice(0, 7);
  const mi = x.available_from && x.available_from.slice(0, 7) > today ? x.available_from.slice(0, 7)
    : x.move_in && x.move_in.slice(0, 7) > today ? x.move_in.slice(0, 7) : nextMonth();
  return { budget_min: Math.max(1000, round500(per - 1000)), budget_max: round500(per + 500, true), zone: x.zone && x.zone !== 'other' ? x.zone : '', move_in: mi };
};
const profileFromRoom = (f, s, hasRoom, roomNote) => ({
  display_name: f.display_name.trim(), gender: f.gender, mate_gender_pref: f.mate_gender_pref, year: 'other', faculty: '',
  budget_min: Number(s.budget_min) || 0, budget_max: Number(s.budget_max) || 0,
  zones: s.zone ? [s.zone] : [], move_in: s.move_in, has_room: !!hasRoom, room_note: hasRoom ? roomNote || '' : '', tags: [], about: '',
  contact_line: f.contact_line.trim(), contact_ig: '', consent: f.consent,
});

const PartyPick = ({ value, onChange, max }) => {
  const opts = [{ id: '1', label: 'มาคนเดียว' }, { id: '2', label: 'มากัน 2 คน' }, { id: '3', label: 'มากัน 3 คน' }].slice(0, Math.max(1, Math.min(3, max)));
  if (opts.length < 2) return null;
  return (
    <div className="dm-field"><span>คุณมากี่คน</span>
      <Seg value={String(value)} onChange={(v) => onChange(Number(v))} options={opts} label="คุณมากี่คน" full />
    </div>
  );
};

// The sheet behind "สนใจ หาเมทห้องนี้": party size, a short profile when the person has none, and what happens next.
const InterestSheet = ({ x, st, onClose, onDone }) => {
  const meta = useDormMeta();
  const { user, token } = useAuth();
  const { toast, confirm, requireLogin, authOpen } = useShell();
  const managing = !!x.my_interest;
  const need = !st.profile;
  const [party, setParty] = useState(x.my_interest?.party_size || 1);
  const [f, setF] = useState({ display_name: (user?.full_name || '').split(' ')[0] || '', gender: '', mate_gender_pref: '', contact_line: '', consent: false });
  const [fe, setFe] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => { setF((o) => ({ ...o, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v })); setFe((o) => ({ ...o, [k]: '' })); };
  // "ตอนนี้คุณ": a poster with an open listing already has a room
  const [hasRoom, setHasRoom] = useState(st.hasListing ? 'yes' : 'no');
  const [s, setS] = useState(() => roomDefaults(x));
  const [editSum, setEditSum] = useState(false);
  const setSum = (k) => (v) => { setS((o) => ({ ...o, [k]: v?.target ? v.target.value : v })); setFe((o) => ({ ...o, budget: '' })); };
  const draft = need ? profileFromRoom(f, s, hasRoom === 'yes', st.roomNote) : null;
  const zoneName = zoneShort(labelOf(meta?.zones, s.zone));

  const doSave = async () => {
    setBusy(true); setErr('');
    const h = authHeaders(tok(token));
    try {
      let createdProfile = need;
      if (st.isGuest) {
        const my = (await axios.get(`${API}/my`, h)).data;
        const p = my.profile || null;
        if (p) {
          createdProfile = false;
          const why = refuses(x, p.gender);
          if (why) {
            onDone({ interest_blocked: why });
            toast(why);
            onClose();
            return;
          }
          const isLive = p.status === 'active' && daysLeft(p.expires_at) > 0;
          if (!isLive) await axios.post(`${API}/mates/me/renew`, {}, h);
        } else {
          await axios.put(`${API}/mates/me`, draft, h);
        }
      } else {
        if (need) await axios.put(`${API}/mates/me`, draft, h);
        else if (!st.live) await axios.post(`${API}/mates/me/renew`, {}, h);
      }
      const r = await axios.post(`${API}/listings/${x.id}/interest`, { party_size: party }, h);
      onDone(pickSummary(r.data));
      const hasOthers = (r.data.interest_count || 0) > 1;
      toast(managing ? 'บันทึกแล้ว' : hasOthers ? 'บันทึกแล้ว! มีคนสนใจห้องนี้อยู่ ทักคุยด้านล่างได้เลย' : createdProfile ? 'สร้างโปรไฟล์และบันทึกว่าสนใจแล้ว' : 'บันทึกว่าสนใจแล้ว คนที่สนใจห้องนี้จะเห็นคุณ');
      onClose();
      if (hasOthers) setTimeout(() => document.getElementById('dm-ip-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
    } catch (e2) {
      setErr(errMsg(e2, 'บันทึกไม่สำเร็จ'));
    }
    setBusy(false);
  };

  const submit = async () => {
    const e = {};
    if (need) {
      if (!f.display_name.trim()) e.display_name = 'ใส่ชื่อเล่น';
      if (!f.gender) e.gender = 'เลือกเพศของคุณ';
      else if (refuses(x, f.gender)) e.gender = refuses(x, f.gender);
      if (!f.mate_gender_pref) e.mate_gender_pref = 'เลือกเมทที่อยากได้';
      if (!f.contact_line.trim()) e.contact_line = 'ใส่ LINE ID ให้คนที่สนใจห้องเดียวกันทักได้';
      if (!f.consent) e.consent = 'ติ๊กยินยอมก่อน การ์ดของคุณจึงจะแสดงได้';
      if (!(Number(s.budget_min) > 0) || !(Number(s.budget_max) >= Number(s.budget_min))) { e.budget = 'งบต่ำสุดต้องไม่เกินงบสูงสุด'; setEditSum(true); }
    }
    setFe(e);
    if (Object.keys(e).length) return;
    if (!user && !tok(token)) {
      requireLogin('เข้าสู่ระบบเพื่อบันทึกความสนใจ ข้อมูลที่กรอกไว้ยังอยู่ครบ', () => { doSave(); });
      return;
    }
    await doSave();
  };
  const withdraw = async () => {
    const ok = await confirm({ title: 'ถอนความสนใจห้องนี้?', body: 'การ์ดของคุณจะหายจากรายชื่อคนที่สนใจห้องนี้ กดสนใจใหม่ได้ทุกเมื่อ', action: 'ถอนความสนใจ' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await axios.delete(`${API}/listings/${x.id}/interest`, authHeaders(tok(token)));
      onDone({ ...pickSummary(r.data), my_interest: null });
      toast('ถอนความสนใจแล้ว');
      onClose();
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  };

  return (
    <Sheet open={!authOpen} title={managing ? 'คุณสนใจห้องนี้อยู่' : x.single_room ? 'หาเมทมาหารห้องนี้' : 'สนใจ หาเมทห้องนี้'} onClose={onClose} testid="dorm-interest-sheet"
           footer={(
             <>
               {managing && <button type="button" className="dm-btn dm-btn-quiet" onClick={withdraw} disabled={busy} data-testid="dorm-interest-withdraw">ถอนความสนใจ</button>}
               <button type="button" className="dm-btn dm-btn-primary" onClick={submit} disabled={busy} data-testid="dorm-interest-submit">
                 {busy ? 'กำลังบันทึก' : managing ? 'บันทึก' : need ? 'สร้างโปรไฟล์แล้วกดสนใจ' : 'สนใจห้องนี้'}
               </button>
             </>
           )}>
      <div className="dm-isheet">
        <div className="dm-isheet-room">
          <b className="dm-ellipsis">{splitDemo(x.title).title}</b>
          {priceLine(x) && <span>{priceLine(x)}</span>}
          <InterestChip x={x} size={22} />
        </div>
        <PartyPick value={party} onChange={setParty} max={x.whole_first && Number(x.people_total) < 2 ? 1 : 3} />
        {!need && !st.live && <p className="dm-small dm-muted">โปรไฟล์หาเมทของคุณปิดอยู่ กดสนใจแล้วจะเปิดแสดงอีก 30 วัน</p>}
        {need && (
          <div className="dm-form dm-isheet-form">
            <p className="dm-small dm-isheet-lead">สร้างการ์ดสั้นๆ ให้คนที่สนใจห้องเดียวกันรู้จักคุณ</p>
            <label className="dm-field"><span>ชื่อเล่นที่จะแสดง</span>
              <input id="dm-i-name" value={f.display_name} onChange={set('display_name')} maxLength={40} className={fe.display_name ? 'is-invalid' : ''} aria-invalid={!!fe.display_name} />
              {fe.display_name && <span className="dm-field-err" role="alert">{fe.display_name}</span>}
            </label>
            <div className="dm-field"><span>คุณเป็น</span>
              <Pick options={meta?.genders || []} value={f.gender} onChange={set('gender')} label="เพศของคุณ" invalid={!!fe.gender} />
              {fe.gender && <span className="dm-field-err" role="alert">{fe.gender}</span>}
            </div>
            <div className="dm-field"><span>อยากได้เมท</span>
              <Pick options={meta?.gender_prefs || []} value={f.mate_gender_pref} onChange={set('mate_gender_pref')} label="อยากได้เมทเพศไหน" invalid={!!fe.mate_gender_pref} />
              {fe.mate_gender_pref && <span className="dm-field-err" role="alert">{fe.mate_gender_pref}</span>}
            </div>
            <label className="dm-field"><span>LINE ID</span>
              <input id="dm-i-line" value={f.contact_line} onChange={set('contact_line')} maxLength={60} autoCapitalize="none" autoComplete="off"
                     className={fe.contact_line ? 'is-invalid' : ''} aria-invalid={!!fe.contact_line} aria-describedby="dm-i-line-hint" />
              <small id="dm-i-line-hint">ไว้เผื่อแลก LINE ตอนตกลงกัน (ไม่โชว์จนกว่าจะมีคนที่เข้าสู่ระบบกดดู)</small>
              {fe.contact_line && <span className="dm-field-err" role="alert">{fe.contact_line}</span>}
            </label>
            <div className="dm-field"><span>ตอนนี้คุณ</span>
              <Seg value={hasRoom} onChange={setHasRoom} label="ตอนนี้คุณมีห้องแล้วหรือยัง" full
                   options={[{ id: 'no', label: 'ยังไม่มีห้อง' }, { id: 'yes', label: 'มีห้องแล้ว' }]} />
            </div>
            <div className="dm-isheet-sum">
              <p className="dm-isheet-draft" data-testid="dorm-interest-summary">
                <Wallet size={15} aria-hidden="true" />งบ {baht(s.budget_min)}–{baht(s.budget_max)} ต่อคน
                {zoneName ? `, โซน${zoneName}` : ', โซนไหนก็ได้'}, ย้ายเข้า {thDate(s.move_in)}
                {!editSum && (
                  <button type="button" className="dm-textbtn" onClick={() => setEditSum(true)} aria-label="แก้งบ โซน และเดือนที่ย้ายเข้า">
                    <Pencil size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 3 }} />แก้
                  </button>
                )}
              </p>
              {editSum && (
                <>
                  <div className="dm-two">
                    <label className="dm-field"><span>งบต่อคน ต่ำสุด</span>
                      <input type="number" inputMode="numeric" min="0" step="500" value={s.budget_min} onChange={setSum('budget_min')} />
                    </label>
                    <label className="dm-field"><span>สูงสุด</span>
                      <input type="number" inputMode="numeric" min="0" step="500" value={s.budget_max} onChange={setSum('budget_max')} />
                    </label>
                  </div>
                  {fe.budget && <span className="dm-field-err" role="alert">{fe.budget}</span>}
                  <div className="dm-two">
                    <div className="dm-field"><span>โซน</span>
                      <SelectBox value={s.zone} onChange={setSum('zone')} allLabel="โซนไหนก็ได้" label="โซนที่อยากอยู่" options={meta?.zones || []} />
                    </div>
                    <div className="dm-field"><span>ย้ายเข้า</span>
                      <SelectBox value={s.move_in} onChange={setSum('move_in')} label="เดือนที่ย้ายเข้า"
                                 options={[...new Set([s.move_in, ...upcomingMonths(10)])].sort().map((m) => ({ id: m, label: thDate(m) }))} />
                    </div>
                  </div>
                </>
              )}
              <span className="dm-small dm-muted">แก้เพิ่มได้ทีหลังในหน้าของฉัน</span>
            </div>
            <label className="dm-check">
              <input type="checkbox" checked={f.consent} onChange={set('consent')} />
              <span>ยินยอมให้นิสิตที่เข้าสู่ระบบเห็นโปรไฟล์นี้ 30 วัน และกดดูช่องทางติดต่อได้ ลบได้ทุกเมื่อ
                ข้อมูลอาจถูกนับรวมแบบไม่ระบุตัวตนเพื่อสรุปภาพรวมตลาดที่พัก</span>
            </label>
            {fe.consent && <span className="dm-field-err" role="alert">{fe.consent}</span>}
          </div>
        )}
        <p className="dm-isheet-next"><HandHeart size={16} aria-hidden="true" />{NEXT_LINE}</p>
        {err && <div className="dm-err" role="alert">{err}</div>}
      </div>
    </Sheet>
  );
};

// useInterest(x, onSummary) -> { start, ui }: opens the interest sheet right away even for guests;
// login is asked only on final submit (so guests can fill and inspect everything friction-free).
export const useInterest = (x, onSummary) => {
  const { user, token } = useAuth();
  const { toast } = useShell();
  const [st, setSt] = useState(null);
  const start = useCallback(async () => {
    const t = tok(token);
    if (!user && !t) {
      setSt({ profile: null, live: false, hasListing: false, roomNote: '', isGuest: true });
      return;
    }
    let my = null;
    try { my = (await axios.get(`${API}/my`, authHeaders(t))).data; } catch (e) { toast(errMsg(e)); return; }
    const profile = my.profile || null;
    const live = !!profile && profile.status === 'active' && daysLeft(profile.expires_at) > 0;
    const why = profile && x ? refuses(x, profile.gender) : '';
    if (why) {
      if (onSummary) onSummary({ interest_blocked: why });
      return;
    }
    const open = (my.listings || []).find((l) => l.status !== 'closed' && !l.expired);
    const roomNote = open ? [open.building_name, open.price_total && priceLine(open)].filter(Boolean).join(', ').slice(0, 300) : '';
    setSt({ profile, live, hasListing: !!open, roomNote, isGuest: false });
  }, [user, token, toast, x, onSummary]);
  const ui = st && x ? <InterestSheet x={x} st={st} onClose={() => setSt(null)} onDone={onSummary} /> : null;
  return { start, ui };
};

// The main button: "สนใจ หาเมทห้องนี้" or, once pressed, "สนใจแล้ว" (opens the sheet to change or withdraw).
// A listing that takes one gender only and excludes this viewer (interest_blocked, from the API) says so instead.
export const InterestButton = ({ x, onStart, variant = 'primary', block = false, compact = false }) => {
  const on = !!x.my_interest;
  if (x.interest_blocked && !on) {
    return (
      <button type="button" data-testid="dorm-interest-btn" aria-disabled="true" className={`dm-btn dm-ibtn is-blocked ${block ? 'dm-btn-block' : ''}`}
              onClick={(e) => e.preventDefault()}>
        <Lock size={16} aria-hidden="true" /><span className="dm-ellipsis">{compact ? x.interest_blocked.replace(/^ประกาศนี้/, '') : x.interest_blocked}</span>
      </button>
    );
  }
  return (
    <button type="button" data-testid="dorm-interest-btn" aria-pressed={on}
            className={`dm-btn dm-ibtn ${on ? 'is-on' : variant === 'primary' ? 'dm-btn-primary' : 'dm-btn-tint'} ${block ? 'dm-btn-block' : ''}`}
            onClick={onStart}>
      {on ? <Check size={18} strokeWidth={2.4} aria-hidden="true" /> : <HandHeart size={18} aria-hidden="true" />}
      <span className="dm-ellipsis">{on ? (compact ? 'สนใจแล้ว' : `สนใจแล้ว${x.my_interest.party_size > 1 ? ` (${x.my_interest.party_size} คน)` : ''}`) : x.single_room ? (compact ? 'หาเมทมาหาร' : 'หาเมทมาหารห้องนี้') : compact ? 'สนใจ หาเมท' : 'สนใจ หาเมทห้องนี้'}</span>
    </button>
  );
};

const Person = ({ m, i, canContact, roomId = '' }) => {
  const meta = useDormMeta();
  const { title: name, demo } = splitDemo(m.display_name);
  const who = [labelOf(meta?.genders, m.gender), m.year !== 'other' && labelOf(meta?.years, m.year), m.faculty].filter(Boolean).join(', ');
  const budget = m.budget_min || m.budget_max ? `${baht(m.budget_min || m.budget_max)}${m.budget_max && m.budget_min && m.budget_max !== m.budget_min ? `–${baht(m.budget_max)}` : ''}` : '';
  const score = m.match?.score;
  return (
    <article className={`dm-person dm-rise ${m.is_me ? 'is-me' : ''}`} style={{ '--i': Math.min(i, 6) }} data-testid="dorm-interest-person">
      <div className="dm-person-head">
        <Avatar name={name || m.display_name} size={48} />
        <div className="dm-person-id">
          <h3 className="dm-person-name"><span>{name}</span>{demo && <DemoPill onPaper />}{m.is_me && <span className="dm-pill me">คุณ</span>}</h3>
          {who && <div className="dm-person-who">{who}</div>}
        </div>
        {score != null && !m.is_me && <MatchRing score={score} size={48} />}
      </div>
      <div className="dm-person-facts">
        {m.party_size > 1 && <span className="dm-mfact f-p"><Users size={14} aria-hidden="true" />มากัน {m.party_size} คน</span>}
        {budget && <span className="dm-mfact f-b"><Wallet size={14} aria-hidden="true" />งบ {budget}</span>}
        {m.move_in && <span className="dm-mfact f-m"><CalendarDays size={14} aria-hidden="true" />ย้าย {thDate(m.move_in)}</span>}
      </div>
      {m.match?.reasons?.length > 0 && !m.is_me && <p className="dm-person-why"><Check size={14} aria-hidden="true" />{m.match.reasons.slice(0, 2).join(', ')}</p>}
      {!m.is_me && canContact && (
        <div className="dm-mate-foot">
          <ContactButton kind="mate" id={m.id} roomId={roomId} label="ทัก LINE" ariaLabel={`ดูช่องทางติดต่อของ ${name}`} variant="secondary" />
        </div>
      )}
    </article>
  );
};

// "คนที่สนใจห้องนี้", gated by the API (access): a guest and a viewer without a live profile see the neutral total and
// initials only; a viewer with a profile sees exactly the people who match them both ways (or an honest line why
// nobody does, with two ways on); the owner of a listing sees everyone.
// version: bump to refetch (after this viewer presses or withdraws).
const WHY = {
  theirs: 'คนที่สนใจตอนนี้อยากได้เมทคนละเพศกับคุณ',
  mine: 'คนที่สนใจตอนนี้เป็นคนละเพศกับเมทที่คุณอยากได้',
  both: 'เพศที่อยากได้ของคุณกับคนที่สนใจตอนนี้ไม่ตรงกัน',
};
export const InterestedPeople = ({ x, version, onStart, onSummary }) => {
  const { token } = useAuth();
  const { requireLogin } = useShell();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    setErr(false);
    axios.get(`${API}/listings/${x.id}/interested`, { ...authHeaders(token), signal: ctl.signal })
      .then((r) => { setD(r.data); if (onSummary) onSummary(pickSummary(r.data)); })
      .catch((e) => { if (!axios.isCancel(e)) setErr(true); });
    return () => ctl.abort();
    // onSummary is a setter wrapper; refetch only when the room, the viewer or the version changes
  }, [x.id, token, version]);
  // the owner opened the interested people: the nav dot for this listing goes away; a link to #interested lands here
  useEffect(() => {
    if (!d) return;
    if (d.access === 'owner') markInterestSeen(x.id, d.interest_people || 0);
    if (window.location.hash === '#interested') setTimeout(() => document.getElementById('dm-ip-h')?.scrollIntoView({ block: 'start' }), 80);
  }, [d, x.id]);
  const owner = x.is_mine;
  const head = owner ? 'คนที่สนใจประกาศของคุณ' : 'คนที่สนใจห้องนี้';
  if (err) return null;
  if (!d) {
    return (
      <section className="dm-dsec dm-ipeople" aria-busy="true" aria-label={head}>
        <h2>{head}</h2><Skeleton h={120} r={18} />
      </section>
    );
  }
  const items = d.items || [];
  const hid = d.hidden_by_gender || { total: 0, theirs: 0, mine: 0 };
  const total = d.interest_people || 0;
  const mineN = d.my_interest ? Number(d.my_interest.party_size) || 1 : 0;
  const othersInterested = Math.max(0, (d.interest_count || 0) - (d.my_interest ? 1 : 0));
  const empty = (
    <div className="dm-iempty">
      <img src={`${ART}/empty-mates.svg`} alt="" className="dm-iempty-art" loading="lazy" />
      <div>
        <p className="dm-iempty-t">
          {owner ? 'ยังไม่มีใครกดสนใจ'
            : (x.peek_count || 0) > 0
              ? `มีคนเล็งห้องนี้อยู่แล้ว ${x.peek_count} คน แต่ยังไม่มีใครเปิดหาเมท — เป็นคนแรกที่กด “สนใจ หาเมทห้องนี้” ให้คนที่เล็งอยู่เห็นแล้วทักมาได้เลย`
              : 'ยังไม่มีใครกดสนใจ เป็นคนแรก แล้วคนที่สนใจห้องเดียวกันจะเห็นคุณ'}
        </p>
        {!owner && onStart && !x.interest_blocked && <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={onStart}>{x.single_room ? 'หาเมทมาหารห้องนี้' : 'สนใจ หาเมทห้องนี้'}</button>}
      </div>
    </div>
  );
  const avatars = (
    <span className="dm-stack" aria-hidden="true">
      {(d.interest_avatars || []).map((a, k) => <Avatar key={k} av={a} size={32} />)}
      {d.interest_count > (d.interest_avatars || []).length && <span className="dm-avatar dm-ichip-more" style={{ width: 32, height: 32, fontSize: 13 }}>+{d.interest_count - (d.interest_avatars || []).length}</span>}
    </span>
  );
  let body;
  if (!total) body = empty;
  else if (d.access === 'guest' || d.access === 'no_profile') {
    const isum = d.interest_summary || {};
    const bTxt = isum.budget_min || isum.budget_max
      ? `งบ ${baht(isum.budget_min || isum.budget_max)}${isum.budget_max && isum.budget_min && isum.budget_max !== isum.budget_min ? `–${baht(isum.budget_max)}` : ''} ฿/คน`
      : '';
    const mTxt = isum.move_ins?.length ? `ย้าย ${isum.move_ins.map((m) => thDate(m)).join(', ')}` : '';
    const metaLine = [bTxt, mTxt].filter(Boolean).join(' · ');
    body = (
      <div className="dm-igate" data-testid="dorm-interest-gate">
        <div className="dm-igate-top">{avatars}<span>{total} คนสนใจห้องนี้</span></div>
        {metaLine && <p className="dm-igate-meta">{metaLine}</p>}
        {d.access === 'guest' ? (
          <div className="dm-actions">
            <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={() => requireLogin('เข้าสู่ระบบเพื่อดูว่าใครสนใจห้องนี้', async () => {
              if (!owner && !x.interest_blocked && onStart) {
                try {
                  const my = (await axios.get(`${API}/my`, authHeaders(tok()))).data;
                  if (!my.profile) onStart();
                } catch { /* ignore */ }
              }
            })}>เข้าสู่ระบบเพื่อดูว่าใครสนใจ</button>
          </div>
        ) : (
          <>
            <p>เห็นการ์ดเฉพาะคนที่เข้ากับคุณได้ เลยต้องมีโปรไฟล์ก่อน</p>
            <div className="dm-actions">
              {onStart && !x.interest_blocked && !owner
                ? <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={onStart}>สร้างโปรไฟล์เพื่อดูว่าใครตรงกับคุณ</button>
                : <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-tint dm-btn-sm">สร้างโปรไฟล์เพื่อดูว่าใครตรงกับคุณ</Link>}
            </div>
          </>
        )}
      </div>
    );
  } else {
    const others = items.filter((m) => !m.is_me);
    const why = hid.total && hid.theirs === hid.total ? WHY.theirs : hid.total && hid.mine === hid.total ? WHY.mine : WHY.both;
    body = (
      <>
        {d.access === 'profile' && othersInterested > 0 && (
          <p className="dm-ipeople-match" data-testid="dorm-interest-match">{others.length ? `ตรงกับคุณ ${d.interest_match ?? others.length} คน` : 'ยังไม่มีคนที่ตรงกับคุณในห้องนี้'}</p>
        )}
        {items.length > 0 && <div className="dm-people">{items.map((m, i) => <Person key={m.id} m={m} i={i} canContact roomId={x.id} />)}</div>}
        {d.access === 'profile' && othersInterested > 0 && !others.length && (
          <div className="dm-igate" data-testid="dorm-interest-nomatch">
            <p>{why}</p>
            {mineN > 0 && <p>คุณยังกดสนใจห้องนี้อยู่ ถ้ามีคนที่เข้ากับคุณมากดสนใจ เขาจะเห็นการ์ดของคุณ</p>}
            <div className="dm-actions">
              <Link to="/dorm/rooms?interested=1" className="dm-btn dm-btn-tint dm-btn-sm">ดูห้องอื่นที่มีคนรอหาร</Link>
              <Link to="/dorm/mates" className="dm-btn dm-btn-quiet dm-btn-sm">ดูคนหาเมททั้งหมด</Link>
            </div>
          </div>
        )}
        {d.access === 'profile' && others.length > 0 && hid.total > 0 && (
          <Note className="dm-ipeople-hidden">มีอีก {hid.total} คนสนใจห้องนี้ แต่เพศที่อยากได้ไม่ตรงกับคุณ ระบบจึงไม่แสดง</Note>
        )}
        {!othersInterested && d.access === 'profile' && <p className="dm-small dm-muted">ยังไม่มีคนอื่นกดสนใจ ถ้ามีคนที่เข้ากับคุณมากดสนใจ จะขึ้นที่นี่</p>}
      </>
    );
  }
  return (
    <section className="dm-dsec dm-ipeople" aria-labelledby="dm-ip-h" data-testid="dorm-interest-section" id="interested">
      <div className="dm-ipeople-head">
        <h2 id="dm-ip-h">{head}{total > 0 && <span className="dm-ipeople-n">{total} คน</span>}</h2>
      </div>
      {body}
    </section>
  );
};

// Split calculator: rent per person for 1 to n people, and the move-in cost per person when the terms are known.
const MAX_BY_BEDROOMS = { 0: 2, 1: 3, 2: 4, 3: 4 };
export const SplitCalc = ({ x }) => {
  const sp = splitOf(x);
  // a studio for one starts at 1 person, sharing with one more as the option
  const max = x.single_room ? 2 : x.external ? (MAX_BY_BEDROOMS[x.bedrooms] || 4) : Math.min(8, Math.max(4, sp?.n || 1));
  const [n, setN] = useState(x.single_room ? 1 : Math.min(max, sp?.n || 2));
  if (!sp) return null;
  const per = Math.round(sp.total / n);
  const months = (x.deposit_months || 0) + (x.advance_months || 0);
  const moveIn = x.external && months ? Math.round((sp.total * months) / n) : null;
  const depositEach = !x.external && x.deposit ? Math.round(x.deposit / n) : null;
  return (
    <section className="dm-dsec dm-calc" aria-labelledby="dm-calc-h">
      <h2 id="dm-calc-h">{x.single_room || x.whole_first ? 'อยู่กี่คน' : 'หารกันกี่คน'}</h2>
      <div className="dm-calc-box">
        <div className="dm-calc-row">
          <div className="dm-stepper" role="group" aria-label="จำนวนคนที่หาร">
            <button type="button" className="dm-iconbtn" onClick={() => setN((v) => Math.max(1, v - 1))} disabled={n <= 1} aria-label="ลดจำนวนคน"><Minus size={18} /></button>
            <output aria-live="polite"><b>{n}</b> คน</output>
            <button type="button" className="dm-iconbtn" onClick={() => setN((v) => Math.min(max, v + 1))} disabled={n >= max} aria-label="เพิ่มจำนวนคน"><Plus size={18} /></button>
          </div>
          <div className="dm-calc-per">
            <small>{n > 1 ? 'คนละ' : 'อยู่คนเดียว'}</small>
            <b key={n} className="dm-swap">{baht(per)}</b><span>฿/เดือน</span>
          </div>
        </div>
        <div className="dm-calc-lines">
          <span>ทั้งห้อง {baht(sp.total)} ฿/เดือน</span>
          {moveIn ? <span>ค่าแรกเข้า (มัดจำ {x.deposit_months || 0} ล่วงหน้า {x.advance_months || 0} เดือน) คนละ ~{baht(moveIn)} ฿</span>
            : depositEach ? <span>มัดจำ {baht(x.deposit)} ฿ คนละ ~{baht(depositEach)} ฿</span>
              : x.external && <span>ประกาศไม่ได้บอกเงินมัดจำ ถามที่เว็บต้นทางก่อนโอน</span>}
          <span className="dm-muted">ยังไม่รวมค่าน้ำ ค่าไฟ และค่าส่วนกลาง</span>
        </div>
      </div>
    </section>
  );
};

// Source honesty for an external room: where it came from, when it was last seen, the link, and a login-free crowd "gone" signal.
export const SourceBox = ({ x, onGoneUpdated }) => {
  const { token } = useAuth();
  const { toast, confirm } = useShell();
  const [done, setDone] = useState(false);
  const gone = async () => {
    const willClose = (x.gone_reports || 0) >= 1;
    const ok = await confirm({
      title: 'แจ้งว่าห้องนี้ไม่ว่างแล้ว?',
      body: willClose
        ? 'มีคนแจ้งไว้ก่อนหน้าแล้ว 1 คน หากยืนยันอีก ระบบจะปรับห้องนี้เป็น “ไม่ว่างแล้ว” ทันที ขอบคุณที่ช่วยอัปเดต'
        : 'ไม่ต้องล็อกอิน — ระบบจะติดป้ายเตือน “อาจไม่ว่างแล้ว” ให้คนอื่นเห็นทันที และซ่อนอัตโนมัติเมื่อมีคนแจ้งครบ 2 คน',
      action: 'ยืนยัน ไม่ว่างแล้ว',
    });
    if (!ok) return;
    try {
      const r = await axios.post(`${API}/listings/${x.id}/gone`, { anon_id: anonId() }, authHeaders(tok(token)));
      setDone(true);
      const d = r.data || {};
      if (d.auto_closed) {
        invalidateBuildings();
        toast('ปรับห้องนี้เป็นไม่ว่างแล้ว ขอบคุณที่ช่วยอัปเดต');
      } else if (d.duplicate) {
        toast('คุณเคยแจ้งห้องนี้ไว้แล้ว');
      } else {
        toast('ติดป้ายเตือน “อาจไม่ว่างแล้ว” แล้ว ขอบคุณครับ');
      }
      if (onGoneUpdated) onGoneUpdated(d);
    } catch (e) { toast(errMsg(e)); }
  };
  return (
    <div className="dm-srcbox" data-testid="dorm-source-box">
      <div className="dm-srcbox-top">
        <span className="dm-srcbox-ico"><Globe size={20} aria-hidden="true" /></span>
        <div>
          <b>ประกาศจาก {x.source}</b>
          {x.source_seen_at && <span className="dm-small dm-muted">เห็นล่าสุด {thDate(x.source_seen_at)}</span>}
        </div>
      </div>
      <a className="dm-btn dm-btn-ink dm-btn-block" href={x.source_url} target="_blank" rel="noopener nofollow noreferrer" data-testid="dorm-source-link">
        ดูประกาศต้นทาง
      </a>
      <p className="dm-small dm-srcbox-note">ติดต่อและยืนยันห้องกับผู้ลงที่เว็บต้นทาง</p>
      {x.maybe_gone && !done && (
        <span className="dm-srcbox-warn"><TriangleAlert size={14} aria-hidden="true" />มีคนแจ้งแล้ว {x.gone_reports} คน · ถ้าเช็กแล้วไม่อยู่จริงช่วยกดยืนยันเพิ่ม</span>
      )}
      {done ? <span className="dm-tiny dm-muted">แจ้งแล้ว ขอบคุณที่ช่วยอัปเดต</span>
        : <button type="button" className="dm-textbtn dm-report" onClick={gone} data-testid="dorm-source-gone">แจ้งว่าห้องนี้ไม่ว่างแล้ว</button>}
    </div>
  );
};

export const OwnerInterestLink = ({ x }) => (x.interest_count > 0 ? (
  <Link to="#dm-ip-h" className="dm-textbtn" onClick={(e) => { e.preventDefault(); document.getElementById('dm-ip-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
    {x.interest_people} คนสนใจ
  </Link>
) : null);

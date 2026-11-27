import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Eye, HandHeart, HeartHandshake, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, {
  ArchiveActions, ChatArchive, Empty, ListingCard, MateCard, MyMateStrip, Note, PageHead, SelectBox, Sheet, Skeleton, Swap, informativeRows, zoneShort,
} from './DormLayout';
import { API, authHeaders, baht, labelOf, thDate, upcomingMonths, useDormMeta } from './dormApi';

const ART = '/dorm/illustrations';
const KEYS = ['gender', 'zone', 'budget', 'move_in', 'has_room', 'tag'];
const BUDGETS = [3000, 4000, 5000, 6000, 7000, 8000, 10000].map((b) => ({ id: String(b), label: `${baht(b)} บาท` }));
const EMPTY_F = Object.fromEntries(KEYS.map((k) => [k, '']));

const Selects = ({ f, set, meta }) => (
  <>
    <div className="dm-field"><span>เพศ</span>
      <SelectBox value={f.gender} onChange={set('gender')} allLabel="ทุกเพศ" label="เพศ" options={meta?.genders || []} />
    </div>
    <div className="dm-field"><span>โซน</span>
      <SelectBox value={f.zone} onChange={set('zone')} allLabel="ทุกโซน" label="โซน" options={meta?.zones || []} />
    </div>
    <div className="dm-field"><span>งบของคุณต่อคน</span>
      <SelectBox value={f.budget} onChange={set('budget')} allLabel="ไม่ระบุ" label="งบของคุณต่อคน" options={BUDGETS} />
    </div>
    <div className="dm-field"><span>ย้ายเข้า</span>
      <SelectBox value={f.move_in} onChange={set('move_in')} allLabel="เดือนไหนก็ได้" label="เดือนที่ย้ายเข้า"
                 options={upcomingMonths().map((m) => ({ id: m, label: thDate(m) }))} />
    </div>
    <div className="dm-field"><span>นิสัยที่อยากได้</span>
      <SelectBox value={f.tag} onChange={set('tag')} allLabel="ไม่ระบุ" label="นิสัยที่อยากได้" options={meta?.tags || []} />
    </div>
  </>
);

// Demand from the OpenChat archive: old "looking for a room or a mate" posts (budget, zone, gender wanted,
// move-in month, date), following the zone and budget filters. No contact; a nudge to make a profile instead.
const monthsBetween = (p) => {
  if (!p?.from || !p?.to) return 0;
  return Math.max(1, Math.round((new Date(p.to) - new Date(p.from)) / (30.4 * 86400000)));
};
const MatesArchive = ({ f, hasProfile, primary = false }) => {
  const [d, setD] = useState(null);
  const [all, setAll] = useState(null);
  const kindParam = f.has_room === 'true' ? 'mate_wanted' : f.has_room === 'false' ? 'seeking' : '';
  useEffect(() => {
    axios.get(`${API}/chat-posts`, { params: { limit: 1 } }).then((r) => setAll(r.data)).catch(() => setAll(null));
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    axios.get(`${API}/chat-posts`, {
      params: {
        limit: 200,
        ...(kindParam && { kind: kindParam }),
        ...(f.zone && { zone: f.zone }),
        ...(f.budget && { max_price: f.budget }),
      },
      signal: ctl.signal,
    })
      .then((r) => setD({ k: `${kindParam}-${f.zone}-${f.budget}-${f.gender}`, ...r.data }))
      .catch((e) => { if (!axios.isCancel(e)) setD(null); });
    return () => ctl.abort();
  }, [kindParam, f.zone, f.budget, f.gender]);
  const raw = d ? d.items.filter((p) => (kindParam ? true : (p.kind === 'seeking' || p.kind === 'mate_wanted'))
    && (!f.gender || !p.gender_pref || p.gender_pref === 'any' || p.gender_pref === f.gender)) : [];
  const rows = informativeRows(raw);
  if (!d || !rows.length) return null;
  const months = monthsBetween(d.period);
  const filtered = Boolean(f.zone || f.budget || f.gender || kindParam);
  const demand = all?.total ? `${months} เดือนที่ผ่านมา มีความเคลื่อนไหว ${all.total} โพสต์ในกลุ่ม OpenChat มศว` : '';
  const sub = [filtered ? `ตรงกับตัวกรอง ${rows.length} โพสต์` : `${rows.length} โพสต์หาเมทจริงจากกลุ่ม`, demand && !filtered && demand, 'โพสต์ล่าสุดขึ้นก่อน · เก่ากว่า 90 วันแสดงสีเทา'].filter(Boolean).join(' · ');
  return (
    <ChatArchive key={d.k} className={`dm-mates-archive ${primary ? 'is-primary' : ''}`}
                 title={primary ? 'ความเคลื่อนไหวหาเมทจากกลุ่ม OpenChat มศว' : 'คนที่เคยประกาศหาห้องหรือหาเมทในแชท'}
                 sub={sub} items={rows} total={rows.length} show={primary ? 12 : 6} zoneLink
                 note="ดึงเฉพาะข้อมูลสรุปจากแชทกลุ่ม ไม่มีชื่อหรือช่องทางติดต่อ โพสต์สีเทาคือโพสต์เก่ากว่า 90 วัน">
      <ArchiveActions hasProfile={hasProfile} />
    </ChatArchive>
  );
};

// Same outline as MateCard so nothing jumps when the list lands.
const MateSkeleton = () => (
  <div className="dm-mate dm-mate-skel" aria-hidden="true">
    <div className="dm-mate-head">
      <Skeleton w={52} h={52} r={999} />
      <div style={{ flex: 1, display: 'grid', gap: 8 }}><Skeleton w="50%" h={18} /><Skeleton w="36%" h={13} /></div>
    </div>
    <div style={{ display: 'flex', gap: 6 }}><Skeleton w={110} h={28} r={999} /><Skeleton w={90} h={28} r={999} /><Skeleton w={80} h={28} r={999} /></div>
    <Skeleton w="80%" h={14} /><Skeleton w="64%" h={14} />
    <Skeleton h={48} r={14} />
  </div>
);

export default function DormMatesPage() {
  const meta = useDormMeta();
  const { token } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ''])));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tries, setTries] = useState(0);
  const [engagedRooms, setEngagedRooms] = useState([]);

  useEffect(() => {
    const p = { engaged: 1, limit: 24, ...(f.zone && { zone: f.zone }), ...(f.budget && { max_price: f.budget }) };
    const ctl = new AbortController();
    axios.get(`${API}/listings`, { params: p, ...authHeaders(token), signal: ctl.signal })
      .then((r) => {
        const rows = (r.data.items || []).slice().sort((a, b) => Number((b.interest_people || 0) > 0) - Number((a.interest_people || 0) > 0)
          || (b.interest_people || 0) - (a.interest_people || 0)
          || (b.peek_count || 0) - (a.peek_count || 0));
        setEngagedRooms(rows);
      })
      .catch((e) => { if (!axios.isCancel(e)) setEngagedRooms([]); });
    return () => ctl.abort();
  }, [f.zone, f.budget, token]);

  useEffect(() => {
    const p = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    const ctl = new AbortController();
    setErr(false);
    axios.get(`${API}/mates`, { params: p, ...authHeaders(token), signal: ctl.signal })
      .then((r) => setData(r.data))
      .catch((e) => { if (!axios.isCancel(e)) { setErr(true); setData({ items: [], total: 0 }); } });
    return () => ctl.abort();
  }, [f, token, tries]);

  // ?focus=<mate id> (the admin's report list links here): scroll to that card once and outline it briefly
  const focusId = params.get('focus') || '';
  const focused = useRef(false);
  useEffect(() => {
    if (!focusId || focused.current || !data) return;
    focused.current = true;
    const el = document.getElementById(`mate-${focusId}`);
    if (!el) return;
    setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('is-focus'); }, 120);
  }, [focusId, data]);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k] === v ? '' : v }));
  const clear = (k) => setF((x) => ({ ...x, [k]: '' }));
  const clearAll = () => setF({ ...EMPTY_F });
  // filters that live in the sheet (the quick chips cover has_room + gender)
  const chips = [
    f.zone && { k: 'zone', label: zoneShort(labelOf(meta?.zones, f.zone)) },
    f.budget && { k: 'budget', label: `งบ ${baht(f.budget)}` },
    f.move_in && { k: 'move_in', label: `ย้าย ${thDate(f.move_in)}` },
    f.tag && { k: 'tag', label: labelOf(meta?.tags, f.tag) },
    f.gender === 'other' && { k: 'gender', label: labelOf(meta?.genders, 'other') },
  ].filter(Boolean);
  const nSheet = chips.length + (f.gender && f.gender !== 'other' ? 1 : 0);
  const anyFilter = KEYS.some((k) => f[k]);
  const mine = data?.items.find((m) => m.is_me);
  const others = data ? data.items.filter((m) => !m.is_me) : null;
  // people hidden by the gender-preference gate (both sides must accept): never say nobody is here
  const hid = data?.hidden_by_gender || { total: 0, theirs: 0, mine: 0 };
  const hiddenWhy = hid.theirs === hid.total ? 'แต่เขาอยากได้เมทคนละเพศกับคุณ'
    : hid.mine === hid.total ? 'แต่เพศของเขาไม่ตรงกับเมทที่คุณอยากได้' : 'แต่เพศที่อยากได้ไม่ตรงกัน';
  // One truthful count: everyone else with an open profile (the viewer's own profile is not counted), then how many
  // of them the viewer can actually see (the two-way gender gate hides the rest).
  const everyone = data ? data.items.length + hid.total - (mine ? 1 : 0) : 0;
  const headLine = !others ? '' : !everyone ? 'คนที่กำลังหาเพื่อนร่วมห้อง'
    : `${anyFilter ? `ตรงกับที่เลือก ${everyone} คน` : `${everyone} ${mine ? 'คนอื่นกำลังหาเมท' : 'คนกำลังหาเมท'}`}${!data.me ? '' : others.length ? ` ${anyFilter ? 'ในนี้' : ''}ตรงกับคุณ ${others.length} คน` : ' ยังไม่มีใครตรงกับคุณ'}`;
  const quick = [
    { k: 'has_room', v: 'true', label: 'มีห้องแล้ว หาคนหาร' },
    { k: 'has_room', v: 'false', label: 'ยังไม่มีห้อง' },
    { k: 'gender', v: 'female', label: 'ผู้หญิง' },
    { k: 'gender', v: 'male', label: 'ผู้ชาย' },
  ];

  return (
    <DormLayout title="หาเมท" className="dm-matespage">
      <PageHead title="หาเมท" sub={others ? <Swap k={headLine}>{headLine}</Swap> : 'คนที่กำลังหาเพื่อนร่วมห้อง'} />

      {mine && <MyMateStrip m={mine} />}

      <div className="dm-mt-strip">
        <div className="dm-mt-row" role="group" aria-label="กรองรายชื่อเมท">
          <button type="button" className={`dm-chip dm-mt-filter ${nSheet ? 'on-dark' : ''}`} onClick={() => setSheet(true)} aria-label={`ตัวกรองทั้งหมด${nSheet ? ` ใช้อยู่ ${nSheet}` : ''}`}>
            <SlidersHorizontal size={15} aria-hidden="true" />ตัวกรอง{nSheet > 0 && <span className="dm-mt-n">{nSheet}</span>}
          </button>
          {quick.map((q) => (
            <button key={`${q.k}${q.v}`} type="button" className={`dm-chip q-${q.k} ${f[q.k] === q.v ? 'on' : ''}`} aria-pressed={f[q.k] === q.v}
                    onClick={() => toggle(q.k, q.v)}>
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dm-mates-filters"><Selects f={f} set={set} meta={meta} /></div>
      {data && !data.me && (
        <div className="dm-mateguest-bar">
          <p><b>ให้ระบบเรียงเมทที่ตรงกับคุณ</b><span>สร้างโปรไฟล์ไว้ งบ โซน และนิสัยที่ตรงกันจะขึ้นก่อน</span></p>
          <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-ink dm-btn-sm">สร้างโปรไฟล์</Link>
        </div>
      )}
      {chips.length > 0 && (
        <div className="dm-active dm-mt-active">
          {chips.map((c) => (
            <button type="button" key={c.k} className="dm-chipx" onClick={() => clear(c.k)} aria-label={`เอาตัวกรอง ${c.label} ออก`}>
              {c.label}<X size={15} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="dm-textbtn" onClick={clearAll}>ล้างทั้งหมด</button>
        </div>
      )}

      {!others ? (
        <div className="dm-mates" aria-busy="true" aria-label="กำลังโหลด"><MateSkeleton /><MateSkeleton /><MateSkeleton /></div>
      ) : err ? (
        <Empty title="โหลดรายชื่อไม่สำเร็จ" art={`${ART}/empty-mates.svg`}
               action={<button type="button" className="dm-btn dm-btn-quiet" onClick={() => { setData(null); setTries((n) => n + 1); }}>ลองอีกครั้ง</button>}>
          เช็กอินเทอร์เน็ตแล้วลองใหม่
        </Empty>
      ) : others.length ? (
        <div className="dm-mates">{others.map((m, i) => <MateCard key={m.id} m={m} i={i} />)}</div>
      ) : hid.total > 0 ? (
        <Empty title={`มี ${hid.total} คนกำลังหาเมท ${hiddenWhy}`} art={`${ART}/empty-mates.svg`} className="dm-mates-hidden"
               action={(
                 <div className="dm-actions" style={{ justifyContent: 'center' }}>
                   <Link to="/dorm/post?kind=mate_wanted" className="dm-btn dm-btn-ink">ลงประกาศหาเมท</Link>
                   <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-quiet">แก้โปรไฟล์ของฉัน</Link>
                   {anyFilter && <button type="button" className="dm-btn dm-btn-quiet" onClick={clearAll}>ล้างตัวกรอง</button>}
                 </div>
               )}>
          {hid.mine > 0 ? 'ระบบแสดงเฉพาะคนที่รับเพศของกันและกันได้ ถ้ารับเมทได้หลายเพศ แก้โปรไฟล์แล้วจะเห็นมากขึ้น'
            : 'ระบบแสดงเฉพาะคนที่รับเพศของกันและกันได้ ลงประกาศหาเมทไว้ คนที่หาเมทแบบคุณจะเจอคุณ'}
        </Empty>
      ) : anyFilter ? (
        <Empty title="ยังไม่มีโปรไฟล์ในเว็บที่ตรงเงื่อนไขนี้" art={`${ART}/empty-mates.svg`}
               action={<button type="button" className="dm-btn dm-btn-quiet" onClick={clearAll}>ล้างตัวกรอง</button>}>
          ลองดูความเคลื่อนไหวจากแชทกลุ่มด้านล่าง หรือเอาตัวกรองออกบางอัน
        </Empty>
      ) : null}

      {engagedRooms.length > 0 && (
        <section className="dm-sec" aria-labelledby="dm-mates-rooms-h" data-testid="dorm-mates-engaged-rooms" style={{ marginTop: 24 }}>
          <div className="dm-sec-head">
            <h2 id="dm-mates-rooms-h">ห้องที่มีคนสนใจหาเมทและเล็งอยู่ ({engagedRooms.length})</h2>
            <Link to="/dorm/rooms?interested=1&sort=interest">ดูห้องทั้งหมด</Link>
          </div>
          <div className="dm-tier-legend">
            <span><span className="dm-pill wait"><HandHeart size={11} aria-hidden="true" />รอหาร</span>สนใจจริงจัง (ล็อกอิน · ทักคุยได้)</span>
            <span><span className="dm-pill peek on-paper"><Eye size={11} aria-hidden="true" />เล็งอยู่</span>สนใจนิดๆ (กด ♥ ไม่ต้องล็อกอิน)</span>
          </div>
          <div className="dm-grid three">
            {engagedRooms.slice(0, 6).map((x, i) => <ListingCard key={x.id} x={x} list i={i} budgetMax={f.budget} />)}
          </div>
        </section>
      )}

      {data && <MatesArchive f={f} hasProfile={!!data.me} primary={Boolean(others && !others.length && !hid.total)} />}

      <div className="dm-mt-notes">
        {data?.me && (
          <Note tone="tint" icon={HeartHandshake}>
            ความเข้ากันคิดจากงบ 35 โซน 25 เดือนที่ย้าย 20 และนิสัย 20 คะแนน ถ้าเพศที่อยากได้ไม่ตรงกันจะไม่แสดง
          </Note>
        )}
        <Note icon={ShieldCheck}>ข้อมูลในโปรไฟล์เจ้าของกรอกเอง นัดเจอกันที่สาธารณะ และดูห้องจริงก่อนโอนเงินทุกครั้ง</Note>
      </div>

      {sheet && (
        <Sheet title="ตัวกรอง" onClose={() => setSheet(false)}
               footer={(
                 <>
                   <button type="button" className="dm-btn dm-btn-quiet" onClick={() => setF({ ...EMPTY_F, has_room: f.has_room })}>ล้างทั้งหมด</button>
                   <button type="button" className="dm-btn dm-btn-ink" onClick={() => setSheet(false)}>ดู {others?.length ?? ''} คน</button>
                 </>
               )}>
          <div className="dm-mt-stack"><Selects f={f} set={set} meta={meta} /></div>
        </Sheet>
      )}
    </DormLayout>
  );
}

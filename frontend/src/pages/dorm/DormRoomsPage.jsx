import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigationType, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowDownUp, Eye, Footprints, HandHeart, History, RotateCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, {
  ARCHIVE_NOTE, ArchiveActions, BUDGET_MAX, BUDGET_MIN, BudgetSlider, ChatArchive, ChipRow, Empty, ListingOrGroup, PageHead, Pick, RoomsSwitch, Seg, Sheet, SkeletonGrid, Swap,
  informativeRows, periodTh, useEdgeFade, zoneDot, zoneShort,
} from './DormLayout';
import { API, BUDGET_PRESETS, authHeaders, baht, groupLookalikes, labelOf, presetFromRange, rememberRooms, useDormMeta } from './dormApi';

const FIELDS = ['kind', 'zone', 'min_price', 'max_price', 'gender', 'amenity', 'q', 'interested', 'engaged', 'include_closed', 'sort'];
// no sort in the URL = "recommended" (featured, then rooms posted here newest first, then external rooms cheapest per person first)
const SORTS = [{ id: 'price', label: 'ถูกที่สุด' }, { id: 'new', label: 'ใหม่ล่าสุด' }, { id: 'interest', label: 'คนสนใจมากสุด' }, { id: 'move_in', label: 'เข้าได้เร็วสุด' }];
const GENDERS = [{ id: 'any', label: 'ทุกเพศ' }, { id: 'female', label: 'ผู้หญิงอยู่ได้' }, { id: 'male', label: 'ผู้ชายอยู่ได้' }];
const QUICK_BUDGETS = BUDGET_PRESETS.filter((b) => b.id);
const ART = '/dorm/illustrations';

// Last result per query (this page load), so coming back from a room paints instantly at the same spot.
let lastList = null;
const SCROLL_KEY = 'dm_rooms_scroll';
// The live URL's filters. Toggles decide from this, not from the last render's `f`: router navigations
// render in a transition, so two quick taps would otherwise both see the old value.
const live = () => {
  const p = new URLSearchParams(window.location.search);
  return Object.fromEntries(FIELDS.map((k) => [k, p.get(k) || '']));
};

const Filters = ({ f, set, setMany, meta }) => {
  const [budget, setBudget] = useState([Number(f.min_price) || BUDGET_MIN, Number(f.max_price) || BUDGET_MAX]);
  useEffect(() => { setBudget([Number(f.min_price) || BUDGET_MIN, Number(f.max_price) || BUDGET_MAX]); }, [f.min_price, f.max_price]);
  const commit = ([lo, hi]) => setMany({ min_price: lo > BUDGET_MIN ? lo : '', max_price: hi < BUDGET_MAX ? hi : '' });
  return (
    <div className="dm-filter-stack">
      <label className="dm-field"><span>ค้นหา</span>
        <span className="dm-search-input">
          <Search size={17} aria-hidden="true" />
          <input key={f.q} placeholder="ชื่อตึกหรือคำในประกาศ" defaultValue={f.q} aria-label="ค้นจากชื่อตึกหรือคำในประกาศ" enterKeyHint="search"
                 onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())}
                 onBlur={(e) => e.currentTarget.value.trim() !== f.q && set('q', e.currentTarget.value.trim())} />
        </span>
      </label>
      <div className="dm-field"><span>โซน</span>
        <ChipRow options={[{ id: '', label: 'ทุกโซน' }, ...(meta?.zones || []).map((z) => ({ id: z.id, label: zoneShort(z.label), dot: zoneDot(z.id) }))]}
                 value={f.zone} onChange={(v) => set('zone', v)} label="โซน" className="dm-zonepick" />
      </div>
      <BudgetSlider value={budget} onChange={setBudget} onCommit={commit} />
      <div className="dm-field"><span>รับเพศ</span>
        <Pick options={GENDERS} value={f.gender || 'any'} onChange={(v) => set('gender', v === 'any' ? '' : v)} label="รับเพศ" />
      </div>
      <div className="dm-field"><span>ต้องมี</span>
        <Pick options={meta?.amenities || []} value={f.amenity} onChange={(v) => set('amenity', v)} label="ต้องมี" allowEmpty />
        <small>เลือกได้หนึ่งอย่าง แตะซ้ำเพื่อเอาออก</small>
      </div>
      <div className="dm-field"><span>ประวัติห้อง</span>
        <label className="dm-check">
          <input type="checkbox" checked={f.include_closed === '1'} onChange={(e) => set('include_closed', e.target.checked ? '1' : '')} />
          <span>รวมห้องที่ออกไปแล้ว (ไว้เทียบราคา)</span>
        </label>
      </div>
    </div>
  );
};

// Old OpenChat ads that match the zone, kind and budget filters: a separate, quiet price record under the
// live results, never mixed into them or their count. Hidden when nothing matches.
const OFFER_KINDS = 'room,mate_wanted,transfer,short_term';
const RoomsArchive = ({ f }) => {
  const [d, setD] = useState(null);
  const qs = new URLSearchParams(Object.entries({ zone: f.zone, kind: f.kind || OFFER_KINDS, max_price: f.max_price, min_price: f.min_price })
    .filter(([, v]) => v)).toString();
  useEffect(() => {
    const ctl = new AbortController();
    axios.get(`${API}/chat-posts?${qs}`, { params: { limit: 200 }, signal: ctl.signal })
      .then((r) => setD({ qs, ...r.data })).catch((e) => { if (!axios.isCancel(e)) setD(null); });
    return () => ctl.abort();
  }, [qs]);
  // lead with the newest real chat posts; older ones are visibly muted
  const rows = d ? informativeRows(d.items) : [];
  if (!d || !rows.length) return null;
  const total = d.total - (d.items.length - rows.length);
  return (
    <ChatArchive key={d.qs} className={d.qs !== qs ? 'is-stale' : ''} title="ความเคลื่อนไหวจากกลุ่ม OpenChat" items={rows} total={total} show={8} zoneLink
                 sub={`${total} ประกาศจริง${f.zone || f.kind || f.max_price || f.min_price ? 'ที่ตรงกับที่เลือก' : ''} ช่วง ${periodTh(d.period)} · โพสต์เก่ากว่า 90 วันแสดงสีเทา`} note={ARCHIVE_NOTE}>
      <ArchiveActions />
    </ChatArchive>
  );
};

// One toggle chip in the quick strip (writes straight to the URL).
// dup: the same filter is in the desktop sidebar, so the chip is hidden there (>=1024px).
const Quick = ({ on, onClick, children, label, dup = false, className = '' }) => (
  <button type="button" className={`dm-chip ${dup ? 'dm-dup' : ''} ${on ? 'on' : ''} ${className}`} aria-pressed={on} onClick={onClick} aria-label={label}>{children}</button>
);

export default function DormRoomsPage() {
  const meta = useDormMeta();
  const { token } = useAuth();
  const navType = useNavigationType();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const f = Object.fromEntries(FIELDS.map((k) => [k, params.get(k) || '']));
  const apiQs = FIELDS.filter((k) => f[k]).map((k) => `${k}=${encodeURIComponent(f[k])}`).join('&');
  const [data, setData] = useState(() => (lastList && lastList.qs === apiQs ? lastList.data : null));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef(null);
  const quickRef = useEdgeFade();
  const kindsRef = useEdgeFade();
  const qsRef = useRef(apiQs);
  qsRef.current = apiQs;

  useEffect(() => { rememberRooms(apiQs); }, [apiQs]);
  useEffect(() => {
    setLoading(true); setErr(false);
    // abort the previous request so a slow, older response can't overwrite newer filters;
    // the old cards stay on screen (dimmed) until the new ones land, so nothing jumps
    const ctl = new AbortController();
    // signed in: the cards also say which rooms you pressed interest on
    // the whole result set (a few hundred at most), so look-alike rooms group honestly and none is cut off
    const q = Object.fromEntries(new URLSearchParams(apiQs));
    axios.get(`${API}/listings`, { params: { ...q, sort: q.sort || 'recommended', limit: 300 }, ...authHeaders(token), signal: ctl.signal })
      .then((r) => { lastList = { qs: apiQs, data: r.data }; setData(r.data); setLoading(false); })
      .catch((e) => { if (!axios.isCancel(e)) { setErr(true); setLoading(false); } });
    return () => ctl.abort();
  }, [apiQs, retry, token]);

  // Remember where the list was when a room is opened (saved at the click: by unmount time the page
  // may already be hidden behind a loading fallback), and return there on back/forward.
  const keepSpot = (e) => {
    if (!e.target.closest('a[href]')) return;
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ qs: qsRef.current, y: window.scrollY })); } catch { /* storage blocked */ }
  };
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !data) return;
    restored.current = true;
    if (navType !== 'POP') return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); } catch { /* ignore */ }
    if (!saved || saved.qs !== apiQs || !saved.y) return;
    // After the shell's scroll-to-top for the route change. The page may still be too short to reach the
    // spot (images, the archive below the list still loading), so keep trying for up to 2.5s until the
    // spot is reached; stop as soon as the reader scrolls themselves. Not cancelled on cleanup: runs once.
    const until = Date.now() + 2500;
    let stop = false;
    const quit = () => { stop = true; };
    const opts = { once: true, passive: true };
    window.addEventListener('wheel', quit, opts);
    window.addEventListener('touchstart', quit, opts);
    window.addEventListener('keydown', quit, { once: true });
    const done = () => { window.removeEventListener('wheel', quit); window.removeEventListener('touchstart', quit); window.removeEventListener('keydown', quit); };
    const tick = () => {
      if (stop) { done(); return; }
      window.scrollTo(0, saved.y);
      if (Math.abs(window.scrollY - saved.y) > 2 && Date.now() < until) setTimeout(tick, 60);
      else done();
    };
    setTimeout(tick, 0);
  }, [data, navType, apiQs]);

  // soft shadow under the sticky strip once it is stuck under the top bar
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: '-57px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Start from the live URL, not the rendered `params`: router navigations render in a
  // transition, so a second quick chip tap would still see the old params and drop the first.
  const setMany = (obj) => {
    const n = new URLSearchParams(window.location.search);
    Object.entries(obj).forEach(([k, v]) => (v || v === 0 ? n.set(k, v) : n.delete(k)));
    setParams(n, { replace: true });
  };
  const set = (k, v) => setMany({ [k]: v });
  const flip = (k, v) => set(k, live()[k] === v ? '' : v);

  const items = data ? data.items : null;
  const total = data ? data.total : null;
  const extTotal = data?.external_total || 0;
  const waitingTotal = data?.waiting_total || 0;
  const peekedTotal = data?.peeked_total || 0;
  const archivedTotal = data?.archived_total || 0;
  const closedTotal = data?.closed_total || 0;
  const preset = presetFromRange(f.min_price, f.max_price);

  const budgetLabel = f.min_price && f.max_price ? `${baht(f.min_price)}–${baht(f.max_price)} ฿/คน`
    : f.max_price ? `ไม่เกิน ${baht(f.max_price)} ฿/คน` : f.min_price ? `ตั้งแต่ ${baht(f.min_price)} ฿/คน` : '';
  // zone, budget and the rarer filters get a removable chip under the strip (the budget too, preset or not:
  // on desktop the preset chips are hidden and the slider alone doesn't say it is filtering)
  const extra = [
    f.zone && { k: ['zone'], label: zoneShort(labelOf(meta?.zones, f.zone)) },
    (f.min_price || f.max_price) && { k: ['min_price', 'max_price'], label: `งบ ${budgetLabel}` },
    f.amenity && f.amenity !== 'walk_swu' && { k: ['amenity'], label: labelOf(meta?.amenities, f.amenity) },
    f.q && { k: ['q'], label: `“${f.q}”` },
    f.include_closed === '1' && { k: ['include_closed'], label: 'รวมห้องที่ออกไปแล้ว' },
  ].filter(Boolean);
  const nActive = ['zone', 'gender', 'amenity', 'q', 'interested', 'engaged', 'include_closed'].filter((k) => f[k]).length + (f.min_price || f.max_price ? 1 : 0);
  // keeps the kind tab and the sort; drops every filter
  const clearAll = () => {
    const c = live();
    setParams(new URLSearchParams(Object.fromEntries(['kind', 'sort'].filter((k) => c[k]).map((k) => [k, c[k]]))), { replace: true });
  };

  const kinds = [{ id: 'all', label: 'ทั้งหมด' }, ...(meta?.kinds || []).map((k) => ({ id: k.id, label: k.label.split(' / ')[0] }))];

  let list;
  if (err && !items) {
    list = (
      <Empty title="โหลดรายการห้องไม่สำเร็จ" art={`${ART}/empty-saved.svg`}
             action={<button type="button" className="dm-btn dm-btn-tint" onClick={() => setRetry((n) => n + 1)}><RotateCw size={17} aria-hidden="true" />ลองอีกครั้ง</button>}>
        เน็ตอาจหลุดไปแป๊บหนึ่ง ลองโหลดใหม่ได้เลย
      </Empty>
    );
  } else if (!items) {
    list = <SkeletonGrid n={4} className="dm-grid three dm-rooms-grid" list />;
  } else if (items.length) {
    list = (
      <div className={`dm-grid three dm-rooms-grid ${items.length <= 4 ? 'is-few' : ''} ${loading ? 'is-stale' : ''}`} aria-busy={loading}>
        {groupLookalikes(items).map((e, i) => (
          <ListingOrGroup key={e.group ? `g-${e.group.key}` : e.x.id} e={e} list i={Math.min(i, 6)} eager={i < 2} budgetMax={f.max_price} />
        ))}
      </div>
    );
  } else {
    const onlyWait = f.interested === '1' && nActive === 1;
    list = (
      <Empty title={onlyWait ? 'ยังไม่มีห้องที่มีคนรอหาร' : nActive ? 'ยังไม่มีห้องตรงเงื่อนไขนี้' : 'ยังไม่มีห้องในหมวดนี้'} art={`${ART}/cover-room-2.svg`}
             className={loading ? 'is-stale' : ''}
             action={nActive ? <button type="button" className="dm-btn dm-btn-tint" onClick={clearAll}>{onlyWait ? 'ดูห้องทั้งหมดเพื่อเลือกห้องแรก' : 'ล้างตัวกรอง'}</button>
               : <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-tint">สร้างโปรไฟล์หาเมทไว้ก่อน</Link>}>
        {onlyWait ? 'กดปุ่ม ‘สนใจ หาเมทห้องนี้’ ที่ห้องที่ชอบ เป็นคนแรกให้คนอื่นมาเจอและทักหารด้วยกันได้เลย' : nActive ? 'ลองเพิ่มงบ หรือเอาบางตัวกรองออก' : 'สร้างโปรไฟล์หาเมทไว้ ให้คนที่มีห้องทักมาหาคุณเอง'}
      </Empty>
    );
  }

  return (
    <DormLayout title="ห้องว่าง">
      <PageHead title="ห้องว่าง" action={<RoomsSwitch current="rooms" zone={f.zone} />} className="dm-rooms-head" />

      <div className="dm-rooms" onClickCapture={keepSpot}>
        <aside className="dm-rail-filters" aria-label="ตัวกรอง">
          <div className="dm-rail-filters-head">
            <b>ตัวกรอง</b>
            {nActive > 0 && <button type="button" className="dm-textbtn" onClick={clearAll}>ล้างทั้งหมด</button>}
          </div>
          <Filters f={f} set={set} setMany={setMany} meta={meta} />
        </aside>

        <div style={{ minWidth: 0 }}>
          <div ref={sentinel} className="dm-strip-sentinel" aria-hidden="true" />
          <div className={`dm-strip ${stuck ? 'is-stuck' : ''}`}>
            <div ref={kindsRef} className="dm-kinds dm-fade-x">
              <Seg value={f.kind || 'all'} onChange={(v) => set('kind', v === 'all' ? '' : v)} label="ประเภทประกาศ" options={kinds} />
            </div>
            <div ref={quickRef} className="dm-chiprow wrap-desk dm-quick dm-fade-x" role="group" aria-label="ตัวกรองด่วน">
              <button type="button" className={`dm-chip dm-filter-btn ${nActive ? 'on' : ''}`} onClick={() => setSheet(true)}
                      aria-label={`ตัวกรองทั้งหมด${nActive ? ` เลือกอยู่ ${nActive}` : ''}`}>
                <SlidersHorizontal size={15} aria-hidden="true" />ตัวกรอง{nActive > 0 && <span className="dm-badge-n">{nActive}</span>}
              </button>
              <Quick on={f.interested === '1'} onClick={() => setMany({ interested: live().interested === '1' ? '' : '1', engaged: '' })}
                     className={waitingTotal > 0 && f.interested !== '1' ? 'has-wait-chip' : ''} label="ห้องที่มีคนกดสนใจ รอหาเมท">
                <HandHeart size={15} aria-hidden="true" />มีคนรอหาร{waitingTotal > 0 && <span className="dm-wait-n">{waitingTotal}</span>}
              </Quick>
              {(peekedTotal > 0 || f.engaged === '1') && (
                <Quick on={f.engaged === '1'} onClick={() => setMany({ engaged: live().engaged === '1' ? '' : '1', interested: '' })}
                       className={peekedTotal > 0 && f.engaged !== '1' ? 'has-peek-chip' : ''} label="ห้องที่มีคนรอหารหรือกดหัวใจเล็งไว้">
                  <Eye size={15} aria-hidden="true" />มีคนเล็งอยู่{peekedTotal > 0 && <span className="dm-peek-n">{peekedTotal}</span>}
                </Quick>
              )}
              {(archivedTotal > 0 || f.include_closed === '1') && (
                <Quick on={f.include_closed === '1'} onClick={() => flip('include_closed', '1')}
                       className="dm-arch-chip" label="รวมห้องที่ออกไปแล้วเพื่อเช็กราคาอ้างอิง">
                  <History size={15} aria-hidden="true" />รวมห้องที่ออกไปแล้ว{archivedTotal > 0 && f.include_closed !== '1' && <span className="dm-arch-n">{archivedTotal}</span>}
                </Quick>
              )}
              <Quick dup on={f.amenity === 'walk_swu'} onClick={() => flip('amenity', 'walk_swu')}>
                <Footprints size={15} aria-hidden="true" />เดินถึง มศว
              </Quick>
              <Quick dup on={f.gender === 'female'} onClick={() => flip('gender', 'female')}>ผู้หญิงอยู่ได้</Quick>
              <Quick dup on={f.gender === 'male'} onClick={() => flip('gender', 'male')}>ผู้ชายอยู่ได้</Quick>
              {QUICK_BUDGETS.map((b) => {
                const on = preset?.id === b.id;
                return (
                  <Quick dup key={b.id} on={on} label={`งบ ${b.label} บาทต่อคนต่อเดือน`}
                         onClick={() => {
                           const c = live();
                           const isOn = presetFromRange(c.min_price, c.max_price)?.id === b.id;
                           setMany(isOn ? { min_price: '', max_price: '' } : { min_price: b.min || '', max_price: b.max || '' });
                         }}>
                    {b.label}
                  </Quick>
                );
              })}
              <span className="dm-quick-sep" aria-hidden="true" />
              {SORTS.map((s) => (
                <Quick key={s.id} on={f.sort === s.id} onClick={() => flip('sort', s.id)} label={`เรียงแบบ${s.label}`}>
                  <ArrowDownUp size={14} aria-hidden="true" />{s.label}
                </Quick>
              ))}
            </div>
          </div>

          <div className="dm-countline">
            <span className="dm-count" aria-live="polite">
              {total != null ? (
                <Swap k={`${total}-${extTotal}-${apiQs}`}>
                  <b>{total}</b> ห้อง{extTotal > 0 && <span className="dm-count-ext" title="ข้อมูลจากประกาศสาธารณะบนเว็บอื่น ยืนยันที่เว็บต้นทาง">{extTotal === total ? ' ทั้งหมดจากเว็บภายนอก' : ` จากเว็บภายนอก ${extTotal}`}</span>}{closedTotal > 0 && <span className="dm-count-ext"> · ออกไปแล้ว {closedTotal} ห้อง</span>}
                </Swap>
              ) : <span className="dm-muted">กำลังหาห้อง</span>}
              {loading && items && <i className="dm-spin" aria-hidden="true" />}
            </span>
            {nActive > 0 && <button type="button" className="dm-textbtn dm-clear" onClick={clearAll}>ล้างตัวกรอง</button>}
          </div>
          {extra.length > 0 && (
            <div className="dm-active dm-rooms-active">
              {extra.map((c) => (
                <button type="button" key={c.k[0]} className="dm-chipx" onClick={() => setMany(Object.fromEntries(c.k.map((k) => [k, ''])))}
                        aria-label={`เอาตัวกรอง ${c.label} ออก`}>
                  {c.label}<X size={15} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {list}
          <RoomsArchive f={f} />
        </div>
      </div>

      {sheet && (
        <Sheet title="ตัวกรอง" onClose={() => setSheet(false)}
               footer={(
                 <>
                   <button type="button" className="dm-btn dm-btn-quiet" onClick={clearAll}>ล้างทั้งหมด</button>
                   <button type="button" className="dm-btn dm-btn-ink" onClick={() => setSheet(false)}>
                     {total != null ? <Swap k={total}>ดู {total} ห้อง</Swap> : 'ดูผลลัพธ์'}
                   </button>
                 </>
               )}>
          <Filters f={f} set={set} setMany={setMany} meta={meta} />
        </Sheet>
      )}
    </DormLayout>
  );
}

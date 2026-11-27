import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BadgeCheck, Eye, EyeOff, HandCoins, HandHeart, History, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, {
  Avatar, Band, BuildingCard, ChipRow, ListingCard, ListingOrGroup, Note, Rail, Seg, Skeleton, SkeletonBuildingCard, SkeletonCard, Swap,
  modeIcon, modeLabel, periodTh, zoneShort,
} from './DormLayout';
import { API, BUDGET_PRESETS, authHeaders, baht, budgetPreset, groupLookalikes, perPersonOf, splitDemo, useBuildings, useDormMeta, useMediaQuery, zoneMinutes } from './dormApi';
import { campusOf, canonicalUrl, homeJsonLd } from './dormSeo';

const ART = '/dorm/illustrations';
const PATHS = [
  { to: '/dorm/me?tab=mate', label: 'ยังไม่มีห้อง อยากหาเมท' },
  { to: '/dorm/post?kind=mate_wanted', label: 'มีห้องแล้ว หาคนหาร' },
  { to: '/dorm/post?kind=transfer', label: 'ส่งต่อสัญญา' },
];
const ZONE_TINTS = ['var(--tint-mint)', 'var(--tint-sky)', 'var(--tint-sun)', 'var(--tint-rose)', 'var(--tint-lilac)', 'var(--khlong-tint)'];
const hideBroken = (e) => { e.currentTarget.style.visibility = 'hidden'; };

const inBudget = (v, p) => {
  if (!p.min && !p.max) return true;
  if (!v) return false;
  return (!p.min || v >= p.min) && (!p.max || v <= p.max);
};

// The living scene: city pinned to the hero bottom, two clouds drifting, a boat gliding on the khlong.
const Scene = () => (
  <div className="dm-scene" aria-hidden="true">
    <i className="dm-sun" />
    <div className="dm-cloud-lane l1"><img className="dm-cloud c1" src={`${ART}/hero-cloud.svg`} alt="" onError={hideBroken} /></div>
    <div className="dm-cloud-lane l2"><img className="dm-cloud c2" src={`${ART}/hero-cloud.svg`} alt="" onError={hideBroken} /></div>
    <img className="dm-scene-city" src={`${ART}/hero-city.svg`} alt="" fetchPriority="high" onError={hideBroken} />
    <div className="dm-boat-lane"><img className="dm-boat" src={`${ART}/hero-boat.svg`} alt="" onError={hideBroken} /></div>
  </div>
);

export default function DormHomePage() {
  const meta = useDormMeta();
  const navigate = useNavigate();
  const buildings = useBuildings();
  const desk = useMediaQuery('(min-width: 1024px)');
  const [stats, setStats] = useState(null);
  const [chat, setChat] = useState(null);
  const [listings, setListings] = useState(null);
  const [mates, setMates] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const { token } = useAuth();
  // signed in with a mate profile: the mates band offers editing it, not creating one
  useEffect(() => {
    if (!token) { setHasProfile(false); return; }
    axios.get(`${API}/mates/me`, authHeaders(token)).then((r) => setHasProfile(!!r.data.profile)).catch(() => setHasProfile(false));
  }, [token]);
  const [mode, setMode] = useState('rooms');
  const [zone, setZone] = useState('');
  const [budget, setBudget] = useState('');

  useEffect(() => {
    axios.get(`${API}/stats`).then((r) => { setStats(r.data.live); setChat(r.data.chat || null); }).catch(() => setStats(null));
    axios.get(`${API}/mates`, { params: { limit: 200, sort: 'new' } }).then((r) => setMates(r.data.items)).catch(() => setMates([]));
  }, []);
  // one fetch feeds the rail, waiting/peeked sections, per-zone counts, and live search count (refetches on token change for my_interest)
  useEffect(() => {
    axios.get(`${API}/listings`, { params: { limit: 300, sort: 'recommended' }, ...authHeaders(token) })
      .then((r) => setListings(r.data.items)).catch(() => setListings([]));
  }, [token]);

  const zoneList = useMemo(() => (meta?.zones || []).filter((z) => z.id !== 'other'), [meta]);
  // the tiles cover every room: "อื่นๆ" gets a tile too when it has rooms, so the tiles add up to the total
  const otherRooms = (listings || []).some((x) => x.zone === 'other');
  const tileZones = useMemo(() => (otherRooms ? (meta?.zones || []) : zoneList), [otherRooms, meta, zoneList]);
  const zones = useMemo(() => tileZones.map((z) => {
    const fastest = (buildings || []).filter((b) => b.zone === z.id && b.minutes_to_swu).sort((a, b) => a.minutes_to_swu - b.minutes_to_swu)[0];
    const rooms = (listings || []).filter((x) => x.zone === z.id).length;
    const t = fastest ? { minutes: fastest.minutes_to_swu, mode: fastest.travel_mode, guess: false }
      : { ...(zoneMinutes(buildings, z.id) || {}), guess: true };
    // per-person prices seen in the OpenChat archive: the middle half from 5 ads (nearest-rank, so both ends
    // were real ads), the plain lowest–highest from 2 to 4, nothing for a single ad
    const pp = chat?.by_zone?.[z.id]?.per_person;
    const seen = !pp || pp.n < 2 ? null : pp.n >= 5 ? { lo: pp.p25, hi: pp.p75, n: pp.n, mid: true } : { lo: pp.min, hi: pp.max, n: pp.n, mid: false };
    return { ...z, rooms, t, seen };
  }), [tileZones, buildings, listings, chat]);

  const preset = budgetPreset(budget);
  const filtered = !!(zone || budget);
  const roomCount = listings ? listings.filter((x) => (!zone || x.zone === zone) && inBudget(perPersonOf(x), preset)).length : null;
  const mateCount = mates ? mates.filter((m) => (!zone || !(m.zones || []).length || m.zones.includes(zone))
    && (!preset.max || (m.budget_min != null && m.budget_min <= preset.max))).length : null;
  const totalRooms = stats?.listings ?? listings?.length ?? 0;
  const totalMates = stats?.mates ?? mates?.length ?? 0;

  let go;
  let goAll = false;
  if (mode === 'rooms') {
    if (roomCount == null) go = 'ดูห้อง';
    else if (filtered && roomCount) go = `ดู ${roomCount} ห้อง`;
    else if (filtered) { go = 'ยังไม่มีห้องตรงนี้ ดูทั้งหมด'; goAll = true; }
    else go = totalRooms ? `ดูทั้งหมด ${totalRooms} ห้อง` : 'ดูห้องทั้งหมด';
  } else if (mateCount == null) go = 'ดูคนหาเมท';
  else if (filtered && mateCount) go = `ดู ${mateCount} คนหาเมท`;
  else if (filtered) { go = 'ยังไม่มีเมทตรงนี้ ดูทั้งหมด'; goAll = true; }
  else go = totalMates ? `ดูทั้งหมด ${totalMates} คน` : 'ดูคนหาเมท';

  const search = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (!goAll) {
      if (zone) p.set('zone', zone);
      if (mode === 'rooms') {
        if (preset.min) p.set('min_price', preset.min);
        if (preset.max) p.set('max_price', preset.max);
      } else if (preset.max) p.set('budget', preset.max);
    }
    const qs = p.toString();
    navigate(`/dorm/${mode === 'rooms' ? 'rooms' : 'mates'}${qs ? `?${qs}` : ''}`);
  };

  const live = stats ? (() => {
    const n = stats.listings || 0;
    const m = stats.mates || 0;
    const w = stats.waiting || 0;
    const pk = stats.peeking || 0;
    const waitLink = w > 0 && pk > 0 ? (
      <> · <a href="#dm-wait-h" className="dm-live-wait" onClick={(e) => { e.preventDefault(); (document.getElementById('dm-wait-h') || document.getElementById('dm-engaged-h'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{w} ห้องรอหาร · {pk} ห้องมีคนเล็ง</a></>
    ) : w > 0 ? (
      <> · <a href="#dm-wait-h" className="dm-live-wait" onClick={(e) => { e.preventDefault(); (document.getElementById('dm-wait-h') || document.getElementById('dm-engaged-h'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{w} ห้องมีคนรอหาร</a></>
    ) : pk > 0 ? (
      <> · <a href="#dm-wait-h" className="dm-live-wait" onClick={(e) => { e.preventDefault(); (document.getElementById('dm-wait-h') || document.getElementById('dm-engaged-h'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{pk} ห้องมีคนเล็งอยู่</a></>
    ) : null;
    if (n && m) return <>ตอนนี้มี <b>{n}</b> ห้องให้ดู, <b>{m}</b> คนกำลังหาเมท{waitLink}</>;
    if (n) return <>ตอนนี้มี <b>{n}</b> ห้องให้ดู{waitLink}</>;
    if (m) return <>ตอนนี้ <b>{m}</b> คนกำลังหาเมท</>;
    return <>เปิดรับประกาศแรกอยู่ ลงฟรี</>;
  })() : null;

  // The rail under the search card follows the chips live (client-side, same feed as the counts).
  const matched = listings ? listings.filter((x) => (!zone || x.zone === zone) && inBudget(perPersonOf(x), preset)) : null;
  const engagedRooms = useMemo(() => {
    const src = matched || [];
    return src.filter((x) => (x.interest_people || 0) > 0 || (x.peek_count || 0) > 0)
      .slice()
      .sort((a, b) => Number((b.interest_people || 0) > 0) - Number((a.interest_people || 0) > 0)
        || (b.interest_people || 0) - (a.interest_people || 0)
        || (b.peek_count || 0) - (a.peek_count || 0));
  }, [matched]);
  const latest = matched ? groupLookalikes(matched).slice(0, 8) : null;
  const noListings = listings !== null && listings.length === 0;
  const railTitle = <Swap k={filtered ? `m${matched?.length}` : 'new'}>{filtered ? `ตรงกับที่เลือก ${matched?.length ?? ''} ห้อง` : 'ห้องแนะนำ'}</Swap>;
  const railLabel = filtered ? `ห้องที่ตรงกับที่เลือก ${matched?.length ?? ''} ห้อง` : 'ห้องแนะนำ';
  const railLink = <Link to={filtered && matched?.length ? `/dorm/rooms?${new URLSearchParams({ ...(zone && { zone }), ...(preset.min && { min_price: preset.min }), ...(preset.max && { max_price: preset.max }) })}` : '/dorm/rooms'}>ดูทั้งหมด</Link>;
  const clearPick = () => { setZone(''); setBudget(''); };
  const nearB = useMemo(() => (buildings || []).filter((b) => b.minutes_to_swu)
    .sort((a, b) => a.minutes_to_swu - b.minutes_to_swu || (b.active_listings || 0) - (a.active_listings || 0)).slice(0, 8), [buildings]);

  /* ---------------- sections */
  const newRooms = latest === null ? (
    <section className="dm-sec" aria-busy="true" aria-label="กำลังโหลดห้องแนะนำ">
      <div className="dm-sec-head"><h2>ห้องแนะนำ</h2></div>
      {desk ? <div className="dm-grid four"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div> : (
        <div className="dm-rail-view"><div className="dm-rail-track">
          <div className="dm-rail-slide"><SkeletonCard /></div><div className="dm-rail-slide"><SkeletonCard /></div>
        </div></div>
      )}
    </section>
  ) : noListings ? (
    <Band tone="sun" className="dm-sec dm-firstband" art={`${ART}/cta-post.svg`} title="ยังไม่มีประกาศ มาเป็นห้องแรกกัน"
          text="ลงฟรี แสดง 30 วัน และได้ขึ้นสรุปประจำสัปดาห์ในกลุ่ม OpenChat"
          actions={<Link to="/dorm/post" className="dm-btn dm-btn-primary">ลงประกาศฟรี</Link>} />
  ) : !latest.length ? (
    <section className="dm-sec" aria-label="ห้องที่ตรงกับที่เลือก">
      <div className="dm-sec-head"><h2>{railTitle}</h2></div>
      <p className="dm-rail-empty dm-swap" role="status">
        <span>ยังไม่มีห้องตรงกับโซนและงบที่เลือก</span>
        <span className="dm-rail-empty-acts">
          <Link to="/dorm/rooms">ดูทุกห้อง</Link>
          <button type="button" className="dm-textbtn" onClick={clearPick}>ล้างที่เลือก</button>
        </span>
      </p>
    </section>
  ) : desk ? (
    <section className="dm-sec" aria-label={railLabel}>
      <div className="dm-sec-head"><h2>{railTitle}</h2>{railLink}</div>
      <div className="dm-grid four">{latest.map((e, i) => <ListingOrGroup key={e.group ? `g-${e.group.key}` : e.x.id} e={e} i={i} budgetMax={preset.max} />)}</div>
    </section>
  ) : (
    <Rail title={railTitle} label={railLabel} link={railLink}>
      {latest.map((e, i) => <ListingOrGroup key={e.group ? `g-${e.group.key}` : e.x.id} e={e} i={i} eager={i < 2} budgetMax={preset.max} />)}
    </Rail>
  );

  const tierLegend = (
    <div className="dm-tier-legend">
      <span><span className="dm-pill wait"><HandHeart size={11} aria-hidden="true" />รอหาร</span>สนใจจริงจัง (ล็อกอิน · ทักคุยได้)</span>
      <span><span className="dm-pill peek on-paper"><Eye size={11} aria-hidden="true" />เล็งอยู่</span>สนใจนิดๆ (กด ♥ ไม่ต้องล็อกอิน)</span>
    </div>
  );

  // Surface waiting rooms ("รอหาร") immediately followed by peeked rooms ("เล็งอยู่") to nudge peekers into sharing.
  const waitOnlyN = engagedRooms.filter((x) => (x.interest_people || 0) > 0).length;
  const peekOnlyN = engagedRooms.length - waitOnlyN;
  const waitTitle = !engagedRooms.length ? ''
    : waitOnlyN > 0 && peekOnlyN > 0 ? `ห้องที่มีคนรอหารและเล็งอยู่ ${engagedRooms.length} ห้อง`
      : waitOnlyN > 0 ? `ห้องที่มีคนรอหาร ${waitOnlyN} ห้อง` : `ห้องที่มีคนเล็งอยู่ ${peekOnlyN} ห้อง`;
  const waitLink = <Link to={peekOnlyN > 0 ? '/dorm/rooms?engaged=1&sort=interest' : '/dorm/rooms?interested=1&sort=interest'} data-testid="dorm-home-wait-all">ดูทั้งหมด</Link>;
  const waitSec = !engagedRooms.length ? null : desk ? (
    <section className="dm-sec dm-waitsec" aria-labelledby="dm-wait-h" data-testid="dorm-home-wait-rooms">
      <div className="dm-sec-head"><h2 id="dm-wait-h">{waitTitle}</h2>{waitLink}</div>
      {tierLegend}
      <div className="dm-grid four">{engagedRooms.slice(0, 8).map((x, i) => <ListingCard key={x.id} x={x} i={i} budgetMax={preset.max} />)}</div>
    </section>
  ) : (
    <Rail title={waitTitle} label={waitTitle} sub={tierLegend} testid="dorm-home-wait-rooms" className="dm-waitsec" link={waitLink}>
      {engagedRooms.slice(0, 12).map((x, i) => <ListingCard key={x.id} x={x} i={i} budgetMax={preset.max} />)}
    </Rail>
  );

  const zoneSec = (
    <section className="dm-sec" aria-labelledby="dm-zones-h">
      <div className="dm-sec-head"><h2 id="dm-zones-h">เลือกตามโซน</h2></div>
      <div className="dm-zgrid">
        {(zones.length ? zones : [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: `s${i}`, skel: true }))).map((z, i) => {
          if (z.skel) return <div key={z.id} className="dm-zcard" style={{ '--zt': '#fff', minHeight: 116 }} aria-hidden="true"><Skeleton w="60%" h={15} /><Skeleton w="50%" h={30} style={{ marginTop: 6 }} /></div>;
          const I = modeIcon(z.t.mode);
          return (
            <Link key={z.id} to={`/dorm/rooms?zone=${z.id}`} className="dm-zcard dm-press dm-lift" style={{ '--zt': ZONE_TINTS[i % ZONE_TINTS.length] }}
                  aria-label={`โซน ${zoneShort(z.label)}${z.t.minutes ? ` ประมาณ ${z.t.minutes} นาทีถึง มศว` : ''}${listings ? (z.rooms ? ` มี ${z.rooms} ห้อง` : ' ยังไม่มีห้อง') : ''}${z.seen ? ` ในแชทเคยเห็น ${baht(z.seen.lo)} ถึง ${baht(z.seen.hi)} บาทต่อคน` : ''}`}>
              <span className="dm-zcard-name">{zoneShort(z.label)}</span>
              {z.t.minutes ? (
                <>
                  <span className="dm-zcard-min" title={z.t.guess ? 'ประมาณจากโซน' : 'ตึกที่ใกล้ที่สุดในโซน เป็นค่าประมาณ'}>~{z.t.minutes}<small>นาที</small></span>
                  <span className="dm-zcard-mode"><I size={14} aria-hidden="true" />{modeLabel(z.t.mode)}{z.t.guess ? ' (ประมาณ)' : ''}</span>
                </>
              ) : <span className="dm-zcard-mode">ยังไม่มีข้อมูลเวลาเดินทาง</span>}
              {z.seen && (
                <span className="dm-zcard-seen" title={z.seen.mid ? `ช่วงกลางของราคาต่อคนจาก ${z.seen.n} ประกาศเก่าในกลุ่ม OpenChat` : `ต่ำสุดถึงสูงสุดของราคาต่อคนจาก ${z.seen.n} ประกาศเก่าในกลุ่ม OpenChat`}>
                  เคยเห็น <span className="dm-nowrap">{z.seen.lo === z.seen.hi ? baht(z.seen.lo) : `${baht(z.seen.lo)}–${baht(z.seen.hi)}`} ฿/คน</span>
                </span>
              )}
              {listings ? <span className={`dm-zcard-avail ${z.rooms ? '' : 'none'}`}>{z.rooms ? `มี ${z.rooms} ห้อง` : 'ยังไม่มีห้อง'}</span>
                : <span className="dm-zcard-avail none">&nbsp;</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );

  const mateSec = mates === null ? (
    <div className="dm-sec dm-band mint" style={{ minHeight: 200 }} aria-busy="true" aria-label="กำลังโหลด" />
  ) : mates.length ? (
    <Band tone="mint" className="dm-sec dm-mateband has-stack"
          lead={(
            <div className="dm-stack dm-mateband-stack" aria-hidden="true">
              {mates.slice(0, 5).map((m) => <Avatar key={m.id} name={splitDemo(m.display_name).title} size={44} />)}
            </div>
          )}
          title={`${totalMates} คนกำลังหาเมทอยู่`}
          text={stats?.mates_without_room ? `${stats.mates_without_room} คนยังไม่มีห้อง อยากหาห้องด้วยกัน` : 'ดูงบ โซน และนิสัยการอยู่ แล้วทักคุยในเว็บได้เลย'}
          actions={(
            <>
              <Link to="/dorm/mates" className="dm-btn dm-btn-quiet">ดูคนหาเมท</Link>
              <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-ink">{hasProfile ? 'โปรไฟล์ของฉัน' : 'สร้างโปรไฟล์ 2 นาที'}</Link>
            </>
          )} />
  ) : (
    <Band tone="mint" className="dm-sec dm-mateband" art={`${ART}/empty-mates.svg`} title="เป็นคนแรกที่ประกาศหาเมท"
          text="บอกงบ โซน กับนิสัยการอยู่ แล้วรอคนที่เข้ากันทักมา"
          actions={<Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-ink">สร้างโปรไฟล์ 2 นาที</Link>} />
  );

  const bCards = nearB.map((b, i) => <BuildingCard key={b.slug} b={b} i={desk ? i : undefined} />);
  const buildingSec = buildings === null ? (
    <section className="dm-sec" aria-busy="true" aria-label="กำลังโหลดตึก">
      <div className="dm-sec-head"><h2>ตึกใกล้ มศว</h2></div>
      <div className="dm-bgrid"><SkeletonBuildingCard /><SkeletonBuildingCard /><SkeletonBuildingCard /><SkeletonBuildingCard /></div>
    </section>
  ) : !nearB.length ? null : desk ? (
    <section className="dm-sec">
      <div className="dm-sec-head"><h2>ตึกใกล้ มศว</h2><Link to="/dorm/buildings">ดูทุกตึก</Link></div>
      <div className="dm-bgrid">{bCards}</div>
    </section>
  ) : (
    <Rail title="ตึกใกล้ มศว" label="ตึกใกล้ มศว" size="sm" link={<Link to="/dorm/buildings">ดูทุกตึก</Link>}>{bCards}</Rail>
  );

  const mateRoomsTitle = `ห้องที่มีคนสนใจหาเมทและเล็งอยู่${engagedRooms.length > 0 ? ` (${engagedRooms.length})` : ''}`;
  const mateRoomsLink = <Link to="/dorm/rooms?engaged=1&sort=interest">ดูห้องทั้งหมด</Link>;
  const mateRoomsSec = mode !== 'mates' ? null : !desk && listings !== null && engagedRooms.length > 0 ? (
    <Rail title={mateRoomsTitle} label={mateRoomsTitle} sub={tierLegend} testid="dorm-home-mate-rooms" className="dm-waitsec" link={mateRoomsLink}>
      {engagedRooms.slice(0, 12).map((x, i) => <ListingCard key={x.id} x={x} i={i} budgetMax={preset.max} />)}
    </Rail>
  ) : (
    <section className="dm-sec dm-waitsec" aria-labelledby="dm-engaged-h" data-testid="dorm-home-mate-rooms">
      <div className="dm-sec-head">
        <h2 id="dm-engaged-h">{mateRoomsTitle}</h2>
        {mateRoomsLink}
      </div>
      {tierLegend}
      {listings === null ? (
        <div className="dm-grid four"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      ) : engagedRooms.length > 0 ? (
        <div className="dm-grid four">{engagedRooms.slice(0, 8).map((x, i) => <ListingCard key={x.id} x={x} i={i} budgetMax={preset.max} />)}</div>
      ) : (
        <p className="dm-rail-empty dm-swap" role="status">
          <span>ยังไม่มีคนกดเล็งห้องในโซนและงบนี้ — แตะ ♥ ที่ห้องที่ชอบ (ไม่ต้องล็อกอิน) หรือกด “สนใจ หาเมทห้องนี้” เพื่อเริ่มเป็นคนแรก</span>
          <span className="dm-rail-empty-acts">
            <Link to="/dorm/rooms">ดูห้องว่างทั้งหมด</Link>
          </span>
        </p>
      )}
    </section>
  );

  const camp = campusOf(meta);
  const homeTitle = `หอพักรอบ ${camp.name_th} · หาห้อง หาเมท คอนโดใกล้ ${camp.short_th}`;
  const homeDesc = `รวมหอพัก คอนโด อพาร์ตเมนต์รอบ ${camp.name_th} (${camp.area_th})${totalRooms ? ` ${totalRooms} ห้อง` : ''}${(buildings || []).length ? ` ${(buildings || []).length} ตึก` : ''} พร้อมราคาต่อคน รีวิวตึก ส่งต่อสัญญา และบอร์ดหารูมเมทฟรี`;

  return (
    <DormLayout title={homeTitle} description={homeDesc} canonical={canonicalUrl('/dorm')} jsonLd={homeJsonLd(camp, stats)} className="dm-home">
      <section className="dm-hero-wrap" aria-labelledby="dm-hero-h">
        <div className="dm-hero">
          <div className="dm-hero-copy dm-rise">
            <h1 id="dm-hero-h">หาห้อง หาเมท ใกล้ มศว</h1>
            <p className="dm-hero-sub">ทุกห้องบอกเลยว่ากี่นาทีถึงประตูมอ</p>
            <p className={`dm-hero-live ${live ? '' : 'is-wait'}`} aria-live="polite">
              <i className="dm-live-dot" aria-hidden="true" /><span>{live || 'กำลังโหลด'}</span>
            </p>
          </div>
          <Scene />
        </div>
        <form className="dm-search dm-rise" style={{ '--i': 1 }} onSubmit={search} data-testid="dorm-home-search" aria-label="ค้นหาห้องหรือเมท">
          <Seg value={mode} onChange={setMode} label="หาห้องหรือหาเมท" full
               options={[{ id: 'rooms', label: 'หาห้อง' }, { id: 'mates', label: 'หาเมท' }]} />
          <div className="dm-q">
            <span className="dm-q-label" id="dm-q-zone">โซน</span>
            <ChipRow value={zone} onChange={setZone} label="โซน"
                     options={[{ id: '', label: 'ทุกโซน' }, ...zoneList.map((z) => ({ id: z.id, label: zoneShort(z.label) }))]} />
          </div>
          <div className="dm-q">
            <span className="dm-q-label">งบต่อคน</span>
            <ChipRow value={budget} onChange={setBudget} label="งบต่อคนต่อเดือน"
                     options={BUDGET_PRESETS.map((b) => ({ id: b.id, label: b.label, aria: b.id ? `งบ ${b.label} บาทต่อเดือน` : 'ทุกงบ' }))} />
          </div>
          <button className="dm-btn dm-btn-primary dm-btn-block dm-search-go" type="submit" data-testid="dorm-home-go">
            <Swap k={go}>{go}</Swap>
          </button>
        </form>
      </section>

      {mode === 'mates' ? (
        <>
          {mateRoomsSec}
          {mateSec}
          {newRooms}
        </>
      ) : (
        <>
          {waitSec}
          {newRooms}
        </>
      )}
      {noListings ? <>{buildingSec}{zoneSec}</> : zoneSec}
      {mode !== 'mates' && mateSec}
      {!noListings && buildingSec}

      <Band tone="ink" className="dm-sec dm-postband" art={`${ART}/cta-post.svg`} title="มีห้องอยากหาคนหาร หรือจะส่งต่อสัญญา?"
            text="ลงประกาศฟรี แสดง 30 วัน ต่ออายุได้">
        <nav className="dm-pathlinks" aria-label="ลงประกาศแบบไหน">
          {PATHS.map((p) => <Link key={p.to} to={p.to} className="dm-pathlink dm-press">{p.label}</Link>)}
        </nav>
        <div><Link to="/dorm/post" className="dm-btn dm-btn-primary">ลงประกาศฟรี</Link></div>
      </Band>

      <section className="dm-sec" aria-label="ใช้ยังไง ปลอดภัยไหม">
        <div className="dm-trust">
          <div className="dm-trust-item"><span className="dm-trust-ico"><HandCoins size={19} aria-hidden="true" /></span><span>ฟรี ไม่มีค่านายหน้า</span></div>
          <div className="dm-trust-item"><span className="dm-trust-ico"><EyeOff size={19} aria-hidden="true" /></span><span>คุยในเว็บก่อนได้ ไม่ต้องเปิด LINE จนกว่าจะพร้อม</span></div>
          <div className="dm-trust-item"><span className="dm-trust-ico"><BadgeCheck size={19} aria-hidden="true" /></span><span>ใช้ Gmail ส่วนตัวได้ ยืนยันนิสิต/เฟรชชี่/ศิษย์เก่า มศว รับป้ายได้ในหน้าของฉัน</span></div>
          {chat?.priced > 0 && (
            <div className="dm-trust-item"><span className="dm-trust-ico"><History size={19} aria-hidden="true" /></span>
              <span>ราคาอ้างอิงจาก {chat.priced} ประกาศจริงในกลุ่ม OpenChat ({periodTh(chat.period)})</span>
            </div>
          )}
        </div>
        <Note tone="sun" icon={ShieldCheck} className="dm-home-safety">
          <b>ก่อนโอนเงิน</b> นัดดูห้องจริงและขอดูสัญญาก่อนโอนมัดจำทุกครั้ง เวลาเดินทางในเว็บเป็นค่าประมาณ ลองเดินจริงก่อนตัดสินใจ
        </Note>
      </section>
    </DormLayout>
  );
}

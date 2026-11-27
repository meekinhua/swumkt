import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Bath, BedDouble, Building, CalendarDays, Check, ChevronRight, Clock, CookingPot, Dumbbell, Eye, Footprints, Globe, History, Hourglass, Link2, MapPin, PawPrint, Power, Share2,
  ShieldCheck, Sofa, TramFront, TriangleAlert, UserRound, Wallet, WashingMachine, Waves, Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, {
  ContactButton, Cover, DemoPill, Empty, Gallery, InterestChip, KindBadge, ListingCard, Minutes, NativeMark, Note, ProjectGallery, Rail, RemoteImg, ReportButton,
  SaveButton, Skeleton, SplitLine, Stars, Verified, buildingArt, buildingThumb, genderShort, priceOf, useShell, zoneShort,
} from './DormLayout';
import {
  InterestButton, InterestedPeople, OwnerInterestLink, SourceBox, SplitCalc, useInterest,
} from './DormInterest';
import { MapCard } from './DormBuildingPage';
import {
  API, agoTh, authHeaders, baht, daysLeft, errMsg, invalidateBuildings, labelOf, lineShareUrl, perPersonOf, priceView, roomsHref, shareTextFor, splitDemo, thDate, useBuildings, useDormMeta, zoneMinutes,
} from './dormApi';

const ART = '/dorm/illustrations';
const AMEN_ICON = {
  walk_swu: Footprints, near_mrt: TramFront, washer: WashingMachine, kitchen: CookingPot, pool: Waves, gym: Dumbbell,
  pet_friendly: PawPrint, furnished: Sofa, security: ShieldCheck,
};

const Fact = ({ icon: I, label, children, wide, tone = '' }) => (
  <div className={`dm-dfact ${wide ? 'wide' : ''} ${tone}`}>
    <span className="dm-dfact-ico"><I size={18} aria-hidden="true" /></span>
    <div style={{ minWidth: 0 }}><small>{label}</small><b>{children}</b></div>
  </div>
);

const SAFETY = 'อย่าโอนมัดจำก่อนเห็นห้องจริงและสัญญา ถ้าเป็นการส่งต่อสัญญา ขอดูสัญญาเช่าเดิมและคุยกับเจ้าของห้องด้วย';

const DetailSkeleton = () => (
  <div className="dm-detail" aria-busy="true" aria-label="กำลังโหลด">
    <div style={{ minWidth: 0 }}>
      <div className="dm-dgal"><div className="dm-gallery"><div className="dm-cover"><Skeleton h="100%" r={0} style={{ display: 'block' }} /></div></div></div>
      <div className="dm-dhead" style={{ display: 'grid', gap: 10 }}>
        <Skeleton w={96} h={22} r={999} /><Skeleton w="90%" h={24} /><Skeleton w="55%" h={24} />
        <Skeleton w="70%" h={36} style={{ marginTop: 6 }} />
        <div className="dm-dfacts" style={{ marginTop: 8 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} r={14} />)}</div>
      </div>
    </div>
  </div>
);

export default function DormRoomDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const meta = useDormMeta();
  const buildings = useBuildings();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useShell();
  const [d, setD] = useState(null);
  const [goneData, setGoneData] = useState(null);
  const [err, setErr] = useState('');
  const [near, setNear] = useState(null);
  const [ownerBusy, setOwnerBusy] = useState(false);
  // interest summary after this viewer presses or withdraws (merged over the listing), and a counter that
  // makes the people list refetch
  const [sum, setSum] = useState({});
  const [ver, setVer] = useState(0);
  const barRef = useRef(null);

  // Clear only when the room changes. Signing in changes `token` too; blanking the
  // page then would unmount the contact button and lose the contact just revealed.
  useEffect(() => { setD(null); setGoneData(null); setErr(''); setNear(null); setSum({}); }, [id]);
  useEffect(() => {
    // abort on change so a slow answer for the previous room can never land on this room's URL
    const ctl = new AbortController();
    axios.get(`${API}/listings/${id}`, { ...authHeaders(token), signal: ctl.signal })
      .then((r) => { if (r.data?.listing?.id === id || !r.data?.listing?.id) { setD(r.data); setGoneData(null); setSum({}); } })
      .catch((e) => {
        if (axios.isCancel(e)) return;
        if (e?.response?.status === 410 && e?.response?.data?.listing) {
          setGoneData(e.response.data);
          setD(null);
          setErr('');
        } else {
          setErr(errMsg(e, 'ไม่พบประกาศนี้'));
        }
      });
    return () => ctl.abort();
  }, [id, token]);

  // other rooms in the same zone, so the page is never a dead end
  // ordered by how close each one's per-person price is to this room's (a 25,000 room is no alternative to a 4,000 one)
  const zone = d?.listing?.zone;
  const myPer = d?.listing ? perPersonOf(d.listing) || 0 : 0;
  useEffect(() => {
    if (!zone) return undefined;
    const ctl = new AbortController();
    axios.get(`${API}/listings`, { params: { zone, limit: 300 }, signal: ctl.signal })
      .then((r) => setNear(r.data.items.filter((x) => x.id !== id)
        .map((x) => ({ x, gap: Math.abs((perPersonOf(x) || 0) - myPer) })).sort((a, c) => a.gap - c.gap || (a.x.id < c.x.id ? -1 : 1))
        .slice(0, 11).map((e) => e.x)))
      .catch((e) => { if (!axios.isCancel(e)) setNear([]); });
    return () => ctl.abort();
  }, [zone, id, myPer]);

  // the page reserves exactly the action bar's height at the bottom (it grows when the contact opens)
  const hasData = !!d;
  useEffect(() => {
    const el = barRef.current;
    const root = el?.closest('.dorm-root');
    if (!el || !root) return undefined;
    let raf = 0;
    const put = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => root.style.setProperty('--dm-bar', `${el.offsetHeight}px`));
    };
    put();
    root.classList.add('dm-has-actionbar');   // class fallback for browsers without :has()
    let ro;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(put); ro.observe(el); }
    return () => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); root.style.removeProperty('--dm-bar'); root.classList.remove('dm-has-actionbar'); };
  }, [hasData]);

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(roomsHref()));
  const merged = d?.listing ? { ...d.listing, ...sum } : null;
  const interest = useInterest(merged, (s2) => { setSum((o) => ({ ...o, ...s2 })); setVer((v) => v + 1); });

  if (goneData) {
    const gx = goneData.listing;
    const gb = goneData.building;
    const alts = goneData.alternatives || [];
    const { title: gTitle } = splitDemo(gx.title);
    const gPv = priceView(gx);
    const gPr = gPv ? null : priceOf(gx);
    const gZone = zoneShort(labelOf(meta?.zones, gx.zone));
    const gWhere = gb?.name || gx.building_name;
    const gPhotos = (gx.photo_links || []).filter((p) => p.startsWith('/api/dorm/photos/'));
    const closedDate = gx.closed_at || gx.reserved_until || gx.expires_at;
    return (
      <DormLayout title={gx.gone_label || 'ประกาศปิดแล้ว'}>
        <Link to={roomsHref()} className="dm-back"><ArrowLeft size={16} aria-hidden="true" />ห้องทั้งหมด</Link>
        <section className="dm-softclosed dm-rise" data-testid="dorm-soft-closed">
          <div className="dm-softclosed-media">
            {gPhotos.length > 0 ? <img src={gPhotos[0].startsWith('/api/') ? `${process.env.REACT_APP_BACKEND_URL}${gPhotos[0]}` : gPhotos[0]} alt="" />
              : gx.ext_photos?.[0]?.url ? <RemoteImg src={gx.ext_photos[0].url} />
                : <Cover x={gx} note={false} building={gb} />}
          </div>
          <div className="dm-softclosed-body">
            <div className="dm-dbadges">
              <span className="dm-pill gone on-paper"><History size={13} aria-hidden="true" />{gx.gone_label || 'ประกาศนี้ปิดแล้ว'}</span>
              {gx.external ? <span className="dm-pill src on-paper">จาก {gx.source}</span> : <KindBadge kind={gx.kind} />}
              {closedDate && <span className="dm-tiny dm-muted">อัปเดต {thDate(closedDate)}</span>}
            </div>
            <h1>{gTitle || 'ประกาศนี้ปิดแล้ว'}</h1>
            {(gPv || gPr) && (
              <p className="dm-softclosed-price">
                ราคาอ้างอิงเดิม {gPv ? `${baht(gPv.head)} ${gPv.unitLong}` : `${baht(gPr.n)} ${gPr.long}`}
              </p>
            )}
            {(gWhere || gZone) && (
              <p className="dm-small dm-muted">
                <MapPin size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />
                {gWhere}{gWhere && gZone ? ' · ' : ''}{gZone ? `โซน${gZone}` : ''}
              </p>
            )}
            <p className="dm-small dm-muted">ซ่อนช่องทางติดต่อและการทักแล้ว สามารถเลือกดูห้องที่ยังว่างใกล้เคียงด้านล่างได้เลย</p>
            <div className="dm-actions">
              {gx.zone && <Link to={`/dorm/rooms?zone=${gx.zone}`} className="dm-btn dm-btn-ink dm-btn-sm">ดูห้องว่างโซน{gZone || 'นี้'}</Link>}
              {gb && <Link to={`/dorm/buildings/${gb.slug}?tab=rooms`} className="dm-btn dm-btn-quiet dm-btn-sm">ดูตึก {gb.name}</Link>}
            </div>
          </div>
        </section>
        {alts.length > 0 && (
          <Rail title="ห้องที่ยังว่างใกล้เคียง" label="ห้องที่ยังว่างใกล้เคียง" className="dm-near"
                link={gx.zone ? <Link to={`/dorm/rooms?zone=${gx.zone}`}>ดูทั้งหมด</Link> : undefined}>
            {alts.map((y, i) => <ListingCard key={y.id} x={y} i={i} />)}
          </Rail>
        )}
      </DormLayout>
    );
  }

  if (err) {
    return (
      <DormLayout title="ไม่พบประกาศ">
        <Empty title={err} art={`${ART}/empty-saved.svg`} className="dm-detail-empty"
               action={<Link to="/dorm/rooms" className="dm-btn dm-btn-tint">ดูห้องอื่น</Link>}>
          ประกาศอาจถูกลบหรือหมดอายุไปแล้ว
        </Empty>
      </DormLayout>
    );
  }
  if (!d) return <DormLayout className="dm-detail-page"><DetailSkeleton /></DormLayout>;

  const confirmOwnerOpen = async () => {
    setOwnerBusy(true);
    try {
      const r = await axios.post(`${API}/listings/${d.listing.id}/confirm-available`, {}, authHeaders(token));
      invalidateBuildings();
      setD((cur) => cur ? {
        ...cur,
        listing: { ...cur.listing, status: 'active', expired: false, owner_confirm_needed: false, gone_reports: 0, expires_at: r.data.expires_at },
      } : cur);
      toast(`ยืนยันแล้ว! ต่ออายุแสดงถึง ${thDate(r.data.expires_at)}`);
    } catch (e2) { toast(errMsg(e2)); }
    setOwnerBusy(false);
  };
  const closeMine = async () => {
    setOwnerBusy(true);
    try {
      await axios.post(`${API}/listings/${d.listing.id}/status`, { status: 'closed' }, authHeaders(token));
      invalidateBuildings();
      setD((cur) => cur ? { ...cur, listing: { ...cur.listing, status: 'closed', owner_confirm_needed: false } } : cur);
      toast('ปิดประกาศแล้ว');
    } catch (e2) { toast(errMsg(e2)); }
    setOwnerBusy(false);
  };
  const handleGoneUpdated = (res) => {
    if (res?.auto_closed) {
      axios.get(`${API}/listings/${id}`, authHeaders(token))
        .then((r) => { setD(r.data); })
        .catch((e2) => {
          if (e2?.response?.status === 410 && e2?.response?.data?.listing) {
            setGoneData(e2.response.data);
            setD(null);
          }
        });
      return;
    }
    setD((cur) => cur ? {
      ...cur,
      listing: { ...cur.listing, maybe_gone: !!res?.maybe_gone, gone_reports: res?.gone_reports ?? (cur.listing.gone_reports || 0) + 1 },
    } : cur);
  };

  const x = merged;
  const b = d.building;
  const ext = !!x.external;
  const pv = priceView(x);
  const { title, demo } = splitDemo(x.title);
  const photos = (x.photo_links || []).filter((p) => p.startsWith('/api/dorm/photos/'));
  const links = (x.photo_links || []).filter((p) => !p.startsWith('/api/dorm/photos/'));
  // no photos of its own: the building's project photos (light ones only; the heavy renders stay on the building page)
  const projectPhotos = (b?.photos || []).filter((p) => (p.bytes || 0) <= 700000);
  const pr = priceOf(x);
  const per = pr?.n;
  const unit = pr?.long;
  const shareText = shareTextFor(x, b?.name);
  const zm = !b?.minutes_to_swu ? zoneMinutes(buildings, x.zone) : null;
  const where = b?.name || x.building_name;
  const zoneName = zoneShort(labelOf(meta?.zones, x.zone));
  const size = [x.bedrooms != null && x.bedrooms !== '' && (x.bedrooms === 0 ? 'สตูดิโอ' : `${x.bedrooms} ห้องนอน`),
    ext && x.bathrooms && `${x.bathrooms} ห้องน้ำ`, x.size_sqm && `${x.size_sqm} ตร.ม.`].filter(Boolean).join(', ');
  const depositEach = x.deposit && x.people_total > 1 ? Math.round(x.deposit / x.people_total) : null;
  const minutes = b?.minutes_to_swu ? <Minutes minutes={b.minutes_to_swu} mode={b.travel_mode} long filled lg />
    : zm && <Minutes minutes={zm.minutes} mode={zm.mode} long zone filled lg />;
  const shareHref = lineShareUrl(shareText);

  return (
    <DormLayout title={title} className="dm-detail-page">
      <Link to={roomsHref()} className="dm-back dm-desk-back"
            onClick={(e) => { if (location.key !== 'default' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(-1); } }}><ArrowLeft size={16} aria-hidden="true" />ห้องทั้งหมด</Link>
      <div className="dm-detail">
        <div style={{ minWidth: 0 }}>
          <div className="dm-dgal">
            {photos.length > 0 ? <Gallery photos={photos} />
              : ext && x.ext_photos?.length ? (
                <ProjectGallery photos={x.ext_photos} name={title} label="ภาพจากประกาศต้นทาง"
                                fallback={<ProjectGallery photos={projectPhotos} name={b?.name} label="ภาพโครงการ ไม่ใช่ห้องนี้" fallback={<div className="dm-gallery"><Cover x={{ ...x, ext_photos: [] }} eager /></div>} />} />
              ) : <ProjectGallery photos={projectPhotos} name={b?.name} label="ภาพโครงการ ไม่ใช่ห้องนี้" fallback={<div className="dm-gallery"><Cover x={x} eager /></div>} />}
            <button type="button" className="dm-fab dm-dgal-back" onClick={goBack} aria-label="ย้อนกลับ"><ArrowLeft size={20} aria-hidden="true" /></button>
            <div className="dm-dgal-tr">
              <a className="dm-fab" href={shareHref} target="_blank" rel="noreferrer" aria-label="แชร์ประกาศนี้ทาง LINE"><Share2 size={19} aria-hidden="true" /></a>
              <SaveButton id={x.id} title={title} className="dm-dgal-save" />
            </div>
          </div>

          <div className="dm-dhead dm-rise">
            <div className="dm-dbadges">
              {ext ? <span className="dm-pill src on-paper">จาก {x.source}</span> : <KindBadge kind={x.kind} />}
              {demo && <DemoPill onPaper />}
              {x.status === 'reserved' && <span className="dm-pill dark">มีคนจองแล้ว</span>}
              {!x.is_gone && x.maybe_gone && <span className="dm-pill warn"><TriangleAlert size={12} aria-hidden="true" />อาจไม่ว่างแล้ว</span>}
              {x.peek_count > 0 && <span className="dm-pill peek on-paper" title="มีผู้เยี่ยมชมกดหัวใจเล็งห้องนี้ไว้"><Eye size={12} aria-hidden="true" />มีคนเล็งอยู่ {x.peek_count}</span>}
            </div>
            <h1 className="dm-dtitle">{title}</h1>
            {(pv || per || minutes) && (
              <div className="dm-dprice">
                {pv ? <span className="dm-dprice-n"><b>{baht(pv.head)}</b><span>{pv.unitLong}{pv.tag ? ` ${pv.tag}` : ''}</span></span>
                  : per ? <span className="dm-dprice-n"><b>{baht(per)}</b><span>{unit}</span></span> : null}
                {minutes}
              </div>
            )}
            <SplitLine x={x} className="lg" />
            <NativeMark x={x} />
            {x.interest_people > 0 ? (
              <button type="button" className="dm-ichip-jump dm-dhead-ichip" onClick={() => document.getElementById('dm-ip-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <InterestChip x={x} matchLine />
                <span className="dm-ichip-go">ดูและทักเลย ↓</span>
              </button>
            ) : <InterestChip x={x} className="dm-dhead-ichip" matchLine />}
            {(where || zoneName) && (
              <div className="dm-detail-where">
                <MapPin size={16} aria-hidden="true" />
                {b ? <Link to={`/dorm/buildings/${b.slug}`}>{b.name}</Link> : where && <span>{where}</span>}
                {zoneName && (x.zone && x.zone !== 'other'
                  ? <Link to={`/dorm/rooms?zone=${x.zone}`} className="dm-muted">{where ? `โซน${zoneName}` : zoneName}</Link>
                  : <span className="dm-muted">{where ? `โซน${zoneName}` : zoneName}</span>)}
              </div>
            )}
          </div>

          {x.maybe_gone && (
            <Note tone="sun" icon={TriangleAlert} className="dm-warnbanner">
              มีผู้ใช้แจ้งว่าห้องนี้อาจไม่ว่างแล้ว ({x.gone_reports} คน) แนะนำทักถามที่เว็บต้นทางก่อนนัดดู หากเช็กแล้วไม่ว่างจริงช่วยกดแจ้งด้านล่างได้เลย
            </Note>
          )}
          {x.status === 'reserved' && !x.is_mine && (
            <Note tone="sun" icon={Clock} className="dm-warnbanner">
              ห้องนี้มีคนจองแล้ว {x.reserved_until && daysLeft(x.reserved_until) > 0 ? `(แสดงต่ออีก ${daysLeft(x.reserved_until)} วัน เผื่อหลุดจอง)` : '(แสดงเผื่อหลุดจอง)'}
            </Note>
          )}
          {x.is_mine && x.owner_confirm_needed && x.status !== 'closed' && (
            <div className="dm-myrow-warnbanner" role="alert" style={{ marginTop: 14 }}>
              <span><TriangleAlert size={16} aria-hidden="true" />มีผู้ใช้แจ้งว่าห้องนี้อาจไม่ว่างแล้ว — ยังว่างอยู่ไหม? (หากไม่ยืนยันใน 48 ชม. ระบบจะพักประกาศชั่วคราว)</span>
              <div className="dm-actions">
                <button type="button" className="dm-btn dm-btn-ink dm-btn-sm" disabled={ownerBusy} onClick={confirmOwnerOpen}>
                  <Check size={14} aria-hidden="true" />ยังว่างอยู่ (+ต่ออายุ)
                </button>
                <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" disabled={ownerBusy} onClick={closeMine}>
                  <Power size={14} aria-hidden="true" />ปิดประกาศ
                </button>
              </div>
            </div>
          )}

          {x.is_mine && (
            <div className="dm-ownbar">
              <span>
                <b>ประกาศของคุณ</b>{x.expired && ' หมดอายุแล้ว'} เปิดดู {x.views || 0} ครั้ง กดดูช่องทางติดต่อ {x.contact_reveals || 0} ครั้ง
                {' '}<OwnerInterestLink x={x} />
              </span>
              <span className="dm-actions">
                <Link to={`/dorm/post?edit=${x.id}`} className="dm-btn dm-btn-quiet dm-btn-sm">แก้ไข</Link>
                <Link to="/dorm/me" className="dm-btn dm-btn-quiet dm-btn-sm">ต่ออายุหรือปิด</Link>
              </span>
            </div>
          )}

          <div className="dm-dfacts">
            {x.move_in && <Fact icon={CalendarDays} label={ext ? 'ว่างตั้งแต่' : 'เข้าอยู่ได้'} tone="t-mint">{thDate(x.move_in)}</Fact>}
            {!ext && x.gender_pref && <Fact icon={UserRound} label="เหมาะกับ" tone="t-rose">{genderShort(meta, x.gender_pref)}</Fact>}
            {ext && x.floor ? <Fact icon={Building} label="ชั้น" tone="t-sky">{x.floor}</Fact> : null}
            {ext && x.furnished != null && <Fact icon={Sofa} label="เฟอร์นิเจอร์" tone="t-rose">{x.furnished ? 'มีครบ' : 'ไม่มี'}</Fact>}
            {x.deposit != null && x.deposit !== '' && (
              <Fact icon={Wallet} label="มัดจำ/ประกัน" tone="t-sun">
                {baht(x.deposit)} บาท{depositEach ? <span className="dm-dfact-sub"> {x.whole_first ? 'ถ้า' : ''}หาร {x.people_total} ตกคนละ ~{baht(depositEach)}</span> : null}
              </Fact>
            )}
            {x.utilities_note && <Fact icon={Zap} label="ค่าน้ำไฟ" wide={x.utilities_note.length > 24} tone="t-lilac">{x.utilities_note}</Fact>}
            {x.kind === 'transfer' && x.contract_months_left != null && x.contract_months_left !== '' && <Fact icon={Hourglass} label="สัญญาเหลือ" tone="t-sky">{x.contract_months_left} เดือน</Fact>}
            {x.min_months ? <Fact icon={Clock} label="อยู่ขั้นต่ำ" tone="t-sun">{x.min_months} เดือน</Fact> : null}
            {size && <Fact icon={ext && x.bathrooms ? Bath : BedDouble} label="ขนาด" tone="t-mint">{size}</Fact>}
          </div>

          {ext && <SourceBox x={x} onGoneUpdated={handleGoneUpdated} />}
          <SplitCalc key={x.id} x={x} />
          <InterestedPeople x={x} version={ver} onStart={x.is_mine ? null : interest.start} onSummary={(s2) => setSum((o) => ({ ...o, ...s2 }))} />

          {x.amenities?.length > 0 && (
            <section className="dm-dsec" aria-labelledby="dm-amen-h">
              <h2 id="dm-amen-h">มีอะไรบ้าง</h2>
              <div className="dm-amen">
                {x.amenities.map((a) => {
                  const I = AMEN_ICON[a];
                  return <span key={a}>{I && <I size={16} aria-hidden="true" />}{labelOf(meta?.amenities, a)}</span>;
                })}
              </div>
            </section>
          )}
          {(x.description || links.length > 0) && (
            <section className="dm-dsec" aria-labelledby="dm-desc-h">
              <h2 id="dm-desc-h">รายละเอียด</h2>
              {x.description && <p className="dm-desc">{x.description}</p>}
              {links.length > 0 && (
                <div className="dm-actions" style={{ marginTop: 12 }}>
                  {links.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="dm-btn dm-btn-quiet dm-btn-sm"><Link2 size={15} aria-hidden="true" />อัลบั้มรูป {i + 1}</a>
                  ))}
                </div>
              )}
            </section>
          )}

          {where && (
            <section className="dm-dsec" aria-label="แผนที่">
              <MapCard name={where} mode={b?.travel_mode || zm?.mode} />
            </section>
          )}

          {b && (
            <Link to={`/dorm/buildings/${b.slug}`} className="dm-bbox dm-press dm-lift">
              <RemoteImg className="dm-bbox-art" src={buildingThumb(b)?.url} fallback={buildingArt(b)} />
              <span className="dm-bbox-body">
                <small className="dm-muted">เกี่ยวกับตึกนี้</small>
                <span className="dm-bbox-name">{b.name}</span>
                <span className="dm-bbox-row">
                  {b.minutes_to_swu ? <Minutes minutes={b.minutes_to_swu} mode={b.travel_mode} filled /> : null}
                  {b.overall ? <Stars value={b.overall} count={b.review_count} />
                    : (b.pros?.length || b.cons?.length) ? <span className="dm-small dm-muted">สรุปรีวิว {(b.pros?.length || 0) + (b.cons?.length || 0)} ประเด็น</span> : null}
                </span>
                {b.cons?.length > 0 && <span className="dm-warnline">รุ่นพี่เตือนไว้: {b.cons.join(', ')}</span>}
                <span className="dm-bbox-go">{b.review_count || b.web_review_summary || b.pros?.length ? 'อ่านรีวิวตึกนี้' : 'ดูข้อมูลตึกนี้'}<ChevronRight size={16} aria-hidden="true" /></span>
              </span>
            </Link>
          )}

          {!ext && <div className="dm-poster">
            <span className="dm-poster-ico"><UserRound size={20} aria-hidden="true" /></span>
            <div className="dm-poster-meta">
              <span className="dm-poster-who">
                ลงโดย{labelOf(meta?.poster_roles, x.poster_role) || 'สมาชิก'}
                <Verified on={x.poster_swu_verified} small />
              </span>
              <span className="dm-muted">
                {x.created_at && `ลงเมื่อ ${agoTh(x.created_at)}`}
                {x.renewed_at && x.created_at && x.renewed_at.slice(0, 10) !== x.created_at.slice(0, 10) && `, ต่ออายุ ${agoTh(x.renewed_at)}`}
              </span>
            </div>
          </div>}

          <div className="dm-lt-desk">
            <Note tone="sun" icon={ShieldCheck}>{SAFETY}</Note>
            <div className="dm-report-row"><ReportButton type="listing" id={x.id} /></div>
          </div>
        </div>

        <aside className="dm-detail-side">
          <div className="dm-sidebox">
            {pv ? <div className="dm-side-price"><b>{baht(pv.head)}</b><span>{pv.unitLong}{pv.tag ? ` ${pv.tag}` : ''}</span></div>
              : per ? <div className="dm-side-price"><b>{baht(per)}</b><span>{unit}</span></div> : null}
            <SplitLine x={x} />
            {minutes && <div style={{ marginTop: 6 }}>{minutes}</div>}
            {x.interest_people > 0 ? (
              <button type="button" className="dm-ichip-jump dm-side-ichip" onClick={() => document.getElementById('dm-ip-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <InterestChip x={x} matchLine />
                <span className="dm-ichip-go">ดูและทักเลย ↓</span>
              </button>
            ) : <InterestChip x={x} className="dm-side-ichip" matchLine />}
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {ext && <InterestButton x={x} onStart={interest.start} block />}
              {ext && (
                <a className="dm-btn dm-btn-quiet dm-btn-block" href={x.source_url} target="_blank" rel="noopener nofollow noreferrer">
                  <Globe size={17} aria-hidden="true" />ดูประกาศต้นทาง
                </a>
              )}
              {!ext && !x.is_mine && <ContactButton kind="listing" id={x.id} label="ทักผู้ลงประกาศ" />}
              {!ext && !x.is_mine && <InterestButton x={x} onStart={interest.start} variant="tint" block />}
              <a className="dm-btn dm-btn-quiet dm-btn-block" href={shareHref} target="_blank" rel="noreferrer">
                <Share2 size={17} aria-hidden="true" />{x.is_mine ? 'แชร์ประกาศทาง LINE' : 'แชร์ทาง LINE'}
              </a>
            </div>
            <Note tone="sun" icon={ShieldCheck} className="dm-side-note">{SAFETY}</Note>
            <div className="dm-report-row"><ReportButton type="listing" id={x.id} /></div>
          </div>
        </aside>
      </div>

      {near && near.length > 0 && (
        <Rail title="ห้องอื่นในโซนนี้" label="ห้องอื่นในโซนนี้" className="dm-near"
              link={<Link to={`/dorm/rooms?zone=${x.zone}`}>ดูทั้งโซน</Link>}>
          {near.map((y) => <ListingCard key={y.id} x={y} />)}
        </Rail>
      )}

      <div className={`dm-actionbar ${ext ? 'is-ext' : ''}`} ref={barRef}>
        {x.is_mine ? (
          <a className="dm-btn dm-btn-quiet dm-btn-block" href={shareHref} target="_blank" rel="noreferrer">
            <Share2 size={18} aria-hidden="true" />แชร์ประกาศทาง LINE
          </a>
        ) : ext ? (
          <>
            <a className="dm-btn dm-btn-quiet dm-bar-src" href={x.source_url} target="_blank" rel="noopener nofollow noreferrer">
              <Globe size={17} aria-hidden="true" />ดูต้นทาง
            </a>
            <InterestButton x={x} onStart={interest.start} block compact={!!x.single_room} />
          </>
        ) : (
          <>
            <InterestButton x={x} onStart={interest.start} variant="tint" compact />
            <ContactButton kind="listing" id={x.id} label="ทักผู้ลงประกาศ" compact />
          </>
        )}
      </div>
      {interest.ui}
    </DormLayout>
  );
}

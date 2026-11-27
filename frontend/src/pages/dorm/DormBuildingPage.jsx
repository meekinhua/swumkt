import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowLeft, ChevronRight, ExternalLink, History, MapPinned, Navigation, MessageSquareHeart, PenLine, Plus, Star, ThumbsUp, TrainFront, TriangleAlert, Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, {
  ARCHIVE_NOTE, Avatar, ChatList, Empty, ListingCard, Minutes, ProjectGallery, ReportButton, Skeleton, Stars, Verified, buildingArt, lowestPrice,
  modeLabel, ppRangeText, ppShape, useShell, zoneShort,
} from './DormLayout';
import { API, authHeaders, baht, directionsUrl, errMsg, labelOf, loadBuildings, mapsUrl, thDate, useDormMeta } from './dormApi';
import { buildingJsonLd, campusOf, canonicalUrl } from './dormSeo';

const TYPE = { condo: 'คอนโด', apartment: 'อพาร์ตเมนต์', dorm: 'หอพัก' };
const ART = '/dorm/illustrations';

// Collapsed map card; the Google Maps iframe loads only after a tap (no third-party request before that).
// While it loads a skeleton says so; if the iframe has not fired `load` after ~6s a clear fallback line
// points to Google Maps instead of leaving a grey box. Also used by the room detail page.
// mode: the building's travel_mode, for the directions link (walking when 'walk', otherwise transit).
export const MapCard = ({ name, mode }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle');   // idle | loading | ready | slow
  useEffect(() => {
    if (state !== 'loading') return undefined;
    const t = setTimeout(() => setState((s) => (s === 'loading' ? 'slow' : s)), 6000);
    return () => clearTimeout(t);
  }, [state]);
  if (!name) return null;
  const src = `https://www.google.com/maps?q=${encodeURIComponent(`${name} Bangkok`)}&z=16&output=embed`;
  return (
    <div className="dm-map">
      {open ? (
        <div className={`dm-map-frame is-${state}`}>
          <iframe title={`แผนที่ ${name}`} src={src} loading="eager" referrerPolicy="no-referrer" allowFullScreen data-testid="dorm-map-frame"
                  onLoad={() => setState('ready')} />
          {state !== 'ready' && (
            <div className="dm-map-wait" role="status">
              {state === 'slow' ? (
                <span className="dm-map-slow">แผนที่โหลดช้า ลอง
                  <a href={mapsUrl(name)} target="_blank" rel="noopener noreferrer">เปิดใน Google Maps</a>แทน
                </span>
              ) : <span className="dm-map-loading"><i className="dm-spin" aria-hidden="true" />กำลังโหลดแผนที่</span>}
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="dm-map-btn dm-press" onClick={() => { setOpen(true); setState('loading'); }} data-testid="dorm-map-btn">
          <span className="dm-map-ico"><MapPinned size={22} aria-hidden="true" /></span>
          <span className="dm-map-txt"><b>ดูแผนที่ {name}</b><small>แตะเพื่อโหลดแผนที่</small></span>
          <ChevronRight size={20} aria-hidden="true" className="dm-map-chev" />
        </button>
      )}
      <div className="dm-map-links">
        <a className="dm-map-link" href={mapsUrl(name)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" />เปิดใน Google Maps</a>
        <a className="dm-map-link" href={directionsUrl(name, mode)} target="_blank" rel="noopener noreferrer"
           aria-label={`ดูเส้นทางจาก ${name} ไป มศว ${mode === 'walk' ? 'แบบเดิน' : 'ด้วยขนส่งสาธารณะ'} ใน Google Maps`}>
          <Navigation size={15} aria-hidden="true" />ดูเส้นทางไป มศว
        </a>
      </div>
    </div>
  );
};

const ReviewForm = ({ slug, aspects, initial, onDone, onCancel }) => {
  const { token, user } = useAuth();
  const { requireLogin } = useShell();
  const [ratings, setRatings] = useState(initial?.ratings || {});
  const [text, setText] = useState(initial?.text || '');
  const [lived, setLived] = useState(initial?.lived_year ? String(initial.lived_year + 543) : '');
  const [anon, setAnon] = useState(initial ? /ไม่ระบุชื่อ/.test(initial.display_name || '') : true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const doSubmit = async () => {
    setBusy(true); setErr('');
    try {
      const t = token || localStorage.getItem('token');
      await axios.post(`${API}/buildings/${slug}/reviews`,
        { ratings, text, lived_year: lived ? Number(lived) - 543 : null, anonymous: anon }, authHeaders(t));
      onDone();
    } catch (e2) { setErr(errMsg(e2, 'ส่งรีวิวไม่สำเร็จ')); }
    setBusy(false);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!Object.keys(ratings).length) return setErr('ให้ดาวอย่างน้อยหนึ่งหัวข้อ');
    if (lived && (Number(lived) < 2543 || Number(lived) > 2643)) return setErr('ใส่ปี พ.ศ. เช่น 2569');
    if (!user && !localStorage.getItem('token')) {
      requireLogin('เข้าสู่ระบบเพื่อส่งรีวิว รีวิวที่เขียนไว้ยังอยู่ครบ', () => { doSubmit(); });
      return undefined;
    }
    await doSubmit();
    return undefined;
  };
  return (
    <form className="dm-form dm-rform dm-rise" onSubmit={submit} data-testid="dorm-review-form">
      <div>
        <h3>{initial ? 'แก้รีวิวของคุณ' : 'รีวิวตึกนี้'}</h3>
        <p className="dm-small dm-muted">ให้ดาวเฉพาะหัวข้อที่รู้จริงก็พอ</p>
      </div>
      <div className="dm-rates-in">
        {aspects.map((a) => (
          <div key={a.id} className="dm-rate">
            <span>{a.label}</span>
            <div role="radiogroup" aria-label={a.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className={(ratings[a.id] || 0) >= n ? 'on' : ''} role="radio" aria-checked={ratings[a.id] === n}
                        onClick={() => setRatings({ ...ratings, [a.id]: n })} aria-label={`${a.label} ${n} ดาว`}>
                  <Star size={24} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="dm-field"><span>เล่าให้รุ่นน้องฟัง</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1500}
                  placeholder="นิติเป็นยังไง รอลิฟต์นานไหม ซอยเปลี่ยวไหม ค่าวินไปมอเท่าไหร่ ค่าไฟหน่วยละเท่าไหร่" />
      </label>
      <div className="dm-two">
        <label className="dm-field"><span>อยู่ล่าสุดปี พ.ศ.</span>
          <input type="number" inputMode="numeric" min="2543" max="2643" value={lived} onChange={(e) => setLived(e.target.value)} placeholder="2569" />
        </label>
        <label className="dm-check" style={{ alignSelf: 'end', paddingBottom: 12 }}>
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /><span>ไม่แสดงชื่อ</span>
        </label>
      </div>
      {err && <div className="dm-err" role="alert">{err}</div>}
      <div className="dm-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="dm-btn dm-btn-quiet" onClick={onCancel}>ยกเลิก</button>
        <button className="dm-btn dm-btn-primary" disabled={busy}>{busy ? 'กำลังส่ง' : 'ส่งรีวิว'}</button>
      </div>
    </form>
  );
};

// Warm invitation to write the first review (overview + reviews tab).
const FirstReview = ({ name, onWrite, compact = false }) => (
  <div className={`dm-firstcta ${compact ? 'compact' : ''}`}>
    <span className="dm-firstcta-ico"><MessageSquareHeart size={compact ? 22 : 26} aria-hidden="true" /></span>
    <div className="dm-firstcta-txt">
      <b>เคยอยู่{name ? ` ${name} ` : 'ตึกนี้'}ไหม</b>
      <p>เล่าสั้น ๆ เรื่องเดินทาง ความปลอดภัย และนิติ รุ่นน้องจะได้ตัดสินใจง่ายขึ้น ใช้เวลาแค่ 2 นาที</p>
    </div>
    <button type="button" className="dm-btn dm-btn-primary" onClick={onWrite}><PenLine size={17} aria-hidden="true" />เพิ่มรีวิวจากคนอยู่จริง</button>
  </div>
);

// "ราคาที่เคยเห็นในกลุ่ม OpenChat": the per-person range of this building's old ads, then the ads themselves
// (collapsed). Old posts with no contact; never presented as rooms on offer.
const TH_MONTH_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const monthTh = (iso) => {
  const [y, m] = (iso || '').split('-').map(Number);
  return m ? `${TH_MONTH_LONG[m - 1]} ${y + 543}` : '';
};
const ChatPrices = ({ slug, chat }) => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let on = true;
    axios.get(`${API}/chat-posts`, { params: { building: slug, limit: 100 } })
      .then((r) => on && setItems(r.data.items)).catch(() => on && setItems([]));
    return () => { on = false; };
  }, [slug]);
  const pp = chat.per_person || {};
  const shape = ppShape(pp);
  const pos = (v) => (pp.max > pp.min ? ((v - pp.min) / (pp.max - pp.min)) * 100 : 50);
  return (
    <section className="dm-box dm-chatprice" aria-labelledby="dm-chatprice-h">
      <div className="dm-chatprice-l">
        <div className="dm-chatprice-head">
          <h2 id="dm-chatprice-h">ราคาที่เคยเห็นในกลุ่ม OpenChat</h2>
          <span className="dm-small dm-muted">
            {pp.n > 1 ? `${chat.count} ประกาศ บอกราคาต่อคน ${pp.n} ประกาศ` : pp.n === 1 ? `${chat.count} ประกาศ บอกราคาต่อคนแค่ 1 ประกาศ ดูในรายการ` : `${chat.count} ประกาศ ยังไม่มีราคาต่อคน`}{chat.last_date ? `, ล่าสุด ${monthTh(chat.last_date)}` : ''}
          </span>
        </div>
        {(shape === 'range' || shape === 'same') && (
          <p className="dm-chatprice-one"><b>{ppRangeText(pp)}</b> ฿/คน จาก {pp.n} ประกาศ</p>
        )}
        {shape === 'stats' && (
            <div className="dm-range" role="group" aria-label={`ต่อคนต่อเดือน ต่ำสุด ${baht(pp.min)} ค่ากลาง ${baht(pp.median)} สูงสุด ${baht(pp.max)} บาท`}>
              <div className="dm-range-bar" aria-hidden="true">
                <i className="dm-range-fill" />
                <i className="dm-range-mid" style={{ left: `${pos(pp.median)}%` }} />
              </div>
              <div className="dm-range-nums" aria-hidden="true">
                <span><small>ต่ำสุด</small><b>{baht(pp.min)}</b></span>
                <span className="mid"><small>ค่ากลาง</small><b>{baht(pp.median)}</b></span>
                <span className="hi"><small>สูงสุด</small><b>{baht(pp.max)}</b></span>
              </div>
              <span className="dm-tiny dm-muted">บาท/คน/เดือน จาก {pp.n} ประกาศ</span>
            </div>
        )}
        <p className="dm-archive-note">{ARCHIVE_NOTE}</p>
      </div>
      <div className="dm-chatprice-r">
        {items === null ? <div style={{ display: 'grid', gap: 8 }}><Skeleton h={40} /><Skeleton h={40} /></div>
          : items.length > 0 && <ChatList items={items} total={chat.count} show={5} showWhere={false} label="ประกาศเก่าของตึกนี้" />}
      </div>
    </section>
  );
};

const PageSkeleton = () => (
  <div aria-busy="true" aria-label="กำลังโหลด" className="dm-bhead">
    <div className="dm-bbanner"><Skeleton h="100%" r={0} style={{ display: 'block' }} /></div>
    <div style={{ display: 'grid', gap: 10 }}><Skeleton w="70%" h={28} /><Skeleton w="45%" h={26} r={999} /><Skeleton w="55%" h={16} /></div>
  </div>
);

export default function DormBuildingPage() {
  const { slug } = useParams();
  const { token } = useAuth();
  const meta = useDormMeta();
  const { toast, confirm } = useShell();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [writing, setWriting] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => (['rooms', 'reviews'].includes(params.get('tab')) ? params.get('tab') : 'overview'));
  useEffect(() => { setShowClosed(false); }, [slug]);
  // opened from a group card in a room list: the back link returns to that list (history back keeps its scroll)
  const location = useLocation();
  const navigate = useNavigate();
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/dorm') ? location.state.from : null;
  const back = from ? (
    <Link to={from} className="dm-back" onClick={(e) => { if (location.key !== 'default' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(-1); } }}>
      <ArrowLeft size={16} aria-hidden="true" />{from.startsWith('/dorm/rooms') ? 'ห้องทั้งหมด' : 'กลับ'}
    </Link>
  ) : <Link to="/dorm/buildings" className="dm-back"><ArrowLeft size={16} aria-hidden="true" />รีวิวตึกทั้งหมด</Link>;

  // tok: pass the current token explicitly right after sign-in (the closure may still hold null)
  const load = useCallback((tok) => axios.get(`${API}/buildings/${slug}`, authHeaders(tok === undefined ? token : tok))
    .then((r) => { setD(r.data); return r.data; }).catch((e) => setErr(errMsg(e, 'ไม่พบตึกนี้'))), [slug, token]);
  useEffect(() => { load(); }, [load]);

  if (err) {
    return (
      <DormLayout title="ไม่พบตึก" robots="noindex, follow">
        <Empty title={err} art={`${ART}/bldg-condo-3.svg`} action={<Link to="/dorm/buildings" className="dm-btn dm-btn-tint">ดูตึกอื่น</Link>}>
          ลิงก์อาจพิมพ์ผิด หรือตึกนี้ถูกรวมกับชื่ออื่นแล้ว
        </Empty>
      </DormLayout>
    );
  }
  if (!d) return <DormLayout title="กำลังโหลดตึก">{back}<PageSkeleton /></DormLayout>;
  const b = d.building;
  const aspects = meta?.review_aspects || [];
  const mineR = d.reviews.find((r) => r.is_mine);
  const lowest = lowestPrice(d.listings);
  const chat = b.chat || {};
  const chatPP = chat.per_person || {};
  // archive range only from two priced ads (one ad is shown in the list, not as a "price")
  const chatRange = ['range', 'same', 'stats'].includes(ppShape(chatPP)) ? ppRangeText(chatPP) : null;
  // Header prices, each with its source: "จากประกาศตอนนี้" (live rooms) and "เคยเห็นในแชท" (old ads), else
  // the hand-written price note. The note is hidden from the chat box once the archive has priced ads.
  // a current "from" price far from the chat range: say why, quietly (room type and how many share)
  const farApart = !!(lowest?.per && chatRange && chatPP.min && chatPP.max && (lowest.n < chatPP.min * 0.7 || lowest.n > chatPP.max * 1.4));
  const priceSeen = !chatRange && /\d[\d,]{3,}/.test(b.price_seen || '') ? b.price_seen : '';
  const zoneName = zoneShort(labelOf(meta?.zones, b.zone));
  const typeLabel = TYPE[b.type] || '';
  const bCamp = campusOf(meta);
  const bTitle = `${b.name} — รีวิว${typeLabel || 'ที่พัก'}ใกล้ ${bCamp.name_th}`;
  const bDesc = [
    b.name,
    typeLabel && zoneName ? `${typeLabel} โซน${zoneName}` : zoneName,
    b.minutes_to_swu && `เดินทางไป${bCamp.short_th} ~${b.minutes_to_swu} นาที`,
    lowest?.n ? `ห้องว่างเริ่มต้น ${baht(lowest.n)} ${lowest.per ? 'บาท/คน/เดือน' : 'บาท/เดือน'}` : (priceSeen || chatRange),
    b.review_count > 0 && b.overall ? `คะแนน ${b.overall}/5 (${b.review_count} รีวิว)` : '',
    b.web_review_summary,
  ].filter(Boolean).join(' · ').slice(0, 160);
  const bImg = (b.photos || [])[0]?.url;
  // When sign-in happens first, wait for the signed-in copy of the reviews before opening the
  // form, so an existing review is edited instead of overwritten by an empty one.
  const write = () => {
    setTab('reviews');
    setWriting(true);
  };
  const afterChange = () => { load(); loadBuildings(true).catch(() => {}); };
  const delMine = async () => {
    const ok = await confirm({ title: 'ลบรีวิวของคุณ?', body: `รีวิวของคุณใน ${b.name} จะหายไปและกู้คืนไม่ได้`, action: 'ลบรีวิว', danger: true });
    if (!ok) return;
    try { await axios.delete(`${API}/buildings/${slug}/reviews/me`, authHeaders(token)); toast('ลบรีวิวแล้ว'); afterChange(); } catch (e) { toast(errMsg(e)); }
  };

  return (
    <DormLayout title={bTitle} description={bDesc} canonical={canonicalUrl(`/dorm/buildings/${b.slug}`)} image={bImg}
                jsonLd={buildingJsonLd(b, bCamp, lowest?.n)}>
      {back}
      <header className="dm-bhead">
        <div className="dm-bbanner">
          <ProjectGallery photos={b.photos} name={b.name} fallback={(
            <>
              <img src={buildingArt(b)} alt="" />
              <span className="dm-cover-note">ภาพประกอบ</span>
            </>
          )} />
        </div>
        <div className="dm-bhead-txt dm-rise">
          {(typeLabel || zoneName) && (
            <span className="dm-bsub">
              {typeLabel}{typeLabel && zoneName ? ', ' : ''}
              {zoneName && (b.zone && b.zone !== 'other'
                ? <Link to={`/dorm/buildings?zone=${b.zone}`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>{zoneName}</Link>
                : zoneName)}
            </span>
          )}
          <h1>{b.name}</h1>
          {b.minutes_to_swu ? (
            <div className="dm-bhero">
              <Minutes minutes={b.minutes_to_swu} mode={b.travel_mode} long filled lg quiet />
              <span className="dm-small">{modeLabel(b.travel_mode)}, เป็นค่าประมาณ</span>
            </div>
          ) : null}
          <div className="dm-bhero">
            {b.overall ? <Stars value={b.overall} count={b.review_count} size={17} /> : (
              <>
                {(b.pros?.length > 0 || b.cons?.length > 0) && (
                  <button type="button" className="dm-textbtn dm-bnorev" onClick={() => setTab('reviews')}>
                    สรุปรีวิว {(b.pros?.length || 0) + (b.cons?.length || 0)} ประเด็น
                  </button>
                )}
                <button type="button" className="dm-textbtn dm-bnorev" onClick={write}>+ เขียนรีวิว</button>
              </>
            )}
            {b.active_listings > 0 && <button type="button" className="dm-textbtn dm-avail" onClick={() => setTab('rooms')}>มี {b.active_listings} ห้อง</button>}
          </div>
          {lowest && (
            <div className="dm-bprice">
              {lowest.per ? <><b>เริ่ม {baht(lowest.n)}</b><span>บาท/คน/เดือน</span></>
                : <><span>ทั้งห้อง</span><b>~{baht(lowest.n)}</b><span>บาท/เดือน</span></>}
              <span className="dm-bprice-src">จากประกาศตอนนี้</span>
            </div>
          )}
          {(chatRange || (!lowest && priceSeen)) && (
            <div className={`dm-bprice ${lowest ? 'is-second' : ''}`}>
              {chatRange ? <><b>{chatRange}</b><span>บาท/คน/เดือน</span><span className="dm-bprice-src old">เคยเห็นในแชท {chatPP.n} ประกาศ</span></>
                : <><b>{priceSeen}</b><span className="dm-bprice-src old">เคยเห็นในแชท</span></>}
            </div>
          )}
          {farApart && <p className="dm-bprice-note">ราคาต่อคนขึ้นกับแบบห้องและจำนวนคนที่หาร</p>}
          {b.official_url && (
            <a className="dm-bofficial" href={b.official_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} aria-hidden="true" />เว็บโครงการ
            </a>
          )}
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={setTab} className="dm-btabs">
        <Tabs.List className="dm-tabs-list" aria-label="ข้อมูลตึก">
          <Tabs.Trigger value="overview" className="dm-tab">ภาพรวม</Tabs.Trigger>
          <Tabs.Trigger value="rooms" className="dm-tab">ห้อง{b.active_listings > 0 && <span className="dm-badge-n">{b.active_listings}</span>}</Tabs.Trigger>
          <Tabs.Trigger value="reviews" className="dm-tab">{b.review_count > 0 ? <>รีวิว<span className="dm-badge-n">{b.review_count}</span></> : 'รีวิวและจุดเด่น'}</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" className="dm-tabpane">
          <div className="dm-cols">
            {b.overall ? (
              <div className="dm-box dm-scorebox">
                <div className="dm-scorebox-top">
                  <b className="dm-score">{b.overall}</b>
                  <div>
                    <span className="dm-starrow" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} fill="currentColor" strokeWidth={0} className={n <= Math.round(b.overall) ? 'on' : ''} />)}
                    </span>
                    <div className="dm-small dm-muted">จาก {b.review_count} รีวิวของคนที่อยู่จริง</div>
                  </div>
                </div>
                <div className="dm-bars">
                  {aspects.map((a) => b.ratings_avg?.[a.id] && (
                    <div key={a.id} className="dm-bar">
                      <span>{a.label}</span><i><em style={{ width: `${(b.ratings_avg[a.id] / 5) * 100}%` }} /></i><b>{b.ratings_avg[a.id]}</b>
                    </div>
                  ))}
                </div>
                <button type="button" className="dm-textbtn" onClick={() => setTab('reviews')}>อ่านรีวิวทั้งหมด</button>
              </div>
            ) : null}

            <div className="dm-box dm-chatbox">
              <div className="dm-chatbox-head">
                <b>{b.web_review_summary ? 'สรุปจากแชทและรีวิวสาธารณะ' : 'สรุปจากแชทกลุ่ม'}</b>
                <span className="dm-pill line">ข้อมูลอ้างอิง</span>
              </div>
              {b.transit && <p className="dm-chatline"><TrainFront size={16} aria-hidden="true" /><span>{b.transit}</span></p>}
              {b.price_seen && !chatRange && <p className="dm-chatline"><span className="dm-chatline-k">ราคาที่เห็น</span><span>{b.price_seen}</span></p>}
              {b.web_review_summary && <p className="dm-webrev-sum">{b.web_review_summary}</p>}
              {b.pros?.length > 0 && <div className="dm-procon ok">{b.pros.map((p) => <span key={p}><ThumbsUp size={14} aria-hidden="true" />{p}</span>)}</div>}
              {b.cons?.length > 0 && <div className="dm-procon warn">{b.cons.map((p) => <span key={p}><TriangleAlert size={14} aria-hidden="true" />{p}</span>)}</div>}
              {!b.transit && !(b.price_seen && !chatRange) && !b.web_review_summary && !b.pros?.length && !b.cons?.length && <p className="dm-muted dm-small">ยังไม่มีข้อมูลจากแชท</p>}
              <div className="dm-webrev-foot">
                {b.web_review_sources?.length > 0 && <span className="dm-tiny dm-muted">สรุปจาก {b.web_review_sources.join(', ')}</span>}
                <a className="dm-webrev-gmaps" href={mapsUrl(b.name)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} aria-hidden="true" />อ่านรีวิวบน Google Maps
                </a>
              </div>
            </div>
            {!b.overall && <FirstReview name={b.name} onWrite={write} compact />}
          </div>
          {chat.count > 0 && <ChatPrices slug={b.slug} chat={chat} />}
          <div className="dm-bmap"><MapCard name={b.name} mode={b.travel_mode} /></div>
        </Tabs.Content>

        <Tabs.Content value="rooms" className="dm-tabpane">
          {(() => {
            const closedList = d.closed_listings || [];
            return (
              <>
                {d.listings.length > 0 ? (
                  <>
                    <div className="dm-sec-head">
                      <span className="dm-small dm-muted">มี {d.listings.length} ห้องที่ประกาศอยู่</span>
                      <div className="dm-actions" style={{ alignItems: 'center' }}>
                        {closedList.length > 0 && (
                          <button type="button" className={`dm-chip ${showClosed ? 'on' : ''}`} onClick={() => setShowClosed((v) => !v)} aria-pressed={showClosed}>
                            <History size={14} aria-hidden="true" />รวมห้องที่ออกไปแล้ว ({closedList.length})
                          </button>
                        )}
                        <Link to={`/dorm/post?building=${b.slug}`}>ลงประกาศในตึกนี้</Link>
                      </div>
                    </div>
                    <div className="dm-grid three">{[...d.listings].sort((x, y) => (x.price_total || 0) - (y.price_total || 0)).map((x, i) => <ListingCard key={x.id} x={x} i={Math.min(i, 6)} />)}</div>
                  </>
                ) : (
                  <Empty title="ตอนนี้ยังไม่มีห้องว่างในตึกนี้" art={`${ART}/cover-transfer.svg`}
                         action={(
                           <div className="dm-actions" style={{ justifyContent: 'center' }}>
                             <Link to={`/dorm/post?building=${b.slug}`} className="dm-btn dm-btn-tint"><Plus size={17} aria-hidden="true" />ลงประกาศในตึกนี้</Link>
                             {closedList.length > 0 && (
                               <button type="button" className={`dm-btn ${showClosed ? 'dm-btn-ink' : 'dm-btn-quiet'}`} onClick={() => setShowClosed((v) => !v)}>
                                 <History size={16} aria-hidden="true" />{showClosed ? 'ซ่อนห้องที่ออกไปแล้ว' : `ดูราคาห้องที่ออกไปแล้ว (${closedList.length})`}
                               </button>
                             )}
                           </div>
                         )}>
                    ถ้าคุณมีห้องที่นี่ ลงประกาศได้ฟรี
                  </Empty>
                )}
                {showClosed && closedList.length > 0 && (
                  <div className="dm-bclosed-sec">
                    <div className="dm-sec-head">
                      <span className="dm-small dm-muted">ห้องที่ออกไปแล้ว (อ้างอิงราคา 90 วันล่าสุด)</span>
                    </div>
                    <div className="dm-grid three">
                      {closedList.map((x, i) => <ListingCard key={x.id} x={x} i={Math.min(i, 6)} />)}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </Tabs.Content>

        <Tabs.Content value="reviews" className="dm-tabpane">
          {(b.web_review_summary || b.pros?.length > 0 || b.cons?.length > 0) && (
            <div className="dm-box dm-chatbox" style={{ marginBottom: 16 }}>
              <div className="dm-chatbox-head">
                <b>สรุปรีวิวสาธารณะ</b>
                <span className="dm-pill line">ข้อมูลอ้างอิง</span>
              </div>
              {b.web_review_summary && <p className="dm-webrev-sum">{b.web_review_summary}</p>}
              {b.pros?.length > 0 && <div className="dm-procon ok">{b.pros.map((p) => <span key={p}><ThumbsUp size={14} aria-hidden="true" />{p}</span>)}</div>}
              {b.cons?.length > 0 && <div className="dm-procon warn">{b.cons.map((p) => <span key={p}><TriangleAlert size={14} aria-hidden="true" />{p}</span>)}</div>}
              <div className="dm-webrev-foot">
                {b.web_review_sources?.length > 0 && <span className="dm-tiny dm-muted">สรุปจาก {b.web_review_sources.join(', ')}</span>}
                <a className="dm-webrev-gmaps" href={mapsUrl(b.name)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} aria-hidden="true" />อ่านรีวิวบน Google Maps
                </a>
              </div>
            </div>
          )}
          {!writing && d.reviews.length > 0 && (
            <div className="dm-sec-head">
              <span className="dm-small dm-muted">{d.reviews.length} รีวิวจากคนที่เคยอยู่</span>
              <button type="button" className="dm-btn dm-btn-primary dm-btn-sm" onClick={write}>
                <PenLine size={16} aria-hidden="true" />{mineR ? 'แก้รีวิวของฉัน' : 'เขียนรีวิว'}
              </button>
            </div>
          )}
          {writing && (
            <ReviewForm slug={slug} aspects={aspects} initial={mineR} onCancel={() => setWriting(false)}
                        onDone={() => { setWriting(false); toast('ขอบคุณสำหรับรีวิว'); afterChange(); }} />
          )}
          {!d.reviews.length && !writing && <FirstReview name={b.name} onWrite={write} />}
          <div className="dm-reviews">
            {d.reviews.map((r, i) => (
              <article key={r.id} className={`dm-review dm-rise ${r.is_mine ? 'is-mine' : ''}`} style={{ '--i': Math.min(i, 5) }}>
                <div className="dm-review-head">
                  <Avatar name={r.display_name} size={40} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b>{r.display_name}{r.is_mine && ' (คุณ)'}</b>
                    <div className="dm-tiny dm-muted">{r.lived_year ? `อยู่ถึงปี ${r.lived_year + 543}, ` : ''}เขียนเมื่อ {thDate(r.updated_at || r.created_at)}</div>
                  </div>
                  <Verified on={r.swu_verified} small />
                </div>
                <div className="dm-rates">
                  {Object.entries(r.ratings || {}).map(([k, v]) => (
                    <span key={k}>{labelOf(aspects, k)} <b><Star size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />{v}</b><span className="dm-sr">จาก 5</span></span>
                  ))}
                </div>
                {r.text && <p className="dm-review-text">{r.text}</p>}
                <div className="dm-review-foot">
                  {r.is_mine ? (
                    <button type="button" className="dm-textbtn dm-delrev" onClick={delMine}>
                      <Trash2 size={14} aria-hidden="true" />ลบรีวิวของฉัน
                    </button>
                  ) : <ReportButton type="review" id={r.id} />}
                </div>
              </article>
            ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </DormLayout>
  );
}

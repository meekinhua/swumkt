import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { RotateCw, Search, X } from 'lucide-react';
import DormLayout, {
  BuildingCard, ChipRow, Empty, Note, PageHead, RoomsSwitch, SkeletonBuildingCard, lowestPrice, zoneDot, zoneShort,
} from './DormLayout';
import { API, labelOf, useDormMeta } from './dormApi';

const TYPE = { condo: 'คอนโด', apartment: 'อพาร์ตเมนต์', dorm: 'หอพัก' };
const ART = '/dorm/illustrations';
// nearest first; buildings without a travel estimate go last, then busier ones first
const byMinutes = (a, b) => (a.minutes_to_swu || 999) - (b.minutes_to_swu || 999)
  || (b.active_listings || 0) - (a.active_listings || 0) || (b.review_count || 0) - (a.review_count || 0);

export default function DormBuildingsPage() {
  const meta = useDormMeta();
  // zone and search live in the URL (replace, not push), so back from a building returns to the same list
  const [params, setParams] = useSearchParams();
  const zone = params.get('zone') || '';
  const q = params.get('q') || '';
  const [text, setText] = useState(q);
  // build from the live URL: router navigations render in a transition, so `params` may be a render behind
  const setUrl = (obj) => {
    const n = new URLSearchParams(window.location.search);
    Object.entries(obj).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    setParams(n, { replace: true });
  };
  const setZone = (v) => setUrl({ zone: v });
  const setQ = (v) => { if (v !== (new URLSearchParams(window.location.search).get('q') || '')) setUrl({ q: v }); };
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);
  const [lowest, setLowest] = useState({});
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef(null);

  // search as you type (debounced); the server also matches each building's aliases
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 280);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    setLoading(true); setErr(false);
    const ctl = new AbortController();
    axios.get(`${API}/buildings`, { params: { ...(zone && { zone }), ...(q && { q }) }, signal: ctl.signal })
      .then((r) => { setItems([...r.data.items].sort(byMinutes)); setLoading(false); })
      .catch((e) => { if (!axios.isCancel(e)) { setErr(true); setLoading(false); } });
    return () => ctl.abort();
  }, [zone, q, retry]);
  // lowest active price per building (per person when shared), from the same public listings feed
  useEffect(() => {
    // the whole feed (max 300, like the rooms page), so no building's cheapest room is cut off
    axios.get(`${API}/listings`, { params: { limit: 300, sort: 'price' } }).then((r) => {
      const by = {};
      r.data.items.forEach((x) => { if (x.building_slug) (by[x.building_slug] = by[x.building_slug] || []).push(x); });
      setLowest(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, lowestPrice(v)])));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: '-57px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const zones = [{ id: '', label: 'ทุกโซน' }, ...(meta?.zones || []).filter((z) => z.id !== 'other').map((z) => ({ id: z.id, label: zoneShort(z.label), dot: zoneDot(z.id) }))];
  const clear = () => { setText(''); setUrl({ q: '', zone: '' }); };

  let body;
  if (err && !items) {
    body = (
      <Empty title="โหลดรายชื่อตึกไม่สำเร็จ" art={`${ART}/bldg-condo-2.svg`}
             action={<button type="button" className="dm-btn dm-btn-tint" onClick={() => setRetry((n) => n + 1)}><RotateCw size={17} aria-hidden="true" />ลองอีกครั้ง</button>}>
        เน็ตอาจหลุดไปแป๊บหนึ่ง ลองโหลดใหม่ได้เลย
      </Empty>
    );
  } else if (!items) {
    body = <div className="dm-bgrid" aria-busy="true" aria-label="กำลังโหลด">{[0, 1, 2, 3, 4, 5].map((i) => <SkeletonBuildingCard key={i} tall />)}</div>;
  } else if (items.length) {
    body = (
      <div className={`dm-bgrid ${loading ? 'is-stale' : ''}`} aria-busy={loading}>
        {items.map((b, i) => (
          <BuildingCard key={b.slug} b={b} tall i={Math.min(i, 6)} priceFrom={lowest[b.slug]}
                        sub={[TYPE[b.type], zoneShort(labelOf(meta?.zones, b.zone))].filter(Boolean).join(', ')} />
        ))}
      </div>
    );
  } else {
    body = (
      <Empty title={q ? `ไม่เจอตึก “${q}”` : 'ยังไม่มีตึกในโซนนี้'} art={`${ART}/bldg-apartment.svg`} className={loading ? 'is-stale' : ''}
             action={<button type="button" className="dm-btn dm-btn-tint" onClick={clear}>ดูทุกตึก</button>}>
        ตึกที่ไม่มีในคู่มือ ยัง<Link to="/dorm/post">ลงประกาศ</Link>โดยพิมพ์ชื่อตึกเองได้
      </Empty>
    );
  }

  return (
    <DormLayout title="รีวิวตึก">
      <PageHead title="รีวิวตึก" action={<RoomsSwitch current="buildings" zone={zone} />} className="dm-rooms-head" />

      <div ref={sentinel} className="dm-strip-sentinel" aria-hidden="true" />
      <div className={`dm-strip dm-bstrip ${stuck ? 'is-stuck' : ''}`}>
        <div className="dm-search-input dm-bsearch">
          <Search size={17} aria-hidden="true" />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="ค้นชื่อตึก" aria-label="ค้นชื่อตึก" enterKeyHint="search"
                 onKeyDown={(e) => { if (e.key === 'Enter') { setQ(text.trim()); e.currentTarget.blur(); } }} />
          {text && <button type="button" className="dm-bsearch-x" onClick={() => setText('')} aria-label="ล้างคำค้น"><X size={16} aria-hidden="true" /></button>}
        </div>
        <ChipRow options={zones} value={zone} onChange={setZone} label="โซน" className="dm-bzones" />
      </div>

      <div className="dm-countline">
        <span className="dm-count">{items ? <><b>{items.length}</b> ตึก{items.length > 1 && <span className="dm-muted dm-small">เรียงจากใกล้ มศว</span>}</> : <span className="dm-muted">กำลังโหลด</span>}{loading && items && <i className="dm-spin" aria-hidden="true" />}</span>
      </div>

      {body}

      <Note className="dm-bnote">
        ข้อมูลตั้งต้นสรุปจากแชทกลุ่ม OpenChat ยังไม่ได้ยืนยันทุกข้อ เวลาเดินทางเป็นค่าประมาณ ถ้าเคยอยู่ตึกไหน ช่วยรีวิวให้รุ่นน้องได้เลย
      </Note>
    </DormLayout>
  );
}

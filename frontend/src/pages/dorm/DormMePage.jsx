import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import * as Tabs from '@radix-ui/react-tabs';
import {
  BadgeCheck, Check, CircleAlert, Eye, HandHeart, HeartHandshake, ImagePlus, LogOut, Megaphone, MessageCircle, Pencil, Plus, Power, RotateCw, Share2, ShieldCheck, Trash2, TriangleAlert, Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DormLayout, {
  Avatar, Cover, Empty, ListingCard, MateCard, PageHead, Pick, Seg, SelectBox, Sheet, Skeleton, SkeletonGrid, buildingThumb, coverFor, realPhotos, useShell,
} from './DormLayout';
import { InboxPanel } from './DormChat';
import {
  API, ISEEN_EVENT, authHeaders, baht, daysLeft, errMsg, invalidateBuildings, lineShareUrl, priceLine, priceView, readInterestSeen, shareTextFor, thDate, upcomingMonths, useBuildings,
  useDormMeta, useSaved, useSavedListings,
} from './dormApi';

const ART = '/dorm/illustrations';
const MATE_DRAFT_KEY = 'dorm_mate_draft_v1';
const readMateDraft = () => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(MATE_DRAFT_KEY) || 'null');
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
};
const writeMateDraft = (val) => {
  try { sessionStorage.setItem(MATE_DRAFT_KEY, JSON.stringify(val)); } catch { /* storage blocked */ }
};
const dropMateDraft = () => {
  try { sessionStorage.removeItem(MATE_DRAFT_KEY); } catch { /* storage blocked */ }
};
// Nothing preselected: testers nearly saved the wrong gender when it defaulted.
const BLANK = {
  display_name: '', gender: '', mate_gender_pref: '', year: '', faculty: '',
  budget_min: '', budget_max: '', zones: [], move_in: '', has_room: null,
  room_note: '', tags: [], about: '', contact_line: '', contact_ig: '', consent: false,
};
const STEPS = ['เกี่ยวกับคุณ', 'ห้องที่อยากได้', 'นิสัยและติดต่อ'];
const TABS = ['listings', 'chat', 'mate', 'interests', 'saved'];
const FieldErr = ({ msg }) => (msg ? <span className="dm-field-err" role="alert"><CircleAlert size={15} aria-hidden="true" />{msg}</span> : null);
const GOOGLE_CLIENT_ID = '949663376782-cd9128nvekdavpu09mko30rfn9c2kre4.apps.googleusercontent.com';
const swuVerified = (u) => u?.auth_method === 'google' && /(^|\.|@)swu\.ac\.th$/i.test(u?.email || '');

// Dedicated Google Sign-In button inside VerifySheet: chooses @g.swu.ac.th without replacing the user's personal session.
const SwuGoogleVerifyButton = ({ clientId, token, onVerified, onError }) => {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const onVerifiedRef = useRef(onVerified);
  const onErrorRef = useRef(onError);
  onVerifiedRef.current = onVerified;
  onErrorRef.current = onError;
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(() => !!(typeof window !== 'undefined' && window.google?.accounts?.id));

  useEffect(() => {
    let alive = true;
    const initAndRender = () => {
      if (!alive || !window.google?.accounts?.id || !btnRef.current) return;
      setReady(true);
      onErrorRef.current('');
      window.google.accounts.id.initialize({
        client_id: clientId || GOOGLE_CLIENT_ID,
        auto_select: false,
        ux_mode: 'popup',
        callback: async (response) => {
          if (!response?.credential) return;
          setBusy(true);
          onErrorRef.current('');
          try {
            const r = await axios.post(`${API}/verify/google-link`, { credential: response.credential }, authHeaders(token));
            onVerifiedRef.current(r.data.verification);
          } catch (e) {
            onErrorRef.current(errMsg(e, 'ยืนยันบัญชี Google มศว ไม่สำเร็จ ลองอีกครั้ง'));
          } finally {
            setBusy(false);
          }
        },
      });
      const w = Math.max(220, Math.min(340, Math.floor((wrapRef.current?.clientWidth || 320) - 28)));
      btnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(btnRef.current, {
        type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'th', width: w,
      });
    };
    const onLoadErr = () => {
      if (alive) onErrorRef.current('โหลดปุ่ม Google ไม่สำเร็จ กรุณาปิดตัวบล็อกโฆษณาหรือรีเฟรชหน้าแล้วลองใหม่');
    };

    if (window.google?.accounts?.id) {
      initAndRender();
      return () => { alive = false; };
    }
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', initAndRender);
    script.addEventListener('error', onLoadErr);
    if (window.google?.accounts?.id) initAndRender();
    return () => {
      alive = false;
      script.removeEventListener('load', initAndRender);
      script.removeEventListener('error', onLoadErr);
    };
  }, [clientId, token]);

  return (
    <div ref={wrapRef} className="dm-gverify-box" data-testid="dorm-google-verify-box">
      <div className="dm-gverify-btnwrap">
        <div ref={btnRef} aria-label="เข้าสู่ระบบด้วยบัญชี Google มศว" />
      </div>
      {!ready && <p className="dm-tiny dm-muted" style={{ textAlign: 'center', margin: 0 }}>กำลังโหลดปุ่ม Google...</p>}
      {busy && <p className="dm-tiny" style={{ textAlign: 'center', margin: 0, color: 'var(--khlong-ink)' }}>กำลังตรวจสอบอีเมล @g.swu.ac.th...</p>}
    </div>
  );
};

// Slim progress bar with step names (same look as the post form).
const Progress = ({ steps, step }) => (
  <div className="dm-prog" role="group" aria-label={`ขั้นที่ ${step + 1} จาก ${steps.length}: ${steps[step]}`}>
    <div className="dm-prog-bar"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
    <ol className="dm-prog-steps" aria-hidden="true">
      {steps.map((s, i) => (
        <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{i < step && <Check size={13} strokeWidth={2.6} />}{s}</li>
      ))}
    </ol>
  </div>
);

const SavedRooms = ({ guest = false }) => {
  const saved = useSavedListings();
  if (saved === null) return <SkeletonGrid n={2} className="dm-grid three" list />;
  if (!saved.length) {
    return (
      <Empty title="ยังไม่ได้เก็บห้องไว้" art={`${ART}/empty-saved.svg`}
             action={<Link to="/dorm/rooms" className={`dm-btn ${guest ? 'dm-btn-ink' : 'dm-btn-quiet'}`}>ดูห้องว่าง</Link>}>
        แตะหัวใจที่ห้องที่สนใจ แล้วกลับมาดูที่นี่
      </Empty>
    );
  }
  return <div className="dm-grid three">{saved.map((x, i) => <ListingCard key={x.id} x={x} list i={i} />)}</div>;
};

// Rooms I pressed "สนใจ หาเมทห้องนี้" on: public (others see me there), unlike the private saved list.
const MyInterests = ({ items, token, onGone }) => {
  const { toast, confirm } = useShell();
  if (!items.length) {
    return (
      <Empty title="ยังไม่ได้กดสนใจห้องไหน" art={`${ART}/empty-mates.svg`}
             action={<Link to="/dorm/rooms?interested=1" className="dm-btn dm-btn-ink">ดูห้องที่มีคนรอหาร</Link>}>
        กดสนใจ หาเมทห้องนี้ ที่หน้าห้อง แล้วคนที่สนใจห้องเดียวกันจะเห็นคุณ
      </Empty>
    );
  }
  const withdraw = async (x) => {
    const ok = await confirm({ title: 'ถอนความสนใจห้องนี้?', body: 'การ์ดของคุณจะหายจากรายชื่อคนที่สนใจห้องนี้ กดสนใจใหม่ได้ทุกเมื่อ', action: 'ถอนความสนใจ' });
    if (!ok) return;
    try {
      await axios.delete(`${API}/listings/${x.id}/interest`, authHeaders(token));
      onGone(x.id);
      toast('ถอนความสนใจแล้ว');
    } catch (e) { toast(errMsg(e)); }
  };
  return (
    <>
      <p className="dm-small dm-muted dm-me-ihint"><HandHeart size={15} aria-hidden="true" />คนที่สนใจห้องเดียวกันเห็นการ์ดของคุณ ต่างจากที่เก็บไว้ซึ่งเห็นแค่คุณ</p>
      <div className="dm-grid three">
        {items.map((x, i) => {
          const otherCount = Math.max(0, (x.interest_people || 0) - (x.my_interest?.party_size || 1));
          const matchCount = x.interest_match ?? otherCount;
          return (
            <div key={x.id} className="dm-myint">
              <ListingCard x={x} list i={i} />
              <div className="dm-myint-acts">
                {otherCount > 0 ? (
                  <Link to={`/dorm/rooms/${x.id}#interested`} className="dm-btn dm-btn-tint dm-btn-sm">
                    <MessageCircle size={14} aria-hidden="true" />ทักคนที่สนใจ ({matchCount > 0 ? matchCount : otherCount} คน)
                  </Link>
                ) : (
                  <span className="dm-small dm-muted">รอคนอื่นมากดสนใจห้องนี้</span>
                )}
                <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => withdraw(x)} data-testid="dorm-my-interest-withdraw">ถอนความสนใจ</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

const MyListing = ({ x, token, patch, reload, remove }) => {
  const { toast, confirm } = useShell();
  const pv = priceView(x);
  // interest the owner has not opened yet (same marker as the nav dot)
  const [seen, setSeen] = useState(() => readInterestSeen()[x.id] || 0);
  useEffect(() => {
    const on = () => setSeen(readInterestSeen()[x.id] || 0);
    window.addEventListener(ISEEN_EVENT, on);
    return () => window.removeEventListener(ISEEN_EVENT, on);
  }, [x.id]);
  const nInt = Number(x.interest_people) || 0;
  const buildings = useBuildings();
  const bld = x.building_slug ? (buildings || []).find((b) => b.slug === x.building_slug) : null;
  const bThumb = buildingThumb(bld);
  const noPhotos = !realPhotos(x).length;
  const d = daysLeft(x.expires_at);
  const rd = x.status === 'reserved' && x.reserved_until ? daysLeft(x.reserved_until) : null;
  // closed by an admin (moderation): the owner can't reopen it, only delete it
  const adminClosed = x.status === 'closed' && x.closed_by === 'admin';
  const autoModerated = x.status === 'closed' && x.closed_reason === 'auto_moderated';
  const pausedUnconfirmed = x.status === 'closed' && x.closed_reason === 'paused_unconfirmed';
  const ttlDays = x.kind === 'mate_wanted' || x.kind === 'transfer' ? 14 : 30;
  const [state, cls] = adminClosed ? ['แอดมินปิดไว้', 'off']
    : autoModerated ? ['พักชั่วคราว (มีผู้รายงาน)', 'off']
      : pausedUnconfirmed ? ['พักรอเจ้าของยืนยัน', 'hold']
        : x.status === 'closed' ? ['ปิดแล้ว', 'off'] : x.expired ? ['หมดอายุ', 'off']
          : x.status === 'reserved' ? ['มีคนจองแล้ว', 'hold'] : ['แสดงอยู่', 'live'];
  const visible = x.status !== 'closed' && !x.expired;
  // anything that changes what others see also refreshes the building room counts
  const call = async (fn) => {
    try { await fn(); invalidateBuildings(); } catch (e) { toast(errMsg(e)); reload(); }
  };
  const post = (path, body) => axios.post(`${API}/listings/${x.id}/${path}`, body, authHeaders(token));
  const renew = () => call(async () => {
    const r = await post('renew', {});
    patch(x.id, { expires_at: r.data.expires_at, expired: false, owner_confirm_needed: false, gone_reports: 0 });
    toast(`ต่ออายุแล้ว แสดงถึง ${thDate(r.data.expires_at)}`);
  });
  const confirmOpen = () => call(async () => {
    const r = await post('confirm-available', {});
    patch(x.id, { status: 'active', expires_at: r.data.expires_at, expired: false, owner_confirm_needed: false, gone_reports: 0, closed_reason: null, reserved_until: null });
    toast(`ยืนยันแล้ว! แสดงถึง ${thDate(r.data.expires_at)}`);
  });
  const setStatus = (status, msg) => call(async () => { await post('status', { status }); patch(x.id, { status, owner_confirm_needed: false }); toast(msg); });
  const reopen = () => call(async () => {
    await post('status', { status: 'active' });
    const r = await post('renew', {});
    patch(x.id, { status: 'active', expires_at: r.data.expires_at, expired: false, owner_confirm_needed: false, gone_reports: 0 });
    toast(`เปิดประกาศอีกครั้งแล้ว แสดงถึง ${thDate(r.data.expires_at)}`);
  });
  const close = async () => {
    const ok = await confirm({ title: 'ปิดประกาศนี้?', body: 'คนอื่นจะไม่เห็นประกาศนี้อีก เปิดใหม่ได้ภายหลังจากหน้านี้', action: 'ปิดประกาศ', danger: true });
    if (ok) setStatus('closed', 'ปิดประกาศแล้ว');
  };
  // closed listings only: gone for good, with its photos (they would otherwise pile up here)
  const del = async () => {
    const ok = await confirm({ title: 'ลบประกาศนี้ถาวร?', body: 'ประกาศ รูป และสถิติของประกาศนี้จะหายไปและกู้คืนไม่ได้', action: 'ลบประกาศ', danger: true });
    if (!ok) return;
    call(async () => { await axios.delete(`${API}/listings/${x.id}`, authHeaders(token)); remove(x.id); toast('ลบประกาศแล้ว'); });
  };
  return (
    <div className="dm-myrow" data-testid="dorm-my-listing">
      <div className="dm-myrow-top">
        <Link to={`/dorm/rooms/${x.id}`} className="dm-myrow-thumb" tabIndex={-1} aria-hidden="true"><Cover x={x} note={false} building={bld} /></Link>
        <div className="dm-myrow-main">
          <span className={`dm-status ${cls}`}><i aria-hidden="true" />{state}</span>
          {/* original title on purpose (no demo stripping where the owner manages it) */}
          <Link to={`/dorm/rooms/${x.id}`} className="dm-myrow-title">{x.title}</Link>
          <div className="dm-stats">
            {visible && rd != null && rd > 0 && <span>จองต่ออีก <b>{rd}</b> วัน</span>}
            {visible && rd == null && d != null && <span title={x.expires_at ? `หมดอายุ ${thDate(x.expires_at)}` : undefined}>เหลือ <b>{d}</b> วัน{d <= 3 ? ' (ใกล้หมดอายุ)' : ''}</span>}
            <span title="จำนวนครั้งที่มีคนเปิดดู"><Eye size={14} aria-hidden="true" /><b>{x.views || 0}</b> เปิดดู</span>
            <span title="จำนวนครั้งที่มีคนกดดูช่องทางติดต่อ"><MessageCircle size={14} aria-hidden="true" /><b>{x.contact_reveals || 0}</b> ทัก</span>
            <Link to={`/dorm/rooms/${x.id}#interested`} className="dm-myrow-int" title="คนที่กดสนใจประกาศนี้" data-testid="dorm-my-listing-interest"
                  aria-label={`${nInt} คนสนใจ${nInt > seen ? ' มีคนใหม่' : ''}`}>
              <HandHeart size={14} aria-hidden="true" /><b>{nInt}</b> คนสนใจ{nInt > seen && <span className="dm-nav-dot" aria-hidden="true" />}
            </Link>
            {pv ? <span><b>{baht(pv.head)}</b> {pv.unit}</span> : null}
          </div>
        </div>
      </div>
      <div className="dm-myrow-acts">
        {(adminClosed || autoModerated) ? null : pausedUnconfirmed ? (
          <button type="button" className="dm-btn dm-btn-ink dm-btn-sm" onClick={confirmOpen} aria-label="ยืนยันว่ายังว่างและเปิดอีกครั้ง"><Check size={15} aria-hidden="true" />ยืนยันยังว่าง</button>
        ) : x.status === 'closed' ? (
          <button type="button" className="dm-btn dm-btn-ink dm-btn-sm" onClick={reopen} aria-label="เปิดประกาศอีกครั้ง"><RotateCw size={15} aria-hidden="true" />เปิดใหม่</button>
        ) : (
          <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={renew} aria-label={`ต่ออายุ ${ttlDays} วัน`}><RotateCw size={15} aria-hidden="true" />ต่ออายุ</button>
        )}
        <Link to={`/dorm/post?edit=${x.id}`} className="dm-btn dm-btn-quiet dm-btn-sm"><Pencil size={15} aria-hidden="true" />แก้ไข</Link>
        {x.status !== 'closed' ? <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={close} aria-label="ปิดประกาศ"><Power size={15} aria-hidden="true" />ปิด</button>
          : <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-btn-del" onClick={del} aria-label="ลบประกาศนี้ถาวร"><Trash2 size={15} aria-hidden="true" />ลบ</button>}
      </div>
      {(x.owner_confirm_needed || pausedUnconfirmed) && !adminClosed && !autoModerated && (
        <div className="dm-myrow-warnbanner" role="alert" data-testid="dorm-owner-confirm-banner">
          <span><TriangleAlert size={15} aria-hidden="true" />{pausedUnconfirmed ? 'ประกาศถูกพักเพราะยังไม่ได้ยืนยันภายใน 48 ชม.' : 'มีคนแจ้งว่าห้องนี้อาจไม่ว่าง — ยังว่างอยู่ไหม?'}</span>
          <div className="dm-actions">
            <button type="button" className="dm-btn dm-btn-ink dm-btn-sm" onClick={confirmOpen}>ยังว่างอยู่ (+{ttlDays} วัน)</button>
            {x.status !== 'closed' && <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => setStatus('closed', 'ปิดประกาศแล้ว')}>ปิดประกาศ</button>}
          </div>
        </div>
      )}
      {nInt > 0 && visible && (
        <div className="dm-myrow-intbanner">
          <span><HandHeart size={15} aria-hidden="true" />มีคนสนใจประกาศนี้ <b>{nInt}</b> คน{nInt > seen ? ' (ใหม่)' : ''}</span>
          <Link to={`/dorm/rooms/${x.id}#interested`} className="dm-btn dm-btn-primary dm-btn-sm">ดูและทักคุย</Link>
        </div>
      )}
      {(adminClosed || autoModerated) && (
        <p className="dm-myrow-note" role="note" data-testid="dorm-admin-closed">
          {autoModerated
            ? 'ประกาศถูกพักชั่วคราวเนื่องจากมีผู้รายงานหลายคน หากคิดว่าผิดพลาด แจ้งแอดมินเพื่อตรวจสอบและเปิดคืนได้'
            : 'แอดมินปิดประกาศนี้ไว้ เปิดเองไม่ได้ ถ้าคิดว่าปิดผิด แจ้งแอดมินในกลุ่ม OpenChat ได้'}
        </p>
      )}
      {noPhotos && x.status !== 'closed' && (
        <div className="dm-nophoto">
          <span>ยังไม่มีรูปห้อง ตอนนี้ใช้{bThumb ? 'ภาพโครงการ' : 'ภาพประกอบ'}แทน</span>
          <Link to={`/dorm/post?edit=${x.id}&step=3`} className="dm-btn dm-btn-tint dm-btn-sm"><ImagePlus size={15} aria-hidden="true" />เพิ่มรูปห้อง</Link>
        </div>
      )}
      {visible && (
        <div className="dm-myrow-more">
          <a href={lineShareUrl(shareTextFor(x))} target="_blank" rel="noreferrer"><Share2 size={15} aria-hidden="true" />แชร์ LINE</a>
          {x.status === 'active' && <button type="button" className="dm-textbtn" onClick={() => setStatus('reserved', 'ติดป้ายมีคนจองแล้ว')}>ติดป้ายมีคนจองแล้ว</button>}
          {x.status === 'reserved' && <button type="button" className="dm-textbtn" onClick={() => setStatus('active', 'เปิดรับอีกครั้งแล้ว')}>เปิดรับอีกครั้ง</button>}
        </div>
      )}
    </div>
  );
};

const VERIFY_KINDS = [
  { id: 'freshman', label: 'นิสิตเข้าใหม่ (ยังไม่มีเมล ม.)' },
  { id: 'alumni', label: 'ศิษย์เก่า (เมล ม. หมดอายุ)' },
  { id: 'student', label: 'นิสิตปัจจุบัน (มีเมล ม.)' },
];

const VerifySheet = ({ verification, userEmail, token, onClose, onDone }) => {
  const { toast } = useShell();
  const smtp = !!verification?.smtp_enabled;
  const googleClientId = verification?.google_client_id || GOOGLE_CLIENT_ID;
  const [mode, setMode] = useState('google');
  const [swuEmail, setSwuEmail] = useState(verification?.swu_email || '');
  const [otpSent, setOtpSent] = useState(verification?.status === 'otp_sent');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState(verification?.kind || 'freshman');
  const [faculty, setFaculty] = useState('');
  const [entryYear, setEntryYear] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const sendOtp = async () => {
    setBusy(true); setErr('');
    try {
      await axios.post(`${API}/verify/swu-email/request`, { swu_email: swuEmail.trim() }, authHeaders(token));
      setOtpSent(true);
      toast('ส่งรหัส 6 หลักไปที่อีเมล มศว แล้ว');
    } catch (e) { setErr(errMsg(e, 'ส่งรหัสไม่สำเร็จ')); }
    setBusy(false);
  };
  const confirmOtp = async () => {
    setBusy(true); setErr('');
    try {
      const r = await axios.post(`${API}/verify/swu-email/confirm`, { code: code.trim() }, authHeaders(token));
      toast('ยืนยันนิสิต มศว เรียบร้อยแล้ว');
      onDone(r.data.verification);
      onClose();
    } catch (e) { setErr(errMsg(e, 'รหัสยืนยันไม่ถูกต้อง')); }
    setBusy(false);
  };
  const sendManual = async () => {
    if (faculty.trim().length < 2) { setErr('กรุณากรอกชื่อคณะหรือวิทยาลัย'); return; }
    setBusy(true); setErr('');
    try {
      const r = await axios.post(`${API}/verify/request`, {
        kind, faculty: faculty.trim(),
        entry_year: entryYear ? Number(entryYear) : null,
        swu_email: swuEmail.trim(), note: note.trim(),
      }, authHeaders(token));
      toast('ส่งคำขอยืนยันแล้ว แอดมินจะตรวจให้เร็วที่สุด');
      onDone(r.data.verification);
      onClose();
    } catch (e) { setErr(errMsg(e, 'ส่งคำขอไม่สำเร็จ')); }
    setBusy(false);
  };

  const modeOpts = [
    { id: 'google', label: 'ยืนยันด้วย @g.swu.ac.th' },
    ...(smtp ? [{ id: 'otp', label: 'รับรหัส OTP' }] : []),
    { id: 'manual', label: 'ไม่มีเมล มศว' },
  ];

  return (
    <Sheet title="ยืนยันตัวตน มศว (อัตโนมัติ)" onClose={onClose} testid="dorm-verify-sheet" modal={false}
           footer={mode === 'otp' ? (
             otpSent
               ? <button type="button" className="dm-btn dm-btn-primary" onClick={confirmOtp} disabled={busy || code.trim().length !== 6}>ยืนยันรหัส OTP</button>
               : <button type="button" className="dm-btn dm-btn-primary" onClick={sendOtp} disabled={busy || !swuEmail.trim()}>ส่งรหัสไปที่อีเมล มศว</button>
           ) : mode === 'manual' ? (
             <button type="button" className="dm-btn dm-btn-primary" onClick={sendManual} disabled={busy}>ส่งคำขอให้แอดมินตรวจ</button>
           ) : (
             <button type="button" className="dm-btn dm-btn-quiet" onClick={onClose}>ปิด</button>
           )}>
      <div className="dm-form">
        <Seg value={mode} onChange={(v) => { setMode(v); setErr(''); }} label="วิธีรับรองตัวตน" full options={modeOpts} />
        {mode === 'google' ? (
          <>
            <p className="dm-small" style={{ margin: 0, lineHeight: 1.55 }}>
              บัญชีหลักของคุณยังเป็น <b>{userEmail || 'อีเมลส่วนตัว'}</b> เหมือนเดิม — แค่ล็อกอิน Google{' '}
              <code>@g.swu.ac.th</code> ครั้งเดียว ป้ายยืนยันจะขึ้นทันทีในทุกประกาศ <b>ไม่ต้องรอแอดมิน</b>
            </p>
            <SwuGoogleVerifyButton
              clientId={googleClientId}
              token={token}
              onError={setErr}
              onVerified={(v) => {
                toast('ยืนยันนิสิต มศว เรียบร้อยแล้ว');
                onDone(v);
                onClose();
              }}
            />
            <p className="dm-tiny dm-muted" style={{ margin: 0 }}>
              หากหน้าต่าง Google ขึ้นอีเมลส่วนตัว ให้กด <b>“ใช้บัญชีอื่น”</b> แล้วเลือก <code>@g.swu.ac.th</code> (1 อีเมล มศว ยืนยันได้ 1 บัญชี)
            </p>
          </>
        ) : mode === 'otp' ? (
          <>
            <label className="dm-field"><span>อีเมล มศว ของคุณ</span>
              <input type="email" value={swuEmail} onChange={(e) => setSwuEmail(e.target.value)} placeholder="name@g.swu.ac.th" autoCapitalize="none" />
              <small>รองรับ @g.swu.ac.th และ @swu.ac.th (1 อีเมลยืนยันได้ 1 บัญชี)</small>
            </label>
            {otpSent && (
              <label className="dm-field"><span>รหัส OTP 6 หลักจากกล่องจดหมาย มศว</span>
                <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
              </label>
            )}
          </>
        ) : (
          <>
            <div className="dm-myrow-note" role="note" style={{ margin: 0 }}>
              เฉพาะนิสิตเข้าใหม่ที่ยังไม่ได้รับเมล หรือศิษย์เก่าที่เมลหมดอายุ — หากมี <code>@g.swu.ac.th</code>{' '}
              <button type="button" className="dm-textbtn" onClick={() => { setMode('google'); setErr(''); }}>กดยืนยันทันทีตรงนี้</button> ไม่ต้องรอแอดมิน
            </div>
            <div className="dm-field"><span>สถานะของคุณ</span>
              <Pick options={VERIFY_KINDS} value={kind} onChange={setKind} label="สถานะของคุณ" />
            </div>
            <label className="dm-field"><span>คณะ / วิทยาลัย</span>
              <input value={faculty} onChange={(e) => setFaculty(e.target.value)} maxLength={80} placeholder="เช่น คณะบริหารธุรกิจเพื่อสังคม" />
            </label>
            <div className="dm-two">
              <label className="dm-field"><span>ปี พ.ศ. ที่เข้าศึกษา</span>
                <input type="number" inputMode="numeric" min="2540" max="2600" value={entryYear} onChange={(e) => setEntryYear(e.target.value)} placeholder="เช่น 2569" />
              </label>
              <label className="dm-field"><span>อีเมล มศว (ถ้ามี)</span>
                <input type="email" value={swuEmail} onChange={(e) => setSwuEmail(e.target.value)} placeholder="name@g.swu.ac.th" autoCapitalize="none" />
              </label>
            </div>
            <label className="dm-field"><span>ข้อมูลเพิ่มเติมให้แอดมินช่วยยืนยัน (ไม่บังคับ)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="เช่น สาขา / รอบ TCAS ที่สอบติด / ปีที่จบ" />
            </label>
          </>
        )}
        {err && <div className="dm-err" role="alert">{err}</div>}
      </div>
    </Sheet>
  );
};

// Keyed on the token: after a sign-out and a different sign-in nothing of the previous account
// (listings, profile, half-filled form) can stay on screen.
export default function DormMePage() {
  const { token } = useAuth();
  return <MePage key={token || 'signed-out'} />;
}

function MePage() {
  const meta = useDormMeta();
  const { ids: savedIds } = useSaved();
  const { user, token, logout, loading: authLoading } = useAuth();
  const { requireLogin, toast, confirm, unreadChat, refreshUnread } = useShell();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'listings';
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [interests, setInterests] = useState([]);
  const [verification, setVerification] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [vouchOpen, setVouchOpen] = useState(false);
  const [vouchEmail, setVouchEmail] = useState('');
  const [vouchBusy, setVouchBusy] = useState(false);
  const [vouchErr, setVouchErr] = useState('');
  const [f, setF] = useState(() => ({ ...BLANK, ...(readMateDraft() || {}) }));
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});

  const load = useCallback(() => {
    if (!token) return Promise.resolve();
    return axios.get(`${API}/my`, authHeaders(token)).then((r) => {
      setProfile(r.data.profile);
      setListings(r.data.listings);
      setInterests(r.data.interests || []);
      setVerification(r.data.verification || null);
      if (r.data.profile) {
        dropMateDraft();
        setF({ ...BLANK, ...r.data.profile });
      } else {
        // prefill only from the person's own listing (never guess gender), keeping any guest draft filled in
        const l = r.data.listings.find((x) => x.status !== 'closed');
        setF((x) => ({
          ...x,
          display_name: x.display_name || (user?.full_name || '').split(' ')[0],
          ...(l && !x.move_in ? {
            has_room: true, zones: [l.zone], move_in: (l.move_in || '').slice(0, 7),
            budget_min: l.price_per_person || '', budget_max: l.price_per_person || '',
            mate_gender_pref: l.gender_pref || '', room_note: [l.building_name, l.price_total && priceLine(l)].filter(Boolean).join(', ').slice(0, 300),
          } : {}),
        }));
      }
      setLoaded(true);
    }).catch((e) => { setErr(errMsg(e)); setLoaded(true); });
  }, [token, user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = () => load();
    window.addEventListener('dorm-me-reload', on);
    return () => window.removeEventListener('dorm-me-reload', on);
  }, [load]);

  const setTab = (t) => {
    const n = new URLSearchParams(window.location.search);
    if (t === 'listings') n.delete('tab'); else n.set('tab', t);
    setParams(n, { replace: true });
  };
  const set = (k) => (v) => {
    setF((x) => {
      const nextF = { ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v };
      if (!profile) writeMateDraft(nextF);
      return nextF;
    });
    if (fe[k]) setFe((o) => ({ ...o, [k]: '' }));
  };
  const showForm = editing || !profile;
  const validate = (s) => {
    const e = {};
    if (s === 0) {
      if (!f.display_name.trim()) e.display_name = 'ใส่ชื่อเล่นที่จะแสดง';
      if (!f.gender) e.gender = 'เลือกเพศของคุณ';
      if (!f.mate_gender_pref) e.mate_gender_pref = 'เลือกว่าอยากได้เมทแบบไหน';
      if (!f.year) e.year = 'เลือกชั้นปี';
    }
    if (s === 1) {
      if (f.has_room === null || f.has_room === undefined || f.has_room === '') e.has_room = 'เลือกว่ามีห้องแล้วหรือยัง';
      if (!(Number(f.budget_min) > 0)) e.budget_min = 'ใส่งบต่ำสุด';
      if (!(Number(f.budget_max) > 0)) e.budget_max = 'ใส่งบสูงสุด';
      else if (Number(f.budget_max) < Number(f.budget_min)) e.budget_max = 'งบสูงสุดต้องไม่น้อยกว่างบต่ำสุด';
      if (!f.move_in) e.move_in = 'เลือกเดือนที่อยากย้ายเข้า';
    }
    if (s === 2) {
      if (!(f.contact_line || f.contact_ig)) e.contact_line = 'ใส่ LINE ID หรือ IG อย่างน้อยหนึ่งช่อง';
      if (!f.consent) e.consent = 'ติ๊กยินยอมก่อน โปรไฟล์จึงจะแสดงได้';
    }
    return e;
  };
  const FIELD_ID = { display_name: 'dm-m-name', gender: 'dm-m-gender', mate_gender_pref: 'dm-m-pref', year: 'dm-m-year', has_room: 'dm-m-room',
    budget_min: 'dm-m-bmin', budget_max: 'dm-m-bmax', move_in: 'dm-m-move', contact_line: 'dm-m-line', consent: 'dm-m-consent' };

  const save = async () => {
    const body = { ...f, budget_min: Number(f.budget_min), budget_max: Number(f.budget_max), has_room: !!f.has_room };
    ['id', 'user_id', 'status', 'created_at', 'renewed_at', 'expires_at', 'consented_at', 'contact_reveals', 'swu_verified'].forEach((k) => delete body[k]);
    if (!user && !token) {
      writeMateDraft(f);
      requireLogin('เข้าสู่ระบบเพื่อบันทึกโปรไฟล์ ข้อมูลที่กรอกไว้ยังอยู่ครบ', async () => {
        try {
          await axios.put(`${API}/mates/me`, body, authHeaders(localStorage.getItem('token')));
          dropMateDraft();
          toast('สร้างโปรไฟล์แล้ว แสดง 30 วัน');
          window.dispatchEvent(new Event('dorm-me-reload'));
        } catch (e) { setErr(errMsg(e, 'บันทึกไม่สำเร็จ')); }
      });
      return;
    }
    try {
      await axios.put(`${API}/mates/me`, body, authHeaders(token || localStorage.getItem('token')));
      dropMateDraft();
      toast(profile ? 'บันทึกโปรไฟล์แล้ว' : 'สร้างโปรไฟล์แล้ว แสดง 30 วัน');
      setEditing(false); setStep(0); setErr('');
      window.scrollTo({ top: 0 });
      await load();
      window.scrollTo({ top: 0 });
    } catch (e) { setErr(errMsg(e, 'บันทึกไม่สำเร็จ')); }
  };
  const next = () => {
    const e = validate(step);
    setFe(e);
    const first = Object.keys(e)[0];
    if (first) {
      const el = document.getElementById(FIELD_ID[first]);
      if (el) { (el.matches('input') ? el : el.querySelector('button,input') || el).focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (step < 2) { setStep(step + 1); window.scrollTo({ top: 0 }); } else save();
  };
  const genderOpts = (meta?.genders || []);

  const mateFormUI = (
    <>
      {!profile && (
        <p className="dm-mate-intro"><HeartHandshake size={17} aria-hidden="true" />
          <span>ไม่บังคับ สร้างไว้ให้คนที่หาเมทเจอคุณ และรายชื่อเมทจะเรียงตามความเข้ากันกับคุณ</span>
        </p>
      )}
      <Progress steps={STEPS} step={step} />
      <div className="dm-layout-form">
        <div className="dm-formcard dm-form dm-formpad" data-testid="dorm-mate-form">
          <h2 className="dm-step-title">{profile ? 'แก้ไขโปรไฟล์' : 'สร้างโปรไฟล์'}: {STEPS[step]}</h2>
          {step === 0 && (
            <>
              <label className="dm-field"><span>ชื่อเล่นที่จะแสดง</span>
                <input id="dm-m-name" value={f.display_name} onChange={set('display_name')} maxLength={40} className={fe.display_name ? 'is-invalid' : ''} aria-invalid={!!fe.display_name} />
                <FieldErr msg={fe.display_name} />
              </label>
              <div className="dm-field"><span>คุณเป็น</span>
                <Pick id="dm-m-gender" options={genderOpts} value={f.gender} onChange={set('gender')} label="เพศของคุณ" invalid={!!fe.gender} />
                <FieldErr msg={fe.gender} />
              </div>
              <div className="dm-field"><span>อยากได้เมท</span>
                <Pick id="dm-m-pref" options={meta?.gender_prefs || []} value={f.mate_gender_pref} onChange={set('mate_gender_pref')} label="อยากได้เมทเพศไหน" invalid={!!fe.mate_gender_pref} />
                <FieldErr msg={fe.mate_gender_pref} />
              </div>
              <div className="dm-field"><span>ชั้นปี</span>
                <Pick id="dm-m-year" options={meta?.years || []} value={f.year} onChange={set('year')} label="ชั้นปี" invalid={!!fe.year} />
                <FieldErr msg={fe.year} />
              </div>
              <label className="dm-field"><span>คณะหรือสาขา<span className="dm-optional">ไม่ใส่ก็ได้</span></span>
                <input value={f.faculty} onChange={set('faculty')} maxLength={80} />
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <div className="dm-field"><span>ตอนนี้</span>
                <Pick id="dm-m-room" options={[{ id: false, label: 'ยังไม่มีห้อง อยากหาด้วยกัน' }, { id: true, label: 'มีห้องแล้ว หาคนมาหาร' }]}
                      value={f.has_room} onChange={set('has_room')} label="มีห้องแล้วหรือยัง" invalid={!!fe.has_room} />
                <FieldErr msg={fe.has_room} />
              </div>
              {f.has_room && (
                <label className="dm-field"><span>ห้องของคุณ</span>
                  <input value={f.room_note} onChange={set('room_note')} maxLength={300} placeholder="เช่น A Space พระราม 9, 1 ห้องนอน, 11,000 หาร 3" />
                </label>
              )}
              <div className="dm-two">
                <label className="dm-field"><span>งบต่อคน ต่ำสุด</span>
                  <input id="dm-m-bmin" type="number" inputMode="numeric" min="0" step="500" value={f.budget_min} onChange={set('budget_min')}
                         placeholder="เช่น 4000" className={fe.budget_min ? 'is-invalid' : ''} aria-invalid={!!fe.budget_min} />
                  <FieldErr msg={fe.budget_min} />
                </label>
                <label className="dm-field"><span>สูงสุด</span>
                  <input id="dm-m-bmax" type="number" inputMode="numeric" min="0" step="500" value={f.budget_max} onChange={set('budget_max')}
                         placeholder="เช่น 6000" className={fe.budget_max ? 'is-invalid' : ''} aria-invalid={!!fe.budget_max} />
                  <FieldErr msg={fe.budget_max} />
                </label>
              </div>
              <div className="dm-field"><span>อยากย้ายเข้าเดือน</span>
                <SelectBox id="dm-m-move" value={f.move_in} onChange={set('move_in')} placeholder="เลือกเดือน" label="เดือนที่อยากย้ายเข้า"
                           invalid={!!fe.move_in} options={[...new Set([...(f.move_in ? [f.move_in] : []), ...upcomingMonths(10)])].sort().map((m) => ({ id: m, label: thDate(m) }))} />
                <FieldErr msg={fe.move_in} />
              </div>
              <div className="dm-field"><span>โซนที่อยากอยู่</span>
                <Pick options={meta?.zones || []} value={f.zones} onChange={set('zones')} multi label="โซนที่อยากอยู่" />
                <small>ไม่เลือกเลย แปลว่าอยู่ตรงไหนก็ได้</small>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="dm-field"><span>นิสัยการอยู่ร่วมกัน</span>
                <Pick options={meta?.tags || []} value={f.tags} onChange={set('tags')} multi label="นิสัยการอยู่ร่วมกัน" />
                <small>ใช้คำนวณความเข้ากัน เช่น คนนอนดึกกับคนตื่นเช้าจะได้คำเตือนให้คุยกันก่อน</small>
              </div>
              <label className="dm-field"><span>แนะนำตัวสั้นๆ</span>
                <textarea rows={3} value={f.about} onChange={set('about')} maxLength={600} placeholder="เรียนอะไร กลับบ้านบ่อยไหม อยากได้เมทแบบไหน" />
              </label>
              <div className="dm-two">
                <label className="dm-field"><span>LINE ID</span>
                  <input id="dm-m-line" value={f.contact_line} onChange={set('contact_line')} maxLength={60} autoCapitalize="none" className={fe.contact_line ? 'is-invalid' : ''} aria-invalid={!!fe.contact_line} />
                </label>
                <label className="dm-field"><span>IG</span>
                  <input value={f.contact_ig} onChange={(e) => { set('contact_ig')(e); if (fe.contact_line) setFe((o) => ({ ...o, contact_line: '' })); }} maxLength={60} autoCapitalize="none" />
                </label>
              </div>
              <FieldErr msg={fe.contact_line} />
              <label className="dm-check" id="dm-m-consent">
                <input type="checkbox" checked={f.consent} onChange={set('consent')} />
                <span>ยินยอมให้นิสิตที่เข้าสู่ระบบเห็นโปรไฟล์นี้ 30 วัน และกดดูช่องทางติดต่อได้ ลบได้ทุกเมื่อ
                  ข้อมูลอาจถูกนับรวมแบบไม่ระบุตัวตนเพื่อสรุปภาพรวมตลาดที่พัก</span>
              </label>
              <FieldErr msg={fe.consent} />
            </>
          )}
          {err && <div className="dm-err" role="alert">{err}</div>}
          <div className="dm-formbar">
            {step > 0 ? <button type="button" className="dm-btn dm-btn-quiet" onClick={() => { setErr(''); setFe({}); setStep(step - 1); }}>ย้อนกลับ</button>
              : profile && <button type="button" className="dm-btn dm-btn-quiet" onClick={() => { setEditing(false); setFe({}); setF({ ...BLANK, ...profile }); }}>ยกเลิก</button>}
            <button type="button" className="dm-btn dm-btn-primary" onClick={next} data-testid="dorm-save-mate">
              {step < 2 ? 'ถัดไป' : profile ? 'บันทึก' : 'สร้างโปรไฟล์'}
            </button>
          </div>
        </div>
        <aside className="dm-preview">
          <div className="dm-preview-label"><Eye size={14} aria-hidden="true" />คนอื่นจะเห็นคุณแบบนี้</div>
          <MateCard m={{ ...f, budget_min: Number(f.budget_min) || null, budget_max: Number(f.budget_max) || null }} preview />
        </aside>
      </div>
    </>
  );

  if (!user) {
    // still checking a stored token: don't flash the guest view
    if (authLoading && token) return <DormLayout title="ของฉัน" robots="noindex, nofollow"><Skeleton h={88} r={24} /><div style={{ height: 16 }} /><Skeleton h={160} r={18} /></DormLayout>;
    const guestTab = tab === 'mate' ? 'mate' : 'saved';
    return (
      <DormLayout title="ของฉัน" robots="noindex, nofollow" className={`dm-mepage ${guestTab === 'mate' ? 'dm-has-formbar' : ''}`}>
        <PageHead title="ของฉัน" sub={guestTab === 'mate' ? 'กรอกโปรไฟล์ให้เสร็จก่อน ระบบค่อยให้เข้าสู่ระบบตอนกดสร้างโปรไฟล์' : 'ห้องที่เก็บไว้ในเครื่องนี้'} />
        <Tabs.Root value={guestTab} onValueChange={setTab}>
          <Tabs.List className="dm-tabs-list dm-metabs" aria-label="ของฉัน">
            <Tabs.Trigger value="saved" className="dm-tab">ที่เก็บไว้{savedIds.length > 0 && <span className="dm-badge-n">{savedIds.length}</span>}</Tabs.Trigger>
            <Tabs.Trigger value="mate" className="dm-tab">สร้างโปรไฟล์หาเมท</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="saved">
            <SavedRooms guest />
            <section className="dm-signin dm-rise" style={{ '--i': 1 }} aria-labelledby="dm-signin-h">
              <h2 id="dm-signin-h">เข้าสู่ระบบแล้วทำอะไรได้อีก</h2>
              <ul className="dm-benefits">
                <li><span className="ico"><Megaphone size={18} aria-hidden="true" /></span>ลงประกาศ และดูว่ามีคนสนใจกี่คน</li>
                <li><span className="ico"><Users size={18} aria-hidden="true" /></span>สร้างโปรไฟล์ให้ระบบจับคู่เมทที่เข้ากัน</li>
                <li><span className="ico"><MessageCircle size={18} aria-hidden="true" /></span>ทักคุยในเว็บและแลก LINE กับห้องหรือเมทที่สนใจ</li>
              </ul>
              <button type="button" className="dm-btn dm-btn-primary" onClick={() => requireLogin('สมัครฟรี ใช้เวลาไม่ถึงนาที')}>สมัครหรือเข้าสู่ระบบ</button>
            </section>
          </Tabs.Content>
          <Tabs.Content value="mate">
            {mateFormUI}
          </Tabs.Content>
        </Tabs.Root>
      </DormLayout>
    );
  }
  const act = async (fn, okMsg) => {
    try { await fn(); toast(okMsg); load(); } catch (e) { toast(errMsg(e)); }
  };
  const deleteProfile = async () => {
    const ok = await confirm({ title: 'ลบโปรไฟล์หาเมทถาวร?', body: 'โปรไฟล์จะหายจากรายชื่อเมททันที และความสนใจห้องทั้งหมดของคุณจะถูกถอนด้วย กู้คืนไม่ได้ สร้างใหม่ได้ทุกเมื่อ', action: 'ลบโปรไฟล์', danger: true });
    if (!ok) return;
    try {
      await axios.delete(`${API}/mates/me`, authHeaders(token));
      toast('ลบโปรไฟล์แล้ว');
      dropMateDraft();
      setF({ ...BLANK, display_name: (user?.full_name || '').split(' ')[0] });
      setFe({}); setStep(0); setEditing(false); setProfile(null); setInterests([]);
      window.scrollTo({ top: 0 });
    } catch (e) { toast(errMsg(e)); }
  };
  const signOut = async () => { await logout(); toast('ออกจากระบบแล้ว'); };
  const dl = profile ? daysLeft(profile.expires_at) : null;
  const live = profile && profile.status === 'active' && dl > 0;
  const name = user.full_name || 'บัญชีของฉัน';

  useEffect(() => {
    if (user && loaded && params.get('verify') === '1' && !verification?.verified && !swuVerified(user)) {
      setVerifyOpen(true);
    }
  }, [user, loaded, params, verification]);

  const closeVerify = () => {
    setVerifyOpen(false);
    if (params.get('verify')) {
      const n = new URLSearchParams(window.location.search);
      n.delete('verify');
      setParams(n, { replace: true });
    }
  };

  const submitVouch = async (e) => {
    e.preventDefault();
    setVouchErr('');
    setVouchBusy(true);
    try {
      const r = await axios.post(`${API}/verify/vouch-personal-email`, { personal_email: vouchEmail.trim() }, authHeaders(token));
      setVerification(r.data.verification);
      setVouchOpen(false);
      setVouchEmail('');
      toast(r.data.applied
        ? `ยืนยันป้าย มศว ให้ ${r.data.personal_email} แล้ว`
        : `บันทึกสิทธิ์ให้ ${r.data.personal_email} แล้ว (เมื่อเข้าสู่ระบบด้วยอีเมลนี้จะได้ป้ายทันที)`);
    } catch (e2) {
      setVouchErr(errMsg(e2, 'ยืนยันอีเมลส่วนตัวไม่สำเร็จ'));
    }
    setVouchBusy(false);
  };

  const isVerified = Boolean(verification?.verified || swuVerified(user));
  const isGoogleSwuSession = swuVerified(user);
  const badgeLabel = verification?.status_label || 'ยืนยันนิสิต มศว';

  return (
    <DormLayout title="ของฉัน" robots="noindex, nofollow" className={`dm-mepage ${tab === 'mate' && loaded && showForm ? 'dm-has-formbar' : ''}`}>
      <div className="dm-acct dm-rise">
        <Avatar name={user.full_name || user.email} size={56} />
        <div className="dm-acct-id">
          <b>{name}</b>
          <span className="dm-small dm-muted">{user.email}</span>
          {isVerified && (
            <span className="dm-verified sm">
              <BadgeCheck size={14} aria-hidden="true" />{badgeLabel}
              {verification?.swu_email && verification.swu_email !== (user.email || '').toLowerCase() && (
                <small className="dm-muted" style={{ fontWeight: 400, marginLeft: 4 }}>({verification.swu_email})</small>
              )}
            </span>
          )}
        </div>
        <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-acct-out" onClick={signOut} aria-label="ออกจากระบบ">
          <LogOut size={16} aria-hidden="true" /><span>ออกจากระบบ</span>
        </button>
      </div>
      {loaded && !isVerified && (
        <div className="dm-verify-strip" data-testid="dorm-verify-strip">
          <div>
            {verification?.status === 'pending' ? (
              <><b>ส่งคำขอรอแอดมินตรวจแล้ว · ยืนยันเองได้เลยถ้ามี @g.swu.ac.th</b><span>ล็อกอิน Google มศว แค่ครั้งเดียวจะได้ป้ายทันทีโดยไม่ต้องรอแอดมิน</span></>
            ) : verification?.status === 'rejected' ? (
              <><b>คำขอยืนยันรอบก่อนไม่ผ่าน</b><span>{verification.reject_reason || 'ลองยืนยันด้วยบัญชี Google @g.swu.ac.th หรือส่งข้อมูลใหม่ได้'}</span></>
            ) : (
              <><b>รับป้ายยืนยันนิสิต มศว ทันที (ไม่ต้องรอแอดมิน)</b><span>ยืนยันครั้งเดียวด้วยบัญชี Google @g.swu.ac.th บัญชีหลักยังเป็นอีเมลส่วนตัวเหมือนเดิม</span></>
            )}
          </div>
          <div className="dm-verify-acts">
            <button type="button" className="dm-btn dm-btn-tint dm-btn-sm" onClick={() => setVerifyOpen(true)} data-testid="dorm-open-verify">
              <BadgeCheck size={15} aria-hidden="true" />
              {verification?.status === 'pending' ? 'มี @g.swu.ac.th? ยืนยันทันที' : 'ยืนยันทันทีด้วย @g.swu.ac.th'}
            </button>
          </div>
        </div>
      )}
      {loaded && isGoogleSwuSession && (
        <div className="dm-vouch-strip" data-testid="dorm-vouch-strip">
          <div className="dm-vouch-head">
            <div>
              {verification?.vouched_personal_email ? (
                <>
                  <b>ผูกอีเมลส่วนตัวไว้ใช้หลังเรียนจบแล้ว: {verification.vouched_personal_email}</b>
                  <span>{verification.vouch_claimed
                    ? 'บัญชีอีเมลส่วนตัวนี้ได้รับป้ายยืนยัน มศว เรียบร้อยแล้ว'
                    : 'เมื่อเข้าสู่ระบบด้วยอีเมลส่วนตัวนี้ ระบบจะติดป้ายยืนยัน มศว ให้อัตโนมัติ (ไม่ต้องแจ้งแอดมิน)'}</span>
                </>
              ) : (
                <>
                  <b>ยืนยันให้อีเมลส่วนตัวของคุณ (เก็บป้ายไว้ใช้ต่อหลังเรียนจบ)</b>
                  <span>ใช้อีเมล @g.swu.ac.th นี้รับรอง Gmail/อีเมลส่วนตัวของคุณได้ 1 บัญชีทันที โดยไม่ต้องแจ้งแอดมิน</span>
                </>
              )}
            </div>
            {(!verification?.vouched_personal_email || !verification?.vouch_claimed) && (
              <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm"
                      onClick={() => { setVouchOpen((v) => !v); setVouchErr(''); setVouchEmail(verification?.vouched_personal_email || ''); }}
                      data-testid="dorm-vouch-toggle">
                <ShieldCheck size={15} aria-hidden="true" />
                {vouchOpen ? 'ซ่อน' : verification?.vouched_personal_email ? 'แก้ไขอีเมล' : 'ยืนยันอีเมลส่วนตัว'}
              </button>
            )}
          </div>
          {vouchOpen && (
            <form className="dm-vouch-form" onSubmit={submitVouch}>
              <input type="email" required value={vouchEmail} onChange={(e) => setVouchEmail(e.target.value)}
                     placeholder="เช่น myname@gmail.com" autoCapitalize="none" aria-label="อีเมลส่วนตัวที่ต้องการยืนยัน"
                     data-testid="dorm-vouch-input" />
              <button type="submit" className="dm-btn dm-btn-ink dm-btn-sm" disabled={vouchBusy || !vouchEmail.trim()}
                      data-testid="dorm-vouch-submit">
                {vouchBusy ? 'กำลังบันทึก...' : 'ยืนยันอีเมลนี้'}
              </button>
            </form>
          )}
          {vouchErr && <div className="dm-err" role="alert">{vouchErr}</div>}
        </div>
      )}
      {verifyOpen && (
        <VerifySheet verification={verification} userEmail={user.email} token={token} onClose={closeVerify}
                     onDone={(v) => { setVerification(v); load(); }} />
      )}

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="dm-tabs-list dm-metabs" aria-label="ของฉัน">
          <Tabs.Trigger value="listings" className="dm-tab">ประกาศของฉัน{loaded && listings.length > 0 && <span className="dm-badge-n">{listings.length}</span>}</Tabs.Trigger>
          <Tabs.Trigger value="chat" className="dm-tab">แชท{unreadChat > 0 && <span className="dm-badge-n">{unreadChat}</span>}</Tabs.Trigger>
          <Tabs.Trigger value="mate" className="dm-tab">โปรไฟล์หาเมท</Tabs.Trigger>
          <Tabs.Trigger value="interests" className="dm-tab">ห้องที่ฉันสนใจ{loaded && interests.length > 0 && <span className="dm-badge-n">{interests.length}</span>}</Tabs.Trigger>
          <Tabs.Trigger value="saved" className="dm-tab">ที่เก็บไว้{savedIds.length > 0 && <span className="dm-badge-n">{savedIds.length}</span>}</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="chat">
          <InboxPanel onRead={refreshUnread} />
        </Tabs.Content>

        <Tabs.Content value="listings">
          {!loaded ? <div className="dm-mylist"><Skeleton h={180} r={18} /><Skeleton h={180} r={18} /></div>
            : listings.length ? (
              <>
                <div className="dm-me-head">
                  <span className="dm-small dm-muted">แสดง 30 วัน ต่ออายุได้ตลอด</span>
                  <Link to="/dorm/post" className="dm-btn dm-btn-ink dm-btn-sm"><Plus size={15} aria-hidden="true" />ลงประกาศใหม่</Link>
                </div>
                <div className="dm-mylist">{listings.map((x) => <MyListing key={x.id} x={x} token={token} reload={load} remove={(id) => setListings((ls) => ls.filter((l) => l.id !== id))} patch={(id, ch) => setListings((ls) => ls.map((l) => (l.id === id ? { ...l, ...ch } : l)))} />)}</div>
              </>
            ) : (
              <Empty title="ยังไม่มีประกาศ" art={coverFor('room')}
                     action={<Link to="/dorm/post" className="dm-btn dm-btn-primary">ลงประกาศฟรี</Link>}>
                มีห้องอยากหาคนหาร หรือจะส่งต่อสัญญา ลงไว้ที่นี่ คนจะเห็น 30 วัน
              </Empty>
            )}
          {err && tab === 'listings' && <div className="dm-err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
        </Tabs.Content>

        <Tabs.Content value="mate">
          {!loaded ? <Skeleton h={240} r={18} /> : showForm ? mateFormUI : (
            <div className="dm-mate-sum">
              <div style={{ display: 'grid', gap: 14, minWidth: 0, alignContent: 'start' }}>
                <div className="dm-profile-card">
                  <div className="dm-profile-stats">
                    <span className={`dm-status ${live ? 'live' : 'off'}`}><i aria-hidden="true" />
                      {live ? `กำลังแสดง เหลืออีก ${dl} วัน` : profile.status !== 'active' ? 'ปิดไว้ คนอื่นมองไม่เห็น' : 'หมดอายุแล้ว คนอื่นมองไม่เห็น'}
                    </span>
                    <span className="dm-stats"><span><MessageCircle size={14} aria-hidden="true" />มีคนกดดูช่องทางติดต่อ <b>{profile.contact_reveals || 0}</b> ครั้ง</span></span>
                  </div>
                  <div className="dm-myrow-acts">
                    <button type="button" className="dm-btn dm-btn-tint dm-btn-sm"
                            onClick={() => act(() => axios.post(`${API}/mates/me/renew`, {}, authHeaders(token)), `แสดงต่อถึง ${thDate(new Date(Date.now() + 30 * 86400000).toISOString())}`)}>
                      <RotateCw size={15} aria-hidden="true" />{live ? 'ต่ออายุ' : 'เปิดอีกครั้ง'}
                    </button>
                    <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={() => { setEditing(true); setStep(0); window.scrollTo({ top: 0 }); }}>
                      <Pencil size={15} aria-hidden="true" />แก้ไข
                    </button>
                    {profile.status === 'active' && (
                      <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" aria-label="ได้เมทแล้ว ปิดโปรไฟล์"
                              onClick={() => act(() => axios.post(`${API}/mates/me/close`, {}, authHeaders(token)), 'ปิดโปรไฟล์แล้ว ยินดีด้วย')}>
                        <Power size={15} aria-hidden="true" />ได้เมทแล้ว
                      </button>
                    )}
                  </div>
                </div>
                <Link to="/dorm/mates" className="dm-btn dm-btn-ink dm-me-gomates">ดูคนที่เข้ากับคุณ</Link>
                <p className="dm-tiny">
                  <button type="button" className="dm-textbtn" style={{ color: 'var(--mute)' }} onClick={deleteProfile}>ลบโปรไฟล์ถาวร</button>
                </p>
              </div>
              <div>
                <div className="dm-preview-label"><Eye size={14} aria-hidden="true" />คนอื่นเห็นคุณแบบนี้</div>
                <MateCard m={{ ...profile, is_me: true }} preview />
              </div>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="interests">
          {!loaded ? <SkeletonGrid n={2} className="dm-grid three" list />
            : <MyInterests items={interests} token={token} onGone={(id) => setInterests((xs) => xs.filter((y) => y.id !== id))} />}
        </Tabs.Content>

        <Tabs.Content value="saved">
          <SavedRooms />
        </Tabs.Content>
      </Tabs.Root>
    </DormLayout>
  );
}

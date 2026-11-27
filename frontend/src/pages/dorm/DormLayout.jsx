import React, { Suspense, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Drawer } from 'vaul';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { toast as sonner } from 'sonner';
import useEmblaCarousel from 'embla-carousel-react';
import {
  BadgeCheck, Bike, Building2, History, Bus, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Copy, Eye, Flag, Footprints, HandHeart, Heart, House,
  Image as ImageIcon, Info, Instagram, KeyRound, MessageCircle, Phone, Plus, Ship, Star, TramFront, TriangleAlert, UserRound, Users, X,
  Ban, CigaretteOff, CookingPot, MapPin, Moon, PartyPopper, PawPrint, Search, Sofa, Sparkles, Sunrise, VolumeX, Wallet, Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import {
  API, ISEEN_EVENT, authErrMsg, authHeaders, baht, coverFor, daysLeft, dropDraft, errMsg, hasUnseenInterest, interestText, labelOf, perPersonOf, priceView, splitDemo,
  splitOf, thDate, useBuildings, useDormMeta, useMediaQuery, useSaved, wholeFirst, zoneMinutes,
} from './dormApi';
import './dorm.css';
import './dorm-browse.css';
import './dorm-flow.css';

const LazyChatSheet = React.lazy(() => import('./DormChat').then((m) => ({ default: m.ChatSheet })));

export { coverFor, lineShareUrl, splitDemo, useSaved } from './dormApi';

/* ---------------------------------------------------------------- shell context: sign-in sheet + toast */
const ShellCtx = createContext(null);
export const useShell = () => useContext(ShellCtx);

// Bottom sheet (vaul) on phones, centred dialog on desktop. Portalled content gets
// `dorm-portal` so it picks up the dorm tokens outside .dorm-root.
// modal={false}: plain non-modal dialog (no body pointer-events lock), used for sign-in so
// Google's One Tap iframe stays clickable; on phones it is a full-height sheet, so the
// on-screen keyboard can't make it jump between taps.
export const Sheet = ({ open = true, onClose, title, description, children, footer, testid, modal = true }) => {
  const desk = useMediaQuery('(min-width: 768px)');
  const change = (o) => { if (!o) onClose(); };
  useEffect(() => {
    if (modal || !open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modal, open]);
  if (desk || !modal) {
    return (
      <Dialog.Root open={open} onOpenChange={change} modal={modal}>
        <Dialog.Portal>
          {modal ? <Dialog.Overlay className="dorm-portal dm-overlay" />
            : <div className="dorm-portal dm-overlay" onClick={onClose} aria-hidden="true" />}
          <Dialog.Content className={`dorm-portal ${desk ? 'dm-dialog' : 'dm-drawer dm-fullsheet'}`} data-testid={testid}
                          onInteractOutside={modal ? undefined : (e) => e.preventDefault()}
                          onCloseAutoFocus={modal ? undefined : (e) => e.preventDefault()}
                          {...(description ? {} : { 'aria-describedby': undefined })}>
            {!desk && <div className="dm-grip" aria-hidden="true" />}
            <div className="dm-sheet-head">
              <Dialog.Title className="dm-sheet-title">{title}</Dialog.Title>
              <Dialog.Close className="dm-iconbtn" aria-label="ปิด"><X size={20} /></Dialog.Close>
            </div>
            {description && <Dialog.Description className="dm-sheet-desc">{description}</Dialog.Description>}
            <div className="dm-sheet-body">{children}</div>
            {footer && <div className="dm-sheet-foot">{footer}</div>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Drawer.Root open={open} onOpenChange={change} shouldScaleBackground={false} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="dorm-portal dm-overlay" />
        <Drawer.Content className="dorm-portal dm-drawer" data-testid={testid} {...(description ? {} : { 'aria-describedby': undefined })}>
          <div className="dm-grip" aria-hidden="true" />
          <div className="dm-sheet-head">
            <Drawer.Title className="dm-sheet-title">{title}</Drawer.Title>
            <Drawer.Close className="dm-iconbtn" aria-label="ปิด"><X size={20} /></Drawer.Close>
          </div>
          {description && <Drawer.Description className="dm-sheet-desc">{description}</Drawer.Description>}
          <div className="dm-sheet-body">{children}</div>
          {footer && <div className="dm-sheet-foot">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

// In-app confirm (replaces window.confirm): useShell().confirm({ title, body, action, danger }) -> Promise<boolean>
const ConfirmDialog = ({ req, onAnswer }) => (
  <AlertDialog.Root open={!!req} onOpenChange={(o) => { if (!o) onAnswer(false); }}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="dorm-portal dm-overlay" />
      <AlertDialog.Content className="dorm-portal dm-dialog dm-confirm">
        <AlertDialog.Title className="dm-sheet-title">{req?.title}</AlertDialog.Title>
        <AlertDialog.Description className="dm-confirm-body">{req?.body || ' '}</AlertDialog.Description>
        <div className="dm-confirm-actions">
          <AlertDialog.Cancel className="dm-btn dm-btn-quiet">{req?.cancel || 'ยกเลิก'}</AlertDialog.Cancel>
          <AlertDialog.Action className={`dm-btn ${req?.danger ? 'dm-btn-danger' : 'dm-btn-ink'}`} onClick={() => onAnswer(true)}>
            {req?.action || 'ตกลง'}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
);

// Harmless "this browser has signed in before" flag (no email, no id): returning people get the
// "มีบัญชีแล้ว" tab first instead of a sign-up form.
const SEEN_KEY = 'dorm_seen_login';
const seenLogin = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeenLogin = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ } };

const AuthSheet = ({ reason, onClose, onDone, initialTab = 'register' }) => {
  const { login, register } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [f, setF] = useState({ full_name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    // a new password needs 6+ characters (checked here; the shared /api/auth endpoint does not check it)
    if (tab === 'register' && f.password.length < 6) {
      setErr('รหัสผ่านต้องมีอย่างน้อย 6 ตัว');
      document.getElementById('dm-auth-pw')?.focus();
      return;
    }
    setBusy(true);
    try {
      if (tab === 'login') await login(f.email.trim(), f.password);
      else await register({ full_name: f.full_name.trim(), email: f.email.trim(), password: f.password });
      onDone();
    } catch (e2) {
      setErr(authErrMsg(e2, tab === 'login' ? 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง' : 'สมัครไม่สำเร็จ ลองอีกครั้ง'));
    }
    setBusy(false);
  };
  return (
    <Sheet title={tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิกฟรี'} description={reason} onClose={onClose} testid="dorm-auth-sheet" modal={false}>
      <Seg value={tab} onChange={setTab} label="สมัครหรือเข้าสู่ระบบ" full
           options={[{ id: 'register', label: 'สมัครใหม่' }, { id: 'login', label: 'มีบัญชีแล้ว' }]} />
      <div style={{ marginTop: 14 }}><GoogleLoginButton className="w-full" onSuccess={onDone} /></div>
      <p className="dm-small dm-muted" style={{ margin: '8px 0 0' }}>ใช้ Gmail ส่วนตัวหรือ @g.swu.ac.th ก็ได้ (ล็อกอินด้วย @g.swu.ac.th ได้ป้ายยืนยันทันที หรือมายืนยันภายหลังในหน้าของฉัน)</p>
      <div className="dm-or">หรือใช้อีเมล</div>
      <form className="dm-form" onSubmit={submit}>
        {tab === 'register' && (
          <div className="dm-field"><label htmlFor="dm-auth-name">ชื่อ</label>
            <input id="dm-auth-name" name="name" value={f.full_name} onChange={set('full_name')} required maxLength={60} autoComplete="name" />
          </div>
        )}
        <div className="dm-field"><label htmlFor="dm-auth-email">อีเมล</label>
          <input id="dm-auth-email" name="email" type="email" value={f.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
        </div>
        <div className="dm-field"><label htmlFor="dm-auth-pw">รหัสผ่าน</label>
          <input id="dm-auth-pw" name="password" type="password" value={f.password} onChange={set('password')} required
                 aria-invalid={tab === 'register' && !!err && f.password.length < 6}
                 autoComplete={tab === 'login' ? 'current-password' : 'new-password'} aria-describedby={tab === 'register' ? 'dm-auth-pw-hint' : undefined} />
          {tab === 'register' && <small id="dm-auth-pw-hint">อย่างน้อย 6 ตัว</small>}
        </div>
        {err && <div className="dm-err" role="alert">{err}</div>}
        <button className="dm-btn dm-btn-primary dm-btn-block" disabled={busy}>
          {busy ? 'กำลังดำเนินการ' : tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและไปต่อ'}
        </button>
      </form>
      <p className="dm-tiny dm-muted" style={{ marginTop: 12 }}>
        ใช้บัญชีเดียวกับเว็บสาขาการตลาด มศว (swumkt) เราไม่แสดงอีเมลของคุณให้ใครเห็น
      </p>
    </Sheet>
  );
};

const NAV = [
  { path: '/dorm', label: 'หน้าแรก', icon: House, exact: true },
  { path: '/dorm/rooms', label: 'ห้อง', long: 'ห้องว่าง', icon: KeyRound, also: '/dorm/buildings' },
  { path: '/dorm/post', label: 'ลงประกาศ', center: true },
  { path: '/dorm/mates', label: 'เมท', long: 'หาเมท', icon: Users },
  { path: '/dorm/me', label: 'ของฉัน', icon: UserRound },
];

export const initials = (name) => {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  // Thai names: first character is enough (vowel marks can't stand alone)
  const first = [...parts[0]].find((ch) => /[A-Za-z0-9ก-ฮ]/.test(ch)) || parts[0][0];
  const second = parts[1] && /^[A-Za-z]/.test(parts[1]) ? parts[1][0] : '';
  return (first + second).toUpperCase();
};

const TONES = ['k', 'r', 'b', 's', 'g', 'l'];
export const toneFor = (name) => {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.codePointAt(0)) % 9973;
  return TONES[h % TONES.length];
};
// name, or a public avatar { initials, tone } (interest_avatars carry no names).
export const Avatar = ({ name, size = 44, tone, av }) => (
  <span className={`dm-avatar t-${(av && av.tone) || tone || toneFor(name)}`} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
    {av ? av.initials : initials(name)}
  </span>
);
// interest_avatars items are { initials, tone }; an old payload may still carry plain names.
const avOf = (a) => (a && typeof a === 'object' ? a : { initials: initials(splitDemo(a || '').title || a), tone: toneFor(splitDemo(a || '').title || a) });

// Parent route for every /dorm page: header, nav, sign-in sheet and toasts stay
// mounted while pages change underneath (see App.js).
// Toasts: bottom-centre on phones, lifted above whatever fixed bar is showing (bottom nav, the room's
// contact bar, the post form's bar) so they never cover the top bar, the filter strip or a primary
// button; top-right under the header on desktop.
// Measures the tallest visible fixed bottom bar into --dm-toast-bottom (the bottom toaster reads it live, so
// a toast already on screen also moves when a bar appears, grows or goes away).
const liftToasts = () => {
  let lift = 0;
  document.querySelectorAll('.dm-bottom, .dm-actionbar, .dm-formbar').forEach((el) => {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.position !== 'fixed') return;
    // the raised + of the bottom nav sticks out above the bar
    const top = Math.min(el.getBoundingClientRect().top, ...[...el.querySelectorAll('.dm-bottom-plus')].map((p) => p.getBoundingClientRect().top));
    lift = Math.max(lift, window.innerHeight - top);
  });
  document.documentElement.style.setProperty('--dm-toast-bottom', `${Math.round(lift) + 12}px`);
};
const placeToasts = () => {
  const desk = window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
  if (desk) return 'top-right';
  liftToasts();
  return 'bottom-center';
};

// Where the reader is when a sign-in starts: the tapped card (or control) and its height on screen.
const spotNow = () => {
  const a = document.activeElement;
  const el = a && a !== document.body ? (a.closest('article, .dm-mate, .dm-card, section') || a) : null;
  return { y: window.scrollY, el, top: el ? el.getBoundingClientRect().top : 0 };
};

export function DormShell() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { ids: savedIds } = useSaved();
  // Record ?src=... QR/poster scans once per browser session per source tag.
  useEffect(() => {
    const src = new URLSearchParams(search || window.location.search).get('src')?.trim() || '';
    if (!/^[A-Za-z0-9_-]{1,48}$/.test(src)) return;
    const k = `dorm_qr_${src}`;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch { /* storage blocked */ }
    axios.post(`${API}/visit`, { src, path: pathname }).catch(() => {});
  }, [pathname, search]);
  // a dot on "ของฉัน" while one of my listings has interest I have not opened yet (counts polled per page change,
  // last-seen counts kept on this device; see markInterestSeen)
  const [icounts, setIcounts] = useState(null);
  const [newInterest, setNewInterest] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatTarget, setChatTarget] = useState(null);
  const refreshUnread = useCallback(() => {
    if (!user) { setUnreadChat(0); return; }
    const t = token || (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
    axios.get(`${API}/threads/unread`, authHeaders(t)).then((r) => setUnreadChat(r.data.count || 0)).catch(() => {});
  }, [user, token]);
  useEffect(() => {
    if (!user) { setUnreadChat(0); return undefined; }
    refreshUnread();
    const iv = setInterval(refreshUnread, 25000);
    return () => clearInterval(iv);
  }, [user, pathname, refreshUnread]);
  // Suppress benign Chromium ResizeObserver loop notifications (triggered by Radix Select/Popover) so CRA dev overlay never blocks the UI.
  useEffect(() => {
    const onErr = (e) => {
      if (/ResizeObserver loop/i.test(e?.message || '')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('error', onErr, true);
    return () => window.removeEventListener('error', onErr, true);
  }, []);
  useEffect(() => {
    if (!user) { setIcounts(null); return undefined; }
    let on = true;
    const t = token || (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
    axios.get(`${API}/my/listing-interest`, authHeaders(t)).then((r) => on && setIcounts(r.data.listings || {})).catch(() => {});
    return () => { on = false; };
  }, [user, token, pathname]);
  useEffect(() => {
    const on = () => setNewInterest(hasUnseenInterest(icounts));
    on();
    window.addEventListener(ISEEN_EVENT, on);
    return () => window.removeEventListener(ISEEN_EVENT, on);
  }, [icounts]);
  // signing out (button or a 401 auto-logout) drops the post draft, so the next person on this tab never
  // sees the previous account's LINE ID or phone
  const prevUser = useRef(user);
  useEffect(() => {
    if (prevUser.current && !user) dropDraft();
    prevUser.current = user;
  }, [user]);
  const [auth, setAuth] = useState(null);
  const [ask, setAsk] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  // header: transparent over the home hero (phones) until the page scrolls, then solid white + shadow
  useEffect(() => {
    // setState bails out when the boolean doesn't change, so this is cheap without rAF batching
    const on = () => setScrolled(window.scrollY > 1);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const isHome = pathname === '/dorm' || pathname === '/dorm/';
  // lets dorm.css place the shared Toaster's lists while a dorm page is open
  useEffect(() => {
    document.documentElement.classList.add('dm-in-dorm');
    return () => document.documentElement.classList.remove('dm-in-dorm');
  }, []);
  // keep toasts above whichever fixed bar the current page has (bars mount after the route renders and
  // change height, e.g. the room's contact bar once a contact is revealed)
  useEffect(() => {
    const t = setTimeout(liftToasts, 60);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => liftToasts()) : null;
    if (ro) ro.observe(document.body);
    window.addEventListener('resize', liftToasts);
    return () => { clearTimeout(t); if (ro) ro.disconnect(); window.removeEventListener('resize', liftToasts); };
  }, [pathname]);

  // Opaque navy toast; the site-wide Toaster itself is untouched. action: { label, to } adds a link button.
  const showToast = useCallback((msg, opts = {}) => {
    // role="status" on the text: screen readers announce it politely without moving focus
    sonner(<span role="status">{msg}</span>, {
      className: 'dorm-toast', position: placeToasts(), duration: opts.action ? 4500 : 3000,
      style: { background: '#14213D', color: '#fff', border: 0 },
      ...(opts.action ? { action: { label: opts.action.label, onClick: () => navigate(opts.action.to) } } : {}),
    });
  }, [navigate]);
  const confirm = useCallback((req) => new Promise((resolve) => setAsk({ ...req, resolve })), []);
  const answer = (ok) => { if (ask) ask.resolve(ok); setAsk(null); };
  // requireLogin(reason, then): runs `then` now if signed in, otherwise after sign-in finishes
  // Opens on "มีบัญชีแล้ว" when this browser has signed in before, on sign-up for a first-timer.
  const requireLogin = useCallback((reason, then) => {
    if (user) { then && then(); return true; }
    setAuth({ reason, then, spot: spotNow(), tab: seenLogin() ? 'login' : 'register' });
    return false;
  }, [user]);
  useEffect(() => { if (user) markSeenLogin(); }, [user]);
  // Signing in re-renders the page underneath (lists refetch and reorder, focus moves). Keep the reader
  // where they were: the card they tapped stays at the same height on screen while it still exists,
  // otherwise the same scroll offset. Runs for ~1.5s (until the refetch lands) or until they scroll.
  const keepScroll = (spot) => {
    if (!spot) return;
    const until = Date.now() + 1500;
    let stop = false;
    const quit = () => { stop = true; };
    window.addEventListener('wheel', quit, { once: true, passive: true });
    window.addEventListener('touchstart', quit, { once: true, passive: true });
    const fix = () => {
      if (stop) return;
      const y = spot.el && spot.el.isConnected ? window.scrollY + spot.el.getBoundingClientRect().top - spot.top : spot.y;
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
      if (Date.now() < until) requestAnimationFrame(fix);
      else { window.removeEventListener('wheel', quit); window.removeEventListener('touchstart', quit); }
    };
    requestAnimationFrame(fix);
  };

  const openChat = useCallback((kind, id, roomId = '') => {
    requireLogin('เข้าสู่ระบบเพื่อเริ่มคุยในเว็บ', () => setChatTarget({ kind, id, roomId }));
  }, [requireLogin]);
  const hasDot = newInterest || unreadChat > 0;
  // main nav always opens the plain rooms list (only the in-page "back to list" link restores filters)
  const roomsTo = '/dorm/rooms';
  const nSaved = savedIds.length;
  const meLabel = (l) => ([nSaved && `เก็บไว้ ${nSaved} ห้อง`, unreadChat > 0 && `มีข้อความใหม่ ${unreadChat}`, newInterest && 'มีคนสนใจประกาศของคุณ'].filter(Boolean).length
    ? `${l} ${[nSaved && `เก็บไว้ ${nSaved} ห้อง`, unreadChat > 0 && `มีข้อความใหม่ ${unreadChat}`, newInterest && 'มีคนสนใจประกาศของคุณ'].filter(Boolean).join(', ')}` : undefined);
  // room detail and the post form have their own bottom action bars; the raised + would cover them
  const noNav = /^\/dorm\/(rooms\/[^/]+|post)$/.test(pathname);
  const noFoot = pathname.startsWith('/dorm/post');
  const active = (t) => (t.exact ? pathname === t.path : pathname.startsWith(t.path) || (t.also && pathname.startsWith(t.also)));
  const me = (
    user ? (
      <Link to="/dorm/me" className="dm-me-chip" aria-label={`บัญชีของฉัน ${user.full_name || ''}`}>
        <Avatar name={user.full_name || user.email} size={34} />
      </Link>
    ) : (
      <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm dm-login" onClick={() => setAuth({ reason: '', spot: spotNow(), tab: 'login' })}>เข้าสู่ระบบ</button>
    )
  );
  return (
    <ShellCtx.Provider value={{ toast: showToast, requireLogin, authOpen: !!auth, confirm, openChat, unreadChat, refreshUnread }}>
      <div className={`dorm-root ${noNav ? 'dm-nonav' : ''}`}>
        <header className={`dm-top ${isHome && !scrolled ? 'is-over' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
          <div className="dm-top-in">
            <Link to="/dorm" className="dm-brand" data-testid="dorm-brand" aria-label="หาห้อง หาเมท มศว หน้าแรก">
              <span className="dm-brand-mark" aria-hidden="true">มศว</span>
              <span className="dm-brand-name">หาห้อง หาเมท</span>
            </Link>
            <nav className="dm-nav" aria-label="เมนูหลัก">
              <Link to={roomsTo} className={pathname.startsWith('/dorm/rooms') ? 'on' : ''}>ห้องว่าง</Link>
              <Link to="/dorm/buildings" className={pathname.startsWith('/dorm/buildings') ? 'on' : ''}>รีวิวตึก</Link>
              <Link to="/dorm/mates" className={pathname.startsWith('/dorm/mates') ? 'on' : ''}>หาเมท</Link>
              <Link to="/dorm/me" className={`dm-nav-me ${pathname.startsWith('/dorm/me') ? 'on' : ''}`} data-testid="dorm-nav-me"
                    aria-label={meLabel('ของฉัน')}>
                ของฉัน{nSaved > 0 && <span className="dm-nav-n" aria-hidden="true">{nSaved}</span>}
                {hasDot && <span className="dm-nav-dot" aria-hidden="true" data-testid="dorm-nav-interest-dot" />}
              </Link>
              {user?.role === 'admin' && <Link to="/dorm/admin" className={pathname.startsWith('/dorm/admin') ? 'on' : ''}>แอดมิน</Link>}
            </nav>
            <div className="dm-top-right">
              <Link to="/dorm/post" className="dm-btn dm-btn-ink dm-btn-sm dm-top-cta" data-testid="dorm-post-btn">
                <Plus size={16} aria-hidden="true" />ลงประกาศ
              </Link>
              {user && (
                <Link to="/dorm/me?tab=chat" className={`dm-top-chat ${pathname.startsWith('/dorm/me') ? 'on' : ''}`}
                      aria-label={unreadChat > 0 ? `แชท มีข้อความใหม่ ${unreadChat} ห้อง` : 'แชทของฉัน'}
                      title="แชทของฉัน" data-testid="dorm-top-chat">
                  <MessageCircle size={19} aria-hidden="true" />
                  {unreadChat > 0 && <span className="dm-top-chat-n" aria-hidden="true">{unreadChat > 99 ? '99+' : unreadChat}</span>}
                </Link>
              )}
              {me}
            </div>
          </div>
        </header>
        <Suspense fallback={<main className="dm-main"><SkeletonPage /></main>}>
          <Outlet />
        </Suspense>
        {!noFoot && <footer className="dm-foot">
          <div className="dm-foot-in">
            <span className="dm-foot-note">ใช้ฟรีสำหรับนิสิต ประกาศแสดง 30 วันและต่ออายุได้</span>
            <span className="dm-foot-note dm-foot-ext">ห้องที่ติดป้าย “จาก” ชื่อเว็บ เป็นข้อมูลที่รวบรวมจากประกาศสาธารณะ ต้องยืนยันห้องกับผู้ลงที่เว็บต้นทางก่อนทุกครั้ง</span>
            <Link to="/dorm/insights">ผลวิเคราะห์ตลาดที่พักรอบ มศว</Link>
            <a href="/">เว็บสาขาการตลาด มศว</a>
          </div>
        </footer>}
        <nav className="dm-bottom" aria-label="เมนูหลัก">
          {NAV.map((t) => (t.center ? (
            <Link key={t.path} to={t.path} className={`dm-bottom-post ${active(t) ? 'on' : ''}`} aria-label="ลงประกาศ">
              <span className="dm-bottom-plus"><Plus size={24} strokeWidth={2.2} aria-hidden="true" /></span>
              <span>{t.label}</span>
            </Link>
          ) : (
            <Link key={t.path} to={t.path === '/dorm/rooms' ? roomsTo : t.path} className={active(t) ? 'on' : ''} aria-current={active(t) ? 'page' : undefined}
                  aria-label={t.path === '/dorm/me' ? meLabel(t.label) : undefined}>
              <span className="dm-bottom-ico">
                <t.icon size={22} strokeWidth={active(t) ? 2.2 : 1.8} aria-hidden="true" />
                {t.path === '/dorm/me' && nSaved > 0 && <span className="dm-nav-n" aria-hidden="true">{nSaved > 99 ? '99+' : nSaved}</span>}
                {t.path === '/dorm/me' && hasDot && <span className="dm-nav-dot" aria-hidden="true" />}
              </span>{t.label}
            </Link>
          )))}
        </nav>
        {auth && (
          <AuthSheet reason={auth.reason} initialTab={auth.tab} onClose={() => { const { spot } = auth; setAuth(null); keepScroll(spot); }}
                     onDone={() => { const { then: t, spot } = auth; setAuth(null); keepScroll(spot); showToast('เข้าสู่ระบบแล้ว'); if (t) setTimeout(t, 50); }} />
        )}
        {chatTarget && (
          <Suspense fallback={null}>
            <LazyChatSheet target={chatTarget} onClose={() => { setChatTarget(null); refreshUnread(); }} onActivity={refreshUnread} />
          </Suspense>
        )}
        <ConfirmDialog req={ask} onAnswer={answer} />
      </div>
    </ShellCtx.Provider>
  );
}

// Each page: sets the tab title and the content column.
export default function DormLayout({ children, title, className = '' }) {
  useEffect(() => {
    document.title = title ? `${title} | หาห้อง หาเมท มศว` : 'หาห้อง หาเมท มศว';
  }, [title]);
  return <main className={`dm-main dm-page-in ${className}`}>{children}</main>;
}

// Inner-page heading: title + at most one short line + optional right-side action. No paragraphs.
export const PageHead = ({ title, sub, action, className = '' }) => (
  <div className={`dm-ph ${className}`}>
    <div className="dm-ph-txt">
      <h1>{title}</h1>
      {sub && <p className="dm-ph-sub">{sub}</p>}
    </div>
    {action && <div className="dm-ph-act">{action}</div>}
  </div>
);

// Cross-fades whenever `k` changes (result counts, button labels).
export const Swap = ({ k, children, className = '' }) => <span key={k} className={`dm-swap ${className}`}>{children}</span>;

// Quiet note for caveats; goes at the end of a page. tone: '' (grey) | 'sun' | 'tint'
export const Note = ({ tone = '', icon: I = Info, children, className = '' }) => (
  <div className={`dm-note ${tone} ${className}`}>
    <I size={17} aria-hidden="true" /><div>{children}</div>
  </div>
);

// Tinted full-width block. tone: mint | sun | tint | sky | ink. `lead` replaces the art (e.g. an avatar stack).
export const Band = ({ tone = 'mint', art, lead, title, text, children, actions, className = '', artLeft = false, as: Tag = 'section', ...rest }) => (
  <Tag className={`dm-band ${tone} ${artLeft ? 'art-left' : ''} ${className}`} {...rest}>
    {art && <img className="dm-band-art" src={art} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    <div className="dm-band-body">
      {lead}
      {title && <h2 className="dm-band-title">{title}</h2>}
      {text && <p className="dm-band-text">{text}</p>}
      {children}
      {actions && <div className="dm-actions">{actions}</div>}
    </div>
  </Tag>
);

/* ---------------------------------------------------------------- small pieces */
export const Empty = ({ title, children, action, art, flat = false, className = '' }) => (
  <div className={`dm-empty ${art ? 'has-art' : ''} ${flat ? 'flat' : ''} ${className}`}>
    {art && <img src={art} alt="" className="dm-empty-art" />}
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
);

export const Skeleton = ({ w = '100%', h = 14, r = 8, style }) => (
  <span className="dm-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
);
// Same box as ListingCard (cover ratio, 2-line title, where row, meta row) so nothing jumps when data lands.
export const SkeletonCard = ({ list = false }) => (
  <div className={`dm-card dm-card-skel ${list ? 'is-list' : ''}`} aria-hidden="true">
    <div className="dm-cover"><Skeleton h="100%" r={0} style={{ display: 'block' }} /></div>
    <div className="dm-card-body">
      <div style={{ minHeight: '2.7em', display: 'grid', gap: 6, alignContent: 'start', fontSize: 17 }}><Skeleton w="88%" h={17} /><Skeleton w="60%" h={17} /></div>
      <Skeleton w="62%" h={20} r={999} /><Skeleton w="72%" h={14} />
    </div>
  </div>
);
export const SkeletonGrid = ({ n = 6, className = 'dm-grid', list = false }) => (
  <div className={className} aria-busy="true" aria-label="กำลังโหลด">
    {Array.from({ length: n }).map((_, i) => <SkeletonCard key={i} list={list} />)}
  </div>
);
export const SkeletonBuildingCard = ({ tall = false }) => (
  <div className={`dm-bc ${tall ? 'tall' : ''}`} aria-hidden="true">
    <Skeleton h="auto" r={0} style={{ display: 'block', aspectRatio: tall ? '3 / 2' : '2 / 1' }} />
    <div className="dm-bc-body"><Skeleton w="80%" h={16} /><Skeleton w="50%" h={22} r={999} /><Skeleton w="64%" h={13} /></div>
  </div>
);
export const SkeletonPage = () => (
  <div aria-busy="true" aria-label="กำลังโหลด" style={{ display: 'grid', gap: 12, paddingTop: 8 }}>
    <Skeleton w="40%" h={14} /><Skeleton w="80%" h={30} /><Skeleton h={220} r={16} />
    <Skeleton w="60%" h={16} /><Skeleton w="90%" h={14} /><Skeleton w="75%" h={14} />
  </div>
);

export const Stars = ({ value, count, size = 15 }) => {
  if (!value) return null;
  return (
    <span className="dm-stars" aria-label={`คะแนน ${value} จาก 5${count ? ` จาก ${count} รีวิว` : ''}`}>
      <Star size={size} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      <b>{value}</b>
      {count ? <span className="dm-muted">({count})</span> : null}
    </span>
  );
};

const MODE = {
  walk: { icon: Footprints, label: 'เดิน' },
  mrt: { icon: TramFront, label: 'รถไฟฟ้า' },
  moto: { icon: Bike, label: 'วินมอไซค์' },
  bus: { icon: Bus, label: 'รถเมล์' },
  boat: { icon: Ship, label: 'เรือคลองแสนแสบ' },
};
// Signature element: "~N นาที" to the SWU gate. Always shown as an estimate.
// zone: the estimate comes from the zone's typical building, not this exact address.
// quiet: the page already says the mode next to the badge, so skip the screen-reader text.
// filled: solid teal version for hero / zone / building cards. lg: bigger.
export const Minutes = ({ minutes, mode = 'walk', long = false, className = '', zone = false, quiet = false, filled = false, lg = false }) => {
  if (!minutes) return null;
  const m = MODE[mode] || MODE.walk;
  const I = m.icon;
  const tip = zone ? `ประมาณ ${minutes} นาทีถึง มศว คิดจากตึกทั่วไปในโซนนี้ เป็นค่าประมาณ`
    : `ประมาณ ${minutes} นาทีถึงประตู มศว (${m.label}) เป็นค่าประมาณ`;
  return (
    <span className={`dm-min ${zone ? 'is-zone' : ''} ${filled ? 'filled' : ''} ${lg ? 'lg' : ''} ${className}`} title={tip}>
      <I size={14} strokeWidth={2} aria-hidden="true" />
      <span>~{minutes} นาที{long ? 'ถึง มศว' : ''}</span>
      {!quiet && <span className="dm-sr">{zone ? 'ประมาณจากโซน' : `${m.label} ค่าประมาณ`}</span>}
    </span>
  );
};
// Same footprint as a Minutes badge, shown on cards until the buildings payload has loaded.
export const MinutesSkel = () => <Skeleton w={72} h={24} r={999} style={{ flex: '0 0 auto' }} />;
export const modeLabel = (mode) => (MODE[mode] || MODE.walk).label;
export const modeIcon = (mode) => (MODE[mode] || MODE.walk).icon;

// Transit-line colour per zone (styling only; zone names come from /meta)
const ZONE_LINE = {
  asoke: '#1F4E9C', rama9: '#1F4E9C', huaikwang: '#1F4E9C', ratchada: '#1F4E9C',
  dindaeng: '#0E7C86', ramkhamhaeng: '#9E1028', ladprao: '#F4B63F', other: '#7C8493',
};
export const zoneDot = (id) => ZONE_LINE[id] || '#7C8493';
export const zoneShort = (label) => (label || '').replace(/\s*\(.*\)\s*$/, '');

export const kindShort = (meta, kind) => (labelOf(meta?.kinds, kind) || '').split(' / ')[0];
export const KindBadge = ({ kind, className = '' }) => {
  const meta = useDormMeta();
  const l = kindShort(meta, kind);
  if (!l) return null;
  return <span className={`dm-kind k-${kind} ${className}`}>{l}</span>;
};

export const Verified = ({ on, small = false }) => (on ? (
  <span className={`dm-verified ${small ? 'sm' : ''}`} title="เข้าสู่ระบบด้วย Google บัญชี @swu.ac.th">
    <BadgeCheck size={small ? 14 : 16} aria-hidden="true" />ยืนยันนิสิต มศว
  </span>
) : null);

export const firstPhoto = (x) => (x.photo_links || []).find((p) => p.startsWith('/api/dorm/photos/') || p.startsWith('blob:') || p.startsWith('data:'));
export const realPhotos = (x) => (x.photo_links || []).filter((p) => p.startsWith('/api/dorm/photos/') || p.startsWith('blob:') || p.startsWith('data:'));
export const photoSrc = (p) => (p.startsWith('/api/') ? `${process.env.REACT_APP_BACKEND_URL}${p}` : p);
// Illustrated thumbnail per building type; condos rotate between three variants by slug.
export const buildingArt = (b) => {
  if (b?.type === 'apartment') return '/dorm/illustrations/bldg-apartment.svg';
  if (b?.type === 'dorm') return '/dorm/illustrations/bldg-dorm.svg';
  let h = 0;
  for (const ch of b?.slug || '') h = (h + ch.charCodeAt(0)) % 3;
  return `/dorm/illustrations/bldg-condo${h ? `-${h + 1}` : ''}.svg`;
};

/* ---------------------------------------------------------------- project photos (remote, credited)
   Building photos are other sites' images shown link-preview style: only the URL is stored, the
   browser loads it straight from the source with no referrer, and wherever one is shown large the
   credit links back to its page. A dead link falls back to our illustration, never a hole. */
// { url, credit, source_url } or null: the card-weight photo (the server picks one under ~700 KB)
export const buildingThumb = (b) => (b?.thumb?.url ? b.thumb : null);

// Remote <img> with the fallback built in. onFail tells the parent to hide the credit.
export const RemoteImg = ({ src, fallback, className, alt = '', eager = false, onFail }) => {
  const [bad, setBad] = useState(null);
  if (!src || bad === src) return fallback ? <img src={fallback} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} /> : null;
  return (
    <img src={src} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
         onError={() => { setBad(src); if (onFail) onFail(src); }} />
  );
};

export const Credit = ({ photo, className = '' }) => (photo?.credit ? (
  <a className={`dm-credit ${className}`} href={photo.source_url} target="_blank" rel="noopener noreferrer"
     aria-label={`ภาพจาก ${photo.credit} (เปิดหน้าแหล่งที่มา)`}>ภาพจาก {photo.credit}</a>
) : null);

// Swipeable gallery of a building's photos with a "ภาพโครงการ 1/3" caption and the credit of the photo
// in view. Photos that fail to load drop out; when none is left it renders `fallback`.
export const ProjectGallery = ({ photos, fallback = null, eager = true, label = 'ภาพโครงการ', className = '', name = '' }) => {
  const [failed, setFailed] = useState([]);
  const list = (photos || []).filter((p) => p?.url && !failed.includes(p.url));
  const [ref, api] = useEmblaCarousel({ loop: false });
  const s = useEmblaNav(api);
  useEffect(() => { if (api) api.reInit(); }, [api, list.length]);
  if (!list.length) return fallback;
  const cur = list[Math.min(s.i, list.length - 1)];
  return (
    <div className={`dm-gallery dm-pgal ${className}`} aria-roledescription="carousel" aria-label={`${label}${name ? ` ${name}` : ''}`}>
      <div className="dm-gallery-view" ref={ref}>
        <div className="dm-gallery-track">
          {list.map((p, i) => (
            <div key={`${p.url}-${i}`} className="dm-gallery-slide" role="group" aria-roledescription="slide" aria-label={`รูปที่ ${i + 1} จาก ${list.length}`}>
              <img src={p.url} alt={`${label}${name ? ` ${name}` : ''} ${i + 1}`} loading={eager && !i ? 'eager' : 'lazy'} decoding="async"
                   referrerPolicy="no-referrer" onError={() => setFailed((f) => (f.includes(p.url) ? f : [...f, p.url]))} />
            </div>
          ))}
        </div>
      </div>
      {list.length > 1 && (
        <>
          <button type="button" className="dm-roundbtn prev" onClick={() => api?.scrollPrev()} disabled={!s.prev} aria-label="รูปก่อนหน้า"><ChevronLeft size={18} /></button>
          <button type="button" className="dm-roundbtn next" onClick={() => api?.scrollNext()} disabled={!s.next} aria-label="รูปถัดไป"><ChevronRight size={18} /></button>
        </>
      )}
      <span className="dm-pgal-cap"><ImageIcon size={12} aria-hidden="true" />{label}{list.length > 1 && <span className="dm-pgal-n">{Math.min(s.i, list.length - 1) + 1}/{list.length}</span>}</span>
      <Credit photo={cur} className="dm-pgal-credit" />
    </div>
  );
};

// Real photo; else the building's project photo labelled "ภาพโครงการ"; else the kind's illustration
// (variant by id) with a tiny quiet "ภาพประกอบ" note so nobody mistakes it for the actual room.
// More than one real photo: a photo-count chip instead.
// External rooms (gathered from a public listing site) show the source's own photos, hot-linked with no referrer;
// a dead one falls through to the next, then to the building photo, then to the illustration.
export const Cover = ({ x, eager = false, note = true, building = null }) => {
  const photos = realPhotos(x);
  const ph = photos[0];
  const [bad, setBad] = useState([]);
  const fail = (u) => setBad((b) => (b.includes(u) ? b : [...b, u]));
  const extList = !ph ? (x.ext_photos || []).filter((p) => p?.url && !bad.includes(p.url)) : [];
  const ext = extList[0];
  const bp = !ph && !ext ? buildingThumb(building) : null;
  const useBp = bp && !bad.includes(bp.url);
  if (ext) {
    return (
      <div className="dm-cover is-photo is-ext" title={`ภาพจาก ${ext.credit}`}>
        <RemoteImg key={ext.url} src={ext.url} eager={eager} onFail={fail} />
        {extList.length > 1 && <span className="dm-cover-count"><Camera size={12} aria-hidden="true" />{extList.length}<span className="dm-sr"> รูป</span></span>}
      </div>
    );
  }
  return (
    <div className={`dm-cover ${ph || useBp ? 'is-photo' : 'is-art'}`}>
      {ph ? <img src={photoSrc(ph)} alt="" loading={eager ? 'eager' : 'lazy'} />
        : <RemoteImg src={useBp ? bp.url : null} fallback={coverFor(x.kind, x.id)} eager={eager} onFail={fail} />}
      {!ph && note && (useBp
        ? <span className="dm-cover-note is-project" title={`ภาพโครงการ ไม่ใช่ห้องนี้ ภาพจาก ${bp.credit}`}><span className="dm-cover-l1"><span><ImageIcon size={11} aria-hidden="true" />ภาพโครงการ</span> <span>ไม่ใช่ห้องนี้</span></span><span className="dm-cover-src">จาก {bp.credit}</span></span>
        : <span className="dm-cover-note"><ImageIcon size={11} aria-hidden="true" />ภาพประกอบ</span>)}
      {photos.length > 1 && <span className="dm-cover-count"><Camera size={12} aria-hidden="true" />{photos.length}<span className="dm-sr"> รูป</span></span>}
    </div>
  );
};

export const genderShort = (meta, g) => (g === 'any' || !g ? 'รับทุกเพศ' : labelOf(meta?.gender_prefs, g));

// One rule for every price on the site: per person whenever the room is shared, otherwise the whole room,
// and the unit always says which.
export const priceOf = (x) => {
  const shared = Number(x.people_total) > 1 && !wholeFirst(x);
  const n = shared ? perPersonOf(x) : (x.price_total || x.price_per_person || null);
  if (!n) return null;
  return shared ? { n, per: true, unit: '฿/คน/ด.', long: 'บาท/คน/เดือน', aria: `${baht(n)} บาทต่อคนต่อเดือน` }
    : { n, per: false, unit: '฿ ทั้งห้อง/ด.', long: 'บาท ทั้งห้อง/เดือน', aria: `ทั้งห้อง ${baht(n)} บาทต่อเดือน` };
};

// Neutral "ตัวอย่าง" pill for seeded demo content (see splitDemo). onPaper: grey version for white/paper surfaces.
export const DemoPill = ({ onPaper = false }) => <span className={`dm-pill demo ${onPaper ? 'on-paper' : ''}`}>ตัวอย่าง</span>;

// Heart toggle for saved rooms (this device). 44px tap target; never triggers the card link.
// plain: no white disc (for white surfaces). Every save shows a short toast with a link to the saved list.
// Saved rooms live on this device only, and the label says so; it also says whether this room is saved.
export const SaveButton = ({ id, title = '', className = '', plain = false, size = 19 }) => {
  const { has, toggle } = useSaved();
  const shell = useShell();
  const [pop, setPop] = useState(false);
  const on = has(id);
  const click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = toggle(id);
    setPop(false);
    if (!now) return;
    requestAnimationFrame(() => setPop(true));
    if (shell?.toast) shell.toast('เก็บไว้และทำเครื่องหมายว่าเล็งห้องนี้แล้ว (ไม่ต้องล็อกอิน)', { action: { label: 'ดู', to: '/dorm/me?tab=saved' } });
  };
  const label = on ? 'เก็บไว้ในเครื่องนี้แล้ว แตะเพื่อเอาออก' : 'เก็บไว้ในเครื่องนี้';
  return (
    <button type="button" className={`dm-save ${plain ? 'plain' : ''} ${pop ? 'is-popping' : ''} ${className}`} onClick={click}
            onAnimationEnd={() => setPop(false)} aria-pressed={on} data-testid="dorm-save-btn"
            aria-label={title ? `${label}: ${title}` : label} title={label}>
      <span className="dm-save-disc">
        <Heart size={size} strokeWidth={2.2} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
      </span>
    </button>
  );
};

// Listing card v2. list: 2:1 cover on phones (rooms list, ~2 cards per screen); otherwise 16:10.
// i: position for the dm-rise stagger (omit for no entrance animation). eager: load the cover now.
// Public interest on a room: who pressed "สนใจ หาเมทห้องนี้" (avatar stack) and how many seats are left.
// Nothing when nobody has. Saving (the heart) stays private and separate.
// The neutral total ("3 คนสนใจห้องนี้") with initials-only avatars. matchLine: add "ตรงกับคุณ M คน" for a viewer with
// a live profile (detail header); cards stay neutral.
export const InterestChip = ({ x, size = 24, className = '', matchLine = false }) => {
  const text = interestText(x);
  if (!text) return null;
  const avs = (x.interest_avatars || []).map(avOf);
  const m = matchLine && x.interest_match != null ? x.interest_match : null;
  return (
    <span className={`dm-ichip ${x.my_interest ? 'is-mine' : ''} ${className}`}>
      <span className="dm-stack dm-ichip-stack" aria-hidden="true">
        {avs.map((a, k) => <Avatar key={k} av={a} size={size} />)}
        {x.interest_count > avs.length && <span className="dm-avatar dm-ichip-more" style={{ width: size, height: size, fontSize: size * 0.4 }}>+{x.interest_count - avs.length}</span>}
      </span>
      <span className="dm-ichip-t">{text}{m != null && ' '}{m != null && <span className="dm-ichip-match">{m > 0 ? `ตรงกับคุณ ${m} คน` : 'ยังไม่มีใครตรงกับคุณ'}</span>}</span>
    </span>
  );
};

// The secondary price line under the headline (see priceView): "ทั้งห้อง 15,000 หาร 2" for a shared room,
// "หรือหาร 2 คนละ 3,250" for a room for one, "หารได้ 2 คนละ 7,000" for a posted room that takes 2; highlighted
// "ตรงงบเมื่อหาร ..." when the per-person budget (budgetMax) found it only through the split.
export const SplitLine = ({ x, className = '', budgetMax }) => {
  const pv = priceView(x, budgetMax);
  if (!pv?.sub) return null;
  return (
    <span className={`dm-splitline ${pv.match ? 'is-match' : ''} ${className}`} data-testid={wholeFirst(x) ? 'dorm-single-split' : undefined}>
      <Users size={15} aria-hidden="true" />
      {pv.sub.text ? pv.sub.text : <>{pv.sub.lead} <b>{baht(pv.sub.per)}</b></>}
    </span>
  );
};

// Headline price pill on a card cover: "7,500 ฿/คน/ด." or "6,500 ฿/ด. อยู่คนเดียว".
const PricePill = ({ pv, prefix = '' }) => (
  <span className={`dm-price-pill ${pv.unit.includes('/คน') ? 'is-per' : 'is-whole'}`}>
    {prefix && <small className="dm-price-pre">{prefix}</small>}<b>{typeof pv.head === 'number' ? baht(pv.head) : pv.head}</b>{pv.unit}
    {pv.tag && <small className="dm-price-tag">{pv.tag}</small>}
  </span>
);

// A listing posted on this site (not gathered from another site): who posted it and that you can message them here.
const POSTER_MARK = { student: 'ลงโดยนิสิต', owner: 'ลงโดยเจ้าของห้อง', agent: 'ลงโดยนายหน้า' };
export const NativeMark = ({ x, className = '' }) => (x.external ? null : (
  <span className={`dm-native ${className}`} data-testid="dorm-native-mark">
    <MessageCircle size={14} aria-hidden="true" />{POSTER_MARK[x.poster_role] || 'ลงในเว็บนี้'} ทักได้ในเว็บ
  </span>
));

export const ListingCard = ({ x, to, preview = false, list = false, i, eager = false, className = '', budgetMax }) => {
  const meta = useDormMeta();
  const buildings = useBuildings();
  const b = x.building_slug ? (buildings || []).find((y) => y.slug === x.building_slug) : null;
  // while buildings load, the minutes badge is a placeholder: a zone guess now and the building's figure a moment
  // later would show two different numbers for the same room
  const bLoading = buildings === null;
  const zm = !bLoading && !b?.minutes_to_swu ? zoneMinutes(buildings, x.zone) : null;
  // an external room's generated title already names the building, so the line under it gives the zone
  const where = (!x.external && (x.building_name || b?.name)) || zoneShort(labelOf(meta?.zones, x.zone));
  const pv = priceView(x, budgetMax);
  const pr = pv ? null : priceOf(x);
  const { title, demo } = splitDemo(x.title);
  const ext = !!x.external;
  const gone = !!x.is_gone;
  const body = (
    <>
      <div className="dm-card-media">
        <Cover x={x} eager={eager} building={b} />
        <div className="dm-card-tl">
          {ext ? <span className="dm-pill src" title="ข้อมูลจากประกาศสาธารณะ ยืนยันที่เว็บต้นทาง">จาก {x.source}</span> : <KindBadge kind={x.kind} />}
          {gone && <span className="dm-pill gone">{x.gone_label || 'ออกไปแล้ว'}</span>}
          {!gone && x.maybe_gone && <span className="dm-pill warn" title="มีผู้ใช้แจ้งว่าห้องนี้อาจไม่ว่างแล้ว"><TriangleAlert size={12} aria-hidden="true" />อาจไม่ว่างแล้ว</span>}
          {!gone && x.interest_people > 0 && <span className="dm-pill wait"><HandHeart size={12} aria-hidden="true" />รอหาร {x.interest_people} คน</span>}
          {!gone && x.peek_count > 0 && <span className="dm-pill peek" title="สนใจนิดๆ (กดหัวใจเล็งไว้ โดยไม่ต้องล็อกอิน)"><Eye size={12} aria-hidden="true" />เล็งอยู่ {x.peek_count}</span>}
          {demo && <DemoPill />}
          {!gone && x.featured && <span className="dm-pill sun">แนะนำ</span>}
          {!gone && x.status === 'reserved' && <span className="dm-pill dark">มีคนจองแล้ว</span>}
        </div>
        {pv ? <PricePill pv={pv} /> : pr && (
          <span className={`dm-price-pill ${pr.per ? 'is-per' : 'is-whole'}`}>
            <b>{baht(pr.n)}</b>{pr.unit}
          </span>
        )}
      </div>
      <div className="dm-card-body">
        <h3 className="dm-card-title">{title || 'ชื่อประกาศ'}</h3>
        {(where || b?.minutes_to_swu || zm || bLoading) && (
          <div className="dm-card-where">
            {where && <span className="dm-ellipsis">{where}</span>}
            {bLoading ? <MinutesSkel />
              : b?.minutes_to_swu ? <Minutes minutes={b.minutes_to_swu} mode={b.travel_mode} />
                : zm && <Minutes minutes={zm.minutes} mode={zm.mode} zone />}
          </div>
        )}
        <SplitLine x={x} budgetMax={budgetMax} />
        <div className="dm-card-meta">
          {x.poster_swu_verified && <span className="dm-card-ok" title="ผู้ลงประกาศยืนยันนิสิต มศว"><BadgeCheck size={15} aria-hidden="true" />นิสิต มศว</span>}
          {x.move_in && <span><CalendarDays size={15} aria-hidden="true" />{ext ? 'ว่าง' : 'เข้าอยู่'} {thDate(x.move_in)}</span>}
          {ext && x.furnished && <span><Sofa size={15} aria-hidden="true" />เฟอร์ครบ</span>}
          {ext && x.floor ? <span>ชั้น {x.floor}</span> : null}
          {!ext && x.gender_pref && <span><UserRound size={15} aria-hidden="true" />{genderShort(meta, x.gender_pref)}</span>}
        </div>
        {!gone && <NativeMark x={x} />}
        {!gone && <InterestChip x={x} />}
      </div>
    </>
  );
  const cls = `dm-card ${list ? 'is-list' : ''} ${gone ? 'is-gone' : x.interest_people > 0 ? 'has-wait' : ''} ${i != null ? 'dm-rise' : ''} ${className}`;
  const style = i != null ? { '--i': i } : undefined;
  if (preview) return <div className={cls} style={style} data-testid="dorm-listing-preview"><div className="dm-card-link">{body}</div></div>;
  return (
    <article className={cls} style={style}>
      <Link to={to || `/dorm/rooms/${x.id}`} className="dm-card-link" data-testid="dorm-listing-card"
            aria-label={[title, gone ? (x.gone_label || 'ออกไปแล้ว') : '', pv ? pv.aria : pr?.aria, where,
              ext ? `ข้อมูลจาก ${x.source}` : 'ลงในเว็บนี้ ทักได้ในเว็บ', !gone && interestText(x)].filter(Boolean).join(', ')}>{body}</Link>
      {x.id && !gone && <div className="dm-card-tr"><SaveButton id={x.id} title={title} /></div>}
    </article>
  );
};

// One card for 3+ look-alike external rooms of one building and source (see groupLookalikes): the building photo,
// name, how many room types, the rent range and the lowest per-person line. Opens the building's rooms tab,
// where every room stays reachable on its own; the building page's back link returns here. No heart: saving
// works on single rooms.
export const GroupCard = ({ g, list = false, i, eager = false, className = '', budgetMax }) => {
  const meta = useDormMeta();
  const buildings = useBuildings();
  const location = useLocation();
  const b = (buildings || []).find((y) => y.slug === g.slug) || null;
  const bLoading = buildings === null;
  const zm = !bLoading && !b?.minutes_to_swu ? zoneMinutes(buildings, g.rows[0].zone) : null;
  const totals = g.rows.map((r) => Number(r.price_total) || 0).filter(Boolean);
  const lo = totals.length ? Math.min(...totals) : 0;
  const hi = totals.length ? Math.max(...totals) : 0;
  // Per person leads when any room here is normally shared (the cheapest share, "เริ่ม 3,250 ฿/คน/ด."), with the
  // whole-room range as the second line; a building of rooms for one leads with the range "อยู่คนเดียว".
  const shared = g.rows.filter((r) => !wholeFirst(r)).map((r) => priceView(r)).filter(Boolean).sort((a, c) => a.head - c.head);
  const singles = g.rows.filter((r) => wholeFirst(r)).map((r) => ({ r, pv: priceView(r, budgetMax) })).filter((c) => c.pv?.sub)
    .sort((a, c) => a.pv.sub.per - c.pv.sub.per);
  const people = g.rows.reduce((n, r) => n + (Number(r.interest_people) || 0), 0);
  const peeks = g.rows.reduce((n, r) => n + (Number(r.peek_count) || 0), 0);
  const avs = g.rows.flatMap((r) => r.interest_avatars || []).slice(0, 3).map(avOf);
  const name = g.name || b?.name || 'ตึกนี้';
  const range = lo === hi ? baht(lo) : `${baht(lo)}–${baht(hi)}`;
  const pill = shared.length ? { head: shared[0].head, unit: '฿/คน/ด.', tag: '' } : { head: range, unit: '฿/ด.', tag: 'อยู่คนเดียว' };
  const cheapSingle = singles[0];
  const second = shared.length ? `ทั้งห้อง ${range} ฿/ด.`
    : cheapSingle ? `${cheapSingle.pv.match ? 'ตรงงบเมื่อหาร' : 'หรือหาร'} ${splitOf(cheapSingle.r).n} เริ่มคนละ ${baht(cheapSingle.pv.sub.per)}` : '';
  const secondMatch = !shared.length && !!cheapSingle?.pv.match;
  const where = zoneShort(labelOf(meta?.zones, g.rows[0].zone));
  const cls = `dm-card dm-groupcard ${list ? 'is-list' : ''} ${people > 0 ? 'has-wait' : ''} ${i != null ? 'dm-rise' : ''} ${className}`;
  return (
    <article className={cls} style={i != null ? { '--i': i } : undefined}>
      <Link to={`/dorm/buildings/${g.slug}?tab=rooms`} state={{ from: `${location.pathname}${location.search}` }} className="dm-card-link"
            data-testid="dorm-group-card"
            aria-label={[name, `${g.rows.length} แบบห้อง`, shared.length ? `เริ่มคนละ ${baht(pill.head)} บาทต่อเดือน` : `${range} บาทต่อเดือน อยู่คนเดียว`, second, where,
              `ข้อมูลจาก ${g.source}`, people && `${people} คนสนใจห้องในตึกนี้`].filter(Boolean).join(', ')}>
        <div className="dm-card-media">
          <Cover x={g.rows[0]} eager={eager} building={b} />
          <div className="dm-card-tl">
            <span className="dm-pill src" title="ข้อมูลจากประกาศสาธารณะ ยืนยันที่เว็บต้นทาง">จาก {g.source}</span>
            {people > 0 && <span className="dm-pill wait"><HandHeart size={12} aria-hidden="true" />รอหาร {people} คน</span>}
            {peeks > 0 && <span className="dm-pill peek" title="สนใจนิดๆ (กดหัวใจเล็งไว้ โดยไม่ต้องล็อกอิน)"><Eye size={12} aria-hidden="true" />เล็งอยู่ {peeks}</span>}
          </div>
          <PricePill pv={pill} prefix={shared.length ? 'เริ่ม' : ''} />
        </div>
        <div className="dm-card-body">
          <h3 className="dm-card-title">{name}</h3>
          <div className="dm-card-where">
            <span className="dm-ellipsis"><b className="dm-group-n">{g.rows.length} แบบห้อง</b>{where ? ` ${where}` : ''}</span>
            {bLoading ? <MinutesSkel />
              : b?.minutes_to_swu ? <Minutes minutes={b.minutes_to_swu} mode={b.travel_mode} />
                : zm && <Minutes minutes={zm.minutes} mode={zm.mode} zone />}
          </div>
          {second && (
            <span className={`dm-splitline ${secondMatch ? 'is-match' : ''}`}>
              <Users size={15} aria-hidden="true" />{second}
            </span>
          )}
          <div className="dm-card-meta"><span><Building2 size={15} aria-hidden="true" />ดูทุกแบบในตึกนี้</span></div>
          {people > 0 && (
            <span className="dm-ichip">
              <span className="dm-stack dm-ichip-stack" aria-hidden="true">{avs.map((a, k) => <Avatar key={k} av={a} size={24} />)}</span>
              <span className="dm-ichip-t">{people} คนสนใจห้องในตึกนี้</span>
            </span>
          )}
        </div>
      </Link>
    </article>
  );
};

// One list entry from groupLookalikes(): a group card or a room card.
export const ListingOrGroup = ({ e, ...rest }) => (e.group ? <GroupCard g={e.group} {...rest} /> : <ListingCard x={e.x} {...rest} />);

// Building card for the home rail and the buildings grid. tall: 3:2 thumb (2-column grid on phones).
// The thumb is the project photo when a light one exists (tiny quiet credit), else the illustration.
// priceFrom: { n, per } from lowestPrice(): "เริ่ม x ฿/คน", or "ทั้งห้อง ~x ฿" when no room there is shared. sub: one quiet line (type, zone). children: extra rows.
// The OpenChat archive adds "เคยมี n ประกาศ" and its per-person prices (see ppShape: median from 5 ads, range from 2).
export const BuildingCard = ({ b, priceFrom, sub, tall = false, i, className = '', testid = 'dorm-building-card', children }) => {
  const th = buildingThumb(b);
  const [bad, setBad] = useState(false);
  const chat = b.chat || {};
  const pp = chat.per_person || {};
  return (
    <Link to={`/dorm/buildings/${b.slug}`} className={`dm-bc dm-press dm-lift ${tall ? 'tall' : ''} ${i != null ? 'dm-rise' : ''} ${className}`}
          style={i != null ? { '--i': i } : undefined} data-testid={testid}>
      <span className="dm-bc-media">
        <RemoteImg className="dm-bc-thumb" src={th?.url} fallback={buildingArt(b)} onFail={() => setBad(true)} />
        {th && !bad && <span className="dm-bc-credit">ภาพจาก {th.credit}</span>}
      </span>
      <span className="dm-bc-body">
        <span className="dm-bc-name">{b.name}</span>
        {sub && <span className="dm-bc-sub">{sub}</span>}
        <span className="dm-bc-row">
          {b.minutes_to_swu ? <Minutes minutes={b.minutes_to_swu} mode={b.travel_mode} filled /> : null}
          {b.overall ? <Stars value={b.overall} count={b.review_count} />
            : (b.pros?.length || b.cons?.length) ? <span className="dm-bc-none">สรุปรีวิว {(b.pros?.length || 0) + (b.cons?.length || 0)} จุด</span> : null}
        </span>
        {chat.count > 0 && (
          <span className="dm-bc-chat" title="นับจากประกาศเก่าในกลุ่ม OpenChat ไม่ใช่ห้องว่างตอนนี้">
            เคยมี {chat.count} ประกาศ{ppShape(pp) === 'stats' ? <> <span className="dm-nowrap">ค่ากลาง <b>{baht(pp.median)}</b> ฿/คน</span></>
              : ['range', 'same'].includes(ppShape(pp)) && <> <span className="dm-nowrap"><b>{ppRangeText(pp)}</b> ฿/คน</span></>}
          </span>
        )}
        {children}
        {(b.active_listings > 0 || priceFrom) && (
          <span className="dm-bc-foot">
            {b.active_listings > 0 ? <span className="dm-avail">มี {b.active_listings} ห้อง</span> : <span />}
            {priceFrom ? (priceFrom.per ? <span className="dm-bc-price">เริ่ม {baht(priceFrom.n)} <small>฿/คน</small></span>
              : <span className="dm-bc-price"><small>ทั้งห้อง</small> ~{baht(priceFrom.n)} <small>฿</small></span>) : null}
          </span>
        )}
      </span>
    </Link>
  );
};
export const ListingRow = ListingCard;
// Lowest price among listings, per person when any of them is shared: { n, per } or null.
export const lowestPrice = (listings) => {
  let best = null;
  (listings || []).forEach((x) => {
    const p = priceOf(x);
    if (!p) return;
    if (!best || (p.per && !best.per) || (p.per === best.per && p.n < best.n)) best = { n: p.n, per: p.per };
  });
  return best;
};

/* ---------------------------------------------------------------- carousels (embla) */
const useEmblaNav = (api) => {
  const [s, setS] = useState({ prev: false, next: false, i: 0, n: 0 });
  useEffect(() => {
    if (!api) return undefined;
    const on = () => setS({ prev: api.canScrollPrev(), next: api.canScrollNext(), i: api.selectedScrollSnap(), n: api.scrollSnapList().length });
    on();
    api.on('select', on); api.on('reInit', on);
    return () => { api.off('select', on); api.off('reInit', on); };
  }, [api]);
  return s;
};

// Horizontal rail of cards (78% wide slides on phones so the next card peeks; size="sm" for 58%);
// title row carries prev/next on desktop.
export const Rail = ({ title, link, sub = null, testid, children, label, size = '', className = '', style }) => {
  const [ref, api] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', slidesToScroll: 'auto' });
  const s = useEmblaNav(api);
  return (
    <section className={`dm-sec dm-rail ${size} ${className}`} style={style} aria-roledescription="carousel" aria-label={label || title} data-testid={testid}>
      <div className="dm-sec-head">
        <h2>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {link}
          <div className="dm-rail-btns">
            <button type="button" className="dm-roundbtn" onClick={() => api?.scrollPrev()} disabled={!s.prev} aria-label="ก่อนหน้า"><ChevronLeft size={18} /></button>
            <button type="button" className="dm-roundbtn" onClick={() => api?.scrollNext()} disabled={!s.next} aria-label="ถัดไป"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      {sub}
      <div className="dm-rail-view" ref={ref}>
        <div className="dm-rail-track">
          {React.Children.map(children, (c) => <div className="dm-rail-slide" role="group" aria-roledescription="slide">{c}</div>)}
        </div>
      </div>
    </section>
  );
};

// Photo gallery: stays inside its column (no overflow), swipe on phones, arrows on desktop.
export const Gallery = ({ photos }) => {
  const [ref, api] = useEmblaCarousel({ loop: false });
  const s = useEmblaNav(api);
  return (
    <div className="dm-gallery" aria-roledescription="carousel" aria-label="รูปห้อง">
      <div className="dm-gallery-view" ref={ref}>
        <div className="dm-gallery-track">
          {photos.map((p, i) => (
            <div key={p} className="dm-gallery-slide" role="group" aria-roledescription="slide" aria-label={`รูปที่ ${i + 1} จาก ${photos.length}`}>
              <img src={photoSrc(p)} alt={`รูปห้อง ${i + 1}`} loading={i ? 'lazy' : 'eager'} />
            </div>
          ))}
        </div>
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" className="dm-roundbtn prev" onClick={() => api?.scrollPrev()} disabled={!s.prev} aria-label="รูปก่อนหน้า"><ChevronLeft size={18} /></button>
          <button type="button" className="dm-roundbtn next" onClick={() => api?.scrollNext()} disabled={!s.next} aria-label="รูปถัดไป"><ChevronRight size={18} /></button>
          <span className="dm-gallery-count">{s.i + 1}/{photos.length}</span>
        </>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- inputs */
// Chip content shared by Pick and ChipRow: option { id, label, aria?, icon? (lucide), dot? (css colour) }
const ChipInner = ({ o, on, check }) => {
  const I = o.icon;
  return (
    <>
      {check && on && <Check size={15} strokeWidth={2.4} aria-hidden="true" />}
      {I && !(check && on) && <I size={15} aria-hidden="true" />}
      {o.dot && <i className="dm-dot" style={{ color: o.dot }} aria-hidden="true" />}
      {o.label}
    </>
  );
};

// Single or multi choice chips (wrapping). Selected = teal fill + check, never greyed out.
// scroll: one sideways-scrolling row on phones instead of wrapping.
export const Pick = ({ options, value, onChange, multi = false, label, invalid = false, id, allowEmpty = false, scroll = false }) => {
  const enc = (v) => String(v);
  const dec = (s) => options.find((o) => enc(o.id) === s)?.id;
  const common = { className: `${scroll ? 'dm-chiprow wrap-desk' : 'dm-pick'} ${invalid ? 'is-invalid' : ''}`, 'aria-label': label, id };
  const items = options.map((o) => {
    const on = multi ? (value || []).includes(o.id) : value === o.id;
    return (
      <ToggleGroup.Item key={enc(o.id)} value={enc(o.id)} className="dm-chip" aria-label={o.aria || o.label}>
        <ChipInner o={o} on={on} check />
      </ToggleGroup.Item>
    );
  });
  if (multi) {
    return (
      <ToggleGroup.Root type="multiple" {...common} value={(value || []).map(enc)} onValueChange={(v) => onChange(v.map(dec))}>
        {items}
      </ToggleGroup.Root>
    );
  }
  return (
    <ToggleGroup.Root type="single" {...common} value={value === '' || value == null ? '' : enc(value)}
                      onValueChange={(v) => { if (v !== '') onChange(dec(v)); else if (allowEmpty) onChange(''); }}>
      {items}
    </ToggleGroup.Root>
  );
};

// Single-select chip row that scrolls sideways (home search card, quick filters). One option is always
// on; '' is a valid id (use it for "ทุกโซน" / "ทุกงบ"). wrap: wrap on desktop (>=1024) instead of scrolling.
const ALL_CHIP = '__all';
// Sideways-scrolling rows: data-fade = left | right | both | none, for the .dm-fade-x edge fade (scroll cue).
export const useEdgeFade = () => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const upd = () => {
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      const v = l && r ? 'both' : l ? 'left' : r ? 'right' : 'none';
      if (el.dataset.fade !== v) el.dataset.fade = v;
    };
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    const mo = 'MutationObserver' in window ? new MutationObserver(upd) : null;
    if (mo) mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); if (mo) mo.disconnect(); };
  }, []);
  return ref;
};
export const ChipRow = ({ options, value, onChange, label, className = '', wrap = true, id }) => {
  const fade = useEdgeFade();
  const enc = (v) => (v === '' || v == null ? ALL_CHIP : String(v));
  const dec = (s) => options.find((o) => enc(o.id) === s)?.id;
  return (
    <ToggleGroup.Root ref={fade} type="single" id={id} className={`dm-chiprow dm-fade-x ${wrap ? 'wrap-desk' : ''} ${className}`} aria-label={label}
                      value={enc(value)} onValueChange={(v) => { if (v) onChange(dec(v) ?? ''); }}>
      {options.map((o) => (
        <ToggleGroup.Item key={enc(o.id)} value={enc(o.id)} className="dm-chip" aria-label={o.aria || o.label}>
          <ChipInner o={o} on={enc(value) === enc(o.id)} />
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
};

// shadcn Select styled to the dorm tokens. Radix can't use '' as an item value, so the
// "all" option maps to '' for callers.
const ALL = '__all';
export const SelectBox = ({ value, onChange, options, allLabel, placeholder, label, size, id, invalid = false }) => (
  <Select value={value === '' || value == null ? (allLabel ? ALL : undefined) : String(value)}
          onValueChange={(v) => onChange(v === ALL ? '' : v)}>
    <SelectTrigger id={id} className={`dm-select ${size === 'sm' ? 'sm' : ''} ${invalid ? 'is-invalid' : ''}`} aria-label={label}>
      <SelectValue placeholder={placeholder || allLabel} />
    </SelectTrigger>
    <SelectContent className="dorm-portal dm-select-pop" position="popper" sideOffset={4}>
      {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
      {options.map((o) => <SelectItem key={String(o.id)} value={String(o.id)}>{o.label}</SelectItem>)}
    </SelectContent>
  </Select>
);

// Segmented control (one always selected)
export const Seg = ({ options, value, onChange, label, full = false, className = '' }) => (
  <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v !== '' && v != null && onChange(v)}
                    className={`dm-seg ${full ? 'full' : ''} ${className}`} aria-label={label}>
    {options.map((o) => (
      <ToggleGroup.Item key={o.id} value={o.id} className="dm-seg-item">{o.label}</ToggleGroup.Item>
    ))}
  </ToggleGroup.Root>
);

// ห้อง | ตึก switch shared by the rooms and buildings pages (preserves ?zone= across both views)
export const RoomsSwitch = ({ current, zone = '' }) => {
  const qs = zone ? `?zone=${encodeURIComponent(zone)}` : '';
  return (
    <nav className="dm-seg dm-switch" aria-label="ห้องหรือรีวิวตึก">
      <Link to={`/dorm/rooms${qs}`} className={`dm-seg-item ${current === 'rooms' ? 'on' : ''}`} aria-current={current === 'rooms' ? 'page' : undefined}>
        <KeyRound size={15} aria-hidden="true" />ห้องว่าง
      </Link>
      <Link to={`/dorm/buildings${qs}`} className={`dm-seg-item ${current === 'buildings' ? 'on' : ''}`} aria-current={current === 'buildings' ? 'page' : undefined}>
        <Building2 size={15} aria-hidden="true" />รีวิวตึก
      </Link>
    </nav>
  );
};

export const BUDGET_MIN = 2000;
export const BUDGET_MAX = 15000;
// Two-thumb budget slider (per person per month)
export const BudgetSlider = ({ value, onChange, onCommit, label = 'งบต่อคนต่อเดือน' }) => {
  const [lo, hi] = value;
  return (
    <div className="dm-budget">
      <div className="dm-budget-head">
        <span>{label}</span>
        <b className="dm-num">{baht(lo)} ถึง {hi >= BUDGET_MAX ? `${baht(BUDGET_MAX)}+` : baht(hi)} ฿</b>
      </div>
      <SliderPrimitive.Root className="dm-slider" min={BUDGET_MIN} max={BUDGET_MAX} step={250} minStepsBetweenThumbs={2}
                            value={value} onValueChange={onChange} onValueCommit={onCommit} aria-label={label}>
        <SliderPrimitive.Track className="dm-slider-track"><SliderPrimitive.Range className="dm-slider-range" /></SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="dm-slider-thumb" aria-label="งบต่ำสุด" />
        <SliderPrimitive.Thumb className="dm-slider-thumb" aria-label="งบสูงสุด" />
      </SliderPrimitive.Root>
    </div>
  );
};

/* ---------------------------------------------------------------- contact + report */
const LineGlyph = () => <MessageCircle size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />;

// Reveals LINE / phone / IG; the backend counts each reveal as a lead for the poster.
// After reveal the button morphs into the green LINE button in place.
export const ContactButton = ({ kind, id, roomId = '', label = 'ดูช่องทางติดต่อ', variant = 'primary', compact = false, ariaLabel }) => {
  const { token } = useAuth();
  const { requireLogin, toast, openChat } = useShell();
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fetchIt = async (tok) => {
    setBusy(true);
    try {
      const t = tok || localStorage.getItem('token');
      const r = await axios.get(`${API}/${kind === 'mate' ? 'mates' : 'listings'}/${id}/contact`, authHeaders(t));
      setC(r.data);
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const reveal = () => requireLogin('สมัครฟรีเพื่อดูช่องทางติดต่อ ใช้เวลาไม่ถึงนาที', () => fetchIt(token));
  const chat = () => openChat(kind === 'mate' ? 'mate' : 'listing', id, roomId);
  if (c) {
    const line = (c.contact_line || '').replace(/^@?/, '');
    const copy = async () => {
      try { await navigator.clipboard.writeText(c.contact_line); toast('คัดลอก LINE ID แล้ว'); } catch { toast(`LINE ID: ${c.contact_line}`); }
    };
    return (
      <div className={`dm-contact is-open ${compact ? 'compact' : ''}`} data-testid="dorm-contact">
        {line && (
          <div className="dm-contact-id">
            <span className="dm-contact-val"><small>LINE ID</small><b>{c.contact_line}</b></span>
            <button type="button" className="dm-btn dm-btn-quiet dm-btn-sm" onClick={copy} aria-label={`คัดลอก LINE ID ${c.contact_line}`}>
              <Copy size={15} aria-hidden="true" />คัดลอก
            </button>
          </div>
        )}
        <div className="dm-contact-btns">
          {line && (
            <a className={`dm-btn dm-btn-line from-${variant}`} target="_blank" rel="noreferrer" href={`https://line.me/R/ti/p/~${encodeURIComponent(line)}`}>
              <LineGlyph />เพิ่มเพื่อนใน LINE
            </a>
          )}
          {c.contact_phone && (
            <a className="dm-btn dm-btn-quiet" href={`tel:${c.contact_phone.replace(/[^0-9+]/g, '')}`} aria-label={`โทร ${c.contact_phone}`}>
              <Phone size={17} aria-hidden="true" />{line ? 'โทร' : `โทร ${c.contact_phone}`}
            </a>
          )}
          {c.contact_ig && (
            <a className="dm-btn dm-btn-quiet" target="_blank" rel="noreferrer"
               href={`https://instagram.com/${c.contact_ig.replace(/^@/, '')}`} aria-label={`IG ${c.contact_ig}`}>
              <Instagram size={17} aria-hidden="true" />{line ? 'IG' : `IG ${c.contact_ig}`}
            </a>
          )}
        </div>
        {!line && !c.contact_phone && !c.contact_ig && <span className="dm-small dm-muted">ผู้ลงประกาศไม่ได้ใส่ช่องทางติดต่อ</span>}
      </div>
    );
  }
  return (
    <div className={`dm-contact ${compact ? 'compact' : ''}`}>
      <div className="dm-contact-row">
        <button type="button" className={`dm-btn ${variant === 'primary' ? 'dm-btn-primary' : 'dm-btn-ink'}`}
                onClick={chat} data-testid="dorm-chat-btn">
          <MessageCircle size={17} aria-hidden="true" /><span className="dm-ellipsis">ทักคุยในเว็บ</span>
        </button>
        <button type="button" className="dm-btn dm-btn-quiet dm-contact-alt"
                onClick={reveal} disabled={busy} data-testid="dorm-contact-btn" aria-label={ariaLabel || label}>
          <span>{busy ? 'กำลังเปิด' : 'ดู LINE'}</span>
        </button>
      </div>
      {err && <div className="dm-err" role="alert">{err}</div>}
    </div>
  );
};

const REPORT_LABEL = { listing: 'รายงานประกาศนี้', review: 'รายงานรีวิวนี้', mate: 'รายงานโปรไฟล์นี้' };
// The report sheet: reasons that fit what is reported (from /meta, per target type), an optional short note,
// then send. onSent runs after the server accepted it.
const ReportSheet = ({ type, id, onClose, onSent }) => {
  const { token } = useAuth();
  const meta = useDormMeta();
  const { toast, requireLogin, authOpen } = useShell();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const max = meta?.report_note_max || 200;
  const reasons = meta?.report_reasons_by_type?.[type] || meta?.report_reasons || [];
  const doSend = async () => {
    setBusy(true);
    try {
      const r = await axios.post(`${API}/reports`, { target_type: type, target_id: id, reason, note: note.trim() },
        authHeaders(token || localStorage.getItem('token')));
      onClose();
      onSent();
      const d = r.data || {};
      toast(d.auto_closed ? 'แจ้งแล้ว ระบบปรับห้องนี้เป็นไม่ว่างแล้ว'
        : d.auto_paused ? 'แจ้งแล้ว ระบบพักประกาศชั่วคราวรอเจ้าของยืนยัน'
          : d.needs_owner_confirm ? 'แจ้งแล้ว ระบบส่งคำถามให้เจ้าของยืนยันสถานะแล้ว'
            : d.maybe_gone ? 'แจ้งแล้ว ระบบติดป้ายเตือน “อาจไม่ว่างแล้ว” ที่ห้องนี้'
              : 'ส่งรายงานให้แอดมินแล้ว');
    } catch (e) { toast(errMsg(e)); setBusy(false); }
  };
  const send = () => {
    if (!reason) return;
    requireLogin('เข้าสู่ระบบเพื่อส่งรายงาน', () => { doSend(); });
  };
  return (
    <Sheet open={!authOpen} title={REPORT_LABEL[type] || 'รายงาน'} description="เลือกเหตุผล แอดมินจะตรวจภายใน 1 ถึง 2 วัน" onClose={onClose}
           footer={(
             <button type="button" className="dm-btn dm-btn-primary dm-btn-block" disabled={!reason || busy} onClick={send} data-testid="dorm-report-send">
               {busy ? 'กำลังส่ง' : 'ส่งรายงาน'}
             </button>
           )}>
      <div className="dm-reasons" role="radiogroup" aria-label="เหตุผล">
        {reasons.map((r) => (
          <button type="button" key={r} role="radio" aria-checked={reason === r} className={`dm-reason ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>
            <span className="dm-reason-dot" aria-hidden="true" />{r}
          </button>
        ))}
      </div>
      <label className="dm-field" style={{ marginTop: 14 }}>
        <span>เล่าเพิ่ม<span className="dm-optional">ไม่บังคับ</span></span>
        <textarea rows={3} value={note} maxLength={max} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โทรไปแล้วบอกว่าห้องไม่ว่าง" />
        <small>{note.length}/{max} ตัวอักษร ไม่ต้องใส่ข้อมูลส่วนตัว</small>
      </label>
    </Sheet>
  );
};

export const ReportButton = ({ type, id }) => {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className="dm-tiny dm-muted">รายงานแล้ว</span>;
  return (
    <>
      <button type="button" className="dm-textbtn dm-report" onClick={() => setOpen(true)}>
        <Flag size={13} aria-hidden="true" />{REPORT_LABEL[type] || 'รายงาน'}
      </button>
      {open && <ReportSheet type={type} id={id} onClose={() => setOpen(false)} onSent={() => setDone(true)} />}
    </>
  );
};

/* ---------------------------------------------------------------- mates */
// Fills once when it scrolls into view (600ms); static with reduced motion.
export const MatchRing = ({ score, size = 56 }) => {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (!('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const r = 22;
  const C = 2 * Math.PI * r;
  const tone = score >= 70 ? 'hi' : score >= 45 ? 'mid' : 'lo';
  return (
    <div ref={ref} className={`dm-ring ${tone}`} style={{ width: size, height: size }} title="ความเข้ากันกับคุณ">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="bg" />
        <circle cx="26" cy="26" r={r} className="fg" strokeDasharray={C}
                strokeDashoffset={seen ? C * (1 - score / 100) : C} transform="rotate(-90 26 26)" />
      </svg>
      <span aria-hidden="true"><b>{score}</b>%</span>
      <span className="dm-sr">เข้ากันได้ {score} เปอร์เซ็นต์</span>
    </div>
  );
};

// Lifestyle tag -> icon (labels come from /meta)
const TAG_ICON = {
  clean: Sparkles, save_power: Zap, quiet: VolumeX, night_owl: Moon, early_bird: Sunrise, no_smoke: CigaretteOff,
  has_pet: PawPrint, pet_ok: PawPrint, no_pet: Ban, cook: CookingPot, home_weekend: House, homebody: Sofa, social: PartyPopper,
};

// Quiet corner icon version of ReportButton for mate cards (same endpoint and reasons).
const MateReport = ({ id, name }) => {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <button type="button" className="dm-iconbtn dm-mate-flag" disabled={done} title={done ? 'รายงานแล้ว' : 'รายงานโปรไฟล์นี้'}
              aria-label={done ? `รายงานโปรไฟล์ ${name} แล้ว` : `รายงานโปรไฟล์ ${name}`}
              onClick={() => setOpen(true)}>
        {done ? <Check size={17} aria-hidden="true" /> : <Flag size={17} aria-hidden="true" />}
      </button>
      {open && <ReportSheet type="mate" id={id} onClose={() => setOpen(false)} onSent={() => setDone(true)} />}
    </>
  );
};

const MateAbout = ({ text }) => {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [text, open]);
  return (
    <div className="dm-mate-about">
      <p ref={ref} className={`dm-about ${open ? 'open' : ''}`}>{text}</p>
      {(long || open) && (
        <button type="button" className="dm-textbtn" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'ย่อ' : 'อ่านต่อ'}
        </button>
      )}
    </div>
  );
};

// A person, not a form: coloured avatar, name (+ demo pill), match ring, three key facts as tinted
// icon chips, lifestyle chips with icons, 2-line about with "อ่านต่อ", one LINE button, quiet report icon.
// i: position for the dm-rise stagger.
export const MateCard = ({ m, preview = false, i }) => {
  const meta = useDormMeta();
  const score = m.match?.score;
  const { title: name, demo } = splitDemo(m.display_name);
  const who = [labelOf(meta?.genders, m.gender), m.year !== 'other' && labelOf(meta?.years, m.year), m.faculty].filter(Boolean).join(', ');
  const zones = m.zones || [];
  const rooms = m.interested_rooms || [];
  const budget = (m.budget_min || m.budget_max)
    ? `${baht(m.budget_min || m.budget_max)}${m.budget_max && m.budget_min && m.budget_max !== m.budget_min ? `–${baht(m.budget_max)}` : ''}` : '';
  const facts = [
    budget && { k: 'b', icon: Wallet, label: `งบ ${budget}`, aria: `งบต่อคน ${budget} บาทต่อเดือน` },
    m.move_in && { k: 'm', icon: CalendarDays, label: `ย้าย ${thDate(m.move_in)}`, aria: `อยากย้ายเข้า ${thDate(m.move_in)}` },
    { k: 'z', icon: MapPin, label: zones.length ? `${zoneShort(labelOf(meta?.zones, zones[0]))}${zones.length > 1 ? ` +${zones.length - 1}` : ''}` : 'โซนไหนก็ได้',
      aria: zones.length ? `โซน ${zones.map((z) => zoneShort(labelOf(meta?.zones, z))).join(', ')}` : 'อยู่โซนไหนก็ได้' },
  ].filter(Boolean);
  const pref = !m.mate_gender_pref ? '' : m.mate_gender_pref === 'any' ? 'รับเมททุกเพศ' : `อยากได้${labelOf(meta?.gender_prefs, m.mate_gender_pref)}`;
  const tags = m.tags || [];
  return (
    <article className={`dm-mate ${preview ? 'preview' : ''} ${i != null ? 'dm-rise' : ''}`} style={i != null ? { '--i': i } : undefined}
             data-testid="dorm-mate-card" id={!preview && m.id ? `mate-${m.id}` : undefined}>
      <div className="dm-mate-head">
        <Avatar name={name || m.display_name} size={52} />
        <div className="dm-mate-id">
          <h3 className="dm-mate-name"><span>{name || 'ชื่อเล่น'}</span>{demo && <DemoPill onPaper />}</h3>
          {who && <div className="dm-mate-who">{who}</div>}
          {m.swu_verified && <Verified on small />}
        </div>
        {score != null && !m.is_me && <MatchRing score={score} size={54} />}
      </div>
      <div className="dm-mfacts">
        {facts.map((x) => (
          <span key={x.k} className={`dm-mfact f-${x.k}`} title={x.aria}><x.icon size={14} aria-hidden="true" />{x.label}</span>
        ))}
      </div>
      <p className={`dm-mate-room ${m.has_room ? 'has' : ''}`}>
        {m.has_room ? <KeyRound size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
        <span>
          {m.has_room ? (m.room_note || 'มีห้องแล้ว หาคนมาหาร') : 'ยังไม่มีห้อง อยากหาด้วยกัน'}
          {pref && <span className="dm-muted">{`, ${pref}`}</span>}
        </span>
      </p>
      {rooms.length > 0 && !preview && (
        <div className="dm-mate-rooms">
          <span className="dm-mate-rooms-l">สนใจห้อง</span>
          {rooms.map((r) => (
            <Link key={r.id} to={`/dorm/rooms/${r.id}#interested`} className="dm-roomchip dm-press" aria-label={`ห้องที่ ${name} สนใจ: ${r.title}`}>
              <KeyRound size={13} aria-hidden="true" /><span className="dm-ellipsis">{r.title}</span>
            </Link>
          ))}
          {m.interested_rooms_total > rooms.length && <span className="dm-mate-rooms-more">+{m.interested_rooms_total - rooms.length}</span>}
        </div>
      )}
      {tags.length > 0 && (
        <ul className="dm-habits" aria-label="นิสัยการอยู่">
          {tags.slice(0, 5).map((t) => {
            const I = TAG_ICON[t] || Sparkles;
            return <li key={t}><I size={13} aria-hidden="true" />{labelOf(meta?.tags, t)}</li>;
          })}
          {tags.length > 5 && <li className="more">+{tags.length - 5}</li>}
        </ul>
      )}
      {m.about && <MateAbout text={m.about} />}
      {(m.match?.reasons?.length > 0 || m.match?.clashes?.length > 0) && !m.is_me && (
        <div className="dm-why">
          {m.match?.reasons?.length > 0 && <div className="ok"><Check size={15} aria-hidden="true" /><span>ตรงกัน: {m.match.reasons.slice(0, 3).join(', ')}</span></div>}
          {m.match?.clashes?.length > 0 && <div className="warn"><TriangleAlert size={15} aria-hidden="true" /><span>ควรคุยกันก่อน: {m.match.clashes.slice(0, 2).join(', ')}</span></div>}
        </div>
      )}
      {!m.is_me && !preview && (
        <div className="dm-mate-foot">
          <ContactButton kind="mate" id={m.id} label="ทัก LINE" ariaLabel={`ดูช่องทางติดต่อของ ${name}`} variant="secondary" />
          <MateReport id={m.id} name={name} />
        </div>
      )}
    </article>
  );
};

export const MyMateStrip = ({ m }) => {
  const dl = daysLeft(m.expires_at);
  const live = m.status !== 'closed' && dl != null && dl > 0;
  return (
    <div className="dm-mystrip">
      <Avatar name={splitDemo(m.display_name).title} size={44} />
      <div className="dm-mystrip-txt">
        <div className="dm-strong dm-ellipsis">โปรไฟล์ของคุณ</div>
        <div className="dm-small dm-muted">
          <span className={`dm-state ${live ? 'live' : 'off'}`}><i aria-hidden="true" />{live ? `แสดงอยู่ อีก ${dl} วัน` : 'ไม่ได้แสดง'}</span>
        </div>
      </div>
      <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-tint dm-btn-sm">แก้ไข</Link>
    </div>
  );
};

/* ---------------------------------------------------------------- OpenChat archive (old, anonymised ads)
   A price and demand record, never rooms on offer: compact rows (no cover, no contact button), muted
   styling, always labelled as old posts. Rows with a known building link to its page. */
const ARCHIVE_SHOW = 6;
// "พ.ค.–พ.ย. 69" from {from, to}
export const periodTh = (p) => {
  if (!p?.from || !p?.to) return '';
  const a = thDate(p.from.slice(0, 7));
  const b = thDate(p.to.slice(0, 7));
  const [am, ay] = a.split(' ');
  return ay === b.split(' ')[1] ? `${am}–${b}` : `${a}–${b}`;
};
// How a set of archived per-person prices ({n, min, median, max}) may be stated without overclaiming:
// 'stats' (ต่ำสุด / ค่ากลาง / สูงสุด) only from 5 values and when the median is neither end; 'range'
// ("x–y ฿/คน จาก n ประกาศ") from 2; 'same' when every value is equal; 'one' for a single ad (show the ad,
// not a statistic); null when nothing is priced. Per-person values only (the server never mixes in
// whole-room prices).
export const ppShape = (pp) => {
  if (!pp?.n) return null;
  if (pp.n === 1) return 'one';
  if (pp.min === pp.max) return 'same';
  if (pp.n >= 5 && pp.median !== pp.min && pp.median !== pp.max) return 'stats';
  return 'range';
};
export const ppRangeText = (pp) => (pp.min === pp.max ? baht(pp.min) : `${baht(pp.min)}–${baht(pp.max)}`);

// Price of one archived ad, with its unit: per person, whole room, or the budget of a "seeking" post.
// per_person_inferred: a mate ad that gave one low price, read as the share per person ("~x ฿/คน").
export const chatPrice = (p) => {
  if (p.kind === 'seeking') {
    const lo = p.budget_min;
    const hi = p.budget_max;
    if (lo && hi && lo !== hi) return { text: `งบ ${baht(lo)}–${baht(hi)}`, unit: '฿/คน' };
    if (hi || lo) return { text: `งบ ${lo && !hi ? 'ตั้งแต่ ' : 'ไม่เกิน '}${baht(hi || lo)}`, unit: '฿/คน' };
    return null;
  }
  if (p.per_person && p.per_person_inferred) return { text: `~${baht(p.per_person)}`, unit: '฿/คน', title: 'ประกาศไม่ได้บอกว่าเป็นราคาต่อคนหรือทั้งห้อง ราคานี้น่าจะเป็นต่อคน' };
  if (p.per_person) return { text: baht(p.per_person), unit: '฿/คน/ด.' };
  if (p.price_total) return { text: baht(p.price_total), unit: '฿ ทั้งห้อง/ด.' };
  return null;
};

// Archive rows worth showing in a browsing list: a known building or a price (a row with neither tells
// nobody anything), the most informative first (building and price, then price, then building), newest first within.
export const informativeRows = (items) => items
  .filter((p) => p.building_slug || p.building_name || chatPrice(p) || p.zone || p.gender_pref || p.move_in)
  .slice()
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

const chatAge = (iso) => {
  if (!iso) return { cls: 'is-old', badge: 'เก่า' };
  const days = Math.floor((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);
  if (days <= 30) return { cls: 'is-recent', badge: 'ล่าสุด' };
  if (days <= 90) return { cls: 'is-aging', badge: null };
  return { cls: 'is-old', badge: 'เก่า' };
};

// zoneLink: a row without a building links to its zone's rooms filter (so the archive is never a dead end).
export const ChatRow = ({ p, showWhere = true, zoneLink = false }) => {
  const meta = useDormMeta();
  const pr = chatPrice(p);
  const seeking = p.kind === 'seeking';
  const age = chatAge(p.date);
  const where = p.building_name || (p.zone && p.zone !== 'other' ? zoneShort(labelOf(meta?.zones, p.zone)) : '');
  const facts = [
    !seeking && p.people_total > 1 && `หาร ${p.people_total}`,
    labelOf(meta?.room_types, p.room_type) !== p.room_type && labelOf(meta?.room_types, p.room_type),
    p.gender_pref && p.gender_pref !== 'any' && (seeking ? `อยากได้${labelOf(meta?.gender_prefs, p.gender_pref)}` : labelOf(meta?.gender_prefs, p.gender_pref)),
    p.move_in && `${seeking ? 'อยากย้าย' : 'เข้าได้'} ${thDate(p.move_in)}`,
    p.reposts > 1 && `โพสต์ซ้ำ ${p.reposts} ครั้ง`,
  ].filter(Boolean);
  const body = (
    <>
      <span className="dm-arow-top">
        <span className={`dm-arow-kind k-${p.kind}`}>{labelOf(meta?.chat_kinds, p.kind)}</span>
        {showWhere && where && <span className="dm-arow-where dm-ellipsis">{where}</span>}
        <span className="dm-arow-meta">
          {age.badge && <span className={`dm-arow-age ${age.cls}`}>{age.badge}</span>}
          <time className="dm-arow-date" dateTime={p.date}>{thDate(p.date)}</time>
        </span>
      </span>
      <span className="dm-arow-mid">
        {pr ? <span className="dm-arow-price" title={pr.title}><b>{pr.text}</b> <small>{pr.unit}</small></span> : <span className="dm-arow-price none">{seeking ? 'ไม่ระบุงบ' : 'ไม่ระบุราคา'}</span>}
        {facts.length > 0 && <span className="dm-arow-facts">{facts.map((f) => <span key={f}>{f}</span>)}</span>}
      </span>
    </>
  );
  if (p.building_slug && showWhere) {
    return <li className={`dm-ali ${age.cls}`}><Link className={`dm-arow is-link ${age.cls}`} to={`/dorm/buildings/${p.building_slug}`}>{body}<ChevronRight size={16} className="dm-arow-go" aria-hidden="true" /></Link></li>;
  }
  if (zoneLink && p.zone && p.zone !== 'other') {
    return (
      <li className={`dm-ali ${age.cls}`}>
        <Link className={`dm-arow is-link ${age.cls}`} to={`/dorm/rooms?zone=${p.zone}`} title="ดูห้องว่างในโซนนี้">
          {body}<ChevronRight size={16} className="dm-arow-go" aria-hidden="true" />
        </Link>
      </li>
    );
  }
  return <li className={`dm-ali ${age.cls}`}><div className={`dm-arow ${age.cls}`}>{body}</div></li>;
};

// Collapsed list of archive rows with "ดูเพิ่ม". total: how many match (items may be a first page).
export const ChatList = ({ items, total, show = ARCHIVE_SHOW, showWhere = true, label, zoneLink = false }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, show);
  const more = (total ?? items.length) - shown.length;
  return (
    <>
      <ul className="dm-alist" aria-label={label}>{shown.map((p) => <ChatRow key={p.id} p={p} showWhere={showWhere} zoneLink={zoneLink} />)}</ul>
      {!open && items.length > show && (
        <button type="button" className="dm-textbtn dm-amore" onClick={() => setOpen(true)} aria-expanded={false}>
          ดูเพิ่ม {Math.min(more, items.length - shown.length)} ประกาศ
        </button>
      )}
      {open && (total ?? 0) > items.length && <p className="dm-tiny dm-muted dm-amore">แสดง {items.length} ประกาศล่าสุดจาก {total}</p>}
    </>
  );
};

// The archive as a separate, visually subordinate section (rooms page, mates page).
// zoneLink: rows without a building link to their zone's rooms. children: the closing actions.
export const ChatArchive = ({ title, sub, items, total, show, note, children, className = '', showWhere = true, zoneLink = false }) => (
  <section className={`dm-archive ${className}`} aria-label={title}>
    <div className="dm-archive-head">
      <span className="dm-archive-ico"><History size={18} aria-hidden="true" /></span>
      <div style={{ minWidth: 0 }}>
        <h2>{title}</h2>
        {sub && <p className="dm-archive-sub">{sub}</p>}
      </div>
    </div>
    <ChatList items={items} total={total} show={show} showWhere={showWhere} label={title} zoneLink={zoneLink} />
    {note && <p className="dm-archive-note"><Info size={14} aria-hidden="true" />{note}</p>}
    {children}
  </section>
);
export const ARCHIVE_NOTE = 'ประกาศเก่าจากแชท ไม่มีข้อมูลติดต่อ ห้องอาจไม่ว่างแล้ว';

// The archive's way forward: let people who want such a room be found, and people who have one post it.
export const ArchiveActions = ({ hasProfile = false }) => (
  <div className="dm-archive-cta">
    <Link to="/dorm/me?tab=mate" className="dm-btn dm-btn-tint dm-btn-sm">{hasProfile ? 'แก้โปรไฟล์ ให้คนมีห้องทักมา' : 'อยากได้ห้องแบบนี้ ให้คนมีห้องทักมา'}</Link>
    <Link to="/dorm/post" className="dm-btn dm-btn-quiet dm-btn-sm">มีห้องแบบนี้ ลงประกาศ</Link>
  </div>
);

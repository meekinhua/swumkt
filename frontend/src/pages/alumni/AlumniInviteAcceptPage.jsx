import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Icon, useToast } from './AlumniUI';
import { API, api, errMsg, errCode, shortName } from './alumniApi';
import { NextUpCard } from './LineKit';
import './alumni-styles.css';

const LOCKED = [
  { key: 'role', label: 'สถานะของคนชวน', need: 1 },
  { key: 'line_size', label: 'จำนวนคนในสายของเขา', need: 1 },
  { key: 'initial', label: 'ตัวอักษรแรกของชื่อเล่น', need: 2 },
];

const Shell = ({ children, wide }) => (
  <div className="alumni-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'start center', padding: '24px 16px 60px' }}>
    <div className="al-card al-fade-in" style={{ maxWidth: wide ? 560 : 480, width: '100%', textAlign: 'center', padding: 'clamp(20px, 5vw, 36px)' }}
      data-testid="invite-accept-page">
      <div className="al-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
        <div className="al-brand-mark">กต</div>
        <div className="al-brand-name">สายเทค <em>MKT SWU</em></div>
      </div>
      {children}
    </div>
  </div>
);

// mini chain: people above the inviter
const MiniChain = ({ people }) => {
  if (!people || people.length === 0) return null;
  return (
    <div data-testid="reveal-line" style={{ margin: '18px 0', textAlign: 'left' }}>
      <div className="al-eyebrow" style={{ marginBottom: 8, textAlign: 'center' }}>สายของเขาในตอนนี้</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        {people.map((p, i) => (
          <React.Fragment key={`${p.user_id}-${i}`}>
            <span className={`al-tag ${p.is_ghost ? 'outline' : ''}`} style={p.is_ghost ? { borderStyle: 'dashed' } : null}>
              {p.nickname || 'สมาชิก'} · รุ่น {p.gen}{p.is_ghost ? ' (ยังไม่มา)' : ''}
            </span>
            <Icon name="chevron-right" size={12} style={{ color: 'var(--al-mute)' }} />
          </React.Fragment>
        ))}
        <span className="al-tag dark">คุณ</span>
      </div>
    </div>
  );
};

const AlumniInviteAcceptPage = () => {
  const navigate = useNavigate();
  const { code } = useParams();
  const [search] = useSearchParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(undefined); // undefined = unknown, null = not a member
  const [guess, setGuess] = useState('');
  const [guessBusy, setGuessBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [reveal, setReveal] = useState(null);
  const [step, setStep] = useState('intro'); // intro | claim | done
  const [accepting, setAccepting] = useState(false);
  const [actionErr, setActionErr] = useState(null);
  const [claim, setClaim] = useState(null); // {ghost, links}
  const [claimIds, setClaimIds] = useState([]);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimedAs, setClaimedAs] = useState(null);
  const autoRan = useRef(false);

  const doReveal = useCallback(async (giveUp = false) => {
    try {
      const r = await axios.post(`${API}/alumni/invites/${code}/reveal`, { give_up: giveUp });
      setReveal(r.data);
      return r.data;
    } catch (e) {
      setActionErr(errMsg(e, 'เฉลยไม่สำเร็จ'));
      return null;
    }
  }, [code]);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/alumni/invites/preview/${code}`)
      .then(r => {
        setPreview(r.data);
        if (r.data.reveal_game && r.data.revealed) doReveal(false);
      })
      .catch(e => setError(e.response?.status === 404 ? 'ไม่พบลิงก์นี้ หรือลิงก์หมดอายุแล้ว' : errMsg(e, 'ลิงก์ใช้ไม่ได้')))
      .finally(() => setLoading(false));
  }, [code, doReveal]);

  useEffect(() => {
    if (!user) { setProfile(undefined); return; }
    api.get(token, '/alumni/me')
      .then(r => setProfile(r.data.registered ? r.data.profile : null))
      .catch(() => setProfile(undefined));
  }, [user, token]);

  const gameOn = !!(preview && preview.reveal_game && !preview.revealed && !reveal);
  const inviter = reveal?.inviter || preview?.inviter || null;
  const hint = reveal?.inviter_term_for_invitee || preview?.relation_hint || 'น้องเทค';

  const submitGuess = async (e) => {
    e.preventDefault();
    if (!guess.trim() || guessBusy) return;
    setGuessBusy(true); setFeedback(null);
    try {
      const r = (await axios.post(`${API}/alumni/invites/${code}/guess`, { guess: guess.trim() })).data;
      setPreview(p => ({ ...p, clues: r.clues || p.clues, guesses_left: r.guesses_left, attempts: r.attempts ?? p.attempts, revealed: r.revealed }));
      setGuess('');
      if (r.correct || r.revealed) {
        await doReveal(false);
      } else {
        setFeedback('wrong'); setShakeKey(k => k + 1);
      }
    } catch (er) {
      setFeedback('error'); setActionErr(errMsg(er, 'ทายไม่สำเร็จ'));
    } finally { setGuessBusy(false); }
  };

  const loadClaim = async () => {
    try {
      const r = await api.get(token, `/alumni/invites/${code}/claim-preview`);
      if (r.data.ghost) {
        setClaim(r.data); setClaimIds((r.data.links || []).map(l => l.relation_id)); setStep('claim');
        return true;
      }
    } catch { /* fall through to done */ }
    return false;
  };

  const startAccept = useCallback(async () => {
    setActionErr(null); setAccepting(true);
    try {
      const r = await api.post(token, `/alumni/invites/accept/${code}`);
      const needsClaim = !!r.data.ghost_claim;
      if (needsClaim && await loadClaim()) { /* step set */ } else setStep('done');
    } catch (e) {
      setActionErr(errMsg(e, 'ยอมรับคำเชิญไม่สำเร็จ'));
      if (errCode(e) === null && e.response?.status === 400) setStep('intro');
    } finally { setAccepting(false); }
    // eslint-disable-next-line
  }, [token, code]);

  const handlePrimary = async () => {
    setActionErr(null);
    if (!user) {
      localStorage.setItem('pending_invite_code', code);
      navigate(`/register?redirect=${encodeURIComponent(`/alumni/invite/${code}?auto=1`)}`);
      return;
    }
    if (profile === null) {
      localStorage.setItem('pending_invite_code', code);
      navigate('/alumni/onboarding');
      return;
    }
    await startAccept();
  };

  // coming back from register/onboarding: accept straight away
  useEffect(() => {
    if (search.get('auto') === '1' && user && profile === null && preview && !gameOn && !autoRan.current) {
      autoRan.current = true;
      localStorage.setItem('pending_invite_code', code);
      navigate('/alumni/onboarding');
      return;
    }
    if (search.get('auto') === '1' && user && profile && preview && !gameOn && !autoRan.current && step === 'intro') {
      autoRan.current = true;
      startAccept();
    }
  }, [search, user, profile, preview, gameOn, step, startAccept, code, navigate]);

  const doClaim = async (yes) => {
    if (!yes) { setStep('done'); return; }
    setClaimBusy(true); setActionErr(null);
    try {
      await api.post(token, `/alumni/ghosts/${claim.ghost.id}/claim`, { invite_code: code, confirm_relation_ids: claimIds });
      setClaimedAs(claim.ghost.display_name);
      setStep('done');
    } catch (e) { setActionErr(errMsg(e, 'รวมชื่อไม่สำเร็จ')); }
    finally { setClaimBusy(false); }
  };

  // ------------------ render ------------------
  if (loading) return <Shell><div className="al-muted" data-testid="invite-loading">กำลังตรวจสอบลิงก์...</div></Shell>;

  if (error) {
    return (
      <Shell>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😢</div>
        <h2 className="al-h-section" style={{ marginBottom: 8 }}>ลิงก์ใช้ไม่ได้</h2>
        <p className="al-muted" style={{ marginBottom: 24 }} data-testid="invite-error">{error}</p>
        <button className="al-btn al-btn-red" onClick={() => navigate('/alumni')} data-testid="invite-back-btn">กลับหน้าแรก</button>
      </Shell>
    );
  }

  if (step === 'claim' && claim) {
    return (
      <Shell wide>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🪪</div>
        <div className="al-eyebrow" style={{ marginBottom: 6 }}>ขั้นสุดท้าย</div>
        <h1 style={{ fontSize: 26, margin: '0 0 6px', letterSpacing: '-0.02em' }} data-testid="claim-title">นี่คือคุณใช่ไหม?</h1>
        <p className="al-muted" style={{ margin: '0 0 16px' }}>
          เพื่อนในสายเพิ่มชื่อ <b style={{ color: 'var(--al-ink)' }}>"{claim.ghost.display_name}"</b> (รุ่น {claim.ghost.gen}) ไว้ก่อนแล้ว ถ้าเป็นคุณ เราจะย้ายสายที่เขาต่อไว้มาที่บัญชีนี้
        </p>
        {(claim.links || []).length > 0 && (
          <div style={{ textAlign: 'left', marginBottom: 16, display: 'grid', gap: 8 }} data-testid="claim-links">
            <div className="al-eyebrow">เลือกสายที่ใช่ (ติ๊กออกได้ถ้าไม่ใช่)</div>
            {claim.links.map(l => (
              <label key={l.relation_id} className="al-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={claimIds.includes(l.relation_id)}
                  onChange={e => setClaimIds(ids => (e.target.checked ? [...ids, l.relation_id] : ids.filter(x => x !== l.relation_id)))}
                  data-testid={`claim-link-${l.relation_id}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{shortName(l.other)} <span className="al-tiny al-muted">รุ่น {l.other.gen}</span></div>
                  <div className="al-tiny al-muted">เป็น{l.other_is === 'senior' ? 'พี่เทค' : 'น้องเทค'}ของคุณ</div>
                </div>
              </label>
            ))}
          </div>
        )}
        {actionErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 10 }}>{actionErr}</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="al-btn al-btn-red al-btn-lg al-btn-block" onClick={() => doClaim(true)} disabled={claimBusy} data-testid="claim-yes-btn">
            ใช่ นี่คือฉัน <Icon name="check" size={16} />
          </button>
          <button className="al-btn al-btn-ghost al-btn-block" onClick={() => doClaim(false)} disabled={claimBusy} data-testid="claim-no-btn">ไม่ใช่ฉัน ข้ามไป</button>
        </div>
        {toast.node}
      </Shell>
    );
  }

  if (step === 'done') {
    const me = profile ? { user_id: profile.user_id, gen: profile.gen, nickname: profile.nickname, name: profile.name } : null;
    return (
      <Shell wide>
        <div className="al-pop" style={{ fontSize: 56, marginBottom: 6 }}>🎉</div>
        <h1 style={{ fontSize: 28, margin: '0 0 6px', letterSpacing: '-0.02em' }} data-testid="invite-done-title">
          {claimedAs ? `ยินดีต้อนรับกลับมา ${claimedAs}!` : 'สายเราต่อถึงคุณแล้ว!'}
        </h1>
        <p className="al-muted" style={{ margin: '0 0 20px' }}>
          {inviter ? `คุณอยู่ในสายเดียวกับ ${shortName(inviter)} แล้ว` : 'คุณอยู่ในสายเทคแล้ว'} · ขั้นต่อไปคือช่วยต่อสายขึ้นไปอีกขั้น ใครอยู่เหนือขึ้นไปบ้าง?
        </p>
        <div style={{ textAlign: 'left' }}>
          {me ? (
            <NextUpCard token={token} me={me} userName={profile?.nickname} toast={toast.show} big />
          ) : (
            <div className="al-small al-muted">กำลังโหลด...</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <button className="al-btn al-btn-outline" onClick={() => navigate('/alumni/tree')} data-testid="invite-goto-tree-btn">ไปดูสายของฉัน</button>
        </div>
        {toast.node}
      </Shell>
    );
  }

  // ---------- reveal game ----------
  if (gameOn) {
    const clues = preview.clues || [];
    const attempts = preview.attempts || 0;
    const left = preview.guesses_left ?? 3;
    const have = new Set(clues.map(c => c.key));
    const locked = LOCKED.filter(l => !have.has(l.key));
    return (
      <Shell wide>
        <div style={{ fontSize: 44, marginBottom: 6 }}>🕵️</div>
        <div className="al-eyebrow" style={{ marginBottom: 6 }}>เฉลยสาย</div>
        <h1 style={{ fontSize: 'clamp(24px, 6vw, 30px)', margin: '0 0 6px', letterSpacing: '-0.02em' }} data-testid="game-title">
          มีคนในสายชวนคุณมา ทายสิว่าใคร?
        </h1>
        <p className="al-muted" style={{ margin: '0 0 18px' }}>
          เขาจะเป็น <b style={{ color: 'var(--al-ink)' }}>{hint}</b> ของคุณ ทายได้ {left} ครั้ง ทายพลาดแล้วจะมีใบ้เพิ่ม
        </p>

        <div style={{ display: 'grid', gap: 8, textAlign: 'left', marginBottom: 16 }} data-testid="game-clues">
          {clues.map(c => (
            <div key={c.key} className="al-card al-pop" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, background: 'var(--al-blue-soft)', borderColor: '#B5D6EE' }} data-testid={`clue-${c.key}`}>
              <span className="al-small" style={{ color: 'var(--al-blue-ink)' }}>{c.label}</span>
              <b style={{ textAlign: 'right' }}>{c.key === 'gen' ? `รุ่น ${c.value}` : String(c.value)}</b>
            </div>
          ))}
          {locked.map(l => (
            <div key={l.key} className="al-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', borderStyle: 'dashed', opacity: .75 }}>
              <span className="al-small al-muted">🔒 {l.label}</span>
              <span className="al-tiny al-muted">ปลดล็อกเมื่อทายพลาด {l.need} ครั้ง</span>
            </div>
          ))}
        </div>

        <form key={shakeKey} onSubmit={submitGuess} className={feedback === 'wrong' ? 'al-shake' : ''}>
          <label className="al-label" htmlFor="guess-input" style={{ textAlign: 'left' }}>พิมพ์ชื่อเล่นหรือชื่อที่คุณคิดว่าใช่</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="guess-input" className="al-input" value={guess} onChange={e => setGuess(e.target.value)} autoComplete="off"
              placeholder="เช่น ฝน" data-testid="guess-input" aria-describedby="guess-hint" />
            <button className="al-btn al-btn-red" disabled={guessBusy || !guess.trim()} data-testid="guess-submit-btn">{guessBusy ? '...' : 'ทาย'}</button>
          </div>
        </form>
        <div id="guess-hint" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 10 }} data-testid="guess-tries">
          {[0, 1, 2].map(i => <span key={i} aria-hidden="true" style={{ fontSize: 20, opacity: i < left ? 1 : .25 }}>❤️</span>)}
          <span className="al-small al-muted">เหลือ {left} ครั้ง{attempts ? ` · ทายไปแล้ว ${attempts}` : ''}</span>
        </div>
        {feedback === 'wrong' && (
          <div role="status" className="al-small" style={{ color: 'var(--al-red-ink)', marginTop: 8 }} data-testid="guess-wrong">ยังไม่ใช่นะ 👀 ปลดล็อกใบ้ใหม่ให้แล้ว</div>
        )}
        {actionErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginTop: 8 }}>{actionErr}</div>}
        <button className="al-btn al-btn-ghost al-btn-sm" style={{ marginTop: 14 }} onClick={() => doReveal(true)} data-testid="give-up-btn">ยอมแพ้ เฉลยเลย</button>
        {toast.node}
      </Shell>
    );
  }

  // ---------- inviter shown (after reveal, legacy invite, or revisiting) ----------
  const revealedNow = !!reveal;
  return (
    <Shell wide>
      {preview.for_ghost && (
        <div className="al-small" style={{ background: 'var(--al-blue-soft)', color: 'var(--al-blue-ink)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, textAlign: 'left' }} data-testid="ghost-invite-note">
          ลิงก์นี้เพื่อนในสายทำไว้ให้ศิษย์เก่ารุ่น {preview.ghost_gen ?? '?'} ที่ยังไม่ได้ลงทะเบียน ถ้าเป็นคุณ เข้าสายต่อได้เลย เดี๋ยวเราถามอีกทีว่า "นี่คือคุณใช่ไหม"
        </div>
      )}

      {inviter ? (
        <>
          {revealedNow && (
            <div className="al-pop" style={{ marginBottom: 6 }} data-testid="reveal-banner">
              <span className="al-tag red" style={{ fontSize: 13 }}>{reveal.guessed_correctly ? '🎯 ทายถูก!' : '🙈 เสียดาย เฉลยเลย'}</span>
            </div>
          )}
          <div className={revealedNow ? 'al-unblur' : ''} style={{ marginBottom: 14 }} data-testid="reveal-card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Avatar name={inviter.name} hue={inviter.avatar_hue || 210} size="xl" src={inviter.avatar_url} verified={inviter.verified} />
            </div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>{revealedNow ? 'คนที่ชวนคุณคือ' : 'คุณได้รับคำเชิญจาก'}</div>
            <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 4px' }} data-testid="invite-inviter-name">{inviter.name || inviter.nickname}</h1>
            <div className="al-small al-muted">
              รุ่น {inviter.gen}{inviter.position || inviter.role ? ` · ${inviter.position || (inviter.role === 'alumni' ? 'ศิษย์เก่า' : inviter.role === 'current_student' ? 'นิสิตปัจจุบัน' : inviter.role)}` : ''}
            </div>
          </div>
          {revealedNow && <MiniChain people={reveal.line_above_inviter} />}
          <div style={{ padding: '14px 18px', background: 'var(--al-red-soft)', borderRadius: 14, marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              <b>{inviter.nickname || inviter.name}</b> ชวนคุณเข้าสู่สายเทค MKT SWU 🌳
            </div>
            <div className="al-small al-muted">
              {reveal?.inviter_term_for_invitee
                ? <>เขาคือ <b>{reveal.inviter_term_for_invitee}</b> ของคุณ</>
                : <>คุณจะอยู่ในสายของเขาในฐานะ <b>"{hint}"</b></>}
              {reveal?.line_size ? ` · สายนี้มี ${reveal.line_size} คนแล้ว` : ''}
            </div>
          </div>
        </>
      ) : (
        <div className="al-muted" style={{ marginBottom: 16 }}>เปิดคำเชิญสายเทค...</div>
      )}

      {actionErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 10 }} data-testid="invite-action-error">{actionErr}</div>}
      <button className="al-btn al-btn-red al-btn-lg al-btn-block" onClick={handlePrimary} disabled={accepting} data-testid="invite-accept-btn">
        {accepting ? 'กำลังดำเนินการ...' : !user ? 'เข้าสายเลย · สมัคร / เข้าสู่ระบบ' : profile === null ? 'ลงทะเบียนสายเทคเพื่อเข้าสาย' : 'ยืนยันเข้าสาย'}
        <Icon name="arrow-right" size={16} />
      </button>
      {!user && (
        <button className="al-btn al-btn-ghost al-btn-sm" style={{ marginTop: 8 }} data-testid="invite-login-btn"
          onClick={() => { localStorage.setItem('pending_invite_code', code); navigate(`/login?redirect=${encodeURIComponent(`/alumni/invite/${code}?auto=1`)}`); }}>
          มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
        </button>
      )}
      <div className="al-small al-muted" style={{ marginTop: 14 }}>
        เมื่อคุณเข้าสาย คนชวนจะได้รับ <b style={{ color: 'var(--al-red)' }}>+100 XP</b>
      </div>
      {toast.node}
    </Shell>
  );
};

export default AlumniInviteAcceptPage;

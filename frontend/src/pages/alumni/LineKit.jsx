import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Avatar, Icon, Modal } from './AlumniUI';
import {
  api, errMsg, errCode, statusOf, STATUS, GENDER_OPTS, PDPA_LINE,
  shortName, absUrl, lineShareUrl, formatDateTh,
} from './alumniApi';

// ---------- relation status ----------
export const StatusBadge = ({ status, testId }) => {
  const s = statusOf(status);
  if (!s) return null;
  const icon = { claimed: 'bolt', vouched: 'users', confirmed: 'check', disputed: 'x' }[status === 'pending' ? 'claimed' : status];
  return (
    <span className={`al-st ${s.cls}`} data-testid={testId || `status-${status}`} title={s.desc}>
      <Icon name={icon} size={11} stroke={2.4} /> {s.label}
    </span>
  );
};

export const StatusLegend = () => (
  <div className="al-card al-card-pad" data-testid="status-legend">
    <div className="al-eyebrow" style={{ marginBottom: 10 }}>เส้นเชื่อมแต่ละแบบ แปลว่าอะไร</div>
    <div style={{ display: 'grid', gap: 10 }}>
      {['confirmed', 'vouched', 'claimed', 'disputed'].map(k => (
        <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <StatusBadge status={k} testId={`legend-${k}`} />
          <div className="al-small" style={{ color: 'var(--al-ink-2)', flex: 1 }}>{STATUS[k].desc}</div>
        </div>
      ))}
      <div className="al-tiny al-muted" style={{ lineHeight: 1.5 }}>
        คำตอบของเจ้าตัวมีน้ำหนักมากกว่าโหวตเสมอ · เส้นประ = ยังไม่มีตัวจริงในระบบ
      </div>
    </div>
  </div>
);

// ---------- gaps hook ----------
export const useGaps = (token, enabled = true) => {
  const [gaps, setGaps] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!token || !enabled) return;
    setLoading(true);
    try {
      const r = await api.get(token, '/alumni/chain/gaps');
      setGaps(r.data);
      setError(null);
    } catch (e) {
      setError(errMsg(e, 'โหลดช่องว่างของสายไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  }, [token, enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { gaps, error, loading, reload };
};

// who a new "senior" ghost should be attached to for an up slot
export const attachNodeFor = (gaps, slot, me) => {
  if (!slot) return me;
  if (slot.distance < 0) return me;
  if (slot.distance === 1) return me;
  const prev = (gaps?.up || []).find(s => s.distance === slot.distance - 1);
  return prev?.node || me;
};

// ---------- share ----------
export const SharePanel = ({ invite, revealGame, inviterName, onToast, heading, ids = {} }) => {
  const tid = { url: 'share-url', copy: 'share-copy-btn', line: 'share-line-btn', native: 'share-native-btn', ...ids };
  const url = absUrl(invite.share_url);
  const text = revealGame
    ? `มีคนในสายเทคของคุณชวนมาต่อสาย 🌳 ลองทายดูสิว่าใคร! เปิดดูได้เลย: ${url}`
    : `${inviterName || 'เพื่อน'} ชวนคุณเข้าสายเทค MKT SWU 🌳 ลงทะเบียนเลย: ${url}`;
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); onToast && onToast('คัดลอกลิงก์แล้ว'); }
    catch { onToast && onToast('คัดลอกไม่สำเร็จ ลองกดค้างที่ลิงก์'); }
  };
  const nativeShare = async () => {
    try { await navigator.share({ title: 'สายเทค MKT SWU', text, url }); } catch { /* cancelled */ }
  };

  return (
    <div data-testid="share-panel">
      {heading && <h4 className="al-h-card" style={{ marginBottom: 10 }}>{heading}</h4>}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center', marginBottom: 14 }} className="al-share-grid">
        <div style={{ padding: 10, background: 'white', borderRadius: 12, border: '1px solid var(--al-line)' }} aria-label="QR code ลิงก์ชวน">
          <QRCodeSVG value={url} size={104} level="M" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="al-mono" data-testid={tid.url} style={{
            padding: '8px 10px', background: 'var(--al-paper-2)', borderRadius: 10, fontSize: 12, wordBreak: 'break-all', marginBottom: 8,
          }}>{url}</div>
          {revealGame && (
            <div className="al-tiny al-muted">เล่นเกม "เฉลยสาย": ปลายทางต้องทายก่อนว่าใครชวน</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="al-btn al-btn-red" href={lineShareUrl(text)} target="_blank" rel="noopener noreferrer" data-testid={tid.line}>
          <Icon name="message" size={14} /> ส่งทาง LINE
        </a>
        <button className="al-btn al-btn-outline" onClick={copy} data-testid={tid.copy}>
          <Icon name="link" size={14} /> คัดลอกลิงก์
        </button>
        {canNativeShare && (
          <button className="al-btn al-btn-outline" onClick={nativeShare} data-testid={tid.native}>
            <Icon name="share" size={14} /> แชร์...
          </button>
        )}
      </div>
    </div>
  );
};

// ---------- add a placeholder person ----------
// attach: {as:'senior'|'junior', toId}
export const AddPersonForm = ({ token, term, attach, defaultGen, onCreated, onCancel, submitLabel = 'เพิ่มเข้าสาย' }) => {
  const [name, setName] = useState('');
  const [gen, setGen] = useState(defaultGen ? String(defaultGen) : '');
  const [prefix, setPrefix] = useState('');
  const [gender, setGender] = useState('u');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [candidates, setCandidates] = useState(null);

  const parts = (term || '').replace('เทค', '').split('/');
  const genderLabels = parts.length === 2
    ? { m: `${parts[0]}เทค (ชาย)`, f: `${parts[1]}เทค (หญิง)`, u: 'ไม่ระบุ' }
    : { m: 'ชาย', f: 'หญิง', u: 'ไม่ระบุ' };

  const submit = async (force = false) => {
    setErr(null);
    if (!name.trim()) { setErr('ใส่ชื่อเล่นหรือชื่อก่อนนะ'); return; }
    if (!/^\d{1,3}$/.test(gen)) { setErr('ใส่รุ่นเป็นตัวเลข เช่น 58'); return; }
    setBusy(true);
    try {
      const r = await api.post(token, '/alumni/ghosts', {
        display_name: name.trim(),
        gen: parseInt(gen, 10),
        student_id_prefix: prefix || null,
        gender: gender === 'u' ? null : gender,
        attach: { as: attach.as, to: attach.toId || null },
        force,
      });
      onCreated(r.data.ghost, r.data.relation);
    } catch (e) {
      if (errCode(e) === 'similar_ghosts') {
        setCandidates(e.response.data.detail.candidates || []);
      } else {
        setErr(errMsg(e, 'เพิ่มไม่สำเร็จ'));
      }
    } finally {
      setBusy(false);
    }
  };

  const useCandidate = async (c) => {
    setBusy(true); setErr(null);
    try {
      const body = attach.as === 'senior'
        ? { junior_id: attach.toId, senior_id: c.user_id }
        : { junior_id: c.user_id, senior_id: attach.toId };
      const r = await api.post(token, '/alumni/relations/claim', body);
      onCreated(c, r.data);
    } catch (e) {
      setErr(errMsg(e, 'เชื่อมไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  };

  if (candidates) {
    return (
      <div data-testid="similar-ghosts">
        <h4 className="al-h-card" style={{ marginBottom: 6 }}>ใช่คนนี้ไหม?</h4>
        <p className="al-small al-muted" style={{ marginTop: 0 }}>มีคนเพิ่มชื่อคล้ายกันไว้แล้วในรุ่นนี้ ถ้าใช่ เลือกเลยจะได้ไม่ซ้ำ</p>
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {candidates.map(c => (
            <button key={c.user_id} className="al-card" onClick={() => useCandidate(c)} disabled={busy}
              data-testid={`similar-pick-${c.user_id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, textAlign: 'left', width: '100%' }}>
              <Avatar name={c.name} hue={c.avatar_hue || 200} size="sm" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div className="al-tiny al-muted">รุ่น {c.gen}</div>
              </div>
              <span className="al-tag red">ใช่คนนี้</span>
            </button>
          ))}
        </div>
        {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="al-btn al-btn-outline" onClick={() => setCandidates(null)} disabled={busy}>กลับไปแก้</button>
          <button className="al-btn al-btn-primary" onClick={() => submit(true)} disabled={busy} data-testid="similar-force-btn">
            ไม่ใช่ สร้างคนใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit(false); }} data-testid="add-person-form">
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label className="al-label" htmlFor="ap-name">ชื่อเล่นหรือชื่อ</label>
          <input id="ap-name" className="al-input" value={name} maxLength={60} onChange={e => setName(e.target.value)}
            placeholder="เช่น พี่หมู" data-testid="add-person-name" autoComplete="off" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="al-label" htmlFor="ap-gen">รุ่น</label>
            <input id="ap-gen" className="al-input al-mono" inputMode="numeric" value={gen}
              onChange={e => setGen(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="เช่น 58" data-testid="add-person-gen" />
          </div>
          <div>
            <label className="al-label" htmlFor="ap-prefix">รหัสนิสิตขึ้นต้น <span className="al-muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></label>
            <input id="ap-prefix" className="al-input al-mono" inputMode="numeric" value={prefix}
              onChange={e => setPrefix(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="เช่น 58" data-testid="add-person-prefix" />
          </div>
        </div>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="al-label">เรียกเขาว่าอะไรดี? <span className="al-muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></legend>
          <div className="al-seg" role="group" aria-label="เพศสำหรับคำเรียก">
            {GENDER_OPTS.map(g => (
              <button type="button" key={g.v} aria-pressed={gender === g.v} onClick={() => setGender(g.v)}
                data-testid={`add-person-gender-${g.v}`}>{genderLabels[g.v]}</button>
            ))}
          </div>
          <div className="al-help">ถามไว้แค่ให้สายเรียกถูก เช่น ลุงเทค หรือ ป้าเทค ถ้าไม่แน่ใจเลือก "ไม่ระบุ" ได้</div>
        </fieldset>
        <div className="al-small" style={{ background: 'var(--al-blue-soft)', color: 'var(--al-blue-ink)', borderRadius: 10, padding: '8px 12px' }}
          data-testid="add-person-pdpa">
          <Icon name="user" size={12} /> {PDPA_LINE}
        </div>
        {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)' }} data-testid="add-person-error">{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && <button type="button" className="al-btn al-btn-outline" onClick={onCancel} disabled={busy}>ย้อนกลับ</button>}
          <button type="submit" className="al-btn al-btn-red al-btn-block" disabled={busy} data-testid="add-person-submit">
            {busy ? 'กำลังเพิ่ม...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
};

// ---------- the gap sheet: add / share / nudge ----------
export const GapPanel = ({ slot, me, attachNode, token, userName, onClose, onChanged, toast }) => {
  const isUp = slot.distance > 0;
  const initialGhost = slot.state === 'ghost' ? slot.node : null;
  const [ghost, setGhost] = useState(initialGhost);
  const [step, setStep] = useState(initialGhost ? 'invite' : 'choose');
  const [clue, setClue] = useState('');
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [changed, setChanged] = useState(false);
  const [nudged, setNudged] = useState(null);

  const term = slot.term;
  const headline = slot.headline || `${term}ของคุณยังไม่มา`;
  const close = () => { onClose(changed); };

  const nudgeTarget = (() => {
    const bi = (slot.best_inviters || []).find(b => !b.is_me);
    if (bi) return { user_id: bi.user_id, nickname: bi.nickname };
    if (isUp && attachNode && attachNode.user_id !== me?.user_id && !attachNode.is_ghost) {
      return { user_id: attachNode.user_id, nickname: attachNode.nickname || attachNode.name };
    }
    return null;
  })();

  const createInvite = async () => {
    setBusy(true); setErr(null);
    try {
      const r = ghost
        ? await api.post(token, `/alumni/ghosts/${ghost.user_id}/invite`, { clue: clue || null, reveal_game: true })
        : await api.post(token, '/alumni/invites', { clue: clue || null, reveal_game: true, relation_hint: 'น้องเทค' });
      setInvite(r.data); setChanged(true); setStep('share');
    } catch (e) { setErr(errMsg(e, 'สร้างลิงก์ไม่สำเร็จ')); }
    finally { setBusy(false); }
  };

  const nudge = async () => {
    if (!nudgeTarget) return;
    setBusy(true); setErr(null);
    try {
      await api.post(token, '/alumni/chain/nudge', { user_id: nudgeTarget.user_id });
      setNudged(nudgeTarget.nickname); setChanged(true); setStep('nudged');
    } catch (e) { setErr(errMsg(e, 'ส่งเตือนไม่สำเร็จ')); }
    finally { setBusy(false); }
  };

  const clueField = (
    <div style={{ marginBottom: 12 }}>
      <label className="al-label" htmlFor="gp-clue">ใบ้ให้เขาหน่อย <span className="al-muted" style={{ fontWeight: 400 }}>(ไม่บังคับ · ไม่เกิน 140 ตัวอักษร)</span></label>
      <input id="gp-clue" className="al-input" maxLength={140} value={clue} onChange={e => setClue(e.target.value)}
        placeholder="เช่น คนที่เคยพาไปกินหมูกระทะตอนรับน้อง" data-testid="gap-clue-input" />
      <div className="al-help">ปลายทางจะได้ลองทายว่าใครชวน เล่นสนุกกว่าลิงก์เปล่า ๆ (เฉลยสาย)</div>
    </div>
  );

  return (
    <Modal onClose={close}>
      <div data-testid="gap-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>{isUp ? 'ต่อสายขึ้นไป' : 'ต่อสายลงมา'}</div>
            <h3 className="al-h-card" style={{ fontSize: 22 }} data-testid="gap-headline">{headline}</h3>
          </div>
          <button className="al-iconbtn" onClick={close} aria-label="ปิด" data-testid="gap-close-btn"><Icon name="x" /></button>
        </div>
        {slot.hint && <p className="al-small al-muted" style={{ marginTop: 0 }}>{slot.hint}</p>}

        {step === 'choose' && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <button className="al-btn al-btn-red al-btn-lg al-btn-block" onClick={() => setStep('add')} data-testid="gap-add-btn">
              <Icon name="plus" size={16} /> รู้ว่าเป็นใคร เพิ่มชื่อ{term}
            </button>
            {!isUp && (
              <button className="al-btn al-btn-outline al-btn-lg al-btn-block" onClick={() => { setGhost(null); setStep('invite'); }} data-testid="gap-open-invite-btn">
                <Icon name="share" size={16} /> ส่งลิงก์ชวนน้องเทคเลย
              </button>
            )}
            {isUp && nudgeTarget && (
              <button className="al-btn al-btn-outline al-btn-lg al-btn-block" onClick={nudge} disabled={busy} data-testid="gap-nudge-btn">
                <Icon name="bell" size={16} /> ไม่รู้ ให้ {nudgeTarget.nickname} ช่วยตามหา
              </button>
            )}
            <div className="al-tiny al-muted" style={{ lineHeight: 1.5 }}>{PDPA_LINE}</div>
            {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)' }}>{err}</div>}
          </div>
        )}

        {step === 'add' && (
          <div style={{ marginTop: 14 }}>
            <AddPersonForm token={token} term={term}
              attach={{ as: isUp ? 'senior' : 'junior', toId: attachNode?.user_id || me?.user_id }}
              defaultGen={me?.gen ? (isUp ? me.gen - slot.distance : me.gen + 1) : ''}
              onCancel={() => setStep('choose')}
              submitLabel={`เพิ่ม${term}เข้าสาย`}
              onCreated={(g) => { setGhost(g); setChanged(true); setStep('invite'); toast && toast(`เพิ่ม ${shortName(g)} แล้ว`); }} />
          </div>
        )}

        {step === 'invite' && (
          <div style={{ marginTop: 14 }} data-testid="gap-invite-step">
            {ghost && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '2px dashed var(--al-line-2)', borderRadius: 12, marginBottom: 12 }}>
                <Avatar name={ghost.name} hue={ghost.avatar_hue || 200} size="md" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{ghost.name}</div>
                  <div className="al-tiny al-muted">รุ่น {ghost.gen} · ยังไม่ลงทะเบียน</div>
                </div>
                <span className="al-tag outline">{term}</span>
              </div>
            )}
            <p className="al-small" style={{ marginTop: 0 }}>
              {ghost ? `ส่งลิงก์ให้ ${shortName(ghost)} (หรือคนที่รู้จักเขา) ทาง LINE ให้เขามาเฉลยและเข้าสายด้วยตัวเอง` : 'สร้างลิงก์แล้วส่งให้น้องเทคทาง LINE ได้เลย'}
            </p>
            {clueField}
            {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="al-btn al-btn-outline" onClick={close}>ไว้ก่อน</button>
              <button className="al-btn al-btn-red al-btn-block" onClick={createInvite} disabled={busy} data-testid="gap-create-invite-btn">
                <Icon name="sparkles" size={14} /> {busy ? 'กำลังสร้าง...' : 'สร้างลิงก์ชวน'}
              </button>
            </div>
            {!ghost && isUp && nudgeTarget && (
              <button className="al-btn al-btn-ghost al-btn-sm" style={{ marginTop: 8 }} onClick={nudge}>ให้ {nudgeTarget.nickname} ช่วยชวนแทน</button>
            )}
          </div>
        )}

        {step === 'share' && invite && (
          <div style={{ marginTop: 14 }}>
            <SharePanel invite={invite} revealGame inviterName={userName} onToast={toast}
              heading={ghost ? `ลิงก์ชวน ${shortName(ghost)} พร้อมแล้ว` : 'ลิงก์ชวนพร้อมแล้ว'} />
            <button className="al-btn al-btn-ghost al-btn-block" style={{ marginTop: 14 }} onClick={close} data-testid="gap-done-btn">เสร็จแล้ว</button>
          </div>
        )}

        {step === 'nudged' && (
          <div style={{ marginTop: 14, textAlign: 'center' }} data-testid="gap-nudged">
            <div style={{ fontSize: 40 }}>📣</div>
            <p style={{ fontWeight: 600 }}>ส่งเตือนให้ {nudged} แล้ว</p>
            <p className="al-small al-muted">เขารู้จักพี่เทคของตัวเองดีที่สุด เดี๋ยวสายจะยาวขึ้นเอง</p>
            <button className="al-btn al-btn-outline" onClick={close}>ปิด</button>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---------- "ต่อสายขึ้นไปอีกขั้น" hand-off card (viral loop) ----------
export const NextUpCard = ({ token, me, userName, onChanged, toast, autoOpen = false, big = false }) => {
  const { gaps, error, loading, reload } = useGaps(token);
  const [open, setOpen] = useState(false);
  const opened = React.useRef(false);

  const slot = gaps ? (gaps.up || []).find(s => s.state !== 'registered') : null;
  useEffect(() => {
    if (autoOpen && slot && !opened.current) { opened.current = true; setOpen(true); }
  }, [autoOpen, slot]);

  if (loading && !gaps) return <div className="al-card al-card-pad al-muted al-small" data-testid="nextup-loading">กำลังดูว่าสายขาดใครอยู่...</div>;
  if (error) return (
    <div className="al-card al-card-pad" data-testid="nextup-error">
      <div className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 8 }}>{error}</div>
      <button className="al-btn al-btn-outline al-btn-sm" onClick={reload}>ลองใหม่</button>
    </div>
  );
  if (!slot) return (
    <div className="al-card al-card-pad" data-testid="nextup-none">
      <div className="al-small">สายของคุณขึ้นไปครบทุกคนที่เรารู้จักแล้ว 🎉</div>
    </div>
  );

  const attachNode = attachNodeFor(gaps, slot, me);
  return (
    <>
      <div className="al-card al-card-pad" data-testid="nextup-card"
        style={{ background: 'var(--al-red-soft)', borderColor: 'rgba(200,16,46,.25)', padding: big ? 28 : undefined }}>
        <div className="al-eyebrow" style={{ color: 'var(--al-red-ink)', marginBottom: 8 }}>ขั้นต่อไป · ต่อสายขึ้นไปอีกขั้น</div>
        <h3 className="al-h-card" style={{ fontSize: big ? 24 : 18, marginBottom: 6 }}>{slot.headline || `${slot.term}ของคุณยังไม่มา`}</h3>
        <p className="al-small" style={{ margin: '0 0 14px', color: 'var(--al-ink-2)' }}>
          {slot.hint || `รู้ไหมว่าใครคือ${slot.term}? ชวนเขามา สายเราจะยาวขึ้นอีกหนึ่งขั้น`}
        </p>
        <button className="al-btn al-btn-red al-btn-lg" onClick={() => setOpen(true)} data-testid="nextup-open-btn">
          <Icon name="sparkles" size={16} /> ชวน{slot.term}เข้าสาย <Icon name="arrow-right" size={16} />
        </button>
      </div>
      {open && (
        <GapPanel slot={slot} me={me} attachNode={attachNode} token={token} userName={userName} toast={toast}
          onClose={(ch) => { setOpen(false); if (ch) { reload(); onChanged && onChanged(); } }} />
      )}
    </>
  );
};

// ---------- history ----------
const ACTION_LABEL = {
  relation_claim: 'มีคนบอกว่าสองคนนี้เป็นพี่น้องเทค',
  counterpart_accept: 'เจ้าตัวยืนยันว่าใช่',
  counterpart_reject: 'เจ้าตัวบอกว่าไม่ใช่',
  relation_delete: 'ลบความสัมพันธ์',
  set_primary: 'ตั้งเป็นพี่เทคหลัก',
  admin_decide: 'แอดมินตัดสิน',
  ghost_claim_approve: 'อนุมัติให้เจ้าตัวรับสายต่อ',
};

export const HistoryModal = ({ relationId, token, onClose }) => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.get(token, `/alumni/relations/${relationId}/history`)
      .then(r => setData(r.data)).catch(e => setErr(errMsg(e, 'โหลดประวัติไม่สำเร็จ')));
  }, [relationId, token]);
  return (
    <Modal onClose={onClose}>
      <div data-testid="history-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="al-h-card" style={{ fontSize: 20 }}>ประวัติของความสัมพันธ์นี้</h3>
          <button className="al-iconbtn" onClick={onClose} aria-label="ปิด"><Icon name="x" /></button>
        </div>
        {!data && !err && <div className="al-muted al-small">กำลังโหลด...</div>}
        {err && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)' }}>{err}</div>}
        {data && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <StatusBadge status={data.relation.status} />
              <span className="al-small al-muted">
                รับรอง {data.relation.vouch_yes || 0} · ไม่เห็นด้วย {data.relation.vouch_no || 0}
              </span>
            </div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>คนที่ช่วยโหวต ({data.vouches.length})</div>
            {data.vouches.length === 0 && <div className="al-small al-muted" style={{ marginBottom: 12 }}>ยังไม่มีใครโหวต</div>}
            <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
              {data.vouches.map((v, i) => (
                <div key={i} className="al-small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`al-st ${v.vote === 'yes' ? 'al-st-confirmed' : 'al-st-disputed'}`}>{v.vote === 'yes' ? 'ใช่' : 'ไม่ใช่'}</span>
                  <b>{v.voter?.nickname || 'สมาชิก'}</b>
                  <span className="al-tiny al-muted">{formatDateTh(v.created_at)}</span>
                </div>
              ))}
            </div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>เหตุการณ์</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {data.events.map(ev => (
                <div key={ev.id} className="al-small" style={{ borderLeft: '3px solid var(--al-line-2)', paddingLeft: 10 }}>
                  <div>{ACTION_LABEL[ev.action] || ev.action}</div>
                  <div className="al-tiny al-muted">{ev.actor?.nickname || 'ระบบ'} · {formatDateTh(ev.at)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

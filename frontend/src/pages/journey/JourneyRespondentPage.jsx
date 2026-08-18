import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import '../brand-equity/brand-equity-styles.css';
import './journey-styles.css';
import { BeLoading } from '../brand-equity/be-components';
import JourneyPathBuilder from './JourneyPathBuilder';
import { COPY } from './copy-th';
import { copyToClipboard } from '@/lib/clipboard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_STEPS = 12;
const TRAP_ID = '__trap__';

// Deterministic per-respondent shuffle: the realised order is stored with the
// response, so the option-position diagnostic can actually be computed.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (arr, rand) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};


// Defined at module scope: a component declared inside the page would be a NEW
// component type on every render, remounting the inputs and losing focus.
const JyFrame = ({ study, pct, savedAt, onBack, title, sub, children, testid,
                   next, nextLabel = 'ถัดไป', nextDisabled, back }) => (
  <div className="be-root jy-root">
    <div className="be-page be-page-narrow" style={{ maxWidth: 640 }} data-testid={testid}>
      <div className="be-tiny be-mono" style={{ color: 'var(--ink-3)' }}>
        {study.title} · ใช้เวลาประมาณ {Math.round(study.estimated_minutes || 6)} นาที
      </div>
      <div className="jy-progress"><div style={{ width: `${pct}%` }} /></div>
      <h1 className="be-h2" style={{ marginBottom: 8 }}>{title}</h1>
      {sub && <p className="be-tiny" style={{ color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 20 }}>{sub}</p>}
      {children}
      <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap' }}>
        {back && (
          <button className="be-btn" onClick={() => onBack(back)} data-testid="jy-back-btn">ย้อนกลับ</button>
        )}
        {next && (
          <button className="be-btn be-btn-primary be-btn-lg" data-testid="jy-next-btn"
                  disabled={nextDisabled} onClick={next}>{nextLabel}</button>
        )}
      </div>
      {savedAt && (
        <div className="be-tiny" style={{ color: 'var(--ink-3)', marginTop: 14 }} data-testid="jy-draft-saved">
          บันทึกความคืบหน้าอัตโนมัติแล้ว · กลับมาตอบต่อได้จากลิงก์เดิม
        </div>
      )}
    </div>
  </div>
);

const JourneyRespondentPage = () => {
  const { token } = useParams();
  const [params] = useSearchParams();

  const [study, setStudy] = useState(null);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState('consent');
  const [submitting, setSubmitting] = useState(false);
  const [doneToken, setDoneToken] = useState(null);
  const [screenedOut, setScreenedOut] = useState(false);
  const [copied, setCopied] = useState(false);

  const [consent, setConsent] = useState({ participation: false, recontact: false, linkage: false });
  const [recontactValue, setRecontactValue] = useState('');
  const [recency, setRecency] = useState('');
  const [memoryCue, setMemoryCue] = useState('');
  const [subjectChoice, setSubjectChoice] = useState('');
  const [visited, setVisited] = useState([]);
  const [lateAdditions, setLateAdditions] = useState([]);
  const [draftPath, setDraftPath] = useState([]);
  const [pathRaw, setPathRaw] = useState([]);
  const [terminal, setTerminal] = useState('UNKNOWN');
  const [terminatedBy, setTerminatedBy] = useState('outcome');
  const [replayEdited, setReplayEdited] = useState(false);
  const [editOps, setEditOps] = useState([]);
  const [experience, setExperience] = useState({});
  const [painNominated, setPainNominated] = useState([]);
  const [painDetail, setPainDetail] = useState({});
  const [painIdx, setPainIdx] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [sat, setSat] = useState(null);
  const [demographics, setDemographics] = useState({});
  const [otherSelected, setOtherSelected] = useState(false);
  const [trapHit, setTrapHit] = useState(false);
  const [trapShown, setTrapShown] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [draftId, setDraftId] = useState(params.get('draft') || null);
  const [savedAt, setSavedAt] = useState(null);

  const startedAt = useRef(Date.now());
  const seed = useRef(Math.floor(Math.random() * 1e9));
  const optionPositions = useRef({});

  const states = study?.states || [];
  const labelOf = useCallback((id) => states.find((s) => s.id === id)?.label_th || id, [states]);
  const terminalLabels = useMemo(() => ({
    CONV: study?.absorbing?.conv_label_th || 'ซื้อแล้ว',
    ABANDON: study?.absorbing?.abandon_label_th || 'เลิกสนใจ',
    UNKNOWN: study?.absorbing?.unknown_label_th || 'ไม่ทราบปลายทาง',
  }), [study]);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/journey/public/${token}`);
        setStudy(r.data);
      } catch (e) {
        setError(e?.response?.data?.detail || 'เปิดแบบสอบถามไม่ได้');
      }
    })();
  }, [token]);

  // Resume: rehydrate from draft_path + branch cursor directly (spec 2.5).
  useEffect(() => {
    const id = params.get('draft');
    if (!id || !study) return;
    (async () => {
      try {
        const r = await axios.get(`${API}/journey/public/${token}/draft/${id}`);
        const s = r.data?.state || {};
        if (s.consent) setConsent(s.consent);
        if (s.recency) setRecency(s.recency);
        if (s.visited) setVisited(s.visited);
        if (s.draftPath) setDraftPath(s.draftPath);
        if (s.terminal) setTerminal(s.terminal);
        if (s.experience) setExperience(s.experience);
        if (s.painNominated) setPainNominated(s.painNominated);
        if (s.demographics) setDemographics(s.demographics);
        if (s.screen) setScreen(s.screen);
        setDraftId(id);
      } catch (e) { /* a missing draft just starts fresh */ }
    })();
    // eslint-disable-next-line
  }, [study]);

  const saveDraft = useCallback(async (nextScreen) => {
    if (!study) return;
    try {
      const r = await axios.post(`${API}/journey/public/${token}/draft`, {
        draft_id: draftId,
        state: { screen: nextScreen, consent, recency, visited, draftPath, terminal,
                 experience, painNominated, demographics, rng_seed: seed.current },
      });
      setDraftId(r.data.draft_id);
      setSavedAt(new Date());
    } catch (e) { /* progress is also held in component state */ }
  }, [study, token, draftId, consent, recency, visited, draftPath, terminal,
      experience, painNominated, demographics]);

  const go = (next) => { setScreen(next); saveDraft(next); window.scrollTo(0, 0); };

  // Q1 checklist order — randomised within stage block, block order fixed.
  const checklistOrder = useMemo(() => {
    if (!study) return [];
    const rand = mulberry32(seed.current);
    const out = [];
    (study.stages || []).forEach((st) => {
      out.push(...shuffle(states.filter((s) => s.stage_id === st.id), rand));
    });
    states.forEach((s) => { if (!out.find((o) => o.id === s.id)) out.push(s); });
    optionPositions.current.q1 = Object.fromEntries(out.map((s, i) => [s.id, i]));
    return out;
  }, [study, states]);

  const vSet = useMemo(() => [...new Set([...visited, ...lateAdditions])], [visited, lateAdditions]);
  const pathStates = useMemo(() => [...new Set(draftPath)], [draftPath]);

  const plausibleFirst = useCallback((current, ids) => {
    const matrix = study?.expected_transitions?.matrix || [];
    const idx = states.findIndex((s) => s.id === current);
    const score = (sid) => {
      const j = states.findIndex((s) => s.id === sid);
      if (idx < 0 || j < 0) return 0;
      try { return matrix[idx][j] ? 1 : 0; } catch { return 0; }
    };
    return [...ids].sort((a, b) => score(b) - score(a));
  }, [study, states]);

  const chooseNext = (sid) => {
    if (sid === TRAP_ID) { setTrapHit(true); return; }
    const next = [...draftPath, sid];
    setDraftPath(next);
    setPathRaw(next);
    if (next.length >= MAX_STEPS) {
      setTerminal('UNKNOWN'); setTerminatedBy('cap'); go('replay');
    }
  };

  const endWith = (t, by) => {
    setTerminal(t); setTerminatedBy(by);
    setPathRaw(draftPath);
    go('replay');
  };

  const addLate = (sid) => {
    setLateAdditions((p) => [...new Set([...p, sid])]);
    setShowAddSheet(false);
    chooseNext(sid);
  };

  const gridStates = useMemo(() => {
    if (terminal === 'ABANDON' && draftPath.length) {
      const last = draftPath[draftPath.length - 1];
      return [last, ...pathStates.filter((s) => s !== last)];
    }
    return pathStates;
  }, [pathStates, draftPath, terminal]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const body = {
        consent,
        episode: { recency_band: recency, memory_cue: memoryCue.slice(0, 200) },
        subject_choice: subjectChoice || null,
        visited: vSet,
        late_additions: lateAdditions,
        path: draftPath.map((s, i) => ({ state_id: s, order: i })),
        path_raw: pathRaw.map((s, i) => ({ state_id: s, order: i })),
        replay_edited: replayEdited,
        edit_ops: editOps,
        terminal,
        terminated_by: terminatedBy,
        outcome: outcome || null,
        experience,
        pain: { nominated: painNominated, ...painDetail },
        overall_sat_0_10: sat,
        demographics,
        quality: {
          duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
          option_positions: optionPositions.current,
          rng_seed: seed.current,
          trap_shown: trapShown,
          trap_hit: trapHit,
          other_selected: otherSelected,
        },
        draft_id: draftId,
        recontact_value: consent.recontact ? recontactValue : null,
      };
      const r = await axios.post(`${API}/journey/public/${token}/respond`, body);
      if (r.data?.screened_out) { setScreenedOut(true); return; }
      setDoneToken(r.data.respondent_token);
      setScreen('done');
    } catch (e) {
      setError(e?.response?.data?.detail || 'ส่งคำตอบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !study) {
    return (
      <div className="be-root jy-root"><div className="be-page be-page-narrow">
        <div className="be-card" data-testid="jy-error">{error}</div>
      </div></div>
    );
  }
  if (!study) {
    return <div className="be-root jy-root"><div className="be-page"><BeLoading text="กำลังเปิดแบบสอบถาม…" /></div></div>;
  }

  const SCREENS = ['consent', 'episode', 'subject', 'checklist', 'first', 'branch',
                   'replay', 'grid', 'pain', 'paindepth', 'outcome', 'segments'];
  const pct = Math.round((Math.max(0, SCREENS.indexOf(screen)) / SCREENS.length) * 100);

  const frameProps = { study, pct, savedAt, onBack: go };

  if (screenedOut) {
    return (
      <div className="be-root jy-root"><div className="be-page be-page-narrow">
        <div className="be-card" data-testid="jy-screened-out">
          <h2 className="be-h2">ขอบคุณมากครับ/ค่ะ</h2>
          <p className="be-tiny" style={{ marginTop: 10, lineHeight: 1.7 }}>
            การศึกษานี้ต้องการผู้ที่มีประสบการณ์ภายในช่วงเวลาที่กำหนด คำตอบของคุณจึงไม่ถูกบันทึก
          </p>
        </div>
      </div></div>
    );
  }

  if (screen === 'done') {
    return (
      <div className="be-root jy-root"><div className="be-page be-page-narrow">
        <div className="be-card" data-testid="jy-thankyou">
          <h2 className="be-h2">ส่งคำตอบเรียบร้อยแล้ว ขอบคุณมากครับ/ค่ะ</h2>
          <p className="be-tiny" style={{ margin: '12px 0 6px', lineHeight: 1.7 }}>
            {study.consent?.withdraw_note_th}
          </p>
          <div className="jy-token" data-testid="jy-respondent-token">{doneToken}</div>
          <button className="be-btn be-btn-sm" style={{ marginTop: 12 }} data-testid="jy-copy-token"
                  onClick={async () => { await copyToClipboard(doneToken); setCopied(true); }}>
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัสถอนความยินยอม'}
          </button>
        </div>
      </div></div>
    );
  }

  // ---- C1 consent ------------------------------------------------------
  if (screen === 'consent') {
    const c = study.consent || {};
    return (
      <JyFrame {...frameProps} title="ขอความยินยอมก่อนเริ่ม" testid="jy-screen-consent"
             next={() => go('episode')} nextDisabled={!consent.participation} nextLabel="เริ่มตอบ">
        <div className="be-card" style={{ marginBottom: 16 }}>
          <div className="jy-kv"><span>ผู้ควบคุมข้อมูล</span><b>{c.controller}</b></div>
          <div className="jy-kv"><span>วัตถุประสงค์</span><b style={{ maxWidth: 340, textAlign: 'right' }}>{c.purpose}</b></div>
          <div className="jy-kv"><span>เก็บข้อมูลไว้</span><b>{c.retention_months} เดือน</b></div>
          <div className="jy-kv"><span>ติดต่อ</span><b>{c.contact}</b></div>
          <div style={{ marginTop: 12 }}>
            <div className="be-label">ข้อมูลที่เก็บ</div>
            <ul className="be-tiny" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              {(c.data_items || []).map((d) => <li key={d}>{d}</li>)}
            </ul>
            <div className="be-label" style={{ marginTop: 12 }}>สิทธิของคุณ</div>
            <ul className="be-tiny" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              {(c.rights || []).map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
        </div>
        <div className="jy-optlist">
          {(c.opt_ins || []).map((o) => (
            <button key={o.key} type="button"
                    className={`jy-opt ${consent[o.key] ? 'jy-on' : ''}`}
                    data-testid={`jy-consent-${o.key}`}
                    onClick={() => setConsent((p) => ({ ...p, [o.key]: !p[o.key] }))}>
              {consent[o.key] ? '☑' : '☐'} {o.label_th}
              <span className="jy-opt-note">{o.required ? 'จำเป็น' : 'ไม่บังคับ'}</span>
            </button>
          ))}
        </div>
        {consent.recontact && (
          <input className="be-input" style={{ marginTop: 12 }} data-testid="jy-recontact-input"
                 placeholder="ช่องทางติดต่อกลับ (อีเมลหรือไอดีโซเชียล)"
                 value={recontactValue} onChange={(e) => setRecontactValue(e.target.value)} />
        )}
      </JyFrame>
    );
  }

  // ---- S1/S2 episode anchor -------------------------------------------
  if (screen === 'episode') {
    return (
      <JyFrame {...frameProps} title={`ครั้งล่าสุดที่คุณ${study.subject?.category ? `ซื้อ/ใช้ ${study.subject.category}` : 'ทำเรื่องนี้'} คือเมื่อไร`}
             sub="เลือกช่วงเวลาที่ใกล้เคียงที่สุด" testid="jy-screen-episode"
             next={() => go(study.subject?.name ? 'subject' : 'checklist')} nextDisabled={!recency}>
        <div className="jy-optlist">
          {(study.recency_bands || []).map((b) => (
            <button key={b.id} type="button" className={`jy-opt ${recency === b.id ? 'jy-on' : ''}`}
                    data-testid={`jy-recency-${b.id}`} onClick={() => setRecency(b.id)}>
              {b.label_th}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="be-label">ถ้าจำได้ ช่วยเล่าสั้น ๆ ว่าครั้งนั้นคือเรื่องอะไร (ไม่บังคับ)</label>
          <input className="be-input" data-testid="jy-memory-cue" value={memoryCue}
                 onChange={(e) => setMemoryCue(e.target.value)} />
        </div>
      </JyFrame>
    );
  }

  // ---- S3 subject ------------------------------------------------------
  if (screen === 'subject') {
    const opts = [study.subject?.name, ...(study.subject?.competitors || []), 'อื่น ๆ'].filter(Boolean);
    return (
      <JyFrame {...frameProps} title="ครั้งนั้นคุณเลือกแบรนด์หรือร้านใด" testid="jy-screen-subject"
             back="episode" next={() => go('checklist')} nextDisabled={!subjectChoice}>
        <div className="jy-optlist">
          {opts.map((o) => (
            <button key={o} type="button" className={`jy-opt ${subjectChoice === o ? 'jy-on' : ''}`}
                    data-testid={`jy-subject-${o}`} onClick={() => setSubjectChoice(o)}>{o}</button>
          ))}
        </div>
      </JyFrame>
    );
  }

  // ---- Q1 aided-recall checklist --------------------------------------
  if (screen === 'checklist') {
    const toggle = (id) => setVisited((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
    return (
      <JyFrame {...frameProps} title="ครั้งนั้นคุณทำขั้นตอนไหนบ้าง" sub="เลือกได้หลายข้อ · ยังไม่ต้องเรียงลำดับ"
             testid="jy-screen-checklist" back="episode"
             next={() => go(visited.length ? 'first' : 'outcome')}
             nextDisabled={!visited.length && !otherSelected}>
        <div className="jy-optlist">
          {checklistOrder.map((s) => (
            <button key={s.id} type="button" className={`jy-opt ${visited.includes(s.id) ? 'jy-on' : ''}`}
                    data-testid={`jy-check-${s.id}`} onClick={() => toggle(s.id)}>
              {visited.includes(s.id) ? '☑' : '☐'} {s.label_th}
            </button>
          ))}
          <button type="button" className={`jy-opt jy-end ${otherSelected ? 'jy-on' : ''}`}
                  data-testid="jy-check-other" onClick={() => setOtherSelected((v) => !v)}>
            อื่น ๆ ที่ไม่มีในรายการ
          </button>
          <button type="button" className="jy-opt jy-end" data-testid="jy-check-none"
                  onClick={() => { setVisited([]); setTerminatedBy('outcome'); go('outcome'); }}>
            ไม่ได้ทำขั้นไหนเลย
          </button>
        </div>
      </JyFrame>
    );
  }

  // ---- Q2 anchored first step -----------------------------------------
  if (screen === 'first') {
    return (
      <JyFrame {...frameProps} title="ขั้นแรกที่คุณทำคืออะไร" testid="jy-screen-first" back="checklist">
        <div className="jy-optlist">
          {vSet.map((id) => (
            <button key={id} type="button" className="jy-opt" data-testid={`jy-first-${id}`}
                    onClick={() => { setDraftPath([id]); setPathRaw([id]); go('branch'); }}>
              {labelOf(id)}
            </button>
          ))}
          <button type="button" className="jy-opt jy-end" data-testid="jy-first-unsure"
                  onClick={() => { setTerminal('UNKNOWN'); setTerminatedBy('unsure'); go('replay'); }}>
            จำลำดับไม่ได้
          </button>
        </div>
      </JyFrame>
    );
  }

  // ---- Q3..Qk branching ------------------------------------------------
  if (screen === 'branch') {
    const current = draftPath[draftPath.length - 1];
    const others = plausibleFirst(current, vSet.filter((id) => id !== current));
    const showTrap = draftPath.length === 2;
    if (showTrap && !trapShown) setTrapShown(true);
    return (
      <JyFrame {...frameProps} title={`หลังจาก “${labelOf(current)}” แล้วคุณทำอะไรต่อ`}
             sub={`ขั้นที่ ${draftPath.length + 1} จากไม่เกิน ${MAX_STEPS} ขั้น`}
             testid="jy-screen-branch">
        {trapHit && (
          <div className="jy-warn" data-testid="jy-trap-warn">
            ตัวเลือกนั้นเป็นไปไม่ได้ในเวลาจริง ลองเลือกสิ่งที่คุณทำจริงอีกครั้งได้เลย
          </div>
        )}
        <div className="jy-optlist">
          <button type="button" className="jy-opt" data-testid={`jy-branch-repeat`}
                  onClick={() => chooseNext(current)}>
            ทำ “{labelOf(current)}” ซ้ำอีกครั้ง
          </button>
          {others.map((id) => (
            <button key={id} type="button" className="jy-opt" data-testid={`jy-branch-${id}`}
                    onClick={() => chooseNext(id)}>{labelOf(id)}</button>
          ))}
          {showTrap && (
            <button type="button" className="jy-opt" data-testid="jy-branch-trap"
                    onClick={() => chooseNext(TRAP_ID)}>
              ย้อนเวลากลับไปก่อนที่ทุกอย่างจะเริ่มต้น
            </button>
          )}
          <button type="button" className="jy-opt jy-end" data-testid="jy-branch-other"
                  onClick={() => setShowAddSheet(true)}>
            ทำอย่างอื่นที่ยังไม่ได้เลือก
          </button>
          <button type="button" className="jy-opt jy-end" data-testid="jy-branch-conv"
                  onClick={() => endWith('CONV', 'outcome')}>{terminalLabels.CONV}</button>
          <button type="button" className="jy-opt jy-end" data-testid="jy-branch-abandon"
                  onClick={() => endWith('ABANDON', 'outcome')}>{terminalLabels.ABANDON}</button>
          <button type="button" className="jy-opt jy-end" data-testid="jy-branch-ongoing"
                  onClick={() => endWith('UNKNOWN', 'ongoing')}>ยังตัดสินใจอยู่</button>
          <button type="button" className="jy-opt jy-end" data-testid="jy-branch-unsure"
                  onClick={() => endWith('UNKNOWN', 'unsure')}>จำลำดับไม่ได้</button>
        </div>

        {showAddSheet && (
          <div className="jy-sheet" onClick={() => setShowAddSheet(false)} data-testid="jy-late-sheet">
            <div className="jy-sheet-inner" onClick={(e) => e.stopPropagation()}>
              <div className="be-label">ขั้นตอนอื่นที่คุณทำ</div>
              <div className="jy-optlist">
                {states.filter((s) => !vSet.includes(s.id)).map((s) => (
                  <button key={s.id} type="button" className="jy-opt"
                          data-testid={`jy-late-${s.id}`} onClick={() => addLate(s.id)}>
                    {s.label_th}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </JyFrame>
    );
  }

  // ---- Q10 replay & correct -------------------------------------------
  if (screen === 'replay') {
    return (
      <JyFrame {...frameProps} title="ทวนลำดับอีกครั้ง" sub="แก้ไขได้ตามจริง ลำดับที่คุณยืนยันคือข้อมูลที่เราใช้"
             testid="jy-screen-replay">
        <JourneyPathBuilder
          states={states}
          draftPath={draftPath}
          terminal={terminal}
          terminalLabels={terminalLabels}
          onChange={(next) => {
            setDraftPath(next); setReplayEdited(true);
            setEditOps((p) => [...p, { at: Date.now(), len: next.length }]);
          }}
          onTerminalChange={(t) => { setTerminal(t); setReplayEdited(true); }}
          onConfirm={() => go(draftPath.length ? 'grid' : 'outcome')}
        />
      </JyFrame>
    );
  }

  // ---- G1 experience grid ---------------------------------------------
  if (screen === 'grid') {
    const setVal = (sid, key, v) =>
      setExperience((p) => ({ ...p, [sid]: { ...(p[sid] || {}), [key]: v } }));
    const complete = gridStates.every((s) => experience[s]?.difficulty_1_5);
    return (
      <JyFrame {...frameProps} title="แต่ละขั้นยุ่งยากแค่ไหน" sub="ตอบเฉพาะขั้นที่คุณทำจริง · 1 = ง่ายมาก, 5 = ยุ่งยากมาก"
             testid="jy-screen-grid" next={() => go('pain')} nextDisabled={!complete}>
        {gridStates.map((sid) => (
          <div className="be-card" key={sid} style={{ marginBottom: 12 }} data-testid={`jy-grid-${sid}`}>
            <div style={{ fontSize: 14, marginBottom: 10 }}>{labelOf(sid)}</div>
            <div className="be-label">ความยุ่งยาก</div>
            <div className="jy-scale">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" data-testid={`jy-diff-${sid}-${v}`}
                        className={experience[sid]?.difficulty_1_5 === v ? 'jy-on' : ''}
                        onClick={() => setVal(sid, 'difficulty_1_5', v)}>{v}</button>
              ))}
            </div>
            <div className="be-label" style={{ marginTop: 12 }}>ความรู้สึก</div>
            <div className="jy-scale">
              {[['แย่', -1], ['เฉย ๆ', 0], ['ดี', 1]].map(([lab, v]) => (
                <button key={lab} type="button" style={{ minWidth: 76 }}
                        data-testid={`jy-emo-${sid}-${v}`}
                        className={experience[sid]?.emotion === v ? 'jy-on' : ''}
                        onClick={() => setVal(sid, 'emotion', v)}>{lab}</button>
              ))}
            </div>
          </div>
        ))}
      </JyFrame>
    );
  }

  // ---- P1 pain nomination ---------------------------------------------
  if (screen === 'pain') {
    const toggle = (id) => setPainNominated((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : (p.length >= 2 ? p : [...p, id]));
    return (
      <JyFrame {...frameProps} title="ขั้นไหนที่เป็นปัญหามากที่สุด" sub="เลือกได้ไม่เกิน 2 ขั้น หรือข้ามได้ถ้าไม่มีปัญหา"
             testid="jy-screen-pain"
             next={() => go(painNominated.length ? 'paindepth' : 'outcome')}
             nextLabel={painNominated.length ? 'ถัดไป' : 'ไม่มีปัญหา ข้ามไป'}>
        <div className="jy-optlist">
          {pathStates.map((id) => (
            <button key={id} type="button" className={`jy-opt ${painNominated.includes(id) ? 'jy-on' : ''}`}
                    data-testid={`jy-pain-${id}`} onClick={() => toggle(id)}>
              {painNominated.includes(id) ? '☑' : '☐'} {labelOf(id)}
            </button>
          ))}
        </div>
      </JyFrame>
    );
  }

  // ---- P2/P3 pain depth ------------------------------------------------
  if (screen === 'paindepth') {
    const sid = painNominated[painIdx];
    const detail = painDetail[sid] || {};
    const opts = (study.pain_options || {})[sid] || [];
    const setDetail = (patch) => setPainDetail((p) => ({ ...p, [sid]: { ...(p[sid] || {}), ...patch } }));
    const toggleCat = (c) => setDetail({
      categories: (detail.categories || []).includes(c)
        ? (detail.categories || []).filter((x) => x !== c)
        : [...(detail.categories || []), c],
    });
    const last = painIdx >= painNominated.length - 1;
    return (
      <JyFrame {...frameProps} title={`ปัญหาที่ “${labelOf(sid)}” หนักแค่ไหน`} testid="jy-screen-paindepth"
             next={() => (last ? go('outcome') : setPainIdx(painIdx + 1))}
             nextDisabled={detail.severity_0_10 === undefined}>
        <div className="be-label">ความรุนแรง 0 = ไม่หนัก, 10 = หนักมาก</div>
        <div className="jy-scale">
          {[...Array(11).keys()].map((v) => (
            <button key={v} type="button" data-testid={`jy-sev-${sid}-${v}`}
                    className={detail.severity_0_10 === v ? 'jy-on' : ''}
                    onClick={() => setDetail({ severity_0_10: v })}>{v}</button>
          ))}
        </div>
        <div className="be-label" style={{ marginTop: 18 }}>ปัญหาแบบไหน (เลือกได้หลายข้อ)</div>
        <div className="jy-optlist">
          {opts.map((c) => (
            <button key={c} type="button"
                    className={`jy-opt ${(detail.categories || []).includes(c) ? 'jy-on' : ''}`}
                    data-testid={`jy-paincat-${c}`} onClick={() => toggleCat(c)}>{c}</button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="be-label">เล่าเหตุการณ์สั้น ๆ (ไม่บังคับ)</label>
          <textarea className="be-textarea" rows={3} data-testid={`jy-painnote-${sid}`}
                    value={detail.note || ''} onChange={(e) => setDetail({ note: e.target.value })} />
        </div>
      </JyFrame>
    );
  }

  // ---- O1/O2 outcome ---------------------------------------------------
  if (screen === 'outcome') {
    return (
      <JyFrame {...frameProps} title="สุดท้ายแล้วผลเป็นอย่างไร" testid="jy-screen-outcome"
             next={() => go('segments')} nextDisabled={!outcome}>
        <div className="jy-optlist">
          {[['convert', terminalLabels.CONV], ['abandon', terminalLabels.ABANDON],
            ['ongoing', 'ยังตัดสินใจอยู่']].map(([v, lab]) => (
            <button key={v} type="button" className={`jy-opt ${outcome === v ? 'jy-on' : ''}`}
                    data-testid={`jy-outcome-${v}`} onClick={() => setOutcome(v)}>{lab}</button>
          ))}
        </div>
        <div className="be-label" style={{ marginTop: 20 }}>ความพึงพอใจโดยรวม 0–10</div>
        <div className="jy-scale">
          {[...Array(11).keys()].map((v) => (
            <button key={v} type="button" data-testid={`jy-sat-${v}`}
                    className={sat === v ? 'jy-on' : ''} onClick={() => setSat(v)}>{v}</button>
          ))}
        </div>
      </JyFrame>
    );
  }

  // ---- D1..D6 segments -------------------------------------------------
  if (screen === 'segments') {
    const qs = study.segment_questions || [];
    const complete = qs.every((q) => demographics[q.id]);
    return (
      <JyFrame {...frameProps} title="คำถามสุดท้าย — ข้อมูลกลุ่มแบบช่วง" sub="ใช้เพื่อเปรียบเทียบกลุ่มเท่านั้น ไม่มีการระบุตัวบุคคล"
             testid="jy-screen-segments" next={submit} nextDisabled={!complete || submitting}
             nextLabel={submitting ? 'กำลังส่ง…' : 'ส่งคำตอบ'}>
        {error && <div className="jy-warn" data-testid="jy-submit-error">{error}</div>}
        {qs.map((q) => (
          <div className="be-card" key={q.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 10 }}>{q.label_th}</div>
            <div className="jy-optlist">
              {(q.options || []).map((o) => (
                <button key={o} type="button"
                        className={`jy-opt ${demographics[q.id] === o ? 'jy-on' : ''}`}
                        data-testid={`jy-seg-${q.id}-${o}`}
                        onClick={() => setDemographics((p) => ({ ...p, [q.id]: o }))}>{o}</button>
              ))}
            </div>
          </div>
        ))}
        <p className="be-tiny" style={{ color: 'var(--ink-3)', lineHeight: 1.7 }}>{COPY.frameNote}</p>
      </JyFrame>
    );
  }

  return null;
};

export default JourneyRespondentPage;

/**
 * Conjoint respondent survey (public, mostly phones).
 *
 * Per-respondent randomisation of task order and the on-screen position of the
 * alternatives. Safe for analysis because every answer is recorded as
 * {choice_set_id, selected_profile_id} — ids of the design — and the backend reads
 * only those two ids (routes/conjoint.py::_build_conjoint_data_rows and every other
 * reader); display position is never an input. We also store what was shown
 * (`display_task_index`, `display_profile_ids`) inside each response item (the
 * request model takes List[Dict[str, Any]], so the extra keys are stored verbatim).
 *
 * The shuffle is seeded and the seed + answers live in sessionStorage, so a reload
 * shows the same order and keeps the answers. Anything the design marks as fixed
 * (a choice set with is_holdout / fixed, a profile with is_none / fixed) keeps its slot.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle, ChevronLeft, ChevronRight, Send, Loader2 } from 'lucide-react';
import ConjointDemographicsStep from '@/pages/conjoint/ConjointDemographicsStep';

// ------------------------------------------------------------------ seeded shuffle
const xmur3 = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
};
const mulberry32 = (a) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rngFor = (seed) => mulberry32(xmur3(String(seed))());

/** Shuffle `items`, leaving every item for which isFixed() is true in its original slot. */
export const shuffleKeepingFixed = (items, rng, isFixed = () => false) => {
  const free = items.map((x, i) => [x, i]).filter(([x]) => !isFixed(x));
  const vals = free.map(([x]) => x);
  for (let i = vals.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [vals[i], vals[j]] = [vals[j], vals[i]];
  }
  const out = items.slice();
  free.forEach(([, slot], k) => { out[slot] = vals[k]; });
  return out;
};

const taskFixed = (cs) => !!(cs.is_holdout || cs.holdout || cs.fixed);
const profileFixed = (p) => !!(p.is_none || p.none_option || p.fixed || p.is_fixed);

/** Display plan: [{cs, profiles}] in the order this respondent sees them. */
export const buildPlan = (choiceSets, seed) => {
  const taskOrder = shuffleKeepingFixed(choiceSets, rngFor(`${seed}:tasks`), taskFixed);
  return taskOrder.map((cs) => ({
    cs,
    profiles: shuffleKeepingFixed(cs.profiles || [], rngFor(`${seed}:${cs.id}`), profileFixed),
  }));
};

// ------------------------------------------------------------------ session storage (always try/catch)
const storeKey = (studyId) => `swumkt.cj.survey.${studyId}`;
const readStore = (studyId) => {
  try { const raw = sessionStorage.getItem(storeKey(studyId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const writeStore = (studyId, v) => { try { sessionStorage.setItem(storeKey(studyId), JSON.stringify(v)); } catch { /* private mode etc. */ } };
const clearStore = (studyId) => { try { sessionStorage.removeItem(storeKey(studyId)); } catch { /* ignore */ } };
const newId = () => {
  try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch { /* ignore */ }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const PublicTopbar = () => (
  <div className="be-public-topbar" data-testid="conjoint-resp-topbar">
    <div className="be-public-brand">
      <img src={SWU_LOGO_URL} alt="SWUMKT Logo" className="be-public-logo" />
      <span className="be-public-text">
        <span className="be-public-name">SWU · Marketing Research</span>
        <span className="be-public-sub be-mono">CONJOINT ANALYSIS · ANONYMOUS</span>
      </span>
    </div>
  </div>
);

const ConjointSurveyPage = () => {
  const { studyId } = useParams();

  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [respondentEmail, setRespondentEmail] = useState('');
  const [demographics, setDemographics] = useState({});
  const [phase, setPhase] = useState('intro'); // 'intro' (= demographics) | 'choice'
  const [submitError, setSubmitError] = useState('');
  // identity of this respondent in this tab: id, shuffle seed, start time
  const [session] = useState(() => {
    const saved = readStore(studyId) || {};
    return {
      rid: saved.rid || newId(),
      seed: saved.seed || newId(),
      startedAt: saved.startedAt || Date.now(),
    };
  });
  const submittingRef = useRef(false);
  const restored = useRef(false);

  const loadSurvey = useCallback(async (retryCount = 0) => {
    setLoadError('');
    try {
      const response = await axios.get(`${API}/conjoint/survey/${studyId}`, {
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      });
      setSurvey(response.data);
      setLoading(false);
    } catch (error) {
      if (retryCount < 2 && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK')) {
        setTimeout(() => loadSurvey(retryCount + 1), 2000);
        return;
      }
      const d = error.response?.data?.detail;
      let msg = 'ไม่สามารถโหลดแบบสอบถามได้ กรุณาลองใหม่อีกครั้ง';
      if (error.response?.status === 404) msg = 'ไม่พบแบบสอบถาม: ID ไม่ถูกต้องหรือถูกลบแล้ว';
      else if (error.response?.status === 400) msg = (typeof d === 'string' && d) || 'แบบสอบถามยังไม่เปิดรับคำตอบ';
      else if (error.code === 'ECONNABORTED') msg = 'การโหลดใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง';
      setLoadError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => { loadSurvey(); }, [loadSurvey]);

  // The order this respondent sees. Stable for a given seed + design.
  const plan = useMemo(() => (survey ? buildPlan(survey.choice_sets || [], session.seed) : []), [survey, session.seed]);

  // Restore answers after a reload (only ids that still exist in the design).
  useEffect(() => {
    if (!survey || restored.current) return;
    restored.current = true;
    const saved = readStore(studyId);
    if (!saved) return;
    if (saved.submitted) { setSubmitted(true); return; }
    const valid = {};
    (survey.choice_sets || []).forEach((cs) => {
      const sel = saved.selections && saved.selections[cs.id];
      if (sel && (cs.profiles || []).some((p) => p.id === sel)) valid[cs.id] = sel;
    });
    setSelections(valid);
    setDemographics(saved.demographics || {});
    setRespondentEmail(saved.email || '');
    if (saved.phase === 'choice') setPhase('choice');
    const idx = Math.min(Number(saved.idx) || 0, Math.max(0, (survey.choice_sets || []).length - 1));
    setCurrentSetIndex(idx);
  }, [survey, studyId]);

  // Persist progress.
  useEffect(() => {
    if (!survey || !restored.current || submitted) return;
    writeStore(studyId, {
      ...session, selections, demographics, email: respondentEmail, phase, idx: currentSetIndex,
    });
  }, [survey, studyId, session, selections, demographics, respondentEmail, phase, currentSetIndex, submitted]);

  const handleSelect = (choiceSetId, profileId) => setSelections((s) => ({ ...s, [choiceSetId]: profileId }));

  const handleNext = () => {
    const cur = plan[currentSetIndex];
    if (!selections[cur.cs.id]) { toast.error('กรุณาเลือกคำตอบก่อนดำเนินการต่อ'); return; }
    setCurrentSetIndex((i) => i + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handlePrevious = () => {
    setCurrentSetIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return; // no double submit, however fast the taps
    if (Object.keys(selections).length !== plan.length) { toast.error('กรุณาตอบคำถามให้ครบทุกข้อ'); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Items stay in DESIGN order and carry only ids the backend reads, plus what was shown.
      const responses = (survey.choice_sets || []).map((set) => {
        const pos = plan.findIndex((x) => x.cs.id === set.id);
        return {
          choice_set_id: set.id,
          selected_profile_id: selections[set.id],
          display_task_index: pos + 1,
          display_profile_ids: plan[pos].profiles.map((p) => p.id),
        };
      });
      const res = await axios.post(`${API}/conjoint/survey/${studyId}/response`, {
        study_id: studyId,
        respondent_id: session.rid,
        respondent_email: respondentEmail || undefined,
        responses,
        demographics,
        duration_sec: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
      }, { timeout: 30000 });
      writeStore(studyId, { ...session, submitted: true, response_id: res.data?.response_id });
      setSubmitted(true);
      toast.success('ส่งคำตอบสำเร็จ! ขอบคุณที่ร่วมตอบแบบสอบถาม');
    } catch (error) {
      const d = error.response?.data?.detail;
      const msg = (typeof d === 'string' && d) || 'ส่งคำตอบไม่สำเร็จ — คำตอบของคุณยังอยู่ กดส่งอีกครั้งได้';
      setSubmitError(msg);
      toast.error(msg);
      submittingRef.current = false; // only a failure re-opens the button
    } finally {
      setSubmitting(false);
    }
  };

  const getAttributeValue = (profile, attrId) => {
    const levelId = profile.attribute_levels[attrId];
    const attr = survey.attributes.find((a) => a.id === attrId);
    return attr?.levels.find((l) => l.id === levelId);
  };

  if (loading) {
    return (
      <div className="be-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.18em' }} role="status">LOADING SURVEY…</div>
      </div>
    );
  }

  if (!survey || !plan.length) {
    return (
      <div className="be-root">
        <PublicTopbar />
        <div className="be-conjoint-page" style={{ maxWidth: 640, paddingTop: 40 }}>
          <div className="be-card" style={{ padding: 28, textAlign: 'center' }} data-testid="conjoint-survey-notfound">
            <div className="be-eyebrow" style={{ marginBottom: 14, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-red)' }} />SURVEY NOT AVAILABLE
            </div>
            <h2 className="be-h2" style={{ fontSize: 22, marginBottom: 12, fontFamily: 'IBM Plex Serif' }}>ไม่พบแบบสอบถาม</h2>
            <p className="be-small" style={{ marginBottom: 16 }}>{loadError || 'แบบสอบถามนี้ยังไม่มีชุดคำถาม'}</p>
            <div className="be-small be-muted" style={{ textAlign: 'left', lineHeight: 1.7, marginBottom: 16 }}>
              <strong>สาเหตุที่เป็นไปได้:</strong>
              <ul style={{ listStyle: 'disc', paddingLeft: 22, marginTop: 6 }}>
                <li>แบบสอบถามยังไม่เปิดรับคำตอบ</li>
                <li>ลิงก์ไม่ถูกต้อง หรือแบบสอบถามถูกลบ/ปิดแล้ว</li>
                <li>การเชื่อมต่ออินเทอร์เน็ตมีปัญหา</li>
              </ul>
            </div>
            <button type="button" onClick={() => { setLoading(true); restored.current = false; loadSurvey(); }} className="be-btn be-btn-primary" style={{ minHeight: 44 }}>
              ลองใหม่อีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="be-root">
        <PublicTopbar />
        <div className="be-conjoint-page" style={{ maxWidth: 560, paddingTop: 48 }}>
          <div className="be-card" style={{ padding: 32, textAlign: 'center' }} data-testid="conjoint-survey-thanks">
            <div style={{ width: 64, height: 64, margin: '0 auto 18px', background: 'var(--be-green)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <CheckCircle className="w-10 h-10" />
            </div>
            <h1 className="be-h1" style={{ fontSize: 30, marginBottom: 10, fontFamily: 'IBM Plex Serif' }}>ขอบคุณ!</h1>
            <p className="be-muted be-small">ส่งคำตอบเรียบร้อยแล้ว — คำตอบของคุณจะถูกนำไปวิเคราะห์เพื่อประโยชน์ในการวิจัยเท่านั้น</p>
            <button
              type="button"
              className="be-btn be-small"
              style={{ marginTop: 22, minHeight: 44 }}
              onClick={() => { clearStore(studyId); window.location.reload(); }}
              data-testid="conjoint-survey-restart"
            >
              เริ่มตอบใหม่ (สำหรับผู้ตอบคนถัดไปในเครื่องนี้)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const total = plan.length;
  const cur = plan[Math.min(currentSetIndex, total - 1)];
  const currentSet = cur.cs;
  const progress = ((currentSetIndex + 1) / total) * 100;
  const isLastSet = currentSetIndex === total - 1;
  const demoFields = survey.demographics_to_capture || [];
  const showDemo = phase === 'intro' && demoFields.length > 0;
  const n = cur.profiles.length;
  const answered = Object.keys(selections).length;

  if (showDemo) {
    return (
      <div className="be-root">
        <PublicTopbar />
        <div className="be-conjoint-page" style={{ maxWidth: 720 }}>
          <Card className="p-4 sm:p-6 mb-4 bg-white border-2 border-blue-300">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 mb-1" style={{ fontFamily: 'IBM Plex Serif' }}>{survey.title}</h1>
            {survey.description && <p className="text-gray-700 text-sm">{survey.description}</p>}
            <p className="text-xs text-gray-500 mt-3">ใช้เวลาประมาณ {Math.max(2, Math.round((total * 25) / 60))} นาที · {total} ข้อ · ไม่มีคำตอบถูกหรือผิด</p>
          </Card>
          <ConjointDemographicsStep
            fields={demoFields}
            value={demographics}
            onChange={setDemographics}
            onContinue={(v) => { setDemographics(v); setPhase('choice'); }}
          />
        </div>
      </div>
    );
  }

  const gridCols = n >= 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : n === 3 ? 'grid-cols-1 md:grid-cols-3' : n === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1';

  return (
    <div className="be-root" data-testid="conjoint-survey-root">
      <PublicTopbar />
      <div className="be-conjoint-page" style={{ maxWidth: 1100, paddingBottom: 110 }}>
        {/* Header + progress */}
        <Card className="p-4 sm:p-6 mb-4 bg-white border-2 border-blue-300">
          <h1 className="text-xl sm:text-3xl font-black text-gray-900 mb-1">{survey.title}</h1>
          {survey.description && currentSetIndex === 0 && <p className="text-gray-700 text-sm mb-2">{survey.description}</p>}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="be-mono be-tiny" style={{ color: 'var(--ink-2)', letterSpacing: '0.10em' }} data-testid="conjoint-survey-step">
                ข้อ {currentSetIndex + 1} จาก {total}
              </span>
              <span className="be-mono be-tiny" style={{ color: 'var(--ink)', fontWeight: 600 }}>ตอบแล้ว {answered}/{total}</span>
            </div>
            <div style={{ width: '100%', height: 10, background: 'var(--rule)', border: '1px solid var(--rule-strong)' }}
                 role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={currentSetIndex + 1}>
              <div data-testid="conjoint-survey-progress-fill" style={{ height: '100%', width: `${progress}%`, background: 'var(--ink)', transition: 'width 300ms ease-out' }} />
            </div>
          </div>
        </Card>

        {/* Question */}
        <Card className="p-3 sm:p-6 mb-4 bg-white border-2 border-gray-300">
          <h2 className="text-lg sm:text-xl font-black text-gray-900 mb-1">หากมีทางเลือกต่อไปนี้ คุณจะเลือกแบบไหน?</h2>
          <p className="text-xs text-gray-500 mb-4">เลือก 1 ตัวเลือกที่คุณชอบที่สุด — แตะที่การ์ดหรือปุ่ม “เลือกตัวเลือกนี้”</p>

          <div className={`grid gap-3 sm:gap-4 ${gridCols}`} role="radiogroup" aria-label="ตัวเลือก">
            {cur.profiles.map((profile, idx) => {
              const isSelected = selections[currentSet.id] === profile.id;
              const hasProfileImage = profile.profile_image_url;
              const letter = String.fromCharCode(65 + idx);
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(currentSet.id, profile.id)}
                  data-testid={`profile-card-${profile.id}`}
                  data-selected={isSelected}
                  data-position={idx}
                  style={{
                    position: 'relative', padding: 14, paddingTop: 18,
                    background: isSelected ? 'var(--paper-2)' : 'var(--surface)',
                    border: isSelected ? '3px solid var(--ink)' : '1px solid var(--rule-strong)',
                    borderRadius: 0, textAlign: 'left', cursor: 'pointer',
                    transition: 'background 180ms ease, border-color 180ms ease',
                    boxShadow: isSelected ? '0 8px 24px -8px rgba(10, 10, 10, 0.18)' : 'none',
                    fontFamily: 'inherit', color: 'var(--ink)', textTransform: 'none', letterSpacing: 'normal',
                    fontWeight: 'normal', fontSize: 'inherit', display: 'flex', flexDirection: 'column', minHeight: 64,
                  }}
                >
                  {isSelected && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: 'var(--be-gold)' }} />}
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
                    ตัวเลือก {letter}
                  </div>

                  {hasProfileImage ? (
                    <div className="mb-3 w-full aspect-square">
                      <img src={profile.profile_image_url} alt={`ตัวเลือก ${letter}`} loading="lazy"
                           style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid var(--rule)' }}
                           onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  ) : null}

                  <div style={{ flex: 1 }}>
                    {survey.attributes.map((attr) => {
                      const level = getAttributeValue(profile, attr.id);
                      const levelImageUrl = profile.images?.[attr.id] || level?.image_url;
                      return (
                        <div key={attr.id} style={{ padding: '8px 0', borderTop: '1px solid var(--rule)' }}>
                          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 2 }}>{attr.name}</div>
                          {!hasProfileImage && levelImageUrl && (
                            <div className="w-full aspect-square mb-2">
                              <img src={levelImageUrl} alt={level?.value || attr.name} loading="lazy"
                                   style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                   onError={(e) => { e.target.style.display = 'none'; }} />
                            </div>
                          )}
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{level?.value}</div>
                          {level?.description && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{level.description}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Select affordance — a real-looking button, >= 48px tall */}
                  <div
                    aria-hidden="true"
                    style={{
                      marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      minHeight: 48, padding: '10px 12px',
                      background: isSelected ? 'var(--ink)' : 'transparent',
                      color: isSelected ? 'var(--paper)' : 'var(--ink)',
                      border: '2px solid var(--ink)', fontSize: 15, fontWeight: 700,
                    }}
                  >
                    {isSelected ? <><CheckCircle className="w-5 h-5" /><span>เลือกแล้ว</span></> : <span>เลือกตัวเลือกนี้</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {isLastSet && (
          <Card className="p-3 sm:p-4 mb-4 bg-white border-2 border-gray-200">
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="cj-email">อีเมล (ไม่บังคับ)</label>
            <input
              id="cj-email" type="email" inputMode="email" autoComplete="email"
              value={respondentEmail} onChange={(e) => setRespondentEmail(e.target.value)}
              placeholder="ใส่เฉพาะเมื่ออยากรับผลสรุป"
              className="w-full p-3 border-2 border-gray-300 rounded-lg text-base"
              data-testid="conjoint-survey-email"
            />
            {submitError && <p className="mt-2 text-sm text-red-600" role="alert" data-testid="conjoint-survey-submit-error">{submitError}</p>}
          </Card>
        )}
      </div>

      {/* Sticky navigation (thumb reach on phones) */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: 'var(--paper)', borderTop: '2px solid var(--ink)', padding: '10px 12px calc(10px + env(safe-area-inset-bottom))' }} data-testid="conjoint-survey-nav">
        <div className="flex items-center justify-between gap-3" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Button onClick={handlePrevious} disabled={currentSetIndex === 0 || submitting} variant="outline" className="min-h-[48px] px-4" data-testid="conjoint-survey-prev">
            <ChevronLeft className="w-5 h-5 mr-1" /> ย้อนกลับ
          </Button>
          {isLastSet ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting || answered !== total}
              className="flex-1 sm:flex-none sm:min-w-[220px] min-h-[48px] bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold text-base"
              data-testid="conjoint-survey-submit"
            >
              {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />กำลังส่ง…</> : <><Send className="w-5 h-5 mr-2" />ส่งคำตอบ</>}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!selections[currentSet.id]}
              className="flex-1 sm:flex-none sm:min-w-[180px] min-h-[48px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base"
              data-testid="conjoint-survey-next"
            >
              ถัดไป <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConjointSurveyPage;

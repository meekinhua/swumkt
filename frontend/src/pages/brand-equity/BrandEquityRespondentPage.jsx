import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import './brand-equity-styles.css';
import { Icon, BeLoading, BrandLogo, SWU_LOGO_URL } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const QuestionInput = ({ q, value, onChange, lang = 'th', T }) => {
  const scaleLeftLbl = lang === 'en' ? (T?.leftLabel || 'Lowest') : (T?.leftLabel || 'น้อยสุด');
  const scaleRightLbl = lang === 'en' ? (T?.rightLabel || 'Highest') : (T?.rightLabel || 'มากสุด');
  const scale = lang === 'en' && q.scale_en ? q.scale_en : q.scale;
  if (q.type === 'likert_5' || q.type === 'likert_7') {
    const max = q.type === 'likert_5' ? 5 : 7;
    return (
      <>
        <div className="be-resp-likert" data-testid={`be-resp-q-${q.id}`}>
          {Array.from({ length: max }, (_, i) => i + 1).map(n => (
            <button key={n} className={value === n ? 'sel' : ''} onClick={() => onChange(n)}
                    data-testid={`be-resp-likert-${q.id}-${n}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="be-resp-likert-labels">
          <span>{scale?.[0] || scaleLeftLbl}</span>
          <span>{scale?.[max - 1] || scaleRightLbl}</span>
        </div>
      </>
    );
  }
  if (q.type === 'nps_0_10') {
    return (
      <>
        <div className="be-resp-nps-grid" data-testid={`be-resp-q-${q.id}`}>
          {Array.from({ length: 11 }, (_, i) => i).map(n => (
            <button key={n} className={value === n ? 'sel' : ''} onClick={() => onChange(n)}
                    data-testid={`be-resp-nps-${q.id}-${n}`}>{n}</button>
          ))}
        </div>
        <div className="be-resp-likert-labels">
          <span>{lang === 'en' ? '0 · would not recommend' : '0 · ไม่แนะนำเลย'}</span>
          <span>{lang === 'en' ? '10 · definitely recommend' : '10 · แนะนำแน่นอน'}</span>
        </div>
      </>
    );
  }
  if (q.type === 'comparative_7') {
    const sl = (lang === 'en' && q.scale_left_en) ? q.scale_left_en : q.scale_left;
    const sr = (lang === 'en' && q.scale_right_en) ? q.scale_right_en : q.scale_right;
    return (
      <>
        <div className="be-resp-likert-labels" style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 500 }}>1 · {sl || (lang === 'en' ? 'Left is better' : 'ซ้ายดีกว่า')}</span>
          <span className="be-muted" style={{ fontSize: 11 }}>{lang === 'en' ? '4 · Equal' : '4 · เท่ากัน'}</span>
          <span style={{ fontWeight: 500, textAlign: 'right' }}>7 · {sr || (lang === 'en' ? 'Right is better' : 'ขวาดีกว่า')}</span>
        </div>
        <div className="be-resp-comparative" data-testid={`be-resp-q-${q.id}`}>
          {Array.from({ length: 7 }, (_, i) => i + 1).map(n => (
            <button key={n} className={value === n ? 'sel' : ''} onClick={() => onChange(n)}
                    data-testid={`be-resp-comp-${q.id}-${n}`}>{n}</button>
          ))}
        </div>
      </>
    );
  }
  if (q.type === 'mcq_single') {
    const opts = q.options || [];
    const optsLocalized = (lang === 'en' && q.options_en) ? q.options_en
                       : (lang === 'th' && q.options_th) ? q.options_th
                       : opts;
    return (
      <div className="be-resp-mcq" data-testid={`be-resp-q-${q.id}`}>
        {opts.map((opt, idx) => (
          <div key={opt} className={'be-resp-mcq-opt ' + (value === opt ? 'sel' : '')}
               onClick={() => onChange(opt)} data-testid={`be-resp-mcq-${q.id}-${opt}`}>
            <div className="check">{value === opt && <Icon name="check" size={10}/>}</div>
            <span>{optsLocalized[idx] || opt}</span>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'mcq_multi') {
    const arr = Array.isArray(value) ? value : [];
    const opts = q.options || [];
    const optsLocalized = (lang === 'en' && q.options_en) ? q.options_en
                       : (lang === 'th' && q.options_th) ? q.options_th
                       : opts;
    return (
      <div className="be-resp-mcq" data-testid={`be-resp-q-${q.id}`}>
        {opts.map((opt, idx) => {
          const sel = arr.includes(opt);
          return (
            <div key={opt} className={'be-resp-mcq-opt ' + (sel ? 'sel' : '')}
                 onClick={() => onChange(sel ? arr.filter(x => x !== opt) : [...arr, opt])}
                 data-testid={`be-resp-mcq-${q.id}-${opt}`}>
              <div className="check">{sel && <Icon name="check" size={10}/>}</div>
              <span>{optsLocalized[idx] || opt}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'trait_grid') {
    const arr = Array.isArray(value) ? value : [];
    const min = q.min || 3, max = q.max || 5;
    const atMax = arr.length >= max;
    const opts = q.options || [];
    const optsLocalized = (lang === 'en' && q.options_en) ? q.options_en
                       : (lang === 'th' && q.options_th) ? q.options_th
                       : opts;
    return (
      <>
        <div className="be-resp-trait-grid" data-testid={`be-resp-q-${q.id}`}>
          {opts.map((opt, idx) => {
            const sel = arr.includes(opt);
            const dimmed = atMax && !sel;
            return (
              <div key={opt}
                   className={'be-resp-trait ' + (sel ? 'sel' : '')}
                   style={dimmed ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                   onClick={() => {
                     if (sel) onChange(arr.filter(x => x !== opt));
                     else if (!atMax) onChange([...arr, opt]);
                     else toast.info(lang === 'en' ? `You can choose up to ${max} — tap a selected one to swap` : `เลือกได้สูงสุด ${max} คำ — กดคำที่เลือกไว้เพื่อเปลี่ยนได้`);
                   }}
                   data-testid={`be-resp-trait-${q.id}-${opt}`}>
                {optsLocalized[idx] || opt}
              </div>
            );
          })}
        </div>
        <div className="be-resp-likert-labels" style={{ marginTop: 8 }}>
          <span>{lang === 'en' ? `Selected ${arr.length} / ${max}` : `เลือกแล้ว ${arr.length} / ${max}`}</span>
          <span>
            {atMax
              ? (lang === 'en' ? 'Limit reached — tap one to change' : 'ครบจำนวนแล้ว (กดซ้ำเพื่อเปลี่ยน)')
              : (lang === 'en' ? `(min ${min})` : `(อย่างน้อย ${min})`)}
          </span>
        </div>
      </>
    );
  }
  if (q.type === 'open_short') {
    return <input className="be-input" value={value || ''} onChange={e => onChange(e.target.value)}
                  placeholder={lang === 'en' ? 'Type a short answer' : 'พิมพ์คำตอบสั้นๆ'}
                  data-testid={`be-resp-q-${q.id}`}/>;
  }
  if (q.type === 'open_long') {
    return <textarea className="be-textarea" value={value || ''} onChange={e => onChange(e.target.value)}
                     placeholder={lang === 'en' ? 'Share your thoughts — the more detail the better' : 'พิมพ์คำตอบ — ยิ่งละเอียดยิ่งดี'}
                     style={{ minHeight: 100 }} data-testid={`be-resp-q-${q.id}`}/>;
  }
  return null;
};

const BrandEquityRespondentPage = () => {
  const { token } = useParams();
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState(-1); // -1 = welcome, 0..sections.length-1 = question pages, sections.length = demographics, sections.length+1 = thank you
  const [answers, setAnswers] = useState({});
  const [demographics, setDemographics] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [startedAt] = useState(Date.now());
  const [savedDraft, setSavedDraft] = useState(null); // resume prompt on the welcome screen
  const [serverDraftId, setServerDraftId] = useState(null);
  const [resumeLinkCopied, setResumeLinkCopied] = useState(false);
  const DRAFT_KEY = `be_draft_${token}`;
  const DRAFT_ID_KEY = `be_draft_id_${token}`;

  // Smooth scroll to top when moving between survey sections on mobile & desktop
  useEffect(() => {
    if (section >= 0 && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [section]);

  // Save progress locally on every change. The survey is 40+ items on a phone;
  // a lost tab, a phone call or a browser refresh used to mean starting over.
  useEffect(() => {
    if (!study || section < 0 || section > 5) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        answers, demographics, section, saved_at: Date.now(),
      }));
    } catch { /* private mode / quota — progress just is not saved */ }
    /* eslint-disable-next-line */
  }, [answers, demographics, section]);

  // ...and to the SERVER, debounced. Local storage is tied to one browser on one
  // device; a resume link works from anywhere and lets the study owner see who
  // started but never finished.
  useEffect(() => {
    if (!study || section < 0 || section > 5) return;
    const payload = Object.entries(answers).map(([question_id, value]) => ({ question_id, value }));
    if (!payload.length) return;
    const t = setTimeout(() => {
      axios.post(`${API}/brand-equity/public/${token}/draft`, {
        draft_id: serverDraftId, answers: payload, demographics, section,
      }).then(r => {
        if (r.data?.draft_id && r.data.draft_id !== serverDraftId) {
          setServerDraftId(r.data.draft_id);
          try { localStorage.setItem(DRAFT_ID_KEY, r.data.draft_id); } catch { /* ignore */ }
        }
      }).catch(() => { /* offline or private mode — local copy still holds */ });
    }, 1500);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [answers, demographics, section]);

  // Resume link in the URL (?draft=<id>) wins over the local copy: it is how a
  // respondent moves from phone to laptop.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const did = params.get('draft') || (() => {
      try { return localStorage.getItem(DRAFT_ID_KEY); } catch { return null; }
    })();
    if (!did) return;
    setServerDraftId(did);
    if (!params.get('draft')) return;   // only auto-load when the link was used
    axios.get(`${API}/brand-equity/public/${token}/draft/${did}`)
      .then(r => {
        const d = r.data || {};
        const asObj = {};
        (d.answers || []).forEach(a => { asObj[a.question_id] = a.value; });
        if (Object.keys(asObj).length) {
          setAnswers(asObj);
          setDemographics(d.demographics || {});
          setSection(Math.min(5, Math.max(0, d.section ?? 0)));
          toast.success(
            lang === 'en'
              ? `Restored ${Object.keys(asObj).length} saved answer(s)`
              : `กู้คำตอบที่ทำไว้ ${Object.keys(asObj).length} ข้อกลับมาแล้ว`
          );
        }
      })
      .catch(() => { /* stale link — respondent just starts fresh */ });
    /* eslint-disable-next-line */
  }, [token]);

  // Look for a draft once the study is known, so the welcome screen can offer it.
  useEffect(() => {
    if (!study) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const answered = Object.keys(d?.answers || {}).length;
      // Ignore anything older than 7 days or with nothing in it.
      if (!answered || Date.now() - (d.saved_at || 0) > 7 * 24 * 3600 * 1000) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setSavedDraft({ ...d, answered });
    } catch { /* ignore */ }
    /* eslint-disable-next-line */
  }, [study]);

  const resumeDraft = () => {
    if (!savedDraft) return;
    setAnswers(savedDraft.answers || {});
    setDemographics(savedDraft.demographics || {});
    setSection(Math.min(5, Math.max(0, savedDraft.section ?? 0)));
    setSavedDraft(null);
  };
  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_ID_KEY);
    } catch { /* ignore */ }
    if (serverDraftId) {
      axios.delete(`${API}/brand-equity/public/${token}/draft/${serverDraftId}`).catch(() => {});
      setServerDraftId(null);
    }
    setSavedDraft(null);
  };
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('be_lang') || 'th'; } catch { return 'th'; }
  });
  const setLangPersist = (l) => {
    setLang(l);
    try { localStorage.setItem('be_lang', l); } catch { /* ignore */ }
  };
  // helper to pick localized field with fallback
  const tx = (q, base) => (lang === 'en' ? q[base + '_en'] : q[base + '_th']) || q[base];

  useEffect(() => { loadStudy(); /* eslint-disable-next-line */ }, [token]);

  const loadStudy = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/public/${token}`);
      setStudy(r.data);
    } catch (e) {
      setError(
        e.response?.data?.detail ||
          (lang === 'en' ? 'Survey is not currently accepting responses' : 'แบบสอบถามยังไม่พร้อมรับคำตอบ')
      );
    }
    setLoading(false);
  };

  const dims = ['awareness', 'quality', 'identity', 'loyalty'];
  const dimLabels = lang === 'en' ? {
    awareness: 'Brand awareness & recall',
    quality:   'Perceived quality & value',
    identity:  'Brand image & personality',
    loyalty:   'Brand loyalty & recommendation',
  } : {
    awareness: 'ความรู้จักและการนึกถึงแบรนด์',
    quality:   'คุณภาพและความคุ้มค่าที่รับรู้',
    identity:  'ภาพลักษณ์และตัวตนแบรนด์',
    loyalty:   'ความผูกพันและการบอกต่อ',
  };
  const T = lang === 'en' ? {
    untilNext: 'Next', back: 'Back', submit: 'Submit', sending: 'Sending…',
    start: 'Start survey', recorded: 'RESPONSE RECORDED', thanks: 'Thank you!',
    thanksBody: (b) => <>Your response helps <strong>{b}</strong> understand its brand health.</>,
    progress: (a, b, n, t) => `Section ${a} / ${b} · ${n} / ${t}`,
    aboutYou: 'About you', aboutYouDesc: 'Used for grouped analysis only — anonymous',
    welcomeAsk: (m) => <>Please give us <strong>{m} minutes</strong> — answer honestly to help us improve.</>,
    welcomeWhat: "WHAT YOU'LL DO",
    finalSection: 'FINAL SECTION',
    selected: 'selected', minimum: 'minimum',
    leftLabel: 'Lowest', rightLabel: 'Highest',
  } : {
    untilNext: 'ถัดไป', back: 'ย้อน', submit: 'ส่งคำตอบ', sending: 'กำลังส่ง…',
    start: 'เริ่มทำแบบสอบถาม', recorded: 'บันทึกคำตอบเรียบร้อย', thanks: 'ขอบคุณครับ/ค่ะ!',
    thanksBody: (b) => <>คำตอบของคุณช่วยให้ <strong>{b}</strong> พัฒนาสินค้าและบริการได้ดียิ่งขึ้น</>,
    progress: (a, b, n, t) => `ส่วนที่ ${a} / ${b} · ตอบแล้ว ${n} / ${t}`,
    aboutYou: 'ข้อมูลเพิ่มเติมเกี่ยวกับคุณ', aboutYouDesc: 'ใช้เพื่อวิเคราะห์ภาพรวมรายกลุ่มเท่านั้น · ไม่ระบุตัวตน',
    welcomeAsk: (m) => <>ขอเวลาประมาณ <strong>{m} นาที</strong> — ตอบตามความคิดเห็นจริง ไม่มีคำตอบถูกหรือผิด</>,
    welcomeWhat: 'ขั้นตอนการตอบ',
    finalSection: 'ส่วนสุดท้าย',
    selected: 'เลือกแล้ว', minimum: 'อย่างน้อย',
    leftLabel: 'น้อยสุด', rightLabel: 'มากสุด',
  };

  if (loading) return <div className="be-root"><BeLoading text={lang === 'en' ? 'Loading survey…' : 'กำลังโหลดแบบสอบถาม…'}/></div>;
  if (error) {
    return (
      <div className="be-root">
        <div className="be-resp-wrap">
          <div className="be-card" style={{ marginTop: 60, textAlign: 'center' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-red)' }}>
              {lang === 'en' ? 'SURVEY UNAVAILABLE' : 'แบบสอบถามปิดรับหรือยังไม่ได้เปิด'}
            </div>
            <div className="be-h3" style={{ marginTop: 14 }}>{error}</div>
            <div className="be-muted be-small" style={{ marginTop: 10 }}>
              {lang === 'en' ? 'Please contact the person who shared this link.' : 'กรุณาติดต่อผู้ส่งลิงก์เพื่อขอลิงก์ที่เปิดใช้งานอยู่'}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!study) return null;

  const questionsByDim = dims.reduce((acc, d) => {
    acc[d] = (study.questions || []).filter(q => q.dimension === d);
    return acc;
  }, {});
  // Isolate Unaided Awareness (AW-1 / AW-2) on its own blind first page before Aided Awareness
  // so respondents cannot scroll down and see the focal brand before recalling top-of-mind brands.
  const unaidedAwarenessQs = questionsByDim.awareness.filter(
    q => q.template_id === 'AW-1' || q.template_id === 'AW-2' || q.code === 'AW-1' || q.code === 'AW-2' || q.subdimension === 'unaided' || q.ai_processing === 'extract_brand'
  );
  const aidedAwarenessQs = questionsByDim.awareness.filter(q => !unaidedAwarenessQs.includes(q));
  const sections = [
    ...(unaidedAwarenessQs.length > 0 ? [{
      key: 'awareness-unaided',
      dim: 'awareness',
      blindFocal: true,
      label: lang === 'en' ? 'Brand recall (Unaided)' : 'การนึกถึงแบรนด์ (ตอบอิสระ)',
      questions: unaidedAwarenessQs,
    }] : []),
    ...(aidedAwarenessQs.length > 0 ? [{
      key: 'awareness-aided',
      dim: 'awareness',
      blindFocal: false,
      label: lang === 'en' ? 'Brand recognition & familiarity' : 'ความรู้จักและคุ้นเคยแบรนด์',
      questions: aidedAwarenessQs,
    }] : []),
    ...['quality', 'identity', 'loyalty'].map(d => ({
      key: d,
      dim: d,
      blindFocal: false,
      label: dimLabels[d],
      questions: questionsByDim[d] || [],
    })),
  ];
  const demoSectionIndex = sections.length;
  const thanksSectionIndex = sections.length + 1;
  const totalQ = (study.questions || []).length;
  const answered = Object.keys(answers).length;
  // Honest 15-25s per item planning range (matching Wizard estimate)
  const timeLo = Math.max(1, Math.ceil(totalQ * 15 / 60));
  const timeHi = Math.max(timeLo + 1, Math.ceil(totalQ * 25 / 60));
  const timeEstimate = `${timeLo}–${timeHi}`;

  // Lang toggle pill — shown on every screen
  const LangToggle = () => (
    <div data-testid="be-resp-lang-toggle" className="be-mono be-tiny"
         style={{ display: 'inline-flex', border: '1px solid var(--rule-strong)' }}>
      {['th', 'en'].map(l => (
        <button key={l} onClick={() => setLangPersist(l)}
                data-testid={`be-resp-lang-${l}`}
                style={{ padding: '4px 10px', fontSize: 11, letterSpacing: '0.08em',
                         background: lang === l ? 'var(--ink)' : 'transparent',
                         color: lang === l ? 'var(--paper)' : 'var(--ink)',
                         border: 0, cursor: 'pointer', textTransform: 'uppercase' }}>
          {l}
        </button>
      ))}
    </div>
  );

  // Public top bar — keeps the survey visually anchored to the SWU MKT system
  const PublicTopbar = () => (
    <div className="be-public-topbar" data-testid="be-resp-topbar">
      <div className="be-public-brand">
        <img src={SWU_LOGO_URL} alt="SWUMKT Logo" className="be-public-logo"/>
        <span className="be-public-text">
          <span className="be-public-name">SWU · Marketing Research</span>
          <span className="be-public-sub be-mono">BRAND HEALTH CHECK · ANONYMOUS</span>
        </span>
      </div>
      <LangToggle/>
    </div>
  );

  // Welcome screen — hide focal brand name & logo to prevent priming before Unaided Awareness (AW-1 / AW-2)
  if (section === -1) {
    const catName = study.brand?.category || (lang === 'en' ? 'Consumer Brand' : 'สินค้าและบริการ');
    return (
      <div className="be-root" data-testid="be-respondent-page">
        <PublicTopbar/>
        <div className="be-resp-wrap">
          <div style={{ paddingTop: 20 }}>
            <div className="be-eyebrow" style={{ marginBottom: 16 }}>
              <span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>
              BRAND PERCEPTION SURVEY
            </div>
            <h1 className="be-h1" style={{ fontSize: 32, marginBottom: 16 }}>
              {lang === 'en' ? `Consumer Survey · ${catName}` : `แบบสำรวจความคิดเห็นหมวด ${catName}`}
            </h1>
            <div className="be-muted" style={{ marginBottom: 24, lineHeight: 1.7 }}>
              {T.welcomeAsk(timeEstimate)}
            </div>
            <div className="be-card" style={{ background: 'var(--paper-2)' }}>
              <div className="be-eyebrow" style={{ marginBottom: 10 }}>{T.welcomeWhat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div>{lang === 'en'
                       ? <>{totalQ} questions · {sections.length} short sections · no right or wrong answers</>
                       : <>{totalQ} คำถาม · แบ่งเป็น {sections.length} ส่วนสั้นๆ · ไม่มีคำตอบถูกหรือผิด</>}</div>
                <div>{lang === 'en'
                       ? <>Responses are <strong>anonymous</strong> — no email or name collected</>
                       : <>คำตอบเป็น <strong>ความลับและไม่ระบุตัวตน</strong> — ไม่เก็บชื่อหรืออีเมล</>}</div>
              </div>
            </div>
            {savedDraft && (
              <div className="be-card" data-testid="be-resume-draft"
                   style={{ marginTop: 16, borderColor: 'var(--be-red)', background: 'rgba(200,16,46,0.04)' }}>
                <div className="be-eyebrow" style={{ marginBottom: 8 }}>
                  <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>
                  {lang === 'en' ? 'UNFINISHED RESPONSE' : 'มีคำตอบที่ค้างไว้'}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {lang === 'en'
                    ? <>You answered <strong>{savedDraft.answered}</strong> question(s) on this device before —
                        continue where you left off?</>
                    : <>เครื่องนี้ตอบไว้แล้ว <strong>{savedDraft.answered}</strong> ข้อ — ทำต่อจากที่ค้างไว้ไหม?</>}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="be-btn be-btn-red" onClick={resumeDraft} data-testid="be-resume-continue">
                    {lang === 'en' ? 'Continue' : 'ทำต่อ'}<Icon name="arrowR" size={11}/>
                  </button>
                  <button className="be-btn be-btn-ghost" onClick={discardDraft} data-testid="be-resume-discard">
                    {lang === 'en' ? 'Start over' : 'เริ่มใหม่'}
                  </button>
                </div>
              </div>
            )}
            <button className="be-btn be-btn-red be-btn-lg" style={{ width: '100%', marginTop: 24, justifyContent: 'center' }}
                    onClick={() => setSection(0)} data-testid="be-respondent-start">
              {T.start}<Icon name="arrowR" size={12}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Demographics screen (last) — store canonical English keys so TH & EN responses merge cleanly
  if (section === demoSectionIndex) {
    const segs = study.segments_to_capture || [];
    const segConfig = {
      age: {
        label: lang === 'en' ? 'Age' : 'ช่วงอายุ',
        options: [
          { value: '<18', label: '<18' }, { value: '18-24', label: '18-24' },
          { value: '25-34', label: '25-34' }, { value: '35-44', label: '35-44' },
          { value: '45-54', label: '45-54' }, { value: '55+', label: '55+' },
        ],
      },
      gender: {
        label: lang === 'en' ? 'Gender' : 'เพศ',
        options: [
          { value: 'female', label: lang === 'en' ? 'Female' : 'หญิง' },
          { value: 'male', label: lang === 'en' ? 'Male' : 'ชาย' },
          { value: 'other', label: lang === 'en' ? 'Other' : 'อื่นๆ' },
          { value: 'prefer_not_to_say', label: lang === 'en' ? 'Prefer not to say' : 'ไม่ระบุ' },
        ],
      },
      region: {
        label: lang === 'en' ? 'Region' : 'ภูมิภาคที่อาศัย',
        options: [
          { value: 'bangkok', label: lang === 'en' ? 'Bangkok & Metro' : 'กรุงเทพฯ และปริมณฑล' },
          { value: 'central', label: lang === 'en' ? 'Central' : 'ภาคกลาง' },
          { value: 'north', label: lang === 'en' ? 'North' : 'ภาคเหนือ' },
          { value: 'northeast', label: lang === 'en' ? 'Northeast' : 'ภาคตะวันออกเฉียงเหนือ' },
          { value: 'south', label: lang === 'en' ? 'South' : 'ภาคใต้' },
          { value: 'east', label: lang === 'en' ? 'East' : 'ภาคตะวันออก' },
        ],
      },
      occupation: {
        label: lang === 'en' ? 'Occupation' : 'อาชีพ',
        options: [
          { value: 'student', label: lang === 'en' ? 'Student' : 'นักเรียน / นิสิตนักศึกษา' },
          { value: 'employee', label: lang === 'en' ? 'Employee' : 'พนักงานบริษัท / ข้าราชการ' },
          { value: 'freelancer', label: lang === 'en' ? 'Freelancer' : 'ฟรีแลนซ์ / อาชีพอิสระ' },
          { value: 'business_owner', label: lang === 'en' ? 'Business owner' : 'เจ้าของกิจการ' },
          { value: 'other', label: lang === 'en' ? 'Other' : 'อื่นๆ' },
        ],
      },
      income: {
        label: lang === 'en' ? 'Monthly income' : 'รายได้ต่อเดือน',
        options: [
          { value: '<15K', label: '<15K' }, { value: '15-30K', label: '15-30K' },
          { value: '30-50K', label: '30-50K' }, { value: '50-100K', label: '50-100K' },
          { value: '100K+', label: '100K+' },
        ],
      },
      usage_frequency: {
        label: lang === 'en' ? 'Usage frequency' : 'ความถี่ในการใช้สินค้า/บริการหมวดนี้',
        options: [
          { value: 'daily', label: lang === 'en' ? 'Daily' : 'ทุกวัน' },
          { value: 'weekly', label: lang === 'en' ? 'Weekly' : 'รายสัปดาห์' },
          { value: 'monthly', label: lang === 'en' ? 'Monthly' : 'รายเดือน' },
          { value: 'rarely', label: lang === 'en' ? 'Rarely' : 'นานๆ ครั้ง' },
          { value: 'never', label: lang === 'en' ? 'Never' : 'ไม่เคยใช้' },
        ],
      },
    };
    return (
      <div className="be-root" data-testid="be-respondent-demographics">
        <PublicTopbar/>
        <div className="be-resp-wrap">
          <div style={{ paddingTop: 16 }}>
            <div className="be-eyebrow" style={{ marginBottom: 12 }}>{T.finalSection}</div>
            <h2 className="be-h2" style={{ fontSize: 22, marginBottom: 6 }}>{T.aboutYou}</h2>
            <div className="be-muted be-small" style={{ marginBottom: 20 }}>
              {T.aboutYouDesc}
            </div>
            {segs.map(s => {
              const c = segConfig[s];
              if (!c) return null;
              return (
                <div className="be-resp-q" key={s}>
                  <div className="be-resp-q-prompt" style={{ fontSize: 16 }}>{c.label}</div>
                  <div className="be-resp-mcq">
                    {c.options.map(opt => {
                      const isSel = demographics[s] === opt.value || demographics[s] === opt.label;
                      return (
                        <div key={opt.value}
                             className={'be-resp-mcq-opt ' + (isSel ? 'sel' : '')}
                             onClick={() => setDemographics(prev => {
                               const next = { ...prev };
                               if (next[s] === opt.value || next[s] === opt.label) delete next[s];
                               else next[s] = opt.value;
                               return next;
                             })}
                             data-testid={`be-resp-demo-${s}-${opt.value}`}>
                          <div className="check">{isSel && <Icon name="check" size={10}/>}</div>
                          <span>{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {demographics[s] && (
                    <button className="be-btn be-btn-ghost be-tiny" style={{ marginTop: 8 }}
                            onClick={() => setDemographics(prev => {
                              const next = { ...prev }; delete next[s]; return next;
                            })}
                            data-testid={`be-resp-demo-clear-${s}`}>
                      {lang === 'en' ? 'Clear' : 'ล้างคำตอบนี้'}
                    </button>
                  )}
                </div>
              );
            })}
            <div className="be-resp-foot">
              <button className="be-btn be-btn-ghost" onClick={() => setSection(Math.max(0, demoSectionIndex - 1))}
                      data-testid="be-respondent-demo-back">
                <Icon name="chevronL" size={11}/>{' '}{T.back}
              </button>
              <button className="be-btn be-btn-red"
                      onClick={submit} disabled={submitting} data-testid="be-respondent-submit">
                {submitting ? T.sending : T.submit}{' '}<Icon name="check" size={12}/>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Thank you
  if (section === thanksSectionIndex) {
    return (
      <div className="be-root" data-testid="be-respondent-thanks">
        <PublicTopbar/>
        <div className="be-resp-wrap">
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <div className="be-eyebrow" style={{ marginBottom: 16, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-green)' }}/>{T.recorded}
            </div>
            <h1 className="be-h1" style={{ fontSize: 32 }}>{T.thanks} 🙏</h1>
            <div className="be-muted" style={{ marginTop: 14 }}>
              {T.thanksBody(study.brand?.name)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question section
  const currentSection = sections[section] || sections[sections.length - 1] || { key: 'empty', dim: 'awareness', blindFocal: true, label: '', questions: [] };
  const sectionQs = currentSection.questions || [];
  const familiarityQ = (questionsByDim.awareness || []).find(
    q => q.template_id === 'AW-4' || q.kind === 'brand_familiarity'
  );
  const isUnawareOfBrand = familiarityQ && Number(answers[familiarityQ.id]) === 1;
  const isEffectiveRequired = (q) => Boolean(q.required) && !(isUnawareOfBrand && q.template_id === 'LY-4');

  const isAnswered = (q) => {
    const v = answers[q.id];
    if (v == null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (q.type === 'trait_grid' && Array.isArray(v) && v.length < (q.min || 3)) return false;
    return true;
  };
  const missingQs = sectionQs.filter(q => isEffectiveRequired(q) && !isAnswered(q));
  const canProceed = missingQs.length === 0;

  // The Next button used to be `disabled` with no explanation, on a 36-question
  // required-heavy survey — the respondent had no way to know which item was
  // blocking them. It now always clicks, and says what is missing.
  const handleNext = () => {
    if (!canProceed) {
      setShowMissing(true);
      toast.error(
        lang === 'en'
          ? `${missingQs.length} required question(s) still unanswered — highlighted in red`
          : `ยังมี ${missingQs.length} ข้อที่ต้องตอบ — ทำเครื่องหมายสีแดงไว้ให้แล้ว`
      );
      const el = document.querySelector('.be-resp-q-missing');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setShowMissing(false);
    setSection(section + 1);
  };

  async function submit() {
    setSubmitting(true);
    try {
      const answersList = Object.entries(answers).map(([qid, val]) => ({ question_id: qid, value: val }));
      await axios.post(`${API}/brand-equity/public/${token}/respond`, {
        demographics,
        answers: answersList,
        duration_sec: Math.round((Date.now() - startedAt) / 1000),
        draft_id: serverDraftId,
      });
      setSection(thanksSectionIndex);
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_ID_KEY);
      } catch { /* ignore */ }
    } catch (e) {
      toast.error((lang === 'en' ? 'Failed to submit: ' : 'ส่งไม่สำเร็จ: ') + (e.response?.data?.detail || e.message));
    }
    setSubmitting(false);
  }

  return (
    <div className="be-root" data-testid="be-respondent-page">
      <PublicTopbar/>
      <div className="be-resp-wrap">
        <div className="be-resp-head">
          {currentSection.blindFocal ? (
            <>
              <div style={{ width: 32, height: 32, background: 'var(--ink)', color: 'var(--paper)',
                            display: 'grid', placeItems: 'center', fontFamily: 'IBM Plex Serif',
                            fontWeight: 600, fontSize: 15 }}>
                Q{section + 1}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontFamily: 'IBM Plex Serif', fontSize: 14 }}>
                  {study.brand?.category || (lang === 'en' ? 'Brand Survey' : 'แบบสำรวจความคิดเห็น')}
                </strong>
                <div className="be-mono be-tiny be-muted">BRAND PERCEPTION SURVEY</div>
              </div>
            </>
          ) : (
            <>
              <BrandLogo brand={study.brand} identity={study.identity} logoAsset={study.logo_asset} size={34}/>
              <div style={{ flex: 1 }}>
                <strong style={{ fontFamily: 'IBM Plex Serif', fontSize: 14 }}>{study.brand?.name}</strong>
                <div className="be-mono be-tiny be-muted">BRAND PERCEPTION SURVEY</div>
              </div>
            </>
          )}
        </div>

        <div className="be-resp-progress">
          <div className="be-resp-progress-segs">
            {sections.map((s, i) => (
              <div key={s.key} className={'s ' + (i < section ? 'done' : i === section ? 'on' : '')}/>
            ))}
          </div>
          <div className="be-resp-progress-meta">
            <span>{T.progress(section + 1, sections.length, answered, totalQ)} · {currentSection.label}</span>
            <span>{answered} / {totalQ}</span>
          </div>
        </div>

        {sectionQs.length === 0 ? (
          <div className="be-resp-q">
            <div className="be-muted be-small">{lang === 'en' ? 'No questions in this dimension' : 'ไม่มีคำถามใน dimension นี้'}</div>
          </div>
        ) : (() => {
          // === Build groups so respondents can compare brands side-by-side per topic ===
          // Strategy:
          //  1. Separate axis-tagged Likert questions (have comparison_group) into per-axis groups
          //     — each group shows brand + competitors together for the same attribute.
          //  2. Non-axis questions (open-ended, trait_grid, NPS, MCQ, comparative, visual)
          //     fall back to the previous perspective grouping for Identity, or "all" for others.
          const axisQsByGroup = {};
          const nonAxisQs = [];
          sectionQs.forEach(q => {
            const g = q.comparison_group || q.axis_label;
            if (g && (q.type === 'likert_5' || q.type === 'likert_7') && q.dimension !== 'awareness') {
              (axisQsByGroup[g] = axisQsByGroup[g] || []).push(q);
            } else {
              nonAxisQs.push(q);
            }
          });
          // Drop singleton "groups" that have only 1 question — display them without the topic header
          Object.keys(axisQsByGroup).forEach(k => {
            if (axisQsByGroup[k].length < 2) {
              nonAxisQs.push(...axisQsByGroup[k]);
              delete axisQsByGroup[k];
            }
          });

          // Non-axis grouping (plain consumer-friendly titles instead of academic Aaker jargon)
          const perspectiveOrder = lang === 'en' ? [
            { key: '_brand_image',   label: 'Overall brand impression',         match: q => q.dimension === 'identity' && !q.perspective },
            { key: 'as_organization', label: 'Trust & company reputation',       match: q => q.perspective === 'as_organization' },
            { key: 'as_person',       label: 'Brand personality',                match: q => q.perspective === 'as_person' },
            { key: 'as_symbol',       label: 'Visuals & recognizability',        match: q => q.perspective === 'as_symbol' },
            { key: 'as_product',      label: 'Product experience',               match: q => q.perspective === 'as_product' },
            { key: 'competitor',      label: 'Compared with other brands',       match: q => q.perspective === 'competitor' },
          ] : [
            { key: '_brand_image', label: 'ภาพรวมของแบรนด์ในสายตาคุณ', match: q => q.dimension === 'identity' && !q.perspective },
            { key: 'as_organization', label: 'ความน่าเชื่อถือและภาพลักษณ์องค์กร',  match: q => q.perspective === 'as_organization' },
            { key: 'as_person',       label: 'บุคลิกและความรู้สึกที่มีต่อแบรนด์',  match: q => q.perspective === 'as_person' },
            { key: 'as_symbol',       label: 'สัญลักษณ์และการจดจำ',                 match: q => q.perspective === 'as_symbol' },
            { key: 'as_product',      label: 'จุดเด่นของสินค้าและบริการ',          match: q => q.perspective === 'as_product' },
            { key: 'competitor',      label: 'เปรียบเทียบกับแบรนด์อื่น',            match: q => q.perspective === 'competitor' },
          ];

          const renderableGroups = [];

          // 1. Identity-only: keep perspective sub-grouping for non-axis
          if (section === 2) {
            perspectiveOrder.forEach(g => {
              const qs = nonAxisQs.filter(g.match);
              if (qs.length) renderableGroups.push({ key: 'p-' + g.key, label: g.label, kind: 'perspective', qs });
            });
          } else if (nonAxisQs.length) {
            renderableGroups.push({ key: 'na', label: '', kind: 'plain', qs: nonAxisQs });
          }

          // 2. Axis groups — one card per topic
          const topicLabel = lang === 'en' ? 'TOPIC · ' : 'หัวข้อ · ';
          Object.keys(axisQsByGroup).forEach(k => {
            const qs = axisQsByGroup[k];
            renderableGroups.push({
              key: 'axis-' + k,
              label: topicLabel + k,
              kind: 'axis',
              qs,
            });
          });

          let qCounter = 0;
          const totalSectionQs = sectionQs.length;
          return renderableGroups.map((g, gi) => (
            <React.Fragment key={g.key}>
              {g.label && (
                <div style={{ padding: '18px 0 4px',
                              borderTop: gi > 0 ? '1px solid var(--rule-strong)' : 'none' }}
                     data-testid={g.kind === 'axis' ? `be-resp-group-header-${g.key}` : `be-resp-group-${g.key}`}>
                  <div className="be-eyebrow">
                    <span className="be-dot-sm" style={{ background: g.kind === 'axis' ? 'var(--be-gold)' : 'var(--be-red)' }}/>
                    {g.label}
                    {g.kind === 'axis' && (
                      <span className="be-mono be-tiny be-muted" style={{ marginLeft: 8 }}>
                        · {g.qs.length} {lang === 'en' ? 'brands' : 'แบรนด์'}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {g.qs.map(q => {
                qCounter += 1;
                const reqNow = isEffectiveRequired(q);
                const missing = showMissing && reqNow && !isAnswered(q);
                const skipUnawareNote = isUnawareOfBrand && q.template_id === 'LY-4';
                return (
                <div className={'be-resp-q' + (missing ? ' be-resp-q-missing' : '')} key={q.id}
                     data-testid={missing ? `be-resp-q-missing-${q.id}` : undefined}>
                  <div className="be-resp-q-num">
                    <span className="be-dot-sm" style={{ background: 'var(--ink)' }}/>
                    {lang === 'en' ? `Question ${qCounter} / ${totalSectionQs}` : `ข้อ ${qCounter} / ${totalSectionQs}`}
                    {missing && (
                      <span className="be-resp-q-missing-tag">
                        {lang === 'en' ? 'not answered' : 'ยังไม่ได้ตอบ'}
                      </span>
                    )}
                  </div>
                  <div className="be-resp-q-prompt">
                    {tx(q, 'prompt')}
                    {reqNow && <span style={{ color: 'var(--be-red)', marginLeft: 4 }}>*</span>}
                  </div>
                  {tx(q, 'help') && <div className="be-resp-q-help">{tx(q, 'help')}</div>}
                  {skipUnawareNote && (
                    <div className="be-resp-q-help" style={{ color: 'var(--be-gold)' }}>
                      {lang === 'en'
                        ? 'Optional — you indicated earlier you are unfamiliar with this brand.'
                        : 'ข้ามข้อนี้ได้หากคุณยังไม่เคยรู้จักหรือทดลองใช้แบรนด์นี้'}
                    </div>
                  )}
                  {/* Visual stimulus: logo / palette image / hex swatches */}
                  {q.display_image && q.display_image.image_base64 && (
                    <div style={{ marginBottom: 16, padding: 14, background: 'var(--paper-2)',
                                   border: '1px solid var(--rule)', display: 'flex',
                                   justifyContent: 'center', alignItems: 'center', minHeight: 140 }}
                         data-testid={`be-resp-q-image-${q.id}`}>
                      <img src={`data:${q.display_image.mime_type};base64,${q.display_image.image_base64}`}
                           alt={q.display_image.kind}
                           style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}/>
                    </div>
                  )}
                  {q.display_palette && q.display_palette.length > 0 && (
                    <div style={{ marginBottom: 16, padding: 14, background: 'var(--paper-2)',
                                   border: '1px solid var(--rule)' }}
                         data-testid={`be-resp-q-palette-${q.id}`}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {q.display_palette.map((hex, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: 56, height: 56, background: hex,
                                           border: '1px solid var(--rule-strong)' }}/>
                            <span className="be-mono be-tiny" style={{ marginTop: 4 }}>{hex}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <QuestionInput q={q} value={answers[q.id]} onChange={v => setAnswers({ ...answers, [q.id]: v })}
                                 lang={lang} T={T}/>
                </div>
                );
              })}
            </React.Fragment>
          ));
        })()}

        <div className="be-resp-foot">
          {section > 0 ? (
            <button className="be-btn be-btn-ghost" onClick={() => setSection(section - 1)}
                    data-testid="be-respondent-prev">
              <Icon name="chevronL" size={11}/>{' '}{T.back}
            </button>
          ) : <span/>}
          <button className="be-btn be-btn-primary"
                  onClick={handleNext} data-testid="be-respondent-next">
            {section === demoSectionIndex - 1
              ? (lang === 'en' ? 'Next · About you' : 'ถัดไป · ข้อมูลเพิ่มเติม')
              : T.untilNext}{' '}<Icon name="arrowR" size={11}/>
          </button>
        </div>
        {!canProceed && (
          <div className="be-small" data-testid="be-respondent-missing-hint"
               style={{ paddingBottom: 14, color: 'var(--be-red)', lineHeight: 1.5 }}>
            {lang === 'en'
              ? `${missingQs.length} required question(s) left in this section`
              : `เหลืออีก ${missingQs.length} ข้อที่ต้องตอบในตอนนี้`}
          </div>
        )}
        <div className="be-tiny be-muted" data-testid="be-autosave-note"
             style={{ paddingBottom: 18, lineHeight: 1.5 }}>
          {lang === 'en'
            ? 'Your answers are saved automatically — you can close the page and come back to finish.'
            : 'คำตอบถูกบันทึกอัตโนมัติ — ปิดหน้านี้แล้วกลับมาทำต่อได้'}
          {serverDraftId && (
            <>
              {' '}
              <button className="be-btn be-tiny" style={{ marginLeft: 4 }}
                      data-testid="be-copy-resume-link"
                      onClick={() => {
                        const url = `${window.location.origin}/brand-equity/respond/${token}?draft=${serverDraftId}`;
                        navigator.clipboard?.writeText(url);
                        setResumeLinkCopied(true);
                        toast.success(lang === 'en' ? 'Resume link copied' : 'คัดลอกลิงก์ทำต่อแล้ว');
                        setTimeout(() => setResumeLinkCopied(false), 2500);
                      }}>
                {resumeLinkCopied
                  ? (lang === 'en' ? 'Copied' : 'คัดลอกแล้ว')
                  : (lang === 'en' ? 'Copy resume link' : 'คัดลอกลิงก์ทำต่อ (ใช้ได้ทุกเครื่อง)')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrandEquityRespondentPage;

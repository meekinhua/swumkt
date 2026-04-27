import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import './brand-equity-styles.css';
import { Icon, BeLoading } from './be-components';

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
          <span style={{ fontWeight: 500 }}>{sl || (lang === 'en' ? 'Left is better' : 'ซ้ายดีกว่า')}</span>
          <span style={{ fontWeight: 500 }}>{sr || (lang === 'en' ? 'Right is better' : 'ขวาดีกว่า')}</span>
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
    return (
      <div className="be-resp-mcq" data-testid={`be-resp-q-${q.id}`}>
        {(q.options || []).map(opt => (
          <div key={opt} className={'be-resp-mcq-opt ' + (value === opt ? 'sel' : '')}
               onClick={() => onChange(opt)} data-testid={`be-resp-mcq-${q.id}-${opt}`}>
            <div className="check">{value === opt && <Icon name="check" size={10}/>}</div>
            <span>{opt}</span>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'mcq_multi') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="be-resp-mcq" data-testid={`be-resp-q-${q.id}`}>
        {(q.options || []).map(opt => {
          const sel = arr.includes(opt);
          return (
            <div key={opt} className={'be-resp-mcq-opt ' + (sel ? 'sel' : '')}
                 onClick={() => onChange(sel ? arr.filter(x => x !== opt) : [...arr, opt])}
                 data-testid={`be-resp-mcq-${q.id}-${opt}`}>
              <div className="check">{sel && <Icon name="check" size={10}/>}</div>
              <span>{opt}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'trait_grid') {
    const arr = Array.isArray(value) ? value : [];
    const min = q.min || 3, max = q.max || 5;
    return (
      <>
        <div className="be-resp-trait-grid" data-testid={`be-resp-q-${q.id}`}>
          {(q.options || []).map(opt => {
            const sel = arr.includes(opt);
            return (
              <div key={opt} className={'be-resp-trait ' + (sel ? 'sel' : '')}
                   onClick={() => {
                     if (sel) onChange(arr.filter(x => x !== opt));
                     else if (arr.length < max) onChange([...arr, opt]);
                   }}
                   data-testid={`be-resp-trait-${q.id}-${opt}`}>
                {opt}
              </div>
            );
          })}
        </div>
        <div className="be-resp-likert-labels" style={{ marginTop: 8 }}>
          <span>เลือกแล้ว {arr.length} / {max}</span>
          <span>(อย่างน้อย {min})</span>
        </div>
      </>
    );
  }
  if (q.type === 'open_short') {
    return <input className="be-input" value={value || ''} onChange={e => onChange(e.target.value)}
                  placeholder="พิมพ์คำตอบสั้นๆ" data-testid={`be-resp-q-${q.id}`}/>;
  }
  if (q.type === 'open_long') {
    return <textarea className="be-textarea" value={value || ''} onChange={e => onChange(e.target.value)}
                     placeholder="พิมพ์คำตอบ — ยิ่งละเอียดยิ่งดี"
                     style={{ minHeight: 100 }} data-testid={`be-resp-q-${q.id}`}/>;
  }
  return null;
};

const BrandEquityRespondentPage = () => {
  const { token } = useParams();
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState(-1); // -1 = welcome, 0..3 = dimension sections, 4 = demographics, 5 = thank you
  const [answers, setAnswers] = useState({});
  const [demographics, setDemographics] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(Date.now());
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
      setError(e.response?.data?.detail || 'Survey ไม่พร้อมรับคำตอบ');
    }
    setLoading(false);
  };

  const dims = ['awareness', 'quality', 'identity', 'loyalty'];
  const dimLabels = lang === 'en' ? {
    awareness: 'Awareness · brand recall',
    quality:   'Quality · perceived quality',
    identity:  'Identity · brand image',
    loyalty:   'Loyalty · loyalty',
  } : {
    awareness: 'Awareness · การจดจำแบรนด์',
    quality:   'Quality · คุณภาพที่รับรู้',
    identity:  'Identity · อัตลักษณ์',
    loyalty:   'Loyalty · ความภักดี',
  };
  const T = lang === 'en' ? {
    untilNext: 'Next', back: 'Back', submit: 'Submit', sending: 'Sending…',
    start: 'Start survey', recorded: 'RESPONSE RECORDED', thanks: 'Thank you!',
    thanksBody: (b) => <>Your response helps <strong>{b}</strong> understand its brand health.</>,
    progress: (a, b, n, t) => `Section ${a} / ${b} · ${n} / ${t}`,
    aboutYou: 'About you', aboutYouDesc: 'Used for slicing data — anonymous',
    welcomeAsk: (m) => <>Please give us <strong>{m} minutes</strong> — answer honestly to help us improve.</>,
    welcomeWhat: "WHAT YOU'LL DO",
    finalSection: 'FINAL SECTION',
    selected: 'selected', minimum: 'minimum',
    leftLabel: 'Lowest', rightLabel: 'Highest',
  } : {
    untilNext: 'ถัดไป', back: 'ย้อน', submit: 'ส่งคำตอบ', sending: 'กำลังส่ง…',
    start: 'เริ่มทำแบบสอบถาม', recorded: 'RESPONSE RECORDED', thanks: 'ขอบคุณ!',
    thanksBody: (b) => <>คำตอบของคุณช่วยให้ <strong>{b}</strong> เข้าใจ brand health ได้ดีขึ้น</>,
    progress: (a, b, n, t) => `ตอนที่ ${a} / ${b} · ${n} / ${t}`,
    aboutYou: 'เกี่ยวกับคุณ', aboutYouDesc: 'ใช้เพื่อ slice ข้อมูล (เช่น ตอบกลุ่มไหนต่างกันยังไง) · ไม่ระบุตัวตน',
    welcomeAsk: (m) => <>ขอเวลา <strong>{m} นาที</strong> ของคุณ — ตอบคำถามตรงๆ เพื่อช่วยให้แบรนด์ของเราดีขึ้น</>,
    welcomeWhat: 'WHAT YOU\'LL DO',
    finalSection: 'FINAL SECTION',
    selected: 'เลือกแล้ว', minimum: 'อย่างน้อย',
    leftLabel: 'น้อยสุด', rightLabel: 'มากสุด',
  };

  if (loading) return <div className="be-root"><BeLoading text="กำลังโหลด survey…"/></div>;
  if (error) {
    return (
      <div className="be-root">
        <div className="be-resp-wrap">
          <div className="be-card" style={{ marginTop: 60, textAlign: 'center' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-red)' }}>SURVEY UNAVAILABLE</div>
            <div className="be-h3" style={{ marginTop: 14 }}>{error}</div>
            <div className="be-muted be-small" style={{ marginTop: 10 }}>กรุณาติดต่อผู้ส่ง link</div>
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
  const totalQ = (study.questions || []).length;
  const answered = Object.keys(answers).length;

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

  // Welcome screen
  if (section === -1) {
    return (
      <div className="be-root" data-testid="be-respondent-page">
        <div className="be-resp-wrap">
          <div style={{ paddingTop: 30, display: 'flex', justifyContent: 'flex-end' }}>
            <LangToggle/>
          </div>
          <div style={{ paddingTop: 14 }}>
            <div className="be-eyebrow" style={{ marginBottom: 16 }}>
              <span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>
              BRAND HEALTH CHECK
            </div>
            <h1 className="be-h1" style={{ fontSize: 36, marginBottom: 16 }}>
              {study.brand?.name}
            </h1>
            <div className="be-muted" style={{ marginBottom: 24, lineHeight: 1.7 }}>
              {T.welcomeAsk(study.estimated_minutes)}
            </div>
            <div className="be-card" style={{ background: 'var(--paper-2)' }}>
              <div className="be-eyebrow" style={{ marginBottom: 10 }}>{T.welcomeWhat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div>{lang === 'en'
                       ? <>{totalQ} questions · 4 dimensions · no wrong answers</>
                       : <>{totalQ} คำถาม · 4 dimensions · ไม่มีคำตอบที่ผิด</>}</div>
                <div>{lang === 'en'
                       ? <>Responses are <strong>anonymous</strong> — no email/name collected</>
                       : <>คำตอบเป็น <strong>anonymous</strong> — เราไม่เก็บอีเมล/ชื่อ</>}</div>
              </div>
            </div>
            <button className="be-btn be-btn-red be-btn-lg" style={{ width: '100%', marginTop: 24, justifyContent: 'center' }}
                    onClick={() => setSection(0)} data-testid="be-respondent-start">
              {T.start}<Icon name="arrowR" size={12}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Demographics screen (last)
  if (section === 4) {
    const segs = study.segments_to_capture || [];
    const segConfig = lang === 'en' ? {
      age: { label: 'Age', options: ['<18', '18-24', '25-34', '35-44', '45-54', '55+'] },
      gender: { label: 'Gender', options: ['Female', 'Male', 'Other', 'Prefer not to say'] },
      region: { label: 'Region', options: ['Bangkok', 'Central', 'North', 'Northeast', 'South', 'East'] },
      occupation: { label: 'Occupation', options: ['Student', 'Employee', 'Freelancer', 'Business owner', 'Other'] },
      income: { label: 'Income/month', options: ['<15K', '15-30K', '30-50K', '50-100K', '100K+'] },
      usage_frequency: { label: 'Usage frequency', options: ['Daily', 'Weekly', 'Monthly', 'Rarely', 'Never'] },
    } : {
      age: { label: 'อายุ', options: ['<18', '18-24', '25-34', '35-44', '45-54', '55+'] },
      gender: { label: 'เพศ', options: ['หญิง', 'ชาย', 'อื่นๆ', 'ไม่ระบุ'] },
      region: { label: 'ภูมิภาค', options: ['กรุงเทพ', 'กลาง', 'เหนือ', 'อีสาน', 'ใต้', 'ตะวันออก'] },
      occupation: { label: 'อาชีพ', options: ['นักศึกษา', 'พนักงานบริษัท', 'ฟรีแลนซ์', 'เจ้าของกิจการ', 'อื่นๆ'] },
      income: { label: 'รายได้/เดือน', options: ['<15K', '15-30K', '30-50K', '50-100K', '100K+'] },
      usage_frequency: { label: 'ใช้ผลิตภัณฑ์บ่อยแค่ไหน', options: ['รายวัน', 'รายสัปดาห์', 'รายเดือน', 'นานๆ ครั้ง', 'ไม่เคย'] },
    };
    return (
      <div className="be-root" data-testid="be-respondent-demographics">
        <div className="be-resp-wrap">
          <div style={{ paddingTop: 14, display: 'flex', justifyContent: 'flex-end' }}><LangToggle/></div>
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
                    {c.options.map(opt => (
                      <div key={opt}
                           className={'be-resp-mcq-opt ' + (demographics[s] === opt ? 'sel' : '')}
                           onClick={() => setDemographics({ ...demographics, [s]: opt })}
                           data-testid={`be-resp-demo-${s}-${opt}`}>
                        <div className="check">{demographics[s] === opt && <Icon name="check" size={10}/>}</div>
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <button className="be-btn be-btn-red be-btn-lg"
                    style={{ width: '100%', marginTop: 20, justifyContent: 'center' }}
                    onClick={submit} disabled={submitting} data-testid="be-respondent-submit">
              {submitting ? T.sending : T.submit}<Icon name="check" size={12}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Thank you
  if (section === 5) {
    return (
      <div className="be-root" data-testid="be-respondent-thanks">
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
  const dim = dims[section];
  const sectionQs = questionsByDim[dim] || [];

  const canProceed = sectionQs.every(q => {
    if (!q.required) return true;
    const v = answers[q.id];
    if (v == null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (q.type === 'trait_grid' && Array.isArray(v) && v.length < (q.min || 3)) return false;
    return true;
  });

  async function submit() {
    setSubmitting(true);
    try {
      const answersList = Object.entries(answers).map(([qid, val]) => ({ question_id: qid, value: val }));
      await axios.post(`${API}/brand-equity/public/${token}/respond`, {
        demographics,
        answers: answersList,
        duration_sec: Math.round((Date.now() - startedAt) / 1000),
      });
      setSection(5);
    } catch (e) {
      toast.error('ส่งไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    }
    setSubmitting(false);
  }

  return (
    <div className="be-root" data-testid="be-respondent-page">
      <div className="be-resp-wrap">
        <div className="be-resp-head">
          <div style={{ width: 32, height: 32, background: 'var(--ink)', color: 'var(--paper)',
                        display: 'grid', placeItems: 'center', fontFamily: 'IBM Plex Serif',
                        fontWeight: 600, fontSize: 16 }}>
            {study.brand?.name?.[0]?.toUpperCase() || 'B'}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontFamily: 'IBM Plex Serif', fontSize: 14 }}>{study.brand?.name}</strong>
            <div className="be-mono be-tiny be-muted">BRAND HEALTH CHECK</div>
          </div>
          <LangToggle/>
        </div>

        <div className="be-resp-progress">
          <div className="be-resp-progress-segs">
            {dims.map((d, i) => (
              <div key={d} className={'s ' + (i < section ? 'done' : i === section ? 'on' : '')}/>
            ))}
          </div>
          <div className="be-resp-progress-meta">
            <span>{T.progress(section + 1, 4, answered, totalQ)} · {dimLabels[dim]}</span>
            <span>{answered} / {totalQ}</span>
          </div>
        </div>

        {sectionQs.length === 0 ? (
          <div className="be-resp-q">
            <div className="be-muted be-small">ไม่มีคำถามใน dimension นี้</div>
          </div>
        ) : (() => {
          // Group identity questions by perspective for visual clarity
          const groupOrder = lang === 'en' ? [
            { key: '_brand_image',   label: 'Brand Image · overall',         match: q => q.dimension === 'identity' && !q.perspective },
            { key: 'as_organization', label: 'As Organization',               match: q => q.perspective === 'as_organization' },
            { key: 'as_person',       label: 'As Person',                     match: q => q.perspective === 'as_person' },
            { key: 'as_symbol',       label: 'As Symbol',                     match: q => q.perspective === 'as_symbol' },
            { key: 'as_product',      label: 'As Product',                    match: q => q.perspective === 'as_product' },
            { key: 'competitor',      label: 'About competitors',             match: q => q.perspective === 'competitor' },
          ] : [
            { key: '_brand_image', label: 'Brand Image · ภาพรวม', match: q => q.dimension === 'identity' && !q.perspective },
            { key: 'as_organization', label: 'As Organization · องค์กร',  match: q => q.perspective === 'as_organization' },
            { key: 'as_person',       label: 'As Person · บุคลิก',        match: q => q.perspective === 'as_person' },
            { key: 'as_symbol',       label: 'As Symbol · สัญลักษณ์',      match: q => q.perspective === 'as_symbol' },
            { key: 'as_product',      label: 'As Product · ผลิตภัณฑ์',     match: q => q.perspective === 'as_product' },
            { key: 'competitor',      label: 'About competitors · เกี่ยวกับคู่แข่ง', match: q => q.perspective === 'competitor' },
          ];
          const groups = section === 2  // identity section
            ? groupOrder.map(g => ({ ...g, qs: sectionQs.filter(g.match) })).filter(g => g.qs.length)
            : [{ key: 'all', label: '', qs: sectionQs }];
          return groups.map((g, gi) => (
            <React.Fragment key={g.key}>
              {g.label && (
                <div style={{ padding: '18px 0 4px', borderTop: gi > 0 ? '1px solid var(--rule-strong)' : 'none' }}>
                  <div className="be-eyebrow"><span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>{g.label}</div>
                </div>
              )}
              {g.qs.map(q => (
                <div className="be-resp-q" key={q.id}>
                  <div className="be-resp-q-num">
                    <span className="be-dot-sm" style={{ background: 'var(--ink)' }}/>
                    {q.template_id || q.id.slice(0, 5)}
                  </div>
                  <div className="be-resp-q-prompt">
                    {tx(q, 'prompt')}
                    {q.required && <span style={{ color: 'var(--be-red)', marginLeft: 4 }}>*</span>}
                  </div>
                  {tx(q, 'help') && <div className="be-resp-q-help">{tx(q, 'help')}</div>}
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
              ))}
            </React.Fragment>
          ));
        })()}

        <div className="be-resp-foot">
          {section > 0 ? (
            <button className="be-btn be-btn-ghost" onClick={() => setSection(section - 1)}
                    data-testid="be-respondent-prev">
              <Icon name="chevronL" size={11}/>{T.back}
            </button>
          ) : <span/>}
          <button className="be-btn be-btn-primary" disabled={!canProceed}
                  onClick={() => setSection(section + 1)} data-testid="be-respondent-next">
            {section === 3
              ? (lang === 'en' ? 'Next · about you' : 'ถัดไป · ข้อมูล')
              : T.untilNext}<Icon name="arrowR" size={11}/>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrandEquityRespondentPage;

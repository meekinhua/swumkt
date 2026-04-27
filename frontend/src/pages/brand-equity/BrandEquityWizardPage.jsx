import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import './brand-equity-styles.css';
import { BeTopbar, Icon, Stepper, BeLoading, DIMENSIONS } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_TRAITS = [
  'Modern', 'Classic', 'Trustworthy', 'Innovative', 'Friendly', 'Premium',
  'Affordable', 'Exciting', 'Reliable', 'Sophisticated', 'Bold', 'Fun',
  'Professional', 'Caring', 'Energetic', 'Calm', 'Authentic', 'Edgy',
  'Down-to-earth', 'Aspirational', 'Tech-savvy', 'Traditional', 'Playful', 'Serious',
];

const PRICING = [
  { v: 'budget',  label: 'Budget' },
  { v: 'mid',     label: 'Mid-tier' },
  { v: 'premium', label: 'Premium' },
  { v: 'luxury',  label: 'Luxury' },
];

const SEGMENTS = ['age', 'gender', 'region', 'occupation', 'income', 'usage_frequency'];

const STEP_LABELS = ['Brand basics', 'Brand identity', 'Segments', 'Question review'];

const BrandEquityWizardPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { studyId } = useParams();
  const isEdit = Boolean(studyId);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [brand, setBrand] = useState({ name: '', logo_url: '', category: '', competitors: [], industry_context: '' });
  const [identity, setIdentity] = useState({ traits: [], brand_promise: '', pricing_tier: 'mid', archetype: '' });
  const [segments, setSegments] = useState(['age', 'gender']);
  const [target, setTarget] = useState(100);
  const [questions, setQuestions] = useState([]);
  const [study, setStudy] = useState(null);
  const [expanded, setExpanded] = useState({ awareness: true, quality: false, identity: true, loyalty: false });
  const [competitorInput, setCompetitorInput] = useState('');

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { if (isEdit) loadStudy(); /* eslint-disable-next-line */ }, [studyId]);

  const loadStudy = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies/${studyId}`, authH);
      const s = r.data;
      setStudy(s);
      setBrand(s.brand);
      setIdentity(s.identity);
      setSegments(s.segments_to_capture || []);
      setTarget(s.target_responses || 100);
      setQuestions(s.questions || []);
      setStep(3);
    } catch (e) {
      toast.error('โหลด study ไม่สำเร็จ');
    }
    setLoading(false);
  };

  const validStep0 = brand.name?.trim() && brand.category?.trim() && brand.competitors.length >= 1;
  const validStep1 = identity.traits.length >= 3;
  const validStep2 = segments.length >= 1;

  const addCompetitor = () => {
    const v = competitorInput.trim();
    if (v && !brand.competitors.includes(v)) {
      setBrand({ ...brand, competitors: [...brand.competitors, v] });
      setCompetitorInput('');
    }
  };

  const toggleTrait = (t) => {
    if (identity.traits.includes(t)) setIdentity({ ...identity, traits: identity.traits.filter(x => x !== t) });
    else if (identity.traits.length < 8) setIdentity({ ...identity, traits: [...identity.traits, t] });
  };

  const toggleSegment = (s) => {
    if (segments.includes(s)) setSegments(segments.filter(x => x !== s));
    else setSegments([...segments, s]);
  };

  const proceedToReview = async () => {
    setCreating(true);
    try {
      const r = await axios.post(`${API}/brand-equity/studies`, {
        brand, identity, segments_to_capture: segments, target_responses: target,
      }, authH);
      setStudy(r.data);
      setQuestions(r.data.questions || []);
      setStep(3);
      toast.success('สร้างคำถาม ' + (r.data.questions?.length || 0) + ' ข้อสำเร็จ');
    } catch (e) {
      toast.error('สร้าง study ไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    }
    setCreating(false);
  };

  const regenerate = async () => {
    if (!study?.id) return;
    setCreating(true);
    try {
      const r = await axios.post(`${API}/brand-equity/studies/${study.id}/regenerate-questions`, {}, authH);
      setQuestions(r.data.questions || []);
      toast.success('Regenerated ' + (r.data.questions?.length || 0) + ' คำถาม');
    } catch (e) {
      toast.error('Regenerate ไม่สำเร็จ');
    }
    setCreating(false);
  };

  const launchStudy = async () => {
    if (!study?.id) return;
    setCreating(true);
    try {
      await axios.put(`${API}/brand-equity/studies/${study.id}`,
        { status: 'collecting', questions }, authH);
      toast.success('Study เปิดรับคำตอบแล้ว');
      navigate(`/brand-equity/studies/${study.id}`);
    } catch (e) {
      toast.error('Launch ไม่สำเร็จ');
    }
    setCreating(false);
  };

  const deleteQuestion = (qid) => setQuestions(questions.filter(q => q.id !== qid));

  if (loading) {
    return <div className="be-root"><BeLoading text="Loading…"/></div>;
  }

  const questionsByDim = {
    awareness: questions.filter(q => q.dimension === 'awareness'),
    quality:   questions.filter(q => q.dimension === 'quality'),
    identity:  questions.filter(q => q.dimension === 'identity'),
    loyalty:   questions.filter(q => q.dimension === 'loyalty'),
  };
  const totalQ = questions.length;
  const estMin = Math.max(5, Math.ceil(totalQ / 4));

  return (
    <div className="be-root" data-testid="be-wizard-page">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 32px',
                    borderBottom: '1px solid var(--rule)', background: 'var(--paper)' }}>
        <button className="be-btn be-btn-ghost" onClick={() => navigate('/brand-equity')}
                data-testid="be-wizard-back">
          <Icon name="chevronL" size={11}/>My Studies
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {isEdit ? 'Edit · ' : 'New study · '}{brand.name || 'Untitled'}
        </span>
        <span className="be-chip be-mono">DRAFT</span>
      </div>

      <Stepper steps={STEP_LABELS} current={step}/>

      <div className="be-wiz">
        {/* STEP 0 - Brand basics */}
        {step === 0 && (
          <div className="be-wiz-body" data-testid="be-wizard-step-0">
            <div>
              <div className="be-wiz-head">
                <div className="be-eyebrow" style={{ marginBottom: 10 }}>STEP · 01 / 04</div>
                <h1 className="be-h1">เริ่มจากข้อมูลพื้นฐานของแบรนด์</h1>
                <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
                  ระบบจะใช้ข้อมูลนี้สร้างคำถามที่เหมาะกับ category และ competitor ของคุณ
                </div>
              </div>

              <div className="be-card" style={{ marginBottom: 16 }}>
                <label className="be-label">ชื่อแบรนด์ *</label>
                <input className="be-input" value={brand.name}
                       onChange={e => setBrand({ ...brand, name: e.target.value })}
                       placeholder="เช่น Mali · มะลิ" data-testid="be-wizard-brand-name"/>

                <label className="be-label" style={{ marginTop: 14 }}>หมวดสินค้า / category *</label>
                <input className="be-input" value={brand.category}
                       onChange={e => setBrand({ ...brand, category: e.target.value })}
                       placeholder="เช่น specialty coffee, banking, edtech"
                       data-testid="be-wizard-brand-category"/>

                <label className="be-label" style={{ marginTop: 14 }}>บริบทอุตสาหกรรม (ถ้ามี)</label>
                <textarea className="be-textarea" value={brand.industry_context}
                          onChange={e => setBrand({ ...brand, industry_context: e.target.value })}
                          placeholder="ตลาดอย่างไร · target ใคร · positioning ต่างจากเจ้าอื่นยังไง"
                          data-testid="be-wizard-brand-context"/>
              </div>

              <div className="be-card">
                <label className="be-label">คู่แข่งหลัก * (อย่างน้อย 1, แนะนำ 3-4)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="be-input" value={competitorInput}
                         onChange={e => setCompetitorInput(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && addCompetitor()}
                         placeholder="เช่น Starbucks, Cafe Amazon"
                         data-testid="be-wizard-competitor-input"/>
                  <button className="be-btn" onClick={addCompetitor} data-testid="be-wizard-add-competitor">
                    <Icon name="plus" size={11}/>เพิ่ม
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}
                     data-testid="be-wizard-competitor-list">
                  {brand.competitors.map((c, i) => (
                    <span key={i} className="be-chip">
                      {c}
                      <button onClick={() => setBrand({ ...brand, competitors: brand.competitors.filter((_, j) => j !== i) })}
                              style={{ background: 'transparent', border: 0, marginLeft: 4 }}>
                        <Icon name="close" size={9}/>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="be-wiz-side">
              <h4>Why this matters</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                AI ใช้ category และ competitor names ในการสร้าง prompt template
                เช่น "เทียบ <strong>Mali</strong> กับ <strong>Starbucks</strong> คุณคิดว่า..."
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 - Identity */}
        {step === 1 && (
          <div className="be-wiz-body" data-testid="be-wizard-step-1">
            <div>
              <div className="be-wiz-head">
                <div className="be-eyebrow" style={{ marginBottom: 10 }}>STEP · 02 / 04</div>
                <h1 className="be-h1">Brand identity ที่ตั้งใจให้เป็น</h1>
                <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
                  สิ่งที่แบรนด์อยากให้ผู้บริโภครู้สึก — เราจะใช้เปรียบเทียบกับ image ที่ผู้ตอบรับรู้จริง
                  ในขั้น Identity vs Image
                </div>
              </div>

              <div className="be-card" style={{ marginBottom: 16 }}>
                <label className="be-label">เลือก Identity Traits * (3-8 ข้อ)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
                     data-testid="be-wizard-traits">
                  {DEFAULT_TRAITS.map(t => (
                    <span key={t}
                          className={'be-trait-toggle ' + (identity.traits.includes(t) ? 'sel' : '')}
                          onClick={() => toggleTrait(t)}
                          data-testid={`be-wizard-trait-${t}`}>
                      {identity.traits.includes(t) && <Icon name="check" size={10}/>}
                      {t}
                    </span>
                  ))}
                </div>
                <div className="be-help">เลือกแล้ว {identity.traits.length} / 8</div>
              </div>

              <div className="be-card" style={{ marginBottom: 16 }}>
                <label className="be-label">Brand promise (1 ประโยค)</label>
                <input className="be-input" value={identity.brand_promise}
                       onChange={e => setIdentity({ ...identity, brand_promise: e.target.value })}
                       placeholder="เช่น Slow coffee, made with care"
                       data-testid="be-wizard-promise"/>
              </div>

              <div className="be-card">
                <label className="be-label">Pricing tier</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {PRICING.map(p => (
                    <span key={p.v}
                          className={'be-trait-toggle ' + (identity.pricing_tier === p.v ? 'sel' : '')}
                          onClick={() => setIdentity({ ...identity, pricing_tier: p.v })}
                          data-testid={`be-wizard-pricing-${p.v}`}>
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="be-wiz-side">
              <h4>Identity vs Image (ที่ตั้งใจ vs ที่ถูกรับรู้)</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                ใน dashboard เราจะ <strong>match</strong> traits ที่คุณเลือกกับ open-end responses
                ของผู้ตอบ เพื่อหา <strong>aligned · lost · unintended</strong> traits
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 - Segments */}
        {step === 2 && (
          <div className="be-wiz-body" data-testid="be-wizard-step-2">
            <div>
              <div className="be-wiz-head">
                <div className="be-eyebrow" style={{ marginBottom: 10 }}>STEP · 03 / 04</div>
                <h1 className="be-h1">เก็บข้อมูล demographic อะไรบ้าง?</h1>
                <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
                  Dashboard จะให้คุณ slice ข้อมูลตาม segment เหล่านี้
                </div>
              </div>

              <div className="be-card" style={{ marginBottom: 16 }}>
                <label className="be-label">Segments * (อย่างน้อย 1)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}
                     data-testid="be-wizard-segments">
                  {SEGMENTS.map(s => (
                    <span key={s}
                          className={'be-trait-toggle ' + (segments.includes(s) ? 'sel' : '')}
                          onClick={() => toggleSegment(s)}
                          data-testid={`be-wizard-seg-${s}`}>
                      {segments.includes(s) && <Icon name="check" size={10}/>}
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="be-card">
                <label className="be-label">Target responses</label>
                <input type="number" className="be-input" value={target} min={10}
                       onChange={e => setTarget(parseInt(e.target.value) || 100)}
                       data-testid="be-wizard-target"/>
                <div className="be-help">ต้องมีอย่างน้อย 10 responses เพื่อปลดล็อก dashboard</div>
              </div>
            </div>
            <div className="be-wiz-side">
              <h4>เคล็ดลับ</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                100-200 responses ให้ result ที่เชื่อถือได้สำหรับ brand health
                · 30+ จุดต่อ segment สำหรับ statistical significance
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 - Question review */}
        {step === 3 && (
          <div className="be-wiz-body" data-testid="be-wizard-step-3">
            <div>
              <div className="be-wiz-head">
                <div className="be-eyebrow" style={{ marginBottom: 10 }}>STEP · 04 / 04</div>
                <h1 className="be-h1">ตรวจสอบคำถาม · {totalQ} ข้อ</h1>
                <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
                  ระบบสร้างคำถามครอบคลุม Aaker 4 dimensions แล้ว — คุณสามารถลบ/regenerate ได้ก่อนเปิดรับคำตอบ
                </div>
              </div>

              <div className="be-card" style={{ marginBottom: 18, background: '#FFFAF0', borderColor: 'var(--be-red)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div className="be-eyebrow"><span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>AI GENERATION COMPLETE</div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      สร้าง <strong>{totalQ} คำถาม</strong> ครอบคลุม 4 dimensions · ปรับตามบริบท <strong>{brand.name}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                      {Object.values(DIMENSIONS).map(d => (
                        <div key={d.key} className="be-mono be-tiny" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="be-dot-sm" style={{ background: d.color }}/>
                          {d.label} · {questionsByDim[d.key].length}q
                        </div>
                      ))}
                    </div>
                  </div>
                  <button className="be-btn" onClick={regenerate} disabled={creating}
                          data-testid="be-wizard-regenerate">
                    <Icon name="refresh" size={11}/>{creating ? '…' : 'Regenerate'}
                  </button>
                </div>
              </div>

              {Object.values(DIMENSIONS).map(d => {
                const isOpen = expanded[d.key];
                const dq = questionsByDim[d.key];
                return (
                  <div key={d.key} className={'be-dim-block' + (isOpen ? '' : ' collapsed')}
                       data-testid={`be-wizard-dim-${d.key}`}>
                    <div className="be-dim-block-h" onClick={() => setExpanded({ ...expanded, [d.key]: !isOpen })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="be-dot-sm" style={{ background: d.color, width: 10, height: 10 }}/>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</span>
                        <span className="be-mono be-tiny be-muted">· {d.th}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span className="be-mono be-tiny be-muted">{dq.length} questions</span>
                        <Icon name="chevron" size={12} style={{ transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}/>
                      </div>
                    </div>
                    {isOpen && (
                      <div>
                        {dq.map(q => (
                          <div key={q.id} className="be-qrow" data-testid={`be-wizard-q-${q.id}`}>
                            <div className="be-qid">{q.template_id || q.id.slice(0, 5)}</div>
                            <div className="be-qprompt">
                              {q.prompt}
                              {q.required && <span style={{ color: 'var(--be-red)', marginLeft: 6 }}>*</span>}
                              {q.ai_processing && (
                                <span className="be-chip-dim be-mono"
                                      style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                               border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px', fontSize: 9.5, letterSpacing: 0.04 }}>
                                  AI
                                </span>
                              )}
                            </div>
                            <div className="be-qtype">{q.type}</div>
                            <div className="be-qact">
                              <button title="Delete" onClick={() => deleteQuestion(q.id)}
                                      data-testid={`be-wizard-q-delete-${q.id}`}>
                                <Icon name="trash" size={11}/>
                              </button>
                            </div>
                          </div>
                        ))}
                        {dq.length === 0 && (
                          <div className="be-qadd" style={{ borderTop: 0 }}>ไม่มีคำถาม dimension นี้</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="be-wiz-side">
              <h4>Brand context</h4>
              <div style={{ fontFamily: 'IBM Plex Serif', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {brand.name}
              </div>
              <div className="be-small be-muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>
                {brand.category}
                {brand.industry_context && <><br/>{brand.industry_context}</>}
              </div>

              <h4 style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}>Identity traits</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                {identity.traits.map(t => <span key={t} className="be-chip">{t}</span>)}
              </div>

              <h4 style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}>Competitors · {brand.competitors.length}</h4>
              <div className="be-small" style={{ marginBottom: 14, lineHeight: 1.7 }}>
                {brand.competitors.join(' · ')}
              </div>

              <h4 style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}>Estimated time</h4>
              <div className="be-data" style={{ fontSize: 28 }}>{estMin} <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>min</span></div>
              <div className="be-tiny be-muted" style={{ marginTop: 4 }}>ต่อผู้ตอบหนึ่งคน</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="be-wiz-foot">
        <button className="be-btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
                data-testid="be-wizard-prev">
          <Icon name="chevronL" size={11}/>{step === 0 ? 'Back' : 'Prev'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="be-mono be-tiny be-muted">
            {step === 3 ? `${totalQ} questions · 4 dimensions · est ${estMin} min` : `Step ${step + 1} of 4`}
          </span>
          {step < 2 && (
            <button className="be-btn be-btn-primary"
                    disabled={(step === 0 && !validStep0) || (step === 1 && !validStep1)}
                    onClick={() => setStep(step + 1)}
                    data-testid="be-wizard-next">
              ถัดไป<Icon name="chevronR" size={11}/>
            </button>
          )}
          {step === 2 && (
            <button className="be-btn be-btn-primary" disabled={!validStep2 || creating}
                    onClick={proceedToReview} data-testid="be-wizard-generate">
              <Icon name="sparkle" size={11}/>{creating ? 'กำลังสร้างคำถาม…' : 'AI สร้างคำถาม →'}
            </button>
          )}
          {step === 3 && (
            <button className="be-btn be-btn-red" onClick={launchStudy} disabled={creating || !study?.id}
                    data-testid="be-wizard-launch">
              {creating ? '…' : 'เปิดรับคำตอบ'}<Icon name="arrowR" size={11}/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrandEquityWizardPage;

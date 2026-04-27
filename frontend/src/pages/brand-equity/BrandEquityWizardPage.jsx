import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import './brand-equity-styles.css';
import { BeTopbar, Icon, Stepper, BeLoading, DIMENSIONS, BrandLogo } from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_TRAITS = [
  'Modern', 'Classic', 'Trustworthy', 'Innovative', 'Friendly', 'Premium',
  'Affordable', 'Exciting', 'Reliable', 'Sophisticated', 'Bold', 'Fun',
  'Professional', 'Caring', 'Energetic', 'Calm', 'Authentic', 'Edgy',
  'Down-to-earth', 'Aspirational', 'Tech-savvy', 'Traditional', 'Playful', 'Serious',
];

// Display labels in Thai (storage stays in English so stats engine + dashboard map cleanly).
// Mirrors backend DEFAULT_TRAIT_POOL_TH in /app/backend/routes/brand_equity.py
const TRAIT_TH = {
  'Modern': 'ทันสมัย', 'Classic': 'คลาสสิก', 'Trustworthy': 'น่าเชื่อถือ',
  'Innovative': 'นวัตกรรม', 'Friendly': 'เป็นกันเอง', 'Premium': 'พรีเมี่ยม',
  'Affordable': 'ราคาเข้าถึงได้', 'Exciting': 'ตื่นเต้น', 'Reliable': 'ไว้ใจได้',
  'Sophisticated': 'หรูดูดี', 'Bold': 'กล้าหาญ', 'Fun': 'สนุก',
  'Professional': 'มืออาชีพ', 'Caring': 'ใส่ใจ', 'Energetic': 'มีพลัง',
  'Calm': 'สงบ/นิ่ง', 'Authentic': 'แท้จริง/จริงใจ', 'Edgy': 'เท่/แตกต่าง',
  'Down-to-earth': 'ติดดิน', 'Aspirational': 'มีแรงบันดาลใจ',
  'Tech-savvy': 'ล้ำเทคโนโลยี', 'Traditional': 'ดั้งเดิม',
  'Playful': 'ขี้เล่น', 'Serious': 'จริงจัง',
};
const traitLabel = (t) => TRAIT_TH[t] || t;

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
  const [previewLang, setPreviewLang] = useState('th');

  const [brand, setBrand] = useState({ name: '', logo_url: '', category: '', competitors: [], industry_context: '', custom_quality_attributes: [] });
  const [identity, setIdentity] = useState({
    traits: [], description: '', visual_assets: [],
    brand_promise: '', pricing_tier: 'mid', archetype: '',
    derived_traits: [], visual_palette: [], visual_keywords: [], ai_summary: '',
  });
  const [segments, setSegments] = useState(['age', 'gender']);
  const [target, setTarget] = useState(100);
  const [questions, setQuestions] = useState([]);
  const [study, setStudy] = useState(null);
  const [expanded, setExpanded] = useState({ awareness: true, quality: false, identity: true, loyalty: false });
  const [competitorInput, setCompetitorInput] = useState('');
  const [qualityAttrInput, setQualityAttrInput] = useState('');
  const [extractingIdentity, setExtractingIdentity] = useState(false);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { if (isEdit) loadStudy(); /* eslint-disable-next-line */ }, [studyId]);

  const loadStudy = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies/${studyId}`, authH);
      const s = r.data;
      setStudy(s);
      setBrand(s.brand);
      setIdentity({
        traits: [], description: '', visual_assets: [],
        derived_traits: [], visual_palette: [], visual_keywords: [], ai_summary: '',
        ...s.identity,
      });
      setSegments(s.segments_to_capture || []);
      setTarget(s.target_responses || 100);
      setQuestions(s.questions || []);
      // Edit mode: start at Brand basics so user can adjust everything; Stepper is clickable to jump
      setStep(0);
    } catch (e) {
      toast.error('โหลด study ไม่สำเร็จ');
    }
    setLoading(false);
  };

  const validStep0 = brand.name?.trim() && brand.category?.trim() && brand.competitors.length >= 1;
  // Step 1 valid if EITHER user picked >=3 traits OR provided description OR uploaded an image
  const validStep1 = (identity.traits || []).length >= 3
                  || (identity.description || '').trim().length >= 20
                  || (identity.visual_assets || []).length >= 1;
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

  // ---- Visual asset upload (base64 in-memory) ----
  const onUploadImages = async (filesList, kind = 'design') => {
    const files = Array.from(filesList || []);
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    const MAX = 1024 * 1024; // 1 MB per image
    const newAssets = [];
    for (const f of files) {
      if (!allowed.includes(f.type)) {
        toast.error(`${f.name}: รองรับเฉพาะ PNG / JPEG / WEBP`);
        continue;
      }
      if (f.size > MAX) {
        toast.error(`${f.name}: เกิน 1MB (resize ก่อนนะครับ)`);
        continue;
      }
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',', 2)[1]);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      newAssets.push({ kind, image_base64: b64, mime_type: f.type, note: f.name });
    }
    if (newAssets.length) {
      setIdentity(prev => ({ ...prev, visual_assets: [...(prev.visual_assets || []), ...newAssets].slice(0, 5) }));
      toast.success(`อัปโหลด ${newAssets.length} ภาพ`);
    }
  };

  const removeAsset = (idx) => {
    setIdentity(prev => ({ ...prev, visual_assets: prev.visual_assets.filter((_, i) => i !== idx) }));
  };

  const setAssetKind = (idx, kind) => {
    setIdentity(prev => ({
      ...prev,
      visual_assets: prev.visual_assets.map((a, i) => i === idx ? { ...a, kind } : a),
    }));
  };

  const runAIExtract = async () => {
    if (!identity.description?.trim() && !(identity.visual_assets || []).length && !identity.traits.length) {
      toast.error('กรอก description หรืออัปโหลดภาพอย่างน้อย 1 รายการก่อน');
      return;
    }
    setExtractingIdentity(true);
    try {
      const r = await axios.post(`${API}/brand-equity/extract-identity`, {
        brand_name: brand.name || 'Brand',
        category: brand.category,
        description: identity.description || '',
        traits: identity.traits || [],
        brand_promise: identity.brand_promise,
        pricing_tier: identity.pricing_tier,
        visual_assets: identity.visual_assets || [],
      }, authH);
      const d = r.data;
      // Merge derived into local identity (don't blow away user's chosen traits)
      const mergedTraits = Array.from(new Set([...(identity.traits || []), ...(d.derived_traits || [])])).slice(0, 12);
      setIdentity(prev => ({
        ...prev,
        traits: mergedTraits,
        derived_traits: d.derived_traits || [],
        visual_palette: d.visual_palette || [],
        visual_keywords: d.visual_keywords || [],
        ai_summary: d.summary || '',
        archetype: d.archetype || prev.archetype,
      }));
      toast.success(`AI สร้าง ${(d.derived_traits || []).length} traits + palette + keywords`);
    } catch (e) {
      toast.error('AI extract ไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    }
    setExtractingIdentity(false);
  };

  const toggleSegment = (s) => {
    if (segments.includes(s)) setSegments(segments.filter(x => x !== s));
    else setSegments([...segments, s]);
  };

  const proceedToReview = async () => {
    setCreating(true);
    try {
      let saved;
      if (study?.id) {
        // Update existing study (edit mode OR re-edit after first generation)
        const r = await axios.put(`${API}/brand-equity/studies/${study.id}`, {
          brand, identity, segments_to_capture: segments, target_responses: target,
        }, authH);
        // Server doesn't auto-regenerate questions on PUT — call regenerate explicitly
        const rg = await axios.post(`${API}/brand-equity/studies/${study.id}/regenerate-questions`, {}, authH);
        saved = { ...r.data, questions: rg.data.questions || [] };
      } else {
        const r = await axios.post(`${API}/brand-equity/studies`, {
          brand, identity, segments_to_capture: segments, target_responses: target,
        }, authH);
        saved = r.data;
      }
      setStudy(saved);
      setQuestions(saved.questions || []);
      setStep(3);
      toast.success((study?.id ? 'อัปเดต' : 'สร้าง') + ' · ' + (saved.questions?.length || 0) + ' คำถาม');
    } catch (e) {
      toast.error((study?.id ? 'อัปเดต' : 'สร้าง') + ' study ไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
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
      // Persist any final edits to brand/identity/segments along with status + edited questions
      await axios.put(`${API}/brand-equity/studies/${study.id}`,
        { status: 'collecting', questions,
          brand, identity, segments_to_capture: segments, target_responses: target }, authH);
      toast.success('Study เปิดรับคำตอบแล้ว');
      navigate(`/brand-equity/studies/${study.id}`);
    } catch (e) {
      toast.error('Launch ไม่สำเร็จ');
    }
    setCreating(false);
  };

  // Save edits without changing status (used for "Save changes" in edit mode)
  const saveEdits = async () => {
    if (!study?.id) return;
    setCreating(true);
    try {
      await axios.put(`${API}/brand-equity/studies/${study.id}`,
        { brand, identity, segments_to_capture: segments, target_responses: target,
          questions }, authH);
      toast.success('บันทึกการแก้ไขเรียบร้อย');
      navigate(`/brand-equity/studies/${study.id}`);
    } catch (e) {
      toast.error('บันทึกไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
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

      <Stepper steps={STEP_LABELS} current={step}
               onStepClick={(i) => {
                 // Allow free navigation when: editing, OR study already created (step 3 reached)
                 if (isEdit || study?.id) {
                   setStep(i);
                 } else {
                   // For brand-new wizard: only allow going back to completed/visited steps
                   if (i <= step) setStep(i);
                 }
               }}/>

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

              <div className="be-card" style={{ marginBottom: 16 }}>
                <label className="be-label">โลโก้แบรนด์ (option)</label>
                <div className="be-help" style={{ marginBottom: 10 }}>
                  ใส่ <strong>URL</strong> โลโก้ หรือ <strong>upload</strong> รูป (PNG/JPEG/WEBP, ≤1MB)
                  · ใช้แสดงในหน้า Studies, Dashboard และ public survey · เว้นว่างได้ ระบบจะใช้อักษรย่อแทน
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <BrandLogo brand={brand} identity={identity} size={64}
                             gradient="linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)"
                             testid="be-wizard-logo-preview"/>
                  <div style={{ flex: 1 }}>
                    <input className="be-input" value={brand.logo_url || ''}
                           onChange={e => setBrand({ ...brand, logo_url: e.target.value })}
                           placeholder="https://example.com/logo.png"
                           data-testid="be-wizard-logo-url"/>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <label className="be-btn" style={{ cursor: 'pointer' }}>
                        <Icon name="plus" size={11}/>Upload PNG/JPG
                        <input type="file" accept="image/png,image/jpeg,image/webp"
                               style={{ display: 'none' }}
                               data-testid="be-wizard-logo-upload"
                               onChange={e => { onUploadImages(e.target.files, 'logo'); e.target.value = ''; }}/>
                      </label>
                      {((identity.visual_assets || []).some(a => a.kind === 'logo') || brand.logo_url) && (
                        <button className="be-btn be-btn-ghost"
                                data-testid="be-wizard-logo-clear"
                                onClick={() => {
                                  setBrand({ ...brand, logo_url: '' });
                                  setIdentity(prev => ({
                                    ...prev,
                                    visual_assets: (prev.visual_assets || []).filter(a => a.kind !== 'logo'),
                                  }));
                                }}>
                          <Icon name="trash" size={11}/>ลบโลโก้
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="be-card">
                <label className="be-label">คู่แข่งหลัก * (อย่างน้อย 1 — ใส่ได้ตามต้องการ)</label>
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

              <div className="be-card" style={{ marginTop: 14 }}>
                <label className="be-label">Custom Quality Attributes (เพิ่ม attribute เฉพาะแบรนด์นี้ — สูงสุด 5)</label>
                <div className="be-help" style={{ marginBottom: 10 }}>
                  ระบบใส่ attributes มาตรฐานให้แล้ว (Reliability · Value · Design)
                  · เพิ่ม attributes ที่สำคัญกับแบรนด์ของคุณเอง — จะใช้ทั้งบน radar และ perceptual map
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="be-input" value={qualityAttrInput}
                         onChange={e => setQualityAttrInput(e.target.value)}
                         onKeyDown={e => {
                           if (e.key === 'Enter') {
                             const v = qualityAttrInput.trim();
                             if (v && !(brand.custom_quality_attributes || []).includes(v) && (brand.custom_quality_attributes || []).length < 5) {
                               setBrand({ ...brand, custom_quality_attributes: [...(brand.custom_quality_attributes || []), v] });
                               setQualityAttrInput('');
                             }
                           }
                         }}
                         placeholder="เช่น Sustainability, Local sourcing, Origin transparency"
                         data-testid="be-wizard-qattr-input"/>
                  <button className="be-btn" data-testid="be-wizard-qattr-add"
                          onClick={() => {
                            const v = qualityAttrInput.trim();
                            if (v && !(brand.custom_quality_attributes || []).includes(v) && (brand.custom_quality_attributes || []).length < 5) {
                              setBrand({ ...brand, custom_quality_attributes: [...(brand.custom_quality_attributes || []), v] });
                              setQualityAttrInput('');
                            }
                          }}>
                    <Icon name="plus" size={11}/>เพิ่ม
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}
                     data-testid="be-wizard-qattr-list">
                  {(brand.custom_quality_attributes || []).map((c, i) => (
                    <span key={i} className="be-chip" style={{ borderColor: 'var(--be-gold)', color: 'var(--be-gold)' }}>
                      {c}
                      <button onClick={() => setBrand({
                                ...brand,
                                custom_quality_attributes: brand.custom_quality_attributes.filter((_, j) => j !== i)
                              })}
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
              <div className="be-small be-muted" style={{ lineHeight: 1.6, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--rule)' }}>
                <strong>Heads-up:</strong> ทุกคู่แข่งจะมีคำถามเปรียบเทียบใน radar/perceptual map
                · <strong>{(brand.competitors || []).length} แบรนด์</strong> = +{(brand.competitors || []).length * 5} คำถาม โดยประมาณ
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 - Identity (free-form text + visuals + AI-derive) */}
        {step === 1 && (
          <div className="be-wiz-body" data-testid="be-wizard-step-1">
            <div>
              <div className="be-wiz-head">
                <div className="be-eyebrow" style={{ marginBottom: 10 }}>STEP · 02 / 04</div>
                <h1 className="be-h1">Brand identity ที่ตั้งใจให้เป็น</h1>
                <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
                  เล่าด้วยภาษาคุณเอง + แนบรูป (logo, palette, design) — AI จะวิเคราะห์
                  สี, mood, archetype, traits ออกมาให้ จากนั้นใช้เปรียบเทียบกับ image ที่ผู้ตอบรับรู้จริง
                </div>
              </div>

              {/* FREE-FORM DESCRIPTION */}
              <div className="be-card" style={{ marginBottom: 14 }}>
                <label className="be-label">อธิบาย brand identity ด้วยภาษาตัวเอง</label>
                <textarea className="be-textarea" value={identity.description || ''}
                          onChange={e => setIdentity({ ...identity, description: e.target.value })}
                          placeholder="เช่น 'แบรนด์เน้น craft + slow living · มีกลิ่นอายญี่ปุ่นแต่ไทยร่วมสมัย · ลูกค้ารู้สึกอบอุ่นแต่ก็ดู premium · เราไม่อยากดูเหมือน Starbucks ที่ commercial เกินไป'"
                          style={{ minHeight: 120 }}
                          data-testid="be-wizard-identity-desc"/>
                <div className="be-help">ยิ่งละเอียด AI ยิ่งวิเคราะห์ได้แม่น (อย่างน้อย 20 ตัวอักษร)</div>
              </div>

              {/* VISUAL ASSETS UPLOAD */}
              <div className="be-card" style={{ marginBottom: 14 }}>
                <label className="be-label">Visual identity · อัปโหลดรูป (logo, palette, design — สูงสุด 5)</label>
                <input type="file" multiple accept="image/png,image/jpeg,image/webp"
                       onChange={e => onUploadImages(e.target.files, 'design')}
                       style={{ display: 'block', marginBottom: 12 }}
                       data-testid="be-wizard-identity-upload"/>
                <div className="be-help" style={{ marginBottom: 12 }}>
                  PNG / JPEG / WEBP · &lt; 1MB ต่อไฟล์ · ระบุประเภทแต่ละภาพหลังอัปโหลด
                </div>
                {(identity.visual_assets || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}
                       data-testid="be-wizard-identity-asset-list">
                    {identity.visual_assets.map((a, i) => (
                      <div key={i} style={{ border: '1px solid var(--rule-strong)', background: 'var(--surface)', padding: 8 }}>
                        <div style={{ width: '100%', height: 110, background: 'var(--paper-2)',
                                       display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          <img src={`data:${a.mime_type};base64,${a.image_base64}`}
                               alt={a.note || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}/>
                        </div>
                        <select value={a.kind}
                                onChange={e => setAssetKind(i, e.target.value)}
                                className="be-mono"
                                style={{ width: '100%', padding: '4px 6px', fontSize: 10.5,
                                          marginTop: 6, background: 'var(--paper)', border: '1px solid var(--rule)',
                                          textTransform: 'uppercase', letterSpacing: '0.06em' }}
                                data-testid={`be-wizard-asset-kind-${i}`}>
                          <option value="logo">LOGO</option>
                          <option value="palette">COLOR PALETTE</option>
                          <option value="design">DESIGN SAMPLE</option>
                          <option value="ad">ADVERTISEMENT</option>
                          <option value="other">OTHER</option>
                        </select>
                        <div className="be-tiny be-muted" style={{ marginTop: 4, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.note}</div>
                        <button className="be-btn be-btn-ghost be-btn-sm" onClick={() => removeAsset(i)}
                                style={{ width: '100%', marginTop: 6, color: 'var(--be-red)' }}
                                data-testid={`be-wizard-asset-remove-${i}`}>
                          <Icon name="trash" size={10}/>ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI EXTRACT BUTTON */}
              <div className="be-card" style={{ marginBottom: 14, background: '#FFFAF0', borderColor: 'var(--be-red)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div className="be-eyebrow"><span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>AI VISUAL IDENTITY EXTRACT</div>
                    <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
                      ให้ AI วิเคราะห์ description + ภาพที่อัปโหลด → คืน traits, palette, keywords, archetype
                    </div>
                  </div>
                  <button className="be-btn be-btn-red" onClick={runAIExtract}
                          disabled={extractingIdentity || (!identity.description?.trim() && !(identity.visual_assets || []).length)}
                          data-testid="be-wizard-identity-ai-run">
                    <Icon name="sparkle" size={11}/>{extractingIdentity ? 'กำลังวิเคราะห์…' : 'AI วิเคราะห์'}
                  </button>
                </div>

                {/* Show derived results */}
                {(identity.derived_traits?.length > 0 || identity.visual_palette?.length > 0) && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--rule)' }}
                       data-testid="be-wizard-identity-ai-result">
                    {identity.ai_summary && (
                      <div className="be-serif" style={{ fontSize: 13.5, fontStyle: 'italic',
                              color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
                        "{identity.ai_summary}"
                      </div>
                    )}
                    {identity.archetype && (
                      <div style={{ marginBottom: 10 }}>
                        <span className="be-eyebrow">ARCHETYPE</span>
                        <span className="be-chip" style={{ marginLeft: 8, background: 'var(--ink)', color: 'var(--paper)' }}>
                          {identity.archetype}
                        </span>
                      </div>
                    )}
                    {identity.visual_palette?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span className="be-eyebrow">PALETTE</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {identity.visual_palette.map((hex, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ width: 36, height: 36, background: hex, border: '1px solid var(--rule-strong)' }}/>
                              <span className="be-mono be-tiny" style={{ marginTop: 3 }}>{hex}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {identity.visual_keywords?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span className="be-eyebrow">VISUAL KEYWORDS</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {identity.visual_keywords.map((k, i) => <span key={i} className="be-chip">{k}</span>)}
                        </div>
                      </div>
                    )}
                    {identity.derived_traits?.length > 0 && (
                      <div>
                        <span className="be-eyebrow">DERIVED TRAITS · merged into your identity</span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {identity.derived_traits.map((t, i) => (
                            <span key={i} className="be-chip"
                                  title={t}
                                  style={{ borderColor: 'var(--be-red)', color: 'var(--be-red)' }}>{traitLabel(t)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TRAITS — quick-pick + show AI merged + manually editable */}
              <div className="be-card" style={{ marginBottom: 14 }}>
                <label className="be-label">Identity traits final · (จะใช้เปรียบเทียบกับ image ที่ผู้ตอบรับรู้)</label>
                <div className="be-help" style={{ marginBottom: 8 }}>
                  เลือกเอง หรือให้ AI สร้างให้แล้วปรับเพิ่ม-ลด · อย่างน้อย 3 ข้อ
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}
                     data-testid="be-wizard-traits">
                  {Array.from(new Set([...DEFAULT_TRAITS, ...(identity.traits || [])])).map(t => (
                    <span key={t}
                          className={'be-trait-toggle ' + (identity.traits.includes(t) ? 'sel' : '')}
                          onClick={() => toggleTrait(t)}
                          title={t}
                          data-testid={`be-wizard-trait-${t}`}>
                      {identity.traits.includes(t) && <Icon name="check" size={10}/>}
                      {traitLabel(t)}
                    </span>
                  ))}
                </div>
                <div className="be-help" style={{ marginTop: 8 }}>
                  เลือกแล้ว {identity.traits.length} / 8
                  {identity.traits.length < 3 && <span style={{ color: 'var(--be-red)', marginLeft: 8 }}>· ต้องการอย่างน้อย 3</span>}
                </div>
              </div>

              <div className="be-card" style={{ marginBottom: 14 }}>
                <label className="be-label">Brand promise (1 ประโยค)</label>
                <input className="be-input" value={identity.brand_promise || ''}
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
              <h4>Identity vs Image</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>
                ใน dashboard เราจะ <strong>match</strong> traits ที่คุณตั้งใจ (รวม AI derived) กับ open-end
                responses ของผู้ตอบ → หา <strong>aligned · lost · unintended</strong> traits
              </div>
              <h4 style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}>How AI uses visuals</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                Gemini 2.5 Flash อ่านภาพ + ข้อความ → derive สี, mood, design style, archetype
                ที่คุณอาจไม่ได้พิมพ์ตรงๆ
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
                  <div>
                    <div className="be-eyebrow" style={{ marginBottom: 10 }}>STEP · 04 / 04</div>
                    <h1 className="be-h1">ตรวจสอบคำถาม · {totalQ} ข้อ</h1>
                    <div className="be-muted be-small" style={{ marginTop: 8, maxWidth: 580 }}>
                      ระบบสร้างคำถามครอบคลุม Aaker 4 dimensions แล้ว — ลบ/regenerate/preview EN ได้ก่อนเปิดรับคำตอบ
                    </div>
                  </div>
                  <div className="be-mono be-tiny" style={{ display: 'flex', border: '1px solid var(--rule-strong)' }}>
                    {['th', 'en'].map(l => (
                      <button key={l} onClick={() => setPreviewLang(l)}
                              data-testid={`be-wizard-preview-lang-${l}`}
                              style={{ padding: '5px 12px', fontSize: 11, letterSpacing: '0.10em',
                                       background: previewLang === l ? 'var(--ink)' : 'transparent',
                                       color: previewLang === l ? 'var(--paper)' : 'var(--ink)',
                                       border: 0, cursor: 'pointer', textTransform: 'uppercase' }}>
                        {l}
                      </button>
                    ))}
                  </div>
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
                              {(previewLang === 'en' ? q.prompt_en : q.prompt_th) || q.prompt}
                              {q.required && <span style={{ color: 'var(--be-red)', marginLeft: 6 }}>*</span>}
                              {q.display_image && (
                                <span className="be-mono be-tiny" style={{ marginLeft: 8, color: 'var(--be-gold)',
                                       background: 'rgba(212,160,23,0.10)', border: '1px solid rgba(212,160,23,0.35)',
                                       padding: '1px 5px', fontSize: 9, letterSpacing: '0.06em' }}>
                                  📷 {q.display_image.kind?.toUpperCase()}
                                </span>
                              )}
                              {q.display_palette && (
                                <span className="be-mono be-tiny" style={{ marginLeft: 8, color: 'var(--be-gold)',
                                       background: 'rgba(212,160,23,0.10)', border: '1px solid rgba(212,160,23,0.35)',
                                       padding: '1px 5px', fontSize: 9, letterSpacing: '0.06em' }}>
                                  🎨 PALETTE
                                </span>
                              )}
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
                {identity.traits.map(t => <span key={t} className="be-chip" title={t}>{traitLabel(t)}</span>)}
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
          {/* Quick "Save changes" — visible on steps 0/1/2 when editing an existing study */}
          {study?.id && step < 3 && (
            <button className="be-btn" onClick={saveEdits} disabled={creating}
                    data-testid="be-wizard-save">
              <Icon name="check" size={11}/>{creating ? '…' : 'Save changes'}
            </button>
          )}
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
              <Icon name="sparkle" size={11}/>
              {creating ? 'กำลังประมวลผล…'
                        : (study?.id ? 'Update & regenerate →' : 'AI สร้างคำถาม →')}
            </button>
          )}
          {step === 3 && (
            <>
              {study?.id && study?.status && study.status !== 'draft' && (
                <button className="be-btn" onClick={saveEdits} disabled={creating}
                        data-testid="be-wizard-save-questions">
                  <Icon name="check" size={11}/>{creating ? '…' : 'Save changes'}
                </button>
              )}
              <button className="be-btn be-btn-red" onClick={launchStudy} disabled={creating || !study?.id}
                      data-testid="be-wizard-launch">
                {creating ? '…'
                          : (study?.status === 'collecting' ? 'Save & re-publish' : 'เปิดรับคำตอบ')}
                <Icon name="arrowR" size={11}/>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrandEquityWizardPage;

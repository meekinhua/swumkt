import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import './brand-equity-styles.css';
import { BeTopbar, Icon, Stepper, BeLoading, DIMENSIONS, BrandLogo } from './be-components';
import ExternalAiWorkflowModal from '@/components/ExternalAiWorkflowModal';

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
// Dual-line chip content: Thai label on top, faded EN underneath (only when they differ)
const TraitBi = ({ value }) => {
  const th = TRAIT_TH[value];
  if (!th || th === value) return <>{value}</>;  // unknown / already-Thai → single line
  return (
    <span className="be-trait-bi">
      <span className="th">{th}</span>
      <span className="en">{value}</span>
    </span>
  );
};

const PRICING = [
  { v: 'budget',  label: 'Budget' },
  { v: 'mid',     label: 'Mid-tier' },
  { v: 'premium', label: 'Premium' },
  { v: 'luxury',  label: 'Luxury' },
];

const SEGMENTS = ['age', 'gender', 'region', 'occupation', 'income', 'usage_frequency'];
const SEGMENT_LABELS = {
  age: 'ช่วงอายุ',
  gender: 'เพศ',
  region: 'ภูมิภาค',
  occupation: 'อาชีพ',
  income: 'รายได้ต่อเดือน',
  usage_frequency: 'ความถี่การใช้งาน',
};

const STEP_LABELS = ['ข้อมูลพื้นฐาน', 'อัตลักษณ์แบรนด์', 'กลุ่มผู้ตอบ', 'ตรวจสอบคำถาม'];

const BrandEquityWizardPage = () => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const { studyId } = useParams();
  const isEdit = Boolean(studyId);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewLang, setPreviewLang] = useState('th');

  const [brand, setBrand] = useState({
    name: '', logo_url: '', category: '', competitors: [], industry_context: '',
    custom_quality_attributes: [], custom_quality_attributes_reverse: [],
  });
  const [identity, setIdentity] = useState({
    traits: [], description: '', visual_assets: [],
    brand_promise: '', pricing_tier: 'mid', archetype: '',
    derived_traits: [], visual_palette: [], visual_keywords: [], ai_summary: '',
  });
  const [segments, setSegments] = useState(['age', 'gender']);
  const [target, setTarget] = useState('100');
  const [questions, setQuestions] = useState([]);
  const [study, setStudy] = useState(null);
  const [expanded, setExpanded] = useState({ awareness: true, quality: false, identity: true, loyalty: false });
  const [competitorInput, setCompetitorInput] = useState('');
  const [qualityAttrInput, setQualityAttrInput] = useState('');
  const [extractingIdentity, setExtractingIdentity] = useState(false);
  const [externalIdentityOpen, setExternalIdentityOpen] = useState(false);
  const [pendingDeleteQ, setPendingDeleteQ] = useState(null);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [launchedModal, setLaunchedModal] = useState(null);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { if (isEdit) loadStudy(); /* eslint-disable-next-line */ }, [studyId]);

  const loadStudy = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies/${studyId}`, authH);
      const s = r.data;
      setStudy(s);
      setBrand({
        custom_quality_attributes: [],
        custom_quality_attributes_reverse: [],
        ...(s.brand || {}),
      });
      setIdentity({
        traits: [], description: '', visual_assets: [],
        derived_traits: [], visual_palette: [], visual_keywords: [], ai_summary: '',
        ...s.identity,
      });
      setSegments(s.segments_to_capture || []);
      setTarget(String(s.target_responses || 100));
      setQuestions(s.questions || []);
      // Edit mode: start at Brand basics so user can adjust everything; Stepper is clickable to jump
      setStep(0);
    } catch (e) {
      toast.error('โหลด study ไม่สำเร็จ');
    }
    setLoading(false);
  };

  const validStep0 = Boolean(brand.name?.trim() && brand.category?.trim() && brand.competitors.length >= 1);
  // Enforce >= 3 traits so BI-1 Trait Pickup & Identity-vs-Image comparison always work cleanly
  const validStep1 = (identity.traits || []).length >= 3;
  const validStep2 = segments.length >= 1;
  const parsedTarget = Math.max(10, parseInt(target, 10) || 100);

  const step0MissingReason = !brand.name?.trim()
    ? 'กรุณากรอกชื่อแบรนด์'
    : !brand.category?.trim()
      ? 'กรุณากรอกหมวดสินค้า / category'
      : brand.competitors.length < 1
        ? (competitorInput.trim() ? `กดปุ่ม "+ เพิ่ม" เพื่อยืนยันคู่แข่ง "${competitorInput.trim()}"` : 'กรุณาเพิ่มคู่แข่งหลักอย่างน้อย 1 แบรนด์')
        : '';
  const step1MissingReason = (identity.traits || []).length < 3
    ? `เลือก Identity traits อย่างน้อย 3 ข้อ (เลือกแล้ว ${(identity.traits || []).length}/3)`
    : '';

  // Live question estimate for fatigue guardrail
  const compCount = (brand.competitors || []).length;
  const customCount = (brand.custom_quality_attributes || []).length;
  const estTotalQuestions = 22 + compCount * 5 + customCount * (1 + compCount);
  const estMinLo = Math.max(1, Math.ceil((questions.length || estTotalQuestions) * 15 / 60));
  const estMinHi = Math.max(estMinLo + 1, Math.ceil((questions.length || estTotalQuestions) * 25 / 60));

  const addCompetitor = () => {
    const v = competitorInput.trim();
    if (!v) return;
    if (brand.name?.trim() && v.toLowerCase() === brand.name.trim().toLowerCase()) {
      toast.error(`"${v}" เป็นชื่อแบรนด์ของคุณเอง กรุณาใส่ชื่อคู่แข่ง`);
      return;
    }
    if (brand.competitors.some(c => c.toLowerCase() === v.toLowerCase())) {
      toast.info(`มี "${v}" อยู่ในรายการคู่แข่งแล้ว`);
      return;
    }
    setBrand({ ...brand, competitors: [...brand.competitors, v] });
    setCompetitorInput('');
  };

  const addCustomQualityAttr = () => {
    const v = qualityAttrInput.trim();
    const attrs = brand.custom_quality_attributes || [];
    const revs = brand.custom_quality_attributes_reverse || [];
    if (!v) return;
    if (attrs.some(a => a.toLowerCase() === v.toLowerCase())) {
      toast.info(`มี "${v}" อยู่แล้ว`);
      return;
    }
    if (attrs.length >= 5) {
      toast.info('เพิ่ม Custom Attribute ได้สูงสุด 5 ข้อ เพื่อไม่ให้แบบสอบถามยาวเกินไป');
      return;
    }
    setBrand({
      ...brand,
      custom_quality_attributes: [...attrs, v],
      custom_quality_attributes_reverse: [...revs, false],
    });
    setQualityAttrInput('');
  };

  const toggleCustomAttrPolarity = (idx) => {
    const attrs = brand.custom_quality_attributes || [];
    const revs = attrs.map((_, i) => Boolean((brand.custom_quality_attributes_reverse || [])[i]));
    revs[idx] = !revs[idx];
    setBrand({ ...brand, custom_quality_attributes_reverse: revs });
  };

  const removeCustomAttr = (idx) => {
    const attrs = brand.custom_quality_attributes || [];
    const revs = attrs.map((_, i) => Boolean((brand.custom_quality_attributes_reverse || [])[i]));
    setBrand({
      ...brand,
      custom_quality_attributes: attrs.filter((_, j) => j !== idx),
      custom_quality_attributes_reverse: revs.filter((_, j) => j !== idx),
    });
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
      // Merge derived into local identity capped cleanly at 8 (matching manual toggle cap)
      const mergedTraits = Array.from(new Set([...(identity.traits || []), ...(d.derived_traits || [])])).slice(0, 8);
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
      toast.error('AI ภายในไม่พร้อมใช้งาน — แนะนำกด "ใช้ AI ภายนอก (ฟรี)" ข้างๆ เพื่อ Copy Prompt ไปใช้กับ ChatGPT/Gemini/Claude ได้เลย');
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

  const executeRegenerate = async () => {
    if (!study?.id) return;
    setConfirmRegenOpen(false);
    setCreating(true);
    try {
      const r = await axios.post(`${API}/brand-equity/studies/${study.id}/regenerate-questions`, {}, authH);
      setQuestions(r.data.questions || []);
      toast.success('สร้างคำถามใหม่ ' + (r.data.questions?.length || 0) + ' ข้อเรียบร้อย');
    } catch (e) {
      toast.error('สร้างคำถามใหม่ไม่สำเร็จ');
    }
    setCreating(false);
  };

  const regenerate = () => {
    if (!study?.id) return;
    if (study.status === 'collecting' && (study.response_count || 0) > 0) {
      setConfirmRegenOpen(true);
      return;
    }
    executeRegenerate();
  };

  const launchStudy = async () => {
    if (!study?.id) return;
    setCreating(true);
    try {
      const cleanBrand = { ...brand, target_responses: undefined };
      const r = await axios.put(`${API}/brand-equity/studies/${study.id}`,
        { status: 'collecting', questions,
          brand: cleanBrand, identity, segments_to_capture: segments, target_responses: parsedTarget }, authH);
      const updated = r.data || { ...study, status: 'collecting' };
      setStudy(updated);
      toast.success('Study เปิดรับคำตอบแล้ว');
      setLaunchedModal({
        studyId: study.id,
        shareToken: updated.share_token || study.share_token,
        brandName: brand.name,
        estMin: `${estMinLo}–${estMinHi}`,
      });
    } catch (e) {
      toast.error('เปิดรับคำตอบไม่สำเร็จ');
    }
    setCreating(false);
  };

  // Save edits without changing status (used for "Save changes" in edit mode)
  const saveEdits = async () => {
    if (!study?.id) return;
    setCreating(true);
    try {
      await axios.put(`${API}/brand-equity/studies/${study.id}`,
        { brand, identity, segments_to_capture: segments, target_responses: parsedTarget,
          questions }, authH);
      toast.success('บันทึกการแก้ไขเรียบร้อย');
      navigate(`/brand-equity/studies/${study.id}`);
    } catch (e) {
      toast.error('บันทึกไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    }
    setCreating(false);
  };

  const isCoreQuestion = (q) => !['open_short', 'open_long'].includes(q.type) && q.required !== false;
  const deleteQuestion = (q) => {
    if (isCoreQuestion(q)) {
      setPendingDeleteQ(q);
      return;
    }
    setQuestions(questions.filter(x => x.id !== q.id));
  };
  const confirmDeleteQuestion = () => {
    if (!pendingDeleteQ) return;
    setQuestions(questions.filter(x => x.id !== pendingDeleteQ.id));
    setPendingDeleteQ(null);
    toast.info('ลบคำถามแล้ว (กด Regenerate เพื่อดึงกลับมาได้)');
  };

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
  const estMin = estMinLo;

  return (
    <div className="be-root" data-testid="be-wizard-page">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 32px',
                    borderBottom: '1px solid var(--rule)', background: 'var(--paper)', flexWrap: 'wrap' }}>
        <button className="be-btn be-btn-ghost" onClick={() => navigate('/brand-equity')}
                data-testid="be-wizard-back">
          <Icon name="chevronL" size={11}/>รายการ Studies
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {isEdit ? 'แก้ไข · ' : 'สร้าง study ใหม่ · '}{brand.name || 'ยังไม่ตั้งชื่อ'}
        </span>
        <span className="be-chip be-mono">{(study?.status || 'draft').toUpperCase()}</span>
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
                <label className="be-label">Custom Quality Attributes (คุณลักษณะคุณภาพเฉพาะแบรนด์ — สูงสุด 5 ข้อ)</label>
                <div className="be-help" style={{ marginBottom: 10 }}>
                  ระบบใส่ attributes มาตรฐานให้แล้ว (ความน่าเชื่อถือ · ความคุ้มค่า · ดีไซน์)
                  · หากเป็นคุณลักษณะเชิงลบ (เช่น &ldquo;รอนาน&rdquo;, &ldquo;ราคาแพงเกินไป&rdquo;) ให้กดสลับเป็น <strong>เชิงลบ (Reverse)</strong> เพื่อไม่ให้คะแนนรวมผิดพลาด
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="be-input" value={qualityAttrInput}
                         onChange={e => setQualityAttrInput(e.target.value)}
                         onKeyDown={e => { if (e.key === 'Enter') addCustomQualityAttr(); }}
                         placeholder="เช่น ความยั่งยืน (Sustainability), รสชาติสม่ำเสมอ"
                         data-testid="be-wizard-qattr-input"/>
                  <button className="be-btn" data-testid="be-wizard-qattr-add"
                          onClick={addCustomQualityAttr}>
                    <Icon name="plus" size={11}/>เพิ่ม
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
                     data-testid="be-wizard-qattr-list">
                  {(brand.custom_quality_attributes || []).map((c, i) => {
                    const isRev = Boolean((brand.custom_quality_attributes_reverse || [])[i]);
                    return (
                      <span key={i} className="be-chip"
                            style={{ borderColor: isRev ? 'var(--be-red)' : 'var(--be-gold)',
                                     color: isRev ? 'var(--be-red)' : 'var(--be-gold)',
                                     display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>{c}</span>
                        <button type="button"
                                onClick={() => toggleCustomAttrPolarity(i)}
                                title="สลับขั้วคะแนน: เชิงบวก vs เชิงลบ (Reverse score)"
                                data-testid={`be-wizard-qattr-polarity-${i}`}
                                style={{ background: isRev ? 'rgba(200,16,46,0.1)' : 'rgba(212,160,23,0.12)',
                                         border: '1px solid currentColor', padding: '1px 5px',
                                         fontSize: 9.5, cursor: 'pointer', color: 'inherit' }}>
                          {isRev ? '− เชิงลบ (Reverse)' : '+ เชิงบวก'}
                        </button>
                        <button onClick={() => removeCustomAttr(i)}
                                style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'inherit' }}>
                          <Icon name="close" size={9}/>
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="be-wiz-side">
              <h4>ทำไมส่วนนี้สำคัญ</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                ระบบจะนำชื่อแบรนด์ หมวดสินค้า และคู่แข่งไปสร้างแบบสอบถามมาตรฐาน (Aaker 4 มิติ)
                เช่น &ldquo;เทียบ <strong>{brand.name || 'แบรนด์'}</strong> กับ <strong>{brand.competitors[0] || 'คู่แข่ง'}</strong>...&rdquo;
              </div>
              <div className="be-small be-muted" style={{ lineHeight: 1.6, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--rule)' }}>
                <strong>จำนวนคำถามโดยประมาณ:</strong> ~<strong>{estTotalQuestions} ข้อ</strong> (ใช้เวลา ~{estMinLo}–{estMinHi} นาที)
                <div className="be-tiny" style={{ marginTop: 4 }}>
                  คู่แข่ง {compCount} แบรนด์ (+{compCount * 5} ข้อ) · คุณลักษณะเสริม {customCount} ข้อ (+{customCount * (1 + compCount)} ข้อ)
                </div>
                {estTotalQuestions > 55 ? (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(200,16,46,0.08)',
                                border: '1px solid var(--be-red)', color: 'var(--be-red)', fontSize: 12 }}>
                    แบบสอบถามค่อนข้างยาว (&gt;55 ข้อ) ผู้ตอบบนมือถืออาจตอบไม่จบ แนะนำเลือกคู่แข่งหลัก 2–3 เจ้าครับ
                  </div>
                ) : estTotalQuestions > 40 ? (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(212,160,23,0.1)',
                                border: '1px solid var(--be-gold)', color: '#8A6300', fontSize: 12 }}>
                    คำถามประมาณ {estTotalQuestions} ข้อ — อยู่ในระดับพอดี แนะนำเก็บเฉพาะคู่แข่งหลัก 2–3 แบรนด์เพื่อลดอาการล้า
                  </div>
                ) : null}
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
                <label className="be-label">Visual identity · อัปโหลดรูปภาพ (logo, palette, design — สูงสุด 5 รูป)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <label className="be-btn" style={{ cursor: 'pointer' }}>
                    <Icon name="plus" size={11}/>อัปโหลดรูปภาพ (PNG / JPG / WEBP)
                    <input type="file" multiple accept="image/png,image/jpeg,image/webp"
                           onChange={e => { onUploadImages(e.target.files, 'design'); e.target.value = ''; }}
                           style={{ display: 'none' }}
                           data-testid="be-wizard-identity-upload"/>
                  </label>
                  <span className="be-help" style={{ margin: 0 }}>
                    &lt; 1MB ต่อไฟล์ · ระบุประเภทแต่ละภาพหลังอัปโหลด
                  </span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div className="be-eyebrow"><span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>AI VISUAL IDENTITY EXTRACT</div>
                    <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
                      ให้ AI วิเคราะห์ description + ภาพที่อัปโหลด → คืน traits, palette, keywords, archetype
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="be-btn be-btn-red"
                            type="button"
                            onClick={() => setExternalIdentityOpen(true)}
                            disabled={!identity.description?.trim() && !(identity.visual_assets || []).length && !identity.traits.length}
                            data-testid="be-wizard-identity-external-ai">
                      <Icon name="copy" size={11}/>ใช้ AI ภายนอก (ฟรี)
                    </button>
                    {isAdmin && (
                      <button className="be-btn" onClick={runAIExtract}
                              disabled={extractingIdentity || (!identity.description?.trim() && !(identity.visual_assets || []).length)}
                              data-testid="be-wizard-identity-ai-run">
                        <Icon name="sparkle" size={11}/>{extractingIdentity ? 'กำลังวิเคราะห์…' : 'AI วิเคราะห์ (Admin)'}
                      </button>
                    )}
                  </div>
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
                                  style={{ borderColor: 'var(--be-red)', color: 'var(--be-red)' }}>
                              <TraitBi value={t}/>
                            </span>
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
                      <TraitBi value={t}/>
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
              <h4 style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}>การวิเคราะห์ภาพด้วย AI</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                ระบบวิเคราะห์ภาพ + คำอธิบาย → ช่วยสกัดโทนสี, mood, สไตล์ดีไซน์ และ brand archetype ให้โดยอัตโนมัติ
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
                  Dashboard จะให้คุณเปรียบเทียบคะแนนแยกตามกลุ่มผู้ตอบเหล่านี้
                </div>
              </div>

              <div className="be-card" style={{ marginBottom: 16 }}>
                <label className="be-label">กลุ่มข้อมูลผู้ตอบ (Segments * — เลือกอย่างน้อย 1)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}
                     data-testid="be-wizard-segments">
                  {SEGMENTS.map(s => (
                    <span key={s}
                          className={'be-trait-toggle ' + (segments.includes(s) ? 'sel' : '')}
                          onClick={() => toggleSegment(s)}
                          data-testid={`be-wizard-seg-${s}`}>
                      {segments.includes(s) && <Icon name="check" size={10}/>}
                      {SEGMENT_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="be-card">
                <label className="be-label">จำนวนผู้ตอบเป้าหมาย (Target responses)</label>
                <input type="number" className="be-input" value={target} min={10}
                       onChange={e => setTarget(e.target.value)}
                       onBlur={() => setTarget(String(parsedTarget))}
                       data-testid="be-wizard-target"/>
                <div className="be-help">ต้องมีอย่างน้อย 10 คน เพื่อปลดล็อก Dashboard (แนะนำ 100+ คนสำหรับงานวิจัย)</div>
              </div>
            </div>
            <div className="be-wiz-side">
              <h4>เคล็ดลับกลุ่มตัวอย่าง</h4>
              <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
                100–200 คนขึ้นไปให้ความน่าเชื่อถือสูงสำหรับ Brand Health Check
                · สำหรับงานวิจัยวิชาการ ควรเก็บ <strong>30+ คนต่อกลุ่ม</strong> เพื่อให้ทดสอบนัยสำคัญทางสถิติ (Welch&apos;s t / ANOVA) ได้แม่นยำ
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
                    <div className="be-eyebrow"><span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>แบบสอบถามพร้อมแล้ว</div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      สร้าง <strong>{totalQ} คำถาม</strong> ครอบคลุม 4 dimensions · ปรับตามบริบท <strong>{brand.name}</strong>
                    </div>
                    <div className="be-tiny be-muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                      สร้างจาก <strong>คลังคำถามมาตรฐาน (Aaker framework)</strong> โดยแทนชื่อแบรนด์/คู่แข่ง/หมวดสินค้าลงในแม่แบบ
                      — ไม่ใช่การเขียนคำถามด้วย AI · AI จะเข้ามาช่วยตอนวิเคราะห์ผล (จัดกลุ่มคำตอบปลายเปิดและสรุป insight)
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
                        {dq.map(q => {
                          const isCore = isCoreQuestion(q);
                          return (
                          <div key={q.id} className="be-qrow" data-testid={`be-wizard-q-${q.id}`}>
                            <div className="be-qid">{q.template_id || q.id.slice(0, 5)}</div>
                            <div className="be-qprompt">
                              {(previewLang === 'en' ? q.prompt_en : q.prompt_th) || q.prompt}
                              {q.required && <span style={{ color: 'var(--be-red)', marginLeft: 6 }}>*</span>}
                              <span className="be-mono be-tiny" style={{
                                marginLeft: 8,
                                color: isCore ? 'var(--ink-2)' : 'var(--ink-4)',
                                border: '1px solid var(--rule)',
                                padding: '1px 5px', fontSize: 9,
                              }}>
                                {isCore ? 'CORE SCORED' : 'OPTIONAL'}
                              </span>
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
                              <button title={isCore ? 'ลบคำถามหลัก (ต้องยืนยัน)' : 'ลบคำถาม'} onClick={() => deleteQuestion(q)}
                                      data-testid={`be-wizard-q-delete-${q.id}`}>
                                <Icon name="trash" size={11}/>
                              </button>
                            </div>
                          </div>
                          );
                        })}
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
                {identity.traits.map(t => <span key={t} className="be-chip" title={t}><TraitBi value={t}/></span>)}
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
          <Icon name="chevronL" size={11}/>ย้อนกลับ
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {step === 0 && step0MissingReason && (
            <span className="be-tiny" style={{ color: 'var(--be-red)' }} data-testid="be-wizard-step0-hint">
              {step0MissingReason}
            </span>
          )}
          {step === 1 && step1MissingReason && (
            <span className="be-tiny" style={{ color: 'var(--be-red)' }} data-testid="be-wizard-step1-hint">
              {step1MissingReason}
            </span>
          )}
          <span className="be-mono be-tiny be-muted">
            {step === 3 ? `${totalQ} ข้อ · 4 มิติ · ~${estMinLo}–${estMinHi} นาที` : `ขั้นตอน ${step + 1} / 4`}
          </span>
          {/* Quick "Save changes" — visible on steps 0/1/2 when editing an existing study */}
          {study?.id && step < 3 && (
            <button className="be-btn" onClick={saveEdits} disabled={creating}
                    title="บันทึกเมตาข้อมูลเดิมโดยไม่สร้างคำถามใหม่ (หากเปลี่ยนคู่แข่ง/คุณลักษณะ ให้กดอัปเดตและสร้างคำถามใหม่)"
                    data-testid="be-wizard-save">
              <Icon name="check" size={11}/>{creating ? '…' : 'บันทึกค่าที่แก้'}
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
                        : (study?.id ? 'อัปเดตและสร้างคำถามใหม่ →' : 'สร้างชุดคำถามมาตรฐาน (Aaker) →')}
            </button>
          )}
          {step === 3 && (
            <>
              {study?.id && study?.status && study.status !== 'draft' && (
                <button className="be-btn" onClick={saveEdits} disabled={creating}
                        data-testid="be-wizard-save-questions">
                  <Icon name="check" size={11}/>{creating ? '…' : 'บันทึกการแก้ไข'}
                </button>
              )}
              <button className="be-btn be-btn-red" onClick={launchStudy} disabled={creating || !study?.id}
                      data-testid="be-wizard-launch">
                {creating ? '…'
                          : (study?.status === 'collecting' ? 'บันทึกและเปิดรับต่อ' : 'เปิดรับคำตอบ')}
                <Icon name="arrowR" size={11}/>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirm deleting a core scored question */}
      {pendingDeleteQ && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.45)', zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="be-card" style={{ maxWidth: 440, width: '100%' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-red)', marginBottom: 8 }}>CONFIRM DELETE CORE ITEM</div>
            <div className="be-h3" style={{ marginBottom: 10 }}>ลบคำถามหลัก ({pendingDeleteQ.template_id})?</div>
            <div className="be-small be-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
              ข้อนี้ถูกใช้คำนวณคะแนนมาตรฐาน Aaker หากลบออกจะแสดงคำเตือน Partial Data บน Dashboard (สามารถกด Regenerate กลับมาใหม่ได้ก่อนเปิดรับจริง)
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="be-btn be-btn-ghost" onClick={() => setPendingDeleteQ(null)}>ยกเลิก</button>
              <button className="be-btn be-btn-red" onClick={confirmDeleteQuestion}>ยืนยันลบข้อนี้</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm regenerating questions on a live collecting study */}
      {confirmRegenOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.45)', zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="be-card" style={{ maxWidth: 460, width: '100%' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-gold)', marginBottom: 8 }}>LIVE STUDY WARNING</div>
            <div className="be-h3" style={{ marginBottom: 10 }}>สร้างชุดคำถามใหม่ระหว่างเก็บข้อมูล?</div>
            <div className="be-small be-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
              Study นี้กำลังเปิดรับคำตอบอยู่ (มีแล้ว {study?.response_count || 0} คำตอบ) การสร้างคำถามใหม่จะเริ่ม Wave ใหม่และรีเซ็ตคำถามที่เคยลบไว้ด้วยตัวเอง
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="be-btn be-btn-ghost" onClick={() => setConfirmRegenOpen(false)}>ยกเลิก</button>
              <button className="be-btn be-btn-red" onClick={executeRegenerate}>ยืนยันสร้างคำถามใหม่</button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Launch Collect & Share Hub Modal */}
      {launchedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.5)', zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
             data-testid="be-wizard-launched-modal">
          <div className="be-card" style={{ maxWidth: 520, width: '100%' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-green)', marginBottom: 8 }}>SURVEY IS LIVE</div>
            <h2 className="be-h2" style={{ marginBottom: 8 }}>เปิดรับคำตอบสำหรับ {launchedModal.brandName} แล้ว</h2>
            <div className="be-small be-muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>
              แชร์ลิงก์ด้านล่างให้กลุ่มตัวอย่าง (เวลาตอบโดยประมาณ {launchedModal.estMin} นาที) เมื่อได้ครบ 10 คำตอบ Dashboard จะเปิดผลคะแนนอัตโนมัติ
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--paper-2)', border: '1px solid var(--rule-strong)',
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, wordBreak: 'break-all', marginBottom: 12 }}>
              {`${window.location.origin}/brand-equity/respond/${launchedModal.shareToken}`}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="be-btn be-btn-primary" onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/brand-equity/respond/${launchedModal.shareToken}`);
                  toast.success('คัดลอกลิงก์แบบสอบถามแล้ว');
                }} data-testid="be-wizard-launched-copy">
                  <Icon name="copy" size={11}/>คัดลอกลิงก์แบบสอบถาม
                </button>
                <a className="be-btn"
                   href={`/brand-equity/respond/${launchedModal.shareToken}`}
                   target="_blank" rel="noreferrer">
                  ทดลองเปิดดูหน้าแบบสอบถาม ↗
                </a>
              </div>
              <button className="be-btn be-btn-red"
                      onClick={() => navigate(`/brand-equity/studies/${launchedModal.studyId}`)}
                      data-testid="be-wizard-launched-dashboard">
                ไปที่ Dashboard <Icon name="arrowR" size={11}/>
              </button>
            </div>
          </div>
        </div>
      )}

      <ExternalAiWorkflowModal
        open={externalIdentityOpen}
        onClose={() => setExternalIdentityOpen(false)}
        title="สกัดอัตลักษณ์แบรนด์ด้วย AI ภายนอก (ฟรี)"
        subtitle="คัดลอก Prompt ที่มีข้อมูลแบรนด์ของคุณไปรันใน ChatGPT / Gemini / Claude แล้วนำ JSON กลับมาวาง"
        extraHint={(identity.visual_assets || []).length > 0
          ? `คุณอัปโหลดภาพไว้ ${identity.visual_assets.length} ภาพ — แนะนำให้แนบภาพโลโก้/พาเลตต์สีเดียวกันในแชท AI พร้อม Prompt เพื่อสกัดรหัสสี hex ได้แม่นที่สุด`
          : ''}
        fetchPrompt={async () => {
          const r = await axios.post(`${API}/brand-equity/external-ai/identity-prompt`, {
            brand_name: brand.name || 'Brand',
            category: brand.category || '',
            description: identity.description || '',
            traits: identity.traits || [],
            brand_promise: identity.brand_promise,
            pricing_tier: identity.pricing_tier,
            image_notes: (identity.visual_assets || []).map(a => a.kind || 'design'),
          }, authH);
          return r.data;
        }}
        validatePayload={async (rawText) => {
          const r = await axios.post(`${API}/brand-equity/external-ai/identity-import`, {
            raw_text: rawText,
          }, authH);
          return r.data;
        }}
        applyPayload={async (_rawText, validation) => {
          const d = validation?.data || {};
          const mergedTraits = Array.from(new Set([...(identity.traits || []), ...(d.derived_traits || [])])).slice(0, 8);
          setIdentity(prev => ({
            ...prev,
            traits: mergedTraits,
            derived_traits: d.derived_traits || [],
            visual_palette: d.visual_palette || [],
            visual_keywords: d.visual_keywords || [],
            ai_summary: d.summary || '',
            archetype: d.archetype || prev.archetype,
          }));
          toast.success(`นำเข้าผลอัตลักษณ์แบรนด์สำเร็จ (${(d.derived_traits || []).length} traits)`);
        }}
        renderPreview={(preview) => (
          <div className="space-y-1.5">
            <div><strong>Archetype:</strong> {preview.archetype} · <strong>Traits ({preview.trait_count}):</strong> {(preview.derived_traits || []).join(', ')}</div>
            {preview.visual_palette?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <strong>Palette:</strong>
                {preview.visual_palette.map(hex => (
                  <span key={hex} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded border text-[11px] font-mono">
                    <span className="w-3 h-3 rounded-sm inline-block border" style={{ background: hex }} />
                    {hex}
                  </span>
                ))}
              </div>
            )}
            <div className="text-gray-700 italic">&ldquo;{preview.summary}&rdquo;</div>
          </div>
        )}
      />
    </div>
  );
};

export default BrandEquityWizardPage;

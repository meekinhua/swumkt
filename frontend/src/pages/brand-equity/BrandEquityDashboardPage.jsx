import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard } from '@/lib/clipboard';
import './brand-equity-styles.css';
import {
  BeTopbar, Icon, ScoreRing, RadarChart, HBar, Histogram, NPSBar, Matrix2x2,
  IdentityImageMap, AIInsightCard, WordCloud, PerceptualMap, BeLoading, StatusPill, DIMENSIONS,
  BrandLogo, SWU_LOGO_URL, AIProgressCard, BeWaveSelector, MigrationOrphanBanner
} from './be-components';
import { BeFilterBar } from './BeFilterBar';
import { BeMethodology } from './BeMethodology';
import {
  useBeAiAnalysis, BeAiAnalysisPanel, BeExternalAiDialog, Provenance, CodingBadge, StaleAiNote,
  aiStatusLabel,
} from './BeAiAnalysis';
import { BeCodingPanel } from './BeCoding';
import { BeThesisExport } from './BeThesisExport';
import { BeSummary } from './BeSummary';
import {
  BeDisclosure, BeReliabilityDetail, BePairedComparisons, BeSensitivity, BeDataQuality,
  BeQualityToggle, BeItemTable, BeMethodsParagraph, BeRawExport,
} from './BeStats';
import { buildFilterQS as buildQS, isFilterActive, fmt1, fmt2, fmtPct, fmtCI, hash01, errText } from './beUtils';
import { BeWeightEditor } from './BeWeightEditor';
import { BeScoreHistory, BeUnfinishedCard } from './BeScoreHistory';
import { BeSegmentSignificance } from './BeSegmentSignificance';
import { getBrandHealthTier } from '@/lib/brandHealthVerdict';
import useDocumentMeta from '@/hooks/useDocumentMeta';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Brand-health tier. Delegates to the ONE canonical scale in
// `@/lib/brandHealthVerdict` — this used to be a private 3-tier mapping
// (>=70 Healthy / >=40 At watch) while the methodology box further down THIS
// page, the home-page card, the social preview and the exported thesis all used
// the 5-tier scale. A BES of 62 was headlined "เฝ้าระวัง" here and called
// "สุขภาพดี" a few hundred pixels lower.
const tierFor = (s) => {
  const t = getBrandHealthTier(s);
  return { name: t.label, th: t.labelTh, color: t.color };
};

const findStat = (questions, kindOrType, dim) => {
  return questions.find(q => (q.kind === kindOrType || q.type === kindOrType) && (!dim || q.dimension === dim));
};

// ============ Partial-data warning ============
// For every Aaker dimension we list the "core" question kinds that the scoring
// formula expects. If any are missing from the study (e.g. user removed them
// in the wizard), we surface a big red asterisk on the section header so the
// reader understands why the score might look low/odd. The composite is still
// computed from whatever signal IS present — only the warning is added.
const EXPECTED_KINDS_BY_DIM = {
  awareness: [
    { kind: 'unaided_top_of_mind', label: 'Top-of-Mind (AW-1)' },
    { kind: 'unaided_recall',      label: 'Unaided Recall (AW-2)' },
    { kind: 'aided_recognition',   label: 'Aided Recognition (AW-3)' },
    { kind: 'brand_familiarity',   label: 'Familiarity (AW-4)' },
  ],
  quality: [
    { kind: 'overall_quality', label: 'Overall Quality (PQ-1)' },
    { kind: '__attribute_any__', label: 'Quality attributes (PQ-2..)' },
  ],
  identity: [
    { kind: 'image_traits_aided',    label: 'Trait pickup (BI-1)' },
    { kind: 'brand_promise_match',   label: 'Brand Promise (BI-4)' },
    { kind: 'image_one_word',        label: 'One-word image (BI-3)' },
  ],
  loyalty: [
    { kind: 'nps',                  label: 'NPS (LY-1)' },
    { kind: 'repeat_intent',        label: 'Repeat intent (LY-2)' },
    { kind: 'switching_resistance', label: 'Switching resistance (LY-3)' },
  ],
};

const getMissingKinds = (qs, dim) => {
  const expected = EXPECTED_KINDS_BY_DIM[dim] || [];
  const present = new Set();
  (qs || []).forEach(q => {
    if (q.dimension !== dim) return;
    if (!q.stats || !q.stats.n) return;
    if ((q.kind || '').startsWith('attribute_')) present.add('__attribute_any__');
    if (q.kind) present.add(q.kind);
  });
  return expected.filter(e => !present.has(e.kind));
};

const PartialDataWarning = ({ missing, dimLabel }) => {
  if (!missing || missing.length === 0) return null;
  return (
    <div className="be-partial-warning"
         data-testid={`be-partial-warning-${(dimLabel || '').toLowerCase()}`}
         role="note"
         aria-label={`ข้อมูล ${dimLabel} ไม่ครบ`}>
      <span className="be-partial-asterisk" aria-hidden="true">✱</span>
      <div className="be-partial-text">
        <div className="be-partial-headline">
          ข้อมูลไม่ครบ — score คำนวณจากข้อมูลเท่าที่มี
        </div>
        <div className="be-partial-detail">
          ขาดคำถามหลัก ({missing.length}) :{' '}
          {missing.map((m, i) => (
            <span key={m.kind} className="be-partial-chip" data-testid={`be-partial-missing-${m.kind}`}>
              {m.label}{i < missing.length - 1 ? '' : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// Document head for public showcase pages — sets <title>, OG/Twitter cards,
// and JSON-LD structured data so social shares (LINE, Facebook, Twitter) and
// Google show a proper preview with brand name, logo, and key score.
const ShowcaseHead = ({ study, score, tier, responseCount }) => {
  const brand = study?.brand || {};
  const identity = study?.identity || {};
  const logoAsset = (identity.visual_assets || []).find(a => a?.kind === 'logo');
  const inlineLogo = logoAsset?.image_base64
    ? `data:${logoAsset.mime_type || 'image/png'};base64,${logoAsset.image_base64}`
    : null;
  const externalLogo = brand.logo_url && /^https?:\/\//i.test(brand.logo_url) ? brand.logo_url : null;
  // Prefer external URL over base64 for social previews (Facebook strips data: URIs)
  const ogImage = externalLogo || inlineLogo || SWU_LOGO_URL;

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const title = `${brand.name || 'Brand'} · Brand Health Check — SWU MKT`;
  const description = brand.name
    ? `${brand.name} (${brand.category || 'brand'}) — Brand Equity score ${score}/100 · ${tier?.name || ''} · ${responseCount} respondents · Awareness, Quality, Identity & Loyalty insights.`
    : 'Public Brand Health Check report by SWU Marketing Research.';

  useDocumentMeta({
    title,
    description,
    image: ogImage,
    url,
    type: 'article',
    jsonLd: brand.name ? {
      '@context': 'https://schema.org',
      '@type': 'Report',
      name: title,
      headline: title,
      description,
      url,
      about: {
        '@type': 'Brand',
        name: brand.name,
        ...(externalLogo ? { logo: externalLogo } : {}),
      },
      publisher: {
        '@type': 'Organization',
        name: 'SWU Marketing Research',
        logo: { '@type': 'ImageObject', url: SWU_LOGO_URL },
      },
    } : null,
  });
  return null;
};

const GLOSSARY = [
                ['t2b', 'TOP-2-BOX (T2B)', 'สัดส่วนคนที่ตอบ 2 ระดับบนสุดของมาตรวัด (เช่น 6-7 จาก 7) = "กลุ่มที่เห็นด้วยชัดเจน"'],
                ['b2b', 'BOTTOM-2-BOX (B2B)', 'สัดส่วนคนที่ตอบ 2 ระดับล่างสุด (1-2) = "กลุ่มที่ไม่เห็นด้วยชัดเจน"'],
                ['netq', 'NET Q-SCORE', 'T2B − B2B · บวก = คนชมมากกว่าคนติ, ลบ = คนติมากกว่าคนชม (ช่วง −100 ถึง +100)'],
                ['sd', 'σ (SD)', 'ส่วนเบี่ยงเบนมาตรฐาน — ยิ่งสูง ความเห็นยิ่งกระจาย (คนเห็นต่างกันมาก) แม้ค่าเฉลี่ยจะเท่ากัน'],
                ['pomp', 'คะแนน 0-100 (POMP)', '(ค่าเฉลี่ย − 1) / (สูงสุด − 1) × 100 — แปลงทุกมาตรวัดให้เทียบกันได้ ต่ำสุด = 0 สูงสุด = 100'],
                ['ci', '95% CI', 'ช่วงที่ค่าจริงของประชากรน่าจะอยู่ · ยิ่งผู้ตอบน้อย ช่วงยิ่งกว้าง = ตัวเลขยังไม่นิ่ง'],
                ['alpha', 'α (Cronbach\u2019s alpha)', 'วัดว่าคำถามในมิติเดียวกันวัดเรื่องเดียวกันไหม · ที่ยอมรับกันคือ ≥ 0.70'],
                ['nps', 'NPS', '% ผู้แนะนำ (9-10) − % ผู้ไม่แนะนำ (0-6) · ช่วง −100 ถึง +100 · แสดงเป็น 0-100 ด้วยสูตร (NPS+100)/2'],
                ['n', 'n', 'จำนวนคนที่ตอบคำถามนั้นจริง — ไม่ใช่จำนวนผู้ตอบทั้ง study เพราะบางข้อไม่บังคับตอบ'],
              ];

const BrandEquityDashboardPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  // Detect showcase mode via URL: /showcase/:token (public, no auth)
  const isShowcase = location.pathname.startsWith('/showcase/');
  const studyId = params.studyId;       // owner mode key
  const shareToken = params.token;      // showcase mode key
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloading, setReloading] = useState(false);
  const [activeSegment, setActiveSegment] = useState('all');
  const [togglingShowcase, setTogglingShowcase] = useState(false);

  // ---------- Filter state (time + segments + wave) ----------
  // wave-A is the "active" filter applied to all stats/charts/AI.
  const [filter, setFilter] = useState({ from: '', to: '', segments: {}, wave: 'all' });
  const [excludeFlagged, setExcludeFlagged] = useState(false);
  const [compareFilter, setCompareFilter] = useState(null); // null = compare off
  const [compareData, setCompareData] = useState(null);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  // Same params the AI / export endpoints receive (no exclude_flagged: AI results
  // are keyed by the time/segment/wave slice only).
  const buildFilterQS = (f) => buildQS(f);

  // Fetch dashboard data — refetches whenever the active filter changes
  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [studyId, shareToken, filter.from, filter.to, filter.wave, JSON.stringify(filter.segments), excludeFlagged]);

  // Wave compare: fetch when compareFilter set (owner only)
  useEffect(() => {
    if (!compareFilter || isShowcase || !studyId) {
      setCompareData(null);
      return;
    }
    (async () => {
      try {
        const r = await axios.post(
          `${API}/brand-equity/studies/${studyId}/compare`,
          { wave_a: filter, wave_b: compareFilter },
          authH,
        );
        setCompareData(r.data);
      } catch (e) {
        toast.error('โหลดการเปรียบเทียบ wave ไม่สำเร็จ');
        setCompareData(null);
      }
    })();
    /* eslint-disable-next-line */
  }, [compareFilter, filter.from, filter.to, JSON.stringify(filter.segments)]);

  // `silent` = refresh in place (after an import / coding change) without blanking the page.
  const load = async (silent) => {
    if (silent === true || data) setReloading(true); else setLoading(true);
    setLoadError('');
    try {
      const qs = buildQS(filter, [excludeFlagged ? 'exclude_flagged=true' : '']);
      if (isShowcase) {
        // PUBLIC fetch — no auth header
        const r = await axios.get(`${API}/brand-equity/showcase/${shareToken}${qs}`);
        // Normalize the showcase payload to the same { study, aggregate, ai_cache, ready_for_dashboard }
        // shape the rest of this component already understands.
        const sd = r.data;
        setData({
          study: {
            id: sd.id,
            share_token: sd.share_token,
            status: sd.status,
            brand: sd.brand,
            // Use server-sanitized identity (traits, brand_promise, archetype, ai_summary,
            // visual_palette, visual_keywords, visual_assets) so the Identity-vs-Image
            // section renders the brand's intended identity properly. Falls back to a
            // logo-only object for older payloads that don't return identity yet.
            identity: sd.identity || (sd.logo_asset ? { visual_assets: [sd.logo_asset] } : { visual_assets: [] }),
            target_responses: sd.target_responses,
            is_public_showcase: true,
          },
          aggregate: sd.aggregate,
          ai_cache: sd.ai_cache,
          ready_for_dashboard: sd.ready_for_dashboard,
          responses_total: sd.responses_total,
          responses_filtered: sd.responses_filtered,
          segments_available: sd.segments_available,
          filter: sd.filter,
        });
      } else {
        const r = await axios.get(`${API}/brand-equity/studies/${studyId}/dashboard${qs}`, authH);
        setData(r.data);
        ai.resumeIfRunning(r.data.ai_cache);
      }
    } catch (e) {
      const msg = isShowcase ? 'Showcase ไม่พร้อมใช้งาน' : errText(e, 'โหลด dashboard ไม่สำเร็จ');
      setLoadError(msg);
      if (data) toast.error(msg);
    }
    setLoading(false);
    setReloading(false);
  };

  // ---------- AI analysis (system or the user's own AI), same filter as the view ----------
  const ai = useBeAiAnalysis({
    studyId, token, filter, reload: () => load(true), enabled: !isShowcase,
  });

  // ---------- Thesis export eligibility (non-AI DOCX needs admin / whitelist) ----------
  const [canExportThesis, setCanExportThesis] = useState(false);
  const [weightEditorOpen, setWeightEditorOpen] = useState(false);
  useEffect(() => {
    if (isShowcase || !studyId) { setCanExportThesis(false); return; }
    (async () => {
      try {
        const r = await axios.get(`${API}/brand-equity/thesis-eligible`, authH);
        setCanExportThesis(!!r.data?.eligible);
      } catch (e) { setCanExportThesis(false); }
    })();
    /* eslint-disable-next-line */
  }, [studyId, isShowcase]);

  const launch = async () => {
    try {
      await axios.put(`${API}/brand-equity/studies/${studyId}`, { status: 'collecting' }, authH);
      toast.success('Study เปิดรับคำตอบแล้ว');
      load(true);
    } catch (e) { toast.error('ไม่สำเร็จ'); }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/brand-equity/respond/${data.study.share_token}`;
    copyToClipboard(url, { successMessage: 'คัดลอก link แล้ว' });
  };

  const copyShowcaseLink = () => {
    // Use /api/share/... bridge so Facebook/LINE/Twitter previews show
    // brand-specific OG title + image (bots don't run our React useDocumentMeta).
    const url = `${window.location.origin}/api/share/showcase/${data.study.share_token}`;
    copyToClipboard(url, { successMessage: 'คัดลอก showcase link พร้อม preview แล้ว' });
  };

  const toggleShowcase = async () => {
    if (!data?.study?.id) return;
    const next = !data.study.is_public_showcase;
    setTogglingShowcase(true);
    try {
      await axios.put(`${API}/brand-equity/studies/${data.study.id}`,
        { is_public_showcase: next }, authH);
      toast.success(next ? 'เปิด public showcase แล้ว' : 'ปิด public showcase แล้ว');
      // Optimistic update without full reload
      setData(prev => ({ ...prev, study: { ...prev.study, is_public_showcase: next } }));
    } catch (e) {
      toast.error('สลับโหมดไม่สำเร็จ');
    }
    setTogglingShowcase(false);
  };

  if (loading && !data) return <div className="be-root"><BeLoading text="กำลังโหลด dashboard…"/></div>;
  if (!data) {
    return (
      <div className="be-root" data-testid="be-dashboard-error">
        <div className="be-page">
          <div className="be-error-state" role="alert" style={{ marginTop: 40 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{loadError || 'โหลดข้อมูลไม่สำเร็จ'}</div>
            <div className="be-small be-muted" style={{ marginBottom: 12 }}>
              {isShowcase ? 'ลิงก์ showcase อาจถูกปิดหรือหมดอายุ' : 'ตรวจการเชื่อมต่อแล้วลองอีกครั้ง หรือกลับไปหน้ารายการ'}
            </div>
            <button type="button" className="be-btn" onClick={() => load()}><Icon name="refresh" size={11}/>ลองอีกครั้ง</button>
            {!isShowcase && <button type="button" className="be-btn be-btn-ghost" style={{ marginLeft: 8 }} onClick={() => navigate('/brand-equity')}>กลับไปรายการ</button>}
          </div>
        </div>
      </div>
    );
  }

  const { study, aggregate, ai_cache, ready_for_dashboard } = data;
  const composite = aggregate?.composite || {};
  const score = Math.round(composite.overall || 0);
  const tier = tierFor(score);
  const agg = aggregate;
  // Lowest per-dimension coverage the backend reported. `composite_meta[d].coverage`
  // was already computed server-side as the incomplete-data flag but nothing
  // rendered it, so a headline resting on a third of its designed signals looked
  // exactly like one resting on all of them.
  const coverages = Object.values(aggregate?.composite_meta || {})
    .map(m => (typeof m?.coverage === 'number' ? m.coverage : null))
    .filter(v => v !== null);
  const minCoverage = coverages.length ? Math.min(...coverages) : null;
  const responseCount = aggregate?.total_responses || 0;
  const targetN = study.target_responses || 100;
  const isOwner = !isShowcase;
  const filterActive = isFilterActive(filter);
  const nFiltered = data.responses_filtered ?? responseCount;
  const nTotal = data.responses_total ?? responseCount;
  const quality = data.quality_filter;
  const aiRunning = ai.running;
  const schemaV = agg?.schema_version;

  return (
    <div className="be-root" data-testid={isShowcase ? 'be-showcase-page' : 'be-dashboard-page'}>
      {isShowcase && (
        <ShowcaseHead study={study} score={score} tier={tier} responseCount={responseCount}/>
      )}      {isShowcase ? (
        <div className="be-public-topbar" data-testid="be-showcase-topbar">
          <div className="be-public-brand">
            <img src={SWU_LOGO_URL} alt="SWUMKT Logo" className="be-public-logo"/>
            <span className="be-public-text">
              <span className="be-public-name">SWU · Marketing Research</span>
              <span className="be-public-sub be-mono">BRAND HEALTH CHECK · PUBLIC SHOWCASE</span>
            </span>
          </div>
          <a href="/" className="be-mono be-tiny"
             style={{ padding: '6px 12px', border: '1px solid var(--rule-strong)',
                      textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--ink)' }}>
            Powered by SWU MKT →
          </a>
        </div>
      ) : (
        <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                  right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/brand-equity')}>
                           <Icon name="chevronL" size={10}/>Studies
                         </button>}/>
      )}

      <div className="be-page">
        {/* HERO */}
        <div className="be-hero" data-testid="be-dashboard-hero">
          <div className="be-hero-row1">
            <div className="be-hero-brand">
              <BrandLogo brand={study.brand} identity={study.identity}
                         size={56}
                         gradient="linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)"
                         testid="be-dashboard-brand-logo"/>
              <div>
                <div className="be-eyebrow" style={{ marginBottom: 4 }}>
                  STUDY · BE-{study.id?.slice(0, 8).toUpperCase()}
                </div>
                <h1 className="be-h1" style={{ fontSize: 32 }}>
                  {study.brand?.name}
                  <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 16, marginLeft: 10,
                                 fontFamily: 'IBM Plex Sans Thai' }}>Brand Health Check</span>
                </h1>
                <div className="be-mono be-tiny be-muted" style={{ marginTop: 6 }}>
                  {study.brand?.category} · n = {responseCount} / เป้า {targetN} ({fmtPct(responseCount / targetN * 100)})
                </div>
                {study.is_simulated && (
                  <div className="be-mono be-tiny" data-testid="be-simulated-badge"
                       style={{ marginTop: 8, display: 'inline-block', padding: '2px 8px',
                                border: '1px dashed var(--be-gold)', color: 'var(--be-gold)',
                                letterSpacing: '0.08em' }}>
                    ⚠ ข้อมูลจำลอง · SIMULATED DATA — ใช้สาธิต/ทดสอบระบบ ไม่ใช่ผลสำรวจจริง
                  </div>
                )}
              </div>
            </div>
            {!isShowcase ? (
              <div className="be-hero-actions">
                <StatusPill status={study.status}/>
                <button className="be-btn" onClick={() => navigate(`/brand-equity/studies/${study.id}/edit`)}
                        data-testid="be-dashboard-edit">
                  <Icon name="edit" size={11}/>Edit study
                </button>
                {study.status === 'draft' && (
                  <button className="be-btn be-btn-red" onClick={launch} data-testid="be-dashboard-launch">
                    <Icon name="arrowR" size={11}/>เปิดรับคำตอบ
                  </button>
                )}
                <button className="be-btn" onClick={copyShareLink} data-testid="be-dashboard-share">
                  <Icon name="share" size={11}/>Copy share link
                </button>
                <button className={'be-btn ' + (study.is_public_showcase ? 'be-btn-primary' : '')}
                        onClick={toggleShowcase}
                        disabled={togglingShowcase || !ready_for_dashboard}
                        title={!ready_for_dashboard ? 'ต้องมีอย่างน้อย 10 คำตอบก่อน publish' : ''}
                        data-testid="be-dashboard-showcase-toggle">
                  <Icon name="external" size={11}/>
                  {togglingShowcase ? '…'
                    : study.is_public_showcase ? 'Showcase: ON' : 'Publish as showcase'}
                </button>
                {study.is_public_showcase && (
                  <button className="be-btn" onClick={copyShowcaseLink}
                          data-testid="be-dashboard-showcase-copy">
                    <Icon name="copy" size={11}/>Copy showcase URL
                  </button>
                )}
                <button className="be-btn" onClick={() => setWeightEditorOpen(true)}
                        data-testid="be-dashboard-weights">
                  <Icon name="edit" size={11}/>น้ำหนักมิติ
                </button>
                <button className="be-btn" onClick={() => load(true)} disabled={reloading} data-testid="be-dashboard-refresh">
                  <Icon name="refresh" size={11}/>{reloading ? 'กำลังโหลด…' : 'Refresh'}
                </button>
                <button type="button" className="be-btn be-btn-primary" data-testid="be-dashboard-run-ai-jump"
                        onClick={() => document.getElementById('be-ai-panel')?.scrollIntoView({ behavior: 'smooth' })}>
                  <Icon name="sparkle" size={11}/>{aiRunning ? 'AI กำลังทำงาน…' : 'วิเคราะห์ด้วย AI ↓'}
                </button>
              </div>
            ) : (
              <div className="be-hero-actions">
                <StatusPill status={study.status}/>
                {(study.status === 'collecting' || study.status === 'analyzing') && (
                  <a className="be-btn be-btn-red"
                     href={`/brand-equity/respond/${data.study.share_token}`}
                     data-testid="be-showcase-take-survey">
                    <Icon name="arrowR" size={11}/>ร่วมตอบแบบสอบถาม
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="be-hero-row2">
            <div className="be-score-block">
              <div className="be-ring">
                <ScoreRing value={score} size={148} stroke={9}/>
                <div className="be-ring-inner">
                  <div className="be-data" style={{ fontSize: 44 }}>{score}</div>
                  <div className="be-mono be-tiny be-muted">/ 100</div>
                </div>
              </div>
              <div className="be-score-meta">
                <div className="be-eyebrow">BRAND EQUITY SCORE</div>
                <div className="be-tier-line">
                  <span className="be-tier" style={{ color: tier.color }}>{tier.name}</span>
                  <span className="be-mono be-tiny be-muted">{tier.th}</span>
                </div>
                {/* Note comes from the same canonical tier as the label above,
                    so the headline and its explanation cannot disagree. */}
                <div className="be-muted be-small" style={{ maxWidth: 320, lineHeight: 1.55, marginTop: 4 }}>
                  {getBrandHealthTier(score).note}
                </div>
                {agg?.sample_adequacy && (
                  <div className="be-small" data-testid="be-sample-adequacy"
                       style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 340,
                                color: agg.sample_adequacy.level === 'insufficient' ? 'var(--be-red)'
                                     : agg.sample_adequacy.level === 'provisional' ? 'var(--be-gold)' : 'var(--ink-3)' }}>
                    {(agg.sample_adequacy.level === 'insufficient' || agg.sample_adequacy.level === 'provisional') ? '⚠ ' : ''}
                    n = {nFiltered}{agg.sample_adequacy.moe_95_pct != null ? ` · ±${fmt1(agg.sample_adequacy.moe_95_pct)} จุด (95%)` : ''}
                  </div>
                )}
                {minCoverage != null && minCoverage < 1 && (
                  <div className="be-small" data-testid="be-coverage-warning"
                       style={{ marginTop: 6, color: 'var(--be-gold)', maxWidth: 340, lineHeight: 1.5 }}>
                    ⚠ คะแนนนี้ยังไม่ครบทุกสัญญาณ (ครบ {Math.round(minCoverage * 100)}% ของที่ออกแบบไว้) — ถือเป็นตัวเลขเบื้องต้น
                  </div>
                )}
              </div>
            </div>
            <div className="be-dim-grid" data-testid="be-dim-grid">
              {Object.values(DIMENSIONS).map(d => {
                const v = Math.round(composite[d.key] || 0);
                return (
                  <div key={d.key} className="be-dim-card">
                    <div className="be-mono be-tiny" style={{ color: 'var(--ink-4)', letterSpacing: '0.10em' }}>{d.num}</div>
                    <div className="be-dim-num" style={{ color: v > 0 ? d.color : 'var(--ink-4)' }}>
                      {v > 0 ? v : '—'}
                    </div>
                    <div className="be-dim-name">{d.label}</div>
                    <div className="be-dim-bar">
                      <div className="be-dim-bar-fill" style={{ width: v + '%', background: d.color }}/>
                    </div>
                    <div className="be-mono be-tiny be-muted">{d.th}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* v2 method note — shown whenever the backend reports the new scoring version */}
        {schemaV >= 2 && (
          <details className="be-card" data-testid="be-method-update-note" style={{ padding: '10px 16px', marginTop: 14, background: 'rgba(212,160,23,0.07)', borderColor: 'rgba(212,160,23,0.5)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13.5, lineHeight: 1.6 }}>
              <b>วิธีคำนวณปรับปรุง (v2 · พ.ย. 2026)</b> — ตัวเลขของ Identity, Awareness และ α อาจต่างจากที่เคยเห็น <u>โดยที่แบรนด์ไม่ได้เปลี่ยน</u> (กดดูเหตุผล)
            </summary>
            <ul className="be-small" style={{ margin: '8px 0 0 18px', lineHeight: 1.7 }}>
              <li><b>Identity:</b> คะแนน "ความสอดคล้อง" ที่ AI ให้ไม่เข้าสูตรอีกแล้ว (เป็นความเห็นของ AI ไม่ใช่การวัด)</li>
              <li><b>Awareness:</b> unaided recall = ผู้ที่เอ่ยชื่อแบรนด์เองทั้งเป็นแบรนด์แรกหรือที่นึกถึงทีหลัง (เดิมนับเฉพาะ "แบรนด์อื่น" ทำให้แบรนด์ที่ทุกคนนึกถึงเป็นอันดับแรกถูกประเมินต่ำ)</li>
              <li><b>Cronbach's α:</b> กลับคะแนนข้อเชิงลบก่อนคำนวณ และไม่รวมข้อที่ยังไม่ยืนยันทิศทาง</li>
              <li>ประวัติคะแนนด้านล่างและคะแนนในหน้ารายการ<b>คำนวณใหม่ด้วยสูตร v2 ทั้งหมด</b> จึงเทียบกันเองได้ — แต่ตัวเลขที่เคยส่งออก/บันทึก/อ้างไว้ก่อนหน้านี้ไม่ได้ถูกแก้ย้อนหลัง ห้ามนำมาเทียบกับตัวเลขชุดนี้เป็น "การเปลี่ยนแปลงของแบรนด์"</li>
              <li>ข้อความจาก AI ที่เขียนก่อนปรับสูตรอาจอ้างตัวเลขเดิม (มีป้ายเตือนกำกับ)</li>
            </ul>
          </details>
        )}

        {/* TOP SUMMARY — what the score is, how solid the sample is, what to do next */}
        {ready_for_dashboard && (
          <BeSummary aggregate={agg} tier={tier} nFiltered={nFiltered} nTotal={nTotal} targetN={targetN}
                     quality={quality} excludeFlagged={excludeFlagged} aiCache={ai_cache} isOwner={isOwner}
                     filterActive={filterActive}/>
        )}

        {/* FILTER BAR — time + segments + wave compare (sticky) */}
        <BeWaveSelector
          waves={data.waves || []}
          value={filter.wave || 'all'}
          onChange={(w) => setFilter(prev => ({ ...prev, wave: w }))}
        />

        <MigrationOrphanBanner migrationMeta={data.migration_meta} />

        <BeFilterBar
          value={filter}
          compareValue={compareFilter}
          segmentsAvailable={data.segments_available || {}}
          responsesTotal={data.responses_total ?? responseCount}
          responsesFiltered={data.responses_filtered ?? responseCount}
          onChange={setFilter}
          onCompareChange={setCompareFilter}
          isShowcase={isShowcase}
        />

        {/* Data-quality toggle — changes the whole view, so it sits next to the filters */}
        <div id="be-quality-toggle-anchor"/>
        {ready_for_dashboard && agg?.data_quality && isOwner && (
          <BeQualityToggle dq={agg.data_quality} quality={quality} exclude={excludeFlagged}
                           onToggle={setExcludeFlagged} busy={reloading} nFiltered={nFiltered}/>
        )}

        {/* AI ANALYSIS (system or the user's own AI) + CODING without any LLM */}
        {isOwner && (
          <BeAiAnalysisPanel ai={ai} aiCache={ai_cache} filter={filter} nFiltered={nFiltered} ready={ready_for_dashboard}/>
        )}
        {isOwner && ready_for_dashboard && (
          <BeCodingPanel studyId={studyId} token={token} openCoding={agg?.open_coding} ai={ai}
                         onChanged={() => load(true)}
                         defaultOpen={(agg?.open_coding?.by_status?.uncoded || 0) > 0}/>
        )}
        {/* WAVE COMPARE — side-by-side BES + 4 Aaker dims with delta */}
        {compareData && !isShowcase && (
          <WaveCompareCard data={compareData}/>
        )}

        {/* SCORE HISTORY + SEGMENT SIGNIFICANCE + UNFINISHED NUDGE */}
        {ready_for_dashboard && !isShowcase && (
          <>
            <BeScoreHistory studyId={studyId} token={token}/>
            <BeSegmentSignificance
              studyId={studyId} token={token}
              fields={Object.keys(data.segments_available || {})}/>
            <BeUnfinishedCard studyId={studyId} token={token}
                              shareToken={study?.share_token}/>
          </>
        )}

        {/* NOT READY */}
        {!ready_for_dashboard && (
          <div className="be-card" style={{ padding: 40, textAlign: 'center', marginTop: 20 }}
               data-testid="be-dashboard-locked">
            <div className="be-eyebrow" style={{ marginBottom: 12, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>DASHBOARD LOCKED
            </div>
            <div className="be-h2" style={{ fontSize: 22, marginBottom: 12 }}>
              ต้องการ {Math.max(0, 10 - responseCount)} responses เพิ่ม
            </div>
            <div className="be-muted be-small" style={{ marginBottom: 22, maxWidth: 480, margin: '0 auto 22px' }}>
              ต้องมีอย่างน้อย 10 responses เพื่อ unlock dashboard และ AI analysis
              · ปัจจุบัน {responseCount} responses
            </div>
            <button className="be-btn" onClick={copyShareLink}>
              <Icon name="share" size={11}/>คัดลอก link เชิญตอบ
            </button>
          </div>
        )}

        {/* DASH BODY */}
        {ready_for_dashboard && (
          <div className="be-dash-body">
            {/* LEFT RAIL */}
            <div className="be-dash-rail" data-testid="be-dashboard-rail">
              <div className="be-rail-section">
                <h5>ชุดข้อมูลที่แสดง</h5>
                <div className={'be-rail-item ' + (activeSegment === 'all' ? 'on' : '')}
                     onClick={() => setActiveSegment('all')}>
                  <span>{filterActive ? 'ตามตัวกรอง' : 'ผู้ตอบทั้งหมด'}</span>
                  <span className="pct">n = {responseCount}</span>
                </div>
              </div>
              <div className="be-rail-section">
                <h5>Study info</h5>
                <div className="be-mono be-tiny" style={{ lineHeight: 1.7, color: 'var(--ink-2)' }}>
                  Created · {new Date(study.created_at).toLocaleDateString()}<br/>
                  Updated · {new Date(study.updated_at).toLocaleDateString()}<br/>
                  Token · /{study.share_token?.slice(0, 6)}
                </div>
              </div>
              <div className="be-rail-section">
                <h5>สถานะ AI</h5>
                <div className="be-small" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }} data-testid="be-rail-ai-status">
                  {aiStatusLabel(ai_cache?.status)}
                  {ai_cache?.updated_at && <div className="be-mono be-tiny be-muted">{new Date(ai_cache.updated_at).toLocaleString('th-TH')}</div>}
                </div>
              </div>
            </div>

            {/* MAIN */}
            <div className="be-dash-main">
              <SectionAwareness study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionQuality study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionIdentity study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionLoyalty study={study} aggregate={aggregate} ai={ai_cache}/>
            </div>

            {/* RIGHT RAIL — Master AI Insights */}
            <div className="be-dash-ai" data-testid="be-dashboard-ai-rail">
              <div className="be-eyebrow" style={{ marginBottom: 8 }}>
                MASTER AI INSIGHTS
                {filter.wave && filter.wave !== 'all' && (
                  <span style={{
                    marginLeft: 8, padding: '2px 8px', fontSize: 9,
                    background: 'rgba(14,85,56,0.10)', color: '#0E5538',
                    borderRadius: 3, letterSpacing: '0.04em',
                  }} data-testid="be-ai-wave-tag">
                    {filter.wave === 'latest' ? 'WAVE LATEST' : `WAVE ${filter.wave}`}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'IBM Plex Serif', fontSize: 18, fontWeight: 600, marginBottom: 4,
                            display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="sparkle" size={14} stroke="#C8102E"/>
                {(ai_cache?.master_insights?.length || 0) > 0 ? `${ai_cache.master_insights.length} ข้อเสนอแนะสำหรับทีมแบรนด์` : 'ยังไม่มีผลวิเคราะห์ AI'}
              </div>
              {(ai_cache?.master_insights?.length || 0) > 0 && (
                <div style={{ marginBottom: 8 }}><Provenance ai={ai_cache} section="insights"/></div>
              )}
              <StaleAiNote ai={ai_cache}/>
              <div className="be-tiny be-muted" style={{ marginBottom: 16, lineHeight: 1.5,
                     paddingBottom: 14, borderBottom: '1px dashed var(--rule)' }}>
                สร้างจากผู้ตอบ n = {responseCount} + สถิติ 4 มิติ — เป็นข้อเสนอแนะเชิงคุณภาพของ AI ตรวจก่อนนำไปใช้
                {filter.wave && filter.wave !== 'all' && (
                  <> · <strong>Insights scoped to {filter.wave === 'latest' ? 'the latest wave' : `wave ${filter.wave}`}</strong> — switch wave above to refresh.</>
                )}
              </div>

              {(ai_cache?.master_insights || []).length === 0 ? (
                <div className="be-muted be-small" style={{ padding: '20px 0', textAlign: 'center' }}>
                  {study.is_public_showcase
                    ? <>ยังไม่มีข้อเสนอแนะจาก AI —<br/>เจ้าของ study ต้องวิเคราะห์ก่อน</>
                    : <>ยังไม่มีข้อเสนอแนะจาก AI —<br/>ใช้ปุ่ม <strong>วิเคราะห์ด้วย AI</strong> (ใช้ AI ของคุณเองได้)</>
                  }
                </div>
              ) : (ai_cache.master_insights || []).map((rec, i) => (
                <div key={i} className="be-ai-rec" data-testid={`be-master-insight-${i}`}>
                  <div className="be-ai-rec-head">
                    <div className="be-ai-rec-num">0{i + 1}</div>
                    <div className="be-ai-rec-headline">{rec.headline || rec.title}</div>
                  </div>
                  {rec.evidence && <div className="be-ai-rec-body">{rec.evidence}</div>}
                  {rec.recommendation && (
                    <div style={{ fontSize: 12, fontFamily: 'IBM Plex Serif', fontStyle: 'italic',
                                  color: 'var(--ink-2)', borderLeft: '2px solid var(--be-red)',
                                  paddingLeft: 10, marginBottom: 8 }}>
                      → {rec.recommendation}
                    </div>
                  )}
                  {rec.priority && <span className="be-chip be-tiny" style={{
                      color: rec.priority === 'high' ? 'var(--be-red)' :
                             rec.priority === 'medium' ? 'var(--be-gold)' : 'var(--ink-3)',
                    }}>{rec.priority?.toUpperCase()}</span>}
                </div>
              ))}

              {!isShowcase && (
                <button className="be-btn" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}
                        onClick={() => document.getElementById('be-ai-panel')?.scrollIntoView({ behavior: 'smooth' })}
                        data-testid="be-dashboard-regen-insights">
                  <Icon name="refresh" size={11}/>{aiRunning ? 'AI กำลังทำงาน…' : 'สร้างข้อเสนอแนะใหม่ (ไปที่ AI analysis)'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* DEEP STATISTICS — progressive disclosure, collapsed by default */}
        {ready_for_dashboard && (
          <div data-testid="be-deep-stats" style={{ marginTop: 26 }}>
            <div className="be-eyebrow" style={{ marginBottom: 4 }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-blue)' }}/>สถิติเชิงลึกสำหรับงานวิจัย
            </div>
            <div className="be-small be-muted" style={{ lineHeight: 1.6 }}>
              ช่วงเชื่อมั่น ความเที่ยง การทดสอบเทียบคู่แข่ง และคุณภาพข้อมูล — เปิดดูเมื่อต้องการตรวจสอบหรืออ้างอิงในรายงาน
            </div>
            <BeDisclosure id="be-stats-methods" testid="be-stats-methods" eyebrow="METHODS" title="ย่อหน้าวิธีการวิจัย (สร้างอัตโนมัติ)"
                          summary="ต้นร่างสำหรับบทที่ 3 จากข้อเท็จจริงของ study นี้ — ตรวจก่อนนำไปใช้">
              {data.methods_paragraph_th
                ? <BeMethodsParagraph text={data.methods_paragraph_th}/>
                : <div className="be-empty-state be-small be-muted">ยังสร้างย่อหน้าไม่ได้ในชุดข้อมูลนี้</div>}
            </BeDisclosure>
            <BeDisclosure id="be-stats-items" testid="be-stats-items" eyebrow="CONFIDENCE INTERVALS" title="คะแนนรายข้อพร้อมช่วงเชื่อมั่น 95%"
                          summary={`n ของแต่ละข้ออาจน้อยกว่า ${nFiltered} เพราะบางข้อไม่บังคับตอบ`}>
              <BeItemTable questions={agg?.questions || []}/>
            </BeDisclosure>
            <BeDisclosure id="be-stats-reliability" testid="be-stats-reliability" eyebrow="RELIABILITY" title="ความเที่ยงของการวัด (Cronbach's α) รายมิติและรายข้อ"
                          summary="α พร้อม n และ k · item-total r · α ถ้าตัดข้อ · สิ่งที่ไม่ได้คำนวณ (ω / CR / AVE / CFA)">
              <BeReliabilityDetail reliability={agg?.reliability} notComputed={agg?.reliability_not_computed} questions={agg?.questions || []}/>
            </BeDisclosure>
            <BeDisclosure id="be-stats-competitors" testid="be-stats-competitors" eyebrow="BRAND vs COMPETITORS" title="เปรียบเทียบแบรนด์กับคู่แข่งแบบจับคู่ (paired)"
                          summary="ผลต่าง ช่วงเชื่อมั่น t · p (ปรับ Holm) · effect size พร้อมคำอ่านภาษาไทย และข้อควรระวังเรื่องทดสอบหลายครั้ง">
              <BePairedComparisons cc={agg?.competitor_comparison}/>
            </BeDisclosure>
            <BeDisclosure id="be-stats-sensitivity" testid="be-stats-sensitivity" eyebrow="SENSITIVITY" title="BES ไวต่อน้ำหนักมิติแค่ไหน"
                          summary={agg?.bes_sensitivity ? `ช่วง ${fmt1(agg.bes_sensitivity.range_one_weight_halved_or_doubled?.[0])}–${fmt1(agg.bes_sensitivity.range_one_weight_halved_or_doubled?.[1])} · ${agg.bes_sensitivity.tier_stable ? 'tier คงเดิม' : 'tier เปลี่ยนได้'}` : undefined}>
              <BeSensitivity s={agg?.bes_sensitivity} bes={composite.overall}/>
            </BeDisclosure>
            {agg?.data_quality && isOwner && (
              <BeDisclosure id="be-stats-dq" testid="be-stats-dq" eyebrow="DATA QUALITY" title="คุณภาพข้อมูลและผู้ตอบที่น่าสงสัย"
                            summary={`พบ ${agg.data_quality.n_flagged_excludable} คนที่ตัดได้จาก ${agg.data_quality.n_total}`}>
                <BeDataQuality dq={agg.data_quality} quality={quality} exclude={excludeFlagged} onToggle={setExcludeFlagged}
                               nFiltered={nFiltered} busy={reloading}/>
              </BeDisclosure>
            )}
            <BeDisclosure id="be-stats-glossary" testid="be-glossary-card" eyebrow="GLOSSARY" title="อ่านค่าตัวเลขบนหน้านี้ยังไง"
                          summary="T2B · B2B · NET · σ · POMP · 95% CI · α · NPS · n" accent="var(--be-gold)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {GLOSSARY.map(([key, term, desc]) => (
                  <div key={key} data-testid={`be-glossary-term-${key}`}
                       style={{ padding: 12, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
                    <div className="be-mono be-tiny" style={{ letterSpacing: '0.08em', color: 'var(--ink)' }}>{term}</div>
                    <div className="be-small be-muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </BeDisclosure>
          </div>
        )}

        {/* EXPORT — raw data (SPSS / R / JASP) + thesis */}
        {ready_for_dashboard && isOwner && (
          <>
            <div className="be-card" id="be-raw-export-card" style={{ padding: 20, marginTop: 26 }} data-testid="be-raw-export-card">
              <div className="be-eyebrow" style={{ marginBottom: 8 }}>
                <span className="be-dot-sm" style={{ background: 'var(--be-green)' }}/>ส่งออกข้อมูลดิบ · สำหรับ SPSS / R / JASP
              </div>
              <BeRawExport studyId={studyId} token={token} filter={filter} excludeFlagged={excludeFlagged} nFiltered={nFiltered}/>
            </div>
            <BeThesisExport studyId={studyId} token={token} filter={filter} brandName={study.brand?.name}
                            canExportNonAi={canExportThesis}/>
          </>
        )}

        {/* METHODOLOGY · Appendix at bottom of report — explains every score */}
        {ready_for_dashboard && (
          <BeMethodology onOpenWeights={isShowcase ? null : () => setWeightEditorOpen(true)}/>
        )}
      </div>

      {isOwner && <BeExternalAiDialog ai={ai}/>}

      {weightEditorOpen && !isShowcase && (
        <BeWeightEditor study={study} token={token}
                        onClose={() => setWeightEditorOpen(false)}
                        onSaved={load}/>
      )}

      {/* Showcase footer — Powered by SWU MKT (only on public showcase view) */}
      {isShowcase && (
        <div className="be-showcase-footer" data-testid="be-showcase-footer">
          <div className="be-showcase-footer-inner">
            <div className="be-showcase-footer-brand">
              <img src={SWU_LOGO_URL} alt="SWUMKT Logo" style={{ height: 36, width: 'auto' }}/>
              <div>
                <div className="be-mono be-tiny" style={{ letterSpacing: '0.14em', color: 'var(--be-red)' }}>
                  POWERED BY
                </div>
                <div style={{ fontFamily: 'IBM Plex Serif', fontSize: 16, fontWeight: 600, marginTop: 2 }}>
                  SWU · Marketing Research Tools
                </div>
              </div>
            </div>
            <div className="be-showcase-footer-cta">
              <a href="/" className="be-btn"
                 data-testid="be-showcase-footer-home">
                <Icon name="external" size={11}/>เกี่ยวกับเครื่องมือ
              </a>
              {(study.status === 'collecting' || study.status === 'analyzing') && (
                <a href={`/brand-equity/respond/${data.study.share_token}`}
                   className="be-btn be-btn-red"
                   data-testid="be-showcase-footer-take-survey">
                  <Icon name="arrowR" size={11}/>ร่วมตอบแบบสอบถาม
                </a>
              )}
            </div>
          </div>
          <div className="be-showcase-footer-meta be-mono be-tiny be-muted">
            Brand Health Check · Anonymous data · {responseCount}/{targetN} respondents
          </div>
        </div>
      )}
    </div>
  );
};

// ============ Section components ============

// Shown instead of an empty chart / zeros when an open-ended question has not been coded.
const UncodedNotice = ({ q }) => (
  <div className="be-uncoded" data-testid={`be-uncoded-${q?.id}`} role="note">
    <b>{q?.coding_status_th || 'ยังไม่ได้เข้ารหัส'}</b>
    <div className="be-muted" style={{ marginTop: 4 }}>
      คำตอบปลายเปิดข้อนี้ยังไม่ถูกจัดกลุ่ม จึงยังไม่แสดงกราฟ (ไม่ใช่ศูนย์) · เข้ารหัสได้ที่กล่อง "เข้ารหัสคำตอบปลายเปิด" ด้านบน
      ด้วย AI ของคุณเอง สเปรดชีต หรือ AI ของระบบ (n = {q?.stats?.n ?? '—'} คำตอบ)
    </div>
  </div>
);
const statusChip = (q) => (q?.coding_status === 'partial' || q?.coding_status === 'deterministic') && q?.coding_status_th ? (
  <div className="be-tiny be-muted" style={{ marginTop: 4 }} data-testid={`be-coding-status-${q.id}`}>{q.coding_status_th}</div>
) : null;

const SectionAwareness = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const tom = qs.find(q => q.kind === 'unaided_top_of_mind');
  const recall = qs.find(q => q.kind === 'unaided_recall');
  const aided = qs.find(q => q.kind === 'aided_recognition');
  const score = Math.round(aggregate?.composite?.awareness || 0);

  // Top-of-mind word cloud
  const tomCounts = tom?.stats?.counts || [];
  const target = study.brand?.name;
  const cloudWords = tomCounts.slice(0, 12).map((c, i) => ({
    text: c.label,
    size: Math.max(11, 14 + Math.round(c.pct * 0.5)),
    target: c.label?.toLowerCase().includes(target?.toLowerCase() || '___'),
    x: 12 + (i % 4) * 22 + hash01(c.label + 'x') * 10,
    y: 18 + Math.floor(i / 4) * 26 + hash01(c.label + 'y') * 8,
  }));

  // Unaided recall — AI normalized counts (each response may list multiple brands)
  const recallRows = (recall?.stats?.counts || []).slice(0, 8).map(c => ({
    label: c.label,
    value: c.pct,
    target: c.label?.toLowerCase().includes(target?.toLowerCase() || '___'),
  }));

  // Aided recognition bars
  const aidedRows = (aided?.stats?.counts || []).slice(0, 8).map(c => ({
    label: c.label,
    value: c.pct,
    target: c.label === target,
  }));

  const tomTarget = tomCounts.find(c => c.label?.toLowerCase().includes(target?.toLowerCase() || '___'));
  const targetTomPct = tomTarget?.pct || 0;
  const tomTargetCI = tomTarget?.pct_ci95;
  const totalUnaided = recall?.stats?.total_unaided_pct;

  const missingKinds = getMissingKinds(qs, 'awareness');

  return (
    <div className="be-section" data-testid="be-section-awareness">
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 01</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.awareness.color }}/>
            <h2 className="be-h2">Brand Awareness <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>การจดจำแบรนด์</span></h2>
          </div>
          <div className="be-section-sub">
            Top-of-mind, aided recall, and familiarity — measures how easily the brand surfaces from category cues.
          </div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100</div>
          <div><strong>{qs.filter(q => q.dimension === 'awareness').length}</strong>q</div>
        </div>
      </div>

      <PartialDataWarning missing={missingKinds} dimLabel="Awareness"/>

      <div className="be-stack-2">
        {tom?.coding_status === 'uncoded' && (
          <div className="be-card be-span-2"><UncodedNotice q={tom}/></div>
        )}
        {tomCounts.length > 0 && tom?.coding_status !== 'uncoded' && (
          <div className="be-card be-span-2">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Top-of-Mind brand cloud</h3>
                <div className="be-card-d">
                  "แบรนด์แรกที่นึกถึง?" · n = {tom?.stats?.n} · แบรนด์หลักเน้นสี
                </div>
                <div style={{ marginTop: 6 }}><CodingBadge stats={tom?.stats} ai={ai}/></div>
                {statusChip(tom)}
              </div>
              <div className="be-card-stat">
                <span className="be-big be-num">{fmt1(targetTomPct)}</span>
                <span className="be-unit">% top-of-mind</span>
                <span className="be-mono be-tiny be-muted" style={{ textTransform: 'none', display: 'block' }}>n = {tom?.stats?.n}</span>
                {tomTargetCI && <span className="be-mono be-tiny be-muted" style={{ textTransform: 'none', display: 'block' }} data-testid="be-tom-ci">95% CI {fmtCI(tomTargetCI)}%</span>}
              </div>
            </div>
            <WordCloud words={cloudWords}/>
            {tom?.stats?.ai_normalized && tomCounts.some(c => (c.variants || []).length > 1) && (
              <details style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace',
                                   letterSpacing: '0.04em' }}>
                  ดูคำสะกดที่ถูกรวมเข้าด้วยกัน
                </summary>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {tomCounts.filter(c => (c.variants || []).length > 1).slice(0, 8).map((c, i) => (
                    <div key={i} style={{ padding: '6px 10px', background: 'var(--paper-2)', border: '1px dashed var(--rule)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>{c.label}</div>
                      <div style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                        {(c.variants || []).slice(0, 6).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {recall?.coding_status === 'uncoded' && <div className="be-card"><UncodedNotice q={recall}/></div>}
        {(recallRows.length > 0 || totalUnaided != null) && recall?.coding_status !== 'uncoded' && (
          <div className="be-card" data-testid="be-unaided-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Unaided recall (รวม)</h3>
                <div className="be-card-d">
                  เอ่ยชื่อแบรนด์เองทั้งเป็นแบรนด์แรกหรือนึกถึงทีหลัง · AW-2 n = {recall?.stats?.n}
                </div>
                <div style={{ marginTop: 6 }}><CodingBadge stats={recall?.stats} ai={ai}/></div>
                {statusChip(recall)}
              </div>
              {totalUnaided != null && (
                <div className="be-card-stat">
                  <span className="be-big be-num">{fmt1(totalUnaided)}</span>
                  <span className="be-unit">%</span>
                  <span className="be-mono be-tiny be-muted" style={{ textTransform: 'none', display: 'block' }}>n = {recall.stats.total_unaided_base ?? recall.stats.n}</span>
                  {recall.stats.total_unaided_ci95 && <span className="be-mono be-tiny be-muted" style={{ textTransform: 'none', display: 'block' }} data-testid="be-unaided-ci">95% CI {fmtCI(recall.stats.total_unaided_ci95)}%</span>}
                </div>
              )}
            </div>
            {recallRows.length > 0 && (
              <>
                <div className="be-tiny be-muted" style={{ marginBottom: 6 }}>แบรนด์ที่ถูกนึกถึงเพิ่ม (% ของผู้ตอบ AW-2, n = {recall?.stats?.n})</div>
                <HBar rows={recallRows} color={DIMENSIONS.awareness.color}/>
              </>
            )}
          </div>
        )}

        {aidedRows.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Aided recognition</h3>
                <div className="be-card-d">"แบรนด์ใดที่คุณรู้จัก?" · n = {aided?.stats?.n}</div>
              </div>
            </div>
            <HBar rows={aidedRows} color={DIMENSIONS.awareness.color}/>
          </div>
        )}

        {/* Familiarity */}
        {qs.find(q => q.kind === 'brand_familiarity' && q.stats?.n > 0) && (() => {
          const fam = qs.find(q => q.kind === 'brand_familiarity');
          return (
            <div className="be-card">
              <div className="be-card-h">
                <div>
                  <h3 className="be-card-t">Familiarity score</h3>
                  <div className="be-card-d">มาตร 5 ระดับ · n = {fam?.stats?.n}{fam?.stats?.score_100_ci95 ? ` · 95% CI ${fmtCI(fam.stats.score_100_ci95)} (0-100)` : ''}</div>
                </div>
                <div className="be-card-stat">
                  <span className="be-big be-num">{fmt1(fam?.stats?.mean)}</span>
                  <span className="be-unit">/ 5</span>
                </div>
              </div>
              <Histogram values={fam?.stats?.distribution || [0, 0, 0, 0, 0]}
                         peakIdx={(fam?.stats?.distribution || []).indexOf(Math.max(...(fam?.stats?.distribution || [0])))}
                         color={DIMENSIONS.awareness.color}
                         labels={['ไม่รู้', 'เคยได้ยิน', 'พอรู้', 'รู้ดี', 'รู้ดีมาก']}/>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

const SectionQuality = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const score = Math.round(aggregate?.composite?.quality || 0);
  const overall = qs.find(q => q.kind === 'overall_quality');
  const [qRadarMode, setQRadarMode] = useState('brand'); // 'brand' | 'compare'

  const sluggify = (kind) => (kind || '').replace(/^attribute_/, '').replace(/^competitor_/, '');

  // Build radar from likert_7 attributes (brand-side only — exclude competitor_*
  // parallels which also live in `dimension="quality"` and would otherwise leak in
  // as bogus "COMPETITOR_<slug>" axes).
  const attrQs = qs.filter(q =>
    q.dimension === 'quality'
    && q.type === 'likert_7'
    && (q.kind || '').startsWith('attribute_')
    && q.stats?.mean
  );
  const radarAxesData = attrQs.slice(0, 8).map(q => ({
    axis: ((q.axis_label || sluggify(q.kind)) + '').toUpperCase(),
    slug: sluggify(q.kind),
    brandValue: Math.round(q.stats?.score_100 ?? ((q.stats?.mean || 1) - 1) / 6 * 100),
  }));
  const radarAxes = radarAxesData.map(a => a.axis);

  // Competitor parallels (kind=competitor_<slug>) — gather mean per (compare_brand, slug)
  const compMap = {}; // { brandName: { slug: pct } }
  qs.filter(q =>
    q.dimension === 'quality'
    && q.type === 'likert_7'
    && (q.kind || '').startsWith('competitor_')
    && q.stats?.mean
  ).forEach(q => {
    const cb = q.compare_brand || 'Competitor';
    const slug = sluggify(q.kind);
    if (!compMap[cb]) compMap[cb] = {};
    compMap[cb][slug] = Math.round(q.stats.score_100 ?? ((q.stats.mean || 1) - 1) / 6 * 100);
  });
  const competitorNames = Object.keys(compMap);
  const hasCompetitorRadar = competitorNames.length > 0 && radarAxesData.length >= 3;
  const compareOn = qRadarMode === 'compare' && hasCompetitorRadar;

  const COMP_PALETTE = ['#1B75BC', '#D4A017', '#5C5F66', '#10B981', '#7C3AED'];
  const radarSeries = radarAxesData.length >= 3 ? [
    { name: study.brand?.name, kind: 'brand', color: DIMENSIONS.quality.color, fill: 0.18,
      values: radarAxesData.map(a => a.brandValue) },
    ...(compareOn ? competitorNames.map((cb, i) => ({
      name: cb, kind: 'competitor',
      color: COMP_PALETTE[i % COMP_PALETTE.length],
      dash: '4 3', fill: 0.06,
      values: radarAxesData.map(a => compMap[cb][a.slug] ?? null),
    })) : []),
  ] : [];

  // Themes
  const qualityThemes = ai?.themes_by_question || {};
  const qualityOpen = qs.find(q => q.dimension === 'quality' && q.type === 'open_long');
  const themes = qualityOpen ? (qualityThemes[qualityOpen.id] || []) : [];

  const missingKinds = getMissingKinds(qs, 'quality');

  return (
    <div className="be-section" data-testid="be-section-quality">
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 02</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.quality.color }}/>
            <h2 className="be-h2">Perceived Quality <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>คุณภาพที่รับรู้</span></h2>
          </div>
          <div className="be-section-sub">
            Likert ratings on quality attributes plus comparative judgement vs leading competitor.
          </div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100</div>
          <div><strong>{qs.filter(q => q.dimension === 'quality').length}</strong>q</div>
        </div>
      </div>

      <PartialDataWarning missing={missingKinds} dimLabel="Quality"/>

      <div className="be-stack-2">
        {radarSeries.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Quality attributes · radar</h3>
                <div className="be-card-d">คะแนน 0-100 แบบ POMP · (ค่าเฉลี่ย−1)/6×100 · n ต่อข้อ {Math.min(...attrQs.map(q => q.stats?.n || 0))}–{Math.max(...attrQs.map(q => q.stats?.n || 0))}</div>
              </div>
              {hasCompetitorRadar && (
                <div className="be-radar-toggle" data-testid="be-quality-radar-toggle">
                  <button onClick={() => setQRadarMode('brand')}
                          className={qRadarMode === 'brand' ? 'on' : ''}
                          data-testid="be-quality-radar-brand">
                    Brand only
                  </button>
                  <button onClick={() => setQRadarMode('compare')}
                          className={qRadarMode === 'compare' ? 'on' : ''}
                          data-testid="be-quality-radar-compare">
                    เทียบกับคู่แข่ง
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0' }}>
              <RadarChart axes={radarAxes} series={radarSeries} size={260}/>
            </div>
            {compareOn && (
              <div className="be-mono be-tiny be-muted"
                   data-testid="be-quality-radar-legend"
                   style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center',
                            paddingTop: 8, borderTop: '1px dashed var(--rule)' }}>
                {radarSeries.map((s, i) => (
                  <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 3, background: s.color,
                                   borderTop: s.kind === 'competitor' ? '1px dashed' : 'none' }}/>
                    <span style={{ fontWeight: s.kind === 'brand' ? 600 : 400,
                                   color: s.kind === 'brand' ? 'var(--ink)' : 'var(--ink-2)' }}>
                      {s.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {overall && overall.stats?.distribution && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Overall quality · distribution</h3>
                <div className="be-card-d">"คุณภาพระดับใด?" · มาตร 1-7 · n = {overall.stats?.n}</div>
                <div className="be-mono be-tiny be-muted" style={{ marginTop: 4, lineHeight: 1.6 }} data-testid="be-quality-ci95">
                  {overall.stats?.mean_ci95 && <>ค่าเฉลี่ย 95% CI {fmtCI(overall.stats.mean_ci95, 2)}<br/></>}
                  {overall.stats?.score_100_ci95 && <>คะแนน 0-100: 95% CI {fmtCI(overall.stats.score_100_ci95)}</>}
                </div>
              </div>
              <div className="be-card-stat">
                <span className="be-big be-num">{fmt2(overall.stats?.mean)}</span>
                <span className="be-unit">ค่าเฉลี่ย · σ {fmt2(overall.stats?.std)}</span>

              </div>
            </div>
            <Histogram values={overall.stats.distribution} color={DIMENSIONS.quality.color}
                       peakIdx={overall.stats.distribution.indexOf(Math.max(...overall.stats.distribution))}/>
            <div className="be-grid-3" style={{ marginTop: 14 }}>
              <div style={{ padding: '8px 10px', background: 'var(--paper-2)' }}>
                <div className="be-mono be-tiny be-muted">TOP-2-BOX</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 500 }}>{fmtPct(overall.stats?.t2b)}</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'var(--paper-2)' }}>
                <div className="be-mono be-tiny be-muted">BOTTOM-2-BOX</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 500 }}>{fmtPct(overall.stats?.b2b)}</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'rgba(212,160,23,0.1)' }}>
                <div className="be-mono be-tiny be-muted">NET Q-SCORE</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 600, color: DIMENSIONS.quality.color }}>
                  {overall.stats?.net > 0 ? '+' : ''}{overall.stats?.net}
                </div>
              </div>
            </div>
          </div>
        )}

        {qualityOpen && qualityOpen.coding_status === 'uncoded' && themes.length === 0 && (
          <div className="be-card be-span-2"><UncodedNotice q={{ ...qualityOpen, coding_status_th: 'ยังไม่ได้สกัดประเด็น' }}/></div>
        )}
        {themes.length > 0 && (
          <div className="be-card be-span-2">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">เสียงผู้ตอบ · เหตุผลด้านคุณภาพ</h3>
                <div className="be-card-d">คำตอบปลายเปิดที่จัดเป็นประเด็นโดย AI · จำนวนนับโดยระบบ</div>
                <div style={{ marginTop: 6 }}><Provenance ai={ai} section="themes"/></div>
              </div>
            </div>
            {themes.some(t => t.sampled) && <div className="be-tiny be-muted" style={{ marginBottom: 8 }}>ประเด็นสกัดจากตัวอย่างคำตอบ ไม่ใช่ทั้งหมด (base n = {themes[0]?.base_n ?? '—'} จาก {themes[0]?.total_n ?? '—'})</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {themes.map((th, i) => (
                <div key={i} style={{ padding: 14, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{th.name}</div>
                    <div className="be-num be-tiny" style={{ color: th.sentiment > 0 ? 'var(--be-green)' : th.sentiment < 0 ? 'var(--be-red)' : 'var(--ink-3)' }}>
                      n = {th.count}{th.pct != null ? ` (${fmt1(th.pct)}%)` : ''} · {th.sentiment > 0 ? '+' : ''}{th.sentiment?.toFixed(1) ?? '0'}
                    </div>
                  </div>
                  <div className="be-small be-muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>{th.description}</div>
                  {(th.sample_quotes || []).slice(0, 1).map((q, j) => (
                    <div key={j} className="be-serif be-tiny" style={{ fontStyle: 'italic', color: 'var(--ink-2)', lineHeight: 1.5 }}>"{q}"</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SectionIdentity = ({ study, aggregate, ai }) => {
  const score = Math.round(aggregate?.composite?.identity || 0);
  const qs = aggregate?.questions || [];
  const ii = ai?.identity_image || {};
  const association = aggregate?.association || {};
  const imageRadar = aggregate?.image_radar || { axes: [], series: [] };

  // Perceptual map state — pick 2 axes from radar
  const [pmAxes, setPmAxes] = React.useState([]);
  const [radarMode, setRadarMode] = React.useState('common'); // 'common' = intersection, 'all' = union
  const togglePmAxis = (ax) => {
    setPmAxes(prev => {
      if (prev.includes(ax)) return prev.filter(a => a !== ax);
      if (prev.length >= 2) return [prev[1], ax];
      return [...prev, ax];
    });
  };

  // Build the displayed radar — if "common" mode, drop axes where any series is null
  const displayedRadar = React.useMemo(() => {
    if (!imageRadar.axes || imageRadar.series.length === 0) return imageRadar;
    if (radarMode === 'all') return imageRadar;
    const keepIdx = imageRadar.axes
      .map((_, i) => i)
      .filter(i => imageRadar.series.every(s => s.values[i] != null));
    return {
      axes: keepIdx.map(i => imageRadar.axes[i]),
      series: imageRadar.series.map(s => ({ ...s, values: keepIdx.map(i => s.values[i]) })),
    };
  }, [imageRadar, radarMode]);

  const intended = study.identity?.traits || [];
  const aligned = ii.aligned || [];
  const unintended = ii.unintended || [];
  const perceived = ii.perceived_traits || [];

  const statusMap = {};
  intended.forEach(t => { statusMap[t] = aligned.includes(t) ? 'aligned' : 'lost'; });

  // Build image col from perceived (top 8).
  // `p.count` is a respondent count; it was rendered directly as a percentage.
  // Convert against the number of respondents so the bar means something.
  const totalResp = aggregate?.total_responses || 0;
  const imageCol = perceived.slice(0, 8).map(p => ({
    trait: p.trait,
    pct: typeof p.count === 'number'
      ? (totalResp ? Math.min(100, Math.round(p.count / totalResp * 100)) : 0)
      : 0,
    count: typeof p.count === 'number' ? p.count : null,
    kind: aligned.includes(p.trait) ? 'aligned' : unintended.includes(p.trait) ? 'unintended' : 'lost',
  }));

  // 1-word identity cloud (BI-3 word_cloud question)
  const oneWord = qs.find(q => q.kind === 'image_one_word');
  const oneWordCounts = oneWord?.stats?.counts || [];
  const oneWordCloudWords = oneWordCounts.slice(0, 14).map((c, i) => ({
    text: c.label,
    size: Math.max(12, 14 + Math.round(c.pct * 0.6)),
    target: aligned.includes(c.label),
    x: 10 + (i % 5) * 18 + hash01(c.label + 'x') * 8,
    y: 18 + Math.floor(i / 5) * 28 + hash01(c.label + 'y') * 6,
  }));

  return (
    <div className="be-section be-section-centerpiece"
         data-testid="be-section-identity">
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 03 · CENTERPIECE</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.identity.color }}/>
            <h2 className="be-h2">Identity vs Image <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>อัตลักษณ์ vs ภาพลักษณ์</span></h2>
          </div>
          <div className="be-section-sub">
            What the brand wants to be (left) versus what consumers actually perceive (right).
          </div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100 <span className="be-tiny be-muted">(คะแนนจากผู้ตอบ)</span></div>
          <div className="be-tiny be-muted" data-testid="be-ai-opinion-meta">
            ความเห็นของ AI (ไม่ใช่คะแนน): {intended.length ? `${aligned.length}/${intended.length} ตรงกับที่ตั้งใจ` : '—'}
          </div>
        </div>
      </div>

      <PartialDataWarning missing={getMissingKinds(qs, 'identity')} dimLabel="Identity"/>

      {/* Visual identity setup (AI-derived from owner inputs in wizard) — show whenever populated */}
      {(study.identity?.ai_summary || (study.identity?.visual_palette || []).length > 0 || (study.identity?.visual_assets || []).length > 0) && (
        <div className="be-card" style={{ padding: 22, marginBottom: 16,
              background: 'var(--paper-2)' }}
             data-testid="be-visual-identity-panel">
          <div className="be-eyebrow" style={{ marginBottom: 10 }}>
            <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>
            อัตลักษณ์ที่แบรนด์ตั้งใจ · BRAND VISUAL IDENTITY
            {study.identity?.archetype && (
              <span className="be-chip" style={{ marginLeft: 10, background: 'var(--ink)', color: 'var(--paper)' }}>
                {study.identity.archetype}
              </span>
            )}
          </div>
          {study.identity?.ai_source && (
            <div style={{ marginBottom: 10 }}>
              <span className="be-prov be-mono" data-testid="be-visual-identity-prov">
                <span className="be-prov-dot" style={{ background: study.identity.ai_source.source === 'external' ? 'var(--be-blue)' : 'var(--be-red)' }}/>
                {study.identity.ai_source.source === 'external'
                  ? `นำเข้าจาก ${study.identity.ai_source.model_label || 'AI ภายนอก'}`
                  : 'วิเคราะห์โดย AI ของระบบ'}
                {study.identity.ai_source.at ? ` เมื่อ ${new Date(study.identity.ai_source.at).toLocaleString('th-TH')}` : ''}
              </span>
            </div>
          )}
          {study.identity?.ai_summary && (
            <div className="be-serif" style={{ fontSize: 14, fontStyle: 'italic',
                   color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>
              "{study.identity.ai_summary}"
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {(study.identity?.visual_palette || []).length > 0 && (
              <div>
                <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8 }}>PALETTE</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {study.identity.visual_palette.map((hex, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 38, height: 38, background: hex, border: '1px solid var(--rule-strong)' }}/>
                      <span className="be-mono be-tiny" style={{ marginTop: 3 }}>{hex}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(study.identity?.visual_keywords || []).length > 0 && (
              <div>
                <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8 }}>VISUAL KEYWORDS</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {study.identity.visual_keywords.map((k, i) => <span key={i} className="be-chip">{k}</span>)}
                </div>
              </div>
            )}
          </div>
          {(study.identity?.visual_assets || []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8 }}>UPLOADED ASSETS · {study.identity.visual_assets.length}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {study.identity.visual_assets.map((a, i) => (
                  <div key={i} style={{ width: 80, height: 80, background: 'var(--surface)',
                          border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', position: 'relative' }}>
                    <img src={`data:${a.mime_type};base64,${a.image_base64}`}
                         alt={a.note || ''}
                         style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}/>
                    <span className="be-mono be-tiny" style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'rgba(255,255,255,0.92)', textAlign: 'center', padding: '1px 0',
                            textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
                      {a.kind}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === Brand Association · Aaker 4 perspectives === */}
      {(association.by_perspective && Object.values(association.by_perspective).some(v => v > 0)) && (
        <div className="be-card" style={{ padding: 22, marginBottom: 16 }} data-testid="be-association-grid">
          <div className="be-card-h">
            <div>
              <h3 className="be-card-t">Brand Association · 4 perspectives</h3>
              <div className="be-card-d">
                Aaker framework — คะแนน <b>ภาพลักษณ์ที่ผู้บริโภครับรู้</b> ในแต่ละมุมมอง (0-100)
                · overall <strong style={{ color: 'var(--ink)' }}>{association.overall}/100</strong>
              </div>
              {/* This card used to say it compared perceived image against the
                  intended identity and labelled low scores "misaligned". The
                  computation never reads `study.identity` — it averages the
                  perceived-image items per perspective. Labels now say what is
                  actually measured; the intended-vs-perceived comparison lives in
                  the Identity vs Image table below. */}
              <div className="be-tiny be-muted" style={{ marginTop: 6, lineHeight: 1.5 }}
                   data-testid="be-association-scope-note">
                หมายเหตุ: ค่านี้วัด "ผู้บริโภครับรู้แรงแค่ไหน" ในแต่ละมุมมองเท่านั้น
                ยังไม่ได้เทียบกับอัตลักษณ์ที่แบรนด์ตั้งใจ — การเทียบ intended vs perceived อยู่ในตาราง
                Identity vs Image ด้านล่าง
              </div>
            </div>
          </div>
          <div className="be-grid-association">
            {[
              { key: 'as_organization', label: 'As Organization', th: 'องค์กร',  icon: '◆' },
              { key: 'as_person',       label: 'As Person',       th: 'บุคลิก',   icon: '☻' },
              { key: 'as_symbol',       label: 'As Symbol',       th: 'สัญลักษณ์', icon: '✦' },
              { key: 'as_product',      label: 'As Product',      th: 'ผลิตภัณฑ์', icon: '■' },
            ].map(p => {
              const v = Math.round(association.by_perspective[p.key] || 0);
              const tier = v >= 70 ? 'var(--be-green)' : v >= 40 ? 'var(--be-gold)' : 'var(--be-red)';
              return (
                <div key={p.key} className="be-dim-card" data-testid={`be-association-card-${p.key}`}>
                  <div className="be-mono be-tiny" style={{ color: 'var(--ink-4)', letterSpacing: '0.10em' }}>
                    {p.icon} · {p.label.toUpperCase()}
                  </div>
                  <div className="be-dim-num" style={{ color: v > 0 ? tier : 'var(--ink-4)' }}>
                    {v > 0 ? v : '—'}
                  </div>
                  <div className="be-dim-name">{p.th}</div>
                  <div className="be-dim-bar">
                    <div className="be-dim-bar-fill" style={{ width: v + '%', background: tier }}/>
                  </div>
                  <div className="be-mono be-tiny be-muted">
                    {v >= 70 ? 'รับรู้ชัดเจน' : v >= 40 ? 'รับรู้ปานกลาง' : 'รับรู้อ่อน'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === Brand Image Radar (multi-dim, brand vs competitors) === */}
      {imageRadar.axes && imageRadar.axes.length >= 3 && imageRadar.series.length >= 1 && (
        <div className="be-card" style={{ padding: 22, marginBottom: 16 }}
             data-testid="be-image-radar">
          <div className="be-card-h">
            <div>
              <h3 className="be-card-t">Multi-dimensional Image Radar</h3>
              <div className="be-card-d">
                {displayedRadar.axes.length} attributes · {displayedRadar.series.length} brand{displayedRadar.series.length > 1 ? 's' : ''}
                {' · '}คลิกแกนเพื่อเลือก 2 แกนสำหรับ Perceptual Map ด้านล่าง
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="be-mono be-tiny be-muted" style={{ display: 'flex', border: '1px solid var(--rule-strong)' }}>
                <button onClick={() => setRadarMode('common')}
                        style={{ padding: '4px 10px', background: radarMode === 'common' ? 'var(--ink)' : 'transparent',
                                 color: radarMode === 'common' ? 'var(--paper)' : 'var(--ink)',
                                 border: 0, fontSize: 10.5, letterSpacing: '0.08em', cursor: 'pointer' }}
                        data-testid="be-radar-mode-common">
                  COMMON
                </button>
                <button onClick={() => setRadarMode('all')}
                        style={{ padding: '4px 10px', background: radarMode === 'all' ? 'var(--ink)' : 'transparent',
                                 color: radarMode === 'all' ? 'var(--paper)' : 'var(--ink)',
                                 border: 0, borderLeft: '1px solid var(--rule-strong)', fontSize: 10.5,
                                 letterSpacing: '0.08em', cursor: 'pointer' }}
                        data-testid="be-radar-mode-all">
                  ALL ATTRS
                </button>
              </div>
              <div className="be-mono be-tiny be-muted" style={{ textAlign: 'right' }}>
                {pmAxes.length === 0 ? 'click 2 axes →' :
                 pmAxes.length === 1 ? `1/2 · ${pmAxes[0]}` :
                                        `2/2 · ${pmAxes.join(' × ')}`}
                {pmAxes.length > 0 && (
                  <button className="be-btn-ghost" onClick={() => setPmAxes([])}
                          style={{ marginLeft: 8, fontSize: 10, color: 'var(--be-red)', padding: '0 4px',
                                   background: 'transparent', border: 0, cursor: 'pointer' }}
                          data-testid="be-radar-axes-clear">clear</button>
                )}
              </div>
            </div>
          </div>

          <div className="be-grid-2-rail">
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
              <RadarChart axes={displayedRadar.axes}
                          series={displayedRadar.series.map((s, i) => ({
                            ...s,
                            color: s.kind === 'brand' ? '#C8102E' : ['#1B75BC', '#D4A017', '#5C5F66'][i - 1] || '#5C5F66',
                            dash: s.kind === 'brand' ? '0' : '4 3',
                            fill: s.kind === 'brand' ? 0.18 : 0.06,
                          }))}
                          size={Math.min(360, displayedRadar.axes.length * 36 + 200)}
                          onAxisClick={togglePmAxis}
                          selectedAxes={pmAxes}
                          testidPrefix="be-image-radar-axis"/>
            </div>
            <div>
              <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8, letterSpacing: '0.10em' }}>LEGEND</div>
              {imageRadar.series.map((s, i) => (
                <div key={s.name}
                     data-testid={`be-radar-legend-${s.name}`}
                     style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12,
                              flexWrap: 'wrap' }}>
                  <span style={{ width: 16, height: 3,
                          background: s.kind === 'brand' ? '#C8102E' : ['#1B75BC', '#D4A017', '#5C5F66'][i - 1] || '#5C5F66',
                          borderTop: s.kind !== 'brand' ? '1px dashed' : 'none' }}/>
                  <span style={{ fontWeight: s.kind === 'brand' ? 600 : 400 }}>{s.name}</span>
                  {s.kind === 'brand' && <span className="be-mono be-tiny be-muted">· focal</span>}
                  {/* n per series. The focal items are REQUIRED and the competitor
                      items are OPTIONAL, so a polygon built on 3 answers used to be
                      drawn identically to one built on 100 — with no n anywhere. */}
                  {s.n_max != null && (
                    <span className="be-mono be-tiny" data-testid={`be-radar-legend-n-${s.name}`}
                          style={{ color: (s.n_min || 0) < 10 ? 'var(--be-red)' : 'var(--ink-3)' }}>
                      · n={s.n_min === s.n_max ? s.n_max : `${s.n_min}-${s.n_max}`}
                      {(s.n_min || 0) < 10 ? ' ⚠ น้อยเกินไป' : ''}
                    </span>
                  )}
                </div>
              ))}
              <div className="be-tiny be-muted" style={{ marginTop: 10, lineHeight: 1.5 }}
                   data-testid="be-radar-scale-note">
                สเกล 0-100 แบบ POMP · (ค่าเฉลี่ย−1)/(สูงสุด−1)×100 — เท่ากับสเกลของคะแนนมิติอื่นทุกตัว
                {imageRadar.series.some(s => (s.n_min || 0) < 10) && (
                  <> · <b style={{ color: 'var(--be-red)' }}>บางแบรนด์มีผู้ตอบน้อยกว่า 10 คน</b> —
                  รูปหลายเหลี่ยมของแบรนด์นั้นยังไม่นิ่ง อ่านเป็นแนวโน้มเท่านั้น</>
                )}
              </div>
              {radarMode === 'common' && imageRadar.axes.length > displayedRadar.axes.length && (
                <div className="be-tiny be-muted" style={{ marginTop: 14, paddingTop: 10,
                       borderTop: '1px dashed var(--rule)', lineHeight: 1.5 }}>
                  {imageRadar.axes.length - displayedRadar.axes.length} attribute(s) hidden
                  (no competitor data) · ดู ALL ATTRS เพื่อ show all
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === 2D Perceptual Map (interactive — pick 2 axes from radar, AUTO-NORMALIZED) === */}
      {pmAxes.length === 2 && displayedRadar.series.length > 0 && (() => {
        const [xAx, yAx] = pmAxes;
        const xIdx = displayedRadar.axes.indexOf(xAx);
        const yIdx = displayedRadar.axes.indexOf(yAx);
        if (xIdx < 0 || yIdx < 0) return null;

        // Collect raw values for plotted brands
        const raw = displayedRadar.series.map((s, i) => {
          const xv = s.values[xIdx];
          const yv = s.values[yIdx];
          if (xv == null || yv == null) return null;
          return {
            name: s.name, rawX: xv, rawY: yv, kind: s.kind,
            color: s.kind === 'brand' ? '#C8102E' : ['#1B75BC', '#D4A017', '#5C5F66'][i - 1] || '#5C5F66',
          };
        }).filter(Boolean);

        if (raw.length === 0) return null;

        // Compute min/max with 12% padding so dots aren't on the edge
        const xs = raw.map(d => d.rawX);
        const ys = raw.map(d => d.rawY);
        const xMinR = Math.min(...xs), xMaxR = Math.max(...xs);
        const yMinR = Math.min(...ys), yMaxR = Math.max(...ys);
        const padPct = 0.18;
        const xRange = xMaxR - xMinR;
        const yRange = yMaxR - yMinR;
        const xMin = Math.max(0, xMinR - (xRange || 5) * padPct);
        const xMax = Math.min(100, xMaxR + (xRange || 5) * padPct);
        const yMin = Math.max(0, yMinR - (yRange || 5) * padPct);
        const yMax = Math.min(100, yMaxR + (yRange || 5) * padPct);
        const dots = raw.map(d => ({
          ...d,
          x: ((d.rawX - xMin) / Math.max(0.001, xMax - xMin)) * 100,
          y: ((d.rawY - yMin) / Math.max(0.001, yMax - yMin)) * 100,
        }));

        return (
          <div className="be-card" style={{ padding: 22, marginBottom: 16 }}
               data-testid="be-perceptual-map-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Perceptual Map · {xAx} × {yAx}</h3>
                <div className="be-card-d">
                  Positioning ของ {study.brand?.name} เทียบกับคู่แข่ง
                  · auto-zoom · {dots.length} brand{dots.length > 1 ? 's' : ''} plotted
                </div>
              </div>
              <div className="be-mono be-tiny be-muted" style={{ textAlign: 'right', lineHeight: 1.6 }}>
                X · {xAx}<br/>
                Y · {yAx}
              </div>
            </div>
            <div style={{ display: 'grid', placeItems: 'center', padding: '14px 0' }}>
              <PerceptualMap xAxis={xAx} yAxis={yAx} dots={dots}
                             xRange={[xMin, xMax]} yRange={[yMin, yMax]}
                             normalized={true} size={460}/>
            </div>
            <div className="be-tiny be-muted" style={{ textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
              ค่าตัวเลขใต้แต่ละจุด = score 0-100 จริง · กรอบแสดง {Math.round(xMin)}-{Math.round(xMax)}
              บนแกน X และ {Math.round(yMin)}-{Math.round(yMax)} บนแกน Y เพื่อขยายความต่างให้เห็นชัด
            </div>
          </div>
        );
      })()}

      {/* === Identity vs Image map (AI-required) === */}
      {!ai?.identity_image || Object.keys(ii).length === 0 ? (
        <div className="be-card" style={{ padding: 30, textAlign: 'center', marginBottom: 16 }} data-testid="be-identity-ai-pending">
          <div className="be-eyebrow" style={{ marginBottom: 10, justifyContent: 'center' }}>ยังไม่มีผลวิเคราะห์ identity vs image จาก AI</div>
          <div className="be-muted be-small">
            {study.is_public_showcase
              ? 'เจ้าของ study ยังไม่ได้วิเคราะห์ด้วย AI · ส่วนนี้เป็นความเห็นของ AI ไม่เกี่ยวกับคะแนน Identity'
              : <>กล่อง <strong>AI analysis</strong> ด้านบน (ใช้ AI ของคุณเองได้) · ส่วนนี้เป็นความเห็นของ AI ไม่เกี่ยวกับคะแนน Identity ซึ่งคำนวณจากคำตอบผู้ตอบแล้ว</>
            }
          </div>
        </div>
      ) : (
        <div className="be-card" style={{ padding: 24, marginBottom: 16 }} data-testid="be-identity-ai-card">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <span className="be-chip" data-testid="be-ai-opinion-label"
                  style={{ background: 'var(--ink)', color: 'var(--paper)' }}>ความเห็นของ AI (ไม่ใช่คะแนน)</span>
            <Provenance ai={ai} section="identity"/>
            {ii.alignment_score_0_100 != null && (
              <span className="be-small be-muted" data-testid="be-ai-alignment-opinion">
                AI เห็นว่าสอดคล้องประมาณ {ii.alignment_score_0_100}/100 — เป็นการประเมินเชิงคุณภาพ ไม่ได้เข้าคะแนน Identity
              </span>
            )}
          </div>
          <StaleAiNote ai={ai}/>
          <IdentityImageMap intended={intended} image={imageCol} statusMap={statusMap}/>
          {ii.narrative && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--rule)',
                          fontFamily: 'IBM Plex Serif', fontSize: 14, fontStyle: 'italic',
                          color: 'var(--ink-2)', lineHeight: 1.6 }}>
              "{ii.narrative}"
            </div>
          )}
        </div>
      )}

      {oneWord?.coding_status === 'uncoded' && (
        <div className="be-card" style={{ padding: 24 }}><UncodedNotice q={oneWord}/></div>
      )}
      {oneWordCloudWords.length > 0 && oneWord?.coding_status !== 'uncoded' && (
        <div className="be-card" style={{ padding: 24 }}>
          <div className="be-card-h">
            <div>
              <h3 className="be-card-t">One-word identity cloud</h3>
              <div className="be-card-d">
                "อธิบาย {study.brand?.name} ในคำเดียว" · n = {oneWord?.stats?.n} · คำที่ตรงกับอัตลักษณ์ที่ตั้งใจเน้นสีแดง
                <div style={{ marginTop: 6 }}><CodingBadge stats={oneWord?.stats} ai={ai}/></div>
              </div>
            </div>
          </div>
          <WordCloud words={oneWordCloudWords}/>
          {oneWord?.stats?.ai_normalized && oneWordCounts.some(c => (c.variants || []).length > 1) && (
            <details style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
              <summary style={{ cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace',
                                 textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ดู variants ที่ AI รวมเข้าด้วยกัน
              </summary>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {oneWordCounts.filter(c => (c.variants || []).length > 1).slice(0, 8).map((c, i) => (
                  <div key={i} style={{ padding: '6px 10px', background: 'var(--paper-2)', border: '1px dashed var(--rule)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>{c.label}</div>
                    <div style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                      {(c.variants || []).slice(0, 6).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

const SectionLoyalty = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const score = Math.round(aggregate?.composite?.loyalty || 0);
  const nps = qs.find(q => q.kind === 'nps');
  const repeat = qs.find(q => q.kind === 'repeat_intent');
  const switching = qs.find(q => q.kind === 'switching_resistance');

  const themes = (ai?.themes_by_question || {});
  const loyOpen = qs.find(q => q.dimension === 'loyalty' && q.type === 'open_long');
  const loyThemes = loyOpen ? (themes[loyOpen.id] || []) : [];

  return (
    <div className="be-section" data-testid="be-section-loyalty" style={{ borderBottom: 0 }}>
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 04</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.loyalty.color }}/>
            <h2 className="be-h2">Brand Loyalty <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>ความภักดี</span></h2>
          </div>
          <div className="be-section-sub">NPS, repeat intent, and switching resistance.</div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100</div>
          <div><strong>{qs.filter(q => q.dimension === 'loyalty').length}</strong>q</div>
        </div>
      </div>

      <PartialDataWarning missing={getMissingKinds(qs, 'loyalty')} dimLabel="Loyalty"/>

      <div className="be-stack-2">
        {nps && nps.stats?.n > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Net Promoter Score</h3>
                <div className="be-card-d">"จะแนะนำ?" · มาตร 0-10 · n = {nps.stats?.n}</div>
              </div>
            </div>
            <NPSBar detractors={nps.stats?.detractors} passives={nps.stats?.passives} promoters={nps.stats?.promoters}/>
            <div className="be-grid-3" style={{ marginTop: 14 }}>
              <div><div className="be-mono be-tiny be-muted">NPS</div>
                   <div className="be-data" style={{ fontSize: 24, color: nps.stats?.score >= 0 ? 'var(--be-green)' : 'var(--be-red)' }}>
                     {nps.stats?.score > 0 ? '+' : ''}{fmt1(nps.stats?.score)}</div>
                   {nps.stats?.score_ci95 && <div className="be-mono be-tiny be-muted" style={{ textTransform: 'none' }} data-testid="be-nps-ci">95% CI {fmtCI(nps.stats.score_ci95)}</div>}</div>
              <div><div className="be-mono be-tiny be-muted">PROMOTERS</div>
                   <div className="be-data" style={{ fontSize: 24 }}>{fmtPct(nps.stats?.promoters_pct)}</div></div>
              <div><div className="be-mono be-tiny be-muted">DETRACTORS</div>
                   <div className="be-data" style={{ fontSize: 24 }}>{fmtPct(nps.stats?.detractors_pct)}</div></div>
            </div>
          </div>
        )}

        {(repeat || switching) && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Repeat intent & switching resistance</h3>
                <div className="be-card-d">มาตร 7 ระดับ · คะแนน 0-100 (POMP)</div>
              </div>
            </div>
            <div style={{ padding: '10px 0' }}>
              {repeat && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span>Repeat intent</span>
                    <span className="be-num">{fmt1(repeat.stats?.score_100)} <span className="be-tiny be-muted">(CI {fmtCI(repeat.stats?.score_100_ci95)} · n = {repeat.stats?.n})</span></span>
                  </div>
                  <div className="be-hbar" style={{ height: 14 }}>
                    <div className="be-hbar-fill" style={{ width: (repeat.stats?.score_100 ?? 0) + '%', background: DIMENSIONS.loyalty.color }}/>
                  </div>
                </div>
              )}
              {switching && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span>Switching resistance (vs 20% discount)</span>
                    <span className="be-num">{fmt1(switching.stats?.score_100)} <span className="be-tiny be-muted">(CI {fmtCI(switching.stats?.score_100_ci95)} · n = {switching.stats?.n})</span></span>
                  </div>
                  <div className="be-hbar" style={{ height: 14 }}>
                    <div className="be-hbar-fill" style={{ width: (switching.stats?.score_100 ?? 0) + '%', background: DIMENSIONS.quality.color }}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {loyOpen && loyOpen.coding_status === 'uncoded' && loyThemes.length === 0 && (
          <div className="be-card be-span-2"><UncodedNotice q={{ ...loyOpen, coding_status_th: 'ยังไม่ได้สกัดประเด็น' }}/></div>
        )}
        {loyThemes.length > 0 && (
          <div className="be-card be-span-2">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">ทำไมลูกค้ายังอยู่</h3>
                <div className="be-card-d">คำตอบปลายเปิดที่จัดเป็นประเด็นโดย AI · จำนวนนับโดยระบบ</div>
                <div style={{ marginTop: 6 }}><Provenance ai={ai} section="themes"/></div>
              </div>
            </div>
            {loyThemes.map((t, i) => {
              // `count` is a respondent count, not a percentage. It was piped
              // straight into a `width: {pct}%` bar, so a theme mentioned by 8
              // people drew an 8%-wide bar regardless of how many people answered.
              // Scale against the largest theme and label the axis honestly.
              const maxCount = Math.max(...loyThemes.map(x => x.count || 0), 1);
              const total = aggregate?.total_responses || 0;
              const pct = Math.min(100, ((t.count || 0) / maxCount) * 100);
              const shareTxt = total ? ` · ${Math.round((t.count || 0) / total * 100)}% ของผู้ตอบ` : '';
              return (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < loyThemes.length - 1 ? '1px dashed var(--rule)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{t.name}</span>
                    <span className="be-mono be-tiny be-muted">n={t.count}{shareTxt}</span>
                  </div>
                  <div className="be-hbar" style={{ height: 3, marginBottom: 6 }}>
                    <div className="be-hbar-fill" style={{ width: pct + '%', background: DIMENSIONS.loyalty.color }}/>
                  </div>
                  {(t.sample_quotes || []).slice(0, 1).map((q, j) => (
                    <div key={j} className="be-serif be-tiny" style={{ fontStyle: 'italic', color: 'var(--ink-3)', lineHeight: 1.5 }}>"{q}"</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

export default BrandEquityDashboardPage;

// ============ Wave Compare card ============
// Renders 2 columns of headline metrics (BES + 4 Aaker dims) side-by-side
// with a delta arrow + value between them. Used by owner dashboard for
// brand-tracking-health comparisons (e.g. Q1 vs Q2, segment A vs segment B).
const WaveCompareCard = ({ data }) => {
  const { wave_a, wave_b, deltas, significance } = data || {};
  if (!wave_a || !wave_b) return null;

  const rows = [
    { key: 'overall',   label: 'BES',        thai: 'Brand Equity Score' },
    { key: 'awareness', label: 'AWARENESS',  thai: 'การรู้จัก' },
    { key: 'quality',   label: 'QUALITY',    thai: 'คุณภาพ' },
    { key: 'identity',  label: 'IDENTITY',   thai: 'อัตลักษณ์' },
    { key: 'loyalty',   label: 'LOYALTY',    thai: 'ความภักดี' },
  ];

  const fmt = (v) => (v == null ? '—' : (Number.isFinite(v) ? Math.round(v * 10) / 10 : '—'));
  const fmtDelta = (d) => (d == null ? '—' : (d > 0 ? `+${d}` : `${d}`));
  const sig = significance?.by_dimension || {};

  return (
    <>
    <div className="be-wave-compare" data-testid="be-wave-compare">
      <div className="be-wave-compare-col">
        <h5>● WAVE A · ACTIVE</h5>
        <div className="n">n = {wave_a.n}</div>
        {rows.map(r => (
          <div key={r.key} className="be-wave-compare-row">
            <span className="label" title={r.thai}>{r.label}</span>
            <span className="val">{fmt(wave_a.composite?.[r.key])}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 36 }}>
        {rows.map(r => {
          const d = deltas?.[r.key];
          const dir = d == null ? 'flat' : (d > 0.1 ? 'up' : (d < -0.1 ? 'down' : 'flat'));
          const t = sig[r.key];
          return (
            <div key={r.key} className={`be-wave-compare-delta ${dir}`}
                 data-testid={`be-wave-delta-${r.key}`}>
              <span className="arrow">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—'}</span>
              <span className="be-mono be-tiny" style={{ fontWeight: 600 }}>{fmtDelta(d)}</span>
              {/* Significance marker: a delta alone cannot tell a real shift from
                  sampling noise. ns = not significant after Holm adjustment. */}
              {t?.testable && (
                <span className="be-mono" data-testid={`be-wave-sig-${r.key}`}
                      title={t.interpretation}
                      style={{ fontSize: 9, padding: '0 4px', marginLeft: 4,
                               border: `1px solid ${t.significant ? 'var(--be-green)' : 'var(--ink-4)'}`,
                               color: t.significant ? 'var(--be-green)' : 'var(--ink-3)' }}>
                  {t.significant ? 'SIG' : 'ns'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="be-wave-compare-col">
        <h5 style={{ color: 'var(--logo-blue)' }}>◆ WAVE B · COMPARE</h5>
        <div className="n">n = {wave_b.n}</div>
        {rows.map(r => (
          <div key={r.key} className="be-wave-compare-row">
            <span className="label" title={r.thai}>{r.label}</span>
            <span className="val">{fmt(wave_b.composite?.[r.key])}</span>
          </div>
        ))}
      </div>
    </div>

    {significance && (
      <div style={{ marginTop: 14, padding: 14, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}
           data-testid="be-wave-significance">
        <div className="be-eyebrow" style={{ marginBottom: 8 }}>
          <span className="be-dot-sm" style={{ background: 'var(--logo-blue)' }}/>
          ผลต่างนี้มีนัยสำคัญไหม · SIGNIFICANCE TEST
        </div>
        <table className="be-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>มิติ</th><th>Wave A</th><th>Wave B</th><th>ผลต่าง (95% CI)</th>
              <th>t (df)</th><th>p (Holm)</th><th>Effect</th><th>สรุป</th>
            </tr>
          </thead>
          <tbody>
            {['awareness', 'quality', 'identity', 'loyalty'].map(k => {
              const t = sig[k];
              if (!t) return null;
              return (
                <tr key={k} data-testid={`be-wave-sig-row-${k}`}>
                  <td style={{ textTransform: 'uppercase' }} className="be-mono be-tiny">{k}</td>
                  {t.testable ? (
                    <>
                      <td>{t.mean_a} <span className="be-muted be-tiny">(n={t.n_a})</span></td>
                      <td>{t.mean_b} <span className="be-muted be-tiny">(n={t.n_b})</span></td>
                      <td>{t.diff > 0 ? `+${t.diff}` : t.diff}{' '}
                        <span className="be-muted be-tiny">[{t.diff_ci95[0]}, {t.diff_ci95[1]}]</span></td>
                      <td className="be-mono be-tiny">{t.t} ({t.df})</td>
                      <td className="be-mono be-tiny"
                          style={{ color: t.significant ? 'var(--be-green)' : 'var(--ink-3)', fontWeight: 600 }}>
                        {t.p_value_holm < 0.001 ? '< 0.001' : t.p_value_holm.toFixed(3)}
                      </td>
                      <td className="be-mono be-tiny">{t.cohens_d} · {t.effect_label}</td>
                      <td className="be-tiny">{t.interpretation}</td>
                    </>
                  ) : (
                    <td colSpan={7} className="be-tiny be-muted">{t.interpretation}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="be-tiny be-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
          วิธี: {significance.method} · {significance.caveat}
        </div>
      </div>
    )}
    </>
  );
};

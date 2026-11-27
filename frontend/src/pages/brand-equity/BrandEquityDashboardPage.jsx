import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard } from '@/lib/clipboard';
import ExternalAiWorkflowModal from '@/components/ExternalAiWorkflowModal';
import './brand-equity-styles.css';
import {
  BeTopbar, Icon, ScoreRing, RadarChart, HBar, Histogram, NPSBar, Matrix2x2,
  IdentityImageMap, AIInsightCard, WordCloud, PerceptualMap, BeLoading, StatusPill, DIMENSIONS,
  BrandLogo, SWU_LOGO_URL, AIProgressCard, BeWaveSelector, MigrationOrphanBanner
} from './be-components';
import { BeFilterBar } from './BeFilterBar';
import { BeMethodology } from './BeMethodology';
import { BeWeightEditor } from './BeWeightEditor';
import { BeScoreHistory, BeUnfinishedCard } from './BeScoreHistory';
import { BeSegmentSignificance } from './BeSegmentSignificance';
import { getBrandHealthTier, getWeakestDimension } from '@/lib/brandHealthVerdict';
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

const BrandEquityDashboardPage = () => {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
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
  const [aiRunning, setAiRunning] = useState(false);
  const [externalAiOpen, setExternalAiOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('be_dash_view') || 'business'; } catch { return 'business'; }
  });
  const setViewModePersist = (m) => {
    setViewMode(m);
    try { localStorage.setItem('be_dash_view', m); } catch { /* ignore */ }
  };
  const [togglingShowcase, setTogglingShowcase] = useState(false);
  const pollRef = useRef(null);

  // ---------- Filter state (time + segments + wave) ----------
  // wave-A is the "active" filter applied to all stats/charts/AI.
  const [filter, setFilter] = useState({ from: '', to: '', segments: {}, wave: 'all' });
  const [compareFilter, setCompareFilter] = useState(null); // null = compare off
  const [compareData, setCompareData] = useState(null);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  // Build query string from filter — empty values are skipped
  const buildFilterQS = (f) => {
    if (!f) return '';
    const parts = [];
    if (f.from) parts.push(`from=${encodeURIComponent(f.from)}`);
    if (f.to)   parts.push(`to=${encodeURIComponent(f.to)}`);
    if (f.wave && f.wave !== 'all') {
      parts.push(`wave=${encodeURIComponent(f.wave)}`);
    }
    const segs = Object.fromEntries(
      Object.entries(f.segments || {}).filter(([, vs]) => (vs || []).length)
    );
    if (Object.keys(segs).length) {
      parts.push(`segments=${encodeURIComponent(JSON.stringify(segs))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  };

  // Fetch dashboard data — refetches whenever the active filter changes
  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
    /* eslint-disable-next-line */
  }, [studyId, shareToken, filter.from, filter.to, filter.wave, JSON.stringify(filter.segments)]);

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
        toast.error('โหลด wave comparison ไม่สำเร็จ');
        setCompareData(null);
      }
    })();
    /* eslint-disable-next-line */
  }, [compareFilter, filter.from, filter.to, filter.wave, JSON.stringify(filter.segments)]);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const qs = buildFilterQS(filter);
      if (isShowcase) {
        // PUBLIC fetch — no auth header
        const r = await axios.get(`${API}/brand-equity/showcase/${shareToken}${qs}`);
        const sd = r.data;
        setData({
          study: {
            id: sd.id,
            share_token: sd.share_token,
            status: sd.status,
            is_simulated: Boolean(sd.is_simulated),
            weights: sd.weights || null,
            created_at: sd.created_at || null,
            updated_at: sd.updated_at || null,
            brand: sd.brand,
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
        if (r.data.ai_cache?.status === 'running' || r.data.ai_cache?.status === 'queued') {
          startPolling();
        }
      }
    } catch (e) {
      const detail = e?.response?.data?.detail || (e?.response?.status === 404 ? 'ไม่พบ Study หรือ Showcase นี้' : 'โหลด dashboard ไม่สำเร็จ');
      setLoadError(detail);
      setData(null);
      toast.error(isShowcase ? 'Showcase ไม่พร้อม' : 'โหลด dashboard ไม่สำเร็จ');
    }
    setLoading(false);
  };

  const exportRawCsv = async () => {
    if (!studyId || isShowcase) return;
    setExportingCsv(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies/${studyId}/responses`, {
        params: { limit: 5000 },
        ...authH,
      });
      const rows = r.data?.responses || [];
      if (!rows.length) {
        toast.info('ยังไม่มีข้อมูลคำตอบสำหรับ export');
        setExportingCsv(false);
        return;
      }
      const qList = data?.study?.questions || [];
      const qIds = qList.map(q => q.id);
      const qHeaders = qList.map(q => q.template_id || q.id);
      const demoKeys = Array.from(new Set(rows.flatMap(resp => Object.keys(resp.demographics || {}))));
      const esc = (val) => {
        const s = val == null ? '' : (Array.isArray(val) ? val.join(' | ') : String(val));
        return `"${s.replace(/"/g, '""')}"`;
      };
      const header = ['response_id', 'submitted_at', 'duration_sec', ...demoKeys, ...qHeaders];
      const lines = [header.map(esc).join(',')];
      rows.forEach(resp => {
        const ansMap = {};
        (resp.answers || []).forEach(a => { ansMap[a.question_id] = a.value; });
        const line = [
          resp.id || '',
          resp.submitted_at || '',
          resp.duration_sec ?? '',
          ...demoKeys.map(k => (resp.demographics || {})[k] ?? ''),
          ...qIds.map(qid => ansMap[qid] ?? ''),
        ];
        lines.push(line.map(esc).join(','));
      });
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brand-equity-${(data?.study?.brand?.name || studyId).replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} rows (UTF-8 CSV)`);
    } catch (e) {
      toast.error('Export CSV ไม่สำเร็จ: ' + (e.response?.data?.detail || e.message));
    }
    setExportingCsv(false);
  };

  const [aiProgress, setAiProgress] = useState(null);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setAiRunning(true);
    pollRef.current = setInterval(async () => {
      try {
        const qs = buildFilterQS(filter);
        const r = await axios.get(`${API}/brand-equity/studies/${studyId}/ai-status${qs}`, authH);
        if (r.data?.progress) setAiProgress(r.data.progress);
        if (r.data.status === 'ready' || r.data.status === 'error' || r.data.status === 'no_data') {
          clearInterval(pollRef.current);
          setAiRunning(false);
          // keep final progress visible for 2s so user sees "100% เสร็จสมบูรณ์" pulse
          setTimeout(() => setAiProgress(null), 2200);
          load();
        }
      } catch (e) {/* keep polling */}
    }, 2500);
  };

  const runAI = async () => {
    try {
      const qs = buildFilterQS(filter);
      await axios.post(`${API}/brand-equity/studies/${studyId}/ai-analyze${qs}`, {}, authH);
      const sigNote = (filter.from || filter.to || Object.values(filter.segments || {}).some(v => v.length))
        ? ' (สำหรับ filter นี้)' : '';
      toast.success(`AI analysis queued${sigNote}`);
      // seed progress so the bar appears instantly even before first poll lands
      setAiProgress({ step: 0, total: 4, phase: 'รอเริ่ม…', pct: 0, elapsed_sec: 0 });
      startPolling();
    } catch (e) {
      toast.error('AI ภายในไม่พร้อมใช้งาน — กด "ใช้ AI ภายนอก (ฟรี)" เพื่อคัดลอก Prompt ไปใช้กับ ChatGPT/Gemini/Claude ได้เลย');
    }
  };

  const fetchBeExternalPrompt = useCallback(async () => {
    const qs = buildFilterQS(filter);
    const r = await axios.post(`${API}/brand-equity/studies/${studyId}/external-ai-prompt${qs}`, {}, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return r.data;
  }, [studyId, filter, token]);

  const validateBeExternal = useCallback(async (rawText) => {
    const qs = buildFilterQS(filter);
    const r = await axios.post(
      `${API}/brand-equity/studies/${studyId}/external-ai-import${qs}`,
      { raw_text: rawText, dry_run: true },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    return r.data;
  }, [studyId, filter, token]);

  const applyBeExternal = useCallback(async (rawText) => {
    const qs = buildFilterQS(filter);
    const r = await axios.post(
      `${API}/brand-equity/studies/${studyId}/external-ai-import${qs}`,
      { raw_text: rawText, dry_run: false },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!r.data?.applied) {
      throw new Error((r.data?.errors || []).join(', ') || 'ไม่สามารถนำเข้าข้อมูลได้');
    }
    toast.success('นำเข้าผลวิเคราะห์และ Positioning Map จาก AI ภายนอกเรียบร้อย!');
    await load();
  }, [studyId, filter, token]); // eslint-disable-line

  // ---------- Thesis Export — feature-flagged off until backend whitelist is enabled ----------
  // The button is rendered by BeMethodology but DISABLED unless the current user is on the
  // server-side whitelist (admin / อาจารย์ / นิสิต). Server stub at /api/brand-equity/thesis-eligible
  // returns {eligible: false} for everyone today; flip when ready to roll out.
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

  // ---------- AI-powered thesis (chapters 1-5 + extra prompt + Gemini) ----------
  const [thesisChapters, setThesisChapters] = useState([3, 4, 5]);
  const [thesisExtraPrompt, setThesisExtraPrompt] = useState('');
  const [thesisProgress, setThesisProgress] = useState('idle');
  const [thesisError, setThesisError] = useState(null);
  const thesisPollRef = useRef(null);
  // Guards against double-downloads when multiple poll requests are in-flight
  // simultaneously (each request takes >4s to come back, but interval fires every 4s,
  // so 2-5 polls can each independently see status='ready' and trigger a download).
  const thesisDownloadStartedRef = useRef(false);

  // Cleanup poll on unmount
  useEffect(() => () => { if (thesisPollRef.current) clearInterval(thesisPollRef.current); }, []);

  const downloadThesisDocx = async (cacheKey) => {
    setThesisProgress('downloading');
    try {
      const r = await axios.get(
        `${API}/brand-equity/studies/${studyId}/thesis-ai-download?cache_key=${encodeURIComponent(cacheKey)}`,
        { ...authH, responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const brandSafe = (data?.study?.brand?.name || 'brand').replace(/\s+/g, '_');
      const chSuffix = thesisChapters.map(c => `Ch${c}`).join('_');
      a.download = `BE_Thesis_${brandSafe}_${chSuffix}.docx`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); a.remove();
      toast.success('ดาวน์โหลดเรียบร้อย');
    } catch (e) {
      setThesisError('ดาวน์โหลดไม่สำเร็จ');
      toast.error('ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setThesisProgress('idle');
    }
  };

  const handleStartThesisAI = async () => {
    if (!thesisChapters || thesisChapters.length === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 บท');
      return;
    }
    // Guard against double-clicks
    if (thesisProgress && thesisProgress !== 'idle' && thesisProgress !== 'failed') {
      return;
    }
    setThesisError(null);
    setThesisProgress('starting');
    // Reset download guard for this fresh attempt
    thesisDownloadStartedRef.current = false;
    // Clear any stale interval from a previous failed attempt
    if (thesisPollRef.current) {
      clearInterval(thesisPollRef.current);
      thesisPollRef.current = null;
    }
    try {
      const qs = buildFilterQS(filter);
      const startRes = await axios.post(
        `${API}/brand-equity/studies/${studyId}/thesis-ai-start${qs}`,
        { chapters: thesisChapters, extra_prompt: thesisExtraPrompt || '' },
        authH,
      );
      const { status, job_id, cache_key, cached } = startRes.data || {};

      if (status === 'ready' || cached) {
        // Cache hit — download immediately (set guard so any racing path can't re-trigger)
        if (!thesisDownloadStartedRef.current) {
          thesisDownloadStartedRef.current = true;
          toast.info('พบ cache — ดาวน์โหลดทันที');
          await downloadThesisDocx(cache_key);
        }
        return;
      }

      // Poll status
      setThesisProgress('queued');
      thesisPollRef.current = setInterval(async () => {
        // If a download already started (e.g. previous in-flight poll just saw ready),
        // skip this poll entirely. Also clear our interval in case clearInterval
        // didn't propagate before this callback fired.
        if (thesisDownloadStartedRef.current) {
          if (thesisPollRef.current) {
            clearInterval(thesisPollRef.current);
            thesisPollRef.current = null;
          }
          return;
        }
        try {
          const s = await axios.get(
            `${API}/brand-equity/studies/${studyId}/thesis-ai-status/${job_id}`,
            authH,
          );
          // Re-check guard AFTER await — another in-flight poll may have just won the race
          if (thesisDownloadStartedRef.current) return;
          const st = s.data || {};
          if (st.progress) setThesisProgress(st.progress);
          if (st.status === 'ready') {
            // Win the race: claim the download slot atomically, THEN clearInterval.
            thesisDownloadStartedRef.current = true;
            if (thesisPollRef.current) {
              clearInterval(thesisPollRef.current);
              thesisPollRef.current = null;
            }
            await downloadThesisDocx(st.cache_key || cache_key);
          } else if (st.status === 'failed') {
            thesisDownloadStartedRef.current = true;  // prevent any other path
            if (thesisPollRef.current) {
              clearInterval(thesisPollRef.current);
              thesisPollRef.current = null;
            }
            setThesisError(st.error || 'AI generation failed');
            setThesisProgress('failed');
            toast.error('สร้างเอกสารไม่สำเร็จ');
          }
        } catch (e) { /* keep polling */ }
      }, 4000);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'เริ่มงานไม่สำเร็จ';
      setThesisError(msg);
      setThesisProgress('failed');
      toast.error(msg);
    }
  };

  const launch = async () => {
    try {
      await axios.put(`${API}/brand-equity/studies/${studyId}`, { status: 'collecting' }, authH);
      toast.success('Study เปิดรับคำตอบแล้ว');
      load();
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

  if (loading) return <div className="be-root"><BeLoading text="กำลังโหลด dashboard…"/></div>;
  if (!data) {
    return (
      <div className="be-root" data-testid="be-dashboard-error">
        {!isShowcase && (
          <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                    right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/brand-equity')}>
                             <Icon name="chevronL" size={10}/>Studies
                           </button>}/>
        )}
        <div className="be-page">
          <div className="be-card" style={{ padding: 48, textAlign: 'center', maxWidth: 520, margin: '48px auto' }}>
            <div className="be-eyebrow" style={{ color: 'var(--be-red)', justifyContent: 'center', marginBottom: 10 }}>
              UNAVAILABLE
            </div>
            <h2 className="be-h2" style={{ marginBottom: 10 }}>{loadError || 'ไม่พบข้อมูล study นี้'}</h2>
            <div className="be-small be-muted" style={{ marginBottom: 20 }}>
              study นี้อาจถูกลบ ย้ายไปถังขยะ หรือคุณไม่มีสิทธิ์เข้าถึง
            </div>
            <button className="be-btn be-btn-primary"
                    onClick={() => navigate(isShowcase ? '/showcase/brand-equity' : '/brand-equity')}>
              <Icon name="chevronL" size={11}/>{isShowcase ? 'กลับหน้า Public Showcase' : 'กลับหน้ารายการ Brand Equity'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { study, aggregate, ai_cache, ready_for_dashboard } = data;
  const composite = aggregate?.composite || {};
  const hasRealScore = Boolean(ready_for_dashboard && composite.overall != null && (aggregate?.total_responses || 0) >= 10);
  const score = hasRealScore ? Math.round(composite.overall || 0) : 0;
  const tier = tierFor(score);
  const agg = aggregate;
  const coverages = Object.values(aggregate?.composite_meta || {})
    .map(m => (typeof m?.coverage === 'number' ? m.coverage : null))
    .filter(v => v !== null);
  const minCoverage = coverages.length ? Math.min(...coverages) : null;
  const responseCount = aggregate?.total_responses || 0;
  const totalUnfiltered = data.responses_total ?? responseCount;
  const isFilteredSlice = Boolean(filter.from || filter.to || (filter.wave && filter.wave !== 'all') || Object.values(filter.segments || {}).some(v => (v || []).length));
  const targetN = study.target_responses || 100;
  const shareActive = study.status === 'collecting' || study.status === 'analyzing';
  const rawWeights = { awareness: 25, quality: 25, identity: 25, loyalty: 25, ...(study.weights || {}) };
  const weightSum = Object.values(rawWeights).reduce((s, v) => s + (Number(v) || 0), 0) || 100;
  const weakestDim = hasRealScore ? getWeakestDimension(composite) : null;

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
                  {study.brand?.category} ·{' '}
                  {isFilteredSlice
                    ? `${responseCount} / ${totalUnfiltered} responses (กรองอยู่)`
                    : `${responseCount} / ${targetN} respondents`}
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
                <div className="be-mono be-tiny" style={{ display: 'inline-flex', border: '1px solid var(--rule-strong)' }}
                     data-testid="be-view-mode-toggle">
                  {[
                    ['business', 'โหมดผู้บริหาร'],
                    ['academic', 'โหมดงานวิจัย'],
                  ].map(([m, lbl]) => (
                    <button key={m} type="button" onClick={() => setViewModePersist(m)}
                            style={{ padding: '5px 10px', fontSize: 10.5, border: 0, cursor: 'pointer',
                                     background: viewMode === m ? 'var(--ink)' : 'transparent',
                                     color: viewMode === m ? 'var(--paper)' : 'var(--ink)' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <button className="be-btn" onClick={() => navigate(`/brand-equity/studies/${study.id}/edit`)}
                        data-testid="be-dashboard-edit">
                  <Icon name="edit" size={11}/>Edit study
                </button>
                {study.status === 'draft' && (
                  <button className="be-btn be-btn-red" onClick={launch} data-testid="be-dashboard-launch">
                    <Icon name="arrowR" size={11}/>เปิดรับคำตอบ
                  </button>
                )}
                <button className="be-btn"
                        onClick={copyShareLink}
                        disabled={!shareActive}
                        title={shareActive ? 'คัดลอกลิงก์แบบสอบถาม' : 'กรุณากด "เปิดรับคำตอบ" ก่อน เพื่อให้ลิงก์แบบสอบถามใช้งานได้'}
                        data-testid="be-dashboard-share">
                  <Icon name="share" size={11}/>Copy share link
                </button>
                {totalUnfiltered > 0 && (
                  <button className="be-btn" onClick={exportRawCsv} disabled={exportingCsv}
                          title="ดาวน์โหลดคำตอบดิบทั้งหมดเป็น CSV (เหมาะสำหรับ SPSS / R / Excel)"
                          data-testid="be-dashboard-export-csv">
                    {exportingCsv ? 'Exporting…' : 'Export Raw CSV'}
                  </button>
                )}
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
                <button className="be-btn" onClick={load} data-testid="be-dashboard-refresh">
                  <Icon name="refresh" size={11}/>Refresh
                </button>
                <button className="be-btn be-btn-primary"
                        type="button"
                        onClick={() => setExternalAiOpen(true)}
                        disabled={!ready_for_dashboard}
                        title={!ready_for_dashboard ? 'ต้องมีอย่างน้อย 10 คำตอบก่อนวิเคราะห์' : 'คัดลอก Prompt ไปใช้กับ ChatGPT / Gemini / Claude ฟรี'}
                        data-testid="be-dashboard-external-ai">
                  <Icon name="copy" size={11}/>ใช้ AI ภายนอก (ฟรี)
                </button>
                {isAdmin && (
                  <button className="be-btn" onClick={runAI}
                          disabled={!ready_for_dashboard || aiRunning} data-testid="be-dashboard-run-ai">
                    <Icon name="sparkle" size={11}/>{aiRunning ? 'AI working…' : 'Run AI (Admin)'}
                  </button>
                )}
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
                  <div className="be-data" style={{ fontSize: 44 }}>{hasRealScore ? score : '—'}</div>
                  <div className="be-mono be-tiny be-muted">/ 100</div>
                </div>
              </div>
              <div className="be-score-meta">
                <div className="be-eyebrow">BRAND EQUITY SCORE</div>
                {hasRealScore ? (
                  <>
                    <div className="be-tier-line">
                      <span className="be-tier" style={{ color: tier.color }}>{tier.name}</span>
                      <span className="be-mono be-tiny be-muted">{tier.th}</span>
                    </div>
                    <div className="be-muted be-small" style={{ maxWidth: 320, lineHeight: 1.55, marginTop: 4 }}>
                      {getBrandHealthTier(score).note}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="be-tier-line">
                      <span className="be-tier" style={{ color: 'var(--be-gold)' }}>Pending</span>
                      <span className="be-mono be-tiny be-muted">รอเก็บข้อมูล</span>
                    </div>
                    <div className="be-muted be-small" style={{ maxWidth: 320, lineHeight: 1.55, marginTop: 4 }}>
                      {isFilteredSlice
                        ? `ตัวกรองนี้มี ${responseCount} คำตอบ (ต้องการ ≥ 10 เพื่อแสดงคะแนน)`
                        : `เก็บแล้ว ${responseCount} / 10 คำตอบขั้นต่ำ — เมื่อครบแล้วระบบจะคำนวณ BES ให้อัตโนมัติ`}
                    </div>
                  </>
                )}
                {agg?.sample_adequacy && hasRealScore && (
                  <div
                    className="be-small"
                    data-testid="be-sample-adequacy"
                    style={{
                      marginTop: 8, lineHeight: 1.5, maxWidth: 340,
                      color: agg.sample_adequacy.level === 'insufficient' ? 'var(--be-red)'
                           : agg.sample_adequacy.level === 'provisional' ? 'var(--be-gold)'
                           : 'var(--be-muted)',
                    }}
                  >
                    {agg.sample_adequacy.level === 'insufficient' || agg.sample_adequacy.level === 'provisional'
                      ? '⚠ ' : ''}
                    {agg.sample_adequacy.message}
                  </div>
                )}
                {hasRealScore && minCoverage != null && minCoverage < 1 && (
                  <div className="be-small" data-testid="be-coverage-warning"
                       style={{ marginTop: 6, color: 'var(--be-gold)', maxWidth: 340, lineHeight: 1.5 }}>
                    ⚠ คะแนนนี้ยังไม่ครบทุกสัญญาณ (ครบ {Math.round(minCoverage * 100)}% ของที่ออกแบบไว้)
                    — ถือเป็นตัวเลขเบื้องต้น
                  </div>
                )}
                {hasRealScore && viewMode === 'academic' && (
                  <div className="be-tiny be-muted" data-testid="be-method-update-note"
                       style={{ marginTop: 8, maxWidth: 360, lineHeight: 1.5 }}>
                    หมายเหตุ: คำนวณด้วย POMP (0–100) + ถ่วงน้ำหนัก 4 มิติ · ดูสูตรและข้อจำกัดได้ที่ภาคผนวกวิธีวิจัยด้านล่าง
                  </div>
                )}
                {hasRealScore && agg?.normalization?.basis && agg.normalization.basis !== 'none' && (
                  <div className="be-tiny be-muted" data-testid="be-normalization-basis"
                       style={{ marginTop: 6, maxWidth: 360, lineHeight: 1.5 }}>
                    การนับชื่อแบรนด์จากคำถามปลายเปิด:{' '}
                    <b>{agg.normalization.basis === 'ai' ? 'ผ่าน AI แล้ว (แม่นกับคำสะกดผิด/ชื่อเล่น)'
                                                          : 'นับตรงจากข้อความ (ยังไม่ได้รัน AI)'}</b>
                    {agg.normalization.basis === 'deterministic' && !isShowcase
                      ? ' — กด "ใช้ AI ภายนอก (ฟรี)" จะช่วยจัดกลุ่มคำพ้องได้แม่นขึ้น'
                      : ''}
                  </div>
                )}
              </div>
            </div>
            <div className="be-dim-grid" data-testid="be-dim-grid">
              {Object.values(DIMENSIONS).map(d => {
                const v = hasRealScore ? Math.round(composite[d.key] || 0) : 0;
                const wPct = Math.round(((Number(rawWeights[d.key]) || 0) / weightSum) * 100);
                return (
                  <div key={d.key} className="be-dim-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="be-mono be-tiny" style={{ color: 'var(--ink-4)', letterSpacing: '0.10em' }}>{d.num}</div>
                      <span className="be-mono be-tiny be-muted" title="น้ำหนักของมิตินี้ใน BES">w={wPct}%</span>
                    </div>
                    <div className="be-dim-num" style={{ color: hasRealScore && v > 0 ? d.color : 'var(--ink-4)' }}>
                      {hasRealScore && v > 0 ? v : '—'}
                    </div>
                    <div className="be-dim-name">{d.label}</div>
                    <div className="be-dim-bar">
                      <div className="be-dim-bar-fill" style={{ width: (hasRealScore ? v : 0) + '%', background: d.color }}/>
                    </div>
                    <div className="be-mono be-tiny be-muted">{d.th}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===== EXECUTIVE PRIORITY STRIP (Business mode) ===== */}
        {ready_for_dashboard && viewMode === 'business' && weakestDim && (
          <div className="be-card" style={{ padding: 18, marginTop: 18, borderLeft: '4px solid var(--be-red)',
                                          background: '#FFFAF0' }}
               data-testid="be-executive-priority">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div className="be-eyebrow" style={{ color: 'var(--be-red)', marginBottom: 4 }}>
                  EXECUTIVE PRIORITY · จุดที่ควรโฟกัสก่อน
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  มิติที่คะแนนต่ำสุดตอนนี้คือ <strong>{weakestDim.labelTh} ({weakestDim.label})</strong> ·{' '}
                  <span style={{ color: 'var(--be-red)' }}>{Math.round(weakestDim.value)}/100</span>
                </div>
                {(ai_cache?.master_insights || [])[0] && (
                  <div className="be-small be-muted" style={{ marginTop: 4 }}>
                    คำแนะนำอันดับ 1: {ai_cache.master_insights[0].recommendation || ai_cache.master_insights[0].headline}
                  </div>
                )}
              </div>
              <button className="be-btn be-btn-ghost be-tiny" onClick={() => setViewModePersist('academic')}>
                สลับดูค่าสถิติวิชาการ (α / CI / POMP) →
              </button>
            </div>
          </div>
        )}

        {/* ===== ความน่าเชื่อถือของการวัด (shown automatically in Academic mode) ===== */}
        {agg?.reliability && viewMode === 'academic' && (
          <div className="be-card" style={{ padding: 20, marginTop: 18 }} data-testid="be-reliability-card">
            <div className="be-eyebrow" style={{ marginBottom: 6 }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-blue)' }}/>
              ความน่าเชื่อถือของการวัด (RELIABILITY)
            </div>
            <p className="be-muted be-small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
              ค่านี้บอกว่า <b>ข้อคำถามในมิติเดียวกันวัดเรื่องเดียวกันจริงไหม</b> —
              ถ้าต่ำ แปลว่าคำถามในมิตินั้นกระจัดกระจาย คะแนนรวมของมิติจึงตีความยาก
              (เกณฑ์ที่ยอมรับกันคือ α ≥ 0.70)
            </p>
            <div className="be-dim-grid">
              {Object.values(DIMENSIONS).map(d => {
                const r = agg.reliability[d.key] || {};
                const a = r.alpha;
                const col = a == null ? 'var(--ink-4)'
                          : a >= 0.70 ? 'var(--be-green)'
                          : a >= 0.60 ? 'var(--be-gold)' : 'var(--be-red)';
                return (
                  <div key={d.key} className="be-dim-card" data-testid={`be-reliability-${d.key}`}>
                    <div className="be-dim-name">{d.label}</div>
                    <div className="be-dim-num" style={{ color: col, fontSize: 26 }}>
                      {a == null ? '—' : a.toFixed(2)}
                    </div>
                    <div className="be-mono be-tiny be-muted">
                      {a == null ? 'ประเมินไม่ได้' : `α · ${r.k_items} ข้อ · n=${r.n_complete}`}
                    </div>
                    <div className="be-small be-muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
                      {r.interpretation || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="be-muted be-tiny" style={{ marginTop: 10, lineHeight: 1.55 }}>
              มิติที่ขึ้นว่า &quot;ประเมินไม่ได้&quot; ส่วนใหญ่เพราะมีข้อคำถามแบบมาตรวัดน้อยกว่า 2 ข้อ
              (เช่น Awareness ที่ใช้คำถามปลายเปิด/เลือกตอบเป็นหลัก) ซึ่งไม่ได้แปลว่าผลไม่ดี
              แต่แปลว่ายังคำนวณค่านี้ไม่ได้ · ระบบจะไม่เดาค่าให้
            </p>
          </div>
        )}

        {/* ===== อ่านค่าตัวเลขบนหน้านี้ยังไง (GLOSSARY, Academic mode) ===== */}
        {ready_for_dashboard && viewMode === 'academic' && (
          <div className="be-card" style={{ padding: 20, marginTop: 18 }} data-testid="be-glossary-card">
            <div className="be-eyebrow" style={{ marginBottom: 10 }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>
              อ่านค่าตัวเลขบนหน้านี้ยังไง
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {[
                ['t2b', 'TOP-2-BOX (T2B)', 'สัดส่วนคนที่ตอบ 2 ระดับบนสุดของมาตรวัด (เช่น 6-7 จาก 7) = "กลุ่มที่เห็นด้วยชัดเจน"'],
                ['b2b', 'BOTTOM-2-BOX (B2B)', 'สัดส่วนคนที่ตอบ 2 ระดับล่างสุด (1-2) = "กลุ่มที่ไม่เห็นด้วยชัดเจน"'],
                ['netq', 'NET Q-SCORE', 'T2B − B2B · บวก = คนชมมากกว่าคนติ, ลบ = คนติมากกว่าคนชม (ช่วง −100 ถึง +100)'],
                ['sd', 'σ (SD)', 'ส่วนเบี่ยงเบนมาตรฐาน — ยิ่งสูง ความเห็นยิ่งกระจาย (คนเห็นต่างกันมาก) แม้ค่าเฉลี่ยจะเท่ากัน'],
                ['pomp', 'คะแนน 0-100 (POMP)', '(ค่าเฉลี่ย − 1) / (สูงสุด − 1) × 100 — แปลงทุกมาตรวัดให้เทียบกันได้ ต่ำสุด = 0 สูงสุด = 100'],
                ['ci', '95% CI', 'ช่วงที่ค่าจริงของประชากรน่าจะอยู่ · ยิ่งผู้ตอบน้อย ช่วงยิ่งกว้าง = ตัวเลขยังไม่นิ่ง'],
                ['alpha', 'α (Cronbach\u2019s alpha)', 'วัดว่าคำถามในมิติเดียวกันวัดเรื่องเดียวกันไหม · ที่ยอมรับกันคือ ≥ 0.70'],
                ['nps', 'NPS', '% ผู้แนะนำ (9-10) − % ผู้ไม่แนะนำ (0-6) · ช่วง −100 ถึง +100 · แสดงเป็น 0-100 ด้วยสูตร (NPS+100)/2'],
                ['n', 'n', 'จำนวนคนที่ตอบคำถามนั้นจริง — ไม่ใช่จำนวนผู้ตอบทั้ง study เพราะบางข้อไม่บังคับตอบ'],
              ].map(([key, term, desc]) => (
                <div key={key} data-testid={`be-glossary-term-${key}`}
                     style={{ padding: 12, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
                  <div className="be-mono be-tiny" style={{ letterSpacing: '0.08em', color: 'var(--ink)' }}>{term}</div>
                  <div className="be-small be-muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
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

        {/* AI PROGRESS CARD — live status while background job is running */}
        {aiProgress && (
          <AIProgressCard
            step={aiProgress.step}
            total={aiProgress.total}
            phase={aiProgress.phase}
            elapsed={aiProgress.elapsed_sec}
            pct={aiProgress.pct}
            done={!aiRunning}
          />
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
              filter={filter}
              fields={Object.keys(data.segments_available || {})}/>
            <BeUnfinishedCard studyId={studyId} token={token}
                              shareToken={study?.share_token}/>
          </>
        )}

        {/* NOT READY */}
        {!ready_for_dashboard && (
          <div className="be-card" style={{ padding: 40, textAlign: 'center', marginTop: 20 }}
               data-testid="be-dashboard-locked">
            {isFilteredSlice && totalUnfiltered >= 10 ? (
              <>
                <div className="be-eyebrow" style={{ marginBottom: 12, justifyContent: 'center' }}>
                  <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>FILTER SLICE TOO SMALL
                </div>
                <div className="be-h2" style={{ fontSize: 22, marginBottom: 12 }}>
                  ตัวกรองนี้มีเพียง {responseCount} คำตอบ (ต้องการ ≥ 10)
                </div>
                <div className="be-muted be-small" style={{ marginBottom: 22, maxWidth: 480, margin: '0 auto 22px' }}>
                  ข้อมูลทั้ง study มีทั้งหมด {totalUnfiltered} คำตอบ — ลองขยายช่วงเวลาหรือล้างตัวกรองเพื่อดูผลรวม
                </div>
                <button className="be-btn be-btn-primary"
                        onClick={() => setFilter({ from: '', to: '', wave: 'all', segments: {} })}
                        data-testid="be-dashboard-clear-filter">
                  ล้างตัวกรองทั้งหมด
                </button>
              </>
            ) : (
              <>
                <div className="be-eyebrow" style={{ marginBottom: 12, justifyContent: 'center' }}>
                  <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>DASHBOARD LOCKED
                </div>
                <div className="be-h2" style={{ fontSize: 22, marginBottom: 12 }}>
                  ต้องการอีก {Math.max(0, 10 - responseCount)} คำตอบเพื่อปลดล็อก
                </div>
                <div className="be-muted be-small" style={{ marginBottom: 22, maxWidth: 480, margin: '0 auto 22px' }}>
                  ต้องมีอย่างน้อย 10 คำตอบจึงจะคำนวณผลคะแนน 4 มิติและรัน AI analysis ได้อย่างน่าเชื่อถือ
                  · ปัจจุบัน{isFilteredSlice ? `ในตัวกรองมี ${responseCount} / ${totalUnfiltered}` : `เก็บแล้ว ${responseCount} / 10`} คำตอบ
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {isFilteredSlice && (
                    <button className="be-btn be-btn-primary"
                            onClick={() => setFilter({ from: '', to: '', wave: 'all', segments: {} })}
                            data-testid="be-dashboard-clear-filter">
                      ล้างตัวกรองทั้งหมด
                    </button>
                  )}
                  {shareActive ? (
                    <button className="be-btn be-btn-red" onClick={copyShareLink}>
                      <Icon name="share" size={11}/>คัดลอกลิงก์เชิญตอบแบบสอบถาม
                    </button>
                  ) : !isShowcase && study.status === 'draft' ? (
                    <button className="be-btn be-btn-red" onClick={launch}>
                      <Icon name="arrowR" size={11}/>เปิดรับคำตอบตอนนี้
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}

        {/* DASH BODY — 2 columns: full-width Main + Right AI Insights rail */}
        {ready_for_dashboard && (
          <div className="be-dash-body">
            {/* MAIN */}
            <div className="be-dash-main">
              <SectionAwareness study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionQuality study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionIdentity
                study={study}
                aggregate={aggregate}
                ai={ai_cache}
                isShowcase={isShowcase}
                onOpenExternalAi={!isShowcase ? () => setExternalAiOpen(true) : null}
              />
              <SectionLoyalty study={study} aggregate={aggregate} ai={ai_cache}/>
            </div>

            {/* RIGHT RAIL — Master AI Insights */}
            <div className="be-dash-ai" data-testid="be-dashboard-ai-rail">
              <div className="be-eyebrow" style={{ marginBottom: 8 }}>
                MASTER AI INSIGHTS
                {ai_cache?.source === 'external_ai' && (
                  <span style={{
                    marginLeft: 8, padding: '2px 7px', fontSize: 9,
                    background: 'rgba(27,117,188,0.12)', color: '#1B75BC',
                    borderRadius: 3, letterSpacing: '0.04em',
                  }}>
                    EXTERNAL AI
                  </span>
                )}
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
                {(ai_cache?.master_insights?.length || 0) > 0 ? `${ai_cache.master_insights.length} actions for the brand team` : 'AI analysis pending'}
              </div>
              <div className="be-tiny be-muted" style={{ marginBottom: 16, lineHeight: 1.5,
                     paddingBottom: 14, borderBottom: '1px dashed var(--rule)' }}>
                Generated from {responseCount} responses + 4 dimension stats · cited to specific questions.
                {filter.wave && filter.wave !== 'all' && (
                  <> · <strong>Insights scoped to {filter.wave === 'latest' ? 'the latest wave' : `wave ${filter.wave}`}</strong> — switch wave above to refresh.</>
                )}
              </div>

              {(ai_cache?.master_insights || []).length === 0 ? (
                <div className="be-muted be-small" style={{ padding: '20px 0', textAlign: 'center' }}>
                  {isShowcase
                    ? <>ยังไม่มี master insights —<br/>เจ้าของ study ต้องวิเคราะห์ด้วย AI ก่อน</>
                    : <>ยังไม่มี master insights —<br/>กดปุ่ม <strong>ใช้ AI ภายนอก (ฟรี)</strong> ด้านล่างเพื่อนำเข้าผลวิเคราะห์</>
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
                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                  <button className="be-btn be-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                          type="button"
                          onClick={() => setExternalAiOpen(true)}
                          data-testid="be-dashboard-rail-external-ai">
                    <Icon name="copy" size={11}/>ใช้ AI ภายนอก (ฟรี · Copy Prompt → วางผล)
                  </button>
                  {isAdmin && (
                    <button className="be-btn" style={{ width: '100%', justifyContent: 'center' }}
                            onClick={runAI} disabled={aiRunning} data-testid="be-dashboard-regen-insights">
                      <Icon name="refresh" size={11}/>{aiRunning ? 'Regenerating…' : 'Generate new insights (Admin)'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* METHODOLOGY · Appendix at bottom of report — explains every score */}
        {ready_for_dashboard && (
          <BeMethodology
            canExportThesis={canExportThesis}
            showExport={!isShowcase}
            onOpenWeights={isShowcase ? null : () => setWeightEditorOpen(true)}
            thesisProgress={thesisProgress}
            thesisError={thesisError}
            selectedChapters={thesisChapters}
            onSelectedChaptersChange={setThesisChapters}
            extraPrompt={thesisExtraPrompt}
            onExtraPromptChange={setThesisExtraPrompt}
            onStartThesisExport={handleStartThesisAI}
          />
        )}
      </div>

      {weightEditorOpen && !isShowcase && (
        <BeWeightEditor study={study} composite={composite} token={token}
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

      <ExternalAiWorkflowModal
        open={externalAiOpen}
        onClose={() => setExternalAiOpen(false)}
        title="วิเคราะห์ Brand Equity & Positioning Map ด้วย AI ภายนอก (ฟรี)"
        subtitle="คัดลอก Prompt ที่มีผลสำรวจ คำตอบปลายเปิด และคะแนนเทียบคู่แข่งทั้งหมดไปวางใน ChatGPT / Gemini / Claude แล้วนำ JSON กลับมาตรวจสอบและบันทึก"
        fetchPrompt={fetchBeExternalPrompt}
        validatePayload={validateBeExternal}
        applyPayload={applyBeExternal}
        renderPreview={(preview) => (
          <div className="space-y-1.5">
            <div>
              <strong>จัดกลุ่มคำตอบปลายเปิด:</strong> {preview.normalized_questions} ข้อ ·{' '}
              <strong>Themes:</strong> {preview.theme_questions} ข้อ ·{' '}
              <strong>Identity Alignment:</strong> {preview.alignment_score_0_100}/100 ({preview.aligned_count} aligned)
            </div>
            <div>
              <strong>Master Insights:</strong> {preview.insights_count} ข้อ
              {preview.has_positioning && preview.recommended_axes?.x && (
                <> · <strong>Perceptual Map AI แนะนำ:</strong> {preview.recommended_axes.x} × {preview.recommended_axes.y}</>
              )}
            </div>
            {preview.insights_headlines?.length > 0 && (
              <ul className="list-disc pl-5 text-gray-700">
                {preview.insights_headlines.slice(0, 3).map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
          </div>
        )}
      />
    </div>
  );
};

// ============ Section components ============

const SectionAwareness = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const tom = qs.find(q => q.kind === 'unaided_top_of_mind');
  const recall = qs.find(q => q.kind === 'unaided_recall');
  const aided = qs.find(q => q.kind === 'aided_recognition');
  const score = Math.round(aggregate?.composite?.awareness || 0);

  // Top-of-mind word cloud (deterministic jitter so unrelated UI clicks don't jump words)
  const tomCounts = tom?.stats?.counts || [];
  const target = study.brand?.name;
  const cloudWords = tomCounts.slice(0, 12).map((c, i) => {
    const h = (String(c.label || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) + i * 17) % 10;
    return {
      text: c.label,
      size: Math.max(11, 14 + Math.round(c.pct * 0.5)),
      target: c.label?.toLowerCase().includes(target?.toLowerCase() || '___'),
      x: 10 + (i % 4) * 22 + h * 0.8,
      y: 16 + Math.floor(i / 4) * 27 + (h % 5) * 1.4,
    };
  });

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

  const targetTomPct = tomCounts.find(c => c.label?.toLowerCase().includes(target?.toLowerCase() || '___'))?.pct || 0;

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
        {tomCounts.length > 0 && (
          <div className="be-card be-span-2">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Top-of-Mind brand cloud</h3>
                <div className="be-card-d">
                  "แบรนด์แรกที่นึกถึง?" · n={tom?.stats?.n} · target highlighted
                  {tom?.stats?.ai_normalized && (
                    <span className="be-chip-dim be-mono"
                          style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                   border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px',
                                   fontSize: 9.5, letterSpacing: '0.06em' }}>
                      AI · NORMALIZED
                    </span>
                  )}
                </div>
              </div>
              <div className="be-card-stat">
                <span className="be-big be-num">{Math.round(targetTomPct)}</span>
                <span className="be-unit">% top-of-mind</span>
              </div>
            </div>
            <WordCloud words={cloudWords}/>
            {tom?.stats?.ai_normalized && tomCounts.some(c => (c.variants || []).length > 1) && (
              <details style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace',
                                   textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  ดู variants ที่ AI รวมเข้าด้วยกัน
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

        {recallRows.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Unaided recall</h3>
                <div className="be-card-d">
                  "นึกถึงแบรนด์อะไรอีกบ้าง?" · n={recall?.stats?.n}
                  {recall?.stats?.ai_normalized && (
                    <span className="be-chip-dim be-mono"
                          style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                   border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px',
                                   fontSize: 9.5, letterSpacing: '0.06em' }}>
                      AI · NORMALIZED
                    </span>
                  )}
                </div>
              </div>
            </div>
            <HBar rows={recallRows} color={DIMENSIONS.awareness.color}/>
          </div>
        )}

        {aidedRows.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Aided recognition</h3>
                <div className="be-card-d">"แบรนด์ใดที่คุณรู้จัก?" · n={aided?.stats?.n}</div>
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
                  <div className="be-card-d">5-pt scale · n={fam?.stats?.n}</div>
                </div>
                <div className="be-card-stat">
                  <span className="be-big be-num">{fam?.stats?.mean}</span>
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
    brandValue: q.stats?.score_100 != null ? Math.round(q.stats.score_100) : Math.round((q.stats?.mean || 0) / 7 * 100),
  }));
  const radarAxes = radarAxesData.map(a => a.axis);

  // Competitor parallels (kind=competitor_<slug>) — gather POMP score_100 per (compare_brand, slug)
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
    compMap[cb][slug] = q.stats?.score_100 != null ? Math.round(q.stats.score_100) : Math.round((q.stats.mean || 0) / 7 * 100);
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
                <div className="be-card-d">Mean Likert (1-7) scaled to 0-100</div>
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
                <div className="be-card-d">"คุณภาพระดับใด?" · 1-7 scale · n={overall.stats?.n}</div>
              </div>
              <div className="be-card-stat">
                <span className="be-big be-num">{overall.stats?.mean}</span>
                <span className="be-unit">mean · σ {overall.stats?.std}</span>
                {overall.stats?.score_100_ci95 && (
                  <span className="be-mono be-tiny be-muted" data-testid="be-quality-ci95">
                    95% CI {overall.stats.score_100_ci95[0]}–{overall.stats.score_100_ci95[1]} (0-100)
                  </span>
                )}
              </div>
            </div>
            <Histogram values={overall.stats.distribution} color={DIMENSIONS.quality.color}
                       peakIdx={overall.stats.distribution.indexOf(Math.max(...overall.stats.distribution))}/>
            <div className="be-grid-3" style={{ marginTop: 14 }}>
              <div style={{ padding: '8px 10px', background: 'var(--paper-2)' }}>
                <div className="be-mono be-tiny be-muted">TOP-2-BOX</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 500 }}>{overall.stats?.t2b}%</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'var(--paper-2)' }}>
                <div className="be-mono be-tiny be-muted">BOTTOM-2-BOX</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 500 }}>{overall.stats?.b2b}%</div>
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

        {themes.length > 0 && (
          <div className="be-card be-span-2">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Voice of respondent · quality reasons</h3>
                <div className="be-card-d">Open-end clustered into themes by AI</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {themes.map((th, i) => (
                <div key={i} style={{ padding: 14, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{th.name}</div>
                    <div className="be-num be-tiny" style={{ color: th.sentiment > 0 ? 'var(--be-green)' : th.sentiment < 0 ? 'var(--be-red)' : 'var(--ink-3)' }}>
                      {th.count} · {th.sentiment > 0 ? '+' : ''}{th.sentiment?.toFixed(1) ?? '0'}
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

const SectionIdentity = ({ study, aggregate, ai, isShowcase = false, onOpenExternalAi = null }) => {
  const score = Math.round(aggregate?.composite?.identity || 0);
  const qs = aggregate?.questions || [];
  const ii = ai?.identity_image || {};
  const aiPos = ai?.positioning_analysis || {};
  const association = aggregate?.association || {};
  const imageRadar = aggregate?.image_radar || { axes: [], series: [] };

  // Perceptual map state — auto-defaults to first 2 available axes and supports dropdown or radar click
  const [pmAxes, setPmAxes] = React.useState([]);
  const [pmScale, setPmScale] = React.useState('auto'); // 'auto' | 'full' (0-100)
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

  const COMP_DOT_COLORS = ['#1B75BC', '#D4A017', '#10B981', '#7C3AED', '#EA580C', '#06B6D4'];
  const effectivePmAxes = pmAxes.length === 2
    ? pmAxes
    : (displayedRadar.axes?.length >= 2 ? [displayedRadar.axes[0], displayedRadar.axes[1]] : pmAxes);

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

  // 1-word identity cloud (deterministic coordinates)
  const oneWord = qs.find(q => q.kind === 'image_one_word');
  const oneWordCounts = oneWord?.stats?.counts || [];
  const oneWordCloudWords = oneWordCounts.slice(0, 14).map((c, i) => {
    const h = (String(c.label || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) + i * 19) % 10;
    return {
      text: c.label,
      size: Math.max(12, 14 + Math.round(c.pct * 0.6)),
      target: aligned.includes(c.label),
      x: 10 + (i % 5) * 18 + h * 0.7,
      y: 16 + Math.floor(i / 5) * 28 + (h % 5) * 1.1,
    };
  });

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
          <div>Alignment <strong style={{ color: ii.alignment_score_0_100 >= 60 ? 'var(--be-green)' : 'var(--be-red)' }}>
            {ii.alignment_score_0_100 != null ? `${ii.alignment_score_0_100}%` : '—'}
          </strong></div>
          <div><strong>{aligned.length}</strong>/{intended.length} aligned</div>
          <div><strong>{score}</strong>/100</div>
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
            BRAND VISUAL IDENTITY · what the brand intended
            {study.identity?.archetype && (
              <span className="be-chip" style={{ marginLeft: 10, background: 'var(--ink)', color: 'var(--paper)' }}>
                {study.identity.archetype}
              </span>
            )}
          </div>
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
                            color: s.kind === 'brand' ? '#C8102E' : COMP_DOT_COLORS[(i - 1) % COMP_DOT_COLORS.length],
                            dash: s.kind === 'brand' ? '0' : '4 3',
                            fill: s.kind === 'brand' ? 0.18 : 0.06,
                          }))}
                          size={Math.min(360, displayedRadar.axes.length * 36 + 200)}
                          onAxisClick={togglePmAxis}
                          selectedAxes={effectivePmAxes}
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
                          background: s.kind === 'brand' ? '#C8102E' : COMP_DOT_COLORS[(i - 1) % COMP_DOT_COLORS.length],
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

      {/* === 2D Perceptual Map (auto-displayed with dropdown X/Y selectors, AUTO-NORMALIZED) === */}
      {effectivePmAxes.length === 2 && displayedRadar.series.length > 0 && (() => {
        const [xAx, yAx] = effectivePmAxes;
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
            color: s.kind === 'brand' ? '#C8102E' : COMP_DOT_COLORS[(i - 1) % COMP_DOT_COLORS.length],
          };
        }).filter(Boolean);

        if (raw.length === 0) return null;

        // Compute min/max with 18% padding (auto-zoom) OR fixed 0..100 scale
        const xs = raw.map(d => d.rawX);
        const ys = raw.map(d => d.rawY);
        const xMinR = Math.min(...xs), xMaxR = Math.max(...xs);
        const yMinR = Math.min(...ys), yMaxR = Math.max(...ys);
        const padPct = 0.18;
        const xRange = xMaxR - xMinR;
        const yRange = yMaxR - yMinR;
        const useAuto = pmScale === 'auto';
        const xMin = useAuto ? Math.max(0, xMinR - (xRange || 5) * padPct) : 0;
        const xMax = useAuto ? Math.min(100, xMaxR + (xRange || 5) * padPct) : 100;
        const yMin = useAuto ? Math.max(0, yMinR - (yRange || 5) * padPct) : 0;
        const yMax = useAuto ? Math.min(100, yMaxR + (yRange || 5) * padPct) : 100;
        const dots = raw.map(d => ({
          ...d,
          x: ((d.rawX - xMin) / Math.max(0.001, xMax - xMin)) * 100,
          y: ((d.rawY - yMin) / Math.max(0.001, yMax - yMin)) * 100,
        }));
        const focalDot = raw.find(d => d.kind === 'brand');
        const hasAiRecAxes = Boolean(
          aiPos?.recommended_axes?.x &&
          aiPos?.recommended_axes?.y &&
          (displayedRadar.axes || []).includes(aiPos.recommended_axes.x) &&
          (displayedRadar.axes || []).includes(aiPos.recommended_axes.y)
        );

        return (
          <div className="be-card" style={{ padding: 22, marginBottom: 16 }}
               data-testid="be-perceptual-map-card">
            <div className="be-card-h" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="be-card-t">Perceptual Map · {xAx} × {yAx}</h3>
                <div className="be-card-d">
                  Positioning ของ {study.brand?.name} เทียบกับคู่แข่ง
                  · {useAuto ? 'auto-zoom' : 'สเกล 0-100'} · {dots.length} brand{dots.length > 1 ? 's' : ''} plotted
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="be-mono be-tiny" style={{ display: 'flex', border: '1px solid var(--rule-strong)' }}>
                  <button
                    type="button"
                    onClick={() => setPmScale('auto')}
                    data-testid="be-pm-scale-auto"
                    style={{
                      padding: '4px 8px',
                      background: useAuto ? 'var(--ink)' : 'transparent',
                      color: useAuto ? 'var(--paper)' : 'var(--ink)',
                      border: 0, cursor: 'pointer', fontSize: 10,
                    }}
                  >
                    AUTO-ZOOM
                  </button>
                  <button
                    type="button"
                    onClick={() => setPmScale('full')}
                    data-testid="be-pm-scale-full"
                    style={{
                      padding: '4px 8px',
                      background: !useAuto ? 'var(--ink)' : 'transparent',
                      color: !useAuto ? 'var(--paper)' : 'var(--ink)',
                      border: 0, borderLeft: '1px solid var(--rule-strong)', cursor: 'pointer', fontSize: 10,
                    }}
                  >
                    0–100
                  </button>
                </div>
                <label className="be-mono be-tiny be-muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  X:
                  <select className="be-input" style={{ padding: '4px 6px', fontSize: 11, width: 'auto' }}
                          value={xAx} onChange={e => setPmAxes([e.target.value, yAx])}
                          data-testid="be-pm-x-select">
                    {(displayedRadar.axes || []).map(ax => <option key={ax} value={ax}>{ax}</option>)}
                  </select>
                </label>
                <label className="be-mono be-tiny be-muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Y:
                  <select className="be-input" style={{ padding: '4px 6px', fontSize: 11, width: 'auto' }}
                          value={yAx} onChange={e => setPmAxes([xAx, e.target.value])}
                          data-testid="be-pm-y-select">
                    {(displayedRadar.axes || []).map(ax => <option key={ax} value={ax}>{ax}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {dots.length === 1 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#FFFAF0', border: '1px solid var(--be-gold)', fontSize: 12, color: 'var(--ink-2)' }}>
                💡 ตอนนี้มีข้อมูลเฉพาะแบรนด์ของคุณ — หากต้องการแผนที่เทียบคู่แข่ง เพิ่มรายชื่อคู่แข่งในหน้าแก้ไข Study แล้วเก็บข้อมูลเพิ่มเติม
              </div>
            )}

            <div style={{ display: 'grid', placeItems: 'center', padding: '14px 0' }}>
              <PerceptualMap xAxis={xAx} yAxis={yAx} dots={dots}
                             xRange={[xMin, xMax]} yRange={[yMin, yMax]}
                             normalized={useAuto} size={460}/>
            </div>
            <div className="be-tiny be-muted" style={{ textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
              ค่าตัวเลขใต้แต่ละจุด = score 0-100 จริง · กรอบแสดง {Math.round(xMin)}-{Math.round(xMax)} บนแกน X และ {Math.round(yMin)}-{Math.round(yMax)} บนแกน Y
            </div>

            {/* Brand & Competitor Coordinates + Gap Table */}
            {dots.length > 0 && (
              <div style={{ marginTop: 14, overflowX: 'auto' }} data-testid="be-pm-table">
                <table className="be-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>แบรนด์</th>
                      <th style={{ textAlign: 'right' }}>{xAx} (0-100)</th>
                      <th style={{ textAlign: 'right' }}>{yAx} (0-100)</th>
                      {focalDot && dots.length > 1 && <th style={{ textAlign: 'right' }}>ส่วนต่างเทียบ {focalDot.name}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {raw.map((row) => {
                      const isFocal = row.kind === 'brand';
                      const dx = focalDot ? (row.rawX - focalDot.rawX) : 0;
                      const dy = focalDot ? (row.rawY - focalDot.rawY) : 0;
                      return (
                        <tr key={row.name}>
                          <td style={{ fontWeight: isFocal ? 700 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: row.color, display: 'inline-block' }}/>
                            {row.name}
                            {isFocal && <span className="be-mono be-tiny be-muted">· focal</span>}
                          </td>
                          <td className="be-mono" style={{ textAlign: 'right' }}>{row.rawX.toFixed(1)}</td>
                          <td className="be-mono" style={{ textAlign: 'right' }}>{row.rawY.toFixed(1)}</td>
                          {focalDot && dots.length > 1 && (
                            <td className="be-mono be-tiny" style={{ textAlign: 'right', color: isFocal ? 'var(--ink-4)' : 'var(--ink-2)' }}>
                              {isFocal ? '—' : `X ${dx >= 0 ? '+' : ''}${dx.toFixed(1)} · Y ${dy >= 0 ? '+' : ''}${dy.toFixed(1)}`}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* AI Positioning Analysis & White Space */}
            {(aiPos?.summary || aiPos?.white_space || (aiPos?.competitor_positions || []).length > 0 || hasAiRecAxes) && (
              <div style={{ marginTop: 16, padding: 14, background: 'var(--paper-2)', border: '1px solid var(--rule-strong)' }}
                   data-testid="be-ai-positioning-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div className="be-eyebrow" style={{ color: 'var(--be-red)' }}>
                    <Icon name="sparkle" size={11}/>AI COMPETITIVE POSITIONING ANALYSIS
                  </div>
                  {hasAiRecAxes && (
                    <button
                      type="button"
                      className="be-btn be-btn-sm be-btn-primary"
                      data-testid="be-pm-apply-ai-axes"
                      onClick={() => setPmAxes([aiPos.recommended_axes.x, aiPos.recommended_axes.y])}
                    >
                      ใช้แกนที่ AI แนะนำ ({aiPos.recommended_axes.x} × {aiPos.recommended_axes.y})
                    </button>
                  )}
                </div>
                {aiPos.summary && (
                  <p className="be-small" style={{ marginBottom: 8, lineHeight: 1.6, color: 'var(--ink)' }}>{aiPos.summary}</p>
                )}
                {aiPos.recommended_axes?.reason && (
                  <div className="be-tiny be-muted" style={{ marginBottom: 8 }}>
                    <strong>เหตุผลเลือกแกน:</strong> {aiPos.recommended_axes.reason}
                  </div>
                )}
                {aiPos.white_space && (
                  <div className="be-small" style={{ padding: '8px 10px', background: '#fff', borderLeft: '3px solid var(--be-green)', marginBottom: 10 }}>
                    <strong>ช่องว่างทางการตลาด (White Space):</strong> {aiPos.white_space}
                  </div>
                )}
                {(aiPos.competitor_positions || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
                    {aiPos.competitor_positions.map((cp, idx) => (
                      <div key={idx} style={{ background: '#fff', border: '1px solid var(--rule)', padding: '8px 10px', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{cp.brand}</div>
                        {cp.position_label && <div className="be-mono be-tiny" style={{ color: 'var(--be-blue)', marginBottom: 4 }}>{cp.position_label}</div>}
                        {cp.strength && <div className="be-tiny">✅ {cp.strength}</div>}
                        {cp.weakness && <div className="be-tiny be-muted">⚠ {cp.weakness}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* === Identity vs Image map (AI-required) === */}
      {!ai?.identity_image || Object.keys(ii).length === 0 ? (
        <div className="be-card" style={{ padding: 30, textAlign: 'center', marginBottom: 16 }}>
          <div className="be-eyebrow" style={{ marginBottom: 10, justifyContent: 'center' }}>AI ANALYSIS PENDING</div>
          <div className="be-muted be-small" style={{ marginBottom: onOpenExternalAi ? 12 : 0 }}>
            {isShowcase
              ? 'Identity-Image map ยังไม่พร้อม · เจ้าของ study ต้องวิเคราะห์ด้วย AI ก่อน'
              : <>Identity-Image map ต้องการการวิเคราะห์ข้อความจาก AI · กดปุ่ม <strong>ใช้ AI ภายนอก (ฟรี)</strong> ด้านล่างเพื่อ Copy Prompt ไปใช้ได้เลย</>
            }
          </div>
          {!isShowcase && onOpenExternalAi && (
            <button type="button" className="be-btn be-btn-primary" onClick={onOpenExternalAi} data-testid="be-identity-pending-external-ai">
              <Icon name="copy" size={11}/>ใช้ AI ภายนอก (ฟรี · Copy Prompt → วางผล)
            </button>
          )}
        </div>
      ) : (
        <div className="be-card" style={{ padding: 24, marginBottom: 16 }}>
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

      {oneWordCloudWords.length > 0 && (
        <div className="be-card" style={{ padding: 24 }}>
          <div className="be-card-h">
            <div>
              <h3 className="be-card-t">One-word identity cloud</h3>
              <div className="be-card-d">
                "อธิบาย {study.brand?.name} ในคำเดียว" · n={oneWord?.stats?.n}
                {oneWord?.stats?.ai_normalized && (
                  <span className="be-chip-dim be-mono"
                        style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                 border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px',
                                 fontSize: 9.5, letterSpacing: '0.06em' }}>
                    AI · NORMALIZED
                  </span>
                )}
                {' '}· aligned highlighted in red
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
                <div className="be-card-d">"จะแนะนำ?" · scale 0-10 · n={nps.stats?.n}</div>
              </div>
            </div>
            <NPSBar detractors={nps.stats?.detractors} passives={nps.stats?.passives} promoters={nps.stats?.promoters}/>
            <div className="be-grid-3" style={{ marginTop: 14 }}>
              <div><div className="be-mono be-tiny be-muted">NPS</div>
                   <div className="be-data" style={{ fontSize: 24, color: nps.stats?.score >= 0 ? 'var(--be-green)' : 'var(--be-red)' }}>
                     {nps.stats?.score > 0 ? '+' : ''}{nps.stats?.score}</div></div>
              <div><div className="be-mono be-tiny be-muted">PROMOTERS</div>
                   <div className="be-data" style={{ fontSize: 24 }}>{nps.stats?.promoters_pct}%</div></div>
              <div><div className="be-mono be-tiny be-muted">DETRACTORS</div>
                   <div className="be-data" style={{ fontSize: 24 }}>{nps.stats?.detractors_pct}%</div></div>
            </div>
          </div>
        )}

        {(repeat || switching) && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Repeat intent & switching resistance</h3>
                <div className="be-card-d">7-pt Likert</div>
              </div>
            </div>
            <div style={{ padding: '10px 0' }}>
              {repeat && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span>Repeat intent</span>
                    <span className="be-num">{repeat.stats?.mean} / 7 ({Math.round(repeat.stats?.score_100 ?? ((repeat.stats?.mean || 0) / 7 * 100))}/100)</span>
                  </div>
                  <div className="be-hbar" style={{ height: 14 }}>
                    <div className="be-hbar-fill" style={{ width: (repeat.stats?.score_100 ?? ((repeat.stats?.mean || 0) / 7 * 100)) + '%', background: DIMENSIONS.loyalty.color }}/>
                  </div>
                </div>
              )}
              {switching && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span>Switching resistance (vs 20% discount)</span>
                    <span className="be-num">{switching.stats?.mean} / 7 ({Math.round(switching.stats?.score_100 ?? ((switching.stats?.mean || 0) / 7 * 100))}/100)</span>
                  </div>
                  <div className="be-hbar" style={{ height: 14 }}>
                    <div className="be-hbar-fill" style={{ width: (switching.stats?.score_100 ?? ((switching.stats?.mean || 0) / 7 * 100)) + '%', background: DIMENSIONS.quality.color }}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {loyThemes.length > 0 && (
          <div className="be-card be-span-2">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Why customers stay</h3>
                <div className="be-card-d">Open-end clustered by AI · top themes</div>
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

      <div className="be-wave-compare-deltas" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 36 }}>
        {rows.map(r => {
          const d = deltas?.[r.key];
          const dir = d == null ? 'flat' : (d > 0.1 ? 'up' : (d < -0.1 ? 'down' : 'flat'));
          const t = sig[r.key];
          return (
            <div key={r.key} className={`be-wave-compare-delta ${dir}`}
                 data-testid={`be-wave-delta-${r.key}`}>
              <span className="be-mono be-tiny be-muted" style={{ fontSize: 10 }}>{r.label}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="arrow">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—'}</span>
                <span className="be-mono be-tiny" style={{ fontWeight: 600 }}>{fmtDelta(d)}</span>
              </span>
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import AiActionButton from '@/components/AiActionButton';
import ExternalAiDialog from '@/components/ExternalAiDialog';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';
import { isLlmExternalOnly } from '@/lib/llmErrors';
import { AIProgressCard } from './be-components';
import {
  API, authHeaders, buildFilterQS, isFilterActive, errText, fmtDateTime,
} from './beUtils';

/**
 * AI analysis for the Brand Equity dashboard (feature `be.ai_analyze`).
 *
 *   system path   POST ai-analyze          (only when the admin allows it)
 *   external path GET  ai-analyze/external-prompt  +  POST ai-analyze/external-import
 *
 * Both use the SAME filter params the dashboard is showing (from/to/wave/segments)
 * so the result lands in the slice the user is looking at.
 */

export const SECTION_LABEL = {
  coding: 'การเข้ารหัสคำตอบปลายเปิด',
  themes: 'ประเด็นจากคำตอบ (themes)',
  identity: 'อัตลักษณ์ vs ภาพลักษณ์',
  insights: 'ข้อเสนอแนะเชิงกลยุทธ์',
};

const TERMINAL = ['ready', 'partial', 'error', 'no_data'];

/** All AI-analysis state + actions for one study/filter. */
export const useBeAiAnalysis = ({ studyId, token, filter, reload, enabled = true }) => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [extOpen, setExtOpen] = useState(false);
  const [importInfo, setImportInfo] = useState(null);
  const [onlyParts, setOnlyParts] = useState(null); // sections to finish after a partial job
  const pollRef = useRef(null);
  const qsRef = useRef('');
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const qs = buildFilterQS(filter);
  qsRef.current = qs;

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    setRunning(true);
    const runQs = qsRef.current;
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - started > 30 * 60 * 1000) { // a lost job must not poll forever
        stopPolling(); setRunning(false); setProgress(null);
        return;
      }
      try {
        const r = await axios.get(`${API}/brand-equity/studies/${studyId}/ai-status${runQs}`,
          { headers: authHeaders(token) });
        if (r.data?.progress) setProgress(r.data.progress);
        if (TERMINAL.includes(r.data?.status)) {
          stopPolling();
          setRunning(false);
          setTimeout(() => setProgress(null), 2200);
          if (r.data.status === 'ready') toast.success('AI วิเคราะห์เสร็จแล้ว');
          else if (r.data.status === 'partial') toast.warning('AI วิเคราะห์ได้บางส่วน — ดูรายละเอียดในกล่อง AI');
          else if (r.data.status === 'error') toast.error('AI วิเคราะห์ไม่สำเร็จ — ดูรายละเอียดในกล่อง AI');
          await reloadRef.current?.();
        }
      } catch { /* keep polling — a single failed poll is not a failed job */ }
    }, 2500);
  }, [studyId, token, stopPolling]);

  // Resume the progress bar if the page is opened while a job is in flight.
  const resumeIfRunning = useCallback((aiCache) => {
    if (!enabled) return;
    if (aiCache?.status === 'running' || aiCache?.status === 'queued') {
      if (!pollRef.current) startPolling();
    }
  }, [enabled, startPolling]);

  /** The existing system action. Policy errors are rethrown so AiActionButton can
   *  switch to the external dialog; every other failure is handled here. */
  const runSystem = useCallback(async () => {
    try {
      const r = await axios.post(`${API}/brand-equity/studies/${studyId}/ai-analyze${qs}`, {},
        { headers: authHeaders(token) });
      const st = r.data?.status;
      if (st === 'queued' || st === 'running') {
        toast.success(st === 'running'
          ? 'มีงานวิเคราะห์ของชุดข้อมูลนี้กำลังทำงานอยู่แล้ว'
          : `เริ่มวิเคราะห์แล้ว${isFilterActive(filter) ? ' (เฉพาะชุดข้อมูลที่กรองอยู่)' : ''}`);
        setProgress({ step: 0, total: 4, phase: 'รอเริ่ม…', pct: 0, elapsed_sec: 0 });
        startPolling();
      }
    } catch (e) {
      if (isLlmExternalOnly(e)) throw e;
      toast.error(errText(e, 'เริ่มวิเคราะห์ด้วย AI ของระบบไม่สำเร็จ'));
    }
  }, [studyId, token, qs, filter, startPolling]);

  const externalProps = useMemo(() => ({
    title: onlyParts ? 'ทำส่วนที่เหลือด้วย AI ของฉันเอง' : 'วิเคราะห์ผลด้วย AI ของฉันเอง',
    onlyParts: onlyParts || undefined,
    promptRequest: { method: 'GET', url: `${API}/brand-equity/studies/${studyId}/ai-analyze/external-prompt${qs}` },
    importUrl: `${API}/brand-equity/studies/${studyId}/ai-analyze/external-import${qs}`,
    onImported: async (data) => {
      setImportInfo({
        at: data?.imported_at, model: data?.model_label,
        sections: data?.imported_sections || [], warnings: data?.warnings || [],
      });
      await reloadRef.current?.();
    },
  }), [studyId, qs, onlyParts]);

  return {
    running, progress, extOpen,
    setExtOpen: (v) => { setExtOpen(v); if (!v) setOnlyParts(null); },
    // openExternal(['themes','insights']) shows only the prompt parts covering those sections.
    openExternal: (sections) => { setOnlyParts(Array.isArray(sections) && sections.length ? sections : null); setExtOpen(true); },
    runSystem, externalProps, importInfo, clearImportInfo: () => setImportInfo(null),
    resumeIfRunning,
  };
};

// ---------------------------------------------------------------------------
// Provenance — who produced the AI-written content that is on screen.
// ---------------------------------------------------------------------------
const sourceText = (meta) => {
  const src = meta?.source || 'system';
  const when = fmtDateTime(meta?.at || meta?.imported_at || meta?.updated_at);
  if (src === 'external') {
    return `นำเข้าจาก ${meta?.model_label || 'AI ภายนอก (ไม่ระบุชื่อ)'}${when ? ` เมื่อ ${when}` : ''}`;
  }
  if (src === 'manual') return `เข้ารหัสด้วยมือโดยผู้วิจัย${when ? ` เมื่อ ${when}` : ''}`;
  return `วิเคราะห์โดย AI ของระบบ${when ? ` เมื่อ ${when}` : ''}`;
};

/** `section` ∈ coding | themes | identity | insights; falls back to the cache-level source. */
export const Provenance = ({ ai, section, style, testid }) => {
  if (!ai || ai.status === 'idle' || !Object.keys(ai).length) return null;
  const meta = (section && ai.sections_meta?.[section])
    || { source: ai.source, model_label: ai.model_label, at: ai.imported_at || ai.updated_at };
  const ext = (meta.source || 'system') === 'external';
  return (
    <span className="be-prov be-mono" data-testid={testid || `be-prov-${section || 'ai'}`}
          data-source={meta.source || 'system'}
          style={style}
          title={ext ? 'ผลนี้มาจาก AI ภายนอกที่ผู้ใช้นำเข้า — ตรวจสอบก่อนอ้างอิง' : 'ผลนี้สร้างโดย AI ของระบบ — ตรวจสอบก่อนอ้างอิง'}>
      <span className="be-prov-dot" aria-hidden="true" style={{ background: ext ? 'var(--be-blue)' : 'var(--be-red)' }}/>
      {sourceText(meta)}
    </span>
  );
};

/** Provenance of the open-ended coding behind a question's counts. */
export const CodingBadge = ({ stats, ai }) => {
  if (!stats) return null;
  const srcs = stats.coding_source || [];
  const basis = stats.normalization_basis;
  const label = ai?.sections_meta?.coding?.model_label;
  let text;
  if (srcs.includes('external')) text = `เข้ารหัสด้วย AI ภายนอก${label ? ` (${label})` : ''}`;
  else if (srcs.includes('system') || basis === 'ai') text = 'เข้ารหัสโดย AI ของระบบ';
  else if (srcs.includes('manual') || basis === 'manual') text = 'เข้ารหัสด้วยมือ (สเปรดชีต)';
  else if (basis === 'deterministic') text = 'นับด้วยการจับคู่ชื่ออัตโนมัติ — ไม่ใช้ AI';
  else return null;
  const cov = typeof stats.coding_coverage === 'number' ? ` · ครอบคลุม ${Math.round(stats.coding_coverage * 100)}% ของคำตอบ` : '';
  return (
    <span className="be-prov be-mono" data-testid="be-coding-badge">
      <span className="be-prov-dot" aria-hidden="true" style={{ background: 'var(--be-gold)' }}/>
      {text}{cov}
    </span>
  );
};

/** Pre-v2 AI text was written against v1 numbers. */
export const StaleAiNote = ({ ai }) => {
  if (!ai || !Object.keys(ai).length || ai.status === 'idle') return null;
  const v = ai.schema_version;
  if (v != null && v >= 2) return null;
  const hasText = (ai.master_insights || []).length || ai.identity_image?.narrative;
  if (!hasText) return null;
  return (
    <div className="be-small" data-testid="be-ai-stale-note"
         style={{ background: 'rgba(212,160,23,0.10)', border: '1px solid rgba(212,160,23,0.4)',
                  padding: '8px 12px', lineHeight: 1.55, marginBottom: 12 }}>
      ⚠ ข้อความ AI ชุดนี้สร้างก่อนปรับวิธีคำนวณ (v2) — อาจอ้างตัวเลขเดิมที่เปลี่ยนไปแล้ว
      ควรวิเคราะห์ใหม่ก่อนนำไปใช้หรืออ้างอิง
    </div>
  );
};

// ---------------------------------------------------------------------------
// Result banner for partial / error jobs
// ---------------------------------------------------------------------------
export const AiResultBanner = ({ ai, onExternal, canExternal = true }) => {
  const st = ai?.status;
  if (st !== 'partial' && st !== 'error') return null;
  const errors = ai.errors || [];
  const missing = Array.from(new Set(errors.flatMap((e) => e.sections || [])));
  const policy = ai.error_code === 'llm_external_only';
  const hint = ai.error_detail?.hint;
  const partial = st === 'partial';
  return (
    <div role="alert" data-testid={`be-ai-banner-${st}`}
         style={{ border: `1px solid ${partial ? 'var(--be-gold)' : 'var(--be-red)'}`,
                  background: partial ? 'rgba(212,160,23,0.08)' : 'rgba(200,16,46,0.05)',
                  padding: 14, marginTop: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {partial ? 'AI ทำได้บางส่วน — ยังขาดขั้นตอนต่อไปนี้' : 'AI วิเคราะห์ไม่สำเร็จ'}
      </div>
      {policy && (
        <div className="be-small" style={{ lineHeight: 1.6, marginBottom: 6 }}>
          ผู้ดูแลระบบปิดการใช้ AI ของระบบระหว่างที่งานกำลังทำ{hint ? ` — ${hint}` : ''}
        </div>
      )}
      {missing.length > 0 && (
        <ul className="be-small" style={{ margin: '0 0 8px 18px', lineHeight: 1.7 }} data-testid="be-ai-missing-steps">
          {missing.map((s) => <li key={s}>{SECTION_LABEL[s] || s}</li>)}
        </ul>
      )}
      {errors.length > 0 && (
        <details className="be-small be-muted" style={{ marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer' }}>รายละเอียดข้อผิดพลาด ({errors.length})</summary>
          <ul style={{ margin: '6px 0 0 18px', lineHeight: 1.6 }}>
            {errors.map((e, i) => (
              <li key={i}>
                {e.part ? <b>{e.part}: </b> : null}{e.message}
                {(e.errors || []).length > 0 && <div className="be-tiny">{e.errors.join(' · ')}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {ai.error_code === 'stale_job' && (
        <div className="be-small" style={{ marginBottom: 8 }} data-testid="be-ai-stale-job">
          งานค้างจากการรีสตาร์ตเซิร์ฟเวอร์ — กด “วิเคราะห์ด้วย AI” เพื่อเริ่มใหม่ได้
        </div>
      )}
      {!errors.length && ai.error && ai.error_code !== 'stale_job' && <div className="be-small be-muted" style={{ marginBottom: 8 }}>{String(ai.error)}</div>}
      <div className="be-small" style={{ lineHeight: 1.6 }}>
        ส่วนที่ทำเสร็จแล้วถูกบันทึกไว้ — คะแนน BES ไม่ได้ขึ้นกับขั้นตอนเหล่านี้
        {canExternal && ' · ทำส่วนที่เหลือต่อได้ด้วย AI ของคุณเอง (หน้าต่างที่เปิดขึ้นจะแสดงเฉพาะชุดงานที่ครอบคลุมหัวข้อข้างต้น)'}
      </div>
      {canExternal && (
        <button type="button" className="be-btn" style={{ marginTop: 10 }} onClick={() => onExternal(missing)}
                data-testid="be-ai-finish-external">
          ทำส่วนที่เหลือด้วย AI ของฉัน →
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
export const BeAiAnalysisPanel = ({ ai, aiCache, filter, nFiltered, ready, readOnlyReason }) => {
  const { hint, systemAllowed } = useLlmPolicy();
  const hasResult = !!(aiCache && aiCache.status && aiCache.status !== 'idle'
    && (aiCache.master_insights?.length || aiCache.identity_image || Object.keys(aiCache.themes_by_question || {}).length));
  const sysOk = systemAllowed('be.ai_analyze');
  const sliceNote = isFilterActive(filter)
    ? 'เฉพาะชุดข้อมูลที่กรองอยู่ตอนนี้' : 'ผู้ตอบทั้งหมด';

  return (
    <div className="be-card be-ai-panel" id="be-ai-panel" data-testid="be-ai-panel"
         style={{ padding: 20, marginTop: 18 }}>
      <div className="be-eyebrow" style={{ marginBottom: 6 }}>
        <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>
        AI ANALYSIS · วิเคราะห์คำตอบปลายเปิด
      </div>
      <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 12, maxWidth: 760 }}>
        AI ช่วยจัดกลุ่มคำตอบปลายเปิด สกัดประเด็น เทียบอัตลักษณ์กับภาพลักษณ์ และร่างข้อเสนอแนะ —
        <b> คะแนน BES ไม่ขึ้นกับ AI</b> (ระบบนับชื่อแบรนด์เองได้) การเข้ารหัสด้วย AI หรือด้วยมือช่วยให้นับชื่อที่สะกดต่างกันได้แม่นขึ้น
        {' '}ผลที่ AI เขียนเป็น<b>ความเห็นเชิงคุณภาพ</b> ควรตรวจก่อนอ้างอิง
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {readOnlyReason ? (
          <span className="be-small be-muted" data-testid="be-ai-readonly">{readOnlyReason}</span>
        ) : (
          <AiActionButton
            feature="be.ai_analyze"
            label={hasResult ? 'วิเคราะห์ใหม่ด้วย AI' : 'วิเคราะห์ด้วย AI'}
            icon={Sparkles}
            onSystem={ai.runSystem}
            external={ai.externalProps}
            disabled={!ready || ai.running}
            className="be-ai-main-btn"
            data-testid="be-dashboard-run-ai"
          />
        )}
        <span className="be-tiny be-muted" style={{ lineHeight: 1.5 }}>
          ขอบเขต: {sliceNote} · n = {nFiltered ?? '—'}
        </span>
      </div>
      {!readOnlyReason && !sysOk && (
        <div className="be-tiny be-muted" style={{ marginTop: 8, lineHeight: 1.6 }} data-testid="be-ai-external-hint">
          ตอนนี้ผู้ดูแลระบบปิดการใช้ AI ของระบบ — กดปุ่มเพื่อคัดลอกพรอมต์ไปวางใน ChatGPT / Claude / Gemini ของคุณ
          แล้ววางคำตอบกลับมา (ไม่เสียโควตาของระบบ){hint ? ` · ${hint}` : ''}
        </div>
      )}
      {!ready && !readOnlyReason && (
        <div className="be-tiny be-muted" style={{ marginTop: 8 }}>ต้องมีผู้ตอบอย่างน้อย 10 คนในชุดข้อมูลนี้ก่อน</div>
      )}

      {ai.progress && (
        <AIProgressCard
          step={ai.progress.step} total={ai.progress.total} phase={ai.progress.phase}
          elapsed={ai.progress.elapsed_sec} pct={ai.progress.pct} done={!ai.running}
        />
      )}

      <AiResultBanner ai={aiCache} onExternal={ai.openExternal} canExternal={!readOnlyReason}/>

      {ai.importInfo && (
        <div className="be-small" data-testid="be-ai-import-info"
             style={{ border: '1px solid var(--be-green)', background: 'rgba(16,185,129,0.07)', padding: 12, marginTop: 14, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <b>นำเข้าผลจาก {ai.importInfo.model || 'AI ภายนอก'} แล้ว
              {ai.importInfo.sections?.length ? ` (${ai.importInfo.sections.map((s) => SECTION_LABEL[s] || s).join(', ')})` : ''}</b>
            <button type="button" className="be-btn be-btn-ghost be-tiny" onClick={ai.clearImportInfo} aria-label="ปิดข้อความนี้">ปิด</button>
          </div>
          {(ai.importInfo.warnings || []).length > 0 && (
            <ul style={{ margin: '6px 0 0 18px' }} data-testid="be-ai-import-warnings">
              {ai.importInfo.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {hasResult && (
        <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap' }} data-testid="be-ai-provenance-row">
          {['coding', 'themes', 'identity', 'insights'].filter((s) => aiCache.sections_meta?.[s] || (s === 'insights' && aiCache.master_insights?.length)).map((s) => (
            <span key={s} className="be-tiny" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <b>{SECTION_LABEL[s]}:</b> <Provenance ai={aiCache} section={s}/>
            </span>
          ))}
        </div>
      )}
      <StaleAiNote ai={aiCache}/>
    </div>
  );
};

export const aiStatusLabel = (status) => ({
  idle: 'ยังไม่ได้วิเคราะห์', queued: 'อยู่ในคิว', running: 'กำลังวิเคราะห์',
  ready: 'เสร็จสมบูรณ์', partial: 'ทำได้บางส่วน', error: 'ไม่สำเร็จ', no_data: 'ไม่มีข้อมูล',
}[status || 'idle'] || status);

/** Dialog instance driven by the hook (opened from banners / the coding panel). */
export const BeExternalAiDialog = ({ ai }) => (
  <ExternalAiDialog open={ai.extOpen} onOpenChange={ai.setExtOpen} {...ai.externalProps}/>
);

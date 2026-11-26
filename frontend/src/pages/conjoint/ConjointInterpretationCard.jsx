/**
 * AI interpretation card for the Conjoint Results page.
 *
 * - System path (admin switch ON): POST ai-interpretation, poll the job, handle
 *   `error_code: "llm_external_only"` from the status endpoint like a 409.
 * - External path (always): prompt + paste-back through <ExternalAiDialog> using the
 *   SAME method / compare_all as the current view, so the pasted answer shows in place.
 * - Provenance is always shown: "เขียนโดย AI ของระบบ" vs "นำเข้าจาก <model> เมื่อ ...".
 * - A saved interpretation (system or imported) is loaded on open with the read-only
 *   GET ai-interpretation (never bills, never 409).
 *
 * The interpretation cache on the server is NOT keyed by the Results-page filters;
 * it always describes all respondents — the card says so when a filter is active.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Sparkles, AlertTriangle, Cpu, UserRound, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AiActionButton from '@/components/AiActionButton';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';
import { showLlmExternalOnlyToast } from '@/lib/llmErrors';
import { API } from '@/App';
import { fmtDateTime, methodName } from './cjFormat';
import { apiErrorTextAsync } from '@/lib/apiError';

const FEATURE = 'conjoint.interpretation';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const policyError = () => {
  const e = new Error('llm_external_only');
  e.response = { status: 409, data: { detail: { code: 'llm_external_only' } } };
  return e;
};

export const Provenance = ({ data }) => {
  if (!data) return null;
  const external = data.source === 'external';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        external ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-indigo-300 bg-indigo-50 text-indigo-800'
      }`}
      data-testid="interpretation-provenance"
      data-source={external ? 'external' : 'system'}
    >
      {external ? <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> : <Cpu className="h-3.5 w-3.5" aria-hidden="true" />}
      {external
        ? `นำเข้าจาก ${data.model_label || 'AI ภายนอก'}${data.imported_at ? ` เมื่อ ${fmtDateTime(data.imported_at)}` : ''}`
        : `เขียนโดย AI ของระบบ${data.generated_at ? ` เมื่อ ${fmtDateTime(data.generated_at)}` : ''}`}
    </span>
  );
};

const ConjointInterpretationCard = ({
  studyId, token, method, compareAll, onCompareAllChange, respondentCount,
  filterActive, isOwnerOrAdmin, interpretation, onInterpretation, onOpenThesis,
}) => {
  const { systemAllowed } = useLlmPolicy();
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const body = { method, compare_all: !!compareAll };
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const importUrl = isOwnerOrAdmin ? `${API}/conjoint/studies/${studyId}/ai-interpretation/external-import` : undefined;

  const allowed = systemAllowed(FEATURE);

  // Load a saved interpretation (system or imported) for this method / mode on open.
  // GET is the read-only twin of the POST: cached -> the same body, else {cached:false};
  // it never bills, never 409s and never starts a job, so it is safe whatever the policy says.
  const loadSaved = useCallback(async (silent) => {
    try {
      const r = await axios.get(`${API}/conjoint/studies/${studyId}/ai-interpretation`, {
        headers, params: { method, compare_all: !!compareAll },
      });
      if (!mounted.current) return false;
      if (r.data?.status === 'ready' && r.data.interpretation) { onInterpretation(r.data); return true; }
    } catch { /* no saved interpretation / not allowed to view */ }
    if (!silent) toast.info('ยังไม่มีคำตีความที่บันทึกไว้สำหรับมุมมองนี้ — กดปุ่มด้านบนเพื่อสร้าง');
    return false;
  }, [studyId, method, compareAll, token, onInterpretation]); // eslint-disable-line

  useEffect(() => {
    if (!studyId || (respondentCount || 0) < 10) return;
    loadSaved(true);
  }, [studyId, method, compareAll, respondentCount]); // eslint-disable-line

  // A result from another method / mode must not stay on screen under the wrong heading.
  useEffect(() => {
    if (!interpretation) return;
    const sd = interpretation.summary_data;
    const resMode = sd?.mode === 'compare_all';
    if (resMode !== !!compareAll || (!resMode && sd?.method && sd.method !== method)) onInterpretation(null);
  }, [method, compareAll]);

  const runSystem = useCallback(async () => {
    setError('');
    let r;
    try {
      r = await axios.post(`${API}/conjoint/studies/${studyId}/ai-interpretation`, body, { headers });
    } catch (e) {
      if (e?.response?.status === 409) throw e; // llm_external_only -> AiActionButton opens the dialog
      const msg = await apiErrorTextAsync(e, 'AI วิเคราะห์ไม่สำเร็จ');
      setError(msg);
      toast.error(msg);
      return;
    }
    if (r.data.status === 'ready') {
      onInterpretation(r.data);
      toast.success(r.data.cached ? 'แสดงผลที่บันทึกไว้แล้ว' : 'AI วิเคราะห์สำเร็จ');
      return;
    }
    toast.info('AI กำลังวิเคราะห์... ใช้เวลาไม่เกิน 2 นาที');
    for (let i = 0; i < 40; i += 1) {
      await sleep(3000);
      if (!mounted.current) return;
      let p;
      try {
        p = await axios.get(`${API}/conjoint/studies/${studyId}/ai-interpretation-status/${r.data.job_id}`, { headers });
      } catch { continue; }
      if (p.data.status === 'ready') { onInterpretation(p.data); toast.success('AI วิเคราะห์สำเร็จ'); return; }
      if (p.data.status === 'failed') {
        if (p.data.error_code === 'llm_external_only') { showLlmExternalOnlyToast(); throw policyError(); }
        const msg = p.data.error_code === 'stale_job' ? 'งานค้างจากการรีสตาร์ตเซิร์ฟเวอร์ — กด "ลองใหม่" เพื่อเริ่มใหม่ได้'
          : (p.data.error || 'AI วิเคราะห์ไม่สำเร็จ — ลองใช้ AI ของคุณเองแทน');
        setError(msg);
        toast.error(msg);
        return;
      }
    }
    setError('AI ใช้เวลานานเกินไป — ลองใหม่ หรือใช้ AI ของคุณเอง');
  }, [studyId, method, compareAll, token, onInterpretation]);

  const tooFew = (respondentCount || 0) < 10;
  const external = {
    title: 'ตีความผลด้วย AI ของฉันเอง',
    promptRequest: { method: 'POST', url: `${API}/conjoint/studies/${studyId}/ai-interpretation/external-prompt`, data: body },
    importUrl,
    importExtra: body,
    onImported: (data) => { onInterpretation(data); },
  };

  return (
    <Card className="mb-6 border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 sm:mb-8 sm:p-6" data-testid="conjoint-ai-card">
      <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500">
            <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">ตีความผลและข้อเสนอแนะด้วย AI</h2>
            <p className="text-xs text-gray-600">ไม่บังคับ — ตัวเลขทั้งหมดในหน้านี้คำนวณโดยไม่ใช้ AI</p>
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-lg border-2 border-indigo-200 bg-white px-3 py-2 text-xs sm:text-sm">
          <span className="font-semibold text-gray-700">ขอบเขต:</span>
          <select
            value={compareAll ? 'compare_all' : 'single'}
            onChange={(e) => onCompareAllChange(e.target.value === 'compare_all')}
            className="rounded border-2 border-indigo-300 px-2 py-1 font-medium text-gray-800"
            data-testid="ai-mode-select"
          >
            <option value="single">วิธีเดียว ({methodName(method)})</option>
            <option value="compare_all">เปรียบเทียบทุกวิธี</option>
          </select>
        </label>
      </div>

      {filterActive && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="ai-filter-note">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>คำตีความนี้เขียนจากผู้ตอบ <b>ทั้งหมด</b> ไม่ใช่เฉพาะกลุ่มที่คุณกรองอยู่ — ตัวเลขในตารางด้านบนอาจไม่ตรงกับตัวเลขในคำตีความ</span>
        </div>
      )}

      {!interpretation ? (
        <div className="py-4 text-center sm:py-6">
          <p className="mb-4 text-sm text-gray-600 sm:text-base">
            ให้ AI อ่านผลและเขียนสรุปพร้อมข้อเสนอแนะ —
            {allowed ? ' ใช้ AI ของระบบ หรือคัดลอกพรอมต์ไปให้ ChatGPT / Claude / Gemini ของคุณเองก็ได้'
              : ' คัดลอกพรอมต์ที่ระบบเตรียมให้ไปวางใน ChatGPT / Claude / Gemini แล้ววางคำตอบกลับมาที่นี่'}
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AiActionButton
              feature={FEATURE}
              label={compareAll ? 'ตีความและเปรียบเทียบทุกวิธี' : 'ตีความผลด้วย AI'}
              icon={Sparkles}
              onSystem={runSystem}
              external={external}
              disabled={tooFew}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700"
              data-testid="ai-interpret-btn"
            />
            {isOwnerOrAdmin && (
              <Button variant="outline" onClick={onOpenThesis} className="border-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50" data-testid="export-thesis-btn">
                <GraduationCap className="mr-2 h-4 w-4" aria-hidden="true" /> Export วิทยานิพนธ์ (Word)
              </Button>
            )}
          </div>
          {tooFew && <p className="mt-3 text-xs text-gray-500">ต้องมีผู้ตอบอย่างน้อย 10 คนจึงจะตีความได้</p>}
          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert" data-testid="ai-error">
              {error} <button type="button" className="underline" onClick={runSystem}>ลองใหม่</button>
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-indigo-200 bg-white p-4 sm:p-6" data-testid="ai-interpretation-result">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-indigo-700">
                {interpretation.summary_data?.mode === 'compare_all'
                  ? `ผลจากทุกวิธี (${Object.keys(interpretation.summary_data?.methods || {}).length} วิธี)`
                  : `ผลจาก ${methodName(interpretation.summary_data?.method || method)}`}
              </span>
              <Provenance data={interpretation} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AiActionButton
                feature={FEATURE}
                label={allowed ? 'ตีความใหม่' : 'ตีความใหม่ด้วย AI ของฉัน'}
                variant="outline"
                size="sm"
                onSystem={runSystem}
                external={external}
                data-testid="ai-reinterpret-btn"
              />
              {isOwnerOrAdmin && (
                <Button size="sm" variant="outline" onClick={onOpenThesis} className="border-emerald-300 text-emerald-800" data-testid="export-thesis-after-ai-btn">
                  <GraduationCap className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Export วิทยานิพนธ์
                </Button>
              )}
            </div>
          </div>
          {(filterActive || interpretation.filter_mismatch) && interpretation.sample_note_th && (
            <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="ai-sample-note">
              {interpretation.sample_note_th}
              {interpretation.sample_respondent_count ? ` (n = ${interpretation.sample_respondent_count})` : ''}
            </p>
          )}
          <div className="whitespace-pre-wrap break-words leading-relaxed text-gray-800" data-testid="ai-interpretation-text">{interpretation.interpretation}</div>
          <p className="mt-4 border-t pt-3 text-xs text-gray-500">
            ข้อความนี้เขียนโดย AI จากสถิติในหน้านี้ — ตรวจสอบกับตัวเลขก่อนนำไปอ้างอิง และระบุการใช้ AI ในงานวิชาการตามข้อกำหนดของสถาบัน
          </p>
        </div>
      )}
    </Card>
  );
};

export default ConjointInterpretationCard;

/**
 * ExternalAiDialog — "use my own AI" workflow (plan §B/§C).
 *
 * The user copies a ready-made prompt into their own ChatGPT / Claude / Gemini
 * and (optionally) pastes the answer back. Always available, whatever the
 * admin's system-LLM switch says.
 *
 * Props
 *   open, onOpenChange(bool)   controlled open state (required)
 *   title                      dialog title (Thai); falls back to the response's `title`
 *   promptRequest              { method?: 'GET'|'POST', url, data? } — endpoint returning
 *                              { title, instructions_th, expected_format: 'markdown'|'json',
 *                                parts: [{key,title,system_prompt?,prompt,json_example?}], filename }
 *   importUrl                  POST endpoint receiving { part_key, content, model_label }.
 *                              OMIT for prompt-only cases (image prompts, thesis packs):
 *                              step 2 is then hidden and the dialog only offers copy/download.
 *   onImported(data, {partKey}) called after each part is imported successfully with the
 *                              response body; the dialog closes once every part is done.
 *   className                  extra classes for the dialog content
 *
 * Behaviour
 *   - Step 1: numbered instructions, links to ChatGPT/Claude/Gemini (new tab), each
 *     prompt part in a scrollable monospace box with char count, "คัดลอก" (clipboard
 *     fallback for insecure contexts) and a ".md" download of all parts in one file.
 *   - Step 2: textarea per part (status per part), optional "ใช้ AI ตัวไหน" label
 *     (remembered in localStorage), import button. 400/422 errors from the server are
 *     shown inline under the relevant part. expected_format 'json' shows the example and
 *     does a light client-side "contains a JSON object" check before sending.
 *   - Closing while pasted text is not yet imported asks for confirmation.
 *
 * Example
 *   <ExternalAiDialog
 *     open={open} onOpenChange={setOpen}
 *     title="วิเคราะห์ผลด้วย AI ของฉันเอง"
 *     promptRequest={{ method: 'GET', url: `${API}/conjoint/studies/${id}/interpretation/external-prompt` }}
 *     importUrl={`${API}/conjoint/studies/${id}/interpretation/external-import`}
 *     onImported={(data) => setInterpretation(data)}
 *   />
 *
 * Prefer <AiActionButton> which wires this dialog to the policy automatically.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Copy, Download, ExternalLink, Loader2, RefreshCw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard } from '@/lib/clipboard';

const LABEL_KEY = 'swumkt.externalAi.modelLabel';

const AI_LINKS = [
  { name: 'ChatGPT', href: 'https://chatgpt.com/' },
  { name: 'Claude', href: 'https://claude.ai/new' },
  { name: 'Gemini', href: 'https://gemini.google.com/app' },
];

const readLabel = () => { try { return localStorage.getItem(LABEL_KEY) || ''; } catch { return ''; } };
const writeLabel = (v) => { try { localStorage.setItem(LABEL_KEY, v); } catch { /* ignore */ } };

/** Text a user pastes into a chat LLM for one part. */
export const partPromptText = (p) => {
  const sys = (p.system_prompt || '').trim();
  return sys ? `${sys}\n\n---\n\n${p.prompt || ''}` : (p.prompt || '');
};

const buildMarkdown = (data) => {
  const parts = data.parts || [];
  if (parts.length === 1) return partPromptText(parts[0]);
  return parts.map((p, i) => `## ${i + 1}. ${p.title || p.key}\n\n${partPromptText(p)}`).join('\n\n---\n\n');
};

const downloadText = (text, filename) => {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'prompt.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const errorText = (err, fallback) => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && !Array.isArray(d) && d.message) return d.message;
  if (Array.isArray(d) && d[0]?.msg) return d.map((x) => x.msg).join('; ');
  return err?.message || fallback;
};

const looksLikeJson = (s) => {
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  return a !== -1 && b > a;
};

const ExternalAiDialog = ({
  open, onOpenChange, promptRequest, importUrl, onImported, title, className = '',
}) => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(1);
  const [contents, setContents] = useState({});
  const [status, setStatus] = useState({}); // key -> idle|busy|done
  const [errors, setErrors] = useState({});
  const [modelLabel, setModelLabel] = useState(readLabel);
  const [confirmClose, setConfirmClose] = useState(false);
  const reqRef = useRef(0);
  const reqKey = promptRequest ? `${promptRequest.method || 'GET'} ${promptRequest.url}` : '';
  const hasImport = !!importUrl;

  const load = useCallback(async () => {
    if (!promptRequest?.url) return;
    const id = ++reqRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const r = await axios({
        method: promptRequest.method || 'GET',
        url: promptRequest.url,
        data: promptRequest.data,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 60000,
      });
      if (id !== reqRef.current) return;
      setData(r.data);
    } catch (e) {
      if (id !== reqRef.current) return;
      setLoadError(errorText(e, 'ไม่สามารถสร้างพรอมต์ได้'));
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [reqKey, token]);

  // (Re)load whenever the dialog opens; reset state for a fresh session.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setContents({});
    setStatus({});
    setErrors({});
    setConfirmClose(false);
    setData(null);
    load();
  }, [open, load]);

  const parts = useMemo(() => (data?.parts || []), [data]);
  const isJson = data?.expected_format === 'json';
  const multi = parts.length > 1;
  const allDone = parts.length > 0 && parts.every((p) => status[p.key] === 'done');
  const dirty = parts.some((p) => status[p.key] !== 'done' && (contents[p.key] || '').trim());
  const busy = parts.some((p) => status[p.key] === 'busy');

  const requestClose = (next) => {
    if (next) { onOpenChange(true); return; }
    if (busy) return;
    if (dirty) { setConfirmClose(true); return; }
    onOpenChange(false);
  };

  const importPart = async (p) => {
    const content = (contents[p.key] || '').trim();
    if (!content) {
      setErrors((e) => ({ ...e, [p.key]: 'ยังไม่ได้วางผลลัพธ์จาก AI' }));
      return false;
    }
    if (isJson && !looksLikeJson(content)) {
      setErrors((e) => ({ ...e, [p.key]: 'ข้อความที่วางไม่มี JSON object (ต้องมีเครื่องหมาย { ... }) — ให้ AI ตอบเป็น JSON ตามตัวอย่าง แล้ววางทั้งคำตอบ' }));
      return false;
    }
    setErrors((e) => ({ ...e, [p.key]: '' }));
    setStatus((s) => ({ ...s, [p.key]: 'busy' }));
    if (modelLabel.trim()) writeLabel(modelLabel.trim());
    try {
      const r = await axios.post(importUrl, {
        part_key: p.key,
        content,
        model_label: modelLabel.trim() || undefined,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 120000,
      });
      setStatus((s) => ({ ...s, [p.key]: 'done' }));
      if (onImported) await onImported(r.data, { partKey: p.key });
      return true;
    } catch (e) {
      setStatus((s) => ({ ...s, [p.key]: 'idle' }));
      const msg = errorText(e, 'นำเข้าไม่สำเร็จ');
      setErrors((er) => ({ ...er, [p.key]: msg }));
      toast.error(multi ? `นำเข้า "${p.title || p.key}" ไม่สำเร็จ` : 'นำเข้าไม่สำเร็จ', { description: msg });
      return false;
    }
  };

  // Close automatically once every part has been imported.
  const closedRef = useRef(false);
  useEffect(() => {
    if (!open) { closedRef.current = false; return; }
    if (allDone && hasImport && !closedRef.current) {
      closedRef.current = true;
      toast.success('นำเข้าผลลัพธ์จาก AI แล้ว');
      onOpenChange(false);
    }
  }, [allDone, hasImport, open, onOpenChange]);

  const importAll = async () => {
    for (const p of parts) {
      if (status[p.key] === 'done') continue;
      if (!(contents[p.key] || '').trim()) continue;
      await importPart(p);
    }
  };

  const filledCount = parts.filter((p) => status[p.key] !== 'done' && (contents[p.key] || '').trim()).length;
  const heading = title || data?.title || 'ใช้ AI ของฉันเอง';

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          data-testid="external-ai-dialog"
          className={`w-[calc(100vw-1rem)] max-w-3xl max-h-[92dvh] p-0 gap-0 flex flex-col overflow-hidden sm:rounded-lg ${className}`}
        >
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 pr-12 border-b border-black/10 text-left">
            <DialogTitle className="text-base sm:text-lg leading-snug" data-testid="external-ai-title">{heading}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              ใช้ AI ของคุณเอง (ChatGPT / Claude / Gemini) — ไม่ใช้โควตา AI ของระบบ
            </DialogDescription>
            {hasImport && (
              <ol className="flex items-center gap-2 pt-2 text-xs" aria-label="ขั้นตอน">
                {[1, 2].map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => setStep(n)}
                      disabled={!data}
                      aria-current={step === n ? 'step' : undefined}
                      data-testid={`external-ai-step-${n}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition-colors disabled:opacity-50 ${
                        step === n ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]' : 'bg-white text-[#4A4A4A] border-black/20 hover:bg-black/5'
                      }`}
                    >
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${step === n ? 'bg-white text-[#0A0A0A]' : 'bg-black/10'}`}>{n}</span>
                      {n === 1 ? 'คัดลอกพรอมต์' : 'วางผลลัพธ์กลับมา'}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" data-testid="external-ai-body">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#4A4A4A]" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> กำลังสร้างพรอมต์จากข้อมูลของคุณ…
              </div>
            )}

            {!loading && loadError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert" data-testid="external-ai-load-error">
                <div className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{loadError}</span></div>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={load}>
                  <RefreshCw className="h-3.5 w-3.5" /> ลองอีกครั้ง
                </Button>
              </div>
            )}

            {!loading && data && step === 1 && (
              <>
                {data.instructions_th && (
                  <section aria-label="วิธีใช้" className="rounded-md bg-[#F4F0EA] border border-black/10 p-3 sm:p-4" data-testid="external-ai-instructions">
                    <h3 className="text-sm font-bold mb-1.5">วิธีใช้</h3>
                    <div className="text-sm leading-relaxed text-[#2a2a2a] whitespace-pre-line">{data.instructions_th}</div>
                  </section>
                )}

                <div className="flex flex-wrap items-center gap-2" data-testid="external-ai-links">
                  <span className="text-xs text-[#4A4A4A]">เปิด AI ที่คุณใช้:</span>
                  {AI_LINKS.map((l) => (
                    <a
                      key={l.name} href={l.href} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-black/20 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {l.name} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">(เปิดในแท็บใหม่)</span>
                    </a>
                  ))}
                </div>

                {parts.map((p, i) => {
                  const text = partPromptText(p);
                  return (
                    <section key={p.key} aria-label={p.title || p.key} data-testid={`external-ai-part-${p.key}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <h3 className="text-sm font-bold">{multi ? `${i + 1}. ` : ''}{p.title || 'พรอมต์'}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-[#4A4A4A]" data-testid={`external-ai-count-${p.key}`}>
                            {text.length.toLocaleString()} ตัวอักษร
                          </span>
                          <Button type="button" size="sm" variant="outline" onClick={() => copyToClipboard(text, { successMessage: 'คัดลอกพรอมต์แล้ว — ไปวางใน AI ของคุณได้เลย' })} data-testid={`external-ai-copy-${p.key}`}>
                            <Copy className="h-3.5 w-3.5" /> คัดลอก
                          </Button>
                        </div>
                      </div>
                      <pre
                        tabIndex={0}
                        className="max-h-56 sm:max-h-72 overflow-auto rounded-md border border-black/20 bg-white p-3 text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`พรอมต์ ${p.title || p.key}`}
                      >{text}</pre>
                    </section>
                  );
                })}
              </>
            )}

            {!loading && data && step === 2 && hasImport && (
              <>
                <div>
                  <Label htmlFor="ext-ai-model" className="text-sm font-semibold">ใช้ AI ตัวไหน <span className="font-normal text-[#4A4A4A]">(ไม่บังคับ — บันทึกไว้อ้างอิงในงานวิจัย)</span></Label>
                  <Input
                    id="ext-ai-model" value={modelLabel} onChange={(e) => setModelLabel(e.target.value)}
                    placeholder="เช่น ChatGPT GPT-5, Claude Sonnet, Gemini 2.5 Pro" className="mt-1" maxLength={120}
                    data-testid="external-ai-model-label"
                  />
                </div>

                {isJson && (
                  <p className="text-xs text-[#4A4A4A]">
                    ให้ AI ตอบเป็น <b>JSON</b> ตามตัวอย่างในขั้นตอนที่ 1 แล้ววางทั้งคำตอบ (มี code fence หรือคำอธิบายนำหน้าได้ ระบบจะตัดให้)
                  </p>
                )}

                {parts.map((p, i) => {
                  const st = status[p.key] || 'idle';
                  const err = errors[p.key];
                  return (
                    <section key={p.key} aria-label={p.title || p.key} data-testid={`external-ai-import-${p.key}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Label htmlFor={`ext-ai-paste-${p.key}`} className="text-sm font-bold">
                          {multi ? `${i + 1}. ${p.title || p.key}` : 'ผลลัพธ์จาก AI'}
                        </Label>
                        <span className="text-xs font-semibold" aria-live="polite" data-testid={`external-ai-status-${p.key}`}>
                          {st === 'done' && <span className="inline-flex items-center gap-1 text-[#0E5538]"><CheckCircle2 className="h-3.5 w-3.5" /> นำเข้าแล้ว</span>}
                          {st === 'busy' && <span className="inline-flex items-center gap-1 text-[#4A4A4A]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังนำเข้า</span>}
                          {st === 'idle' && err && <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> มีข้อผิดพลาด</span>}
                          {st === 'idle' && !err && (contents[p.key] || '').trim() && <span className="text-[#4A4A4A]">ยังไม่ได้นำเข้า</span>}
                        </span>
                      </div>
                      {isJson && p.json_example && (
                        <details className="mb-2 text-xs">
                          <summary className="cursor-pointer font-semibold text-[#4A4A4A]">ดูตัวอย่าง JSON ที่ต้องการ</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-black/15 bg-[#F4F0EA] p-2 font-mono text-[11px] whitespace-pre-wrap break-words">{p.json_example}</pre>
                        </details>
                      )}
                      <Textarea
                        id={`ext-ai-paste-${p.key}`}
                        value={contents[p.key] || ''}
                        onChange={(e) => {
                          setContents((c) => ({ ...c, [p.key]: e.target.value }));
                          if (errors[p.key]) setErrors((x) => ({ ...x, [p.key]: '' }));
                        }}
                        disabled={st === 'done' || st === 'busy'}
                        placeholder="วางคำตอบทั้งหมดจาก AI ที่นี่…"
                        className="min-h-[200px] sm:min-h-[240px] font-mono text-[13px]"
                        aria-invalid={err ? 'true' : undefined}
                        aria-describedby={err ? `ext-ai-err-${p.key}` : undefined}
                        data-testid={`external-ai-paste-${p.key}`}
                      />
                      <div className="flex items-center justify-between mt-1 text-[11px] text-[#4A4A4A]">
                        <span className="font-mono">{(contents[p.key] || '').length.toLocaleString()} ตัวอักษร</span>
                      </div>
                      {err && (
                        <p id={`ext-ai-err-${p.key}`} role="alert" className="mt-1 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800" data-testid={`external-ai-error-${p.key}`}>
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span className="whitespace-pre-line">{err}</span>
                        </p>
                      )}
                      {multi && st !== 'done' && (
                        <Button type="button" size="sm" variant="outline" className="mt-2" disabled={st === 'busy' || !(contents[p.key] || '').trim()} onClick={() => importPart(p)} data-testid={`external-ai-import-btn-${p.key}`}>
                          {st === 'busy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} นำเข้าส่วนนี้
                        </Button>
                      )}
                    </section>
                  );
                })}
              </>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-black/10 bg-white px-4 sm:px-6 py-3">
            {step === 1 || !hasImport ? (
              <>
                <Button
                  type="button" variant="outline" disabled={!data}
                  onClick={() => downloadText(buildMarkdown(data), data.filename)}
                  data-testid="external-ai-download"
                >
                  <Download className="h-4 w-4" /> ดาวน์โหลด .md
                </Button>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button type="button" variant="ghost" onClick={() => requestClose(false)}>ปิด</Button>
                  {hasImport && (
                    <Button type="button" disabled={!data} onClick={() => setStep(2)} data-testid="external-ai-next">
                      ถัดไป: วางผลลัพธ์ <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" /> กลับไปดูพรอมต์
                </Button>
                <Button
                  type="button"
                  disabled={busy || allDone || (multi ? filledCount === 0 : !(contents[parts[0]?.key] || '').trim())}
                  onClick={() => (multi ? importAll() : importPart(parts[0]))}
                  data-testid="external-ai-import"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {busy ? 'กำลังนำเข้า…' : multi ? `นำเข้าทั้งหมดที่วางแล้ว (${filledCount})` : 'นำเข้าผลลัพธ์'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent data-testid="external-ai-confirm-close">
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดโดยไม่นำเข้า?</AlertDialogTitle>
            <AlertDialogDescription>
              คุณวางผลลัพธ์จาก AI ไว้แล้วแต่ยังไม่ได้นำเข้า หากปิดตอนนี้ข้อความที่วางจะหายไป
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>กลับไปแก้ไข</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmClose(false); onOpenChange(false); }}>ปิดและทิ้งข้อความ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ExternalAiDialog;

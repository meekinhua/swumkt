/**
 * Thesis export modal — three honest options:
 *   (a) เอกสารผลวิเคราะห์ ไม่ใช้ AI           POST export-thesis/no-ai          -> .docx (บท 3-4)
 *   (b) ชุด prompt + ตารางผล ไปเขียนกับ AI ของตัวเอง
 *                                             POST export-thesis/external-pack -> .md
 *       optional paste-back of chapters       POST export-thesis/external-import (accumulates per cache_key)
 *                                             GET  export-thesis-download?cache_key=
 *   (c) ให้ AI ของระบบเขียน                  POST export-thesis (+status, download) — only when allowed
 *
 * Access rule (server): admin OR (study owner AND user.can_export_thesis). The client
 * only hints; any 403 message from the server is shown as is.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  GraduationCap, FileText, PackageOpen, Cpu, Download, Loader2, Lock, CheckCircle2, ClipboardPaste,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import ExternalAiDialog from '@/components/ExternalAiDialog';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';
import { showLlmExternalOnlyToast } from '@/lib/llmErrors';
import { API } from '@/App';
import { saveBlob } from './cjFormat';
import { apiErrorTextAsync } from '@/lib/apiError';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const METHODS = [
  { id: 'mnl', name: 'วิธีมาตรฐาน (MNL)', desc: 'ค่าประมาณ ช่วงเชื่อมั่น 95% p-value Pseudo R²' },
  { id: 'counting', name: 'นับความถี่ (Counting)', desc: 'นับความถี่ part-worth' },
  { id: 'linear_regression', name: 'เส้นฐาน OLS', desc: 'R², F-test, t-test' },
  { id: 'mixed_logit', name: 'Mixed Logit', desc: 'ความชอบแตกต่างกันระหว่างผู้ตอบ' },
  { id: 'hierarchical_bayes', name: 'Hierarchical Bayes (Empirical Bayes)', desc: 'ค่ารายบุคคล' },
];
const CHAPTERS = [
  { ch: 3, title: 'บทที่ 3 ระเบียบวิธีวิจัย', desc: 'การออกแบบการทดลอง สมการ เกณฑ์ขนาดตัวอย่าง' },
  { ch: 4, title: 'บทที่ 4 ผลการศึกษา', desc: 'ตารางข้อมูลผู้ตอบ สัมประสิทธิ์ ความสำคัญ ความเหมาะสมของแบบจำลอง' },
  { ch: 5, title: 'บทที่ 5 สรุป อภิปราย ข้อเสนอแนะ', desc: 'ต้องเขียนด้วย AI (หรือเขียนเอง) — ไม่มีในเอกสารแบบไม่ใช้ AI' },
];

const OptionCard = ({ id, active, onSelect, icon: Icon, title, gives, badge, disabled, children }) => (
  <div
    className={`rounded-xl border-2 p-3 transition-colors ${active ? 'border-emerald-500 bg-emerald-50/60' : 'border-gray-200 bg-white'} ${disabled ? 'opacity-70' : ''}`}
    data-testid={`thesis-option-${id}`}
    data-active={active}
  >
    <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 text-left" aria-pressed={active} data-testid={`thesis-option-${id}-select`}>
      <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{title}</span>
          {badge && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{badge}</span>}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-gray-600">{gives}</span>
      </span>
    </button>
    {active && children && <div className="mt-3 border-t border-emerald-200 pt-3">{children}</div>}
  </div>
);

const ConjointThesisModal = ({ open, onOpenChange, studyId, token, user }) => {
  const { systemAllowed } = useLlmPolicy();
  const sysOk = systemAllowed('conjoint.thesis');
  const [option, setOption] = useState('noai');
  const [methods, setMethods] = useState(['mnl']);
  const [chapters, setChapters] = useState([3, 4, 5]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [extOpen, setExtOpen] = useState(false);
  const [imported, setImported] = useState(null); // last external-import response

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const base = `${API}/conjoint/studies/${studyId}`;
  const reqBody = useMemo(() => ({ methods, chapters, extra_prompt: extra || '' }), [methods, chapters, extra]);
  const importUrl = `${base}/export-thesis/external-import`;

  const isAdmin = user?.role === 'admin';
  const notPermitted = !!user && !isAdmin && user.can_export_thesis === false;
  const noAiChapters = chapters.filter((c) => c === 3 || c === 4);

  const toggleMethod = (m) => setMethods((p) => (p.includes(m) ? (p.length === 1 ? p : p.filter((x) => x !== m)) : [...p, m]));
  const toggleChapter = (c) => setChapters((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c].sort()));
  const resetImport = () => setImported(null);

  const fail = async (e, fallback) => {
    const msg = await apiErrorTextAsync(e, fallback);
    toast.error(msg);
    return msg;
  };

  const runNoAi = async () => {
    if (!noAiChapters.length) { toast.error('เอกสารแบบไม่ใช้ AI มีเฉพาะบทที่ 3 และ 4 — เลือกอย่างน้อย 1 บท'); return; }
    setBusy('noai');
    try {
      const r = await axios.post(`${base}/export-thesis/no-ai`, { methods, chapters: noAiChapters, extra_prompt: '' },
        { headers, responseType: 'blob', timeout: 120000 });
      saveBlob(new Blob([r.data], { type: DOCX }), `Conjoint_NoAI_Ch${noAiChapters.join('')}_${studyId.slice(0, 8)}.docx`);
      toast.success('ดาวน์โหลดเอกสารแล้ว (ไม่ใช้ AI)');
    } catch (e) { await fail(e, 'สร้างเอกสารไม่สำเร็จ'); } finally { setBusy(''); }
  };

  const runPack = async () => {
    if (!chapters.length) { toast.error('เลือกอย่างน้อย 1 บท'); return; }
    setBusy('pack');
    try {
      const r = await axios.post(`${base}/export-thesis/external-pack`, reqBody, { headers, responseType: 'blob', timeout: 120000 });
      saveBlob(new Blob([r.data], { type: 'text/markdown;charset=utf-8' }), `conjoint-${studyId.slice(0, 8)}-thesis-pack.md`);
      toast.success('ดาวน์โหลดชุด prompt + ตารางผลแล้ว — นำไปวางใน AI ของคุณ');
    } catch (e) { await fail(e, 'สร้างชุด prompt ไม่สำเร็จ'); } finally { setBusy(''); }
  };

  const downloadCached = async (cacheKey) => {
    setBusy('download');
    try {
      const r = await axios.get(`${base}/export-thesis-download`, { headers, params: cacheKey ? { cache_key: cacheKey } : undefined, responseType: 'blob', timeout: 120000 });
      saveBlob(new Blob([r.data], { type: DOCX }), `Conjoint_Thesis_Ch${chapters.join('')}_${studyId.slice(0, 8)}.docx`);
      toast.success('ดาวน์โหลดเอกสารแล้ว — มีย่อหน้าระบุการใช้ AI นำหน้า');
    } catch (e) { await fail(e, 'ดาวน์โหลดไม่สำเร็จ'); } finally { setBusy(''); setStatus(''); }
  };

  const runSystem = async () => {
    if (!chapters.length) { toast.error('เลือกอย่างน้อย 1 บท'); return; }
    setBusy('system');
    setStatus('AI กำลังเขียน… อาจใช้เวลา 1–3 นาที');
    try {
      const r = await axios.post(`${base}/export-thesis`, reqBody, { headers });
      let cacheKey = r.data.cache_key || (r.data.cached ? r.data.job_id : null);
      if (r.data.status !== 'ready') {
        let ok = false;
        for (let i = 0; i < 60 && !ok; i += 1) {
          await sleep(3000);
          if (!mounted.current) return; // page left: stop polling, do not download
          let p;
          try { p = await axios.get(`${base}/export-thesis-status/${r.data.job_id}`, { headers }); } catch { continue; }
          if (p.data.status === 'ready') { ok = true; cacheKey = p.data.cache_key || cacheKey; }
          else if (p.data.status === 'failed') {
            if (p.data.error_code === 'llm_external_only') { showLlmExternalOnlyToast(); setOption('pack'); }
            else if (p.data.error_code === 'stale_job') toast.error('งานค้างจากการรีสตาร์ตเซิร์ฟเวอร์ — กดสร้างอีกครั้งเพื่อเริ่มใหม่ได้');
            else toast.error(p.data.error || 'AI เขียนไม่สำเร็จ');
            return;
          }
        }
        if (!ok) { toast.error('ใช้เวลานานเกินไป ลองใหม่อีกครั้ง'); return; }
      }
      setStatus('กำลังดาวน์โหลด…');
      await downloadCached(cacheKey);
    } catch (e) {
      if (e?.response?.status === 409) setOption('pack'); // llm_external_only: toast already shown by the interceptor
      else await fail(e, 'สร้างเอกสารไม่สำเร็จ');
    } finally { setBusy(''); setStatus(''); }
  };

  const chapterLabel = (arr) => (arr || []).map((c) => `บทที่ ${c}`).join(', ') || '—';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-2xl" data-testid="thesis-export-modal">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <GraduationCap className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Export สำหรับวิทยานิพนธ์
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              เลือกวิธีที่เหมาะกับคุณ — ตารางและตัวเลขทุกแบบมาจากการคำนวณของระบบ ไม่ได้มาจาก AI
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-1 pr-1">

            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">1) วิธีวิเคราะห์ที่จะใส่ในเอกสาร</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {METHODS.map((m) => (
                  <label key={m.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${methods.includes(m.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`} data-testid={`thesis-method-${m.id}`}>
                    <Checkbox checked={methods.includes(m.id)} onCheckedChange={() => { toggleMethod(m.id); resetImport(); }} className="mt-0.5" />
                    <span className="min-w-0"><span className="block text-sm font-medium text-gray-800">{m.name}</span><span className="block text-xs text-gray-500">{m.desc}</span></span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">2) บทที่ต้องการ</h3>
              <div className="space-y-2">
                {CHAPTERS.map(({ ch, title, desc }) => (
                  <label key={ch} className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-2.5 ${chapters.includes(ch) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'}`} data-testid={`thesis-chapter-${ch}`}>
                    <Checkbox checked={chapters.includes(ch)} onCheckedChange={() => { toggleChapter(ch); resetImport(); }} className="mt-0.5" />
                    <span><span className="block text-sm font-semibold text-gray-800">{title}</span><span className="block text-xs text-gray-500">{desc}</span></span>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">3) เลือกวิธีสร้างเอกสาร</h3>

              <OptionCard
                id="noai" active={option === 'noai'} onSelect={() => setOption('noai')} icon={FileText} badge="ไม่ใช้ AI"
                title="เอกสารผลวิเคราะห์ ไม่ใช้ AI"
                gives="ไฟล์ Word บทที่ 3–4 ที่ระบบเขียนจากแบบสอบถามจริง: ย่อหน้าระเบียบวิธี ตารางสไตล์ APA (ค่าสัมประสิทธิ์ ช่วงเชื่อมั่น 95% ความสำคัญ ความเหมาะสมของแบบจำลอง) และกราฟ — ไม่มีบทที่ 5 และไม่มีข้อความที่ AI เขียน ใช้ได้เสมอแม้ AI ของระบบปิด"
              >
                <Button onClick={runNoAi} disabled={!!busy || !noAiChapters.length} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" data-testid="thesis-noai-btn">
                  {busy === 'noai' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  ดาวน์โหลด Word ({chapterLabel(noAiChapters)})
                </Button>
                {!noAiChapters.length && <p className="mt-2 text-xs text-amber-700">เลือกบทที่ 3 หรือ 4 ด้านบนเพื่อใช้ตัวเลือกนี้</p>}
              </OptionCard>

              <OptionCard
                id="pack" active={option === 'pack'} onSelect={() => setOption('pack')} icon={PackageOpen} badge="AI ของคุณเอง"
                title="ชุด prompt + ตารางผล ไปเขียนกับ AI ของตัวเอง"
                gives="ดาวน์โหลดไฟล์ที่มีคู่มือ ตารางผลทั้งหมด สมการ ข้อเท็จจริงของการออกแบบ และ prompt ของแต่ละบท นำไปวางใน ChatGPT / Claude / Gemini ของคุณ แล้ววางบทที่ได้กลับมาที่นี่เพื่อรวมเป็นไฟล์ Word (ทำทีละบทได้) — เอกสารที่มีข้อความจาก AI จะมีย่อหน้าระบุการใช้ AI และชื่อเครื่องมือนำหน้า"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button onClick={runPack} disabled={!!busy || !chapters.length} variant="outline" className="border-emerald-400 text-emerald-800" data-testid="thesis-pack-btn">
                    {busy === 'pack' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    ดาวน์โหลดชุด prompt (.md)
                  </Button>
                  <Button onClick={() => setExtOpen(true)} disabled={!!busy || !chapters.length} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="thesis-paste-btn">
                    <ClipboardPaste className="mr-2 h-4 w-4" aria-hidden="true" /> วางบทที่ AI เขียนกลับเข้ามา
                  </Button>
                </div>
                {imported && (
                  <div className="mt-3 rounded-lg border border-emerald-300 bg-white p-3 text-sm" data-testid="thesis-import-status" data-status={imported.status}>
                    <p className="flex items-center gap-1.5 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> นำเข้าแล้ว: {chapterLabel(imported.chapters_present)}{imported.model_label ? ` (${imported.model_label})` : ''}</p>
                    {(imported.chapters_missing || []).length > 0 && (
                      <p className="mt-1 text-xs text-amber-700">ยังขาด: {chapterLabel(imported.chapters_missing)} — วางเพิ่มได้ตลอด (สะสมไว้ให้) แล้วจึงดาวน์โหลด</p>
                    )}
                    <Button size="sm" className="mt-2 bg-emerald-600 text-white hover:bg-emerald-700" disabled={imported.status !== 'ready' || !!busy} onClick={() => downloadCached(imported.cache_key)} data-testid="thesis-import-download-btn">
                      {busy === 'download' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      ดาวน์โหลด Word
                    </Button>
                    {imported.status !== 'ready' && <span className="ml-2 text-xs text-gray-500">(ดาวน์โหลดได้เมื่อครบทุกบทที่เลือก)</span>}
                  </div>
                )}
              </OptionCard>

              <OptionCard
                id="system" active={option === 'system'} onSelect={() => setOption('system')} icon={Cpu} badge={sysOk ? 'ใช้โควตา AI ของระบบ' : 'ปิดอยู่'}
                disabled={!sysOk}
                title="ให้ AI ของระบบเขียน"
                gives={sysOk
                  ? 'AI ของระบบเขียนบทที่เลือกให้ใช้เวลา 1–3 นาที ผลลัพธ์เป็นร่างที่ต้องตรวจทานเอง ไฟล์จะมีย่อหน้าระบุการใช้ AI (AI ของระบบ) นำหน้า'
                  : 'ผู้ดูแลระบบปิดการใช้ AI ของระบบสำหรับฟังก์ชันนี้ — ใช้ตัวเลือกด้านบนแทนได้ทั้งสองแบบ'}
              >
                {sysOk && notPermitted && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="alert" data-testid="thesis-not-permitted">
                    <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>ให้ AI ของระบบเขียนได้เฉพาะบัญชีที่ผู้ดูแลระบบให้สิทธิ์ “ส่งออกวิทยานิพนธ์” — ตัวเลือกไม่ใช้ AI และชุด prompt สำหรับ AI ของคุณเองใช้ได้ตามปกติ</span>
                  </div>
                )}
                {sysOk ? (
                  <Button onClick={runSystem} disabled={!!busy || notPermitted || !chapters.length} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white sm:w-auto" data-testid="thesis-confirm-export-btn">
                    {busy === 'system' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
                    {busy === 'system' ? status || 'กำลังทำงาน…' : `ให้ AI เขียน (${methods.length} วิธี, ${chapters.length} บท)`}
                  </Button>
                ) : (
                  <p className="text-xs text-gray-500">ตัวเลือกนี้ไม่พร้อมใช้งานในขณะนี้</p>
                )}
              </OptionCard>
            </section>

            {(option === 'pack' || option === 'system') && (
              <section>
                <label className="mb-1 block text-sm font-semibold text-gray-700" htmlFor="thesis-extra-prompt">คำสั่งเพิ่มเติมถึง AI (ไม่บังคับ)</label>
                <textarea
                  id="thesis-extra-prompt" value={extra} onChange={(e) => { setExtra(e.target.value); resetImport(); }}
                  placeholder="เช่น: เน้นกลยุทธ์ราคา ใช้ภาษาทางการ"
                  className="min-h-[64px] w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  data-testid="thesis-extra-prompt"
                />
              </section>
            )}

          </div>
        </DialogContent>
      </Dialog>

      <ExternalAiDialog
        open={extOpen}
        onOpenChange={setExtOpen}
        title="เขียนบทวิทยานิพนธ์ด้วย AI ของฉันเอง"
        promptRequest={{ method: 'POST', url: `${base}/export-thesis/external-prompt`, data: reqBody }}
        importUrl={importUrl}
        importExtra={reqBody}
        onImported={(data) => setImported(data)}
      />
    </>
  );
};

export default ConjointThesisModal;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';
import ExternalAiDialog from '@/components/ExternalAiDialog';
import { isLlmExternalOnly } from '@/lib/llmErrors';
import { Icon } from './be-components';
import {
  API, authHeaders, buildFilterQS, errText, downloadFile, blobErrText,
} from './beUtils';

/**
 * "ส่งออกสำหรับวิทยานิพนธ์" — one area, three honest options:
 *   (a) เอกสารผลวิเคราะห์ ไม่ใช้ AI            POST thesis-export                (non-AI DOCX)
 *   (b) ชุด prompt + ตารางผล ไปเขียนกับ AI ของตัวเอง   GET  thesis-ai/external-pack (+ optional paste-back
 *                                                    POST thesis-ai/external-import → thesis-ai-download)
 *   (c) ให้ AI ของระบบเขียน (เมื่อผู้ดูแลอนุญาต)       POST thesis-ai-start → poll → download
 * Any AI-written text carries an AI-use disclosure line in the document.
 */

const CHAPTERS = [
  { ch: 1, title: 'บทที่ 1 — บทนำ', desc: 'ที่มา วัตถุประสงค์ คำถามวิจัย ขอบเขต ประโยชน์', draft: true },
  { ch: 2, title: 'บทที่ 2 — ทบทวนวรรณกรรม', desc: 'ทฤษฎี Aaker · Keller · Kapferer + กรอบแนวคิด', draft: true },
  { ch: 3, title: 'บทที่ 3 — ระเบียบวิธีวิจัย', desc: 'การออกแบบ สูตรคำนวณ น้ำหนัก การสุ่มตัวอย่าง', draft: false },
  { ch: 4, title: 'บทที่ 4 — ผลการศึกษา', desc: 'BES + 4 มิติ ตารางสถิติจริง Identity vs Image NPS', draft: false },
  { ch: 5, title: 'บทที่ 5 — สรุป อภิปราย ข้อเสนอแนะ', desc: 'อภิปรายผลกับทฤษฎี ข้อเสนอแนะ ข้อจำกัด', draft: false },
];

const Card = ({ n, title, who, children, testid, muted }) => (
  <div data-testid={testid}
       style={{ border: '1px solid var(--rule-strong)', background: muted ? 'var(--paper-2)' : 'var(--surface)',
                padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div className="be-mono be-tiny" style={{ letterSpacing: '0.1em', color: 'var(--ink-3)' }}>ตัวเลือก {n} · {who}</div>
    <div style={{ fontWeight: 600, fontSize: 15.5 }}>{title}</div>
    {children}
  </div>
);

const progressText = (p) => {
  if (!p || p === 'idle') return '';
  if (p === 'starting') return 'กำลังเริ่มงาน…';
  if (p === 'queued') return 'อยู่ในคิว…';
  if (p === 'rendering') return 'กำลังสร้างไฟล์ DOCX…';
  if (p === 'downloading') return 'กำลังดาวน์โหลด…';
  if (String(p).startsWith('chapter_')) return `AI กำลังเขียนบทที่ ${String(p).replace('chapter_', '')}…`;
  return String(p);
};

export const BeThesisExport = ({ studyId, token, filter, brandName, canExportNonAi }) => {
  const { systemAllowed, hint } = useLlmPolicy();
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState([3, 4, 5]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState('');                 // 'plain' | 'pack'
  const [dlBusy, setDlBusy] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const [imported, setImported] = useState(null);       // {cache_key, stored, warnings, model}
  const [sysProgress, setSysProgress] = useState('idle');
  const [sysError, setSysError] = useState('');
  const pollRef = useRef(null);
  const downloadStartedRef = useRef(false);
  const qs = buildFilterQS(filter);
  const sysOk = systemAllowed('be.thesis');
  const chSuffix = chapters.map((c) => `Ch${c}`).join('_');
  const safeBrand = (brandName || 'brand').replace(/\s+/g, '_');
  const sysWorking = sysProgress !== 'idle' && sysProgress !== 'failed';

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const toggleChapter = (ch) => setChapters((cur) => (
    cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch].sort((a, b) => a - b)
  ));

  const packQuery = useMemo(() => {
    const extras = [`chapters=${chapters.join(',')}`];
    if (extra.trim()) extras.push(`extra_prompt=${encodeURIComponent(extra.trim())}`);
    return extras;
  }, [chapters, extra]);

  // ---- (a) non-AI DOCX
  const downloadPlain = async () => {
    setBusy('plain');
    try {
      await downloadFile({
        url: `${API}/brand-equity/studies/${studyId}/thesis-export${qs}`, token, method: 'POST', data: {},
        fallbackName: `BE_Report_${safeBrand}.docx`,
      });
      toast.success('ดาวน์โหลดเอกสารผลวิเคราะห์แล้ว');
    } catch (e) {
      toast.error(await blobErrText(e, 'สร้างเอกสารไม่สำเร็จ'));
    }
    setBusy('');
  };

  // ---- (b) pack
  const downloadPack = async () => {
    if (!chapters.length) { toast.error('เลือกอย่างน้อย 1 บท'); return; }
    setBusy('pack');
    try {
      await downloadFile({
        url: `${API}/brand-equity/studies/${studyId}/thesis-ai/external-pack${buildFilterQS(filter, [...packQuery, 'format=md'])}`,
        token, fallbackName: `brand-equity-thesis-pack-${safeBrand}.md`,
      });
      toast.success('ดาวน์โหลดชุด prompt + ตารางผลแล้ว — เปิดไฟล์แล้ววางลงใน AI ของคุณทีละบท');
    } catch (e) {
      toast.error(await blobErrText(e, 'สร้างชุด prompt ไม่สำเร็จ'));
    }
    setBusy('');
  };

  const downloadImported = async (cacheKey) => {
    setDlBusy(true);
    try {
      await downloadFile({
        url: `${API}/brand-equity/studies/${studyId}/thesis-ai-download?cache_key=${encodeURIComponent(cacheKey)}`,
        token, fallbackName: `BE_Thesis_${safeBrand}_${chSuffix}.docx`,
      });
      toast.success('ดาวน์โหลด .docx แล้ว (มีบรรทัดเปิดเผยการใช้ AI ในเอกสาร)');
    } catch (e) {
      toast.error(await blobErrText(e, 'ดาวน์โหลดไม่สำเร็จ'));
    }
    setDlBusy(false);
  };

  const packExternal = useMemo(() => ({
    title: 'เขียนวิทยานิพนธ์กับ AI ของฉันเอง',
    promptRequest: {
      method: 'GET',
      url: `${API}/brand-equity/studies/${studyId}/thesis-ai/external-pack${buildFilterQS(filter, [...packQuery, 'format=json'])}`,
    },
    importUrl: `${API}/brand-equity/studies/${studyId}/thesis-ai/external-import${qs}`,
  }), [studyId, filter, packQuery, qs]);

  // ---- (c) system AI thesis (existing job flow)
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const finishDownload = useCallback(async (cacheKey) => {
    setSysProgress('downloading');
    try {
      await downloadFile({
        url: `${API}/brand-equity/studies/${studyId}/thesis-ai-download?cache_key=${encodeURIComponent(cacheKey)}`,
        token, fallbackName: `BE_Thesis_${safeBrand}_${chSuffix}.docx`,
      });
      toast.success('ดาวน์โหลดเรียบร้อย');
      setSysProgress('idle');
    } catch (e) {
      setSysError(await blobErrText(e, 'ดาวน์โหลดไม่สำเร็จ'));
      setSysProgress('failed');
    }
  }, [studyId, token, safeBrand, chSuffix]);

  const startSystem = async () => {
    if (!chapters.length) { toast.error('เลือกอย่างน้อย 1 บท'); return; }
    if (sysWorking) return;
    setSysError('');
    setSysProgress('starting');
    downloadStartedRef.current = false;
    stopPoll();
    try {
      const r = await axios.post(`${API}/brand-equity/studies/${studyId}/thesis-ai-start${qs}`,
        { chapters, extra_prompt: extra || '' }, { headers: authHeaders(token) });
      const { status, job_id: jobId, cache_key: cacheKey, cached } = r.data || {};
      if (status === 'ready' || cached) {
        downloadStartedRef.current = true;
        toast.info('พบเอกสารที่เคยสร้างไว้ — ดาวน์โหลดทันที');
        await finishDownload(cacheKey);
        return;
      }
      setSysProgress('queued');
      pollRef.current = setInterval(async () => {
        if (downloadStartedRef.current) { stopPoll(); return; }
        try {
          const s = await axios.get(`${API}/brand-equity/studies/${studyId}/thesis-ai-status/${jobId}`,
            { headers: authHeaders(token) });
          if (downloadStartedRef.current) return;
          const st = s.data || {};
          if (st.progress) setSysProgress(st.progress);
          if (st.status === 'ready') {
            downloadStartedRef.current = true;
            stopPoll();
            await finishDownload(st.cache_key || cacheKey);
          } else if (st.status === 'failed') {
            downloadStartedRef.current = true;
            stopPoll();
            setSysError(st.error_code === 'llm_external_only'
              ? `ผู้ดูแลระบบปิดการใช้ AI ของระบบระหว่างทำงาน — ใช้ตัวเลือก 2 แทน${st.error_detail?.hint ? ` (${st.error_detail.hint})` : ''}`
              : (st.error || 'AI สร้างเอกสารไม่สำเร็จ'));
            setSysProgress('failed');
          }
        } catch { /* keep polling */ }
      }, 4000);
    } catch (e) {
      if (isLlmExternalOnly(e)) {
        setSysError('ผู้ดูแลระบบปิดการใช้ AI ของระบบ — ใช้ตัวเลือก 2 (AI ของคุณเอง) หรือตัวเลือก 1 (ไม่ใช้ AI)');
      } else {
        setSysError(errText(e, 'เริ่มงานไม่สำเร็จ'));
      }
      setSysProgress('failed');
    }
  };

  return (
    <div className="be-appendix-card be-appendix-card--export" id="be-thesis-export" data-testid="be-thesis-export-card"
         style={{ marginTop: 18 }}>
      <button type="button" className="be-appendix-toggle" data-testid="be-thesis-export-toggle"
              aria-expanded={open} onClick={() => setOpen(!open)}>
        <div className="be-appendix-toggle-text">
          <span className="be-mono be-tiny" style={{ letterSpacing: '0.16em', color: 'var(--logo-blue)' }}>
            ◆ ACADEMIC EXPORT
          </span>
          <span className="be-appendix-title">ส่งออกสำหรับวิทยานิพนธ์</span>
          <span className="be-appendix-short">
            เลือกได้ 3 แบบ: เอกสารผลวิเคราะห์ไม่ใช้ AI · ชุด prompt + ตารางผลไปเขียนกับ AI ของคุณเอง · ให้ AI ของระบบเขียน
          </span>
        </div>
        <span className="be-appendix-arrow">{open ? 'COLLAPSE ▲' : 'EXPAND ▼'}</span>
      </button>

      {open && (
        <div className="be-appendix-body be-thesis-body" data-testid="be-thesis-export-body">
          <p className="be-small" style={{ lineHeight: 1.65, marginBottom: 14 }}>
            ทุกแบบใช้<b>ตัวเลขจริงชุดเดียวกัน</b>จาก study นี้ (ตามชุดข้อมูลที่กรองอยู่) — ต่างกันแค่ใครเป็นคนเขียนข้อความ
            เอกสารที่มีข้อความจาก AI จะมี<b>บรรทัดเปิดเผยการใช้ AI</b> (ระบุชื่อเครื่องมือ) ตามแนวปฏิบัติด้านความซื่อสัตย์ทางวิชาการ
            · บทที่ 1–2 เป็นร่างที่ไม่อ้างข้อมูลจริง ต้องแก้ให้ตรงกับบริบทงานของคุณ
          </p>

          <div className="be-thesis-block">
            <div className="be-thesis-block-label">เลือกบท (ใช้กับตัวเลือก 2 และ 3)</div>
            <div className="be-thesis-chapters">
              {CHAPTERS.map(({ ch, title, desc, draft }) => {
                const checked = chapters.includes(ch);
                return (
                  <label key={ch} className={`be-thesis-chapter ${checked ? 'on' : ''} ${draft ? 'draft' : ''}`}
                         data-testid={`be-thesis-chapter-${ch}`}>
                    <input type="checkbox" checked={checked} disabled={sysWorking} onChange={() => toggleChapter(ch)}
                           data-testid={`be-thesis-chapter-cb-${ch}`}/>
                    <div className="be-thesis-chapter-text">
                      <div className="be-thesis-chapter-title">
                        {title}{draft && <span className="be-thesis-draft-tag">ร่าง · DRAFT</span>}
                      </div>
                      <div className="be-thesis-chapter-desc">{desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="be-thesis-block">
            <label className="be-thesis-block-label" htmlFor="be-thesis-extra">คำสั่งเพิ่มเติม (Extra Prompt) — ไม่บังคับ</label>
            <textarea id="be-thesis-extra" className="be-thesis-textarea" value={extra} disabled={sysWorking}
                      onChange={(e) => setExtra(e.target.value)}
                      placeholder="เช่น: เน้น positioning ระดับพรีเมียม, ใช้ภาษาทางการมากขึ้น, เพิ่มมุมมอง Gen Z…"
                      data-testid="be-thesis-extra-prompt"/>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 6 }}>
            <Card n="1" who="ไม่ใช้ AI" title="เอกสารผลวิเคราะห์ (.docx)" testid="be-thesis-opt-plain">
              <div className="be-small be-muted" style={{ lineHeight: 1.6, flex: 1 }}>
                ได้เอกสาร Word ที่มีตารางและกราฟผลวิเคราะห์ วิธีคำนวณ และรายการอ้างอิง <b>ที่ระบบคำนวณเอง ไม่มีข้อความที่ AI เขียน</b>
                {' '}(ยกเว้นส่วน insights ที่คุณสั่งให้ AI สรุปไว้ — จะมีบรรทัดเปิดเผยการใช้ AI) เหมาะเป็นภาคผนวกหรือฐานตัวเลขให้คุณเขียนเอง
              </div>
              <button type="button" className="be-btn be-btn-primary" onClick={downloadPlain}
                      disabled={!!busy || !canExportNonAi} data-testid="be-thesis-plain-btn">
                <Icon name="download" size={11}/>{busy === 'plain' ? 'กำลังสร้าง…' : 'ดาวน์โหลดเอกสาร (.docx)'}
              </button>
              {!canExportNonAi && (
                <div className="be-tiny" style={{ color: 'var(--be-red)' }} data-testid="be-thesis-plain-locked">
                  ต้องได้รับสิทธิ์ Export Thesis จากผู้ดูแลระบบ (admin) ก่อน
                </div>
              )}
            </Card>

            <Card n="2" who="AI ของคุณเอง · ฟรี" title="ชุด prompt + ตารางผล ไปเขียนกับ ChatGPT / Claude / Gemini" testid="be-thesis-opt-pack">
              <div className="be-small be-muted" style={{ lineHeight: 1.6, flex: 1 }}>
                ได้ไฟล์ Markdown ที่มีตารางผลวัดจริงทั้งหมด ย่อหน้าวิธีการวิจัย ข้อกำหนดที่ AI ต้องปฏิบัติ (ห้ามอ้างตัวเลขที่ไม่มี)
                และ prompt ทีละบท — คุณวางลง AI ของคุณเอง แล้ว<b>จะวางบทที่ได้กลับมา</b>เพื่อให้ระบบทำเป็น .docx ก็ได้
                (เอกสารจะระบุชื่อ AI ที่คุณใช้)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="be-btn be-btn-primary" onClick={downloadPack}
                        disabled={!!busy || !chapters.length} data-testid="be-thesis-pack-btn">
                  <Icon name="download" size={11}/>{busy === 'pack' ? 'กำลังสร้าง…' : 'ดาวน์โหลดชุด prompt (.md)'}
                </button>
                <button type="button" className="be-btn" onClick={() => setExtOpen(true)}
                        disabled={!chapters.length} data-testid="be-thesis-pack-dialog-btn">
                  <Icon name="sparkle" size={11}/>เปิดพรอมต์ + วางบทกลับมา
                </button>
              </div>
              {imported && (
                <div className="be-small" data-testid="be-thesis-imported"
                     style={{ border: '1px solid var(--be-green)', background: 'rgba(16,185,129,0.07)', padding: 10, lineHeight: 1.6 }}>
                  นำเข้าแล้ว: {imported.stored.map((c) => `บทที่ ${c}`).join(', ')} · จาก {imported.model || 'AI ภายนอก'}
                  {imported.warnings.length > 0 && (
                    <ul data-testid="be-thesis-import-warnings" style={{ margin: '6px 0 0 18px', color: 'var(--ink-2)' }}>
                      {imported.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  {imported.warnings.length > 0 && <div className="be-tiny be-muted">โปรดตรวจคำเตือนข้างต้นก่อนส่งงาน</div>}
                  <button type="button" className="be-btn be-btn-red" style={{ marginTop: 8 }} disabled={dlBusy}
                          onClick={() => downloadImported(imported.cacheKey)} data-testid="be-thesis-download-imported">
                    <Icon name="download" size={11}/>{dlBusy ? 'กำลังสร้าง…' : 'ดาวน์โหลด .docx จากบทที่นำเข้า'}
                  </button>
                </div>
              )}
            </Card>

            <Card n="3" who="AI ของระบบ" title="ให้ AI ของระบบเขียนให้" testid="be-thesis-opt-system" muted={!sysOk}>
              <div className="be-small be-muted" style={{ lineHeight: 1.6, flex: 1 }}>
                {sysOk
                  ? <>AI ของแพลตฟอร์มเขียนบทที่เลือกจากตัวเลขจริง ใช้เวลาประมาณ 30–90 วินาทีต่อบท แล้วดาวน์โหลด .docx ทันที
                      เอกสารจะระบุว่าเขียนโดย AI ของระบบ ผู้เขียนยังต้องตรวจทานเอง</>
                  : <>ผู้ดูแลระบบปิดการใช้ AI ของระบบอยู่ — ใช้ตัวเลือก 1 หรือ 2 แทน{hint ? ` (${hint})` : ''}</>}
              </div>
              <button type="button" className="be-btn" onClick={startSystem}
                      disabled={!sysOk || sysWorking || !chapters.length} data-testid="be-thesis-export-btn">
                <Icon name="sparkle" size={11}/>
                {sysWorking ? `⏳ ${progressText(sysProgress)}` : `สร้างด้วย AI ของระบบ ${chapters.length} บท →`}
              </button>
              {sysWorking && (
                <div className="be-thesis-progress" data-testid="be-thesis-progress">
                  <div className="be-thesis-progress-bar"/>
                  <div className="be-tiny be-muted" style={{ marginTop: 6 }}>{progressText(sysProgress)}</div>
                </div>
              )}
              {sysProgress === 'failed' && sysError && (
                <div className="be-thesis-error" role="alert" data-testid="be-thesis-error">✕ {sysError}</div>
              )}
            </Card>
          </div>
        </div>
      )}

      <ExternalAiDialog
        open={extOpen} onOpenChange={setExtOpen}
        title={packExternal.title} promptRequest={packExternal.promptRequest} importUrl={packExternal.importUrl}
        onImported={(d) => setImported({
          cacheKey: d?.cache_key, stored: d?.chapters_stored || d?.chapters_imported || [],
          warnings: d?.warnings || [], model: d?.model_label,
        })}
      />
    </div>
  );
};

export default BeThesisExport;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';
import { isLlmExternalOnly } from '@/lib/llmErrors';
import { Icon } from './be-components';
import {
  API, authHeaders, errText, importErrors, downloadFile, blobErrText, fmtPct,
} from './beUtils';

/**
 * Coding the open-ended answers (TOM, recall, one-word, …) — three ways, none of
 * which needs the platform's paid LLM:
 *   1. "ใช้ AI ของฉันเอง"          → the same external prompt/import dialog as the AI analysis
 *   2. "เข้ารหัสเองด้วยสเปรดชีต"    → codeframe.csv → fill → coding/import-csv
 *   3. AI ของระบบ                   → only when the admin allows it
 *
 * Codes are stored per DISTINCT answer text, so they apply to every filter/segment/wave.
 */

const TASK_TH = { brand_single: 'ชื่อแบรนด์ (1 ชื่อ)', brand_multi: 'ชื่อแบรนด์ (หลายชื่อ)', concept: 'แนวคิด/คำสำคัญ' };
const SRC_TH = { system: 'AI ของระบบ', external: 'AI ภายนอก', manual: 'ด้วยมือ' };

const rowStatus = (r) => {
  if (!r.answers) return { key: 'none', text: 'ไม่มีคำตอบ', color: 'var(--ink-4)' };
  if (r.coverage >= 0.999) return { key: 'coded', text: 'เข้ารหัสครบ', color: 'var(--be-green)' };
  if (r.coverage > 0) return { key: 'partial', text: `บางส่วน ${Math.round(r.coverage * 100)}%`, color: 'var(--be-gold)' };
  return { key: 'uncoded', text: 'ยังไม่ได้เข้ารหัส', color: 'var(--be-red)' };
};

const OptionCard = ({ n, title, desc, children, testid, muted }) => (
  <div data-testid={testid}
       style={{ border: '1px solid var(--rule-strong)', padding: 14, background: muted ? 'var(--paper-2)' : 'var(--surface)',
                display: 'flex', flexDirection: 'column', gap: 8, opacity: muted ? 0.85 : 1 }}>
    <div className="be-mono be-tiny" style={{ letterSpacing: '0.1em', color: 'var(--ink-3)' }}>ทางเลือก {n}</div>
    <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
    <div className="be-small be-muted" style={{ lineHeight: 1.6, flex: 1 }}>{desc}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
  </div>
);

export const BeCodingPanel = ({ studyId, token, openCoding, ai, onChanged, defaultOpen }) => {
  const { systemAllowed, hint } = useLlmPolicy();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState('');           // 'download' | 'import' | 'clear'
  const [impErr, setImpErr] = useState(null);     // {message, errors[]}
  const [coder, setCoder] = useState('');
  const [open, setOpen] = useState(!!defaultOpen);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr('');
    try {
      const r = await axios.get(`${API}/brand-equity/studies/${studyId}/coding`, { headers: authHeaders(token) });
      setData(r.data);
    } catch (e) {
      setLoadErr(errText(e, 'โหลดสถานะการเข้ารหัสไม่สำเร็จ'));
    }
    setLoading(false);
  }, [studyId, token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  const rows = data?.questions || [];
  const needs = openCoding?.questions_needing_coding ?? rows.length;
  const uncoded = openCoding?.by_status?.uncoded ?? rows.filter((r) => rowStatus(r).key === 'uncoded').length;
  const sysOk = systemAllowed('be.ai_analyze');
  const anyCoded = rows.some((r) => r.coded_answers > 0);

  const downloadCsv = async () => {
    setBusy('download');
    try {
      await downloadFile({ url: `${API}/brand-equity/studies/${studyId}/coding/codeframe.csv`, token, fallbackName: 'codeframe.csv' });
      toast.success('ดาวน์โหลด codeframe.csv แล้ว — เปิดด้วย Excel / Google Sheets แล้วกรอกคอลัมน์ code');
    } catch (e) {
      toast.error(await blobErrText(e, 'ดาวน์โหลดไฟล์ไม่สำเร็จ'));
    }
    setBusy('');
  };

  const onFile = async (file) => {
    if (!file) return;
    setImpErr(null);
    if (file.size > 5 * 1024 * 1024) {
      setImpErr({ message: 'ไฟล์ใหญ่เกิน 5 MB — ตรวจว่าเป็นไฟล์ codeframe.csv ที่ดาวน์โหลดจากระบบ', errors: [] });
      return;
    }
    setBusy('import');
    try {
      const content = await file.text();
      if (content.includes('�')) {
        setImpErr({ message: 'ตัวอักษรภาษาไทยในไฟล์อ่านไม่ได้ — กรุณาบันทึกเป็น "CSV UTF-8" แล้วอัปโหลดใหม่', errors: [] });
        setBusy('');
        return;
      }
      const r = await axios.post(`${API}/brand-equity/studies/${studyId}/coding/import-csv`,
        { content, model_label: coder.trim() || undefined },
        { headers: authHeaders(token), timeout: 120000 });
      toast.success(`นำเข้ารหัสแล้ว ${r.data?.imported ?? ''} คำตอบ — คำนวณผลใหม่แล้ว`);
      if (r.data?.questions) setData((d) => ({ ...(d || {}), questions: r.data.questions }));
      await load();
      await onChanged?.();
    } catch (e) {
      setImpErr(importErrors(e));
    }
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const clearCoding = async (qid) => {
    const msg = qid
      ? 'ล้างการเข้ารหัสของคำถามนี้? (ระบบจะกลับไปนับชื่อแบรนด์อัตโนมัติ)'
      : 'ล้างการเข้ารหัสของทุกคำถาม? (ระบบจะกลับไปนับชื่อแบรนด์อัตโนมัติ — ย้อนกลับไม่ได้ แต่นำเข้าใหม่ได้)';
    if (!window.confirm(msg)) return;
    setBusy('clear');
    try {
      await axios.delete(`${API}/brand-equity/studies/${studyId}/coding${qid ? `?question_id=${encodeURIComponent(qid)}` : ''}`,
        { headers: authHeaders(token) });
      toast.success('ล้างการเข้ารหัสแล้ว');
      await load();
      await onChanged?.();
    } catch (e) {
      toast.error(errText(e, 'ล้างการเข้ารหัสไม่สำเร็จ'));
    }
    setBusy('');
  };

  const runSystem = async () => {
    try { await ai.runSystem(); } catch (e) {
      if (isLlmExternalOnly(e)) ai.openExternal();
    }
  };

  return (
    <div className="be-card" id="be-coding-panel" data-testid="be-coding-panel" style={{ padding: 20, marginTop: 18 }}>
      <button type="button" className="be-disclosure-head" onClick={() => setOpen(!open)} aria-expanded={open}
              data-testid="be-coding-toggle">
        <div>
          <div className="be-eyebrow" style={{ marginBottom: 6 }}>
            <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>
            เข้ารหัสคำตอบปลายเปิด · CODING
          </div>
          <div className="be-small" style={{ lineHeight: 1.6 }} data-testid="be-coding-summary">
            {loading ? 'กำลังโหลด…'
              : loadErr ? <span style={{ color: 'var(--be-red)' }}>{loadErr}</span>
              : needs === 0 ? 'ไม่มีคำถามปลายเปิดที่ต้องเข้ารหัส'
              : <>ต้องเข้ารหัส <b>{needs}</b> ข้อ · ยังไม่ได้เข้ารหัส <b style={{ color: uncoded ? 'var(--be-red)' : 'inherit' }}>{uncoded}</b> ข้อ
                  {' '}· คะแนน BES ใช้การจับคู่ชื่ออัตโนมัติอยู่แล้ว — เข้ารหัสแล้วแม่นขึ้น และจำเป็นสำหรับกราฟ/ประเด็นของคำถามกลุ่มแนวคิด</>}
          </div>
        </div>
        <span className="be-appendix-arrow">{open ? 'ซ่อน ▲' : 'แสดง ▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <p className="be-small be-muted" style={{ lineHeight: 1.65, marginBottom: 14 }}>
            การเข้ารหัส (coding) คือการจัดคำตอบที่พิมพ์อิสระ เช่น "ชาไทยมะลิ", "chathai", "ชาไทยมะลิค่ะ" ให้เป็นแบรนด์/คำสำคัญเดียวกัน
            เลือกวิธีที่สะดวก — ทุกวิธีให้ผลเข้าที่เดียวกัน และ<b>รหัสใช้กับทุก filter / segment / wave โดยอัตโนมัติ</b>
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}
               data-testid="be-coding-options">
            <OptionCard n="1" title="ใช้ AI ของฉันเอง" testid="be-coding-opt-external"
                        desc="คัดลอกพรอมต์ไปวางใน ChatGPT / Claude / Gemini แล้ววางคำตอบ JSON กลับมา ระบบตรวจรูปแบบให้ก่อนบันทึก">
              <button type="button" className="be-btn be-btn-primary" onClick={ai.openExternal}
                      data-testid="be-coding-external-btn">
                <Icon name="sparkle" size={11}/>เปิดพรอมต์
              </button>
            </OptionCard>

            <OptionCard n="2" title="เข้ารหัสเองด้วยสเปรดชีต" testid="be-coding-opt-sheet"
                        desc="ไม่ใช้ AI เลย: ดาวน์โหลด codeframe.csv → เปิดใน Excel/Sheets → กรอกคอลัมน์ code → อัปโหลดกลับ (หลายแบรนด์คั่นด้วย ; · ใส่ - ถ้าไม่มีแบรนด์ · เว้นว่าง = ข้ามไปก่อน)">
              <button type="button" className="be-btn" onClick={downloadCsv} disabled={!!busy}
                      data-testid="be-coding-download-csv">
                <Icon name="download" size={11}/>{busy === 'download' ? 'กำลังโหลด…' : 'ดาวน์โหลด codeframe.csv'}
              </button>
              <label className={'be-btn' + (busy ? ' is-disabled' : '')} style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
                <Icon name="plus" size={11}/>{busy === 'import' ? 'กำลังนำเข้า…' : 'อัปโหลดไฟล์ที่กรอกแล้ว'}
                <input ref={fileRef} type="file" accept=".csv,text/csv" disabled={!!busy}
                       style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                       onChange={(e) => onFile(e.target.files?.[0])}
                       data-testid="be-coding-upload-csv" aria-label="อัปโหลดไฟล์ code frame (CSV)"/>
              </label>
              <input className="be-input" value={coder} onChange={(e) => setCoder(e.target.value)}
                     placeholder="ชื่อผู้เข้ารหัส (ไม่บังคับ — ระบุในรายงาน)" maxLength={80}
                     style={{ flex: '1 1 100%', fontSize: 12 }} aria-label="ชื่อผู้เข้ารหัส"
                     data-testid="be-coding-coder-label"/>
            </OptionCard>

            <OptionCard n="3" title="ใช้ AI ของระบบ" testid="be-coding-opt-system" muted={!sysOk}
                        desc={sysOk
                          ? 'ให้ AI ของแพลตฟอร์มทำทั้งชุด (เข้ารหัส + ประเด็น + อัตลักษณ์ + ข้อเสนอแนะ) ทันที'
                          : `ผู้ดูแลระบบปิดการใช้ AI ของระบบอยู่ — ใช้ทางเลือก 1 หรือ 2 แทน${hint ? ` (${hint})` : ''}`}>
              <button type="button" className="be-btn" onClick={runSystem}
                      disabled={!sysOk || ai.running} data-testid="be-coding-system-btn">
                <Icon name="sparkle" size={11}/>{ai.running ? 'กำลังวิเคราะห์…' : 'เริ่มด้วย AI ของระบบ'}
              </button>
            </OptionCard>
          </div>

          {impErr && (
            <div role="alert" data-testid="be-coding-import-error"
                 style={{ border: '1px solid var(--be-red)', background: 'rgba(200,16,46,0.05)', padding: 12, marginTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{impErr.message}</div>
              {impErr.errors.length > 0 && (
                <>
                  <div className="be-small be-muted" style={{ marginBottom: 4 }}>
                    พบข้อผิดพลาด {impErr.errors.length} รายการ — ยังไม่ได้นำเข้าส่วนใดเลย แก้ไฟล์แล้วอัปโหลดใหม่
                  </div>
                  <ol className="be-small" style={{ margin: '0 0 0 20px', maxHeight: 200, overflow: 'auto', lineHeight: 1.6 }}
                      data-testid="be-coding-import-error-list">
                    {impErr.errors.map((m, i) => <li key={i}>{m}</li>)}
                  </ol>
                </>
              )}
            </div>
          )}

          {loading && <div className="be-muted be-small" style={{ padding: '14px 0' }}>กำลังโหลดรายการคำถาม…</div>}
          {!loading && loadErr && (
            <div style={{ padding: '14px 0' }}>
              <button type="button" className="be-btn" onClick={load}>ลองโหลดอีกครั้ง</button>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="be-table-wrap" style={{ marginTop: 16 }}>
              <table className="be-table" style={{ width: '100%' }} data-testid="be-coding-table">
                <thead>
                  <tr>
                    <th>คำถาม</th><th>ชนิด</th><th>สถานะ</th><th>คำตอบที่เข้ารหัส</th><th>โดย</th><th><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = rowStatus(r);
                    const by = (r.sources || []).map((s) => `${SRC_TH[s] || s}${r.model_labels?.[s] ? ` (${r.model_labels[s]})` : ''}`).join(', ');
                    return (
                      <tr key={r.question_id} data-testid={`be-coding-row-${r.question_id}`}>
                        <td style={{ maxWidth: 320 }}><span className="be-mono be-tiny be-muted">{r.question_id.split('--')[0]}</span> {r.prompt}</td>
                        <td className="be-tiny">{TASK_TH[r.task] || r.task}</td>
                        <td><span className="be-tiny" style={{ color: st.color, fontWeight: 600 }}>{st.text}</span></td>
                        <td className="be-tiny be-mono">
                          {r.coded_answers}/{r.answers} ({fmtPct((r.coverage || 0) * 100)})
                          <div className="be-muted">{r.coded_distinct}/{r.distinct_answers} ข้อความไม่ซ้ำ</div>
                        </td>
                        <td className="be-tiny">{by || '—'}</td>
                        <td>
                          {r.coded_answers > 0 && (
                            <button type="button" className="be-btn be-btn-ghost be-tiny" disabled={!!busy}
                                    onClick={() => clearCoding(r.question_id)}
                                    data-testid={`be-coding-clear-${r.question_id}`}
                                    aria-label={`ล้างการเข้ารหัสของคำถาม ${r.question_id}`}>ล้าง</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {anyCoded && (
            <button type="button" className="be-btn be-btn-ghost be-tiny" style={{ marginTop: 10, color: 'var(--be-red)' }}
                    disabled={!!busy} onClick={() => clearCoding(null)} data-testid="be-coding-clear-all">
              ล้างการเข้ารหัสทั้งหมด
            </button>
          )}
          {data?.how_to_th && (
            <details className="be-small be-muted" style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer' }}>วิธีกรอกไฟล์ code frame (จากระบบ)</summary>
              <div style={{ whiteSpace: 'pre-line', lineHeight: 1.65, marginTop: 6 }}>{data.how_to_th}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default BeCodingPanel;

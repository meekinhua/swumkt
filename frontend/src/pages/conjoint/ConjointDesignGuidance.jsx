/**
 * Design wizard guidance: live rules of thumb for the number of attributes / levels /
 * tasks and the respondents needed (the server's Johnson–Orme rule), plus a pre-publish
 * checklist dialog. Everything here is advice — nothing blocks the user except what the
 * server already enforces.
 */
import React from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';

const NUM = /^[\s฿$€£]*[\d,]+(\.\d+)?\s*(บาท|฿|baht|thb|usd|\$)?\s*$/i;
const PRICEY = /ราคา|price|cost|บาท|ค่าใช้จ่าย/i;

/** Mirror of the backend's price detection: a price-like name with all-numeric levels. */
export const detectPriceAttribute = (attributes) =>
  (attributes || []).find((a) => PRICEY.test(a.name || '') && (a.levels || []).length >= 2 && a.levels.every((l) => NUM.test(String(l.value || ''))));

/** Returns [{key, level: 'ok'|'warn'|'info', text}] for the current design settings. */
export const designAdvice = ({ attributes, alternativesPerSet, tasks, sample }) => {
  const out = [];
  const attrs = attributes || [];
  const nA = attrs.length;
  const levelCounts = attrs.map((a) => (a.levels || []).length);
  const totalLevels = levelCounts.reduce((x, y) => x + y, 0);
  const params = Math.max(0, totalLevels - nA);
  const contrasts = tasks * Math.max(1, (alternativesPerSet || 3) - 1);

  if (nA === 0) return [{ key: 'none', level: 'info', text: 'เพิ่ม attribute (คุณลักษณะ) อย่างน้อย 2–3 รายการเพื่อเริ่ม เช่น ราคา แบรนด์ ขนาด' }];
  if (nA < 3) out.push({ key: 'attrs-few', level: 'warn', text: `มี ${nA} attribute — น้อยไปอาจไม่สะท้อนการตัดสินใจจริง ปกติใช้ 3–6 รายการ` });
  else if (nA > 6) out.push({ key: 'attrs-many', level: 'warn', text: `มี ${nA} attribute — มากกว่า 6 ผู้ตอบจะเหนื่อยและเริ่มเลือกส่งๆ ลองรวมหรือตัดตัวที่ไม่ใช่เรื่องหลัก` });
  else out.push({ key: 'attrs-ok', level: 'ok', text: `${nA} attribute — อยู่ในช่วงที่แนะนำ (3–6)` });

  const many = attrs.filter((a) => (a.levels || []).length > 5);
  if (many.length) out.push({ key: 'levels-many', level: 'warn', text: `“${many.map((a) => a.name).join(', ')}” มีมากกว่า 5 ระดับ — ทำให้ต้องใช้ผู้ตอบมากขึ้นและค่าที่ได้แกว่ง ปกติ 2–5 ระดับ` });
  const lo = Math.min(...levelCounts); const hi = Math.max(...levelCounts);
  if (nA >= 2 && hi - lo >= 3) out.push({ key: 'levels-imbalance', level: 'info', text: `จำนวนระดับต่างกันมาก (${lo}–${hi}) — attribute ที่มีระดับมากกว่ามักดูสำคัญเกินจริง (number-of-levels effect) ควรให้ใกล้เคียงกัน` });
  const dup = attrs.filter((a) => { const v = (a.levels || []).map((l) => (l.value || '').trim().toLowerCase()).filter(Boolean); return new Set(v).size !== v.length; });
  if (dup.length) out.push({ key: 'levels-dup', level: 'warn', text: `ชื่อระดับซ้ำกันใน “${dup.map((a) => a.name).join(', ')}”` });

  if (tasks) {
    if (tasks < 8) out.push({ key: 'tasks-few', level: 'warn', text: `${tasks} ชุดคำถาม — น้อยกว่า 8 ข้อมูลต่อคนน้อยเกินไป` });
    else if (tasks > 16) out.push({ key: 'tasks-many', level: 'warn', text: `${tasks} ชุดคำถาม — เกิน 16 ข้อ คุณภาพคำตอบมักแย่ลงช่วงท้าย (ใช้เวลาราว ${Math.round((tasks * 25) / 60)} นาที)` });
    else out.push({ key: 'tasks-ok', level: 'ok', text: `${tasks} ชุดคำถาม ≈ ${Math.max(2, Math.round((tasks * 25) / 60))} นาทีต่อคน — อยู่ในช่วงที่ตอบไหว (8–16)` });
    if (params && contrasts < params) out.push({ key: 'identify', level: 'warn', text: `ต้องประมาณ ${params} ค่า แต่แต่ละคนให้ข้อมูลเพียง ${contrasts} ค่า — เพิ่มชุดคำถามหรือจำนวนทางเลือกต่อชุด` });
  }

  if (sample?.minimum) out.push({ key: 'sample', level: 'info', text: `ต้องการผู้ตอบอย่างน้อย ${sample.minimum} คน (แนะนำ ${sample.recommended} คน ถ้าจะดูแยกกลุ่ม) — ถ้าเข้าถึงได้น้อยกว่านี้ ลดจำนวนระดับหรือ attribute ลง` });

  if (!detectPriceAttribute(attrs)) out.push({ key: 'price', level: 'info', text: 'ถ้าอยากรู้ว่าผู้ตอบ “ยอมจ่ายเพิ่มเท่าไร” ให้มี attribute ราคาที่ระดับเป็นตัวเลข เช่น 15 บาท / 25 บาท / 35 บาท (ไม่บังคับ)' });
  return out;
};

const ICON = { ok: CheckCircle2, warn: AlertTriangle, info: Info };
const TONE = { ok: 'text-green-700', warn: 'text-amber-700', info: 'text-sky-700' };

export const DesignGuidance = ({ attributes, alternativesPerSet, tasks, sample }) => {
  const items = designAdvice({ attributes, alternativesPerSet, tasks, sample });
  return (
    <Card className="mb-4 border-2 border-sky-200 bg-sky-50/50 p-4" data-testid="design-guidance">
      <h3 className="mb-2 text-sm font-bold text-gray-900">คำแนะนำการออกแบบ (อัปเดตตามที่คุณแก้)</h3>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const Icon = ICON[it.level];
          return (
            <li key={it.key} className={`flex items-start gap-2 text-sm ${TONE[it.level]}`} data-level={it.level} data-testid={`guidance-${it.key}`}>
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="text-gray-800">{it.text}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export const PublishChecklistDialog = ({ open, onOpenChange, onConfirm, attributes, alternativesPerSet, tasks, sample, previewUrl, busy }) => {
  const warns = designAdvice({ attributes, alternativesPerSet, tasks, sample }).filter((x) => x.level === 'warn');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto" data-testid="publish-checklist">
        <AlertDialogHeader>
          <AlertDialogTitle>ตรวจก่อนเปิดเก็บข้อมูล</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-gray-700">
              <p><b>เมื่อเปิดแล้ว โครงสร้างจะถูกล็อก</b> — เพิ่ม/ลบ attribute หรือ level และสร้างแผนการทดลองใหม่ไม่ได้ (แก้ได้เฉพาะชื่อ คำอธิบาย และรูป) เพราะผู้ตอบทุกคนต้องเห็นแบบสอบถามชุดเดียวกัน</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{(attributes || []).length} attribute · {(attributes || []).reduce((s, a) => s + (a.levels || []).length, 0)} ระดับ · {tasks} ชุดคำถาม × {alternativesPerSet} ทางเลือก</li>
                {sample?.minimum && <li>ควรเก็บอย่างน้อย {sample.minimum} คน (แนะนำ {sample.recommended})</li>}
                <li>ผู้ตอบแต่ละคนเห็นลำดับข้อและตำแหน่งทางเลือกแบบสุ่ม (ไม่กระทบการวิเคราะห์)</li>
                <li>รูปภาพไม่บังคับ — ไม่มีรูป ผู้ตอบเห็นเป็นข้อความ</li>
              </ul>
              {warns.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="publish-warnings">
                  <p className="mb-1 font-semibold text-amber-900">ข้อควรทบทวนก่อนเปิด</p>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900">{warns.map((w) => <li key={w.key}>{w.text}</li>)}</ul>
                </div>
              )}
              {previewUrl && <p><a href={previewUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline" data-testid="publish-preview-link">เปิดดูตัวอย่างแบบสอบถามในแท็บใหม่ ↗</a> (ตอบได้หลังเปิดเก็บข้อมูลเท่านั้น)</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>กลับไปแก้ไข</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy} data-testid="publish-confirm-btn">เปิดเก็บข้อมูลเลย</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

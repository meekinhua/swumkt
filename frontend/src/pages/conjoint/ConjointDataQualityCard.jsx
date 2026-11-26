/**
 * Data-quality card — GET data-quality (owner/admin). Report only: nothing is removed
 * from the estimation sample. Each flag is explained in plain Thai.
 */
import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmtShare } from './cjFormat';

export const FLAG_INFO = {
  speeder: { label: 'ตอบเร็วผิดปกติ', why: (t) => `ใช้เวลาน้อยกว่า ${Math.round((t?.speeder_ratio_of_median ?? 0.4) * 100)}% ของเวลามัธยฐาน (ต่ำกว่า ${t?.speeder_seconds ?? '—'} วินาที) — อาจกดผ่านโดยไม่อ่าน` },
  straightliner: { label: 'เลือกตำแหน่งเดิมทุกข้อ', why: (t) => `เลือกทางเลือกที่อยู่ลำดับเดียวกันตามแผนการทดลองทุกข้อ (อย่างน้อย ${t?.straightline_min_tasks ?? 6} ข้อ) — เป็นสัญญาณว่าอาจไม่ได้ตั้งใจเลือก` },
  duplicate_id: { label: 'รหัสผู้ตอบซ้ำ', why: () => 'มีคำตอบหลายชุดจากรหัสผู้ตอบเดียวกัน — อาจส่งซ้ำ' },
  duplicate_email: { label: 'อีเมลซ้ำ', why: () => 'มีคำตอบหลายชุดจากอีเมลเดียวกัน' },
  possible_duplicate: { label: 'อาจส่งซ้ำ', why: (t) => `คำตอบและข้อมูลประชากรเหมือนกันทุกประการ และส่งห่างกันไม่เกิน ${Math.round((t?.possible_duplicate_window_sec ?? 600) / 60)} นาที — มักเกิดจากกดส่งสองครั้ง` },
  incomplete: { label: 'ตอบไม่ครบ', why: () => 'ตอบน้อยกว่าจำนวนข้อในแบบสอบถาม' },
  no_usable_task: { label: 'ไม่มีข้อที่ใช้ได้', why: () => 'ไม่มีข้อใดที่ใช้คำนวณได้ (ตัวเลือกที่เลือกไม่ตรงกับแบบสอบถาม)' },
};

const ConjointDataQualityCard = ({ dq }) => {
  const [open, setOpen] = useState(false);
  const { data, loading, error, refetch } = dq;

  if (loading && !data) {
    return <Card className="mb-6 p-4 text-sm text-gray-500" data-testid="data-quality-card"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังตรวจคุณภาพข้อมูล…</Card>;
  }
  if (error) {
    return (
      <Card className="mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="data-quality-card" role="alert">
        ตรวจคุณภาพข้อมูลไม่สำเร็จ: {error} <button type="button" className="ml-2 underline" onClick={refetch}>ลองใหม่</button>
      </Card>
    );
  }
  if (!data) return null;

  const counts = data.counts || {};
  const active = Object.entries(counts).filter(([, n]) => n > 0);
  const clean = (data.n_flagged || 0) === 0;
  const th = data.thresholds || {};

  return (
    <Card className={`mb-6 border-2 p-4 sm:p-6 ${clean ? 'border-green-200 bg-green-50/50' : 'border-amber-300 bg-amber-50/50'}`} data-testid="data-quality-card" data-flagged={data.n_flagged || 0}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {clean ? <ShieldCheck className="mt-0.5 h-6 w-6 text-green-600" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-6 w-6 text-amber-600" aria-hidden="true" />}
          <div>
            <h2 className="text-lg font-bold text-gray-900">คุณภาพข้อมูลผู้ตอบ</h2>
            <p className="text-sm text-gray-700">
              {clean
                ? `ไม่พบผู้ตอบที่น่าสงสัยจาก ${data.n_responses} คน`
                : <>พบ <b>{data.n_flagged}</b> จาก {data.n_responses} คน ({fmtShare(data.share_flagged)}) ที่มีสัญญาณควรตรวจสอบ</>}
              {data.median_duration_sec ? <> · เวลาตอบมัธยฐาน {Math.round(data.median_duration_sec)} วินาที</> : null}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} aria-label="ตรวจใหม่"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        ระบบ <b>ไม่ได้ตัดผู้ตอบเหล่านี้ออก</b> จากการวิเคราะห์ — เป็นรายงานให้คุณตัดสินใจเอง หากตัดออก ให้บันทึกเกณฑ์และจำนวนที่ตัดไว้ในวิธีวิจัย
      </p>

      {active.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="data-quality-flags">
          {active.map(([k, n]) => (
            <li key={k} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
              <span className="font-semibold text-gray-900">{FLAG_INFO[k]?.label || k}</span>{' '}
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">{n} คน</span>
              <span className="mt-0.5 block text-xs text-gray-600">{FLAG_INFO[k]?.why(th)}</span>
            </li>
          ))}
        </ul>
      )}

      {(data.notes_th || []).length > 0 && (
        <button type="button" className="mt-3 flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="data-quality-toggle">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} รายละเอียดและรายชื่อผู้ตอบที่ถูกติดธง
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-3 text-xs text-gray-700">
          <ul className="list-disc space-y-1 pl-5">{(data.notes_th || []).map((n, i) => <li key={i}>{n}</li>)}</ul>
          {(data.flagged || []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600"><tr><th className="px-2 py-1.5">ลำดับ</th><th className="px-2 py-1.5">รหัส</th><th className="px-2 py-1.5">เวลา (วินาที)</th><th className="px-2 py-1.5">ข้อที่ใช้ได้</th><th className="px-2 py-1.5">ธง</th></tr></thead>
                <tbody>
                  {data.flagged.map((f) => (
                    <tr key={f.response_id || f.respondent_index} className="border-t">
                      <td className="px-2 py-1.5">{f.respondent_index + 1}</td>
                      <td className="max-w-[10rem] truncate px-2 py-1.5 font-mono">{f.respondent_id}</td>
                      <td className="px-2 py-1.5">{f.duration_sec}</td>
                      <td className="px-2 py-1.5">{f.tasks_usable}/{f.tasks_answered}</td>
                      <td className="px-2 py-1.5">{(f.flags || []).map((x) => FLAG_INFO[x]?.label || x).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default ConjointDataQualityCard;

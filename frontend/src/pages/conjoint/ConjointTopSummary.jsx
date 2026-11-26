/**
 * Top-of-page summary for the Results page: what matters most, how solid the sample is,
 * and what to do next — plus the blocking warnings (non-convergence, unestimable levels,
 * data-quality flags). Everything below is the evidence.
 */
import React from 'react';
import { Lightbulb, Users, CheckCircle, AlertCircle, ArrowRight, AlertTriangle, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { fmtNum, fmtInt, METHOD_INFO } from './cjFormat';

const Tile = ({ icon: Icon, tone, label, children, testId }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4" data-testid={testId}>
    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />{label}
    </p>
    {children}
  </div>
);

const ConjointTopSummary = ({
  n, adequacy, plainSummary, method, converged, excludedLevels, dqData, canSeeQuality,
  onGoTab, isOwnerOrAdmin, onOpenThesis,
}) => {
  const top = plainSummary?.top;
  const alerts = [];
  if (converged === false) {
    alerts.push({ key: 'conv', tone: 'red', text: `แบบจำลอง ${METHOD_INFO[method]?.short || method} ไม่ลู่เข้า (converged = false) — ตัวเลขด้านล่างอาจไม่น่าเชื่อถือ ห้ามนำไปรายงานจนกว่าจะเพิ่มข้อมูลหรือลองวิธีอื่น`, action: ['ดูรายละเอียด', 'academic'] });
  }
  if ((excludedLevels || []).length) {
    alerts.push({ key: 'excl', tone: 'amber', text: `ประมาณค่าไม่ได้ ${excludedLevels.length} ระดับ (${excludedLevels.slice(0, 3).join(', ')}${excludedLevels.length > 3 ? '…' : ''}) — ระดับเหล่านี้ไม่เคยถูกแสดงให้ผู้ตอบเห็น ไม่ใช่ว่า “ไม่มีผลต่อการเลือก”` });
  }
  if (canSeeQuality && dqData && dqData.n_flagged > 0) {
    alerts.push({ key: 'dq', tone: 'amber', text: `มีผู้ตอบ ${dqData.n_flagged} คนติดธงคุณภาพ (ตอบเร็ว/ส่งซ้ำ ฯลฯ) — ยังรวมอยู่ในการวิเคราะห์ ตรวจสอบก่อนสรุป` });
  }

  const steps = [];
  if (adequacy && (adequacy.key === 'blocked' || adequacy.key === 'weak')) steps.push(adequacy.action);
  if (converged === false) steps.push('เพิ่มผู้ตอบ หรือเปลี่ยนไปดูวิธีมาตรฐาน (MNL) ก่อน');
  if (adequacy && (adequacy.key === 'ok' || adequacy.key === 'strong')) {
    steps.push('ดู “ราคาที่ยอมจ่าย” และ “จำลองตลาด” เพื่อตัดสินใจกำหนดสินค้า');
    steps.push(isOwnerOrAdmin ? 'ดาวน์โหลดข้อมูลดิบ หรือเอกสารวิทยานิพนธ์ถ้าใช้ทำวิจัย' : 'ดูสรุปแล้วแชร์ผลกับทีม');
  }
  if (!steps.length) steps.push('ดูสรุปผลและหน้าเชิงวิชาการเพื่อประเมินความน่าเชื่อถือ');

  return (
    <Card className="mb-4 border-2 border-blue-300 bg-gradient-to-br from-blue-50/60 to-white p-4 sm:mb-6 sm:p-6" data-testid="conjoint-top-summary">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">สรุปด่วน</h2>
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-2" data-testid="top-alerts">
          {alerts.map((a) => (
            <div key={a.key} role="alert" data-testid={`top-alert-${a.key}`}
                 className={`flex items-start gap-2 rounded-lg border-2 px-3 py-2 text-sm ${a.tone === 'red' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
              {a.tone === 'red' ? <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
              <span className="flex-1">{a.text}</span>
              {a.action && <button type="button" className="whitespace-nowrap text-xs font-semibold underline" onClick={() => onGoTab(a.action[1])}>{a.action[0]}</button>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Tile icon={Lightbulb} tone="text-blue-600" label="สิ่งที่สำคัญที่สุด" testId="top-tile-main">
          {top ? (
            <p className="text-sm text-gray-800">
              ผู้ตอบให้ความสำคัญกับ <b className="text-blue-700">{top.name}</b> มากที่สุด ({fmtNum(top.importance, 1)}%){plainSummary.rows[1] && <> รองลงมาคือ <b>{plainSummary.rows[1].name}</b> ({fmtNum(plainSummary.rows[1].importance, 1)}%)</>}
              {!top.flat && top.best && <> — ระดับที่ถูกใจที่สุดคือ <b className="text-emerald-700">{top.best}</b></>}
            </p>
          ) : <p className="text-sm text-gray-500">ยังไม่มีผลให้สรุป</p>}
        </Tile>
        <Tile icon={Users} tone="text-indigo-600" label="ข้อมูลพอหรือยัง" testId="top-tile-sample">
          <p className="text-2xl font-black text-gray-900">{fmtInt(n)} <span className="text-sm font-medium text-gray-500">คน</span></p>
          {adequacy ? (
            <p className={`flex items-start gap-1 text-sm font-semibold ${adequacy.tone.text}`}>
              {adequacy.key === 'blocked' || adequacy.key === 'weak' ? <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" /> : <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
              {adequacy.title}
            </p>
          ) : <p className="text-sm text-gray-500">กำลังตรวจสอบ…</p>}
          {adequacy && <p className="mt-0.5 text-xs text-gray-500">{adequacy.detail}</p>}
        </Tile>
        <Tile icon={ArrowRight} tone="text-emerald-600" label="ควรทำอะไรต่อ" testId="top-tile-next">
          <ul className="space-y-1 text-sm text-gray-800">{steps.slice(0, 3).map((s, i) => <li key={i}>→ {s}</li>)}</ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50" onClick={() => onGoTab('market')} data-testid="top-go-market">ราคา &amp; จำลองตลาด</button>
            <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50" onClick={() => onGoTab('academic')} data-testid="top-go-academic">ตัวเลขทางสถิติ</button>
            {isOwnerOrAdmin && <button type="button" className="rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50" onClick={onOpenThesis} data-testid="top-go-thesis">Export วิทยานิพนธ์</button>}
          </div>
        </Tile>
      </div>
    </Card>
  );
};

export default ConjointTopSummary;

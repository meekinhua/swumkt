/**
 * Willingness-to-pay card — GET wtp. A refusal is an explanation, not an error:
 *   refused            price coefficient not negative / not significant
 *   not_applicable     no numeric price attribute
 *   insufficient_data  fewer than 30 respondents
 *   warning            price effect not linear — numbers shown with a caution
 */
import React, { useMemo, useState } from 'react';
import { Banknote, Info, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConjointFetch } from './useConjointFetch';
import { API } from '@/App';
import { fmtNum, fmtP, fmtInt } from './cjFormat';

const REFUSAL_TITLE = {
  refused: 'ยังประมาณราคาที่ยอมจ่ายไม่ได้จากข้อมูลชุดนี้',
  not_applicable: 'ศึกษานี้ไม่มีคุณลักษณะ “ราคา” ที่เป็นตัวเลข',
  insufficient_data: 'ข้อมูลยังไม่พอสำหรับประมาณราคาที่ยอมจ่าย',
};

const ConjointWtpCard = ({ studyId, token, study, filterQs }) => {
  const [priceAttr, setPriceAttr] = useState('');
  const url = `${API}/conjoint/studies/${studyId}/wtp?_=1${filterQs || ''}${priceAttr ? `&price_attribute_id=${encodeURIComponent(priceAttr)}` : ''}`;
  const { data, loading, error, refetch } = useConjointFetch(url, { token, enabled: !!studyId });

  const groups = useMemo(() => {
    const m = new Map();
    (data?.levels || []).forEach((l) => {
      if (!m.has(l.attribute_id)) m.set(l.attribute_id, { name: l.attribute, rows: [] });
      m.get(l.attribute_id).rows.push(l);
    });
    return [...m.values()];
  }, [data]);

  const status = data?.status;

  return (
    <Card className="mb-6 border-2 border-emerald-200 p-4 sm:p-6" data-testid="wtp-card" data-status={status || ''}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600"><Banknote className="h-5 w-5 text-white" aria-hidden="true" /></span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">ราคาที่ผู้ตอบยอมจ่ายเพิ่ม (WTP)</h2>
            <p className="text-sm text-gray-600">แต่ละระดับ “คุ้มกับราคาเท่าไร” เมื่อเทียบกับระดับอ้างอิงของคุณลักษณะนั้น</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={priceAttr} onChange={(e) => setPriceAttr(e.target.value)} className="rounded-lg border-2 border-gray-300 px-2 py-1.5 text-xs" aria-label="เลือกคุณลักษณะราคา" data-testid="wtp-price-attr">
            <option value="">ตรวจหาคุณลักษณะราคาอัตโนมัติ</option>
            {(study?.attributes || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={refetch} aria-label="คำนวณใหม่"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading && <p className="py-6 text-center text-sm text-gray-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังคำนวณช่วงความเชื่อมั่น (Krinsky–Robb)…</p>}
      {error && !loading && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}

      {data && !loading && ['refused', 'not_applicable', 'insufficient_data'].includes(status) && (
        <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-4" data-testid="wtp-refusal">
          <p className="flex items-start gap-2 text-sm font-semibold text-sky-900"><Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />{REFUSAL_TITLE[status]}</p>
          <p className="mt-2 text-sm leading-relaxed text-sky-900">{data.reason_th}</p>
          {status === 'refused' && (
            <p className="mt-2 text-xs text-sky-800">
              ระบบไม่แสดงตัวเลข WTP เพราะการหารด้วยค่าสัมประสิทธิ์ราคาที่ใกล้ศูนย์จะให้ตัวเลขที่ไม่มีความหมาย
              {data.price_coefficient != null && <> (ค่าสัมประสิทธิ์ราคา = {fmtNum(data.price_coefficient, 4)}, p = {fmtP(data.price_p_value)})</>}
              — ลองเพิ่มจำนวนผู้ตอบ หรือปรับช่วงราคาในการออกแบบรอบหน้า
            </p>
          )}
          {status === 'not_applicable' && <p className="mt-2 text-xs text-sky-800">ถ้ามีคุณลักษณะราคาที่ตั้งชื่ออื่น ให้เลือกจากรายการด้านบน (ระดับต้องเป็นตัวเลขทั้งหมด เช่น “59 บาท”)</p>}
        </div>
      )}

      {data && !loading && ['ok', 'warning'].includes(status) && (
        <>
          {(data.warnings_th || []).length > 0 && (
            <div className="mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="wtp-warnings">
              <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" />ข้อควรระวัง</p>
              <ul className="list-disc space-y-1 pl-5 text-xs">{data.warnings_th.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm" data-testid="wtp-table">
              <thead className="bg-emerald-50 text-left text-xs text-gray-700">
                <tr><th className="px-3 py-2">คุณลักษณะ</th><th className="px-3 py-2">ระดับ</th><th className="px-3 py-2 text-right">ยอมจ่ายเพิ่ม</th><th className="px-3 py-2 text-right">ช่วงเชื่อมั่น 95%</th><th className="px-3 py-2">ความหมาย</th></tr>
              </thead>
              <tbody>
                {groups.map((g) => g.rows.map((l, i) => (
                  <tr key={`${l.attribute_id}-${l.level_id}`} className="border-t">
                    {i === 0 && <td rowSpan={g.rows.length} className="bg-gray-50 px-3 py-2 align-top font-semibold text-gray-900">{g.name}</td>}
                    <td className="px-3 py-2 text-gray-800">{l.level}</td>
                    {l.is_reference ? (
                      <td colSpan={3} className="px-3 py-2 text-xs text-gray-500">ระดับอ้างอิง — WTP = 0 (ใช้เป็นเกณฑ์เปรียบเทียบ ไม่ใช่ผลที่ประมาณได้)</td>
                    ) : l.wtp == null ? (
                      <td colSpan={3} className="px-3 py-2 text-xs text-amber-700">{l.note_th || 'ประมาณค่าไม่ได้'}</td>
                    ) : (
                      <>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${l.wtp >= 0 ? 'text-green-700' : 'text-red-700'}`}>{l.wtp >= 0 ? '+' : ''}{fmtNum(l.wtp, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">[{fmtNum(l.ci_low, 1)}, {fmtNum(l.ci_high, 1)}]</td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {l.ci_excludes_zero ? 'ต่างจากระดับอ้างอิงอย่างชัดเจน' : 'ยังสรุปไม่ได้ว่าต่างจากระดับอ้างอิง (ช่วงคร่อม 0)'}
                          {l.extrapolated && <span className="ml-1 text-amber-700">· เกินช่วงราคาที่ทดสอบ</span>}
                        </td>
                      </>
                    )}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-1 text-xs text-gray-600">
            <p>
              หน่วยเป็นสกุลเงินเดียวกับคุณลักษณะ “{data.price_attribute_name}” · ค่าสัมประสิทธิ์ราคา {fmtNum(data.price_coefficient, 4)} (p {fmtP(data.price_p_value)})
              {data.linearity_test?.tested && <> · ทดสอบความเป็นเส้นตรงของราคา p = {fmtP(data.linearity_test.p_value)} ({data.linearity_test.rejected ? 'ไม่เป็นเส้นตรง' : 'ใช้เส้นตรงได้'})</>}
            </p>
            <p>ช่วงเชื่อมั่นคำนวณด้วย {data.ci_method} · ผู้ตอบ {fmtInt(data.respondent_count)} คน · WTP ไม่ใช่ราคาขายที่แนะนำ แต่เป็นมูลค่าที่ผู้ตอบให้ในสถานการณ์สมมติ</p>
          </div>
        </>
      )}
    </Card>
  );
};

export default ConjointWtpCard;

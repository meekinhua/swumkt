import React, { useMemo } from 'react';
import { Info } from 'lucide-react';

/**
 * Per-respondent heterogeneity insights derived from HB individual posteriors.
 *
 * The HB result includes:
 *   • individual_quantiles[varname] = {q10, q50, q90, pct_positive}
 *   • individual_posteriors_sample[] = first 50 respondents' β vectors
 *
 * We surface the two most useful slices for marketers:
 *   1. "Who agrees?" — pct_positive per level (how unanimous the preference is)
 *   2. "Range of taste" — q10 vs q90 spread per level (heterogeneity magnitude)
 */
const HBIndividualInsights = ({ hbResult, study }) => {
  const quantiles = hbResult?.individual_quantiles;
  if (!quantiles || !study?.attributes) return null;

  // Reshape into a per-attribute table where reference level is highlighted.
  const tables = useMemo(() => {
    return study.attributes.map(attr => {
      const rows = (attr.levels || []).map(lvl => {
        const key = `${attr.name}_${lvl.value}`;
        const q = quantiles[key];
        if (!q) {
          // Reference level — no dummy created for it, but include row for completeness.
          return {
            value: lvl.value,
            isReference: true,
            q10: 0, q50: 0, q90: 0, pctPositive: null,
          };
        }
        return {
          value: lvl.value,
          isReference: false,
          q10: q.q10, q50: q.q50, q90: q.q90,
          pctPositive: q.pct_positive,
        };
      });
      return { id: attr.id, name: attr.name, rows };
    });
  }, [study, quantiles]);

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden" data-testid="hb-individual-insights">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-pink-50">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Info className="w-5 h-5 text-purple-700"/>
          ความหลากหลายของรสนิยม (Individual-Level Heterogeneity)
        </h3>
        <p className="text-xs text-gray-600 mt-1">
          จาก posterior ของแต่ละผู้ตอบ (Train 2009 Ch. 11.5) — ดูว่ากลุ่มเป้าหมายเห็นพ้องหรือมีความเห็นต่างกันแค่ไหน
        </p>
      </div>
      <div className="p-4 space-y-5">
        {tables.map(t => (
          <div key={t.id}>
            <div className="text-sm font-bold text-gray-800 mb-2">{t.name}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">ระดับ</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">% ผู้ตอบที่ชอบ<br/><span className="text-[10px] font-normal text-gray-500">(β &gt; 0)</span></th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">Q10</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">Q50<br/><span className="text-[10px] font-normal text-gray-500">(median)</span></th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">Q90</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">ช่วง<br/><span className="text-[10px] font-normal text-gray-500">(Q90-Q10)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => {
                    if (r.isReference) {
                      return (
                        <tr key={i} className="border-t bg-gray-50">
                          <td className="px-3 py-2">
                            {r.value} <span className="text-[10px] text-gray-500 font-mono ml-1">(reference)</span>
                          </td>
                          <td colSpan={5} className="px-3 py-2 text-right text-gray-400 italic">
                            อ้างอิง (β = 0)
                          </td>
                        </tr>
                      );
                    }
                    const spread = r.q90 - r.q10;
                    const consensusLevel =
                      r.pctPositive >= 80 ? { label: 'ส่วนใหญ่ชอบ', color: 'text-emerald-700 bg-emerald-50' } :
                      r.pctPositive <= 20 ? { label: 'ส่วนใหญ่ไม่ชอบ', color: 'text-rose-700 bg-rose-50' } :
                      r.pctPositive >= 45 && r.pctPositive <= 55 ? { label: 'แบ่งครึ่ง', color: 'text-amber-700 bg-amber-50' } :
                      null;
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{r.value}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {r.pctPositive.toFixed(1)}%
                          {consensusLevel && (
                            <span className={`ml-2 px-1.5 py-0.5 text-[10px] rounded ${consensusLevel.color}`}>
                              {consensusLevel.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">{r.q10.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{r.q50.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">{r.q90.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {spread.toFixed(3)}
                          {spread > 0.8 && <span className="ml-1 text-[10px] text-purple-700">หลากหลายมาก</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <div className="px-6 py-3 bg-purple-50 border-t border-purple-100 text-xs text-purple-900">
        <b>วิธีอ่าน:</b> Q50 = ค่ากลางความชอบของกลุ่ม, ช่วง Q10-Q90 ยิ่งกว้างยิ่งหลากหลาย,
        % ผู้ตอบที่ชอบ &gt; 50 = ส่วนใหญ่เห็นพ้องว่าระดับนี้ดีกว่าระดับอ้างอิง
      </div>
    </div>
  );
};

export default HBIndividualInsights;

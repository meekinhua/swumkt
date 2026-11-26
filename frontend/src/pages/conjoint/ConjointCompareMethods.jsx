import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/App';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { Loader2, AlertCircle, CheckCircle2, Info, HelpCircle } from 'lucide-react';

/**
 * Side-by-side comparison of all four estimation methods on the same study.
 * Fetches in parallel via the existing /statistical-analysis endpoint (which
 * is also cached server-side), so flipping into this tab costs at most one
 * round-trip per method on first open.
 */
const METHODS = [
  { id: 'mnl',                label: 'MNL',         full: 'Multinomial Logit',              accent: '#2563eb', family: 'choice' },
  { id: 'mixed_logit',        label: 'Mixed Logit', full: 'Random Parameters Logit (SMLE)', accent: '#7c3aed', family: 'choice' },
  { id: 'hierarchical_bayes', label: 'HB',          full: 'Hierarchical Bayes (Panel MXL)', accent: '#db2777', family: 'choice' },
  { id: 'linear_regression',  label: 'OLS',         full: 'Linear Probability Model',       accent: '#059669', family: 'ols' },
];

// Only discrete-choice models share a likelihood scale. OLS maximises a Gaussian
// likelihood over a 0/1 outcome, so its LL / AIC / BIC are NOT on the same scale
// and must never be ranked against the logit family.
const CHOICE_METHODS = METHODS.filter(m => m.family === 'choice');

// Lower = fewer parameters / easier to explain. Used to break a statistical tie
// in favour of the simpler model.
const SIMPLICITY = { mnl: 0, mixed_logit: 1, hierarchical_bayes: 2 };

const fmt = (v, d = 3) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  return v.toFixed(d);
};
const fmtInt = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : String(Math.round(v));

// McFadden's own published bands. Deliberately NOT rendered as a percentage:
// rho-squared is not a share of variance explained, and showing "19.2%" invites
// exactly the OLS-style reading the statistic does not support.
const RHO_BANDS = [
  { max: 0.10, label: 'ต่ำ',      cls: 'bg-red-100 text-red-800' },
  { max: 0.20, label: 'พอใช้',    cls: 'bg-amber-100 text-amber-800' },
  { max: 0.30, label: 'ดี',       cls: 'bg-lime-100 text-lime-800' },
  { max: 0.40, label: 'ดีมาก',    cls: 'bg-emerald-100 text-emerald-800' },
  { max: Infinity, label: 'ดีเยี่ยม', cls: 'bg-emerald-200 text-emerald-900' },
];
const rhoBand = (v) => (typeof v === 'number' ? RHO_BANDS.find(b => v < b.max) : null);

const ConjointCompareMethods = ({ studyId, study, token, countingResults, filter }) => {
  const [results, setResults] = useState({}); // method_id -> response.results
  const [loading, setLoading] = useState({}); // method_id -> bool
  const [errors, setErrors] = useState({});   // method_id -> string

  // Build the same filter querystring suffix the parent page uses, so the
  // Compare tab always re-aggregates against the active slice.
  const buildQs = () => {
    if (!filter) return '';
    const parts = [];
    if (filter.from) parts.push(`from=${encodeURIComponent(filter.from)}`);
    if (filter.to)   parts.push(`to=${encodeURIComponent(filter.to)}`);
    const segs = Object.fromEntries(
      Object.entries(filter.segments || {}).filter(([, vs]) => (vs || []).length)
    );
    if (Object.keys(segs).length) {
      parts.push(`segments=${encodeURIComponent(JSON.stringify(segs))}`);
    }
    return parts.length ? `&${parts.join('&')}` : '';
  };
  const filterKey = JSON.stringify({
    from: filter?.from || '', to: filter?.to || '', segments: filter?.segments || {}
  });

  useEffect(() => {
    if (!studyId) return;
    let cancelled = false;
    // The Results page is also reachable on a PUBLIC route, where there is no
    // token. Send the header only when we have one — the backend allows
    // unauthenticated reads for studies flagged is_public_result.
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const initLoading = Object.fromEntries(METHODS.map(m => [m.id, true]));
    setLoading(initLoading);
    setResults({});
    setErrors({});
    const qs = buildQs();

    METHODS.forEach(m => {
      axios.get(`${API}/conjoint/studies/${studyId}/statistical-analysis?method=${m.id}${qs}`, { headers })
        .then(r => {
          if (cancelled) return;
          if (r.data?.status === 'success') {
            setResults(prev => ({ ...prev, [m.id]: r.data.results }));
          } else {
            setErrors(prev => ({ ...prev, [m.id]: r.data?.message || 'ข้อมูลไม่พอ' }));
          }
        })
        .catch(e => {
          if (cancelled) return;
          setErrors(prev => ({ ...prev, [m.id]: e.response?.data?.detail || e.message }));
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(prev => ({ ...prev, [m.id]: false }));
        });
    });

    return () => { cancelled = true; };
  }, [studyId, token, filterKey]); // eslint-disable-line

  // Build a single grouped bar dataset: x-axis = attribute, one bar per method.
  const importanceData = useMemo(() => {
    if (!study?.attributes) return [];
    return study.attributes.map(attr => {
      const row = { name: attr.name };
      METHODS.forEach(m => {
        const r = results[m.id];
        const imp = r?.importance_scores?.[attr.id];
        // Importance scores may be either a plain number or {name, importance}
        const val = imp?.importance ?? imp;
        row[m.label] = typeof val === 'number' ? val : 0;
      });
      // Counting method (from non-statistical /results endpoint, passed in via prop)
      const cImp = countingResults?.importance_scores?.[attr.id];
      const cVal = cImp?.importance ?? cImp;
      if (typeof cVal === 'number') {
        row['Counting'] = cVal;
      }
      return row;
    });
  }, [study, results, countingResults]);

  const allLoading = Object.values(loading).every(Boolean) && Object.keys(loading).length > 0;

  /**
   * Which model should the researcher actually report?
   *
   * NOT the highest log-likelihood. LL is weakly increasing in the number of
   * parameters, and Mixed Logit / HB literally nest MNL (MNL is the special case
   * where every taste SD is 0), so the richer model essentially always "wins" on
   * raw LL whether or not the extra heterogeneity is real. Ranking by LL just
   * relabels "most parameters" as "best fit".
   *
   * BIC is the criterion that answers the question being asked -- it charges
   * log(n) per parameter, so a richer model only wins when the extra structure
   * pays for itself. Backend now puts MNL's BIC on the same n (choice situations)
   * that xlogit uses for Mixed Logit / HB, so the column is finally comparable.
   *
   * Raftery (1995) grades the BIC gap: <2 is not worth a mention, 2-6 positive,
   * 6-10 strong, >10 very strong. We surface that instead of a bare winner,
   * because a 1-point gap is noise -- Mixed Logit and HB differ only in their
   * simulation draw count (200 vs 300), so their gap is partly Monte-Carlo error.
   */
  const ranking = useMemo(() => {
    const rows = CHOICE_METHODS
      .map(m => ({ m, bic: results[m.id]?.bic, ll: results[m.id]?.log_likelihood }))
      .filter(x => typeof x.bic === 'number')
      .sort((a, b) => a.bic - b.bic);
    if (!rows.length) return null;
    const best = rows[0];

    // Raftery: models within 2 BIC of the leader are not distinguishable. Take
    // that whole TIED SET and recommend the simplest model inside it.
    //
    // Comparing rows[0] to rows[1] and then hardcoding MNL on a tie does not
    // work here, because Mixed Logit and HB are the same estimator differing
    // only in draw count (200 vs 300): their BIC gap is Monte-Carlo noise,
    // measured at 0.01–0.23 across seeds. That gap is always < 2, so the tie
    // branch fired on essentially every study and the recommendation collapsed
    // to the constant "MNL" — even on data with strong genuine heterogeneity
    // where MNL was 70–270 BIC points WORSE. Anchoring the tie set to the
    // leader instead means MNL can only be recommended when MNL is actually
    // within 2 BIC of the best model.
    const tied = rows.filter(r => r.bic - best.bic < 2);
    const pick = tied.reduce((a, b) => (SIMPLICITY[b.m.id] < SIMPLICITY[a.m.id] ? b : a));

    // Strength = the gap from the leader to the first model that IS
    // distinguishable from it, not to whatever happens to sort second.
    const firstDistinct = rows.find(r => r.bic - best.bic >= 2);
    const delta = firstDistinct ? firstDistinct.bic - best.bic : null;
    const strength = delta === null
      ? 'inconclusive'
      : delta < 6 ? 'positive' : delta < 10 ? 'strong' : 'very strong';

    return { rows, best, pick, tied, runnerUp: firstDistinct, delta, strength };
  }, [results]);

  // A model that failed to load is never in `rows`, so it can never be in
  // `tied` — the badge cannot land on a row showing an error.
  const bestId = ranking?.pick?.m?.id;

  // Data-integrity signals the backend now reports instead of absorbing silently.
  // Both mean the same thing to the researcher: the study was edited after the
  // design was generated, so some levels are unestimable and the methods are no
  // longer describing identical data. The cure is to regenerate the design.
  const integrity = useMemo(() => {
    const ols = results.linear_regression;
    const excluded = ols?.excluded_levels || [];
    const unmapped = Object.values(ols?.unmapped_level_rows || {})
      .reduce((a, b) => a + b, 0);
    return (excluded.length || unmapped) ? { excluded, unmapped } : null;
  }, [results]);

  // Mixed Logit / HB now constrain coefficients whose taste SD is not
  // distinguishable from zero. Worth saying out loud when NOTHING varied.
  const heterogeneity = useMemo(() => {
    const r = results.mixed_logit;
    if (!r || r.heterogeneity_detected === undefined) return null;
    return {
      detected: r.heterogeneity_detected,
      random: r.random_vars || [],
      fixed: r.fixed_vars || [],
      alpha: r.sd_alpha,
    };
  }, [results]);

  return (
    <div className="space-y-6" data-testid="conjoint-compare-methods">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-1 text-[10px] tracking-widest bg-white/15 rounded font-mono">
            METHOD COMPARISON
          </span>
          {bestId && (
            <span className="px-2 py-1 text-[10px] tracking-widest bg-emerald-400/20 text-emerald-200 rounded font-mono">
              แนะนำ: {METHODS.find(m => m.id === bestId)?.label}
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold">เปรียบเทียบวิธีการวิเคราะห์ทั้งหมด</h2>
        <p className="text-sm text-slate-300 mt-1">
          MNL · Mixed Logit · Hierarchical Bayes · OLS — ดูคู่กันบน study เดียวกันเพื่อเลือกวิธีที่เหมาะกับงาน
        </p>
      </div>

      {/* Data-integrity warning — a study edited after its design was generated
          produces levels no method can estimate. Say so before the numbers. */}
      {integrity && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4" data-testid="compare-integrity-warning">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-bold mb-1">ข้อมูลกับดีไซน์ไม่ตรงกัน — ควรสร้างชุดคำถามใหม่</p>
              <ul className="list-disc ml-4 space-y-0.5 text-amber-800">
                {integrity.excluded.length > 0 && (
                  <li>
                    มี <b>{integrity.excluded.length}</b> ระดับ (level) ที่ไม่เคยถูกแสดงให้ผู้ตอบเห็น
                    จึงประมาณค่าไม่ได้ และถูกตัดออกจากแบบจำลอง
                  </li>
                )}
                {integrity.unmapped > 0 && (
                  <li>
                    มี <b>{integrity.unmapped}</b> แถวที่อ้างถึงระดับซึ่งไม่มีอยู่ในการตั้งค่าปัจจุบันแล้ว
                    — OLS นับรวมเข้ากับ reference ส่วน MNL/Mixed/HB แยกเป็นกลุ่มของตัวเอง
                    <b> ตัวเลขสองฝั่งจึงไม่ได้มาจากข้อมูลชุดเดียวกัน</b>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs">
                เกิดจากการแก้คุณลักษณะ/ระดับ หลังจากสร้างชุดคำถามไปแล้ว
                → ไปที่หน้าออกแบบแล้วกดสร้างชุดคำถามใหม่ เพื่อให้ทุกวิธีวิเคราะห์ข้อมูลชุดเดียวกัน
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plain-language verdict — the answer first, the table second. */}
      {ranking && (
        <div className="bg-white border-2 border-emerald-200 rounded-lg p-5" data-testid="compare-verdict">
          <h3 className="text-base font-bold flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            สรุปสั้นๆ — ควรรายงานผลด้วยวิธีไหน
          </h3>
          {ranking.tied.length > 1 ? (
            <p className="text-sm text-gray-700 leading-relaxed">
              <b>ใช้ {ranking.pick.m.full}</b> — วิธีที่ได้ผลดีที่สุดมี{' '}
              <b>{ranking.tied.length}</b> วิธี ({ranking.tied.map(r => r.m.label).join(' / ')}){' '}
              ที่คะแนน BIC ห่างกันไม่ถึง 2 จุด จึงถือว่า <b>ไม่ต่างกันอย่างมีความหมาย</b>{' '}
              เมื่อผลเท่ากัน ให้เลือกแบบที่ <b>เรียบง่ายที่สุด</b> ในกลุ่มนั้น เพราะอธิบายง่ายและใช้พารามิเตอร์น้อยกว่า
              {ranking.delta !== null && (
                <> · กลุ่มนี้นำวิธีถัดไป ({ranking.runnerUp?.m.label}) อยู่ <b>{fmt(ranking.delta, 1)}</b> จุด</>
              )}
            </p>
          ) : ranking.delta === null ? (
            <p className="text-sm text-gray-700 leading-relaxed">
              <b>ใช้ {ranking.pick.m.full}</b> — ได้ค่า BIC ต่ำสุด (ยังไม่มีวิธีอื่นให้เทียบในรอบนี้)
            </p>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">
              <b>ใช้ {ranking.pick.m.full}</b> — ได้ค่า BIC ต่ำสุด และนำวิธีถัดไป ({ranking.runnerUp?.m.label}) อยู่{' '}
              <b>{fmt(ranking.delta, 1)}</b> จุด ซึ่งเป็นหลักฐานระดับ <b>{
                { positive: 'พอใช้', strong: 'ชัดเจน', 'very strong': 'ชัดเจนมาก' }[ranking.strength]
              }</b> ว่าแบบจำลองนี้เหมาะกว่าจริง
            </p>
          )}
          <div className="mt-3 pt-3 border-t text-xs text-gray-600 flex gap-2">
            <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
            <span>
              <b>ทำไมไม่ดูที่ Log-likelihood?</b> เพราะ LL จะสูงขึ้นเสมอเมื่อใส่พารามิเตอร์เพิ่ม
              และ Mixed Logit / HB ครอบ MNL อยู่แล้ว (MNL คือกรณีที่ค่าความต่างระหว่างคน = 0)
              ดังนั้นถ้าตัดสินด้วย LL ดิบ แบบที่ซับซ้อนกว่าจะ &quot;ชนะ&quot; แทบทุกครั้งแม้ความต่างนั้นจะไม่จริง
              — <b>BIC</b> แก้ปัญหานี้โดยหักคะแนนตามจำนวนพารามิเตอร์
            </span>
          </div>
        </div>
      )}

      {/* Fit metrics table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ดัชนีคุณภาพแบบจำลอง (Model Fit)
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            <b>BIC ต่ำกว่า = ดีกว่า</b> (ใช้ตัดสิน) · McFadden ρ² 0.2–0.4 = ฟิตดีถึงดีมาก ·
            LL ใช้ดูประกอบเท่านั้น ห้ามใช้จัดอันดับข้ามแบบจำลอง
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="compare-fit-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Method</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Log-likelihood</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">McFadden ρ²</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">ρ² (ปรับแล้ว)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">AIC</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">BIC ↓</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">พารามิเตอร์</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">ชุดคำถาม</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map(m => {
                const r = results[m.id];
                const isLoading = loading[m.id];
                const err = errors[m.id];
                const isBest = bestId === m.id;
                const isOls = m.family === 'ols';
                const band = rhoBand(r?.pseudo_r_squared);
                return (
                  <tr key={m.id}
                      data-testid={`compare-row-${m.id}`}
                      className={`border-t ${isBest ? 'bg-emerald-50/60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-6 rounded" style={{ background: m.accent }} />
                        <div>
                          <div className="font-bold">{m.label}</div>
                          <div className="text-[11px] text-gray-500">{m.full}</div>
                        </div>
                        {isBest && (
                          <span className="ml-2 text-[10px] font-mono px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded">
                            แนะนำ
                          </span>
                        )}
                      </div>
                    </td>
                    {isLoading ? (
                      <td colSpan={7} className="px-4 py-3 text-center text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        กำลังคำนวณ…
                      </td>
                    ) : err ? (
                      <td colSpan={7} className="px-4 py-3 text-center text-amber-700">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        {err}
                      </td>
                    ) : isOls ? (
                      /* OLS maximises a different likelihood, so its LL/AIC/BIC are
                         not on the logit scale. Showing them in these columns would
                         invite a comparison that is not defined. */
                      <td colSpan={7} className="px-4 py-3 text-xs text-gray-500">
                        R² = <span className="font-mono">{fmt(r?.r_squared, 3)}</span>
                        {' · '}Adj. R² = <span className="font-mono">{fmt(r?.adj_r_squared, 3)}</span>
                        <span className="ml-2 text-gray-400">
                          — เป็น baseline เชิงพรรณนา วัดคนละสเกลกับกลุ่ม logit จึงเทียบ LL/AIC/BIC กันไม่ได้
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-right font-mono">{fmt(r?.log_likelihood, 2)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono">{fmt(r?.pseudo_r_squared, 3)}</span>
                          {band && (
                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${band.cls}`}>
                              {band.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                          {fmt(r?.pseudo_r_squared_adj, 3)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmt(r?.aic, 1)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${isBest ? 'font-bold text-emerald-700' : ''}`}>
                          {fmt(r?.bic, 1)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">{fmtInt(r?.n_parameters)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                          {fmtInt(r?.n_choice_situations ?? r?.n_observations)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t text-[11px] text-gray-500 space-y-1">
          <p>
            AIC/BIC ของทุกแบบจำลอง logit คิดฐาน n = จำนวน<b>ชุดคำถาม</b> (choice situations) เท่ากัน
            จึงนำมาเทียบกันได้ · McFadden ρ² ไม่ใช่สัดส่วนความแปรปรวนแบบ R² ของ OLS —
            ค่า 0.2–0.4 เทียบเท่า R² ของ OLS ราว 0.7–0.9
          </p>
          <p>
            <b>ρ² (ปรับแล้ว)</b> หักคะแนนตามจำนวนพารามิเตอร์ ใช้เมื่อเทียบแบบจำลองที่มีขนาดต่างกัน —
            ρ² ธรรมดาจะสูงขึ้นเรื่อยๆ เมื่อใส่ตัวแปรเพิ่ม เหมือน R² ที่ยังไม่ปรับของ OLS
          </p>
        </div>
      </div>

      {/* Importance grouped bar chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          ความสำคัญของคุณลักษณะ (Attribute Importance) — เทียบทุกวิธี
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          ค่าใกล้กัน = วิธีให้ผลสอดคล้องกัน (ผลลัพธ์น่าเชื่อถือ). ค่าต่างกันมาก = ลองดูเหตุผลใน McFadden ρ² ก่อนเลือกใช้
        </p>
        {allLoading ? (
          <div className="text-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin inline mr-2" /> กำลังคำนวณทุกวิธี…
          </div>
        ) : importanceData.length === 0 ? (
          <div className="text-center py-10 text-gray-400">ยังไม่มีข้อมูลพอที่จะเปรียบเทียบ</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(280, 60 * importanceData.length + 80)}>
            <BarChart
              data={importanceData}
              layout="vertical"
              margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Legend />
              {countingResults?.importance_scores && (
                <Bar dataKey="Counting" fill="#94a3b8" />
              )}
              {METHODS.map(m => (
                <Bar key={m.id} dataKey={m.label} fill={m.accent} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        {results.hierarchical_bayes?.importance_basis === 'individual' && (
          <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t">
            หมายเหตุ: ค่าของ HB คำนวณจาก<b>ความสำคัญของผู้ตอบรายคนแล้วเฉลี่ย</b> (มาตรฐาน Sawtooth)
            ไม่ใช่คำนวณจากค่าเฉลี่ยรวม — สองวิธีนี้จะต่างกันเมื่อผู้ตอบมีความชอบ<b>คนละทิศทาง</b>
            เพราะค่าบวกลบจะหักล้างกันในค่าเฉลี่ยรวม
          </p>
        )}
      </div>

      {/* Heterogeneity readout — which coefficients earned the right to vary. */}
      {heterogeneity && (
        <div className="bg-white border rounded-lg p-5" data-testid="compare-heterogeneity">
          <h3 className="text-base font-bold flex items-center gap-2 mb-2">
            <Info className="w-5 h-5 text-violet-600" />
            คนตอบมีรสนิยมต่างกันจริงไหม (taste heterogeneity)
          </h3>
          {heterogeneity.detected ? (
            <p className="text-sm text-gray-700 leading-relaxed">
              มี <b>{heterogeneity.random.length}</b> ตัวแปรที่ความชอบ<b>ต่างกันจริงระหว่างคน</b>
              {heterogeneity.fixed.length > 0 && (
                <> ส่วนอีก <b>{heterogeneity.fixed.length}</b> ตัวถูกตรึงเป็นค่าคงที่
                เพราะความต่างที่วัดได้ไม่มีนัยสำคัญ (α = {heterogeneity.alpha})</>
              )}
              {' '}— ถ้าปล่อยให้ทุกตัวแปรผันได้หมดทั้งที่ข้อมูลไม่รองรับ
              แบบจำลองจะเปลืองพารามิเตอร์และทำให้ค่าความคลาดเคลื่อนบานปลาย
            </p>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">
              <b>ไม่พบความต่างที่มีนัยสำคัญ</b> — ผู้ตอบให้ค่ากับคุณลักษณะไปในทางเดียวกัน
              กรณีนี้ <b>ควรรายงาน MNL</b> เพราะ Mixed Logit/HB กำลังประมาณความผันแปรที่ข้อมูลไม่ยืนยัน
            </p>
          )}
          {heterogeneity.fixed.length > 0 && (
            <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t">
              ตรึงเป็นค่าคงที่: {heterogeneity.fixed.join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Guidance */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-bold mb-2">เลือกใช้ method ไหนดี?</p>
            <ul className="space-y-1 text-amber-800 list-disc ml-4">
              <li><b>MNL</b> — ตั้งต้นทุกงาน. รายงานบนงานวิจัยส่วนใหญ่</li>
              <li><b>Mixed Logit</b> — ใช้เมื่อ BIC ต่ำกว่า MNL เกิน 2 จุด แสดงว่ามี taste heterogeneity จริง</li>
              <li><b>HB</b> — เมื่อต้องการ individual-level utilities เพื่อ segmentation/simulator</li>
              <li><b>OLS</b> — baseline เพื่อดู signal เร็วๆ ไม่ใช่สำหรับ inference จริง</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConjointCompareMethods;

import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/App';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell
} from 'recharts';
import { Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';

/**
 * Side-by-side comparison of all four estimation methods on the same study.
 * Fetches in parallel via the existing /statistical-analysis endpoint (which
 * is also cached server-side), so flipping into this tab costs at most one
 * round-trip per method on first open.
 */
const METHODS = [
  { id: 'mnl',                  label: 'MNL',          full: 'Multinomial Logit',                 accent: '#2563eb' },
  { id: 'mixed_logit',          label: 'Mixed Logit',  full: 'Random Parameters Logit (SMLE)',    accent: '#7c3aed' },
  { id: 'hierarchical_bayes',   label: 'HB',           full: 'Hierarchical Bayes (Panel MXL)',    accent: '#db2777' },
  { id: 'linear_regression',    label: 'OLS',          full: 'Linear Probability Model',          accent: '#059669' },
];

const fmt = (v, d = 3) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v !== 'number') return String(v);
  return v.toFixed(d);
};
const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : `${(v * 100).toFixed(2)}%`;
const fmtInt = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : String(Math.round(v));

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
    if (!studyId || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
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
  const anyError = Object.keys(errors).length > 0;
  const bestByLL = useMemo(() => {
    const fit = METHODS
      .map(m => ({ m, ll: results[m.id]?.log_likelihood }))
      .filter(x => typeof x.ll === 'number');
    if (!fit.length) return null;
    return fit.reduce((a, b) => (b.ll > a.ll ? b : a));
  }, [results]);

  return (
    <div className="space-y-6" data-testid="conjoint-compare-methods">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-1 text-[10px] tracking-widest bg-white/15 rounded font-mono">
            METHOD COMPARISON
          </span>
          {bestByLL && (
            <span className="px-2 py-1 text-[10px] tracking-widest bg-emerald-400/20 text-emerald-200 rounded font-mono">
              BEST FIT: {bestByLL.m.label}
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold">เปรียบเทียบวิธีการวิเคราะห์ทั้งหมด</h2>
        <p className="text-sm text-slate-300 mt-1">
          MNL · Mixed Logit · Hierarchical Bayes · OLS — ดูคู่กันบน study เดียวกันเพื่อเลือกวิธีที่เหมาะกับงาน
        </p>
      </div>

      {/* Fit metrics table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ดัชนีคุณภาพแบบจำลอง (Model Fit)
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            LL สูงกว่า (เลขติดลบใกล้ 0) = ฟิตดีกว่า · AIC/BIC ต่ำกว่า = ดีกว่า · Pseudo R² 0.2-0.4 = ดีมาก
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="compare-fit-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Method</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Log-likelihood</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Pseudo R²</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">AIC</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">BIC</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">N obs</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map(m => {
                const r = results[m.id];
                const isLoading = loading[m.id];
                const err = errors[m.id];
                const isBest = bestByLL?.m.id === m.id;
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
                            BEST
                          </span>
                        )}
                      </div>
                    </td>
                    {isLoading ? (
                      <td colSpan={5} className="px-4 py-3 text-center text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        กำลังคำนวณ…
                      </td>
                    ) : err ? (
                      <td colSpan={5} className="px-4 py-3 text-center text-amber-700">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        {err}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-right font-mono">{fmt(r?.log_likelihood, 2)}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {r?.pseudo_r_squared != null
                            ? fmtPct(r.pseudo_r_squared)
                            : (r?.r_squared != null ? fmtPct(r.r_squared) : '—')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmt(r?.aic, 1)}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmt(r?.bic, 1)}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtInt(r?.n_observations)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Importance grouped bar chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          ความสำคัญของคุณลักษณะ (Attribute Importance) — เทียบทุกวิธี
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          ค่าใกล้กัน = วิธีให้ผลสอดคล้องกัน (ผลลัพธ์น่าเชื่อถือ). ค่าต่างกันมาก = ลองดูเหตุผลใน Pseudo R² ก่อนเลือกใช้
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
      </div>

      {/* Guidance */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-bold mb-2">เลือกใช้ method ไหนดี?</p>
            <ul className="space-y-1 text-amber-800 list-disc ml-4">
              <li><b>MNL</b> — ตั้งต้นทุกงาน. รายงานบนงานวิจัยส่วนใหญ่</li>
              <li><b>Mixed Logit</b> — ถ้า Pseudo R² สูงกว่า MNL เห็นชัด แสดงว่ามี taste heterogeneity ระหว่างคน</li>
              <li><b>HB</b> — ถ้าต้องการ individual-level utilities เพื่อ segmentation/simulator</li>
              <li><b>OLS</b> — เป็น baseline เพื่อดู signal เร็วๆ ไม่ใช่สำหรับ inference จริง</li>
            </ul>
            {bestByLL && (
              <p className="mt-3 pt-3 border-t border-amber-200">
                <b>สำหรับ study นี้:</b> {bestByLL.m.full} ให้ค่า Log-likelihood สูงสุด ({fmt(bestByLL.ll, 2)})
                — แนะนำเป็น primary analysis
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConjointCompareMethods;

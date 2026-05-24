import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/App';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { Loader2, AlertCircle, GitCompare } from 'lucide-react';

/**
 * Wave A vs Wave B segment comparison panel.
 *
 * Activated by toggling "Compare Waves" on the BeFilterBar. We fire two
 * parallel analysis requests — one for Wave A's filter, one for Wave B's —
 * and lay the results side-by-side. The user can pick which method to
 * compare on (defaults to MNL).
 */
const METHOD_OPTIONS = [
  { id: 'mnl',                label: 'MNL' },
  { id: 'mixed_logit',        label: 'Mixed Logit' },
  { id: 'hierarchical_bayes', label: 'HB' },
  { id: 'linear_regression',  label: 'OLS' },
];

const buildQs = (f) => {
  if (!f) return '';
  const parts = [];
  if (f.from) parts.push(`from=${encodeURIComponent(f.from)}`);
  if (f.to)   parts.push(`to=${encodeURIComponent(f.to)}`);
  const segs = Object.fromEntries(
    Object.entries(f.segments || {}).filter(([, vs]) => (vs || []).length)
  );
  if (Object.keys(segs).length) {
    parts.push(`segments=${encodeURIComponent(JSON.stringify(segs))}`);
  }
  return parts.length ? `&${parts.join('&')}` : '';
};

const summariseFilter = (f) => {
  if (!f) return '—';
  const segs = Object.entries(f.segments || {})
    .filter(([, vs]) => (vs || []).length)
    .map(([k, vs]) => `${k}: ${vs.join('/')}`);
  const time = f.from || f.to ? `${f.from || '∞'}…${f.to || '∞'}` : null;
  const bits = [...(time ? [time] : []), ...segs];
  return bits.length ? bits.join(' · ') : 'ทั้งหมด (ไม่กรอง)';
};

const ConjointSegmentCompare = ({ studyId, study, token, filterA, filterB }) => {
  const [method, setMethod] = useState('mnl');
  const [resultA, setResultA] = useState(null);
  const [resultB, setResultB] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState(null);
  const [errorB, setErrorB] = useState(null);

  // Stringify so re-runs only happen on real changes.
  const keyA = useMemo(() => JSON.stringify(filterA || {}), [filterA]);
  const keyB = useMemo(() => JSON.stringify(filterB || {}), [filterB]);

  useEffect(() => {
    if (!studyId || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };

    setLoadingA(true); setLoadingB(true);
    setResultA(null);  setResultB(null);
    setErrorA(null);   setErrorB(null);

    const url = (f) => `${API}/conjoint/studies/${studyId}/statistical-analysis?method=${method}${buildQs(f)}`;

    axios.get(url(filterA), { headers })
      .then(r => { if (!cancelled) {
        if (r.data?.status === 'success') setResultA({ ...r.data.results, _n: r.data.respondent_count });
        else setErrorA(r.data?.message || 'ข้อมูลไม่พอ');
      }})
      .catch(e => { if (!cancelled) setErrorA(e.response?.data?.detail || e.message); })
      .finally(() => { if (!cancelled) setLoadingA(false); });

    axios.get(url(filterB), { headers })
      .then(r => { if (!cancelled) {
        if (r.data?.status === 'success') setResultB({ ...r.data.results, _n: r.data.respondent_count });
        else setErrorB(r.data?.message || 'ข้อมูลไม่พอ');
      }})
      .catch(e => { if (!cancelled) setErrorB(e.response?.data?.detail || e.message); })
      .finally(() => { if (!cancelled) setLoadingB(false); });

    return () => { cancelled = true; };
  }, [studyId, token, method, keyA, keyB]); // eslint-disable-line

  // Build grouped bar dataset: importance scores per attribute, two bars (A/B).
  const importanceData = useMemo(() => {
    if (!study?.attributes) return [];
    return study.attributes.map(attr => ({
      name: attr.name,
      'Wave A': Number(resultA?.importance_scores?.[attr.id]?.importance ?? resultA?.importance_scores?.[attr.id] ?? 0),
      'Wave B': Number(resultB?.importance_scores?.[attr.id]?.importance ?? resultB?.importance_scores?.[attr.id] ?? 0),
    }));
  }, [study, resultA, resultB]);

  // Per-attribute part-worth side-by-side tables.
  const attrTables = useMemo(() => {
    if (!study?.attributes) return [];
    return study.attributes.map(attr => {
      const pwA = resultA?.part_worths?.[attr.id]?.levels || {};
      const pwB = resultB?.part_worths?.[attr.id]?.levels || {};
      const lvls = (attr.levels || []).map(l => ({
        id: l.id,
        value: l.value,
        utilityA: pwA[l.id]?.utility,
        utilityB: pwB[l.id]?.utility,
      }));
      return { id: attr.id, name: attr.name, levels: lvls };
    });
  }, [study, resultA, resultB]);

  return (
    <div className="space-y-6" data-testid="conjoint-segment-compare">
      <div className="bg-gradient-to-r from-rose-700 to-pink-600 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <GitCompare className="w-5 h-5"/>
          <span className="px-2 py-1 text-[10px] tracking-widest bg-white/15 rounded font-mono">
            SEGMENT COMPARE · WAVE A vs WAVE B
          </span>
        </div>
        <h2 className="text-2xl font-bold">เปรียบเทียบสองกลุ่มแบบหลายมุมมอง</h2>
        <p className="text-sm text-rose-100 mt-1">
          กำหนด segment ที่ Wave A และ Wave B (เช่น female + 25-34 vs male + 45-54)
          แล้วดูว่า preference ต่างกันที่ attribute ไหน
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-mono uppercase tracking-wider text-rose-100">วิธีวิเคราะห์:</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            data-testid="segment-compare-method"
            className="bg-white/10 backdrop-blur text-white rounded px-3 py-1.5 text-sm border border-white/20"
          >
            {METHOD_OPTIONS.map(m => (
              <option key={m.id} value={m.id} className="text-gray-900">{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Slice headers showing exactly which respondents are in each wave */}
      <div className="grid md:grid-cols-2 gap-4">
        {['A', 'B'].map(w => {
          const isA = w === 'A';
          const f = isA ? filterA : filterB;
          const r = isA ? resultA : resultB;
          const loading = isA ? loadingA : loadingB;
          const err = isA ? errorA : errorB;
          const accent = isA ? 'border-blue-500 bg-blue-50' : 'border-rose-500 bg-rose-50';
          return (
            <div key={w} className={`rounded-lg border-2 ${accent} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-mono uppercase tracking-wider text-gray-600">
                  Wave {w}
                </div>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400"/>
                ) : err ? (
                  <AlertCircle className="w-4 h-4 text-amber-600"/>
                ) : (
                  <span className="text-xs font-mono px-2 py-0.5 bg-white rounded">
                    n = {r?._n ?? '—'}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-800 font-medium">{summariseFilter(f)}</div>
              {!loading && !err && r && (
                <div className="mt-3 text-[11px] text-gray-600 font-mono">
                  Pseudo R² = {r.pseudo_r_squared != null ? (r.pseudo_r_squared * 100).toFixed(2) + '%' : '—'}
                  {r.log_likelihood != null && <> · LL = {r.log_likelihood.toFixed(2)}</>}
                </div>
              )}
              {err && (
                <div className="mt-3 text-xs text-amber-700">{err}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Importance side-by-side bar chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-bold mb-1">ความสำคัญของคุณลักษณะ — เทียบ Wave A vs Wave B</h3>
        <p className="text-xs text-gray-500 mb-4">
          ความแตกต่างใหญ่ระหว่างสองแท่ง = preference ของกลุ่มต่างกันชัด → ควรออกแคมเปญแยก
        </p>
        {(loadingA || loadingB) ? (
          <div className="text-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin inline mr-2"/> กำลังคำนวณ Wave A และ Wave B…
          </div>
        ) : importanceData.length === 0 ? (
          <div className="text-center py-10 text-gray-400">ยังไม่มีข้อมูลพอที่จะเปรียบเทียบ</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(280, 60 * importanceData.length + 80)}>
            <BarChart data={importanceData} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`}/>
              <YAxis dataKey="name" type="category" width={120}/>
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`}/>
              <Legend/>
              <Bar dataKey="Wave A" fill="#2563eb"/>
              <Bar dataKey="Wave B" fill="#db2777"/>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Part-worth comparison tables */}
      <div className="grid gap-4">
        {attrTables.map(t => (
          <div key={t.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <h4 className="font-bold">{t.name}</h4>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Level</th>
                  <th className="text-right px-4 py-2 font-semibold text-blue-700">Wave A</th>
                  <th className="text-right px-4 py-2 font-semibold text-rose-700">Wave B</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700">Δ (B − A)</th>
                </tr>
              </thead>
              <tbody>
                {t.levels.map(l => {
                  const a = l.utilityA;
                  const b = l.utilityB;
                  const delta = (typeof a === 'number' && typeof b === 'number') ? (b - a) : null;
                  const big = delta != null && Math.abs(delta) > 0.3;
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-4 py-2">{l.value}</td>
                      <td className="px-4 py-2 text-right font-mono">{typeof a === 'number' ? a.toFixed(3) : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{typeof b === 'number' ? b.toFixed(3) : '—'}</td>
                      <td className={`px-4 py-2 text-right font-mono ${big ? 'font-bold' : ''} ${delta == null ? '' : delta > 0 ? 'text-rose-700' : 'text-blue-700'}`}>
                        {delta == null ? '—' : (delta >= 0 ? '+' : '') + delta.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConjointSegmentCompare;

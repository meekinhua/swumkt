import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { BeTopbar } from '@/pages/brand-equity/be-components';
import { API } from '@/App';
import {
  BENEFIT_CATS, COST_CATS, PRINCIPLE_TAGS, industryRange, scoreBrand,
  defaultFactorPool, newFactor, INDUSTRIES, PERCEPTION_PROFILES, perceptionSeries,
  MARKETING_LENSES, PROCESS_STEPS,
} from './cv-lib';
import './customer-value.css';

// ---------- weight selector ----------
const WeightPicker = ({ value, onChange }) => (
  <span className="cv-w">
    {[1, 2, 3].map((w) => (
      <button key={w} className={value === w ? 'on' : ''} onClick={() => onChange(w)} title={`น้ำหนัก ${w}`}>{w}</button>
    ))}
  </span>
);

// ---------- one category (benefit or cost) ----------
function CategoryBox({ cat, isCost, factors, onChange, onAiSuggest, aiState }) {
  const [draft, setDraft] = useState('');
  const list = factors || [];
  const setF = (idx, patch) => onChange(list.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const add = (label, weight = 2) => { if (!label.trim()) return; onChange([...list, newFactor(label.trim(), weight, true)]); setDraft(''); };
  const del = (idx) => onChange(list.filter((_, i) => i !== idx));
  const pool = defaultFactorPool(cat._ind, cat.id).filter((p) => !list.some((f) => f.label === p));

  return (
    <div className="cv-cat">
      <div className="cv-cat-hd">
        <i className={`fa-solid ${cat.icon}`} style={{ color: isCost ? '#c8102e' : '#0e5538' }} />
        <span className="nm">{cat.label}</span>
        <span className="th">{cat.th}</span>
        <button className="cv-btn ghost sm" style={{ marginLeft: 'auto' }} data-testid={`cv-ai-${cat.id}`}
          onClick={() => onAiSuggest(cat.id)} disabled={aiState === 'loading'}>
          {aiState === 'loading' ? '…' : <><i className="fa-solid fa-wand-magic-sparkles" /> AI</>}
        </button>
      </div>
      {list.map((f, idx) => (
        <div key={f.id || idx} className={`cv-factor ${isCost ? 'cost' : ''}`}>
          <input type="checkbox" checked={!!f.checked} onChange={(e) => setF(idx, { checked: e.target.checked })} />
          <span className={`lbl ${f.checked ? '' : 'off'}`}>{f.label}</span>
          <WeightPicker value={f.weight} onChange={(w) => setF(idx, { weight: w })} />
          <button className="cv-x" onClick={() => del(idx)}><i className="fa-solid fa-xmark" /></button>
        </div>
      ))}
      {pool.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '6px 0' }}>
          {pool.slice(0, 4).map((p) => (
            <button key={p} className="cv-chip" style={{ cursor: 'pointer' }} onClick={() => add(p)}>+ {p}</button>
          ))}
        </div>
      )}
      <div className="cv-add">
        <input placeholder="เพิ่มปัจจัยเอง…" value={draft} data-testid={`cv-addinput-${cat.id}`}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(draft)} />
        <button className="cv-btn ghost sm" onClick={() => add(draft)}>เพิ่ม</button>
      </div>
      {aiState && aiState.suggestions && (
        <div className="cv-ai-box" data-testid={`cv-aibox-${cat.id}`}>
          <div className="cv-eyebrow" style={{ color: '#1b75bc', marginBottom: 6 }}>
            <i className="fa-solid fa-robot" /> AI แนะนำให้เพิ่ม
          </div>
          {aiState.suggestions.map((s, i) => {
            const tag = PRINCIPLE_TAGS[s.principle] || PRINCIPLE_TAGS['kotler-value'];
            return (
              <div key={i} className="cv-ai-item">
                <button className="cv-ai-add" title="เพิ่มเข้าหมวดนี้"
                  onClick={() => add(s.label, s.weight)}><i className="fa-solid fa-plus" /></button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{s.label} <span className="cv-tag" style={{ background: tag.color }}>{tag.label}</span></div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{s.rationale}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoreGauges({ sc }) {
  return (
    <div className="cv-gauge">
      <div className="row"><span className="lab">Benefit</span>
        <div className="track"><div className="fill benefit" style={{ width: `${sc.benefit}%` }} /></div>
        <b style={{ width: 40, textAlign: 'right' }}>{sc.benefit}</b></div>
      <div className="row"><span className="lab">Cost</span>
        <div className="track"><div className="fill cost" style={{ width: `${sc.cost}%` }} /></div>
        <b style={{ width: 40, textAlign: 'right' }}>{sc.cost}</b></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
        <span className="cv-eyebrow">Customer Value = Benefit − Cost</span>
        <span className="cv-net" style={{ color: sc.net >= 0 ? '#0e5538' : '#c8102e' }}>
          {sc.net > 0 ? '+' : ''}{sc.net}</span>
      </div>
    </div>
  );
}

// ---------- perception SVG: Actual line + Perceived curve ----------
function PerceptionChart({ data }) {
  const W = 660, H = 300, pad = 44;
  const n = data.series.length;
  const xs = (t) => pad + (t / (n - 1)) * (W - pad * 2);
  const ys = (v) => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - pad * 2);
  const perceivedPath = data.series.map((d, i) => `${i ? 'L' : 'M'}${xs(d.t)},${ys(d.perceived)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', border: '1.5px solid #14161a', background: '#fff', borderRadius: 4 }}>
      {[0, 25, 50, 75, 100].map((g) => (
        <line key={g} x1={pad} y1={ys(g)} x2={W - pad} y2={ys(g)} stroke="#eee" />
      ))}
      {/* Actual value line */}
      <line x1={xs(0)} y1={ys(data.actual)} x2={xs(n - 1)} y2={ys(data.actual)} stroke="#1b75bc" strokeWidth="2.5" strokeDasharray="7 5" />
      <text x={xs(n - 1)} y={ys(data.actual) - 6} fontSize="11" fill="#1b75bc" textAnchor="end" fontFamily="monospace">Actual Value</text>
      {/* Perceived curve */}
      <path d={perceivedPath} fill="none" stroke="#c8102e" strokeWidth="3" />
      <circle cx={xs(0)} cy={ys(data.expectation)} r="4" fill="#c8102e" />
      <text x={xs(0) + 6} y={ys(data.expectation) - 8} fontSize="11" fill="#c8102e" fontFamily="monospace">Perceived (เริ่มต้น {data.expectation})</text>
      <text x={pad} y={H - 10} fontSize="9" fill="#999" fontFamily="monospace">เวลา / ประสบการณ์การใช้งาน →</text>
      <text x={10} y={pad - 12} fontSize="9" fill="#999" fontFamily="monospace">คุณค่าที่รับรู้</text>
    </svg>
  );
}

// ---------- list-style AI result renderer ----------
const Bullet = ({ children }) => (
  <li style={{ marginBottom: 6, lineHeight: 1.6 }}>{children}</li>
);

export default function CustomerValueStudioPage() {
  const { studyId } = useParams();
  const { token } = useAuth();
  const nav = useNavigate();
  const [study, setStudy] = useState(null);
  const [tab, setTab] = useState('lens');
  const [ai, setAi] = useState({});
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState({});
  const [needsLoading, setNeedsLoading] = useState(false);
  const [needsResult, setNeedsResult] = useState(null);
  const [stepAi, setStepAi] = useState({});
  const saveTimer = useRef(null);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/cv/studies/${studyId}`, auth);
      setStudy(r.data);
    } catch (e) {
      toast.error('โหลดไม่สำเร็จ');
      nav('/market-research/customer-value');
    }
  }, [studyId, token]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const scheduleSave = (next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await axios.put(`${API}/cv/studies/${studyId}`, {
          brands: next.brands, perception: next.perception, title: next.title,
          needs: next.needs, process: next.process, lens: next.lens,
        }, auth);
      } catch { toast.error('บันทึกไม่สำเร็จ'); }
    }, 700);
  };

  const updateStudy = (patch) => setStudy((prev) => { const next = { ...prev, ...patch }; scheduleSave(next); return next; });
  const updateBrand = (bid, patch) => setStudy((prev) => {
    const next = { ...prev, brands: prev.brands.map((b) => (b.id === bid ? { ...b, ...patch } : b)) };
    scheduleSave(next); return next;
  });
  const setCategoryFactors = (bid, group, catId, factors) => setStudy((prev) => {
    const next = {
      ...prev,
      brands: prev.brands.map((b) => (b.id !== bid ? b : { ...b, [group]: { ...(b[group] || {}), [catId]: factors } })),
    };
    scheduleSave(next); return next;
  });

  const addBrand = () => {
    const palette = ['#C8102E', '#1B75BC', '#0E5538', '#B8860B', '#6B21A8'];
    const rng = industryRange(study.industry);
    updateStudy({ brands: [...study.brands, {
      id: `b${Date.now()}`, name: `คู่แข่ง ${String.fromCharCode(65 + study.brands.length)}`,
      is_ours: false, color: palette[study.brands.length % palette.length], price_value: rng.mid,
      benefits: { functional: [], economic: [], love_belonging: [], esteem_status: [] },
      costs: { inconvenience: [], risk: [] }, image_url: null, image_prompt: null,
    }] });
  };
  const removeBrand = (bid) => {
    if (study.brands.length <= 1) { toast.error('ต้องมีอย่างน้อย 1 แบรนด์'); return; }
    updateStudy({ brands: study.brands.filter((b) => b.id !== bid) });
  };

  const doAiSuggest = async (bid, catId) => {
    const key = `${bid}_${catId}`;
    setAi((p) => ({ ...p, [key]: 'loading' }));
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/ai-suggest`, { brand_id: bid, category: catId }, auth);
      setAi((p) => ({ ...p, [key]: { suggestions: r.data.suggestions || [] } }));
      if (!r.data.suggestions?.length) toast.info('AI ไม่มีคำแนะนำเพิ่มเติม');
    } catch { setAi((p) => { const n = { ...p }; delete n[key]; return n; }); toast.error('AI แนะนำไม่สำเร็จ'); }
  };

  const doAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/ai-analysis`, {}, auth);
      setStudy((p) => ({ ...p, ai_analysis: r.data.analysis }));
    } catch { toast.error('วิเคราะห์ไม่สำเร็จ'); } finally { setAnalysisLoading(false); }
  };

  const doGenImage = async (bid) => {
    setImgLoading((p) => ({ ...p, [bid]: true }));
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/generate-image`, { brand_id: bid }, auth);
      updateBrand(bid, { image_url: r.data.image_url, image_prompt: r.data.prompt_used });
      toast.success('สร้างภาพแล้ว');
    } catch { toast.error('สร้างภาพไม่สำเร็จ'); } finally { setImgLoading((p) => ({ ...p, [bid]: false })); }
  };

  const doAiNeeds = async () => {
    setNeedsLoading(true);
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/ai-needs`, study.needs || {}, auth);
      setNeedsResult(r.data.result || {});
    } catch { toast.error('วิเคราะห์ไม่สำเร็จ'); } finally { setNeedsLoading(false); }
  };

  const doAiStep = async (stepId) => {
    setStepAi((p) => ({ ...p, [stepId]: 'loading' }));
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/ai-step`, { step: stepId }, auth);
      setStepAi((p) => ({ ...p, [stepId]: r.data.result || {} }));
    } catch { setStepAi((p) => { const n = { ...p }; delete n[stepId]; return n; }); toast.error('AI แนะนำไม่สำเร็จ'); }
  };

  if (!study) return <div className="cv-page"><BeTopbar active="tools" subtitle="CUSTOMER VALUE LAB" /><div className="cv-empty">กำลังโหลด…</div></div>;

  const rng = industryRange(study.industry);
  const scored = study.brands.map((b) => ({ brand: b, sc: scoreBrand(b, rng) }));
  const winner = scored.slice().sort((a, b) => b.sc.net - a.sc.net)[0];
  const ours = scored.find((x) => x.brand.is_ours) || scored[0];
  const anyChecked = study.brands.some((b) =>
    [...Object.values(b.benefits || {}).flat(), ...Object.values(b.costs || {}).flat()].some((f) => f && f.checked));

  const TABS = [
    { id: 'lens', label: 'Marketing Lens', icon: 'fa-glasses' },
    { id: 'needs', label: 'Need→Want→Demand', icon: 'fa-people-group' },
    { id: 'audit', label: 'Value Audit', icon: 'fa-scale-balanced' },
    { id: 'perception', label: 'Perception', icon: 'fa-chart-line' },
    { id: 'process', label: '5-Step Process', icon: 'fa-list-check' },
    { id: 'image', label: 'Image Sim', icon: 'fa-image' },
  ];

  return (
    <div className="cv-page" data-testid="cv-studio-page">
      <BeTopbar active="tools" subtitle="CUSTOMER VALUE LAB" />
      <div className="cv-wrap">
        <button className="cv-btn ghost sm" onClick={() => nav('/market-research/customer-value')} style={{ marginBottom: 12 }}>
          <i className="fa-solid fa-arrow-left" /> กลับ
        </button>
        <div className="cv-eyebrow">{(INDUSTRIES.find((i) => i.id === study.industry) || {}).label} · Customer Value = Benefit − Price</div>
        <h1 className="cv-h1">{study.title}</h1>

        <div className="cv-tabs" data-testid="cv-tabs">
          {TABS.map((t) => (
            <div key={t.id} className={`cv-tab ${tab === t.id ? 'active' : ''}`} data-testid={`cv-tab-${t.id}`}
              onClick={() => setTab(t.id)}><i className={`fa-solid ${t.icon}`} /> {t.label}</div>
          ))}
        </div>

        {/* ============ 1. MARKETING LENS ============ */}
        {tab === 'lens' && (
          <div data-testid="cv-lens">
            <div className="cv-eyebrow" style={{ marginBottom: 12 }}>นิยามการตลาด 3 ระดับ — มองธุรกิจคุณผ่าน 3 เลนส์</div>
            <div className="cv-grid">
              {MARKETING_LENSES.map((l) => (
                <div key={l.id} className="cv-card pad" data-testid={`cv-lens-${l.id}`}>
                  <i className={`fa-solid ${l.icon}`} style={{ fontSize: 22, color: '#1b75bc' }} />
                  <div className="cv-chip" style={{ margin: '8px 0' }}>{l.tag}</div>
                  <div style={{ fontFamily: "'IBM Plex Serif', serif", fontSize: 18, fontStyle: 'italic', marginBottom: 6 }}>“{l.quote}”</div>
                  <p style={{ fontSize: 13, color: '#44474d' }}>{l.th}</p>
                </div>
              ))}
            </div>
            <div className="cv-card pad" style={{ marginTop: 18 }}>
              <div className="cv-eyebrow"><i className="fa-solid fa-robot" /> Drucker check — ธุรกิจคุณ "ขายได้ด้วยตัวเอง" แค่ไหน?</div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 10px' }}>
                0 = พึ่งพนักงานขายเก่งคนเดียว (เสี่ยง) · 100 = แบรนด์+ระบบแข็งแรงจนลูกค้าเลือกเองก่อนเจอคนขาย
              </p>
              <input type="range" min="0" max="100" value={study.lens?.self_sell ?? 50} data-testid="cv-selfsell-slider"
                style={{ width: '100%', accentColor: '#0e5538' }}
                onChange={(e) => updateStudy({ lens: { ...study.lens, self_sell: Number(e.target.value) } })} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span className="cv-net" style={{ fontSize: 26 }}>{study.lens?.self_sell ?? 50}<span style={{ fontSize: 14 }}>/100</span></span>
                <span style={{ fontSize: 13, color: '#44474d', maxWidth: 460, textAlign: 'right' }}>
                  {(study.lens?.self_sell ?? 50) >= 66 ? 'แข็งแรง — แบรนด์ขายตัวเองได้ มุ่งรักษา Engagement ต่อไป'
                    : (study.lens?.self_sell ?? 50) >= 33 ? 'ปานกลาง — เริ่มสร้างระบบ/แบรนด์ ลดการพึ่งคนขายรายบุคคล'
                      : 'เสี่ยง — ยอดผูกกับคนขาย ควรรีบสร้างคุณค่า+แบรนด์ให้ขายได้เอง'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ============ 2. NEED → WANT → DEMAND ============ */}
        {tab === 'needs' && (
          <div className="cv-card pad" data-testid="cv-needs">
            <div className="cv-eyebrow">NEED → WANT → DEMAND · แยกความต้องการให้ชัด</div>
            <p className="cv-lede" style={{ marginBottom: 14 }}>
              Need (ดิบจากธรรมชาติ) → Want (เจาะจงตามวัฒนธรรม) → Demand (Want + กำลังซื้อจริง) เท่านั้นที่นับเป็นตลาดจริง
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }} className="cv-needs-grid">
              {[
                { k: 'need', label: 'NEED', hint: 'ความต้องการดิบ เช่น หิว/กระหาย/ปลอดภัย' },
                { k: 'want', label: 'WANT', hint: 'เจาะจงเป็นสินค้า เช่น อยากกินกะเพรา' },
                { k: 'buying_power', label: 'BUYING POWER', hint: 'งบ/สิทธิ์จริงของกลุ่มเป้าหมาย' },
              ].map((f) => (
                <div key={f.k}>
                  <div className="cv-eyebrow" style={{ marginBottom: 4 }}>{f.label}</div>
                  <textarea className="cv-textarea" rows={3} placeholder={f.hint} data-testid={`cv-needs-${f.k}`}
                    value={(study.needs || {})[f.k] || ''}
                    onChange={(e) => updateStudy({ needs: { ...study.needs, [f.k]: e.target.value } })} />
                </div>
              ))}
            </div>
            <button className="cv-btn accent" style={{ marginTop: 12 }} onClick={doAiNeeds} disabled={needsLoading} data-testid="cv-needs-analyze">
              {needsLoading ? 'กำลังวิเคราะห์…' : <><i className="fa-solid fa-wand-magic-sparkles" /> AI วิเคราะห์ Demand</>}
            </button>
            {needsResult && (
              <div className="cv-ai-box" style={{ marginTop: 14 }} data-testid="cv-needs-result">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span className="cv-chip" style={{ background: needsResult.is_real_demand ? '#0e5538' : '#c8102e', color: '#fff', border: 'none' }}>
                    {needsResult.is_real_demand ? 'เป็น DEMAND จริง' : 'ยังเป็นแค่ WANT'}
                  </span>
                  <span style={{ fontSize: 13 }}>{needsResult.demand_verdict}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <div><b>Need:</b> {needsResult.need}</div>
                  <div><b>Want:</b> {needsResult.want}</div>
                  <div><b>Buying Power:</b> {needsResult.buying_power}</div>
                </div>
                {Array.isArray(needsResult.tips) && needsResult.tips.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div className="cv-eyebrow" style={{ color: '#1b75bc' }}>เปลี่ยน Want → Demand</div>
                    <ul style={{ paddingLeft: 18, marginTop: 4 }}>{needsResult.tips.map((t, i) => <Bullet key={i}>{t}</Bullet>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============ 3. VALUE AUDIT ============ */}
        {tab === 'audit' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="cv-eyebrow">เปรียบเทียบคุณค่า · {study.brands.length} แบรนด์</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="cv-btn ghost sm" onClick={addBrand} data-testid="cv-add-brand"><i className="fa-solid fa-plus" /> เพิ่มคู่แข่ง</button>
                <button className="cv-btn accent sm" onClick={doAnalysis} disabled={analysisLoading} data-testid="cv-analyze-btn">
                  {analysisLoading ? 'วิเคราะห์…' : <><i className="fa-solid fa-chess" /> AI Strategy</>}
                </button>
              </div>
            </div>

            {anyChecked ? (
              <div className="cv-winner" style={{ marginBottom: 18, borderColor: winner.sc.net >= 0 ? '#0e5538' : '#c8102e', background: winner.sc.net >= 0 ? '#eaf3ee' : '#fdeaec' }} data-testid="cv-winner">
                <i className="fa-solid fa-trophy" style={{ fontSize: 22, color: winner.brand.color }} />
                <div><div className="cv-eyebrow">ผู้ชนะด้านคุณค่า (Net Value สูงสุด)</div>
                  <b style={{ fontSize: 18 }}>{winner.brand.name}</b>
                  <span style={{ marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>Net {winner.sc.net > 0 ? '+' : ''}{winner.sc.net}</span></div>
              </div>
            ) : (
              <div className="cv-winner" style={{ marginBottom: 18, borderColor: '#6b7280', background: '#f7f4ee' }} data-testid="cv-winner">
                <i className="fa-solid fa-hand-pointer" style={{ fontSize: 20, color: '#6b7280' }} />
                <div><div className="cv-eyebrow">ยังไม่ได้ประเมิน</div>
                  <span style={{ fontSize: 14 }}>เริ่มติ๊กปัจจัย Benefit / Cost — หรือกดปุ่ม <b>AI</b> ให้ช่วยแนะนำ</span></div>
              </div>
            )}

            {study.ai_analysis && (
              <div className="cv-card pad cv-md" style={{ marginBottom: 18 }} data-testid="cv-analysis-md">
                <div className="cv-eyebrow" style={{ marginBottom: 6 }}><i className="fa-solid fa-chess" /> AI STRATEGY</div>
                {study.ai_analysis.split('\n').map((ln, i) => {
                  const t = ln.trim();
                  if (/^#{1,3}\s/.test(t)) return <h3 key={i}>{t.replace(/^#+\s/, '')}</h3>;
                  if (/^[-*]\s/.test(t)) return <li key={i} style={{ marginLeft: 16 }}>{t.replace(/^[-*]\s/, '')}</li>;
                  if (!t) return null;
                  return <p key={i}>{t.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}</p>;
                })}
              </div>
            )}

            <div className="cv-brands">
              {scored.map(({ brand, sc }) => (
                <div key={brand.id} className="cv-card" data-testid={`cv-brand-${brand.id}`}>
                  <div className="cv-brand-head" style={{ background: brand.is_ours ? '#f3f8f5' : '#fff' }}>
                    <span className="cv-brand-dot" style={{ background: brand.color }} />
                    <input className="cv-brand-name" value={brand.name} onChange={(e) => updateBrand(brand.id, { name: e.target.value })} />
                    {brand.is_ours && <span className="cv-chip" style={{ background: '#0e5538', color: '#fff', border: 'none' }}>เรา</span>}
                    {!brand.is_ours && <button className="cv-x" onClick={() => removeBrand(brand.id)}><i className="fa-solid fa-trash" /></button>}
                  </div>
                  <div style={{ padding: 16 }}>
                    <ScoreGauges sc={sc} />
                    <div className="cv-sect-title" style={{ color: '#0e5538', margin: '16px 0 8px' }}>
                      <span><i className="fa-solid fa-plus" /> BENEFIT (สิ่งที่ลูกค้าได้)</span>
                    </div>
                    {BENEFIT_CATS.filter((c) => c.group === 'core').map((c) => (
                      <CategoryBox key={c.id} cat={{ ...c, _ind: study.industry }} isCost={false}
                        factors={(brand.benefits || {})[c.id]}
                        onChange={(f) => setCategoryFactors(brand.id, 'benefits', c.id, f)}
                        onAiSuggest={() => doAiSuggest(brand.id, c.id)} aiState={ai[`${brand.id}_${c.id}`]} />
                    ))}
                    <div className="cv-subhd"><i className="fa-solid fa-brain" /> Psychological (จิตวิทยา · Maslow)</div>
                    {BENEFIT_CATS.filter((c) => c.group === 'psych').map((c) => (
                      <CategoryBox key={c.id} cat={{ ...c, _ind: study.industry }} isCost={false}
                        factors={(brand.benefits || {})[c.id]}
                        onChange={(f) => setCategoryFactors(brand.id, 'benefits', c.id, f)}
                        onAiSuggest={() => doAiSuggest(brand.id, c.id)} aiState={ai[`${brand.id}_${c.id}`]} />
                    ))}

                    <div className="cv-sect-title" style={{ color: '#c8102e', margin: '16px 0 8px' }}>
                      <span><i className="fa-solid fa-minus" /> COST / PRICE (สิ่งที่ลูกค้าเสีย)</span>
                    </div>
                    <div className="cv-price-row">
                      <label style={{ fontSize: 13 }}><i className="fa-solid fa-money-bill-wave" style={{ color: '#c8102e' }} /> ราคา (บาท)</label>
                      <input type="number" value={brand.price_value} data-testid={`cv-price-${brand.id}`}
                        onChange={(e) => updateBrand(brand.id, { price_value: Number(e.target.value) })} />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>ช่วง {rng.min}–{rng.max}</span>
                    </div>
                    {COST_CATS.filter((c) => c.id !== 'money').map((c) => (
                      <CategoryBox key={c.id} cat={{ ...c, _ind: study.industry }} isCost
                        factors={(brand.costs || {})[c.id]}
                        onChange={(f) => setCategoryFactors(brand.id, 'costs', c.id, f)}
                        onAiSuggest={() => doAiSuggest(brand.id, c.id)} aiState={ai[`${brand.id}_${c.id}`]} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ============ 4. PERCEPTION ============ */}
        {tab === 'perception' && (() => {
          const profile = study.perception?.profile || 'C';
          const data = perceptionSeries(ours.sc.benefit, profile);
          return (
            <div className="cv-card pad" data-testid="cv-perception">
              <div className="cv-eyebrow">ACTUAL vs PERCEIVED VALUE · ความรับรู้เปลี่ยนตามเวลา</div>
              <p className="cv-lede" style={{ marginBottom: 14 }}>
                อ้างอิงคุณค่าจริง (Actual) ของ <b>{ours.brand.name}</b> = {data.actual} — เลือกวิธีสื่อสารเพื่อดูผลระยะยาว
              </p>
              <div className="cv-prof-row">
                {PERCEPTION_PROFILES.map((p) => (
                  <div key={p.id} className={`cv-prof ${profile === p.id ? 'active' : ''}`} data-testid={`cv-prof-${p.id}`}
                    onClick={() => updateStudy({ perception: { ...study.perception, profile: p.id } })}>
                    <div className="pl">{p.label} · {p.th}</div>
                    <div className="pn">{p.note}</div>
                  </div>
                ))}
              </div>
              <PerceptionChart data={data} />
              <div style={{ marginTop: 12, padding: 12, background: '#f7f4ee', borderRadius: 4, fontSize: 13 }}>
                <b>ความพึงพอใจสุทธิ (Actual − Expectation):</b>{' '}
                <b style={{ color: data.satisfaction >= 0 ? '#0e5538' : '#c8102e' }}>{data.satisfaction > 0 ? '+' : ''}{data.satisfaction}</b>{' '}
                — {data.satisfaction > 5 ? 'Delight (ดีเกินคาด)' : data.satisfaction < -5 ? 'Dissatisfaction (ผิดหวัง)' : 'Sustainable (พอดี ยั่งยืน)'}
                <div style={{ color: '#6b7280', marginTop: 4 }}><i className="fa-solid fa-circle-info" /> {data.profile.apply}</div>
              </div>
            </div>
          );
        })()}

        {/* ============ 5. 5-STEP PROCESS ============ */}
        {tab === 'process' && (
          <div data-testid="cv-process">
            <div className="cv-eyebrow" style={{ marginBottom: 12 }}>กระบวนการตลาด 5 ขั้น · นำทางจาก Research → Return</div>
            {PROCESS_STEPS.map((st) => {
              const data = (study.process || {})[st.id] || {};
              const aiR = stepAi[st.id];
              return (
                <div key={st.id} className="cv-card pad" style={{ marginBottom: 12 }} data-testid={`cv-step-${st.id}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="cv-step-no">{st.no}</span>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 15 }}><i className={`fa-solid ${st.icon}`} style={{ marginRight: 6, color: '#1b75bc' }} />{st.label}</b>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{st.th}</div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={!!data.done} data-testid={`cv-step-done-${st.id}`}
                        style={{ width: 16, height: 16, accentColor: '#0e5538' }}
                        onChange={(e) => updateStudy({ process: { ...study.process, [st.id]: { ...data, done: e.target.checked } } })} />
                      เสร็จ
                    </label>
                    <button className="cv-btn ghost sm" onClick={() => doAiStep(st.id)} disabled={aiR === 'loading'} data-testid={`cv-step-ai-${st.id}`}>
                      {aiR === 'loading' ? '…' : <><i className="fa-solid fa-wand-magic-sparkles" /> AI</>}
                    </button>
                  </div>
                  <textarea className="cv-textarea" rows={2} placeholder="บันทึกแผน/ไอเดียของขั้นนี้…" style={{ marginTop: 10 }}
                    value={data.notes || ''}
                    onChange={(e) => updateStudy({ process: { ...study.process, [st.id]: { ...data, notes: e.target.value } } })} />
                  {aiR && aiR.checklist && (
                    <div className="cv-ai-box" style={{ marginTop: 10 }} data-testid={`cv-step-result-${st.id}`}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>{aiR.summary}</div>
                      <ul style={{ paddingLeft: 18 }}>{aiR.checklist.map((c, i) => <Bullet key={i}>{c}</Bullet>)}</ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============ 6. IMAGE SIMULATION ============ */}
        {tab === 'image' && (
          <div data-testid="cv-image">
            <div className="cv-eyebrow" style={{ marginBottom: 12 }}>IMAGE SIMULATION · เห็นภาพสินค้า/บริการจริงจาก value proposition (Nano Banana)</div>
            <div className="cv-brands">
              {study.brands.map((b) => {
                const chosen = BENEFIT_CATS.flatMap((c) => (b.benefits?.[c.id] || []).filter((f) => f.checked).map((f) => f.label));
                return (
                  <div key={b.id} className="cv-card pad" data-testid={`cv-img-card-${b.id}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span className="cv-brand-dot" style={{ background: b.color }} />
                      <b>{b.name}</b>{b.is_ours && <span className="cv-chip" style={{ background: '#0e5538', color: '#fff', border: 'none' }}>เรา</span>}
                    </div>
                    <div className="cv-img-wrap" style={{ marginBottom: 10 }}>
                      {b.image_url ? <img src={b.image_url.startsWith('/api') ? `${process.env.REACT_APP_BACKEND_URL}${b.image_url}` : b.image_url} alt={b.name} />
                        : <span style={{ color: '#9ca3af', fontSize: 13 }}>ยังไม่มีภาพ</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, minHeight: 32 }}>
                      Value props: {chosen.length ? chosen.slice(0, 6).join(', ') : '(ยังไม่ได้เลือก benefit — AI จะใช้ค่าเริ่มต้น)'}
                    </div>
                    <button className="cv-btn" disabled={imgLoading[b.id]} onClick={() => doGenImage(b.id)} data-testid={`cv-gen-img-${b.id}`}>
                      {imgLoading[b.id] ? 'กำลังสร้างภาพ… (~20วิ)' : <><i className="fa-solid fa-wand-magic-sparkles" /> {b.image_url ? 'สร้างใหม่' : 'สร้างภาพจำลอง'}</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

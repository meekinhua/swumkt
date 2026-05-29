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
} from './cv-lib';
import './customer-value.css';

// ---------- tiny markdown renderer ----------
function renderMd(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const out = [];
  let list = [];
  const flush = (i) => { if (list.length) { out.push(<ul key={`u${i}`}>{list}</ul>); list = []; } };
  const inline = (t) => t.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p);
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (/^#{1,3}\s/.test(t)) { flush(i); const lvl = t.match(/^#+/)[0].length; const Tag = `h${lvl}`;
      out.push(<Tag key={i}>{inline(t.replace(/^#+\s/, ''))}</Tag>); }
    else if (/^[-*]\s/.test(t)) { list.push(<li key={i}>{inline(t.replace(/^[-*]\s/, ''))}</li>); }
    else if (t === '') { flush(i); }
    else { flush(i); out.push(<p key={i}>{inline(t)}</p>); }
  });
  flush('end');
  return out;
}

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
  const setF = (idx, patch) => { const n = list.map((f, i) => (i === idx ? { ...f, ...patch } : f)); onChange(n); };
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

      {/* quick-add from default pool */}
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

      {/* AI suggestions */}
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

// ---------- score gauges ----------
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

// ---------- perception SVG chart ----------
function PerceptionChart({ data }) {
  const W = 640, H = 280, pad = 40;
  const xs = (t) => pad + (t / (data.series.length - 1)) * (W - pad * 2);
  const ys = (v) => H - pad - (Math.max(-50, Math.min(100, v)) + 50) / 150 * (H - pad * 2);
  const path = (key) => data.series.map((d, i) => `${i ? 'L' : 'M'}${xs(d.t)},${ys(d[key])}`).join(' ');
  const last = data.series[data.series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', border: '1.5px solid #14161a', background: '#fff', borderRadius: 4 }}>
      <line x1={pad} y1={ys(0)} x2={W - pad} y2={ys(0)} stroke="#ccc" strokeDasharray="3 3" />
      <text x={pad} y={ys(0) - 4} fontSize="9" fill="#999" fontFamily="monospace">satisfaction = 0</text>
      <line x1={xs(0)} y1={ys(data.expectation)} x2={xs(last.t)} y2={ys(data.expectation)} stroke="#1b75bc" strokeWidth="2" strokeDasharray="6 4" />
      <path d={path('experienced')} fill="none" stroke="#0e5538" strokeWidth="3" />
      <path d={path('satisfaction')} fill="none" stroke="#c8102e" strokeWidth="2" />
      <text x={xs(last.t)} y={ys(data.expectation) - 6} fontSize="10" fill="#1b75bc" textAnchor="end" fontFamily="monospace">Expectation</text>
      <text x={xs(last.t)} y={ys(last.experienced) - 6} fontSize="10" fill="#0e5538" textAnchor="end" fontFamily="monospace">Experienced</text>
      <text x={xs(last.t)} y={ys(last.satisfaction) + 14} fontSize="10" fill="#c8102e" textAnchor="end" fontFamily="monospace">Satisfaction</text>
      <text x={pad} y={H - 8} fontSize="9" fill="#999" fontFamily="monospace">เวลา (ประสบการณ์การใช้งาน) →</text>
    </svg>
  );
}

export default function CustomerValueStudioPage() {
  const { studyId } = useParams();
  const { token } = useAuth();
  const nav = useNavigate();
  const [study, setStudy] = useState(null);
  const [tab, setTab] = useState('audit');
  const [ai, setAi] = useState({});       // {brandId_cat: {suggestions} | 'loading'}
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState({});
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
  }, [studyId, token]);

  useEffect(() => { load(); }, [load]);

  const scheduleSave = (next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await axios.put(`${API}/cv/studies/${studyId}`,
          { brands: next.brands, perception: next.perception, title: next.title }, auth);
      } catch { toast.error('บันทึกไม่สำเร็จ'); }
    }, 700);
  };

  const updateStudy = (patch) => {
    setStudy((prev) => { const next = { ...prev, ...patch }; scheduleSave(next); return next; });
  };

  const updateBrand = (bid, patch) => {
    setStudy((prev) => {
      const brands = prev.brands.map((b) => (b.id === bid ? { ...b, ...patch } : b));
      const next = { ...prev, brands };
      scheduleSave(next);
      return next;
    });
  };

  const setCategoryFactors = (bid, group, catId, factors) => {
    setStudy((prev) => {
      const brands = prev.brands.map((b) => {
        if (b.id !== bid) return b;
        const bucket = { ...(b[group] || {}) };
        bucket[catId] = factors;
        return { ...b, [group]: bucket };
      });
      const next = { ...prev, brands };
      scheduleSave(next);
      return next;
    });
  };

  const addBrand = () => {
    const palette = ['#C8102E', '#1B75BC', '#0E5538', '#B8860B', '#6B21A8'];
    const rng = industryRange(study.industry);
    const nb = {
      id: `b${Date.now()}`, name: `คู่แข่ง ${String.fromCharCode(65 + study.brands.length)}`,
      is_ours: false, color: palette[study.brands.length % palette.length], price_value: rng.mid,
      benefits: { functional: [], economic: [], psychological: [] }, costs: { inconvenience: [], risk: [] },
      image_url: null, image_prompt: null,
    };
    updateStudy({ brands: [...study.brands, nb] });
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
    } catch (e) {
      setAi((p) => { const n = { ...p }; delete n[key]; return n; });
      toast.error('AI แนะนำไม่สำเร็จ');
    }
  };

  const doAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/ai-analysis`, {}, auth);
      setStudy((p) => ({ ...p, ai_analysis: r.data.analysis }));
    } catch { toast.error('วิเคราะห์ไม่สำเร็จ'); }
    finally { setAnalysisLoading(false); }
  };

  const doGenImage = async (bid) => {
    setImgLoading((p) => ({ ...p, [bid]: true }));
    try {
      const r = await axios.post(`${API}/cv/studies/${studyId}/generate-image`, { brand_id: bid }, auth);
      updateBrand(bid, { image_url: r.data.image_url, image_prompt: r.data.prompt_used });
      toast.success('สร้างภาพแล้ว');
    } catch (e) {
      toast.error('สร้างภาพไม่สำเร็จ — ลองอีกครั้ง');
    } finally { setImgLoading((p) => ({ ...p, [bid]: false })); }
  };

  if (!study) return <div className="cv-page"><BeTopbar active="tools" subtitle="CUSTOMER VALUE LAB" /><div className="cv-empty">กำลังโหลด…</div></div>;

  const rng = industryRange(study.industry);
  const scored = study.brands.map((b) => ({ brand: b, sc: scoreBrand(b, rng) }));
  const winner = scored.slice().sort((a, b) => b.sc.net - a.sc.net)[0];
  const ours = scored.find((x) => x.brand.is_ours) || scored[0];
  const anyChecked = study.brands.some((b) => {
    const ben = Object.values(b.benefits || {}).flat();
    const cst = Object.values(b.costs || {}).flat();
    return [...ben, ...cst].some((f) => f && f.checked);
  });

  const TABS = [
    { id: 'audit', label: 'Value Audit', icon: 'fa-scale-balanced' },
    { id: 'strategy', label: 'AI Strategy', icon: 'fa-chess' },
    { id: 'perception', label: 'Perception Timeline', icon: 'fa-chart-line' },
    { id: 'image', label: 'Image Simulation', icon: 'fa-image' },
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

        {/* ===================== AUDIT ===================== */}
        {tab === 'audit' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="cv-eyebrow">เปรียบเทียบคุณค่า · {study.brands.length} แบรนด์</span>
              <button className="cv-btn ghost sm" onClick={addBrand} data-testid="cv-add-brand"><i className="fa-solid fa-plus" /> เพิ่มคู่แข่ง</button>
            </div>

            {/* winner banner */}
            {anyChecked ? (
              <div className="cv-winner" style={{ marginBottom: 18, borderColor: winner.sc.net >= 0 ? '#0e5538' : '#c8102e', background: winner.sc.net >= 0 ? '#eaf3ee' : '#fdeaec' }} data-testid="cv-winner">
                <i className="fa-solid fa-trophy" style={{ fontSize: 22, color: winner.brand.color }} />
                <div>
                  <div className="cv-eyebrow">ผู้ชนะด้านคุณค่า (Net Value สูงสุด)</div>
                  <b style={{ fontSize: 18 }}>{winner.brand.name}</b>
                  <span style={{ marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>Net {winner.sc.net > 0 ? '+' : ''}{winner.sc.net}</span>
                </div>
              </div>
            ) : (
              <div className="cv-winner" style={{ marginBottom: 18, borderColor: '#6b7280', background: '#f7f4ee' }} data-testid="cv-winner">
                <i className="fa-solid fa-hand-pointer" style={{ fontSize: 20, color: '#6b7280' }} />
                <div>
                  <div className="cv-eyebrow">ยังไม่ได้ประเมิน</div>
                  <span style={{ fontSize: 14 }}>เริ่มติ๊กปัจจัย Benefit / Cost ของแต่ละแบรนด์ — หรือกดปุ่ม <b>AI</b> ให้ช่วยแนะนำว่าควรเพิ่มอะไร</span>
                </div>
              </div>
            )}

            <div className="cv-brands">
              {scored.map(({ brand, sc }) => (
                <div key={brand.id} className="cv-card" data-testid={`cv-brand-${brand.id}`}>
                  <div className="cv-brand-head" style={{ background: brand.is_ours ? '#f3f8f5' : '#fff' }}>
                    <span className="cv-brand-dot" style={{ background: brand.color }} />
                    <input className="cv-brand-name" value={brand.name}
                      onChange={(e) => updateBrand(brand.id, { name: e.target.value })} />
                    {brand.is_ours && <span className="cv-chip" style={{ background: '#0e5538', color: '#fff', border: 'none' }}>เรา</span>}
                    {!brand.is_ours && <button className="cv-x" onClick={() => removeBrand(brand.id)}><i className="fa-solid fa-trash" /></button>}
                  </div>
                  <div style={{ padding: 16 }}>
                    <ScoreGauges sc={sc} />

                    <div className="cv-sect-title" style={{ color: '#0e5538', margin: '16px 0 8px' }}>
                      <span><i className="fa-solid fa-plus" /> BENEFIT (สิ่งที่ลูกค้าได้)</span>
                    </div>
                    {BENEFIT_CATS.map((c) => (
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
                      <input type="number" value={brand.price_value}
                        data-testid={`cv-price-${brand.id}`}
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

        {/* ===================== STRATEGY ===================== */}
        {tab === 'strategy' && (
          <div className="cv-card pad" data-testid="cv-strategy">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="cv-eyebrow">AI STRATEGIC ANALYSIS · Kotler + Drucker</div>
                <h3 style={{ fontFamily: "'IBM Plex Serif', serif", fontSize: 22, margin: '4px 0' }}>บทวิเคราะห์เชิงกลยุทธ์</h3>
              </div>
              <button className="cv-btn accent" onClick={doAnalysis} disabled={analysisLoading} data-testid="cv-analyze-btn">
                {analysisLoading ? 'กำลังวิเคราะห์…' : <><i className="fa-solid fa-wand-magic-sparkles" /> วิเคราะห์ด้วย AI</>}
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              {study.ai_analysis ? <div className="cv-md" data-testid="cv-analysis-md">{renderMd(study.ai_analysis)}</div>
                : <div className="cv-empty">กดปุ่ม "วิเคราะห์ด้วย AI" เพื่อให้ AI เปรียบเทียบคุณค่าทุกแบรนด์ และแนะนำกลยุทธ์ตามหลัก Customer Value</div>}
            </div>
          </div>
        )}

        {/* ===================== PERCEPTION ===================== */}
        {tab === 'perception' && (() => {
          const profile = study.perception?.profile || 'C';
          const actual = ours.sc.benefit;
          const data = perceptionSeries(actual, profile);
          return (
            <div className="cv-card pad" data-testid="cv-perception">
              <div className="cv-eyebrow">PERCEPTION TIMELINE · ความคาดหวัง vs ประสบการณ์จริง</div>
              <p className="cv-lede" style={{ marginBottom: 14 }}>
                จำลองว่าการ "สื่อสารคุณค่า" แบบต่างๆ ส่งผลต่อความพึงพอใจระยะยาวอย่างไร (อ้างอิงคุณค่าจริงของ <b>{ours.brand.name}</b> = {actual})
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
                <b>ผลลัพธ์:</b> เมื่อใช้นานพอ ความพึงพอใจจะเข้าสู่ค่า <b style={{ color: data.series[data.series.length - 1].satisfaction >= 0 ? '#0e5538' : '#c8102e' }}>
                  {data.series[data.series.length - 1].satisfaction > 0 ? '+' : ''}{data.series[data.series.length - 1].satisfaction}</b>{' '}
                — {data.profile.note}
              </div>
            </div>
          );
        })()}

        {/* ===================== IMAGE ===================== */}
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

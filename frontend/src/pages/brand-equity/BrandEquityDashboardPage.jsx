import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import './brand-equity-styles.css';
import {
  BeTopbar, Icon, ScoreRing, RadarChart, HBar, Histogram, NPSBar, Matrix2x2,
  IdentityImageMap, AIInsightCard, WordCloud, BeLoading, StatusPill, DIMENSIONS
} from './be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const tierFor = (s) => s >= 70 ? { name: 'Healthy', th: 'แข็งแรง', color: '#10B981' }
                    : s >= 40 ? { name: 'At watch', th: 'เฝ้าระวัง', color: '#D4A017' }
                              : { name: 'At risk', th: 'เสี่ยง',     color: '#C8102E' };

const findStat = (questions, kindOrType, dim) => {
  return questions.find(q => (q.kind === kindOrType || q.type === kindOrType) && (!dim || q.dimension === dim));
};

const BrandEquityDashboardPage = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { studyId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiRunning, setAiRunning] = useState(false);
  const [activeSegment, setActiveSegment] = useState('all');
  const pollRef = useRef(null);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { load(); return () => clearInterval(pollRef.current); /* eslint-disable-next-line */ }, [studyId]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-equity/studies/${studyId}/dashboard`, authH);
      setData(r.data);
      if (r.data.ai_cache?.status === 'running' || r.data.ai_cache?.status === 'queued') {
        startPolling();
      }
    } catch (e) {
      toast.error('โหลด dashboard ไม่สำเร็จ');
    }
    setLoading(false);
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setAiRunning(true);
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/brand-equity/studies/${studyId}/ai-status`, authH);
        if (r.data.status === 'ready' || r.data.status === 'error' || r.data.status === 'no_data') {
          clearInterval(pollRef.current);
          setAiRunning(false);
          load();
        }
      } catch (e) {/* keep polling */}
    }, 3000);
  };

  const runAI = async () => {
    try {
      await axios.post(`${API}/brand-equity/studies/${studyId}/ai-analyze`, {}, authH);
      toast.success('AI analysis queued');
      startPolling();
    } catch (e) {
      toast.error('AI start ไม่สำเร็จ');
    }
  };

  const launch = async () => {
    try {
      await axios.put(`${API}/brand-equity/studies/${studyId}`, { status: 'collecting' }, authH);
      toast.success('Study เปิดรับคำตอบแล้ว');
      load();
    } catch (e) { toast.error('ไม่สำเร็จ'); }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/brand-equity/respond/${data.study.share_token}`;
    navigator.clipboard.writeText(url);
    toast.success('คัดลอก link แล้ว');
  };

  if (loading) return <div className="be-root"><BeLoading text="กำลังโหลด dashboard…"/></div>;
  if (!data) return null;

  const { study, aggregate, ai_cache, ready_for_dashboard } = data;
  const composite = aggregate?.composite || {};
  const score = Math.round(composite.overall || 0);
  const tier = tierFor(score);
  const responseCount = aggregate?.total_responses || 0;
  const targetN = study.target_responses || 100;

  return (
    <div className="be-root" data-testid="be-dashboard-page">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/brand-equity')}>
                         <Icon name="chevronL" size={10}/>Studies
                       </button>}/>

      <div className="be-page">
        {/* HERO */}
        <div className="be-hero" data-testid="be-dashboard-hero">
          <div className="be-hero-row1">
            <div className="be-hero-brand">
              <div className="be-study-logo" style={{ width: 48, height: 48, fontSize: 22,
                     background: 'linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)' }}>
                {study.brand?.name?.[0]?.toUpperCase() || 'B'}
              </div>
              <div>
                <div className="be-eyebrow" style={{ marginBottom: 4 }}>
                  STUDY · BE-{study.id?.slice(0, 8).toUpperCase()}
                </div>
                <h1 className="be-h1" style={{ fontSize: 32 }}>
                  {study.brand?.name}
                  <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 16, marginLeft: 10,
                                 fontFamily: 'IBM Plex Sans Thai' }}>Brand Health Check</span>
                </h1>
                <div className="be-mono be-tiny be-muted" style={{ marginTop: 6 }}>
                  {study.brand?.category} · {responseCount} / {targetN} respondents
                </div>
              </div>
            </div>
            <div className="be-hero-actions">
              <StatusPill status={study.status}/>
              {study.status === 'draft' && (
                <button className="be-btn be-btn-red" onClick={launch} data-testid="be-dashboard-launch">
                  <Icon name="arrowR" size={11}/>เปิดรับคำตอบ
                </button>
              )}
              <button className="be-btn" onClick={copyShareLink} data-testid="be-dashboard-share">
                <Icon name="share" size={11}/>Copy share link
              </button>
              <button className="be-btn" onClick={load} data-testid="be-dashboard-refresh">
                <Icon name="refresh" size={11}/>Refresh
              </button>
              <button className="be-btn be-btn-primary" onClick={runAI}
                      disabled={!ready_for_dashboard || aiRunning} data-testid="be-dashboard-run-ai">
                <Icon name="sparkle" size={11}/>{aiRunning ? 'AI working…' : 'Run AI analysis'}
              </button>
            </div>
          </div>

          <div className="be-hero-row2">
            <div className="be-score-block">
              <div className="be-ring">
                <ScoreRing value={score} size={148} stroke={9}/>
                <div className="be-ring-inner">
                  <div className="be-data" style={{ fontSize: 44 }}>{score}</div>
                  <div className="be-mono be-tiny be-muted">/ 100</div>
                </div>
              </div>
              <div className="be-score-meta">
                <div className="be-eyebrow">BRAND EQUITY SCORE</div>
                <div className="be-tier-line">
                  <span className="be-tier" style={{ color: tier.color }}>{tier.name}</span>
                  <span className="be-mono be-tiny be-muted">{tier.th}</span>
                </div>
                <div className="be-muted be-small" style={{ maxWidth: 320, lineHeight: 1.55, marginTop: 4 }}>
                  {score >= 70 ? 'Brand sits in healthy band — protect & defend.' :
                   score >= 40 ? 'At watch — focus on weakest dimension to lift overall.' :
                                  'At risk — fundamentals need attention.'}
                </div>
              </div>
            </div>
            <div className="be-dim-grid" data-testid="be-dim-grid">
              {Object.values(DIMENSIONS).map(d => {
                const v = Math.round(composite[d.key] || 0);
                return (
                  <div key={d.key} className="be-dim-card">
                    <div className="be-mono be-tiny" style={{ color: 'var(--ink-4)', letterSpacing: '0.10em' }}>{d.num}</div>
                    <div className="be-dim-num" style={{ color: v > 0 ? d.color : 'var(--ink-4)' }}>
                      {v > 0 ? v : '—'}
                    </div>
                    <div className="be-dim-name">{d.label}</div>
                    <div className="be-dim-bar">
                      <div className="be-dim-bar-fill" style={{ width: v + '%', background: d.color }}/>
                    </div>
                    <div className="be-mono be-tiny be-muted">{d.th}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* NOT READY */}
        {!ready_for_dashboard && (
          <div className="be-card" style={{ padding: 40, textAlign: 'center', marginTop: 20 }}
               data-testid="be-dashboard-locked">
            <div className="be-eyebrow" style={{ marginBottom: 12, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>DASHBOARD LOCKED
            </div>
            <div className="be-h2" style={{ fontSize: 22, marginBottom: 12 }}>
              ต้องการ {Math.max(0, 10 - responseCount)} responses เพิ่ม
            </div>
            <div className="be-muted be-small" style={{ marginBottom: 22, maxWidth: 480, margin: '0 auto 22px' }}>
              ต้องมีอย่างน้อย 10 responses เพื่อ unlock dashboard และ AI analysis
              · ปัจจุบัน {responseCount} responses
            </div>
            <button className="be-btn" onClick={copyShareLink}>
              <Icon name="share" size={11}/>คัดลอก link เชิญตอบ
            </button>
          </div>
        )}

        {/* DASH BODY */}
        {ready_for_dashboard && (
          <div className="be-dash-body">
            {/* LEFT RAIL */}
            <div className="be-dash-rail" data-testid="be-dashboard-rail">
              <div className="be-rail-section">
                <h5>Filter by segment</h5>
                <div className={'be-rail-item ' + (activeSegment === 'all' ? 'on' : '')}
                     onClick={() => setActiveSegment('all')}>
                  <span>All respondents</span>
                  <span className="pct">{responseCount}</span>
                </div>
              </div>
              <div className="be-rail-section">
                <h5>Study info</h5>
                <div className="be-mono be-tiny" style={{ lineHeight: 1.7, color: 'var(--ink-2)' }}>
                  Created · {new Date(study.created_at).toLocaleDateString()}<br/>
                  Updated · {new Date(study.updated_at).toLocaleDateString()}<br/>
                  Token · /{study.share_token?.slice(0, 6)}
                </div>
              </div>
              <div className="be-rail-section">
                <h5>AI status</h5>
                <div className="be-mono be-tiny" style={{ color: 'var(--ink-2)' }}>
                  Status: {ai_cache?.status || 'idle'}<br/>
                  {ai_cache?.updated_at && `Updated: ${new Date(ai_cache.updated_at).toLocaleTimeString()}`}
                </div>
              </div>
            </div>

            {/* MAIN */}
            <div className="be-dash-main">
              <SectionAwareness study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionQuality study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionIdentity study={study} aggregate={aggregate} ai={ai_cache}/>
              <SectionLoyalty study={study} aggregate={aggregate} ai={ai_cache}/>
            </div>

            {/* RIGHT RAIL — Master AI Insights */}
            <div className="be-dash-ai" data-testid="be-dashboard-ai-rail">
              <div className="be-eyebrow" style={{ marginBottom: 8 }}>MASTER AI INSIGHTS</div>
              <div style={{ fontFamily: 'IBM Plex Serif', fontSize: 18, fontWeight: 600, marginBottom: 4,
                            display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="sparkle" size={14} stroke="#C8102E"/>
                {(ai_cache?.master_insights?.length || 0) > 0 ? `${ai_cache.master_insights.length} actions for the brand team` : 'AI analysis pending'}
              </div>
              <div className="be-tiny be-muted" style={{ marginBottom: 16, lineHeight: 1.5,
                     paddingBottom: 14, borderBottom: '1px dashed var(--rule)' }}>
                Generated from {responseCount} responses + 4 dimension stats · cited to specific questions.
              </div>

              {(ai_cache?.master_insights || []).length === 0 ? (
                <div className="be-muted be-small" style={{ padding: '20px 0', textAlign: 'center' }}>
                  ยังไม่มี master insights —<br/>
                  กดปุ่ม <strong>Run AI analysis</strong> ด้านบน
                </div>
              ) : (ai_cache.master_insights || []).map((rec, i) => (
                <div key={i} className="be-ai-rec" data-testid={`be-master-insight-${i}`}>
                  <div className="be-ai-rec-head">
                    <div className="be-ai-rec-num">0{i + 1}</div>
                    <div className="be-ai-rec-headline">{rec.headline || rec.title}</div>
                  </div>
                  {rec.evidence && <div className="be-ai-rec-body">{rec.evidence}</div>}
                  {rec.recommendation && (
                    <div style={{ fontSize: 12, fontFamily: 'IBM Plex Serif', fontStyle: 'italic',
                                  color: 'var(--ink-2)', borderLeft: '2px solid var(--be-red)',
                                  paddingLeft: 10, marginBottom: 8 }}>
                      → {rec.recommendation}
                    </div>
                  )}
                  {rec.priority && <span className="be-chip be-tiny" style={{
                      color: rec.priority === 'high' ? 'var(--be-red)' :
                             rec.priority === 'medium' ? 'var(--be-gold)' : 'var(--ink-3)',
                    }}>{rec.priority?.toUpperCase()}</span>}
                </div>
              ))}

              <button className="be-btn" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}
                      onClick={runAI} disabled={aiRunning} data-testid="be-dashboard-regen-insights">
                <Icon name="refresh" size={11}/>{aiRunning ? 'Regenerating…' : 'Generate new insights'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ Section components ============

const SectionAwareness = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const tom = qs.find(q => q.kind === 'unaided_top_of_mind');
  const recall = qs.find(q => q.kind === 'unaided_recall');
  const aided = qs.find(q => q.kind === 'aided_recognition');
  const score = Math.round(aggregate?.composite?.awareness || 0);

  // Top-of-mind word cloud
  const tomCounts = tom?.stats?.counts || [];
  const target = study.brand?.name;
  const cloudWords = tomCounts.slice(0, 12).map((c, i) => ({
    text: c.label,
    size: Math.max(11, 14 + Math.round(c.pct * 0.5)),
    target: c.label?.toLowerCase().includes(target?.toLowerCase() || '___'),
    x: 12 + (i % 4) * 22 + Math.random() * 10,
    y: 18 + Math.floor(i / 4) * 26 + Math.random() * 8,
  }));

  // Unaided recall — AI normalized counts (each response may list multiple brands)
  const recallRows = (recall?.stats?.counts || []).slice(0, 8).map(c => ({
    label: c.label,
    value: c.pct,
    target: c.label?.toLowerCase().includes(target?.toLowerCase() || '___'),
  }));

  // Aided recognition bars
  const aidedRows = (aided?.stats?.counts || []).slice(0, 8).map(c => ({
    label: c.label,
    value: c.pct,
    target: c.label === target,
  }));

  const targetTomPct = tomCounts.find(c => c.label?.toLowerCase().includes(target?.toLowerCase() || '___'))?.pct || 0;

  return (
    <div className="be-section" data-testid="be-section-awareness">
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 01</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.awareness.color }}/>
            <h2 className="be-h2">Brand Awareness <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>การจดจำแบรนด์</span></h2>
          </div>
          <div className="be-section-sub">
            Top-of-mind, aided recall, and familiarity — measures how easily the brand surfaces from category cues.
          </div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100</div>
          <div><strong>{qs.filter(q => q.dimension === 'awareness').length}</strong>q</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {tomCounts.length > 0 && (
          <div className="be-card" style={{ gridColumn: 'span 2' }}>
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Top-of-Mind brand cloud</h3>
                <div className="be-card-d">
                  "แบรนด์แรกที่นึกถึง?" · n={tom?.stats?.n} · target highlighted
                  {tom?.stats?.ai_normalized && (
                    <span className="be-chip-dim be-mono"
                          style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                   border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px',
                                   fontSize: 9.5, letterSpacing: '0.06em' }}>
                      AI · NORMALIZED
                    </span>
                  )}
                </div>
              </div>
              <div className="be-card-stat">
                <span className="be-big be-num">{Math.round(targetTomPct)}</span>
                <span className="be-unit">% top-of-mind</span>
              </div>
            </div>
            <WordCloud words={cloudWords}/>
            {tom?.stats?.ai_normalized && tomCounts.some(c => (c.variants || []).length > 1) && (
              <details style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                <summary style={{ cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace',
                                   textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  ดู variants ที่ AI รวมเข้าด้วยกัน
                </summary>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {tomCounts.filter(c => (c.variants || []).length > 1).slice(0, 8).map((c, i) => (
                    <div key={i} style={{ padding: '6px 10px', background: 'var(--paper-2)', border: '1px dashed var(--rule)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>{c.label}</div>
                      <div style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                        {(c.variants || []).slice(0, 6).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {recallRows.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Unaided recall</h3>
                <div className="be-card-d">
                  "นึกถึงแบรนด์อะไรอีกบ้าง?" · n={recall?.stats?.n}
                  {recall?.stats?.ai_normalized && (
                    <span className="be-chip-dim be-mono"
                          style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                   border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px',
                                   fontSize: 9.5, letterSpacing: '0.06em' }}>
                      AI · NORMALIZED
                    </span>
                  )}
                </div>
              </div>
            </div>
            <HBar rows={recallRows} color={DIMENSIONS.awareness.color}/>
          </div>
        )}

        {aidedRows.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Aided recognition</h3>
                <div className="be-card-d">"แบรนด์ใดที่คุณรู้จัก?" · n={aided?.stats?.n}</div>
              </div>
            </div>
            <HBar rows={aidedRows} color={DIMENSIONS.awareness.color}/>
          </div>
        )}

        {/* Familiarity */}
        {qs.find(q => q.kind === 'brand_familiarity' && q.stats?.n > 0) && (() => {
          const fam = qs.find(q => q.kind === 'brand_familiarity');
          return (
            <div className="be-card">
              <div className="be-card-h">
                <div>
                  <h3 className="be-card-t">Familiarity score</h3>
                  <div className="be-card-d">5-pt scale · n={fam?.stats?.n}</div>
                </div>
                <div className="be-card-stat">
                  <span className="be-big be-num">{fam?.stats?.mean}</span>
                  <span className="be-unit">/ 5</span>
                </div>
              </div>
              <Histogram values={fam?.stats?.distribution || [0, 0, 0, 0, 0]}
                         peakIdx={(fam?.stats?.distribution || []).indexOf(Math.max(...(fam?.stats?.distribution || [0])))}
                         color={DIMENSIONS.awareness.color}
                         labels={['ไม่รู้', 'เคยได้ยิน', 'พอรู้', 'รู้ดี', 'รู้ดีมาก']}/>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

const SectionQuality = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const score = Math.round(aggregate?.composite?.quality || 0);
  const overall = qs.find(q => q.kind === 'overall_quality');

  // Build radar from likert_7 attributes
  const attrQs = qs.filter(q => q.dimension === 'quality' && q.type === 'likert_7' && q.kind !== 'overall_quality' && q.stats?.mean);
  const radarAxes = attrQs.map(q => (q.kind || '').replace('attribute_', '').toUpperCase()).slice(0, 8);
  const radarSeries = radarAxes.length >= 3 ? [
    { name: study.brand?.name, color: DIMENSIONS.quality.color,
      values: attrQs.slice(0, radarAxes.length).map(q => Math.round((q.stats?.mean || 0) / 7 * 100)) },
  ] : [];

  // Themes
  const qualityThemes = ai?.themes_by_question || {};
  const qualityOpen = qs.find(q => q.dimension === 'quality' && q.type === 'open_long');
  const themes = qualityOpen ? (qualityThemes[qualityOpen.id] || []) : [];

  return (
    <div className="be-section" data-testid="be-section-quality">
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 02</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.quality.color }}/>
            <h2 className="be-h2">Perceived Quality <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>คุณภาพที่รับรู้</span></h2>
          </div>
          <div className="be-section-sub">
            Likert ratings on quality attributes plus comparative judgement vs leading competitor.
          </div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100</div>
          <div><strong>{qs.filter(q => q.dimension === 'quality').length}</strong>q</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {radarSeries.length > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Quality attributes · radar</h3>
                <div className="be-card-d">Mean Likert (1-7) scaled to 0-100</div>
              </div>
            </div>
            <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0' }}>
              <RadarChart axes={radarAxes} series={radarSeries} size={260}/>
            </div>
          </div>
        )}

        {overall && overall.stats?.distribution && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Overall quality · distribution</h3>
                <div className="be-card-d">"คุณภาพระดับใด?" · 1-7 scale · n={overall.stats?.n}</div>
              </div>
              <div className="be-card-stat">
                <span className="be-big be-num">{overall.stats?.mean}</span>
                <span className="be-unit">mean · σ {overall.stats?.std}</span>
              </div>
            </div>
            <Histogram values={overall.stats.distribution} color={DIMENSIONS.quality.color}
                       peakIdx={overall.stats.distribution.indexOf(Math.max(...overall.stats.distribution))}/>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ padding: '8px 10px', background: 'var(--paper-2)' }}>
                <div className="be-mono be-tiny be-muted">TOP-2-BOX</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 500 }}>{overall.stats?.t2b}%</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'var(--paper-2)' }}>
                <div className="be-mono be-tiny be-muted">BOTTOM-2-BOX</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 500 }}>{overall.stats?.b2b}%</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'rgba(212,160,23,0.1)' }}>
                <div className="be-mono be-tiny be-muted">NET Q-SCORE</div>
                <div className="be-num" style={{ fontSize: 18, fontWeight: 600, color: DIMENSIONS.quality.color }}>
                  {overall.stats?.net > 0 ? '+' : ''}{overall.stats?.net}
                </div>
              </div>
            </div>
          </div>
        )}

        {themes.length > 0 && (
          <div className="be-card" style={{ gridColumn: 'span 2' }}>
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Voice of respondent · quality reasons</h3>
                <div className="be-card-d">Open-end clustered into themes by AI</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {themes.map((th, i) => (
                <div key={i} style={{ padding: 14, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{th.name}</div>
                    <div className="be-num be-tiny" style={{ color: th.sentiment > 0 ? 'var(--be-green)' : th.sentiment < 0 ? 'var(--be-red)' : 'var(--ink-3)' }}>
                      {th.count} · {th.sentiment > 0 ? '+' : ''}{th.sentiment?.toFixed(1) ?? '0'}
                    </div>
                  </div>
                  <div className="be-small be-muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>{th.description}</div>
                  {(th.sample_quotes || []).slice(0, 1).map((q, j) => (
                    <div key={j} className="be-serif be-tiny" style={{ fontStyle: 'italic', color: 'var(--ink-2)', lineHeight: 1.5 }}>"{q}"</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SectionIdentity = ({ study, aggregate, ai }) => {
  const score = Math.round(aggregate?.composite?.identity || 0);
  const qs = aggregate?.questions || [];
  const ii = ai?.identity_image || {};

  const intended = study.identity?.traits || [];
  const aligned = ii.aligned || [];
  const lost = ii.lost || [];
  const unintended = ii.unintended || [];
  const perceived = ii.perceived_traits || [];

  const statusMap = {};
  intended.forEach(t => { statusMap[t] = aligned.includes(t) ? 'aligned' : 'lost'; });

  // Build image col from perceived (top 8)
  const imageCol = perceived.slice(0, 8).map(p => ({
    trait: p.trait,
    pct: typeof p.count === 'number' ? Math.min(100, p.count) : 0,
    kind: aligned.includes(p.trait) ? 'aligned' : unintended.includes(p.trait) ? 'unintended' : 'lost',
  }));

  // 1-word identity cloud (BI-3 word_cloud question)
  const oneWord = qs.find(q => q.kind === 'image_one_word');
  const oneWordCounts = oneWord?.stats?.counts || [];
  const oneWordCloudWords = oneWordCounts.slice(0, 14).map((c, i) => ({
    text: c.label,
    size: Math.max(12, 14 + Math.round(c.pct * 0.6)),
    target: aligned.includes(c.label),
    x: 10 + (i % 5) * 18 + Math.random() * 8,
    y: 18 + Math.floor(i / 5) * 28 + Math.random() * 6,
  }));

  return (
    <div className="be-section" style={{ background: '#FBF7F1', padding: '40px 24px', margin: '0 -32px',
                                           border: '1px solid var(--rule-strong)' }}
         data-testid="be-section-identity">
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 03 · CENTERPIECE</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.identity.color }}/>
            <h2 className="be-h2">Identity vs Image <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>อัตลักษณ์ vs ภาพลักษณ์</span></h2>
          </div>
          <div className="be-section-sub">
            What the brand wants to be (left) versus what consumers actually perceive (right).
          </div>
        </div>
        <div className="be-section-meta">
          <div>Alignment <strong style={{ color: ii.alignment_score_0_100 >= 60 ? 'var(--be-green)' : 'var(--be-red)' }}>
            {ii.alignment_score_0_100 != null ? `${ii.alignment_score_0_100}%` : '—'}
          </strong></div>
          <div><strong>{aligned.length}</strong>/{intended.length} aligned</div>
          <div><strong>{score}</strong>/100</div>
        </div>
      </div>

      {!ai?.identity_image || Object.keys(ii).length === 0 ? (
        <div className="be-card" style={{ padding: 30, textAlign: 'center' }}>
          <div className="be-eyebrow" style={{ marginBottom: 10, justifyContent: 'center' }}>AI ANALYSIS PENDING</div>
          <div className="be-muted be-small">
            Identity-Image map ต้องการ AI analysis · กดปุ่ม <strong>Run AI analysis</strong> ด้านบน
          </div>
        </div>
      ) : (
        <>
          {/* Visual identity setup (AI-derived from owner inputs) */}
          {(study.identity?.ai_summary || (study.identity?.visual_palette || []).length > 0) && (
            <div className="be-card" style={{ padding: 22, marginBottom: 16,
                  background: 'var(--paper-2)' }}
                 data-testid="be-visual-identity-panel">
              <div className="be-eyebrow" style={{ marginBottom: 10 }}>
                <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>
                BRAND VISUAL IDENTITY · what the brand intended
                {study.identity?.archetype && (
                  <span className="be-chip" style={{ marginLeft: 10, background: 'var(--ink)', color: 'var(--paper)' }}>
                    {study.identity.archetype}
                  </span>
                )}
              </div>
              {study.identity?.ai_summary && (
                <div className="be-serif" style={{ fontSize: 14, fontStyle: 'italic',
                       color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>
                  "{study.identity.ai_summary}"
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {(study.identity?.visual_palette || []).length > 0 && (
                  <div>
                    <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8 }}>PALETTE</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {study.identity.visual_palette.map((hex, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 38, height: 38, background: hex, border: '1px solid var(--rule-strong)' }}/>
                          <span className="be-mono be-tiny" style={{ marginTop: 3 }}>{hex}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(study.identity?.visual_keywords || []).length > 0 && (
                  <div>
                    <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8 }}>VISUAL KEYWORDS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {study.identity.visual_keywords.map((k, i) => <span key={i} className="be-chip">{k}</span>)}
                    </div>
                  </div>
                )}
              </div>
              {(study.identity?.visual_assets || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="be-mono be-tiny be-muted" style={{ marginBottom: 8 }}>UPLOADED ASSETS · {study.identity.visual_assets.length}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {study.identity.visual_assets.map((a, i) => (
                      <div key={i} style={{ width: 80, height: 80, background: 'var(--surface)',
                              border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden', position: 'relative' }}>
                        <img src={`data:${a.mime_type};base64,${a.image_base64}`}
                             alt={a.note || ''}
                             style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}/>
                        <span className="be-mono be-tiny" style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: 'rgba(255,255,255,0.92)', textAlign: 'center', padding: '1px 0',
                                textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
                          {a.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="be-card" style={{ padding: 24 }}>
            <IdentityImageMap intended={intended} image={imageCol} statusMap={statusMap}/>
            {ii.narrative && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--rule)',
                            fontFamily: 'IBM Plex Serif', fontSize: 14, fontStyle: 'italic',
                            color: 'var(--ink-2)', lineHeight: 1.6 }}>
                "{ii.narrative}"
              </div>
            )}
          </div>

          {oneWordCloudWords.length > 0 && (
            <div className="be-card" style={{ padding: 24, marginTop: 16 }}>
              <div className="be-card-h">
                <div>
                  <h3 className="be-card-t">One-word identity cloud</h3>
                  <div className="be-card-d">
                    "อธิบาย {study.brand?.name} ในคำเดียว" · n={oneWord?.stats?.n}
                    {oneWord?.stats?.ai_normalized && (
                      <span className="be-chip-dim be-mono"
                            style={{ marginLeft: 8, color: 'var(--be-red)', background: 'rgba(200,16,46,0.06)',
                                     border: '1px solid rgba(200,16,46,0.2)', padding: '2px 6px',
                                     fontSize: 9.5, letterSpacing: '0.06em' }}>
                        AI · NORMALIZED
                      </span>
                    )}
                    {' '}· aligned highlighted in red
                  </div>
                </div>
              </div>
              <WordCloud words={oneWordCloudWords}/>
              {oneWord?.stats?.ai_normalized && oneWordCounts.some(c => (c.variants || []).length > 1) && (
                <details style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                  <summary style={{ cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace',
                                     textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    ดู variants ที่ AI รวมเข้าด้วยกัน
                  </summary>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                    {oneWordCounts.filter(c => (c.variants || []).length > 1).slice(0, 8).map((c, i) => (
                      <div key={i} style={{ padding: '6px 10px', background: 'var(--paper-2)', border: '1px dashed var(--rule)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>{c.label}</div>
                        <div style={{ fontStyle: 'italic', lineHeight: 1.5 }}>
                          {(c.variants || []).slice(0, 6).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const SectionLoyalty = ({ study, aggregate, ai }) => {
  const qs = aggregate?.questions || [];
  const score = Math.round(aggregate?.composite?.loyalty || 0);
  const nps = qs.find(q => q.kind === 'nps');
  const repeat = qs.find(q => q.kind === 'repeat_intent');
  const switching = qs.find(q => q.kind === 'switching_resistance');

  const themes = (ai?.themes_by_question || {});
  const loyOpen = qs.find(q => q.dimension === 'loyalty' && q.type === 'open_long');
  const loyThemes = loyOpen ? (themes[loyOpen.id] || []) : [];

  return (
    <div className="be-section" data-testid="be-section-loyalty" style={{ borderBottom: 0 }}>
      <div className="be-section-head">
        <div>
          <div className="be-section-num">SECTION · 04</div>
          <div className="be-section-title">
            <span className="be-accent-bar" style={{ background: DIMENSIONS.loyalty.color }}/>
            <h2 className="be-h2">Brand Loyalty <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 18, marginLeft: 6 }}>ความภักดี</span></h2>
          </div>
          <div className="be-section-sub">NPS, repeat intent, and switching resistance.</div>
        </div>
        <div className="be-section-meta">
          <div><strong>{score}</strong>/100</div>
          <div><strong>{qs.filter(q => q.dimension === 'loyalty').length}</strong>q</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {nps && nps.stats?.n > 0 && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Net Promoter Score</h3>
                <div className="be-card-d">"จะแนะนำ?" · scale 0-10 · n={nps.stats?.n}</div>
              </div>
            </div>
            <NPSBar detractors={nps.stats?.detractors} passives={nps.stats?.passives} promoters={nps.stats?.promoters}/>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
              <div><div className="be-mono be-tiny be-muted">NPS</div>
                   <div className="be-data" style={{ fontSize: 24, color: nps.stats?.score >= 0 ? 'var(--be-green)' : 'var(--be-red)' }}>
                     {nps.stats?.score > 0 ? '+' : ''}{nps.stats?.score}</div></div>
              <div><div className="be-mono be-tiny be-muted">PROMOTERS</div>
                   <div className="be-data" style={{ fontSize: 24 }}>{nps.stats?.promoters_pct}%</div></div>
              <div><div className="be-mono be-tiny be-muted">DETRACTORS</div>
                   <div className="be-data" style={{ fontSize: 24 }}>{nps.stats?.detractors_pct}%</div></div>
            </div>
          </div>
        )}

        {(repeat || switching) && (
          <div className="be-card">
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Repeat intent & switching resistance</h3>
                <div className="be-card-d">7-pt Likert</div>
              </div>
            </div>
            <div style={{ padding: '10px 0' }}>
              {repeat && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span>Repeat intent</span>
                    <span className="be-num">{repeat.stats?.mean} / 7</span>
                  </div>
                  <div className="be-hbar" style={{ height: 14 }}>
                    <div className="be-hbar-fill" style={{ width: ((repeat.stats?.mean || 0) / 7 * 100) + '%', background: DIMENSIONS.loyalty.color }}/>
                  </div>
                </div>
              )}
              {switching && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                    <span>Switching resistance (vs 20% discount)</span>
                    <span className="be-num">{switching.stats?.mean} / 7</span>
                  </div>
                  <div className="be-hbar" style={{ height: 14 }}>
                    <div className="be-hbar-fill" style={{ width: ((switching.stats?.mean || 0) / 7 * 100) + '%', background: DIMENSIONS.quality.color }}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {loyThemes.length > 0 && (
          <div className="be-card" style={{ gridColumn: 'span 2' }}>
            <div className="be-card-h">
              <div>
                <h3 className="be-card-t">Why customers stay</h3>
                <div className="be-card-d">Open-end clustered by AI · top themes</div>
              </div>
            </div>
            {loyThemes.map((t, i) => {
              const pct = Math.min(100, (t.count || 0));
              return (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < loyThemes.length - 1 ? '1px dashed var(--rule)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{t.name}</span>
                    <span className="be-mono be-tiny be-muted">n={t.count}</span>
                  </div>
                  <div className="be-hbar" style={{ height: 3, marginBottom: 6 }}>
                    <div className="be-hbar-fill" style={{ width: pct + '%', background: DIMENSIONS.loyalty.color }}/>
                  </div>
                  {(t.sample_quotes || []).slice(0, 1).map((q, j) => (
                    <div key={j} className="be-serif be-tiny" style={{ fontStyle: 'italic', color: 'var(--ink-3)', lineHeight: 1.5 }}>"{q}"</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandEquityDashboardPage;

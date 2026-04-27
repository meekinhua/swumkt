/* Brand Equity — Shared Components
   Editorial / Swiss-grid analytics aesthetic.
   All components are scoped via .be-root parent. */
import React, { useEffect, useState } from 'react';

// ============ Inline icon system (line-art, 16px viewBox) ============
const ICON_PATHS = {
  download: <><path d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5"/><path d="M2 12v2.5h12V12"/></>,
  share: <><circle cx="3" cy="8" r="2"/><circle cx="13" cy="3.5" r="2"/><circle cx="13" cy="12.5" r="2"/><path d="M5 7l6-3M5 9l6 3"/></>,
  refresh: <><path d="M14 3v4h-4M2 13V9h4"/><path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9L2 13M2.5 8a5.5 5.5 0 0 1 9.4-3.9L14 3"/></>,
  close: <path d="M3 3l10 10M13 3L3 13"/>,
  check: <path d="M3 8l3 3 7-7" strokeWidth="2"/>,
  plus: <path d="M8 3v10M3 8h10"/>,
  chevron: <path d="M5 6l3 3 3-3"/>,
  chevronR: <path d="M6 5l3 3-3 3"/>,
  chevronL: <path d="M10 5l-3 3 3 3"/>,
  edit: <><path d="M2.5 13.5h2L13 5l-2-2-8.5 8.5z"/><path d="M10 4l2 2"/></>,
  copy: <><rect x="4" y="4" width="9" height="9" rx="1"/><path d="M2 11V3a1 1 0 0 1 1-1h8"/></>,
  trash: <><path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4"/></>,
  sparkle: <><path d="M8 2v4M8 10v4M2 8h4M10 8h4"/><path d="M4 4l2.5 2.5M9.5 9.5L12 12M4 12l2.5-2.5M9.5 6.5L12 4"/></>,
  arrowR: <path d="M3 8h10m0 0L9 4m4 4l-4 4"/>,
  arrowDown: <path d="M8 3v10m0 0l-4-4m4 4l4-4"/>,
  search: <><circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/></>,
  bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></>,
  brain: <><path d="M5 4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/><path d="M8 4v8M5.5 7h2M8.5 7h2"/></>,
  star: <path d="M8 2l1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.4 4.4 13.3l.7-4.1-3-2.9 4.1-.6L8 2z"/>,
  masks: <><circle cx="5.5" cy="8" r="3.5"/><circle cx="10.5" cy="8" r="3.5"/></>,
  heart: <path d="M8 13s-5-3.5-5-7a2.5 2.5 0 0 1 5-1 2.5 2.5 0 0 1 5 1c0 3.5-5 7-5 7z"/>,
  external: <><path d="M9 3h4v4"/><path d="M13 3l-7 7"/><path d="M11 9v4H3V5h4"/></>,
};

export const Icon = ({ name, size = 14, stroke = 'currentColor', sw = 1.5, fill = 'none', ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {ICON_PATHS[name]}
  </svg>
);

// ============ Dimension config ============
export const DIMENSIONS = {
  awareness: { key: 'awareness', label: 'Awareness',         th: 'การจดจำ',                num: '01', color: '#1B75BC', icon: 'brain' },
  quality:   { key: 'quality',   label: 'Perceived Quality', th: 'คุณภาพที่รับรู้',         num: '02', color: '#D4A017', icon: 'star' },
  identity:  { key: 'identity',  label: 'Identity vs Image', th: 'อัตลักษณ์ vs ภาพลักษณ์',  num: '03', color: '#C8102E', icon: 'masks' },
  loyalty:   { key: 'loyalty',   label: 'Loyalty',           th: 'ความภักดี',              num: '04', color: '#10B981', icon: 'heart' },
};

// ============ Score ring ============
export const ScoreRing = ({ value = 0, size = 148, stroke = 9, color }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tier = value >= 70 ? '#10B981' : value >= 40 ? '#D4A017' : '#C8102E';
  const ringColor = color || tier;
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), 80); return () => clearTimeout(t); }, [value]);
  const offset = c - (v / 100) * c;
  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }} data-testid="be-score-ring">
      <g style={{ transform: `rotate(-90deg)`, transformOrigin: 'center' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(20,22,26,0.07)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
                strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }}/>
      </g>
    </svg>
  );
};

// ============ Radar (polygonal grid, straight lines) ============
export const RadarChart = ({ axes, series, size = 280, onAxisClick, selectedAxes = [], testidPrefix = 'be-radar-axis' }) => {
  const cx = size / 2, cy = size / 2;
  const max = 100;
  const levels = [25, 50, 75, 100];
  const n = axes.length || 3;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, vv) => {
    const safe = vv == null ? 0 : vv;
    const r = (safe / max) * (size / 2 - 36);
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };
  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }} data-testid="be-radar">
      {levels.map((lv, i) => (
        <polygon key={i} points={axes.map((_, j) => pt(j, lv).join(',')).join(' ')}
                 fill="none" stroke="rgba(20,22,26,0.10)" strokeWidth="1" strokeDasharray={i < 3 ? '2 3' : '0'}/>
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(20,22,26,0.10)" strokeWidth="1"/>;
      })}
      {series.map((s, si) => {
        // Skip rendering if all values are null
        const validVals = s.values.map(v => v == null ? 0 : v);
        if (validVals.every(v => v === 0)) return null;
        return (
          <g key={si}>
            <polygon points={s.values.map((vv, i) => pt(i, vv == null ? 0 : vv).join(',')).join(' ')}
                     fill={s.color} fillOpacity={s.fill ?? 0.10}
                     stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || '0'}/>
            {s.values.map((vv, i) => (vv == null ? null :
              <circle key={i} cx={pt(i, vv)[0]} cy={pt(i, vv)[1]} r="3.5" fill={s.color}/>
            ))}
          </g>
        );
      })}
      {axes.map((axis, i) => {
        const [x, y] = pt(i, 122);
        const isSel = selectedAxes.includes(axis);
        return (
          <g key={i} style={{ cursor: onAxisClick ? 'pointer' : 'default' }}
             onClick={() => onAxisClick && onAxisClick(axis)}
             data-testid={`${testidPrefix}-${axis}`}>
            {isSel && <circle cx={x} cy={y} r="11" fill="#C8102E" opacity="0.18"/>}
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="10.5" fontFamily="IBM Plex Mono, monospace"
                  fill={isSel ? '#C8102E' : '#3B3D43'}
                  fontWeight={isSel ? 600 : 500}
                  textDecoration={onAxisClick && !isSel ? 'underline dotted' : 'none'}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.06em', userSelect: 'none' }}>{axis}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ============ 2D Perceptual Map ============
export const PerceptualMap = ({ xAxis, yAxis, dots = [], size = 360 }) => {
  // dots: [{name, x, y, kind ('brand'|'competitor'), color}]
  const pad = 50;
  const inner = size - pad * 2;
  const toX = (v) => pad + (v / 100) * inner;
  const toY = (v) => size - pad - (v / 100) * inner;
  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }} data-testid="be-perceptual-map">
      {/* Quadrant background */}
      <rect x={pad} y={pad} width={inner} height={inner} fill="rgba(20,22,26,0.02)" stroke="rgba(20,22,26,0.15)"/>
      {/* Crosshair at 50/50 */}
      <line x1={pad + inner / 2} y1={pad} x2={pad + inner / 2} y2={size - pad}
            stroke="rgba(20,22,26,0.20)" strokeWidth="1" strokeDasharray="3 3"/>
      <line x1={pad} y1={pad + inner / 2} x2={size - pad} y2={pad + inner / 2}
            stroke="rgba(20,22,26,0.20)" strokeWidth="1" strokeDasharray="3 3"/>
      {/* Axis labels */}
      <text x={size - pad} y={pad + inner / 2 - 6} textAnchor="end" fontSize="10.5"
            fontFamily="IBM Plex Mono, monospace" fill="#3B3D43"
            style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{xAxis} →</text>
      <text x={pad + inner / 2 + 6} y={pad - 8} fontSize="10.5"
            fontFamily="IBM Plex Mono, monospace" fill="#3B3D43"
            style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>↑ {yAxis}</text>
      {/* Dots */}
      {dots.map((d, i) => {
        const cx = toX(d.x), cy = toY(d.y);
        const r = d.kind === 'brand' ? 9 : 6;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={d.color || (d.kind === 'brand' ? '#C8102E' : '#5C5F66')}
                    fillOpacity={d.kind === 'brand' ? 0.85 : 0.55}
                    stroke={d.kind === 'brand' ? '#0A0A0A' : 'transparent'} strokeWidth="2"/>
            <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize="11.5"
                  fontFamily="IBM Plex Serif, Georgia, serif"
                  fontWeight={d.kind === 'brand' ? 600 : 500}
                  fill="#0A0A0A">{d.name}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ============ Horizontal bar list ============
export const HBar = ({ rows, color = '#1B75BC' }) => (
  <div className="be-hbar-list" data-testid="be-hbar-list">
    {rows.map((r, i) => (
      <div key={i} className={'be-hbar-row' + (r.target ? ' target' : '')}>
        <div className="be-hbar-row-lbl">{r.label}</div>
        <div className="be-hbar"><div className="be-hbar-fill"
          style={{ width: r.value + '%', background: r.target ? color : color + '70' }}/></div>
        <div className="be-num be-tiny" style={{ textAlign: 'right' }}>{r.value}%</div>
      </div>
    ))}
  </div>
);

// ============ Histogram ============
export const Histogram = ({ values, peakIdx, color = '#D4A017', labels }) => {
  const max = Math.max(...values, 1);
  return (
    <>
      <div className="be-hist">
        {values.map((v, i) => (
          <div key={i} className={'be-hist-col' + (i === peakIdx ? ' peak' : '')}
               style={{ height: (v / max * 100) + '%', background: color, opacity: i === peakIdx ? 1 : 0.55 }}/>
        ))}
      </div>
      <div className="be-hist-labels be-mono">
        {(labels || values.map((_, i) => i + 1)).map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </>
  );
};

// ============ Word cloud (positioned absolute) ============
export const WordCloud = ({ words = [] }) => (
  <div className="be-cloud" data-testid="be-cloud">
    {words.map((w, i) => (
      <span key={i} className={w.target ? 'target' : ''} style={{
        fontSize: w.size + 'px',
        left: w.x + '%', top: w.y + '%',
        transform: `translate(-50%, -50%)`, opacity: w.opacity || 1,
      }}>{w.text}</span>
    ))}
  </div>
);

// ============ NPS bar ============
export const NPSBar = ({ detractors = 0, passives = 0, promoters = 0 }) => {
  const total = Math.max(detractors + passives + promoters, 1);
  return (
    <div className="be-nps-bar" data-testid="be-nps-bar">
      <div className="be-nps-seg be-nps-detractor" style={{ flex: detractors || 0.001 }}>
        <div className="be-nps-pct">{Math.round(detractors / total * 100)}%</div>
        <div className="be-tiny be-mono">DETRACTORS</div>
      </div>
      <div className="be-nps-seg be-nps-passive" style={{ flex: passives || 0.001 }}>
        <div className="be-nps-pct">{Math.round(passives / total * 100)}%</div>
        <div className="be-tiny be-mono">PASSIVES</div>
      </div>
      <div className="be-nps-seg be-nps-promoter" style={{ flex: promoters || 0.001 }}>
        <div className="be-nps-pct">{Math.round(promoters / total * 100)}%</div>
        <div className="be-tiny be-mono">PROMOTERS</div>
      </div>
    </div>
  );
};

// ============ 2x2 Matrix ============
export const Matrix2x2 = ({ dots = [], xLabel = 'Switching cost', yLabel = 'Loyalty' }) => (
  <div className="be-matrix" data-testid="be-matrix">
    <div className="be-matrix-axis-y be-mono">↑ {yLabel}</div>
    <div className="be-matrix-axis-x be-mono">{xLabel} →</div>
    <div className="be-matrix-quad-label tl">Loyal advocates</div>
    <div className="be-matrix-quad-label tr">Locked-in</div>
    <div className="be-matrix-quad-label bl">At risk</div>
    <div className="be-matrix-quad-label br">Habitual</div>
    {dots.map((d, i) => (
      <div key={i} className="be-matrix-dot" style={{
        left: d.x + '%', top: (100 - d.y) + '%',
        width: d.r * 2 + 'px', height: d.r * 2 + 'px',
        marginLeft: -d.r, marginTop: -d.r,
        background: d.color || '#10B981',
        opacity: d.opacity ?? 0.55,
        border: d.target ? '2px solid #0A0A0A' : 'none',
      }}/>
    ))}
  </div>
);

// ============ Identity vs Image connector ============
export const IdentityImageMap = ({ intended = [], image = [], statusMap = {} }) => (
  <div className="be-ident-map" data-testid="be-ident-map">
    <div className="be-ident-col">
      <div className="be-ident-col-h be-eyebrow">
        <span className="be-dot-sm" style={{ background: '#0A0A0A' }}/>
        Identity · ที่แบรนด์ตั้งใจ
      </div>
      {intended.map((t, i) => (
        <div key={i} className={'be-ident-trait ' + (statusMap[t] === 'aligned' ? 'aligned' : 'lost')}>
          <span>{t}</span>
          <span className="be-mono be-tiny">{statusMap[t] === 'aligned' ? '✓ aligned' : '✕ lost'}</span>
        </div>
      ))}
    </div>
    <div className="be-ident-connector">
      <svg width="100%" height="100%" viewBox="0 0 130 380" preserveAspectRatio="none">
        {intended.slice(0, 5).map((t, i) => {
          const startY = 30 + i * 60;
          const endY = 30 + i * 50;
          const status = statusMap[t];
          if (status === 'aligned') {
            return <path key={i} d={`M 0 ${startY} C 65 ${startY}, 65 ${endY}, 130 ${endY}`}
                         fill="none" stroke="#10B981" strokeWidth="2" opacity="0.85"/>;
          }
          return <path key={i} d={`M 0 ${startY} C 65 ${startY}, 65 ${endY + 80}, 130 ${endY + 80}`}
                       fill="none" stroke="#C8102E" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7"/>;
        })}
      </svg>
    </div>
    <div className="be-ident-col">
      <div className="be-ident-col-h be-eyebrow">
        <span className="be-dot-sm" style={{ background: '#C8102E' }}/>
        Image · ที่ผู้บริโภครับรู้
      </div>
      {image.map((t, i) => (
        <div key={i} className={'be-ident-trait ' + (t.kind || 'unintended')}>
          <span>{t.trait}</span>
          <span className="be-mono be-tiny">{t.pct}%</span>
        </div>
      ))}
    </div>
  </div>
);

// ============ AI insight card ============
export const AIInsightCard = ({ dimension = 'awareness', title, bullets = [], priority = false }) => {
  const dim = DIMENSIONS[dimension] || DIMENSIONS.awareness;
  return (
    <div className={'be-ai-card' + (priority ? ' priority' : '')}
         style={{ borderLeft: `4px solid ${dim.color}` }} data-testid={`be-ai-card-${dimension}`}>
      <div className="be-ai-head be-eyebrow">
        <span className="be-dot-sm be-pulse" style={{ background: dim.color }}/>
        {title || `AI Insight · ${dim.label}`}
      </div>
      {bullets.map((b, i) => (
        <div key={i} className="be-ai-bullet">
          <span className="be-ai-marker" style={{ color: priority ? '#C8102E' : dim.color }}>
            {priority && i === 0 ? '!' : '→'}
          </span>
          <div className="be-ai-text">{b}</div>
        </div>
      ))}
    </div>
  );
};

// ============ Stepper ============
export const Stepper = ({ steps = [], current = 0 }) => (
  <div className="be-stepper" data-testid="be-stepper">
    {steps.map((s, i) => (
      <div key={i} className={'be-step ' + (i < current ? 'done' : i === current ? 'on' : '')}>
        <div className="be-step-top">
          <span className="be-step-num">{i < current ? <Icon name="check" size={9} stroke="#F7F4EE"/> : i + 1}</span>
          {s}
        </div>
        <div className="be-step-bar"/>
      </div>
    ))}
  </div>
);

// ============ Status chip / ink-stamp ============
export const InkStamp = ({ label, color = '#0A0A0A' }) => (
  <span className="be-ink-stamp" style={{ borderColor: color, color }}>{label}</span>
);

// ============ Status pill (colored) ============
export const StatusPill = ({ status }) => {
  const conf = {
    draft:      { label: 'Draft',      color: '#6B6D74' },
    collecting: { label: 'Collecting', color: '#1B75BC' },
    analyzing:  { label: 'Analyzing',  color: '#D4A017' },
    completed:  { label: 'Completed',  color: '#10B981' },
    closed:     { label: 'Closed',     color: '#6B6D74' },
  }[status] || { label: status, color: '#6B6D74' };
  return (
    <span className="be-status-pill be-mono" style={{ color: conf.color, borderColor: conf.color + '60' }}>
      <span className="be-dot-sm" style={{ background: conf.color }}/>{conf.label}
    </span>
  );
};

// ============ Top bar ============
export const BeTopbar = ({ user, onLogo, right }) => (
  <div className="be-topbar">
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <div className="be-logo" onClick={onLogo} data-testid="be-logo">
        <span className="be-logo-dot"/>
        <span>SWU · Marketing Research</span>
      </div>
      <div className="be-topnav be-mono">
        <a href="/dashboard">Surveys</a>
        <a href="/market-research/conjoint-analysis">Conjoint</a>
        <span className="on">Brand Equity</span>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {right}
      {user && <div className="be-avatar">{user.fullName?.[0] || user.email?.[0] || 'U'}</div>}
    </div>
  </div>
);

// ============ Loading ============
export const BeLoading = ({ text = 'Loading…' }) => (
  <div className="be-loading"><span className="be-spinner"/><span className="be-mono be-tiny">{text}</span></div>
);

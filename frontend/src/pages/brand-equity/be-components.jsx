/* Brand Equity — Shared Components
   Editorial / Swiss-grid analytics aesthetic.
   All components are scoped via .be-root parent. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import UnifiedTopbar from '@/components/UnifiedTopbar';
import { getBrandHealthTier } from '@/lib/brandHealthVerdict';

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
  // One canonical 5-tier scale for every surface (see @/lib/brandHealthVerdict).
  // This was a private >=70 / >=40 mapping, so the ring could be green while the
  // headline next to it said "เฝ้าระวัง".
  const tier = getBrandHealthTier(value).color;
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

// ============ Radar (polygonal grid, straight lines, null-aware path) ============
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
  // Build a closed path that skips null entries entirely (connects only valid neighbors)
  const seriesPath = (vals) => {
    const idx = vals.map((v, i) => v == null ? null : i).filter(i => i != null);
    if (idx.length < 2) return '';
    const pts = idx.map(i => pt(i, vals[i]));
    return 'M ' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ' Z';
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
        const validCount = s.values.filter(v => v != null).length;
        if (validCount < 2) return null;
        const d = seriesPath(s.values);
        return (
          <g key={si}>
            <path d={d}
                  fill={s.color} fillOpacity={s.fill ?? 0.10}
                  stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || '0'}
                  strokeLinejoin="round"/>
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
export const PerceptualMap = ({ xAxis, yAxis, dots = [], size = 360,
                                xRange, yRange, normalized = true }) => {
  // dots: [{name, x, y, kind ('brand'|'competitor'), color, rawX, rawY}]
  // xRange/yRange: [min, max] of the underlying raw values (e.g. 0-100 or actual data min/max)
  const pad = 56;
  const inner = size - pad * 2;
  const xMin = xRange?.[0] ?? 0, xMax = xRange?.[1] ?? 100;
  const yMin = yRange?.[0] ?? 0, yMax = yRange?.[1] ?? 100;
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  // when normalized, the dot.x / dot.y are already 0-100 within the rescaled range
  const toX = (v) => pad + (v / 100) * inner;
  const toY = (v) => size - pad - (v / 100) * inner;
  const fmt = (v) => v == null ? '' : (v >= 10 ? Math.round(v) : v.toFixed(1));
  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }} data-testid="be-perceptual-map">
      {/* Quadrant background */}
      <rect x={pad} y={pad} width={inner} height={inner} fill="rgba(20,22,26,0.02)" stroke="rgba(20,22,26,0.15)"/>
      {/* Crosshair at MID (50% in normalized space) */}
      <line x1={pad + inner / 2} y1={pad} x2={pad + inner / 2} y2={size - pad}
            stroke="rgba(20,22,26,0.20)" strokeWidth="1" strokeDasharray="3 3"/>
      <line x1={pad} y1={pad + inner / 2} x2={size - pad} y2={pad + inner / 2}
            stroke="rgba(20,22,26,0.20)" strokeWidth="1" strokeDasharray="3 3"/>
      {/* Axis labels — both placed OUTSIDE the chart box so they never overlap the grid:
          X-axis at bottom-right, Y-axis at top-left (symmetric corners). */}
      <text x={size - pad} y={size - pad + 32} textAnchor="end" fontSize="10.5"
            fontFamily="IBM Plex Mono, monospace" fill="#3B3D43"
            style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{xAxis} →</text>
      <text x={pad} y={pad - 18} textAnchor="start" fontSize="10.5"
            fontFamily="IBM Plex Mono, monospace" fill="#3B3D43"
            style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>↑ {yAxis}</text>
      {/* Axis range tickmarks (corners) */}
      <text x={pad - 4} y={size - pad + 14} textAnchor="end" fontSize="9.5"
            fontFamily="IBM Plex Mono, monospace" fill="#A6A8AF">{fmt(xMin)}</text>
      <text x={size - pad + 4} y={size - pad + 14} fontSize="9.5"
            fontFamily="IBM Plex Mono, monospace" fill="#A6A8AF">{fmt(xMax)}</text>
      <text x={pad - 6} y={pad - 4} textAnchor="end" fontSize="9.5"
            fontFamily="IBM Plex Mono, monospace" fill="#A6A8AF">{fmt(yMax)}</text>
      <text x={pad - 6} y={size - pad + 4} textAnchor="end" fontSize="9.5"
            fontFamily="IBM Plex Mono, monospace" fill="#A6A8AF">{fmt(yMin)}</text>
      {normalized && (
        <text x={pad + inner / 2} y={size - pad + 18} textAnchor="middle" fontSize="9"
              fontFamily="IBM Plex Mono, monospace" fill="#A6A8AF"
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          axes auto-zoomed · midline {fmt(xMid)} × {fmt(yMid)}
        </text>
      )}
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
            {d.rawX != null && d.rawY != null && (
              <text x={cx} y={cy + r + 12} textAnchor="middle" fontSize="9.5"
                    fontFamily="IBM Plex Mono, monospace" fill="#5C5F66"
                    style={{ letterSpacing: '0.04em' }}>
                {fmt(d.rawX)}, {fmt(d.rawY)}
              </text>
            )}
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

// ============ TrendLine (score history over time) ============
// points: [{ label, n, values: { key: number|null } }]
// series: [{ key, label, color }]
export const TrendLine = ({ points = [], series = [], height = 240, testid = 'be-trendline' }) => {
  const W = 860, PAD_L = 44, PAD_R = 24, PAD_T = 14, PAD_B = 34;
  const H = height;
  const n = points.length;
  const x = (i) => (n <= 1 ? PAD_L : PAD_L + (i * (W - PAD_L - PAD_R)) / (n - 1));
  const y = (v) => PAD_T + (1 - (v / 100)) * (H - PAD_T - PAD_B);

  return (
    <div style={{ overflowX: 'auto' }} data-testid={testid}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, display: 'block' }}>
        {[0, 25, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)}
                  stroke="rgba(26,26,26,0.10)" strokeDasharray={g === 0 ? '' : '3 4'}/>
            <text x={PAD_L - 8} y={y(g) + 3} textAnchor="end"
                  style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', fill: '#8A8D94' }}>{g}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H - 14}
                textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
                style={{ fontSize: 9.5, fontFamily: 'IBM Plex Mono, monospace', fill: '#5C5F66' }}>
            {p.label} <tspan style={{ fill: '#A6A8AF' }}>n={p.n}</tspan>
          </text>
        ))}
        {series.map(s => {
          const pts = points.map((p, i) => [i, p.values?.[s.key]])
                            .filter(([, v]) => typeof v === 'number');
          if (!pts.length) return null;
          const d = pts.map(([i, v], k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.key} data-testid={`${testid}-series-${s.testid || s.key}`}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.key === 'overall' ? 2.6 : 1.6}
                    strokeDasharray={s.key === 'overall' ? '' : '5 4'}/>
              {pts.map(([i, v]) => (
                <g key={i}>
                  <circle cx={x(i)} cy={y(v)} r={s.key === 'overall' ? 4.5 : 3} fill={s.color}/>
                  {s.key === 'overall' && (
                    <text x={x(i)} y={y(v) - 10} textAnchor="middle"
                          style={{ fontSize: 10, fontWeight: 700, fill: s.color,
                                   fontFamily: 'IBM Plex Mono, monospace' }}>{Math.round(v)}</text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};


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
// Lines connect the actual DOM y-positions of each row (measured at runtime),
// so the curve endpoints anchor on the correct trait on each side regardless
// of how many rows the column has. We keep recomputing on layout changes
// (window resize, data updates, font load) so the diagram stays in sync.
//
//   • aligned intended trait → image row tagged kind='aligned' (or same name
//                                fuzzy match if status tag missing)
//     drawn as a solid GREEN Bezier curve.
//   • lost intended trait    → short red dashed stub on LEFT only, no target.
//   • unintended image trait → short gold dashed stub on RIGHT only, no source.
const _norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[·•/(),.-]/g, '');

const _findMatchingImageIdx = (intendedTrait, image) => {
  if (!intendedTrait) return -1;
  const target = _norm(intendedTrait);
  // 1. exact match on kind=aligned + same trait
  for (let i = 0; i < image.length; i++) {
    if (image[i].kind === 'aligned' && _norm(image[i].trait) === target) return i;
  }
  // 2. fuzzy substring match within aligned items
  for (let i = 0; i < image.length; i++) {
    if (image[i].kind !== 'aligned') continue;
    const im = _norm(image[i].trait);
    if (im.includes(target) || target.includes(im)) return i;
  }
  // 3. fuzzy substring on ANY image row (the wizard often returns "Premium /
  //    Expensive" as a perceived trait that AI didn't tag as `aligned` exactly,
  //    but is clearly the intended "Premium"). Best-effort match so the user
  //    sees a connector instead of a confusing "no-match" stub.
  for (let i = 0; i < image.length; i++) {
    const im = _norm(image[i].trait);
    if (!im) continue;
    if (im === target) return i;
    if (im.includes(target) || target.includes(im)) return i;
  }
  return -1;
};

export const IdentityImageMap = ({ intended = [], image = [], statusMap = {} }) => {
  const wrapRef = useRef(null);
  const leftRefs = useRef([]);
  const rightRefs = useRef([]);
  const [paths, setPaths] = useState([]);
  const [wrapH, setWrapH] = useState(380);

  // Recompute every time data changes or layout shifts.
  useLayoutEffect(() => {
    const compute = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      setWrapH(Math.max(120, wrapRect.height));
      const claimed = new Set();
      const next = [];
      intended.forEach((t, i) => {
        const el = leftRefs.current[i];
        if (!el) return;
        const r = el.getBoundingClientRect();
        const y = r.top - wrapRect.top + r.height / 2;
        const status = statusMap[t];
        if (status === 'aligned') {
          // find matching right item
          let matchIdx = _findMatchingImageIdx(t, image);
          // skip already-claimed to keep crossings sane
          while (matchIdx !== -1 && claimed.has(matchIdx)) {
            const nextIdx = image.findIndex((im, idx) =>
              idx > matchIdx && im.kind === 'aligned' && !claimed.has(idx));
            matchIdx = nextIdx;
          }
          if (matchIdx !== -1 && rightRefs.current[matchIdx]) {
            claimed.add(matchIdx);
            const rr = rightRefs.current[matchIdx].getBoundingClientRect();
            const y2 = rr.top - wrapRect.top + rr.height / 2;
            next.push({ kind: 'aligned', y1: y, y2 });
          } else {
            // aligned but no match found — draw outgoing stub
            next.push({ kind: 'aligned-stub', y1: y });
          }
        } else {
          next.push({ kind: 'lost', y1: y });
        }
      });
      // Right-side unintended stubs (incoming gold from right edge)
      image.forEach((im, i) => {
        if (im.kind !== 'unintended') return;
        const el = rightRefs.current[i];
        if (!el) return;
        const rr = el.getBoundingClientRect();
        const y2 = rr.top - wrapRect.top + rr.height / 2;
        next.push({ kind: 'unintended', y2 });
      });
      setPaths(next);
    };
    compute();
    // Refresh on resize + after any pending font load that shifts heights.
    const ro = new ResizeObserver(compute);
    if (wrapRef.current) ro.observe(wrapRef.current);
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    const t = setTimeout(compute, 350);  // post-font-load nudge
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [intended, image, statusMap]);

  const STROKE_GREEN  = '#10B981';
  const STROKE_RED    = '#C8102E';
  const STROKE_GOLD   = '#D4A017';

  return (
    <div>
    <div className="be-ident-legend" data-testid="be-ident-legend">
      <span className="be-ident-legend-item">
        <svg width="28" height="10" aria-hidden="true">
          <path d="M0 5 C 14 5, 14 5, 28 5" stroke="#10B981" strokeWidth="2" fill="none"/>
          <circle cx="0" cy="5" r="2.5" fill="#10B981"/>
          <circle cx="28" cy="5" r="2.5" fill="#10B981"/>
        </svg>
        <strong>Aligned</strong> — Identity ที่ผู้บริโภครับรู้ตรงตามที่ตั้งใจ
      </span>
      <span className="be-ident-legend-item">
        <svg width="28" height="10" aria-hidden="true">
          <path d="M0 5 L 22 5" stroke="#C8102E" strokeWidth="1.4" strokeDasharray="3 3" fill="none"/>
          <text x="24" y="8" fontSize="9" fill="#C8102E" fontWeight="bold">✕</text>
        </svg>
        <strong>Lost</strong> — ตั้งใจสื่อแต่ไม่ถูกรับรู้
      </span>
      <span className="be-ident-legend-item">
        <svg width="28" height="10" aria-hidden="true">
          <path d="M28 5 L 6 5" stroke="#D4A017" strokeWidth="1.4" strokeDasharray="3 3" fill="none"/>
          <text x="4" y="8" fontSize="9" fill="#D4A017" fontWeight="bold" textAnchor="end">+</text>
        </svg>
        <strong>Unintended</strong> — รับรู้แต่ไม่ได้ตั้งใจสื่อ
      </span>
    </div>
    <div className="be-ident-map" data-testid="be-ident-map" ref={wrapRef}>
      <div className="be-ident-col" data-testid="be-ident-col-intended">
        <div className="be-ident-col-h be-eyebrow">
          <span className="be-dot-sm" style={{ background: '#0A0A0A' }}/>
          Identity · ที่แบรนด์ตั้งใจ
        </div>
        {intended.map((t, i) => (
          <div key={i}
               ref={el => (leftRefs.current[i] = el)}
               className={'be-ident-trait ' + (statusMap[t] === 'aligned' ? 'aligned' : 'lost')}
               data-testid={`be-ident-intended-${i}`}>
            <span>{t}</span>
            <span className="be-mono be-tiny">{statusMap[t] === 'aligned' ? '✓ aligned' : '✕ lost'}</span>
          </div>
        ))}
      </div>

      <div className="be-ident-connector" aria-hidden="true">
        <svg width="100%" height="100%" viewBox={`0 0 130 ${wrapH}`}
             preserveAspectRatio="none">
          {paths.map((p, i) => {
            if (p.kind === 'aligned') {
              const d = `M 0 ${p.y1} C 65 ${p.y1}, 65 ${p.y2}, 130 ${p.y2}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke={STROKE_GREEN}
                        strokeWidth="2" opacity="0.85"/>
                  <circle cx="0"   cy={p.y1} r="3" fill={STROKE_GREEN}/>
                  <circle cx="130" cy={p.y2} r="3" fill={STROKE_GREEN}/>
                </g>
              );
            }
            if (p.kind === 'aligned-stub') {
              return (
                <g key={i}>
                  <path d={`M 0 ${p.y1} L 40 ${p.y1}`} fill="none"
                        stroke={STROKE_GREEN} strokeWidth="2" opacity="0.7"/>
                  <text x="44" y={p.y1 + 3} fontSize="8" fill={STROKE_GREEN}>✓ no-match</text>
                </g>
              );
            }
            if (p.kind === 'lost') {
              return (
                <g key={i}>
                  <path d={`M 0 ${p.y1} L 36 ${p.y1}`} fill="none"
                        stroke={STROKE_RED} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.75"/>
                  <text x="38" y={p.y1 + 3} fontSize="9" fill={STROKE_RED} fontWeight="bold">✕</text>
                </g>
              );
            }
            // unintended (incoming gold stub from right)
            return (
              <g key={i}>
                <path d={`M 130 ${p.y2} L 94 ${p.y2}`} fill="none"
                      stroke={STROKE_GOLD} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.8"/>
                <text x="84" y={p.y2 + 3} fontSize="9" fill={STROKE_GOLD} fontWeight="bold"
                      textAnchor="end">+</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="be-ident-col" data-testid="be-ident-col-image">
        <div className="be-ident-col-h be-eyebrow">
          <span className="be-dot-sm" style={{ background: '#C8102E' }}/>
          Image · ที่ผู้บริโภครับรู้
        </div>
        {image.map((t, i) => (
          <div key={i}
               ref={el => (rightRefs.current[i] = el)}
               className={'be-ident-trait ' + (t.kind || 'unintended')}
               data-testid={`be-ident-image-${i}`}>
            <span>{t.trait}</span>
            <span className="be-mono be-tiny">{t.pct}%</span>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
};

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

// ============ Brand Logo (real image with fallback to initial+gradient) ============
// Priority: the asset's image_url or image_base64 → brand.logo_url → initial letter on gradient
// Pass `logoAsset` directly when available (e.g. from public endpoint).
//
// Public endpoints hand back `image_url` (a path into /api/media or /api/files)
// instead of base64, so the browser can cache the logo instead of re-reading it
// inside every JSON response. Accept a site-relative path as well as an
// absolute one — a check for `https?://` alone silently drops both of those.
// An absolute URL, a site-relative path, or an inline data URI — anything a
// browser will load as an image. Rejects the empty string and stray values.
const isImageSrc = (s) =>
  typeof s === 'string' && /^(https?:\/\/|\/|data:image\/)/i.test(s.trim());

export const BrandLogo = ({
  brand = {}, identity = {}, logoAsset = null,
  size = 48, radius = 0, gradient,
  testid = 'be-brand-logo',
}) => {
  const [imgError, setImgError] = React.useState(false);
  const asset = logoAsset
    || (identity?.visual_assets || []).find(a => a?.kind === 'logo');
  const assetSrc = asset?.image_url
    || (asset?.image_base64
      ? `data:${asset.mime_type || 'image/png'};base64,${asset.image_base64}`
      : null);
  const urlSrc = isImageSrc(brand?.logo_url) ? brand.logo_url : null;
  const src = imgError ? null : (assetSrc || urlSrc);
  const initial = (brand?.name?.[0] || 'B').toUpperCase();
  const fallbackBg = gradient || 'linear-gradient(140deg,#14161A 0%,#3A3D45 100%)';

  if (src) {
    return (
      <div data-testid={testid}
           style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden',
                    background: '#FFFFFF', border: '1px solid var(--rule-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0 }}>
        <img src={src} alt={brand?.name || 'Brand logo'}
             loading="lazy" decoding="async"
             width={size} height={size}
             onError={() => setImgError(true)}
             style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}/>
      </div>
    );
  }
  return (
    <div data-testid={testid}
         style={{ width: size, height: size, borderRadius: radius,
                  background: fallbackBg, color: '#F7F4EE',
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'IBM Plex Serif, Georgia, serif', fontWeight: 600,
                  fontSize: Math.round(size * 0.42), letterSpacing: '-0.01em',
                  flexShrink: 0 }}>
      {initial}
    </div>
  );
};

// ============ Stepper ============
export const Stepper = ({ steps = [], current = 0, onStepClick = null }) => (
  <div className="be-stepper" data-testid="be-stepper">
    {steps.map((s, i) => {
      const clickable = typeof onStepClick === 'function';
      return (
        <div key={i}
             className={'be-step ' + (i < current ? 'done' : i === current ? 'on' : '')}
             onClick={clickable ? () => onStepClick(i) : undefined}
             data-testid={`be-step-${i}`}
             style={clickable ? { cursor: 'pointer' } : undefined}>
          <div className="be-step-top">
            <span className="be-step-num">{i < current ? <Icon name="check" size={9} stroke="#F7F4EE"/> : i + 1}</span>
            {s}
          </div>
          <div className="be-step-bar"/>
        </div>
      );
    })}
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
export const SWU_LOGO_URL = 'https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png';

/**
 * BeTopbar — legacy wrapper. Renders UnifiedTopbar so every page using BeTopbar
 * automatically gets the new unified navigation.
 *
 * Legacy props kept for backward compatibility:
 * - user, onLogo, right — IGNORED (UnifiedTopbar reads auth via context; logo always links home)
 * - subtitle, active, publicMode — passed through
 */
export const BeTopbar = ({ subtitle = 'BRAND HEALTH CHECK', active = 'brand_equity', publicMode = false }) => (
  <UnifiedTopbar subtitle={subtitle} active={active} publicMode={publicMode}/>
);

// ============ Loading ============
export const BeLoading = ({ text = 'Loading…' }) => (
  <div className="be-loading"><span className="be-spinner"/><span className="be-mono be-tiny">{text}</span></div>
);


// ============ AI Progress Card ============
// Shows live progress of the Brand Equity AI analysis background job.
// The 4 phases match `_run_ai_analysis` in routes/brand_equity.py.
const PHASE_STEPS = [
  { num: 1, label: 'Normalize',        sub: 'จัดกลุ่มชื่อแบรนด์ที่ผู้ตอบพิมพ์อิสระ' },
  { num: 2, label: 'Themes',           sub: 'สกัด theme จากคำตอบเปิด' },
  { num: 3, label: 'Identity ↔ Image', sub: 'เทียบอัตลักษณ์ที่ตั้งใจ vs ภาพลักษณ์ที่รับรู้' },
  { num: 4, label: 'Master Insights',  sub: 'สรุปข้อเสนอแนะเชิงกลยุทธ์' },
];

export const AIProgressCard = ({ step = 0, total = 4, phase = '', elapsed = 0, pct = 0, done = false }) => {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
  const mins = Math.floor((elapsed || 0) / 60);
  const secs = Math.round((elapsed || 0) % 60);
  const timeStr = mins > 0 ? `${mins}น ${secs}ว` : `${secs}ว`;

  return (
    <div
      className="be-card be-ai-progress"
      data-testid="be-ai-progress"
      style={{
        marginTop: 16, padding: 20,
        background: done
          ? 'linear-gradient(120deg, rgba(16,185,129,0.06) 0%, rgba(125,221,177,0.10) 100%)'
          : 'linear-gradient(120deg, rgba(248,247,242,1) 0%, rgba(240,237,228,1) 100%)',
        borderLeft: `4px solid ${done ? '#10B981' : '#0E5538'}`,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {!done && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(90deg, transparent 0%, rgba(14,85,56,0.06) 50%, transparent 100%)',
          backgroundSize: '200% 100%', animation: 'be-ai-shimmer 2.2s linear infinite',
        }}/>
      )}

      <div className="be-card-h" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="be-eyebrow" style={{ marginBottom: 6 }}>
            <span className="be-dot-sm" style={{ background: done ? '#10B981' : '#0E5538' }}/>
            AI ANALYSIS {done ? '· DONE' : '· RUNNING'}
          </div>
          <h3 className="be-card-t" style={{ marginBottom: 4 }}>
            {done ? 'AI วิเคราะห์เสร็จเรียบร้อย' : phase || 'กำลังเริ่ม…'}
          </h3>
          <div className="be-card-d">
            ระบบยังให้บริการผู้ใช้คนอื่นได้ตามปกติระหว่าง AI ทำงาน · เวลาที่ใช้แล้ว {timeStr}
          </div>
        </div>
        <div className="be-mono" style={{
          fontSize: 36, fontWeight: 700, color: done ? '#10B981' : '#0E5538',
          letterSpacing: '-0.02em', minWidth: 80, textAlign: 'right',
        }} data-testid="be-ai-progress-pct">
          {Math.round(safePct)}%
        </div>
      </div>

      <div style={{
        height: 8, background: 'rgba(14,85,56,0.10)', borderRadius: 4,
        overflow: 'hidden', position: 'relative',
      }}>
        <div
          data-testid="be-ai-progress-fill"
          style={{
            height: '100%',
            width: `${safePct}%`,
            background: done
              ? 'linear-gradient(90deg, #10B981, #7DDDB1)'
              : 'linear-gradient(90deg, #0E5538, #10B981)',
            transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
            borderRadius: 4,
          }}
        />
      </div>

      <div className="be-ai-steps" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 8, marginTop: 14,
      }}>
        {PHASE_STEPS.map(s => {
          const active = step === s.num && !done;
          const completed = done || step > s.num;
          return (
            <div key={s.num} className="be-ai-step" style={{
              padding: '8px 10px', borderRadius: 6,
              background: active ? 'rgba(16,185,129,0.10)' : completed ? 'rgba(16,185,129,0.04)' : 'transparent',
              border: '1px solid ' + (active ? '#10B981' : completed ? 'rgba(16,185,129,0.30)' : 'var(--rule, rgba(0,0,0,0.08))'),
              opacity: active || completed ? 1 : 0.55,
              transition: 'all 300ms ease',
            }}>
              <div className="be-mono be-tiny" style={{
                display: 'flex', alignItems: 'center', gap: 6,
                color: active ? '#0E5538' : completed ? '#10B981' : 'var(--ink-3)',
                fontWeight: 600,
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? '#0E5538' : completed ? '#10B981' : 'transparent',
                  color: active || completed ? '#fff' : 'var(--ink-3)',
                  border: '1px solid ' + (active || completed ? 'transparent' : 'var(--rule, rgba(0,0,0,0.15))'),
                  fontSize: 9, fontWeight: 700,
                }}>{completed ? '✓' : s.num}</span>
                {s.label}
              </div>
              <div className="be-tiny" style={{
                color: 'var(--ink-3)', marginTop: 4, fontSize: 10.5, lineHeight: 1.35,
              }}>
                {s.sub}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes be-ai-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (max-width: 700px) {
          .be-ai-steps { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  );
};

// ============ Wave Selector ============
// Lets researchers pivot the dashboard across survey waves.
// Choices: All (default, longitudinal view), Latest (only current questionnaire),
// or any specific wave N (responses collected between wave N and wave N+1).
// Hidden entirely when the study has only 1 wave (no need to choose).
export const BeWaveSelector = ({ waves = [], value = 'all', onChange = () => {} }) => {
  if (!waves || waves.length <= 1) return null;
  const latest = waves[waves.length - 1];
  const opts = [
    { id: 'all',    label: 'รวมทุก Wave',   sub: `n=${waves.reduce((s, w) => s + (w.n_responses || 0), 0)}` },
    { id: 'latest', label: `Wave ${latest.wave} (ล่าสุด)`, sub: `n=${latest.n_responses || 0}` },
    ...waves.map(w => ({
      id: String(w.wave),
      label: `Wave ${w.wave}`,
      sub: `n=${w.n_responses || 0} · ${(w.published_at || '').slice(0, 10)}`,
    })),
  ];
  return (
    <div className="be-card" data-testid="be-wave-selector" style={{
      marginTop: 12, padding: 14,
      background: 'linear-gradient(120deg, rgba(14,85,56,0.04), rgba(248,247,242,1))',
      borderLeft: '4px solid #0E5538',
    }}>
      <div className="be-eyebrow" style={{ marginBottom: 8 }}>
        <span className="be-dot-sm" style={{ background: '#0E5538' }}/>
        SURVEY WAVE
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
        {opts.map(o => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              data-testid={`be-wave-chip-${o.id}`}
              onClick={() => onChange(o.id)}
              style={{
                padding: '8px 14px', borderRadius: 6,
                border: '1px solid ' + (active ? '#0E5538' : 'var(--rule, rgba(0,0,0,0.12))'),
                background: active ? '#0E5538' : 'transparent',
                color: active ? '#fff' : 'var(--ink, #1a1a1a)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                transition: 'all 200ms ease', minWidth: 130,
              }}
            >
              <span>{o.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 500,
                color: active ? 'rgba(255,255,255,0.85)' : 'var(--ink-3, #666)',
                letterSpacing: 0.2,
              }}>{o.sub}</span>
            </button>
          );
        })}
      </div>
      <div className="be-tiny" style={{ marginTop: 8, color: 'var(--ink-3)' }}>
        ทุก wave คือผลรวมของ responses ที่ส่งระหว่างวันที่ republish ครั้งก่อนกับครั้งถัดไป — เหมาะกับงานวิจัย longitudinal ที่ต้องเทียบก่อน/หลังเปลี่ยนแคมเปญ
      </div>
    </div>
  );
};

// ============ Migration Orphan Banner ============
// Surfaces responses that can't be re-linked to any current question slot
// (template structure was overhauled so no matching template_id exists in the
// new study). Researcher gets a clear count + reassuring next-step note —
// the orphans are still safe in the DB, just not aggregated into composite scores.
export const MigrationOrphanBanner = ({ migrationMeta }) => {
  const orph = migrationMeta?.phase2_unmappable_orphans || 0;
  const relinked = migrationMeta?.phase2_orphan_relinked || 0;
  if (orph <= 0 && relinked <= 0) return null;
  const hasOrph = orph > 0;
  return (
    <div
      className="be-card"
      data-testid="be-migration-banner"
      style={{
        marginTop: 12, padding: 14, fontSize: 12,
        background: hasOrph
          ? 'linear-gradient(120deg, rgba(245,158,11,0.08), rgba(248,247,242,1))'
          : 'linear-gradient(120deg, rgba(16,185,129,0.05), rgba(248,247,242,1))',
        borderLeft: `4px solid ${hasOrph ? '#F59E0B' : '#10B981'}`,
      }}
    >
      <div className="be-eyebrow" style={{ marginBottom: 4 }}>
        <span className="be-dot-sm" style={{ background: hasOrph ? '#F59E0B' : '#10B981' }}/>
        DATA LINEAGE NOTICE
      </div>
      <div className="be-card-t" style={{ marginBottom: 4 }}>
        {hasOrph
          ? `มี response เก่า ${orph} รายการที่ link เข้าแบบสอบถามใหม่ไม่ได้`
          : `Re-link สำเร็จ: response เก่า ${relinked} รายการกลับมาแสดงผลบน dashboard`}
      </div>
      <div className="be-tiny" style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
        {hasOrph ? (
          <>
            สาเหตุ: เคยใช้ template คำถามแบบเดิม (เช่น <code>BI-3</code>) แต่ระบบรุ่นใหม่
            เปลี่ยนเป็น <code>COMP-1</code> / <code>ASD-1</code> ฯลฯ ทำให้ ID เก่าจับคู่กับคำถามใหม่
            ไม่ได้ — ข้อมูลยังอยู่ครบใน <code>brand_responses</code> เพียงแต่ไม่เข้าค่าเฉลี่ยรวม. หากต้องการดึงกลับ
            แนะนำให้ <strong>regenerate questions ครั้งเดียว</strong> ด้วย competitors / brand setup เดิม
            หรือติดต่อแอดมินเพื่อ manual relink.
          </>
        ) : (
          <>
            ระบบทำการ re-link ID เก่าให้กับ slot คำถามที่ตรงกันตาม template เดียวกัน — composite ทั้งหมดที่เห็น
            ตอนนี้รวมข้อมูลย้อนหลังแล้ว.
          </>
        )}
      </div>
      {migrationMeta?.last_migrated_at && (
        <div className="be-tiny be-mono" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
          Last migrated: {(migrationMeta.last_migrated_at || '').slice(0, 19).replace('T', ' ')}
        </div>
      )}
    </div>
  );
};


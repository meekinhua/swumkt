// ScoreRing — animated SVG ring
const ScoreRing = ({ value = 72, size = 148, stroke = 8, color, label, showNum = true, animate = true }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tier = value >= 70 ? '#10B981' : value >= 40 ? '#D4A017' : '#C8102E';
  const ringColor = color || tier;
  const [v, setV] = React.useState(animate ? 0 : value);
  React.useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setV(value), 100);
    return () => clearTimeout(t);
  }, [value, animate]);
  const offset = c - (v / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(20,22,26,0.08)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
    </svg>
  );
};

// Spider/Radar chart
const RadarChart = ({ axes, series, size = 280 }) => {
  const cx = size / 2, cy = size / 2;
  const max = 100;
  const levels = [25, 50, 75, 100];
  const n = axes.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i, v) => {
    const r = (v / max) * (size / 2 - 30);
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };
  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }}>
      {levels.map((lv, i) => (
        <polygon key={i}
          points={axes.map((_, j) => point(j, lv).join(',')).join(' ')}
          fill="none" stroke="rgba(20,22,26,0.08)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(20,22,26,0.08)" strokeWidth="1" />;
      })}
      {series.map((s, si) => (
        <g key={si}>
          <polygon
            points={s.values.map((v, i) => point(i, v).join(',')).join(' ')}
            fill={s.color} fillOpacity={s.fill || 0.15}
            stroke={s.color} strokeWidth="1.5"
            strokeDasharray={s.dash || '0'} />
          {s.values.map((v, i) => {
            const [x, y] = point(i, v);
            return <circle key={i} cx={x} cy={y} r="3" fill={s.color} />;
          })}
        </g>
      ))}
      {axes.map((axis, i) => {
        const [x, y] = point(i, 116);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="10.5" fill="#3B3D43" fontFamily="IBM Plex Sans Thai">
            {axis}
          </text>
        );
      })}
    </svg>
  );
};

// Word cloud — pre-positioned spans
const WordCloud = ({ words }) => {
  // words: [{text, size, target?, x, y}]
  return (
    <div className="cloud">
      {words.map((w, i) => (
        <span key={i} className={w.target ? 'target' : ''} style={{
          fontSize: w.size + 'px',
          left: w.x + '%',
          top: w.y + '%',
          transform: `translate(-50%, -50%) rotate(${w.r || 0}deg)`,
          opacity: w.opacity || 1,
        }}>{w.text}</span>
      ))}
    </div>
  );
};

// Horizontal bar
const HBar = ({ rows, color = '#1B75BC' }) => (
  <div>
    {rows.map((r, i) => (
      <div key={i} className={'hbar-row' + (r.target ? ' target' : '')}>
        <div className="hbar-lbl">{r.label}</div>
        <div className="hbar"><div className="hbar-fill" style={{ width: r.value + '%', background: r.target ? color : 'rgba(27,117,188,0.45)' }} /></div>
        <div className="hbar-val">{r.value}%</div>
      </div>
    ))}
  </div>
);

// Histogram
const Histogram = ({ values, peakIdx, color = '#D4A017' }) => {
  const max = Math.max(...values);
  return (
    <>
      <div className="hist">
        {values.map((v, i) => (
          <div key={i} className={'hist-col' + (i === peakIdx ? ' peak' : '')}
            style={{ height: (v / max * 100) + '%', background: color }} />
        ))}
      </div>
      <div className="hist-labels">
        <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span>
      </div>
    </>
  );
};

// NPS bar
const NPSBar = ({ detractors, passives, promoters }) => (
  <div className="nps-bar">
    <div className="nps-seg nps-detractor" style={{ flex: detractors }}>
      <div className="pct">{detractors}%</div><div className="lbl">Detractors</div>
    </div>
    <div className="nps-seg nps-passive" style={{ flex: passives }}>
      <div className="pct">{passives}%</div><div className="lbl">Passives</div>
    </div>
    <div className="nps-seg nps-promoter" style={{ flex: promoters }}>
      <div className="pct">{promoters}%</div><div className="lbl">Promoters</div>
    </div>
  </div>
);

// 2x2 matrix
const Matrix = ({ dots }) => (
  <div className="matrix">
    <div className="matrix-axis" style={{ top: 8, left: '50%', transform: 'translateX(-50%)' }}>↑ Loyalty</div>
    <div className="matrix-axis" style={{ bottom: 8, right: 12 }}>Switching cost →</div>
    <div className="matrix-axis" style={{ top: 24, left: 16, fontSize: 9 }}>Loyal advocates</div>
    <div className="matrix-axis" style={{ top: 24, right: 16, fontSize: 9, textAlign: 'right' }}>Locked-in</div>
    <div className="matrix-axis" style={{ bottom: 24, left: 16, fontSize: 9 }}>At risk</div>
    <div className="matrix-axis" style={{ bottom: 24, right: 16, fontSize: 9, textAlign: 'right' }}>Habitual</div>
    {dots.map((d, i) => (
      <div key={i} style={{
        position: 'absolute',
        left: d.x + '%', top: (100 - d.y) + '%',
        width: d.r * 2 + 'px', height: d.r * 2 + 'px',
        marginLeft: -d.r, marginTop: -d.r,
        background: d.color || '#10B981',
        opacity: d.opacity || 0.5,
        borderRadius: '50%',
        border: d.target ? '2px solid #14161A' : 'none',
      }} />
    ))}
  </div>
);

window.ScoreRing = ScoreRing;
window.RadarChart = RadarChart;
window.WordCloud = WordCloud;
window.HBar = HBar;
window.Histogram = Histogram;
window.NPSBar = NPSBar;
window.Matrix = Matrix;

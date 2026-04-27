// Mali — fictional Thai oat-milk coffee chain
const BRAND = {
  name: 'Mali',
  full: 'Mali · มะลิ',
  th: 'มะลิ',
  category: 'Specialty Coffee · F&B',
  competitors: ['Cafe Amazon', 'Starbucks', 'Inthanin', 'After You'],
  identityTraits: ['Modern', 'Artisanal', 'Premium', 'Mindful', 'Local'],
  promise: 'Slow coffee, made with care.',
  initial: 'M',
};

const Dashboard = ({ score = 68, lockedAt = null, language = 'mixed' }) => {
  const t = (th, en) => language === 'th' ? th : language === 'en' ? en : `${th} · ${en}`;
  const tier = score >= 70 ? { name: 'Healthy', th: 'แข็งแรง', color: '#10B981' } :
               score >= 40 ? { name: 'At watch',   th: 'ต้องเฝ้าระวัง', color: '#D4A017' } :
                             { name: 'At risk',    th: 'เสี่ยง', color: '#C8102E' };

  const dimScores = {
    awareness: 74,
    quality:   71,
    identity:  58,
    loyalty:   69,
  };

  return (
    <div className="frame dash">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo-mark"><span className="logo-dot"></span>SWU · Marketing Research</div>
          <div className="topnav">
            <span>Surveys</span>
            <span>Conjoint</span>
            <span className="on">Brand Equity</span>
            <span>Reports</span>
          </div>
        </div>
        <div className="topbar-right">
          <span>v1.0</span>
          <span style={{width:1,height:14,background:'var(--rule-2)'}}></span>
          <Icon name="bell" size={14} />
          <div className="avatar">อภ</div>
        </div>
      </div>

      {/* STEPPER */}
      <div className="stepper">
        <div className="stepper-item done"><span className="num-circle"><Icon name="check" size={9}/></span>Setup</div>
        <div className="stepper-item done"><span className="num-circle"><Icon name="check" size={9}/></span>Questions</div>
        <div className="stepper-item done"><span className="num-circle"><Icon name="check" size={9}/></span>Share</div>
        <div className="stepper-item done"><span className="num-circle"><Icon name="check" size={9}/></span>Responses</div>
        <div className="stepper-item on"><span className="num-circle">5</span>Dashboard</div>
        <div style={{marginLeft:'auto',display:'flex',gap:14,alignItems:'center',fontFamily:'IBM Plex Mono, monospace',fontSize:11,color:'var(--ink-3)'}}>
          <span>STUDY · BE-2026-Q1-MALI</span>
          <span>·</span>
          <span>Auto-saved 2 min ago</span>
        </div>
      </div>

      {/* HERO STRIP */}
      <div className="hero-strip">
        <div className="hero-row1">
          <div className="hero-brand">
            <div className="hero-brand-logo">M</div>
            <div className="hero-brand-meta">
              <h1 className="h1">Mali · มะลิ <span style={{fontWeight:400,color:'var(--ink-3)',fontSize:14,marginLeft:6}}>Brand Health Check</span></h1>
              <div className="sub mono">Q1 · 2026 · {BRAND.category} · 127 respondents · last updated 3h ago</div>
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn"><Icon name="refresh" size={12}/>Refresh data</button>
            <button className="btn"><Icon name="share" size={12}/>Share read-only</button>
            <button className="btn"><Icon name="download" size={12}/>Export PDF</button>
            <button className="btn btn-primary"><Icon name="download" size={12}/>Thesis DOCX</button>
          </div>
        </div>

        <div className="hero-row2">
          <div className="score-block">
            <div className="score-ring">
              <ScoreRing value={score} size={148} stroke={9}/>
              <div className="score-ring-inner">
                <div className="score-num num">{score}</div>
                <div className="score-of mono">/ 100</div>
              </div>
            </div>
            <div className="score-meta">
              <div className="label">Brand Equity Score</div>
              <div className="tier-line">
                <div className="tier" style={{color:tier.color}}>{tier.name}</div>
                <div className="delta num">↑ +4 vs Q4</div>
              </div>
              <div className="desc">Brand sits in the upper-mid band. Awareness leads, but Identity-Image alignment is dragging total score.</div>
            </div>
          </div>

          <div className="dim-grid">
            {Object.values(DIMENSIONS).map((d, i) => {
              const val = dimScores[d.key];
              const deltas = { awareness: '+6', quality: '+2', identity: '−3', loyalty: '+1' };
              const dl = deltas[d.key];
              return (
                <div key={d.key} className="dim-card">
                  <div className="dim-num num" style={{paddingTop:6}}>{val}</div>
                  <div className="dim-name">{d.label}</div>
                  <div className="dim-bar"><div className="dim-bar-fill" style={{width:val+'%',background:d.color}}/></div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span className="mono" style={{fontSize:10,color:'var(--ink-4)',letterSpacing:'0.06em'}}>{d.num}</span>
                    <span className={'dim-delta ' + (dl.startsWith('+') ? 'up' : 'down')}>{dl} vs Q4</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="dash-body">
        <DashRail />
        <div className="dash-main">
          <SectionAwareness/>
          <SectionQuality/>
          <SectionIdentity/>
          <SectionLoyalty/>
        </div>
        <DashAIRail/>
      </div>
    </div>
  );
};

// LEFT RAIL — segment slicers
const DashRail = () => (
  <div className="dash-rail">
    <div className="rail-section">
      <div className="rail-h">Filter by segment</div>
      <div className="rail-item on">
        <span><span className="check"><Icon name="check" size={9} stroke="#F7F4EE"/></span>All respondents</span>
        <span className="pct">127</span>
      </div>
    </div>
    <div className="rail-section">
      <div className="rail-h">Age band</div>
      {[['18-24', 42], ['25-34', 51], ['35-44', 24], ['45+', 10]].map(([k, n]) => (
        <div key={k} className="rail-item"><span><span className="check"></span>{k}</span><span className="pct">{n}</span></div>
      ))}
    </div>
    <div className="rail-section">
      <div className="rail-h">Gender</div>
      {[['Female', 71], ['Male', 53], ['Non-binary', 3]].map(([k, n]) => (
        <div key={k} className="rail-item"><span><span className="check"></span>{k}</span><span className="pct">{n}</span></div>
      ))}
    </div>
    <div className="rail-section">
      <div className="rail-h">Region</div>
      {[['Bangkok', 78], ['Central', 21], ['North', 14], ['Northeast', 9], ['South', 5]].map(([k, n]) => (
        <div key={k} className="rail-item"><span><span className="check"></span>{k}</span><span className="pct">{n}</span></div>
      ))}
    </div>
    <div className="rail-section">
      <div className="rail-h">Significance</div>
      <div className="rail-item"><span><span className="check"></span>p &lt; 0.05 only</span></div>
      <div className="rail-item"><span><span className="check"></span>vs Q4 baseline</span></div>
    </div>
  </div>
);

// SECTION 1 — AWARENESS
const SectionAwareness = () => {
  const cloudWords = [
    { text: 'Mali', size: 38, target: true, x: 50, y: 48 },
    { text: 'Starbucks', size: 30, x: 25, y: 30 },
    { text: 'Cafe Amazon', size: 26, x: 76, y: 35 },
    { text: 'Inthanin', size: 22, x: 28, y: 70 },
    { text: 'After You', size: 18, x: 75, y: 68 },
    { text: 'D'+'\u2019'+'oro', size: 14, x: 86, y: 18 },
    { text: 'Black Canyon', size: 13, x: 12, y: 50 },
    { text: 'Au Bon Pain', size: 12, x: 90, y: 55 },
    { text: 'Roots', size: 12, x: 50, y: 16 },
    { text: 'Coffee World', size: 11, x: 43, y: 80 },
    { text: '% Arabica', size: 11, x: 65, y: 14 },
    { text: 'Brave Roasters', size: 10, x: 14, y: 84 },
  ];
  const aided = [
    { label: 'Starbucks',    value: 96 },
    { label: 'Cafe Amazon',  value: 94 },
    { label: 'Inthanin',     value: 81 },
    { label: 'Mali · มะลิ',  value: 67, target: true },
    { label: 'After You',    value: 62 },
    { label: 'Black Canyon', value: 41 },
  ];
  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="section-num">SECTION · 01</div>
          <h2 className="section-title">
            <span className="accent-bar" style={{background:DIMENSIONS.awareness.color}}></span>
            Brand Awareness <span style={{fontWeight:400,color:'var(--ink-3)',fontSize:16,marginLeft:6}}>การจดจำแบรนด์</span>
          </h2>
          <div className="section-sub">Top-of-mind, aided recall and familiarity. Measures how easily the brand surfaces from category cues.</div>
        </div>
        <div className="section-meta">
          <div><strong>74</strong>/100 score</div>
          <div><strong>5</strong> questions</div>
          <div>α = <strong>.81</strong></div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div className="card" style={{gridColumn:'span 2'}}>
          <div className="card-h">
            <div>
              <h3 className="card-t">Top-of-Mind brand cloud</h3>
              <div className="card-d">"แบรนด์แรกที่นึกถึงเมื่อพูดถึง specialty coffee?" · n=127, unaided · target highlighted</div>
            </div>
            <div className="card-stat"><span className="big num">23</span><span className="unit">% top-of-mind for Mali</span></div>
          </div>
          <WordCloud words={cloudWords}/>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Aided recognition</h3>
              <div className="card-d">"แบรนด์ใดที่คุณรู้จัก?" — multi-select · n=127</div>
            </div>
          </div>
          <HBar rows={aided}/>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Awareness funnel</h3>
              <div className="card-d">From recognition → consideration → feature awareness</div>
            </div>
          </div>
          <div className="funnel">
            <div className="funnel-step" style={{width:'100%'}}><span className="name">Recognized brand</span><span className="val num">67%</span></div>
            <div className="funnel-arrow">↓ −19 pts</div>
            <div className="funnel-step" style={{width:'85%'}}><span className="name">Considered for purchase</span><span className="val num">48%</span></div>
            <div className="funnel-arrow">↓ −22 pts</div>
            <div className="funnel-step" style={{width:'66%'}}><span className="name">Aware of key features</span><span className="val num">26%</span></div>
            <div className="funnel-arrow">↓ −15 pts</div>
            <div className="funnel-step" style={{width:'48%'}}><span className="name">Visited / tried</span><span className="val num">11%</span></div>
          </div>
        </div>

        <div className="ai-card" style={{gridColumn:'span 2'}}>
          <div className="ai-head"><span className="ai-dot"></span>AI Insight · Awareness</div>
          <div className="ai-bullet">
            <span className="marker">→</span>
            <div>Mali ranks <strong>#4 in aided recognition</strong> but only <strong>#5 in top-of-mind</strong> — there's a <strong>recall-to-recognition gap of 44 pts</strong>. Awareness is passive; respondents recognise the name when prompted but don't volunteer it. <span className="cite">AW-1</span><span className="cite">AW-3</span></div>
          </div>
          <div className="ai-bullet">
            <span className="marker">→</span>
            <div>The biggest funnel leak is <strong>consideration → feature awareness (−22 pts)</strong>. Respondents know Mali exists but can't articulate what makes it different. <span className="cite">AW-3→AW-4</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// SECTION 2 — QUALITY
const SectionQuality = () => {
  const radarAxes = ['Reliability', 'Value', 'Design', 'Service', 'Innovation', 'Taste', 'Consistency'];
  const radarSeries = [
    { name: 'Mali',         color: '#D4A017', values: [78, 54, 88, 81, 72, 84, 70] },
    { name: 'Starbucks',    color: '#3B3D43', values: [82, 48, 76, 78, 62, 75, 88], dash: '4 3', fill: 0.05 },
    { name: 'Category avg', color: '#A6A8AF', values: [70, 65, 65, 68, 60, 68, 72], dash: '2 2', fill: 0.04 },
  ];
  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="section-num">SECTION · 02</div>
          <h2 className="section-title">
            <span className="accent-bar" style={{background:DIMENSIONS.quality.color}}></span>
            Perceived Quality <span style={{fontWeight:400,color:'var(--ink-3)',fontSize:16,marginLeft:6}}>คุณภาพที่รับรู้</span>
          </h2>
          <div className="section-sub">7-point Likert ratings on quality attributes, plus comparative judgement vs the leading competitor.</div>
        </div>
        <div className="section-meta">
          <div><strong>71</strong>/100 score</div>
          <div><strong>6</strong> questions</div>
          <div>α = <strong>.87</strong></div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Quality attributes · radar</h3>
              <div className="card-d">Mali vs Starbucks vs category average · scaled 0-100 from 7-pt Likert</div>
            </div>
          </div>
          <div className="radar-wrap">
            <RadarChart axes={radarAxes} series={radarSeries} size={260}/>
            <div className="radar-legend">
              {radarSeries.map((s, i) => (
                <div key={i} className="item">
                  <span className="swatch" style={{background:s.color, opacity: i===0 ? 1 : 0.6}}></span>
                  {s.name}
                  <span className="val">{Math.round(s.values.reduce((a,b)=>a+b,0)/s.values.length)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Overall quality · distribution</h3>
              <div className="card-d">"โดยรวม Mali มีคุณภาพระดับใด?" · 1=แย่มาก, 7=ดีมาก · n=127</div>
            </div>
            <div className="card-stat"><span className="big num">5.4</span><span className="unit">mean · σ 1.1</span></div>
          </div>
          <Histogram values={[2, 4, 8, 17, 38, 41, 17]} peakIdx={5}/>
          <div style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,fontSize:11.5}}>
            <div style={{padding:'8px 10px',background:'var(--paper-2)',borderRadius:5}}>
              <div className="mono" style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Top-2-box</div>
              <div className="num" style={{fontSize:18,fontWeight:500}}>46%</div>
            </div>
            <div style={{padding:'8px 10px',background:'var(--paper-2)',borderRadius:5}}>
              <div className="mono" style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Bottom-2-box</div>
              <div className="num" style={{fontSize:18,fontWeight:500}}>5%</div>
            </div>
            <div style={{padding:'8px 10px',background:'rgba(212,160,23,0.1)',borderRadius:5}}>
              <div className="mono" style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Net Q-Score</div>
              <div className="num" style={{fontSize:18,fontWeight:600,color:'var(--quality)'}}>+41</div>
            </div>
          </div>
        </div>

        <div className="card" style={{gridColumn:'span 2'}}>
          <div className="card-h">
            <div>
              <h3 className="card-t">Voice of respondent · quality reasons</h3>
              <div className="card-d">Open-end "What makes Mali feel quality / not?" · clustered into themes by AI · n=89 responses</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            {[
              { theme: 'Bean sourcing & roast', count: 31, sentiment: 'pos', quote: '"กาแฟกลิ่นหอมแบบ specialty จริง รู้สึกถึงเมล็ดที่คั่วใหม่"' },
              { theme: 'Store design / vibe',   count: 24, sentiment: 'pos', quote: '"ร้านสวย เงียบ น่านั่งทำงาน · cozy แบบไม่ฝืน"' },
              { theme: 'Inconsistency by branch', count: 18, sentiment: 'neg', quote: '"แต่ละสาขารสไม่เท่ากัน · บางสาขาเข้มไป"' },
            ].map((th, i) => (
              <div key={i} style={{padding:14,background:'var(--paper-2)',borderRadius:6,border:'1px solid var(--rule)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:600,letterSpacing:'-0.005em'}}>{th.theme}</div>
                  <div className="num" style={{fontSize:11,color: th.sentiment==='pos' ? 'var(--be-green)' : 'var(--be-red)'}}>
                    {th.sentiment==='pos' ? '+' : '−'}{th.count}
                  </div>
                </div>
                <div className="serif" style={{fontSize:12,fontStyle:'italic',color:'var(--ink-2)',lineHeight:1.5}}>{th.quote}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ai-card" style={{gridColumn:'span 2'}}>
          <div className="ai-head"><span className="ai-dot"></span>AI Insight · Quality</div>
          <div className="ai-bullet">
            <span className="marker">→</span>
            <div>Mali outperforms Starbucks on <strong>Design (+12)</strong> and <strong>Service (+3)</strong>, but trails on <strong>Consistency (−18)</strong> — the same critique surfaces in <strong>18 open-end mentions</strong>. <span className="cite">PQ-2..6</span><span className="cite">PQ-8</span></div>
          </div>
          <div className="ai-bullet">
            <span className="marker">→</span>
            <div>Value-for-money sits at <strong>5.4 / 7</strong>, lowest of all attributes. Pricing premium isn't fully justified by perceived quality differential. <span className="cite">PQ-3</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// SECTION 3 — IDENTITY vs IMAGE (centerpiece)
const SectionIdentity = () => {
  const identity = ['Modern', 'Artisanal', 'Premium', 'Mindful', 'Local'];
  const image = [
    { trait: 'Aesthetic',   pct: 71, kind: 'unintended' },
    { trait: 'Modern',      pct: 64, kind: 'aligned' },
    { trait: 'Cozy',        pct: 58, kind: 'unintended' },
    { trait: 'Artisanal',   pct: 41, kind: 'aligned' },
    { trait: 'Expensive',   pct: 38, kind: 'unintended' },
    { trait: 'Local',       pct: 22, kind: 'aligned' },
    { trait: 'Mindful',     pct: 9,  kind: 'lost' },
    { trait: 'Premium',     pct: 18, kind: 'lost' },
  ];
  const identityMap = { Modern: 'aligned', Artisanal: 'aligned', Premium: 'lost', Mindful: 'lost', Local: 'aligned' };

  return (
    <div className="section" style={{background:'#FBF7F1'}}>
      <div className="section-head">
        <div>
          <div className="section-num">SECTION · 03 · CENTERPIECE</div>
          <h2 className="section-title">
            <span className="accent-bar" style={{background:DIMENSIONS.identity.color}}></span>
            Identity vs Image <span style={{fontWeight:400,color:'var(--ink-3)',fontSize:16,marginLeft:6}}>อัตลักษณ์ vs ภาพลักษณ์</span>
          </h2>
          <div className="section-sub">What the brand wants to be (left) versus what consumers actually perceive (right). Connectors mark alignment, drift and unintended attributes.</div>
        </div>
        <div className="section-meta">
          <div>Alignment <strong style={{color:'var(--be-red)'}}>58%</strong></div>
          <div>Jaccard <strong>.42</strong></div>
          <div><strong>3 of 5</strong> traits aligned</div>
        </div>
      </div>

      <div className="card" style={{padding:24}}>
        <div className="ident-map">
          {/* IDENTITY (intended) */}
          <div className="ident-col">
            <div className="ident-col-h">
              <span style={{width:8,height:8,background:'var(--ink)',borderRadius:50}}></span>
              Identity · what Mali wants to be
            </div>
            {identity.map(t => (
              <div key={t} className={'ident-trait ' + (identityMap[t] === 'aligned' ? 'aligned' : 'lost')}>
                <span>{t}</span>
                <span className="freq mono">{identityMap[t] === 'aligned' ? '✓ aligned' : '✕ lost'}</span>
              </div>
            ))}
          </div>

          {/* CONNECTOR */}
          <div className="ident-connector">
            <svg width="100%" height="100%" viewBox="0 0 130 380" preserveAspectRatio="none" style={{position:'absolute',inset:0}}>
              {/* aligned (green) */}
              <path d="M 0 30 C 65 30, 65 75, 130 75" fill="none" stroke="#10B981" strokeWidth="1.5" opacity="0.85"/>
              <path d="M 0 90 C 65 90, 65 165, 130 165" fill="none" stroke="#10B981" strokeWidth="1.5" opacity="0.85"/>
              <path d="M 0 270 C 65 270, 65 240, 130 240" fill="none" stroke="#10B981" strokeWidth="1.5" opacity="0.85"/>
              {/* lost (red dashed) */}
              <path d="M 0 150 C 65 150, 65 290, 130 290" fill="none" stroke="#C8102E" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7"/>
              <path d="M 0 210 C 65 210, 65 340, 130 340" fill="none" stroke="#C8102E" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7"/>
              {/* unintended (gold dotted, originate from right side void) */}
              <path d="M 65 0 C 100 0, 110 25, 130 25" fill="none" stroke="#D4A017" strokeWidth="1.2" strokeDasharray="2 2" opacity="0.7"/>
              <path d="M 65 380 C 100 380, 110 200, 130 200" fill="none" stroke="#D4A017" strokeWidth="1.2" strokeDasharray="2 2" opacity="0.7"/>
            </svg>
            <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',display:'flex',flexDirection:'column',gap:6,fontFamily:'IBM Plex Mono, monospace',fontSize:9.5,color:'var(--ink-3)',background:'#FBF7F1',padding:'8px 6px',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center'}}>
              <div><span style={{display:'inline-block',width:14,height:1.5,background:'#10B981',verticalAlign:'middle',marginRight:4}}></span>aligned</div>
              <div><span style={{display:'inline-block',width:14,borderTop:'1.2px dashed #C8102E',verticalAlign:'middle',marginRight:4,height:1}}></span>lost</div>
              <div><span style={{display:'inline-block',width:14,borderTop:'1.2px dotted #D4A017',verticalAlign:'middle',marginRight:4,height:1}}></span>unintended</div>
            </div>
          </div>

          {/* IMAGE (perceived) */}
          <div className="ident-col">
            <div className="ident-col-h">
              <span style={{width:8,height:8,background:'var(--be-red)',borderRadius:50}}></span>
              Image · what consumers see
            </div>
            {image.map(t => (
              <div key={t.trait} className={'ident-trait ' + t.kind}>
                <span>{t.trait}</span>
                <span className="freq mono">{t.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trait gap table */}
        <div style={{marginTop:24,paddingTop:20,borderTop:'1px solid var(--rule)'}}>
          <div className="card-t" style={{marginBottom:12}}>Trait gap table</div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--rule)',color:'var(--ink-3)'}}>
                <th style={{textAlign:'left',padding:'8px 0',fontFamily:'IBM Plex Mono, monospace',fontSize:10.5,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>Trait</th>
                <th style={{textAlign:'right',padding:'8px 0',fontFamily:'IBM Plex Mono, monospace',fontSize:10.5,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>Identity weight</th>
                <th style={{textAlign:'right',padding:'8px 0',fontFamily:'IBM Plex Mono, monospace',fontSize:10.5,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>Image %</th>
                <th style={{textAlign:'right',padding:'8px 0',fontFamily:'IBM Plex Mono, monospace',fontSize:10.5,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>Gap</th>
                <th style={{textAlign:'right',padding:'8px 0',fontFamily:'IBM Plex Mono, monospace',fontSize:10.5,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Modern',    'High',   64, '+4',   'aligned'],
                ['Artisanal', 'High',   41, '−9',   'aligned'],
                ['Local',     'Medium', 22, '−8',   'aligned'],
                ['Premium',   'High',   18, '−32',  'lost'],
                ['Mindful',   'Medium', 9,  '−21',  'lost'],
                ['Aesthetic', '—',      71, '+71',  'unintended'],
                ['Cozy',      '—',      58, '+58',  'unintended'],
                ['Expensive', '—',      38, '+38',  'unintended'],
              ].map((r, i) => {
                const status = r[4];
                const c = status === 'aligned' ? 'var(--be-green)' : status === 'lost' ? 'var(--be-red)' : 'var(--quality)';
                return (
                  <tr key={i} style={{borderBottom:'1px dashed var(--rule)'}}>
                    <td style={{padding:'9px 0'}}>{r[0]}</td>
                    <td style={{textAlign:'right',padding:'9px 0',color:'var(--ink-3)'}} className="mono">{r[1]}</td>
                    <td style={{textAlign:'right',padding:'9px 0'}} className="num">{r[2]}%</td>
                    <td style={{textAlign:'right',padding:'9px 0',color:c,fontWeight:500}} className="num">{r[3]}</td>
                    <td style={{textAlign:'right',padding:'9px 0'}}>
                      <span className="chip-dim" style={{color:c,background:'transparent',border:'1px solid '+c+'40'}}>
                        <span className="dot" style={{background:c}}></span>{status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ai-card" style={{marginTop:16}}>
        <div className="ai-head"><span className="ai-dot"></span>AI Insight · Identity-Image · highest priority</div>
        <div className="ai-bullet">
          <span className="marker">!</span>
          <div>Mali wants to feel <strong style={{color:'var(--be-red)'}}>Premium</strong> and <strong style={{color:'var(--be-red)'}}>Mindful</strong> but consumers most associate the brand with <strong style={{color:'var(--quality)'}}>Aesthetic</strong>, <strong style={{color:'var(--quality)'}}>Cozy</strong> and <strong style={{color:'var(--quality)'}}>Expensive</strong>. The "Premium" cue is reading as <em>price</em>, not <em>craft</em>. <span className="cite">BI-1</span><span className="cite">BI-2</span><span className="cite">BI-3</span></div>
        </div>
        <div className="ai-bullet">
          <span className="marker">→</span>
          <div>Recommend visual identity audit focused on <strong>signaling craft over polish</strong> — process storytelling, barista visibility, single-origin transparency. Mindfulness is invisible because it has no surface artifact.</div>
        </div>
      </div>
    </div>
  );
};

// SECTION 4 — LOYALTY
const SectionLoyalty = () => {
  return (
    <div className="section" style={{borderBottom:0}}>
      <div className="section-head">
        <div>
          <div className="section-num">SECTION · 04</div>
          <h2 className="section-title">
            <span className="accent-bar" style={{background:DIMENSIONS.loyalty.color}}></span>
            Brand Loyalty <span style={{fontWeight:400,color:'var(--ink-3)',fontSize:16,marginLeft:6}}>ความภักดี</span>
          </h2>
          <div className="section-sub">NPS, repeat intent and switching resistance. Open-ends mined for retention drivers.</div>
        </div>
        <div className="section-meta">
          <div><strong>69</strong>/100 score</div>
          <div><strong>6</strong> questions</div>
          <div>α = <strong>.79</strong></div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Net Promoter Score</h3>
              <div className="card-d">"แนะนำ Mali ให้เพื่อน?" · scale 0-10 · n=127</div>
            </div>
          </div>
          <NPSBar detractors={18} passives={36} promoters={46}/>
          <div className="nps-score">
            <div><div style={{fontSize:10.5,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>NPS</div><div className="big" style={{color:'var(--be-green)'}}>+28</div></div>
            <div><div style={{fontSize:10.5,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Cat. avg</div><div className="big" style={{color:'var(--ink-3)'}}>+19</div></div>
            <div><div style={{fontSize:10.5,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.06em'}}>vs Q4</div><div className="big" style={{color:'var(--be-green)'}}>+6</div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Repeat intent vs switching resistance</h3>
              <div className="card-d">"จะกลับมาอีก" vs "จะอยู่แม้คู่แข่งลด 20%" · 7-pt Likert</div>
            </div>
          </div>
          <div style={{padding:'10px 0'}}>
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}}>
                <span>Repeat intent</span>
                <span className="num">5.6 / 7</span>
              </div>
              <div className="hbar" style={{height:14,background:'rgba(20,22,26,0.05)',borderRadius:2}}>
                <div style={{height:'100%',width:'80%',background:'var(--loyalty)',borderRadius:2}}></div>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}}>
                <span>Switching resistance (vs 20% discount)</span>
                <span className="num">4.2 / 7</span>
              </div>
              <div className="hbar" style={{height:14,background:'rgba(20,22,26,0.05)',borderRadius:2}}>
                <div style={{height:'100%',width:'60%',background:'var(--quality)',borderRadius:2}}></div>
              </div>
            </div>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}}>
                <span>Likely-to-buy next month</span>
                <span className="num">7.4 / 10</span>
              </div>
              <div className="hbar" style={{height:14,background:'rgba(20,22,26,0.05)',borderRadius:2}}>
                <div style={{height:'100%',width:'74%',background:'var(--awareness)',borderRadius:2}}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Loyalty × Switching cost matrix</h3>
              <div className="card-d">Each dot = 1 respondent · target brand outlined · n=127</div>
            </div>
          </div>
          <Matrix dots={[
            { x: 78, y: 82, r: 6, color: '#10B981', target: true, opacity: 0.8 },
            { x: 65, y: 75, r: 5, color: '#10B981', opacity: 0.5 },
            { x: 70, y: 68, r: 4, color: '#10B981', opacity: 0.5 },
            { x: 55, y: 60, r: 5, color: '#10B981', opacity: 0.45 },
            { x: 80, y: 55, r: 4, color: '#D4A017', opacity: 0.5 },
            { x: 38, y: 72, r: 5, color: '#10B981', opacity: 0.5 },
            { x: 25, y: 65, r: 4, color: '#D4A017', opacity: 0.5 },
            { x: 32, y: 45, r: 5, color: '#D4A017', opacity: 0.5 },
            { x: 22, y: 30, r: 6, color: '#C8102E', opacity: 0.5 },
            { x: 18, y: 22, r: 4, color: '#C8102E', opacity: 0.5 },
            { x: 60, y: 38, r: 4, color: '#D4A017', opacity: 0.5 },
            { x: 72, y: 28, r: 5, color: '#D4A017', opacity: 0.5 },
            { x: 85, y: 20, r: 4, color: '#C8102E', opacity: 0.5 },
            { x: 48, y: 80, r: 5, color: '#10B981', opacity: 0.5 },
            { x: 42, y: 58, r: 4, color: '#10B981', opacity: 0.45 },
          ]}/>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3 className="card-t">Why customers stay</h3>
              <div className="card-d">Open-end "Why Mali?" · top themes from AI clustering</div>
            </div>
          </div>
          {[
            { theme: 'Atmosphere & space',   pct: 38, n: 41, q: '"นั่งทำงานได้ทั้งวัน · staff ไม่เร่ง"' },
            { theme: 'Bean quality / taste', pct: 31, n: 33, q: '"รสกาแฟดี รู้สึกถึง specialty grade"' },
            { theme: 'Brand aesthetic',      pct: 22, n: 24, q: '"ร้านสวย · ถ่ายรูปแล้วโพสต์ได้"' },
            { theme: 'Loyalty rewards',      pct: 9,  n: 10, q: '"แต้มสะสมแลกเครื่องดื่มฟรี"' },
          ].map((t, i) => (
            <div key={i} style={{padding:'10px 0',borderBottom: i<3 ? '1px dashed var(--rule)' : 'none'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12.5}}>
                <span style={{fontWeight:500}}>{t.theme}</span>
                <span><span className="num" style={{fontSize:13}}>{t.pct}%</span> <span className="mono" style={{fontSize:10,color:'var(--ink-3)'}}>· n={t.n}</span></span>
              </div>
              <div className="hbar" style={{height:3,background:'rgba(20,22,26,0.06)',borderRadius:2,marginBottom:6}}>
                <div style={{height:'100%',width:t.pct+'%',background:'var(--loyalty)',borderRadius:2}}></div>
              </div>
              <div className="serif" style={{fontSize:11.5,fontStyle:'italic',color:'var(--ink-3)',lineHeight:1.5}}>{t.q}</div>
            </div>
          ))}
        </div>

        <div className="ai-card" style={{gridColumn:'span 2'}}>
          <div className="ai-head"><span className="ai-dot"></span>AI Insight · Loyalty</div>
          <div className="ai-bullet">
            <span className="marker">→</span>
            <div>NPS <strong>+28</strong> beats category by <strong>9 pts</strong>. Promoters cite <strong>atmosphere first, taste second</strong> — meaning loyalty is <em>place-based</em>, not <em>product-based</em>. Risk: store experience becomes single point of failure. <span className="cite">LY-1</span><span className="cite">LY-4</span></div>
          </div>
          <div className="ai-bullet">
            <span className="marker">→</span>
            <div>Switching resistance (4.2/7) is the weakest loyalty metric. <strong>40% would switch on a 20% discount</strong> — pricing power is fragile. Build category-of-one moats around <strong>seasonal single-origin drops</strong> or <strong>barista programs</strong>. <span className="cite">LY-3</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// RIGHT RAIL — Master AI Insights
const DashAIRail = () => (
  <div className="dash-ai">
    <div className="ai-rail-h">Master AI insights</div>
    <div className="ai-rail-title">
      <Icon name="sparkle" size={14} stroke="#C8102E"/>
      5 actions for the brand team
    </div>
    <div style={{fontSize:11,color:'var(--ink-3)',marginBottom:18,lineHeight:1.5,paddingBottom:14,borderBottom:'1px solid var(--rule)'}}>
      Generated from 127 responses + 4 dimension stats · cited to specific questions.
      <a style={{display:'block',color:'var(--ink-2)',textDecoration:'underline',textUnderlineOffset:2,marginTop:6,fontSize:11}}>ทำไมต้องเชื่อ AI? · methodology</a>
    </div>

    {[
      { headline: 'Tighten the Premium → Craft narrative', body: 'Mali signals "premium" through price and decor — consumers read this as "expensive". Reframe around process: bean origin, barista training, seasonal cycles.', cites: ['BI-1','BI-2','PQ-3'] },
      { headline: 'Solve branch-level inconsistency', body: '18 open-ends flagged variance between branches. Affects PQ score directly and erodes "Artisanal" trust.', cites: ['PQ-2','PQ-8'] },
      { headline: 'Convert recognition into top-of-mind', body: 'Recall-to-recognition gap of 44 pts. Run 2 cycles of category-cue activations (e.g. "What\'s your slow-coffee shop?") to drive unaided recall.', cites: ['AW-1','AW-3'] },
      { headline: 'Make Mindfulness visible', body: '"Mindful" identity trait drew 9% perception — invisible. Add ritual artifacts (slow-pour glassware, no-rush signs, quiet hour).', cites: ['BI-1','BI-2'] },
      { headline: 'Defend pricing with single-origin moats', body: 'Switching resistance is fragile (4.2/7). Limited monthly drops would shift purchases from price-driven to FOMO-driven.', cites: ['LY-3','LY-5'] },
    ].map((rec, i) => (
      <div key={i} className="ai-rec">
        <div className="ai-rec-head">
          <div className="ai-rec-num">0{i+1}</div>
          <div className="ai-rec-headline">{rec.headline}</div>
        </div>
        <div className="ai-rec-body">{rec.body}</div>
        <div className="ai-rec-cite">
          {rec.cites.map((c, j) => <span key={j} className="cite">{c}</span>)}
        </div>
      </div>
    ))}

    <button className="btn" style={{width:'100%',marginTop:16,justifyContent:'center'}}>
      <Icon name="refresh" size={11}/>Generate new insights
    </button>
  </div>
);

window.Dashboard = Dashboard;
window.BRAND = BRAND;

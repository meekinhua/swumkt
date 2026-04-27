// Studies list — entry point
const StudiesList = () => {
  const studies = [
    {
      name: 'Mali · มะลิ', cat: 'Specialty coffee', status: 'analyzing', logoBg: 'linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)', initial: 'M',
      n: 127, target: 200, score: 68, dims: [74, 71, 58, 69], updated: '3h ago', isFeatured: true,
    },
    {
      name: 'Suan Phaeng Bank', cat: 'Banking · service', status: 'completed', logoBg: 'linear-gradient(140deg,#1E3A8A,#3B82F6)', initial: 'S',
      n: 412, target: 400, score: 81, dims: [88, 84, 76, 76], updated: '2 days ago',
    },
    {
      name: 'Klong Toey EdTech', cat: 'EdTech · app', status: 'collecting', logoBg: 'linear-gradient(140deg,#7C3AED,#C084FC)', initial: 'K',
      n: 64, target: 150, score: null, dims: [62, 55, 48, 52], updated: '12 min ago',
    },
    {
      name: 'Phuket Resort Co.', cat: 'Hospitality · luxury', status: 'completed', logoBg: 'linear-gradient(140deg,#0F766E,#14B8A6)', initial: 'P',
      n: 287, target: 250, score: 74, dims: [72, 81, 68, 75], updated: '1 week ago',
    },
    {
      name: 'Boon Snack', cat: 'FMCG · snacks', status: 'collecting', logoBg: 'linear-gradient(140deg,#DC2626,#F87171)', initial: 'B',
      n: 89, target: 200, score: null, dims: [56, 62, 51, 58], updated: '4h ago',
    },
    {
      name: 'Nakorn Telecom · Q4 study', cat: 'Telco · service', status: 'draft', logoBg: 'linear-gradient(140deg,#374151,#6B7280)', initial: 'N',
      n: 0, target: 300, score: null, dims: [0, 0, 0, 0], updated: 'just now',
    },
  ];

  const statusLabel = { collecting: 'Collecting', completed: 'Completed', draft: 'Draft', analyzing: 'Analyzing' };

  return (
    <div className="frame list">
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
          <Icon name="search" size={14}/>
          <Icon name="bell" size={14}/>
          <div className="avatar">อภ</div>
        </div>
      </div>

      <div className="list-hero">
        <div>
          <h1 className="h">Brand Health Studies</h1>
          <div className="sub">Aaker's 4-dimension framework · question generation · automated stats · AI insight</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn"><Icon name="grid" size={12}/>Templates</button>
          <button className="btn btn-red"><Icon name="plus" size={12}/>สร้าง study ใหม่</button>
        </div>
      </div>

      <div className="list-controls">
        <div className="list-filters">
          {['All · 6', 'Draft · 1', 'Collecting · 2', 'Analyzing · 1', 'Completed · 2'].map((f, i) => (
            <span key={i} className={'chip ' + (i===0 ? 'solid' : '')} style={{cursor:'pointer'}}>{f}</span>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14,color:'var(--ink-3)'}}>
          <span>Sort · <strong style={{color:'var(--ink)',fontWeight:500}}>Latest</strong></span>
          <span style={{width:1,height:14,background:'var(--rule-2)'}}></span>
          <Icon name="grid" size={13}/>
          <Icon name="list" size={13} stroke="rgba(20,22,26,0.4)"/>
        </div>
      </div>

      <div className="list-grid">
        {studies.map((s, i) => {
          const dimColors = ['#1B75BC','#D4A017','#C8102E','#10B981'];
          const dimLabels = ['AW','PQ','BI','LY'];
          const tier = s.score && s.score >= 70 ? '#10B981' : s.score && s.score >= 40 ? '#D4A017' : '#C8102E';
          return (
            <div key={i} className={'study-card' + (s.status==='completed' ? ' completed' : '') + (s.isFeatured ? ' featured' : '')}>
              <div className="study-card-top">
                <div className="study-card-brand">
                  <div className="study-card-logo" style={{background: s.logoBg}}>{s.initial}</div>
                  <div>
                    <div className="study-card-name">{s.name}</div>
                    <div className="study-card-cat">{s.cat}</div>
                  </div>
                </div>
                <div className={'study-card-status ' + s.status}>
                  <span className="dt"></span>
                  {statusLabel[s.status]}
                </div>
              </div>

              <div>
                <div className="study-card-progress">
                  <span><strong>{s.n}</strong> / {s.target}</span>
                  <span>{Math.round(s.n/s.target*100)}%</span>
                </div>
                <div className="study-card-progress-bar">
                  <div className="fill" style={{width: Math.min(100, s.n/s.target*100)+'%'}}></div>
                </div>
              </div>

              <div className="study-card-mini">
                {s.dims.map((v, j) => (
                  <div key={j} className="col">
                    <div className="lbl" style={{color: v>0 ? dimColors[j] : 'var(--ink-4)'}}>{dimLabels[j]}</div>
                    <div className="num">{v>0 ? v : '—'}</div>
                    <div className="bar"><div className="bar-fill" style={{width:v+'%',background:dimColors[j]}}></div></div>
                  </div>
                ))}
              </div>

              <div className="study-card-foot">
                <span>Updated {s.updated}</span>
                {s.score ? (
                  <div className="study-card-score">
                    <span className="big" style={{color:tier}}>{s.score}</span>
                    <span style={{fontSize:11,color:'var(--ink-3)'}}>BES</span>
                  </div>
                ) : (
                  <span style={{fontSize:11}}>BES locked · {Math.max(0, 10-s.n)} more needed</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

window.StudiesList = StudiesList;

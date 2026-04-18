// ============== DISCOVER SCREEN ==============
// "ทวดของทวด" - find interesting people through the chain
const ScreenDiscover = ({ onNav }) => {
  const D = window.DATA;
  const [filter, setFilter] = useState('all');
  const [mystery, setMystery] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const toast = useToast();

  const rollMystery = () => {
    setRevealed(false);
    const pick = D.DISCOVER[Math.floor(Math.random() * D.DISCOVER.length)];
    setMystery(pick);
    setTimeout(() => setRevealed(true), 800);
  };

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>ค้นพบ · Through the chain</div>
        <h1 className="h-section" style={{ fontSize: 36, letterSpacing: '-0.02em' }}>ทวดของทวด ของคุณ ·<br/><span style={{ color: 'var(--blue)', fontWeight: 500, fontStyle: 'italic' }}>คนที่คุณยังไม่รู้จัก</span></h1>
      </div>

      {/* Mystery Roll — signature feature */}
      <div style={{
        background: 'linear-gradient(135deg, var(--ink) 0%, #2A1A1F 100%)',
        color: 'white', borderRadius: 24, padding: 28, marginBottom: 28,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center', position: 'relative', overflow: 'hidden',
      }} className="mystery-card">
        <div style={{ position: 'absolute', inset: 0, opacity: 0.08, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '18px 18px' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="dice" size={16} />
            <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }}>Mystery Match · สุ่มเจอทวดของทวด</span>
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 10px', fontWeight: 700, textWrap: 'pretty' }}>
            กดสุ่ม · เจอคนที่เชื่อมกับคุณผ่าน 3-6 ทอด
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: '0 0 18px', maxWidth: 360 }}>
            ระบบจะเลือก 1 คน แสดงสาย bloodline ยาวๆ · แล้วคุณกด say hi ได้เลย (ผ่านคำแนะนำจากคนกลาง)
          </p>
          <button className="btn btn-lg" style={{ background: 'var(--yellow)', color: 'var(--ink)' }} onClick={rollMystery}>
            <Icon name="sparkles" size={16} /> สุ่ม 1 คน
          </button>
        </div>

        <div style={{ position: 'relative', minHeight: 220 }}>
          {mystery ? (
            <div style={{ opacity: revealed ? 1 : 0.3, transition: 'opacity .4s' }}>
              <div style={{ padding: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <Avatar name={mystery.name} hue={mystery.avatarHue} size="lg" verified />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{revealed ? mystery.name : '??????'}</div>
                    <div className="small" style={{ opacity: 0.7 }}>{revealed ? mystery.position : 'กำลังเปิดเผย...'}</div>
                  </div>
                </div>
                {revealed && (
                  <>
                    <div className="tiny" style={{ marginBottom: 8, color: 'rgba(255,255,255,0.5)' }}>สายเชื่อม · {mystery.degree}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
                      {mystery.steps.map((s, i, arr) => (
                        <React.Fragment key={i}>
                          <span style={{ padding: '3px 8px', background: i === 0 ? 'var(--red)' : (i === arr.length - 1 ? 'var(--yellow)' : 'rgba(255,255,255,0.1)'),
                            color: i === arr.length - 1 ? 'var(--ink)' : 'white', borderRadius: 999 }}>{s}</span>
                          {i < arr.length - 1 && <span style={{ opacity: 0.4 }}>→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎲</div>
              <div className="small" style={{ color: 'rgba(255,255,255,0.6)' }}>ยังไม่ได้สุ่ม · กดปุ่มด้านซ้าย</div>
            </div>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {[
          { id: 'all', label: 'ทั้งหมด' },
          { id: 'rising', label: '🔥 กำลังมาแรง' },
          { id: 'founder', label: 'Founders' },
          { id: 'fmcg', label: 'FMCG' },
          { id: 'tech', label: 'Tech' },
          { id: 'agency', label: 'Agency' },
          { id: 'intl', label: 'ทำงานต่างประเทศ' },
          { id: 'mentor', label: 'เปิดรับ mentee' },
        ].map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
            background: filter === c.id ? 'var(--ink)' : 'var(--card)', color: filter === c.id ? 'white' : 'var(--ink-2)',
            border: '1px solid', borderColor: filter === c.id ? 'var(--ink)' : 'var(--line)',
          }}>{c.label}</button>
        ))}
      </div>

      {/* People grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {D.DISCOVER.map(p => (
          <DiscoverCard key={p.id} person={p} onGreet={() => toast.show(`ส่งคำขอรู้จักผ่านพี่ฟ้า`)} />
        ))}
      </div>

      {toast.node}

      <style>{`
        @media (max-width: 760px) {
          .mystery-card { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

const DiscoverCard = ({ person, onGreet }) => (
  <div className="card card-pad" style={{ padding: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <Avatar name={person.name} hue={person.avatarHue} size="lg" verified />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{person.name}</div>
        <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.position}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', color: 'var(--red)' }}>
          <Icon name="flame" size={12} />
          <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{person.heat}</span>
        </div>
        <div className="tiny muted">รุ่น {person.gen}</div>
      </div>
    </div>

    <div style={{ padding: '10px 12px', background: 'var(--paper-2)', borderRadius: 10, marginBottom: 12 }}>
      <div className="tiny" style={{ marginBottom: 6, color: 'var(--mute)' }}>สาย · {person.degree}</div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
        {person.steps.map((s, i, arr) => (
          <React.Fragment key={i}>
            <span style={{
              padding: '2px 7px', borderRadius: 999, fontWeight: 500,
              background: i === 0 ? 'var(--ink)' : (i === arr.length - 1 ? 'var(--red)' : 'white'),
              color: (i === 0 || i === arr.length - 1) ? 'white' : 'var(--ink-2)',
              border: '1px solid', borderColor: i === arr.length - 1 ? 'var(--red)' : 'var(--line)',
            }}>{s}</span>
            {i < arr.length - 1 && <span style={{ color: 'var(--mute)' }}>›</span>}
          </React.Fragment>
        ))}
      </div>
    </div>

    <p className="small" style={{ margin: '0 0 12px', color: 'var(--ink-2)', textWrap: 'pretty' }}>
      💡 {person.reason}
    </p>

    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
      {person.tags.map(t => <Chip key={t}>{t}</Chip>)}
    </div>

    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-primary btn-block btn-sm" onClick={onGreet}>
        <Icon name="message" size={13} /> ทักทายผ่านพี่กลาง
      </button>
      <button className="btn btn-outline btn-sm"><Icon name="user" size={13} /></button>
    </div>
  </div>
);

window.ScreenDiscover = ScreenDiscover;

// ============== LANDING SCREEN ==============
// Goal: pull alumni back to register
const ScreenLanding = ({ onNav, onInvite }) => {
  const D = window.DATA;
  const [heroGen, setHeroGen] = useState(64);

  useEffect(() => {
    const t = setInterval(() => setHeroGen(g => (g >= 68 ? 45 : g + 1)), 120);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page fade-in">
      {/* Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 40, alignItems: 'center', marginBottom: 48 }} className="hero-grid">
        <div>
          <div className="eyebrow" style={{ marginBottom: 18 }}>· เครือข่ายนิสิต & ศิษย์เก่า การตลาด มศว ·</div>
          <h1 className="h-display" style={{ marginBottom: 20 }}>
            สาย<span style={{ color: 'var(--red)' }}>ตระกูล</span>ของเรา<br/>
            ยาวกว่า<span style={{ color: 'var(--blue)', fontStyle: 'italic', fontWeight: 500 }}>ที่คุณคิด</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520, margin: '0 0 28px', textWrap: 'pretty' }}>
            ระบบศิษย์เก่า ที่ให้คุณค้นหา พี่ take · ปู่ · ทวด · เทียด ของคุณ ได้เป็นทอด ๆ
            จากรุ่น <span className="mono tabular" style={{ background: 'var(--ink)', color: 'white', padding: '2px 8px', borderRadius: 6 }}>{String(heroGen).padStart(2,'0')}</span> ถึงรุ่นแรกของคณะ
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
            <button className="btn btn-red btn-lg" onClick={() => onNav('onboarding')}>
              <Icon name="sparkles" size={16} /> ลงทะเบียนด้วยรหัสนิสิต
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => onNav('tree')}>
              ดูสายตระกูลของฉัน <Icon name="arrow-right" size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex' }}>
              {[340, 190, 20, 280, 130].map((h, i) => (
                <div key={i} style={{ marginLeft: i ? -10 : 0 }}>
                  <Avatar name={String.fromCharCode(65+i)} hue={h} size="sm" />
                </div>
              ))}
            </div>
            <div className="small">
              <span style={{ fontWeight: 600 }}>{D.STATS.alumni.toLocaleString()}</span> คน ลงทะเบียนแล้ว · ใหม่วันนี้ <span style={{ color: 'var(--red)', fontWeight: 600 }}>+23</span>
            </div>
          </div>
        </div>

        {/* Right: visual — animated tree card */}
        <div style={{ position: 'relative', minHeight: 440 }}>
          <FamilyCard />
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 48 }}>
        <StatPill label="ศิษย์เก่าที่ลงทะเบียน" value={D.STATS.alumni.toLocaleString()} sub="จากทั้งคณะ ~4,200 คน" />
        <StatPill label="นิสิตปัจจุบัน" value={D.STATS.current} sub="รุ่น 64-67" />
        <StatPill label="บริษัทที่พบในเครือข่าย" value={D.STATS.companies} sub="ในไทย + 12 ประเทศ" />
        <StatPill label="การเชื่อมโยงกัน" value={D.STATS.connections.toLocaleString()} sub="สายตระกูล + mutual" tone="var(--red)" />
        <StatPill label="งานที่ refer ผ่านระบบ" value={D.STATS.jobsReferred} sub="ในปี 2025" tone="var(--blue)" />
      </div>

      {/* How it works — wide cards */}
      <SectionHead eyebrow="วิธีการทำงาน" title="จากรหัสของคุณ · สู่เครือข่ายที่ยาวไปถึงรุ่น 45" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 48 }}>
        {[
          { n: '01', title: 'ลงทะเบียน', desc: 'ยืนยันตัวตนด้วยรหัสนิสิต + อีเมล @g.swu', icon: 'user' },
          { n: '02', title: 'ระบุพี่ take', desc: 'ของคุณเป็นใคร? ระบบจะเชื่อมต่อขึ้นไปอีก 5 ชั้น', icon: 'link' },
          { n: '03', title: 'ชวนรุ่นที่ยังไม่เข้ามา', desc: 'ส่งคำเชิญไปหาพี่-น้อง เกิดสายทอดๆ', icon: 'share' },
          { n: '04', title: 'ค้นพบเครือข่าย', desc: 'ทวดของทวดที่ทำงานที่คุณฝัน อาจอยู่ห่างแค่ 4 ทอด', icon: 'compass' },
        ].map(s => (
          <div key={s.n} className="card card-pad" style={{ position: 'relative' }}>
            <div className="mono" style={{ color: 'var(--mute)', fontSize: 12, letterSpacing: '0.08em', marginBottom: 16 }}>{s.n}</div>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'var(--paper-2)',
              display: 'grid', placeItems: 'center', color: 'var(--ink)', marginBottom: 14,
            }}>
              <Icon name={s.icon} size={20} />
            </div>
            <h3 className="h-card" style={{ marginBottom: 6 }}>{s.title}</h3>
            <p className="small muted" style={{ margin: 0 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Why register — testimonials */}
      <div style={{ background: 'var(--ink)', color: 'white', borderRadius: 32, padding: '48px 40px', marginBottom: 48, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.08,
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '20px 20px' }} />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48, alignItems: 'center' }} className="cta-grid">
          <div>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>ทำไมต้องลงทะเบียน?</div>
            <h2 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, fontWeight: 700 }}>
              เพราะ <span style={{ color: '#FFD976', fontStyle: 'italic', fontWeight: 500 }}>น้องคุณ</span> อาจต้องการคุณอยู่
            </h2>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {[
              { q: '"น้อง take ผมหางานอยู่ — refer เข้า LINE MAN ได้ใน 2 วัน"', by: 'พี่ดิน · รุ่น 58', by2: 'Head of Growth' },
              { q: '"เจอทวดของทวดที่เป็น Creative Director — ขอรีวิว portfolio ได้เลย"', by: 'มีน · รุ่น 63', by2: 'นิสิตปี 4' },
              { q: '"ได้กลับมาเจอพี่ take ที่ไม่เจอกัน 8 ปี ผ่านระบบ"', by: 'พี่ลี · รุ่น 54', by2: 'VP Marketing' },
            ].map((t, i) => (
              <div key={i} style={{ padding: '18px 22px', background: 'rgba(255,255,255,0.06)', borderRadius: 14, borderLeft: '3px solid #FFD976' }}>
                <div style={{ fontSize: 16, marginBottom: 6, textWrap: 'pretty' }}>{t.q}</div>
                <div className="small" style={{ color: 'rgba(255,255,255,0.65)' }}>{t.by} · <em>{t.by2}</em></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA for existing alumni */}
      <div className="card card-pad" style={{ padding: 36, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--red)' }}>· ศิษย์เก่าที่ยังไม่เข้าระบบ ·</div>
          <h3 style={{ fontSize: 24, margin: '0 0 8px', letterSpacing: '-0.01em' }}>พี่ทวดของพี่ทวดคุณ กำลังรอคุณอยู่</h3>
          <p className="muted small" style={{ margin: 0, maxWidth: 520 }}>เข้าด้วยรหัสนิสิตของคุณ ระบบจะค้นหาว่าคุณเชื่อมกับใครในคณะบ้าง — ไม่ต้องตั้งค่าอะไรเพิ่ม</p>
        </div>
        <button className="btn btn-red btn-lg" onClick={() => onNav('onboarding')}>
          เริ่มใน 60 วินาที <Icon name="arrow-right" size={16} />
        </button>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .cta-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
        }
      `}</style>
    </div>
  );
};

// Floating visual showing tree
const FamilyCard = () => {
  const D = window.DATA;
  return (
    <div style={{ position: 'relative', padding: 20 }}>
      {/* the card */}
      <div className="card" style={{ padding: 22, borderRadius: 24, boxShadow: 'var(--shadow-lg)', maxWidth: 440, marginLeft: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="eyebrow">สายตระกูลของภูมิ</div>
          <Chip tone="red" icon="flame">5 ทอดขึ้นไป</Chip>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[D.CURRENT_USER, ...D.ANCESTORS].slice(0, 6).map((p, i, arr) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10,
                background: i === 0 ? 'var(--red-soft)' : 'transparent' }}>
                <Avatar name={p.name} hue={p.avatarHue} size="md" verified={p.verified} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    {p.relation && <span className="tiny muted">· {p.relation}</span>}
                  </div>
                  <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.position || p.role}{p.company ? ` · ${p.company}` : ''}
                  </div>
                </div>
                <div className="mono tiny" style={{ background: 'var(--paper-2)', padding: '2px 8px', borderRadius: 999 }}>
                  {p.gen}
                </div>
              </div>
              {i < arr.length - 1 && i < 5 && (
                <div style={{ marginLeft: 27, width: 1, height: 10, background: 'var(--line-2)' }} />
              )}
            </div>
          ))}
        </div>

        <div className="sep" />
        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--mute)', alignItems: 'center' }}>
          <Icon name="bolt" size={14} />
          <span>ผ่านสายนี้คุณอยู่ห่าง <b style={{ color: 'var(--ink)' }}>Sea (Shopee) · VP</b> แค่ 4 ทอด</span>
        </div>
      </div>

      {/* floating badges */}
      <div style={{ position: 'absolute', top: 4, left: 0,
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px',
        boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--yellow)', display: 'grid', placeItems: 'center' }}>
          <Icon name="gift" size={16} />
        </div>
        <div>
          <div className="tiny muted">สิทธิพิเศษ</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>ส่วนลด ร้านศิษย์เก่า</div>
        </div>
      </div>
    </div>
  );
};

window.ScreenLanding = ScreenLanding;

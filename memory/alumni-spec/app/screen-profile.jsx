// ============== PROFILE SCREEN ==============
const ScreenProfile = ({ onNav }) => {
  const u = window.DATA.CURRENT_USER;

  const badges = [
    { emoji: '🌳', name: 'ผู้ก่อร่าง', desc: 'ชวน 5 คน', earned: true },
    { emoji: '🔗', name: '5 ทอดคลับ', desc: 'สายยาว 5 ชั้น', earned: true },
    { emoji: '⭐', name: 'นักรีวิว', desc: 'รีวิวพี่ 3 คน', earned: true },
    { emoji: '🤝', name: 'Connector', desc: 'ทักทาย 10 คน', earned: true },
    { emoji: '💼', name: 'Career Helper', desc: 'refer งาน 1 คน', earned: false },
    { emoji: '👑', name: 'นายก๊ก', desc: 'ชวน 10 คน', earned: false },
    { emoji: '🎓', name: 'Mentor ตัวจริง', desc: 'รับ mentee 1 คน', earned: false },
    { emoji: '🗓️', name: 'Event Go-er', desc: 'ร่วม reunion', earned: false },
  ];

  return (
    <div className="page fade-in" style={{ maxWidth: 1080 }}>
      {/* Header card */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ height: 120, background: 'linear-gradient(135deg, var(--red) 0%, var(--blue) 100%)', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.2,
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />
        </div>
        <div style={{ padding: '0 28px 24px', marginTop: -48, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <Avatar name={u.name} hue={u.avatarHue} size="xl" ring="var(--paper)" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 26, margin: 0, letterSpacing: '-0.02em' }}>{u.name}</h1>
              <span className="mono" style={{ padding: '3px 10px', background: 'var(--ink)', color: 'white', borderRadius: 999, fontSize: 12 }}>
                {u.studentId}
              </span>
            </div>
            <div style={{ color: 'var(--ink-2)', marginBottom: 4 }}>{u.position}</div>
            <div className="small muted">การตลาด · รุ่น {u.gen} · {u.year}</div>
            <p style={{ margin: '10px 0 0', fontSize: 14, maxWidth: 500, textWrap: 'pretty' }}>{u.bio}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-outline btn-sm"><Icon name="sliders" size={13} /> แก้โปรไฟล์</button>
            <button className="btn btn-outline btn-sm"><Icon name="share" size={13} /> แชร์</button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatPill label="สายตระกูล" value={u.treeSize} sub="ยาวถึงรุ่น 47" />
        <StatPill label="คนที่ชวน" value={u.invites} sub="+ 3 ครั้งล่าสุด" tone="var(--red)" />
        <StatPill label="XP สะสม" value={u.points.toLocaleString()} sub="Lv.8 · ขยันขันแข็ง" tone="var(--blue)" />
        <StatPill label="Streak" value={`${u.streak} วัน`} sub="ทำได้ติดต่อกัน" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20 }} className="profile-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Badges */}
          {window.TWEAKS?.showGamification !== false && (
            <div className="card card-pad">
              <SectionHead title="ของสะสม · Badges" action="ดูทั้งหมด" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                {badges.map((b, i) => (
                  <div key={i} style={{
                    padding: 14, borderRadius: 14, textAlign: 'center',
                    background: b.earned ? 'var(--paper-2)' : 'transparent',
                    border: '1px solid', borderColor: b.earned ? 'var(--line)' : 'var(--line-2)',
                    borderStyle: b.earned ? 'solid' : 'dashed',
                    opacity: b.earned ? 1 : 0.5,
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 6, filter: b.earned ? 'none' : 'grayscale(1)' }}>{b.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{b.name}</div>
                    <div className="tiny muted">{b.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tree path */}
          <div className="card card-pad">
            <SectionHead title="สายของฉัน" action="เปิดต้นไม้เต็ม" onAction={() => onNav('tree')} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[...window.DATA.ANCESTORS].reverse().map((a, i, arr) => (
                <React.Fragment key={a.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', background: 'var(--paper-2)', borderRadius: 999 }}>
                    <Avatar name={a.name} hue={a.avatarHue} size="xs" />
                    <span className="small" style={{ fontWeight: 600 }}>{a.nickname}</span>
                    <span className="mono tiny muted">{a.gen}</span>
                  </div>
                  <Icon name="chevron-right" size={12} style={{ color: 'var(--mute)' }} />
                </React.Fragment>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', background: 'var(--ink)', color: 'white', borderRadius: 999 }}>
                <Avatar name={window.DATA.CURRENT_USER.name} hue={window.DATA.CURRENT_USER.avatarHue} size="xs" />
                <span className="small" style={{ fontWeight: 600 }}>คุณ</span>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="card card-pad">
            <SectionHead title="กิจกรรมล่าสุด" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: 'sparkles', text: 'ได้ Badge "5 ทอดคลับ"', time: '2 วันที่แล้ว', color: 'var(--yellow)' },
                { icon: 'user', text: 'ชวน "พลอย วรางคณา" เข้าร่วม', time: '3 วันที่แล้ว', color: 'var(--red)' },
                { icon: 'star', text: 'รีวิวพี่ฟ้า 5 ดาว', time: '1 สัปดาห์ที่แล้ว', color: 'var(--blue)' },
                { icon: 'message', text: 'ทักทายพี่ดิน (ปู่) ผ่านพี่ฟ้า', time: '2 สัปดาห์ที่แล้ว', color: 'var(--ink-2)' },
              ].map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--paper-2)', display: 'grid', placeItems: 'center', color: a.color }}>
                    <Icon name={a.icon} size={16} />
                  </div>
                  <div style={{ flex: 1, fontSize: 14 }}>{a.text}</div>
                  <div className="tiny muted">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Streak card */}
          <div className="card card-pad" style={{ background: 'var(--red-soft)', borderColor: 'rgba(200,16,46,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 28 }}>🔥</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{u.streak} วัน streak</div>
                <div className="tiny muted">Active ทุกวัน</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 20, borderRadius: 3,
                  background: i < 12 ? 'var(--red)' : 'var(--line-2)',
                  opacity: i < 12 ? (0.4 + (i/12)*0.6) : 1,
                }} />
              ))}
            </div>
          </div>

          {/* Next goals */}
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>ภารกิจต่อไป</div>
            {[
              { name: 'Refer งานให้ 1 คน', reward: '+200 XP · Badge', pct: 0 },
              { name: 'ชวนน้องอีก 3 คน', reward: '+Badge นายก๊ก', pct: 62 },
              { name: 'รีวิวพี่ในสาย อีก 2 คน', reward: '+150 XP', pct: 33 },
            ].map((q, i) => (
              <div key={i} style={{ paddingBottom: 12, borderBottom: i < 2 ? '1px solid var(--line)' : 'none', marginBottom: i < 2 ? 12 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{q.name}</span>
                  <span className="tiny muted tabular">{q.pct}%</span>
                </div>
                <div className="progress" style={{ marginBottom: 4 }}><div style={{ width: `${q.pct}%` }} /></div>
                <div className="tiny" style={{ color: 'var(--red)' }}>{q.reward}</div>
              </div>
            ))}
          </div>

          {/* Privacy */}
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>ความเป็นส่วนตัว</div>
            {[
              { label: 'แสดงในฟีดเครือข่าย', on: true },
              { label: 'ให้รุ่นน้องเห็นบริษัท', on: true },
              { label: 'รับ mystery match', on: true },
              { label: 'รับคำขอทักทาย', on: true },
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span className="small">{p.label}</span>
                <div style={{ width: 34, height: 20, borderRadius: 999, background: p.on ? 'var(--red)' : 'var(--line-2)', padding: 2, display: 'flex', justifyContent: p.on ? 'flex-end' : 'flex-start' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .profile-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

window.ScreenProfile = ScreenProfile;

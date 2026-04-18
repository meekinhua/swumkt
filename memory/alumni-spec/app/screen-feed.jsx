// ============== FEED SCREEN ==============
const ScreenFeed = ({ onNav }) => {
  const D = window.DATA;
  const [tab, setTab] = useState('all');
  const toast = useToast();

  return (
    <div className="page fade-in" style={{ maxWidth: 1080 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24 }} className="feed-layout">
        <div>
          <div style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>ฟีดของตระกูล</div>
            <h1 className="h-section">จังหวะของพี่และน้องคุณ</h1>
          </div>

          {/* Compose */}
          <div className="card" style={{ padding: 14, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name={D.CURRENT_USER.name} hue={D.CURRENT_USER.avatarHue} />
            <input placeholder="บอกพี่น้องของคุณ · รีวิว · แนะนำงาน · ตามหารุ่น..."
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)' }} />
            <button className="btn btn-red btn-sm">โพสต์</button>
          </div>

          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 18 }}>
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'family', label: 'ในสายตระกูล' },
              { id: 'throwback', label: '📸 Throwback' },
              { id: 'reviews', label: '⭐ รีวิวรุ่นพี่' },
              { id: 'jobs', label: '💼 งาน & refer' },
            ].map(t => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* Posts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {D.FEED.map(p => <FeedPost key={p.id} post={p} onReact={() => toast.show('Reacted 👍')} />)}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="hide-mobile">
          {/* Gamification card */}
          {window.TWEAKS?.showGamification !== false && (
            <div className="card card-pad" style={{ background: 'var(--ink)', color: 'white', border: 'none' }}>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>Badge ล่าสุด</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--yellow)', display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: 28 }}>🌳</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>ผู้ก่อร่าง</div>
                  <div className="tiny" style={{ opacity: 0.7 }}>ชวนน้องเข้ามา 5 คน</div>
                </div>
              </div>
              <div className="progress" style={{ background: 'rgba(255,255,255,0.15)', marginBottom: 8 }}>
                <div style={{ width: '62%', background: 'var(--yellow)' }} />
              </div>
              <div className="tiny" style={{ opacity: 0.7 }}>อีก 3 คน → Badge "นายก๊ก" (พร้อมคูปอง Roast 200฿)</div>
            </div>
          )}

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>กำลังค้นหา</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { name: 'ตามหาพี่รุ่น 52', who: 'ภา · รุ่น 60', count: 12 },
                { name: 'ใครจำงาน MKT Nights 2018?', who: 'มีน · รุ่น 63', count: 34 },
                { name: 'รวมตัว รุ่น 58-62 รีมินเดอร์', who: 'พี่ดิน', count: 89 },
              ].map((t, i) => (
                <div key={i} style={{ paddingBottom: 10, borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.name}</div>
                  <div className="tiny muted">{t.who} · {t.count} คน</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Event เร็ว ๆ นี้</div>
            <div style={{ padding: 12, background: 'var(--red-soft)', borderRadius: 10, marginBottom: 8 }}>
              <div className="mono tiny" style={{ color: 'var(--red-ink)', marginBottom: 4 }}>· 22 พ.ค. 2569 ·</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>MKT SWU Reunion 2026</div>
              <div className="tiny muted">ทุกรุ่น · ตึก 14 ชั้น G</div>
            </div>
            <div style={{ padding: 12, background: 'var(--blue-soft)', borderRadius: 10 }}>
              <div className="mono tiny" style={{ color: 'var(--blue-ink)', marginBottom: 4 }}>· 8 พ.ค. ·</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>AMA กับพี่ดิน</div>
              <div className="tiny muted">Growth 101 · Online</div>
            </div>
          </div>

          {/* Reviews preview */}
          <div className="card card-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="eyebrow">รีวิวรุ่นพี่ล่าสุด</div>
              <button className="tiny" style={{ color: 'var(--mute)' }}>ดูทั้งหมด</button>
            </div>
            {D.REVIEWS.slice(0,2).map(r => (
              <div key={r.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} name="star" size={11} style={{ color: i < r.rating ? 'var(--yellow)' : 'var(--line-2)' }} />
                  ))}
                </div>
                <div className="small" style={{ textWrap: 'pretty' }}>{r.text.slice(0, 80)}...</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>— {r.reviewer.name} · รีวิว {r.subject.nickname}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast.node}

      <style>{`
        @media (max-width: 900px) {
          .feed-layout { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none; }
        }
      `}</style>
    </div>
  );
};

const FeedPost = ({ post, onReact }) => {
  const a = post.author;
  return (
    <div className="card card-pad" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {a.isOrg ? (
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue)', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700 }}>มศว</div>
        ) : (
          <Avatar name={a.name} hue={a.avatarHue || 200} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name} {a.verified && <Icon name="verified" size={13} style={{ color: 'var(--blue)', verticalAlign: '-2px' }} />}</div>
          <div className="tiny muted">{post.time}</div>
        </div>
        {post.type === 'throwback' && <Chip tone="red">📸 Throwback</Chip>}
        {post.type === 'review' && <Chip tone="blue">⭐ รีวิว</Chip>}
        {post.type === 'job' && <Chip tone="dark">💼 งาน</Chip>}
      </div>

      <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.55, textWrap: 'pretty' }}>{post.content}</p>

      {post.image === 'throwback' && (
        <div style={{ marginBottom: 14, borderRadius: 12, overflow: 'hidden' }}>
          <Placeholder label="photo 2004 · ตลาดนัดคณะ · 1200x600" height={260} />
        </div>
      )}

      {post.job && (
        <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--paper-2)', display: 'grid', placeItems: 'center' }}>
            <Icon name="briefcase" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{post.job.title}</div>
            <div className="tiny muted">{post.job.company} · {post.job.salary} · {post.job.type}</div>
          </div>
          <button className="btn btn-outline btn-sm">สมัคร</button>
        </div>
      )}

      {post.reviewSubject && (
        <div style={{ padding: 12, background: 'var(--paper-2)', borderRadius: 10, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Icon key={i} name="star" size={14} style={{ color: i < post.rating ? 'var(--yellow)' : 'var(--line-2)' }} />
            ))}
          </div>
          <div className="small muted">กำลังรีวิว <b style={{ color: 'var(--ink)' }}>{post.reviewSubject}</b></div>
        </div>
      )}

      {post.cta && (
        <button className="btn btn-red" style={{ marginBottom: 14 }}>{post.cta}</button>
      )}

      <div style={{ display: 'flex', gap: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <button className="btn btn-ghost btn-sm" onClick={onReact}>
          <Icon name="heart" size={14} /> {(post.reactions?.heart || 0) + (post.reactions?.like || 0)}
        </button>
        <button className="btn btn-ghost btn-sm">
          <Icon name="message" size={14} /> {post.comments}
        </button>
        <button className="btn btn-ghost btn-sm"><Icon name="share" size={14} /></button>
      </div>
    </div>
  );
};

window.ScreenFeed = ScreenFeed;

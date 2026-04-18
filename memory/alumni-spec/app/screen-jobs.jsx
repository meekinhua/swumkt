// ============== JOBS & BUSINESS SCREEN ==============
const ScreenJobs = ({ onNav }) => {
  const D = window.DATA;
  const [tab, setTab] = useState('jobs');
  const toast = useToast();

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>งาน · ธุรกิจ · สิทธิพิเศษ</div>
        <h1 className="h-section" style={{ fontSize: 36, letterSpacing: '-0.02em' }}>งานในเครือข่าย · <span style={{ color: 'var(--mute)', fontStyle: 'italic', fontWeight: 500 }}>refer ผ่านพี่ในสายจริง</span></h1>
      </div>

      <div className="tabs" style={{ marginBottom: 22 }}>
        {[
          { id: 'jobs', label: `💼 งานจากพี่ · ${D.JOBS.length}` },
          { id: 'biz', label: `🏪 ธุรกิจศิษย์เก่า · ${D.BUSINESSES.length}` },
          { id: 'mentor', label: '🎓 Mentor session' },
          { id: 'deals', label: '🎁 สิทธิพิเศษ' },
        ].map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'jobs' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {['ทั้งหมด', 'จากสายตระกูลของฉัน', 'ใกล้ตัว 2 ทอด', 'Internship', 'Entry-level', 'Remote'].map((f, i) => (
              <Chip key={i} tone={i === 1 ? 'red' : 'default'}>{f}</Chip>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {D.JOBS.map(j => <JobCard key={j.id} job={j} onApply={() => toast.show(`ส่งใบสมัครผ่าน ${j.referrer.name} แล้ว`)} />)}
          </div>
        </>
      )}

      {tab === 'biz' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {D.BUSINESSES.map(b => (
            <div key={b.id} className="card card-pad" style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14,
                  background: `linear-gradient(135deg, oklch(0.72 0.14 ${b.avatarHue}), oklch(0.52 0.16 ${b.avatarHue}))`,
                  display: 'grid', placeItems: 'center', color: 'white', fontWeight: 700, fontSize: 22 }}>
                  {b.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{b.name}</div>
                  <div className="tiny muted">{b.category}</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>โดย {b.owner}</div>
                </div>
              </div>
              <div style={{ padding: 10, background: 'var(--yellow)', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
                🎁 <b>สำหรับพี่น้อง:</b> {b.perk}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-outline btn-block btn-sm">ดูรายละเอียด</button>
                <button className="btn btn-outline btn-sm"><Icon name="map" size={13} /></button>
              </div>
            </div>
          ))}

          <div className="card card-pad" style={{ padding: 20, border: '2px dashed var(--line-2)', background: 'transparent', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>➕</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>ลงทะเบียนธุรกิจของคุณ</div>
            <div className="tiny muted" style={{ marginBottom: 12 }}>ให้รุ่นน้องช่วย support กันได้</div>
            <button className="btn btn-primary btn-sm">+ เพิ่มธุรกิจ</button>
          </div>
        </div>
      )}

      {tab === 'mentor' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card card-pad" style={{ background: 'var(--blue-soft)', border: '1px solid var(--blue)', borderRadius: 18 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--blue)', color: 'white', display: 'grid', placeItems: 'center' }}>
                <Icon name="sparkles" size={28} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>สายตระกูลติดปีก · Mentor Program</h3>
                <p className="small" style={{ margin: 0, color: 'var(--blue-ink)' }}>จับคู่ mentor-mentee ตามความสนใจและสาย · มี check-in รายเดือน</p>
              </div>
              <button className="btn btn-blue">สมัครเป็น mentee</button>
            </div>
          </div>

          {D.ANCESTORS.slice(1, 4).map(a => (
            <div key={a.id} className="card card-pad">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <Avatar name={a.name} hue={a.avatarHue} size="lg" verified />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</span>
                    <Chip tone="red">{a.relation}</Chip>
                    <Chip>รุ่น {a.gen}</Chip>
                  </div>
                  <div className="small muted">{a.position} · {a.company}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {a.helpful?.map(h => <Chip key={h} tone="blue" icon="check">{h}</Chip>)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="tiny muted" style={{ marginBottom: 2 }}>รับ mentee</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }} className="tabular">1/ไตรมาส</div>
                </div>
                <button className="btn btn-primary">ขอ mentorship</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'deals' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {[
            { title: 'Roast Coffee — ลด 15%', from: 'ร้านพี่แป้ง · รุ่น 49', color: 25, code: 'SWUMKT15' },
            { title: 'กระโปรงแม่ภา — ลด 20%', from: 'ภา · รุ่น 60', color: 310, code: 'MKTSWU20' },
            { title: 'Studio Soi — ที่ปรึกษา brand ฟรี', from: 'อ.ศรีรัตน์ · รุ่น 47', color: 130, code: 'DM เพื่อจอง' },
            { title: 'Event Reunion — บัตรล่วงหน้า 30%', from: 'คณะ', color: 220, code: 'ALUMNI30' },
          ].map((d, i) => (
            <div key={i} className="card card-pad" style={{ padding: 18, borderLeft: `4px solid oklch(0.6 0.16 ${d.color})` }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🎁 {d.title}</div>
              <div className="tiny muted" style={{ marginBottom: 12 }}>{d.from}</div>
              <div className="mono" style={{ padding: '6px 10px', background: 'var(--paper-2)', borderRadius: 8, fontSize: 12, display: 'inline-block' }}>
                {d.code}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast.node}
    </div>
  );
};

const JobCard = ({ job, onApply }) => (
  <div className="card card-pad" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
    <div style={{ width: 56, height: 56, borderRadius: 14, background: job.companyColor, color: 'white',
      display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 }} className="mono">
      {job.companyLogo}
    </div>
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, letterSpacing: '-0.01em' }}>{job.title}</h3>
        <Chip>{job.type}</Chip>
      </div>
      <div className="small muted">{job.company} · {job.location} · <b style={{ color: 'var(--ink)' }}>{job.salary}</b></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 10, border: '1px solid rgba(200,16,46,0.15)' }}>
        <Avatar name={job.referrer.name} hue={job.referrer.avatarHue} size="sm" />
        <div style={{ flex: 1, fontSize: 12 }}>
          <b>{job.referrer.name}</b> · {job.referrer.relation} · รุ่น {job.referrer.gen}
          <div className="tiny" style={{ color: 'var(--red-ink)' }}>refer โดยตรง · ส่ง CV ถึงทีมเขา</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
        {job.tags.map(t => <Chip key={t}>{t}</Chip>)}
      </div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div className="tiny muted" style={{ marginBottom: 6 }}>สมัครแล้ว {job.applicants} · {job.posted}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-outline btn-sm"><Icon name="star" size={13} /></button>
        <button className="btn btn-red" onClick={onApply}>สมัครผ่าน refer</button>
      </div>
    </div>
  </div>
);

window.ScreenJobs = ScreenJobs;

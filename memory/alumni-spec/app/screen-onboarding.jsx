// ============== ONBOARDING + INVITE CHAIN ==============
const ScreenOnboarding = ({ onDone, onNav }) => {
  const [step, setStep] = useState(0);
  const [studentId, setStudentId] = useState('');
  const [takeName, setTakeName] = useState('');
  const [invites, setInvites] = useState([]);
  const [newInvite, setNewInvite] = useState('');
  const steps = ['ยืนยันตัวตน', 'ระบุพี่ take', 'ชวนรุ่นของคุณ', 'เสร็จสิ้น'];

  const next = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="page fade-in" style={{ maxWidth: 760 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => onNav('landing')} style={{ marginBottom: 24 }}>
        ← กลับ
      </button>

      {/* Stepper */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: 'var(--mute)' }} className="mono">
          <span>ขั้น {step + 1}/{steps.length}</span>
          <span>{steps[step]}</span>
        </div>
        <div className="progress"><div style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      </div>

      {step === 0 && (
        <div className="card card-pad" style={{ padding: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>01 · ยืนยันตัวตน</div>
          <h2 className="h-section" style={{ marginBottom: 8 }}>เริ่มด้วยรหัสนิสิต</h2>
          <p className="muted" style={{ marginBottom: 24 }}>ระบบจะดึงข้อมูลพื้นฐาน (ชื่อ · รุ่น · สาขา) จากฐานข้อมูลคณะ คุณแก้ไขได้ภายหลัง</p>

          <label className="small" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>รหัสนิสิต</label>
          <input className="mono" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="เช่น 64131xxxxx"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', fontSize: 16, marginBottom: 14 }} />

          <label className="small" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>อีเมล</label>
          <input placeholder="ชื่อ@g.swu.ac.th (หรืออีเมลศิษย์เก่า)"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', fontSize: 16, marginBottom: 20 }} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--blue-soft)', padding: '12px 14px', borderRadius: 10, marginBottom: 20 }}>
            <Icon name="sparkles" size={16} />
            <div className="small">ไม่มีรหัสนิสิตแล้ว? <a href="#" style={{ textDecoration: 'underline' }}>ยืนยันด้วยบัตรประชาชน + ชื่อพี่ take</a></div>
          </div>

          <button className="btn btn-red btn-lg btn-block" onClick={next}>ถัดไป · ระบุพี่ take <Icon name="arrow-right" size={16} /></button>
        </div>
      )}

      {step === 1 && (
        <div className="card card-pad" style={{ padding: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>02 · ระบุพี่ take</div>
          <h2 className="h-section" style={{ marginBottom: 8 }}>พี่ take ของคุณคือใคร?</h2>
          <p className="muted" style={{ marginBottom: 24 }}>ระบุได้หลายคน ระบบจะเชื่อมต่อไปหาปู่ ทวด เทียด อัตโนมัติ</p>

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input placeholder="ค้นหาชื่อ หรือรหัสนิสิตของพี่ take" value={takeName} onChange={e => setTakeName(e.target.value)}
              style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', fontSize: 15 }} />
            <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--mute)' }} />
          </div>

          {/* Suggested */}
          <div className="eyebrow" style={{ marginBottom: 10 }}>พี่ที่ระบบแนะนำจากรุ่น 61</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
            {[
              { name: 'ฟ้า ชนัญญา', gen: 61, hint: 'ที่ปรึกษาชมรม MK Club', hue: 340, selected: true },
              { name: 'โจ้ ปรัชญา', gen: 61, hint: 'Head Boy รุ่น 61', hue: 200 },
              { name: 'มินท์ อธิชา', gen: 61, hint: 'ประธานรุ่น', hue: 280 },
            ].map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid',
                borderColor: p.selected ? 'var(--red)' : 'var(--line)',
                borderRadius: 12, background: p.selected ? 'var(--red-soft)' : 'transparent',
                cursor: 'pointer',
              }}>
                <Avatar name={p.name} hue={p.hue} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name} <span className="mono muted tiny">{p.gen}</span></div>
                  <div className="tiny muted">{p.hint}</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', border: '2px solid',
                  borderColor: p.selected ? 'var(--red)' : 'var(--line-2)',
                  background: p.selected ? 'var(--red)' : 'transparent',
                  display: 'grid', placeItems: 'center',
                }}>
                  {p.selected && <Icon name="check" size={12} stroke={3} style={{ color: 'white' }} />}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: 14, background: 'var(--paper-2)', borderRadius: 12, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>🪞 Preview · เชื่อมได้อัตโนมัติ</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <Chip tone="dark">คุณ · 64</Chip>
              <Icon name="chevron-right" size={12} />
              <Chip tone="red">พี่ฟ้า · 61</Chip>
              <Icon name="chevron-right" size={12} />
              <Chip>พี่ดิน · 58</Chip>
              <Icon name="chevron-right" size={12} />
              <Chip>พี่แพร · 55</Chip>
              <Icon name="chevron-right" size={12} />
              <Chip>พี่กันต์ · 51</Chip>
              <Icon name="chevron-right" size={12} />
              <Chip>อ.ศรีรัตน์ · 47</Chip>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={prev}>ย้อนกลับ</button>
            <button className="btn btn-red btn-block" onClick={next}>ถัดไป · ชวนรุ่นของคุณ <Icon name="arrow-right" size={16} /></button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card card-pad" style={{ padding: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>03 · ชวนเป็นทอด ๆ</div>
          <h2 className="h-section" style={{ marginBottom: 8 }}>ชวน 3 คน · ปลดล็อค Badge "ผู้ก่อร่าง"</h2>
          <p className="muted" style={{ marginBottom: 22 }}>ยิ่งคุณชวนเยอะ สายตระกูลยิ่งสมบูรณ์ · คนที่เข้ามาจาก invite ของคุณจะถูก mark ให้คุณอัตโนมัติ แล้วคุณค่อยยืนยันว่าเขาเป็น พี่ / น้อง / ปู่ / ทวด</p>

          {/* progress ring */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <InviteProgress count={invites.length} total={3} />
          </div>

          {/* invite by search or link */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input placeholder="ชื่อ · รหัสนิสิต · หรืออีเมล" value={newInvite} onChange={e => setNewInvite(e.target.value)}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)' }} />
            <button className="btn btn-primary" onClick={() => { if (newInvite) { setInvites(v => [...v, { name: newInvite, sent: true }]); setNewInvite(''); } }}>
              ส่งคำเชิญ
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-outline btn-sm"><Icon name="qr" size={14} /> QR code</button>
            <button className="btn btn-outline btn-sm"><Icon name="link" size={14} /> คัดลอกลิงก์</button>
          </div>

          {/* sent invites */}
          {invites.length > 0 && (
            <div className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--paper-2)', border: 'none' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>ส่งแล้ว {invites.length} คน</div>
              {invites.map((iv, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <Avatar name={iv.name} hue={(i*80)%360} size="sm" />
                  <span style={{ flex: 1, fontSize: 14 }}>{iv.name}</span>
                  <Chip tone="blue" icon="check">ส่งแล้ว</Chip>
                </div>
              ))}
            </div>
          )}

          {/* Suggested invites */}
          <div className="eyebrow" style={{ marginBottom: 10 }}>แนะนำ · คนที่อยู่ในกรุ๊ปของคุณ</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 22 }}>
            {[
              { name: 'แตน ชญานิน', gen: 64, via: 'กรุ๊ป MK64 LINE', hue: 60 },
              { name: 'เบียร์ ณัฐพงศ์', gen: 63, via: 'พี่รหัสเดียวกัน', hue: 170 },
              { name: 'ปัท ปาจรีย์', gen: 65, via: 'น้อง take ของพี่ฟ้า', hue: 310 },
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
                <Avatar name={p.name} hue={p.hue} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} <span className="mono muted tiny">{p.gen}</span></div>
                  <div className="tiny muted">ผ่าน {p.via}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setInvites(v => [...v, { name: p.name, sent: true }])}>
                  <Icon name="plus" size={12} /> ชวน
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={prev}>ย้อน</button>
            <button className="btn btn-red btn-block" onClick={next}>
              {invites.length >= 3 ? 'ปลดล็อค Badge + เข้าระบบ' : `ข้าม · ชวนภายหลัง`} <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card card-pad" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--red-soft)', color: 'var(--red)', margin: '0 auto 20px', display: 'grid', placeItems: 'center' }}>
            <Icon name="check" size={40} stroke={3} />
          </div>
          <h2 className="h-section" style={{ marginBottom: 8 }}>ยินดีต้อนรับเข้าสู่สายตระกูล</h2>
          <p className="muted" style={{ marginBottom: 28, maxWidth: 440, margin: '0 auto 28px' }}>
            เราเชื่อมคุณเข้ากับสาย 5 ทอด · 47 คนในตระกูล · และอีก 234 คนในเครือข่ายที่ 2-3 ทอด
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-red btn-lg" onClick={() => onNav('tree')}>ดูสายตระกูลของฉัน</button>
            <button className="btn btn-outline btn-lg" onClick={() => onNav('discover')}>ค้นพบเครือข่าย</button>
          </div>
        </div>
      )}
    </div>
  );
};

const InviteProgress = ({ count, total }) => {
  const pct = Math.min(count / total, 1);
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg width="120" height="120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--red)" strokeWidth="8"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .3s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }} className="tabular">{count}<span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/{total}</span></div>
          <div className="tiny muted">ชวนแล้ว</div>
        </div>
      </div>
    </div>
  );
};

window.ScreenOnboarding = ScreenOnboarding;

// ============== FAMILY TREE SCREEN ==============
const ScreenTree = ({ onNav }) => {
  const D = window.DATA;
  const [mode, setMode] = useState('ancestors'); // ancestors | descendants | all
  const [selected, setSelected] = useState(null);
  const [markModal, setMarkModal] = useState(null);
  const toast = useToast();

  const ancestorsReversed = [...D.ANCESTORS].reverse();
  const chainOrder = [...ancestorsReversed, D.CURRENT_USER, ...D.DESCENDANTS];

  return (
    <div className="page fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>สายตระกูลของคุณ</div>
          <h1 className="h-section" style={{ fontSize: 36, letterSpacing: '-0.02em' }}>ตระกูล "เทวะวงศ์"</h1>
          <div className="small muted" style={{ marginTop: 4 }}>
            47 คนในสาย · ยาวถึงรุ่น 47 · <span style={{ color: 'var(--red)' }}>3 คนยังไม่เข้าระบบ</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm"><Icon name="share" size={14} /> แชร์ต้นไม้</button>
          <button className="btn btn-primary btn-sm" onClick={() => setMarkModal('new')}><Icon name="plus" size={14} /> Mark คนในลิส</button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="tabs" style={{ marginBottom: 22 }}>
        {[
          { id: 'ancestors', label: `สายขึ้น (${D.ANCESTORS.length})`, icon: 'arrow-up-right' },
          { id: 'descendants', label: `สายลง (${D.DESCENDANTS.length})`, icon: 'arrow-right' },
          { id: 'all', label: 'ทั้งหมด', icon: 'users' },
        ].map(t => (
          <button key={t.id} className={mode === t.id ? 'active' : ''} onClick={() => setMode(t.id)}>
            <Icon name={t.icon} size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20 }} className="tree-layout">
        {/* Tree viz */}
        <div className="tree-canvas" style={{ padding: '28px 20px', minHeight: 560 }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
            {chainOrder.map((p, i) => {
              const isMe = p.id === D.CURRENT_USER.id;
              const isDesc = D.DESCENDANTS.some(d => d.id === p.id);
              const rel = isMe ? 'คุณ' : p.relation;
              return (
                <div key={p.id}>
                  <TreeNode person={p} isMe={isMe} isDesc={isDesc} relation={rel} onClick={() => setSelected(p)} />
                  {i < chainOrder.length - 1 && <TreeConnector />}
                </div>
              );
            })}

            {/* Unknown ancestor hint */}
            <TreeConnector dashed />
            <div style={{
              padding: '14px 18px', border: '2px dashed var(--line-2)', borderRadius: 14,
              background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
            }} onClick={() => setMarkModal('unknown')}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--paper-2)', display: 'grid', placeItems: 'center', color: 'var(--mute)' }}>
                <Icon name="plus" size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>รุ่น 45 และก่อนหน้า</div>
                <div className="tiny muted">หาพี่ทวดของพี่ทวด? ชวนพี่ที่รู้จักมาเชื่อมต่อ</div>
              </div>
              <Icon name="arrow-right" size={16} />
            </div>
          </div>
        </div>

        {/* Side panel: selected person */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {selected ? (
            <PersonPanel person={selected} onClose={() => setSelected(null)} onMessage={() => toast.show(`ส่งข้อความถึง ${selected.nickname || selected.name}`)} />
          ) : (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>ตัวช่วยค้นหา</div>
              <h3 className="h-card" style={{ marginBottom: 8 }}>คลิกที่คนในสายเพื่อดูรายละเอียด</h3>
              <p className="small muted" style={{ margin: 0 }}>รีวิวจากน้อง / สาขาที่ช่วยได้ / สถานะ online</p>
            </div>
          )}

          {/* Pending marks */}
          <div className="card card-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="eyebrow">รอ mark · {D.PENDING_MARKS.length} คน</div>
              <Chip tone="red">ใหม่</Chip>
            </div>
            {D.PENDING_MARKS.map(p => (
              <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Avatar name={p.name} hue={p.avatarHue} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} <span className="mono tiny muted">· {p.gen}</span></div>
                    <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.hint}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {['พี่', 'ปู่', 'ทวด', 'ไม่เกี่ยว'].map((r, i) => (
                    <button key={i} className="btn btn-outline btn-sm" onClick={() => toast.show(`mark ${p.name} เป็น "${r}"`)} style={{ fontSize: 11 }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Quick stats */}
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>สถิติตระกูลคุณ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }} className="tabular">47</div>
                <div className="tiny muted">สมาชิกในสาย</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)' }} className="tabular">17 ปี</div>
                <div className="tiny muted">ช่วงอายุตระกูล</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }} className="tabular">12</div>
                <div className="tiny muted">อุตสาหกรรม</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue)' }} className="tabular">#8</div>
                <div className="tiny muted">ในคณะ (ขนาด)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {markModal && (
        <Modal onClose={() => setMarkModal(null)}>
          <h3 className="h-card" style={{ marginBottom: 6 }}>Mark คนเข้าสายตระกูล</h3>
          <p className="small muted" style={{ marginBottom: 18 }}>ค้นหาจากลิสของระบบ แล้วเลือกว่าเป็น พี่ · ปู่ · ทวด · หรือ เทียด</p>
          <input placeholder="ค้นหาชื่อ หรือรหัสนิสิต" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', marginBottom: 14 }} />
          <div style={{ display: 'grid', gap: 6 }}>
            {['กลม พีรญา · 56', 'อิ้งค์ เมธาวี · 53', 'เบลล์ ประภาพรรณ · 59'].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
                <Avatar name={s} hue={(i*110)%360} size="sm" />
                <span style={{ flex: 1, fontSize: 14 }}>{s}</span>
                <select style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', fontSize: 13 }}>
                  <option>เลือก...</option>
                  <option>พี่ take</option><option>ปู่</option><option>ทวด</option><option>เทียด</option>
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn btn-outline btn-block" onClick={() => setMarkModal(null)}>ยกเลิก</button>
            <button className="btn btn-red btn-block" onClick={() => { setMarkModal(null); toast.show('บันทึกการเชื่อมต่อแล้ว'); }}>บันทึก</button>
          </div>
        </Modal>
      )}

      {toast.node}

      <style>{`
        @media (max-width: 900px) {
          .tree-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

const TreeNode = ({ person, isMe, isDesc, relation, onClick }) => {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: 14,
      background: isMe ? 'var(--ink)' : 'var(--card)',
      color: isMe ? 'white' : 'var(--ink)',
      border: '1px solid', borderColor: isMe ? 'var(--ink)' : 'var(--line)',
      borderRadius: 14, cursor: 'pointer',
      boxShadow: 'var(--shadow-sm)',
      transition: 'transform .1s',
    }} onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
       onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
      <Avatar name={person.name} hue={person.avatarHue} size="lg" verified={person.verified} online={person.online} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{person.name}</span>
          <span className="mono tiny" style={{ background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--paper-2)', padding: '2px 8px', borderRadius: 999 }}>
            รุ่น {person.gen}
          </span>
          {relation && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              background: isMe ? 'var(--yellow)' : (isDesc ? 'var(--blue)' : 'var(--red)'),
              color: isMe ? 'var(--ink)' : 'white',
              padding: '2px 8px', borderRadius: 999,
            }}>{relation}</span>
          )}
        </div>
        <div className="small" style={{ opacity: isMe ? 0.85 : 1, color: isMe ? 'white' : 'var(--ink-2)' }}>
          {person.position || person.role}
        </div>
        {person.company && (
          <div className="tiny" style={{ opacity: isMe ? 0.6 : 0.7, marginTop: 2, color: isMe ? 'white' : 'var(--mute)' }}>
            {person.company}{person.years ? ` · ทำงาน ${person.years} ปี` : ''}
          </div>
        )}
      </div>
      {person.tags && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }} className="hide-mobile">
          {person.tags.slice(0, 2).map((t, i) => (
            <span key={i} className="tiny" style={{
              padding: '2px 8px', borderRadius: 999,
              background: isMe ? 'rgba(255,255,255,0.1)' : 'var(--paper-2)',
              color: isMe ? 'rgba(255,255,255,0.8)' : 'var(--ink-2)',
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const TreeConnector = ({ dashed }) => (
  <div style={{ marginLeft: 30, height: 22, position: 'relative', display: 'flex', alignItems: 'center' }}>
    <div style={{
      position: 'absolute', top: 0, bottom: 0, left: 0,
      width: 2, background: dashed ? 'transparent' : 'var(--line-2)',
      borderLeft: dashed ? '2px dashed var(--line-2)' : 'none',
    }} />
  </div>
);

const PersonPanel = ({ person, onClose, onMessage }) => (
  <div className="card card-pad fade-in" style={{ position: 'relative' }}>
    <button className="iconbtn" style={{ position: 'absolute', top: 10, right: 10 }} onClick={onClose}><Icon name="x" size={16} /></button>
    <Avatar name={person.name} hue={person.avatarHue} size="lg" verified={person.verified} />
    <h3 style={{ fontSize: 20, margin: '12px 0 2px', letterSpacing: '-0.01em' }}>{person.name}</h3>
    <div className="small muted" style={{ marginBottom: 14 }}>{person.position}{person.company ? ` · ${person.company}` : ''}</div>

    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
      {person.relation && <Chip tone="red">{person.relation} · รุ่น {person.gen}</Chip>}
      {person.years && <Chip>{person.years} ปีในสายงาน</Chip>}
      {person.mutual && <Chip>{person.mutual} mutual</Chip>}
    </div>

    {person.helpful && (
      <>
        <div className="eyebrow" style={{ marginBottom: 8 }}>ช่วยน้องได้ในเรื่อง</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
          {person.helpful.map((h, i) => <Chip key={i} tone="blue" icon="check">{h}</Chip>)}
        </div>
      </>
    )}

    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-red btn-block" onClick={onMessage}>
        <Icon name="message" size={14} /> ส่งข้อความ
      </button>
      <button className="btn btn-outline btn-sm"><Icon name="star" size={14} /></button>
    </div>
  </div>
);

window.ScreenTree = ScreenTree;

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, useToast } from './AlumniUI';
import { api, errMsg, GENDER_OPTS, shortName } from './alumniApi';
import { AddPersonForm, SharePanel } from './LineKit';
import './alumni-styles.css';

const STEP_LABELS = ['ยืนยันตัวตน', 'ระบุพี่เทค', 'ชวนรุ่นของคุณ', 'เสร็จสิ้น'];
const inputStyle = { width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 16, marginBottom: 14 };

const AlumniOnboardingPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const [studentId, setStudentId] = useState('');
  const [gen, setGen] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState('current_student');
  const [kGender, setKGender] = useState('u');
  const [regErr, setRegErr] = useState(null);

  const [myGen, setMyGen] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [claimedGhosts, setClaimedGhosts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTakes, setSelectedTakes] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [takeErr, setTakeErr] = useState(null);

  const [invite, setInvite] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState(null);

  useEffect(() => {
    if (!user) { navigate('/login?redirect=/alumni/onboarding'); return; }
    api.get(token, '/alumni/me').then(r => {
      if (r.data.registered) {
        setAlreadyRegistered(true); setMyGen(r.data.profile.gen); setStep(3);
      } else {
        if (user.student_id) setStudentId(user.student_id);
        if (user.full_name) setNickname(user.full_name.split(' ')[0]);
        if (user.student_id && user.student_id.length >= 2) {
          const guess = parseInt(user.student_id.substring(0, 2), 10);
          if (guess >= 40 && guess <= 70) setGen(String(guess));
        }
      }
    }).catch(() => {});
    // eslint-disable-next-line
  }, [user]);

  useEffect(() => {
    if (step !== 1 || !searchTerm || searchTerm.length < 2) { setSearchResults([]); return undefined; }
    const t = setTimeout(() => {
      api.get(token, '/alumni/search', { q: searchTerm, limit: 6 })
        .then(r => setSearchResults((r.data.results || []).filter(x => x.user_id !== user.id)))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [searchTerm, step]);

  const next = () => setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const handleRegister = async () => {
    setRegErr(null);
    if (!studentId || !gen) { setRegErr('กรุณากรอกรหัสนิสิตและรุ่น'); return; }
    setLoading(true);
    try {
      const r = await api.post(token, '/alumni/register', {
        student_id: studentId, gen: parseInt(gen, 10),
        nickname: nickname || user.full_name.split(' ')[0],
        role, major: 'การตลาด', avatar_hue: 210,
        kinship_gender: kGender === 'u' ? null : kGender,
      });
      setMyGen(r.data.gen || parseInt(gen, 10));
      toast.show('ลงทะเบียนสำเร็จ');

      // arrived through an invite link: go back there to accept and (if needed) claim the name
      const pendingCode = localStorage.getItem('pending_invite_code');
      if (pendingCode) {
        localStorage.removeItem('pending_invite_code');
        navigate(`/alumni/invite/${pendingCode}?auto=1`);
        return;
      }
      // no invite: look for placeholders that might be this person
      try {
        const s = await api.get(token, '/alumni/ghost-suggestions');
        setSuggestions(s.data.suggestions || []);
      } catch { /* optional */ }
      next();
    } catch (e) {
      setRegErr(errMsg(e, 'ลงทะเบียนไม่สำเร็จ'));
    } finally { setLoading(false); }
  };

  const claimGhost = async (g) => {
    try {
      const r = await api.post(token, `/alumni/ghosts/${g.user_id}/claim`, {});
      setClaimedGhosts(c => [...c, g.user_id]);
      toast.show(r.data.status === 'merged' ? 'รวมชื่อเข้าบัญชีแล้ว' : 'ส่งคำขอแล้ว รอสมาชิกในสายช่วยยืนยันว่าเป็นคุณ');
    } catch (e) { toast.show(errMsg(e, 'ส่งคำขอไม่สำเร็จ')); }
  };

  const handlePickSenior = async (p) => {
    setTakeErr(null);
    if (selectedTakes.some(s => s.user_id === p.user_id)) { toast.show('เลือกคนนี้แล้ว'); return; }
    try {
      await api.post(token, '/alumni/relations/claim', { junior_id: user.id, senior_id: p.user_id });
      setSelectedTakes(prev => [...prev, p]);
      toast.show(`ส่งเรื่องให้ ${shortName(p)} ยืนยันแล้ว`);
    } catch (e) { setTakeErr(errMsg(e, 'เชื่อมไม่สำเร็จ')); }
  };

  const makeInvite = async () => {
    setInviteBusy(true); setInviteErr(null);
    try {
      const r = await api.post(token, '/alumni/invites', { reveal_game: true, relation_hint: 'น้องเทค' });
      setInvite(r.data);
    } catch (e) { setInviteErr(errMsg(e, 'สร้างลิงก์ไม่สำเร็จ')); }
    finally { setInviteBusy(false); }
  };

  if (!user) return null;
  const visibleSuggestions = suggestions.filter(s => !claimedGhosts.includes(s.user_id));

  return (
    <AlumniLayout showBottomNav={false}>
      <div className="al-page al-fade-in" style={{ maxWidth: 760 }} data-testid="alumni-onboarding-page">
        <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => navigate('/alumni')} style={{ marginBottom: 24 }} data-testid="alumni-onboarding-back-btn">
          ← กลับ
        </button>

        <div style={{ marginBottom: 28 }}>
          <div className="al-mono" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: 'var(--al-mute)' }}>
            <span>ขั้น {step + 1}/{STEP_LABELS.length}</span><span>{STEP_LABELS[step]}</span>
          </div>
          <div className="al-progress"><div style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }} /></div>
        </div>

        {step === 0 && (
          <div className="al-card al-card-pad" style={{ padding: 'clamp(20px, 5vw, 32px)' }} data-testid="onboarding-step-0">
            <div className="al-eyebrow" style={{ marginBottom: 10 }}>01 · ยืนยันตัวตน</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>เริ่มด้วยรหัสนิสิต</h2>
            <p className="al-muted" style={{ marginBottom: 24 }}>บอกรหัสนิสิต รุ่น และชื่อเล่นสั้น ๆ แล้วเราจะช่วยหาสายเทคของคุณ</p>

            <label className="al-label" htmlFor="ob-sid">รหัสนิสิต</label>
            <input id="ob-sid" className="al-mono" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="เช่น 64131xxxxx" style={inputStyle} data-testid="onboarding-student-id-input" />

            <label className="al-label" htmlFor="ob-gen">รุ่น (เลขปีที่เข้าเรียน)</label>
            <input id="ob-gen" className="al-mono" inputMode="numeric" value={gen} onChange={e => setGen(e.target.value.replace(/\D/g, ''))} placeholder="เช่น 64" style={inputStyle} data-testid="onboarding-gen-input" />

            <label className="al-label" htmlFor="ob-nick">ชื่อเล่น</label>
            <input id="ob-nick" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="ชื่อเล่น" style={inputStyle} data-testid="onboarding-nickname-input" />

            <div className="al-label">สถานะ</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {[{ v: 'current_student', l: 'นิสิตปัจจุบัน' }, { v: 'alumni', l: 'ศิษย์เก่า' }, { v: 'staff', l: 'บุคลากร/อาจารย์' }].map(opt => (
                <button key={opt.v} onClick={() => setRole(opt.v)} aria-pressed={role === opt.v} data-testid={`onboarding-role-${opt.v}`}
                  className={`al-btn ${role === opt.v ? 'al-btn-primary' : 'al-btn-outline'} al-btn-sm`}>
                  {role === opt.v && <Icon name="check" size={12} />} {opt.l}
                </button>
              ))}
            </div>

            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 20px' }}>
              <legend className="al-label">คำเรียกในสาย <span className="al-muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></legend>
              <div className="al-seg" role="group" aria-label="คำเรียกในสาย">
                {GENDER_OPTS.map(g => (
                  <button type="button" key={g.v} aria-pressed={kGender === g.v} onClick={() => setKGender(g.v)} data-testid={`onboarding-kgender-${g.v}`}>{g.l}</button>
                ))}
              </div>
              <div className="al-help" data-testid="onboarding-kgender-note">
                ถามไว้ให้รุ่นน้องเรียกคุณได้ถูก เช่น "ลุงเทค" หรือ "ป้าเทค" ถ้าไม่ระบุ สายจะเรียกแบบรวมว่า "ลุง/ป้าเทค" แก้ภายหลังได้ที่โปรไฟล์
              </div>
            </fieldset>

            {regErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 10 }} data-testid="onboarding-error">{regErr}</div>}
            <button className="al-btn al-btn-red al-btn-lg al-btn-block" onClick={handleRegister} disabled={loading} data-testid="onboarding-next-0-btn">
              {loading ? 'กำลังบันทึก...' : 'ถัดไป · ระบุพี่เทค'} <Icon name="arrow-right" size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="al-card al-card-pad" style={{ padding: 'clamp(20px, 5vw, 32px)' }} data-testid="onboarding-step-1">
            {visibleSuggestions.length > 0 && (
              <div style={{ background: 'var(--al-blue-soft)', borderRadius: 14, padding: 16, marginBottom: 22 }} data-testid="ghost-suggestions">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>นี่คือคุณใช่ไหม?</div>
                <div className="al-small" style={{ marginBottom: 10 }}>เพื่อนในสายเพิ่มชื่อคล้ายคุณไว้แล้ว ถ้าใช่ กดเลย สายที่เขาต่อไว้จะย้ายมาที่บัญชีคุณ (สมาชิกในสายช่วยยืนยันอีกที)</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {visibleSuggestions.map(g => (
                    <div key={g.user_id} className="al-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }} data-testid={`ghost-suggestion-${g.user_id}`}>
                      <Avatar name={g.name} hue={g.avatar_hue || 200} size="sm" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                        <div className="al-tiny al-muted">รุ่น {g.gen}</div>
                      </div>
                      <button className="al-btn al-btn-red al-btn-sm" onClick={() => claimGhost(g)} data-testid={`ghost-claim-btn-${g.user_id}`}>นี่คือฉัน</button>
                      <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => setClaimedGhosts(c => [...c, g.user_id])}>ไม่ใช่</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="al-eyebrow" style={{ marginBottom: 10 }}>02 · ระบุพี่เทค</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>พี่เทคของคุณคือใคร?</h2>
            <p className="al-muted" style={{ marginBottom: 18 }}>
              พี่เทคคือรุ่นพี่ที่ดูแลคุณในสายเทค ถ้าเขายังไม่ได้ลงทะเบียน เพิ่มชื่อไว้ก่อนได้ แล้วค่อยชวนเขามาทีหลัง
            </p>

            <div className="al-seg" role="group" aria-label="วิธีระบุ" style={{ marginBottom: 14 }}>
              <button aria-pressed={!addMode} onClick={() => setAddMode(false)} data-testid="onboarding-mode-search">ค้นหาคนที่ลงทะเบียนแล้ว</button>
              <button aria-pressed={addMode} onClick={() => setAddMode(true)} data-testid="onboarding-mode-add">ยังไม่ได้ลงทะเบียน</button>
            </div>

            {!addMode ? (
              <>
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <input aria-label="ค้นหาพี่เทค" placeholder="ค้นหาชื่อ หรือรหัสนิสิตของพี่เทค" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 15 }}
                    data-testid="onboarding-take-search-input" />
                  <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--al-mute)' }} />
                </div>
                {takeErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', margin: '6px 0' }}>{takeErr}</div>}
                {searchResults.length > 0 && (
                  <div style={{ display: 'grid', gap: 8, margin: '14px 0 20px' }}>
                    <div className="al-eyebrow">ผลลัพธ์ ({searchResults.length})</div>
                    {searchResults.map(p => {
                      const picked = selectedTakes.some(s => s.user_id === p.user_id);
                      return (
                        <button key={p.user_id} onClick={() => handlePickSenior(p)} data-testid={`onboarding-take-result-${p.user_id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid', borderColor: picked ? 'var(--al-red)' : 'var(--al-line)', borderRadius: 12, background: picked ? 'var(--al-red-soft)' : 'white', textAlign: 'left', width: '100%' }}>
                          <Avatar name={p.name} hue={p.avatar_hue || 200} size="md" verified={p.verified} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name} <span className="al-mono al-muted al-tiny">รุ่น {p.gen}</span></div>
                            <div className="al-tiny al-muted">{p.position || p.role}</div>
                          </div>
                          {picked ? <Chip tone="red" icon="check">ส่งเรื่องแล้ว</Chip> : <Chip>เลือก</Chip>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <AddPersonForm token={token} term="พี่เทค" attach={{ as: 'senior', toId: user.id }} defaultGen={myGen ? myGen - 1 : ''}
                  submitLabel="เพิ่มพี่เทคเข้าสาย"
                  onCreated={(g) => { setSelectedTakes(prev => [...prev, g]); setAddMode(false); toast.show(`เพิ่ม ${shortName(g)} แล้ว`); }} />
              </div>
            )}

            {selectedTakes.length > 0 && (
              <div style={{ padding: 14, background: 'var(--al-paper-2)', borderRadius: 12, marginBottom: 20 }} data-testid="onboarding-selected">
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>ระบุแล้ว {selectedTakes.length} คน · รอเจ้าตัวหรือเพื่อนในสายยืนยัน</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedTakes.map(p => <Chip key={p.user_id} tone="red" icon="check">{shortName(p)} · {p.gen}</Chip>)}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="al-btn al-btn-outline" onClick={prev} data-testid="onboarding-prev-1-btn">ย้อนกลับ</button>
              <button className="al-btn al-btn-red al-btn-block" onClick={next} data-testid="onboarding-next-1-btn">
                {selectedTakes.length > 0 ? 'ถัดไป · ชวนรุ่นของคุณ' : 'ข้าม · ระบุภายหลัง'} <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="al-card al-card-pad" style={{ padding: 'clamp(20px, 5vw, 32px)' }} data-testid="onboarding-step-2">
            <div className="al-eyebrow" style={{ marginBottom: 10 }}>03 · ชวนมาต่อสาย</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>ชวนเพื่อนรุ่นเดียวกัน หรือน้อง ๆ</h2>
            <p className="al-muted" style={{ marginBottom: 18 }}>สร้างลิงก์แล้วส่งทาง LINE ปลายทางจะได้เล่นเกมทายว่าใครชวน แล้วเข้าสายมาด้วยกัน</p>
            {!invite ? (
              <>
                {inviteErr && <div role="alert" className="al-small" style={{ color: 'var(--al-red-ink)', marginBottom: 10 }}>{inviteErr}</div>}
                <button className="al-btn al-btn-primary al-btn-block" onClick={makeInvite} disabled={inviteBusy} data-testid="onboarding-send-invite-btn">
                  <Icon name="sparkles" size={14} /> {inviteBusy ? 'กำลังสร้าง...' : 'สร้างลิงก์ชวน'}
                </button>
              </>
            ) : (
              <SharePanel invite={invite} revealGame inviterName={nickname} onToast={toast.show} />
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="al-btn al-btn-outline" onClick={prev} data-testid="onboarding-prev-2-btn">ย้อน</button>
              <button className="al-btn al-btn-red al-btn-block" onClick={next} data-testid="onboarding-next-2-btn">
                {invite ? 'เสร็จแล้ว · เข้าระบบ' : 'ข้าม · ชวนภายหลัง'} <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="al-card al-card-pad" style={{ padding: 'clamp(24px, 6vw, 40px)', textAlign: 'center' }} data-testid="onboarding-step-3">
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--al-red-soft)', color: 'var(--al-red)', margin: '0 auto 20px', display: 'grid', placeItems: 'center' }}>
              <Icon name="check" size={40} stroke={3} />
            </div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>{alreadyRegistered ? 'คุณลงทะเบียนไว้แล้ว' : 'ยินดีต้อนรับเข้าสู่สายเทค'}</h2>
            <p className="al-muted" style={{ maxWidth: 440, margin: '0 auto 28px' }}>
              ไปดูสายของคุณ เห็นว่าขาดใครอยู่ แล้วชวนเขามาต่อสายด้วยกัน
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="al-btn al-btn-red al-btn-lg" onClick={() => navigate('/alumni/tree')} data-testid="onboarding-go-tree-btn">ดูสายเทคของฉัน</button>
              <button className="al-btn al-btn-outline al-btn-lg" onClick={() => navigate('/alumni/profile')} data-testid="onboarding-go-profile-btn">ไปที่โปรไฟล์</button>
            </div>
          </div>
        )}
        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniOnboardingPage;

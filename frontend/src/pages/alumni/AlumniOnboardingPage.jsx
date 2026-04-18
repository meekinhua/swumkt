import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STEP_LABELS = ['ยืนยันตัวตน', 'ระบุพี่ take', 'ชวนรุ่นของคุณ', 'เสร็จสิ้น'];

// Progress ring for invites
const InviteProgress = ({ count, total }) => {
  const pct = Math.min(count / total, 1);
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg width="120" height="120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--al-line)" strokeWidth="8" />
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--al-red)" strokeWidth="8"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .3s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="al-tabular" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {count}<span className="al-muted" style={{ fontSize: 14, fontWeight: 500 }}>/{total}</span>
          </div>
          <div className="al-tiny al-muted">ชวนแล้ว</div>
        </div>
      </div>
    </div>
  );
};

const AlumniOnboardingPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  // Step 1 form
  const [studentId, setStudentId] = useState('');
  const [gen, setGen] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState('current_student');

  // Step 2 — take/ancestor selection
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTakes, setSelectedTakes] = useState([]);  // array of alumni objects

  // Step 3 — invites
  const [invites, setInvites] = useState([]);
  const [newInvite, setNewInvite] = useState('');

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!user) {
      navigate('/login?redirect=/alumni/onboarding');
      return;
    }
    // Check if already registered
    axios.get(`${API}/alumni/me`, authHeader).then(r => {
      if (r.data.registered) {
        setAlreadyRegistered(true);
        setStep(3);  // skip to done
      } else {
        // Prefill from existing user
        if (user.student_id) setStudentId(user.student_id);
        if (user.full_name) setNickname(user.full_name.split(' ')[0]);
        // Guess gen from student_id first 2 digits
        if (user.student_id && user.student_id.length >= 2) {
          const guess = parseInt(user.student_id.substring(0, 2), 10);
          if (guess >= 40 && guess <= 70) setGen(String(guess));
        }
      }
    }).catch(() => {});
  }, [user]);

  // Search as user types on step 2
  useEffect(() => {
    if (step !== 1 || !searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      axios.get(`${API}/alumni/search`, { ...authHeader, params: { q: searchTerm, limit: 6 } })
        .then(r => setSearchResults(r.data.results || []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, step]);

  const next = () => setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  // ---- Actions ----
  const handleRegister = async () => {
    if (!studentId || !gen) {
      toast.show('กรุณากรอกรหัสนิสิตและรุ่น');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/alumni/register`, {
        student_id: studentId,
        gen: parseInt(gen, 10),
        nickname: nickname || user.full_name.split(' ')[0],
        role,
        major: 'การตลาด',
        avatar_hue: 210,
      }, authHeader);
      toast.show('ลงทะเบียนสำเร็จ');

      // Check for pending invite code (from /alumni/invite/{code} flow)
      const pendingCode = localStorage.getItem('pending_invite_code');
      if (pendingCode) {
        try {
          await axios.post(`${API}/alumni/invites/accept/${pendingCode}`, {}, authHeader);
          localStorage.removeItem('pending_invite_code');
          toast.show('เชื่อมเข้ากับสายของผู้เชิญแล้ว');
        } catch {
          localStorage.removeItem('pending_invite_code');
        }
      }

      next();
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ลงทะเบียนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkTake = async (targetUser) => {
    if (selectedTakes.some(s => s.user_id === targetUser.user_id)) {
      toast.show('เลือกคนนี้แล้ว');
      return;
    }
    try {
      await axios.post(`${API}/alumni/relations`, {
        to_user_id: targetUser.user_id,
        kind: 'take',
      }, authHeader);
      setSelectedTakes(prev => [...prev, targetUser]);
      toast.show(`ส่งคำขอไปยัง ${targetUser.nickname || targetUser.name} · รอการยืนยัน`);
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ไม่สามารถ mark ได้');
    }
  };

  const handleSendInvite = async () => {
    if (!newInvite.trim()) return;
    try {
      const isEmail = newInvite.includes('@');
      await axios.post(`${API}/alumni/invites`, {
        invitee_email: isEmail ? newInvite : null,
        invitee_student_id: !isEmail && /^\d+/.test(newInvite) ? newInvite : null,
        invitee_name: !isEmail && !/^\d+/.test(newInvite) ? newInvite : null,
      }, authHeader);
      setInvites(prev => [...prev, { name: newInvite, sent: true }]);
      setNewInvite('');
      toast.show('ส่งคำเชิญแล้ว');
    } catch (e) {
      toast.show('ส่งคำเชิญไม่สำเร็จ');
    }
  };

  if (!user) return null;

  return (
    <AlumniLayout showBottomNav={false}>
      <div className="al-page al-fade-in" style={{ maxWidth: 760 }} data-testid="alumni-onboarding-page">
        <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => navigate('/alumni')} style={{ marginBottom: 24 }}
          data-testid="alumni-onboarding-back-btn">
          ← กลับ
        </button>

        {/* Stepper */}
        <div style={{ marginBottom: 32 }}>
          <div className="al-mono" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: 'var(--al-mute)' }}>
            <span>ขั้น {step + 1}/{STEP_LABELS.length}</span>
            <span>{STEP_LABELS[step]}</span>
          </div>
          <div className="al-progress"><div style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }} /></div>
        </div>

        {/* STEP 0: Register */}
        {step === 0 && (
          <div className="al-card al-card-pad" style={{ padding: 32 }} data-testid="onboarding-step-0">
            <div className="al-eyebrow" style={{ marginBottom: 10 }}>01 · ยืนยันตัวตน</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>เริ่มด้วยรหัสนิสิต</h2>
            <p className="al-muted" style={{ marginBottom: 24 }}>
              ระบบจะดึงข้อมูลพื้นฐาน (ชื่อ · รุ่น · สาขา) จากฐานข้อมูลคณะ คุณแก้ไขได้ภายหลัง
            </p>

            <label className="al-small" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>รหัสนิสิต</label>
            <input className="al-mono" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="เช่น 64131xxxxx"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 16, marginBottom: 14 }}
              data-testid="onboarding-student-id-input"
            />

            <label className="al-small" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>รุ่น (รหัสปีเข้าศึกษา)</label>
            <input className="al-mono" value={gen} onChange={e => setGen(e.target.value.replace(/\D/g, ''))} placeholder="เช่น 64"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 16, marginBottom: 14 }}
              data-testid="onboarding-gen-input"
            />

            <label className="al-small" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>ชื่อเล่น</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="ชื่อเล่น"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 16, marginBottom: 14 }}
              data-testid="onboarding-nickname-input"
            />

            <label className="al-small" style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>สถานะ</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { v: 'current_student', l: 'นิสิตปัจจุบัน' },
                { v: 'alumni', l: 'ศิษย์เก่า' },
                { v: 'staff', l: 'บุคลากร/อาจารย์' },
              ].map(opt => (
                <button key={opt.v} onClick={() => setRole(opt.v)} data-testid={`onboarding-role-${opt.v}`}
                  className={`al-btn ${role === opt.v ? 'al-btn-primary' : 'al-btn-outline'} al-btn-sm`}>
                  {role === opt.v && <Icon name="check" size={12} />} {opt.l}
                </button>
              ))}
            </div>

            <button className="al-btn al-btn-red al-btn-lg al-btn-block" onClick={handleRegister} disabled={loading} data-testid="onboarding-next-0-btn">
              {loading ? 'กำลังบันทึก...' : 'ถัดไป · ระบุพี่ take'} <Icon name="arrow-right" size={16} />
            </button>
          </div>
        )}

        {/* STEP 1: Take search */}
        {step === 1 && (
          <div className="al-card al-card-pad" style={{ padding: 32 }} data-testid="onboarding-step-1">
            <div className="al-eyebrow" style={{ marginBottom: 10 }}>02 · ระบุพี่ take</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>พี่ take ของคุณคือใคร?</h2>
            <p className="al-muted" style={{ marginBottom: 24 }}>
              ระบุได้หลายคน ระบบจะเชื่อมต่อไปหาปู่ ทวด เทียด อัตโนมัติ · อีกฝั่งจะต้องยืนยันก่อน
            </p>

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input placeholder="ค้นหาชื่อ หรือรหัสนิสิตของพี่ take" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '14px 16px 14px 44px', borderRadius: 12, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', fontSize: 15 }}
                data-testid="onboarding-take-search-input"
              />
              <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--al-mute)' }} />
            </div>

            {searchResults.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
                <div className="al-eyebrow">ผลลัพธ์ ({searchResults.length})</div>
                {searchResults.map(p => {
                  const picked = selectedTakes.some(s => s.user_id === p.user_id);
                  return (
                    <button key={p.user_id} onClick={() => handleMarkTake(p)} data-testid={`onboarding-take-result-${p.user_id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid',
                        borderColor: picked ? 'var(--al-red)' : 'var(--al-line)',
                        borderRadius: 12, background: picked ? 'var(--al-red-soft)' : 'white',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}>
                      <Avatar name={p.name} hue={p.avatar_hue || 200} size="md" verified={p.verified} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {p.name} <span className="al-mono al-muted al-tiny">{p.gen}</span>
                        </div>
                        <div className="al-tiny al-muted">{p.position || p.role}</div>
                      </div>
                      {picked ? <Chip tone="red" icon="check">ส่งคำขอแล้ว</Chip> : <Chip>เลือก</Chip>}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedTakes.length > 0 && (
              <div style={{ padding: 14, background: 'var(--al-paper-2)', borderRadius: 12, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>เลือกแล้ว {selectedTakes.length} คน</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {selectedTakes.map(p => (
                    <Chip key={p.user_id} tone="red" icon="check">
                      {p.nickname || p.name} · {p.gen}
                    </Chip>
                  ))}
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

        {/* STEP 2: Invites */}
        {step === 2 && (
          <div className="al-card al-card-pad" style={{ padding: 32 }} data-testid="onboarding-step-2">
            <div className="al-eyebrow" style={{ marginBottom: 10 }}>03 · ชวนเป็นทอด ๆ</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>ชวน 3 คน · ปลดล็อค Badge "ผู้ก่อร่าง"</h2>
            <p className="al-muted" style={{ marginBottom: 22 }}>
              ยิ่งคุณชวนเยอะ สายตระกูลยิ่งสมบูรณ์ · คนที่เข้ามาจาก invite ของคุณจะถูก mark ให้คุณอัตโนมัติ
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <InviteProgress count={invites.length} total={3} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input placeholder="ชื่อ · รหัสนิสิต · หรืออีเมล" value={newInvite} onChange={e => setNewInvite(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
                data-testid="onboarding-invite-input"
              />
              <button className="al-btn al-btn-primary" onClick={handleSendInvite} data-testid="onboarding-send-invite-btn">
                ส่งคำเชิญ
              </button>
            </div>

            {invites.length > 0 && (
              <div className="al-card" style={{ padding: 14, marginBottom: 16, background: 'var(--al-paper-2)', border: 'none' }}>
                <div className="al-eyebrow" style={{ marginBottom: 10 }}>ส่งแล้ว {invites.length} คน</div>
                {invites.map((iv, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <Avatar name={iv.name} hue={(i * 80) % 360} size="sm" />
                    <span style={{ flex: 1, fontSize: 14 }}>{iv.name}</span>
                    <Chip tone="blue" icon="check">ส่งแล้ว</Chip>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="al-btn al-btn-outline" onClick={prev} data-testid="onboarding-prev-2-btn">ย้อน</button>
              <button className="al-btn al-btn-red al-btn-block" onClick={next} data-testid="onboarding-next-2-btn">
                {invites.length >= 3 ? 'ปลดล็อค Badge + เข้าระบบ' : 'ข้าม · ชวนภายหลัง'} <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 3 && (
          <div className="al-card al-card-pad" style={{ padding: 40, textAlign: 'center' }} data-testid="onboarding-step-3">
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--al-red-soft)', color: 'var(--al-red)',
              margin: '0 auto 20px', display: 'grid', placeItems: 'center',
            }}>
              <Icon name="check" size={40} stroke={3} />
            </div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>
              {alreadyRegistered ? 'คุณลงทะเบียนไว้แล้ว' : 'ยินดีต้อนรับเข้าสู่สายตระกูล'}
            </h2>
            <p className="al-muted" style={{ marginBottom: 28, maxWidth: 440, margin: '0 auto 28px' }}>
              เราเชื่อมคุณเข้ากับสายตระกูล MKT SWU · ไปดูต้นไม้ของคุณ หรือค้นหาเครือข่าย
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="al-btn al-btn-red al-btn-lg" onClick={() => navigate('/alumni/tree')} data-testid="onboarding-go-tree-btn">
                ดูสายตระกูลของฉัน
              </button>
              <button className="al-btn al-btn-outline al-btn-lg" onClick={() => navigate('/alumni/profile')} data-testid="onboarding-go-profile-btn">
                ไปที่โปรไฟล์
              </button>
            </div>
          </div>
        )}

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniOnboardingPage;

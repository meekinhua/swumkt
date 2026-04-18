import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, StatPill, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BADGES_CATALOG = [
  { key: 'tree_builder', emoji: '🌳', name: 'ผู้ก่อร่าง', desc: 'ชวน 5 คน' },
  { key: '5_tier_club', emoji: '🔗', name: '5 ทอดคลับ', desc: 'สายยาว 5 ชั้น' },
  { key: 'reviewer', emoji: '⭐', name: 'นักรีวิว', desc: 'รีวิวพี่ 3 คน' },
  { key: 'connector', emoji: '🤝', name: 'Connector', desc: 'ทักทาย 10 คน' },
  { key: 'career_helper', emoji: '💼', name: 'Career Helper', desc: 'refer งาน 1 คน' },
  { key: 'king', emoji: '👑', name: 'นายก๊ก', desc: 'ชวน 10 คน' },
  { key: 'mentor', emoji: '🎓', name: 'Mentor ตัวจริง', desc: 'รับ mentee 1 คน' },
  { key: 'event_goer', emoji: '🗓️', name: 'Event Go-er', desc: 'ร่วม reunion' },
];

const AlumniProfilePage = () => {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notRegistered, setNotRegistered] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };
  const isOwn = !userId || userId === user?.id;

  useEffect(() => {
    if (!user) {
      navigate('/login?redirect=/alumni/profile');
      return;
    }
    loadProfile();
  }, [user, userId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      if (isOwn) {
        const r = await axios.get(`${API}/alumni/me`, authHeader);
        if (!r.data.registered) {
          setNotRegistered(true);
          setLoading(false);
          return;
        }
        setProfile(r.data.profile);
        setEditForm(r.data.profile);
      } else {
        const r = await axios.get(`${API}/alumni/profile/${userId}`, authHeader);
        setProfile(r.data);
      }
      // Load tree for path display
      const treeR = await axios.get(`${API}/alumni/tree/${userId || 'me'}`, authHeader);
      setTree(treeR.data);
    } catch (e) {
      if (e.response?.status === 404) setNotRegistered(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await axios.put(`${API}/alumni/me`, {
        nickname: editForm.nickname,
        position: editForm.position,
        company: editForm.company,
        bio: editForm.bio,
      }, authHeader);
      toast.show('บันทึกโปรไฟล์แล้ว');
      setEditMode(false);
      loadProfile();
    } catch {
      toast.show('บันทึกไม่สำเร็จ');
    }
  };

  if (!user) return null;

  if (notRegistered) {
    return (
      <AlumniLayout>
        <div className="al-page al-fade-in" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
          <h2 className="al-h-section" style={{ marginBottom: 8 }}>ยังไม่มีโปรไฟล์ในระบบสายตระกูล</h2>
          <p className="al-muted" style={{ marginBottom: 24 }}>ลงทะเบียนเพื่อสร้างโปรไฟล์และดูสายตระกูลของคุณ</p>
          <button className="al-btn al-btn-red al-btn-lg" onClick={() => navigate('/alumni/onboarding')}
            data-testid="profile-goto-onboarding-btn">
            ลงทะเบียนเลย <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </AlumniLayout>
    );
  }

  if (loading || !profile) {
    return (
      <AlumniLayout>
        <div className="al-page" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="al-muted">กำลังโหลดโปรไฟล์...</div>
        </div>
      </AlumniLayout>
    );
  }

  const u = profile;
  const earnedBadges = new Set(u.badges || []);
  const ancestorsRev = [...(tree?.ancestors || [])].reverse();

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" style={{ maxWidth: 1080 }} data-testid="alumni-profile-page">
        {/* Header */}
        <div className="al-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: 120, background: 'linear-gradient(135deg, var(--al-red) 0%, var(--al-blue) 100%)', position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.2,
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }} />
          </div>
          <div style={{ padding: '0 28px 24px', marginTop: -48, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <Avatar name={u.name} hue={u.avatar_hue || 210} size="xl" ring="var(--al-paper)" verified={u.verified} src={u.avatar_url} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ fontSize: 26, margin: 0, letterSpacing: '-0.02em' }} data-testid="profile-name">{u.name}</h1>
                <span className="al-mono" style={{ padding: '3px 10px', background: 'var(--al-ink)', color: 'white', borderRadius: 999, fontSize: 12 }}>
                  {u.student_id}
                </span>
              </div>
              <div style={{ color: 'var(--al-ink-2)', marginBottom: 4 }}>{u.position || 'ยังไม่ระบุตำแหน่ง'}</div>
              <div className="al-small al-muted">
                {u.major || 'การตลาด'} · รุ่น {u.gen} · {u.role === 'current_student' ? 'นิสิตปัจจุบัน' : u.role === 'alumni' ? 'ศิษย์เก่า' : 'บุคลากร'}
              </div>
              {u.bio && <p style={{ margin: '10px 0 0', fontSize: 14, maxWidth: 500 }}>{u.bio}</p>}
            </div>
            {isOwn && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="al-btn al-btn-outline al-btn-sm" onClick={() => setEditMode(!editMode)}
                  data-testid="profile-edit-btn">
                  <Icon name="sliders" size={13} /> {editMode ? 'ยกเลิก' : 'แก้โปรไฟล์'}
                </button>
                <button className="al-btn al-btn-outline al-btn-sm" data-testid="profile-share-btn">
                  <Icon name="share" size={13} /> แชร์
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editMode && isOwn && (
          <div className="al-card al-card-pad" style={{ marginBottom: 20 }} data-testid="profile-edit-form">
            <div className="al-eyebrow" style={{ marginBottom: 12 }}>แก้ไขข้อมูล</div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="al-small" style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>ชื่อเล่น</label>
                <input value={editForm.nickname || ''} onChange={e => setEditForm({ ...editForm, nickname: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
                  data-testid="edit-nickname-input"
                />
              </div>
              <div>
                <label className="al-small" style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>ตำแหน่ง</label>
                <input value={editForm.position || ''} onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
                  data-testid="edit-position-input"
                />
              </div>
              <div>
                <label className="al-small" style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>บริษัท</label>
                <input value={editForm.company || ''} onChange={e => setEditForm({ ...editForm, company: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)' }}
                  data-testid="edit-company-input"
                />
              </div>
              <div>
                <label className="al-small" style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Bio</label>
                <textarea value={editForm.bio || ''} onChange={e => setEditForm({ ...editForm, bio: e.target.value })} rows={3}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--al-line-2)', background: 'var(--al-paper)', resize: 'vertical' }}
                  data-testid="edit-bio-input"
                />
              </div>
              <button className="al-btn al-btn-red" onClick={handleSaveEdit} data-testid="edit-save-btn">
                บันทึก
              </button>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          <StatPill testId="profile-stat-tree" label="สายตระกูล" value={tree?.total || 1} sub={tree?.max_ancestor_gen ? `ยาวถึงรุ่น ${tree.max_ancestor_gen}` : 'เริ่มสาย'} />
          <StatPill testId="profile-stat-invites" label="คนที่ชวน" value={u.invite_count || 0} sub="จำนวนการเชิญ" tone="var(--al-red)" />
          <StatPill testId="profile-stat-xp" label="XP สะสม" value={(u.xp || 0).toLocaleString()} sub="คะแนนทั้งหมด" tone="var(--al-blue)" />
          <StatPill testId="profile-stat-streak" label="Streak" value={`${u.streak_days || 0} วัน`} sub="Active ต่อเนื่อง" />
        </div>

        <div className="al-profile-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Badges */}
            <div className="al-card al-card-pad" data-testid="profile-badges-section">
              <div className="al-eyebrow" style={{ marginBottom: 12 }}>ของสะสม · BADGES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                {BADGES_CATALOG.map(b => {
                  const earned = earnedBadges.has(b.key);
                  return (
                    <div key={b.key} data-testid={`badge-${b.key}`}
                      style={{
                        padding: 14, borderRadius: 14, textAlign: 'center',
                        background: earned ? 'var(--al-paper-2)' : 'transparent',
                        border: '1px solid', borderColor: earned ? 'var(--al-line)' : 'var(--al-line-2)',
                        borderStyle: earned ? 'solid' : 'dashed',
                        opacity: earned ? 1 : 0.5,
                      }}>
                      <div style={{ fontSize: 32, marginBottom: 6, filter: earned ? 'none' : 'grayscale(1)' }}>{b.emoji}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{b.name}</div>
                      <div className="al-tiny al-muted">{b.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tree path */}
            {ancestorsRev.length > 0 && (
              <div className="al-card al-card-pad" data-testid="profile-chain-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 className="al-h-section" style={{ fontSize: 20 }}>สายของฉัน</h2>
                  <button className="al-btn al-btn-ghost al-btn-sm" onClick={() => navigate('/alumni/tree')}
                    data-testid="profile-view-tree-btn">
                    เปิดต้นไม้เต็ม <Icon name="arrow-right" size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {ancestorsRev.map((a, i) => (
                    <React.Fragment key={a.user_id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', background: 'var(--al-paper-2)', borderRadius: 999 }}>
                        <Avatar name={a.name} hue={a.avatar_hue || 200} size="xs" src={a.avatar_url} />
                        <span className="al-small" style={{ fontWeight: 600 }}>{a.nickname || a.name}</span>
                        <span className="al-mono al-tiny al-muted">{a.gen}</span>
                      </div>
                      <Icon name="chevron-right" size={12} style={{ color: 'var(--al-mute)' }} />
                    </React.Fragment>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', background: 'var(--al-ink)', color: 'white', borderRadius: 999 }}>
                    <Avatar name={u.name} hue={u.avatar_hue || 210} size="xs" src={u.avatar_url} />
                    <span className="al-small" style={{ fontWeight: 600 }}>คุณ</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Streak card */}
            <div className="al-card al-card-pad" style={{ background: 'var(--al-red-soft)', borderColor: 'rgba(200,16,46,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 28 }}>🔥</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }} data-testid="profile-streak-days">{u.streak_days || 0} วัน streak</div>
                  <div className="al-tiny al-muted">Active ทุกวัน</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: 14 }).map((_, i) => {
                  const filled = i < Math.min(u.streak_days || 0, 14);
                  return (
                    <div key={i} style={{
                      flex: 1, height: 20, borderRadius: 3,
                      background: filled ? 'var(--al-red)' : 'var(--al-line-2)',
                      opacity: filled ? (0.4 + (i / 14) * 0.6) : 1,
                    }} />
                  );
                })}
              </div>
            </div>

            {/* Next goals */}
            <div className="al-card al-card-pad">
              <div className="al-eyebrow" style={{ marginBottom: 12 }}>ภารกิจต่อไป</div>
              {[
                { name: 'Refer งานให้ 1 คน', reward: '+200 XP · Badge', pct: 0 },
                { name: `ชวนน้องอีก ${Math.max(0, 10 - (u.invite_count || 0))} คน`, reward: '+Badge นายก๊ก', pct: Math.min(100, ((u.invite_count || 0) / 10) * 100) },
                { name: 'รีวิวพี่ในสาย อีก 2 คน', reward: '+150 XP', pct: 33 },
              ].map((q, i) => (
                <div key={i} style={{ paddingBottom: 12, borderBottom: i < 2 ? '1px solid var(--al-line)' : 'none', marginBottom: i < 2 ? 12 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{q.name}</span>
                    <span className="al-tiny al-muted al-tabular">{Math.round(q.pct)}%</span>
                  </div>
                  <div className="al-progress" style={{ marginBottom: 4 }}><div style={{ width: `${q.pct}%` }} /></div>
                  <div className="al-tiny" style={{ color: 'var(--al-red)' }}>{q.reward}</div>
                </div>
              ))}
            </div>

            {/* Privacy */}
            {isOwn && (
              <div className="al-card al-card-pad" data-testid="profile-privacy-section">
                <div className="al-eyebrow" style={{ marginBottom: 10 }}>ความเป็นส่วนตัว</div>
                {Object.entries(u.privacy_settings || {}).map(([key, on]) => {
                  const labels = {
                    show_in_feed: 'แสดงในฟีดเครือข่าย',
                    show_company_to_juniors: 'ให้รุ่นน้องเห็นบริษัท',
                    allow_mystery_match: 'รับ mystery match',
                    allow_message_requests: 'รับคำขอทักทาย',
                    mask_student_id: 'ซ่อนรหัสนิสิต',
                  };
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                      <span className="al-small">{labels[key] || key}</span>
                      <div style={{
                        width: 34, height: 20, borderRadius: 999,
                        background: on ? 'var(--al-red)' : 'var(--al-line-2)',
                        padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
                      }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniProfilePage;

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, StatPill } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const HOW_STEPS = [
  { n: '01', title: 'ลงทะเบียน', desc: 'ยืนยันตัวตนด้วยรหัสนิสิต + อีเมล @g.swu', icon: 'user' },
  { n: '02', title: 'ระบุพี่ take', desc: 'ของคุณเป็นใคร? ระบบจะเชื่อมต่อขึ้นไปอีก 5 ชั้น', icon: 'link' },
  { n: '03', title: 'ชวนรุ่นที่ยังไม่เข้ามา', desc: 'ส่งคำเชิญไปหาพี่-น้อง เกิดสายทอดๆ', icon: 'share' },
  { n: '04', title: 'ค้นพบเครือข่าย', desc: 'ทวดของทวดที่ทำงานที่คุณฝัน อาจอยู่ห่างแค่ 4 ทอด', icon: 'compass' },
];

const TESTIMONIALS = [
  { q: '"น้อง take ผมหางานอยู่ — refer เข้า LINE MAN ได้ใน 2 วัน"', by: 'พี่ดิน · รุ่น 58', role: 'Head of Growth' },
  { q: '"เจอทวดของทวดที่เป็น Creative Director — ขอรีวิว portfolio ได้เลย"', by: 'มีน · รุ่น 63', role: 'นิสิตปี 4' },
  { q: '"ได้กลับมาเจอพี่ take ที่ไม่เจอกัน 8 ปี ผ่านระบบ"', by: 'พี่ลี · รุ่น 54', role: 'VP Marketing' },
];

const FamilyCard = ({ chain }) => {
  return (
    <div style={{ position: 'relative', padding: 20 }}>
      <div className="al-card" style={{ padding: 22, borderRadius: 24, boxShadow: 'var(--al-shadow-lg)', maxWidth: 440, marginLeft: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="al-eyebrow">ตัวอย่างสายตระกูล</div>
          <Chip tone="red" icon="flame">5 ทอดขึ้นไป</Chip>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {chain.map((p, i) => (
            <div key={p.name} style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 10px', borderRadius: 10,
                background: i === 0 ? 'var(--al-red-soft)' : 'transparent'
              }}>
                <Avatar name={p.name} hue={p.hue} size="md" verified={p.verified} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    {p.relation && <span className="al-tiny al-muted">· {p.relation}</span>}
                  </div>
                  <div className="al-tiny al-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.position}
                  </div>
                </div>
                <div className="al-mono al-tiny" style={{ background: 'var(--al-paper-2)', padding: '2px 8px', borderRadius: 999 }}>
                  {p.gen}
                </div>
              </div>
              {i < chain.length - 1 && (
                <div style={{ marginLeft: 27, width: 1, height: 10, background: 'var(--al-line-2)' }} />
              )}
            </div>
          ))}
        </div>
        <div className="al-sep" />
        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--al-mute)', alignItems: 'center' }}>
          <Icon name="bolt" size={14} />
          <span>ผ่านสายนี้คุณอยู่ห่าง <b style={{ color: 'var(--al-ink)' }}>Sea (Shopee) · VP</b> แค่ 4 ทอด</span>
        </div>
      </div>
    </div>
  );
};

const AlumniLandingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({ alumni: 0, current: 0, companies: 0, connections: 0, jobs_referred: 0, new_today: 0 });
  const [heroGen, setHeroGen] = useState(64);
  const [sampleChain, setSampleChain] = useState([
    { name: 'ภูมิ', gen: 64, hue: 210, relation: 'คุณ', position: 'นิสิตปี 4 · ฝึกงาน Agoda' },
    { name: 'ฟ้า', gen: 61, hue: 340, relation: 'พี่ take', position: 'Brand Manager · Unilever', verified: true },
    { name: 'ดิน', gen: 58, hue: 190, relation: 'ปู่', position: 'Head of Growth · LINE MAN', verified: true },
    { name: 'แพร', gen: 55, hue: 20, relation: 'ทวด', position: 'Group Creative Director · Ogilvy', verified: true },
    { name: 'กันต์', gen: 51, hue: 280, relation: 'เทียด', position: 'VP · Sea (Shopee)', verified: true },
    { name: 'พี่อิ๊ก', gen: 47, hue: 130, relation: 'เทียดทวด', position: 'Co-founder · Studio Soi', verified: true },
  ]);

  useEffect(() => {
    axios.get(`${API}/alumni/stats`).then(r => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroGen(g => (g >= 68 ? 45 : g + 1)), 120);
    return () => clearInterval(t);
  }, []);

  const handleStart = () => {
    if (user) navigate('/alumni/onboarding');
    else navigate('/register?redirect=/alumni/onboarding');
  };
  const handleViewTree = () => {
    if (user) navigate('/alumni/tree');
    else navigate('/login?redirect=/alumni/tree');
  };

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" data-testid="alumni-landing-page">
        {/* Hero */}
        <div className="al-hero-grid" style={{
          display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)',
          gap: 40, alignItems: 'center', marginBottom: 48,
        }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 18 }}>· เครือข่ายนิสิต &amp; ศิษย์เก่า การตลาด มศว ·</div>
            <h1 className="al-h-display" style={{ marginBottom: 20 }} data-testid="alumni-hero-heading">
              สาย<span style={{ color: 'var(--al-red)' }}>ตระกูล</span>ของเรา<br/>
              ยาวกว่า<span style={{ color: 'var(--al-blue)', fontStyle: 'italic', fontWeight: 500 }}>ที่คุณคิด</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--al-ink-2)', maxWidth: 520, margin: '0 0 28px' }}>
              ระบบศิษย์เก่า ที่ให้คุณค้นหา พี่ take · ปู่ · ทวด · เทียด ของคุณ ได้เป็นทอด ๆ
              จากรุ่น <span className="al-mono al-tabular" style={{ background: 'var(--al-ink)', color: 'white', padding: '2px 8px', borderRadius: 6 }}>{String(heroGen).padStart(2, '0')}</span> ถึงรุ่นแรกของคณะ
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
              <button className="al-btn al-btn-red al-btn-lg" onClick={handleStart} data-testid="alumni-hero-start-btn">
                <Icon name="sparkles" size={16} /> ลงทะเบียนด้วยรหัสนิสิต
              </button>
              <button className="al-btn al-btn-outline al-btn-lg" onClick={handleViewTree} data-testid="alumni-hero-tree-btn">
                ดูสายตระกูลของฉัน <Icon name="arrow-right" size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ display: 'flex' }}>
                {[340, 190, 20, 280, 130].map((h, i) => (
                  <div key={i} style={{ marginLeft: i ? -10 : 0 }}>
                    <Avatar name={String.fromCharCode(65 + i)} hue={h} size="sm" />
                  </div>
                ))}
              </div>
              <div className="al-small">
                <span style={{ fontWeight: 600 }} data-testid="alumni-hero-count">{(stats.alumni || 0).toLocaleString()}</span> คน ลงทะเบียนแล้ว
                {stats.new_today > 0 && <> · ใหม่วันนี้ <span style={{ color: 'var(--al-red)', fontWeight: 600 }}>+{stats.new_today}</span></>}
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', minHeight: 440 }}>
            <FamilyCard chain={sampleChain} />
          </div>
        </div>

        {/* Stats strip */}
        <div data-testid="alumni-stats-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 48 }}>
          <StatPill testId="stat-alumni" label="ศิษย์เก่าที่ลงทะเบียน" value={(stats.alumni || 0).toLocaleString()} sub="จากทั้งคณะ ~4,200 คน" />
          <StatPill testId="stat-current" label="นิสิตปัจจุบัน" value={stats.current || 0} sub="รุ่น 64-67" />
          <StatPill testId="stat-companies" label="บริษัทในเครือข่าย" value={stats.companies || 0} sub="ในไทย + 12 ประเทศ" />
          <StatPill testId="stat-connections" label="การเชื่อมโยงกัน" value={(stats.connections || 0).toLocaleString()} sub="สายตระกูล + mutual" tone="var(--al-red)" />
          <StatPill testId="stat-jobs" label="งานที่ refer" value={stats.jobs_referred || 0} sub="ในปี 2026" tone="var(--al-blue)" />
        </div>

        {/* How it works */}
        <div style={{ marginBottom: 18 }}>
          <div className="al-eyebrow" style={{ marginBottom: 6 }}>วิธีการทำงาน</div>
          <h2 className="al-h-section">จากรหัสของคุณ · สู่เครือข่ายที่ยาวไปถึงรุ่น 45</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 48 }}>
          {HOW_STEPS.map(s => (
            <div key={s.n} className="al-card al-card-pad" data-testid={`how-step-${s.n}`}>
              <div className="al-mono" style={{ color: 'var(--al-mute)', fontSize: 12, letterSpacing: '0.08em', marginBottom: 16 }}>{s.n}</div>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: 'var(--al-paper-2)',
                display: 'grid', placeItems: 'center', marginBottom: 14,
              }}>
                <Icon name={s.icon} size={20} />
              </div>
              <h3 className="al-h-card" style={{ marginBottom: 6 }}>{s.title}</h3>
              <p className="al-small al-muted" style={{ margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div style={{
          background: 'var(--al-ink)', color: 'white', borderRadius: 32, padding: '48px 40px',
          marginBottom: 48, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.08,
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '20px 20px',
          }} />
          <div className="al-cta-grid" style={{
            position: 'relative', display: 'grid', gridTemplateColumns: '1fr 2fr',
            gap: 48, alignItems: 'center',
          }}>
            <div>
              <div className="al-eyebrow" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>ทำไมต้องลงทะเบียน?</div>
              <h2 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, fontWeight: 700 }}>
                เพราะ <span style={{ color: '#FFD976', fontStyle: 'italic', fontWeight: 500 }}>น้องคุณ</span> อาจต้องการคุณอยู่
              </h2>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{
                  padding: '18px 22px', background: 'rgba(255,255,255,0.06)',
                  borderRadius: 14, borderLeft: '3px solid #FFD976',
                }} data-testid={`testimonial-${i}`}>
                  <div style={{ fontSize: 16, marginBottom: 6 }}>{t.q}</div>
                  <div className="al-small" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {t.by} · <em>{t.role}</em>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="al-card al-card-pad" style={{
          padding: 36, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="al-eyebrow" style={{ marginBottom: 8, color: 'var(--al-red)' }}>· ศิษย์เก่าที่ยังไม่เข้าระบบ ·</div>
            <h3 style={{ fontSize: 24, margin: '0 0 8px', letterSpacing: '-0.01em' }}>พี่ทวดของพี่ทวดคุณ กำลังรอคุณอยู่</h3>
            <p className="al-muted al-small" style={{ margin: 0, maxWidth: 520 }}>
              เข้าด้วยรหัสนิสิตของคุณ ระบบจะค้นหาว่าคุณเชื่อมกับใครในคณะบ้าง — ไม่ต้องตั้งค่าอะไรเพิ่ม
            </p>
          </div>
          <button className="al-btn al-btn-red al-btn-lg" onClick={handleStart} data-testid="alumni-final-cta-btn">
            เริ่มใน 60 วินาที <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </div>
    </AlumniLayout>
  );
};

export default AlumniLandingPage;

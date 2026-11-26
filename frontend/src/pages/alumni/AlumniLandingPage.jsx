import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Icon, StatPill } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const HOW_STEPS = [
  { n: '01', title: 'ลงทะเบียน', desc: 'บอกรหัสนิสิต รุ่น และชื่อเล่น ใช้เวลาไม่ถึงนาที', icon: 'user' },
  { n: '02', title: 'บอกว่าใครคือพี่เทค', desc: 'ค้นหาจากคนที่ลงทะเบียนแล้ว หรือเพิ่มชื่อเล่นกับรุ่นไว้ก่อน ถ้าเขายังไม่เข้ามา', icon: 'link' },
  { n: '03', title: 'ชวนคนที่ขาดอยู่', desc: 'ระบบชี้ให้ว่าสายขาดใคร กดส่งลิงก์ทาง LINE ปลายทางจะได้เล่นเกม "เฉลยสาย" ทายว่าใครชวน', icon: 'share' },
  { n: '04', title: 'ช่วยกันยืนยัน', desc: 'ไม่มีรายชื่อทางการ สายนี้สร้างจากพวกเรา เจ้าตัวยืนยันเอง หรือเพื่อนในสายช่วยกันรับรอง', icon: 'check' },
];

const GAINS = [
  { icon: 'flame', title: 'แข่งกันต่อสาย', desc: 'อันดับสายที่ยาวที่สุด ครบที่สุด และความคืบหน้าของแต่ละรุ่น' },
  { icon: 'users', title: 'เลี้ยงสาย', desc: 'นัดกินข้าวกับคนในสาย ทุกคนในสายได้รับแจ้งและกดตอบรับได้' },
  { icon: 'sparkles', title: 'สิทธิประโยชน์ศิษย์เก่า', desc: 'เครื่องมือวิจัยการตลาด บทความอาจารย์ งาน และช่องทางกลับมาเป็น Mentor วิทยากร หรือกรรมการ' },
];

// Illustration only: default terms, no people, no numbers
const LADDER = [
  { term: 'ทวดเทค', hint: 'อีกสามขั้นขึ้นไป', empty: true },
  { term: 'ปู่/ย่าเทค', hint: 'ยังไม่มา · ชวนเลย', empty: true },
  { term: 'ลุง/ป้าเทค', hint: 'รุ่นก่อนพี่เทค', done: true },
  { term: 'พี่เทค', hint: 'รุ่นพี่ที่ดูแลคุณ', done: true },
  { term: 'คุณ', hint: 'เริ่มจากตรงนี้', me: true },
];

const SampleLine = () => (
  <div style={{ position: 'relative', padding: '8px 0' }}>
    <div className="al-card" style={{ padding: 22, borderRadius: 24, boxShadow: 'var(--al-shadow-lg)', maxWidth: 440, marginLeft: 'auto' }} data-testid="landing-sample-line">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <div className="al-eyebrow">ภาพตัวอย่างสายเทค</div>
        <span className="al-tag outline">ไม่ใช่ข้อมูลจริง</span>
      </div>
      <div style={{ display: 'grid', gap: 0 }}>
        {LADDER.map((r, i) => (
          <div key={r.term}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
              border: r.empty ? '2px dashed var(--al-red)' : '1px solid var(--al-line)',
              background: r.me ? 'var(--al-ink)' : r.empty ? 'var(--al-red-soft)' : 'var(--al-card)',
              color: r.me ? 'white' : 'var(--al-ink)',
            }}>
              <div style={{ fontWeight: 700, flex: 1 }}>{r.term}</div>
              <div className="al-small" style={{ color: r.me ? 'rgba(255,255,255,.8)' : 'var(--al-ink-2)' }}>{r.hint}</div>
            </div>
            {i < LADDER.length - 1 && <div style={{ marginLeft: 26, height: 12, borderLeft: `3px ${LADDER[i].empty || LADDER[i + 1].empty ? 'dashed' : 'solid'} var(--al-line-2)` }} />}
          </div>
        ))}
      </div>
      <div className="al-sep" />
      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--al-mute)', alignItems: 'flex-start' }}>
        <Icon name="bolt" size={14} />
        <span>ช่องที่ยังว่าง = ชื่อที่ยังไม่มีใครรู้ ใครรู้จักช่วยเพิ่ม แล้วชวนเขามาเฉลยตัวเอง</span>
      </div>
    </div>
  </div>
);

const AlumniLandingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    axios.get(`${API}/alumni/stats`).then(r => setStats(r.data)).catch(() => setStatsError(true));
  }, []);

  const handleStart = () => {
    if (user) navigate('/alumni/onboarding');
    else navigate('/register?redirect=/alumni/onboarding');
  };
  const handleViewTree = () => {
    if (user) navigate('/alumni/tree');
    else navigate('/login?redirect=/alumni/tree');
  };
  const n = (v) => (stats ? (v || 0).toLocaleString() : '–');

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" data-testid="alumni-landing-page">
        <div className="al-hero-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 40, alignItems: 'center', marginBottom: 48 }}>
          <div>
            <div className="al-eyebrow" style={{ marginBottom: 18 }}>· นิสิต &amp; ศิษย์เก่า การตลาด มศว ·</div>
            <h1 className="al-h-display" style={{ marginBottom: 20 }} data-testid="alumni-hero-heading">
              สาย<span style={{ color: 'var(--al-red)' }}>เทค</span>ของเรา<br />
              ยาวกว่า<span style={{ color: 'var(--al-blue)', fontStyle: 'italic', fontWeight: 500 }}>ที่คุณคิด</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--al-ink-2)', maxWidth: 540, margin: '0 0 12px' }}>
              พี่เทค → ลุง/ป้าเทค → ปู่/ย่าเทค → ทวดเทค … ใครคือคนที่อยู่เหนือพี่เทคของคุณขึ้นไป?
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--al-mute)', maxWidth: 540, margin: '0 0 28px' }}>
              ไม่มีใครมีรายชื่อสายเทคอย่างเป็นทางการ เราเลยให้ทุกคนช่วยกันต่อสายขึ้นไปทีละขั้น ช่วยกันยืนยัน และชวนคนที่หายไปกลับมา
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
              <button className="al-btn al-btn-red al-btn-lg" onClick={handleStart} data-testid="alumni-hero-start-btn">
                <Icon name="sparkles" size={16} /> {user ? 'ต่อสายของฉัน' : 'ลงทะเบียนด้วยรหัสนิสิต'}
              </button>
              <button className="al-btn al-btn-outline al-btn-lg" onClick={handleViewTree} data-testid="alumni-hero-tree-btn">
                ดูสายเทคของฉัน <Icon name="arrow-right" size={16} />
              </button>
            </div>
            <div className="al-small" data-testid="alumni-hero-live">
              {stats ? (
                <><span style={{ fontWeight: 700 }} data-testid="alumni-hero-count">{n(stats.alumni)}</span> คน ลงทะเบียนแล้ว
                  {stats.new_today > 0 && <> · ใน 24 ชั่วโมงที่ผ่านมา <span style={{ color: 'var(--al-red-ink)', fontWeight: 700 }}>+{stats.new_today}</span></>}</>
              ) : statsError ? <span className="al-muted">โหลดตัวเลขไม่สำเร็จ</span> : <span className="al-muted">กำลังนับสมาชิก...</span>}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <SampleLine />
          </div>
        </div>

        <div data-testid="alumni-stats-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 48 }}>
          <StatPill testId="stat-alumni" label="สมาชิกทั้งหมด" value={n(stats?.alumni)} sub="ลงทะเบียนแล้ว" />
          <StatPill testId="stat-alumni-only" label="ศิษย์เก่า" value={n(stats?.alumni_only)} sub="ในระบบ" />
          <StatPill testId="stat-current" label="นิสิตปัจจุบัน" value={n(stats?.current)} sub="ในระบบ" />
          <StatPill testId="stat-connections" label="เส้นสายที่ยืนยันแล้ว" value={n(stats?.connections)} sub="ยืนยันเองหรือเพื่อนรับรอง" tone="var(--al-red)" />
          <StatPill testId="stat-companies" label="บริษัทที่สมาชิกทำงาน" value={n(stats?.companies)} sub="ตามที่สมาชิกกรอก" tone="var(--al-blue)" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div className="al-eyebrow" style={{ marginBottom: 6 }}>วิธีการทำงาน</div>
          <h2 className="al-h-section">จากพี่เทคของคุณ · ต่อขึ้นไปทีละขั้น</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 48 }}>
          {HOW_STEPS.map(s => (
            <div key={s.n} className="al-card al-card-pad" data-testid={`how-step-${s.n}`}>
              <div className="al-mono" style={{ color: 'var(--al-mute)', fontSize: 12, letterSpacing: '0.08em', marginBottom: 14 }}>{s.n}</div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--al-paper-2)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                <Icon name={s.icon} size={20} />
              </div>
              <h3 className="al-h-card" style={{ marginBottom: 6 }}>{s.title}</h3>
              <p className="al-small al-muted" style={{ margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div className="al-eyebrow" style={{ marginBottom: 6 }}>ต่อสายแล้วได้อะไร</div>
          <h2 className="al-h-section">สนุก มีเพื่อน และมีประโยชน์</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 48 }}>
          {GAINS.map(g => (
            <div key={g.title} className="al-card al-card-pad" data-testid={`gain-${g.icon}`}>
              <Icon name={g.icon} size={22} style={{ marginBottom: 10, color: 'var(--al-red)' }} />
              <h3 className="al-h-card" style={{ marginBottom: 6 }}>{g.title}</h3>
              <p className="al-small al-muted" style={{ margin: 0 }}>{g.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--al-ink)', color: 'white', borderRadius: 28, padding: 'clamp(24px, 5vw, 44px)', marginBottom: 48 }} data-testid="landing-privacy">
          <div className="al-eyebrow" style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 10 }}>เรื่องข้อมูลส่วนตัว</div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 30px)', lineHeight: 1.2, margin: '0 0 12px', fontWeight: 700, color: 'white' }}>
            คนที่ยังไม่ลงทะเบียน เราเก็บแค่ชื่อเล่นกับรุ่น
          </h2>
          <p style={{ margin: 0, maxWidth: 640, lineHeight: 1.7, color: 'rgba(255,255,255,.85)' }}>
            เห็นเฉพาะสมาชิกที่ลงทะเบียนแล้ว ไม่เก็บอีเมลหรือเบอร์โทรของคนที่ถูกเพิ่มชื่อ และเจ้าตัวลบชื่อตัวเองออกได้ทุกเมื่อ (จะขอไม่ให้ใครเพิ่มซ้ำอีกก็ได้)
            {' '}<a href="/privacy" style={{ color: 'white', textDecoration: 'underline' }} data-testid="landing-privacy-link">อ่านรายละเอียด</a>
          </p>
        </div>

        <div className="al-card al-card-pad" style={{ padding: 'clamp(22px, 5vw, 36px)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="al-eyebrow" style={{ marginBottom: 8, color: 'var(--al-red-ink)' }}>· ศิษย์เก่าที่ยังไม่เข้าระบบ ·</div>
            <h3 style={{ fontSize: 24, margin: '0 0 8px', letterSpacing: '-0.01em' }}>สายของคุณอาจกำลังขาดคุณอยู่</h3>
            <p className="al-muted al-small" style={{ margin: 0, maxWidth: 520 }}>
              ถ้ารุ่นน้องเพิ่มชื่อคุณไว้ในสายแล้ว เมื่อลงทะเบียนเราจะถามว่า "นี่คือคุณใช่ไหม" แล้วย้ายสายที่เขาต่อไว้มาให้เลย
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

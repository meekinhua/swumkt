import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import AlumniLayout from './AlumniLayout';
import { Avatar, Chip, Icon, useToast } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AlumniDiscoverPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const toast = useToast();
  const [match, setMatch] = useState(null);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [minHops, setMinHops] = useState(3);
  const [maxHops, setMaxHops] = useState(6);

  const authH = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!user) { navigate('/login?redirect=/alumni/discover'); return; }
    loadMatch();
    // eslint-disable-next-line
  }, [user]);

  const loadMatch = async () => {
    setLoading(true);
    setRevealed(false);
    try {
      const r = await axios.get(`${API}/alumni/discover/mystery-match`, {
        ...authH, params: { min_hops: minHops, max_hops: maxHops },
      });
      setMatch(r.data.match);
      setMeta({ distance: r.data.distance, direction: r.data.direction, reasons: r.data.reasons || [], message: r.data.reason });
      // Auto-reveal after 1.2s for animation effect
      setTimeout(() => setRevealed(true), 1200);
    } catch (e) {
      toast.show('โหลดไม่สำเร็จ');
    } finally { setLoading(false); }
  };

  const handleSkip = async () => {
    if (!match) return;
    try { await axios.post(`${API}/alumni/discover/skip/${match.user_id}`, {}, authH); } catch {}
    loadMatch();
  };

  const handleMark = async () => {
    if (!match) return;
    try {
      await axios.post(`${API}/alumni/relations`, { to_user_id: match.user_id, kind: 'take' }, authH);
      toast.show(`ส่งคำขอ mark ${match.nickname || match.name} แล้ว`);
      setTimeout(loadMatch, 800);
    } catch (e) {
      toast.show(e.response?.data?.detail || 'ไม่สำเร็จ');
    }
  };

  if (!user) return null;

  return (
    <AlumniLayout>
      <div className="al-page al-fade-in" style={{ maxWidth: 720 }} data-testid="alumni-discover-page">
        <div style={{ marginBottom: 28 }}>
          <div className="al-eyebrow" style={{ marginBottom: 6 }}>· Mystery Match · ทุกครั้งคือคนใหม่ ·</div>
          <h1 className="al-h-section" style={{ fontSize: 34 }}>ค้นพบทวดของคุณ 🔮</h1>
          <p className="al-muted" style={{ marginTop: 4 }}>
            ระบบสุ่มศิษย์เก่าในสายของคุณ {minHops}-{maxHops} ทอด · พลิกเปิดเลย
          </p>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <span className="al-eyebrow" style={{ alignSelf: 'center', marginRight: 4 }}>ระยะ:</span>
          {[
            [3, 6, 'ทวด-เทียดทวด (ค่าเริ่มต้น)'],
            [2, 4, 'ใกล้ตัว'],
            [5, 8, 'ห่างไกล'],
            [1, 8, 'ทุกระยะ'],
          ].map(([n, m, label]) => (
            <button key={label}
              onClick={() => { setMinHops(n); setMaxHops(m); setTimeout(loadMatch, 100); }}
              data-testid={`discover-filter-${n}-${m}`}
              className={`al-btn al-btn-sm ${minHops === n && maxHops === m ? 'al-btn-primary' : 'al-btn-outline'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Card */}
        {loading && <div className="al-muted" style={{ textAlign: 'center', padding: 80 }}>กำลังสุ่ม...</div>}

        {!loading && !match && (
          <div className="al-card al-card-pad" style={{ textAlign: 'center', padding: 60 }} data-testid="discover-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h2 className="al-h-card" style={{ marginBottom: 8 }}>{meta.message || 'หมดคนแล้ว'}</h2>
            <button className="al-btn al-btn-red" onClick={loadMatch} data-testid="discover-retry-btn">ลองอีกครั้ง</button>
          </div>
        )}

        {!loading && match && (
          <div className="al-card al-fade-in" style={{ overflow: 'hidden', position: 'relative' }} data-testid="discover-match-card">
            <div style={{
              padding: 40, textAlign: 'center',
              background: 'linear-gradient(135deg, var(--al-red) 0%, var(--al-blue) 100%)',
              color: 'white', position: 'relative',
              filter: revealed ? 'none' : 'blur(20px)',
              transition: 'filter 1s ease-out',
            }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.15,
                backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                backgroundSize: '20px 20px',
              }} />
              <div style={{ position: 'relative' }}>
                <Avatar name={match.name} hue={match.avatar_hue || 210} size="xl" src={match.avatar_url} verified={match.verified} />
                <h2 style={{ fontSize: 30, marginTop: 14, marginBottom: 4, letterSpacing: '-0.02em' }} data-testid="discover-match-name">
                  {match.name}
                </h2>
                <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 12 }}>
                  รุ่น {match.gen} · {match.position || 'ศิษย์เก่า'}
                </div>
                {match.company && (
                  <div style={{
                    display: 'inline-block', padding: '4px 12px',
                    background: 'rgba(255,255,255,0.2)', borderRadius: 999,
                    fontSize: 13,
                  }}>{match.company}</div>
                )}
              </div>
            </div>

            {!revealed && (
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                background: 'rgba(20,22,26,0.4)', color: 'white',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🔮</div>
                  <div className="al-mono al-eyebrow" style={{ color: 'rgba(255,255,255,0.85)' }}>กำลังเปิดการ์ด...</div>
                </div>
              </div>
            )}

            {/* Reasons */}
            {revealed && (
              <div style={{ padding: 24 }}>
                <div className="al-eyebrow" style={{ marginBottom: 10 }}>· ทำไมน่าสนใจ ·</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                  {(meta.reasons || []).map((r, i) => (
                    <Chip key={i} tone={i === 0 ? 'red' : 'default'} icon={i === 0 ? 'sparkles' : 'flame'}>
                      {r}
                    </Chip>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="al-btn al-btn-red al-btn-block" onClick={handleMark} data-testid="discover-mark-btn">
                    <Icon name="link" size={14} /> Mark เป็นพี่ในสาย
                  </button>
                  <button className="al-btn al-btn-outline" onClick={() => navigate(`/alumni/profile/${match.user_id}`)}
                    data-testid="discover-view-profile-btn">
                    ดูโปรไฟล์
                  </button>
                  <button className="al-btn al-btn-outline" onClick={handleSkip} data-testid="discover-skip-btn">
                    <Icon name="x" size={14} /> ข้าม
                  </button>
                  <button className="al-btn al-btn-ghost" onClick={loadMatch} data-testid="discover-shuffle-btn">
                    <Icon name="sparkles" size={14} /> สุ่มใหม่
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {toast.node}
      </div>
    </AlumniLayout>
  );
};

export default AlumniDiscoverPage;

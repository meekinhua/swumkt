import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Chip, Icon } from './AlumniUI';
import './alumni-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Public landing that shows who's inviting. After "Accept", user is redirected to register/login.
const AlumniInviteAcceptPage = () => {
  const navigate = useNavigate();
  const { code } = useParams();
  const { user, token } = useAuth();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    axios.get(`${API}/alumni/invites/preview/${code}`)
      .then(r => setPreview(r.data))
      .catch(e => setError(e.response?.data?.detail || 'ลิงก์ใช้ไม่ได้'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleAccept = async () => {
    if (!user) {
      // Redirect to register with invite code in URL
      navigate(`/register?redirect=/alumni/invite/${code}`);
      return;
    }
    // Check if user has alumni profile
    try {
      const me = await axios.get(`${API}/alumni/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!me.data.registered) {
        // Store code in localStorage for after-onboarding acceptance
        localStorage.setItem('pending_invite_code', code);
        navigate('/alumni/onboarding');
        return;
      }
      // Accept invite
      setAccepting(true);
      await axios.post(`${API}/alumni/invites/accept/${code}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate('/alumni/tree');
    } catch (e) {
      setError(e.response?.data?.detail || 'ยอมรับ invite ไม่สำเร็จ');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="alumni-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="al-card al-card-pad al-fade-in" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: 40 }}
        data-testid="invite-accept-page">
        <div className="al-brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <div className="al-brand-mark">กต</div>
          <div className="al-brand-name">สายตระกูล <em>MKT SWU</em></div>
        </div>

        {loading && <div className="al-muted">กำลังตรวจสอบลิงก์...</div>}

        {error && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😢</div>
            <h2 className="al-h-section" style={{ marginBottom: 8 }}>ลิงก์ใช้ไม่ได้</h2>
            <p className="al-muted" style={{ marginBottom: 24 }}>{error}</p>
            <button className="al-btn al-btn-red" onClick={() => navigate('/alumni')} data-testid="invite-back-btn">
              กลับหน้าแรก
            </button>
          </>
        )}

        {preview && preview.inviter && (
          <>
            <div style={{ marginBottom: 20 }}>
              <Avatar name={preview.inviter.name} hue={preview.inviter.avatar_hue || 210} size="xl"
                src={preview.inviter.avatar_url} verified={preview.inviter.verified} />
            </div>
            <div className="al-eyebrow" style={{ marginBottom: 6 }}>คุณได้รับคำเชิญจาก</div>
            <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 4px' }}
              data-testid="invite-inviter-name">
              {preview.inviter.name}
            </h1>
            <div className="al-small al-muted" style={{ marginBottom: 18 }}>
              รุ่น {preview.inviter.gen} · {preview.inviter.position || preview.inviter.role}
            </div>

            <div style={{
              padding: '16px 20px', background: 'var(--al-red-soft)',
              borderRadius: 14, marginBottom: 24, textAlign: 'left',
            }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                <strong>{preview.inviter.nickname || preview.inviter.name}</strong> ชวนคุณเข้าสู่สายตระกูล MKT SWU 🌳
              </div>
              <div className="al-small al-muted">
                ระบบจะ mark คุณเป็น <strong>"{preview.relation_hint || 'น้อง take'}"</strong> ในสายของเขาโดยอัตโนมัติ
              </div>
            </div>

            <button className="al-btn al-btn-red al-btn-lg al-btn-block" onClick={handleAccept}
              disabled={accepting} data-testid="invite-accept-btn">
              {accepting ? 'กำลังดำเนินการ...' : (user ? 'ยืนยันเข้าสาย' : 'เข้าสู่ระบบ / สมัคร')}
              <Icon name="arrow-right" size={16} />
            </button>

            <div className="al-small al-muted" style={{ marginTop: 14 }}>
              โดย {preview.inviter.nickname} จะได้รับ <strong style={{ color: 'var(--al-red)' }}>+100 XP</strong> เมื่อคุณสมัคร
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AlumniInviteAcceptPage;

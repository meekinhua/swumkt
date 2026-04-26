import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, Icon } from './AlumniUI';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from './NotificationBell';
import InviteModal from './InviteModal';

const TABS = [
  { id: 'landing', label: 'หน้าแรก', icon: 'home', path: '/alumni' },
  { id: 'tree', label: 'สายตระกูล', icon: 'tree', path: '/alumni/tree' },
  { id: 'discover', label: 'Discover', icon: 'compass', path: '/alumni/discover' },
  { id: 'feed', label: 'ฟีด', icon: 'feed', path: '/alumni/feed' },
  { id: 'jobs', label: 'งาน', icon: 'briefcase', path: '/alumni/jobs' },
  { id: 'profile', label: 'ฉัน', icon: 'user', path: '/alumni/profile' },
];

const getActiveId = (path) => {
  if (path === '/alumni') return 'landing';
  if (path.startsWith('/alumni/tree')) return 'tree';
  if (path.startsWith('/alumni/discover')) return 'discover';
  if (path.startsWith('/alumni/feed')) return 'feed';
  if (path.startsWith('/alumni/jobs')) return 'jobs';
  if (path.startsWith('/alumni/trivia')) return 'trivia';
  if (path.startsWith('/alumni/profile')) return 'profile';
  if (path.startsWith('/alumni/onboarding')) return 'onboarding';
  if (path.startsWith('/alumni/invites')) return 'invites';
  return '';
};

export const AlumniTopNav = ({ onInviteOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, logout } = useAuth();
  const current = getActiveId(location.pathname);

  return (
    <div className="al-topnav" data-testid="alumni-topnav">
      <button className="al-brand" onClick={() => navigate('/alumni')} data-testid="alumni-brand-btn">
        <div className="al-brand-mark">กต</div>
        <div className="al-brand-name">สายตระกูล <em>MKT SWU</em></div>
      </button>
      <div className="al-nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`al-nav-tab ${current === t.id ? 'active' : ''}`}
            onClick={() => navigate(t.path)} data-testid={`alumni-nav-${t.id}`}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="al-nav-spacer" />
      <div className="al-nav-right">
        {user ? (
          <>
            <button className="al-btn al-btn-red al-btn-sm" onClick={onInviteOpen}
              data-testid="alumni-topnav-invite-btn"
              style={{ fontWeight: 700 }}>
              <Icon name="sparkles" size={14} /> ชวนเพื่อน
            </button>
            <NotificationBell token={token} />
            <button onClick={() => navigate('/alumni/profile')} title="โปรไฟล์" data-testid="alumni-avatar-btn">
              <Avatar name={user.full_name || user.email} hue={210} src={user.avatar_url} />
            </button>
            <button className="al-iconbtn" title="ออก" onClick={logout} data-testid="alumni-logout-btn">
              <Icon name="logout" />
            </button>
          </>
        ) : (
          <>
            <button className="al-btn al-btn-outline al-btn-sm" onClick={() => navigate('/login?redirect=/alumni')} data-testid="alumni-login-btn">
              เข้าสู่ระบบ
            </button>
            <button className="al-btn al-btn-red al-btn-sm" onClick={() => navigate('/register?redirect=/alumni/onboarding')} data-testid="alumni-register-btn">
              ลงทะเบียน
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export const AlumniBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const current = getActiveId(location.pathname);
  return (
    <nav className="al-bottom-nav" data-testid="alumni-bottom-nav">
      {TABS.map(t => (
        <button key={t.id} className={current === t.id ? 'active' : ''} onClick={() => navigate(t.path)}
          data-testid={`alumni-bottom-${t.id}`}>
          <Icon name={t.icon} size={20} stroke={current === t.id ? 2.2 : 1.8} />
          {t.label}
        </button>
      ))}
    </nav>
  );
};

// Floating Action Button — only when user is logged in + registered
export const InviteFAB = ({ onClick }) => (
  <button onClick={onClick} data-testid="alumni-invite-fab"
    title="ชวนเพื่อนเข้าสายตระกูล"
    style={{
      position: 'fixed', bottom: 86, right: 24, zIndex: 35,
      width: 60, height: 60, borderRadius: '50%',
      background: 'var(--al-red)', color: 'white',
      display: 'grid', placeItems: 'center',
      boxShadow: '0 8px 24px rgba(200,16,46,0.4), 0 2px 6px rgba(0,0,0,0.15)',
      border: 'none', cursor: 'pointer',
      animation: 'al-fade .3s ease-out both',
    }}
  >
    <Icon name="sparkles" size={24} stroke={2.2} />
    <span style={{
      position: 'absolute', top: -2, right: -2,
      background: 'var(--al-yellow)', color: 'var(--al-ink)',
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
    }}>+100 XP</span>
  </button>
);

const AlumniLayout = ({ children, showBottomNav = true, showInviteFAB = true }) => {
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="alumni-root">
      <AlumniTopNav onInviteOpen={() => setInviteOpen(true)} />
      {children}
      {showBottomNav && <AlumniBottomNav />}
      {user && showInviteFAB && <InviteFAB onClick={() => setInviteOpen(true)} />}
      {user && <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} token={localStorage.getItem('token')} currentUser={user} />}
    </div>
  );
};

export default AlumniLayout;

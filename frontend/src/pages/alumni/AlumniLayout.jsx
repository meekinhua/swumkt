import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, Icon } from './AlumniUI';
import { useAuth } from '@/context/AuthContext';

const TABS = [
  { id: 'landing', label: 'หน้าแรก', icon: 'home', path: '/alumni' },
  { id: 'tree', label: 'สายตระกูล', icon: 'tree', path: '/alumni/tree' },
  { id: 'profile', label: 'ฉัน', icon: 'user', path: '/alumni/profile' },
];

export const AlumniTopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const getActiveId = () => {
    const path = location.pathname;
    if (path === '/alumni') return 'landing';
    if (path.startsWith('/alumni/tree')) return 'tree';
    if (path.startsWith('/alumni/profile')) return 'profile';
    if (path.startsWith('/alumni/onboarding')) return 'onboarding';
    return '';
  };
  const current = getActiveId();

  return (
    <div className="al-topnav" data-testid="alumni-topnav">
      <button className="al-brand" onClick={() => navigate('/alumni')} data-testid="alumni-brand-btn">
        <div className="al-brand-mark">กต</div>
        <div className="al-brand-name">สายตระกูล <em>MKT SWU</em></div>
      </button>
      <div className="al-nav-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`al-nav-tab ${current === t.id ? 'active' : ''}`}
            onClick={() => navigate(t.path)}
            data-testid={`alumni-nav-${t.id}`}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="al-nav-spacer" />
      <div className="al-nav-right">
        {user ? (
          <>
            <button className="al-iconbtn" title="ค้นหา" data-testid="alumni-search-btn"><Icon name="search" /></button>
            <button className="al-iconbtn" title="แจ้งเตือน" data-testid="alumni-bell-btn"><Icon name="bell" /></button>
            <button onClick={() => navigate('/alumni/profile')} title="โปรไฟล์" data-testid="alumni-avatar-btn">
              <Avatar name={user.full_name || user.email} hue={210} />
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
  const getActiveId = () => {
    const path = location.pathname;
    if (path === '/alumni') return 'landing';
    if (path.startsWith('/alumni/tree')) return 'tree';
    if (path.startsWith('/alumni/profile')) return 'profile';
    return '';
  };
  const current = getActiveId();

  return (
    <nav className="al-bottom-nav" data-testid="alumni-bottom-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={current === t.id ? 'active' : ''}
          onClick={() => navigate(t.path)}
          data-testid={`alumni-bottom-${t.id}`}
        >
          <Icon name={t.icon} size={20} stroke={current === t.id ? 2.2 : 1.8} />
          {t.label}
        </button>
      ))}
    </nav>
  );
};

const AlumniLayout = ({ children, showBottomNav = true }) => {
  return (
    <div className="alumni-root">
      <AlumniTopNav />
      {children}
      {showBottomNav && <AlumniBottomNav />}
    </div>
  );
};

export default AlumniLayout;

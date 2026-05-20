import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/components/unified-topbar.css';

/**
 * Unified Topbar — single source of truth สำหรับ navigation ทั่วทั้งระบบ
 *
 * Behavior:
 * - Auto-detects auth state via useAuth()
 * - Auto-detects role (admin/student/guest) → renders appropriate menu
 * - Mobile-friendly with hamburger drawer
 * - Sticky white with editorial/swiss style matching HomePage
 *
 * Props:
 * - active?: string  — highlight key ('home' | 'learn' | 'announcements' | 'showcase'
 *                                   | 'tools' | 'projects' | 'admin' | 'brand_equity'
 *                                   | 'conjoint' | 'surveys')
 * - subtitle?: string — small line under logo (e.g. "BRAND HEALTH CHECK")
 * - publicMode?: boolean — force guest-style nav even if logged in (e.g. shared public dashboard).
 *                          Default false. When true, hides Tools/Projects/Admin sections.
 */

const PUBLIC_LINKS = [
  { key: 'home',          to: '/',              label: 'หน้าแรก' },
  { key: 'learn',         to: '/learn',         label: 'เรียนรู้' },
  { key: 'announcements', to: '/announcements', label: 'ประชาสัมพันธ์' },
  { key: 'showcase',      to: '/showcase',      label: 'Showcase' },
];

const TOOLS_LINKS = [
  { to: '/brand-equity',                          label: 'Brand Equity',     hint: 'BE' },
  { to: '/market-research/conjoint-analysis',     label: 'Conjoint Analysis', hint: 'CJ' },
  { to: '/market-research/customer-journey',      label: 'Customer Journey',  hint: 'CX' },
  { to: '/market-research/customer-behavior',     label: 'Customer Behavior', hint: 'CB' },
  { to: '/market-research/journal-finder',        label: 'Journal Finder',    hint: 'JF' },
  { to: '/surveys',                               label: 'Survey Builder',    hint: 'SV' },
];

const ADMIN_LINKS = [
  { to: '/admin/users',         label: 'Users',         hint: 'จัดการผู้ใช้' },
  { to: '/admin/cms',           label: 'CMS Posts',     hint: 'บทความ/ข่าว' },
  { to: '/admin/cms/landing',   label: 'Landing CMS',   hint: 'หน้าแรก' },
  { to: '/admin/cms/prompts',   label: 'AI Prompts',    hint: 'Template AI' },
  { to: '/admin/notifications', label: 'Notifications', hint: 'แจ้งเตือน' },
  { to: '/admin/llm-prompts',   label: 'LLM Prompts',   hint: 'AI Settings' },
  { to: '/admin/settings',      label: 'Settings',      hint: 'ตั้งค่าระบบ' },
];

const RoleBadge = ({ role }) => {
  if (!role) return null;
  const r = String(role).toLowerCase();
  const styles = {
    admin:   { bg: '#C8102E', label: 'ADMIN' },
    teacher: { bg: '#0E5538', label: 'TEACHER' },
    student: { bg: '#1F3A8A', label: 'STUDENT' },
    user:    { bg: '#3F3F46', label: 'USER' },
  };
  const cfg = styles[r] || styles.user;
  return (
    <span className="utb-role-badge" style={{ background: cfg.bg }}>
      {cfg.label}
    </span>
  );
};

// ------- Dropdown helper -------
const Dropdown = ({ trigger, children, align = 'left', testid }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return (
    <div className="utb-dd" ref={ref} data-testid={testid}>
      <button type="button"
              className={`utb-dd-trigger ${open ? 'is-open' : ''}`}
              onClick={() => setOpen(v => !v)}
              aria-expanded={open}
              data-testid={testid ? `${testid}-trigger` : undefined}>
        {trigger}
        <span className="utb-chevron" aria-hidden>▾</span>
      </button>
      {open && (
        <div className={`utb-dd-menu utb-dd-menu--${align}`}
             role="menu"
             data-testid={testid ? `${testid}-menu` : undefined}
             onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

const UnifiedTopbar = ({ active = '', subtitle = '', publicMode = false }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isAdmin = !!user && String(user.role || '').toLowerCase() === 'admin';
  const isLoggedIn = !!user;
  const showInternal = isLoggedIn && !publicMode;

  const handleLogout = async () => {
    try { await logout(); } catch (_) { /* ignore */ }
    navigate('/');
  };

  const initial = (user?.fullName || user?.full_name || user?.email || 'U').trim().charAt(0).toUpperCase();
  const displayName = user?.fullName || user?.full_name || user?.email || '';

  return (
    <header className="utb-root" data-testid="unified-topbar">
      <div className="utb-inner">
        {/* Logo + subtitle */}
        <Link to="/" className="utb-logo" data-testid="utb-logo" aria-label="SWU Marketing Research — home">
          <img src={SWU_LOGO_URL} alt="SWU MKT" className="utb-logo-img"/>
          <span className="utb-logo-text">
            <span className="utb-logo-name">SWU · Marketing Research</span>
            {subtitle && <span className="utb-logo-sub">{subtitle}</span>}
          </span>
        </Link>

        {/* Center nav — desktop only */}
        <nav className="utb-nav" aria-label="หลัก">
          {PUBLIC_LINKS.map(l => (
            <Link key={l.key}
                  to={l.to}
                  className={`utb-link ${active === l.key ? 'is-active' : ''}`}
                  data-testid={`utb-nav-${l.key}`}>
              {l.label}
            </Link>
          ))}

          {showInternal && (
            <Dropdown testid="utb-tools-dd"
                      trigger={<span className={active === 'tools' || ['brand_equity', 'conjoint', 'surveys'].includes(active) ? 'is-active' : ''}>เครื่องมือ</span>}>
              {TOOLS_LINKS.map(t => (
                <Link key={t.to} to={t.to} className="utb-dd-item" data-testid={`utb-tools-${t.hint.toLowerCase()}`}>
                  <span className="utb-dd-label">{t.label}</span>
                  <span className="utb-dd-hint">{t.hint}</span>
                </Link>
              ))}
            </Dropdown>
          )}

          {showInternal && (
            <Link to="/projects"
                  className={`utb-link ${active === 'projects' ? 'is-active' : ''}`}
                  data-testid="utb-nav-projects">
              โปรเจกต์
            </Link>
          )}

          {showInternal && isAdmin && (
            <Dropdown testid="utb-admin-dd"
                      trigger={<span className={active === 'admin' ? 'is-active' : ''}>ผู้ดูแล</span>}>
              {ADMIN_LINKS.map(a => (
                <Link key={a.to} to={a.to} className="utb-dd-item" data-testid={`utb-admin-${a.to.split('/').pop()}`}>
                  <span className="utb-dd-label">{a.label}</span>
                  <span className="utb-dd-hint">{a.hint}</span>
                </Link>
              ))}
            </Dropdown>
          )}
        </nav>

        {/* Right cluster — auth controls */}
        <div className="utb-right">
          {!isLoggedIn ? (
            <>
              <Link to="/login" className="utb-btn utb-btn--ghost" data-testid="utb-login-btn">
                เข้าสู่ระบบ
              </Link>
              <Link to="/register" className="utb-btn utb-btn--primary" data-testid="utb-register-btn">
                ลงทะเบียน →
              </Link>
            </>
          ) : (
            <Dropdown testid="utb-user-dd"
                      align="right"
                      trigger={
                        <span className="utb-avatar-cluster">
                          <span className="utb-avatar">{initial}</span>
                          <span className="utb-avatar-label">
                            <span className="utb-avatar-name">{displayName.length > 18 ? displayName.slice(0, 16) + '…' : displayName}</span>
                            <RoleBadge role={user?.role}/>
                          </span>
                        </span>
                      }>
              <div className="utb-dd-header">
                <div className="utb-dd-header-name">{displayName}</div>
                <div className="utb-dd-header-email">{user?.email}</div>
              </div>
              <Link to="/profile" className="utb-dd-item" data-testid="utb-user-profile">
                <span className="utb-dd-label">👤 โปรไฟล์</span>
              </Link>
              <Link to="/profile/notifications" className="utb-dd-item" data-testid="utb-user-notifications">
                <span className="utb-dd-label">🔔 การแจ้งเตือน</span>
              </Link>
              <Link to="/dashboard" className="utb-dd-item" data-testid="utb-user-dashboard">
                <span className="utb-dd-label">📊 Dashboard</span>
              </Link>
              <div className="utb-dd-divider"/>
              <button type="button"
                      className="utb-dd-item utb-dd-item--danger"
                      onClick={handleLogout}
                      data-testid="utb-logout-btn">
                <span className="utb-dd-label">↩ ออกจากระบบ</span>
              </button>
            </Dropdown>
          )}

          {/* Mobile hamburger */}
          <button type="button"
                  className="utb-hamburger"
                  onClick={() => setMobileOpen(v => !v)}
                  aria-label="เปิดเมนู"
                  aria-expanded={mobileOpen}
                  data-testid="utb-hamburger">
            <span/><span/><span/>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="utb-mobile" data-testid="utb-mobile-drawer">
          <div className="utb-mobile-section">
            <div className="utb-mobile-label">หน้าหลัก</div>
            {PUBLIC_LINKS.map(l => (
              <Link key={l.key} to={l.to}
                    className={`utb-mobile-link ${active === l.key ? 'is-active' : ''}`}
                    data-testid={`utb-mobile-${l.key}`}>
                {l.label}
              </Link>
            ))}
          </div>

          {showInternal && (
            <div className="utb-mobile-section">
              <div className="utb-mobile-label">เครื่องมือ</div>
              {TOOLS_LINKS.map(t => (
                <Link key={t.to} to={t.to} className="utb-mobile-link">
                  {t.label} <span className="utb-mobile-hint">{t.hint}</span>
                </Link>
              ))}
              <Link to="/projects" className="utb-mobile-link">📁 โปรเจกต์</Link>
            </div>
          )}

          {showInternal && isAdmin && (
            <div className="utb-mobile-section">
              <div className="utb-mobile-label">ผู้ดูแล</div>
              {ADMIN_LINKS.map(a => (
                <Link key={a.to} to={a.to} className="utb-mobile-link">
                  {a.label}
                </Link>
              ))}
            </div>
          )}

          <div className="utb-mobile-section">
            {!isLoggedIn ? (
              <>
                <Link to="/login" className="utb-btn utb-btn--ghost utb-mobile-btn">เข้าสู่ระบบ</Link>
                <Link to="/register" className="utb-btn utb-btn--primary utb-mobile-btn">ลงทะเบียน →</Link>
              </>
            ) : (
              <>
                <div className="utb-mobile-userline">
                  <span className="utb-avatar">{initial}</span>
                  <div>
                    <div className="utb-avatar-name">{displayName}</div>
                    <RoleBadge role={user?.role}/>
                  </div>
                </div>
                <Link to="/profile" className="utb-mobile-link">👤 โปรไฟล์</Link>
                <Link to="/profile/notifications" className="utb-mobile-link">🔔 การแจ้งเตือน</Link>
                <Link to="/dashboard" className="utb-mobile-link">📊 Dashboard</Link>
                <button onClick={handleLogout} className="utb-mobile-link utb-mobile-link--danger">↩ ออกจากระบบ</button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default UnifiedTopbar;

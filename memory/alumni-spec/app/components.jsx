// ============== SHARED COMPONENTS ==============
const { useState, useEffect, useMemo, useRef } = React;

// Avatar from hue
const Avatar = ({ name, hue = 200, size = 'md', online, verified, ring }) => {
  const initial = name ? name.trim().split(/\s+/)[0].slice(0, 1) : '?';
  const sz = { xs: 22, sm: 28, md: 36, lg: 52, xl: 96 }[size] || 36;
  const font = { xs: 10, sm: 11, md: 13, lg: 16, xl: 28 }[size] || 13;
  const bg = `linear-gradient(135deg, oklch(0.68 0.14 ${hue}) 0%, oklch(0.46 0.16 ${hue}) 100%)`;
  return (
    <div style={{ position: 'relative', width: sz, height: sz, flexShrink: 0 }}>
      <div style={{
        width: sz, height: sz, borderRadius: '50%', background: bg,
        color: 'white', display: 'grid', placeItems: 'center',
        fontWeight: 600, fontSize: font,
        border: ring ? `2px solid ${ring}` : '2px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,.12)',
      }}>{initial}</div>
      {online && <div style={{
        position: 'absolute', bottom: 0, right: 0,
        width: sz * 0.28, height: sz * 0.28, borderRadius: '50%',
        background: '#3BD16F', border: '2px solid white',
      }} />}
      {verified && <div style={{
        position: 'absolute', bottom: -2, right: -2,
        color: 'var(--blue)', background: 'white', borderRadius: '50%',
        width: sz * 0.36, height: sz * 0.36, display: 'grid', placeItems: 'center',
      }}>
        <Icon name="verified" size={sz * 0.36} />
      </div>}
    </div>
  );
};

// Tag/chip
const Chip = ({ children, tone = 'default', icon, onClick }) => {
  const toneClass = tone === 'default' ? '' : tone;
  return (
    <span className={`tag ${toneClass}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : null}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
};

// Relation label with gen
const RelationBadge = ({ relation, gen }) => (
  <span className="tag" style={{ background: 'var(--ink)', color: 'white', gap: 8, padding: '4px 10px 4px 4px' }}>
    <span style={{ background: 'var(--yellow)', color: 'var(--ink)', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }} className="mono">
      {gen}
    </span>
    {relation}
  </span>
);

// TopNav
const TopNav = ({ current, onNav, notifs = 3, onProfile }) => {
  const tabs = [
    { id: 'landing', label: 'หน้าแรก', icon: 'home' },
    { id: 'tree', label: 'สายตระกูล', icon: 'tree' },
    { id: 'discover', label: 'ค้นหาเครือข่าย', icon: 'compass' },
    { id: 'feed', label: 'ฟีด', icon: 'feed' },
    { id: 'jobs', label: 'งาน & ธุรกิจ', icon: 'briefcase' },
  ];
  return (
    <div className="topnav">
      <div className="brand">
        <div className="brand-mark">กต</div>
        <div className="brand-name">สายตระกูล <em>MKT SWU</em></div>
      </div>
      <div className="nav-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`nav-tab ${current === t.id ? 'active' : ''}`} onClick={() => onNav(t.id)}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="nav-spacer" />
      <div className="nav-right">
        <button className="iconbtn" title="ค้นหา"><Icon name="search" /></button>
        <button className="iconbtn" title="แจ้งเตือน">
          <Icon name="bell" />
          {notifs > 0 && <span className="badge">{notifs}</span>}
        </button>
        <button onClick={() => onNav('profile')} title="โปรไฟล์">
          <Avatar name={window.DATA.CURRENT_USER.name} hue={window.DATA.CURRENT_USER.avatarHue} />
        </button>
      </div>
    </div>
  );
};

// Bottom nav for mobile
const BottomNav = ({ current, onNav }) => {
  const tabs = [
    { id: 'landing', label: 'หน้าแรก', icon: 'home' },
    { id: 'tree', label: 'ตระกูล', icon: 'tree' },
    { id: 'discover', label: 'ค้นพบ', icon: 'compass' },
    { id: 'feed', label: 'ฟีด', icon: 'feed' },
    { id: 'profile', label: 'ฉัน', icon: 'user' },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: 'rgba(247,244,238,0.95)', backdropFilter: 'blur(10px)',
      borderTop: '1px solid var(--line)',
      display: 'flex', padding: '6px 4px',
    }} className="bottom-nav">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onNav(t.id)} style={{
          flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 4,
          color: current === t.id ? 'var(--ink)' : 'var(--mute)',
          fontSize: 10, fontWeight: 500,
        }}>
          <Icon name={t.icon} size={20} stroke={current === t.id ? 2.2 : 1.8} />
          {t.label}
        </button>
      ))}
    </div>
  );
};

// Stats pill
const StatPill = ({ label, value, sub, tone }) => (
  <div style={{
    padding: '14px 18px', borderRadius: 14, background: 'var(--card)',
    border: '1px solid var(--line)', minWidth: 140,
  }}>
    <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: tone || 'var(--ink)' }} className="tabular">{value}</div>
    {sub && <div className="small muted">{sub}</div>}
  </div>
);

// Gen ribbon (shows รุ่น number visually)
const GenRibbon = ({ gen }) => {
  const rounded = gen ? Math.floor(gen / 10) * 10 : null;
  return (
    <span className="mono" style={{
      display: 'inline-flex', gap: 2, alignItems: 'baseline',
      padding: '3px 10px', background: 'var(--ink)', color: 'white',
      borderRadius: 999, fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ opacity: 0.55 }}>รหัส</span>
      <span>{gen}</span>
    </span>
  );
};

// Section header
const SectionHead = ({ eyebrow, title, action, onAction }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
    <div>
      {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
      <h2 className="h-section">{title}</h2>
    </div>
    {action && (
      <button className="btn btn-ghost btn-sm" onClick={onAction}>
        {action} <Icon name="arrow-right" size={14} />
      </button>
    )}
  </div>
);

// Toast
const useToast = () => {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return {
    show: (m) => setMsg(m),
    node: msg ? <div className="toast"><Icon name="check" size={16} /> {msg}</div> : null,
  };
};

// Placeholder image
const Placeholder = ({ label, height = 180, style }) => (
  <div className="placeholder-stripe" style={{ height, ...style }}>
    [{label}]
  </div>
);

// Modal
const Modal = ({ onClose, children }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

// Mobile detect hook
const useIsMobile = () => {
  const [m, setM] = useState(false);
  useEffect(() => {
    const check = () => setM(window.innerWidth < 760);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return m;
};

Object.assign(window, {
  Avatar, Chip, RelationBadge, TopNav, BottomNav, StatPill, GenRibbon, SectionHead,
  Placeholder, Modal, useToast, useIsMobile,
});

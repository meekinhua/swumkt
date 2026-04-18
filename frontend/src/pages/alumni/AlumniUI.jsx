import React from 'react';

// ============ Inline SVG Icons (scoped to Alumni module) ============
export const Icon = ({ name, size = 20, stroke = 1.8, style, ...p }) => {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    style, ...p,
  };
  switch (name) {
    case 'home': return <svg {...common}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></svg>;
    case 'tree': return <svg {...common}><circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="14" r="2.5"/><circle cx="18" cy="14" r="2.5"/><circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/><path d="M12 7.5v2m0 0-6 2m6-2 6 2M6 16.5l3 1.5m9-1.5-3 1.5"/></svg>;
    case 'compass': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m14.5 9.5-2 5-5 2 2-5z"/></svg>;
    case 'feed': return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>;
    case 'briefcase': return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>;
    case 'user': return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case 'bell': return <svg {...common}><path d="M18 16H6l1.5-2V10a4.5 4.5 0 0 1 9 0v4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check': return <svg {...common}><path d="m5 12 4 4L19 7"/></svg>;
    case 'chevron-right': return <svg {...common}><path d="m9 6 6 6-6 6"/></svg>;
    case 'chevron-down': return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case 'star': return <svg {...common} fill="currentColor" stroke="none"><path d="m12 2 3 7 7 .5-5.5 4.5L18 21l-6-3.5L6 21l1.5-7L2 9.5 9 9z"/></svg>;
    case 'heart': return <svg {...common}><path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg>;
    case 'sparkles': return <svg {...common}><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.5 5.5l2.8 2.8m7.4 7.4 2.8 2.8M5.5 18.5l2.8-2.8m7.4-7.4 2.8-2.8"/></svg>;
    case 'gift': return <svg {...common}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/></svg>;
    case 'link': return <svg {...common}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1"/></svg>;
    case 'message': return <svg {...common}><path d="M21 12a8 8 0 0 1-12 7l-5 2 2-5a8 8 0 1 1 15-4z"/></svg>;
    case 'flame': return <svg {...common}><path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-6 0 3 2 4 2 4 1-4 3-6 3-9 3 1 5 5 5 9 0 5-3 9-7 9z"/></svg>;
    case 'bolt': return <svg {...common}><path d="M13 2 3 14h8l-1 8 10-12h-8z"/></svg>;
    case 'x': return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'users': return <svg {...common}><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6m2-5c2.5 0 5 1.5 5 5"/></svg>;
    case 'share': return <svg {...common}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8 11 8-4m-8 6 8 4"/></svg>;
    case 'qr': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;
    case 'arrow-right': return <svg {...common}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
    case 'arrow-up-right': return <svg {...common}><path d="M7 17 17 7M9 7h8v8"/></svg>;
    case 'sliders': return <svg {...common}><path d="M4 8h10M4 16h4m12-8h-2m2 8H10"/><circle cx="16" cy="8" r="2"/><circle cx="10" cy="16" r="2"/></svg>;
    case 'logout': return <svg {...common}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
};

// ============ Avatar ============
export const Avatar = ({ name, hue = 200, size = 'md', online, verified, ring, src }) => {
  const initial = name ? name.trim().charAt(0) : '?';
  const sz = { xs: 22, sm: 28, md: 36, lg: 52, xl: 96 }[size] || 36;
  const font = { xs: 10, sm: 11, md: 13, lg: 16, xl: 28 }[size] || 13;
  const bg = `linear-gradient(135deg, oklch(0.68 0.14 ${hue}) 0%, oklch(0.46 0.16 ${hue}) 100%)`;
  return (
    <div style={{ position: 'relative', width: sz, height: sz, flexShrink: 0 }}>
      {src ? (
        <img src={src} alt={name} style={{
          width: sz, height: sz, borderRadius: '50%',
          border: ring ? `2px solid ${ring}` : '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,.12)', objectFit: 'cover',
        }}/>
      ) : (
        <div style={{
          width: sz, height: sz, borderRadius: '50%', background: bg,
          color: 'white', display: 'grid', placeItems: 'center',
          fontWeight: 600, fontSize: font,
          border: ring ? `2px solid ${ring}` : '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,.12)',
        }}>{initial}</div>
      )}
      {online && <span style={{
        position: 'absolute', bottom: 0, right: 0,
        width: sz * 0.28, height: sz * 0.28, borderRadius: '50%',
        background: '#3BD16F', border: '2px solid white',
      }}/>}
      {verified && <span style={{
        position: 'absolute', bottom: -2, right: -2,
        color: '#1B75BC', background: 'white', borderRadius: '50%',
        width: sz * 0.36, height: sz * 0.36, display: 'grid', placeItems: 'center',
        fontSize: sz * 0.22, fontWeight: 700,
      }}>✓</span>}
    </div>
  );
};

// ============ Chip ============
export const Chip = ({ children, tone = 'default', icon, onClick, style }) => {
  const toneClass = tone === 'default' ? '' : tone;
  return (
    <span className={`al-tag ${toneClass}`} onClick={onClick} style={{ ...(onClick ? { cursor: 'pointer' } : null), ...style }}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
};

// ============ StatPill ============
export const StatPill = ({ label, value, sub, tone, testId }) => (
  <div data-testid={testId} style={{
    padding: '14px 18px', borderRadius: 14, background: 'var(--al-card)',
    border: '1px solid var(--al-line)', minWidth: 140,
  }}>
    <div className="al-eyebrow" style={{ marginBottom: 4 }}>{label}</div>
    <div className="al-tabular" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: tone || 'var(--al-ink)' }}>
      {value}
    </div>
    {sub && <div className="al-small al-muted">{sub}</div>}
  </div>
);

// ============ Section head ============
export const SectionHead = ({ eyebrow, title, action, onAction }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
    <div>
      {eyebrow && <div className="al-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
      <h2 className="al-h-section">{title}</h2>
    </div>
    {action && (
      <button className="al-btn al-btn-ghost al-btn-sm" onClick={onAction} data-testid="section-action-btn">
        {action} <Icon name="arrow-right" size={14} />
      </button>
    )}
  </div>
);

// ============ Modal ============
export const Modal = ({ onClose, children }) => (
  <div className="al-modal-backdrop" onClick={onClose} data-testid="alumni-modal-backdrop">
    <div className="al-modal al-fade-in" onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

// ============ Toast hook ============
export const useToast = () => {
  const [msg, setMsg] = React.useState(null);
  React.useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return {
    show: (m) => setMsg(m),
    node: msg ? (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--al-ink)', color: 'white', padding: '12px 18px', borderRadius: 12,
        boxShadow: 'var(--al-shadow-lg)', zIndex: 100,
        fontSize: 14, display: 'flex', alignItems: 'center', gap: 10,
        animation: 'al-fade .2s ease-out both',
      }} data-testid="alumni-toast">
        <Icon name="check" size={16} /> {msg}
      </div>
    ) : null,
  };
};

// ============== ICONS (inline SVG) ==============
const Icon = ({ name, size = 20, stroke = 1.8, ...p }) => {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', ...p };
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
    case 'gift': return <svg {...common}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8S9 3 7 4s-1 4 1 4 4 0 4 0zm0 0s3-5 5-4 1 4-1 4-4 0-4 0z"/></svg>;
    case 'link': return <svg {...common}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1"/></svg>;
    case 'message': return <svg {...common}><path d="M21 12a8 8 0 0 1-12 7l-5 2 2-5a8 8 0 1 1 15-4z"/></svg>;
    case 'map': return <svg {...common}><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case 'flame': return <svg {...common}><path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-6 0 3 2 4 2 4 1-4 3-6 3-9 3 1 5 5 5 9 0 5-3 9-7 9z"/></svg>;
    case 'bolt': return <svg {...common}><path d="M13 2 3 14h8l-1 8 10-12h-8z"/></svg>;
    case 'x': return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'users': return <svg {...common}><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6m2-5c2.5 0 5 1.5 5 5"/></svg>;
    case 'share': return <svg {...common}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8 11 8-4m-8 6 8 4"/></svg>;
    case 'qr': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zm4 4h3v3h-3zm-4 0h2v2h-2z"/></svg>;
    case 'verified': return <svg {...common} fill="currentColor" stroke="white" strokeWidth="1.5"><path d="M12 2 14 4l3-.5 1 3L20 8l-.5 3L22 13l-2 2 .5 3-3 1-1 3-3-1-2 2-2-2-3 1-1-3-3-1 .5-3L2 13l1.5-2L3 8l2-1.5 1-3L9 4z"/><path d="m8 12 3 3 5-6" stroke="white" fill="none"/></svg>;
    case 'arrow-right': return <svg {...common}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
    case 'arrow-up-right': return <svg {...common}><path d="M7 17 17 7M9 7h8v8"/></svg>;
    case 'filter': return <svg {...common}><path d="M3 5h18l-7 9v5l-4-2v-3z"/></svg>;
    case 'dice': return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4m8-4v4"/></svg>;
    case 'building': return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/></svg>;
    case 'logout': return <svg {...common}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/></svg>;
    case 'sliders': return <svg {...common}><path d="M4 8h10M4 16h4m12-8h-2m2 8H10"/><circle cx="16" cy="8" r="2"/><circle cx="10" cy="16" r="2"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
};

window.Icon = Icon;

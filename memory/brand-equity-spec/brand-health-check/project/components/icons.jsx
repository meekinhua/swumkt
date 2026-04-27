// Inline SVG icons — minimal, line-based
const Icon = ({ name, size = 14, stroke = 'currentColor', strokeWidth = 1.5, fill = 'none', ...props }) => {
  const paths = {
    download: <><path d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5"/><path d="M2 12v2.5h12V12"/></>,
    share: <><circle cx="3" cy="8" r="2"/><circle cx="13" cy="3.5" r="2"/><circle cx="13" cy="12.5" r="2"/><path d="M5 7l6-3M5 9l6 3"/></>,
    refresh: <><path d="M14 3v4h-4M2 13V9h4"/><path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9L2 13M2.5 8a5.5 5.5 0 0 1 9.4-3.9L14 3"/></>,
    close: <path d="M3 3l10 10M13 3L3 13"/>,
    check: <path d="M3 8l3 3 7-7" strokeWidth="2"/>,
    plus: <path d="M8 3v10M3 8h10"/>,
    chevron: <path d="M5 6l3 3 3-3"/>,
    chevronR: <path d="M6 5l3 3-3 3"/>,
    chevronL: <path d="M10 5l-3 3 3 3"/>,
    edit: <><path d="M2.5 13.5h2L13 5l-2-2-8.5 8.5z"/><path d="M10 4l2 2"/></>,
    copy: <><rect x="4" y="4" width="9" height="9" rx="1"/><path d="M2 11V3a1 1 0 0 1 1-1h8"/></>,
    trash: <><path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4"/></>,
    drag: <><circle cx="6" cy="4" r="0.8" fill={stroke} stroke="none"/><circle cx="10" cy="4" r="0.8" fill={stroke} stroke="none"/><circle cx="6" cy="8" r="0.8" fill={stroke} stroke="none"/><circle cx="10" cy="8" r="0.8" fill={stroke} stroke="none"/><circle cx="6" cy="12" r="0.8" fill={stroke} stroke="none"/><circle cx="10" cy="12" r="0.8" fill={stroke} stroke="none"/></>,
    sparkle: <><path d="M8 2v4M8 10v4M2 8h4M10 8h4" /><path d="M4 4l2.5 2.5M9.5 9.5L12 12M4 12l2.5-2.5M9.5 6.5L12 4" strokeWidth="1"/></>,
    arrow: <path d="M3 8h10m0 0L9 4m4 4l-4 4"/>,
    arrowDown: <path d="M8 3v10m0 0l-4-4m4 4l4-4"/>,
    arrowUp: <path d="M8 13V3m0 0l-4 4m4-4l4 4"/>,
    filter: <><path d="M2 3h12l-4.5 5.5V13l-3 1V8.5L2 3z"/></>,
    search: <><circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/></>,
    grid: <><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></>,
    list: <><path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2.5" cy="4" r="0.8" fill={stroke} stroke="none"/><circle cx="2.5" cy="8" r="0.8" fill={stroke} stroke="none"/><circle cx="2.5" cy="12" r="0.8" fill={stroke} stroke="none"/></>,
    bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></>,
    brain: <><path d="M5 4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/><path d="M8 4v8M5.5 7h2M8.5 7h2"/></>,
    star: <path d="M8 2l1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.4 4.4 13.3l.7-4.1-3-2.9 4.1-.6L8 2z"/>,
    masks: <><circle cx="5.5" cy="8" r="3.5"/><circle cx="10.5" cy="8" r="3.5"/></>,
    heart: <path d="M8 13s-5-3.5-5-7a2.5 2.5 0 0 1 5-1 2.5 2.5 0 0 1 5 1c0 3.5-5 7-5 7z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
};

// Dimension config — single source of truth
const DIMENSIONS = {
  awareness:  { key: 'awareness',  label: 'Awareness',          th: 'การจดจำ',         num: '01', color: '#1B75BC', icon: 'brain', emoji: '🧠' },
  quality:    { key: 'quality',    label: 'Perceived Quality',  th: 'คุณภาพที่รับรู้', num: '02', color: '#D4A017', icon: 'star',  emoji: '⭐' },
  identity:   { key: 'identity',   label: 'Identity vs Image',  th: 'อัตลักษณ์ vs ภาพลักษณ์', num: '03', color: '#C8102E', icon: 'masks', emoji: '🎭' },
  loyalty:    { key: 'loyalty',    label: 'Loyalty',            th: 'ความภักดี',       num: '04', color: '#10B981', icon: 'heart', emoji: '💛' },
};

window.Icon = Icon;
window.DIMENSIONS = DIMENSIONS;

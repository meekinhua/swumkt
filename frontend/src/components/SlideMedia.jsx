import React, { useEffect, useState, useMemo } from 'react';

// Extract YouTube video id from a URL or raw id
export const youtubeId = (raw = '') => {
  const s = String(raw).trim();
  if (!s) return '';
  // Already an id-like string
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    // /embed/<id> or /shorts/<id>
    const m = u.pathname.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  return '';
};

const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/**
 * Auto-rotating media gallery for a single hero slide.
 * - Renders images and YouTube embeds in sequence
 * - Auto-cycles every `interval` ms; pauses on hover
 * - Pauses auto-rotation while a YouTube video is the active item (so we don't yank away from playback)
 * - Falls back to a single image when no media items are provided
 *
 * Items: [{kind:'image'|'youtube', src, alt, caption}]
 */
export const SlideMedia = ({
  media = [],
  fallbackImage = '',
  fallbackAlt = '',
  fallbackCaption = '',
  interval = 4500,
  onPauseRequest,        // (paused: bool) — bubble up so parent can pause outer rotation
  testid = 'slide-media',
}) => {
  const items = useMemo(() => {
    const list = (media || []).filter(m => m && m.src);
    if (list.length > 0) return list;
    if (fallbackImage) {
      return [{ kind: 'image', src: fallbackImage, alt: fallbackAlt, caption: fallbackCaption }];
    }
    return [];
  }, [media, fallbackImage, fallbackAlt, fallbackCaption]);

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  // Sticky pause stays on after user interaction so outer carousel doesn't yank away mid-view
  const [stickyPause, setStickyPause] = useState(false);

  // Keep idx in bounds when items change
  useEffect(() => { if (idx >= items.length) setIdx(0); }, [items.length, idx]);

  // Whenever the active item is a YouTube video, lock pause to true permanently
  // (user clicks a different dot to release). For images, sticky resets when
  // user clicks an image dot — pauses for 30s of dwell time then resumes.
  useEffect(() => {
    if (items[idx]?.kind === 'youtube') {
      setStickyPause(true);
      return undefined;
    }
    // image item — release sticky after 30s if no further interaction
    if (stickyPause) {
      const t = setTimeout(() => setStickyPause(false), 30000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [idx, items, stickyPause]);

  // User clicked a dot → set sticky pause so neither inner nor outer carousels move on them
  const onDotClick = (i, e) => {
    e.stopPropagation();
    setIdx(i);
    setStickyPause(true);
  };

  // Bubble up the effective pause state so the parent can freeze outer rotations
  useEffect(() => {
    if (typeof onPauseRequest === 'function') {
      onPauseRequest(paused || stickyPause);
    }
  }, [paused, stickyPause, onPauseRequest]);

  // Auto-rotate inner items
  useEffect(() => {
    if (paused || stickyPause || items.length <= 1) return undefined;
    if (items[idx]?.kind === 'youtube') return undefined;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [items, idx, interval, paused, stickyPause]);

  if (items.length === 0) {
    return (
      <div className="img-frame" data-testid={`${testid}-empty`}
           style={{ background: '#f4f4f4', minHeight: 280,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#999', fontSize: 12, fontFamily: 'var(--mono)' }}>
        ยังไม่มีสื่อ
      </div>
    );
  }

  const cur = items[idx];
  const ytId = cur.kind === 'youtube' ? youtubeId(cur.src) : '';

  return (
    <div className="img-frame rotator-shell"
         data-testid={testid}
         onMouseEnter={() => setPaused(true)}
         onMouseLeave={() => setPaused(false)}
         style={{ background: '#fff', position: 'relative', overflow: 'hidden' }}>

      {cur.kind === 'image' ? (
        <img key={`m-${idx}`} src={cur.src} alt={cur.alt || ''}
             className="rotate-in-slow"
             style={{ filter: 'saturate(1.08) contrast(1.04)',
                      width: '100%', height: '100%', objectFit: 'cover',
                      position: 'absolute', inset: 0 }}/>
      ) : ytId ? (
        <iframe key={`m-${idx}`}
                title={cur.alt || 'YouTube video'}
                src={`https://www.youtube-nocookie.com/embed/${ytId}?modestbranding=1&rel=0`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                data-testid={`${testid}-yt-${idx}`}
                style={{ width: '100%', height: '100%', border: 0,
                         position: 'absolute', inset: 0 }}/>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#888', fontSize: 12, fontFamily: 'var(--mono)' }}>
          INVALID MEDIA
        </div>
      )}

      {/* Caption overlay — only for images */}
      {cur.kind === 'image' && (cur.caption || fallbackCaption) && (
        <div key={`cap-${idx}`} className="rotate-in"
             style={{ position: 'absolute', bottom: 12, left: 12, maxWidth: '70%',
                      padding: '6px 10px', background: 'rgba(255,255,255,0.92)',
                      borderRadius: 999, fontFamily: 'var(--mono)', fontSize: 10,
                      letterSpacing: '0.06em', color: '#1A1A1A' }}>
          {cur.caption || fallbackCaption}
        </div>
      )}

      {/* Sub-rotation dots (only when >1 media) */}
      {items.length > 1 && (
        <div data-testid={`${testid}-dots`}
             style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
          {items.map((m, i) => (
            <button key={i} aria-label={`Media ${i + 1}`}
                    onClick={(e) => onDotClick(i, e)}
                    data-testid={`${testid}-dot-${i}`}
                    title={m.kind === 'youtube' ? 'YouTube' : 'Image'}
                    style={{
                      width: i === idx ? 22 : 9, height: 9,
                      borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: i === idx
                        ? (m.kind === 'youtube' ? '#C8102E' : '#1A1A1A')
                        : 'rgba(255,255,255,0.8)',
                      boxShadow: '0 0 0 1px rgba(10,10,10,0.25)',
                      transition: 'all .25s ease', padding: 0,
                    }}/>
          ))}
        </div>
      )}

      {/* "▶ video" marker when current item is YouTube */}
      {cur.kind === 'youtube' && (
        <div style={{ position: 'absolute', bottom: 12, left: 12,
                      padding: '6px 10px', background: 'rgba(200,16,46,0.95)',
                      borderRadius: 999, color: '#fff',
                      fontFamily: 'var(--mono)', fontSize: 10,
                      letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          ▶ VIDEO
        </div>
      )}
    </div>
  );
};

export const youtubeThumbnail = youtubeThumb;
export default SlideMedia;

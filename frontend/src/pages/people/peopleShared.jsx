import React, { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Pieces shared by the faculty pages.
 *
 * Kept out of the page files because the article byline uses `FacultyLink`
 * too, and a lecturer should look the same wherever their name appears.
 */

export const API_ORIGIN = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');

/** A photo path from the API may be site-relative (/api/media/...). */
export const photoSrc = (photo) => {
  if (!photo || typeof photo !== 'string') return null;
  if (/^(https?:|data:image\/)/i.test(photo)) return photo;
  if (photo.startsWith('/')) return `${API_ORIGIN}${photo}`;
  return null;
};

const initialsOf = (f) => {
  const n = (f?.name_en || f?.name_th || '?').trim().split(/\s+/);
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase() || '?';
};

/**
 * Portrait with an initials fallback. The first photos are hotlinked from the
 * department's site, which can move or block them at any time; a broken image
 * on a profile page reads worse than no image.
 */
export const Portrait = ({ faculty, size = 160, radius = 14, priority = false }) => {
  const wanted = photoSrc(faculty?.photo);
  const [brokenSrc, setBrokenSrc] = useState(null);
  const src = wanted && wanted !== brokenSrc ? wanted : null;
  const box = {
    width: size, height: Math.round(size * 1.25), borderRadius: radius,
    overflow: 'hidden', flexShrink: 0, background: 'var(--paper-2, #F2EEE6)',
    border: '1px solid var(--rule, rgba(10,10,10,.12))',
  };
  if (!src) {
    return (
      <div style={{ ...box, display: 'grid', placeItems: 'center',
                    background: 'linear-gradient(140deg,#14161A 0%,#3A3D45 100%)',
                    color: '#F7F4EE', fontFamily: 'IBM Plex Serif, Georgia, serif',
                    fontSize: Math.round(size * 0.3), fontWeight: 600 }}
           aria-label={faculty?.display_name_th}>
        {initialsOf(faculty)}
      </div>
    );
  }
  return (
    <div style={box}>
      <img src={src} alt={faculty?.display_name_th || ''}
           width={size} height={Math.round(size * 1.25)}
           loading={priority ? 'eager' : 'lazy'}
           fetchPriority={priority ? 'high' : 'auto'}
           decoding="async"
           onError={() => setBrokenSrc(wanted)}
           style={{ width: '100%', height: '100%', objectFit: 'cover',
                    objectPosition: 'center 18%', display: 'block' }}/>
    </div>
  );
};

/**
 * An address a scraper cannot lift from the HTML. It is assembled only when
 * someone clicks, which costs a real visitor nothing.
 */
export const ProtectedEmail = ({ slug }) => {
  const [email, setEmail] = useState(null);
  const [state, setState] = useState('idle');   // idle | loading | error
  const linkRef = React.useRef(null);
  React.useEffect(() => { if (email) linkRef.current?.focus(); }, [email]);
  if (!slug) return null;
  if (email) {
    return <a ref={linkRef} href={`mailto:${email}`} data-testid="faculty-email">{email}</a>;
  }
  const reveal = async () => {
    setState('loading');
    try {
      const r = await fetch(`${API_ORIGIN}/api/faculty/${encodeURIComponent(slug)}/contact`);
      if (!r.ok) throw new Error(String(r.status));
      setEmail((await r.json()).email);
    } catch (e) {
      setState('error');
    }
  };
  return (
    <button type="button" onClick={reveal} data-testid="faculty-email-reveal"
            aria-label="แสดงอีเมลติดต่อ"
            disabled={state === 'loading'}
            style={{ background: 'none', border: 0, padding: 0, color: 'inherit',
                     font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
      {state === 'loading' ? 'กำลังโหลด…' : state === 'error' ? 'ลองอีกครั้ง' : 'แสดงอีเมล'}
    </button>
  );
};

const LINK_LABELS = {
  orcid: 'ORCID', scholar: 'Google Scholar', scopus: 'Scopus',
  researchgate: 'ResearchGate', openalex: 'OpenAlex', linkedin: 'LinkedIn',
  cv: 'CV (PDF)', department: 'หน้าภาควิชา',
};

export const ProfileLinks = ({ links }) => {
  const rows = Object.entries(links || {})
    .filter(([k, v]) => v && LINK_LABELS[k])
    .sort(([a], [b]) => Object.keys(LINK_LABELS).indexOf(a) - Object.keys(LINK_LABELS).indexOf(b));
  if (!rows.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="faculty-links">
      {rows.map(([k, v]) => (
        <a key={k} href={v} target="_blank" rel="noopener noreferrer me"
           className="be-tiny"
           style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--rule)',
                    textDecoration: 'none', color: 'inherit', fontSize: 12.5 }}>
          {LINK_LABELS[k]} ↗
        </a>
      ))}
    </div>
  );
};

const TYPE_LABEL = {
  article: 'Journal article', review: 'Review', conference: 'Conference',
  chapter: 'Book chapter', book: 'Book', preprint: 'Preprint', thesis: 'Thesis',
  other: 'Publication',
};

/**
 * One publication. The title links to the paper itself — the point of the
 * list is that a reader can go and read it, so the link is the whole row's
 * job, not a small icon at the end.
 */
export const PaperRow = ({ paper, people = {}, selfId }) => {
  const read = paper.pdf_url || paper.url;
  const ours = new Set(paper.faculty_ids || []);
  return (
    <li style={{ padding: '18px 0', borderTop: '1px solid var(--rule)', listStyle: 'none' }}
        data-testid={`paper-${paper.id}`}>
      <div className="ed-card__meta" style={{ marginBottom: 6, fontSize: 11 }}>
        <span className="ed-card__cat">{paper.year || '—'} · {TYPE_LABEL[paper.type] || 'Publication'}</span>
        {paper.open_access && <span className="ed-card__time">OPEN ACCESS</span>}
      </div>
      <h3 className="serif" style={{ fontSize: 19, lineHeight: 1.35, margin: '0 0 6px', fontWeight: 500 }}>
        {read
          ? <a href={read} target="_blank" rel="noopener noreferrer"
               style={{ color: 'inherit', textDecoration: 'none',
                        borderBottom: '1px solid var(--rule-strong, rgba(10,10,10,.3))' }}>
              {paper.title}
            </a>
          : paper.title}
      </h3>
      {!!(paper.authors || []).length && (
        <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--ink-2)' }}>
          {paper.authors.join(', ')}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)' }}>
        {paper.venue && <em>{paper.venue}</em>}
        {paper.doi && <> · DOI <a href={`https://doi.org/${paper.doi}`} target="_blank"
                                  rel="noopener noreferrer" style={{ color: 'inherit' }}>{paper.doi}</a></>}
        {paper.cited_by > 0 && <> · อ้างอิง {paper.cited_by} ครั้ง</>}
      </p>
      {[...ours].filter(id => id !== selfId && people[id]).length > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 13 }}>
          {/* On a profile these are co-authors; on the publications list
              there is no "self", so they are simply the department's authors. */}
          {selfId ? 'ร่วมกับ' : 'คณาจารย์:'}{' '}
          {[...ours].filter(id => id !== selfId && people[id]).map((id, i) => (
            <React.Fragment key={id}>
              {i > 0 && ', '}
              <FacultyLink person={people[id]} />
            </React.Fragment>
          ))}
        </p>
      )}
    </li>
  );
};

/** A lecturer's name, linked to their profile. Used in bylines too. */
export const FacultyLink = ({ person, lang = 'th' }) => {
  if (!person?.slug) return null;
  const name = lang === 'en' ? person.display_name_en : person.display_name_th;
  return (
    // <Link> renders a real <a href>, so crawlers follow it; it just skips the
    // full page reload for a reader.
    <Link to={`/people/${person.slug}`} rel="author"
          style={{ color: 'inherit', textDecoration: 'underline',
                   textDecorationColor: 'var(--rule-strong, rgba(10,10,10,.3))',
                   textUnderlineOffset: 3 }}>
      {name}
    </Link>
  );
};

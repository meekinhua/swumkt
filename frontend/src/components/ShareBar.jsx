import React, { useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';

/**
 * Share buttons for public content.
 *
 * Why these links point at `/api/share/...` rather than the page you are on:
 * the site is a React SPA, so every real URL returns the same 3 KB shell with
 * one site-wide og:title and og:image. Facebook and LINE do not run JavaScript,
 * so a shared article shows "SWUMKT Portal" and the logo no matter which
 * article it is. The backend bridge renders the item's own title, description,
 * cover image and JSON-LD for crawlers, and sends humans straight on to the
 * real page — whose URL it also declares as canonical, so search engines index
 * the page and not the bridge.
 *
 * Audit: memory/REPUTATION_AUDIT_2026_10.md section 2.1.
 */

const API_ORIGIN = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');

/** `kind` is 'learn' for articles, 'showcase' for a study share token. */
export const shareUrlFor = (kind, idOrSlug) =>
  `${API_ORIGIN}/api/share/${kind}/${encodeURIComponent(idOrSlug)}`;

const Btn = ({ onClick, href, label, testid, children }) => {
  const common = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 13px', borderRadius: 999, border: '1px solid var(--rule)',
    background: 'transparent', color: 'inherit', font: 'inherit',
    fontSize: 12.5, cursor: 'pointer', textDecoration: 'none', lineHeight: 1.4,
  };
  if (href) {
    return (
      <a style={common} href={href} target="_blank" rel="noopener noreferrer"
         data-testid={testid} aria-label={label}>{children}</a>
    );
  }
  return (
    <button type="button" style={common} onClick={onClick}
            data-testid={testid} aria-label={label}>{children}</button>
  );
};

const ShareBar = ({ kind, idOrSlug, title = '', compact = false }) => {
  const [copied, setCopied] = useState(false);
  if (!idOrSlug) return null;

  const url = shareUrlFor(kind, idOrSlug);
  const enc = encodeURIComponent(url);
  const encText = encodeURIComponent(title ? `${title}\n${url}` : url);

  return (
    <div data-testid="sharebar"
         style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                  margin: compact ? '8px 0' : '18px 0' }}>
      {!compact && (
        <span className="be-tiny" style={{ color: 'var(--ink-3)', marginRight: 2 }}>
          แชร์บทความนี้
        </span>
      )}
      <Btn testid="share-fb" label="แชร์ไป Facebook"
           href={`https://www.facebook.com/sharer/sharer.php?u=${enc}`}>Facebook</Btn>
      {/* LINE's share endpoint takes the text, so the title rides along with the link */}
      <Btn testid="share-line" label="แชร์ไป LINE"
           href={`https://line.me/R/msg/text/?${encText}`}>LINE</Btn>
      <Btn testid="share-x" label="แชร์ไป X"
           href={`https://twitter.com/intent/tweet?url=${enc}&text=${encodeURIComponent(title)}`}>X</Btn>
      <Btn testid="share-copy" label="คัดลอกลิงก์"
           onClick={async () => {
             await copyToClipboard(url);
             setCopied(true);
             setTimeout(() => setCopied(false), 2000);
           }}>
        {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
      </Btn>
    </div>
  );
};

export default ShareBar;

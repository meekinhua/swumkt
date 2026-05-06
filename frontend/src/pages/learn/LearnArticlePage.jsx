import React from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ARTICLES } from './learnContent';
import { Icon, SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import useDocumentMeta from '@/hooks/useDocumentMeta';

// Render a markdown-lite paragraph: **bold** + [text](url) + line breaks.
const renderInline = (text) => {
  // Split by [text](url) link pattern first
  const parts = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ type: 't', val: text.slice(lastIdx, m.index) });
    parts.push({ type: 'a', val: m[1], href: m[2] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ type: 't', val: text.slice(lastIdx) });

  // Then handle **bold** within each text part
  return parts.flatMap((p, i) => {
    if (p.type === 'a') {
      const isInternal = p.href.startsWith('/');
      return isInternal
        ? <Link key={i} to={p.href} style={{ color: 'var(--be-red)', textDecoration: 'underline' }}>{p.val}</Link>
        : <a key={i} href={p.href} style={{ color: 'var(--be-red)', textDecoration: 'underline' }}>{p.val}</a>;
    }
    return p.val.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => {
      const k = `${i}-${j}`;
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={k} style={{ color: 'var(--ink)', fontWeight: 600 }}>{seg.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={k}>{seg}</React.Fragment>;
    });
  });
};

const renderBody = (body) => {
  // Split into blocks by double newline. Each block becomes paragraph or list.
  return body.split(/\n\n/).map((block, i) => {
    const trimmed = block.trim();
    // Bullet list (lines starting with - )
    if (trimmed.split('\n').every(line => line.trim().startsWith('-'))) {
      return (
        <ul key={i} style={{ marginBottom: 18, paddingLeft: 20, lineHeight: 1.7 }}>
          {trimmed.split('\n').map((line, j) => (
            <li key={j} style={{ marginBottom: 6 }}>{renderInline(line.replace(/^-\s*/, ''))}</li>
          ))}
        </ul>
      );
    }
    // Blockquote
    if (trimmed.startsWith('> ')) {
      return (
        <blockquote key={i}
                    style={{ borderLeft: '4px solid var(--be-red)',
                             padding: '8px 18px', margin: '20px 0',
                             fontFamily: 'IBM Plex Serif, Georgia, serif',
                             fontStyle: 'italic', fontSize: 19, lineHeight: 1.5,
                             color: 'var(--ink)' }}>
          {renderInline(trimmed.replace(/^>\s*/, ''))}
        </blockquote>
      );
    }
    return (
      <p key={i} style={{ marginBottom: 16, lineHeight: 1.75, fontSize: 16,
                          fontFamily: 'IBM Plex Sans Thai', color: 'var(--ink-2)' }}>
        {renderInline(trimmed)}
      </p>
    );
  });
};

const LearnArticlePage = () => {
  const { slug } = useParams();
  const article = ARTICLES[slug];

  // Always-call hook before early returns
  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta(article ? {
    title: `${article.title} · SWU MKT`,
    description: article.description,
    image: article.image || SWU_LOGO_URL,
    url,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      image: article.image || SWU_LOGO_URL,
      author: { '@type': 'Organization', name: 'SWU Marketing Research' },
      publisher: {
        '@type': 'Organization',
        name: 'SWU Marketing Research',
        logo: { '@type': 'ImageObject', url: SWU_LOGO_URL },
      },
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      mainEntityOfPage: url,
      keywords: article.keywords,
    },
  } : { title: 'Article not found · SWU MKT' });

  if (!article) return <Navigate to="/learn" replace/>;

  const { title, titleEn, category, readMin, publishedAt, updatedAt, sections, tool, related, image, keywords } = article;

  return (
    <div className="be-root" data-testid={`learn-article-${slug}`}>
      <div className="be-public-topbar">
        <Link to="/" className="be-public-brand" style={{ textDecoration: 'none' }}>
          <img src={SWU_LOGO_URL} alt="SWU MKT" className="be-public-logo"/>
          <span className="be-public-text">
            <span className="be-public-name">SWU · Marketing Research</span>
            <span className="be-public-sub be-mono">KNOWLEDGE HUB</span>
          </span>
        </Link>
        <Link to="/learn" className="be-mono be-tiny"
              style={{ padding: '6px 12px', border: '1px solid var(--rule-strong)',
                       letterSpacing: '0.10em', color: 'var(--ink)', textDecoration: 'none' }}>
          ← All Articles
        </Link>
      </div>

      <article className="be-page" style={{ maxWidth: 1140 }}>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="be-mono be-tiny be-muted"
             style={{ marginBottom: 28, letterSpacing: '0.12em' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>HOME</Link>
          {' / '}
          <Link to="/learn" style={{ color: 'inherit', textDecoration: 'none' }}>LEARN</Link>
          {' / '}
          <span style={{ color: 'var(--be-red)' }}>{category}</span>
        </nav>

        {/* Article header */}
        <header style={{ borderBottom: '1px solid var(--ink)', paddingBottom: 28, marginBottom: 40 }}>
          <div className="be-mono be-tiny" style={{ color: 'var(--be-red)', letterSpacing: '0.14em',
                                                       marginBottom: 14 }}>
            {category} · {readMin} MIN READ · UPDATED {updatedAt}
          </div>
          <h1 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                       fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1,
                       fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
            {title}
          </h1>
          {titleEn && (
            <div className="be-mono be-muted" style={{ fontSize: 14, letterSpacing: '0.05em',
                                                          marginBottom: 18 }}>
              {titleEn}
            </div>
          )}
          <p style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 18, lineHeight: 1.6,
                      color: 'var(--ink-2)', maxWidth: 760 }}>
            {article.description}
          </p>
        </header>

        {/* Two-column: TOC sidebar + main content + tool sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 40 }}>
          <div className="learn-article-grid"
               style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 32 }}>
            <main style={{ minWidth: 0 }}>
              {sections.map((sec, i) => (
                <section key={i} id={`s${i}`} style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 28,
                               fontWeight: 500, lineHeight: 1.2, color: 'var(--ink)',
                               marginBottom: 14, paddingTop: 8 }}>
                    {sec.h}
                  </h2>
                  {renderBody(sec.body)}
                </section>
              ))}

              {/* Inline Tool CTA */}
              {tool && (
                <aside style={{ background: 'var(--ink)', color: 'var(--paper)',
                                padding: '32px 28px', margin: '36px 0',
                                border: '1px solid var(--ink)' }}
                       data-testid={`learn-tool-cta-${slug}`}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11,
                                letterSpacing: '0.18em', opacity: 0.7, marginBottom: 8 }}>
                    TRY THIS NOW · ใช้เครื่องมือนี้ทันที
                  </div>
                  <h3 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                               fontSize: 28, fontWeight: 500, marginBottom: 8 }}>
                    {tool.name}
                  </h3>
                  <p style={{ fontSize: 15, opacity: 0.85, lineHeight: 1.5,
                              marginBottom: 18, fontFamily: 'IBM Plex Sans Thai' }}>
                    {tool.description}
                  </p>
                  <Link to={tool.path}
                        data-testid={`learn-tool-link-${slug}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                                 background: 'var(--be-red)', color: '#fff',
                                 padding: '10px 18px', textDecoration: 'none',
                                 fontFamily: 'IBM Plex Mono', fontSize: 12,
                                 letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Open tool <Icon name="arrowR" size={12}/>
                  </Link>
                </aside>
              )}

              {/* Author byline */}
              <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--rule)' }}>
                <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.10em',
                                                                     marginBottom: 6 }}>
                  WRITTEN BY
                </div>
                <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                              fontSize: 18, fontWeight: 500, color: 'var(--ink)' }}>
                  SWU Marketing Research Team
                </div>
                <div className="be-muted" style={{ fontSize: 14, marginTop: 4 }}>
                  Department of Marketing · Srinakharinwirot University · Bangkok, Thailand
                </div>
                {keywords && (
                  <div className="be-mono be-tiny be-muted" style={{ marginTop: 14,
                                                                       letterSpacing: '0.05em' }}>
                    KEYWORDS: {keywords}
                  </div>
                )}
              </div>
            </main>
          </div>

          {/* Related articles */}
          {related && related.length > 0 && (
            <section style={{ marginTop: 24, borderTop: '1px solid var(--rule)', paddingTop: 24 }}>
              <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.14em',
                                                                   marginBottom: 16 }}>
                RELATED · บทความที่เกี่ยวข้อง
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 24 }}>
                {related.map(rs => {
                  const r = ARTICLES[rs];
                  if (!r) return null;
                  return (
                    <Link key={rs} to={`/learn/${rs}`}
                          data-testid={`learn-related-${rs}`}
                          style={{ textDecoration: 'none', color: 'inherit',
                                   borderTop: '1px solid var(--ink)', paddingTop: 14,
                                   display: 'block' }}>
                      <div className="be-mono be-tiny" style={{ color: 'var(--be-red)',
                                                                 letterSpacing: '0.12em' }}>
                        {r.category}
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                                    fontSize: 18, lineHeight: 1.3, marginTop: 6,
                                    color: 'var(--ink)' }}>
                        {r.title}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  );
};

export default LearnArticlePage;

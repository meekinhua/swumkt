import React from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { Topbar, Footer, Eyebrow, BrandLogo } from '@/pages/swumkt/SwumktComponents';
import { ARTICLES } from './learnContent';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';

// Markdown-lite renderer: **bold** + [text](url)
const renderInline = (text) => {
  const parts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 't', val: text.slice(last, m.index) });
    parts.push({ type: 'a', val: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 't', val: text.slice(last) });

  return parts.flatMap((p, i) => {
    if (p.type === 'a') {
      const internal = p.href.startsWith('/');
      return internal
        ? <Link key={i} to={p.href} style={{ color: 'var(--be-red)', borderBottom: '1px solid var(--be-red)' }}>{p.val}</Link>
        : <a key={i} href={p.href} style={{ color: 'var(--be-red)', borderBottom: '1px solid var(--be-red)' }}>{p.val}</a>;
    }
    return p.val.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => {
      const k = `${i}-${j}`;
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={k} style={{ fontWeight: 600, color: 'var(--ink)' }}>{seg.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={k}>{seg}</React.Fragment>;
    });
  });
};

const renderBody = (body) => body.split(/\n\n/).map((block, i) => {
  const t = block.trim();
  if (t.split('\n').every(line => line.trim().startsWith('-'))) {
    return (
      <ul key={i} style={{ paddingLeft: 24, margin: '0 0 32px' }}>
        {t.split('\n').map((line, j) => (
          <li key={j} style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink)', marginBottom: 10 }}>
            {renderInline(line.replace(/^-\s*/, ''))}
          </li>
        ))}
      </ul>
    );
  }
  if (t.startsWith('> ')) {
    return (
      <blockquote key={i} style={{ borderLeft: '4px solid var(--be-red)',
                                     padding: '12px 0 12px 28px', margin: '40px 0',
                                     fontFamily: 'var(--serif)', fontSize: 24,
                                     fontStyle: 'italic', lineHeight: 1.4, color: 'var(--ink)' }}>
        {renderInline(t.replace(/^>\s*/, ''))}
      </blockquote>
    );
  }
  return (
    <p key={i} style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink)', margin: '0 0 24px' }}>
      {renderInline(t)}
    </p>
  );
});

const LearnArticlePage = () => {
  const { slug } = useParams();
  const article = ARTICLES[slug];

  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta(article ? {
    title: `${article.title} · SWU MKT`,
    description: article.description,
    image: article.image || SWU_LOGO_URL,
    url, type: 'article',
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

  const { title, titleEn, category, readMin, updatedAt, sections, tool, related, keywords } = article;
  const relatedArticles = (related || []).map(s => ARTICLES[s]).filter(Boolean).slice(0, 3);

  return (
    <div data-testid={`learn-article-${slug}`}>
      <Topbar active="learn" />

      {/* Breadcrumb */}
      <div className="swu-container" style={{ padding: '24px 32px 0' }}>
        <div className="meta">
          <Link to="/" style={{ color: 'inherit' }}>HOME</Link>
          {' / '}
          <Link to="/learn" style={{ color: 'inherit' }}>LEARN</Link>
          {' / '}
          <span style={{ color: 'var(--be-red)' }}>{category}</span>
        </div>
      </div>

      {/* Article header */}
      <section className="swu-container" style={{ padding: '40px 32px 56px', maxWidth: 920 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <span className="meta" style={{ color: 'var(--be-red)' }}>● {category}</span>
          <span className="meta">{readMin} MIN READ</span>
          <span className="meta">UPDATED {updatedAt}</span>
        </div>
        <h1 className="h-article" style={{ fontSize: 'clamp(38px, 5.5vw, 60px)' }}>
          {title}
        </h1>
        {titleEn && (
          <p style={{ fontFamily: 'var(--mono)', fontSize: 14, fontStyle: 'italic',
                      color: 'var(--ink-3)', margin: '24px 0 0' }}>
            {titleEn}
          </p>
        )}
        <p style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--ink-2)',
                    margin: '24px 0 0', maxWidth: '60ch' }}>
          {article.description}
        </p>
      </section>

      <div className="swu-container" style={{ padding: '0 32px' }}>
        <div className="rule rule--strong"></div>
      </div>

      {/* Body */}
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '56px 32px 0' }}>
        {sections.map((sec, i) => (
          <section key={i} style={{ marginBottom: 16 }}>
            <h2 className="serif" style={{ fontSize: 30, lineHeight: 1.18,
                                              letterSpacing: '-0.01em',
                                              margin: i === 0 ? '0 0 20px' : '40px 0 20px' }}>
              {sec.h}
            </h2>
            {renderBody(sec.body)}
          </section>
        ))}

        {/* Inline Tool CTA */}
        {tool && (
          <div className="tool-cta" style={{ margin: '48px 0' }}
               data-testid={`learn-tool-cta-${slug}`}>
            <Eyebrow dot>● Try this now · ใช้เครื่องมือนี้ทันที</Eyebrow>
            <h3>{tool.name}</h3>
            <p>{tool.description}</p>
            <Link to={tool.path} className="btn btn--red"
                  data-testid={`learn-tool-link-${slug}`}>
              Open Tool →
            </Link>
          </div>
        )}

        {/* Author byline */}
        <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--rule)',
                      padding: '32px 0', margin: '64px 0 0',
                      display: 'grid', gridTemplateColumns: '120px 1fr', gap: 24, alignItems: 'center' }}>
          <BrandLogo brand={{ name: 'SWU' }} initial="ก" gradient={2} size="lg"/>
          <div>
            <div className="meta">Written by</div>
            <div className="serif" style={{ fontSize: 22, marginTop: 6 }}>
              SWU Marketing Research Team
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>
              Department of Marketing · Srinakharinwirot University
            </div>
            {keywords && (
              <div className="meta" style={{ marginTop: 12, letterSpacing: '0.06em',
                                              fontSize: 10, color: 'var(--ink-3)' }}>
                KEYWORDS: {keywords}
              </div>
            )}
          </div>
        </div>
      </article>

      {/* Related */}
      {relatedArticles.length > 0 && (
        <section className="swu-container" style={{ padding: '64px 32px 0' }}>
          <Eyebrow red>● Related Articles</Eyebrow>
          <div className="article-grid"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 40, marginTop: 32 }}>
            {relatedArticles.map((r) => (
              <Link key={r.slug} to={`/learn/${r.slug}`} className="ed-card"
                    data-testid={`learn-related-${r.slug}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="ed-card__meta">
                  <span className="ed-card__cat">{r.category}</span>
                  <span className="ed-card__time">{r.readMin} MIN</span>
                </div>
                <h4 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 18,
                             lineHeight: 1.2, letterSpacing: '-0.01em', margin: 0 }}>
                  {r.title}
                </h4>
                <span className="ed-card__cta">Read →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
};

export default LearnArticlePage;

import React, { useState, useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Topbar, Footer, Eyebrow } from '@/pages/swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import ShareBar from '@/components/ShareBar';
import { FacultyLink, API_ORIGIN } from '@/pages/people/peopleShared';
import { copyToClipboard } from '@/lib/clipboard';
import { youtubeId } from '@/components/SlideMedia';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CmsArticleView = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/cms/posts/public/by-slug/${encodeURIComponent(slug)}`);
        if (!alive) return;
        setPost(r.data);
      } catch (e) {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // Origin + path only. href would carry any ?utm_… into the canonical, so
  // every tracked link would declare itself a different page — and disagree
  // with the canonical the share bridge emits.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = post ? `${origin}/learn/${post.slug}` : '';
  // A cover served through /api/media is site-relative; structured data and
  // og:image need an absolute URL.
  const coverAbs = !post?.cover_image ? SWU_LOGO_URL
    : /^https?:/i.test(post.cover_image) ? post.cover_image
    : post.cover_image.startsWith('/') ? `${API_ORIGIN}${post.cover_image}`
    : SWU_LOGO_URL;
  useDocumentMeta(post ? {
    title: `${post.title} · SWU MKT`,
    description: post.excerpt || '',
    image: coverAbs,
    url, type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt || '',
      image: coverAbs,
      // A Person with the profile's @id when the post names its lecturers —
      // the same entity the share bridge and the profile page describe. This
      // used to credit the Organization while the bridge credited a Person,
      // and a crawler that saw both had two conflicting answers.
      author: (post.authors || []).length
        ? post.authors.map(a => ({
            '@type': 'Person',
            '@id': `${window.location.origin}/people/${a.slug}#person`,
            name: a.name_th || a.display_name_th,
            ...(a.name_en ? { alternateName: a.name_en } : {}),
            url: `${window.location.origin}/people/${a.slug}`,
          }))
        : { '@type': 'Organization', name: 'SWU Marketing Research' },
      publisher: {
        '@type': 'Organization',
        name: 'SWU Marketing Research',
        logo: { '@type': 'ImageObject', url: SWU_LOGO_URL },
      },
      datePublished: post.published_at,
      dateModified: post.updated_at,
      mainEntityOfPage: url,
    },
  } : { title: 'Article · SWU MKT' });

  if (notFound) return <Navigate to="/learn" replace/>;
  if (loading || !post) {
    return (
      <div data-testid="cms-article-loading">
        <Topbar active="learn"/>
        <div className="swu-container" style={{ padding: '120px 32px', textAlign: 'center' }}>
          <p className="meta" style={{ color: 'var(--ink-3)' }}>กำลังโหลดบทความ...</p>
        </div>
        <Footer/>
      </div>
    );
  }

  return (
    <div data-testid={`cms-article-${slug}`}>
      <Topbar active="learn"/>

      {/* Breadcrumb */}
      <div className="swu-container" style={{ padding: '24px 32px 0' }}>
        <div className="meta">
          <Link to="/" style={{ color: 'inherit' }}>HOME</Link>
          {' / '}
          <Link to="/learn" style={{ color: 'inherit' }}>LEARN</Link>
          {' / '}
          <span style={{ color: 'var(--be-red)' }}>{post.category || 'INSIGHTS'}</span>
        </div>
      </div>

      {/* Article header */}
      <section className="swu-container" style={{ padding: '40px 32px 56px', maxWidth: 920 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
                      alignItems: 'center' }}>
          <Eyebrow red>● {post.category || 'INSIGHTS'}</Eyebrow>
          <span className="meta">{post.read_min || 5} MIN READ</span>
          {post.published_at && (
            <span className="meta">PUBLISHED {String(post.published_at).slice(0, 10)}</span>
          )}
          <button
            type="button"
            onClick={() => {
              const u = `${window.location.origin}/api/share/learn/${post.slug}`;
              copyToClipboard(u, { successMessage: 'คัดลอกลิงก์บทความ พร้อม social preview แล้ว' });
            }}
            data-testid="cms-article-share-top"
            className="meta"
            style={{
              marginLeft: 'auto', background: 'transparent', border: '1px solid var(--ink)',
              borderRadius: 999, padding: '6px 14px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink)',
            }}
            title="Copy share link with social preview"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            SHARE
          </button>
        </div>
        <h1 className="h-article" style={{ fontSize: 'clamp(38px, 5.5vw, 60px)' }}>
          {post.title}
        </h1>
        {post.title_en && (
          <p style={{ fontFamily: 'var(--mono)', fontSize: 14, fontStyle: 'italic',
                      color: 'var(--ink-3)', margin: '24px 0 0' }}>
            {post.title_en}
          </p>
        )}
        {post.excerpt && (
          <p className="lede" style={{ fontSize: 19, marginTop: 28, color: 'var(--ink-2)' }}>
            {post.excerpt}
          </p>
        )}
        {(post.authors || []).length > 0 && (
          // The byline links to each lecturer's profile: the link a reader
          // follows to find more of their work, and the link a crawler
          // follows to attribute this article to a named person.
          <p data-testid="article-byline"
             style={{ margin: '22px 0 0', fontSize: 15, color: 'var(--ink-2)' }}>
            โดย{' '}
            {post.authors.map((a, i) => (
              <React.Fragment key={a.slug}>
                {i > 0 && (i === post.authors.length - 1 ? ' และ ' : ', ')}
                <FacultyLink person={a} />
              </React.Fragment>
            ))}
          </p>
        )}
      </section>

      {/* Cover image */}
      {post.cover_image && (
        <div className="swu-container" style={{ padding: '0 32px 56px' }}>
          <figure style={{ margin: 0 }}>
            <img src={post.cover_image} alt={post.title}
                 style={{ width: '100%', maxHeight: 540, objectFit: 'cover',
                          borderRadius: 16, border: '1px solid var(--ink)' }}/>
            {post.cover_caption && (
              <figcaption style={{ fontFamily: 'var(--mono)', fontSize: 11,
                                   color: 'var(--ink-3)', marginTop: 12, textTransform: 'uppercase',
                                   letterSpacing: '0.14em' }}>
                {post.cover_caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}

      {/* Media gallery — multi-image + YouTube embeds */}
      {(post.media || []).length > 0 && (
        <section className="swu-container" data-testid="cms-article-media"
                 style={{ padding: '0 32px 56px', maxWidth: 920 }}>
          <div className="meta" style={{ marginBottom: 16, color: 'var(--ink-3)' }}>
            ● MEDIA ({(post.media || []).length})
          </div>
          <div style={{ display: 'grid', gap: 24,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {(post.media || []).map((m, i) => {
              if (m.kind === 'youtube') {
                const id = youtubeId(m.src);
                if (!id) return null;
                return (
                  <figure key={i} data-testid={`cms-media-yt-${i}`}
                          style={{ margin: 0, gridColumn: 'span 2', minWidth: 0 }}>
                    <div style={{ position: 'relative', paddingTop: '56.25%',
                                  borderRadius: 12, overflow: 'hidden',
                                  border: '1px solid var(--ink)' }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${id}`}
                        title={m.alt || `YouTube video ${i + 1}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                                 border: 0 }}/>
                    </div>
                    {m.caption && (
                      <figcaption style={{ fontFamily: 'var(--mono)', fontSize: 11,
                                           color: 'var(--ink-3)', marginTop: 10,
                                           textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                        ▶ {m.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              }
              if (!m.src) return null;
              return (
                <figure key={i} data-testid={`cms-media-img-${i}`} style={{ margin: 0, minWidth: 0 }}>
                  <img src={m.src} alt={m.alt || `รูปประกอบ ${i + 1}`}
                       loading="lazy"
                       style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover',
                                borderRadius: 12, border: '1px solid var(--ink)',
                                display: 'block' }}/>
                  {m.caption && (
                    <figcaption style={{ fontFamily: 'var(--mono)', fontSize: 11,
                                         color: 'var(--ink-3)', marginTop: 10,
                                         textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                      {m.caption}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {/* Body */}
      <section className="swu-container" style={{ padding: '0 32px 96px', maxWidth: 760 }}>
        <article className="cms-article-body" data-testid="cms-article-body">
          <ReactMarkdown
            components={{
              h1: ({ node, ...p }) => (
                <h1 className="serif" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)',
                                                  letterSpacing: '-0.015em', lineHeight: 1.15,
                                                  margin: '48px 0 24px' }} {...p}/>
              ),
              h2: ({ node, ...p }) => (
                <h2 className="serif" style={{ fontSize: 'clamp(24px, 2.6vw, 32px)',
                                                  letterSpacing: '-0.01em', lineHeight: 1.18,
                                                  margin: '40px 0 18px' }} {...p}/>
              ),
              h3: ({ node, ...p }) => (
                <h3 className="serif" style={{ fontSize: 'clamp(20px, 2vw, 24px)',
                                                  margin: '32px 0 14px', fontWeight: 600 }} {...p}/>
              ),
              p: ({ node, ...p }) => (
                <p style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink)', margin: '0 0 24px' }} {...p}/>
              ),
              ul: ({ node, ...p }) => (
                <ul style={{ paddingLeft: 24, margin: '0 0 24px' }} {...p}/>
              ),
              ol: ({ node, ...p }) => (
                <ol style={{ paddingLeft: 24, margin: '0 0 24px' }} {...p}/>
              ),
              li: ({ node, ...p }) => (
                <li style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink)', marginBottom: 10 }} {...p}/>
              ),
              blockquote: ({ node, ...p }) => (
                <blockquote style={{ borderLeft: '4px solid var(--be-red)',
                                       padding: '12px 24px', margin: '32px 0',
                                       background: 'rgba(229,57,53,0.04)', fontStyle: 'italic',
                                       fontSize: 18, lineHeight: 1.7, color: 'var(--ink)' }} {...p}/>
              ),
              a: ({ node, ...p }) => (
                <a {...p} style={{ color: 'var(--be-red)', borderBottom: '1px solid var(--be-red)' }}/>
              ),
              strong: ({ node, ...p }) => (
                <strong style={{ fontWeight: 600, color: 'var(--ink)' }} {...p}/>
              ),
              code: ({ node, ...p }) => (
                <code style={{ background: '#f3f3f1', padding: '2px 6px', borderRadius: 4,
                                fontSize: 14, fontFamily: 'var(--mono)' }} {...p}/>
              ),
              hr: () => (
                <hr style={{ border: 'none', borderTop: '1px solid var(--ink-3)',
                              margin: '40px 0' }}/>
              ),
            }}
          >
            {post.body_md || ''}
          </ReactMarkdown>
        </article>
      </section>

      {/* Tags */}
      {(post.tags || []).length > 0 && (
        <section className="swu-container" style={{ padding: '0 32px 64px', maxWidth: 760 }}>
          <div className="meta" style={{ marginBottom: 12 }}>● TAGS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(post.tags || []).map(t => (
              <span key={t} className="chip" style={{ fontSize: 12 }}>{t}</span>
            ))}
          </div>
        </section>
      )}

      {/* Share + Back to Learn */}
      <section className="swu-container" style={{ padding: '0 32px 96px', maxWidth: 760,
                                                   display: 'flex', flexWrap: 'wrap',
                                                   gap: 16, alignItems: 'center',
                                                   justifyContent: 'space-between' }}>
        {/* Copy-link already existed; these are the one-tap routes. On a phone,
            copy-then-paste into LINE is where most sharing is abandoned. */}
        <ShareBar kind="learn" idOrSlug={post.slug} title={post.title} compact />
        <Link to="/learn" className="btn-pill btn-pill--ghost" data-testid="cms-article-back">
          ← All Articles
        </Link>
        <button
          type="button"
          onClick={() => {
            const u = `${window.location.origin}/api/share/learn/${post.slug}`;
            copyToClipboard(u, { successMessage: 'คัดลอกลิงก์บทความ พร้อม social preview แล้ว' });
          }}
          data-testid="cms-article-share-bottom"
          className="btn-pill btn-pill--blue"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                   border: 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          แชร์บทความนี้ →
        </button>
      </section>

      <Footer/>
    </div>
  );
};

export default CmsArticleView;

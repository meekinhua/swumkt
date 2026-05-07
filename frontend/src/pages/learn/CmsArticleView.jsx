import React, { useState, useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Topbar, Footer, Eyebrow } from '@/pages/swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';

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

  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta(post ? {
    title: `${post.title} · SWU MKT`,
    description: post.excerpt || '',
    image: post.cover_image || SWU_LOGO_URL,
    url, type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt || '',
      image: post.cover_image || SWU_LOGO_URL,
      author: { '@type': 'Organization', name: 'SWU Marketing Research' },
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
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <Eyebrow red>● {post.category || 'INSIGHTS'}</Eyebrow>
          <span className="meta">{post.read_min || 5} MIN READ</span>
          {post.published_at && (
            <span className="meta">PUBLISHED {String(post.published_at).slice(0, 10)}</span>
          )}
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

      {/* Back to Learn */}
      <section className="swu-container" style={{ padding: '0 32px 96px', maxWidth: 760 }}>
        <Link to="/learn" className="btn-pill btn-pill--ghost" data-testid="cms-article-back">
          ← All Articles
        </Link>
      </section>

      <Footer/>
    </div>
  );
};

export default CmsArticleView;

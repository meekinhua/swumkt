import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Topbar, Footer, Eyebrow } from '@/pages/swumkt/SwumktComponents';
import { ARTICLE_LIST } from './learnContent';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LearnIndexPage = () => {
  const [cmsArticles, setCmsArticles] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/cms/posts/public?type=article`);
        if (!alive) return;
        // Map CMS post → Learn Index card shape
        const mapped = (r.data?.items || []).map(p => ({
          slug: p.slug,
          title: p.title,
          titleEn: p.title_en || '',
          category: p.category || 'Insights',
          readMin: p.read_min || 5,
          description: p.excerpt || '',
          image: p.cover_image,
          isCms: true,
        }));
        setCmsArticles(mapped);
      } catch (e) { /* silent — fallback to hardcoded only */ }
    })();
    return () => { alive = false; };
  }, []);

  // Merge: CMS posts first (newest), then hardcoded
  const merged = [...cmsArticles, ...ARTICLE_LIST];
  const [featured, ...rest] = merged;

  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'Marketing Knowledge Hub · เรียนการตลาด · SWU MKT',
    description: 'รวมบทความการตลาดเชิงลึก — Brand Equity, Conjoint Analysis, Customer Journey, Positioning, STP, 4Ps และอื่นๆ จากสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ พร้อมเครื่องมือวิจัยตลาดฟรี',
    image: SWU_LOGO_URL,
    url, type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Marketing Knowledge Hub · SWU MKT',
      url,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: merged.length,
        itemListElement: merged.map((a, i) => ({
          '@type': 'ListItem', position: i + 1,
          url: `${typeof window !== 'undefined' ? window.location.origin : ''}/learn/${a.slug}`,
          name: a.title,
        })),
      },
    },
  });

  return (
    <div data-testid="learn-index">
      <Topbar active="learn" />

      <section style={{ borderBottom: '1px solid var(--ink)', padding: '72px 0 64px' }}>
        <div className="swu-container">
          <Eyebrow red>● Knowledge Hub · {merged.length} Articles</Eyebrow>
          <h1 className="h-display" style={{ marginTop: 24, maxWidth: '14ch' }}>
            อ่านเทรนด์<br/><span className="italic-accent">ก่อนคนอื่น</span>.
          </h1>
          <p className="lede" style={{ fontSize: 19, marginTop: 32, maxWidth: '60ch' }}>
            บทความวิชาการที่เรียบเรียงให้อ่านง่าย — เชื่อมทฤษฎีคลาสสิกกับเครื่องมือวิจัยจริงในแพลตฟอร์ม
            เพื่อให้นักศึกษา SME และนักการตลาดเห็นจังหวะของผู้บริโภค ก่อนที่ตลาดจะส่งสัญญาณ
          </p>
        </div>
      </section>

      {/* Featured article — full width */}
      {featured && (
        <section className="swu-container" style={{ padding: '56px 32px 0' }}>
          <Link to={`/learn/${featured.slug}`} className="ed-card"
                data-testid={`learn-featured-${featured.slug}`}
                style={{ borderTop: '1px solid var(--ink)', padding: '28px 0 36px',
                         textDecoration: 'none', color: 'inherit' }}>
            <div className="hero-grid"
                 style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 64,
                          alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="ed-card__meta" style={{ fontSize: 11 }}>
                  <span className="ed-card__cat">● FEATURED · {featured.category}</span>
                  <span className="ed-card__time">{featured.readMin} MIN READ</span>
                </div>
                <h2 className="serif" style={{ fontSize: 'clamp(32px, 3.5vw, 46px)', lineHeight: 1.08,
                                                 letterSpacing: '-0.015em', margin: 0 }}>
                  {featured.title}
                </h2>
                {featured.titleEn && (
                  <p style={{ fontFamily: 'var(--mono)', fontSize: 12, fontStyle: 'italic',
                              color: 'var(--ink-3)', margin: 0 }}>
                    {featured.titleEn}
                  </p>
                )}
                <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--ink-2)',
                            margin: 0, maxWidth: '52ch' }}>
                  {featured.description}
                </p>
                <span className="link-arrow link-arrow--red">Read Article →</span>
              </div>
              {featured.image ? (
                <img src={featured.image} alt={featured.title}
                     style={{ width: '100%', height: 300, objectFit: 'cover',
                              borderRadius: 12, border: '1px solid var(--ink)' }}/>
              ) : (
                <div className="imgph" style={{ height: 300 }}>
                  {featured.category} · DIAGRAM
                </div>
              )}
            </div>
          </Link>
        </section>
      )}

      {/* Article grid */}
      <section className="swu-container" style={{ padding: '40px 32px 0' }}>
        <div className="article-grid"
             style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 40 }}>
          {rest.map((a) => (
            <Link key={a.slug} to={`/learn/${a.slug}`} className="ed-card"
                  data-testid={`learn-card-${a.slug}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}>
              {a.image && (
                <img src={a.image} alt={a.title}
                     style={{ width: '100%', height: 180, objectFit: 'cover',
                              borderRadius: 8, marginBottom: 16, border: '1px solid var(--ink-2)' }}/>
              )}
              <div className="ed-card__meta">
                <span className="ed-card__cat">{a.category}</span>
                <span className="ed-card__time">{a.readMin} MIN</span>
              </div>
              <h3 className="ed-card__title">{a.title}</h3>
              <p className="ed-card__excerpt">{a.description}</p>
              <span className="ed-card__cta">Read Article →</span>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default LearnIndexPage;

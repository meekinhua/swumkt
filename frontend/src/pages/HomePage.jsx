import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Topbar, Footer, Eyebrow, BrandLogo, ScoreRing, gradientForBrand
} from './swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from './brand-equity/be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Hardcoded fallback used when /cms/landing fails or hasn't loaded yet
const FALLBACK_TOOLS = [
  { tag: 'BRAND', t: 'Brand Health Check', s: 'วัด Brand Equity ตามกรอบ Aaker', p: '/brand-equity' },
  { tag: 'RESEARCH', t: 'Conjoint Analysis', s: 'Choice-Based Conjoint + D-Optimal', p: '/market-research/conjoint-analysis' },
  { tag: 'LEARN', t: 'Content Hub', s: 'ฐานความรู้การตลาด', p: '/learn' },
];

// Hardcoded fallback used when /cms/landing fails or hasn't loaded yet
const FALLBACK_HEADLINES = [
  {
    eyebrow: 'Consumer Foresight Lab · SWU MKT',
    heroPre: ['เห็นในสิ่งที่ตลาด', 'ยังมองไม่เห็น'],
    heroAccentIdx: 1,
    lede: 'แพลตฟอร์มวิจัยตลาดของสาขาการตลาด มศว.',
    mantra: ['วิจัย', 'เห็นก่อน', 'ชนะก่อน'],
    mantraAccentIdx: 1,
    image: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?crop=entropy&cs=srgb&fm=jpg&q=85&w=900',
    imageAlt: 'Bangkok night street',
    imageCaption: '● BANGKOK PULSE · LIVE',
  },
];

const HomePage = () => {
  const [showcases, setShowcases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [headIdx, setHeadIdx] = useState(0);
  const [landing, setLanding] = useState(null);
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [showcaseRes, landingRes, articlesRes] = await Promise.all([
          axios.get(`${API}/brand-equity/showcase`),
          axios.get(`${API}/cms/landing`),
          axios.get(`${API}/cms/posts/public?type=article&limit=12`),
        ]);
        if (!alive) return;
        setShowcases(showcaseRes.data?.showcases || []);
        setLanding(landingRes.data || null);
        setArticles(articlesRes.data?.items || []);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Use API-driven headlines if available, else hardcoded fallback
  const HEADLINES = (landing?.slides && landing.slides.length > 0) ? landing.slides : FALLBACK_HEADLINES;
  const TOOLS_LIVE = (landing?.tools && landing.tools.length > 0) ? landing.tools : FALLBACK_TOOLS;
  const KH = landing?.knowledge_hub || {
    eyebrow: '● Knowledge Hub', heading: 'อ่านเทรนด์', accent: 'ก่อนคนอื่น',
    lede: '', cta_label: 'อ่านทั้งหมด →', cta_path: '/learn',
  };
  const AB = landing?.about_band || {
    eyebrow: 'About SWU MKT', lede: '',
    cta_label: 'อ่านเรื่องเรา →', cta_path: '/about/swu-marketing',
  };
  const ROTATION_MS = landing?.rotation_ms || 5500;

  // Auto-rotate hero copy
  useEffect(() => {
    const id = setInterval(() => {
      setHeadIdx((i) => (i + 1) % HEADLINES.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [HEADLINES.length, ROTATION_MS]);

  // Preload all rotation images so transitions don't flash blank
  useEffect(() => {
    HEADLINES.forEach((h) => { if (h?.image) { const i = new Image(); i.src = h.image; } });
  }, [landing]);

  const head = HEADLINES[headIdx] || HEADLINES[0];

  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'การตลาด มศว · SWU MKT — อ่านใจผู้บริโภคก่อนใคร · เครื่องมือวิจัยตลาดฟรี',
    description: 'แพลตฟอร์ม Consumer Insight & Foresight ของสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — Brand Equity, Conjoint Analysis, Customer Journey และ AI-driven research ที่ช่วยให้คุณเห็นเทรนด์และความต้องการของลูกค้าก่อนคู่แข่ง',
    image: SWU_LOGO_URL,
    url,
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SWU MKT · Marketing Research Platform',
      alternateName: 'การตลาด มศว',
      url,
      publisher: { '@type': 'Organization', name: 'Srinakharinwirot University — Department of Marketing' },
    },
  });

  const totalRespondents = showcases.reduce((s, x) => s + (x.response_count || 0), 0);
  const readyCount = showcases.filter(x => x.ready_for_dashboard).length;

  // Pick the most-respondents brand as featured, then 4 side brands
  const sorted = [...showcases].sort((a, b) => (b.response_count || 0) - (a.response_count || 0));
  const featured = sorted[0];
  const sideBrands = sorted.slice(1, 5);
  const featuredArticles = articles.slice(0, 4).map(a => ({
    slug: a.slug,
    title: a.title,
    titleEn: a.title_en || '',
    category: a.category || 'Insights',
    readMin: a.read_min || 5,
    description: a.excerpt || '',
  }));

  // Editorial photographs (Knowledge Hub banner)
  const KNOWLEDGE_IMG = 'https://images.unsplash.com/photo-1719726793997-5f520d89f695?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200';

  return (
    <div data-testid="home-page" style={{ background: '#FFFFFF' }}>
      <Topbar active="home" />

      {/* HERO — bento layout with type left, portrait right */}
      <section style={{ background: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
        {/* Soft dots background */}
        <div className="bg-dots-soft" aria-hidden
             style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}/>
        <div className="swu-container" style={{ padding: '56px 32px 88px', position: 'relative' }}>
          <div className="fade-up fade-up-1" style={{ marginBottom: 24 }}>
            <Eyebrow red dot pulse>
              <span key={`eb-${headIdx}`} className="rotate-in" data-testid="hero-eyebrow">
                {head.eyebrow}
              </span>
            </Eyebrow>
          </div>
          <div className="hero-grid"
               style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.9fr)',
                        gap: 56, alignItems: 'stretch' }}>

            {/* Left — typography */}
            <div className="fade-up fade-up-2">
              <h1 className="h-display rotator-shell"
                  data-testid="hero-h1"
                  style={{ fontSize: 'clamp(48px, 7vw, 96px)', minHeight: '3.4em' }}>
                <span key={`h-${headIdx}`} className="rotate-in rotate-stack">
                  {head.heroPre.map((line, i) => (
                    <React.Fragment key={i}>
                      {i === head.heroAccentIdx ? (
                        <span className="italic-accent">{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                      {i < head.heroPre.length - 1 && <br/>}
                    </React.Fragment>
                  ))}
                  <span>.</span>
                </span>
              </h1>
              <p key={`l-${headIdx}`} className="lede rotate-in-slow"
                 data-testid="hero-lede"
                 style={{ marginTop: 32, maxWidth: '46ch', minHeight: '5.2em' }}>
                {head.lede}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
                <Link to="/showcase" className="btn-pill btn-pill--blue" data-testid="hero-showcase-btn">
                  ดูผลงานทั้งหมด <span>→</span>
                </Link>
                <Link to="/register" className="btn-pill btn-pill--ghost" data-testid="hero-register-btn">
                  เริ่มอ่านใจตลาดฟรี
                </Link>
              </div>
              {/* Rotation dots */}
              <div data-testid="hero-rotation-dots"
                   style={{ display: 'flex', gap: 8, marginTop: 24, alignItems: 'center' }}>
                {HEADLINES.map((_, i) => (
                  <button key={i}
                          onClick={() => setHeadIdx(i)}
                          aria-label={`Headline ${i + 1}`}
                          data-testid={`hero-dot-${i}`}
                          style={{
                            width: i === headIdx ? 28 : 8, height: 8,
                            borderRadius: 999,
                            border: 'none', cursor: 'pointer',
                            background: i === headIdx ? 'var(--logo-blue)' : 'rgba(26,26,26,0.18)',
                            transition: 'all .3s ease', padding: 0,
                          }}/>
                ))}
                <span className="meta" style={{ marginLeft: 8, fontSize: 10 }}>
                  {String(headIdx + 1).padStart(2, '0')} / {String(HEADLINES.length).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Right — Photo + featured brand bento */}
            <div className="fade-up fade-up-3"
                 style={{ display: 'grid', gridTemplateRows: '0.9fr 1.1fr', gap: 16,
                          minHeight: 480 }}>
              {/* Photo cell — rotates sync'd with headline */}
              <div className="img-frame rotator-shell"
                   data-testid="hero-image-cell"
                   style={{ background: '#fff', position: 'relative', overflow: 'hidden' }}>
                <img key={`img-${headIdx}`} src={head.image} alt={head.imageAlt}
                     className="rotate-in-slow"
                     style={{ filter: 'saturate(1.08) contrast(1.04)',
                              width: '100%', height: '100%', objectFit: 'cover',
                              position: 'absolute', inset: 0 }}/>
                <div key={`cap-${headIdx}`} className="rotate-in"
                     style={{ position: 'absolute', bottom: 12, left: 12,
                              padding: '6px 10px', background: 'rgba(255,255,255,0.92)',
                              borderRadius: 999, fontFamily: 'var(--mono)',
                              fontSize: 10, letterSpacing: '0.14em',
                              textTransform: 'uppercase', color: 'var(--ink)',
                              zIndex: 2 }}>
                  {head.imageCaption}
                </div>
              </div>

              {/* Featured brand cell */}
              {loading ? (
                <div className="card-modern" style={{ display: 'flex',
                                                       alignItems: 'center', justifyContent: 'center' }}>
                  <span className="meta">Loading…</span>
                </div>
              ) : featured ? (
                <Link to={`/showcase/${featured.share_token}`}
                      data-testid="hero-featured-brand"
                      className="card-modern"
                      style={{ textDecoration: 'none', color: 'inherit',
                               padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span className="corner-accent"/>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chip chip--red">● FEATURED</span>
                    <span className="meta">N = {featured.response_count || 0}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <BrandLogo brand={{ name: featured.brand_name, logo_url: featured.logo_url }}
                               identity={{ visual_assets: featured.logo_asset ? [featured.logo_asset] : [] }}
                               size="lg" gradient={gradientForBrand(featured.id)}/>
                    <div style={{ minWidth: 0 }}>
                      <div className="serif" style={{ fontSize: 22, lineHeight: 1.1,
                                                        letterSpacing: '-0.01em',
                                                        whiteSpace: 'nowrap', overflow: 'hidden',
                                                        textOverflow: 'ellipsis' }}>
                        {featured.brand_name}
                      </div>
                      <div className="meta" style={{ marginTop: 4 }}>
                        {featured.category || 'general'}
                      </div>
                    </div>
                  </div>
                  {sideBrands.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap',
                                  borderTop: '1px solid rgba(26,26,26,0.08)', paddingTop: 12 }}>
                      {sideBrands.slice(0, 4).map((b) => (
                        <span key={b.id} className="chip chip--gray"
                              style={{ fontSize: 9, padding: '3px 8px' }}>
                          {b.brand_name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginTop: 'auto' }}>
                    <span className="meta" style={{ color: 'var(--logo-blue)' }}>
                      ● {featured.ready_for_dashboard ? 'PUBLIC' : 'AWAITING DATA'}
                    </span>
                    <span className="link-arrow link-arrow--red">View Report →</span>
                  </div>
                </Link>
              ) : (
                <div className="card-modern" style={{ textAlign: 'center', padding: 40 }}>
                  <span className="meta">No public showcases yet</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="hero-grad-rule"></div>
      </section>
      <section className="swu-container" style={{ padding: '0 32px' }}>
        <div className="stat-strip">
          <div className="stat-strip__item">
            <span className="stat-strip__num">{showcases.length}</span>
            <span className="stat-strip__label">Brands Studied</span>
          </div>
          <div className="stat-strip__item">
            <span className="stat-strip__num">{totalRespondents.toLocaleString()}</span>
            <span className="stat-strip__label">Respondents</span>
          </div>
          <div className="stat-strip__item">
            <span className="stat-strip__num">{articles.length}</span>
            <span className="stat-strip__label">Articles Published</span>
          </div>
        </div>
      </section>

      {/* TOOLS BENTO — modern rounded cards on paper bg */}
      <section style={{ background: 'var(--paper)', padding: '88px 0' }}>
        <div className="swu-container" style={{ padding: '0 32px' }}>
          <div className="hero-grid"
               style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
                        gap: 56, marginBottom: 40, alignItems: 'end' }}>
            <div>
              <Eyebrow red>● Open Tools</Eyebrow>
              <h2 className="h-section" style={{ marginTop: 14 }}>เครื่องมืออ่านใจ<br/>ผู้บริโภค</h2>
            </div>
            <p className="lede" style={{ fontSize: 17 }}>
              แปดเครื่องมือมาตรฐานวิชาการ ออกแบบโดยอาจารย์และนักวิจัยจากสาขาการตลาด มศว. — ช่วยให้ SME นักศึกษา และนักการตลาดเห็นในสิ่งที่ตลาดยังไม่เห็น โดยไม่มีค่าใช้จ่าย
            </p>
          </div>

          <div data-testid="home-tools-bento"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {TOOLS_LIVE.map((tool, i) => (
              <Link key={`${tool.t}-${i}`} to={tool.p} className={`card-modern fade-up fade-up-${(i % 4) + 1}`}
                    data-testid={`home-tool-${(tool.t || '').replace(/\s+/g, '-').toLowerCase()}`}
                    style={{ textDecoration: 'none', color: 'inherit',
                             display: 'flex', flexDirection: 'column', gap: 10, minHeight: 180 }}>
                <span className="corner-accent"/>
                <span className="chip">{tool.tag}</span>
                <h3 className="serif" style={{ fontSize: 22, lineHeight: 1.18,
                                                 letterSpacing: '-0.01em', margin: '6px 0 0' }}>
                  {tool.t}
                </h3>
                <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5,
                            margin: 0, fontFamily: 'var(--sans)' }}>
                  {tool.s}
                </p>
                <span className="meta" style={{ marginTop: 'auto', color: 'var(--logo-blue)' }}>
                  Open Tool →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* KNOWLEDGE HUB — with banner image */}
      <section style={{ background: '#FFFFFF', padding: '96px 0' }}>
        <div className="swu-container" style={{ padding: '0 32px' }}>
          <div className="hero-grid"
               style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
                        gap: 56, alignItems: 'center', marginBottom: 56 }}>
            <div>
              <Eyebrow red>{KH.eyebrow || '● Knowledge Hub'}</Eyebrow>
              <h2 className="h-section" style={{ marginTop: 14, fontSize: 'clamp(40px, 5vw, 68px)' }}>
                {KH.heading}{KH.accent && <><br/><span className="italic-accent">{KH.accent}</span></>}.
              </h2>
              <p className="lede" style={{ fontSize: 17, marginTop: 22, maxWidth: '50ch' }}>
                {KH.lede}
              </p>
              <Link to={KH.cta_path || '/learn'} className="btn-pill btn-pill--dark"
                    data-testid="home-learn-all"
                    style={{ marginTop: 24 }}>
                {KH.cta_label || 'อ่านทั้งหมด →'}
              </Link>
            </div>
            <div className="img-frame" style={{ height: 360 }}>
              <img src={KNOWLEDGE_IMG} alt="Marketing knowledge hub"/>
            </div>
          </div>

          <div data-testid="home-articles-grid"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
            {featuredArticles.map((a, i) => (
              <Link key={a.slug} to={`/learn/${a.slug}`}
                    className={`card-modern fade-up fade-up-${(i % 4) + 1}`}
                    data-testid={`home-article-${a.slug}`}
                    style={{ textDecoration: 'none', color: 'inherit',
                             display: 'flex', flexDirection: 'column', gap: 10, padding: 22 }}>
                <span className="corner-accent"/>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center' }}>
                  <span className="chip">{a.category}</span>
                  <span className="meta">{a.readMin} MIN</span>
                </div>
                <h3 className="serif" style={{ fontSize: 19, lineHeight: 1.18,
                                                 letterSpacing: '-0.01em', margin: '4px 0 0' }}>
                  {a.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5,
                            margin: 0, fontFamily: 'var(--sans)' }}>
                  {a.description.slice(0, 110)}…
                </p>
                <span className="meta" style={{ marginTop: 'auto', color: 'var(--logo-blue)' }}>
                  Read Article →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DARK ABOUT BAND */}
      <section style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '88px 0' }}
               data-testid="home-about-band">
        <div className="swu-container">
          <div className="hero-grid"
               style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64,
                        alignItems: 'start' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--paper)' }}>
                <span className="dot"></span>{AB.eyebrow || 'About SWU MKT'}
              </span>
              <h2 key={`mantra-${headIdx}`} className="serif rotate-in"
                  data-testid="home-mantra"
                  style={{ fontSize: 'clamp(40px, 5vw, 64px)', lineHeight: 1.05,
                           letterSpacing: '-0.02em', marginTop: 18, color: '#fff',
                           minHeight: '1.2em' }}>
                {head.mantra.map((w, i) => (
                  <React.Fragment key={i}>
                    {i === head.mantraAccentIdx ? (
                      <span className="italic-accent">{w}</span>
                    ) : (
                      <span>{w}</span>
                    )}
                    {i < head.mantra.length - 1 && <span style={{ color: 'var(--be-red)', margin: '0 0.35em' }}>·</span>}
                  </React.Fragment>
                ))}
                <span>.</span>
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 28 }}>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: '#c9c5bd', maxWidth: '52ch' }}>
                {AB.lede}
              </p>
              <Link to={AB.cta_path || '/about/swu-marketing'} className="btn btn--red"
                    data-testid="home-about-link"
                    style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                {AB.cta_label || 'อ่านเรื่องเรา →'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HomePage;

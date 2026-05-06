import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Topbar, Footer, Eyebrow, BrandLogo, ScoreRing, gradientForBrand
} from './swumkt/SwumktComponents';
import { ARTICLE_LIST } from './learn/learnContent';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from './brand-equity/be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TOOLS = [
  { tag: 'BRAND', t: 'Brand Health Check', s: 'วัด Brand Equity ตามกรอบของ Aaker — Awareness · Quality · Identity · Loyalty พร้อมรายงานสาธารณะ', p: '/brand-equity' },
  { tag: 'RESEARCH', t: 'Conjoint Analysis', s: 'Choice-Based Conjoint + D-Optimal design และ market simulator สำหรับวัดความสำคัญของ attribute', p: '/market-research/conjoint-analysis' },
  { tag: 'CX', t: 'Customer Journey', s: 'แผนที่ touchpoint และ pain point ทุกขั้นของการตัดสินใจ', p: '/market-research' },
  { tag: 'PSYCH', t: 'Customer Perception', s: 'Perceptual Map + Sentiment AI วิเคราะห์ภาพในใจของผู้บริโภค', p: '/market-research' },
  { tag: 'PSYCH', t: 'Customer Behavior', s: 'EBM Decision-process analytics ระดับขั้น search · evaluate · purchase · post', p: '/market-research' },
  { tag: 'TOOL', t: 'Survey Builder', s: 'ออกแบบแบบสอบถาม AI-assisted พร้อม validation และ logic skip', p: '/market-research' },
  { tag: 'LEARN', t: 'Content Hub', s: 'ฐานความรู้การตลาดฉบับวิชาการ ที่อ่านง่ายและเชื่อมไปยังเครื่องมือจริง', p: '/learn' },
  { tag: 'WORKFLOW', t: 'Kanban Projects', s: 'จัดการงานวิจัยเป็นทีม — board, sprint, และ research log', p: '/projects' },
];

const HomePage = () => {
  const [showcases, setShowcases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/brand-equity/showcase`);
        if (alive) setShowcases(r.data?.showcases || []);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'การตลาด มศว · SWU MKT — เครื่องมือวิจัยตลาด & Brand Strategy ฟรี',
    description: 'แพลตฟอร์มวิจัยตลาดเปิดของสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — Brand Equity, Conjoint Analysis, Customer Journey, AI insights พร้อมบทความเชิงลึก ฟรีทั้งหมด',
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
  const featuredArticles = ARTICLE_LIST.slice(0, 4);

  // Editorial photographs (curated for a Thai university research platform)
  const HERO_IMG = 'https://images.unsplash.com/photo-1556560984-36a7ec2ba544?crop=entropy&cs=srgb&fm=jpg&q=85&w=900';
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
            <Eyebrow red dot pulse>Public Showcase · Live Brand Research from SWU MKT</Eyebrow>
          </div>
          <div className="hero-grid"
               style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.9fr)',
                        gap: 56, alignItems: 'stretch' }}>

            {/* Left — typography */}
            <div className="fade-up fade-up-2">
              <h1 className="h-display" style={{ fontSize: 'clamp(54px, 7.5vw, 104px)' }}>
                งานวิจัย<br/>แบรนด์ที่<br/><span className="italic-accent">เปิดเผย</span>.
              </h1>
              <p className="lede" style={{ marginTop: 32, maxWidth: '46ch' }}>
                แพลตฟอร์มวิจัยตลาดเปิดของสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ —
                เผยแพร่งานวิจัย Brand Health จริง พร้อมเครื่องมือฟรีและความรู้ที่ทุกคนอ่านได้
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
                <Link to="/showcase" className="btn-pill btn-pill--blue" data-testid="hero-showcase-btn">
                  ดูผลงานทั้งหมด <span>→</span>
                </Link>
                <Link to="/register" className="btn-pill btn-pill--ghost" data-testid="hero-register-btn">
                  เริ่มสร้างวิจัยฟรี
                </Link>
              </div>
            </div>

            {/* Right — Photo + featured brand bento */}
            <div className="fade-up fade-up-3"
                 style={{ display: 'grid', gridTemplateRows: '0.9fr 1.1fr', gap: 16,
                          minHeight: 480 }}>
              {/* Photo cell */}
              <div className="img-frame"
                   style={{ background: '#fff', position: 'relative' }}>
                <img src={HERO_IMG} alt="Modern Thai marketing student"
                     style={{ filter: 'saturate(1.1) contrast(1.04)' }}/>
                <div style={{ position: 'absolute', bottom: 12, left: 12,
                              padding: '6px 10px', background: 'rgba(255,255,255,0.92)',
                              borderRadius: 999, fontFamily: 'var(--mono)',
                              fontSize: 10, letterSpacing: '0.14em',
                              textTransform: 'uppercase', color: 'var(--ink)' }}>
                  ● Field Research · 2026
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
            <span className="stat-strip__num">{ARTICLE_LIST.length}</span>
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
              <h2 className="h-section" style={{ marginTop: 14 }}>เครื่องมือวิจัยตลาด<br/>ที่ใช้ได้ฟรี</h2>
            </div>
            <p className="lede" style={{ fontSize: 17 }}>
              แปดเครื่องมือที่ออกแบบโดยอาจารย์และนักวิจัยจากสาขาการตลาด มศว. — เปิดให้นักศึกษา SME และนักการตลาดทุกคนใช้งานได้โดยไม่มีค่าใช้จ่าย
            </p>
          </div>

          <div data-testid="home-tools-bento"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {TOOLS.map((tool, i) => (
              <Link key={tool.t} to={tool.p} className={`card-modern fade-up fade-up-${(i % 4) + 1}`}
                    data-testid={`home-tool-${tool.t.replace(/\s+/g, '-').toLowerCase()}`}
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
              <Eyebrow red>● Knowledge Hub</Eyebrow>
              <h2 className="h-section" style={{ marginTop: 14, fontSize: 'clamp(40px, 5vw, 68px)' }}>
                เรียนการตลาด<br/><span className="italic-accent">ฉบับ มศว.</span>
              </h2>
              <p className="lede" style={{ fontSize: 17, marginTop: 22, maxWidth: '50ch' }}>
                บทความวิชาการเขียนโดย SWU Marketing Research Team — เน้นเชื่อมทฤษฎีคลาสสิก
                (Aaker · Kotler · Trout & Ries) กับเครื่องมือจริงในแพลตฟอร์ม
              </p>
              <Link to="/learn" className="btn-pill btn-pill--dark"
                    data-testid="home-learn-all"
                    style={{ marginTop: 24 }}>
                อ่านทั้งหมด →
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
                <span className="dot"></span>About SWU MKT
              </span>
              <h2 className="serif" style={{ fontSize: 'clamp(40px, 5vw, 64px)', lineHeight: 1.05,
                                                letterSpacing: '-0.02em', marginTop: 18, color: '#fff' }}>
                วิจัย · ปฏิบัติ · <span className="italic-accent">เปิดเผย</span>.
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 28 }}>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: '#c9c5bd', maxWidth: '52ch' }}>
                สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ ก่อตั้งปี 1974 — ผลิตงานวิจัยและบุคลากรการตลาดในประเทศไทย
                เปิดแพลตฟอร์มนี้เพื่อให้การวิจัยตลาดเป็นของทุกคน
              </p>
              <Link to="/about/swu-marketing" className="btn btn--red"
                    data-testid="home-about-link"
                    style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                อ่านเรื่องเรา →
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

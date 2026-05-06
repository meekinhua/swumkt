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

  return (
    <div data-testid="home-page">
      <Topbar active="home" />

      {/* HERO — Asymmetric: text + featured brand panel */}
      <section style={{ borderBottom: '1px solid var(--ink)', background: 'var(--paper)' }}>
        <div className="swu-container" style={{ padding: '64px 32px 80px' }}>
          <div style={{ marginBottom: 28 }}>
            <Eyebrow red dot pulse>Public Showcase · Live Brand Research from SWU MKT</Eyebrow>
          </div>
          <div className="hero-grid"
               style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
                        gap: 64, alignItems: 'start' }}>
            <div>
              <h1 className="h-display">
                งานวิจัย<br/>แบรนด์ที่<br/><span className="italic-accent">เปิดเผย</span>.
              </h1>
              <p className="lede" style={{ marginTop: 36, maxWidth: '46ch' }}>
                แพลตฟอร์มวิจัยตลาดเปิดของสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — เผยแพร่งานวิจัย Brand Health
                จริง พร้อมเครื่องมือฟรีและความรู้ที่ทุกคนอ่านได้
              </p>
              <div style={{ display: 'flex', gap: 14, marginTop: 36, flexWrap: 'wrap' }}>
                <Link to="/showcase" className="btn" data-testid="hero-showcase-btn">
                  ดูผลงานทั้งหมด <span>→</span>
                </Link>
                <Link to="/register" className="btn btn--ghost" data-testid="hero-register-btn">
                  เริ่มสร้างวิจัยฟรี
                </Link>
              </div>
            </div>

            {/* Right side — featured brand + grid (uses real API data) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1,
                          background: 'var(--ink)', border: '1px solid var(--ink)' }}>
              {loading ? (
                <div style={{ background: 'var(--paper)', padding: 40, textAlign: 'center' }}
                     className="meta">Loading…</div>
              ) : featured ? (
                <>
                  {/* Featured brand */}
                  <Link to={`/showcase/${featured.share_token}`}
                        data-testid="hero-featured-brand"
                        style={{ background: 'var(--paper)', padding: 24,
                                 display: 'flex', flexDirection: 'column', gap: 14,
                                 textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="meta" style={{ color: 'var(--be-red)' }}>● FEATURED</span>
                      <span className="meta">N = {featured.response_count || 0}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <BrandLogo brand={{ name: featured.brand_name, logo_url: featured.logo_url }}
                                 identity={{ visual_assets: featured.logo_asset ? [featured.logo_asset] : [] }}
                                 size="lg" gradient={gradientForBrand(featured.id)}/>
                      <div style={{ minWidth: 0 }}>
                        <div className="serif" style={{ fontSize: 26, lineHeight: 1.1,
                                                          letterSpacing: '-0.01em',
                                                          whiteSpace: 'nowrap', overflow: 'hidden',
                                                          textOverflow: 'ellipsis' }}>
                          {featured.brand_name}
                        </div>
                        <div className="meta" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
                          {featured.category || 'general'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  alignItems: 'center', borderTop: '1px solid var(--rule)',
                                  paddingTop: 14, marginTop: 4 }}>
                      <span className="meta">
                        {featured.ready_for_dashboard ? '● PUBLIC' : '○ AWAITING DATA'}
                      </span>
                      <span className="link-arrow link-arrow--red">View Report →</span>
                    </div>
                  </Link>

                  {/* Mini grid */}
                  {sideBrands.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                                  gap: 1, background: 'var(--ink)' }}>
                      {sideBrands.map((b) => (
                        <Link key={b.id} to={`/showcase/${b.share_token}`}
                              data-testid={`hero-side-brand-${b.id}`}
                              style={{ background: 'var(--paper)', padding: 16,
                                       display: 'flex', flexDirection: 'column', gap: 10,
                                       textDecoration: 'none', color: 'inherit',
                                       transition: 'background 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#fff'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper)'; }}>
                          <BrandLogo brand={{ name: b.brand_name, logo_url: b.logo_url }}
                                     identity={{ visual_assets: b.logo_asset ? [b.logo_asset] : [] }}
                                     gradient={gradientForBrand(b.id)}/>
                          <div style={{ minWidth: 0 }}>
                            <div className="serif" style={{ fontSize: 16, lineHeight: 1.15,
                                                              whiteSpace: 'nowrap',
                                                              overflow: 'hidden',
                                                              textOverflow: 'ellipsis' }}>
                              {b.brand_name}
                            </div>
                            <div className="meta" style={{ color: 'var(--ink-3)',
                                                            marginTop: 4, fontSize: 9 }}>
                              {b.category || 'general'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginTop: 'auto' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9,
                                            letterSpacing: '0.14em',
                                            color: b.ready_for_dashboard ? 'var(--be-green)' : 'var(--be-red)' }}>
                              ● {b.ready_for_dashboard ? 'PUBLIC' : 'COLLECTING'}
                            </span>
                            <span className="meta" style={{ fontSize: 9 }}>n={b.response_count || 0}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background: 'var(--paper)', padding: 40, textAlign: 'center' }}
                     className="meta">No public showcases yet</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
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

      {/* TOOLS BENTO */}
      <section className="swu-container" style={{ padding: '80px 32px 0' }}>
        <div className="hero-grid"
             style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
                      gap: 56, marginBottom: 32, alignItems: 'end' }}>
          <div>
            <Eyebrow red>● Open Tools</Eyebrow>
            <h2 className="h-section" style={{ marginTop: 14 }}>เครื่องมือวิจัยตลาด<br/>ที่ใช้ได้ฟรี</h2>
          </div>
          <p className="lede" style={{ fontSize: 16 }}>
            แปดเครื่องมือที่ออกแบบโดยอาจารย์และนักวิจัยจากสาขาการตลาด มศว. — เปิดให้นักศึกษา SME และนักการตลาดทุกคนใช้งานได้โดยไม่มีค่าใช้จ่าย
          </p>
        </div>

        <div className="bento" data-testid="home-tools-bento">
          {TOOLS.map((tool) => (
            <Link key={tool.t} to={tool.p} className="bento__cell"
                  data-testid={`home-tool-${tool.t.replace(/\s+/g, '-').toLowerCase()}`}>
              <span className="tag">{tool.tag}</span>
              <h3>{tool.t}</h3>
              <p>{tool.s}</p>
              <span className="open">Open Tool →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* KNOWLEDGE HUB */}
      <section className="swu-container" style={{ padding: '96px 32px 0' }}>
        <div className="rule rule--strong" style={{ marginBottom: 56 }}></div>
        <div className="hero-grid"
             style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64,
                      alignItems: 'start', marginBottom: 56 }}>
          <div>
            <Eyebrow red>● Knowledge Hub</Eyebrow>
            <h2 className="h-section" style={{ marginTop: 14, fontSize: 'clamp(36px, 4.5vw, 56px)' }}>
              เรียนการตลาด<br/><span className="italic-accent">ฉบับ มศว.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'end' }}>
            <p className="lede" style={{ fontSize: 16 }}>
              บทความวิชาการที่ผ่านการเรียบเรียงให้อ่านง่าย เน้นเชื่อมทฤษฎีกับเครื่องมือจริงในแพลตฟอร์ม —
              เขียนโดย SWU Marketing Research Team
            </p>
            <Link to="/learn" className="link-arrow" data-testid="home-learn-all">อ่านทั้งหมด →</Link>
          </div>
        </div>

        <div className="article-grid"
             style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 32 }}>
          {featuredArticles.map((a) => (
            <Link key={a.slug} to={`/learn/${a.slug}`} className="ed-card"
                  data-testid={`home-article-${a.slug}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}>
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

      {/* DARK ABOUT BAND */}
      <section style={{ background: 'var(--ink)', color: 'var(--paper)',
                        marginTop: 96, padding: '88px 0' }}
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

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Icon, BrandLogo, SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import { ARTICLE_LIST } from '@/pages/learn/learnContent';
import useDocumentMeta from '@/hooks/useDocumentMeta';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TOOLS = [
  { p: '/brand-equity', t: 'Brand Health Check', s: 'วัด Brand Equity ตาม Aaker · 4 มิติ', tag: 'BRAND', ready: true },
  { p: '/market-research/conjoint-analysis', t: 'Conjoint Analysis', s: 'CBC + D-Optimal + Market Simulator', tag: 'RESEARCH', ready: true },
  { p: '/market-research', t: 'Customer Journey', s: 'Map touchpoints และ pain points', tag: 'CX', ready: true },
  { p: '/market-research', t: 'Customer Perception', s: 'Perceptual Map + Sentiment AI', tag: 'PSYCH', ready: true },
  { p: '/market-research', t: 'Customer Behavior', s: 'Decision-process analytics', tag: 'PSYCH', ready: true },
  { p: '/market-research', t: 'Survey Builder', s: 'AI-assisted survey design', tag: 'TOOL', ready: true },
  { p: '/content', t: 'Content Hub', s: 'Knowledge base for marketing', tag: 'LEARN', ready: true },
  { p: '/projects', t: 'Kanban Projects', s: 'จัดการงานวิจัยเป็นทีม', tag: 'WORKFLOW', ready: true },
];

const LOGO_GRADIENTS = [
  'linear-gradient(140deg,#0E5538,#10B981)',
  'linear-gradient(140deg,#1E3A8A,#3B82F6)',
  'linear-gradient(140deg,#7C3AED,#C084FC)',
  'linear-gradient(140deg,#0F766E,#14B8A6)',
  'linear-gradient(140deg,#DC2626,#F87171)',
];

const HomePage = () => {
  const navigate = useNavigate();
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
    description: 'แพลตฟอร์มวิจัยตลาดเปิดสาธารณะจากสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — Brand Equity, Conjoint Analysis, Customer Journey, AI insights พร้อมบทความเชิงลึก ฟรีทั้งหมด',
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

  const featured = showcases.slice(0, 6);
  const featuredArticles = ARTICLE_LIST.slice(0, 4);

  return (
    <div className="be-root" data-testid="home-page" style={{ background: 'var(--paper)' }}>
      {/* Topbar */}
      <div className="be-public-topbar" style={{ position: 'sticky', top: 0, zIndex: 50,
                                                   background: 'var(--paper)' }}>
        <div className="be-public-brand">
          <img src={SWU_LOGO_URL} alt="SWU MKT" className="be-public-logo"/>
          <span className="be-public-text">
            <span className="be-public-name">SWU · Marketing Research</span>
            <span className="be-public-sub be-mono">การตลาด มศว · OPEN PLATFORM</span>
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/showcase" className="be-mono be-tiny"
                style={{ color: 'var(--ink)', textDecoration: 'none', letterSpacing: '0.10em' }}
                data-testid="home-nav-showcase">SHOWCASE</Link>
          <Link to="/learn" className="be-mono be-tiny"
                style={{ color: 'var(--ink)', textDecoration: 'none', letterSpacing: '0.10em' }}
                data-testid="home-nav-learn">LEARN</Link>
          <Link to="/about/swu-marketing" className="be-mono be-tiny"
                style={{ color: 'var(--ink)', textDecoration: 'none', letterSpacing: '0.10em' }}
                data-testid="home-nav-about">ABOUT</Link>
          <button onClick={() => navigate('/login')}
                  data-testid="home-nav-login"
                  style={{ background: 'var(--ink)', color: '#fff', border: 'none',
                           padding: '6px 14px', fontFamily: 'IBM Plex Mono', fontSize: 11,
                           letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Sign in
          </button>
        </nav>
      </div>

      {/* HERO — Showcase as centerpiece */}
      <section className="be-page" style={{ paddingTop: 28, paddingBottom: 24 }}
               data-testid="home-hero">
        <div className="be-eyebrow" style={{ marginBottom: 20 }}>
          <span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>
          PUBLIC SHOWCASE · LIVE BRAND RESEARCH FROM SWU MKT
        </div>
        <h1 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                     fontSize: 'clamp(46px, 8vw, 96px)', lineHeight: 0.98,
                     fontWeight: 500, color: 'var(--ink)', marginBottom: 26,
                     letterSpacing: '-0.02em' }}>
          งานวิจัย<br/>แบรนด์ที่<br/><em style={{ fontStyle: 'italic', color: 'var(--be-red)' }}>เปิดเผย</em>.
        </h1>
        <p style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 'clamp(17px, 2vw, 21px)',
                    lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 720,
                    marginBottom: 32 }}>
          ผลงานวิจัย Brand Health Check, Conjoint Analysis และ Consumer Insights
          จากทีมวิจัยสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — เปิดให้ทุกคนเข้าถึงฟรี
          เพื่อยกระดับมาตรฐานวิจัยตลาดของไทย
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 56 }}>
          <Link to="/showcase"
                data-testid="hero-showcase-btn"
                style={{ background: 'var(--ink)', color: '#fff', padding: '14px 28px',
                         textDecoration: 'none', fontFamily: 'IBM Plex Mono', fontSize: 13,
                         letterSpacing: '0.12em', textTransform: 'uppercase',
                         display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            ดูผลงานทั้งหมด <Icon name="arrowR" size={12}/>
          </Link>
          <Link to="/register"
                data-testid="hero-register-btn"
                style={{ background: 'transparent', color: 'var(--ink)',
                         border: '1px solid var(--ink)',
                         padding: '14px 28px', textDecoration: 'none',
                         fontFamily: 'IBM Plex Mono', fontSize: 13,
                         letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            เริ่มสร้างวิจัยฟรี
          </Link>
        </div>

        {/* Live brand grid */}
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.14em',
                                                            marginBottom: 14 }}>
          FEATURED · {showcases.length} BRAND{showcases.length === 1 ? '' : 'S'} ON DISPLAY
        </div>
        {loading ? (
          <div style={{ padding: 40, border: '1px solid var(--rule)', textAlign: 'center' }}
               className="be-muted">Loading…</div>
        ) : featured.length === 0 ? (
          <div style={{ padding: 40, border: '1px dashed var(--rule)', textAlign: 'center' }}
               className="be-muted be-small">
            ยังไม่มี showcase สาธารณะ — เจ้าของ study ต้องเปิดเผยใน dashboard
          </div>
        ) : (
          <div style={{ display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: 1, background: 'var(--rule-strong)',
                        border: '1px solid var(--rule-strong)' }}
               data-testid="home-showcase-grid">
            {featured.map((s, i) => (
              <Link key={s.id} to={`/showcase/${s.share_token}`}
                    data-testid={`home-brand-${s.id}`}
                    style={{ background: 'var(--paper)', padding: 24,
                             textDecoration: 'none', color: 'inherit',
                             transition: 'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper)'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                              marginBottom: 14 }}>
                  <BrandLogo
                    brand={{ name: s.brand_name, logo_url: s.logo_url }}
                    identity={{ visual_assets: s.logo_asset ? [s.logo_asset] : [] }}
                    size={44}
                    gradient={LOGO_GRADIENTS[i % LOGO_GRADIENTS.length]}/>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                                  fontSize: 19, fontWeight: 500,
                                  whiteSpace: 'nowrap', overflow: 'hidden',
                                  textOverflow: 'ellipsis' }}>
                      {s.brand_name}
                    </div>
                    <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.08em' }}>
                      {(s.category || 'general').toUpperCase()}
                    </div>
                  </div>
                </div>
                <div className="be-mono be-tiny" style={{ letterSpacing: '0.10em',
                                                            color: s.ready_for_dashboard
                                                              ? 'var(--be-green)' : 'var(--ink-3)' }}>
                  {s.ready_for_dashboard ? '● PUBLIC' : '○ AWAITING DATA'}
                  <span style={{ marginLeft: 12, color: 'var(--ink-3)' }}>n={s.response_count || 0}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {showcases.length > 6 && (
          <div style={{ marginTop: 18 }}>
            <Link to="/showcase" className="be-mono be-tiny"
                  style={{ color: 'var(--be-red)', textDecoration: 'none',
                           letterSpacing: '0.10em' }}>
              VIEW ALL {showcases.length} SHOWCASES →
            </Link>
          </div>
        )}
      </section>

      {/* TOOLS BENTO GRID */}
      <section className="be-page" style={{ paddingTop: 60, paddingBottom: 48,
                                              borderTop: '1px solid var(--ink)' }}
               data-testid="home-tools">
        <div className="be-eyebrow" style={{ marginBottom: 14 }}>
          <span className="be-dot-sm" style={{ background: 'var(--ink)' }}/>
          PLATFORM TOOLS · เครื่องมือทั้งหมด
        </div>
        <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                     fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1,
                     fontWeight: 500, marginBottom: 36 }}>
          เครื่องมือวิจัยตลาด ครบทุกขั้น
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 1, background: 'var(--rule-strong)',
                      border: '1px solid var(--rule-strong)' }}>
          {TOOLS.map((t) => (
            <Link key={t.p + t.t} to={t.p}
                  data-testid={`home-tool-${t.t.replace(/\s+/g, '-').toLowerCase()}`}
                  style={{ background: 'var(--paper)', padding: 26,
                           textDecoration: 'none', color: 'inherit',
                           minHeight: 180, display: 'flex',
                           flexDirection: 'column', justifyContent: 'space-between',
                           transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper)'; }}>
              <div>
                <div className="be-mono be-tiny" style={{ color: 'var(--be-red)',
                                                            letterSpacing: '0.14em' }}>
                  {t.tag}
                </div>
                <h3 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                             fontSize: 22, fontWeight: 500, lineHeight: 1.2,
                             margin: '10px 0', color: 'var(--ink)' }}>
                  {t.t}
                </h3>
                <p className="be-muted" style={{ fontSize: 14, lineHeight: 1.5,
                                                   fontFamily: 'IBM Plex Sans Thai' }}>
                  {t.s}
                </p>
              </div>
              <span className="be-mono be-tiny" style={{ letterSpacing: '0.10em',
                                                          color: 'var(--ink)' }}>
                OPEN →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* KNOWLEDGE HUB TEASERS */}
      <section className="be-page" style={{ paddingTop: 60, paddingBottom: 48,
                                              borderTop: '1px solid var(--ink)' }}
               data-testid="home-knowledge">
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-end', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="be-eyebrow" style={{ marginBottom: 14 }}>
              <span className="be-dot-sm" style={{ background: 'var(--ink)' }}/>
              KNOWLEDGE HUB · บทความล่าสุด
            </div>
            <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                         fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1,
                         fontWeight: 500, marginBottom: 0 }}>
              เรียนการตลาด ฉบับ มศว.
            </h2>
          </div>
          <Link to="/learn" className="be-mono be-tiny"
                data-testid="home-learn-all"
                style={{ color: 'var(--be-red)', textDecoration: 'none',
                         letterSpacing: '0.12em' }}>
            ALL ARTICLES →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 28 }}>
          {featuredArticles.map((a) => (
            <Link key={a.slug} to={`/learn/${a.slug}`}
                  data-testid={`home-article-${a.slug}`}
                  style={{ textDecoration: 'none', color: 'inherit',
                           borderTop: '1px solid var(--ink)', paddingTop: 16,
                           display: 'block' }}>
              <div className="be-mono be-tiny" style={{ color: 'var(--be-red)',
                                                          letterSpacing: '0.14em' }}>
                {a.category} · {a.readMin} MIN
              </div>
              <h3 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                           fontSize: 22, fontWeight: 500, lineHeight: 1.2,
                           margin: '10px 0' }}>
                {a.title}
              </h3>
              <p className="be-muted" style={{ fontSize: 14, lineHeight: 1.5,
                                                 fontFamily: 'IBM Plex Sans Thai',
                                                 marginBottom: 12 }}>
                {a.description.slice(0, 130)}…
              </p>
              <span className="be-mono be-tiny" style={{ color: 'var(--ink)',
                                                          letterSpacing: '0.10em' }}>
                READ →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ABOUT BAND */}
      <section style={{ background: 'var(--ink)', color: '#fff', padding: '64px 0' }}
               data-testid="home-about-band">
        <div className="be-page" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="be-mono be-tiny" style={{ letterSpacing: '0.18em',
                                                       opacity: 0.7, marginBottom: 14 }}>
            ABOUT · เราคือใคร
          </div>
          <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                       fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.1,
                       fontWeight: 500, marginBottom: 22, maxWidth: 820,
                       color: '#fff' }}>
            สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ
          </h2>
          <p style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 18, lineHeight: 1.6,
                      opacity: 0.85, maxWidth: 720, marginBottom: 28 }}>
            เราเชื่อว่าการวิจัยตลาดที่ดีไม่ควรถูกจำกัดอยู่ในห้องเรียนหรือบริษัทใหญ่
            แพลตฟอร์มนี้พัฒนาโดยทีมวิจัยสาขาการตลาด มศว. — methodology ผ่าน peer-review,
            เครื่องมือเปิดให้ใช้ฟรี, และผลวิจัยทุกชิ้นเปิดเผยต่อสาธารณะหากเจ้าของยินยอม
          </p>
          <Link to="/about/swu-marketing"
                data-testid="home-about-link"
                style={{ background: 'var(--be-red)', color: '#fff',
                         padding: '14px 28px', textDecoration: 'none',
                         fontFamily: 'IBM Plex Mono', fontSize: 13,
                         letterSpacing: '0.12em', textTransform: 'uppercase',
                         display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            อ่านเรื่องเรา <Icon name="arrowR" size={12}/>
          </Link>
        </div>
      </section>

      {/* FOOTER — sitemap-style for SEO crawlability */}
      <footer style={{ borderTop: '1px solid var(--rule)', padding: '40px 0 24px' }}>
        <div className="be-page" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div style={{ display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 32, marginBottom: 32 }}>
            <div>
              <div className="be-mono be-tiny" style={{ letterSpacing: '0.14em',
                                                          marginBottom: 12,
                                                          color: 'var(--ink)' }}>
                EXPLORE
              </div>
              <FooterLink to="/showcase">Public Showcase</FooterLink>
              <FooterLink to="/learn">Knowledge Hub</FooterLink>
              <FooterLink to="/about/swu-marketing">About SWU Marketing</FooterLink>
            </div>
            <div>
              <div className="be-mono be-tiny" style={{ letterSpacing: '0.14em',
                                                          marginBottom: 12,
                                                          color: 'var(--ink)' }}>
                TOOLS
              </div>
              <FooterLink to="/brand-equity">Brand Health Check</FooterLink>
              <FooterLink to="/market-research/conjoint-analysis">Conjoint Analysis</FooterLink>
              <FooterLink to="/market-research">Customer Journey</FooterLink>
              <FooterLink to="/projects">Projects (Kanban)</FooterLink>
            </div>
            <div>
              <div className="be-mono be-tiny" style={{ letterSpacing: '0.14em',
                                                          marginBottom: 12,
                                                          color: 'var(--ink)' }}>
                LEARN
              </div>
              {ARTICLE_LIST.slice(0, 6).map(a => (
                <FooterLink key={a.slug} to={`/learn/${a.slug}`}>{a.titleEn || a.title.split('·')[0]}</FooterLink>
              ))}
            </div>
            <div>
              <div className="be-mono be-tiny" style={{ letterSpacing: '0.14em',
                                                          marginBottom: 12,
                                                          color: 'var(--ink)' }}>
                ACCOUNT
              </div>
              <FooterLink to="/login">Sign in</FooterLink>
              <FooterLink to="/register">Create account</FooterLink>
            </div>
          </div>
          <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.10em',
                                                                paddingTop: 18,
                                                                borderTop: '1px solid var(--rule)' }}>
            © {new Date().getFullYear()} · SWU MARKETING RESEARCH · OPEN PLATFORM ·
            DEPARTMENT OF MARKETING, SRINAKHARINWIROT UNIVERSITY
          </div>
        </div>
      </footer>
    </div>
  );
};

const FooterLink = ({ to, children }) => (
  <div style={{ marginBottom: 6 }}>
    <Link to={to} style={{ color: 'var(--ink-2)', textDecoration: 'none',
                            fontFamily: 'IBM Plex Sans Thai', fontSize: 14 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--be-red)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-2)'; }}>
      {children}
    </Link>
  </div>
);

export default HomePage;

import React from 'react';
import { Link } from 'react-router-dom';
import { ARTICLE_LIST } from './learnContent';
import { Icon, SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import useDocumentMeta from '@/hooks/useDocumentMeta';

const LearnIndexPage = () => {
  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'Marketing Knowledge Hub · เรียนการตลาด · SWU MKT',
    description: 'รวมบทความการตลาดเชิงลึก — Brand Equity, Conjoint Analysis, Customer Journey, Positioning, STP, 4Ps และอื่นๆ จากสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ พร้อมเครื่องมือวิจัยตลาดฟรี',
    image: SWU_LOGO_URL,
    url,
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Marketing Knowledge Hub · SWU MKT',
      description: 'Marketing research articles from Srinakharinwirot University Marketing department.',
      url,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: ARTICLE_LIST.length,
        itemListElement: ARTICLE_LIST.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${typeof window !== 'undefined' ? window.location.origin : ''}/learn/${a.slug}`,
          name: a.title,
        })),
      },
    },
  });

  return (
    <div className="be-root" data-testid="learn-index">
      <div className="be-public-topbar">
        <Link to="/" className="be-public-brand" style={{ textDecoration: 'none' }}>
          <img src={SWU_LOGO_URL} alt="SWU MKT" className="be-public-logo"/>
          <span className="be-public-text">
            <span className="be-public-name">SWU · Marketing Research</span>
            <span className="be-public-sub be-mono">KNOWLEDGE HUB</span>
          </span>
        </Link>
        <Link to="/" className="be-mono be-tiny"
              style={{ padding: '6px 12px', border: '1px solid var(--rule-strong)',
                       textTransform: 'uppercase', letterSpacing: '0.10em',
                       color: 'var(--ink)', textDecoration: 'none' }}>
          ← Home
        </Link>
      </div>

      <div className="be-page">
        <header style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 32, marginBottom: 40 }}>
          <div className="be-eyebrow" style={{ marginBottom: 14 }}>
            <span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>
            KNOWLEDGE HUB · MARKETING THEORY × PRACTICE
          </div>
          <h1 className="be-h1" style={{ fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 1.05, marginBottom: 18 }}>
            เรียนการตลาด<br/>กับสาขา MKT มศว.
          </h1>
          <p className="be-muted" style={{ fontSize: 18, maxWidth: 760, lineHeight: 1.6,
                                            fontFamily: 'IBM Plex Sans Thai' }}>
            บทความเชิงลึกเกี่ยวกับการวิจัยตลาด พฤติกรรมผู้บริโภค Brand Strategy
            และ Marketing Frameworks เขียนโดยทีมวิจัยสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ —
            ทุกบทความเชื่อมต่อกับเครื่องมือวิจัยฟรีของแพลตฟอร์ม
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 32 }}>
          {ARTICLE_LIST.map((a) => (
            <Link key={a.slug} to={`/learn/${a.slug}`}
                  data-testid={`learn-card-${a.slug}`}
                  style={{ textDecoration: 'none', color: 'inherit',
                           borderTop: '1px solid var(--ink)',
                           paddingTop: 18, display: 'block',
                           transition: 'transform 0.2s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}>
              <div className="be-mono be-tiny" style={{ letterSpacing: '0.14em',
                                                          color: 'var(--be-red)' }}>
                {a.category} · {a.readMin} MIN READ
              </div>
              <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                           fontSize: 26, fontWeight: 500, lineHeight: 1.2,
                           margin: '12px 0', color: 'var(--ink)' }}>
                {a.title}
              </h2>
              <p className="be-muted" style={{ fontSize: 14, lineHeight: 1.5,
                                                 fontFamily: 'IBM Plex Sans Thai',
                                                 marginBottom: 14 }}>
                {a.description.slice(0, 140)}…
              </p>
              <div className="be-mono be-tiny be-muted" style={{ display: 'flex',
                                                                   alignItems: 'center',
                                                                   gap: 8, letterSpacing: '0.08em' }}>
                READ ARTICLE <Icon name="arrowR" size={10}/>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 64, paddingTop: 24, borderTop: '1px solid var(--rule)',
                      display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.10em' }}>
            POWERED BY SWU MARKETING RESEARCH
          </span>
          <Link to="/about/swu-marketing" className="be-mono be-tiny"
                style={{ color: 'var(--ink-2)', textDecoration: 'none', letterSpacing: '0.10em' }}>
            ABOUT SWU MARKETING →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LearnIndexPage;

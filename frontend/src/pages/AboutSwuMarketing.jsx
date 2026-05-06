import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import useDocumentMeta from '@/hooks/useDocumentMeta';

const CAMPUS_IMG = 'https://images.pexels.com/photos/19193975/pexels-photo-19193975.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

const AboutSwuMarketing = () => {
  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'สาขาการตลาด มศว · SWU Marketing Department · มหาวิทยาลัยศรีนครินทรวิโรฒ',
    description: 'สาขาวิชาการตลาด คณะบริหารธุรกิจเพื่อสังคม มหาวิทยาลัยศรีนครินทรวิโรฒ — ศูนย์รวมงานวิจัยตลาด พฤติกรรมผู้บริโภค Brand Strategy และเครื่องมือ AI-driven Marketing Research ฟรีสำหรับนักวิจัย นักศึกษา และนักการตลาดทั่วไทย',
    image: CAMPUS_IMG,
    url,
    type: 'profile',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'Srinakharinwirot University — Department of Marketing',
      alternateName: 'สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ',
      url,
      logo: SWU_LOGO_URL,
      address: { '@type': 'PostalAddress', addressLocality: 'Bangkok', addressCountry: 'TH' },
      department: {
        '@type': 'CollegeOrUniversity',
        name: 'School of Business Innovation for Society',
        alternateName: 'คณะบริหารธุรกิจเพื่อสังคม',
      },
    },
  });

  return (
    <div className="be-root" data-testid="about-swu-marketing">
      <div className="be-public-topbar">
        <Link to="/" className="be-public-brand" style={{ textDecoration: 'none' }}>
          <img src={SWU_LOGO_URL} alt="SWU MKT" className="be-public-logo"/>
          <span className="be-public-text">
            <span className="be-public-name">SWU · Marketing Research</span>
            <span className="be-public-sub be-mono">ABOUT THE DEPARTMENT</span>
          </span>
        </Link>
        <Link to="/" className="be-mono be-tiny"
              style={{ padding: '6px 12px', border: '1px solid var(--rule-strong)',
                       letterSpacing: '0.10em', color: 'var(--ink)', textDecoration: 'none' }}>
          ← Home
        </Link>
      </div>

      <div className="be-page" style={{ maxWidth: 1180 }}>
        <nav className="be-mono be-tiny be-muted" style={{ marginBottom: 24, letterSpacing: '0.12em' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>HOME</Link>
          {' / ABOUT / '}
          <span style={{ color: 'var(--be-red)' }}>SWU MARKETING</span>
        </nav>

        <header style={{ borderBottom: '1px solid var(--ink)', paddingBottom: 32, marginBottom: 40 }}>
          <div className="be-eyebrow" style={{ marginBottom: 14 }}>
            <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>
            ABOUT · เกี่ยวกับสาขาวิชา
          </div>
          <h1 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif',
                       fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 1.05,
                       fontWeight: 500, color: 'var(--ink)', marginBottom: 16 }}>
            การตลาด มศว.<br/>วิจัย · ปฏิบัติ · เปิดเผย
          </h1>
          <p style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 19, lineHeight: 1.6,
                      color: 'var(--ink-2)', maxWidth: 760 }}>
            สาขาวิชาการตลาด คณะบริหารธุรกิจเพื่อสังคม มหาวิทยาลัยศรีนครินทรวิโรฒ —
            ผู้ผลิตงานวิจัยตลาดเชิงประยุกต์ และผู้พัฒนาเครื่องมือ AI-driven Marketing Research
            ที่เปิดให้ประชาชนทั่วไปใช้ฟรี เพื่อยกระดับมาตรฐานวิจัยตลาดในประเทศไทย
          </p>
        </header>

        <img src={CAMPUS_IMG} alt="SWU Campus"
             style={{ width: '100%', maxHeight: 420, objectFit: 'cover',
                      filter: 'grayscale(20%) contrast(108%)', marginBottom: 48 }}/>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 32, marginBottom: 56, borderTop: '1px solid var(--ink)', paddingTop: 32 }}>
          <div>
            <div className="be-mono be-tiny" style={{ color: 'var(--be-red)', letterSpacing: '0.14em',
                                                        marginBottom: 10 }}>
              ESTABLISHED
            </div>
            <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 24,
                         fontWeight: 500, marginBottom: 10 }}>1974</h2>
            <p className="be-muted" style={{ fontSize: 15, lineHeight: 1.6,
                                               fontFamily: 'IBM Plex Sans Thai' }}>
              สาขาวิชาการตลาดก่อตั้งภายใต้คณะบริหารธุรกิจเพื่อสังคม
              บนหลักปรัชญา "การศึกษาเพื่อพัฒนาสังคม"
            </p>
          </div>
          <div>
            <div className="be-mono be-tiny" style={{ color: 'var(--be-red)', letterSpacing: '0.14em',
                                                        marginBottom: 10 }}>
              FOCUS AREAS
            </div>
            <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 24,
                         fontWeight: 500, marginBottom: 10 }}>5 streams</h2>
            <p className="be-muted" style={{ fontSize: 15, lineHeight: 1.6,
                                               fontFamily: 'IBM Plex Sans Thai' }}>
              Brand Strategy · Consumer Behavior · Digital Marketing · Marketing Analytics ·
              Sustainable Marketing
            </p>
          </div>
          <div>
            <div className="be-mono be-tiny" style={{ color: 'var(--be-red)', letterSpacing: '0.14em',
                                                        marginBottom: 10 }}>
              RESEARCH OUTPUT
            </div>
            <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 24,
                         fontWeight: 500, marginBottom: 10 }}>Open Platform</h2>
            <p className="be-muted" style={{ fontSize: 15, lineHeight: 1.6,
                                               fontFamily: 'IBM Plex Sans Thai' }}>
              เปิดให้ใช้เครื่องมือ Brand Health Check, Conjoint Analysis, Customer Journey
              ฟรีสำหรับนักวิจัย นักศึกษา และผู้ประกอบการไทย
            </p>
          </div>
        </div>

        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 36,
                       fontWeight: 500, marginBottom: 20 }}>
            พันธกิจ · Mission
          </h2>
          <p style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 17, lineHeight: 1.75,
                      color: 'var(--ink-2)', maxWidth: 780, marginBottom: 18 }}>
            เราเชื่อว่าการวิจัยตลาดที่ดีไม่ควรถูกจำกัดอยู่ในห้องเรียนหรือบริษัทใหญ่
            สาขาการตลาด มศว จึงพัฒนาแพลตฟอร์มงานวิจัยที่ <strong>เปิดเผย โปร่งใส และฟรี</strong>
            สำหรับทุกคนที่สนใจ — ไม่ว่าจะเป็นนักศึกษา SME หรือ NGO
          </p>
          <p style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 17, lineHeight: 1.75,
                      color: 'var(--ink-2)', maxWidth: 780 }}>
            ทุกเครื่องมือผ่านการตรวจสอบโดยอาจารย์ในสาขาก่อนเผยแพร่
            ใช้ methodology ที่ตีพิมพ์ในวารสาร peer-reviewed
            และเชื่อมโยงทฤษฎีคลาสสิก (Aaker, Kotler, Trout & Ries) กับเทคนิคทันสมัย
            (LLM-driven analysis, Hierarchical Bayes Conjoint, NLP sentiment)
          </p>
        </section>

        <section style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '48px 36px',
                          marginBottom: 48, marginLeft: 'calc(50% - 50vw)',
                          marginRight: 'calc(50% - 50vw)', paddingLeft: 'max(36px, calc(50vw - 540px))',
                          paddingRight: 'max(36px, calc(50vw - 540px))' }}>
          <div className="be-mono be-tiny" style={{ letterSpacing: '0.18em', opacity: 0.7,
                                                       marginBottom: 14 }}>
            EXPLORE THE PLATFORM
          </div>
          <h2 style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 36,
                       fontWeight: 500, lineHeight: 1.15, marginBottom: 28 }}>
            เริ่มต้นใช้เครื่องมือวิจัยตลาดของเรา
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 24 }}>
            {[
              { p: '/showcase', t: 'Public Showcase', d: 'ดูผลวิจัยแบรนด์จริงที่ทีมเปิดเผย' },
              { p: '/brand-equity', t: 'Brand Health', d: 'วัด Brand Equity ตาม Aaker' },
              { p: '/market-research/conjoint-analysis', t: 'Conjoint', d: 'CBC + Market Simulator' },
              { p: '/learn', t: 'Knowledge Hub', d: 'อ่านบทความเชิงลึก' },
            ].map((c) => (
              <Link key={c.p} to={c.p}
                    data-testid={`about-tool-link-${c.p.replace(/\//g, '-')}`}
                    style={{ borderTop: '1px solid #fff', paddingTop: 14,
                             color: '#fff', textDecoration: 'none' }}>
                <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 22,
                              fontWeight: 500, marginBottom: 6 }}>
                  {c.t}
                </div>
                <div style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 14,
                              opacity: 0.75, marginBottom: 14 }}>
                  {c.d}
                </div>
                <span className="be-mono" style={{ fontSize: 11, letterSpacing: '0.12em',
                                                     color: 'var(--be-red)' }}>
                  OPEN →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AboutSwuMarketing;

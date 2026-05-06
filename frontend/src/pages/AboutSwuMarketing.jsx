import React from 'react';
import { Link } from 'react-router-dom';
import { Topbar, Footer, Eyebrow } from './swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from './brand-equity/be-components';

const CAMPUS_IMG = 'https://images.pexels.com/photos/19193975/pexels-photo-19193975.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

const TOOLS = [
  { tag: 'BRAND', t: 'Brand Health Check', p: '/brand-equity' },
  { tag: 'RESEARCH', t: 'Conjoint Analysis', p: '/market-research/conjoint-analysis' },
  { tag: 'CX', t: 'Customer Journey', p: '/market-research' },
  { tag: 'LEARN', t: 'Knowledge Hub', p: '/learn' },
];

const AboutSwuMarketing = () => {
  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'สาขาการตลาด มศว · SWU Marketing Department · มหาวิทยาลัยศรีนครินทรวิโรฒ',
    description: 'สาขาวิชาการตลาด คณะบริหารธุรกิจเพื่อสังคม มหาวิทยาลัยศรีนครินทรวิโรฒ — ศูนย์รวมงานวิจัยตลาด พฤติกรรมผู้บริโภค Brand Strategy และเครื่องมือ AI-driven Marketing Research ฟรีสำหรับนักวิจัย นักศึกษา และนักการตลาดทั่วไทย',
    image: CAMPUS_IMG,
    url, type: 'profile',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'Srinakharinwirot University — Department of Marketing',
      alternateName: 'สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ',
      url, logo: SWU_LOGO_URL,
      address: { '@type': 'PostalAddress', addressLocality: 'Bangkok', addressCountry: 'TH' },
      department: {
        '@type': 'CollegeOrUniversity',
        name: 'School of Business Innovation for Society',
        alternateName: 'คณะบริหารธุรกิจเพื่อสังคม',
      },
    },
  });

  return (
    <div data-testid="about-swu-marketing">
      <Topbar active="about" />

      <section style={{ borderBottom: '1px solid var(--ink)', padding: '72px 0 64px' }}>
        <div className="swu-container">
          <Eyebrow red>● About · Department of Marketing</Eyebrow>
          <h1 className="h-display" style={{ marginTop: 24, maxWidth: '12ch' }}>
            การตลาด มศว. — วิจัย · ปฏิบัติ · <span className="italic-accent">เปิดเผย</span>.
          </h1>
          <p className="lede" style={{ fontSize: 19, marginTop: 32, maxWidth: '58ch' }}>
            สาขาการตลาด คณะบริหารธุรกิจเพื่อสังคม มหาวิทยาลัยศรีนครินทรวิโรฒ — ผลิตงานวิจัยและบุคลากรการตลาดในประเทศไทยมา 50 ปี
          </p>
        </div>
      </section>

      {/* Full-bleed image */}
      <img src={CAMPUS_IMG} alt="SWU Campus"
           style={{ width: '100%', height: 420, objectFit: 'cover',
                    filter: 'grayscale(20%) contrast(108%)' }}/>

      {/* Stats */}
      <section className="swu-container" style={{ padding: '0 32px' }}>
        <div className="stat-strip">
          <div className="stat-strip__item">
            <span className="stat-strip__num">1974</span>
            <span className="stat-strip__label">Established</span>
          </div>
          <div className="stat-strip__item">
            <span className="stat-strip__num">5</span>
            <span className="stat-strip__label">Research Streams</span>
          </div>
          <div className="stat-strip__item">
            <span className="stat-strip__num">Open</span>
            <span className="stat-strip__label">Platform Policy</span>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="swu-container" style={{ padding: '80px 32px 0', maxWidth: 1100 }}>
        <div className="hero-grid"
             style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 64,
                      alignItems: 'start' }}>
          <div>
            <Eyebrow red>● Mission</Eyebrow>
            <h2 className="h-section" style={{ marginTop: 16 }}>
              การวิจัยตลาด<br/>ควรเป็นของ<br/><span className="italic-accent">ทุกคน</span>.
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <p style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink)', margin: 0 }}>
              ในประเทศไทย เครื่องมือวิจัยตลาดระดับมาตรฐานวิชาการมักถูกใช้งานเฉพาะในบริษัทที่จ่ายค่าใช้จ่ายระดับหลักล้านได้
              — ทำให้ SME นักศึกษา และนักการตลาดอิสระเข้าไม่ถึง
            </p>
            <p style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink-2)', margin: 0 }}>
              SWU MKT ก่อตั้งขึ้นเพื่อแก้ปัญหานี้ — โดยเปิดเครื่องมือวิจัยตลาดมาตรฐาน อาทิ Brand Equity Survey,
              Choice-Based Conjoint Analysis, Customer Journey Mapping ให้ทุกคนใช้ได้ฟรี
              และเผยแพร่ผลงานวิจัยจริงสู่สาธารณะ
            </p>
            <p style={{ fontSize: 17, lineHeight: 1.78, color: 'var(--ink-2)', margin: 0 }}>
              เป้าหมายคือสร้าง <strong style={{ fontWeight: 600 }}>ระบบนิเวศการวิจัยตลาดเปิด</strong>
              สำหรับประเทศไทย ที่ความรู้ไม่ถูกล็อกอยู่ในกระดาษวิชาการ และเครื่องมือไม่ถูกล็อกอยู่ในซอฟต์แวร์ราคาแพง
            </p>
          </div>
        </div>
      </section>

      {/* Pull quote */}
      <section className="swu-container" style={{ padding: '80px 32px 0', maxWidth: 1100 }}>
        <div className="rule rule--strong" style={{ marginBottom: 40 }}></div>
        <blockquote style={{ borderLeft: '4px solid var(--be-red)',
                              padding: '12px 0 12px 32px', margin: 0,
                              fontFamily: 'var(--serif)',
                              fontSize: 'clamp(28px, 4vw, 44px)', fontStyle: 'italic',
                              lineHeight: 1.25, letterSpacing: '-0.01em' }}>
          "We don&apos;t sell research — we publish it. Brand Health belongs to the public, not behind a paywall."
          <footer style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em',
                            textTransform: 'uppercase', color: 'var(--ink-3)',
                            marginTop: 24, fontStyle: 'normal' }}>
            — SWU MKT Charter, 2024
          </footer>
        </blockquote>
      </section>

      {/* Tools shortcut on dark */}
      <section style={{ background: 'var(--ink)', color: '#fff', marginTop: 80, padding: '80px 0' }}>
        <div className="swu-container">
          <span className="eyebrow" style={{ color: 'var(--paper)' }}>
            <span className="dot"></span>Open Tools
          </span>
          <h2 className="serif" style={{ fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 1.05,
                                            letterSpacing: '-0.02em', marginTop: 18, color: '#fff' }}>
            เริ่มงานวิจัย<br/>ของคุณ.
          </h2>
          <div className="tools-dark-grid"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: 1, marginTop: 48,
                        background: 'var(--ink-2)', border: '1px solid var(--ink-2)' }}>
            {TOOLS.map((tool) => (
              <Link key={tool.t} to={tool.p}
                    data-testid={`about-tool-${tool.t.replace(/\s+/g, '-').toLowerCase()}`}
                    style={{ background: 'var(--ink)', padding: '24px 20px',
                             display: 'flex', flexDirection: 'column', gap: 8,
                             textDecoration: 'none', color: 'inherit' }}>
                <span className="meta" style={{ color: 'var(--be-red)' }}>{tool.tag}</span>
                <h4 className="serif" style={{ fontSize: 19, lineHeight: 1.18, color: '#fff', margin: 0 }}>
                  {tool.t}
                </h4>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
                                textTransform: 'uppercase', color: 'var(--paper)',
                                marginTop: 'auto', paddingTop: 16 }}>
                  Open →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AboutSwuMarketing;

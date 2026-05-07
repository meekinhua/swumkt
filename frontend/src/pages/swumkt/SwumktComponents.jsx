import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '@/pages/swumkt-design.css';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';

// Real SWU/MKT logo (bitmap). Defaults to a generous size so the wordmark reads clearly.
export const SwuLogo = ({ size = 56 }) => (
  <Link to="/" className="topbar__logo" aria-label="SWU MKT — Marketing Research"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <img src={SWU_LOGO_URL}
         alt="SWU MKT"
         style={{ height: size, width: 'auto', display: 'block' }}/>
  </Link>
);

export const Eyebrow = ({ children, red, dot, pulse, green }) => (
  <span className={`eyebrow ${red ? 'eyebrow--red' : ''}`}>
    {dot && <span className={`dot ${green ? 'dot--green' : ''} ${pulse ? 'dot--pulse' : ''}`}></span>}
    {children}
  </span>
);

export const Topbar = ({ active }) => {
  const navigate = useNavigate();
  return (
    <header className="topbar glass" style={{ position: 'sticky', top: 0 }}>
      <div className="topbar__inner">
        <SwuLogo />
        <nav className="topbar__nav">
          <Link to="/showcase" className={active === 'showcase' ? 'active' : ''}>Showcase</Link>
          <Link to="/learn" className={active === 'learn' ? 'active' : ''}>Learn</Link>
          <Link to="/about/swu-marketing" className={active === 'about' ? 'active' : ''}>About</Link>
          <a href="#login" className="topbar__signin btn-pill btn-pill--blue"
             style={{ marginLeft: 8 }}
             onClick={(e) => { e.preventDefault(); navigate('/login'); }}>
            Sign in →
          </a>
        </nav>
      </div>
    </header>
  );
};

export const Footer = () => (
  <footer className="footer">
    <div className="swu-container">
      <div className="footer__cols">
        <div className="footer__brand">
          <SwuLogo size={28} />
          <p>Consumer Insight & Foresight Lab โดยสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — เห็นในสิ่งที่ตลาดยังไม่เห็น ด้วยเครื่องมือวิจัยมาตรฐานวิชาการที่ทุกแบรนด์ใช้ได้ฟรี</p>
        </div>
        <div className="footer__col">
          <h5>Explore</h5>
          <ul>
            <li><Link to="/">Homepage</Link></li>
            <li><Link to="/showcase">Brand Showcase</Link></li>
            <li><Link to="/learn">Knowledge Hub</Link></li>
            <li><Link to="/about/swu-marketing">About SWU MKT</Link></li>
          </ul>
        </div>
        <div className="footer__col">
          <h5>Tools</h5>
          <ul>
            <li><Link to="/brand-equity">Brand Health Check</Link></li>
            <li><Link to="/market-research/conjoint-analysis">Conjoint Analysis</Link></li>
            <li><Link to="/market-research">Customer Journey</Link></li>
            <li><Link to="/market-research">Survey Builder</Link></li>
            <li><Link to="/projects">Kanban Projects</Link></li>
          </ul>
        </div>
        <div className="footer__col">
          <h5>Learn</h5>
          <ul>
            <li><Link to="/learn/brand-equity">Brand Equity</Link></li>
            <li><Link to="/learn/conjoint-analysis">Conjoint Analysis</Link></li>
            <li><Link to="/learn/customer-journey-mapping">Customer Journey</Link></li>
            <li><Link to="/learn/segmentation-targeting">STP Marketing</Link></li>
            <li><Link to="/learn/swot-analysis">SWOT / TOWS</Link></li>
          </ul>
        </div>
        <div className="footer__col">
          <h5>Account</h5>
          <ul>
            <li><Link to="/login">Sign in</Link></li>
            <li><Link to="/register">Register</Link></li>
            <li><a href="#privacy">Privacy</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="footer__bottom">
        <span>© {new Date().getFullYear()} SWU MKT · Department of Marketing, Srinakharinwirot University</span>
        <span>BANGKOK · OPEN RESEARCH</span>
      </div>
    </div>
  </footer>
);

// BrandLogo — supports real uploaded logo from API, falls back to initial + gradient.
// `brand` may contain { name, logo_url } and `identity.visual_assets` may contain a logo asset
// with { kind:'logo', image_base64, mime_type }. `gradient` is a number 1-5 for the fallback class.
export const BrandLogo = ({ brand, identity, initial, gradient = 1, size = 'md' }) => {
  const cls = size === 'lg' ? 'blogo blogo--lg' : size === 'xl' ? 'blogo blogo--xl' : 'blogo';

  const logoAsset = (identity?.visual_assets || []).find(a => a?.kind === 'logo');
  const inlineLogo = logoAsset?.image_base64
    ? `data:${logoAsset.mime_type || 'image/png'};base64,${logoAsset.image_base64}`
    : null;
  const externalLogo = brand?.logo_url && /^https?:\/\//i.test(brand.logo_url) ? brand.logo_url : null;
  const src = externalLogo || inlineLogo;

  if (src) {
    return (
      <div className={`${cls} blogo--g${gradient}`}
           style={{ background: '#fff', overflow: 'hidden', border: '1px solid var(--rule)' }}>
        <img src={src} alt={brand?.name || 'logo'}
             style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      </div>
    );
  }
  const ch = initial || (brand?.name || '?').slice(0, 1);
  return <div className={`${cls} blogo--g${gradient}`}>{ch}</div>;
};

export const StatusPill = ({ kind = 'green', children }) => (
  <span className={`pill pill--${kind}`}>
    <span className="dot"></span>
    {children}
  </span>
);

export const ScoreRing = ({ value }) => {
  const deg = (value / 100) * 360;
  return (
    <div className="score-ring" style={{ '--deg': deg + 'deg' }}>
      <span>{value}</span>
    </div>
  );
};

// Hash a brand id/name to a stable gradient 1-5 so each brand keeps the same color
export const gradientForBrand = (key = '') => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 5) + 1;
};

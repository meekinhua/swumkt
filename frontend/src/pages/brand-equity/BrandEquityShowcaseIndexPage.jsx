import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './brand-equity-styles.css';
import { Icon, BrandLogo, BeLoading, SWU_LOGO_URL } from './be-components';
import useDocumentMeta from '@/hooks/useDocumentMeta';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGO_GRADIENTS = [
  'linear-gradient(140deg,#0E5538 0%,#10B981 60%,#7DDDB1 100%)',
  'linear-gradient(140deg,#1E3A8A,#3B82F6)',
  'linear-gradient(140deg,#7C3AED,#C084FC)',
  'linear-gradient(140deg,#0F766E,#14B8A6)',
  'linear-gradient(140deg,#DC2626,#F87171)',
  'linear-gradient(140deg,#374151,#6B7280)',
];

const STATUS_LABEL = {
  draft: 'DRAFT',
  collecting: 'COLLECTING',
  analyzing: 'ANALYZING',
  completed: 'COMPLETED',
};

const BrandEquityShowcaseIndexPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/brand-equity/showcase`);
        if (alive) setItems(r.data?.showcases || []);
      } catch (e) {
        console.error('showcase index load failed', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(s =>
      (s.brand_name || '').toLowerCase().includes(needle) ||
      (s.category || '').toLowerCase().includes(needle) ||
      (s.competitors || []).some(c => (c || '').toLowerCase().includes(needle))
    );
  }, [items, q]);

  // Document head: title, description, OG/Twitter cards, JSON-LD ItemList
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const ogTitle = 'Brand Health, in Public · SWU MKT';
  const ogDescription = items.length > 0
    ? `${items.length} แบรนด์เปิดเผยผลวิจัย Brand Health Check แบบสาธารณะ — Awareness, Quality, Identity, Loyalty พร้อม AI insights ดูได้ทันทีโดยไม่ต้องสมัครสมาชิก`
    : 'รวมผลงานวิจัย Brand Health Check ที่นักวิจัยเปิดเผยต่อสาธารณะ จาก SWU Marketing Research Platform';

  useDocumentMeta({
    title: ogTitle,
    description: ogDescription,
    image: SWU_LOGO_URL,
    url: pageUrl,
    type: 'website',
    jsonLd: !loading && items.length > 0 ? {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: ogTitle,
      description: ogDescription,
      url: pageUrl,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.slice(0, 20).map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${typeof window !== 'undefined' ? window.location.origin : ''}/showcase/${s.share_token}`,
          name: s.brand_name,
        })),
      },
    } : null,
  });

  return (
    <div className="be-root" data-testid="be-showcase-index">
      {/* Topbar (mirrors public showcase topbar) */}
      <div className="be-public-topbar" data-testid="be-showcase-index-topbar">
        <div className="be-public-brand">
          <img src={SWU_LOGO_URL} alt="SWUMKT Logo" className="be-public-logo"/>
          <span className="be-public-text">
            <span className="be-public-name">SWU · Marketing Research</span>
            <span className="be-public-sub be-mono">BRAND HEALTH CHECK · PUBLIC SHOWCASE</span>
          </span>
        </div>
        <a href="/" className="be-mono be-tiny"
           style={{ padding: '6px 12px', border: '1px solid var(--rule-strong)',
                    textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--ink)',
                    textDecoration: 'none' }}
           data-testid="be-showcase-home-link">
          ← Home
        </a>
      </div>

      <div className="be-page">
        {/* Editorial hero */}
        <header style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 28, marginBottom: 32 }}>
          <div className="be-eyebrow" style={{ marginBottom: 14 }}>
            <span className="be-dot-sm be-pulse" style={{ background: 'var(--be-red)' }}/>
            PUBLIC SHOWCASE · CURATED COLLECTION
          </div>
          <h1 className="be-h1" style={{ fontSize: 'clamp(36px, 6vw, 60px)', lineHeight: 1.05, marginBottom: 14 }}>
            Brand Health, in&nbsp;Public.
          </h1>
          <p className="be-muted" style={{ fontSize: 17, maxWidth: 720, lineHeight: 1.55,
                                            fontFamily: 'IBM Plex Sans Thai' }}>
            ผลงานวิจัยแบรนด์ที่นักวิจัยเลือกเปิดเผยต่อสาธารณะ — ดูคะแนน Awareness · Quality · Identity · Loyalty
            พร้อม AI-driven insights แบบเปิดอ่านได้ทันที ไม่ต้องสมัครสมาชิก
          </p>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 36, marginTop: 22, flexWrap: 'wrap' }}>
            <div>
              <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.14em' }}>BRANDS</div>
              <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 28, fontWeight: 600 }}>
                {items.length}
              </div>
            </div>
            <div>
              <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.14em' }}>RESPONDENTS</div>
              <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 28, fontWeight: 600 }}>
                {items.reduce((sum, s) => sum + (s.response_count || 0), 0)}
              </div>
            </div>
            <div>
              <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.14em' }}>READY TO READ</div>
              <div style={{ fontFamily: 'IBM Plex Serif, Georgia, serif', fontSize: 28, fontWeight: 600,
                            color: 'var(--be-red)' }}>
                {items.filter(s => s.ready_for_dashboard).length}
              </div>
            </div>
          </div>
        </header>

        {/* Filter / search */}
        {!loading && items.length > 0 && (
          <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
            <Icon name="search" size={14}/>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาแบรนด์, หมวดหมู่, หรือคู่แข่ง…"
              data-testid="be-showcase-search"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent',
                       fontFamily: 'IBM Plex Sans Thai', fontSize: 15, padding: '8px 0' }}
            />
            <span className="be-mono be-tiny be-muted">{filtered.length} / {items.length}</span>
          </div>
        )}

        {loading ? (
          <BeLoading text="Loading public showcases…"/>
        ) : items.length === 0 ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', border: '1px dashed var(--rule)' }}
               data-testid="be-showcase-empty">
            <div className="be-eyebrow" style={{ marginBottom: 14, justifyContent: 'center', display: 'flex' }}>
              NO PUBLIC SHOWCASES YET
            </div>
            <div className="be-muted be-small" style={{ fontFamily: 'IBM Plex Sans Thai', fontSize: 15 }}>
              ยังไม่มีแบรนด์ที่เปิดเผยข้อมูลสาธารณะ — เจ้าของ study ต้องกด "Publish as showcase" จากหน้า dashboard
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--rule)' }}>
            <div className="be-mono be-tiny be-muted">NO MATCHES FOR &quot;{q}&quot;</div>
          </div>
        ) : (
          <div className="be-list-grid" data-testid="be-showcase-grid"
               style={filtered.length < 3 ? { background: 'transparent', border: 'none', gap: 16 } : {}}>
            {filtered.map((s, i) => (
              <Link
                key={s.id}
                to={`/showcase/${s.share_token}`}
                className="be-study-card"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block',
                         border: filtered.length < 3 ? '1px solid var(--rule-strong)' : undefined,
                         transition: 'transform 0.15s ease, border-color 0.15s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--ink)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = filtered.length < 3 ? 'var(--rule-strong)' : ''; }}
                data-testid={`be-showcase-card-${s.id}`}>
                <div className="be-study-top">
                  <div className="be-study-brand">
                    <BrandLogo
                      brand={{ name: s.brand_name, logo_url: s.logo_url }}
                      identity={{ visual_assets: s.logo_asset ? [s.logo_asset] : [] }}
                      size={48}
                      gradient={LOGO_GRADIENTS[i % LOGO_GRADIENTS.length]}
                      testid={`be-showcase-logo-${s.id}`}/>
                    <div>
                      <div className="be-study-name">{s.brand_name || '—'}</div>
                      <div className="be-study-cat">{s.category || 'general'}</div>
                    </div>
                  </div>
                  <div className="be-mono be-tiny"
                       style={{ padding: '4px 8px', border: '1px solid var(--rule-strong)',
                                textTransform: 'uppercase', letterSpacing: '0.10em',
                                color: s.ready_for_dashboard ? 'var(--be-green)' : 'var(--ink-3)',
                                borderColor: s.ready_for_dashboard ? 'var(--be-green)' : 'var(--rule-strong)' }}>
                    {s.ready_for_dashboard ? '● PUBLIC' : '○ AWAITING DATA'}
                  </div>
                </div>

                {(s.competitors || []).length > 0 && (
                  <div className="be-mono be-tiny be-muted"
                       style={{ padding: '12px 0 4px', letterSpacing: '0.06em' }}>
                    VS · {(s.competitors || []).slice(0, 3).join(' · ')}
                    {(s.competitors || []).length > 3 ? ` · +${s.competitors.length - 3}` : ''}
                  </div>
                )}

                <div className="be-study-foot" style={{ marginTop: 10 }}>
                  <span>
                    n = {s.response_count || 0}
                    {' · '}
                    <span style={{ color: 'var(--ink-3)' }}>
                      {STATUS_LABEL[s.status] || (s.status || '').toUpperCase()}
                    </span>
                  </span>
                  <span className="be-mono be-tiny"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                                 color: 'var(--ink)', letterSpacing: '0.08em',
                                 textTransform: 'uppercase' }}>
                    View report <Icon name="arrowR" size={10}/>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid var(--rule)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.10em' }}>
            POWERED BY SWU MARKETING RESEARCH · BRAND HEALTH CHECK
          </span>
          <Link to="/" className="be-mono be-tiny"
                style={{ color: 'var(--ink-2)', textDecoration: 'none', letterSpacing: '0.10em' }}>
            ABOUT THIS PROJECT →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BrandEquityShowcaseIndexPage;

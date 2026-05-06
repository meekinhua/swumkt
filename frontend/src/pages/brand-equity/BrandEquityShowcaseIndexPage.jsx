import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Topbar, Footer, Eyebrow, BrandLogo, ScoreRing, StatusPill, gradientForBrand
} from '@/pages/swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ShowcaseIndexPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/brand-equity/showcase`);
        if (alive) setItems(r.data?.showcases || []);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter(s =>
      (s.brand_name || '').toLowerCase().includes(n) ||
      (s.category || '').toLowerCase().includes(n) ||
      (s.competitors || []).some(c => (c || '').toLowerCase().includes(n))
    );
  }, [items, q]);

  const totalRespondents = items.reduce((s, x) => s + (x.response_count || 0), 0);
  const readyCount = items.filter(x => x.ready_for_dashboard).length;

  const url = typeof window !== 'undefined' ? window.location.href : '';
  useDocumentMeta({
    title: 'Brand Health, in Public · SWU MKT Showcase',
    description: items.length > 0
      ? `${items.length} แบรนด์เปิดเผยผลวิจัย Brand Health Check แบบสาธารณะ — Awareness, Quality, Identity, Loyalty พร้อม AI insights ดูได้ทันที`
      : 'รวมผลงานวิจัย Brand Health Check ที่นักวิจัยเปิดเผยต่อสาธารณะ จาก SWU Marketing Research',
    image: SWU_LOGO_URL,
    url, type: 'website',
    jsonLd: !loading && items.length > 0 ? {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'SWU MKT · Brand Health Public Showcase',
      url,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.slice(0, 20).map((s, i) => ({
          '@type': 'ListItem', position: i + 1,
          url: `${typeof window !== 'undefined' ? window.location.origin : ''}/showcase/${s.share_token}`,
          name: s.brand_name,
        })),
      },
    } : null,
  });

  return (
    <div data-testid="showcase-index">
      <Topbar active="showcase" />

      <section style={{ borderBottom: '1px solid var(--ink)', padding: '72px 0 56px' }}>
        <div className="swu-container">
          <Eyebrow red dot pulse>● Public Showcase · {items.length} Live {items.length === 1 ? 'Study' : 'Studies'}</Eyebrow>
          <h1 className="h-display" style={{ marginTop: 24, maxWidth: '11ch' }}>
            Brand Health,<br/><span className="italic-accent">in Public.</span>
          </h1>
          <p className="lede" style={{ fontSize: 19, marginTop: 32, maxWidth: '54ch' }}>
            งานวิจัย Brand Health Check ทั้งหมดที่นักวิจัยเลือกเผยแพร่สู่สาธารณะ —
            รายงานเต็มฉบับ พร้อม Aaker scores, perceptual map และข้อมูล n ของผู้ตอบ
          </p>
        </div>
      </section>

      <section className="swu-container" style={{ padding: 0 }}>
        <div className="stat-strip" style={{ borderTop: 'none' }}>
          <div className="stat-strip__item">
            <span className="stat-strip__num">{items.length}</span>
            <span className="stat-strip__label">Brands</span>
          </div>
          <div className="stat-strip__item">
            <span className="stat-strip__num">{totalRespondents.toLocaleString()}</span>
            <span className="stat-strip__label">Respondents</span>
          </div>
          <div className="stat-strip__item">
            <span className="stat-strip__num">{readyCount}</span>
            <span className="stat-strip__label">Ready to Read</span>
          </div>
        </div>
      </section>

      <section className="swu-container" style={{ padding: '40px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16,
                      borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
          <span className="meta">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="ค้นหาแบรนด์ หมวด หรือคู่แข่ง…"
                 data-testid="showcase-search"
                 style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent',
                          fontFamily: 'var(--sans)', fontSize: 17, color: 'var(--ink)' }}/>
          <span className="meta">{filtered.length} results</span>
        </div>
      </section>

      <section className="swu-container" style={{ padding: '32px 32px 0' }}>
        {loading ? (
          <div className="meta" style={{ padding: 60, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="meta" style={{ padding: 60, textAlign: 'center',
                                           border: '1px dashed var(--rule)' }}>
            {items.length === 0 ? 'ยังไม่มี showcase สาธารณะ' : `No matches for "${q}"`}
          </div>
        ) : (
          <div className="article-grid"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 32 }}
               data-testid="showcase-grid">
            {filtered.map((b) => (
              <Link key={b.id} to={`/showcase/${b.share_token}`}
                    className="ed-card"
                    data-testid={`showcase-card-${b.id}`}
                    style={{ borderTop: '1px solid var(--ink)', padding: '24px 0 28px',
                             textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'flex-start' }}>
                  <BrandLogo brand={{ name: b.brand_name, logo_url: b.logo_url }}
                             identity={{ visual_assets: b.logo_asset ? [b.logo_asset] : [] }}
                             gradient={gradientForBrand(b.id)}/>
                  {b.ready_for_dashboard
                    ? <StatusPill kind="green">Public · n={b.response_count || 0}</StatusPill>
                    : <StatusPill kind="red">Collecting · n={b.response_count || 0}</StatusPill>}
                </div>
                <div>
                  <div className="serif" style={{ fontSize: 26, lineHeight: 1.12,
                                                    letterSpacing: '-0.01em', marginTop: 18 }}>
                    {b.brand_name}
                  </div>
                  <div className="meta" style={{ marginTop: 6 }}>{b.category || 'general'}</div>
                </div>
                {(b.competitors || []).length > 0 && (
                  <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12,
                                display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="meta">VS</span>
                    <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
                      {(b.competitors || []).slice(0, 3).join(' · ')}
                      {(b.competitors || []).length > 3 ? ` · +${b.competitors.length - 3}` : ''}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', marginTop: 8 }}>
                  {b.ready_for_dashboard ? (
                    <span className="meta" style={{ color: 'var(--be-green)' }}>● Brand Equity</span>
                  ) : (
                    <span className="meta" style={{ color: 'var(--be-red)' }}>● Awaiting min n=10</span>
                  )}
                  <span className="link-arrow link-arrow--red">View Report →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
};

export default ShowcaseIndexPage;

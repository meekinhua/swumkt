import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { BeTopbar, BeLoading } from './brand-equity/be-components';
import copyToClipboard from '../lib/clipboard';
import './brand-equity/brand-equity-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ────────────────────────────────────────────────────────────────────────────
// Editorial Monogram — deterministic logo fallback
// ────────────────────────────────────────────────────────────────────────────
const MONO_PALETTE = ['#0E5538', '#C8102E', '#1D3557', '#0A0A0A', '#B45309', '#4338CA', '#0369A1', '#6D28D9'];

const hashStr = (s = '') => Array.from(String(s)).reduce((a, c) => a + c.charCodeAt(0), 0);

const BrandMark = ({ topic, logoUrl, size = 56 }) => {
  const t = String(topic || '').trim();
  const initial = (t || '?').charAt(0).toUpperCase();
  const bg = MONO_PALETTE[hashStr(t) % MONO_PALETTE.length];

  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        border: '1px solid rgba(10,10,10,0.10)',
        overflow: 'hidden', position: 'relative',
      }}
      data-testid="brand-mark"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={t}
          style={{ width: '100%', height: '100%', objectFit: 'cover',
                   background: '#fff', transition: 'transform 400ms ease' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: `linear-gradient(135deg, ${bg} 0%, rgba(10,10,10,0.65) 100%)`,
          color: '#F4F0EA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'IBM Plex Serif, serif',
          fontSize: Math.round(size * 0.42), fontWeight: 600,
          letterSpacing: '-0.02em',
          position: 'relative',
        }}>
          <span style={{ position: 'relative', zIndex: 1 }}>{initial}</span>
          {/* Subtle noise overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}/>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Method tag
// ────────────────────────────────────────────────────────────────────────────
const MethodTag = ({ method, short }) => {
  const isBE = method === 'brand_equity';
  return (
    <span
      data-testid={`method-tag-${method}`}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '4px 9px', fontSize: 10, letterSpacing: '0.14em',
        fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
        background: isBE ? 'rgba(14,85,56,0.10)' : 'rgba(200,16,46,0.10)',
        color:      isBE ? '#0E5538'            : '#C8102E',
        textTransform: 'uppercase',
      }}
    >
      {short || (isBE ? 'BE' : 'CJ')}
    </span>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Study card — asymmetric 3-col grid
// ────────────────────────────────────────────────────────────────────────────
const ShowcaseCard = ({ item, onOpen, accent }) => {
  const isBE = item.method === 'brand_equity';
  const subline = isBE
    ? `${item.response_count || 0} responses${item.competitors?.length ? ' · ' + item.competitors.slice(0, 2).join(' · ') : ''}`
    : `${item.attributes_count || 0} attributes${item.category ? ' · ' + item.category : ''}`;

  return (
    <button
      data-testid={`showcase-card-${item.method}-${item.id}`}
      onClick={onOpen}
      className="group"
      style={{
        textAlign: 'left', cursor: 'pointer', background: '#FFFFFF',
        border: '1px solid rgba(10,10,10,0.15)',
        padding: 0, minHeight: 260, position: 'relative',
        display: 'flex', flexDirection: 'column',
        transition: 'all 320ms cubic-bezier(.2,.8,.2,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.08)';
        e.currentTarget.style.borderColor = 'rgba(10,10,10,0.55)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = 'rgba(10,10,10,0.15)';
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 3, background: isBE ? '#0E5538' : '#C8102E', flexShrink: 0 }}/>

      <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <MethodTag method={item.method} short={item.method_short} />
          {item.ready === false && (
            <span style={{ fontSize: 9, color: '#8A8A8A', fontFamily: 'JetBrains Mono', letterSpacing: '0.12em' }}>
              COLLECTING
            </span>
          )}
          {accent && (
            <span style={{ fontSize: 9, color: '#0A0A0A', fontFamily: 'JetBrains Mono',
                           letterSpacing: '0.12em', fontWeight: 700 }}>
              {accent}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <BrandMark topic={item.topic} logoUrl={item.logo_url} size={56}/>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{
              fontFamily: 'IBM Plex Serif, serif',
              fontSize: 22, fontWeight: 500, margin: 0,
              lineHeight: 1.15, letterSpacing: '-0.01em',
              color: '#0A0A0A', overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {item.topic || item.title || '(untitled)'}
            </h3>
            {item.category && (
              <div style={{ fontSize: 10, color: '#8A8A8A', fontFamily: 'JetBrains Mono',
                            letterSpacing: '0.10em', marginTop: 4, textTransform: 'uppercase' }}>
                {item.category}
              </div>
            )}
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: '#4A4A4A', lineHeight: 1.55, flex: 1 }}>
          {item.description || subline}
        </p>
      </div>

      <div style={{
        padding: '14px 24px', borderTop: '1px solid rgba(10,10,10,0.10)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 10, color: '#4A4A4A',
        fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>
        <span>{item.method_label}</span>
        <span style={{ transition: 'transform 280ms ease' }} className="group-hover:translate-x-1">
          OPEN →
        </span>
      </div>
    </button>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Featured topic — full-width Tetris split panel
// ────────────────────────────────────────────────────────────────────────────
const FeaturedTopicCard = ({ topic, onOpen }) => (
  <div
    data-testid={`featured-topic-${topic.topic}`}
    style={{
      gridColumn: '1 / -1',
      display: 'grid', gridTemplateColumns: 'minmax(0,1fr)',
      gap: 1, background: 'rgba(10,10,10,0.15)',
      border: '1px solid rgba(10,10,10,0.15)',
      overflow: 'hidden', margin: '8px 0',
    }}
    className="md:!grid-cols-[5fr_7fr]"
  >
    {/* LEFT: editorial intro */}
    <div style={{
      background: '#F4F0EA', padding: '36px 32px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      gap: 24, position: 'relative', minHeight: 260,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BrandMark topic={topic.topic} logoUrl={topic.logo_url} size={72}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#0A0A0A',
                        letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>
            ★ FEATURED · {topic.methods_count} METHODS
          </div>
          <h2 style={{
            margin: 0, fontFamily: 'IBM Plex Serif, serif',
            fontSize: 'clamp(28px, 3.6vw, 40px)', fontWeight: 600,
            lineHeight: 1.05, letterSpacing: '-0.02em', color: '#0A0A0A',
          }}>{topic.topic}</h2>
          {topic.category && (
            <div style={{ fontSize: 11, color: '#4A4A4A', marginTop: 6, fontFamily: 'JetBrains Mono',
                          letterSpacing: '0.10em', textTransform: 'uppercase' }}>
              {topic.category}
            </div>
          )}
        </div>
      </div>
      <p style={{ fontSize: 14, color: '#4A4A4A', lineHeight: 1.65, margin: 0,
                  paddingTop: 24, borderTop: '1px solid rgba(10,10,10,0.10)' }}>
        ศึกษาด้วย <strong style={{ color: '#0A0A0A' }}>{topic.methods_count} วิธีต่างกัน</strong> — เทียบกันได้ว่า survey-based กับ choice-based ให้ insight อะไรไม่เหมือนกันบน topic เดียว
      </p>
    </div>

    {/* RIGHT: method tiles */}
    <div style={{
      background: '#FFFFFF', padding: '36px 32px',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
    }}>
      {topic.studies.map(s => (
        <button
          key={`${s.method}-${s.id}`}
          onClick={() => onOpen(s)}
          data-testid={`featured-method-${s.method}-${s.id}`}
          style={{
            padding: '20px 18px', background: '#F4F0EA',
            border: '1px solid rgba(10,10,10,0.15)',
            textAlign: 'left', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 10,
            transition: 'all 240ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#0A0A0A';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F4F0EA';
            e.currentTarget.style.borderColor = 'rgba(10,10,10,0.15)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <MethodTag method={s.method} short={s.method_short}/>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A',
                        fontFamily: 'IBM Plex Sans Thai, sans-serif' }}>
            {s.method_label}
          </div>
          <div style={{ fontSize: 11, color: '#4A4A4A', fontFamily: 'JetBrains Mono',
                        letterSpacing: '0.08em' }}>
            {s.method === 'brand_equity'
              ? `${s.response_count || 0} RESPONSES`
              : `${s.attributes_count || 0} ATTRIBUTES`}
          </div>
          <div style={{ marginTop: 'auto', fontSize: 10, color: '#0A0A0A',
                        fontFamily: 'JetBrains Mono', letterSpacing: '0.14em', fontWeight: 700 }}>
            OPEN →
          </div>
        </button>
      ))}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────────────
// Methods primer — dark slab
// ────────────────────────────────────────────────────────────────────────────
const MethodsPrimer = () => (
  <section style={{
    marginTop: 80, padding: '64px 32px',
    background: '#0A0A0A', color: '#F4F0EA',
    display: 'grid', gap: 48,
    gridTemplateColumns: 'minmax(0,1fr)',
  }} className="md:!grid-cols-[5fr_7fr] md:!p-20 md:!gap-24">
    <div>
      <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: '0.18em',
                     opacity: 0.6, marginBottom: 12, fontWeight: 700 }}>
        METHODS PRIMER · 01 — 02
      </div>
      <h3 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 'clamp(28px, 4vw, 44px)',
                   fontWeight: 500, margin: 0, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
        เลือกใช้วิธีไหน<br/>กับงานวิจัยของคุณ?
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 24, opacity: 0.7, maxWidth: 360 }}>
        สองวิธีจับคนละมุมของการตัดสินใจซื้อ — survey วัดสถานะปัจจุบัน
        ส่วน conjoint ทำนาย trade-off ที่ผู้บริโภคยังไม่บอกออกมาตรง ๆ
      </p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40 }}>
      <div style={{ borderTop: '2px solid rgba(244,240,234,0.3)', paddingTop: 20 }}>
        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.18em',
                       color: '#7FB39A', marginBottom: 14, fontWeight: 700 }}>
          01 · BRAND EQUITY
        </div>
        <h4 style={{ fontSize: 22, margin: '0 0 16px', fontFamily: 'IBM Plex Serif, serif',
                     fontWeight: 500, letterSpacing: '-0.01em' }}>
          Aaker 4-Dimension Framework
        </h4>
        <p style={{ fontSize: 13, opacity: 0.78, lineHeight: 1.7, margin: 0 }}>
          วัด <strong style={{ color: '#F4F0EA' }}>สถานะ</strong> ของแบรนด์ผ่าน 4 มิติ:
          Awareness · Perceived Quality · Identity vs Image · Loyalty.
          เหมาะกับงานที่ต้องการ snapshot ภาพรวมและเทียบกับคู่แข่งบนแกนเดียวกัน
        </p>
      </div>
      <div style={{ borderTop: '2px solid rgba(244,240,234,0.3)', paddingTop: 20 }}>
        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.18em',
                       color: '#E89BA3', marginBottom: 14, fontWeight: 700 }}>
          02 · CONJOINT ANALYSIS
        </div>
        <h4 style={{ fontSize: 22, margin: '0 0 16px', fontFamily: 'IBM Plex Serif, serif',
                     fontWeight: 500, letterSpacing: '-0.01em' }}>
          Choice-Based Trade-off
        </h4>
        <p style={{ fontSize: 13, opacity: 0.78, lineHeight: 1.7, margin: 0 }}>
          วัด <strong style={{ color: '#F4F0EA' }}>trade-off</strong> ของผู้บริโภคโดยให้เลือก profile
          ที่มี attribute ต่างกัน. ระบบคำนวณ <em>part-worth utilities</em>
          ทำให้รู้ว่า attribute ไหนสำคัญสุด และตั้งราคา/ออกแบบสินค้าใหม่ได้แม่นยำ
        </p>
      </div>
    </div>
  </section>
);

// ────────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────────
const UnifiedShowcasePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const initialTab = searchParams.get('tab');
    if (initialTab && ['all', 'brand_equity', 'conjoint'].includes(initialTab)) {
      setTab(initialTab);
    }
    (async () => {
      try {
        const r = await axios.get(`${API}/showcase/index`);
        setData(r.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams]);

  const open = (item) => {
    if (item.method === 'brand_equity') navigate(`/showcase/${item.share_token}`);
    else                                navigate(`/conjoint/results/${item.id}`);
  };

  if (loading) {
    return (
      <div style={{ background: '#F4F0EA', minHeight: '100vh' }}>
        <BeTopbar subtitle="PUBLIC SHOWCASE" active="showcase" />
        <BeLoading text="กำลังโหลด showcase..."/>
      </div>
    );
  }
  if (!data) return null;

  const featured = data.featured_topics || [];
  const beItems  = data.brand_equity || [];
  const cjItems  = data.conjoint || [];
  const totals   = data.totals || {};

  const filteredCombined = (() => {
    if (tab === 'brand_equity') return beItems;
    if (tab === 'conjoint')     return cjItems;
    return [...beItems, ...cjItems].sort((a, b) =>
      (b.updated_at || '').localeCompare(a.updated_at || '')
    );
  })();

  const handleShare = () => {
    const origin = window.location.origin;
    copyToClipboard(`${origin}/api/share/showcase-index`, {
      successMessage: 'คัดลอกลิงก์แชร์แล้ว — paste ลง FB / LINE / Slack ได้',
    });
  };

  return (
    <div style={{ background: '#F4F0EA', minHeight: '100vh', color: '#0A0A0A' }}>
      <BeTopbar subtitle="PUBLIC SHOWCASE" active="showcase" />

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px' }} className="md:!px-12">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* HERO — bento split (text 8 / stats 4)                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section
          data-testid="showcase-hero"
          style={{
            display: 'grid', gap: 1, background: 'rgba(10,10,10,0.15)',
            borderBottom: '1px solid rgba(10,10,10,0.15)',
            gridTemplateColumns: 'minmax(0, 1fr)',
            marginTop: 32, paddingBottom: 0,
          }}
          className="md:!grid-cols-[8fr_4fr]"
        >
          {/* Text panel */}
          <div style={{ background: '#F4F0EA', padding: '48px 32px 48px 0' }}
               className="md:!pr-12 md:!py-20">
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.20em',
                           color: '#0A0A0A', fontWeight: 700, marginBottom: 24,
                           display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 32, height: 1, background: '#0A0A0A' }}/>
              PUBLIC RESEARCH SHOWCASE
              <span style={{ color: '#8A8A8A' }}>· OPEN ACCESS</span>
            </div>
            <h1 style={{
              fontFamily: 'IBM Plex Serif, serif',
              fontSize: 'clamp(40px, 7vw, 88px)',
              lineHeight: 0.98, fontWeight: 500, margin: 0,
              letterSpacing: '-0.035em', color: '#0A0A0A',
            }}>
              Marketing<br/>
              research,<br/>
              <span style={{ fontStyle: 'italic', fontWeight: 400 }}>publicly</span>
              <span style={{
                display: 'inline-block', width: '0.4em', height: '0.4em',
                background: '#C8102E', marginLeft: 8, marginBottom: 6,
                verticalAlign: 'middle',
              }}/>
              <br/>
              <span style={{ color: '#4A4A4A' }}>visible.</span>
            </h1>
            <p style={{
              fontSize: 16, color: '#4A4A4A', lineHeight: 1.6,
              maxWidth: 580, margin: '32px 0 0',
              fontFamily: 'IBM Plex Sans Thai, sans-serif',
            }}>
              งานวิจัยจริงจากนักศึกษา <strong style={{ color: '#0A0A0A' }}>SWU Marketing</strong> —
              Brand Equity surveys, Conjoint Analysis experiments — เปิดให้คนทั่วไปดูได้ ไม่ต้อง login
            </p>
            <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                data-testid="showcase-share-btn"
                onClick={handleShare}
                style={{
                  padding: '13px 22px', fontSize: 11, fontWeight: 700,
                  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.18em',
                  background: '#0A0A0A', color: '#F4F0EA', border: 'none',
                  cursor: 'pointer', transition: 'all 200ms ease',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#C8102E'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0A0A0A'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; }}
              >
                ⤴ Share this page
              </button>
              <Link
                to="/"
                style={{
                  padding: '13px 22px', fontSize: 11, fontWeight: 700,
                  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.18em',
                  background: 'transparent', color: '#0A0A0A',
                  border: '1px solid rgba(10,10,10,0.30)',
                  textDecoration: 'none', transition: 'all 200ms ease',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0A0A0A'; e.currentTarget.style.color = '#F4F0EA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0A0A0A'; }}
              >
                ← Back home
              </Link>
            </div>
          </div>

          {/* Stats panel — 2x2 grid with internal borders */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
            background: 'rgba(10,10,10,0.15)',
          }}>
            {[
              { label: 'TOPICS',       value: totals.topics || 0,        key: 'topics' },
              { label: 'BE STUDIES',   value: totals.brand_equity || 0,  key: 'be-studies' },
              { label: 'CJ STUDIES',   value: totals.conjoint || 0,      key: 'cj-studies' },
              { label: 'RESPONSES',    value: totals.responses || 0,     key: 'be-responses' },
            ].map((s, i) => (
              <div
                key={s.key}
                data-testid={`hero-stat-${s.key}`}
                style={{
                  background: '#F4F0EA', padding: '28px 24px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  minHeight: 130, position: 'relative',
                }}
              >
                <div style={{
                  fontSize: 'clamp(36px, 4vw, 56px)', fontWeight: 500,
                  color: '#0A0A0A', lineHeight: 1,
                  fontFamily: 'IBM Plex Serif, serif',
                  letterSpacing: '-0.02em', marginBottom: 8,
                }}>
                  {s.value}
                </div>
                <div style={{
                  fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.18em', color: '#4A4A4A', fontWeight: 700,
                }}>
                  {s.label}
                </div>
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  fontSize: 9, color: '#8A8A8A', fontFamily: 'JetBrains Mono',
                }}>0{i+1}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* FEATURED — full-width split panel                               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {featured.length > 0 && (
          <section style={{ marginTop: 72 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24,
                          flexWrap: 'wrap', borderBottom: '1px solid rgba(10,10,10,0.15)',
                          paddingBottom: 16 }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.20em',
                             color: '#0A0A0A', fontWeight: 700 }}>
                §01 · FEATURED
              </div>
              <h2 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 'clamp(24px, 3vw, 36px)',
                           fontWeight: 500, margin: 0, letterSpacing: '-0.02em',
                           lineHeight: 1.1 }}>
                เปรียบเทียบ <em>สองวิธี</em> บน topic เดียว
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              {featured.map(t => <FeaturedTopicCard key={t.topic} topic={t} onOpen={open}/>)}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STUDY GRID                                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section style={{ marginTop: featured.length > 0 ? 72 : 56 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                        flexWrap: 'wrap', gap: 16, marginBottom: 28,
                        borderBottom: '1px solid rgba(10,10,10,0.15)', paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.20em',
                             color: '#0A0A0A', fontWeight: 700 }}>
                §{featured.length > 0 ? '02' : '01'} · CATALOG
              </div>
              <h2 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 'clamp(24px, 3vw, 36px)',
                           fontWeight: 500, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                งานวิจัยทั้งหมด
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(10,10,10,0.15)' }}>
              {[
                { id: 'all',          label: `ALL · ${beItems.length + cjItems.length}` },
                { id: 'brand_equity', label: `BE · ${beItems.length}` },
                { id: 'conjoint',     label: `CJ · ${cjItems.length}` },
              ].map((t) => (
                <button
                  key={t.id}
                  data-testid={`showcase-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '11px 18px', fontSize: 10.5, fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.16em',
                    background: tab === t.id ? '#0A0A0A' : 'transparent',
                    color: tab === t.id ? '#F4F0EA' : '#4A4A4A',
                    border: 'none', borderLeft: '1px solid rgba(10,10,10,0.15)',
                    cursor: 'pointer', transition: 'all 200ms ease',
                    textTransform: 'uppercase',
                  }}
                  onMouseEnter={(e) => { if (tab !== t.id) { e.currentTarget.style.background = 'rgba(10,10,10,0.05)'; e.currentTarget.style.color = '#0A0A0A'; } }}
                  onMouseLeave={(e) => { if (tab !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4A4A4A'; } }}
                >{t.label}</button>
              ))}
            </div>
          </div>

          {filteredCombined.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#8A8A8A',
                          fontFamily: 'JetBrains Mono', letterSpacing: '0.10em', fontSize: 12,
                          border: '1px dashed rgba(10,10,10,0.15)' }}>
              NO STUDIES IN THIS CATEGORY YET
            </div>
          ) : (
            <div style={{
              display: 'grid', gap: 20,
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}>
              {filteredCombined.map(it => (
                <ShowcaseCard key={`${it.method}-${it.id}`} item={it} onOpen={() => open(it)}/>
              ))}
            </div>
          )}
        </section>

        <MethodsPrimer />

        <footer style={{
          padding: '40px 0', marginTop: 40,
          borderTop: '1px solid rgba(10,10,10,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
          fontSize: 10, color: '#8A8A8A', fontFamily: 'JetBrains Mono',
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>
          <span>SWU · MARKETING RESEARCH LAB</span>
          <Link to="/" style={{ color: '#0A0A0A', textDecoration: 'underline' }}>
            ← Back to home
          </Link>
        </footer>
      </div>
    </div>
  );
};

export default UnifiedShowcasePage;

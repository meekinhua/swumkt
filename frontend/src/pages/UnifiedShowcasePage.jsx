import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { BeTopbar, BeLoading } from './brand-equity/be-components';
import copyToClipboard from '../lib/clipboard';
import './brand-equity/brand-equity-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// -- Method tag chip ----------------------------------------------------------
const MethodTag = ({ method, short }) => {
  const palette = method === 'brand_equity'
    ? { bg: 'rgba(14,85,56,0.10)', fg: '#0E5538' }
    : { bg: 'rgba(200,16,46,0.10)', fg: '#C8102E' };
  return (
    <span
      data-testid={`method-tag-${method}`}
      style={{
        padding: '3px 9px', borderRadius: 3, fontSize: 10, letterSpacing: '0.06em',
        fontWeight: 700, background: palette.bg, color: palette.fg,
        textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {short || (method === 'brand_equity' ? 'BE' : 'CJ')}
    </span>
  );
};

// -- Single study card --------------------------------------------------------
const ShowcaseCard = ({ item, onOpen }) => {
  const subline = item.method === 'brand_equity'
    ? `${item.response_count || 0} responses · ${(item.competitors || []).slice(0, 3).join(' · ') || 'no competitors'}`
    : `${item.attributes_count || 0} attributes · ${item.category || 'experimental design'}`;
  return (
    <button
      data-testid={`be-show-card-${item.method}-${item.id}`}
      onClick={onOpen}
      className="be-card"
      style={{
        textAlign: 'left', cursor: 'pointer', border: '1px solid var(--rule, rgba(0,0,0,0.10))',
        padding: 22, transition: 'all 220ms ease', background: 'rgba(255,255,255,0.78)',
        display: 'flex', flexDirection: 'column', gap: 12, minHeight: 180,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <MethodTag method={item.method} short={item.method_short} />
        {item.ready === false && (
          <span style={{ fontSize: 9.5, color: '#888', fontFamily: 'JetBrains Mono' }}>collecting…</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {item.logo_url && (
          <img src={item.logo_url} alt={item.topic}
            style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', background: '#F8F7F2', flexShrink: 0 }}/>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontFamily: 'IBM Plex Serif', fontSize: 20, fontWeight: 600, margin: 0,
                       lineHeight: 1.2, color: 'var(--ink, #1a1a1a)', overflow: 'hidden',
                       textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.topic || item.title || '(untitled)'}
          </h3>
          {item.category && (
            <div style={{ fontSize: 11, color: 'var(--ink-3, #666)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
              {item.category}
            </div>
          )}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2, #444)', lineHeight: 1.5, flex: 1 }}>
        {item.description || subline}
      </p>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 'auto', paddingTop: 10, borderTop: '1px dashed var(--rule, rgba(0,0,0,0.08))',
        fontSize: 10.5, color: 'var(--ink-3, #777)', fontFamily: 'JetBrains Mono',
      }}>
        <span>{item.method_label}</span>
        <span>OPEN →</span>
      </div>
    </button>
  );
};

// -- Featured topic (multi-method) -------------------------------------------
const FeaturedTopicCard = ({ topic, onOpen }) => (
  <div
    className="be-card"
    data-testid={`featured-topic-${topic.topic}`}
    style={{
      padding: 28, background: 'linear-gradient(135deg, rgba(14,85,56,0.05), rgba(200,16,46,0.05))',
      border: '1px solid var(--rule)', borderLeft: '4px solid #0E5538',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {topic.logo_url && (
        <img src={topic.logo_url} alt={topic.topic}
          style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', background: '#fff', flexShrink: 0 }}/>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#0E5538',
                      letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
          ★ FEATURED · {topic.methods_count} METHODS
        </div>
        <h2 style={{ margin: 0, fontFamily: 'IBM Plex Serif', fontSize: 28, fontWeight: 600,
                     lineHeight: 1.15, color: 'var(--ink)' }}>{topic.topic}</h2>
        {topic.category && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{topic.category}</div>
        )}
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
      ศึกษาด้วย <strong>{topic.methods_count} วิธีต่างกัน</strong> — ดูเทียบกันได้ว่า survey-based และ choice-based ให้ insight อะไรต่างกันสำหรับ topic เดียวกัน
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {topic.studies.map(s => (
        <button key={`${s.method}-${s.id}`} onClick={() => onOpen(s)}
          data-testid={`featured-method-${s.method}-${s.id}`}
          style={{
            padding: '12px 14px', background: '#fff', border: '1px solid var(--rule)',
            borderRadius: 6, textAlign: 'left', cursor: 'pointer', display: 'flex',
            flexDirection: 'column', gap: 6, transition: 'all 180ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0E5538'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.transform = 'none'; }}
        >
          <MethodTag method={s.method} short={s.method_short} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{s.method_label}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {s.method === 'brand_equity'
              ? `${s.response_count || 0} responses`
              : `${s.attributes_count || 0} attributes`}
            {' · เปิดดู →'}
          </div>
        </button>
      ))}
    </div>
  </div>
);

// -- Methods Primer (educational footer) -------------------------------------
const MethodsPrimer = () => (
  <div style={{
    marginTop: 56, padding: '40px 32px',
    background: '#0E5538', color: '#F8F7F2', borderRadius: 8,
  }}>
    <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em',
                   opacity: 0.7, marginBottom: 8 }}>METHODS PRIMER · เทียบสองวิธีอย่างเร็ว</div>
    <h3 style={{ fontFamily: 'IBM Plex Serif', fontSize: 28, fontWeight: 600, margin: 0,
                 marginBottom: 24, lineHeight: 1.2 }}>
      เลือกใช้วิธีไหนกับงานวิจัยของคุณ?
    </h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
      <div>
        <MethodTag method="brand_equity" short="BE" />
        <h4 style={{ fontSize: 18, marginTop: 10, marginBottom: 8, fontFamily: 'IBM Plex Serif' }}>
          Brand Equity (Aaker 4-dim)
        </h4>
        <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6, margin: 0 }}>
          วัด <strong>สถานะ</strong> ของแบรนด์ผ่าน 4 มิติ: Awareness (จดจำได้แค่ไหน) · Perceived Quality (มองว่ามีคุณภาพแค่ไหน) · Brand Identity/Image (ที่ตั้งใจ vs ที่รับรู้) · Loyalty (ผูกพันแค่ไหน). เหมาะกับงานวิจัยที่ต้องการ snapshot ภาพรวม + เทียบกับคู่แข่งบนแกนเดียวกัน
        </p>
      </div>
      <div>
        <MethodTag method="conjoint" short="CJ" />
        <h4 style={{ fontSize: 18, marginTop: 10, marginBottom: 8, fontFamily: 'IBM Plex Serif' }}>
          Conjoint Analysis (choice-based)
        </h4>
        <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6, margin: 0 }}>
          วัด <strong>trade-off</strong> ของผู้บริโภคโดยให้เลือกระหว่าง profile ที่มี attribute ต่างกัน เช่น ราคา / รสชาติ / ขนาด. ระบบจะคำนวณ <em>part-worth utilities</em> ออกมา ทำให้รู้ว่า attribute ไหนสำคัญสุดและตั้งราคา/ออกแบบสินค้าใหม่ได้อย่างไรให้คนซื้อจริง
        </p>
      </div>
    </div>
  </div>
);

// -- MAIN page ----------------------------------------------------------------
const UnifiedShowcasePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');  // all | brand_equity | conjoint
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
    if (item.method === 'brand_equity') {
      navigate(`/showcase/${item.share_token}`);
    } else {
      navigate(`/conjoint/results/${item.id}`);
    }
  };

  if (loading) return <div className="be-root"><BeLoading text="กำลังโหลด showcase..."/></div>;
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

  return (
    <div className="be-root">
      <BeTopbar subtitle="PUBLIC SHOWCASE" active="showcase" />
      <div className="be-page" style={{ maxWidth: 1280 }}>

        {/* HERO */}
        <section style={{ padding: '40px 0 28px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em',
                         color: '#0E5538', fontWeight: 700, marginBottom: 12 }}>
            PUBLIC RESEARCH SHOWCASE · OPEN ACCESS
          </div>
          <h1 style={{ fontFamily: 'IBM Plex Serif', fontSize: 'clamp(36px, 6vw, 60px)',
                       lineHeight: 1.05, fontWeight: 600, margin: 0, marginBottom: 16,
                       letterSpacing: '-0.02em', color: 'var(--ink, #1a1a1a)' }}>
            Marketing research, <span style={{ color: '#0E5538' }}>publicly visible.</span>
          </h1>
          <p style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 720, margin: 0 }}>
            งานวิจัยจริงจากนักศึกษา SWU — Brand Equity surveys, Conjoint Analysis experiments — เปิดให้คนทั่วไปดูได้ ไม่ต้อง login. เลือกดู topic ที่สนใจ หรือเรียนรู้ว่าวิธีต่างกันให้ insight ต่างกันยังไง
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 24,
                         fontFamily: 'JetBrains Mono', fontSize: 12 }}>
            {[
              { label: 'TOPICS',         value: totals.topics || 0 },
              { label: 'BE STUDIES',     value: totals.brand_equity || 0 },
              { label: 'CJ STUDIES',     value: totals.conjoint || 0 },
              { label: 'BE RESPONSES',   value: totals.responses || 0 },
            ].map(s => (
              <div key={s.label} data-testid={`hero-stat-${s.label.toLowerCase().replace(' ','-')}`}>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--ink)' }}>{s.value}</div>
                <div style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 22 }}>
            <button
              data-testid="showcase-share-btn"
              onClick={() => {
                const origin = window.location.origin;
                copyToClipboard(`${origin}/api/share/showcase-index`, {
                  successMessage: 'คัดลอกลิงก์แชร์แล้ว — paste ลง FB/LINE/Slack ได้เลย',
                });
              }}
              style={{
                padding: '9px 16px', fontSize: 12, fontWeight: 600,
                fontFamily: 'JetBrains Mono', letterSpacing: '0.06em',
                background: '#0E5538', color: '#fff', border: 'none',
                borderRadius: 4, cursor: 'pointer', transition: 'all 180ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0a3f29'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0E5538'; }}
            >
              ⤴ SHARE THIS PAGE
            </button>
          </div>
        </section>

        {/* FEATURED MULTI-METHOD TOPICS */}
        {featured.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em',
                           color: '#0E5538', fontWeight: 700, marginBottom: 6 }}>
              ★ FEATURED — STUDIED WITH MULTIPLE METHODS
            </div>
            <h2 style={{ fontFamily: 'IBM Plex Serif', fontSize: 30, fontWeight: 600,
                         margin: 0, marginBottom: 18 }}>
              เปรียบเทียบสองวิธีบน topic เดียวกัน
            </h2>
            <div style={{ display: 'grid', gap: 20,
                           gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
              {featured.map(t => (
                <FeaturedTopicCard key={t.topic} topic={t} onOpen={open}/>
              ))}
            </div>
          </section>
        )}

        {/* ALL STUDIES — tab filter */}
        <section style={{ marginTop: 48 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                         flexWrap: 'wrap', gap: 12, marginBottom: 18, borderBottom: '1px solid var(--rule)',
                         paddingBottom: 12 }}>
            <h2 style={{ fontFamily: 'IBM Plex Serif', fontSize: 26, fontWeight: 600, margin: 0 }}>
              งานวิจัยทั้งหมด
            </h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'all',          label: `ทั้งหมด (${beItems.length + cjItems.length})` },
                { id: 'brand_equity', label: `Brand Equity (${beItems.length})` },
                { id: 'conjoint',     label: `Conjoint (${cjItems.length})` },
              ].map(t => (
                <button key={t.id} data-testid={`showcase-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '7px 14px', fontSize: 12, fontWeight: 600,
                    border: '1px solid ' + (tab === t.id ? '#0E5538' : 'var(--rule)'),
                    background: tab === t.id ? '#0E5538' : 'transparent',
                    color: tab === t.id ? '#fff' : 'var(--ink-2)',
                    cursor: 'pointer', fontFamily: 'JetBrains Mono', borderRadius: 4,
                    transition: 'all 180ms ease',
                  }}
                >{t.label}</button>
              ))}
            </div>
          </div>
          {filteredCombined.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>
              ยังไม่มี studies ใน category นี้
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16,
                           gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filteredCombined.map(it => (
                <ShowcaseCard key={`${it.method}-${it.id}`} item={it} onOpen={() => open(it)}/>
              ))}
            </div>
          )}
        </section>

        <MethodsPrimer />

        <div style={{ padding: '32px 0 40px', textAlign: 'center', fontSize: 12,
                       color: 'var(--ink-3)', fontFamily: 'JetBrains Mono' }}>
          <Link to="/" style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
};

export default UnifiedShowcasePage;

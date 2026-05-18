import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { BeTopbar, BeLoading } from './brand-equity/be-components';
import SlideMedia from '../components/SlideMedia';
import './brand-equity/brand-equity-styles.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
};

const AnnouncementCard = ({ p }) => {
  const hasMedia = (p.media || []).length > 0;
  return (
    <article
      data-testid={`announcement-card-${p.id}`}
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(10,10,10,0.15)',
        padding: 0, overflow: 'hidden',
        display: 'grid', gap: 0,
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}
      className="md:!grid-cols-[5fr_7fr]"
    >
      <div style={{ minHeight: 220, position: 'relative', background: '#0A0A0A' }}>
        {hasMedia ? (
          <SlideMedia
            media={p.media}
            fallbackImage={p.cover_image}
            fallbackAlt={p.title}
            fallbackCaption={p.cover_caption}
            interval={5500}
            testid={`announcement-${p.id}-media`}
          />
        ) : p.cover_image ? (
          <img src={p.cover_image} alt={p.title}
               style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}/>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#888', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
            NO COVER
          </div>
        )}
        {p.pinned_to_home && (
          <div style={{ position: 'absolute', top: 16, left: 16,
                        padding: '6px 12px', background: '#F6C445', color: '#0A0A0A',
                        fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: '0.16em',
                        fontWeight: 700, textTransform: 'uppercase' }}>
            📌 PINNED ON HOME
          </div>
        )}
      </div>
      <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: '0.18em',
                         color: '#4A4A4A', fontWeight: 700, marginBottom: 14, textTransform: 'uppercase' }}>
            📣 {p.category || 'ประชาสัมพันธ์'} · {formatDate(p.published_at || p.created_at)}
          </div>
          <h3 style={{ margin: 0, fontFamily: 'IBM Plex Serif, serif',
                       fontSize: 'clamp(22px, 2.5vw, 30px)', fontWeight: 500,
                       lineHeight: 1.15, letterSpacing: '-0.015em', color: '#0A0A0A' }}>
            {p.title}
          </h3>
          {p.excerpt && (
            <p style={{ marginTop: 14, fontSize: 14, color: '#4A4A4A', lineHeight: 1.65 }}>
              {p.excerpt}
            </p>
          )}
        </div>
        {p.slug && (
          <Link to={`/learn/${p.slug}`}
                data-testid={`announcement-read-${p.id}`}
                style={{ marginTop: 18, alignSelf: 'flex-start',
                         padding: '10px 18px', fontSize: 11, fontWeight: 700,
                         fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.16em',
                         background: '#0A0A0A', color: '#FFFFFF', textDecoration: 'none',
                         textTransform: 'uppercase' }}>
            อ่านต่อ →
          </Link>
        )}
      </div>
    </article>
  );
};

const AnnouncementsPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/cms/posts/public?type=announcement&limit=100`);
        setItems(r.data?.items || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>
        <BeTopbar subtitle="ประชาสัมพันธ์" publicMode />
        <BeLoading text="กำลังโหลด..."/>
      </div>
    );
  }

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh', color: '#0A0A0A' }}>
      <BeTopbar subtitle="ประชาสัมพันธ์" publicMode />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }} className="md:!px-12">
        {/* Hero */}
        <section style={{ paddingBottom: 32, borderBottom: '1px solid rgba(10,10,10,0.15)' }}>
          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.20em',
                         color: '#0A0A0A', fontWeight: 700, marginBottom: 16,
                         display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 32, height: 1, background: '#0A0A0A' }}/>
            ARCHIVE · ANNOUNCEMENTS
            <span style={{ color: '#8A8A8A' }}>· {items.length} RECORDS</span>
          </div>
          <h1 style={{ fontFamily: 'IBM Plex Serif, serif',
                       fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 500,
                       margin: 0, lineHeight: 0.98, letterSpacing: '-0.03em',
                       color: '#0A0A0A' }}>
            ประชาสัมพันธ์<br/>
            <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#4A4A4A' }}>กิจกรรม</span>
            <span style={{ display: 'inline-block', width: '0.4em', height: '0.4em',
                            background: '#C8102E', marginLeft: 8, marginBottom: 6,
                            verticalAlign: 'middle' }}/>
            <br/>
            <span style={{ color: '#4A4A4A' }}>นิสิต · อาจารย์</span>
          </h1>
          <p style={{ marginTop: 24, fontSize: 16, color: '#4A4A4A', lineHeight: 1.6, maxWidth: 580 }}>
            รวมข่าวสาร กิจกรรม และผลงานวิจัยจากนักศึกษาและคณาจารย์
            สาขาการตลาด มศว — เก็บย้อนหลังให้กลับมาดูได้ทุกเมื่อ
          </p>
        </section>

        {/* Grid */}
        <section style={{ marginTop: 36, display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {items.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#8A8A8A',
                          fontFamily: 'JetBrains Mono', letterSpacing: '0.10em', fontSize: 12,
                          border: '1px dashed rgba(10,10,10,0.15)' }}>
              ยังไม่มีประชาสัมพันธ์
            </div>
          ) : (
            items.map(p => <AnnouncementCard key={p.id} p={p}/>)
          )}
        </section>

        <footer style={{ padding: '40px 0', marginTop: 40,
                         borderTop: '1px solid rgba(10,10,10,0.15)',
                         display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                         flexWrap: 'wrap', gap: 12,
                         fontSize: 10, color: '#8A8A8A', fontFamily: 'JetBrains Mono',
                         letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <span>SWU · MARKETING RESEARCH LAB</span>
          <Link to="/" style={{ color: '#0A0A0A', textDecoration: 'underline' }}>← Back to home</Link>
        </footer>
      </div>
    </div>
  );
};

export default AnnouncementsPage;

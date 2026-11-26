import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Topbar, Footer, Eyebrow } from '@/pages/swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import { useSiteText } from '@/hooks/useSiteText';
import { usePublications } from '@/hooks/queries';
import { PaperRow } from '@/pages/people/peopleShared';

/**
 * /publications — the department's research output in one list.
 *
 * Not /research: robots.txt disallows /research/ because the conjoint tools
 * live there, so a page at that path could never be indexed.
 *
 * Co-authored papers appear once, with every one of the department's authors
 * linked — which is the picture a search engine should form of a department:
 * people who publish together, under one roof.
 */
const PublicationsPage = () => {
  const t = useSiteText();
  const [year, setYear] = useState('');
  const [faculty, setFaculty] = useState('');
  const { data, isLoading } = usePublications({ year, faculty });
  const items = data?.items || [];
  const people = data?.faculty || {};
  const years = data?.years || [];

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  useDocumentMeta({
    title: 'ผลงานตีพิมพ์ สาขาการตลาด มศว · Publications · SWU MKT',
    description: 'ผลงานวิจัยและบทความวิชาการตีพิมพ์ของคณาจารย์ภาควิชาการตลาดและการจัดการ มหาวิทยาลัยศรีนครินทรวิโรฒ พร้อมลิงก์ไปอ่านฉบับเต็ม',
    image: SWU_LOGO_URL,
    url: `${origin}/publications`,
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'ผลงานตีพิมพ์ สาขาการตลาด มศว',
      url: `${origin}/publications`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.slice(0, 100).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'ScholarlyArticle',
            name: p.title,
            ...(p.year ? { datePublished: String(p.year) } : {}),
            ...(p.url ? { url: p.url } : {}),
            author: (p.faculty_ids || []).filter(id => people[id]).map(id => ({
              '@id': `${origin}/people/${people[id].slug}#person`,
            })),
          },
        })),
      },
    },
  });

  const select = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--rule)',
    background: 'transparent', font: 'inherit', fontSize: 14,
  };

  return (
    <div data-testid="publications-index">
      <Topbar active="people" />

      <section className="swu-container" style={{ padding: '72px 32px 24px' }}>
        <Eyebrow red>● {t('publications.eyebrow', 'Publications')} · {data?.total ?? '…'} เรื่อง</Eyebrow>
        <h1 className="h-display" style={{ marginTop: 24, maxWidth: '16ch' }}>
          {t('publications.heading', 'งานวิจัย')}<br/>
          <span className="italic-accent">{t('publications.headingAccent', 'ที่อ่านได้จริง')}</span>.
        </h1>
        <p className="lede" style={{ fontSize: 19, marginTop: 28, maxWidth: '62ch' }}>
          {t('publications.lede',
             'ผลงานตีพิมพ์ของคณาจารย์ — คลิกชื่อเรื่องเพื่อไปอ่านที่วารสารต้นทาง ชิ้นที่เป็น Open Access อ่านได้ฟรีทันที')}
        </p>
      </section>

      <section className="swu-container" style={{ padding: '8px 32px 72px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <label className="be-tiny" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            ปี
            <select value={year} onChange={e => setYear(e.target.value)} style={select}
                    data-testid="pub-year">
              <option value="">ทั้งหมด</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="be-tiny" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            อาจารย์
            <select value={faculty} onChange={e => setFaculty(e.target.value)} style={select}
                    data-testid="pub-faculty">
              <option value="">ทุกท่าน</option>
              {Object.values(people).map(p => (
                <option key={p.slug} value={p.slug}>{p.display_name_th}</option>
              ))}
            </select>
          </label>
        </div>

        {isLoading && <p style={{ color: 'var(--ink-3)' }}>กำลังโหลด…</p>}
        {!isLoading && items.length === 0 && (
          <p style={{ color: 'var(--ink-3)' }}>ไม่มีผลงานตามเงื่อนไขนี้</p>
        )}
        <ol style={{ padding: 0, margin: 0 }}>
          {items.map(p => <PaperRow key={p.id} paper={p} people={people} />)}
        </ol>

        <p style={{ marginTop: 32 }}>
          <Link to="/people" className="link-arrow link-arrow--red">← คณาจารย์ทั้งหมด</Link>
        </p>
      </section>

      <Footer />
    </div>
  );
};

export default PublicationsPage;

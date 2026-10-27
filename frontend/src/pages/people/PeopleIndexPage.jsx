import React from 'react';
import { Link } from 'react-router-dom';
import { Topbar, Footer, Eyebrow } from '@/pages/swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import { useSiteText } from '@/hooks/useSiteText';
import { useFaculty } from '@/hooks/queries';
import { Portrait } from '@/pages/people/peopleShared';

/**
 * /people — the department's lecturers.
 *
 * Exists for one reason the audit made plain: a department's reputation is
 * the sum of names a search engine can find, and this site had no page for
 * any of them. Each card links to a profile with its own URL, JSON-LD Person
 * and publication list, and this index ties them together as one department.
 */
const PeopleIndexPage = () => {
  const t = useSiteText();
  const { data: people = [], isLoading } = useFaculty();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  useDocumentMeta({
    title: 'คณาจารย์ สาขาการตลาด มศว · Faculty · SWU MKT',
    description: 'คณาจารย์ภาควิชาการตลาดและการจัดการ มหาวิทยาลัยศรีนครินทรวิโรฒ — ความเชี่ยวชาญ ผลงานวิจัย และบทความตีพิมพ์ของอาจารย์แต่ละท่าน',
    image: SWU_LOGO_URL,
    url: `${origin}/people`,
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'คณาจารย์ สาขาการตลาด มศว',
      url: `${origin}/people`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: people.length,
        itemListElement: people.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${origin}/people/${p.slug}`,
          name: p.display_name_th,
        })),
      },
    },
  });

  return (
    <div data-testid="people-index">
      <Topbar active="people" />

      <section className="swu-container" style={{ padding: '72px 32px 24px' }}>
        <Eyebrow red>● {t('people.eyebrow', 'Faculty')} · {people.length} คน</Eyebrow>
        <h1 className="h-display" style={{ marginTop: 24, maxWidth: '16ch' }}>
          {t('people.heading', 'คนที่อยู่')}<br/>
          <span className="italic-accent">{t('people.headingAccent', 'เบื้องหลังงานวิจัย')}</span>.
        </h1>
        <p className="lede" style={{ fontSize: 19, marginTop: 28, maxWidth: '62ch' }}>
          {t('people.lede',
             'คณาจารย์ภาควิชาการตลาดและการจัดการ มหาวิทยาลัยศรีนครินทรวิโรฒ — ทุกท่านมีหน้าของตัวเอง พร้อมความเชี่ยวชาญและผลงานตีพิมพ์ที่เปิดอ่านได้')}
        </p>
        <p style={{ marginTop: 18 }}>
          <Link to="/publications" className="link-arrow link-arrow--red">ดูผลงานตีพิมพ์ทั้งหมด →</Link>
        </p>
      </section>

      <section className="swu-container" style={{ padding: '24px 32px 72px' }}>
        {isLoading && <p style={{ color: 'var(--ink-3)' }}>กำลังโหลด…</p>}
        <div className="people-grid"
             style={{ display: 'grid', gap: 40,
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
          {people.map((p, i) => (
            <Link key={p.id} to={`/people/${p.slug}`} className="ed-card"
                  data-testid={`people-card-${p.slug}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <Portrait faculty={p} size={240} priority={i < 4} />
              <div className="ed-card__meta" style={{ marginTop: 16 }}>
                <span className="ed-card__cat">{p.rank_en || p.rank_th}</span>
                {p.paper_count > 0 && <span className="ed-card__time">{p.paper_count} PAPERS</span>}
              </div>
              <h2 className="ed-card__title" style={{ fontSize: 21 }}>{p.display_name_th}</h2>
              <p style={{ margin: '4px 0 10px', fontSize: 14, color: 'var(--ink-3)' }}>
                {p.display_name_en}
              </p>
              {!!(p.research_areas || []).length && (
                <p className="ed-card__excerpt" style={{ fontSize: 14 }}>
                  {p.research_areas.slice(0, 3).map(a => a.th || a.en).join(' · ')}
                </p>
              )}
              <span className="ed-card__cta">ดูโปรไฟล์ →</span>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PeopleIndexPage;

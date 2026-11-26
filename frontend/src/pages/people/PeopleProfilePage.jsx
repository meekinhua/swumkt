import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Topbar, Footer, Eyebrow } from '@/pages/swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import { useFacultyProfile } from '@/hooks/queries';
import ShareBar from '@/components/ShareBar';
import {
  Portrait, ProtectedEmail, ProfileLinks, PaperRow, photoSrc,
} from '@/pages/people/peopleShared';

const SAME_AS = ['orcid', 'scholar', 'scopus', 'researchgate', 'openalex', 'linkedin'];

/**
 * The structured data a search engine needs to treat this page as the
 * canonical home of a real, named researcher.
 *
 * Mirrors `_person_ld` / `_paper_ld` in backend/routes/share.py, which serves
 * the same graph to crawlers that do not run JavaScript. Googlebot does run
 * it, and reads this one on the canonical URL. Keep the two in step: the
 * point is that every page about this person agrees on who they are.
 */
const compact = (o) => Object.fromEntries(Object.entries(o).filter(
  ([, v]) => !(v === undefined || v === null || v === '' ||
               (Array.isArray(v) && v.length === 0))));

const buildGraph = (origin, f, papers, colleagues) => {
  const canonical = `${origin}/people/${f.slug}`;
  const personId = `${canonical}#person`;
  const idFor = (fid) => fid === f.id ? personId
    : colleagues[fid] ? `${origin}/people/${colleagues[fid].slug}#person` : null;

  const org = {
    '@type': 'CollegeOrUniversity',
    name: f.department_th, alternateName: f.department_en,
    parentOrganization: {
      '@type': 'CollegeOrUniversity', name: 'มหาวิทยาลัยศรีนครินทรวิโรฒ',
      alternateName: 'Srinakharinwirot University', url: 'https://www.swu.ac.th',
    },
  };
  const raw = photoSrc(f.photo);
  const img = raw && !raw.startsWith('data:') ? raw : null;
  const person = compact({
    '@type': 'Person', '@id': personId, url: canonical,
    name: f.name_th || f.name_en,
    alternateName: [f.name_en, f.display_name_th, f.display_name_en].filter(Boolean),
    honorificPrefix: f.title_th, jobTitle: f.rank_en || f.rank_th,
    worksFor: org, affiliation: org,
    knowsAbout: (f.research_areas || []).flatMap(a => [a.en, a.th]).filter(Boolean),
    sameAs: SAME_AS.map(k => f.links?.[k]).filter(Boolean),
    ...(img ? { image: img.startsWith('http') ? img : `${origin}${img}` } : {}),
  });

  // Match our own lecturers among the listed authors by English name, so the
  // paper points at the same Person entity as their profile page.
  const nameToId = {};
  for (const fid of new Set(papers.flatMap(p => p.faculty_ids || []))) {
    const n = fid === f.id ? f.name_en : colleagues[fid]?.name_en;
    if (n) nameToId[n.toLowerCase()] = fid;
  }
  const scholarly = papers.slice(0, 40).map(p => compact({
    '@type': 'ScholarlyArticle',
    headline: (p.title || '').slice(0, 240), name: p.title,
    author: (p.authors || []).map(a => {
      const fid = nameToId[(a || '').toLowerCase()];
      const id = fid && idFor(fid);
      return id ? { '@id': id } : { '@type': 'Person', name: a };
    }),
    ...(p.year ? { datePublished: String(p.year) } : {}),
    ...(p.url ? { url: p.url } : {}),
    ...(p.venue ? { isPartOf: { '@type': 'Periodical', name: p.venue } } : {}),
    ...(p.doi ? {
      identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi },
      sameAs: `https://doi.org/${p.doi}`,
    } : {}),
    isAccessibleForFree: !!p.open_access,
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'ProfilePage', '@id': canonical, url: canonical,
        name: f.display_name_th, inLanguage: 'th-TH', mainEntity: { '@id': personId } },
      person,
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'หน้าแรก', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'คณาจารย์', item: `${origin}/people` },
        { '@type': 'ListItem', position: 3, name: f.display_name_th, item: canonical },
      ] },
      ...scholarly,
    ],
  };
};

const Stat = ({ value, label }) => (
  <div>
    <div className="serif" style={{ fontSize: 34, lineHeight: 1, fontWeight: 500 }}>{value}</div>
    <div className="be-tiny" style={{ marginTop: 6, color: 'var(--ink-3)', letterSpacing: '.08em',
                                      textTransform: 'uppercase', fontSize: 11 }}>{label}</div>
  </div>
);

const PeopleProfilePage = () => {
  const { slug } = useParams();
  const { data, isLoading, error } = useFacultyProfile(slug);
  const f = data?.faculty;
  const papers = useMemo(() => data?.papers || [], [data]);
  const colleagues = data?.colleagues || {};
  const metrics = data?.metrics || {};

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const areas = (f?.research_areas || []).slice(0, 3).map(a => a.th).filter(Boolean).join(', ');
  useDocumentMeta(f ? {
    // The name a person would type into Google, first, in both scripts.
    title: `${f.display_name_th} (${f.name_en}) · คณาจารย์ การตลาด มศว`,
    description: `${f.display_name_th} — ${f.rank_th || ''} ${f.department_th || ''} มหาวิทยาลัยศรีนครินทรวิโรฒ`
      + (areas ? ` · ความเชี่ยวชาญ: ${areas}` : '')
      + (papers.length ? ` · ผลงานตีพิมพ์ ${papers.length} เรื่อง` : ''),
    image: photoSrc(f.photo) || undefined,
    url: `${origin}/people/${f.slug}`,
    type: 'profile',
    jsonLd: buildGraph(origin, f, papers, colleagues),
  } : { title: 'คณาจารย์ · SWU MKT' });

  if (error && error?.response?.status !== 404) {
    return (
      <div><Topbar active="people" />
        <section className="swu-container" style={{ padding: '96px 32px' }}>
          <h1 className="h-section">โหลดโปรไฟล์ไม่สำเร็จ</h1>
          <p style={{ color: 'var(--ink-3)' }}>ลองรีเฟรชหน้านี้อีกครั้ง</p>
          <p><Link to="/people">← กลับไปหน้าคณาจารย์</Link></p>
        </section><Footer /></div>
    );
  }
  if (error?.response?.status === 404) {
    return (
      <div><Topbar active="people" />
        <section className="swu-container" style={{ padding: '96px 32px' }}>
          <h1 className="h-section">ไม่พบโปรไฟล์นี้</h1>
          <p><Link to="/people">← กลับไปหน้าคณาจารย์</Link></p>
        </section><Footer /></div>
    );
  }

  return (
    <div data-testid="people-profile">
      <Topbar active="people" />

      {isLoading || !f ? (
        <section className="swu-container" style={{ padding: '96px 32px' }}>
          <p style={{ color: 'var(--ink-3)' }}>กำลังโหลด…</p>
        </section>
      ) : (
        <>
          <nav className="swu-container be-tiny" aria-label="breadcrumb"
               style={{ padding: '28px 32px 0', color: 'var(--ink-3)', fontSize: 12.5 }}>
            <Link to="/" style={{ color: 'inherit' }}>หน้าแรก</Link> /{' '}
            <Link to="/people" style={{ color: 'inherit' }}>คณาจารย์</Link> /{' '}
            <span>{f.display_name_th}</span>
          </nav>

          <section className="swu-container hero-grid"
                   style={{ padding: '40px 32px 48px', display: 'grid', gap: 56,
                            gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)',
                            alignItems: 'start' }}>
            <Portrait faculty={f} size={260} priority />
            <div>
              <Eyebrow red>● {f.rank_en || f.rank_th}</Eyebrow>
              <h1 className="h-display" style={{ marginTop: 18, fontSize: 'clamp(34px, 4.6vw, 58px)' }}>
                {f.display_name_th}
              </h1>
              <p className="serif" style={{ fontSize: 20, margin: '10px 0 0', color: 'var(--ink-2)' }}>
                {f.display_name_en}
              </p>
              <p style={{ margin: '18px 0 0', fontSize: 15.5, color: 'var(--ink-2)', maxWidth: '60ch' }}>
                {f.bio_th}
              </p>

              {!!(f.research_areas || []).length && (
                <div style={{ marginTop: 26 }}>
                  <div className="be-tiny" style={{ color: 'var(--ink-3)', marginBottom: 10,
                                                    letterSpacing: '.08em', fontSize: 11 }}>
                    ความเชี่ยวชาญ · RESEARCH AREAS
                  </div>
                  <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 0, margin: 0 }}>
                    {f.research_areas.map((a, i) => (
                      <li key={i} style={{ listStyle: 'none', padding: '7px 14px', borderRadius: 999,
                                            background: 'var(--paper-2, #F2EEE6)', fontSize: 14 }}>
                        {a.th}{a.en && <span style={{ color: 'var(--ink-3)' }}> · {a.en}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {metrics.papers > 0 && (
                <div style={{ display: 'flex', gap: 44, marginTop: 30, flexWrap: 'wrap' }}>
                  <Stat value={metrics.papers} label="ผลงานตีพิมพ์" />
                  <Stat value={metrics.citations} label="การอ้างอิง" />
                  <Stat value={metrics.open_access} label="เปิดอ่านฟรี" />
                </div>
              )}

              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ProfileLinks links={f.links} />
                {f.has_email && (
                  <p style={{ margin: 0, fontSize: 14 }}>
                    อีเมล: <ProtectedEmail slug={f.slug} />
                  </p>
                )}
              </div>
              <ShareBar kind="people" idOrSlug={f.slug} title={f.display_name_th} compact />
            </div>
          </section>

          {data.articles?.length > 0 && (
            <section className="swu-container" style={{ padding: '0 32px 40px' }}>
              <h2 className="h-section" style={{ fontSize: 28 }}>บทความใน Knowledge Hub</h2>
              <ul style={{ padding: 0, margin: '12px 0 0' }}>
                {data.articles.map(a => (
                  <li key={a.slug} style={{ listStyle: 'none', padding: '14px 0',
                                            borderTop: '1px solid var(--rule)' }}>
                    <Link to={`/learn/${a.slug}`} className="serif"
                          style={{ fontSize: 18, color: 'inherit' }}>{a.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="swu-container" style={{ padding: '0 32px 80px' }}
                   aria-labelledby="pubs">
            <h2 id="pubs" className="h-section" style={{ fontSize: 28 }}>
              ผลงานตีพิมพ์ <span style={{ color: 'var(--ink-3)', fontSize: 18 }}>· Publications</span>
            </h2>
            {papers.length === 0 ? (
              <p style={{ color: 'var(--ink-3)' }}>ยังไม่มีรายการผลงานในระบบ</p>
            ) : (
              <ol style={{ padding: 0, margin: '12px 0 0' }}>
                {papers.map(p => (
                  <PaperRow key={p.id} paper={p} people={colleagues} selfId={f.id} />
                ))}
              </ol>
            )}
            <p className="be-tiny" style={{ marginTop: 22, color: 'var(--ink-3)', fontSize: 12 }}>
              รายการรวบรวมจาก ORCID และ OpenAlex · จำนวนการอ้างอิงเป็นตัวเลข ณ วันที่ดึงข้อมูล
            </p>
          </section>
        </>
      )}

      <Footer />
    </div>
  );
};

export default PeopleProfilePage;

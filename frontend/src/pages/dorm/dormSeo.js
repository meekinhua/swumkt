import { useEffect } from 'react';

export const SWU_CAMPUS = {
  slug: 'swu-prasarnmit',
  status: 'active',
  short_th: 'มศว',
  name_th: 'มศว ประสานมิตร',
  full_th: 'มหาวิทยาลัยศรีนครินทรวิโรฒ ประสานมิตร',
  name_en: 'SWU Prasarnmit',
  area_th: 'อโศก–เพชรบุรี',
  city_th: 'กรุงเทพฯ',
  base_path: '/dorm',
  email_domains: ['g.swu.ac.th', 'swu.ac.th'],
};

export const campusOf = (meta) => (meta?.campus?.slug ? meta.campus : SWU_CAMPUS);

export const canonicalUrl = (path = '/dorm', keepParams = []) => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const p = new URLSearchParams(window.location.search);
  const kept = new URLSearchParams();
  keepParams.forEach((k) => {
    const v = p.get(k);
    if (v) kept.set(k, v);
  });
  const qs = kept.toString();
  return `${origin}${path}${qs ? `?${qs}` : ''}`;
};

const upsertHeadEl = (selector, tag, attrs, dataAttr) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    if (dataAttr) el.setAttribute(dataAttr, '1');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null || v === '') el.removeAttribute(k);
    else el.setAttribute(k, v);
  });
  return el;
};

export function useDormSeo({
  title,
  description,
  canonical,
  image,
  type = 'website',
  robots = 'index, follow',
  jsonLd = null,
  campus = SWU_CAMPUS,
} = {}) {
  const c = campus || SWU_CAMPUS;
  const siteTitle = `หาห้อง หาเมท ${c.short_th}`;
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const defaultDesc = `หอพัก คอนโด อพาร์ตเมนต์รอบ ${c.name_th} (${c.area_th}) พร้อมรีวิวตึก เวลาเดินทาง ราคาต่อคน ประกาศส่งต่อสัญญา และบอร์ดหารูมเมท มศว ฟรี`;
  const desc = description || defaultDesc;
  const jsonText = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const prevTitle = document.title;
    document.title = fullTitle;

    const origin = window.location.origin;
    const ogImg = image || `${origin}/dorm/og/default.png`;
    const url = canonical || canonicalUrl(window.location.pathname);

    upsertHeadEl('meta[name="description"]', 'meta', { name: 'description', content: desc });
    const robotsEl = upsertHeadEl('meta[name="robots"]', 'meta', { name: 'robots', content: robots || 'index, follow' }, 'data-dorm-robots');
    upsertHeadEl('link[rel="canonical"]', 'link', { rel: 'canonical', href: url }, 'data-dorm-canon');
    upsertHeadEl('meta[property="og:type"]', 'meta', { property: 'og:type', content: type });
    upsertHeadEl('meta[property="og:site_name"]', 'meta', { property: 'og:site_name', content: siteTitle });
    upsertHeadEl('meta[property="og:title"]', 'meta', { property: 'og:title', content: fullTitle });
    upsertHeadEl('meta[property="og:description"]', 'meta', { property: 'og:description', content: desc });
    upsertHeadEl('meta[property="og:image"]', 'meta', { property: 'og:image', content: ogImg });
    upsertHeadEl('meta[property="og:url"]', 'meta', { property: 'og:url', content: url });
    upsertHeadEl('meta[name="twitter:card"]', 'meta', { name: 'twitter:card', content: 'summary_large_image' });
    upsertHeadEl('meta[name="twitter:title"]', 'meta', { name: 'twitter:title', content: fullTitle });
    upsertHeadEl('meta[name="twitter:description"]', 'meta', { name: 'twitter:description', content: desc });
    upsertHeadEl('meta[name="twitter:image"]', 'meta', { name: 'twitter:image', content: ogImg });

    let ldEl = null;
    if (jsonText) {
      document.head.querySelectorAll('script[data-dorm-jsonld="1"]').forEach((n) => n.remove());
      ldEl = document.createElement('script');
      ldEl.type = 'application/ld+json';
      ldEl.setAttribute('data-dorm-jsonld', '1');
      ldEl.text = jsonText;
      document.head.appendChild(ldEl);
    }

    return () => {
      document.title = prevTitle;
      if (ldEl && ldEl.parentNode) ldEl.parentNode.removeChild(ldEl);
      if (robotsEl && robotsEl.getAttribute('data-dorm-robots') === '1' && robotsEl.parentNode) {
        robotsEl.parentNode.removeChild(robotsEl);
      }
    };
  }, [fullTitle, desc, canonical, image, type, robots, jsonText, siteTitle]);
}

export const breadcrumbJsonLd = (items) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://swumkt.org';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: it.name,
      item: `${origin}${it.path}`,
    })),
  };
};

export const homeJsonLd = (campus = SWU_CAMPUS, stats = null) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://swumkt.org';
  const c = campus || SWU_CAMPUS;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: `หาห้อง หาเมท ${c.short_th} (${c.name_en})`,
      url: `${origin}${c.base_path || '/dorm'}`,
      description: `รวมหอพัก คอนโด อพาร์ตเมนต์รอบ ${c.full_th} (${c.area_th}) พร้อมบอร์ดหารูมเมทและรีวิวตึกฟรี`,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/dorm/rooms?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `หอพักรอบ ${c.name_th} ราคาเริ่มต้นประมาณเท่าไหร่?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `หอพักและอพาร์ตเมนต์รอบ ${c.name_th} (อโศก เพชรบุรี ดินแดง ห้วยขวาง พระราม 9) เริ่มต้นราว 3,500–6,000 บาท/เดือน หรือแชร์คอนโดกับเมทตกคนละ 4,500–7,500 บาท/เดือน${stats?.listings ? ` ปัจจุบันมีห้องเปิดให้เลือก ${stats.listings} รายการ` : ''}`,
          },
        },
        {
          '@type': 'Question',
          name: `หารูมเมท ${c.short_th} ต้องใช้อีเมลมหาวิทยาลัย (@g.swu.ac.th) สมัครไหม?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'สามารถใช้ Gmail ส่วนตัวสมัครเป็นบัญชีหลักได้เลย และกดยืนยันตัวตนด้วยบัญชี Google @g.swu.ac.th เพิ่มภายหลัง 1 คลิกเพื่อรับป้ายยืนยันนิสิต มศว ทันที',
          },
        },
        {
          '@type': 'Question',
          name: 'ใช้งานบอร์ดหาห้อง หาเมท เสียค่าบริการหรือมีค่านายหน้าไหม?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'ใช้งานฟรี 100% ทั้งการค้นหาห้อง ดูรีวิวตึก ลงประกาศ และหารูมเมท ไม่มีค่านายหน้า',
          },
        },
      ],
    },
  ];
};

export const collectionJsonLd = (title, description, url, extra = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: title,
  description,
  url,
  ...extra,
});

export const buildingJsonLd = (b, campus = SWU_CAMPUS, lowestPer = null) => {
  if (!b) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://swumkt.org';
  const c = campus || SWU_CAMPUS;
  const img = (b.photos || [])[0]?.url;
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'ApartmentComplex',
    name: b.name,
    url: `${origin}/dorm/buildings/${b.slug}`,
    description: b.web_review_summary || `${b.name} ที่พักและรีวิวหอพักใกล้ ${c.name_th} (${c.area_th})`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: c.city_th || 'กรุงเทพฯ',
      addressCountry: 'TH',
      streetAddress: b.transit || c.area_th,
    },
    ...(img ? { image: img } : {}),
    ...(b.review_count > 0 && b.overall ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: b.overall,
        bestRating: 5,
        worstRating: 1,
        reviewCount: b.review_count,
      },
    } : {}),
    ...(lowestPer ? { priceRange: `เริ่มต้น ${lowestPer.toLocaleString()} บาท/คน/เดือน` } : b.price_seen ? { priceRange: b.price_seen } : {}),
  };
  return [doc, breadcrumbJsonLd([
    { name: `หาห้อง หาเมท ${c.short_th}`, path: '/dorm' },
    { name: 'รีวิวตึก', path: '/dorm/buildings' },
    { name: b.name, path: `/dorm/buildings/${b.slug}` },
  ])];
};

export const roomJsonLd = (x, b, title, price, campus = SWU_CAMPUS) => {
  if (!x) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://swumkt.org';
  const c = campus || SWU_CAMPUS;
  const ownPhoto = (x.photo_links || []).find((p) => p.startsWith('/api/dorm/photos/'));
  const img = ownPhoto ? `${origin}${ownPhoto}` : x.ext_photos?.[0]?.url || (b?.photos || [])[0]?.url;
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    name: title,
    url: `${origin}/dorm/rooms/${x.id}`,
    description: `${title}${b?.name ? ` · ${b.name}` : ''} ใกล้ ${c.name_th}`,
    ...(x.size_sqm ? { floorSize: { '@type': 'QuantitativeValue', value: x.size_sqm, unitCode: 'MTK' } } : {}),
    ...(x.bedrooms != null ? { numberOfBedrooms: x.bedrooms } : {}),
    ...(img ? { image: img } : {}),
    ...(price ? {
      offers: {
        '@type': 'Offer',
        price: Number(price),
        priceCurrency: 'THB',
        availability: x.status === 'closed' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      },
    } : {}),
  };
  return [doc, breadcrumbJsonLd([
    { name: `หาห้อง หาเมท ${c.short_th}`, path: '/dorm' },
    { name: 'ห้องว่าง', path: '/dorm/rooms' },
    { name: title, path: `/dorm/rooms/${x.id}` },
  ])];
};

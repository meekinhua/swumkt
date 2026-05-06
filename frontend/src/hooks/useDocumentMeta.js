import { useEffect } from 'react';

/**
 * Lightweight, dependency-free document head manager.
 * Sets <title>, meta tags (description, og:*, twitter:*), canonical link,
 * and an optional JSON-LD structured-data block. Cleans up on unmount so
 * pages don't bleed into each other.
 *
 * Usage:
 *   useDocumentMeta({
 *     title: 'My Page · SWU MKT',
 *     description: '...',
 *     image: 'https://.../og.png',
 *     url: window.location.href,
 *     type: 'website' | 'article' | 'profile',
 *     jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', ... }
 *   })
 */
const setMeta = (selector, attrs, createIfMissing = true) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    if (!createIfMissing) return null;
    el = document.createElement(attrs._tag || 'meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === '_tag') return;
    if (v == null) el.removeAttribute(k);
    else el.setAttribute(k, v);
  });
  return el;
};

const useDocumentMeta = ({
  title,
  description,
  image,
  url,
  type = 'website',
  siteName = 'SWU · Marketing Research',
  twitterCard = 'summary_large_image',
  jsonLd = null,
} = {}) => {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    // Standard meta description
    if (description) {
      setMeta('meta[name="description"]', { _tag: 'meta', name: 'description', content: description });
    }

    // Canonical
    if (url) {
      let canon = document.head.querySelector('link[rel="canonical"]');
      if (!canon) {
        canon = document.createElement('link');
        canon.setAttribute('rel', 'canonical');
        document.head.appendChild(canon);
      }
      canon.setAttribute('href', url);
    }

    // Open Graph
    setMeta('meta[property="og:type"]',        { _tag: 'meta', property: 'og:type',        content: type });
    setMeta('meta[property="og:site_name"]',   { _tag: 'meta', property: 'og:site_name',   content: siteName });
    if (title)       setMeta('meta[property="og:title"]',       { _tag: 'meta', property: 'og:title',       content: title });
    if (description) setMeta('meta[property="og:description"]', { _tag: 'meta', property: 'og:description', content: description });
    if (image)       setMeta('meta[property="og:image"]',       { _tag: 'meta', property: 'og:image',       content: image });
    if (url)         setMeta('meta[property="og:url"]',         { _tag: 'meta', property: 'og:url',         content: url });

    // Twitter Card
    setMeta('meta[name="twitter:card"]', { _tag: 'meta', name: 'twitter:card', content: twitterCard });
    if (title)       setMeta('meta[name="twitter:title"]',       { _tag: 'meta', name: 'twitter:title',       content: title });
    if (description) setMeta('meta[name="twitter:description"]', { _tag: 'meta', name: 'twitter:description', content: description });
    if (image)       setMeta('meta[name="twitter:image"]',       { _tag: 'meta', name: 'twitter:image',       content: image });

    // JSON-LD structured data
    let ldEl = null;
    if (jsonLd) {
      ldEl = document.createElement('script');
      ldEl.type = 'application/ld+json';
      ldEl.setAttribute('data-page-jsonld', '1');
      ldEl.text = JSON.stringify(jsonLd);
      document.head.appendChild(ldEl);
    }

    return () => {
      document.title = prevTitle;
      if (ldEl && ldEl.parentNode) ldEl.parentNode.removeChild(ldEl);
    };
    // Re-run when any meta input changes; jsonLd is stringified so deep-equality holds.
  }, [title, description, image, url, type, siteName, twitterCard, JSON.stringify(jsonLd)]);
};

export default useDocumentMeta;

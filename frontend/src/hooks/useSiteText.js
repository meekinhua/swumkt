/**
 * Strings the site owner can change on a live deploy.
 *
 * Most of this site's *content* already comes from the CMS, but the furniture
 * around it — section headings, button labels, the footer blurb — was compiled
 * into the components, so rewording any of it meant a rebuild and a redeploy.
 * `GET /api/cms/settings` returns one open document; this hook reads a value
 * out of it by dotted path.
 *
 *   const t = useSiteText();
 *   <h1>{t('learn.heading', 'อ่านเทรนด์')}</h1>
 *
 * The second argument is not a placeholder — it is the real text, and it stays
 * in the source. The settings document starts empty and usually stays mostly
 * empty: a key exists only once someone has actually overridden that string.
 * So a failed request, a cold cache, a typo in a path and a brand-new database
 * all render exactly what the site renders today, and migrating a string into
 * the CMS is a one-line change that cannot break the page.
 *
 * Write side: `PATCH /api/cms/settings` with the nested object (admin only).
 */
import { useCallback } from 'react';
import { useSiteSettings } from '@/hooks/queries';

/** Walk a dotted path; returns undefined rather than throwing on a gap. */
export const pickText = (settings, path) => {
  if (!settings || !path) return undefined;
  let cur = settings;
  for (const seg of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(seg) ? cur[Number(seg)] : cur[seg];
  }
  return cur;
};

/**
 * Returns `t(path, fallback)`.
 *
 * Only a non-empty string wins over the fallback. An empty string in the
 * settings document is far more likely to be a half-finished edit than a
 * deliberate "render nothing", and a blank heading on the live site is the
 * worse failure.
 */
export const useSiteText = () => {
  const { data: settings } = useSiteSettings();
  return useCallback((path, fallback) => {
    const v = pickText(settings, path);
    return typeof v === 'string' && v.trim() ? v : fallback;
  }, [settings]);
};

/**
 * Same lookup for values that are not strings — a list of nav items, a flag.
 * `fallback` is returned unless the stored value is a non-empty array/object.
 */
export const useSiteValue = () => {
  const { data: settings } = useSiteSettings();
  return useCallback((path, fallback) => {
    const v = pickText(settings, path);
    if (Array.isArray(v)) return v.length ? v : fallback;
    if (v && typeof v === 'object') return Object.keys(v).length ? v : fallback;
    return v === undefined || v === null ? fallback : v;
  }, [settings]);
};

export default useSiteText;

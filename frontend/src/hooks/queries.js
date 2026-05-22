/**
 * Centralised React Query hooks for high-traffic GET endpoints.
 *
 * Why a single file:
 * - Keys are reused across many pages (HomePage, Topbar, ShowcasePage, BE Dashboard).
 * - Cache invalidation needs ONE source of truth (e.g. publish a CMS post →
 *   invalidate ALL pinned-announcements consumers).
 * - Stale times tuned per data-volatility (landing config = 5 min, pinned
 *   announcements = 60 s, etc.)
 *
 * Usage:
 *   const { data: pinned } = usePinnedAnnouncements();
 *   const qc = useQueryClient();
 *   qc.invalidateQueries({ queryKey: queryKeys.pinnedAnnouncements });
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Centralised query keys — change once, invalidate everywhere
export const queryKeys = {
  landing: ['cms', 'landing'],
  pinnedAnnouncements: ['cms', 'announcements', 'pinned'],
  announcementsArchive: (params = {}) => ['cms', 'announcements', 'archive', params],
  showcaseIndex: ['showcase', 'index'],
  beShowcase: ['brand-equity', 'showcase'],
  cjShowcase: ['conjoint', 'showcase'],
  beStudies: ['brand-equity', 'studies'],
  cjStudies: ['conjoint', 'studies'],
  cmsPosts: (params = {}) => ['cms', 'posts', params],
};

const fetchJson = async (url) => {
  const r = await axios.get(url);
  return r.data;
};

// ============ Landing config (rarely changes — 5 min stale) ============
export const useLanding = () => useQuery({
  queryKey: queryKeys.landing,
  queryFn: () => fetchJson(`${API}/cms/landing`),
  staleTime: 5 * 60_000,
});

// ============ Pinned hero announcements (60s freshness) ============
export const usePinnedAnnouncements = () => useQuery({
  queryKey: queryKeys.pinnedAnnouncements,
  queryFn: () => fetchJson(`${API}/cms/announcements/pinned`),
  staleTime: 60_000,
  select: (data) => data?.items || [],
});

// ============ Public announcements archive ============
export const useAnnouncementsArchive = (params = {}) => useQuery({
  queryKey: queryKeys.announcementsArchive(params),
  queryFn: () => {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${API}/cms/posts/public?${qs}&type=announcement`);
  },
  staleTime: 60_000,
});

// ============ Unified Showcase index (already TTL-cached server-side) ============
export const useShowcaseIndex = () => useQuery({
  queryKey: queryKeys.showcaseIndex,
  queryFn: () => fetchJson(`${API}/showcase/index`),
  staleTime: 90_000,
});

// ============ Public BE / CJ showcases (already TTL-cached server-side) ============
export const useBrandEquityShowcase = () => useQuery({
  queryKey: queryKeys.beShowcase,
  queryFn: () => fetchJson(`${API}/brand-equity/showcase`),
  staleTime: 90_000,
});
export const useConjointShowcase = () => useQuery({
  queryKey: queryKeys.cjShowcase,
  queryFn: () => fetchJson(`${API}/conjoint/showcase`),
  staleTime: 90_000,
});

// ============ Hook to invalidate caches after CMS edits ============
export const useInvalidateCmsCaches = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['cms'] });
    qc.invalidateQueries({ queryKey: queryKeys.showcaseIndex });
  };
};

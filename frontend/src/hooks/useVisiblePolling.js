import { useEffect, useRef } from 'react';

/**
 * useVisiblePolling — runs `fn` every `intervalMs` while the tab is visible.
 * Automatically pauses polling when the tab is hidden (document.hidden === true)
 * and resumes when the tab becomes visible again.
 *
 * Why: prevents wasted API calls and CPU on background tabs. Multiple tabs
 * open to the same SPA otherwise compound polling load on the backend.
 *
 * Usage:
 *   useVisiblePolling(fetchUnreadCount, 30_000, [user]);
 *
 * Args:
 *   fn          — async function to invoke on each tick. Called once immediately
 *                 when polling starts, then every `intervalMs`.
 *   intervalMs  — interval in milliseconds.
 *   deps        — re-create polling loop when any dep changes (like useEffect).
 *   enabled     — optional boolean to disable polling entirely (default true).
 */
export default function useVisiblePolling(fn, intervalMs, deps = [], enabled = true) {
  const fnRef = useRef(fn);
  const intervalRef = useRef(null);

  // Always call the latest fn without re-creating the interval
  useEffect(() => { fnRef.current = fn; }, [fn]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return undefined;

    const tick = () => { try { fnRef.current(); } catch (_) { /* swallow */ } };
    const start = () => {
      if (intervalRef.current) return;
      tick(); // run immediately on (re)start
      intervalRef.current = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    // Initial state — start if visible
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [intervalMs, enabled, ...deps]);
}

/**
 * Select a conservative rendering profile before Vue mounts.
 * This is intentionally based on coarse browser hints; users can still
 * override motion preferences through the normal media query.
 */
export const getPerformanceProfile = (navigatorLike = {}) => {
  const connection = navigatorLike.connection || navigatorLike.mozConnection || navigatorLike.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  const deviceMemory = Number(navigatorLike.deviceMemory || 0);
  const hardwareConcurrency = Number(navigatorLike.hardwareConcurrency || 0);
  const lite = saveData || effectiveType === 'slow-2g' || effectiveType === '2g'
    || (deviceMemory > 0 && deviceMemory <= 2)
    || (hardwareConcurrency > 0 && hardwareConcurrency <= 2);

  return { lite, saveData, effectiveType };
};

export const applyPerformanceProfile = (windowLike = globalThis) => {
  if (!windowLike?.document?.documentElement) return { lite: false };
  const profile = getPerformanceProfile(windowLike.navigator || {});
  const root = windowLike.document.documentElement;
  root.classList.toggle('boh-perf-lite', profile.lite);
  root.dataset.performanceProfile = profile.lite ? 'lite' : 'full';
  if (windowLike.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('boh-reduced-motion');
  }
  return profile;
};

// Re-evaluate the profile when network conditions change (e.g. saveData off,
// slow-2g -> 4g) so boh-perf-lite can be lifted without a page reload.
// Module-level singleton: registered once per page lifecycle, no cleanup.
let profileWatcherRegistered = false;
let profileWatcherConnection = null;
let profileWatcherHandler = null;

export const watchPerformanceProfile = (windowLike = globalThis) => {
  if (profileWatcherRegistered) return;
  const navigatorLike = windowLike?.navigator || {};
  const connection = navigatorLike.connection
    || navigatorLike.mozConnection
    || navigatorLike.webkitConnection;
  if (typeof connection?.addEventListener !== 'function') return;

  profileWatcherRegistered = true;
  profileWatcherConnection = connection;
  profileWatcherHandler = () => applyPerformanceProfile(windowLike);
  profileWatcherConnection.addEventListener('change', profileWatcherHandler);
};

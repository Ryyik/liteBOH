export const GLOBAL_NAV_STATUS_EVENT = 'boh_global_nav_status';
export const LEGACY_ISLAND_EVENT = 'boh_island_message';

// A status can only be presented by the shared public navigation surface.
// Callers on page shells without that surface intentionally receive `false`.
export const showGlobalNavStatus = (payload = {}) => {
  if (typeof window === 'undefined' || !document.getElementById('unified-nav-container')) {
    return false;
  }

  window.dispatchEvent(new CustomEvent(GLOBAL_NAV_STATUS_EVENT, {
    detail: payload
  }));
  return true;
};

import { ref, readonly } from 'vue';

export const APP_MODE_STORAGE_KEY = 'boh_app_mode';
export const APP_MODE_RELEASE_KEY = 'boh_app_mode_release';
export const STABLE_APP_MODE = 'stable';
export const BETA5_APP_MODE = 'beta5';
export const DEFAULT_APP_MODE = BETA5_APP_MODE;
export const APP_MODE_RELEASE_VERSION = 'beta5-default';

const VALID_APP_MODES = new Set([STABLE_APP_MODE, BETA5_APP_MODE]);
const mode = ref(DEFAULT_APP_MODE);
let initialized = false;

const normalizeMode = (value) => (
  VALID_APP_MODES.has(value) ? value : DEFAULT_APP_MODE
);

const applyDocumentMode = (nextMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.bohAppMode = nextMode;
};

const readStoredMode = () => {
  try {
    const releaseVersion = window.localStorage.getItem(APP_MODE_RELEASE_KEY);
    if (releaseVersion !== APP_MODE_RELEASE_VERSION) {
      // Beta 5 is now the released default. Apply this once to stale mode
      // storage, then keep any later user-selected fallback intact.
      window.localStorage.setItem(APP_MODE_STORAGE_KEY, DEFAULT_APP_MODE);
      window.localStorage.setItem(APP_MODE_RELEASE_KEY, APP_MODE_RELEASE_VERSION);
      return DEFAULT_APP_MODE;
    }
    return normalizeMode(window.localStorage.getItem(APP_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_MODE;
  }
};

const handleStorageChange = (event) => {
  if (event.key !== APP_MODE_STORAGE_KEY) return;
  setAppMode(event.newValue, { persist: false, broadcast: true });
};

export const initAppModeManager = () => {
  if (initialized || typeof window === 'undefined') return mode.value;
  initialized = true;
  mode.value = readStoredMode();
  applyDocumentMode(mode.value);
  window.addEventListener('storage', handleStorageChange);
  return mode.value;
};

export const getAppMode = () => mode.value;

export const setAppMode = (nextMode, options = {}) => {
  const safeMode = normalizeMode(nextMode);
  const { persist = true, broadcast = true } = options;
  const changed = mode.value !== safeMode;

  mode.value = safeMode;
  applyDocumentMode(safeMode);

  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(APP_MODE_STORAGE_KEY, safeMode);
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
  }

  if (broadcast && changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('boh:app-mode-changed', {
      detail: { mode: safeMode }
    }));
  }

  return safeMode;
};

export const appModeState = readonly(mode);

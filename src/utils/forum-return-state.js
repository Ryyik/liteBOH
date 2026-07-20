const STORAGE_PREFIX = 'boh_forum_return_state';
const MAX_STATE_AGE_MS = 30 * 60 * 1000;

function normalizeKey(key = '') {
  const safeKey = String(key || '').trim().toLowerCase();
  return safeKey === 'user-space' ? 'user-space' : 'forum';
}

function getStorageKey(key = '') {
  return `${STORAGE_PREFIX}:${normalizeKey(key)}`;
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function saveForumReturnState(key = 'forum', state = {}) {
  if (!canUseSessionStorage()) return false;
  try {
    const payload = {
      ...state,
      key: normalizeKey(key),
      savedAt: Date.now()
    };
    window.sessionStorage.setItem(getStorageKey(key), JSON.stringify(payload));
    return true;
  } catch (_error) {
    return false;
  }
}

export function readForumReturnState(key = 'forum') {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > MAX_STATE_AGE_MS) {
      window.sessionStorage.removeItem(getStorageKey(key));
      return null;
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

export function clearForumReturnState(key = 'forum') {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(getStorageKey(key));
  } catch (_error) {
    // Ignore storage cleanup failures.
  }
}

export function getForumReturnKeyFromQuery(query = {}, fallback = 'forum') {
  const raw = Array.isArray(query.returnKey) ? query.returnKey[0] : query.returnKey;
  return normalizeKey(raw || fallback);
}

export function isSafePostDetailHistoryReturn(path = '', source = '') {
  const safePath = String(path || '').trim();
  const safeSource = String(source || '').trim();
  if (!safePath) return false;
  if (safeSource === 'profile') return safePath.startsWith('/profile/');
  if (safeSource === 'user-space') return safePath.startsWith('/user-space');
  if (safeSource === 'forum') {
    return safePath.startsWith('/forum') || safePath.startsWith('/user-space');
  }
  return false;
}

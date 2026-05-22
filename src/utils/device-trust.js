const LOGIN_DEVICE_ID_STORAGE_KEY = 'boh_login_device_id_v1';

const getRandomFallbackId = () => {
  const randomPartA = Math.random().toString(36).slice(2, 18);
  const randomPartB = Math.random().toString(36).slice(2, 18);
  const tsPart = Date.now().toString(36);
  return `boh-${tsPart}-${randomPartA}-${randomPartB}`;
};

const ensureLoginDeviceId = () => {
  if (typeof window === 'undefined') return '';

  try {
    const existing = String(window.localStorage.getItem(LOGIN_DEVICE_ID_STORAGE_KEY) || '').trim();
    if (existing) return existing;

    const nextId = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : getRandomFallbackId();
    window.localStorage.setItem(LOGIN_DEVICE_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch (_error) {
    return '';
  }
};

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export async function getLoginDeviceIdHash() {
  const rawId = ensureLoginDeviceId();
  if (!rawId) return '';

  try {
    if (!window.crypto?.subtle) return rawId;
    const bytes = new TextEncoder().encode(rawId);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return toHex(digest);
  } catch (_error) {
    return rawId;
  }
}

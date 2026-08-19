import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_TIMEOUT_MS || 12000);
const SUPABASE_READ_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_READ_TIMEOUT_MS || 8000);
const SUPABASE_WRITE_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_WRITE_TIMEOUT_MS || 15000);
const SUPABASE_FUNCTION_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_FUNCTION_TIMEOUT_MS || 180000);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function resolveTimeout(method, input) {
  const requestUrl = typeof input === 'string' ? input : String(input?.url || '');
  if (requestUrl.includes('/functions/v1/')) return SUPABASE_FUNCTION_TIMEOUT_MS;
  const upper = String(method || '').toUpperCase();
  return READ_METHODS.has(upper) ? SUPABASE_READ_TIMEOUT_MS : SUPABASE_WRITE_TIMEOUT_MS;
}
const authStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
const authLockQueues = new Map();

function normalizeSupabaseImplicitHashCallback() {
  if (typeof window === 'undefined') return;

  const rawHash = String(window.location.hash || '');
  if (!rawHash.startsWith('#/')) return;

  const candidate = rawHash.slice(2);
  if (!candidate) return;

  let params;
  try {
    params = new URLSearchParams(candidate);
  } catch {
    return;
  }

  const looksLikeSupabaseImplicitCallback =
    params.has('access_token')
    || params.has('refresh_token')
    || params.has('token_type')
    || params.has('expires_in')
    || params.has('expires_at');

  if (!looksLikeSupabaseImplicitCallback) return;

  const normalizedHash = `#${candidate}`;
  if (normalizedHash === rawHash) return;

  const normalizedUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${normalizedHash}`;
  window.history.replaceState(window.history.state, '', normalizedUrl);
}

async function timeoutFetch(input, init = {}) {
  const timeoutMs = resolveTimeout(init?.method || 'GET', input);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    // 直接传递 init，让 Supabase 自动处理 headers
    const response = await fetch(input, {
      ...init,
      signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function appProcessLock(name, _acquireTimeout, fn) {
  const lockName = String(name || 'supabase-auth');
  const previous = authLockQueues.get(lockName) || Promise.resolve();

  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const next = previous.catch(() => {}).then(() => current);
  authLockQueues.set(lockName, next);

  await previous.catch(() => {});

  try {
    return await fn();
  } finally {
    releaseCurrent();
    if (authLockQueues.get(lockName) === next) {
      authLockQueues.delete(lockName);
    }
  }
}

normalizeSupabaseImplicitHashCallback();

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: timeoutFetch
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: authStorage,
    lock: appProcessLock,
    lockAcquireTimeout: 15000
  },
  db: {
    schema: 'public'
  }
});

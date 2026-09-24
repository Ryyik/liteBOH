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
    // 2026-09-24：lock / lockAcquireTimeout 已移除 —— supabase-js ≥2.116 内置了
    // 无锁的会话刷新协调，官方明确建议弃用自定义 lock（v3 将移除该选项，
    // 继续传会一直打 deprecation 警告）。旧的自定义锁只是同页内存队列，
    // 并不具备跨 tab 能力，删掉后行为由官方机制接管。
    // 通行密钥（Passkey/WebAuthn）：线上 GoTrue 已开启 passkeys（rp_id=blockofhome.cn）。
    // 开启后 supabase-js 暴露 auth.signInWithPasskey / auth.registerPasskey / auth.passkey.*。
    experimental: {
      passkey: true
    }
  },
  db: {
    schema: 'public'
  }
});

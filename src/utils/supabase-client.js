import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_TIMEOUT_MS || 12000);
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
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
    storage: authStorage
  },
  db: {
    schema: 'public'
  }
});

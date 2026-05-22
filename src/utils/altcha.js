const ALTCHA_ENABLED_BY_ENV = String(import.meta.env.VITE_ALTCHA_ENABLED || 'false').trim().toLowerCase() === 'true';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');

export const ALTCHA_DEFAULT_FIELD_NAME = 'altcha';
export const ALTCHA_DEFAULT_WORKERS = Number(import.meta.env.VITE_ALTCHA_WORKERS || 2);

export const isAltchaEnabled = () => ALTCHA_ENABLED_BY_ENV && Boolean(SUPABASE_URL);

export const getAltchaChallengeUrl = (scope = 'default') => {
  const safeScope = String(scope || 'default').trim() || 'default';
  if (!SUPABASE_URL) return '';
  const url = new URL('/functions/v1/altcha-challenge', SUPABASE_URL);
  url.searchParams.set('scope', safeScope);
  return url.toString();
};

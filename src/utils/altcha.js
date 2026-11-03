const ALTCHA_ENABLED_BY_ENV = String(import.meta.env.VITE_ALTCHA_ENABLED || 'false').trim().toLowerCase() === 'true';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');

export const ALTCHA_DEFAULT_FIELD_NAME = 'altcha';
export const ALTCHA_DEFAULT_WORKERS = Number(import.meta.env.VITE_ALTCHA_WORKERS || 2);

export const isAltchaEnabled = () => ALTCHA_ENABLED_BY_ENV && Boolean(SUPABASE_URL);

/**
 * 能否**渲染** Altcha 组件 —— 与 `isAltchaEnabled` 刻意解耦。
 *
 * 为什么不能复用构建期开关：CI 的构建 env 里没有注入 `VITE_ALTCHA_ENABLED`
 * （本文件默认 false），而服务端 `ALTCHA_ENABLED=true` 且登录闸门会按失败次数
 * 要求验证码。若渲染条件也看开关，就会出现「服务端要验证码、前端永远不渲染」
 * 的死锁 —— 而且每次重试都会再记一笔失败，被拦的人会永久卡住。
 *
 * 判据只取「挑战端点是否可构建」（即 SUPABASE_URL 是否配置）；
 * 组件是否真的显示，仍由服务端下发的 requireCaptcha 决定。
 */
export const canRenderAltcha = () => isAltchaEnabled() || Boolean(SUPABASE_URL);

export const getAltchaChallengeUrl = (scope = 'default') => {
  const safeScope = String(scope || 'default').trim() || 'default';
  if (!SUPABASE_URL) return '';
  const url = new URL('/functions/v1/altcha-challenge', SUPABASE_URL);
  url.searchParams.set('scope', safeScope);
  return url.toString();
};

const ALTCHA_ENABLED_BY_ENV =
  String(import.meta.env.VITE_ALTCHA_ENABLED || 'false')
    .trim()
    .toLowerCase() === 'true';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

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

/**
 * 从 `<altcha-widget>` 的 `statechange` 事件里取 payload —— **唯一可靠的取值通道**。
 *
 * 为什么不能监听 `verified` + 读 FormData（2026-11-03 用户报障「闸门一开始就显示已完成，
 * 我点一下变空框、再点打勾、登录仍提示请先完成人机验证」的真因，两条叠在一起）：
 *
 *   ① **库把事件名拼错了**：altcha 3.0.3 的普通校验路径派发的是 `vefified`（多一个 c），
 *      见 `node_modules/altcha/dist/main/altcha.js` 的 `dispatch("vefified", …)`。
 *      只有走 verifyUrl 服务端复核那条路才是正确的 `verified`。我们没配 verifyUrl ⇒
 *      `verified` 监听器**永远不触发**，payload 一次都没被同步过。
 *   ② **FormData 读法自带时序洞**：payload 写进隐藏 input 是 Svelte 的 effect，
 *      而 `statechange` / `verified` 是**同步派发**的 ⇒ 在事件回调里读 FormData
 *      拿到的是更新前的空值。哪怕事件名修对了，读到手的仍是 ''。
 *
 * 而 `setState()` 派发 `statechange` 时，detail 里同时带着 `state` 和 `payload`，且 payload 已写入。
 * 所以判定口径定为：**只有 state === 'verified' 时才认 payload，其余状态一律视为空**
 * （reset / expired / error 都必须让 v-model 归零，否则会拿一个已作废的证明去撞单次消费）。
 */
export const readAltchaPayloadFromStateChange = (eventOrDetail) => {
  const detail =
    eventOrDetail && typeof eventOrDetail === 'object' && 'detail' in eventOrDetail
      ? eventOrDetail.detail
      : eventOrDetail;
  const state = String(detail?.state || '').trim();
  if (state !== 'verified') return '';
  return typeof detail?.payload === 'string' ? detail.payload.trim() : '';
};

export const getAltchaChallengeUrl = (scope = 'default') => {
  const safeScope = String(scope || 'default').trim() || 'default';
  if (!SUPABASE_URL) return '';
  const url = new URL('/functions/v1/altcha-challenge', SUPABASE_URL);
  url.searchParams.set('scope', safeScope);
  return url.toString();
};

/**
 * 首页开场画「看过一次」标记 —— **单一真源**。
 *
 * 为什么单独成文件（2026-11-15）：
 *   · 它同时被两处消费：`views/Home/composables/useGatePull.js`（开场画本体）
 *     和 `composables/useHomeGate.js`（App 级导航挂载判定）；
 *   · 如果后者直接从 useGatePull 导入，会把**首页整条懒加载链**拉进主包
 *     （Home chunk 是路由级动态导入，主包不该碰）；
 *   · 所以把这几行无依赖的 storage 逻辑抽出来，两边都从这里取，判据不复制。
 *
 * 语义：key 带构建指纹（生产构建注入的 `<meta name="boh-build-id">`；dev 不注入）——
 * 每次发布新版本用户再访问会重播一次开场画。localStorage + 24h 时间窗：
 * 同构建 24h 内不重复打扰，跨天自动重播。
 * （旧的 sessionStorage 方案在 iOS PWA / 长驻标签下「会话」能跨好几天，
 *  标记一旦写入开场画就再也不播，用户感知为「首屏动画没了」。）
 */

const GATE_PASSED_KEY = 'boh-home-gate-passed';
const GATE_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const resolveGateStorageKey = () => {
  if (typeof document === 'undefined') return GATE_PASSED_KEY;
  const buildId = String(document.querySelector('meta[name="boh-build-id"]')?.content || '').trim();
  return buildId ? `${GATE_PASSED_KEY}:${buildId}` : GATE_PASSED_KEY;
};

const GATE_STORAGE_KEY = resolveGateStorageKey();

/**
 * 本会话是否已经通过过开场画。
 * ⚠️ 同步、无副作用，可在**模块加载阶段**调用（App 首帧判定依赖这一点）。
 */
export const readGatePassed = () => {
  try {
    const seenAt = Number(window.localStorage.getItem(GATE_STORAGE_KEY));
    if (!Number.isFinite(seenAt) || seenAt <= 0) return false;
    return Date.now() - seenAt < GATE_REPLAY_WINDOW_MS;
  } catch {
    return false; // 隐私模式 / storage 被禁：当作没通过，照常播
  }
};

export const markGatePassed = () => {
  try {
    window.localStorage.setItem(GATE_STORAGE_KEY, String(Date.now()));
  } catch {
    /* 存不住就算了，下次照常播 */
  }
};

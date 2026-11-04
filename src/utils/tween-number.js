/**
 * tweenNumber —— 数字变化的 rAF 补间（2026-11-04 硬切审计 P1-11 抽为单源）
 *
 * 从 SubscriptionPlans.vue 的私有实现抽出：签到到账、钱包余额、积分扣费这类
 * 数字原先直接从旧值跳到新值，用它做 320ms ease-out 补间。
 *
 * - `prefers-reduced-motion: reduce` 或 from === to 时直接落终值（不动画）；
 * - 只动展示，不碰数据源 —— 调用方保留真值，onUpdate 里写展示用的 ref/reactive。
 *
 * @param {number} from 起始值
 * @param {number} to   目标值
 * @param {(v: number) => void} onUpdate 每帧回调（已取整）
 */
export function tweenNumber(from, to, onUpdate) {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    onUpdate(to);
    return;
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || from === to) {
    onUpdate(to);
    return;
  }
  const t0 = performance.now();
  const dur = 320;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    onUpdate(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default tweenNumber;

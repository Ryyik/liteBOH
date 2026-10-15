/**
 * useGlassBlur.js — 全站玻璃「模糊度」偏好的**唯一写入者**（2026-10-14 §21.12）
 *
 * ── 它解决什么 ──────────────────────────────────────────────────────────────
 * 全站玻璃现在有两套材质、量纲不同：
 *   · **模糊级**（`--liquid-blur*`，px）—— `.liquid-glass` 系、顶栏、Cloud+、Island 家族…
 *     20+ 个消费者，全部只读 `--liquid-filter*`；
 *   · **折射级**（`blurAmount`，0~1 无量纲）—— `BohGlassRefract` 内部换算成 px。
 * 用户要「一个滑杆调全站玻璃模糊度」时，只有**无量纲倍数**能同时驱动两边
 * （px 与 0~1 量纲不同）。本模块就是那个倍数的**唯一**来源与写入者。
 *
 * ── 链路（一处定义 → 全站生效）─────────────────────────────────────────────
 *   `liquid-glass-spec.js`（默认/上下限，单源）
 *        ↓ 本模块（钳制 + 持久化 + 写根变量）
 *   `<html style="--glass-blur-scale: N">`
 *        ↓                                    ↓
 *   CSS：`--liquid-blur* = calc(基准px * N)`   JS：`BohGlassRefract` 把 `blurAmount × N`
 *   （覆盖全部模糊级玻璃）                      （覆盖全部折射级玻璃）
 *
 * ⚠️ **只许有这一个写入者**：CSS 与 JS 两条消费链必须读到同一个数；
 *    两处各写一份 = 用户调了「模糊度」只有一半玻璃跟着变（最难查的那种半失效）。
 * ⚠️ 变量写在**根元素**上（与 `--refract-alpha` 同策略）：全站玻璃都在同一棵树里，
 *    没有「域」要隔离 —— 这与 BOHAI 的「玻璃透明度」不同，那条是 AI 域偏好、
 *    故站点 chrome 要显式遮蔽（见 `UnifiedNavbar/style.scoped.css` 的历史注释）。
 * ⚠️ 默认值/上下限**不要**在这里写死：真源是 `liquid-glass-spec.js`（守卫已锁两处一致）。
 */
import { ref } from 'vue';
import { LIQUID_GLASS_SPEC } from '@/config/liquid-glass-spec.js';

const STORAGE_KEY = 'boh_glass_blur_scale_v1';

const clamp = (value) =>
  Math.min(LIQUID_GLASS_SPEC.blurScaleMax, Math.max(LIQUID_GLASS_SPEC.blurScaleMin, value));

const readStored = () => {
  if (typeof window === 'undefined') return LIQUID_GLASS_SPEC.blurScaleDefault;
  const raw = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(raw) && window.localStorage.getItem(STORAGE_KEY) !== null
    ? clamp(raw)
    : LIQUID_GLASS_SPEC.blurScaleDefault;
};

/** 模块级单例：所有消费者读同一个 ref */
const blurScale = ref(readStored());
/** 「已把持久化值写回根」的一次性标记 */
let applied = false;

const writeRoot = () => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--glass-blur-scale', String(blurScale.value));
};

/** 落盘 + 写根。挂载前调用也安全（CSS 侧另有 `--glass-blur-scale: 1` 兜底）。 */
export function setGlassBlurScale(value) {
  const next = Number(value);
  blurScale.value = Number.isFinite(next) ? clamp(next) : LIQUID_GLASS_SPEC.blurScaleDefault;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(blurScale.value));
  } catch {
    /* 隐私模式 / 配额满：偏好不落盘，但本次会话仍生效 */
  }
  writeRoot();
}

/** 恢复到官方口径（设置面板的「恢复默认」用） */
export function resetGlassBlurScale() {
  setGlassBlurScale(LIQUID_GLASS_SPEC.blurScaleDefault);
}

/**
 * 消费入口。首次调用时把**已持久化**的值写回根（刷新后仍然生效）。
 * ⚠️ 这里刻意用「首次调用即 apply」而不是 `onMounted`：玻璃组件可能在任意路由懒加载，
 *    没有哪个组件能保证「第一个挂载」。
 */
export function useGlassBlur() {
  if (typeof window !== 'undefined' && !applied) {
    applied = true;
    writeRoot();
  }
  return { blurScale, setGlassBlurScale, resetGlassBlurScale };
}

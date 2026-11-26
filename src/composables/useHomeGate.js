import { ref } from 'vue';
import { readGatePassed } from '@/utils/home-gate-storage.js';

/**
 * 首页开场画（`.home-gate`）是否在场 —— **模块级单例**。
 *
 * 为什么需要它：导航栏在 App 级挂载（App.vue 的 `<UnifiedNavbar v-if>`），
 * 而「开屏是否还在」这个状态住在 Home 内部（useGateOverlay 的 `gateDismissed`）。
 * 两者没有共同祖先可 provide/inject，也不能各自复制一份判据（必然漂移）。
 *
 * 初始值必须**同步**算出来（不能等 Home 挂载后再写）：
 * 已通过过开场画的会话里，首帧就不该挂载导航栏，否则会「先出现再消失」地闪一下。
 * 判据复用 `utils/home-gate-storage.js` 的 readGatePassed —— 与开场画本体同一份
 * localStorage key、24h 窗口与 buildId 指纹。
 *
 * ⚠️ 本值只表示「开场画还没看完」，**不等于「此刻在首页」**：非首页路由即便没通过过
 * 也是 true。真正该不该隐藏导航由 `isGlobalNavbarVisible` 里
 * `route.path === '/' && homeGateScreening` 共同决定。
 */
export const homeGateScreening = ref(!readGatePassed());

/** 由 Home 在 gate 挂载 / 卸载时写入（watch gateDismissed，immediate） */
export const setHomeGateScreening = (active) => {
  homeGateScreening.value = !!active;
};

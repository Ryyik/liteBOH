import { ref } from 'vue';

/**
 * 设置子页（二级组页 / 三级表单 / 个人信息）的「沉浸态」——**模块级单例**。
 *
 * 为什么必须是模块级：
 * 导航岛在 **App 级**挂载（`App.vue` 的 `<UnifiedNavbar v-if="showGlobalNavbar">`），
 * 而「现在在设置的第几层」住在 `ProfileSettingsPanel` 内部（`activeEntryId` /
 * `editOpen` / `inlinePanel`）。两者没有共同祖先可 provide/inject。
 *
 * ⚠️ **不能只靠路由判据**：竖屏点组行进二级页**不改 URL**（`openEntry` 是纯内存态），
 *    路由里永远还是 `?tab=settings`。所以必须由面板把「我在子页里」这件事广播出来。
 *
 * 口径（2026-11-24 用户要求）：
 *   · **竖屏**：二级 / 三级页占满整屏，不挂顶部导航岛（用户：「不挂导航栏了」）；
 *   · **横屏**：照挂（用户：「横屏还是挂导航栏的」）—— 那边是两栏，岛在左栏上方，
 *     不挡右栏的表单。
 *
 * 因此本值由**面板**按 `!isHome && !twoPane` 写入，而不是在 App 里自己判视口：
 * 两栏断点只在宿主算一次（`isSettingsTwoPane`），再算一遍必然漂移。
 */
export const settingsImmersive = ref(false);

/** 由 `ProfileSettingsPanel` 在层级 / 视口变化时写入 */
export const setSettingsImmersive = (active) => {
  settingsImmersive.value = !!active;
};

/**
 * 当前是否为「设置两栏」的宽视口（横屏 ≥1024×600）。
 *
 * 用途：`isGlobalNavbarVisible` 的「设置子页隐藏导航」这条规则**只在竖屏成立**
 * （横屏的岛浮在左栏上方，不挡右栏表单；且用户明确要求横屏保留）。
 * 做成模块级 ref 而不是在判据函数里读 `window`：判据要保持可纯函数调用（有单测）。
 */
const wideMq =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)')
    : null;

export const settingsWideViewport = ref(wideMq ? wideMq.matches : false);

if (wideMq) {
  const onChange = (event) => {
    settingsWideViewport.value = event.matches;
  };
  if (typeof wideMq.addEventListener === 'function') wideMq.addEventListener('change', onChange);
  else if (typeof wideMq.addListener === 'function') wideMq.addListener(onChange);
}

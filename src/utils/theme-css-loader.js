/**
 * 主题 CSS 按需加载器
 * 将深色主题 CSS 从首屏 bundle 中移除，在首次需要时动态加载。
 *
 * ⚠️ 2026-10-13 修的两个坑（同族问题，见 scripts/probes/probe-css-load-failure.mjs）：
 *   ① 原实现把 `loadedThemeSet = theme` 写在 `await` **之前** ⇒ 一次失败后**永不重试**
 *      （比 __vitePreload 的去重表落位更早），暗色用户会一直停在「半暗」页面；
 *   ② `Promise.allSettled` 只保证「不抛」，**不代表样式生效** —— 必须按 <link> 判活。
 *
 * 现在：import → `guard.repairNow()` 复核 → 仍有坏样式就退避重试；
 * `loadedThemeSet` **只在没有残留坏样式时落位**（失败则保持未落位，
 * 下次 ensureThemeCSS 会自然再走一遍 —— import 被去重表兜成瞬时，代价只有一次复核）。
 * 判活 / 摘旧建新 / 有限退避的实现全部在单一真源 `./style-load-guard.js`。
 */
import { createStyleSheetGuard } from './style-load-guard.js';
import { reportEvent } from './monitoring.js';

/**
 * 一个对象同时声明 loader 与 matcher 的**依据 key** —— 避免「改了源文件名，
 * 但匹配 link 用的正则没跟着改」这种半截修改。构建产物名 = `<key>-<hash>.css`
 * （vite.config 的 assetFileNames 按源文件 basename 命名，已在产物里核对过：
 * dark-mode-DYuoJ_vU.css / navbar-dark-DaF45XFN.css / …）。
 */
const DARK_THEME_CSS = [
  { key: 'dark-mode', load: () => import('@/styles/themes/dark-mode.css') },
  { key: 'navbar-dark', load: () => import('@/styles/themes/navbar-dark.css') },
  { key: 'forum-dark', load: () => import('@/styles/themes/forum-dark.css') },
  { key: 'post-detail-dark', load: () => import('@/styles/themes/post-detail-dark.css') },
  { key: 'user-space-dark', load: () => import('@/styles/themes/user-space-dark.css') },
  { key: 'user-center-dark', load: () => import('@/styles/themes/user-center-dark.css') },
  { key: 'bohai-dark', load: () => import('@/styles/themes/bohai-dark.css') },
  { key: 'messages-dark', load: () => import('@/styles/themes/messages-dark.css') },
];

const THEME_CSS_MODULES = { dark: DARK_THEME_CSS };

/* 主题样式是**全站**的（不像「我的」页那样随分区卸载）⇒ isActive 恒真；
   退避比 profile 略密：主题切错是整站观感问题，早点修回来。 */
const themeCssGuards = {
  dark: createStyleSheetGuard({
    matchers: DARK_THEME_CSS.map(({ key }) => new RegExp(`/${key}-[^/]+\\.css$`)),
    delays: [600, 1600, 3600],
    // 退避用尽 = 整站半暗，必须能被服务端看见（暗色用户是静默受害最久的一档）
    onGiveUp: () => reportEvent('style_repair_giveup', { scope: 'dark-theme' }),
  }),
};

let loadedThemeSet = null;

export async function ensureThemeCSS(theme) {
  const modules = THEME_CSS_MODULES[theme];
  if (!modules) return;

  if (loadedThemeSet === theme) return;

  await Promise.allSettled(modules.map(({ load }) => load()));

  const guard = themeCssGuards[theme];
  const stillBroken = await guard.repairNow();
  if (stillBroken > 0) {
    guard.schedule();
    return;
  }
  loadedThemeSet = theme;
}

/** 仅供测试/诊断：当前已确认生效的主题（未就绪时返回 null） */
export const getLoadedThemeCSS = () => loadedThemeSet;

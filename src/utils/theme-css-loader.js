/**
 * 主题 CSS 按需加载器
 * 将深色主题 CSS 从首屏 bundle 中移除，在首次需要时动态加载
 */

const THEME_CSS_MODULES = {
  dark: [
    () => import('@/styles/themes/dark-mode.css'),
    () => import('@/styles/themes/navbar-dark.css'),
    () => import('@/styles/themes/forum-dark.css'),
    () => import('@/styles/themes/post-detail-dark.css'),
    () => import('@/styles/themes/user-space-dark.css'),
    () => import('@/styles/themes/user-center-dark.css'),
    () => import('@/styles/themes/bohai-dark.css'),
    () => import('@/styles/themes/messages-dark.css'),
    () => import('@/styles/themes/boh-note-dark.css'),
  ],
};

let loadedThemeSet = null;

export async function ensureThemeCSS(theme) {
  const modules = THEME_CSS_MODULES[theme];
  if (!modules) return;

  if (loadedThemeSet === theme) return;
  loadedThemeSet = theme;

  await Promise.allSettled(modules.map((loader) => loader()));
}
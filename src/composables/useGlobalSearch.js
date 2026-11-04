import { onUnmounted } from 'vue';
import { useBohIsland } from '@/composables/useBohIsland.js';

/**
 * 全局搜索的导航栏入口封装（导航栏搜索按钮的 API 保持不变）。
 *
 * ⚠️ plans/038（P1）起，搜索面板不再经 `showIsland.custom()` 渲染进导航 surface，
 * 而是由独立悬浮岛 `BohIsland.vue`（Teleport 到 body、App 级挂载）承载：
 *   · 状态真源 = useBohIsland 的 isOpen（`/` 快捷键也归岛 —— 它必须在不带导航栏的
 *     路由上可用，而本 composable 随导航栏挂载，管不到那些路由）；
 *   · 与旧 AI 岛 / 任务岛 / 通知岛不再有仲裁关系（不同层，互不相干）；
 *   · 面板 chunk 的懒加载与预取逻辑随迁至 useBohIsland.js。
 *
 * 历史注（2026-10 实测，已由合并消解）：`/` 与 ⌘K 曾分属搜索与 AI 岛、两边都监听
 * window 互抢 —— 「搜索面板刚打开就被 AI 岛顶掉」。合并后 `/` 召唤的就是那颗岛；
 * ⌘K 仍归旧 AI 岛（useGlobalAiPreferences），入口收敛在 P3。
 */

export function useGlobalSearch({ onAction } = {}) {
  const bohIsland = useBohIsland();

  // 动作搜索（Spotlight 式「搜到即执行」）的执行权统一归导航栏 handleMenuAction ——
  // 岛只负责转发（闭包在调用时才解引用，规避 handleMenuAction 的 TDZ，原约定不变）。
  bohIsland.registerActionExecutor(onAction);

  const openSearch = () => {
    bohIsland.open();
  };

  const closeSearch = () => {
    bohIsland.close();
  };

  const toggleSearch = () => {
    bohIsland.toggle();
  };

  // 导航栏卸载不关岛：岛已 App 级（body）存活，生命周期独立于导航栏。
  onUnmounted(() => {
    bohIsland.registerActionExecutor(null);
  });

  return {
    isSearchOpen: bohIsland.isOpen,
    canOpenSearch: bohIsland.canOpen,
    openSearch,
    closeSearch,
    toggleSearch,
    prefetchSearchPanel: bohIsland.prefetchSearchPanel,
  };
}

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { showIsland } from '@/composables/useIsland.js';
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay.js';
import GlobalSearchIsland from '@/components/UnifiedNavbar/GlobalSearchIsland.vue';

/**
 * 全局搜索的开关逻辑（导航栏入口 + ⌘K / Ctrl+K 快捷键）。
 *
 * 面板本体走 `showIsland.custom()` 渲染进导航 surface —— 高度由 navbar 的 ResizeObserver
 * 上报（`customCardHeight`），本 composable 不碰 DOM 定位。
 * 详见 plans/020-site-global-search.md。
 */

/** 首页开场画是否在场：它是 fixed 覆盖层 + 锁滚动（三道解锁保险），
 *  此时展开面板会与它层叠错位，故直接不响应。 */
const isHomeGateActive = () =>
  typeof document !== 'undefined' && !!document.querySelector('.home-gate');

export function useGlobalSearch({ onAction } = {}) {
  const route = useRoute();
  const { isOpen: isAiIslandOpen, close: closeAiIsland } = useGlobalAiOverlay();

  const isSearchOpen = ref(false);
  let islandHandle = null;

  /** 当前路由/时机是否允许打开搜索 */
  const canOpenSearch = computed(() => {
    // hideNavbar 路由（admin/* 全部、user-space 部分子页、community 2 条、public 2 条）
    // 没有导航栏宿主 → 按了不会有任何反应，直接判定不可开
    if (route.meta?.hideNavbar) return false;
    if (isHomeGateActive()) return false;
    return true;
  });

  const closeSearch = () => {
    if (!isSearchOpen.value) return;
    isSearchOpen.value = false;
    islandHandle?.close();
    islandHandle = null;
  };

  const openSearch = () => {
    if (isSearchOpen.value || !canOpenSearch.value) return;
    // ⚠️ 必须先抢占：useIsland 的 custom 槽位在任务岛 / AI 岛占用时是 v-show 让位，
    // 不 preempt 的话面板会被静默隐藏，表现成「点了没反应」。
    showIsland.preempt();
    // AI 岛优先级高于 custom 槽位，开着时面板同样会被盖住 → 一并收起。
    // 它是 overlay 单例，收起不丢会话内容。
    if (isAiIslandOpen.value) closeAiIsland();
    // onAction：动作搜索的执行权归导航栏 handleMenuAction（单一真相源）。
    // 经 props 透传给面板，由面板在命中动作项时调用。
    islandHandle = showIsland.custom(GlobalSearchIsland, { onClose: closeSearch, onAction });
    isSearchOpen.value = true;
  };

  const toggleSearch = () => {
    if (isSearchOpen.value) closeSearch();
    else openSearch();
  };

  /**
   * 快捷键用 `/`（无修饰键、非输入态）。
   *
   * ⚠️ **不要改用 ⌘K / Ctrl+K**：那个键已被 BOH AI 岛占用 —— `useGlobalAiPreferences`
   * 的默认 `shortcut = 'mod+k'`（用户可在设置里改成 mod+space / mod+j），App.vue 的全局监听
   * `handleGlobalAiKeydown` 会唤起 AI 岛，而且它**不判 shiftKey**（⌘⇧K 同样会被它吃掉）。
   * 两边都监听 window，`preventDefault` 挡不住对方 —— 实测后果是「搜索面板刚打开就被 AI 岛
   * 顶掉」（surface 挂上 `has-bohai-island`，custom 槽位的 v-show 让位隐藏面板）。
   * 搜索以导航栏按钮为主入口，快捷键取同样常见的 `/`，与既有功能零冲突。
   */
  const handleShortcut = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== '/') return;
    // 面板已开时，焦点就在面板输入框里 —— 此时按 `/` 的意图是「关掉它」，
    // 不能走下面的输入态豁免（否则会往输入框里打一个斜杠，快捷键形同失效）。
    if (!isSearchOpen.value) {
      const active = document.activeElement;
      const tag = String(active?.tagName || '').toLowerCase();
      // 输入态不拦截（用户正在打字时按 / 就是在输入斜杠）
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;
    }
    event.preventDefault();
    if (!canOpenSearch.value) return;
    toggleSearch();
  };

  onMounted(() => {
    window.addEventListener('keydown', handleShortcut);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleShortcut);
    closeSearch();
  });

  return { isSearchOpen, canOpenSearch, openSearch, closeSearch, toggleSearch };
}

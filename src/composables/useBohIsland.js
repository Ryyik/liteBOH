import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay.js';
import { createPanelAsync, AsyncPanelQuiet } from '@/utils/async-component.js';

/**
 * BohIsland —— plans/038 的独立悬浮岛（搜索 + 问一句）。
 *
 * 与 useGlobalAiOverlay（旧 AI 岛，P2 退场）的关键差异：
 *   · 岛体 Teleport 到 body、App 级挂载 —— 不依赖导航栏存在，hideNavbar 路由照样可用
 *     （这是 Teleport 的存在理由，probe-nav-ask 有专门断言）；
 *   · 不占 showIsland 的 custom 槽位 —— 与任务岛/通知岛/订阅岛零仲裁；
 *   · canOpen 不判 isGlobalNavbarVisible。
 *
 * 壳同步渲染 / 内容懒加载（§2.9.1 架构硬约束）：胶囊与展开壳是本组件的静态模板，
 * 搜索面板（GlobalSearchIsland chunk ≈20KB gzip 静态依赖）走下方 createPanelAsync 懒加载；
 * 预取机制原样保留（首屏空闲 / 悬停触发），点开时 chunk 通常已在本地。
 */

// ---------------- 搜索面板懒加载（自 useGlobalSearch.js 原样迁入，注释保留） ----------------

const loadSearchIsland = () => import('@/components/UnifiedNavbar/GlobalSearchIsland.vue');
const SearchIslandPanel = createPanelAsync(loadSearchIsland, {
  label: 'GlobalSearchIsland',
  loadingComponent: AsyncPanelQuiet,
});

let searchPanelPrefetched = false;
export const prefetchSearchPanel = () => {
  if (searchPanelPrefetched) return;
  searchPanelPrefetched = true;
  loadSearchIsland().catch(() => {
    searchPanelPrefetched = false;
  });
};

const isSlowOrMeteredConnection = () => {
  if (typeof navigator === 'undefined') return false;
  const conn = navigator.connection;
  if (!conn) return false;
  if (conn.saveData === true) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
};

/** 首屏空闲时预热：requestIdleCallback 优先，不支持则退 2.5s 定时器 */
export const scheduleSearchPanelPrefetch = () => {
  if (typeof window === 'undefined') return;
  if (isSlowOrMeteredConnection()) return;
  const run = () => prefetchSearchPanel();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 2500);
  }
};

/** 首页开场画在场时岛不响应（fixed 覆盖层 + 锁滚动，层叠会错位 —— 与旧搜索面板同规则） */
const isHomeGateActive = () =>
  typeof document !== 'undefined' && !!document.querySelector('.home-gate');

// ---------------- 单例状态 ----------------

const isOpen = ref(false);

// 动作搜索执行器：执行权仍归导航栏 handleMenuAction（单一真相源），
// 导航栏经 useGlobalSearch({ onAction }) 注册，岛代为转发。
let actionExecutor = null;

export function useBohIsland() {
  const route = useRoute();
  const aiOverlay = useGlobalAiOverlay();

  /** 当前路由/时机是否允许展开（胶囊可见性也用它） */
  const canOpen = computed(() => {
    if (route.name === 'AiChat') return false;
    if (isHomeGateActive()) return false;
    return true;
  });

  function open() {
    if (!canOpen.value) return false;
    // 旧 AI 岛（P2 退场前）与本岛在屏上同位重叠，打开本岛时收起它（overlay 单例，内容不丢）。
    if (aiOverlay.isOpen.value) aiOverlay.close();
    isOpen.value = true;
    scheduleSearchPanelPrefetch();
    return true;
  }

  function close() {
    isOpen.value = false;
  }

  function toggle() {
    if (isOpen.value) close();
    else open();
  }

  function registerActionExecutor(fn) {
    actionExecutor = typeof fn === 'function' ? fn : null;
  }

  function runAction(action) {
    actionExecutor?.(action);
  }

  return {
    isOpen,
    canOpen,
    open,
    close,
    toggle,
    registerActionExecutor,
    runAction,
    SearchIslandPanel,
    prefetchSearchPanel,
  };
}

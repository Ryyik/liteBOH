import { computed, ref } from 'vue';
import router from '@/router';
import { createPanelAsync, AsyncPanelQuiet } from '@/utils/async-component.js';

/**
 * BohIsland —— plans/038 的独立悬浮岛（搜索 + 问一句）。
 *
 * P3 入口收敛后全站唯一的 AI 岛（旧 useGlobalAiOverlay/BOHAIIsland 已退场）：
 *   · 岛体 Teleport 到 body、App 级挂载 —— 不依赖导航栏存在，hideNavbar 路由照样可用
 *     （这是 Teleport 的存在理由，probe-nav-ask 有专门断言）；
 *   · 不占 showIsland 的 custom 槽位 —— 与任务岛/通知岛/订阅岛零仲裁；
 *   · showIsland.ai() 经 useIsland.ai() 直达本岛的 askDirect（原 opener 注册机制随旧岛删除）。
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
/** 岛内面：'search' = 搜索/列表；'answer' = 回答（§3.5）。输入条在两面间 top 恒定。 */
const face = ref('search');
/** 搜索面 → 回答面的种子问题（一次性，由 BohIslandAnswer 挂载后消费） */
const pendingAsk = ref('');

// 动作搜索执行器：执行权仍归导航栏 handleMenuAction（单一真相源），
// 导航栏经 useGlobalSearch({ onAction }) 注册，岛代为转发。
let actionExecutor = null;

export function useBohIsland() {
  // ⚠️ 路由读 router 单例（currentRoute），不读 useRoute() —— 本模块还要被
  // useIsland.ai() 在任意事件处理器里调用（showIsland.ai 的落点），那里没有 setup 上下文。
  /** 当前路由/时机是否允许展开（胶囊可见性也用它） */
  const canOpen = computed(() => {
    if (router.currentRoute.value.name === 'AiChat') return false;
    if (isHomeGateActive()) return false;
    return true;
  });

  function open() {
    if (!canOpen.value) return false;
    // 每次打开都是新的一次「问一句」：回到搜索面（§3.3 打开语义）
    face.value = 'search';
    isOpen.value = true;
    scheduleSearchPanelPrefetch();
    return true;
  }

  function close() {
    isOpen.value = false;
    face.value = 'search';
    pendingAsk.value = '';
  }

  function toggle() {
    if (isOpen.value) close();
    else open();
  }

  /**
   * 进入回答面（§3.5）。种子问题由 BohIslandAnswer 挂载后消费——
   * 引擎实例长在回答组件里（有自己的快速会话，§3.4），本函数只负责切面与传话。
   * @returns {boolean} 是否受理
   */
  function ask(prompt) {
    const q = String(prompt || '').trim();
    if (!q || !isOpen.value) return false;
    pendingAsk.value = q;
    face.value = 'answer';
    return true;
  }

  /**
   * showIsland.ai() 的落点（P3 入口收敛）：直接开岛并进回答面。
   * 调用方（ForumMain 问 BOHAI、搜索面板旧宿主兜底等）零改动迁移。
   * ⚠️ options.mode（如论坛的 'fast'）不再消费 —— 岛内快速会话无模型选择（§3.6 减法，
   *   策略/模型选择在全页），默认档即 fast 位；调用方传了也不报错，静默忽略。
   * @returns {boolean} 是否受理（false = AiChat 页 / 开场画在场）
   */
  function askDirect(options = {}) {
    if (!open()) return false;
    const q = String(options.prompt || '').trim();
    if (q) {
      pendingAsk.value = q;
      face.value = 'answer';
    }
    return true;
  }

  /** Esc 分层（§3.3）：回答面退回搜索面（保留原句），不关岛 */
  function backToSearch() {
    face.value = 'search';
  }

  function registerActionExecutor(fn) {
    actionExecutor = typeof fn === 'function' ? fn : null;
  }

  function runAction(action) {
    actionExecutor?.(action);
  }

  return {
    isOpen,
    face,
    pendingAsk,
    canOpen,
    open,
    close,
    toggle,
    ask,
    askDirect,
    backToSearch,
    registerActionExecutor,
    runAction,
    SearchIslandPanel,
    prefetchSearchPanel,
  };
}

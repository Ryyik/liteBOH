import { computed, ref } from 'vue';
import router from '@/router';

/**
 * BohIsland —— plans/038 的独立悬浮岛（搜索 + 问一句）。
 *
 * P3 入口收敛后全站唯一的 AI 岛（旧 useGlobalAiOverlay/BOHAIIsland 已退场）：
 *   · 岛体 Teleport 到 body、App 级挂载 —— 不依赖导航栏存在，hideNavbar 路由照样可用
 *     （这是 Teleport 的存在理由，probe-nav-ask 有专门断言）；
 *   · 不占 showIsland 的 custom 槽位 —— 与任务岛/通知岛/订阅岛零仲裁；
 *   · showIsland.ai() 经 useIsland.ai() 直达本岛的 askDirect（原 opener 注册机制随旧岛删除）。
 *
 * 2026-11-04 用户口径（终版）：岛 = 和 BOHAI 聊天的入口，只有对话面。
 * 搜索列表面板（GlobalSearchIsland）整体退场；站内导航不走列表，由对话回复给出。
 */

/** 首页开场画在场时岛不响应（fixed 覆盖层 + 锁滚动，层叠会错位 —— 与旧搜索面板同规则） */
const isHomeGateActive = () =>
  typeof document !== 'undefined' && !!document.querySelector('.home-gate');

// ---------------- 单例状态 ----------------

const isOpen = ref(false);
/** 岛内面：'search' = 搜索/列表；'answer' = 回答（§3.5）。输入条在两面间 top 恒定。 */
const face = ref('search');
/** 搜索面 → 回答面的种子问题（一次性，由 BohIslandAnswer 挂载后消费） */
const pendingAsk = ref('');
/**
 * ⚠️ 这里**不再有** `generating` 跨组件信号（2026-11-05 第五次口径）。
 * 上一版靠它把「生成中」传给岛壳去画彩虹光效；现在生成态的视觉全在岛内
 * （点环 + 状态文字 + 步骤，见 BohIslandAnswer），壳不需要知道生成进度。
 * 岛变深色是**开岛就有**（不是生成中才有），由 UnifiedNavbar 的 data-theme 合成负责。
 */

// 动作搜索执行器：执行权仍归导航栏 handleMenuAction（单一真相源），
// 导航栏经 useGlobalSearch({ onAction }) 注册，岛代为转发。
let actionExecutor = null;

/**
 * 当前路由/时机是否允许展开（胶囊可见性也用它）。
 * ⚠️ 路由读 router 单例（currentRoute），不读 useRoute() —— 本模块还要被 useIsland.ai()
 *    在任意事件处理器里调用（showIsland.ai 的落点），那里没有 setup 上下文。
 * ⚠️ 必须是**模块级单例**，不能在 useBohIsland() 里新建：无 setup 上下文的调用点
 *    （事件处理器）没有 effectScope 可回收，每次调用都会留下一个订阅 router.currentRoute
 *    且永不销毁的 computed。
 */
const canOpen = computed(() => {
  if (router.currentRoute.value.name === 'AiChat') return false;
  if (isHomeGateActive()) return false;
  return true;
});

export function useBohIsland() {
  function open() {
    if (!canOpen.value) return false;
    // 2026-11-04 用户口径：这颗岛只有对话面 —— 搜索列表面板整体退场，
    // 站内导航由 BohIslandAnswer 判命中后以「为你找到以下页面」的对话回复给出。
    face.value = 'answer';
    isOpen.value = true;
    return true;
  }

  function close() {
    isOpen.value = false;
    face.value = 'search';
    pendingAsk.value = '';
  }

  /**
   * 竖屏下拉唤起（2026-11-04 用户口径）：直接进**回答面**，也就是「和 BOHAI 聊天」的入口。
   * 不再先落搜索列表 —— 下拉这个动作的语义是「我想问点什么」，不是「我想翻站内」。
   * 站内导航不走列表：输入后由 BohIslandAnswer 判命中，用一句
   * 「为你找到以下页面：…」的对话回复给出，UI 与 AI 回答同一条通道。
   */
  function openChat() {
    if (!canOpen.value) return false;
    isOpen.value = true;
    face.value = 'answer';
    return true;
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
   * ⚠️ options.mode 不再消费 —— 岛内档位恒为 balance（唯一实现处 BohIslandAnswer）。
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
    openChat,
    close,
    toggle,
    ask,
    askDirect,
    registerActionExecutor,
    runAction,
  };
}

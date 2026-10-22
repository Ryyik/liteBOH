/**
 * 帖子详情弹窗 — 全局单例状态与入口分流。
 *
 * 横屏（landscape + ≥1024 + ≥600）下点帖 → 居中弹窗；否则保持整页路由。
 * - 弹窗打开时 pushState 同步为详情 URL：后退=关弹窗、刷新落整页兜底、分享即详情链接。
 * - 引用帖切换（quoted post）走 replace，不追加历史栈。
 * - 后退/前进经 popstate 监听处理；路由侧同 URL 不触发跳转。
 * - 判据失配（旋转退出横屏）自动关闭。
 */
import { ref } from 'vue';
import { isForumLandscape, onForumLandscapeChange } from '@/utils/forum-viewport.js';

/** pushState 上的弹窗标记键（保留 router 自身 state 字段，只追加本键）。 */
const MODAL_HISTORY_KEY = 'bohPdModal';

const isOpen = ref(false);
const postId = ref('');

let offLandscape = null;

const buildDetailHash = (id) => `#/forum/post/${id}`;

const syncScrollLock = () => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = isOpen.value ? 'hidden' : '';
};

const handlePopstate = () => {
  // 后退：URL 已回到基础页 → 关弹窗（路由侧同 URL 不跳转，列表原地保留）。
  // 前进到 detail entry 时弹窗本就关闭 → 这里 no-op，路由接管渲染整页详情（降级一致）。
  if (isOpen.value) close({ restoreHistory: false });
};

/**
 * Esc 关闭弹窗（2026-10-22 加固）
 *
 * 用户报「按 ESC 关不掉详情」。本地 5 种路径都复现不出来，但排查中发现两个**真实脆弱点**，
 * 都足以让 Esc 在特定环境下失效，所以按「宁可多兜一层」处理：
 *
 * ① 用 **capture 阶段**监听：现在挂在 window 冒泡阶段，任何在冒泡途中
 *    调用 stopPropagation 的浮层（编辑器、图片查看器、第三方组件）都能把它吃掉。
 *    capture 先于冒泡，抢在它们之前处理；同时只在真的关掉了时才 preventDefault，
 *    避免误伤其他组件对 Esc 的自有语义（例如输入法候选框）。
 *
 * ② **兼容 IME**：中文输入法激活时，Esc 常常被输入法先消费（keydown 的
 *    isComposing=true 或 keyCode 229），此时浏览器不会给出 'Escape'。
 *    这类情况不强行拦截 —— 抢掉输入法的 Esc 会让用户无法取消候选词，是更糟的行为。
 *
 * ③ **焦点不在页面内**（点在浏览器地址栏/其他标签页）时 window 收不到 keydown，
 *    这属于浏览器行为，前端无法修复；已在文档里注明。
 */
const handleKeydown = (event) => {
  if (event.key !== 'Escape') return;
  if (event.isComposing) return; // 输入法正在组合：让输入法自己处理 Esc
  if (!isOpen.value) return;
  close();
  // 已由我们消费：阻止后续监听（如整页模式的返回）重复处理同一次按键
  event.preventDefault();
  event.stopPropagation();
};

const handleLandscapeChange = (matches) => {
  if (!matches && isOpen.value) close({ restoreHistory: true });
};

const bindListeners = () => {
  window.addEventListener('popstate', handlePopstate);
  // capture: true —— 见 handleKeydown 注释①：防止冒泡链上的浮层吞掉 Esc
  window.addEventListener('keydown', handleKeydown, true);
  offLandscape = onForumLandscapeChange(handleLandscapeChange);
};

const unbindListeners = () => {
  window.removeEventListener('popstate', handlePopstate);
  window.removeEventListener('keydown', handleKeydown, true);
  if (offLandscape) {
    offLandscape();
    offLandscape = null;
  }
};

/**
 * 打开详情弹窗。repeat 调用（如弹窗内切换引用帖）传 replace=true 复用当前历史条目。
 */
function open(id, { replace = false } = {}) {
  const safeId = String(id || '').trim();
  if (!safeId || typeof window === 'undefined') return;
  postId.value = safeId;
  const wasOpen = isOpen.value;
  isOpen.value = true;
  if (!wasOpen) bindListeners();
  syncScrollLock();
  const nextState = { ...(window.history.state || {}), [MODAL_HISTORY_KEY]: safeId };
  const href = buildDetailHash(safeId);
  if (replace) {
    window.history.replaceState(nextState, '', href);
  } else {
    window.history.pushState(nextState, '', href);
  }
}

/**
 * 关闭弹窗。restoreHistory=true 时 history.back() 消费掉打开时压入的详情条目；
 * 跳转去别的页面（如作者主页）前关闭用 restoreHistory=false，留条目给后退兜底（落整页详情）。
 */
function close({ restoreHistory = true } = {}) {
  if (!isOpen.value) return;
  isOpen.value = false;
  unbindListeners();
  syncScrollLock();
  if (
    restoreHistory &&
    typeof window !== 'undefined' &&
    String(window.history.state?.[MODAL_HISTORY_KEY] || '') === postId.value
  ) {
    window.history.back();
  }
}

/**
 * 帖子详情统一入口（单源分流）：横屏弹窗，否则整页路由。
 * 各列表页（ForumMain / UserSpaceMain / ProfileMain）一律调用本函数，禁止自行判据。
 */
export function openForumPost({ router, postId: id, query } = {}) {
  const safeId = String(id || '').trim();
  if (!safeId || !router) return;
  if (isForumLandscape()) {
    open(safeId);
    return;
  }
  router.push({
    name: 'PostDetail',
    params: { id: safeId },
    ...(query ? { query } : {}),
  });
}

export function usePostDetailModal() {
  return { isOpen, postId, open, close, openForumPost };
}

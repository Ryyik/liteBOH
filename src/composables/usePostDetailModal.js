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

const handleKeydown = (event) => {
  if (event.key === 'Escape' && isOpen.value) close();
};

const handleLandscapeChange = (matches) => {
  if (!matches && isOpen.value) close({ restoreHistory: true });
};

const bindListeners = () => {
  window.addEventListener('popstate', handlePopstate);
  window.addEventListener('keydown', handleKeydown);
  offLandscape = onForumLandscapeChange(handleLandscapeChange);
};

const unbindListeners = () => {
  window.removeEventListener('popstate', handlePopstate);
  window.removeEventListener('keydown', handleKeydown);
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
    ...(query ? { query } : {})
  });
}

export function usePostDetailModal() {
  return { isOpen, postId, open, close, openForumPost };
}

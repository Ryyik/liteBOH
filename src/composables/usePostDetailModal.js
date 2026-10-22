/**
 * 帖子详情弹窗 — 全局单例状态与入口分流。
 *
 * 横屏（landscape + ≥1024 + ≥600）下点帖 → 居中弹窗；否则保持整页路由。
 * - 弹窗打开时 pushState 同步为详情 URL：后退=关弹窗、刷新落整页兜底、分享即详情链接。
 * - 引用帖切换（quoted post）走 replace，不追加历史栈。
 * - 后退/前进经 popstate 监听处理；路由侧同 URL 不触发跳转。
 * - 判据失配（旋转退出横屏）自动关闭。
 */
import { computed, ref } from 'vue';
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
  isRestoredDetailModal.value = false; // 主动打开：整页详情照常渲染在背后
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
  isRestoredDetailModal.value = false;
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

/**
 * 刷新后恢复弹窗（2026-10-22 用户报障修复）
 *
 * 现象：横屏点帖进弹窗 → 按 F5 → 变成**旧版整页详情**。
 * 原因：URL 由 open() 写成 #/forum/post/<id>，但 isOpen 只是内存里的 ref，
 *       刷新后归零 ⇒ App.vue 里 <PostDetailModal> 不渲染，RouterView 按路由
 *       渲染整页详情（那个视觉上很老的 PostDetailMain 整页分支）。
 *
 * 修法：open() 写 URL 时已经把 `bohPdModal: <postId>` 放进 history.state；
 *       刷新后 history.state 仍在（同一条历史条目），据此还原弹窗。
 *
 * 三条必须守住的边界：
 * ① **只在横屏还原**。用户可能是在横屏打开的，刷新时窗口已变窄/旋转成竖屏；
 *    此时『弹窗』不是他该看到的形态，必须继续走整页路由（原设计意图）。
 * ② **state 里的 id 必须与 URL 对得上**。app 内跳转后 history.state 可能残留旧值，
 *    只信「URL 的 post id == state 的 bohPdModal」这一种一致情形，否则不还原。
 * ③ 还原走内部 open() 的 state 同步路径会再 push 一条历史 —— 必须用 replace 语义，
 *    否则刷新后按一次后退会「关弹窗但 URL 没退」，历史栈错位。这里直接设 ref
 *    并 bindListeners，不触碰 history。
 *
 * 调用点：App.vue 挂载后调一次（放这里是因为它是该状态的唯一真源）。
 */
const POST_HASH_RE = /#\/forum\/post\/([^/?#]+)/i;

export function restorePostDetailModalFromHistory() {
  if (typeof window === 'undefined') return false;
  if (isOpen.value) return true; // 已经开着（HMR 重放等），不重复处理
  if (!isForumLandscape()) return false; // 边界①：非横屏不还原，保留整页兜底

  const stateId = String(window.history.state?.[MODAL_HISTORY_KEY] || '').trim();
  if (!stateId) return false; // 本来就不是从弹窗打开的详情

  const match = POST_HASH_RE.exec(window.location.hash || '');
  const urlId = match ? decodeURIComponent(match[1]).trim() : '';
  if (!urlId || urlId !== stateId) return false; // 边界②：只认同一条目的不一致情形

  postId.value = stateId;
  isOpen.value = true;
  isRestoredDetailModal.value = true; // 仅此路径：告诉 App.vue 跳过整页详情
  bindListeners();
  syncScrollLock();

  /* 边界④（2026-10-22 实测结论，方案已换过一次）：
     刷新后 vue-router 会按 URL 把 /forum/post/:id 的**整页详情**渲染进 RouterView。
     如果只把 isOpen 置真，会得到「弹窗盖在整页详情上」的叠罗汉 ——
     实测 DOM 里同时存在 `post-detail-page`（整页）与 `post-detail-page--modal`（弹窗），
     两棵组件树都在跑（重复取数 + 重复订阅），关掉弹窗后旧的整页详情会露出来。

     ⚠️ 试过 `router.replace({name:'Home'})` 把它退走 —— **实测无效**
     （刷新后 routeName 仍是 'PostDetail'）：App.vue 的 onMounted 早于 router
     完成首次导航，replace 会被随后的解析覆盖，且它还会污染历史栈。

     最终方案：不动路由，由 App.vue 在渲染 RouterView 时**跳过整页详情组件**
     （见全局标志 isModalOwningDetail）。历史、深链、后退全部保持原样。 */
  return true;
}

/**
 * 「刷新还原出来的弹窗正在独占详情内容」——给 App.vue 的 RouterView 用。
 *
 * ⚠️ 语义必须**只在刷新还原时为真**，不能写成「弹窗开着就为真」（2026-10-22 踩到）：
 * 正常点帖进弹窗时路由已由 open() 的 pushState 停在详情 URL，但 RouterView 渲染的
 * 整页详情组件**本来就在**（列表页背后的那一层）。把它跳掉会让弹窗内的详情拿不到
 * 路由上下文 → 实测直接变「帖子已失效」空态（empty=true）。
 * 只有「刷新后路由真的在渲染整页详情、而弹窗又该接管」这一种情况才需要跳过。
 */
const isRestoredDetailModal = ref(false);

const isModalOwningDetail = computed(
  () => isRestoredDetailModal.value && isOpen.value && isForumLandscape(),
);

export function usePostDetailModal() {
  return { isOpen, postId, isModalOwningDetail, open, close, openForumPost };
}

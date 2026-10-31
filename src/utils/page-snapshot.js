/**
 * 页面快照垫层 —— 盖住「返回列表时列表正在重新挂载」的那一段空白（2026-10-31）
 *
 * 为什么需要它：竖屏详情是**整页路由**，进详情列表就被卸载了；返回时列表要重新
 * 挂载 + 重新取数，中间必然有一段「页头/底栏都在、正文区一片白」的空档。实测
 * （`scripts/probes/_tmp-flash-frames.mjs` + `_tmp-close-timeline.mjs`）：
 *   · 返回后 ~400ms 的截图只有搜索框 + 底栏，feed 里 0 张卡；
 *   · `.posts-feed` 先渲染 `skeleton-feed`，约 1–2s 后才换成真卡片。
 * 这段时间正好和「详情窗口收缩」重叠，用户看到的就是「一下白屏」。
 *
 * 做法：**点开帖子的那一刻**（列表还在）把整页克隆一份，返回时把它铺在收缩层
 * 下方。于是收缩过程中背后的列表是「刚才那张列表」的像素级还原（连滚动位置都对），
 * 等真列表渲染出卡片后再摘掉垫层 —— 交接点是肉眼看不出来的。
 *
 * 三条约束：
 *  ① 克隆必须**禁止一切 CSS 动画/过渡**：`.post-card-v2` 的 forumPostCardEnter 等
 *     在新节点上会从 0 重播，垫层自己就白了（和 morph-layer 里那条同因）。
 *  ② 垫层 `pointer-events: none`：它是假的，不能让用户点到「不存在的卡片」。
 *  ③ 三条收尾路径（真列表就绪 / 超时 / 导航未来）都必须移除节点。
 */

const LAYER_CLASS = 'boh-page-snapshot';
const STYLE_ID = 'boh-page-snapshot-style';

/** 最近一次采集（一次导航只留一份，新的覆盖旧的） */
let snapshot = null;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    `.${LAYER_CLASS} {` +
    'position: fixed;' +
    'inset: 0;' +
    'overflow: hidden;' +
    'pointer-events: none;' +
    'z-index: 2147481990;' +
    'contain: layout paint;' +
    // 交接按淡出收，不做瞬摘：判据命中和真实绘制之间偶尔差一帧，
    // 硬摘会露出「一帧全白」（实测 close 序列在 933ms 有这么一帧）。
    'transition: opacity 140ms linear;' +
    '}' +
    /* ⚠️⚠️ 绝不能写成 `animation: none`（2026-10-31 实测踩过）：
       仓库里有一整类元素，**可见性是由入场动画的 fill 撑住的** —— 例如
       `.posts-feed` 自带 `fade-in-up`（`fadeInUp … both`，起点 opacity 0）、
       `.post-card-v2` 自带 `forumPostCardEnter … both`。把动画整个禁用，它们就
       停在「动画开始前」的 opacity 0 上：克隆里 11 张卡的几何都在
       （`card0 = [8,218,374,466]`），但 `getComputedStyle(.posts-feed).opacity`
       是 **0** —— 垫层整片空白，白屏一秒都没盖住。
       正确做法是让动画**立刻跑到终点**：时长归零 + fill both，终帧就是「已显示」。
       `animation-iteration-count: 1` 是为了顺手掐掉 infinite 的骨架微光（时长 0
       的无限动画在 Chrome 里会被当成已完成，但显式写死更稳）。 */
    `.${LAYER_CLASS} * {` +
    'animation-duration: 0s !important;' +
    'animation-delay: 0s !important;' +
    'animation-iteration-count: 1 !important;' +
    'animation-fill-mode: both !important;' +
    'transition: none !important;' +
    '}';
  document.head.appendChild(style);
}

/**
 * 采集当前页面快照。**必须在列表还挂着的时刻同步调用**（点击处理器里）。
 * @param {{ ttl?: number }} [options] 有效期，过期未用则丢弃（默认 8s）
 * @returns {boolean} 是否采到
 */
export function capturePageSnapshot({ ttl = 8000 } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const root = document.getElementById('app');
  if (!root) return false;
  try {
    const clone = root.cloneNode(true);
    clone.removeAttribute('id');
    // 形变层/旧垫层不参与采集（正常情况下它们是 body 的子级，这里只是兜底）
    clone.querySelectorAll(`.boh-morph-layer, .${LAYER_CLASS}`).forEach((node) => node.remove());
    snapshot = { node: clone, scrollY: window.scrollY || 0, at: Date.now(), ttl };
    return true;
  } catch {
    snapshot = null;
    return false;
  }
}

/** 丢掉还没用上的快照（例如横屏走弹窗、没有离场动画时）。 */
export function dropPageSnapshot() {
  snapshot = null;
}

/**
 * 把快照铺到收缩层**下方**。
 *
 * @param {{ maxMs?: number, readySelector?: string, onRemove?: Function }} [options]
 *   `maxMs`         最长展示时长（默认 1200ms）—— 真列表一直不就绪时也不能永远盖着
 *   `readySelector` 真列表「已经可看」的判据（默认卡片或空态出现）
 * @returns {Function} 手动移除（幂等）
 */
export function mountPageSnapshot({
  maxMs = 1500,
  readySelector = '.post-card-v2, .forum-empty, .profile-post-card',
} = {}) {
  if (typeof document === 'undefined' || !snapshot) return () => {};
  if (Date.now() - snapshot.at > snapshot.ttl) {
    snapshot = null;
    return () => {};
  }

  const { node, scrollY } = snapshot;
  snapshot = null;

  ensureStyle();
  const layer = document.createElement('div');
  layer.className = LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  // 垫层要「按采集时的滚动位置显示」：文档滚动由页面自己承担（竖屏），
  // 所以整块内容上移 scrollY 即可；克隆里的 position:fixed 后代仍相对视口定位。
  node.style.position = 'absolute';
  node.style.left = '0';
  node.style.top = `${-scrollY}px`;
  node.style.width = '100%';
  node.style.minHeight = '100%';
  layer.appendChild(node);
  document.body.appendChild(layer);

  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    layer.remove();
  };
  /* 交接：先淡出再摘。判据命中那一刻新内容可能还差一次合成，
     直接摘会露一帧全白；淡出 140ms 把这点错位糊掉，肉眼几乎不可见。 */
  const fadeOut = () => {
    if (done) return;
    layer.style.opacity = '0';
    window.setTimeout(remove, 160);
  };

  const deadline = performance.now() + Math.max(120, Number(maxMs) || 1500);
  /* ⚠️ 判据必须是「**看得见**」而不是「在 DOM 里」。
     实测（`_tmp-flash-frames`）：返回后 ~500ms 卡片节点就已经挂在 `#app` 里了，
     但整块还没绘制出来，只判存在会把垫层在 500ms 就摘掉 —— 之后到 ~950ms
     仍是 96.5% 近白的空屏，白屏等于没盖住。
     ⚠️ 判据还必须查在 `#app` 里，**不能**用 `document.querySelector`：
     垫层自己就是 `#app` 的克隆，里面当然有 `.post-card-v2`。 */
  const isPainted = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.height < 24 || rect.width < 80) return false;
    if (typeof el.checkVisibility === 'function') {
      try {
        // checkOpacity 连**祖先**的 opacity 一起算 —— `.posts-feed` / 页根的淡入
        // 还没走完时这里会返回 false，正是我们要的
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      } catch {
        /* 老浏览器没有这个重载，退回几何判据 */
      }
    }
    return true;
  };
  /* 交接的**硬判据**：真列表第一张卡的位置要和垫层里那一张**重合**。
     只判「画出来了」不够 —— 实测判据命中 → 真列表真的落屏还差 3–4 帧，
     中间会露一帧 96.5% 近白（`_tmp-flash-frames` close 序列 967ms）。
     位置一致时摘垫层是像素级无感的；位置不一致说明滚动没还原好，就走超时兜底。 */
  const expectRect = (() => {
    const el = node.querySelector(readySelector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.height > 24 ? { top: r.top, left: r.left } : null;
  })();
  const isReady = () => {
    const el = document.getElementById('app')?.querySelector(readySelector);
    if (!isPainted(el)) return false;
    if (!expectRect) return true;
    const r = el.getBoundingClientRect();
    return Math.abs(r.top - expectRect.top) <= 2 && Math.abs(r.left - expectRect.left) <= 2;
  };
  const tick = () => {
    if (done) return;
    if (isReady()) {
      /* 判据命中之后还要握 **60ms** 才交接（2026-10-31 实测）：
         `.posts-feed` 的 `fade-in-up` 走完后 `checkVisibility` 就返回 true 了，
         但真列表从「样式到位」到「真的画出来」还差 3–4 帧 —— 实测 close 序列在
         967ms 有一帧 96.5% 近白（垫层已摘、真列表还没画）。多握 60ms 把这段吃掉，
         代价只是多垫 60ms，而垫层本来就是用户刚才看的那张列表。 */
      window.setTimeout(() => requestAnimationFrame(fadeOut), 60);
      return;
    }
    if (performance.now() > deadline) {
      fadeOut();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return remove;
}

<template>
  <Teleport to="body">
    <!-- 根节点不拦截点击（pointer-events 下放给展开卡）；
         data-theme 跟随站点主题（与公共导航栏同一套玻璃材质）——
         2026-11-04 用户口径：岛不是黑色悬浮物，是「从导航栏长出来」的同一材质面板 -->
    <div
      class="boh-island-root"
      :data-theme="islandTheme"
      :class="{ open: isOpen, docked, closing }"
    >
      <!-- 展开卡：2026-11-04 终版只有对话面 —— 搜索列表面板整体退场，
           一切结果都以 BOHAI 消息 UI 呈现；关岛即卸载（不留后台生成） -->
      <div v-if="rendered" class="boh-card" :style="islandPos" role="dialog" aria-label="问 BOHAI">
        <BohIslandAnswer v-if="rendered" :on-close="close" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useBohIsland } from '@/composables/useBohIsland.js';
import BohIslandAnswer from '@/components/BohIslandAnswer.vue';

/**
 * BohIsland —— plans/038：一颗岛装下搜索与「问一句」。
 *
 * App 级挂载（App.vue），Teleport 到 body：
 *   · hideNavbar / user-space 子视图等无导航栏路由照样可用；
 *   · 与导航 surface 零几何耦合 —— 不再撑高、不再与任务岛/通知岛仲裁。
 *   · P3 入口收敛后全站唯一 AI 岛：⌘K（App.vue）与 showIsland.ai() 都落在本岛。
 *   · 竖屏没有常驻气泡（2026-11-04 用户口径）：入口是「下拉导航胶囊」，
 *     见 UnifiedNavbar 的 onPullTouch*（手指从导航往下拉 48px 松手即开）。
 *
 * 落位：top = 导航栏底边 + 12（导航栏在场时实测其 bottom，缺席时退 safe-area + 12）；
 * 水平居中悬浮（plans/038 §3.1）。
 */
const { isOpen, canOpen, open, close, toggle } = useBohIsland();
const route = useRoute();

/* ---------------- 跳页即关岛（2026-11-05 用户报障） ---------------- */

/**
 * 岛是「当前这一页的搜索 / 问一句」入口 —— 换页就该收起来。
 *
 * 不收会踩两个坑（从帖子详情返回后多出一块**空的黑岛**）：
 *   ① 帖子详情是 hideNavbar 路由，导航栏整个卸载 ⇒ 岛退成悬浮态
 *      （`top:12` 的深色小胶囊，里面只剩输入条）；
 *   ② 返回时导航栏是**新建的 DOM**，旧实现只 observe 过一次导航容器，
 *      新容器等不到 measure ⇒ 卡片停在那副悬浮形态上。
 * 现有跳转路径（`BohIslandAnswer` 的 goPage / goFullPage）本来就先 `onClose()` 再 push，
 * 这里把同一条口径提到壳层，兜住「点页面上的链接跳走」这类外部跳转。
 */
watch(
  () => route.fullPath,
  () => {
    if (isOpen.value) close();
  },
);

/* ---------------- Esc：直接关岛（只有对话面，没有分层） ---------------- */

const handleEsc = () => {
  close();
};

// 根级 Esc：岛开着时接住焦点不在输入框上的 Esc（点过页面之后等）。
const handleRootEsc = (event) => {
  if (event.key !== 'Escape' || !isOpen.value) return;
  event.preventDefault();
  handleEsc();
};
document.addEventListener('keydown', handleRootEsc);

/* ---------------- 落位：跟随导航栏底边 ---------------- */

/**
 * 安全区顶部的像素值。env() 只能由 CSS 求值，这里用一个一次性探针量出来（缓存）。
 * ⚠️ 只在「导航栏缺席」时才用它 —— 导航栏在场时它的 bottom 已经是绝对坐标，
 *    再叠一次 safe-area 就会把岛往下推一个刘海的高度（2026-11-04 竖屏「诡异悬浮」即此）。
 */
let safeAreaTop = null;

const measureSafeAreaTop = () => {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden;';
  document.body.appendChild(probe);
  const h = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  return h;
};

const islandTop = ref(84);
const islandWidth = ref(0);
const islandLeft = ref(0);
const docked = ref(false);

/**
 * 落位：**照抄任务岛/通知岛/自定义岛的写法** —— 导航 surface 自己向下长高
 * （加 has-boh-island 类 + --global-nav-island-height），岛的内容坐在长出来的
 * 那块玻璃里（与 .island-custom-host 同 inset：top = status-top，左右 7px）。
 * 不是「导航下方再浮一张卡」：材质、圆角、宽度全部由 surface 提供。
 *
 * 导航栏缺席（hideNavbar 路由）时退回悬浮形态 —— Teleport 到 body 的存在理由。
 */
const syncIslandHeight = () => {
  const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
  const card = document.querySelector('.boh-island-root .boh-card');
  if (!surface || !card) return;
  const h = Math.ceil(card.getBoundingClientRect().height);
  if (h > 0) surface.style.setProperty('--global-nav-island-height', `${h}px`);
};

const clearDock = () => {
  const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
  surface?.classList.remove('has-boh-island');
  surface?.style.removeProperty('--global-nav-island-height');
  docked.value = false;
};

const measureTop = () => {
  // 关岛后 ResizeObserver 仍可能回调一次 —— 此时不能再把 has-boh-island 加回去，
  // 否则退场动画刚收完就又被撑开（2026-11-04 实测：高度收到 56 后突然跳回 176）
  if (!isOpen.value) return;
  if (safeAreaTop == null) safeAreaTop = measureSafeAreaTop();
  const nav = document.querySelector('#unified-nav-container');
  const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
  const surfaceRect = surface?.getBoundingClientRect();
  if (surface && surfaceRect && surfaceRect.height > 0) {
    const cs = getComputedStyle(surface);
    const wasDocked = docked.value;
    const prevHeight = surfaceRect.height;
    const statusTop = parseFloat(cs.getPropertyValue('--global-nav-status-top')) || 65;
    // 任务卡/通知卡/自定义岛与岛共用 status-top 槽位：它们在场时，岛长在它们下面
    // （T5 的「共存」口径保持成立，不回退成互斥仲裁）。
    const hasCard =
      surface.classList.contains('has-status-card') ||
      surface.classList.contains('has-task-card') ||
      surface.classList.contains('has-custom-card');
    const base = hasCard
      ? parseFloat(cs.getPropertyValue('--global-nav-open-height')) || statusTop + 58 + 7
      : statusTop;
    docked.value = true;
    surface.classList.add('has-boh-island');
    surface.style.setProperty('--global-nav-island-base', `${base}px`);
    islandTop.value = Math.round(surfaceRect.top + 1 + base);
    islandWidth.value = Math.round(surfaceRect.width - 16);
    islandLeft.value = Math.round(surfaceRect.left + 8);
    syncIslandHeight();
    // 「从导航长出来」的动效：基础 surface 冻结了 transition（Beta 6），首帧改高度
    // 不会触发 CSS 过渡 —— 用 WAAPI 显式把高度从当前值长到目标值（height 已不带
    // !important，动画压得过静态规则）。
    if (!wasDocked && typeof surface.animate === 'function') {
      const target = surface.getBoundingClientRect().height;
      if (target > prevHeight + 2) {
        surface.animate([{ height: `${prevHeight}px` }, { height: `${target}px` }], {
          duration: 300,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
      }
    }
    return;
  }
  // 无导航栏：悬浮形态
  docked.value = false;
  const bottom = nav ? nav.getBoundingClientRect().bottom : 0;
  islandTop.value = bottom > 0 ? Math.round(bottom) : Math.round(12 + safeAreaTop);
  islandWidth.value = 0;
  islandLeft.value = 0;
};

const islandPos = computed(() => {
  const style = { '--boh-island-top': `${islandTop.value}px` };
  if (islandWidth.value > 0) style['--boh-island-width'] = `${islandWidth.value}px`;
  if (islandLeft.value > 0) style['--boh-island-left'] = `${islandLeft.value}px`;
  return style;
});

/* ---------------- 主题跟随（与公共导航栏同色） ---------------- */

const islandTheme = ref(
  typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') || 'light'
    : 'light',
);

const syncTheme = () => {
  islandTheme.value = document.documentElement.getAttribute('data-theme') || 'light';
};

/* ---------------- 点空白收回（横竖屏同一套逻辑，不做断点判断） ---------------- */

let openedAt = 0;
let themeObserver = null;

const handleOutsideClick = (event) => {
  if (!isOpen.value) return;
  const target = event.target;
  if (!target) return;
  // 岛内的点击（输入、结果、页面胶囊）一律不算「空白」
  if (target.closest?.('.boh-island-root')) return;
  // 导航上的点击是主动操作（搜索按钮 toggle、菜单展开），不能反过来把岛关掉
  if (target.closest?.('#unified-nav-container')) return;
  // 下拉手势收尾会补一个 click（手指落在导航上，属于「开」不是「关」）
  if (Date.now() - openedAt < 350) return;
  close();
};

/**
 * 盯住导航容器的尺寸：任务卡 / 通知卡 / 自定义岛会把 surface 撑高，
 * 而岛挂在「容器底边 + 12」—— 不重测就会被撑出来的卡片压住。
 * P3 之前这条由 surface 仲裁（`has-bohai-island` 时任务卡隐藏）兜着，仲裁退场后必须自己跟。
 * 2026-11-04 实测：岛 top=90、任务卡把 surface 撑到 138（卡底 142）⇒ 重叠 52px。
 *
 * 常驻挂着（不再随展开态装卸）：导航被任务卡/通知卡撑高时，岛要跟着下移。
 */
let navResizeObserver = null;
let observedNav = null;
let cardResizeObserver = null;

/**
 * 盯住「当前那块」导航容器。
 * ⚠️ 不能只 observe 一次：`#unified-nav-container` 就住在 UnifiedNavbar 组件里，
 *    hideNavbar 路由（帖子详情 / 个人主页 / admin）会把整个导航卸载，返回时再**新建**
 *    一个容器。旧实现 `if (navResizeObserver) return;` 会一直盯着已销毁的节点，
 *    新导航永远等不到一次 measure ⇒ 岛停在悬浮态（`top:12` 的黑色小胶囊）。
 *    2026-11-05 用户报障「从帖子详情返回后多出一个空的黑岛」即此。
 */
const watchNavHeight = () => {
  if (typeof ResizeObserver !== 'function') return;
  const nav = document.querySelector('#unified-nav-container');
  if (!nav) return;
  if (navResizeObserver && observedNav === nav) return;
  navResizeObserver?.disconnect();
  observedNav = nav;
  navResizeObserver = new ResizeObserver(() => {
    measureTop();
  });
  navResizeObserver.observe(nav);
};

const watchCardHeight = () => {
  if (typeof ResizeObserver !== 'function') return;
  const card = document.querySelector('.boh-island-root .boh-card');
  if (!card || cardResizeObserver) return;
  cardResizeObserver = new ResizeObserver(() => {
    syncIslandHeight();
  });
  cardResizeObserver.observe(card);
};

const stopWatchingNavHeight = () => {
  navResizeObserver?.disconnect();
  navResizeObserver = null;
  observedNav = null;
  cardResizeObserver?.disconnect();
  cardResizeObserver = null;
};

/* ---------------- 开 / 退场动画 ---------------- */

const rendered = ref(false);
const closing = ref(false);

/** 退场：先把 surface 高度收回导航常态，再卸载卡片（否则是硬切） */
const playClose = () =>
  new Promise((resolve) => {
    const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
    const card = document.querySelector('.boh-island-root .boh-card');
    closing.value = true;
    card?.style.setProperty('opacity', '0');
    const done = () => {
      closing.value = false;
      resolve();
    };
    if (!surface || typeof surface.animate !== 'function') {
      done();
      return;
    }
    const rest =
      parseFloat(getComputedStyle(surface).getPropertyValue('--global-nav-rest-height')) || 58;
    const from = surface.getBoundingClientRect().height;
    const anim = surface.animate([{ height: `${from}px` }, { height: `${rest}px` }], {
      duration: 240,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
    });
    anim.onfinish = done;
    anim.oncancel = done;
    // 兜底：动画被取消/浏览器不支持时也要卸载
    setTimeout(done, 320);
  });

/**
 * 开合代次：每次 isOpen 翻转 +1。
 * ⚠️ 退场是**异步**的（`await playClose()` 最长 320ms）。这期间用户完全可能再次唤起
 *    （Esc 关岛后立刻 ⌘K、或者跳页关岛后马上返回再按快捷键）。旧实现没有代次判断，
 *    上一次的收尾会照常执行 ⇒ `clearDock()` 把刚加上的 `has-boh-island` 摘掉、
 *    `rendered=false` 把刚挂上的卡片卸载，表现是「岛刚打开就自己没了」。
 *    2026-11-05 复核发现（属于「复核是否存在 Bug」这一轮）。
 */
let openEpoch = 0;

watch(isOpen, async (val) => {
  const epoch = (openEpoch += 1);
  if (val) {
    // 取消上一次退场留下的淡出态（`.closing` 类 + 内联 opacity 是两条独立的压暗路径）
    closing.value = false;
    rendered.value = true;
    openedAt = Date.now();
    await nextTick();
    // 上一次退场给卡片写过内联 opacity:0（淡出），它不会自己消失 ——
    // 不清掉的话，重新打开出来的岛是**隐形**的（DOM 在、看得见的是空的深色底）。
    document.querySelector('.boh-island-root .boh-card')?.style.removeProperty('opacity');
    measureTop();
    watchNavHeight();
    watchCardHeight();
    return;
  }
  await playClose();
  // 退场期间又被打开了：这次收尾必须让位，否则会把新岛一起收掉
  if (epoch !== openEpoch || isOpen.value) return;
  clearDock();
  stopWatchingNavHeight();
  rendered.value = false;
});

/* ---------------- `/` 快捷键（自 useGlobalSearch.js 迁入 —— 岛必须不依赖导航栏） ---------------- */

const handleShortcut = (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key !== '/') return;
  // 岛已开时焦点就在面板输入框里 —— 此时按 / 的意图是「关掉它」，
  // 不能走下面的输入态豁免（否则会往输入框里打一个斜杠，快捷键形同失效）。
  if (!isOpen.value) {
    const active = document.activeElement;
    const tag = String(active?.tagName || '').toLowerCase();
    // 输入态不拦截（用户正在打字时按 / 就是在输入斜杠）
    if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;
  }
  event.preventDefault();
  if (!canOpen.value) return;
  toggle();
};

/** ⌘K 再按 = 聚焦输入条（App.vue 派发 boh-ai-focus-composer；全页 useBohShell 也监听同一事件） */
const handleFocusComposer = () => {
  if (!isOpen.value) {
    open();
    return;
  }
  nextTick(() => {
    document.querySelector('.boh-island-root .boh-answer-input')?.focus?.();
  });
};

const onResize = () => {
  // 岛体的落位随时可能变（导航增高 / 转屏），关岛态也要重测
  measureTop();
};

onMounted(() => {
  window.addEventListener('keydown', handleShortcut);
  window.addEventListener('resize', onResize);
  window.addEventListener('boh-ai-focus-composer', handleFocusComposer);
  // 岛的落位从首帧就要准：贴着导航 surface 的底边（默认 84 只是为了首帧不闪）
  measureTop();
  watchNavHeight();
  // 主题跟随（与公共导航栏同色）：data-theme 由 themeManager 写在 <html> 上
  syncTheme();
  if (typeof MutationObserver === 'function') {
    themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
  // 点空白收回：气泡/导航之外的任何点击都关岛
  document.addEventListener('click', handleOutsideClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('boh-ai-focus-composer', handleFocusComposer);
  document.removeEventListener('keydown', handleRootEsc);
  document.removeEventListener('click', handleOutsideClick);
  themeObserver?.disconnect();
  themeObserver = null;
  stopWatchingNavHeight();
  close();
});
</script>

<style>
/* 非 scoped：Teleport 到 body，样式必须全局可寻址（probe-nav-ask 直接查这些类名）。
   命名空间 boh- 前缀防冲突。 */
.boh-island-root {
  position: fixed;
  inset: 0;
  /* ⚠️ 必须压过导航容器（z-index 9999）：停靠态下 surface 会向下长高把岛的位置整个
     罩住 —— 层级低于它的话，透明卡片看得见却点不到（所有点击被 surface 截走，
     2026-11-04 实测连「去全页」按钮都点不动）。卡片只占 surface 展开区、
     不占顶部导航行，压过它不会挡住导航本身的交互。 */
  z-index: 10001;
  pointer-events: none;
  /* 必须显式透明：本容器是全屏（inset:0）且恒带 data-theme="dark"，任何泛化的
     `[data-theme="dark"] { background: … }` 都会把它涂成整屏底色 —— 而它 pointer-events:none，
     视觉上全黑、取点与交互却全部正常（2026-11-04 全站黑屏事故即此）。
     index.html 里那条兜底已收窄到 :root，这里再兜一层防其它泛化规则误伤。 */
  background: transparent;
  font-family: inherit;

  /* 岛内墨色 / 叠色：**恒为深色岛上的纸白**，不再按 data-theme 分叉。
     站点切浅色时岛也是黑的（2026-11-05 用户口径：唤起 BOHAI 整块岛自动变深色）。 */
  --boh-ink: #ffffff;
  --boh-ink-soft: rgba(255, 255, 255, 0.76);
  --boh-ink-dim: rgba(255, 255, 255, 0.46);
  --boh-ink-faint: rgba(255, 255, 255, 0.3);
  --boh-chip-bg: rgba(255, 255, 255, 0.1);
  --boh-chip-bg-hover: rgba(255, 255, 255, 0.18);
  --boh-line: rgba(255, 255, 255, 0.14);
  --boh-line-strong: rgba(255, 255, 255, 0.24);
  --boh-accent: #d7c9ff;

  /* 岛形态（2026-11-05 第五次口径）：**唤起 BOHAI 时整块岛自动变深色**。
     所以岛内的墨色恒为「纸白系」，不再随站点主题翻转 —— 岛是深色的，
     系统浅色下也不跟。落点：UnifiedNavbar 在 has-boh-island 时把容器
     data-theme 切成 dark（导航行文字随之变白），surface 背景换成深色玻璃。 */
  --boh-paper: #ffffff;
  --boh-paper-soft: rgba(255, 255, 255, 0.76);
  --boh-paper-dim: rgba(255, 255, 255, 0.46);
  --boh-paper-faint: rgba(255, 255, 255, 0.3);
  --boh-veil: rgba(255, 255, 255, 0.1);
  --boh-veil-hover: rgba(255, 255, 255, 0.18);
}

.boh-island-root .boh-card {
  pointer-events: auto;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* --boh-island-top 是「绝对 top」：导航栏在场时 = surface 实测底边（贴着长出来），
     导航栏缺席时才由 JS 把 safe-area 折进去。这里**不能**再叠 env() ——
     叠了会在刘海机上把岛往下推一个安全区高度（约 47–59px）。 */
  top: var(--boh-island-top, 84px);
}

.boh-island-root .boh-card {
  /* 宽度取导航 surface 的实测宽（JS 写入 --boh-island-width）：
     竖屏 366 / 桌面 860 都跟导航同宽，视觉上是导航向下延伸出来的一层 */
  width: min(max(280px, var(--boh-island-width, 352px)), calc(100vw - 24px));
  /* 高度由回答内容撑（ResizeObserver → --global-nav-island-height），这里只封顶：
     ① 一屏之内（62dvh / 600px 取小）—— 2026-11-05 用户口径「会设置最大限制」，
        否则长回答会把整块导航撑到吃掉整个屏幕；
     ② 无论如何不超过视口剩余高度（扣掉岛顶位置与键盘占位）。
     溢出部分由 BohIslandAnswer 的 .boh-answer-body 内部滚动处理。 */
  max-height: min(
    clamp(320px, 62dvh, 600px),
    calc(100dvh - var(--boh-island-top, 84px) - 12px - var(--kb-inset, 0px))
  );
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 26px;
  /* 深色胶囊（2026-11-05）：上灰下黑的三段渐变 + 顶部内高光，与 docked 态同观感 */
  background: linear-gradient(180deg, #383940 0%, #14151a 44%, #08090b 100%);
  box-shadow:
    0 26px 70px rgba(0, 0, 0, 0.42),
    0 2px 8px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(26px) saturate(150%);
  -webkit-backdrop-filter: blur(26px) saturate(150%);
  overflow: hidden;
  /* 从导航底边「长出来」：origin 在顶边中点，纵向展开 */
  transform-origin: top center;
  animation: bohIslandIn 300ms cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateX(-50%);
}

/* ---------------- 停靠态（有导航栏）：岛长在 surface 里 ---------------- */

/**
 * 与任务岛/通知岛/自定义岛一致：材质、圆角、宽度全由 surface 提供，
 * 卡片自己透明无框；「长出来」的动效由 surface 的 height 过渡负责
 * （见 UnifiedNavbar/style.scoped.css 的 .has-boh-island）。
 */
.boh-island-root.docked .boh-card {
  left: var(--boh-island-left, 8px);
  width: var(--boh-island-width, calc(100vw - 16px));
  transform: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  /* 与悬浮态同一档封顶（docked 撑的是导航 surface 的高度，不封顶会顶穿屏幕） */
  max-height: min(
    clamp(320px, 62dvh, 600px),
    calc(100dvh - var(--boh-island-top, 84px) - 24px - var(--kb-inset, 0px))
  );
  animation: bohIslandFade 180ms ease;
  transition: opacity 200ms ease;
}

/* 退场：高度收回的同时卡片淡出（JS 在 playClose 里写 opacity:0） */
.boh-island-root.closing .boh-card {
  opacity: 0;
}

@keyframes bohIslandFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes bohIslandIn {
  from {
    opacity: 0;
    transform: translateX(-50%) scaleY(0.72) scaleX(0.98);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scaleY(1) scaleX(1);
  }
}

/* 展开卡内的搜索面板：撑满卡片。⚠️ 必须 basis auto（不能 flex:1）——
   卡片高度由内容撑起、仅 max-height 封顶，basis 0 会把内容高度算成 0，
   结果行全部溢出隐藏（2026-11-04 实测踩坑：gs-body clientHeight=0）。 */
.boh-island-root .boh-card > * {
  flex: 1 1 auto;
  min-height: 0;
}
</style>

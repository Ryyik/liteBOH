<template>
  <!-- --gate-p / --forum-p 是整段入场的唯一进度真源（0~1，2026-09-27 起）：
       跟手阶段由手势推进、释放阶段由补间推进，视觉全部由 CSS 从这两个变量派生。
       放在元素 style 上而不是文档级样式表 —— 既不碰 !important 棘轮，
       也保证首帧（含已通过开场画的会话）就是正确值，不会闪一下。 -->
  <div
    ref="homeRootRef"
    class="home"
    :class="{
      'home-forum-open': forumOpen,
      'home-forum-entering': forumEntering,
      'home-forum-settled': gateSettled,
    }"
    :style="{
      '--gate-p': pullProgress,
      '--forum-p': forumP,
      '--home-focus-duration': `${focusDurationMs}ms`,
    }"
  >
    <!-- 1. 开场层：满屏街景画（一次性）。
         跟手拖拽：手指把整段入场当成一条 0~1 的进度推着走。
         释放时按进度 / 速度决策「提交（补间到 1）」或「回弹（补间到 0）」——
         一次滚轮 / 一次正常滑动就够（0.10 × 0.85 屏 ≈ 68px），只轻轻拨一下才弹回。
         过渡期锁底层滚动；落位后开场层卸载，交还干净的文档流滚动。
         ⚠️ wheel / touch 绑在本层元素上（不是 window）：window 上的 preventDefault
         是全局副作用，一旦监听泄漏（HMR / 异常卸载）整站就永久滚不动了。
         CSS 侧另有 touch-action: none 兜底，双保险拦住底层滚动。 -->
    <div
      v-if="!gateDismissed"
      class="home-gate"
      @wheel="handleWheel"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
    >
      <StreetSceneHero :hero="streetSceneHero" />
      <!-- 键盘 / 读屏用户的等价入口：视觉隐藏、聚焦时可见（一次触发即完成） -->
      <button class="home-gate-enter" type="button" @click="commitGate">进入方块论坛</button>
    </div>

    <!-- 2. 论坛层＝「桌面」：方块（论坛）分区壳（官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象）
         与 UserSpace 的「方块」分区共用同一份组件；归档区 + 页脚接在论坛流末尾。
         它一直待在原位，转场期间只做一次极轻的 scale 归位（由 --forum-p 派生）——
         真正被推走的是上面那张开场画浮层，这才是「浮层盖在桌屏上」的观感。 -->
    <div class="home-forum-stage">
      <ForumSectionShell
        ref="forumShellRef"
        v-model:section="forumSection"
        @island-message="handleIslandMessage"
      >
        <template #official>
          <AsyncOfficialHeroStage />
        </template>
      </ForumSectionShell>
      <HomeFooter />
    </div>

    <!-- 3. 横屏左栏（电脑 + 平板横屏）：与 UserSpace 的横屏左栏是同一个组件、同一份
            navItems（@/config/bottom-nav 单源）。论坛现在落在首页（顶栏「社区 → 论坛」
            与底栏「方块」都指 `/?view=latest`），没有左栏就会出现「换个入口进论坛，
            左右栏结构就没了」。可见性由 side-rail.css 的媒体查询决定（竖屏 / 窄窗零副作用），
            内容让位与 fixed 定位见 landscape-rail.css 的 body.page-home 段。
            首次进入的街景开场层是 fixed 覆盖层，左栏浮在其上，退场后自然落到论坛左侧。 -->
    <UserSpaceSideRail
      :nav-items="BOTTOM_NAV_ITEMS"
      :current-tab="activeBottomNavId"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      :current-theme="currentTheme"
      :is-logged-in="isLoggedIn"
      @nav-click="handleBottomNavClick"
      @action="handleRailAction"
    />

    <!-- 4. 移动端底栏：开场画退掉大半后才从下方浮上来（v-if 由 bottomNavReady 控制，
            不是 forumOpen —— 早挂载就会和封面同时抢镜）；此后随滚动方向隐藏 / 显现。
         桌面 / 横屏整槽关掉（顶部 UnifiedNavbar + 横屏左栏足够）。 -->
    <div v-if="bottomNavReady" class="home-bottom-nav-slot">
      <UserSpaceBottomNav
        :visible="true"
        :hidden="bottomNavHidden"
        :enter-duration="bottomNavEnterMs"
        :nav-items="BOTTOM_NAV_ITEMS"
        :current-tab="activeBottomNavId"
        :nav-indicator-style="bottomNavIndicatorStyle"
        :has-unread-messages="hasUnreadMessages"
        :unread-count="unreadCount"
        @nav-click="handleBottomNavClick"
      />
    </div>

    <ThemeModal
      :open="showThemeModal"
      :current-theme-preference="currentThemePreference"
      @close="showThemeModal = false"
      @select="setThemePreference"
    />
  </div>
</template>

<script setup>
/* 首页（2026-09-23 结构定型 / 2026-09-27 入场改为「跟手揭开浮层」）
   结构：满屏街景开场画（一次性）→ 跟手转场 → 方块论坛铺满 → 归档区 + 页脚 → 底栏。

   ⚠️ 找代码的指引（这套入场被刻意切成三块，别再把它们混回来）：
     · 逻辑（跟手参数 / 释放决策 / 补间 / 滚动锁 / reduce 分身）→ ./composables/useGatePull.js
     · 观感（位移 / 缩放 / 圆角 / 模糊 / 淡出）→ ./style.scoped.css，且只由 CSS 变量派生
     · 本文件 → 只做接线：把进度绑到根元素 style、把手势绑到开场层元素、调生命周期
   改门槛或时长去 composable，改观感去 CSS —— 两边都不会互相踩。
   - 开场画不是可滚动的第一屏，而是「过了就不再回来」的入场。整段入场是一条 0~1 的进度。
   - 论坛本体与 UserSpace 的「方块」分区共用 ForumSectionShell（单源），
     分区七席、30s 轮询、分区过渡动画全部原样。
   - 底栏五席来自 @/config/bottom-nav，进度过半时从下方浮入，随后由滚动方向驱动显隐。 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import StreetSceneHero from './components/StreetSceneHero.vue';
import HomeFooter from './components/HomeFooter.vue';
import { useGatePull } from './composables/useGatePull.js';
import ForumSectionShell from '@/views/user-center/UserSpace/components/ForumSectionShell.vue';
import UserSpaceBottomNav from '@/views/user-center/UserSpace/components/UserSpaceBottomNav.vue';
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import ThemeModal from '@/views/user-center/UserSpace/components/ThemeModal.vue';
import { preloadProfileStyles } from '@/views/user-center/UserSpace/async-loaders.js';
import { useScrollDirectionHide } from '@/views/user-center/UserSpace/composables/useScrollDirectionHide.js';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import { useAuthStore } from '@/stores/auth';
import { FORUM_DEFAULT_SECTION, resolveForumSection } from '@/config/forum-sections';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';
import { getNotificationStoreSync, loadNotificationStore } from '@/stores/notification-loader';
import { showIsland } from '@/composables/useIsland.js';
import { themeManager } from '@/utils/theme-manager.js';

// 官方英雄区舞台（hero 流 + 四类周年弹窗）：独立 chunk，只在切到「官方」分区时才请求
const AsyncOfficialHeroStage = defineAsyncComponent(
  () => import('./components/OfficialHeroStage.vue'),
);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);

// ============================================
// 开场画「跟手揭开浮层」：逻辑全部在 composables/useGatePull.js
// ============================================
/* 这里只做接线。2026-09-27 抽离：这套入场逻辑（跟手进度 / 释放决策 / 补间 /
   滚动锁三保险 / reduce 分身）曾经把本文件撑到 700+ 行，和论坛分区、底栏、
   横屏左栏、导航高度探测混在一起，改一个门槛要翻半屏无关代码。
   现在这里只剩：
     · 进度（--gate-p / --forum-p）绑到根元素 style，以及几个开关类；
     · wheel / touch 绑在开场层元素上（⚠️ 不是 window —— 见 composable 内的说明）；
     · 键盘与 reduce 偏好由 mounted() 挂、unmounted() 清。 */
const {
  pullProgress,
  forumP,
  gateDismissed,
  forumOpen,
  forumEntering,
  gateSettled,
  bottomNavReady,
  bottomNavEnterMs,
  focusDurationMs,
  handleWheel,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  commitGate,
  mounted: mountGatePull,
  unmounted: unmountGatePull,
} = useGatePull();

// ============================================
// 论坛分区：URL 的 view 是唯一真源（/?view=official 深链直达）
// ============================================
const forumSection = ref(resolveForumSection(route.query.view));
const forumShellRef = ref(null);

watch(forumSection, (next) => {
  const nextQuery = { ...route.query };
  if (!next || next === FORUM_DEFAULT_SECTION) delete nextQuery.view;
  else nextQuery.view = next;
  if (String(route.query.view || '') === String(nextQuery.view || '')) return;
  router.replace({ query: nextQuery });
});

watch(
  () => route.query.view,
  (raw) => {
    const next = resolveForumSection(raw);
    if (next !== forumSection.value) forumSection.value = next;
  },
);

// #ryyik-letter 深链：先落到「官方」分区（信件弹窗归官方舞台所有，挂载后自行消费 hash）
watch(
  () => route.hash,
  (hash) => {
    if (hash === '#ryyik-letter') forumSection.value = 'official';
  },
  { immediate: true },
);

/* 分区壳（内含 AsyncForum）是异步 chunk，首帧不一定就绪 → 轮询等到它把
   ForumMain 的 openComposer / focusSearch 暴露出来再调，上限 5s 不卡任何东西。
   两处消费方共用这一条：?compose=1 / ?search=1 深链，以及横屏左栏的发布 / 搜索。 */
const callForumShell = async (method, timeoutMs = 5000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const shell = forumShellRef.value;
    if (shell && typeof shell[method] === 'function' && shell[method]()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return false;
};

/* 一次性论坛意图（?compose=1 / ?search=1）：由 UserSpace / 他人空间的横屏左栏按钮带来，
   这里把意图转交给分区壳（它透传 ForumMain 的 openComposer / focusSearch）。 */
const consumeForumIntent = async () => {
  const method =
    route.query.compose === '1' ? 'openComposer' : route.query.search === '1' ? 'focusSearch' : '';
  if (!method) return;
  const nextQuery = { ...route.query };
  delete nextQuery.compose;
  delete nextQuery.search;
  router.replace({ query: nextQuery });

  await callForumShell(method);
};

watch(
  () => [route.query.compose, route.query.search],
  () => {
    void consumeForumIntent();
  },
  { immediate: true },
);

// ============================================
// 底栏（五席）：进入论坛后滑入，此后随滚动方向隐藏 / 显现
// ============================================
const { hidden: bottomNavHidden } = useScrollDirectionHide({
  // 底栏还没就位（开场画阶段 / 浮现延迟窗口内）不需要方向联动
  forceVisible: computed(() => !bottomNavReady.value),
});

// 首页 = 方块（论坛）这一席
const activeBottomNavId = computed(() => 'community');
const bottomNavIndicatorStyle = computed(() => {
  const index = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeBottomNavId.value),
  );
  return {
    '--active-nav-index': index,
    '--active-nav-center': `${((index + 0.5) / BOTTOM_NAV_ITEMS.length) * 100}%`,
    '--nav-count': BOTTOM_NAV_ITEMS.length,
  };
});

const handleBottomNavClick = (itemId) => {
  // 「方块」就是本页：已经在论坛了，回到论坛顶部即可，不做无谓跳转
  if (itemId === activeBottomNavId.value) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }
  const item = BOTTOM_NAV_ITEMS.find((entry) => entry.id === itemId);
  if (!item) return;
  if (route.path === item.route) return;
  router.push(item.route);
};

// 未读徽标：与 UserSpace 底栏同一 store，两处数字必然一致
const notificationStoreRef = ref(getNotificationStoreSync());
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const hasUnreadMessages = computed(() => unreadCount.value > 0);
const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) return notificationStoreRef.value;
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

// ============================================
// 横屏左栏的动作分发（与 UserSpaceMain.handleRailAction 同一套语义，
// 只是落在首页自己的既有入口上；主导航那五席走 handleBottomNavClick）
// ============================================
// 主题：真源 = themeManager（与 UserSpace 同口径，只保留左栏「更多」菜单需要的两项状态）
const showThemeModal = ref(false);
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const handleThemeChange = (theme, preference = themeManager.getPreference?.() || theme) => {
  currentTheme.value = theme;
  currentThemePreference.value = preference;
};
const setThemePreference = (preference) => {
  if (preference === 'system') {
    themeManager.resetToSystem();
  } else {
    themeManager.setTheme(preference);
  }
  currentTheme.value = themeManager.getTheme();
  currentThemePreference.value = themeManager.getPreference?.() || preference;
};

const handleRailAction = async (actionId) => {
  switch (actionId) {
    case 'compose':
      await callForumShell('openComposer');
      break;
    case 'search':
      await callForumShell('focusSearch');
      break;
    case 'theme':
      // 主题弹窗的 .modal-overlay / .modal-card 样式来自按需加载的 profile-panels.css，
      // 首页默认不预载 → 先确保样式就绪，否则弹窗裸奔（与 UserSpaceMain 同处理）
      await preloadProfileStyles();
      showThemeModal.value = true;
      break;
    case 'home':
      // 首页自己就是「首页」这一席：回到顶部即可，不做无谓跳转
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'logout':
      authStore.logout();
      break;
    default:
      break;
  }
};

// 论坛内嵌态的系统提示 → 统一走灵动岛
const handleIslandMessage = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return;
  const title = String(payload.title || '').trim();
  if (!title) return;
  showIsland.notify({
    title,
    message: payload.message,
    icon: payload.icon,
    type: payload.type,
    durationMs: payload.durationMs,
  });
};

// ============================================
// 导航胶囊实测高度 → --userspace-nav-h
// ============================================
/* 根元素 ref：进度变量（--gate-p / --forum-p）由模板直接绑在它的 style 上，
   这里只用来写 --userspace-nav-h（与入场逻辑无关，所以没跟着搬进 useGatePull）。 */
const homeRootRef = ref(null);

/* 分区页签（SegmentTabs）的顶部避让吃这个变量；导航岛含状态卡时高度会变
   （78 ↔ 130+），写死必然一头空一头盖。口径与 UserSpaceMain 的
   syncUserspaceNavHeight 一致：读 #unified-nav-container 的实测高度。
   （首页不经过 UserSpaceMain，所以这里独立探测一次。） */
let navIslandResizeObserver = null;
let navProbeTimer = null;
const syncNavIslandHeight = () => {
  const root = homeRootRef.value;
  if (!root) return;
  const island = document.getElementById('unified-nav-container');
  if (!island) return;
  /* ⚠️ 只上报「收起态」高度：岛展开（搜索面板 / AI 岛 / 状态卡）都是悬浮层，
     页面内容**不应该**为它让位 —— 否则搜索一出结果，整页内容被推下去 200px+
     （2026-09-27 用户实测：「侧边栏被岛带着向下避让」）。
     container 的 min-height 就是收起态高度（单源在 CSS），用它做上限钳制。 */
  const measured = Math.ceil(island.getBoundingClientRect().height);
  const restHeight = Number.parseFloat(getComputedStyle(island).minHeight) || 0;
  const height = restHeight > 0 ? Math.min(measured, Math.ceil(restHeight)) : measured;
  if (height > 0) root.style.setProperty('--userspace-nav-h', `${height}px`);
};

/* 导航栏是壳层组件，首页 onMounted 时可能还没挂进 DOM → 短轮询等它就位再观察。
   上限 50×60ms：拿不到就退回 SegmentTabs 的默认值（84px），不会卡住任何东西。 */
const setupNavIslandProbe = () => {
  if (typeof window === 'undefined') return;
  let tries = 0;
  const attach = () => {
    navProbeTimer = null;
    const island = document.getElementById('unified-nav-container');
    if (island) {
      syncNavIslandHeight();
      if (typeof window.ResizeObserver === 'function') {
        navIslandResizeObserver = new window.ResizeObserver(syncNavIslandHeight);
        navIslandResizeObserver.observe(island);
      }
      return;
    }
    if (tries < 50) {
      tries += 1;
      navProbeTimer = window.setTimeout(attach, 60);
    }
  };
  attach();
};

// ============================================
// 开场画数据
// ============================================
const homeHeroesStore = useHomeHeroesStore();

// 首屏唯一 street-scene 行（DB 单例约束保证至多一条已发布未归档）；无则 null → 组件回落品牌图
const streetSceneHero = computed(
  () => homeHeroesStore.publishedHeroes.find((hero) => hero.template === 'street-scene') || null,
);

onMounted(async () => {
  document.body.classList.add('is-loaded');
  /* 开场画：键盘手势 + reduce 偏好监听 + 底栏浮现的进度联动，全部在 useGatePull 里 */
  mountGatePull();

  void ensureNotificationStore();
  setupNavIslandProbe();
  // 左栏「更多」菜单的主题按钮要跟着全站主题走（真源 themeManager）
  themeManager.addListener(handleThemeChange);

  // 开场画与英雄区数据（失败不影响首屏：内部有缓存/baseline 兜底，且带超时竞速）
  try {
    await homeHeroesStore.fetchPublished();
  } catch {
    // 静默失败：动态英雄区是增量，表不存在时仅返回空数组
  }
});

onBeforeUnmount(() => {
  themeManager.removeListener(handleThemeChange);
  /* 开场画的全部收尾：键盘监听、wheel/touch 计时器、补间、reduce 监听，
     以及滚动锁的兜底解锁（路由跳走时计时器已被清掉，不清会把文档永久锁死）。 */
  unmountGatePull();
  if (navProbeTimer) {
    window.clearTimeout(navProbeTimer);
    navProbeTimer = null;
  }
  if (navIslandResizeObserver) {
    navIslandResizeObserver.disconnect();
    navIslandResizeObserver = null;
  }
  document.body.style.overflow = '';
});
</script>

<style scoped src="./style.scoped.css"></style>
<style src="./style.global.css"></style>
<!-- 横屏左栏的页面级规则（body.page-home 段）与 UserSpace / 他人空间共用同一份，
     与 ProfileMain 的引入方式一致 —— 断点与栏宽档位只在这一个文件里定义 -->
<style src="@/views/user-center/UserSpace/styles/landscape-rail.css"></style>

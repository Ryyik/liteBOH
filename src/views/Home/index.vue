<template>
  <div
    ref="homeRootRef"
    class="home"
    :class="{
      'home-forum-open': forumOpen,
      'home-forum-entering': forumEntering,
      'home-forum-settled': gateSettled,
    }"
    :style="{
      '--home-gate-fade-duration': `${fadeDurationMs}ms`,
      '--home-focus-duration': `${focusDurationMs}ms`,
    }"
  >
    <div
      v-if="!gateDismissed"
      class="home-gate"
      :class="{ 'is-leaving': gateLeaving }"
      role="dialog"
      aria-modal="true"
      aria-label="方块之家开场"
    >
      <GateSceneHero v-if="gateSceneActive" :config="gateConfig" @cta="handleGateCta" />
      <StreetSceneHero v-else :hero="streetSceneHero" />
      <button class="home-gate-skip" type="button" @click="commitGate">跳过</button>
    </div>

    <div class="home-forum-stage" :inert="!gateDismissed">
      <ForumSectionShell
        ref="forumShellRef"
        v-model:section="forumSection"
        @island-message="handleIslandMessage"
        @composer-state="handleComposerState"
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
            首次进入的街景遮罩是 fixed 覆盖层，退场后自然落到论坛左侧。 -->
    <UserSpaceSideRail
      :nav-items="BOTTOM_NAV_ITEMS"
      :inert="!gateDismissed"
      :current-tab="activeBottomNavId"
      :active-action="composerOpen ? 'compose' : ''"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      :current-theme="currentTheme"
      :is-logged-in="isLoggedIn"
      @nav-click="handleBottomNavClick"
      @action="handleRailAction"
    />

    <!-- 4. 移动端底栏：开场遮罩卸载后再挂载，随后随滚动方向隐藏 / 显现。 -->
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
        @expand-request="resetBottomNavAutoHide"
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
/* 首页（2026-09-23 结构定型 / 2026-11-26 开场改为定时遮罩）
   结构：满屏品牌遮罩（一次性）→ 渐隐 → 方块论坛铺满 → 归档区 + 页脚 → 底栏。

   开场层显示 2 秒后自动淡出；「跳过」立即触发同一流程。
   计时、滚动锁、reduce 降级与落定状态由 ./composables/useGatePull.js 收口，
   视觉由 ./style.scoped.css 负责。 */
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createPanelAsync } from '@/utils/async-component.js';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import StreetSceneHero from './components/StreetSceneHero.vue';
import GateSceneHero from './components/GateSceneHero.vue';
import {
  fetchGateConfig,
  isGateConfigActive,
  readGateConfigCache,
  resolveGateCtaTarget,
  GATE_CONFIG_FALLBACK,
} from '@/utils/api/gate-config-api.js';
import HomeFooter from './components/HomeFooter.vue';
import { useGateOverlay } from './composables/useGatePull.js';
import { setHomeGateScreening } from '@/composables/useHomeGate.js';
import ForumSectionShell from '@/views/user-center/UserSpace/components/ForumSectionShell.vue';
import UserSpaceBottomNav from '@/views/user-center/UserSpace/components/UserSpaceBottomNav.vue';
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import ThemeModal from '@/views/user-center/UserSpace/components/ThemeModal.vue';
import { preloadProfileStyles } from '@/views/user-center/UserSpace/async-loaders.js';
import { useScrollDirectionHide } from '@/views/user-center/UserSpace/composables/useScrollDirectionHide.js';
import { useForumComposerSession } from '@/views/user-center/UserSpace/composables/useForumComposerSession.js';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import { useAuthStore } from '@/stores/auth';
import { FORUM_DEFAULT_SECTION, resolveForumSection } from '@/config/forum-sections';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';
import { ensureNotificationStore, getNotificationStoreRef } from '@/stores/notification-loader';
import { showIsland } from '@/composables/useIsland.js';
import { useOverviewIsland } from '@/composables/useOverviewIsland.js';

/* 横屏左栏的页面级规则（body.page-home 段）与 UserSpace / 他人空间共用同一份，
   断点与栏宽档位只在这一个文件里定义。
   ⚠️ 用 JS import 而不是 `<style src>`（原第 610 行）—— 同一份 landscape-rail.css
   已被 Bolek/Bolek/index.vue 以 JS import 引入，`<style src>` 形态下 CSS 去重后
   vite-plugin-pwa 的 buildEnd 会拿到 undefined descriptor
   （`Cannot read properties of undefined (reading 'scoped')`）崩构建；
   2026-11-14 在博莱克侧实测过同一坑，2026-11-17 部署链再次触发（CI run 44025124952）。 */
import '@/views/user-center/UserSpace/styles/landscape-rail.css';
import { themeManager } from '@/utils/theme-manager.js';
import { logoutAndReload } from '@/utils/logout-and-reload.js';

// 官方英雄区舞台（hero 流 + 四类周年弹窗）：独立 chunk，只在切到「官方」分区时才请求
const AsyncOfficialHeroStage = createPanelAsync(
  () => import('./components/OfficialHeroStage.vue'),
  { label: 'AsyncOfficialHeroStage' },
);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);

// 开场遮罩：自动退场与跳过共用同一套状态。
const {
  gateDismissed,
  gateLeaving,
  forumOpen,
  forumEntering,
  gateSettled,
  bottomNavReady,
  fadeDurationMs,
  bottomNavEnterMs,
  focusDurationMs,
  commitGate,
  mounted: mountGateOverlay,
  unmounted: unmountGateOverlay,
} = useGateOverlay();

/* 开屏在场 = 导航栏不挂载（App.vue 的 v-if 经 global-navbar-visibility 读这个单例）。
   immediate 是必要的：进站时 gate 就是开着的，导航必须从**首帧**起就不存在，
   否则会「先挂载再卸载」闪一下。写入值与 useHomeGate 的模块初值同源
   （都来自 readGatePassed），所以 immediate 这一下不会造成跳变。 */
watch(gateDismissed, (dismissed) => setHomeGateScreening(!dismissed), { immediate: true });

// ============================================
// 活动版开屏（home_gate_config）
// ============================================
/* 数据源是 DB 单行表，管理台在 /admin/gate-console。
   首帧必须同步决定渲染哪种开屏，所以先用 localStorage 缓存（与 gate-passed 同性质），
   网络回来后再覆盖。没有缓存 / 表不存在 / 网络失败 → 回落到活动快照（GATE_CONFIG_FALLBACK），
   快照也过期了（活动已结束）才走现有默认开屏。
   ⚠️ 三级而不是两级：无缓存用户（新设备 / 清了站点数据 / 换了构建指纹）直接回落 null 时，
   首帧会播默认开屏、网络回来再切成活动版 —— 而这段时间用户往往已经跳过或等开场自动结束，
   活动版的 CTA 就永远没被看见（2026-10-31 用户报障的正是这个）。 */
const gateConfig = ref(readGateConfigCache() || GATE_CONFIG_FALLBACK);
const gateSceneActive = computed(() => isGateConfigActive(gateConfig.value));
const gateCtaTarget = computed(() => resolveGateCtaTarget(gateConfig.value));

/* 远端配置在开场层可见时暂存，退场后再应用，避免展示中突然换画。 */
let pendingGateConfig = null;
const applyGateConfig = (config) => {
  if (!gateDismissed.value) {
    pendingGateConfig = config;
    return;
  }
  gateConfig.value = config;
};
watch(gateDismissed, (dismissed) => {
  if (!dismissed || !pendingGateConfig) return;
  gateConfig.value = pendingGateConfig;
  pendingGateConfig = null;
});

const handleGateCta = () => {
  const target = gateCtaTarget.value;
  if (!target) return;
  /* 顺序不能反：先 commit（写「已通过」标记 + 收浮层），再导航。
     浮层是 Home 内的 fixed 覆盖层，直接 push 会让它跟着 Home 一起卸载，
     观感上就是硬切 —— 这正是想要的结果，不要改成「等动画播完再跳」。 */
  commitGate();
  if (target.to) router.push(target.to).catch(() => {});
  else if (target.href) window.open(target.href, '_blank', 'noopener');
};

// ============================================
// 智能概览灵动岛：唯一自动触发点 =「进入论坛」（首屏解锁落定）
// ============================================
/* 2026-09-30 口径：从「登录 / 进站即弹」改为「进论坛即弹」——用户希望弹点跟「开始看内容」
   这个动作绑定，而不是跟「打开站点」绑定（后者像一条登录欢迎弹窗，随时会打断人）。
   gateSettled 是首屏解锁的落定信号，两条路径都覆盖：
     · 首次访问 / 超过 24h 重播：开场遮罩淡出并卸载后为 true；
     · 24h 内回访（gateAlreadyPassed）：开场画本来就不播、论坛即首屏 → setup 时就是 true。
   登录态由 auth 异步解析，与 gateSettled 谁后到位都可能，所以两者任一变化都要再判一次
   （immediate 覆盖「已登录 + 首屏已解锁」的冷启动）。
   重复由 useOverviewIsland 内部三道守卫兜住（会话标记 + 「当日已检查」天粒度游标 + 5min 冷却），
   所以这里只管「到点就调一次」，不需要自己记状态。 */
const { maybeShowOverviewIsland } = useOverviewIsland();

watch(
  [gateSettled, isLoggedIn],
  ([settled, loggedIn]) => {
    if (!settled || !loggedIn) return;
    maybeShowOverviewIsland({ currentPath: route.path });
  },
  { immediate: true },
);

// ============================================
// 论坛分区：URL 的 view 是唯一真源（/?view=official 深链直达）
// ============================================
const forumSection = ref(resolveForumSection(route.query.view));
const forumShellRef = ref(null);

/* 横屏左栏的「发布会话」闸门（与 UserSpaceMain 共用同一份实现，见 composables/
   useForumComposerSession.js）：会话状态由 ForumMain 的 composer-state 事件透传上来，
   切落点前一律先 await dismissComposerSession()。 */
const { composerOpen, handleComposerState, dismissComposerSession } =
  useForumComposerSession(forumShellRef);

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
// 底栏（四席）：进入论坛后滑入，此后随滚动方向隐藏 / 显现
// ============================================
const { hidden: bottomNavHidden, reset: resetBottomNavAutoHide } = useScrollDirectionHide({
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

const handleBottomNavClick = async (itemId) => {
  /* ⚠️ 闸门必须在最前面、且在「已在论坛就回顶部」那条短路之前：
     首页这一席恒为 'community'，而「内容」那一席的 id 正好也是 community，
     会话开着时点「内容」原本会命中下面那条提前 return —— 什么都不发生、
     遮罩继续盖着内容区，且论坛侧的「保存草稿」确认链永远走不到。
     有未保存内容时这里会等用户在确认框里选完（Promise 才 resolve）。 */
  await dismissComposerSession();
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
const notificationStoreRef = getNotificationStoreRef();
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const hasUnreadMessages = computed(() => unreadCount.value > 0);
// ============================================
// 横屏左栏的动作分发（与 UserSpaceMain.handleRailAction 同一套语义，
// 只是落在首页自己的既有入口上；主导航那四席走 handleBottomNavClick）
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
  // 「发布」本身就是打开这个会话，其余动作都先收掉它
  // （与 UserSpaceMain.handleRailAction 同一套语义）
  if (actionId !== 'compose') await dismissComposerSession();
  switch (actionId) {
    case 'compose':
      await callForumShell('openComposer');
      break;
    case 'assets':
      /* 2026-10-26：左栏便捷区全站收敛为「发布 / 资产」。首页没有资产页，
         资产是全局个人入口 ⇒ 落到「我」页的资产 tab（与其它宿主同一条落点）。 */
      router.push('/user-space?tab=assets');
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
      // 退出后整页重载：首页论坛流/左栏/hero 都是登录态下取回的数据，
      // 只清 pinia 不会重新取数（用户报障「点退出登录页面不刷新」）。
      await logoutAndReload(authStore);
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
/* 根元素 ref 只用来写 --userspace-nav-h。 */
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

/* 路由级缓存的名字（2026-11-14）：与 router/routes/public.ts 的 meta.keepAliveName
   逐字一致，否则 <KeepAlive :include> 静默不缓存（不报错，只表现为每次回来整页重挂）。
   守：tests/unit/keep-alive-names.test.js */
defineOptions({ name: 'HomePage' });

onMounted(async () => {
  document.body.classList.add('is-loaded');
  /* 开场画：2 秒自动渐隐，跳过按钮立即触发同一退场流程。 */
  mountGateOverlay();

  void ensureNotificationStore();
  setupNavIslandProbe();
  // 左栏「更多」菜单的主题按钮要跟着全站主题走（真源 themeManager）
  themeManager.addListener(handleThemeChange);

  /* 活动版开屏配置：与英雄区**并行**、互不依赖。
     ⚠️ 这里曾经写成「await fetchPublished() 之后再 fetchGateConfig()」—— 而
     fetchPublished 内部有 6s 竞速兜底（弱网 / 连接悬挂时就是等满 6s），
     等于开屏配置要排队 6 秒才发出去，整段首屏都在播错误的开屏（2026-10-31 实测：
     冷启动 6s 内 home_gate_config 请求根本没发出）。两者没有任何依赖，不许串行。
     失败（表还没建 / 断网）时保持快照值，也就是继续播活动版 —— 不能因为
     后台配置拉不到就让首屏白屏或临时降级成默认开屏。 */
  const gateConfigTask = fetchGateConfig()
    .then(({ data }) => {
      if (data) applyGateConfig(data);
    })
    .catch(() => {});

  // 开场画与英雄区数据（失败不影响首屏：内部有缓存/baseline 兜底，且带超时竞速）
  try {
    await homeHeroesStore.fetchPublished();
  } catch {
    // 静默失败：动态英雄区是增量，表不存在时仅返回空数组
  }

  // 只为让「首屏初始化完成」这句话真的成立；上面已经并行跑起来了
  await gateConfigTask;
});

/* 被 KeepAlive 缓存后「回到首页」不会再走 onMounted（2026-11-14）：
   只补一件与「回来了」有关的状态 —— 底栏若是在别处/离开时收成了球，回来要铺开
   （用户刚点完一次导航，见到的应该是整条，不是一颗球）。 */
onActivated(() => {
  resetBottomNavAutoHide();
});

onBeforeUnmount(() => {
  themeManager.removeListener(handleThemeChange);
  /* 开场遮罩的计时器、键盘监听、reduce 监听与滚动锁兜底。 */
  unmountGateOverlay();
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

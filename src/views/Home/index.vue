<template>
  <div ref="homeRootRef" class="home" :class="{ 'home-forum-open': forumOpen, 'home-forum-entering': forumEntering }">

    <!-- 1. 开场层：满屏街景画（一次性）。
         下滑 → 本层线性上移退出、论坛层随即铺满；退出后即卸载，不再支持上滑回到开场画。
         普通文档流 + 固定覆盖层，不劫持滚动（过渡结束就是干净的文档流滚动）。 -->
    <div v-if="!gateDismissed" ref="gateRef" class="home-gate" :class="{ 'is-leaving': gateLeaving }">
      <StreetSceneHero :hero="streetSceneHero" />
      <!-- 键盘 / 读屏用户的等价入口：视觉隐藏、聚焦时可见 -->
      <button ref="gateEnterBtnRef" class="home-gate-enter" type="button" @click="enterForum">
        进入方块论坛
      </button>
    </div>

    <!-- 2. 论坛层：方块（论坛）分区壳（官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象）
         与 UserSpace 的「方块」分区共用同一份组件；归档区 + 页脚接在论坛流末尾。 -->
    <div ref="forumStageRef" class="home-forum-stage">
      <ForumSectionShell ref="forumShellRef" v-model:section="forumSection"
        @island-message="handleIslandMessage">
        <template #official>
          <AsyncOfficialHeroStage />
        </template>
      </ForumSectionShell>
      <HomeFooter />
    </div>

    <!-- 3. 移动端底栏：开场画退掉大半后才从下方浮上来（v-if 由 bottomNavReady 控制，
            不是 forumOpen —— 早挂载就会和封面同时抢镜）；此后随滚动方向隐藏 / 显现。
         桌面 / 横屏整槽关掉（顶部 UnifiedNavbar 足够）。 -->
    <div v-if="bottomNavReady" class="home-bottom-nav-slot">
      <UserSpaceBottomNav :visible="true" :hidden="bottomNavHidden" :enter-duration="BOTTOM_NAV_ENTER_MS"
        :nav-items="BOTTOM_NAV_ITEMS" :current-tab="activeBottomNavId"
        :nav-indicator-style="bottomNavIndicatorStyle" :has-unread-messages="hasUnreadMessages"
        :unread-count="unreadCount" @nav-click="handleBottomNavClick" />
    </div>
  </div>
</template>

<script setup>
/* 首页（2026-09-23）
   结构：满屏街景开场画（一次性）→ 线性滑出 → 方块论坛铺满 → 归档区 + 页脚 → 底栏。
   - 开场画不是可滚动的第一屏，而是「过了就不再回来」的入场：下滑（滚轮 / 触摸 / 键盘）
     即触发一次 720ms 线性过渡，开场画上移退出，论坛从下方就位。
   - 论坛本体与 UserSpace 的「方块」分区共用 ForumSectionShell（单源），
     分区七席、30s 轮询、分区过渡动画全部原样。
   - 底栏五席来自 @/config/bottom-nav，进入论坛后滑入，随后由滚动方向驱动显隐。 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import StreetSceneHero from "./components/StreetSceneHero.vue";
import HomeFooter from "./components/HomeFooter.vue";
import ForumSectionShell from "@/views/user-center/UserSpace/components/ForumSectionShell.vue";
import UserSpaceBottomNav from "@/views/user-center/UserSpace/components/UserSpaceBottomNav.vue";
import { useScrollDirectionHide } from "@/views/user-center/UserSpace/composables/useScrollDirectionHide.js";
import { useHomeHeroesStore } from "@/stores/homeHeroes";
import { useAuthStore } from "@/stores/auth";
import { FORUM_DEFAULT_SECTION, resolveForumSection } from "@/config/forum-sections";
import { BOTTOM_NAV_ITEMS } from "@/config/bottom-nav";
import { getNotificationStoreSync, loadNotificationStore } from "@/stores/notification-loader";
import { showIsland } from "@/composables/useIsland.js";

// 官方英雄区舞台（hero 流 + 四类周年弹窗）：独立 chunk，只在切到「官方」分区时才请求
const AsyncOfficialHeroStage = defineAsyncComponent(
  () => import("./components/OfficialHeroStage.vue")
);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);

// ============================================
// 开场层：一次性入场
// ============================================
/* 开场画「看过一次就暂停一段时间」的标记。
   2026-09-24：key 带上构建指纹（生产构建注入的 <meta name="boh-build-id">；dev 不注入）——
   每次发布新版本，用户再访问就会重播一次开场画。
   dev 下拿不到 meta → 退回不带后缀的 key，与开发时的既有行为一致（探针因此也稳定）。
   2026-09-24 晚再修：原 sessionStorage 语义在 iOS PWA / 长驻标签下「会话」能跨好几天，
   标记一旦写入，开场画（连同滚动锁动画与底栏浮现）就再也不会播 —— 用户感知为
   「首屏动画没了」。改 localStorage + 24h 时间窗：同构建 24h 内不重复打扰，跨天自动重播。 */
const GATE_PASSED_KEY = "boh-home-gate-passed";
const GATE_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const resolveGateStorageKey = () => {
  if (typeof document === "undefined") return GATE_PASSED_KEY;
  const buildId = String(document.querySelector('meta[name="boh-build-id"]')?.content || "").trim();
  return buildId ? `${GATE_PASSED_KEY}:${buildId}` : GATE_PASSED_KEY;
};
const GATE_STORAGE_KEY = resolveGateStorageKey();
// 手势/滚轮累计位移阈值（px）：够小以保证「往下滑就进」，够大以避开误触
const SWIPE_TRIGGER_DISTANCE = 28;
// 开场层退出的时长（2026-09-24 二调：880ms 加速冲出，动态感增强）。
// ⚠️ 必须与 style.scoped.css 的 --home-gate-duration 一致 —— 开场层卸载时机按它计时。
const GATE_TRANSITION_MS = 880;
// 论坛层落定的时长（比开场层多 100ms，形成「迟到」的余韵）。
// ⚠️ 对应 style.scoped.css 的 --home-forum-duration；到时摘掉入场类。
const FORUM_ENTER_MS = 980;
/* 底栏浮现：等封面退场过半（约 64%）才起步，滑入用 900ms ——
   「封面离开的同时导航栏自然浮现」，不是两边同时抢镜，也不是弹上来。
   ⚠️ BOTTOM_NAV_ENTER_MS 会传给 UserSpaceBottomNav 的 enter-duration，
   组件按它（而非内置 760ms）摘掉入场类，两边必须一致。 */
const BOTTOM_NAV_REVEAL_DELAY_MS = 560;
const BOTTOM_NAV_ENTER_MS = 900;

const homeRootRef = ref(null);
const gateRef = ref(null);
const gateEnterBtnRef = ref(null);
const forumStageRef = ref(null);
const gateLeaving = ref(false);
const gateDismissed = ref(false);
const forumOpen = ref(false);
// 论坛层是否正在「就位」（只在本会话真播了开场画时为 true，避免直接进论坛时空跑一次动画）
const forumEntering = ref(false);
/* 底栏是否该现身。刻意与 forumOpen 分开：底栏要在开场画退场的后半段才浮现，
   所以它有一条独立的延迟；已通过过开场画的会话里直接就位。 */
const bottomNavReady = ref(false);
let gateUnmountTimer = null;
let enterClassTimer = null;
let bottomNavTimer = null;
let swipeTravel = 0;
let touchStartY = 0;

const readGatePassed = () => {
  try {
    const seenAt = Number(window.localStorage.getItem(GATE_STORAGE_KEY));
    if (!Number.isFinite(seenAt) || seenAt <= 0) return false;
    return Date.now() - seenAt < GATE_REPLAY_WINDOW_MS;
  } catch {
    // 隐私模式 / storage 被禁：当作没通过，照常播开场画
    return false;
  }
};
const markGatePassed = () => {
  try {
    window.localStorage.setItem(GATE_STORAGE_KEY, String(Date.now()));
  } catch {
    // 存不住就算了，下次照常播
  }
};

const teardownGateGesture = () => {
  if (typeof window === "undefined") return;
  window.removeEventListener("wheel", handleWheel);
  window.removeEventListener("touchstart", handleTouchStart);
  window.removeEventListener("touchmove", handleTouchMove);
  window.removeEventListener("keydown", handleGateKeydown);
};

/* ---------- 过渡期滚动锁（2026-09-24）----------
   「被带到下面」的确定性：触发进论坛后的 880ms 里，无论手势再滑多长、触控板惯性、
   还是连滚几下，底层文档都不许动 —— 否则动画一结束 gate 卸载，落到的是已经滚过
   几屏的论坛，「被带下去」就成了「掉到中间」。
   ⚠️ 必须用 setProperty(..., 'important')：style.global.css 里 html/body 的 overflow
   带 !important（棘轮基线），普通 inline style 会被样式表压掉。
   ⚠️ 解锁必须双保险：论坛落定的计时器里 + 组件 onBeforeUnmount（防路由跳走时锁死）。 */
const lockDocumentScroll = () => {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("overflow", "hidden", "important");
  document.body.style.setProperty("overflow", "hidden", "important");
};
const unlockDocumentScroll = () => {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty("overflow");
  document.body.style.removeProperty("overflow");
};

/** 进入论坛：开场层线性上移退出（论坛层同时从下方就位）→ 计时结束后卸载开场层 */
const enterForum = () => {
  if (gateLeaving.value || gateDismissed.value) return;
  teardownGateGesture();
  /* 开场层是 fixed 覆盖层，期间底层文档可能已被滚过一截（视觉上看不见）。
     进入前把滚动位置归零，论坛必须从顶部开始。 */
  window.scrollTo({ top: 0, behavior: "auto" });
  // 过渡期滚动锁：从这一刻到论坛层落定，手势 / 惯性都带不动底层文档（见上方说明）
  lockDocumentScroll();
  gateLeaving.value = true;
  forumOpen.value = true;
  forumEntering.value = true;
  markGatePassed();
  gateUnmountTimer = window.setTimeout(() => {
    gateUnmountTimer = null;
    gateDismissed.value = true;
  }, GATE_TRANSITION_MS);
  enterClassTimer = window.setTimeout(() => {
    enterClassTimer = null;
    forumEntering.value = false;
    // 论坛层已落定，交还滚动权（此后由滚动方向驱动底栏显隐）
    unlockDocumentScroll();
  }, FORUM_ENTER_MS);
  // 底栏晚一步：开场画退掉大半后才开始从下方浮上来（挂载即播入场动画）
  bottomNavTimer = window.setTimeout(() => {
    bottomNavTimer = null;
    bottomNavReady.value = true;
  }, BOTTOM_NAV_REVEAL_DELAY_MS);
};

const handleWheel = (event) => {
  // 只认「往下逛」的方向；反向滚动清零，避免来回抖动误触发
  swipeTravel = event.deltaY > 0 ? swipeTravel + event.deltaY : 0;
  if (swipeTravel >= SWIPE_TRIGGER_DISTANCE) enterForum();
};

const handleTouchStart = (event) => {
  touchStartY = event.touches?.[0]?.clientY ?? 0;
  swipeTravel = 0;
};

const handleTouchMove = (event) => {
  const currentY = event.touches?.[0]?.clientY ?? 0;
  // 手指上划 = 内容往下走 = 进入论坛
  const delta = touchStartY - currentY;
  swipeTravel = delta > 0 ? delta : 0;
  if (swipeTravel >= SWIPE_TRIGGER_DISTANCE) enterForum();
};

let gateKeyTravel = 0;
const handleGateKeydown = (event) => {
  const scrollKeys = ["ArrowDown", "PageDown", " ", "Spacebar", "End"];
  if (!scrollKeys.includes(event.key)) {
    gateKeyTravel = 0;
    return;
  }
  event.preventDefault();
  gateKeyTravel += 1;
  if (gateKeyTravel >= 2) enterForum();
};

const setupGateGesture = () => {
  if (typeof window === "undefined") return;
  window.addEventListener("wheel", handleWheel, { passive: true });
  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchmove", handleTouchMove, { passive: true });
  window.addEventListener("keydown", handleGateKeydown);
};

// ============================================
// 论坛分区：URL 的 view 是唯一真源（/?view=official 深链直达）
// ============================================
const forumSection = ref(resolveForumSection(route.query.view));
const forumShellRef = ref(null);

watch(forumSection, (next) => {
  const nextQuery = { ...route.query };
  if (!next || next === FORUM_DEFAULT_SECTION) delete nextQuery.view;
  else nextQuery.view = next;
  if (String(route.query.view || "") === String(nextQuery.view || "")) return;
  router.replace({ query: nextQuery });
});

watch(() => route.query.view, (raw) => {
  const next = resolveForumSection(raw);
  if (next !== forumSection.value) forumSection.value = next;
});

// #ryyik-letter 深链：先落到「官方」分区（信件弹窗归官方舞台所有，挂载后自行消费 hash）
watch(
  () => route.hash,
  (hash) => {
    if (hash === "#ryyik-letter") forumSection.value = "official";
  },
  { immediate: true }
);

/* 一次性论坛意图（?compose=1 / ?search=1）：由 UserSpace / 他人空间的横屏左栏按钮带来，
   这里把意图转交给分区壳（它透传 ForumMain 的 openComposer / focusSearch）。
   分区壳是异步 chunk，首次到达时可能还没就绪 → 轮询等一小会儿。 */
const consumeForumIntent = async () => {
  const method = route.query.compose === "1"
    ? "openComposer"
    : (route.query.search === "1" ? "focusSearch" : "");
  if (!method) return;
  const nextQuery = { ...route.query };
  delete nextQuery.compose;
  delete nextQuery.search;
  router.replace({ query: nextQuery });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const shell = forumShellRef.value;
    if (shell && typeof shell[method] === "function" && shell[method]()) return;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
};

watch(
  () => [route.query.compose, route.query.search],
  () => { void consumeForumIntent(); },
  { immediate: true }
);

// ============================================
// 底栏（五席）：进入论坛后滑入，此后随滚动方向隐藏 / 显现
// ============================================
const { hidden: bottomNavHidden } = useScrollDirectionHide({
  // 底栏还没就位（开场画阶段 / 浮现延迟窗口内）不需要方向联动
  forceVisible: computed(() => !bottomNavReady.value)
});

// 首页 = 方块（论坛）这一席
const activeBottomNavId = computed(() => "community");
const bottomNavIndicatorStyle = computed(() => {
  const index = Math.max(0, BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeBottomNavId.value));
  return {
    "--active-nav-index": index,
    "--active-nav-center": `${((index + 0.5) / BOTTOM_NAV_ITEMS.length) * 100}%`,
    "--nav-count": BOTTOM_NAV_ITEMS.length
  };
});

const handleBottomNavClick = (itemId) => {
  // 「方块」就是本页：已经在论坛了，回到论坛顶部即可，不做无谓跳转
  if (itemId === activeBottomNavId.value) {
    window.scrollTo({ top: 0, behavior: "auto" });
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

// 论坛内嵌态的系统提示 → 统一走灵动岛
const handleIslandMessage = (payload = {}) => {
  if (!payload || typeof payload !== "object") return;
  const title = String(payload.title || "").trim();
  if (!title) return;
  showIsland.notify({
    title,
    message: payload.message,
    icon: payload.icon,
    type: payload.type,
    durationMs: payload.durationMs
  });
};

// ============================================
// 导航胶囊实测高度 → --userspace-nav-h
// ============================================
/* 分区页签（SegmentTabs）的顶部避让吃这个变量；导航岛含状态卡时高度会变
   （78 ↔ 130+），写死必然一头空一头盖。口径与 UserSpaceMain 的
   syncUserspaceNavHeight 一致：读 #unified-nav-container 的实测高度。
   （首页不经过 UserSpaceMain，所以这里独立探测一次。） */
let navIslandResizeObserver = null;
let navProbeTimer = null;
const syncNavIslandHeight = () => {
  const root = homeRootRef.value;
  if (!root) return;
  const island = document.getElementById("unified-nav-container");
  if (!island) return;
  const height = Math.ceil(island.getBoundingClientRect().height);
  if (height > 0) root.style.setProperty("--userspace-nav-h", `${height}px`);
};

/* 导航栏是壳层组件，首页 onMounted 时可能还没挂进 DOM → 短轮询等它就位再观察。
   上限 50×60ms：拿不到就退回 SegmentTabs 的默认值（84px），不会卡住任何东西。 */
const setupNavIslandProbe = () => {
  if (typeof window === "undefined") return;
  let tries = 0;
  const attach = () => {
    navProbeTimer = null;
    const island = document.getElementById("unified-nav-container");
    if (island) {
      syncNavIslandHeight();
      if (typeof window.ResizeObserver === "function") {
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
const streetSceneHero = computed(() =>
  homeHeroesStore.publishedHeroes.find((hero) => hero.template === "street-scene") || null
);

onMounted(async () => {
  document.body.classList.add("is-loaded");

  if (readGatePassed()) {
    // 本次会话已经进过论坛：不重播开场画，直接落在论坛（底栏也就位，不补浮现动画）
    gateDismissed.value = true;
    forumOpen.value = true;
    bottomNavReady.value = true;
  } else {
    setupGateGesture();
  }

  void ensureNotificationStore();
  setupNavIslandProbe();

  // 开场画与英雄区数据（失败不影响首屏：内部有缓存/baseline 兜底，且带超时竞速）
  try {
    await homeHeroesStore.fetchPublished();
  } catch {
    // 静默失败：动态英雄区是增量，表不存在时仅返回空数组
  }
});

onBeforeUnmount(() => {
  teardownGateGesture();
  if (gateUnmountTimer) {
    window.clearTimeout(gateUnmountTimer);
    gateUnmountTimer = null;
  }
  if (enterClassTimer) {
    window.clearTimeout(enterClassTimer);
    enterClassTimer = null;
  }
  if (bottomNavTimer) {
    window.clearTimeout(bottomNavTimer);
    bottomNavTimer = null;
  }
  if (navProbeTimer) {
    window.clearTimeout(navProbeTimer);
    navProbeTimer = null;
  }
  if (navIslandResizeObserver) {
    navIslandResizeObserver.disconnect();
    navIslandResizeObserver = null;
  }
  document.body.style.overflow = "";
  // 过渡期滚动锁的兜底解锁：路由跳走时计时器已被清掉，不清会把文档永久锁死
  unlockDocumentScroll();
});
</script>

<style scoped src="./style.scoped.css"></style>
<style src="./style.global.css"></style>

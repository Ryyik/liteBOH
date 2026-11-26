<template>
  <nav
    id="unified-nav-container"
    class="unified-nav"
    aria-label="全局导航"
    :class="{
      'mobile-menu-open': isMobileMenuOpen,
      'nav-immersive-on': immersiveNav,
      'nav-immersive-expanded': immersiveNav && isExpandedLooking,
    }"
    :data-theme="surfaceTheme"
  >
    <div
      ref="navSurface"
      class="unified-nav-surface"
      :class="{
        'has-status-card': statusCardItem.visible,
        'has-long-status-card': statusCardItem.visible && statusCardItem.isLong,
        /* 注册页横屏也走「导航长成岛」这一形态：注册卡从导航底边延展出来，
           两半拼成一张岛（用户口径「横屏用岛注册」）。
           刻意复用 has-login-card 而不是新造一个类 —— 它表达的语义是
           「导航收成 720 宽的岛、把下面的卡片接住」，与具体是登录还是注册无关。
           新造类等于把宽度/圆角/材质/与 mini 的让位规则整份复制一遍，
           两处判定必然漂移（style.scoped.css 里已记过 `:not(.has-login-card)`
           那类补丁的教训）。 */
        'has-login-card': showLoginModal || isJoinLandscape,
        'has-task-card': isTaskCardShown,
        'has-custom-card': !!islandCustomSlot.component,
        // BOH 岛停靠：必须由 Vue 绑定（而不是只靠 BohIsland 的 classList.add）——
        // 否则任何 :class 重算（打开下拉 / 通知卡）都会把命令式类名抹掉，岛卡悬浮在菜单上。
        'has-boh-island': bohIsland.docked.value,
        // 桌面下拉打开 = surface 自己长成宽岛（内容坐在长出来的玻璃里，与 has-status-card 同一套机制）
        'has-submenu': !!expandedMenu,
        // 移动端菜单（汉堡）同理：竖屏/桌面的汉堡菜单也坐在长出来的那块玻璃里，
        // 不再在岛下面浮一张独立白卡（用户口径「竖屏没有做好同样岛化的适配」）。
        'has-mobile-menu': isMobileMenuOpen,
        // 新闻中心的搜索/筛选是从灵动导航栏向下衍生的扩展卡片，不占用导航文字行。
        'has-nav-island-panel': false,
        'has-nav-search-panel': false,
        'has-nav-filter-menu': false,
        // 竖屏 Mini 形态（plans/009）：nav-mini-caps = 机制生效，nav-expanded = 当前视觉长条
        'nav-mini-caps': navMini,
        // 沉浸阅读形态：导航收成左上角迷你球（阅读页等 route.meta.immersiveNav 页面）
        'nav-immersive': immersiveNav,
        'nav-expanded': isExpandedLooking,
      }"
      @click="handleSurfaceTap"
      @pointerenter="handleNavPointerEnter"
      @pointermove="handleNavPointerMove"
      @pointerleave="handleNavPointerLeave"
      @focusin="handleNavFocusIn"
      @focusout="handleNavFocusOut"
      :style="{
        '--global-nav-status-duration': `${navStatus.duration}ms`,
        '--global-nav-status-card-height': `${navStatusCardHeight}px`,
        '--global-nav-custom-card-height': `${customCardHeight}px`,
        '--nav-submenu-h': `${submenuH}px`,
        '--nav-mobile-h': `${mobileMenuH}px`,
      }"
    >
      <div class="nav-container">
        <router-link to="/" class="nav-logo" @click.stop>
          <div class="nav-logo-icon">
            <img
              :src="getImageUrl('favicon.webp')"
              alt="Logo"
              style="width: 100%; height: 100%; object-fit: contain"
            />
          </div>
          <span class="nav-logo-text">方块之家</span>
        </router-link>

        <ul class="nav-menu">
          <li
            v-for="item in navItems"
            :key="item.name"
            class="nav-menu-item"
            :class="{ 'has-dropdown': hasChildren(item) }"
          >
            <template v-if="hasChildren(item)">
              <button
                type="button"
                class="nav-link-wrapper"
                :class="{ active: item.isActive, expanded: item.isExpanded }"
                :aria-expanded="item.isExpanded"
                :aria-controls="`nav-submenu-${item.name}`"
                @click.stop="toggleSubMenu(item.name)"
              >
                <span>{{ item.label }}</span>
              </button>
              <ul
                :id="`nav-submenu-${item.name}`"
                :ref="(el) => setSubmenuEl(item.name, el)"
                class="nav-submenu"
                :class="{ active: item.isExpanded }"
                @click.stop
              >
                <!-- 有分组的菜单：分组列表 ↔ 三级下钻（带切换动画） -->
                <template v-if="hasGroupChildren(item)">
                  <Transition name="nav-drill" mode="out-in">
                    <div
                      v-if="activeGroup"
                      :key="`grand-${item.name}-${activeGroup}`"
                      class="nav-submenu-pane nav-submenu-pane-grand"
                    >
                      <li class="nav-submenu-back">
                        <a href="javascript:;" @click="activeGroup = null">
                          <span class="nav-submenu-back-arrow">←</span> 返回
                        </a>
                      </li>
                      <li v-for="grand in activeGroupChildren(item)" :key="grand.name">
                        <router-link
                          v-if="grand.path"
                          :to="grand.path"
                          :class="{ active: isActive(grand.path) }"
                          :aria-current="isActive(grand.path) ? 'page' : undefined"
                          @click="expandedMenu = null"
                        >
                          {{ grand.label }}
                        </router-link>
                        <a
                          v-else-if="grand.action"
                          href="javascript:;"
                          @click="
                            handleMenuAction(grand.action);
                            expandedMenu = null;
                          "
                        >
                          {{ grand.label }}
                        </a>
                      </li>
                    </div>
                    <div
                      v-else
                      :key="`groups-${item.name}`"
                      class="nav-submenu-pane nav-submenu-pane-groups"
                    >
                      <li v-for="child in item.children" :key="child.name">
                        <router-link
                          v-if="child.path"
                          :to="child.path"
                          :class="{ active: isActive(child.path) }"
                          :aria-current="isActive(child.path) ? 'page' : undefined"
                          @click="expandedMenu = null"
                        >
                          {{ child.label }}
                        </router-link>
                        <a
                          v-else-if="child.action"
                          href="javascript:;"
                          @click="
                            handleMenuAction(child.action);
                            expandedMenu = null;
                          "
                        >
                          {{ child.label }}
                        </a>
                        <a
                          v-else
                          href="javascript:;"
                          class="nav-submenu-group-title"
                          @click="
                            activeGroup = child.name;
                            activeGroupParent = item.name;
                          "
                        >
                          {{ child.label }}
                        </a>
                      </li>
                    </div>
                  </Transition>
                </template>
                <!-- 扁平二级（无分组，如社区） -->
                <template v-else>
                  <li v-for="child in item.children" :key="child.name">
                    <router-link
                      v-if="child.path"
                      :to="child.path"
                      :class="{ active: isActive(child.path) }"
                      :aria-current="isActive(child.path) ? 'page' : undefined"
                      @click="expandedMenu = null"
                    >
                      {{ child.label }}
                    </router-link>
                    <a
                      v-else-if="child.action"
                      href="javascript:;"
                      @click="
                        handleMenuAction(child.action);
                        expandedMenu = null;
                      "
                    >
                      {{ child.label }}
                    </a>
                  </li>
                </template>
              </ul>
            </template>
            <template v-else>
              <router-link
                :to="item.path"
                :class="{ active: item.isActive }"
                :aria-current="item.isActive ? 'page' : undefined"
                active-class=""
                exact-active-class=""
                @pointerenter="prefetchRoute(item.path)"
              >
                {{ item.label }}
              </router-link>
            </template>
          </li>
        </ul>

        <div class="nav-user" id="nav-user-area">
          <!-- 全局搜索入口：工具类操作归右侧工具区；mini 未展开态由样式隐藏（那会撑爆精算过的胶囊宽度） -->
          <button
            type="button"
            class="nav-search-btn"
            :class="{ active: isSearchOpen }"
            :aria-expanded="isSearchOpen"
            aria-label="搜索全站内容"
            title="搜索（/）"
            @click.stop="toggleSearch"
          >
            <Search :size="16" :stroke-width="2.2" aria-hidden="true" />
          </button>
          <template v-if="isLoggedIn">
            <router-link
              :to="myBlockTarget"
              class="nav-user-info nav-user-profile"
              id="nav-user-info"
              title="进入我的方块"
              :aria-label="
                hasUnreadMessages
                  ? `我的方块，${unreadCount > 99 ? '99+' : unreadCount} 条未读消息`
                  : '我的方块'
              "
              @click="handleMyBlockClick"
              @pointerenter="prefetchRoute('/user-space')"
            >
              <span class="boh-avatar-wrap">
                <div class="nav-avatar">
                  <img
                    v-if="avatarUrl"
                    :src="avatarUrl"
                    alt="头像"
                    class="nav-avatar-img"
                    loading="lazy"
                    decoding="async"
                  />
                  <span v-else>{{ username ? username.charAt(0).toUpperCase() : 'U' }}</span>
                  <!-- 未读消息红点：数字已并入父链路的 aria-label，避免重复朗读 -->
                  <div v-if="hasUnreadMessages" class="unread-badge-nav" aria-hidden="true">
                    {{ unreadCount > 99 ? '99+' : unreadCount }}
                  </div>
                </div>
                <span
                  v-if="navFrame"
                  class="boh-avatar-frame"
                  :style="{
                    '--boh-avatar-frame-url': `url(${navFrame.url})`,
                    '--boh-avatar-frame-scale': String(navFrame.scale),
                  }"
                  aria-hidden="true"
                ></span>
              </span>
              <span class="nav-username">我的方块</span>
            </router-link>
          </template>
          <template v-else-if="isInitialized">
            <button class="nav-login-btn" id="nav-login-btn" @click.stop="showLoginModal = true">
              登录
            </button>
          </template>
          <template v-else>
            <!-- 初始化中，显示一个极简的占位 -->
            <div class="nav-user-loading"></div>
          </template>
        </div>

        <button
          type="button"
          ref="navHamburger"
          class="nav-hamburger"
          id="nav-hamburger"
          :class="{ active: isMobileMenuOpen }"
          :aria-expanded="isMobileMenuOpen || (desktopMiniActive && isExpandedLooking)"
          :aria-controls="desktopMiniActive ? undefined : 'nav-menu-mobile'"
          :aria-label="
            isMobileMenuOpen ? '关闭导航菜单' : desktopMiniActive ? '展开导航' : '打开导航菜单'
          "
          @pointerdown="handleBurgerPointerDown"
          @click.stop="handleBurgerClick"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <div class="nav-menu-mobile" id="nav-menu-mobile" :class="{ active: isMobileMenuOpen }">
        <div class="nav-menu-mobile-content">
          <HomeCatMascot
            v-if="isHomeCatActive"
            class="nav-mobile-menu-cat"
            pool="background"
            :seed="`mobile-menu-${mobileMenuOpenCount}`"
            size="lg"
            decorative
          />
          <div class="nav-mobile-main-menu" :class="{ hidden: expandedMenu }">
            <template v-for="item in navItems" :key="item.name">
              <template v-if="hasChildren(item)">
                <div class="nav-mobile-item has-children">
                  <button
                    type="button"
                    class="nav-mobile-link"
                    :class="{ active: item.isActive }"
                    :aria-expanded="item.isExpanded"
                    aria-controls="nav-menu-mobile-submenu"
                    @click="toggleSubMenu(item.name)"
                  >
                    <span>{{ item.label }}</span>
                  </button>
                </div>
              </template>
              <template v-else>
                <router-link
                  class="nav-mobile-link"
                  :class="{ active: item.isActive }"
                  :aria-current="item.isActive ? 'page' : undefined"
                  :to="item.path"
                  @click="closeMobileMenu"
                >
                  {{ item.label }}
                </router-link>
              </template>
            </template>
          </div>
          <div
            id="nav-menu-mobile-submenu"
            class="nav-mobile-submenu-container"
            :class="{ active: expandedMenu && isMobileMenuOpen }"
            data-panel-variant="glass"
          >
            <div class="nav-mobile-back" @click="closeSubMenu">
              <span class="back-arrow">←</span>
              <span>返回</span>
            </div>
            <template v-for="item in navItems" :key="item.name">
              <div v-show="hasChildren(item) && item.isExpanded" class="nav-mobile-submenu-section">
                <div class="nav-mobile-submenu-heading">{{ item.label }}</div>
                <div class="nav-mobile-submenu" :class="{ active: item.isExpanded }">
                  <!-- 有分组的菜单：分组列表 ↔ 三级下钻 -->
                  <template v-if="hasGroupChildren(item)">
                    <template v-if="activeGroup && activeGroupParent === item.name">
                      <div
                        class="nav-mobile-group-back"
                        @click="
                          activeGroup = null;
                          activeGroupParent = null;
                        "
                      >
                        <span class="group-back-arrow">←</span>
                        <span>返回分组</span>
                      </div>
                      <template v-for="grand in activeGroupChildren(item)" :key="grand.name">
                        <router-link
                          v-if="grand.path"
                          :to="grand.path"
                          :class="{ active: isActive(grand.path) }"
                          :aria-current="isActive(grand.path) ? 'page' : undefined"
                          @click="closeMobileMenu"
                        >
                          {{ grand.label }}
                        </router-link>
                        <a
                          v-else-if="grand.action"
                          href="javascript:;"
                          @click="
                            handleMenuAction(grand.action);
                            closeMobileMenu();
                          "
                        >
                          {{ grand.label }}
                        </a>
                      </template>
                    </template>
                    <template v-else>
                      <template v-for="child in item.children" :key="child.name">
                        <router-link
                          v-if="child.path"
                          :to="child.path"
                          :class="{ active: isActive(child.path) }"
                          :aria-current="isActive(child.path) ? 'page' : undefined"
                          @click="closeMobileMenu"
                        >
                          {{ child.label }}
                        </router-link>
                        <a
                          v-else-if="child.action"
                          href="javascript:;"
                          @click="
                            handleMenuAction(child.action);
                            closeMobileMenu();
                          "
                        >
                          {{ child.label }}
                        </a>
                        <button
                          v-else
                          type="button"
                          class="nav-mobile-group-entry"
                          @click="
                            activeGroup = child.name;
                            activeGroupParent = item.name;
                          "
                        >
                          <span class="nav-mobile-group-entry-label">{{ child.label }}</span>
                        </button>
                      </template>
                    </template>
                  </template>
                  <!-- 扁平二级（无分组，如社区） -->
                  <template v-else>
                    <template v-for="child in item.children" :key="child.name">
                      <router-link
                        v-if="child.path"
                        :to="child.path"
                        :class="{ active: isActive(child.path) }"
                        :aria-current="isActive(child.path) ? 'page' : undefined"
                        @click="closeMobileMenu"
                      >
                        {{ child.label }}
                      </router-link>
                      <a
                        v-else-if="child.action"
                        href="javascript:;"
                        @click="
                          handleMenuAction(child.action);
                          closeMobileMenu();
                        "
                      >
                        {{ child.label }}
                      </a>
                    </template>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
      <GlobalNavStatusCard
        :item="statusCardItem"
        @action="handleNavStatusAction"
        @after-leave="handleNavStatusAfterLeave"
        @resize="handleStatusCardResize"
      />
      <GlobalNavTaskCard
        :item="islandTaskView"
        @action="handleIslandTaskAction"
        @after-leave="handleIslandTaskAfterLeave"
        @resize="handleStatusCardResize"
      />
      <div
        v-show="!isTaskCardShown"
        v-if="islandCustomSlot.component"
        :key="`island-custom-${islandCustomSlot.key}`"
        ref="islandCustomHost"
        class="island-custom-host"
      >
        <!-- 仲裁：任务岛占用 surface 时自定义岛让位（v-show 保状态，隐藏后高度上报 0，收起后自动回归） -->
        <component :is="islandCustomSlot.component" v-bind="islandCustomSlot.props || {}" />
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getImageUrl } from '../../utils/asset-helper.js';
import { useAuthStore } from '@/stores/auth';
import { resolveFrameForAuthor } from '@/composables/useAvatarFrame.js';
import { storeToRefs } from 'pinia';
import { ensureNotificationStore, getNotificationStoreRef } from '@/stores/notification-loader';
import { Search } from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { themeManager } from '@/utils/theme-manager.js';
import { isHomeCatTheme } from '@/utils/home-cat-theme.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { useVersionCheck } from '@/composables/useVersionCheck.js';
import { useGlobalSearch } from '@/composables/useGlobalSearch.js';
import { useBohIsland } from '@/composables/useBohIsland.js';
import { useRoutePrefetch, scheduleIdleRoutePrefetch } from '@/composables/useRoutePrefetch.js';
import { SITE_NAV_ITEMS } from '@/config/site-nav';
import GlobalNavStatusCard from './GlobalNavStatusCard.vue';
import GlobalNavTaskCard from './GlobalNavTaskCard.vue';
import {
  GLOBAL_NAV_STATUS_EVENT,
  GLOBAL_NAV_PREEMPT_EVENT,
  islandTaskAction,
  islandTaskCardLeft,
  islandTaskView,
  islandCustomSlot,
} from '@/composables/useIsland.js';
import { logoutAndReload } from '@/utils/logout-and-reload.js';
import {
  admitIslandNotification,
  islandNotifyGapMs,
  noteIslandNotificationShown,
  pushWithIslandQueueCap,
} from '@/utils/island-notify-policy.js';

const authStore = useAuthStore();
const { isLoggedIn, isInitialized, showLoginModal, isAdmin } = storeToRefs(authStore);
// BOH AI 岛已迁移为 App 级 BohIsland（plans/038 P3 入口收敛）—— surface 内不再有 AI 岛宿主，
// showIsland.ai() 由 useIsland 直连新岛，本组件只保留任务岛/通知岛/自定义岛的仲裁。
const notificationStoreRef = getNotificationStoreRef();
const { alert, confirm } = useConfirmDialog();
const { checkForUpdate, applyUpdate, isChecking } = useVersionCheck();
const router = useRouter();
// 路由 chunk 预取：桌面导航 hover 预载 + 首屏 idle 预载 /forum（useRoutePrefetch.js）
const prefetchRoute = useRoutePrefetch();
scheduleIdleRoutePrefetch(prefetchRoute);
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(
  () => isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value),
);
const navStatus = ref({
  visible: false,
  title: '',
  message: '',
  icon: 'success',
  isLong: false,
  duration: 620,
  distance: 22,
  blur: 20,
  reducedMotion: false,
});
const navStatusCardHeight = ref(58);
const customCardHeight = ref(0);
const navStatusQueue = [];
let navStatusDismissTimer = null;
// 相邻两条通知之间的间隔定时器（策略见 utils/island-notify-policy.js）
let navStatusGapTimer = null;

// ============================================
// 灵动岛统一仲裁（useIsland 调度中心）
// surface 内优先级：任务岛 > 自定义岛 > 通知岛，同一时刻 surface 只展示一张卡。
//   · 任务岛压制通知岛与自定义岛（通知 visible 置 false、自定义岛 v-show 让位保状态）
//   · 自定义岛压制通知岛（2026-11-04 补：此前只判任务岛 ⇒ 概览加载岛与通知卡同屏重叠 52px，
//     两者 top 都取自 --global-nav-status-top，绝对定位直接叠在一起）
// AI 岛不在这个仲裁里（plans/038 P3：已迁 App 级 BohIsland，Teleport 到 body）。
// ============================================

const isTaskCardShown = computed(() => !!islandTaskView.value);
const isCustomCardShown = computed(() => !!islandCustomSlot.component);

// 任务岛 / 自定义岛占用期间通知卡暂停展示（转为隐藏并保持队列，收起后自动恢复）
const statusCardItem = computed(() => {
  if (isTaskCardShown.value || isCustomCardShown.value) {
    return { ...navStatus.value, visible: false };
  }
  return navStatus.value;
});

const clearNavStatusDismissTimer = () => {
  // ⚠️ 两个定时器必须一起清：只清 dismiss 而漏掉 gap，会让「已经排到队首的那条」
  // 在 preempt / 搜索面板打开之后仍然冒出来，盖住刚打开的面板。
  if (navStatusDismissTimer) {
    clearTimeout(navStatusDismissTimer);
    navStatusDismissTimer = null;
  }
  if (navStatusGapTimer) {
    clearTimeout(navStatusGapTimer);
    navStatusGapTimer = null;
  }
};

const normalizeNavStatus = (payload = {}) => {
  const title = String(payload.title || '').trim() || '已完成';
  const message = String(payload.message || '').trim();
  const icon = String(payload.icon || payload.type || 'success').trim();
  const durationMs = Math.min(Math.max(Number(payload.durationMs) || 4200, 1800), 10000);
  return {
    visible: true,
    kind: payload.kind || '',
    title,
    message,
    icon,
    isLong: Boolean(payload.isLong) || `${title}${message}`.length > 24,
    duration: Math.min(Math.max(Number(payload.motionDuration) || 620, 240), 1200),
    distance: Math.min(Math.max(Number(payload.distance) || 22, 0), 48),
    blur: Math.min(Math.max(Number(payload.blur) || 20, 0), 28),
    reducedMotion: Boolean(payload.reducedMotion),
    durationMs,
    onAction: typeof payload.onAction === 'function' ? payload.onAction : null,
    query: payload.query || '',
    filter: payload.filter || 'all',
    options: payload.options || [],
    // 2026-10-20：结构化分组（废掉按下标切片的旧契约）。
    // ⚠️ 这里是**白名单式重建** —— 新字段不写进本函数就等于没传下去
    // （本次报障「点了筛选一片空白」的直接成因：Newsroom 传了 groups，
    //  但 normalizeNavStatus 只放行 options，卡片拿到的 groups 永远是 undefined）。
    groups: Array.isArray(payload.groups) ? payload.groups : [],
    searchPlaceholder: payload.searchPlaceholder || '',
    searchLabel: payload.searchLabel || '',
    filterLabel: payload.filterLabel || '',
    onSearch: payload.onSearch,
    onFilter: payload.onFilter,
    persistent: Boolean(payload.persistent),
  };
};

/**
 * 为「当前这条」通知安排自动收起。
 *
 * ⚠️ 抽成独立函数（2026-11-04）而不是内联在 presentNavStatus 里，是为了让「压制解除后
 * 恢复展示」这条路径能重新排一次计时 —— 见下方 statusCardItem.visible 的 watch。
 * 原实现里恢复后无人负责收卡：压制会让卡片走完整离场动画，而 after-leave 会
 * clearNavStatusDismissTimer（handleNavStatusAfterLeave），把本条的计时一并清掉 ⇒
 * 任务岛收起后通知淡回来再也不会自动走（实测 10s 仍在屏）。
 */
const scheduleStatusDismiss = (item) => {
  clearNavStatusDismissTimer();
  if (item.persistent) return;
  navStatusDismissTimer = setTimeout(() => {
    navStatusDismissTimer = null;
    // 队列非空时无缝接管（不先置 visible=false）：若先摘 has-status-card，
    // leave 动画期间展开态缺席 → mini 形态会启动回缩又被下一条拉回，出现半收闪断（plans/009 §3-1）
    const next = navStatusQueue.shift();
    if (next) {
      // 间隔闸门：不清卡、只延后换字 —— 既保住上面的「无缝」，又给用户读完上一条的时间。
      // 若改成「先退场留白再播」，就会把 plans/009 §3-1 修掉的半收闪断重新引回来。
      const gap = islandNotifyGapMs();
      if (gap > 0) {
        navStatusGapTimer = setTimeout(() => {
          navStatusGapTimer = null;
          presentNavStatus(next);
        }, gap);
        return;
      }
      presentNavStatus(next);
      return;
    }
    navStatus.value = { ...navStatus.value, visible: false };
  }, item.durationMs);
};

const presentNavStatus = (item) => {
  navStatusCardHeight.value = 58;
  navStatus.value = item;
  noteIslandNotificationShown(item);
  scheduleStatusDismiss(item);
};

const flushNavStatusQueue = () => {
  // 三个占位者任一在场都不该弹：通知会被 statusCardItem 立刻压回去（等于白闪一下再消失）
  if (navStatus.value.visible || isTaskCardShown.value || isCustomCardShown.value) return;
  const next = navStatusQueue.shift();
  if (!next) return;
  const gap = islandNotifyGapMs();
  if (gap > 0) {
    navStatusGapTimer = setTimeout(() => {
      navStatusGapTimer = null;
      presentNavStatus(next);
    }, gap);
    return;
  }
  presentNavStatus(next);
};

const handleGlobalNavStatus = (event) => {
  const item = normalizeNavStatus(event?.detail || {});
  const busy = navStatus.value.visible || isTaskCardShown.value || isCustomCardShown.value;
  const verdict = admitIslandNotification(item, { busy, queueLength: navStatusQueue.length });
  if (!verdict.admit) return;
  if (busy) {
    pushWithIslandQueueCap(navStatusQueue, item);
    return;
  }
  presentNavStatus(item);
};

const handleNavStatusPreview = (event) => {
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  const detail = event?.detail || {};
  navStatus.value = {
    visible: Boolean(detail.visible),
    title: String(detail.title || '已完成'),
    message: String(detail.message || ''),
    icon: String(detail.icon || 'success'),
    isLong: Boolean(detail.isLong),
    duration: Number(detail.duration) || 620,
    distance: Number(detail.distance) || 22,
    blur: Number(detail.blur) || 20,
    reducedMotion: Boolean(detail.reducedMotion),
  };
};

const handleNavStatusAction = () => {
  const { onAction } = navStatus.value;
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  navStatus.value = { ...navStatus.value, visible: false };
  onAction?.();
};

const handleNavStatusAfterLeave = () => {
  clearNavStatusDismissTimer();
  flushNavStatusQueue();
};

// 被更高优先级的面板抢占（当前只有全局搜索）：
// 通知卡与通知队列一起让位，否则面板打开后队列里的下一条会冒出来盖住它。
const handleGlobalNavPreempt = () => {
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  navStatus.value = { ...navStatus.value, visible: false };
};

// 全局搜索：入口按钮（/ 快捷键归 BohIsland）。plans/038（P1）起面板由独立悬浮岛
// BohIsland.vue（Teleport 到 body、App 级挂载）承载，不再渲染进本组件 surface；
// onAction：动作搜索（Spotlight 式「搜到即执行」）的执行权统一归 handleMenuAction ——
// 闭包在调用时才解引用，规避 handleMenuAction 定义在 setup 更靠后位置的 TDZ。
const { isSearchOpen, toggleSearch } = useGlobalSearch({
  onAction: (action) => handleMenuAction(action),
});

// ============================================
// 竖屏唤起博莱克：抓导航胶囊往下拉（plans/038 §3.7；2026-11-04 用户口径）
// 竖屏不再有常驻悬浮气泡 —— 导航本身是唯一定位点，拉它就是「把岛拉出来」。
//   · 起手 12px 内不判定：点击（logo / 菜单 / 头像）与横向滑动都放行；
//   · 竖向位移过 48px 松手才开，避免误触；
//   · 拉的过程中吃掉 touchmove，免得页面跟着滚（iOS 还会橡皮筋/下拉刷新）；
//   · 桌面不接管（有 ⌘K 与 /）；岛已开、登录弹窗、移动菜单展开时也不接管。
// ============================================

const navSurface = ref(null);
const navHamburger = ref(null);
const bohIsland = useBohIsland();

/**
 * 岛展开了 ⇒ 整块 surface 切到 dark（2026-11-05 用户口径「唤起博莱克整个岛自动变成深色」）。
 *
 * 只切 `data-theme` 这一个开关，其余全部复用现成的暗色导航样式
 * （`src/styles/themes/navbar-dark.css` 里 .nav-logo-text / .nav-menu a / .nav-link-wrapper
 *  等一整套白字规则）——不在这里再抄一份颜色，否则两处真源必然漂移。
 * surface 自己的深色底由 style.scoped.css 的 `.has-boh-island` 提供。
 *
 * ⚠️ 只在**容器**上切，不动 `<html data-theme>`：站点主题、博莱克全页、其它岛都不受影响。
 */
const surfaceTheme = computed(() => (bohIsland.isOpen.value ? 'dark' : currentTheme.value));

const PULL_OPEN_PX = 48;
const PULL_START_PX = 12;
let pullState = null;

const isPullZone = () => window.matchMedia('(max-width: 1023px)').matches;

const onPullTouchStart = (event) => {
  if (!isPullZone() || event.touches.length !== 1) return;
  if (bohIsland.isOpen.value || isMobileMenuOpen.value || showLoginModal.value) return;
  const touch = event.touches[0];
  pullState = { x: touch.clientX, y: touch.clientY, dy: 0, armed: false };
};

const onPullTouchMove = (event) => {
  if (!pullState || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dy = touch.clientY - pullState.y;
  const dx = touch.clientX - pullState.x;
  if (!pullState.armed) {
    if (dy < PULL_START_PX || Math.abs(dy) <= Math.abs(dx)) return;
    pullState.armed = true;
  }
  if (dy <= 0) {
    pullState.dy = 0;
    return;
  }
  pullState.dy = dy;
  if (event.cancelable) event.preventDefault();
};

const resetPull = () => {
  pullState = null;
};

const onPullTouchEnd = () => {
  if (!pullState) return;
  const shouldOpen = pullState.armed && pullState.dy >= PULL_OPEN_PX;
  pullState = null;
  // 下拉 = 「我想问点什么」：直接进对话面（openChat），不是先落搜索列表
  if (!shouldOpen || !bohIsland.openChat()) return;
  /* 回答面是异步组件：首次打开可能还没挂上，重试几次把光标落进对话输入条。
     ⚠️ 必须和 BohIslandAnswer 的自动聚焦同一个时间基准（340ms = 导航长出来的 300ms
        动画 + 余量）：提前落焦会让 iOS 键盘与岛的高度动画并发，实测叠出 50~80ms 长任务。
        这里只是**兜底**（正常情况本组件已经聚焦过），所以不抢跑。
     preventScroll：避免聚焦把页面滚一段。 */
  const focusInput = (tries = 0) => {
    const input = document.querySelector('.boh-island-root .boh-answer-input');
    if (input) {
      if (document.activeElement !== input) input.focus({ preventScroll: true });
      return;
    }
    if (tries < 6) setTimeout(() => focusInput(tries + 1), 80);
  };
  setTimeout(() => nextTick(() => focusInput()), 340);
};

const handleStatusCardResize = (height) => {
  const nextHeight = Math.ceil(Number(height) || 58);
  if (Math.abs(nextHeight - navStatusCardHeight.value) > 1) {
    navStatusCardHeight.value = nextHeight;
  }
};

// 自定义岛（showIsland.custom）高度：独立变量上报。
// 不可写入 navStatusCardHeight —— 否则岛关闭后常驻状态卡会继承被撑大的高度，导航 surface 无法复原。
const handleCustomCardResize = (height) => {
  const nextHeight = Math.max(0, Math.ceil(Number(height) || 0));
  if (Math.abs(nextHeight - customCardHeight.value) > 1) {
    customCardHeight.value = nextHeight;
  }
};

// ---- 任务岛（GlobalNavTaskCard）事件 ----

const handleIslandTaskAction = (actionId) => {
  islandTaskAction(actionId);
};

const handleIslandTaskAfterLeave = () => {
  islandTaskCardLeft();
  flushNavStatusQueue();
};

// 任务岛收起后恢复队列中的通知
watch(isTaskCardShown, (shown, prev) => {
  if (!shown && prev) flushNavStatusQueue();
});

// 自定义岛收起后同理（2026-11-04：自定义岛也压通知卡了，恢复路径必须成对补上，
// 否则「概览加载岛 → 收起」这一下会把排队的通知永久卡住，等到下次别的事件才弹）
watch(isCustomCardShown, (shown, prev) => {
  if (!shown && prev) flushNavStatusQueue();
});

// 压制解除后「重新计时」。
// 压制不是隐藏而是让卡片走完整离场动画，动画结束触发 after-leave → handleNavStatusAfterLeave
// 会 clearNavStatusDismissTimer ⇒ 本条通知的自动收起计时被清掉；不在这里重排，
// 卡片淡回来之后就永远停在导航栏上（2026-11-04 实测：任务 5s 结束后通知回来 10s 仍不消失）。
// 语义：压制期间不计时（用户没真正看到的那段时长不算），恢复后完整展示一次 durationMs。
watch(
  () => statusCardItem.value.visible,
  (shown, prev) => {
    if (!shown || prev) return;
    if (!navStatus.value.visible || navStatus.value.persistent) return;
    // 正常上屏路径（presentNavStatus）已经排好计时了，别重排成双份
    if (navStatusDismissTimer) return;
    scheduleStatusDismiss(navStatus.value);
  },
);

// ---- 自定义岛（showIsland.custom）高度上报 ----

const islandCustomHost = ref(null);
let customHostResizeObserver = null;

const observeIslandCustomHost = async () => {
  await nextTick();
  customHostResizeObserver?.disconnect();
  customHostResizeObserver = null;
  if (!islandCustomHost.value) return;
  customHostResizeObserver = new ResizeObserver(() => {
    const height = islandCustomHost.value?.getBoundingClientRect().height;
    handleCustomCardResize(height);
  });
  customHostResizeObserver.observe(islandCustomHost.value);
};

watch(
  () => islandCustomSlot.component,
  (component) => {
    if (!component) customCardHeight.value = 0;
    observeIslandCustomHost();
  },
);

// ============================================
// 窗口缩放
// ============================================
// Beta 6 起导航为常驻悬浮岛，滚动收纳（stable .scrolled）机制已随 4.9.1 回退通道一并移除。

let resizeRafId = null;

const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);

// ============================================
// 路由相关配置
// ============================================

const route = useRoute();
const isForumContext = computed(() => {
  const isHomeForum = route.path === '/' && String(route.query.view || '') !== '';
  const userSpaceTab = String(route.query.tab || '');
  const isUserSpaceCommunity =
    route.path === '/user-space' && (userSpaceTab === '' || userSpaceTab === 'community');
  return isHomeForum || isUserSpaceCommunity;
});
const myBlockTarget = computed(() => (isForumContext.value ? route.fullPath : '/user-space'));

const isActive = (path) => {
  // 2026-09-22 首页社区化改版：论坛迁到首页（下滑直达），顶栏「论坛」与「首页」同指 `/`，
  // 靠 view 参数区分当前意图 —— 带 view 视为「为论坛而来」，不带 view 视为首页。
  if (path === '/?view=latest') {
    return route.path === '/' && String(route.query.view || '') !== '';
  }
  if (path === '/') {
    return route.path === '/' && String(route.query.view || '') === '';
  }
  // 确保匹配完整路径或子路径，避免类似 /shop 匹配 /shopping 的情况
  return route.path === path || route.path.startsWith(path + '/');
};

// 处理"我的方块"按钮点击：论坛分区内刷新并滚动到顶部
const handleMyBlockClick = (event) => {
  // mini 形态下头像保留直达，不冒泡到 surface 的展开热区（plans/009）
  event.stopPropagation();
  if (isForumContext.value) {
    // 阻止路由跳转，触发刷新和滚动到顶部
    event.preventDefault();
    // 发送自定义事件，通知论坛组件刷新
    window.dispatchEvent(new CustomEvent('boh_forum_refresh_request'));
    // 滚动到顶部：首页是文档流滚动（论坛不再是嵌套滚动容器）
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// 使用 store 中的状态
const username = computed(() => authStore.userInfo.username);
const avatarUrl = computed(() => authStore.userInfo.avatarUrl || '');
const navFrame = computed(() => resolveFrameForAuthor('', authStore.userInfo?.id));

// ============================================
// 导航菜单配置
// ============================================

/**
 * 导航菜单配置
 * 支持二级/三级菜单嵌套结构：
 * - children 为二级项（直接链接）
 * - children[].children 为三级分组（分组标题 + 入口链接）
 */
// 顶栏菜单单源见 @/config/site-nav.ts —— 导航渲染与全局搜索索引共用同一份（2026-09-27 抽出）
const navMenuItems = SITE_NAV_ITEMS;

/**
 * 当前展开的一级菜单名称
 * 用于控制二级菜单的显示/隐藏
 */
const expandedMenu = ref(null);

/**
 * 当前下钻的三级分组名称（用于三级菜单）
 */
const activeGroup = ref(null);
/**
 * 当前下钻分组所属的一级菜单名称
 */
const activeGroupParent = ref(null);

/* ============================================
   宽岛：surface 需要按「菜单实际高度」长高

   `.nav-submenu` 挂在 `<li>` 里（DOM 不变），它不是 surface 的文档流子节点 ⇒
   撑不开 surface；而 `height: auto` 又无法参与过渡。所以实测后写进 `--nav-submenu-h`，
   surface 用 `calc(rest + var(--nav-submenu-h))` 长高。

   ⚠️ 2026-11-15 **打开前预量**（这是「展开不流畅」的主因之一）：
   旧写法只在 `await nextTick()` 之后量 —— 于是打开那一帧 `.has-submenu` 已经生效、
   而 `--nav-submenu-h` 还是收起时的 0 ⇒ 首帧 height = rest（50），下一帧才跳到目标值。
   肉眼读作「先卡一帧、再弹开」。菜单是常驻渲染的（收起态只是 `visibility: hidden`，
   不影响布局），所以可以在**类挂上之前**同步量到真实高度，让 height 从第一帧就是终值。

   ⚠️ ResizeObserver 仍然要留：三级下钻（分组 ↔ 子项）换 pane 时内容高度会变，
   预量拿不到那个值（DOM 还没换）。
   ============================================ */
const submenuH = ref(0);
let submenuResizeObserver = null;

/** name → <ul.nav-submenu> 元素（收起态也注册：预量全靠它） */
const submenuEls = new Map();
const setSubmenuEl = (name, el) => {
  if (el) submenuEls.set(name, el);
  else submenuEls.delete(name);
};

const measureSubmenu = () => {
  const el = document.querySelector('#unified-nav-container .nav-submenu.active');
  if (!el) {
    submenuH.value = 0;
    return null;
  }
  submenuH.value = Math.ceil(el.getBoundingClientRect().height);
  return el;
};

const stopSubmenuObserver = () => {
  submenuResizeObserver?.disconnect();
  submenuResizeObserver = null;
};

const syncSubmenuHeight = () => {
  const el = measureSubmenu();
  if (!el) {
    stopSubmenuObserver();
    return;
  }
  if (!submenuResizeObserver) {
    submenuResizeObserver = new ResizeObserver(() => measureSubmenu());
  }
  submenuResizeObserver.disconnect();
  submenuResizeObserver.observe(el);
};

/* flush: 'pre' —— 回调跑在组件更新**之前**，此刻 `.has-submenu` 还没挂到 surface 上，
   但目标 `<ul>` 早就在 DOM 里（v-for 恒渲染）。量出来的高度和下一帧 surface 要长的
   高度是同一个数 ⇒ height 一次性过渡，没有「先 50 再跳」的中间帧。 */
watch(
  expandedMenu,
  (open) => {
    if (!open) {
      submenuH.value = 0;
      return;
    }
    const el = submenuEls.get(open);
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    if (h > 0) submenuH.value = h;
  },
  { flush: 'pre' },
);

watch([expandedMenu, activeGroup], async () => {
  await nextTick();
  syncSubmenuHeight();
});

/**
 * 判断菜单项的子菜单中是否存在分组（三级结构）
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const hasGroupChildren = (item) => {
  return (
    item.children && item.children.some((child) => child.children && child.children.length > 0)
  );
};

/**
 * 获取当前下钻分组的三级菜单项
 * @param {Object} item - 菜单项
 * @returns {Array}
 */
const activeGroupChildren = (item) => {
  const group = item.children.find((child) => child.name === activeGroup.value);
  return group ? group.children : [];
};

/**
 * 切换二级菜单展开状态
 * @param {string} menuName - 一级菜单名称
 */
const toggleSubMenu = (menuName) => {
  /* 下拉菜单与 BOH 岛共用 surface 同一块「向下长出来」的区域，不能同时展开。
     一次点击只做一件事（与竖屏汉堡同一条口径）：岛开着时，这一下先收岛，
     再点才是打开菜单；否则菜单与岛卡会叠在同一高度上（2026-11-20 截图报障）。 */
  if (bohIsland.isOpen.value) {
    bohIsland.close();
    return;
  }
  if (expandedMenu.value === menuName) {
    expandedMenu.value = null;
  } else {
    expandedMenu.value = menuName;
  }
  // 切换一级菜单时重置三级下钻状态
  activeGroup.value = null;
  activeGroupParent.value = null;
};

/**
 * 关闭二级菜单，返回一级菜单
 */
const closeSubMenu = () => {
  expandedMenu.value = null;
  activeGroup.value = null;
  activeGroupParent.value = null;
};

/**
 * 判断菜单项是否有子菜单
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const hasChildren = (item) => {
  return item.children && item.children.length > 0;
};

/**
 * 处理菜单项操作
 * @param {string} action - 操作类型
 */
const handleMenuAction = async (action) => {
  if (action === 'createDesktop') {
    createDesktopShortcut();
  } else if (action === 'goToAdmin') {
    // 权限检查：未登录或非管理员时拦截
    if (!isLoggedIn.value) {
      await alert({
        title: '权限不足',
        message: '请先登录后再访问管理面板。',
        tone: 'warning',
      });
      showLoginModal.value = true;
      return;
    }
    if (!isAdmin.value) {
      await alert({
        title: '权限不足',
        message: '您没有管理员权限，无法访问管理面板。',
        tone: 'warning',
      });
      return;
    }
    // 有权限，跳转到管理面板
    router.push('/admin/data-management');
  } else if (action === 'checkVersion') {
    // 版本检测
    if (isChecking.value) {
      await alert({
        title: '检测中',
        message: '版本检测正在进行中，请稍候...',
        tone: 'default',
      });
      return;
    }
    const result = await checkForUpdate();
    if (result.hasUpdate) {
      // 发现新版本，询问用户是否立即更新
      const shouldUpdate = await confirm({
        title: '发现新版本',
        message: result.message + '\n是否立即更新到最新版本？',
        confirmText: '立即更新',
        cancelText: '稍后更新',
        tone: 'success',
      });
      if (shouldUpdate) {
        await applyUpdate(result.remoteBuildId);
        // 更新后会自动刷新页面
      }
    } else {
      // 已是最新版本，询问用户是否强制刷新
      await alert({
        title: '版本检测',
        message: result.message,
        tone: 'success',
      });
    }
  } else if (action === 'toggleTheme') {
    // 搜索动作：切换深色/亮色主题（与主题面板同一套 themeManager 单源）
    themeManager.toggle();
  } else if (action === 'logout') {
    // 搜索动作：退出登录。⚠️ 破坏性动作必须确认，防止键盘回车误触
    const ok = await confirm({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmText: '退出',
      cancelText: '取消',
      tone: 'warning',
    });
    if (ok) await logoutAndReload(authStore);
  }
};

/**
 * 创建桌面快捷方式
 * 使用 PWA beforeinstallprompt 事件请求将网页添加到桌面
 */
const createDesktopShortcut = async () => {
  // 检查是否支持 beforeinstallprompt 事件
  if (window.deferredPrompt) {
    // 显示安装提示
    window.deferredPrompt.prompt();
    // 等待用户响应
    const { outcome } = await window.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('用户接受了添加到桌面的请求');
    } else {
      console.log('用户拒绝了添加到桌面的请求');
    }
    // 清除保存的事件
    window.deferredPrompt = null;
  } else {
    // 如果不支持或已经安装，显示提示信息
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    ) {
      alert('您已经在使用BOH桌面版应用了！');
    } else {
      // 尝试直接调用浏览器的添加到主屏幕功能
      // 对于 iOS Safari
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        alert('请按分享按钮，然后选择"添加到主屏幕"');
      }
      // 对于 Android Chrome
      else if (/Android/.test(navigator.userAgent)) {
        alert('请点击菜单按钮（⋮），然后选择"添加到主屏幕"或"安装应用"');
      }
      // 对于桌面 Chrome/Edge
      else if (window.chrome || navigator.userAgent.includes('Edg')) {
        // 尝试触发安装
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          alert('请点击地址栏右侧的"安装"图标，或在菜单中选择"安装方块之家"');
        } else {
          alert('请在浏览器菜单中选择"安装方块之家"或"添加到主屏幕"');
        }
      }
      // 其他浏览器
      else {
        alert(
          '您的浏览器不支持直接创建桌面快捷方式。请使用浏览器的"添加到主屏幕"或"安装应用"功能。',
        );
      }
    }
  }
};

/**
 * 判断一级菜单是否激活（自身或子菜单匹配当前路由，支持三级嵌套）
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const isMenuActive = (item) => {
  if (item.path) {
    return isActive(item.path);
  }
  if (item.children) {
    return item.children.some((child) => isMenuActive(child));
  }
  return false;
};

/**
 * 计算带有激活状态的导航项
 * 使用 computed 确保响应式更新
 */
const navItems = computed(() => {
  return navMenuItems.map((item) => ({
    ...item,
    children: item.children
      ? item.children
          .map((child) =>
            child.children
              ? {
                  ...child,
                  children: child.children.filter((g) => (g.adminOnly ? isAdmin.value : true)),
                }
              : child,
          )
          .filter((child) => (child.adminOnly ? isAdmin.value : true))
      : undefined,
    isActive: isMenuActive(item),
    isExpanded: expandedMenu.value === item.name,
  }));
});

// ============================================
// 移动端菜单控制
// ============================================

/**
 * 移动端菜单开关状态
 */
const isMobileMenuOpen = ref(false);
const mobileMenuOpenCount = ref(0);

/* ============================================
   移动端菜单岛化：surface 按菜单实际高度长高

   此前菜单是 `position: fixed` 的独立卡片（自己的白底 + 18px 圆角 + 投影），
   与桌面下拉「岛自己长高」是两套视觉语言（用户口径「竖屏没有做好同样岛化的适配」）。
   现在与桌面同一套机制：菜单坐在 surface 长出来的那块玻璃里，
   高度实测后写进 `--nav-mobile-h`，surface 走 `calc(rest + var(--h))`。

   量测窗口：菜单在 CSS 里**常驻渲染**（收起态只是 `visibility: hidden`，不占布局），
   所以打开前就能量到真实高度 —— 和桌面预量同一个理由：避免首帧 height=0
   那一帧"卡一下再弹开"。
   一级 ↔ 二级下钻切换时高度会变，ResizeObserver 兜底。
   ============================================ */
const mobileMenuH = ref(0);
let mobileMenuResizeObserver = null;

const measureMobileMenu = () => {
  const el = document.querySelector('#unified-nav-container .nav-menu-mobile');
  if (!el) return 0;
  const h = Math.ceil(el.getBoundingClientRect().height);
  mobileMenuH.value = h;
  return h;
};

const syncMobileMenuObserver = () => {
  const el = document.querySelector('#unified-nav-container .nav-menu-mobile');
  if (!el) return;
  if (!mobileMenuResizeObserver) {
    mobileMenuResizeObserver = new ResizeObserver(() => {
      if (isMobileMenuOpen.value) measureMobileMenu();
    });
  }
  mobileMenuResizeObserver.disconnect();
  mobileMenuResizeObserver.observe(el);
};

/**
 * 开菜单后把页面滚动位置钉回原处。
 *
 * 真机（iOS Safari）上，`position: fixed` 的菜单展开 / body overflow 变更会让
 * 浏览器把文档滚回顶部 —— 用户报障原话「竖屏点开导航栏的时候会导致页面直接回到最前面」。
 * 菜单改成岛内 absolute 之后这个诱因已经没了（本地实测 700 → 700 不复现），
 * 这段留作兜底：打开后的下一帧检查一次，偏离就恢复，避免又一次"回到最前面"。
 */
const pinScrollAfterMenuToggle = () => {
  const y = window.scrollY;
  requestAnimationFrame(() => {
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  });
};

/**
 * 切换移动端菜单
 * 同时控制body滚动，防止菜单打开时页面滚动/**
 * 切换移动端菜单显示状态
 */
const toggleMobileMenu = () => {
  /**
   * 岛展开时，汉堡 = 「先退出岛」，这一下不开菜单。
   *
   * 岛的面板（surface 向下撑高的那块）与移动菜单落在**同一块区域**，同时展开就是叠影：
   * 菜单半透明地压在自己的岛上，导航行还留着一排按钮（2026-11-05 实拍「非常灾难」）。
   * 一次点击只做一件事：第一下收岛、第二下才开菜单 —— 用户不会遇到中间态。
   */
  if (!isMobileMenuOpen.value && bohIsland.isOpen.value) {
    bohIsland.close();
    return;
  }

  // 桌面 mini 的汉堡 = 「展开导航」，不是「打开移动菜单卡」。
  // 移动菜单的定位/尺寸整段写在 `@media (orientation: portrait) and (max-width: 699px)` 里
  // （scoped 439–788），桌面直接开它会拿到一个没定位的裸卡。所以这里改成钉住长条。
  if (desktopMiniQuery.matches && !route.meta?.immersiveNav && !isMobileMenuOpen.value) {
    toggleMiniPin();
    return;
  }

  const willOpen = !isMobileMenuOpen.value;
  // ⚠️ 必须在翻状态**之前**量：菜单常驻渲染，此刻已能拿到真实高度
  if (willOpen) measureMobileMenu();

  isMobileMenuOpen.value = willOpen;
  if (willOpen) {
    mobileMenuOpenCount.value += 1;
    syncMobileMenuObserver();
    pinScrollAfterMenuToggle();
  } else {
    mobileMenuH.value = 0;
  }

  // Beta 6：常驻悬浮导航下移动端菜单始终允许页面滚动。
  document.body.style.overflow = '';
};

/**
 * 关闭移动端菜单
 * 同时重置展开的二级菜单
 */
const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
  expandedMenu.value = null;
  activeGroup.value = null;
  activeGroupParent.value = null;
  mobileMenuH.value = 0;
  document.body.style.overflow = '';
};

// 页面跳转后自动收起：菜单内链接各自 closeMobileMenu，但 logo / 头像这两个
// 「直达」入口（stopPropagation 不触发展开）以及外部的程序化跳转、前进后退
// 都不经过菜单回调 → 跳转后菜单滞留在展开态。统一按路由变化兜底。
// 收起菜单即回到 mini（isExpandedLooking 是纯派生），无需额外处理形态。
watch(
  () => route.fullPath,
  () => {
    if (isMobileMenuOpen.value) closeMobileMenu();
  },
);

// ============================================
// 竖屏 Mini 形态（plans/009-portrait-nav-mini-bar.md）
// 展开态是纯派生：非竖屏 / 菜单开 / 任意岛在 → 长条，其余为 mini。
// 岛仲裁复用 statusCardItem / isTaskCardShown / islandCustomSlot（AI 岛已迁 BohIsland，不在 surface），
// 岛组件零改动。
// ============================================

// 边界 699：700–768 已是完整导航形态（iPad mini 744 起），不再走竖屏 mini 条。
// 改这里必须同步 unified-nav.css 的 max-width: 699px 三处与下方 innerWidth 判据。
const portraitMiniQuery = window.matchMedia('(orientation: portrait) and (max-width: 699px)');

/**
 * 桌面档 mini 的资格判定 —— **唯一真源**（CSS 侧刻意不重复判，只按 JS 给的类生效）。
 *
 * 三个条件缺一不可：
 *   · 宽度：`min-width: 1024px`，**或者**「横屏且 ≥700」（2026-11-15 补）；
 *   · `hover: hover`：没有真 hover 的设备（触屏笔记本、iPad 带鼠标）收起来就等于
 *     把 5 个入口藏死 —— 那一档继续走常驻长条，宁可重一点；
 *   · `pointer: fine`：粗指针（手指）点 200px 胶囊的边角很容易误触。
 *
 * ⚠️ 为什么会多出「横屏 ≥700」这一条（用户报障「横屏的 hover 自动展开又没了」）：
 * 原来只有 `min-width: 1024px`，于是 700–1023 的横屏（笔记本半屏窗口、内置预览面板、
 * 平板横屏）落进「常驻长条」档 —— 那一档 `handleNavPointerEnter` 里
 * `if (!desktopMiniActive) return` 直接早退，**hover 完全没有反应**。
 * 用户看到的是「胶囊没了、hover 也不展开了」。
 *
 * 为什么用 `orientation: landscape` 而不是直接把 1024 降到 700：
 * 竖屏 700–1023 是**平板档**（iPad mini 744 起就是完整导航，见 unified-nav.css 的
 * 边界注释与 iPad 适配调查）。降阈值会把它一起收成胶囊，破坏那条契约。
 * 横屏 + 精细指针 = 桌面式使用姿势，收胶囊才成立；触屏横屏（pointer: coarse）仍走长条。
 *
 * CSS 侧对应尺寸写在 style.scoped.css 的
 * `@media (orientation: landscape) and (min-width: 700px) and (max-width: 1023px)`。
 */
const DESKTOP_MINI_QUERY =
  '((min-width: 1024px) or ((orientation: landscape) and (min-width: 700px))) and (hover: hover) and (pointer: fine)';
const desktopMiniQuery = window.matchMedia(DESKTOP_MINI_QUERY);

const navMini = ref(portraitMiniQuery.matches || desktopMiniQuery.matches);
const syncNavMini = () => {
  navMini.value = portraitMiniQuery.matches || desktopMiniQuery.matches;
};
const handlePortraitMiniChange = () => syncNavMini();

// ============================================
// 沉浸阅读形态（route.meta.immersiveNav）：导航收成左上角迷你球。
// 点击球展开完整胶囊；点外部 / 跳转离开沉浸页自动收回。
// 展开态与岛仲裁兼容：任意岛唤起时仍按岛形态展示。
// ============================================
const immersiveNav = computed(() => route.meta.immersiveNav === true);
const immersiveExpanded = ref(false);

/**
 * 注册页（/join）+ 横屏 = 「导航长成岛」形态（用户口径「横屏用岛注册」）。
 *
 * 为什么需要这个判据：横屏 844×390 实测，导航是 180 宽的 mini 胶囊，
 * 而注册卡如果按岛做就是 720 宽 —— 中间悬空、左右各差 270px，两个岛根本不接。
 * 这与 2026-11-16 登录浮层踩的是**同一个坑**（见 isExpandedLooking 的注释）。
 *
 * 判据用 JS 的 matchMedia 而不是 CSS：形态能不能成立取决于「横屏 + 够宽」，
 * 而 mini 的资格判定本来就在 JS 里（DESKTOP_MINI_QUERY，唯一真源）——
 * 在 CSS 里再写一份 media query 就是第二份判定。
 *
 * 判据只有「横屏 + 够宽」，**不按高度分档**（用户口径 2026-11-26：
 * 「横屏的可以直接在岛上注册」）。桌面横屏（1280×900 / 1440×960 / iPad 1024×768）
 * 与手机横屏（844×390）落在同一张岛上：导航先收成 `--boh-login-island-width` 的浮岛，
 * 注册卡从它底边展开。
 * ⚠️ 以前这里带 `max-height: 620px`，理由是「别让桌面被套上手机横屏外形」——
 * 那条现在被用户口径推翻。高度只在 `views/Join/index.vue` 里用于**压缩排版**
 * （≤620 / ≤430 两档），**不再决定形态成立与否**：形态与排版分开，才不会出现
 * 「导航收成岛、卡片还是桌面形态」的一半一半断裂。
 */
const joinLandscapeQuery = window.matchMedia('(orientation: landscape) and (min-width: 769px)');
/* matchMedia().matches 不是响应式的 —— 手机旋转后 computed 不会重算，
   结果是「横屏转竖屏了，导航还挂在岛形态上」。用 ref 跟一次 change 事件。 */
const joinLandscapeMatches = ref(joinLandscapeQuery.matches);
joinLandscapeQuery.addEventListener('change', (e) => {
  joinLandscapeMatches.value = e.matches;
});
const isJoinLandscape = computed(() => route.name === 'Join' && joinLandscapeMatches.value);

watch(immersiveNav, (immersive) => {
  immersiveExpanded.value = false;
  if (!immersive) {
    // 离开沉浸页：清掉 FLIP 动画的 fill 锁定，恢复导航常规形态
    document
      .querySelectorAll(
        '#unified-nav-container .unified-nav-surface, #unified-nav-container.unified-nav',
      )
      .forEach((el) => el.getAnimations?.().forEach((a) => a.cancel()));
  }
});

// ============================================
// 桌面 mini：hover / 点击 / 聚焦展开（2026-11-14）
// ============================================
// 三个时间常数是**体感参数**，不是随手取的：
//   · OPEN_DELAY 70ms —— 设 0 会让「鼠标借道经过顶部」也弹开（用户根本没想看导航）；
//     160ms 起明显迟钝。
//   · CLOSE_DELAY 280ms —— 防抖生死线。低于 ~200ms 时，鼠标贴着胶囊边缘微微一动就是
//     「收起→再展开」的反复呼吸（原型实测：收起延时设 0，三次经过顶部就抖 1 次以上）。
//   · 宽度过渡 300ms 写在 CSS —— 用户看到开始展开时已经在移向目标项了，动画过长等于
//     「目标一直在动、点不中」。旧值 500ms 在竖屏无害（mini→菜单卡，点的东西不动），
//     在 hover 场景是硬伤。
const MINI_HOVER_OPEN_DELAY = 70;
const MINI_HOVER_CLOSE_DELAY = 280;
const miniHoverExpanded = ref(false);
const miniPinned = ref(false);
const miniPointerInside = ref(false);
let miniHoverTimer = null;

/** 桌面 mini 是否真的生效：沉浸形态（route.meta.immersiveNav）有自己的球态，两套不能同开 */
const desktopMiniActive = computed(() => desktopMiniQuery.matches && !immersiveNav.value);

const clearMiniHoverTimer = () => {
  if (miniHoverTimer) {
    clearTimeout(miniHoverTimer);
    miniHoverTimer = null;
  }
};

const scheduleMiniExpand = () => {
  if (!desktopMiniActive.value || isExpandedLooking.value) return;
  clearMiniHoverTimer();
  miniHoverTimer = setTimeout(() => {
    miniHoverTimer = null;
    miniHoverExpanded.value = true;
  }, MINI_HOVER_OPEN_DELAY);
};

const scheduleMiniCollapse = () => {
  if (!desktopMiniActive.value) return;
  // 菜单展开 / 已钉住 / 移动菜单开着 —— 一律不收。
  // 少这一条就会出现「点开二级菜单，鼠标往内容区一看，菜单连同导航一起消失」。
  if (expandedMenu.value || miniPinned.value || isMobileMenuOpen.value) return;
  clearMiniHoverTimer();
  miniHoverTimer = setTimeout(() => {
    miniHoverTimer = null;
    // 定时器到点时指针又回来了（贴着边缘来回）：不动，交给 scheduleMiniExpand 兜
    if (!miniPointerInside.value) miniHoverExpanded.value = false;
  }, MINI_HOVER_CLOSE_DELAY);
};

/**
 * ⚠️ 2026-11-15 修：汉堡上**不再**屏蔽 hover 展开。
 *
 * 旧写法（`isOverMiniBurger` 早退）是为了保住「点击汉堡展开」这条手势 —— hover 展开会把
 * 汉堡藏掉，mouseup 落空。但实测代价更大：mini 态只有 logo / 登录 / 汉堡三个元素，
 * 用户想展开时**必然指向汉堡**（它是唯一像把手的东西），于是「hover 什么都没发生」
 * 成了最普遍的体验（用户报障原话就是这个）。
 *
 * 现在两条都留：
 *   · hover 进胶囊任何位置（含汉堡）→ 70ms 后展开；
 *   · 汉堡点击改用 pointerdown 处理（见 handleBurgerPointerDown）—— pointerdown 在
 *     汉堡还可见时就触发，不依赖 mouseup 那一刻元素还在原位；
 *   · 展开态**保留汉堡**（CSS 里 `:not(.nav-expanded)` 已去掉），它从「展开」变成
 *     「钉住 / 收起」把手，鼠标下方不会突然变成空白或别的按钮。
 */
/**
 * 指针是否**真的**落在胶囊的盒子里。
 *
 * `pointerenter` / `pointermove` 只要指针进入**任意后代**就会在 surface 上触发，
 * 而后代可以待在盒子外面 —— 于是「可见形状」与「热区」就不是一回事了。
 * 实测（2026-11-15，用户报障「hover 区域不对，不够精确，我鼠标放在远处他也起来了」）：
 * 折叠态 `.nav-menu-mobile` 是 `visibility: hidden`，但 vendor 给里面的
 * `.nav-mobile-main-menu` 写了 `visibility: visible` —— 子元素可见性可以**压过**祖先，
 * 于是一块 178×312 的**完全看不见的热区**挂在胶囊下方（胶囊只有 44 高），
 * 指针离胶囊 200px、只要横向还在胶囊那 180px 里，就能把导航拉出来。
 *
 * CSS 侧已经给 `.nav-menu-mobile` 补了 `pointer-events: none`（那才是根因修法）；
 * 这里再加一道几何判据，任何「子元素故意溢出到盒外」的写法都不会再污染 hover 热区。
 */
const isPointerOnSurface = (event) => {
  const box = navSurface.value?.getBoundingClientRect();
  if (!box || !event) return true; // 拿不到盒子时不拦截，宁可放行也不要让导航点不开
  return (
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom
  );
};

/**
 * 指针是不是落在导航胶囊里的**直接动作目标**上（2026-11-16，2026-11-20 泛化）。
 *
 * 登录按钮是最早暴露这个问题的位置：mini 态胶囊 180 宽，展开成 720 时 `.nav-container`
 * 的 padding 从 12 变 32、菜单插进来，按钮会横向平移约 500px。用户瞄着「登录」两个字
 * 移过去、70ms 后岛撑开，按钮从指针底下跑掉 ⇒ 点击落在空白处或别的元素上。
 *
 * 但这不是登录独有的：同一几何下 logo 会向左移、头像会向右移（按 180→720 算约 270px）。
 * 所以这里收成一组「直接动作目标」—— 指针压在这些元素上时**优先保证点击命中**，
 * 不排 hover 展开；汉堡不在名单里，它是唯一的展开把手，hover 它仍要展开
 * （见 handleNavPointerEnter 上方注释）。
 *
 * 只读 `event.target`（`closest` 不触发布局）—— pointermove 每秒可触发 100+ 次，
 * 不要为了这个判据再加 gBCR。指针从胶囊空白移向目标时，pointermove 会把已排的
 * 展开定时器撤掉，足以覆盖「先进胶囊、再滑到按钮上」的路径。
 */
const DIRECT_ACTION_SELECTOR = '.nav-logo, .nav-user-profile, .nav-login-btn';

const isPointerOnDirectAction = (event) =>
  Boolean(event?.target?.closest?.(DIRECT_ACTION_SELECTOR));

const handleNavPointerEnter = (event) => {
  if (!isPointerOnSurface(event)) return;
  miniPointerInside.value = true;
  if (!desktopMiniActive.value) return;
  /* 冲直接动作目标来的：不排展开，并把可能已排上的那次撤掉（指针可以先进胶囊边缘、
     70ms 内再滑到目标上，那时定时器已经在跑）。 */
  if (isPointerOnDirectAction(event)) {
    clearMiniHoverTimer();
    return;
  }
  clearMiniHoverTimer();
  scheduleMiniExpand();
};

const handleNavPointerMove = (event) => {
  /* ⚠️ 顺序有性能含义，别把几何判据调到前面（2026-11-16 实测）。
   *
   * `isPointerOnSurface` 里是 `getBoundingClientRect()`，它会**强制同步布局**；
   * 而 pointermove 在鼠标划过时每秒能触发 100+ 次。原来的顺序是先量盒子再看门控，
   * 于是「展开态」这个**什么也不做**的分支也在每次移动时白量一次盒子 ——
   * 实测：展开态连发 200 次 pointermove 触发 200 次 gBCR（单次 0.07ms，
   * 一次展开动画里就能白烧 8ms 主线程，而且全程压在 300ms 的 height 过渡上，
   * 每一次都可能打断合成）。调换后同一场景为 0 次。
   *
   * 门控先行之后，几何判据只在「mini 生效且还没展开」的那 ~70ms 窗口里跑，
   * 而那个窗口里盒子是稳定的（宽度还没开始变）。
   */
  if (!desktopMiniActive.value || isExpandedLooking.value) return;
  if (!isPointerOnSurface(event)) return;
  // 在直接动作目标上：撤掉待展开，且不要重排（否则目标会在点击前跑掉）
  if (isPointerOnDirectAction(event)) {
    clearMiniHoverTimer();
    return;
  }
  // 指针在胶囊内持续移动时不要再排一次 —— scheduleMiniExpand 会先 clearTimeout，
  // 每移动一像素就把 70ms 往后推，结果是「一直在动就永远不展开」。
  if (!miniHoverTimer) scheduleMiniExpand();
};

const handleNavPointerLeave = () => {
  miniPointerInside.value = false;
  scheduleMiniCollapse();
};

/** 点击钉住：hover 展开是「临时看」，钉住是「我要用」。再点一次取消。 */
const toggleMiniPin = () => {
  miniPinned.value = !miniPinned.value;
  if (miniPinned.value) {
    clearMiniHoverTimer();
    miniHoverExpanded.value = true;
    return;
  }
  /* 取消钉住 = 明确要收，**立即收**，不走 280ms 防抖：
     那个防抖是为「鼠标擦边来回」设计的，而此刻指针必然还停在汉堡上
     （`miniPointerInside` 为 true），交给 scheduleMiniCollapse 会被它自己的判据顶回来
     —— 用户点汉堡收不起来（实测）。收起后胶囊缩回 176，汉堡位置从右端退回原位，
     指针自然落到胶囊外，不会再被 pointerenter 拉起。 */
  clearMiniHoverTimer();
  miniHoverExpanded.value = false;
};

/**
 * 汉堡的两条输入通道（2026-11-15）：
 * · 指针（鼠标左键 / 触摸）走 **pointerdown** —— hover 会把它展开成 720 长条，汉堡随之
 *   右移；若等 mouseup，汉堡已在别处，click 不派发到它（实测整个点不中）。
 *   pointerdown 发生在位移之前，这一下必定命中。
 * · 键盘走 click，且只认 `detail === 0`（键盘合成的 click 恒为 0，鼠标点击是点击次数
 *   ≥1）—— 否则一次鼠标点击会被 pointerdown + click 各 toggle 一次，等于没点。
 */
const handleBurgerPointerDown = (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  toggleMobileMenu();
};

const handleBurgerClick = (event) => {
  if (event.detail === 0) toggleMobileMenu();
};

/** 键盘：焦点进到胶囊就把导航展开，否则 Tab 只能在 logo/头像之间打转（菜单是 display: none）
 *
 * ⚠️ 必须过滤「鼠标点出来的 focus」：点击 button 也会触发 focusin，若在这里无条件展开，
 * 汉堡会在 pointerdown 与 mouseup 之间被 `display: none` 掉，浏览器把 click 派发到
 * 共同祖先 `.nav-container` —— 「点击展开」永远点不中（实测日志：pointerdown:SPAN →
 * click:DIV.nav-container）。判据用 `:focus-visible`：键盘 Tab 命中，鼠标点击不命中。 */
const handleNavFocusIn = (event) => {
  if (!desktopMiniActive.value) return;
  const target = event?.target;
  if (target?.matches && !target.matches(':focus-visible')) return;
  clearMiniHoverTimer();
  miniHoverExpanded.value = true;
};

const handleNavFocusOut = (event) => {
  if (!desktopMiniActive.value) return;
  // relatedTarget 是下一个获得焦点的元素；仍在组件内就不收（logo → 菜单项 是连续 Tab）
  const next = event?.relatedTarget;
  if (next && event.currentTarget?.contains?.(next)) return;
  if (expandedMenu.value || miniPinned.value) return;
  scheduleMiniCollapse();
};

// 二级菜单收起后补一次「该不该收回 mini」的判定。
// 没有这一条：菜单开着时鼠标已离开 → pointerleave 按上面那条早退 → 菜单关掉后
// 导航就永远停在展开态（用户看到的是「点一下别处，导航变长了但不回去」）。
watch(expandedMenu, (open, prev) => {
  if (open || !prev) return;
  if (!miniPointerInside.value) scheduleMiniCollapse();
});

/* ⚠️ 2026-11-16：登录浮层必须算「展开态」。
 *
 * 登录浮层在横屏 ≥769 是**两半岛拼成一张岛**：导航做上半岛（720×64、圆角 30 30 0 0、
 * 底边无描边），登录卡做下半岛（同宽、`margin-top: 72px` 与上半岛重叠 2px）。
 * 这条形态只写在 `.unified-nav-surface.has-login-card` 上，而 mini 的收起规则
 * `#id .surface.nav-mini-caps:not(.nav-expanded)`（1,3,0）**权重更高** ——
 * 于是桌面上打开登录后，上半岛仍是 180×44 的小胶囊，下半岛却是 720 宽：
 * 中间悬空、左右各差 270px，两个岛根本不接（用户报障「顶部导航栏对登录的适配不好」）。
 *
 * 与通知岛 / 任务岛 / 自定义岛同一条纪律：凡是「岛要长出来接内容」的状态，
 * 都必须让 mini 让位 —— 这就是 `nav-expanded` 的语义，不要在 CSS 里另开一份
 * `:not(.has-login-card)` 补丁（两处判定必然漂移）。
 */
const isExpandedLooking = computed(() =>
  immersiveNav.value
    ? immersiveExpanded.value ||
      isMobileMenuOpen.value ||
      miniHoverExpanded.value ||
      miniPinned.value ||
      statusCardItem.value.visible ||
      isTaskCardShown.value ||
      !!islandCustomSlot.component
    : !navMini.value ||
      isMobileMenuOpen.value ||
      miniHoverExpanded.value ||
      miniPinned.value ||
      statusCardItem.value.visible ||
      isTaskCardShown.value ||
      !!islandCustomSlot.component ||
      /* 2026-11-16 补的两条（同一次排查出来的「同类问题」）：
         · showLoginModal —— 登录岛=导航上半岛 + 登录卡下半岛，mini 会让上半岛只有 180 宽；
         · bohIsland.isOpen —— BOH 岛 docked 在 surface 里（自己的 width 用 !important 顶住了，
           但 **高度** 是 `#id .surface.has-boh-island`(1,2,0)，输给 mini 的
           `:not(.nav-expanded)`(1,3,0)：实测指针一离开，岛从 128 塌回 44，
           卡片（y=68 / 高 64 / 底 132）整块漏在岛外面。
         两者都属于「岛要长出来接内容」 ⇒ 必须让 mini 让位，不要在 CSS 里补
         `:not(.has-login-card)` 那种第二份判定（两处必然漂移）。 */
      showLoginModal.value ||
      bohIsland.isOpen.value ||
      /* 注册页横屏：与 showLoginModal 同一条理由 —— 导航要做上半岛，
         mini 会让它只有 180 宽，与 720 的注册岛接不上。 */
      isJoinLandscape.value,
);

/* 「球态」写到 body 上供页面侧消费 —— 目前只有 AI 页用：
   `body.page-aichat.nav-orb-mode` 把 `--bolek-standalone-nav-height` 归零，
   于是 `.bolek-page` 不再避让导航高度、整页顶到满屏（用户口径「页面高度提升上去」）。
   ⚠️ 与球的显隐共用 isExpandedLooking 同一处判定，不要再造第二个真源。 */
let orbTransitionTimer = null;
watch(
  [immersiveNav, isExpandedLooking],
  ([immersive, expanded]) => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('nav-orb-mode', Boolean(immersive) && !expanded);
    // 页面高度的过渡只在**形态切换窗口内**挂：常驻 transition 会把软键盘的
    // `--kb-inset` 适配（同样改 .bolek-page 的 height）一起拖慢 460ms。
    document.body.classList.add('nav-orb-transitioning');
    if (orbTransitionTimer) clearTimeout(orbTransitionTimer);
    orbTransitionTimer = setTimeout(() => {
      orbTransitionTimer = null;
      document.body.classList.remove('nav-orb-transitioning');
    }, 480);
  },
  { immediate: true },
);

// ============================================
// 沉浸形态 FLIP 灵动过渡：球 ↔ 展开胶囊位置连续 morph
// （fixed 球与流内胶囊无法用 CSS transition 插值，改用 WAAPI）
//
// 2026-10-16 重写（用户报障「拖动动画不自然」+ 逐帧采样实锤三宗罪）：
//   ① 旧实现收起方向用「假定居中」几何当 fromRect —— AI 页胶囊带 44px translate，
//     实测起点错位 88px，胶囊从错误位置起跳；
//   ② 旧实现终帧写死 `transform: none`，而 AI 页展开态 CSS 常态是 translate(44px,10px)
//     —— 动画结束瞬间横跳 44px（采样 f8 x=290 → f9 x=334），动画尾巴上点导航项会落空；
//   ③ CSS transition（width/height 300ms）与 WAAPI（transform 460ms）双轨混战
//     （实测同帧 8 个动画）：layout 收缩 × transform scale 复合叠加 + borderRadius
//     keyframe 不随方向翻转（收起时 860px 宽的胶囊先顶成 999px 巨圆角再缩）。
// 修法 = 真 FLIP：
//   · flush 'pre' 在 DOM 切换**前**量真实旧几何（fromRect 不再靠 orb 变量/居中公式倒推）；
//   · 动画窗口挂 .nav-flip-lock 冻结 CSS transition（transition/FLIP 不再抢同一批属性）；
//   · 终帧 = 新形态的 CSS 常态 transform（含 AI 页 44px 补偿），起帧反演叠加同一偏移
//     —— 两帧共享 (tx,ty)，插值全程无跳变；
//   · borderRadius 按方向翻转；opacity 只用于展开进场（收起方向带它会在终态跳变）。
// ============================================
const IMMERSIVE_FLIP_MS = 460;
const IMMERSIVE_FLIP_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const FLIP_LOCK_CLASS = 'nav-flip-lock';

// CSS 常态 transform → 平移分量（surface 的 CSS 只会写 none / translateY / translate）。
// computed 值恒为 `none` 或 `matrix(...)`，取 e/f（第 5、6 元）即 tx/ty。
const readCssTranslate = (el) => {
  const value = getComputedStyle(el).transform;
  if (!value || value === 'none') return { tx: 0, ty: 0, css: 'none' };
  const m = value.match(/matrix\(([^)]+)\)/);
  if (!m) return { tx: 0, ty: 0, css: 'none' };
  const parts = m[1].split(',').map(Number);
  if (parts.length < 6 || parts.some((n) => !Number.isFinite(n))) {
    return { tx: 0, ty: 0, css: 'none' };
  }
  return { tx: parts[4], ty: parts[5], css: value };
};

const cancelSurfaceAnimations = (el) => {
  // 同时掐掉 WAAPI FLIP 与 CSS transition（transition 也住在 getAnimations 里），
  // 被掐的元素瞬回 CSS 终态 —— 连续快速切换时 guarantee fromRect 量到的是稳定几何。
  el.getAnimations?.().forEach((a) => a.cancel());
};

watch(
  isExpandedLooking,
  async (expandedAtTrigger) => {
    if (!immersiveNav.value || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

    const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
    const bar = document.querySelector('#unified-nav-container.unified-nav');
    if (!surface) return;

    // ① flush 'pre'：DOM 仍是旧形态 —— 掐掉在途动画后量【真实旧几何】
    cancelSurfaceAnimations(surface);
    const fromRect = surface.getBoundingClientRect();

    // ② 等 DOM 更新到新形态（class 已切、CSS 已生效）
    await nextTick();
    if (isExpandedLooking.value !== expandedAtTrigger) {
      // nextTick 期间形态又被切回（连续快速点击）：本次作废，等下一次 watch 接管
      return;
    }
    const expanding = expandedAtTrigger;
    // ③ 冻结 CSS transition，掐掉 class 切换新起的 transition，再量【新形态几何 + CSS 常态 transform】
    surface.classList.add(FLIP_LOCK_CLASS);
    cancelSurfaceAnimations(surface);
    const toRect = surface.getBoundingClientRect();
    const { tx, ty, css } = readCssTranslate(surface);

    const dx = fromRect.x + fromRect.width / 2 - (toRect.x + toRect.width / 2);
    const dy = fromRect.y + fromRect.height / 2 - (toRect.y + toRect.height / 2);
    const sx = Math.max(fromRect.width / Math.max(toRect.width, 1), 0.02);
    const sy = Math.max(fromRect.height / Math.max(toRect.height, 1), 0.02);

    // 起帧 = 反演（把新形态视觉钉在旧几何位）+ 与终帧共享的 CSS 平移；
    // toRect（getBoundingClientRect）已含 CSS transform ⇒ dx+tx 恰好抵消，两方向通用。
    const firstFrame = {
      transform: `translate(${dx + tx}px, ${dy + ty}px) scale(${sx}, ${sy})`,
    };
    const lastFrame = { transform: css };
    // borderRadius 按方向翻转：球 999px ↔ 胶囊 100px（与两态 CSS 终值一致，结束零跳变）
    if (expanding) {
      firstFrame.borderRadius = '999px';
      firstFrame.opacity = 0.55;
      lastFrame.borderRadius = '100px';
      lastFrame.opacity = 1;
    } else {
      firstFrame.borderRadius = '100px';
      lastFrame.borderRadius = '999px';
    }

    const flip = surface.animate([firstFrame, lastFrame], {
      duration: IMMERSIVE_FLIP_MS,
      easing: IMMERSIVE_FLIP_EASING,
    });
    // 动画结束（或被下一次 cancel）后摘锁，交还 hover 等常规 transition
    flip.finished.then(
      () => surface.classList.remove(FLIP_LOCK_CLASS),
      () => surface.classList.remove(FLIP_LOCK_CLASS),
    );
    // 白条随形态淡入淡出（球态透明 / 展开态白底）
    bar?.animate([{ opacity: expanding ? 0 : 1 }, { opacity: expanding ? 1 : 0 }], {
      duration: 300,
      easing: 'ease',
    });
  },
  { flush: 'pre' },
);

// 任意岛唤起时收起导航菜单（岛与菜单共用 surface 的展开区，必须互斥）
// ⚠️ 必须把 bohIsland 也算进来：它不占 statusCard/isTaskCard/custom 这三个槽位，
//    漏掉的话 ⌘K / 下拉手势 / 外部 showIsland.ai() 唤起时会和已展开的菜单叠在一起。
watch(
  () =>
    statusCardItem.value.visible ||
    isTaskCardShown.value ||
    !!islandCustomSlot.component ||
    bohIsland.isOpen.value,
  (anyIsland) => {
    if (!anyIsland) return;
    if (isMobileMenuOpen.value) closeMobileMenu();
    // 桌面下拉同样要收：`/` 或 ⌘K 唤起岛时不会经过 handleClickOutside。
    if (expandedMenu.value) closeSubMenu();
  },
);

// mini 态点胶囊空白 = 展开（logo/头像/汉堡/登录按钮已 stopPropagation，各自直达）
const handleSurfaceTap = () => {
  // 沉浸态：点球展开完整胶囊；展开后点空白收回球（岛卡展示中不抢行为）
  if (immersiveNav.value) {
    const islandShowing =
      statusCardItem.value.visible || isTaskCardShown.value || !!islandCustomSlot.component;
    if (islandShowing || isMobileMenuOpen.value) return;
    // 竖屏沉浸：点球直接开移动菜单（2026-10-16 用户报障「导航栏无法点击切换跳转」）。
    // 展开胶囊里桌面菜单（.nav-menu）在 ≤768px 是 display:none —— 先展开再点汉堡是
    // 两步死路，且与「非沉浸竖屏点 mini 胶囊开菜单」的既有行为不一致。
    if (navMini.value) {
      toggleMobileMenu();
      return;
    }
    immersiveExpanded.value = !immersiveExpanded.value;
    return;
  }
  if (navMini.value && !isExpandedLooking.value) {
    // 桌面 mini：点胶囊空白 = 钉住展开（竖屏那边是开移动菜单，两条路径不能共用）
    if (desktopMiniQuery.matches && !immersiveNav.value) {
      toggleMiniPin();
      return;
    }
    toggleMobileMenu();
  }
};

// mini 态滚动回缩：capture 覆盖 window 与论坛等内部滚动容器，
// 只认 scrollTop（横向轮播 scrollLeft 变化不触发回缩）
const MINI_COLLAPSE_SCROLL_THRESHOLD = 140;
let miniScrollRafId = null;

const collapseMiniOnScroll = (target) => {
  const scrollTop =
    target === document || target === document.documentElement || target === window
      ? window.scrollY || document.documentElement.scrollTop || 0
      : target && typeof target.scrollTop === 'number'
        ? target.scrollTop
        : 0;
  if (scrollTop > MINI_COLLAPSE_SCROLL_THRESHOLD) {
    closeMobileMenu();
  }
};

const handleMiniCollapseScroll = (event) => {
  // 桌面 mini **不由滚动驱动**：
  // ① 体感上「滚一下导航突然缩回去」很突兀，而 hover 展开已经覆盖了「我要用导航」；
  // ② 滚动收纳那套（.scrolled）已被 tests/unit/unified-nav-scrolled-guard.test.js
  //    在源码层锁死 —— 要引入必须先显式删断言并说明理由，不能换个写法绕回去。
  if (!navMini.value || miniScrollRafId || !portraitMiniQuery.matches) return;
  const target = event.target;
  miniScrollRafId = requestAnimationFrame(() => {
    miniScrollRafId = null;
    collapseMiniOnScroll(target);
  });
};

/**
 * 点击外部关闭下拉菜单和二级菜单
 */
const handleClickOutside = (event) => {
  const target = event.target;
  // 点击目标在事件冒泡期间已被 Vue 重新渲染移除（如点击分组标题后 v-if 切换 DOM）
  // 说明点击发生在菜单内部，不应触发关闭。
  // ⚠️ 还必须守住「target 不是 Element」：`document.dispatchEvent(new MouseEvent('click'))`
  // 的 target 是 Document（没有 closest）—— 探针用它模拟空白点击，实测会抛
  // `target.closest is not a function` 并中断后续清理。
  if (!target || target.isConnected === false || typeof target.closest !== 'function') {
    return;
  }
  if (
    expandedMenu.value &&
    !event.target.closest('.nav-menu-item') &&
    !event.target.closest('.nav-submenu') &&
    !event.target.closest('.nav-mobile-item') &&
    !event.target.closest('.nav-mobile-submenu')
  ) {
    expandedMenu.value = null;
  }
  // 竖屏 Mini 形态（plans/009）：移动菜单点外部关闭 → 派生态自动回缩 mini
  if (
    isMobileMenuOpen.value &&
    !event.target.closest('.unified-nav-surface') &&
    !event.target.closest('.nav-menu-mobile')
  ) {
    closeMobileMenu();
  }
  // 沉浸形态：展开的胶囊点外部收回迷你球
  if (
    immersiveNav.value &&
    immersiveExpanded.value &&
    !event.target.closest('.unified-nav-surface')
  ) {
    immersiveExpanded.value = false;
  }
  // 桌面 mini：点外部 → 取消钉住并收起（否则钉住态没有退出路径 —— 菜单关掉了、
  // 鼠标也早走了，导航却一直挂着）
  if (
    (miniPinned.value || miniHoverExpanded.value) &&
    !event.target.closest('.unified-nav-surface')
  ) {
    miniPinned.value = false;
    miniHoverExpanded.value = false;
    clearMiniHoverTimer();
  }
};

/**
 * Esc：先收二级菜单，再依次退出移动菜单 / 沉浸展开 / mini 钉住态。
 * 键盘用户在展开的二级菜单里没有别的出口 —— 只能靠点页面另一处，
 * 而对纯键盘操作来说「点外部」根本不存在（2026-11-14 实测：Esc 后菜单仍是 active）。
 * 2026-11-20：补上竖屏菜单与沉浸展开两个出口；从移动菜单退出时把焦点还给汉堡，
 * 否则焦点停在已被 visibility:hidden 的菜单节点上，Tab 会从文档起点重新开始。
 */
const handleNavEsc = (event) => {
  if (event.key !== 'Escape') return;
  if (expandedMenu.value) {
    closeSubMenu();
    return;
  }
  if (isMobileMenuOpen.value) {
    closeMobileMenu();
    nextTick(() => navHamburger.value?.focus());
    return;
  }
  if (immersiveExpanded.value) {
    immersiveExpanded.value = false;
    return;
  }
  if (miniPinned.value) {
    miniPinned.value = false;
    scheduleMiniCollapse();
  }
};

// ============================================
// 消息管理
// ============================================

/**
 * 未读消息状态
 */
const hasUnreadMessages = computed(() => unreadCount.value > 0);
let unreadRefreshInterval = null;

/**
 * 检查是否有未读消息
 */
const checkUnreadMessages = async () => {
  if (!isLoggedIn.value) return;
  try {
    const notificationStore = await ensureNotificationStore();
    await notificationStore.refreshUnreadCount();
  } catch (_error) {
    console.error('Error checking unread messages:', _error);
  }
};

// ============================================
// 事件监听和生命周期
// ============================================

/**
 * 处理窗口大小变化
 * 当屏幕宽度大于699px时，关闭移动端菜单
 * 确保在竖屏模式下页面可以正常滚动
 */
const handleResize = () => {
  if (resizeRafId) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    // 当屏幕宽度大于699px时，关闭移动端菜单（边界与 unified-nav.css 的 max-width: 699px 对齐）
    if (window.innerWidth > 699 && isMobileMenuOpen.value) {
      isMobileMenuOpen.value = false;
    }
  });
};

/**
 * 监听localStorage变化和自定义事件
 * 同步多标签页和同标签页的未读计数
 */
const handleStorageChange = (event) => {
  if (event.key === 'boh_unread_refresh' || event.key === null) {
    checkUnreadMessages();
  }
};

const handleUnreadRefresh = () => {
  checkUnreadMessages();
};

const handleThemeChange = (theme, preference = themeManager.getPreference?.() || theme) => {
  currentTheme.value = theme;
  currentThemePreference.value = preference;
};

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  window.addEventListener('boh_global_nav_status_preview', handleNavStatusPreview);
  window.addEventListener(GLOBAL_NAV_STATUS_EVENT, handleGlobalNavStatus);
  window.addEventListener(GLOBAL_NAV_PREEMPT_EVENT, handleGlobalNavPreempt);
  checkUnreadMessages();
  // 兜底轮询：实时订阅/事件异常时，最多 60 秒回补一次
  unreadRefreshInterval = setInterval(checkUnreadMessages, 60000);

  setTimeout(() => {
    if (!isInitialized.value) {
      console.warn('Auth initialization timeout, forcing display.');
      isInitialized.value = true;
    }
  }, 3000);

  // 确保页面加载时滚动正常
  isMobileMenuOpen.value = false;
  document.body.style.overflow = '';
  window.addEventListener('resize', handleResize);
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('boh_unread_refresh', handleUnreadRefresh);
  // 竖屏 Mini 形态（plans/009）：断点切换 + 滚动回缩
  portraitMiniQuery.addEventListener('change', handlePortraitMiniChange);
  // 桌面档 mini 的资格随时可能变（外接/拔掉鼠标、切到触摸模式、窗口跨 1024）
  desktopMiniQuery.addEventListener('change', syncNavMini);
  window.addEventListener('scroll', handleMiniCollapseScroll, { capture: true, passive: true });
  themeManager.addListener(handleThemeChange);
  // 添加点击外部关闭下拉菜单的事件监听
  /* ⚠️ 必须用 **capture** 阶段（第三参 true）：
     bubble 阶段会被页面里任意 `@click.stop` 截断 —— 实测点导航外部时若落在
     `.post-actions-v2`（帖子的点赞/评论区，自带 stopPropagation）上，本监听根本收不到，
     移动菜单就关不掉。capture 阶段在冒泡之前跑，不受任何下游 stopPropagation 影响；
     "点在菜单内部不关" 仍由 handleClickOutside 里的 closest 守卫保证。 */
  document.addEventListener('click', handleClickOutside, true);
  // Esc：二级菜单 / mini 钉住态的键盘出口
  document.addEventListener('keydown', handleNavEsc);

  // 竖屏下拉唤起博莱克：touchmove 必须 non-passive 才能 preventDefault 掉页面滚动
  const surfaceEl = navSurface.value;
  surfaceEl?.addEventListener('touchstart', onPullTouchStart, { passive: true });
  surfaceEl?.addEventListener('touchmove', onPullTouchMove, { passive: false });
  surfaceEl?.addEventListener('touchend', onPullTouchEnd);
  surfaceEl?.addEventListener('touchcancel', resetPull);
});

/**
 * 监听移动菜单状态变化
 */
watch(
  () => isMobileMenuOpen.value,
  () => {
    // Beta 6：常驻悬浮导航下移动端菜单始终允许页面滚动。
    document.body.style.overflow = '';
  },
);

/**
 * 组件卸载时清理
 */
onUnmounted(() => {
  window.removeEventListener('boh_global_nav_status_preview', handleNavStatusPreview);
  window.removeEventListener(GLOBAL_NAV_STATUS_EVENT, handleGlobalNavStatus);
  window.removeEventListener(GLOBAL_NAV_PREEMPT_EVENT, handleGlobalNavPreempt);
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  customHostResizeObserver?.disconnect();
  customHostResizeObserver = null;
  stopSubmenuObserver();
  submenuEls.clear();
  if (unreadRefreshInterval) {
    clearInterval(unreadRefreshInterval);
  }
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('boh_unread_refresh', handleUnreadRefresh);
  portraitMiniQuery.removeEventListener('change', handlePortraitMiniChange);
  desktopMiniQuery.removeEventListener('change', syncNavMini);
  clearMiniHoverTimer();
  window.removeEventListener('scroll', handleMiniCollapseScroll, { capture: true });
  if (miniScrollRafId) {
    cancelAnimationFrame(miniScrollRafId);
    miniScrollRafId = null;
  }
  themeManager.removeListener(handleThemeChange);
  // 移除点击外部关闭下拉菜单的事件监听
  document.removeEventListener('click', handleClickOutside, true);
  document.removeEventListener('keydown', handleNavEsc);

  const surfaceEl = navSurface.value;
  surfaceEl?.removeEventListener('touchstart', onPullTouchStart);
  surfaceEl?.removeEventListener('touchmove', onPullTouchMove);
  surfaceEl?.removeEventListener('touchend', onPullTouchEnd);
  surfaceEl?.removeEventListener('touchcancel', resetPull);
  resetPull();
});

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    void checkUnreadMessages();
  }
});
</script>

<style scoped src="./style.scoped.css"></style>

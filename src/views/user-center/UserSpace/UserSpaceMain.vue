<template>
  <div class="user-space-page" :class="{
    'tab-transition-forward': tabTransitionDirection === 'forward',
    'tab-transition-back': tabTransitionDirection === 'back',
    'edge-swipe-active': isEdgeSwiping
  }" :data-theme="currentTheme">

    <!-- 边缘滑动提示线 -->
    <div v-if="edgeIndicatorVisible" class="edge-swipe-indicator"></div>

    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">
    <input type="file" ref="profileBackgroundInputRef" class="hidden-file-input" accept="image/*"
      @change="handleProfileBackgroundFileChange">

    <div v-if="mountedTabs.posts" v-show="currentTab === 'posts' || leavingTab === 'posts'"
      :ref="(el) => setTabPageRef('posts', el)" class="tab-page posts-tab"
      :class="{ 'is-leaving': leavingTab === 'posts' }">
      <AsyncForum ref="forumViewRef" :key="forumRenderKey" :show-navbar="false" :show-header="false" :embedded="true"
        @island-message="showBottomNavIsland" />
    </div>

    <div v-if="mountedTabs.community" v-show="currentTab === 'community' || leavingTab === 'community'"
      :ref="(el) => setTabPageRef('community', el)" class="tab-page"
      :class="{ 'is-leaving': leavingTab === 'community' }">
      <AsyncCommunity @switch-tab="switchTab" @open-follow-modal="openUserFollowModal" />
    </div>

    <div v-if="mountedTabs.shows" v-show="currentTab === 'shows' || leavingTab === 'shows'"
      :ref="(el) => setTabPageRef('shows', el)" class="tab-page shows-tab"
      :class="{ 'is-leaving': leavingTab === 'shows' }">
      <AsyncShows :embedded="true" />
    </div>

    <div v-if="mountedTabs.ai" v-show="currentTab === 'ai' || leavingTab === 'ai'"
      :ref="(el) => setTabPageRef('ai', el)" class="tab-page ai-tab" :class="{ 'is-leaving': leavingTab === 'ai' }">
      <section class="ai-workspace" aria-label="BOH AI 聊天">
        <AsyncBOHAI :embedded="true" @island-message="showBottomNavIsland" />
      </section>
    </div>

    <div v-if="mountedTabs.messages" v-show="currentTab === 'messages' || leavingTab === 'messages'"
      :ref="(el) => setTabPageRef('messages', el)" class="tab-page messages-tab"
      :class="{ 'is-leaving': leavingTab === 'messages' }">
      <HomeCatMascot v-if="isHomeCatActive" class="messages-tab-cat" pool="background" seed="messages-tab" size="lg"
        decorative />
      <AsyncMessages :minimal="true" />
    </div>

    <div v-if="mountedTabs.profile" v-show="currentTab === 'profile'" :ref="(el) => setTabPageRef('profile', el)"
      class="tab-page profile-tab" :class="{ 'profile-home-active': profileSection === 'home' }">
      <div class="profile-page-content">
        <!-- ✅ 性能优化：静态内容使用 v-once，避免重复渲染 -->
        <div v-if="!isLoggedIn" class="login-prompt" v-once>
          <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
          <h3 class="login-prompt-title">登录以查看我的</h3>
          <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
          <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
        </div>

        <template v-else>
          <transition name="profile-panel-fade" mode="out-in">
            <ProfileHomePanel v-if="profileSection === 'home'" key="profile-home" :profile="userInfo"
              :avatar-url="avatarUrl" :profile-background-url="profileBackgroundUrl"
              :profile-cover-style="profileCoverStyle" :is-uploading-profile-background="isUploadingProfileBackground"
              :stats="userStats" :is-stats-loading="dataState.stats.loading" :cloud-plus-usage-text="cloudPlusUsageText"
              :cloud-plus-usage-meter-style="cloudPlusUsageMeterStyle"
              :subscription-summary-text="subscriptionSummaryText"
              :is-content-loading="dataState.profile.loading"
              :posts="profilePosts" :has-more-posts="hasMoreProfilePosts" :is-loading-more="isLoadingMoreProfilePosts"
              @edit-profile="openEditProfileModal" @settings="openProfileSettings" @avatar-click="handleAvatarClick"
              @background-click="handleProfileBackgroundClick"
              @view-impressions="openProfileImpressions" @sponsor="openSponsorPage"
              @data-management="openProfileDataManagement" @cloud-plus="openCloudPlusArea"
              @subscription="router.push('/user-space/subscriptions?from=userspace')"
              @post-click="openProfilePost"
              @switch-tab="switchTab"
              @load-more="loadMoreProfilePosts" />

            <!-- ✅ 性能优化：使用 v-memo 基于 profileSection 和 isLoading 条件优化渲染 -->
            <EditProfilePanel v-else-if="profileSection === 'edit-profile'" key="profile-edit" v-memo="[profileSection]"
              :avatar-url="avatarUrl" :username="editProfileForm.username"
              :bio="editProfileForm.bio" :join-year="editProfileForm.joinYear"
              :join-month="editProfileForm.joinMonth" :join-day="editProfileForm.joinDay"
              :birth-month="editProfileForm.birthMonth" :birth-day="editProfileForm.birthDay"
              :join-date-years="joinDateYears" :months="months"
              :days-for-edit-join-date="daysForEditJoinDate" :days-for-edit-profile="daysForEditProfile"
              :is-submitting-profile-edit="isSubmittingProfileEdit"
              @close="closeEditProfileModal" @avatar-click="handleAvatarClick"
              @save="submitEditProfile"
              @update-username="editProfileForm.username = $event"
              @update-bio="editProfileForm.bio = $event"
              @update-join-year="editProfileForm.joinYear = $event"
              @update-join-month="editProfileForm.joinMonth = $event"
              @update-join-day="editProfileForm.joinDay = $event"
              @update-birth-month="editProfileForm.birthMonth = $event"
              @update-birth-day="editProfileForm.birthDay = $event" />

            <!-- ✅ 性能优化：赞助页面使用 v-memo -->
            <SponsorPanel v-else-if="profileSection === 'sponsor'" key="profile-sponsor" v-memo="[profileSection, sponsorQrVisible, sponsorQrLoadFailed, sponsorQrLoading]"
              :is-home-cat-active="isHomeCatActive" :sponsor-methods="sponsorMethods"
              :sponsor-method="sponsorMethod" :sponsor-status-text="sponsorStatusText"
              :sponsor-qr-visible="sponsorQrVisible" :sponsor-qr-load-failed="sponsorQrLoadFailed"
              :sponsor-qr-loading="sponsorQrLoading" :sponsor-qr-image-url="sponsorQrImageUrl"
              :sponsor-cat-burst-key="sponsorCatBurstKey"
              @back="backToProfileHome" @start-flow="startSponsorFlow"
              @select-method="selectSponsorMethod" @show-qr="showSponsorQr"
              @qr-load="handleSponsorQrLoad" @qr-error="handleSponsorQrError" />

            <ProfileSettingsPanel v-else-if="profileSection === 'settings'" key="profile-settings"
              :pushplus-status-text="pushplusStatusText" :cloud-plus-usage-text="cloudPlusUsageText"
              :subscription-summary-text="subscriptionSummaryText" :data-privacy-status-text="dataPrivacyStatusText"
              :theme-display-text="themeDisplayText" :is-home-cat-active="isHomeCatActive" :current-theme="currentTheme"
              :hide-online-status="hideOnlineStatus" :hide-follow-data="hideFollowData"
              @back="backToProfileHome" @open-theme="openThemeModal"
              @open-cloud="openCloudPlusArea"
              @open-pushplus="router.push('/user-space/pushplus-settings?from=userspace-settings')"
              @open-security="router.push('/user-space/account-security?from=userspace-settings')"
              @open-data="openProfileDataManagement" @open-data-management="openProfileDataManagement"
              @logout="handleLogout" @toggle-hide-online="toggleHideOnlineStatus"
              @toggle-hide-follow-data="toggleHideFollowData" />

            <ProfileImpressionsPanel v-else-if="profileSection === 'impressions'" key="profile-impressions"
              :is-impressions-loading="dataState.impressions.loading" :impressions="profileImpressions"
              @back="backToProfileHome" @delete-impression="handleDeleteProfileImpression" />

            <!-- ✅ 性能优化：静态子页面使用 v-memo -->
            <DataPrivacyPanel v-else key="profile-data-management" v-memo="[profileSection, isAdmin]"
              :is-admin="isAdmin" @back="backToProfileSettings"
              @navigate="handleDataPrivacyNavigate" />
          </transition>
        </template>
      </div>
    </div>

    <UserSpaceBottomNav :visible="!(currentTab === 'profile' && profileSection === 'edit-profile')"
      :ai-overlay-open="isAiOverlayOpen" :island-visible="isBottomNavIslandExpanded"
      :island-collapsing="isBottomNavIslandCollapsing" :island="bottomNavIsland" :show-cat-sticker="isHomeCatActive"
      :nav-items="navItems" :current-tab="currentTab" :nav-indicator-style="bottomNavIndicatorStyle"
      :has-unread-messages="hasUnreadMessages" :unread-count="unreadCount" @island-action="handleBottomNavIslandAction"
      @island-before-leave="handleBottomNavIslandBeforeLeave" @island-after-leave="handleBottomNavIslandAfterLeave"
      @preload-tab="preloadUserSpaceTab" @nav-click="handleBottomNavClick" />

    <ThemeModal :open="showThemeModal" :current-theme-preference="currentThemePreference" @close="closeThemeModal"
      @select="setThemePreference" />

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />

    <AvatarCropModal v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop"
      :title="cropModalTitle" :hint="cropModalHint" :sub-hint="cropModalSubHint" :aspect-ratio="cropModalAspectRatio"
      :shape="cropModalShape" @confirm="handleCropConfirm" />

    <FollowListModal
      :show="followListModal.show"
      :title="followListModal.type === 'followers' ? '粉丝' : '关注'"
      :users="followListModal.users"
      :loading="followListModal.loading"
      :loading-more="followListModal.loadingMore"
      :has-more="followListModal.hasMore"
      :empty-text="followListModal.type === 'followers' ? '暂无粉丝' : '暂未关注任何人'"
      @close="followListModal.show = false"
      @load-more="handleFollowListLoadMore"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, reactive, watch, shallowRef, shallowReactive, markRaw, defineAsyncComponent } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Bot, MessageCircle, Newspaper, User, Users } from 'lucide-vue-next';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay';
import { useEdgeSwipeGesture } from '@/composables/useEdgeSwipeGesture';
import { useDebounce } from '@/composables/useDebounceThrottle';
import UserSpaceBottomNav from './components/UserSpaceBottomNav.vue';
const ProfileHomePanel = defineAsyncComponent(() => import('./components/ProfileHomePanel.vue'));
const ProfileImpressionsPanel = defineAsyncComponent(() => import('./components/ProfileImpressionsPanel.vue'));
const ProfileSettingsPanel = defineAsyncComponent(() => import('./components/ProfileSettingsPanel.vue'));
const EditProfilePanel = defineAsyncComponent(() => import('./components/EditProfilePanel.vue'));
const SponsorPanel = defineAsyncComponent(() => import('./components/SponsorPanel.vue'));
const DataPrivacyPanel = defineAsyncComponent(() => import('./components/DataPrivacyPanel.vue'));
import ThemeModal from './components/ThemeModal.vue';
import { useBottomNavIslandQueue } from './composables/useBottomNavIslandQueue.js';
import { createMemoryTtlCache } from './composables/useMemoryTtlCache.js';
import { USER_SPACE_VALID_TABS, useUserSpaceTabs } from './composables/useUserSpaceTabs.js';
import { useImageCompressionLoader } from './composables/useImageCompressionLoader.js';
import {
  AsyncBOHAI,
  AsyncCloudPlus,
  AsyncCommunity,
  AsyncForum,
  AsyncMessages,
  AsyncShows,
  clearIdlePreloadTasks,
  clearScheduledForumPreload,
  preloadBOHAIComponent,
  preloadCommunityComponent,
  preloadForumComponent,
  preloadMessagesComponent,
  preloadShowsComponent,
  scheduleForumPreload,
  scheduleIdleTask,
  setUserSpaceMountedForPreload
} from './async-loaders.js';
import { supabase } from '@/utils/supabase-client.js';
import { deleteUserImpression, getPostsByUsername, getUserImpressions, updateProfileAvatar, getFollowers, getFollowing } from '@/utils/api/profile-api.js';
import FollowListModal from '@/components/FollowListModal.vue';
import { getPushplusSettings } from '@/utils/api/pushplus-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { logger } from '@/utils/logger.js';
import { listMyCloudEntries } from '@/utils/api/boh-cloud-api.js';
import {
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  deleteCloudinaryAssetsByPublicIds,
  extractCloudinaryPublicIdFromUrl,
  getCloudinaryDisplayUrl,
  uploadImageToCloudinary
} from '@/utils/cloudinary-client.js';
import sponsorQrImage from '@/assets/images/qrcode.webp';
import { useAuthStore } from '@/stores/auth';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader';
import { themeManager } from '@/utils/theme-manager.js';
import { isHomeCatTheme } from '@/utils/home-cat-theme.js';
import { DEFAULT_CLOUD_IMAGE_LIMIT, resolveCloudBenefitFromSubscriptions } from '@/utils/subscription-benefits.js';

const { loadImageCompression } = useImageCompressionLoader();

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, isInitialized, userInfo, showLoginModal } = storeToRefs(authStore);
const notificationStoreRef = ref(getNotificationStoreSync());
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const hasUnreadMessages = computed(() => unreadCount.value > 0);
const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const refreshUnreadCount = async () => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount();
};

const username = computed(() => userInfo.value.username);
const giftProgressText = ref('');
const GIFT_PROGRESS_CACHE_TTL_MS = 60 * 1000;
const GIFT_PROGRESS_MIN_REFRESH_INTERVAL_MS = 5 * 1000;
const TAB_LEAVE_CLEAR_DELAY_MS = 170;
let lastGiftProgressRefreshAt = 0;
let giftProgressInflight = null;
let userSpaceWarmupTimeoutId = null;
// ✅ 性能优化：使用 markRaw 标记静态配置，避免不必要的响应式追踪
const USERSPACE_CACHE_TTL = markRaw({
  stats: 60 * 1000,
  cloudUsage: 60 * 1000,
  pushplus: 60 * 1000,
  profilePosts: 60 * 1000,
  impressions: 60 * 1000
});
const userSpaceMemoryCache = createMemoryTtlCache();
const getUserSpaceCache = (key, ttlMs) => userSpaceMemoryCache.get(key, ttlMs);
const setUserSpaceCache = (key, value) => userSpaceMemoryCache.set(key, value);

// ✅ 性能优化：合并 loading/error 状态为单一对象，减少响应式开销
const dataState = reactive({
  stats: { loading: false, error: null },
  cloud: { loading: false, error: null },
  pushplus: { loading: false, error: null },
  profile: { loading: false, error: null },
  impressions: { loading: false, error: null }
});

// ✅ 性能优化：添加 AbortController 管理，支持请求取消
const abortControllers = new Map();
const createAbortController = (key) => {
  const existing = abortControllers.get(key);
  if (existing) existing.abort();
  const controller = new AbortController();
  abortControllers.set(key, controller);
  return controller;
};
const cleanupAbortControllers = () => {
  abortControllers.forEach((controller) => controller.abort());
  abortControllers.clear();
};

// ✅ 性能优化：添加 lastFetchTime 记录，避免频繁重复请求
const lastFetchTime = reactive({
  stats: 0,
  cloudUsage: 0,
  pushplus: 0,
  profilePosts: 0,
  impressions: 0
});

// ✅ 性能优化：使用 shallowRef 优化非关键大数据
const profilePosts = shallowRef([]);
const profileImpressions = shallowRef([]);

const hideOnlineStatus = computed(() => userInfo.value?.hideOnlineStatus ?? false);
const hideFollowData = computed(() => userInfo.value?.hideFollowData ?? false);
const forumRenderKey = ref(0);
const forumViewRef = ref(null);
const shouldRefreshForumAfterThemeChange = ref(false);
const tabPageRefs = new Map();
const tabScrollPositions = reactive(Object.fromEntries(
  USER_SPACE_VALID_TABS.map((tab) => [tab, 0])
));
let clearLeavingTabTimer = null;
let userSpacePageEl = null;

let latestTabScrollRestoreToken = 0;

const navItems = [
  { id: 'posts', label: '帖子', icon: Newspaper },
  { id: 'community', label: '社区', icon: Users },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'messages', label: '消息', icon: MessageCircle },
  { id: 'profile', label: '我的', icon: User }
];
const { isOpen: isAiOverlayOpen, open: openGlobalAi, close: closeGlobalAi } = useGlobalAiOverlay();

// 边缘滑动手势检测：从右侧边缘向左滑动唤起AI
const { isSwiping: isEdgeSwiping, edgeIndicatorVisible } = useEdgeSwipeGesture({
  edgeWidth: 20,
  minSwipeDistance: 80,
  maxSwipeTime: 800,
  velocityThreshold: 0.5,
  onTrigger: openGlobalAi
});

const aiNavIndex = navItems.findIndex((item) => item.id === 'ai');
const bottomNavIndicatorStyle = computed(() => {
  if (!isAiOverlayOpen.value || aiNavIndex < 0) return navIndicatorStyle.value;
  return {
    '--active-nav-index': aiNavIndex,
    '--active-nav-center': `${((aiNavIndex + 0.5) / navItems.length) * 100}%`,
    '--nav-count': navItems.length
  };
});
const validTabs = USER_SPACE_VALID_TABS;
const validProfileSections = ['home', 'edit-profile', 'impressions', 'sponsor', 'settings', 'data-management'];
const tabTransitionDirection = ref('forward');
const leavingTab = ref(null);
const {
  currentTab,
  profileSection,
  mountedTabs,
  navIndicatorStyle,
  ensureTabMounted
} = useUserSpaceTabs(navItems);

const getTabOrderIndex = (tabId) => {
  const index = navItems.findIndex((item) => item.id === tabId);
  if (index >= 0) return index;
  return validTabs.indexOf(tabId);
};

const updateTabTransitionDirection = (nextTab, previousTab = currentTab.value) => {
  const nextIndex = getTabOrderIndex(nextTab);
  const previousIndex = getTabOrderIndex(previousTab);
  if (nextIndex < 0 || previousIndex < 0 || nextIndex === previousIndex) return;
  tabTransitionDirection.value = nextIndex > previousIndex ? 'forward' : 'back';
};

const setTabPageRef = (tabId, el) => {
  if (!tabId) return;
  if (el) {
    tabPageRefs.set(tabId, el);
  } else {
    tabPageRefs.delete(tabId);
  }
};

const getTabPageEl = (tabId) => tabPageRefs.get(tabId) || null;

const saveTabScrollPosition = (tabId = currentTab.value) => {
  const safeTab = String(tabId || '');
  const tabEl = getTabPageEl(safeTab);
  if (!tabEl) return;
  tabScrollPositions[safeTab] = Math.max(0, Number(tabEl.scrollTop || 0));
};

const restoreTabScrollPosition = async (tabId = currentTab.value) => {
  const safeTab = String(tabId || '');
  const restoreToken = ++latestTabScrollRestoreToken;
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (restoreToken !== latestTabScrollRestoreToken) return;
      const tabEl = getTabPageEl(safeTab);
      if (!tabEl) return;
      tabEl.scrollTop = Math.max(0, Number(tabScrollPositions[safeTab] || 0));
      if (safeTab === 'posts') {
        forumViewRef.value?.refreshEmbeddedScroll?.();
      }
    });
  });
};

const isAdmin = computed(() => userInfo.value.role === 'admin');

const sponsorMethod = ref('wechat');
const sponsorQrVisible = ref(false);
const sponsorQrLoading = ref(false);
const sponsorQrLoadFailed = ref(false);
const sponsorCatBurstKey = ref(0);
const sponsorQrImageUrl = sponsorQrImage;
const sponsorMethods = [
  {
    id: 'wechat',
    label: 'VX',
    desc: '微信赞赏码扫码',
    icon: 'VX',
    disabled: false
  },
  {
    id: 'alipay',
    label: '支付宝',
    desc: '暂不支持',
    icon: 'AL',
    disabled: true
  }
];
const sponsorStatusText = computed(() => (sponsorMethod.value === 'wechat' ? '可用' : '暂不支持'));

const resolveProfileSectionFromRoute = () => {
  if (currentTab.value !== 'profile') return;
  const requestedView = String(route.query.view || '').trim();
  const nextSection = validProfileSections.includes(requestedView) ? requestedView : 'home';
  profileSection.value = nextSection;
  if (nextSection === 'settings') {
    void fetchPushplusStatus();
    void fetchCloudPlusUsage();
  }
  if (nextSection === 'edit-profile') {
    prepareEditProfileForm();
  }
};

const openSettingsPanelFromRoute = async () => {
  if (currentTab.value !== 'profile' || profileSection.value !== 'settings') return;
  if (String(route.query.setting || '').trim() !== 'theme') return;

  await nextTick();
  openThemeModal();
};

const setProfileSectionRoute = (section) => {
  const nextQuery = { ...route.query, tab: 'profile' };
  if (section === 'home') {
    delete nextQuery.view;
    delete nextQuery.setting;
  } else {
    nextQuery.view = section;
  }
  router.replace({ query: nextQuery });
};

const userBirthday = computed(() => {
  if (userInfo.value.birthMonth && userInfo.value.birthDay) {
    return {
      month: userInfo.value.birthMonth,
      day: userInfo.value.birthDay
    };
  }
  return null;
});

const avatarUrl = computed(() => userInfo.value.avatarUrl || '');
const profileBackgroundUrl = computed(() => userInfo.value.profileBackgroundUrl || '');
const profileBackgroundPublicId = computed(() => userInfo.value.profileBackgroundPublicId || '');
const userProfileBio = computed(() => {
  const bio = String(userInfo.value.bio || '').trim();
  return bio || '这个人很认真地搭着自己的方块。';
});

const joinDate = computed(() => userInfo.value.joinDate || '');
const isProfileBasicsComplete = computed(() => Boolean(joinDate.value && userBirthday.value));
const profileBirthdayText = computed(() => userBirthday.value ? formatBirthdayLabel(userBirthday.value) : '未设置');
const profileJoinDateText = computed(() => joinDate.value ? formatJoinDateLabel(joinDate.value) : '未设置');
const avatarInputRef = ref(null);
const profileBackgroundInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const cropPurpose = ref('avatar');
const isProcessingCrop = ref(false);
const isUploadingProfileBackground = ref(false);
const BACKGROUND_CROP_ASPECT_RATIO = 3;
const cropModalAspectRatio = computed(() => cropPurpose.value === 'profile-background' ? BACKGROUND_CROP_ASPECT_RATIO : 1);
const cropModalShape = computed(() => cropPurpose.value === 'profile-background' ? 'rectangle' : 'circle');
const cropModalTitle = computed(() => cropPurpose.value === 'profile-background' ? '裁切背景' : '裁切头像');
const cropModalHint = computed(() => cropPurpose.value === 'profile-background'
  ? '拖动图片来选择个人卡片背景的显示范围'
  : '拖动以调整位置，缩放以改变大小');
const cropModalSubHint = computed(() => cropPurpose.value === 'profile-background'
  ? '裁切后的横幅会作为个人卡片背景'
  : '裁切后的效果将作为您的新头像');

const escapeCssUrl = (url = '') => String(url || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const profileCoverStyle = computed(() => {
  const displayUrl = getCloudinaryDisplayUrl(profileBackgroundUrl.value);
  if (!displayUrl) return {};

  return {
    backgroundImage: [
      'linear-gradient(180deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.02))',
      `url("${escapeCssUrl(displayUrl)}")`
    ].join(', ')
  };
});

// ✅ 性能优化：使用 shallowReactive 优化统计数据，减少深层响应式追踪
const userStats = shallowReactive({
  posts: 0,
  points: 0,
  rank: 0,
  followers: 0,
  following: 0
});
let latestUserStatsFetchToken = 0;
let userStatsRetryTimerId = null;

const PROFILE_POSTS_PAGE_SIZE = 15;
const hasMoreProfilePosts = ref(true);
const profilePostsPage = ref(1);
const isLoadingMoreProfilePosts = ref(false);
let latestProfileContentFetchToken = 0;
let latestProfileImpressionsFetchToken = 0;

const normalizeStatInt = (value, fallback = 0) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0, Math.trunc(normalized));
};

const resetUserStats = () => {
  userStats.posts = 0;
  userStats.points = 0;
  userStats.rank = 0;
};

const normalizeProfileText = (value, fallback = '') => {
  const safeValue = String(value || '').trim();
  return safeValue || fallback;
};

const getProfilePostTitle = (post = {}) => normalizeProfileText(post.title, '无标题');
const getProfilePostSummary = (post = {}) => {
  const body = normalizeProfileText(post.body || post.content, '');
  return body.length > 46 ? `${body.slice(0, 46)}...` : (body || '暂无正文');
};

const getProfilePostCover = (post = {}) => {
  const images = Array.isArray(post.images) ? post.images : [];
  const firstImage = images[0] || null;
  const imageCover = String(firstImage?.url || firstImage?.thumbUrl || firstImage?.originalUrl || '').trim();
  if (imageCover) return imageCover;
  return String(post.cover_image_url || '').trim();
};

const formatProfilePostDate = (post = {}) => {
  const rawDate = post.created_at || post.createdAt || post.published_at || post.updated_at || '';
  if (!rawDate) return '刚刚';
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return String(rawDate).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

const openProfilePost = (postId) => {
  const safePostId = String(postId || '').trim();
  if (!safePostId) return;
  router.push({ name: 'PostDetail', params: { id: safePostId }, query: { from: 'user-space', tab: 'profile' } });
};

// ✅ 性能优化：使用 AbortController 和 lastFetchTime 优化请求管理
const fetchProfileContent = async ({ force = false, reset = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value.id) {
    profilePosts.value = [];
    return;
  }

  const safeUsername = String(userInfo.value.username || '').trim();
  const userId = String(userInfo.value.id || '').trim();
  const cacheKey = `profile-posts:${userId}:${safeUsername}`;

  // ✅ 检查 lastFetchTime，避免频繁重复请求
  const now = Date.now();
  if (!force && !reset && (now - lastFetchTime.profilePosts < 5000)) {
    const cachedPosts = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.profilePosts);
    if (cachedPosts) {
      profilePosts.value = cachedPosts;
      dataState.profile.loading = false;
      return;
    }
  }

  if (reset) {
    hasMoreProfilePosts.value = true;
    profilePostsPage.value = 1;
  }

  if (!force && !reset) {
    const cachedPosts = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.profilePosts);
    if (cachedPosts) {
      profilePosts.value = cachedPosts;
      dataState.profile.loading = false;
      return;
    }
  }

  const fetchToken = ++latestProfileContentFetchToken;
  const abortController = createAbortController('profile-posts');
  if (reset) {
    dataState.profile.loading = true;
  }

  try {
    const pageToLoad = reset ? 1 : profilePostsPage.value;
    const result = await getPostsByUsername(safeUsername, userId, {
      page: pageToLoad,
      pageSize: PROFILE_POSTS_PAGE_SIZE,
      includeUnapprovedForAuthor: true,
      signal: abortController.signal
    });
    if (fetchToken !== latestProfileContentFetchToken || abortController.signal.aborted) return;
    if (result.error) {
      logger.warn('user-space', '读取我的发帖失败:', result.error);
      dataState.profile.error = result.error;
      if (reset) profilePosts.value = [];
      return;
    }
    const incoming = result.data || [];
    if (reset) {
      profilePosts.value = incoming;
    } else {
      const seen = new Set(profilePosts.value.map(p => p.id));
      const newPosts = incoming.filter(p => !seen.has(p.id));
      profilePosts.value = [...profilePosts.value, ...newPosts];
    }
    hasMoreProfilePosts.value = incoming.length === PROFILE_POSTS_PAGE_SIZE;
    profilePostsPage.value = pageToLoad + 1;
    setUserSpaceCache(cacheKey, profilePosts.value);
    lastFetchTime.profilePosts = now;
    dataState.profile.error = null;

  } catch (error) {
    if (error.name === 'AbortError') return;
    logger.warn('user-space', '读取我的内容失败:', error);
    dataState.profile.error = error;
    if (reset) {
      profilePosts.value = [];
    }
  } finally {
    if (fetchToken === latestProfileContentFetchToken) {
      dataState.profile.loading = false;
    }
  }
};

const loadMoreProfilePosts = async () => {
  if (isLoadingMoreProfilePosts.value || !hasMoreProfilePosts.value) return;
  isLoadingMoreProfilePosts.value = true;
  try {
    await fetchProfileContent({ force: true, reset: false });
  } finally {
    isLoadingMoreProfilePosts.value = false;
  }
};

// ✅ 性能优化：使用 AbortController 和 lastFetchTime 优化请求管理
const fetchProfileImpressions = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    profileImpressions.value = [];
    return;
  }

  const cacheKey = `profile-impressions:${userId}`;
  const now = Date.now();

  // ✅ 检查 lastFetchTime，避免频繁重复请求
  if (!force && (now - lastFetchTime.impressions < 5000)) {
    const cachedImpressions = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.impressions);
    if (cachedImpressions) {
      profileImpressions.value = cachedImpressions;
      dataState.impressions.loading = false;
      return;
    }
  }

  if (!force) {
    const cachedImpressions = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.impressions);
    if (cachedImpressions) {
      profileImpressions.value = cachedImpressions;
      dataState.impressions.loading = false;
      return;
    }
  }

  const fetchToken = ++latestProfileImpressionsFetchToken;
  const abortController = createAbortController('profile-impressions');
  dataState.impressions.loading = true;
  try {
    const { data, error } = await getUserImpressions(userId, { signal: abortController.signal });
    if (fetchToken !== latestProfileImpressionsFetchToken || abortController.signal.aborted) return;
    if (error) {
      logger.warn('user-space', '读取我的印象失败:', error);
      profileImpressions.value = [];
      dataState.impressions.error = error;
      return;
    }
    profileImpressions.value = data || [];
    setUserSpaceCache(cacheKey, profileImpressions.value);
    lastFetchTime.impressions = now;
    dataState.impressions.error = null;
  } catch (error) {
    if (error.name === 'AbortError') return;
    logger.warn('user-space', '读取我的印象异常:', error);
    profileImpressions.value = [];
    dataState.impressions.error = error;
  } finally {
    if (fetchToken === latestProfileImpressionsFetchToken) {
      dataState.impressions.loading = false;
    }
  }
};

const handleDeleteProfileImpression = async (impressionId) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId) {
    showAlert('error', '删除失败', '当前登录状态异常，请刷新后重试');
    return;
  }
  try {
    const { error } = await deleteUserImpression(impressionId, userId);
    if (error) {
      showAlert('error', '删除失败', error.message || '请稍后重试');
      return;
    }
    profileImpressions.value = profileImpressions.value.filter(imp => imp.id !== impressionId);
    setUserSpaceCache(`profile-impressions:${userId}`, profileImpressions.value);
    showAlert('success', '删除成功', '该印象已被移除');
  } catch (error) {
    logger.warn('user-space', '删除我的印象异常:', error);
    showAlert('error', '删除失败', '网络错误');
  }
};

// ✅ 性能优化：使用 AbortController 和 lastFetchTime 优化请求管理
const fetchUserStats = async ({ retryCount = 0, force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  const safeUsername = String(userInfo.value.username || '').trim();
  const cacheKey = `stats:${userId}:${safeUsername}`;
  const now = Date.now();

  // ✅ 检查 lastFetchTime，避免频繁重复请求
  if (!force && retryCount === 0 && (now - lastFetchTime.stats < 5000)) {
    const cachedStats = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.stats);
    if (cachedStats) {
      userStats.posts = normalizeStatInt(cachedStats.posts, 0);
      userStats.points = normalizeStatInt(cachedStats.points, 0);
      userStats.rank = normalizeStatInt(cachedStats.rank, 0);
      dataState.stats.loading = false;
      return;
    }
  }

  if (!force && retryCount === 0) {
    const cachedStats = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.stats);
    if (cachedStats) {
      userStats.posts = normalizeStatInt(cachedStats.posts, 0);
      userStats.points = normalizeStatInt(cachedStats.points, 0);
      userStats.rank = normalizeStatInt(cachedStats.rank, 0);
      dataState.stats.loading = false;
      return;
    }
  }

  const fetchToken = ++latestUserStatsFetchToken;
  const abortController = createAbortController('user-stats');
  dataState.stats.loading = true;
  const fallbackPoints = normalizeStatInt(userInfo.value.points, userStats.points);
  userStats.points = fallbackPoints;

  try {
    const [postsResult, pointsResult, followersResult, followingResult] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .or(`author_id.eq.${userId}${safeUsername ? `,author_username.eq.${safeUsername}` : ''}`),
      supabase
        .from('profiles')
        .select('points')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId)
    ]);

    if (fetchToken !== latestUserStatsFetchToken || abortController.signal.aborted) return;

    let hasQueryError = Boolean(postsResult.error || pointsResult.error);

    if (!postsResult.error) {
      userStats.posts = normalizeStatInt(postsResult.count, 0);
    } else {
      logger.warn('user-space', '获取用户帖子数失败:', postsResult.error);
      dataState.stats.error = postsResult.error;
    }

    if (!pointsResult.error && pointsResult.data) {
      userStats.points = normalizeStatInt(pointsResult.data.points, fallbackPoints);
    } else if (pointsResult.error) {
      logger.warn('user-space', '获取用户积分失败:', pointsResult.error);
      dataState.stats.error = pointsResult.error;
    }

    // 获取排名（基于积分）
    const { count: higherRankCount, error: rankError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('points', userStats.points);

    if (fetchToken !== latestUserStatsFetchToken || abortController.signal.aborted) return;

    if (!rankError) {
      userStats.rank = normalizeStatInt(higherRankCount, 0) + 1;
    } else {
      hasQueryError = true;
      logger.warn('user-space', '获取用户排名失败:', rankError);
      dataState.stats.error = rankError;
    }

    if (!followersResult.error) {
      userStats.followers = normalizeStatInt(followersResult.count, 0);
    }
    if (!followingResult.error) {
      userStats.following = normalizeStatInt(followingResult.count, 0);
    }

    setUserSpaceCache(cacheKey, {
      posts: userStats.posts,
      points: userStats.points,
      rank: userStats.rank,
      followers: userStats.followers,
      following: userStats.following
    });
    lastFetchTime.stats = now;
    dataState.stats.error = null;

    if (hasQueryError && retryCount < 1) {
      userStatsRetryTimerId = setTimeout(() => {
        userStatsRetryTimerId = null;
        if (!isLoggedIn.value || !String(userInfo.value.id || '').trim()) return;
        void fetchUserStats({ retryCount: retryCount + 1 });
      }, 900);
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    logger.warn('user-space', '获取用户统计数据失败:', error);
    dataState.stats.error = error;
  } finally {
    if (fetchToken === latestUserStatsFetchToken) {
      dataState.stats.loading = false;
    }
  }
};

const isSubmittingProfileEdit = ref(false);
const editProfileForm = reactive({
  username: '',
  bio: '',
  joinDate: '',
  joinYear: '',
  joinMonth: '',
  joinDay: '',
  birthMonth: '',
  birthDay: ''
});
const AVATAR_MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const PROFILE_BACKGROUND_MAX_FILE_SIZE_BYTES = CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES;

// 主题设置
const showThemeModal = ref(false);
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value));
const themeDisplayText = computed(() => {
  if (currentThemePreference.value === 'home-cat') {
    return '方块小窝';
  }
  if (currentThemePreference.value === 'system') {
    return currentTheme.value === 'dark' ? '跟随系统：深色' : '跟随系统：浅色';
  }
  return currentTheme.value === 'dark' ? '深色模式' : '浅色模式';
});
const dataPrivacyStatusText = computed(() => isProfileBasicsComplete.value ? '资料已完善' : '待补充资料');
// ✅ 性能优化：使用 shallowReactive 优化 Pushplus 和 Cloud+ 状态
const pushplusStatus = shallowReactive({
  loaded: false,
  hasToken: false,
  enabled: false
});
const pushplusStatusText = computed(() => {
  if (dataState.pushplus.loading) return '检查中';
  if (!pushplusStatus.loaded) return '未检查';
  if (!pushplusStatus.hasToken) return '未绑定';
  return pushplusStatus.enabled ? '已启用' : '已暂停';
});
// ✅ 性能优化：使用 shallowReactive 优化 Cloud+ 使用情况数据
const cloudPlusUsage = shallowReactive({
  loaded: false,
  used: 0,
  limit: DEFAULT_CLOUD_IMAGE_LIMIT
});
const cloudPlusUsageText = computed(() => {
  if (dataState.cloud.loading) return '读取中';
  if (!cloudPlusUsage.loaded) return '未检查';
  return `已使用 ${cloudPlusUsage.used}/${cloudPlusUsage.limit}`;
});
const cloudPlusUsageMeterStyle = computed(() => {
  const limit = Math.max(1, Number(cloudPlusUsage.limit || DEFAULT_CLOUD_IMAGE_LIMIT));
  const used = Math.max(0, Number(cloudPlusUsage.used || 0));
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return { width: `${percent}%` };
});
const subscriptionSummaryText = computed(() => {
  if (dataState.cloud.loading) return '正在同步权益';
  if (!cloudPlusUsage.loaded) return '查看积分与额度';
  if (Number(cloudPlusUsage.limit || 0) > DEFAULT_CLOUD_IMAGE_LIMIT) {
    return `Cloud 额度 ${cloudPlusUsage.limit}`;
  }
  return '基础权益';
});
let latestUnreadIslandEventAt = 0;
let hasScheduledBottomNavOnboardingNotice = false;
const BOTTOM_NAV_ONBOARDING_NOTICE_VERSION = 'v1';

const {
  island: bottomNavIsland,
  isCollapsing: isBottomNavIslandCollapsing,
  isExpanded: isBottomNavIslandExpanded,
  show: showBottomNavIsland,
  handleAction: handleBottomNavIslandAction,
  handleBeforeLeave: handleBottomNavIslandBeforeLeave,
  handleAfterLeave: handleBottomNavIslandAfterLeave,
  dispose: disposeBottomNavIsland
} = useBottomNavIslandQueue({
  onAction: (actionTab) => {
    if (actionTab && validTabs.includes(actionTab)) {
      switchTab(actionTab);
    }
  }
});

const handleBottomNavIslandEvent = (event) => {
  showBottomNavIsland(event?.detail || {});
};

// ✨ 新增：处理全局灵动岛事件（跨组件通信）
const handleGlobalIslandMessage = (event) => {
  logger.debug('user-space', '收到全局灵动岛事件', { detail: event?.detail });
  showBottomNavIsland(event?.detail || {});
};

const getBottomNavOnboardingNoticeKey = () => {
  const userId = String(userInfo.value?.id || 'guest').trim() || 'guest';
  return `boh-userspace-bottom-nav-onboarding-${BOTTOM_NAV_ONBOARDING_NOTICE_VERSION}-${userId}`;
};

const hasSeenBottomNavOnboardingNotice = () => {
  try {
    return localStorage.getItem(getBottomNavOnboardingNoticeKey()) === '1';
  } catch (error) {
    logger.warn('user-space', '读取灵动导航栏引导状态失败:', error);
    return false;
  }
};

const markBottomNavOnboardingNoticeSeen = () => {
  try {
    localStorage.setItem(getBottomNavOnboardingNoticeKey(), '1');
  } catch (error) {
    logger.warn('user-space', '写入灵动导航栏引导状态失败:', error);
  }
};

const maybeShowBottomNavOnboardingNotice = async () => {
  if (hasScheduledBottomNavOnboardingNotice) return;
  if (!isInitialized.value) return;
  if (hasSeenBottomNavOnboardingNotice()) return;

  hasScheduledBottomNavOnboardingNotice = true;
  await nextTick();

  showBottomNavIsland({
    title: '灵动导航栏上线',
    message: '以后弹窗提示都在这哦',
    icon: 'notification',
    type: 'notification',
    actionLabel: '知道了',
    durationMs: 5600,
    catSticker: 'cardExtra',
    catStickerMode: 'hero',
    forceCatSticker: true
  });
  markBottomNavOnboardingNoticeSeen();
};

const buildUnreadIslandMessage = (detail = {}) => {
  const totalUnread = Number(unreadCount.value) || 0;
  return {
    title: '有新通知',
    message: totalUnread > 0 ? `当前共有 ${totalUnread} 条未读` : '你有新的站内通知',
    icon: 'notification',
    durationMs: 6200
  };
};

const showUnreadBottomNavIsland = async (detail = {}) => {
  if (!isLoggedIn.value) return;
  if (String(detail.source || '') !== 'realtime') return;
  const now = Date.now();
  if (now - latestUnreadIslandEventAt < 900) return;
  latestUnreadIslandEventAt = now;

  showBottomNavIsland(buildUnreadIslandMessage(detail));
};

// ✅ 性能优化：使用 AbortController 和 lastFetchTime 优化请求管理
const fetchPushplusStatus = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId || dataState.pushplus.loading) return;

  const cacheKey = `pushplus:${userId}`;
  const now = Date.now();

  // ✅ 检查 lastFetchTime，避免频繁重复请求
  if (!force && (now - lastFetchTime.pushplus < 5000)) {
    const cachedStatus = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.pushplus);
    if (cachedStatus) {
      pushplusStatus.loaded = true;
      pushplusStatus.hasToken = Boolean(cachedStatus.hasToken);
      pushplusStatus.enabled = Boolean(cachedStatus.enabled);
      return;
    }
  }

  if (!force) {
    const cachedStatus = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.pushplus);
    if (cachedStatus) {
      pushplusStatus.loaded = true;
      pushplusStatus.hasToken = Boolean(cachedStatus.hasToken);
      pushplusStatus.enabled = Boolean(cachedStatus.enabled);
      return;
    }
  }

  const abortController = createAbortController('pushplus-status');
  dataState.pushplus.loading = true;
  try {
    const { data, error } = await getPushplusSettings(userId, { signal: abortController.signal });
    if (abortController.signal.aborted) return;
    if (error) {
      pushplusStatus.loaded = true;
      pushplusStatus.hasToken = false;
      pushplusStatus.enabled = false;
      dataState.pushplus.error = error;
      return;
    }
    pushplusStatus.loaded = true;
    pushplusStatus.hasToken = Boolean(data?.token);
    pushplusStatus.enabled = Boolean(data?.enabled);
    setUserSpaceCache(cacheKey, {
      hasToken: pushplusStatus.hasToken,
      enabled: pushplusStatus.enabled
    });
    lastFetchTime.pushplus = now;
    dataState.pushplus.error = null;
  } catch (error) {
    if (error.name === 'AbortError') return;
    logger.warn('user-space', '获取 Pushplus 状态失败:', error);
    pushplusStatus.loaded = true;
    pushplusStatus.hasToken = false;
    pushplusStatus.enabled = false;
    dataState.pushplus.error = error;
  } finally {
    dataState.pushplus.loading = false;
  }
};

// ✅ 性能优化：使用 AbortController 和 lastFetchTime 优化请求管理
const fetchCloudPlusUsage = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId || dataState.cloud.loading) return;

  const cacheKey = `cloud-usage:${userId}`;
  const now = Date.now();

  // ✅ 检查 lastFetchTime，避免频繁重复请求
  if (!force && (now - lastFetchTime.cloudUsage < 5000)) {
    const cachedUsage = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.cloudUsage);
    if (cachedUsage) {
      cloudPlusUsage.loaded = true;
      cloudPlusUsage.used = Number(cachedUsage.used || 0);
      cloudPlusUsage.limit = Number(cachedUsage.limit || DEFAULT_CLOUD_IMAGE_LIMIT);
      return;
    }
  }

  if (!force) {
    const cachedUsage = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.cloudUsage);
    if (cachedUsage) {
      cloudPlusUsage.loaded = true;
      cloudPlusUsage.used = Number(cachedUsage.used || 0);
      cloudPlusUsage.limit = Number(cachedUsage.limit || DEFAULT_CLOUD_IMAGE_LIMIT);
      return;
    }
  }

  const abortController = createAbortController('cloud-usage');
  dataState.cloud.loading = true;
  try {
    const [subscriptionsResult, cloudEntriesResult] = await Promise.all([
      getMySubscriptions(userId, { includeExpired: true, signal: abortController.signal }),
      listMyCloudEntries({ userId, limit: 500, signal: abortController.signal })
    ]);

    if (abortController.signal.aborted) return;

    const subscriptions = subscriptionsResult.ok && Array.isArray(subscriptionsResult.data)
      ? subscriptionsResult.data
      : [];
    const benefit = resolveCloudBenefitFromSubscriptions(subscriptions);
    cloudPlusUsage.limit = Number(benefit.cloudImageLimit || DEFAULT_CLOUD_IMAGE_LIMIT);

    if (cloudEntriesResult.ok && Array.isArray(cloudEntriesResult.data)) {
      cloudPlusUsage.used = cloudEntriesResult.data.reduce((sum, entry) => (
        sum + (Array.isArray(entry?.contentBlocks)
          ? entry.contentBlocks.filter((block) => block?.type === 'image').length
          : 0)
      ), 0);
    } else {
      cloudPlusUsage.used = 0;
    }

    cloudPlusUsage.loaded = true;
    setUserSpaceCache(cacheKey, {
      used: cloudPlusUsage.used,
      limit: cloudPlusUsage.limit
    });
    lastFetchTime.cloudUsage = now;
    dataState.cloud.error = null;
  } catch (error) {
    if (error.name === 'AbortError') return;
    logger.warn('user-space', '获取 Cloud+ 使用情况失败:', error);
    cloudPlusUsage.loaded = true;
    cloudPlusUsage.used = 0;
    cloudPlusUsage.limit = DEFAULT_CLOUD_IMAGE_LIMIT;
    dataState.cloud.error = error;
  } finally {
    dataState.cloud.loading = false;
  }
};

// 主题变化监听函数
const handleThemeChange = (theme, preference = themeManager.getPreference?.() || theme) => {
  currentTheme.value = theme;
  currentThemePreference.value = preference;
  shouldRefreshForumAfterThemeChange.value = true;
  // 同步更新页面的 data-theme 属性
  if (userSpacePageEl) {
    userSpacePageEl.setAttribute('data-theme', theme);
  }
  void refreshForumAfterThemeChange();
};

const openThemeModal = () => {
  showThemeModal.value = true;
};

const closeThemeModal = () => {
  showThemeModal.value = false;
};

const refreshForumAfterThemeChange = async () => {
  if (!shouldRefreshForumAfterThemeChange.value || currentTab.value !== 'posts') return;
  shouldRefreshForumAfterThemeChange.value = false;
  await nextTick();
  forumRenderKey.value += 1;
};

const activateForumTab = async () => {
  await nextTick();
  forumViewRef.value?.refreshEmbeddedScroll?.();
};

const setThemePreference = (preference) => {
  if (preference === 'system') {
    themeManager.resetToSystem();
  } else {
    themeManager.setTheme(preference);
  }
  currentTheme.value = themeManager.getTheme();
  currentThemePreference.value = themeManager.getPreference?.() || preference;
  // 更新当前页面的 data-theme 属性
  if (userSpacePageEl) {
    userSpacePageEl.setAttribute('data-theme', currentTheme.value);
  }
};

const openProfileSettings = () => {
  profileSection.value = 'settings';
  setProfileSectionRoute('settings');
  void fetchPushplusStatus();
  void fetchCloudPlusUsage();
};

const openSponsorPage = () => {
  profileSection.value = 'sponsor';
  setProfileSectionRoute('sponsor');
  sponsorMethod.value = 'wechat';
  sponsorQrVisible.value = false;
  sponsorQrLoadFailed.value = false;
  sponsorQrLoading.value = false;
  sponsorCatBurstKey.value += 1;
};

const backToProfileHome = () => {
  profileSection.value = 'home';
  setProfileSectionRoute('home');
};

const openProfileDataManagement = () => {
  profileSection.value = 'data-management';
  setProfileSectionRoute('data-management');
};

const handleDataPrivacyNavigate = (route) => {
  if (route === 'shared-memories') {
    router.push('/user-space/shared-memories?from=userspace-data');
  } else if (route === 'admin') {
    router.push('/admin/data-management');
  }
};

const backToProfileSettings = () => {
  profileSection.value = 'settings';
  setProfileSectionRoute('settings');
  void fetchPushplusStatus();
  void fetchCloudPlusUsage();
};

const openProfileImpressions = () => {
  profileSection.value = 'impressions';
  setProfileSectionRoute('impressions');
  void fetchProfileImpressions();
};

const selectSponsorMethod = (methodId) => {
  sponsorMethod.value = methodId;
  if (methodId === 'alipay') {
    showAlert('info', '暂不支持', '支付宝赞助暂未开放，当前仅支持微信方式。');
  }
};

const startSponsorFlow = () => {
  if (sponsorMethod.value !== 'wechat') {
    showAlert('info', '暂不支持', '请选择微信方式查看赞赏码。');
    return;
  }
  showSponsorQr();
};

let sponsorQrTimer = null;

const showSponsorQr = () => {
  if (sponsorMethod.value !== 'wechat') return;
  sponsorCatBurstKey.value += 1;
  if (sponsorQrVisible.value && !sponsorQrLoadFailed.value) {
    sponsorQrLoading.value = false;
    return;
  }
  sponsorQrVisible.value = true;
  sponsorQrLoadFailed.value = false;
  sponsorQrLoading.value = true;
  clearTimeout(sponsorQrTimer);
  sponsorQrTimer = setTimeout(() => {
    if (sponsorQrLoading.value) {
      sponsorQrLoading.value = false;
      sponsorQrLoadFailed.value = true;
    }
  }, 8000);
};

const handleSponsorQrLoad = () => {
  sponsorQrLoading.value = false;
  sponsorQrLoadFailed.value = false;
};

const handleSponsorQrError = () => {
  sponsorQrLoading.value = false;
  sponsorQrLoadFailed.value = true;
};

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const months = Array.from({ length: 12 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const joinDateYears = Array.from({ length: Math.max(1, currentYear - 2014 + 1) }, (_, i) => currentYear - i);

const daysForEditProfile = computed(() => {
  const month = Number(editProfileForm.birthMonth || 0);
  if (!month) return Array.from({ length: 31 }, (_, i) => i + 1);
  const days = new Date(2024, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => i + 1);
});

const daysForEditJoinDate = computed(() => {
  const year = Number(editProfileForm.joinYear || currentYear);
  const month = Number(editProfileForm.joinMonth || 0);
  if (!month) return Array.from({ length: 31 }, (_, i) => i + 1);
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => i + 1);
});

const composeDateValue = (year, month, day) => {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const hasAnyDatePart = (...parts) => parts.some((part) => String(part || '').trim());
const hasCompleteDateParts = (...parts) => parts.every((part) => String(part || '').trim());

const splitDateValue = (dateValue) => {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return { year: '', month: '', day: '' };
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
};

const normalizeEditProfileBirthdayDay = () => {
  if (!editProfileForm.birthDay) return;
  const maxDay = daysForEditProfile.value.length;
  const safeDay = Number(editProfileForm.birthDay);
  if (!Number.isFinite(safeDay) || safeDay < 1) {
    editProfileForm.birthDay = '';
    return;
  }
  if (safeDay > maxDay) {
    editProfileForm.birthDay = maxDay;
  }
};

const normalizeEditJoinDay = () => {
  if (!editProfileForm.joinDay) return;
  const maxDay = daysForEditJoinDate.value.length;
  const safeDay = Number(editProfileForm.joinDay);
  if (!Number.isFinite(safeDay) || safeDay < 1) {
    editProfileForm.joinDay = '';
    return;
  }
  if (safeDay > maxDay) {
    editProfileForm.joinDay = maxDay;
  }
};

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const formatBirthday = (b) => {
  if (!b) return '';
  const m = String(b.month).padStart(2, '0');
  const d = String(b.day).padStart(2, '0');
  return `${m}/${d}`;
};

const formatBirthdayLabel = (b) => {
  if (!b) return '';
  const month = Number(b.month);
  const day = Number(b.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return formatBirthday(b);
  return `${month}月${day}日`;
};

const formatJoinDateLabel = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const prepareEditProfileForm = () => {
  const parsedJoinDate = splitDateValue(joinDate.value || '');
  editProfileForm.username = String(userInfo.value.username || '');
  editProfileForm.bio = String(userInfo.value.bio || '');
  editProfileForm.joinDate = joinDate.value || '';
  editProfileForm.joinYear = parsedJoinDate.year;
  editProfileForm.joinMonth = parsedJoinDate.month;
  editProfileForm.joinDay = parsedJoinDate.day;
  editProfileForm.birthMonth = userBirthday.value?.month || '';
  editProfileForm.birthDay = userBirthday.value?.day || '';
};

const openEditProfileModal = () => {
  prepareEditProfileForm();
  profileSection.value = 'edit-profile';
  setProfileSectionRoute('edit-profile');
};

const closeEditProfileModal = () => {
  profileSection.value = 'home';
  setProfileSectionRoute('home');
};

const submitEditProfile = async () => {
  normalizeEditJoinDay();
  normalizeEditProfileBirthdayDay();

  // 验证昵称
  const newUsername = String(editProfileForm.username || '').trim();
  if (!newUsername) {
    showAlert('warning', '提示', '昵称不能为空');
    return;
  }
  if (newUsername.length > 20) {
    showAlert('warning', '提示', '昵称最多 20 个字符');
    return;
  }
  // 禁止昵称中包含特殊字符
  const usernamePattern = /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/;
  if (!usernamePattern.test(newUsername)) {
    showAlert('warning', '提示', '昵称只能包含中文、英文、数字、下划线和减号');
    return;
  }

  const hasAnyJoinDatePart = hasAnyDatePart(
    editProfileForm.joinYear,
    editProfileForm.joinMonth,
    editProfileForm.joinDay
  );
  const hasCompleteJoinDate = hasCompleteDateParts(
    editProfileForm.joinYear,
    editProfileForm.joinMonth,
    editProfileForm.joinDay
  );
  if (hasAnyJoinDatePart && !hasCompleteJoinDate) {
    showAlert('warning', '提示', '请完整选择入群时间');
    return;
  }
  const nextJoinDate = hasCompleteJoinDate
    ? composeDateValue(editProfileForm.joinYear, editProfileForm.joinMonth, editProfileForm.joinDay)
    : null;
  if (nextJoinDate && nextJoinDate > getTodayDate()) {
    showAlert('warning', '提示', '入群时间不能晚于今天');
    return;
  }
  const hasAnyBirthdayPart = hasAnyDatePart(editProfileForm.birthMonth, editProfileForm.birthDay);
  const hasCompleteBirthday = hasCompleteDateParts(editProfileForm.birthMonth, editProfileForm.birthDay);
  if (hasAnyBirthdayPart && !hasCompleteBirthday) {
    showAlert('warning', '提示', '请完整选择生日月份和日期');
    return;
  }

  isSubmittingProfileEdit.value = true;
  try {
    const updates = {
      username: newUsername,
      bio: String(editProfileForm.bio || '').trim().slice(0, 160),
      join_date: nextJoinDate,
      birth_month: hasCompleteBirthday ? String(editProfileForm.birthMonth) : null,
      birth_day: hasCompleteBirthday ? String(editProfileForm.birthDay) : null
    };
    const result = await authStore.updateUserProfile(updates);
    if (!result.success) {
      throw new Error(result.message || '更新失败');
    }
    showBottomNavIsland({
      title: '个人资料已保存',
      message: '你的资料更新已同步',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 4200
    });
    closeEditProfileModal();
  } catch (error) {
    logger.error('user-space', '编辑资料失败:', error);
    showAlert('error', '保存失败', `错误: ${error.message || '未知错误'}`);
  } finally {
    isSubmittingProfileEdit.value = false;
  }
};

const openCloudPlusArea = (view = 'content') => {
  const safeView = ['content', 'settings'].includes(String(view)) ? String(view) : 'content';
  const returnOrigin = profileSection.value === 'settings' ? 'userspace-settings' : 'userspace';
  router.push({
    path: '/user-space/note',
    query: {
      view: safeView,
      from: returnOrigin
    }
  });
};

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Community data now managed by CommunityTab.vue

// Follow List Modal (社区列表)
const followListModal = reactive({
  show: false,
  type: 'followers',
  targetUser: null,
  users: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  page: 1
});

const openUserFollowModal = async (user, type) => {
  if (!user?.id) return;
  followListModal.show = true;
  followListModal.type = type;
  followListModal.targetUser = user;
  followListModal.users = [];
  followListModal.page = 1;
  followListModal.hasMore = false;
  await loadCommunityFollowListPage({ reset: true });
};

const loadCommunityFollowListPage = async ({ reset = false } = {}) => {
  const targetId = followListModal.targetUser?.id;
  if (!targetId) return;
  if (reset) followListModal.loading = true;
  else followListModal.loadingMore = true;
  try {
    const pageToLoad = reset ? 1 : followListModal.page;
    const loadFn = followListModal.type === 'followers' ? getFollowers : getFollowing;
    const res = await loadFn(targetId, { page: pageToLoad, pageSize: 20 });
    const incoming = res.error ? [] : (res.data || []);
    followListModal.users = reset ? incoming : [...followListModal.users, ...incoming];
    followListModal.hasMore = incoming.length === 20;
    followListModal.page = pageToLoad + 1;
  } catch {
    if (reset) followListModal.users = [];
  } finally {
    followListModal.loading = false;
    followListModal.loadingMore = false;
  }
};

const handleFollowListLoadMore = () => {
  loadCommunityFollowListPage();
};



const preloadUserSpaceTab = (tabId) => {
  const safeTab = String(tabId || '');
  if (!validTabs.includes(safeTab)) return;
  if (safeTab === 'posts') {
    scheduleIdleTask('tab:posts', () => void preloadForumComponent());
  } else if (safeTab === 'messages' && canOpenUserSpaceTab('messages')) {
    scheduleIdleTask('tab:messages', () => void preloadMessagesComponent());
  } else if (safeTab === 'shows') {
    scheduleIdleTask('tab:shows', () => void preloadShowsComponent());
  } else if (safeTab === 'ai') {
    scheduleIdleTask('tab:ai', () => void preloadBOHAIComponent());
  } else if (safeTab === 'community') {
    scheduleIdleTask('tab:community', () => void preloadCommunityComponent(), { timeout: 2400, fallbackDelay: 420 });
  } else if (safeTab === 'profile' && isLoggedIn.value) {
    scheduleIdleTask('tab:profile', () => scheduleUserSpaceWarmup(), { timeout: 2400, fallbackDelay: 420 });
  }
};

const resolveAccessibleTab = (tabId) => {
  return validTabs.includes(tabId) ? tabId : 'posts';
};

const syncUserSpaceTabRoute = (tabId) => {
  const nextQuery = { ...route.query, tab: tabId };
  if (tabId !== 'profile') {
    delete nextQuery.view;
    delete nextQuery.setting;
  }
  if (tabId !== 'messages') {
    delete nextQuery.section;
    delete nextQuery.to;
  } else {
    delete nextQuery.to;
    nextQuery.section = 'notifications';
  }

  const currentRouteTab = String(route.query.tab || '');
  const currentSection = String(route.query.section || '');
  const nextSection = String(nextQuery.section || '');
  if (currentRouteTab === tabId && currentSection === nextSection) return;

  router.replace({ path: '/user-space', query: nextQuery });
};

const handleBottomNavClick = (tabId) => {
  if (tabId === 'ai') {
    openGlobalAi();
    return;
  }
  closeGlobalAi();
  switchTab(tabId);
};

const switchTab = (tabId) => {
  const nextTab = resolveAccessibleTab(tabId, { promptLogin: true });
  if (nextTab !== tabId) return;
  if (currentTab.value === tabId) return;
  updateTabTransitionDirection(tabId);
  ensureTabMounted(tabId);
  const previousTab = currentTab.value;
  saveTabScrollPosition(previousTab);
  if (tabId === 'profile') {
    if (currentTab.value !== 'profile') {
      profileSection.value = 'home';
    }
    runProfileCriticalFetches();
  }
  if (clearLeavingTabTimer) {
    clearTimeout(clearLeavingTabTimer);
  }
  leavingTab.value = previousTab;
  currentTab.value = tabId;
  syncUserSpaceTabRoute(tabId);
  void restoreTabScrollPosition(tabId);
  clearLeavingTabTimer = setTimeout(() => {
    if (leavingTab.value === previousTab) {
      leavingTab.value = null;
    }
    clearLeavingTabTimer = null;
  }, TAB_LEAVE_CLEAR_DELAY_MS);
  if (tabId === 'posts') {
    void preloadForumComponent();
    void refreshForumAfterThemeChange();
    void activateForumTab();
  }
  if (tabId === 'ai') {
    void preloadBOHAIComponent();
  }
};

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=community`);
};

const handleLogout = () => {
  authStore.logout();
  router.push('/');
};

const toggleHideOnlineStatus = async () => {
  const { success } = await authStore.updateUserProfile({
    hide_online_status: !userInfo.value.hideOnlineStatus
  });
  if (!success) {
    showBottomNavIsland('更新失败，请重试');
  }
};

const toggleHideFollowData = async () => {
  const { success } = await authStore.updateUserProfile({
    hide_follow_data: !userInfo.value.hideFollowData
  });
  if (!success) {
    showBottomNavIsland('更新失败，请重试');
  }
};

const handleProfileBackgroundClick = () => {
  if (isUploadingProfileBackground.value) return;
  profileBackgroundInputRef.value?.click();
};

const cleanupCloudinaryProfileBackground = async (publicId, fallbackUrl = '') => {
  const safePublicId = String(publicId || extractCloudinaryPublicIdFromUrl(fallbackUrl)).trim();
  if (!safePublicId) return { ok: true };

  return deleteCloudinaryAssetsByPublicIds([safePublicId]);
};

const handleProfileBackgroundFileChange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!SUPPORTED_AVATAR_TYPES.has(file.type)) {
    showAlert('warning', '格式不支持', '请选择 JPG、PNG、WebP 或 GIF 图片');
    event.target.value = '';
    return;
  }

  if (file.size > PROFILE_BACKGROUND_MAX_FILE_SIZE_BYTES) {
    showAlert('warning', '图片过大', '请选择不超过 10MB 的图片');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    cropPurpose.value = 'profile-background';
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.onerror = () => {
    showAlert('error', '读取失败', '图片读取失败，请重新选择');
  };
  reader.readAsDataURL(file);

  event.target.value = '';
};

const uploadProfileBackgroundFile = async (file) => {
  const oldBackgroundUrl = profileBackgroundUrl.value;
  const oldBackgroundPublicId = profileBackgroundPublicId.value;
  let uploaded = null;
  isUploadingProfileBackground.value = true;

  try {
    uploaded = await uploadImageToCloudinary(file);
    const result = await authStore.updateUserProfile({
      profile_background_url: uploaded.url,
      profile_background_public_id: uploaded.publicId
    });

    if (!result.success) {
      throw new Error(result.message || '保存背景失败');
    }

    const oldPublicId = String(oldBackgroundPublicId || extractCloudinaryPublicIdFromUrl(oldBackgroundUrl)).trim();
    const newPublicId = String(uploaded.publicId || '').trim();
    if (oldPublicId && oldPublicId !== newPublicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(oldPublicId, oldBackgroundUrl);
      if (!cleanupResult.ok) {
        logger.warn('user-space', '清理旧个人卡片背景失败:', cleanupResult.error);
        showAlert('warning', '背景已更新', cleanupResult.error?.message || '旧背景图云端清理失败，请稍后重试');
        return true;
      }
    }

    showBottomNavIsland({
      title: '背景已更新',
      message: '个人卡片背景已更换',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 4200
    });
    return true;
  } catch (error) {
    logger.error('user-space', '个人卡片背景上传失败:', error);
    if (uploaded?.publicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(uploaded.publicId, uploaded.url);
      if (!cleanupResult.ok) {
        logger.warn('user-space', '清理未保存的新背景失败:', cleanupResult.error);
      }
    }
    showAlert('error', '上传失败', error.message || '背景上传过程出错');
    return false;
  } finally {
    isUploadingProfileBackground.value = false;
  }
};

const handleAvatarClick = () => {
  avatarInputRef.value?.click();
};

const handleAvatarFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!SUPPORTED_AVATAR_TYPES.has(file.type)) {
    showAlert('warning', '格式不支持', '请选择 JPG、PNG、WebP 或 GIF 图片');
    event.target.value = '';
    return;
  }

  if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
    showAlert('warning', '图片过大', '请选择不超过 12MB 的图片');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    cropPurpose.value = 'avatar';
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.onerror = () => {
    showAlert('error', '读取失败', '图片读取失败，请重新选择');
  };
  reader.readAsDataURL(file);

  event.target.value = '';
};

const handleCropConfirm = async (blob) => {
  isProcessingCrop.value = true;
  try {
    if (cropPurpose.value === 'profile-background') {
      const file = new File([blob], 'profile-background.png', { type: 'image/png' });
      const imageCompression = await loadImageCompression();
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1.2,
        maxWidthOrHeight: 1800,
        useWebWorker: true,
        fileType: 'image/webp'
      });

      const ok = await uploadProfileBackgroundFile(compressedFile);
      if (ok) {
        showCropModal.value = false;
      }
      return;
    }

    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const imageCompression = await loadImageCompression();

    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);

    await uploadToSupabase(compressedFile);
    showCropModal.value = false;
  } catch (error) {
    logger.error('user-space', '裁切处理失败:', error);
    showAlert('error', '处理失败', cropPurpose.value === 'profile-background' ? '背景裁切出错，请重试' : '头像裁切出错，请重试');
  } finally {
    isProcessingCrop.value = false;
  }
};

const uploadToSupabase = async (file) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showAlert('error', '上传失败', '请先登录');
      return;
    }

    const oldAvatarUrl = avatarUrl.value;

    const timestamp = Date.now();
    const filePath = `${user.id}/avatar_${timestamp}.png`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const finalUrl = `${publicUrl}?t=${timestamp}`;
    await updateProfileAvatar(user.id, finalUrl);

    if (oldAvatarUrl) {
      try {
        const urlObj = new URL(oldAvatarUrl);
        const pathParts = urlObj.pathname.split('/');
        const avatarsIndex = pathParts.indexOf('avatars');
        if (avatarsIndex !== -1) {
          const oldFilePath = pathParts.slice(avatarsIndex + 1).join('/');
          if (oldFilePath && oldFilePath !== filePath) {
            await supabase.storage.from('avatars').remove([oldFilePath]);
          }
        }
      } catch (e) {
        logger.warn('user-space', '清理旧头像失败 (非致命错误):', e);
      }
    }

    await authStore.updateUserProfile({ avatar_url: finalUrl });

    showBottomNavIsland({
      title: '头像已更新',
      message: '新的头像已经同步',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 4200
    });
  } catch (error) {
    logger.error('user-space', '上传到 Supabase 失败:', error);
    showAlert('error', '上传失败', error.message || '上传过程出错');
  }
};

const getGiftStatusLabel = (status) => {
  const statusMap = {
    preparing: '备货中',
    processing: '正在处理',
    shipped: '已发货',
    completed: '已完成'
  };
  return statusMap[status] || '进行中';
};

const getGiftProgressCacheKey = (userId) => `boh_gift_progress_cache_${userId}`;

const saveGiftProgressCache = (userId, value) => {
  if (!userId) return;
  try {
    const payload = {
      value: value || '',
      timestamp: Date.now()
    };
    localStorage.setItem(getGiftProgressCacheKey(userId), JSON.stringify(payload));
  } catch (error) {
    logger.warn('user-space', '写入礼物进度缓存失败:', error);
  }
};

const loadGiftProgressCache = (userId) => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(getGiftProgressCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > GIFT_PROGRESS_CACHE_TTL_MS) return null;
    return typeof parsed.value === 'string' ? parsed.value : '';
  } catch (error) {
    logger.warn('user-space', '读取礼物进度缓存失败:', error);
    return null;
  }
};

const fetchGiftProgressFromServer = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_gifts')
      .select('gift_status')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('gift_status', 'completed')
      .limit(1);

    if (error) throw error;

    const gift = Array.isArray(data) ? data[0] : null;
    return gift ? getGiftStatusLabel(gift.gift_status) : '';
  } catch (error) {
    logger.warn('user-space', '读取 user_gifts 礼物进度失败，尝试回退 profiles 字段:', error);
  }

  try {
    // H-1 修复：gift_content 是敏感字段已收窄，
    // gift_status 非敏感走 from('profiles')，gift_content 走 RPC（仅本人可读）。
    const isOwn = userId === authStore.userInfo?.id;
    const [pubRes, secRes] = await Promise.all([
      supabase.from('profiles').select('gift_status').eq('id', userId).single(),
      isOwn ? supabase.rpc('get_my_sensitive_profile') : Promise.resolve({ data: null, error: null })
    ]);

    if (pubRes.error) throw pubRes.error;
    const giftContent = secRes.data?.gift_content || null;
    return Boolean(giftContent) && pubRes.data?.gift_status !== 'completed'
      ? getGiftStatusLabel(pubRes.data?.gift_status)
      : '';
  } catch (error) {
    logger.warn('user-space', '读取 profiles 回退礼物进度失败:', error);
    return '';
  }
};

const refreshPendingGift = async ({ force = false } = {}) => {
  const userId = userInfo.value?.id;
  if (!isLoggedIn.value || !userId) {
    giftProgressText.value = '';
    return;
  }

  if (!force) {
    const cached = loadGiftProgressCache(userId);
    if (cached !== null) {
      giftProgressText.value = cached;
      return;
    }
  }

  if (giftProgressInflight) {
    await giftProgressInflight;
    return;
  }

  giftProgressInflight = (async () => {
    const latest = await fetchGiftProgressFromServer(userId);
    giftProgressText.value = latest;
    saveGiftProgressCache(userId, latest);
    lastGiftProgressRefreshAt = Date.now();
  })();

  try {
    await giftProgressInflight;
  } finally {
    giftProgressInflight = null;
  }
};

const initUserData = async () => {
  if (isLoggedIn.value && userInfo.value.id) {
    await authStore.updateLocalState({
      id: userInfo.value.id,
      email: userInfo.value.email,
      user_metadata: { username: userInfo.value.username }
    });
  }
};

const clearUserSpaceWarmup = () => {
  if (userSpaceWarmupTimeoutId !== null && typeof window !== 'undefined') {
    window.clearTimeout(userSpaceWarmupTimeoutId);
    userSpaceWarmupTimeoutId = null;
  }
};

const runProfileCriticalFetches = ({ force = false } = {}) => {
  void refreshPendingGift({ force });
  void fetchUserStats({ force });
  void fetchCloudPlusUsage({ force });
  void fetchProfileContent({ force, reset: force });
  void fetchProfileImpressions({ force });
};

const scheduleUserSpaceWarmup = ({ force = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value.id || typeof window === 'undefined') return;
  clearUserSpaceWarmup();
  userSpaceWarmupTimeoutId = window.setTimeout(() => {
    userSpaceWarmupTimeoutId = null;
    if (!isLoggedIn.value || !userInfo.value.id) return;
    void refreshPendingGift({ force });
    void fetchUserStats({ force });
    if (currentTab.value === 'profile') {
      void fetchCloudPlusUsage({ force });
    }
  }, currentTab.value === 'profile' ? 120 : 900);
};

// ✅ 性能优化：合并分散的 watch 为单个 watch，减少 Vue 内部开销
watch(
  () => ({
    userId: userInfo.value.id,
    isReady: isInitialized.value,
    points: userInfo.value.points,
    birthMonth: editProfileForm.birthMonth,
    joinYear: editProfileForm.joinYear,
    joinMonth: editProfileForm.joinMonth
  }),
  async (newVal, oldVal) => {
    const { userId, isReady, points, birthMonth, joinYear, joinMonth } = newVal;

    // 处理用户 ID 变化
    if (userId !== oldVal?.userId) {
      if (userId) {
        await initUserData();
        if (currentTab.value === 'profile') {
          runProfileCriticalFetches({ force: true });
        } else {
          scheduleUserSpaceWarmup({ force: true });
        }
        if (currentTab.value === 'profile' && profileSection.value === 'settings') {
          void fetchPushplusStatus({ force: true });
          void fetchCloudPlusUsage({ force: true });
        }
      } else {
        clearUserSpaceWarmup();
        latestUserStatsFetchToken += 1;
        dataState.stats.loading = false;
        resetUserStats();
        giftProgressText.value = '';
        pushplusStatus.loaded = false;
        pushplusStatus.hasToken = false;
        pushplusStatus.enabled = false;
        cloudPlusUsage.loaded = false;
        cloudPlusUsage.used = 0;
        cloudPlusUsage.limit = DEFAULT_CLOUD_IMAGE_LIMIT;
        latestProfileContentFetchToken += 1;
        dataState.profile.loading = false;
        profilePosts.value = [];
      }
    }

    // 处理初始化完成
    if (isReady && !oldVal?.isReady) {
      void maybeShowBottomNavOnboardingNotice();
      if (isLoggedIn.value && userId) {
        void fetchUserStats();
      }
    }

    // 处理积分变化
    if (points !== oldVal?.points && isLoggedIn.value) {
      userStats.points = normalizeStatInt(points, userStats.points);
    }

    // 处理编辑表单变化
    if (birthMonth !== oldVal?.birthMonth) {
      normalizeEditProfileBirthdayDay();
    }
    if (joinYear !== oldVal?.joinYear || joinMonth !== oldVal?.joinMonth) {
      normalizeEditJoinDay();
    }
  },
  { immediate: true }
);

onMounted(() => {
  setUserSpaceMountedForPreload(true);
  document.body.classList.add("is-loaded");
  // 初始化主题
  const initialTheme = themeManager.getTheme();
  userSpacePageEl = document.querySelector('.user-space-page');
  if (userSpacePageEl) {
    userSpacePageEl.setAttribute('data-theme', initialTheme);
  }
  currentTheme.value = initialTheme;
  currentThemePreference.value = themeManager.getPreference?.() || initialTheme;
  if (route.query.tab && validTabs.includes(route.query.tab)) {
    currentTab.value = resolveAccessibleTab(route.query.tab, { promptLogin: true });
  }
  resolveProfileSectionFromRoute();
  void openSettingsPanelFromRoute();
  ensureTabMounted(currentTab.value);
  // 确保 URL 与当前 tab 同步，否则论坛嵌入式组件的 FAB 按钮检查 route.query.tab 会失败
  if (!route.query.tab || !validTabs.includes(route.query.tab)) {
    syncUserSpaceTabRoute(currentTab.value);
  }
  if (currentTab.value === 'posts') {
    scheduleForumPreload(currentTab.value);
  }
  void restoreTabScrollPosition(currentTab.value);
  if (isLoggedIn.value) {
    void initUserData();
    if (currentTab.value === 'profile') {
      runProfileCriticalFetches();
    } else {
      scheduleUserSpaceWarmup();
    }
    if (currentTab.value === 'profile' && profileSection.value === 'settings') {
      void fetchPushplusStatus();
      void fetchCloudPlusUsage();
    }
  }
  void maybeShowBottomNavOnboardingNotice();
  void refreshUnreadCount();
  window.addEventListener('boh_unread_refresh', handleUnreadRefresh);
  window.addEventListener('boh_userspace_nav_island', handleBottomNavIslandEvent);
  // ✨ 新增：监听全局灵动岛事件（跨组件通信）
  window.addEventListener('boh_island_message', handleGlobalIslandMessage);
  // 添加主题变化监听
  themeManager.addListener(handleThemeChange);
});

watch(() => route.query.tab, (newTab) => {
  // 当 tab 参数为空或不有效时，切换到默认标签（profile）
  const safeTab = validTabs.includes(newTab) ? newTab : 'profile';
  const nextTab = resolveAccessibleTab(safeTab, { promptLogin: true });
  if (currentTab.value === nextTab) return;
  updateTabTransitionDirection(nextTab);
  ensureTabMounted(nextTab);
  const previousTab = currentTab.value;
  saveTabScrollPosition(previousTab);
  if (clearLeavingTabTimer) {
    clearTimeout(clearLeavingTabTimer);
  }
  leavingTab.value = previousTab;
  currentTab.value = nextTab;
  void restoreTabScrollPosition(nextTab);
  clearLeavingTabTimer = setTimeout(() => {
    if (leavingTab.value === previousTab) {
      leavingTab.value = null;
    }
    clearLeavingTabTimer = null;
  }, 170);
  resolveProfileSectionFromRoute();
  if (nextTab === 'posts') {
    scheduleForumPreload(currentTab.value);
    void refreshForumAfterThemeChange();
    void activateForumTab();
  }
  if (nextTab === 'profile') {
    runProfileCriticalFetches();
    void openSettingsPanelFromRoute();
  }
});

watch(() => route.query.view, () => {
  resolveProfileSectionFromRoute();
  void openSettingsPanelFromRoute();
});

watch(() => route.query.setting, () => {
  void openSettingsPanelFromRoute();
});

watch(currentTab, (newTab, oldTab) => {
  if (newTab !== 'profile' || oldTab !== 'profile') {
    profileSection.value = 'home';
  }
  resolveProfileSectionFromRoute();
  if (oldTab === 'profile') {
    scheduleUserSpaceWarmup();
  }
});

onUnmounted(() => {
  saveTabScrollPosition(currentTab.value);
  setUserSpaceMountedForPreload(false);
  // ✅ 性能优化：取消所有未完成的请求
  cleanupAbortControllers();
  latestUserStatsFetchToken += 1;
  clearScheduledForumPreload();
  clearIdlePreloadTasks();
  clearUserSpaceWarmup();
  disposeBottomNavIsland();
  userSpaceMemoryCache.clear();
  // ✨ 新增：移除全局灵动岛事件监听
  window.removeEventListener('boh_island_message', handleGlobalIslandMessage);
  if (userStatsRetryTimerId) {
    clearTimeout(userStatsRetryTimerId);
    userStatsRetryTimerId = null;
  }
  window.removeEventListener('boh_unread_refresh', handleUnreadRefresh);
  window.removeEventListener('boh_userspace_nav_island', handleBottomNavIslandEvent);
  if (clearLeavingTabTimer) {
    clearTimeout(clearLeavingTabTimer);
    clearLeavingTabTimer = null;
  }
  // 移除主题变化监听
  themeManager.removeListener(handleThemeChange);
});

const handleUnreadRefresh = (event) => {
  const detail = event?.detail || {};
  void (async () => {
    await refreshUnreadCount();
    await showUnreadBottomNavIsland(detail);
  })();
  if (Date.now() - lastGiftProgressRefreshAt >= GIFT_PROGRESS_MIN_REFRESH_INTERVAL_MS) {
    refreshPendingGift({ force: true });
  }
};
</script>

<style src="./styles/shell-community.css"></style>
<style src="./styles/profile-base.css"></style>
<style src="./styles/profile-panels.css"></style>
<style src="./styles/responsive-integrations.css"></style>

<style scoped>
.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

/* 边缘滑动提示线 */
.edge-swipe-indicator {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg,
      rgba(16, 163, 127, 0.1) 0%,
      rgba(16, 163, 127, 0.3) 20%,
      rgba(16, 163, 127, 0.5) 50%,
      rgba(16, 163, 127, 0.3) 80%,
      rgba(16, 163, 127, 0.1) 100%);
  z-index: 2147481600;
  pointer-events: none;
  animation: edgeIndicatorPulse 1.2s ease-in-out infinite;
}

@keyframes edgeIndicatorPulse {

  0%,
  100% {
    opacity: 0.6;
    width: 2px;
  }

  50% {
    opacity: 1;
    width: 3px;
  }
}

/* 暗色主题下的提示线 */
.user-space-page[data-theme="dark"] .edge-swipe-indicator {
  background: linear-gradient(180deg,
      rgba(80, 200, 255, 0.1) 0%,
      rgba(80, 200, 255, 0.3) 20%,
      rgba(80, 200, 255, 0.5) 50%,
      rgba(80, 200, 255, 0.3) 80%,
      rgba(80, 200, 255, 0.1) 100%);
}
</style>

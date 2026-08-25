<template>
  <div class="user-space-page" :class="{
    'tab-transition-forward': tabTransitionDirection === 'forward',
    'tab-transition-back': tabTransitionDirection === 'back',
    'edge-swipe-active': isEdgeSwiping,
    'community-tab-active': currentTab === 'community' || leavingTab === 'community'
  }" :data-theme="currentTheme">

    <!-- 边缘滑动提示线 -->
    <div v-if="edgeIndicatorVisible" class="edge-swipe-indicator"></div>

    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">
    <input type="file" ref="profileBackgroundInputRef" class="hidden-file-input" accept="image/*"
      @change="handleProfileBackgroundFileChange">
    <input type="file" ref="pointsCardInputRef" class="hidden-file-input" accept="image/jpeg,image/png,image/webp"
      @change="handlePointsCardFileChange">

    <div v-show="currentTab === 'posts' || leavingTab === 'posts'"
      :ref="(el) => setTabPageRef('posts', el)" class="tab-page posts-tab"
      :class="{ 'is-leaving': leavingTab === 'posts' }">
      <KeepAlive>
        <AsyncForum v-if="currentTab === 'posts' || leavingTab === 'posts'" ref="forumViewRef"
          :show-navbar="false" :show-header="false" :embedded="true"
          @island-message="showTopNavStatus" />
      </KeepAlive>
    </div>

    <div v-if="currentTab === 'community' || leavingTab === 'community'"
      :ref="(el) => setTabPageRef('community', el)" class="tab-page community-tab"
      :class="{ 'is-leaving': leavingTab === 'community' }">
      <AsyncCommunity @switch-tab="switchTab" @open-follow-modal="openUserFollowModal" />
    </div>

    <div v-if="currentTab === 'shows' || leavingTab === 'shows'"
      :ref="(el) => setTabPageRef('shows', el)" class="tab-page shows-tab"
      :class="{ 'is-leaving': leavingTab === 'shows' }">
      <AsyncShows :embedded="true" />
    </div>

    <div v-if="currentTab === 'ai' || leavingTab === 'ai'"
      :ref="(el) => setTabPageRef('ai', el)" class="tab-page ai-tab" :class="{ 'is-leaving': leavingTab === 'ai' }">
      <section class="ai-workspace" aria-label="BOH AI 聊天">
        <AsyncBOHAI :embedded="true" @island-message="showTopNavStatus" />
      </section>
    </div>

    <div v-if="currentTab === 'messages' || leavingTab === 'messages'"
      :ref="(el) => setTabPageRef('messages', el)" class="tab-page messages-tab"
      :class="{ 'is-leaving': leavingTab === 'messages' }">
      <HomeCatMascot v-if="isHomeCatActive" class="messages-tab-cat" pool="background" seed="messages-tab" size="lg"
        decorative />
      <AsyncMessages :minimal="true" />
    </div>

    <div v-if="currentTab === 'profile' || leavingTab === 'profile'"
      :ref="(el) => setTabPageRef('profile', el)" class="tab-page profile-tab"
      :class="{ 'profile-home-active': profileSection === 'home', 'is-leaving': leavingTab === 'profile' }">
      <div class="profile-page-content"
        :class="{ 'assets-active': profileSection === 'assets' }">
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
              :beta5="isBeta5"
              :stats="userStats" :is-stats-loading="dataState.stats.loading" :cloud-plus-usage-text="cloudPlusUsageText"
              :cloud-plus-usage-meter-style="cloudPlusUsageMeterStyle"
              :subscription-summary-text="subscriptionSummaryText"
              :is-content-loading="dataState.profile.loading"
              :posts="profilePosts" :has-more-posts="hasMoreProfilePosts" :is-loading-more="isLoadingMoreProfilePosts"
              @edit-profile="openEditProfileModal" @settings="openProfileSettings" @avatar-click="handleAvatarClick"
              @background-click="handleProfileBackgroundClick"
              @view-impressions="openProfileImpressions" @sponsor="openSponsorPage"
              @data-management="openProfileDataManagement" @cloud-plus="openCloudPlusArea"
              @assets="openAssetsHub"
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
              @open-version-settings="router.push('/user-space/settings/version')"
              @open-data="openProfileDataManagement" @open-data-management="openProfileDataManagement"
              @open-data-export="openProfileDataExport"
              @logout="handleLogout" @toggle-hide-online="toggleHideOnlineStatus"
              @toggle-hide-follow-data="toggleHideFollowData" />

            <ProfileImpressionsPanel v-else-if="profileSection === 'impressions'" key="profile-impressions"
              :is-impressions-loading="dataState.impressions.loading" :impressions="profileImpressions"
              @back="backToProfileHome" @delete-impression="handleDeleteProfileImpression" />

            <AssetsHubPanel v-else-if="profileSection === 'assets'" key="profile-assets"
              :initial-tab="assetsInitialTab" :beta5="isBeta5"
              :points-card-presets="pointsCardPresets" :is-points-card-presets-loading="isPointsCardPresetsLoading"
              :points-card-preset-capacity="pointsCardPresetQuota.capacity"
              :is-points-card-preset-quota-loading="isPointsCardPresetQuotaLoading"
              :points-card-cats-unlocked="isPointsCardCatsUnlocked"
              :is-redeeming-points-card-cats="isRedeemingPointsCardCats"
              @back="backToProfileHome" @upload-points-card="handlePointsCardClick"
              @set-points-card-skin="setPointsCardSkin" @select-points-card-preset="selectPointsCardPreset"
              @delete-points-card-preset="deletePointsCardPreset"
              @redeem-points-card-cats="redeemPointsCardCats" @load-points-card-data="loadPointsCardData"
              @sponsor="openSponsorPage" />

            <!-- ✅ 性能优化：静态子页面使用 v-memo -->
            <DataExportPanel v-else-if="profileSection === 'data-export'" key="profile-data-export"
              v-memo="[profileSection]" @back="backToProfileSettings" />

            <DataPrivacyPanel v-else key="profile-data-management" v-memo="[profileSection, isAdmin]"
              :is-admin="isAdmin" @back="backToProfileSettings"
              @navigate="handleDataPrivacyNavigate" />
          </transition>
        </template>
      </div>
    </div>

    <UserSpaceBottomNav :visible="!(currentTab === 'profile' && profileSection === 'edit-profile')"
      :hidden="isBottomNavHidden" :ai-overlay-open="isAiOverlayOpen"
      :nav-items="navItems" :current-tab="currentTab" :nav-indicator-style="bottomNavIndicatorStyle"
      :has-unread-messages="hasUnreadMessages" :unread-count="unreadCount"
      @preload-tab="preloadUserSpaceTab" @nav-click="handleBottomNavClick" />

    <ThemeModal :open="showThemeModal" :current-theme-preference="currentThemePreference" @close="closeThemeModal"
      @select="setThemePreference" />

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />

    <AvatarCropModal v-if="showCropModal" v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop"
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
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay';
import { useAppMode } from '@/composables/useAppMode.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { useEdgeSwipeGesture } from '@/composables/useEdgeSwipeGesture';
import { useDebounce } from '@/composables/useDebounceThrottle';
import UserSpaceBottomNav from './components/UserSpaceBottomNav.vue';
const ProfileHomePanel = defineAsyncComponent(() => import('./components/ProfileHomePanel.vue'));
const AvatarCropModal = defineAsyncComponent(() => import('@/components/AvatarCropModal.vue'));
const ProfileImpressionsPanel = defineAsyncComponent(() => import('./components/ProfileImpressionsPanel.vue'));
const ProfileSettingsPanel = defineAsyncComponent(() => import('./components/ProfileSettingsPanel.vue'));
const EditProfilePanel = defineAsyncComponent(() => import('./components/EditProfilePanel.vue'));
const SponsorPanel = defineAsyncComponent(() => import('./components/SponsorPanel.vue'));
const DataPrivacyPanel = defineAsyncComponent(() => import('./components/DataPrivacyPanel.vue'));
const DataExportPanel = defineAsyncComponent(() => import('./components/DataExportPanel.vue'));
const AssetsHubPanel = defineAsyncComponent(() => import('./components/AssetsHubPanel.vue'));
import ThemeModal from './components/ThemeModal.vue';
import { showGlobalNavStatus } from '@/composables/useGlobalNavStatus.js';
import { createMemoryTtlCache } from './composables/useMemoryTtlCache.js';
import { useScrollDirectionHide } from './composables/useScrollDirectionHide.js';
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
  preloadProfileStyles,
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
import { getMyUserSpaceSummary } from '@/utils/api/user-space-api.js';
import { logger } from '@/utils/logger.js';
import { listMyCloudEntries } from '@/utils/api/boh-cloud-api.js';
import {
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  deleteCloudinaryAssetsByPublicIds,
  extractCloudinaryPublicIdFromUrl,
  getCloudinaryDisplayUrl,
  markCloudinaryUploadsClaimed,
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
const dialog = useConfirmDialog();
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
const assetsInitialTab = ref('');
const TAB_LEAVE_CLEAR_DELAY_MS = 170;
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
const forumViewRef = ref(null);
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
const { isBeta5 } = useAppMode();
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
const initialUserSpaceTab = validTabs.includes(String(route.query.tab || ''))
  ? String(route.query.tab)
  : 'posts';
if (initialUserSpaceTab === 'profile') {
  void preloadProfileStyles();
}
const validProfileSections = ['home', 'edit-profile', 'impressions', 'sponsor', 'settings', 'data-management', 'data-export', 'assets'];
const tabTransitionDirection = ref('forward');
const leavingTab = ref(null);
const {
  currentTab,
  profileSection,
  navIndicatorStyle,
  ensureTabMounted
} = useUserSpaceTabs(navItems, initialUserSpaceTab);

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
const pointsCardInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const cropPurpose = ref('avatar');
const isProcessingCrop = ref(false);
const isUploadingProfileBackground = ref(false);
const isUploadingPointsCard = ref(false);
const isRedeemingPointsCardCats = ref(false);
const isPointsCardCatsUnlocked = ref(false);
const pointsCardPresets = ref([]);
const isPointsCardPresetsLoading = ref(false);
const pointsCardPresetQuota = ref({ capacity: 3, currentCount: 0, tierCode: 'free', canAdd: true });
const isPointsCardPresetQuotaLoading = ref(false);
const BACKGROUND_CROP_ASPECT_RATIO = 3;
const cropModalAspectRatio = computed(() => cropPurpose.value === 'profile-background'
  ? BACKGROUND_CROP_ASPECT_RATIO
  : (cropPurpose.value === 'points-card' ? null : 1));
const cropModalShape = computed(() => ['profile-background', 'points-card'].includes(cropPurpose.value) ? 'rectangle' : 'circle');
const cropModalTitle = computed(() => cropPurpose.value === 'profile-background'
  ? '裁切背景'
  : (cropPurpose.value === 'points-card' ? '裁切积分卡面' : '裁切头像'));
const cropModalHint = computed(() => cropPurpose.value === 'profile-background'
  ? '拖动图片来选择个人卡片背景的显示范围'
  : (cropPurpose.value === 'points-card' ? '拖动图片，并按需调整裁切框的宽高和显示范围' : '拖动以调整位置，缩放以改变大小'));
const cropModalSubHint = computed(() => cropPurpose.value === 'profile-background'
  ? '裁切后的横幅会作为个人卡片背景'
  : (cropPurpose.value === 'points-card' ? '积分卡会自动适配你的自定义卡面' : '裁切后的效果将作为您的新头像'));

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
  const shouldShowGlobalLoading = reset || profilePosts.value.length === 0;
  if (shouldShowGlobalLoading) {
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

  if (await fetchAggregatedUserSpaceSummary({ force })) return;

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
  if (currentThemePreference.value === 'anniversary-mc') {
    return '八周年 MC 限定';
  }
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
let userSpaceSummaryInflight = null;
let summaryRpcUnavailable = false;

const applyUserSpaceSummary = (summary = {}) => {
  userStats.posts = normalizeStatInt(summary.posts, userStats.posts);
  userStats.points = normalizeStatInt(summary.points, userStats.points);
  userStats.rank = normalizeStatInt(summary.rank, userStats.rank);
  userStats.followers = normalizeStatInt(summary.followers, userStats.followers);
  userStats.following = normalizeStatInt(summary.following, userStats.following);
  cloudPlusUsage.used = normalizeStatInt(summary.cloud_image_used, cloudPlusUsage.used);
  cloudPlusUsage.limit = Math.max(
    DEFAULT_CLOUD_IMAGE_LIMIT,
    normalizeStatInt(summary.cloud_image_limit, cloudPlusUsage.limit)
  );
  cloudPlusUsage.loaded = true;
  dataState.stats.loading = false;
  dataState.cloud.loading = false;
  dataState.stats.error = null;
  dataState.cloud.error = null;
};

const fetchAggregatedUserSpaceSummary = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId || summaryRpcUnavailable) return false;
  const cacheKey = `summary:${userId}`;
  if (!force) {
    const cached = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.stats);
    if (cached) {
      applyUserSpaceSummary(cached);
      return true;
    }
  }

  if (!userSpaceSummaryInflight) {
    dataState.stats.loading = true;
    dataState.cloud.loading = true;
    userSpaceSummaryInflight = getMyUserSpaceSummary()
      .then((result) => {
        if (result.unsupported) summaryRpcUnavailable = true;
        if (!result.ok || !result.data) return false;
        setUserSpaceCache(cacheKey, result.data);
        applyUserSpaceSummary(result.data);
        const now = Date.now();
        lastFetchTime.stats = now;
        lastFetchTime.cloudUsage = now;
        return true;
      })
      .catch((error) => {
        logger.warn('user-space', '聚合摘要加载失败，回退旧查询:', error);
        return false;
      })
      .finally(() => {
        userSpaceSummaryInflight = null;
      });
  }

  const loaded = await userSpaceSummaryInflight;
  if (!loaded) {
    dataState.stats.loading = false;
    dataState.cloud.loading = false;
  }
  return loaded;
};
const subscriptionSummaryText = computed(() => {
  if (dataState.cloud.loading) return '正在同步权益';
  if (!cloudPlusUsage.loaded) return '查看积分与额度';
  if (Number(cloudPlusUsage.limit || 0) > DEFAULT_CLOUD_IMAGE_LIMIT) {
    return `Cloud 额度 ${cloudPlusUsage.limit}`;
  }
  return '基础权益';
});
let latestUnreadNavStatusAt = 0;
let hasScheduledGlobalNavOnboardingNotice = false;
const GLOBAL_NAV_ONBOARDING_NOTICE_VERSION = 'v2';

const showTopNavStatus = (payload = {}) => {
  const actionTab = String(payload.actionTab || '').trim();
  return showGlobalNavStatus({
    ...payload,
    onAction: actionTab && validTabs.includes(actionTab)
      ? () => switchTab(actionTab)
      : undefined
  });
};

const isBottomNavForceVisible = computed(() => (
  !isBeta5.value ||
  isAiOverlayOpen.value ||
  (currentTab.value === 'profile' && profileSection.value === 'edit-profile')
));
const { hidden: isBottomNavHidden, reset: resetBottomNavAutoHide } = useScrollDirectionHide({
  enabled: isBeta5,
  forceVisible: isBottomNavForceVisible
});

const getGlobalNavOnboardingNoticeKey = () => {
  const userId = String(userInfo.value?.id || 'guest').trim() || 'guest';
  return `boh-global-nav-onboarding-${GLOBAL_NAV_ONBOARDING_NOTICE_VERSION}-${userId}`;
};

const hasSeenGlobalNavOnboardingNotice = () => {
  try {
    return localStorage.getItem(getGlobalNavOnboardingNoticeKey()) === '1';
  } catch (error) {
    logger.warn('user-space', '读取顶部导航栏状态引导失败:', error);
    return false;
  }
};

const markGlobalNavOnboardingNoticeSeen = () => {
  try {
    localStorage.setItem(getGlobalNavOnboardingNoticeKey(), '1');
  } catch (error) {
    logger.warn('user-space', '写入顶部导航栏状态引导失败:', error);
  }
};

const maybeShowGlobalNavOnboardingNotice = async () => {
  if (hasScheduledGlobalNavOnboardingNotice) return;
  if (!isInitialized.value) return;
  if (hasSeenGlobalNavOnboardingNotice()) return;

  hasScheduledGlobalNavOnboardingNotice = true;
  await nextTick();

  showTopNavStatus({
    title: '顶部动态导航已启用',
    message: '重要状态会在这里显示',
    icon: 'notification',
    type: 'notification',
    durationMs: 5600,
  });
  markGlobalNavOnboardingNoticeSeen();
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

const showUnreadTopNavStatus = async (detail = {}) => {
  if (!isLoggedIn.value) return;
  if (String(detail.source || '') !== 'realtime') return;
  const now = Date.now();
  if (now - latestUnreadNavStatusAt < 900) return;
  latestUnreadNavStatusAt = now;

  showTopNavStatus(buildUnreadIslandMessage(detail));
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
  if (!userId) return;

  if (await fetchAggregatedUserSpaceSummary({ force })) return;
  if (dataState.cloud.loading) return;

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
  // 同步更新页面的 data-theme 属性
  if (userSpacePageEl) {
    userSpacePageEl.setAttribute('data-theme', theme);
  }
};

const openThemeModal = () => {
  showThemeModal.value = true;
};

const closeThemeModal = () => {
  showThemeModal.value = false;
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

const openAssetsHub = (initialTab = '') => {
  const betaTabs = ['overview', 'cards', 'points', 'subscription', 'fulfillment', 'addresses'];
  const stableTabs = ['overview', 'points', 'subscription', 'orders', 'gifts', 'addresses'];
  let nextTab = String(initialTab);
  if (isBeta5.value && ['orders', 'gifts'].includes(nextTab)) nextTab = 'fulfillment';
  assetsInitialTab.value = (isBeta5.value ? betaTabs : stableTabs).includes(nextTab) ? nextTab : '';
  profileSection.value = 'assets';
  setProfileSectionRoute('assets');
};

const backToProfileHome = () => {
  profileSection.value = 'home';
  setProfileSectionRoute('home');
  assetsInitialTab.value = '';
};

const openProfileDataManagement = () => {
  profileSection.value = 'data-management';
  setProfileSectionRoute('data-management');
};

const openProfileDataExport = () => {
  profileSection.value = 'data-export';
  setProfileSectionRoute('data-export');
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
    showTopNavStatus({
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
  } else if (safeTab === 'messages' && isLoggedIn.value) {
    scheduleIdleTask('tab:messages', () => void preloadMessagesComponent());
  } else if (safeTab === 'shows') {
    scheduleIdleTask('tab:shows', () => void preloadShowsComponent());
  } else if (safeTab === 'ai') {
    scheduleIdleTask('tab:ai', () => void preloadBOHAIComponent());
  } else if (safeTab === 'community') {
    scheduleIdleTask('tab:community', () => void preloadCommunityComponent(), { timeout: 2400, fallbackDelay: 420 });
  } else if (safeTab === 'profile' && isLoggedIn.value) {
    scheduleIdleTask('tab:profile', () => {
      void preloadProfileStyles();
      scheduleUserSpaceWarmup();
    }, { timeout: 2400, fallbackDelay: 420 });
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
    const nextQuery = { ...route.query, assistant: 'quick' };
    void router.push({ path: '/user-space', query: nextQuery });
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
    void preloadProfileStyles();
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
    showTopNavStatus({ title: '更新失败，请重试', icon: 'warning' });
  }
};

const toggleHideFollowData = async () => {
  const { success } = await authStore.updateUserProfile({
    hide_follow_data: !userInfo.value.hideFollowData
  });
  if (!success) {
    showTopNavStatus({ title: '更新失败，请重试', icon: 'warning' });
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

    showTopNavStatus({
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

const handlePointsCardClick = () => {
  if (!isBeta5.value || isUploadingPointsCard.value) return;
  if (!isPointsCardPresetQuotaLoading.value && !pointsCardPresetQuota.value.canAdd) {
    showTopNavStatus({ title: '卡面已达上限', message: `当前会员最多保存 ${pointsCardPresetQuota.value.capacity} 张自定义卡面`, icon: 'warning', type: 'warning', durationMs: 3600 });
    return;
  }
  pointsCardInputRef.value?.click();
};

const handlePointsCardFileChange = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const supportedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
  if (!supportedTypes.has(file.type)) {
    showAlert('warning', '格式不支持', '请选择 JPG、PNG 或 WebP 图片');
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
    cropPurpose.value = 'points-card';
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.onerror = () => showAlert('error', '读取失败', '图片读取失败，请重新选择');
  reader.readAsDataURL(file);
  event.target.value = '';
};

const cleanupCloudinaryPointsCard = async (publicId, fallbackUrl = '') => {
  const safePublicId = String(publicId || extractCloudinaryPublicIdFromUrl(fallbackUrl)).trim();
  if (!safePublicId) return { ok: true };
  return deleteCloudinaryAssetsByPublicIds([safePublicId]);
};

const normalizePointsCardPreset = (preset = {}) => ({
  id: String(preset.id || '').trim(),
  imageUrl: String(preset.image_url || preset.imageUrl || '').trim(),
  imagePublicId: String(preset.image_public_id || preset.imagePublicId || '').trim(),
  createdAt: String(preset.created_at || preset.createdAt || ''),
  lastUsedAt: String(preset.last_used_at || preset.lastUsedAt || '')
});

const normalizePointsCardPresetQuota = (quota = {}) => ({
  capacity: Math.max(3, Number(quota.capacity || 3) || 3),
  currentCount: Math.max(0, Number(quota.current_count ?? quota.currentCount ?? 0) || 0),
  tierCode: String(quota.tier_code || quota.tierCode || 'free').trim().toLowerCase() || 'free',
  canAdd: Boolean(quota.can_add ?? quota.canAdd)
});

const loadPointsCardPresetQuota = async () => {
  if (!isBeta5.value || !userInfo.value?.id || isPointsCardPresetQuotaLoading.value) return pointsCardPresetQuota.value;
  isPointsCardPresetQuotaLoading.value = true;
  try {
    const { data, error } = await supabase.rpc('get_points_card_preset_quota');
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || '读取卡面容量失败');
    pointsCardPresetQuota.value = normalizePointsCardPresetQuota(data);
    return pointsCardPresetQuota.value;
  } catch (error) {
    logger.error('user-space', '加载积分卡面容量失败:', error);
    return pointsCardPresetQuota.value;
  } finally {
    isPointsCardPresetQuotaLoading.value = false;
  }
};

const loadPointsCardPresets = async () => {
  if (!isBeta5.value || !userInfo.value?.id || isPointsCardPresetsLoading.value) return;
  isPointsCardPresetsLoading.value = true;
  try {
    const { data, error } = await supabase
      .from('points_card_presets')
      .select('id, image_url, image_public_id, created_at, last_used_at')
      .eq('user_id', userInfo.value.id)
      .eq('purge_state', 'active')
      .order('created_at', { ascending: false });
    if (error) throw error;
    pointsCardPresets.value = (data || [])
      .map(normalizePointsCardPreset)
      .filter((preset) => preset.id && preset.imageUrl);
  } catch (error) {
    logger.error('user-space', '加载积分卡面预设失败:', error);
    pointsCardPresets.value = [];
  } finally {
    isPointsCardPresetsLoading.value = false;
  }
};

const loadPointsCardCatsUnlock = async () => {
  if (!isBeta5.value || !userInfo.value?.id) return;
  try {
    const { data, error } = await supabase
      .from('points_card_cats_unlocks')
      .select('user_id')
      .eq('user_id', userInfo.value.id)
      .maybeSingle();
    if (error) throw error;
    isPointsCardCatsUnlocked.value = Boolean(data?.user_id);
  } catch (error) {
    logger.error('user-space', '加载小猫卡面兑换状态失败:', error);
    isPointsCardCatsUnlocked.value = false;
  }
};

const loadPointsCardData = () => {
  void loadPointsCardPresets();
  void loadPointsCardPresetQuota();
  void loadPointsCardCatsUnlock();
};

const uploadPointsCardFile = async (file) => {
  let uploaded = null;
  let createdPreset = null;
  isUploadingPointsCard.value = true;
  try {
    const quota = await loadPointsCardPresetQuota();
    if (!quota.canAdd) {
      showTopNavStatus({ title: '卡面已达上限', message: `当前会员最多保存 ${quota.capacity} 张自定义卡面`, icon: 'warning', type: 'warning', durationMs: 3600 });
      return false;
    }

    uploaded = await uploadImageToCloudinary(file, { pendingSource: 'points-card', folder: 'boh-points-cards' });
    const { data, error } = await supabase.rpc('create_points_card_preset', {
      p_image_url: uploaded.url,
      p_image_public_id: uploaded.publicId || null
    });
    if (error) throw error;
    if (!data?.ok) {
      if (data?.message === 'PRESET_CAPACITY_REACHED') {
        await loadPointsCardPresetQuota();
      }
      throw new Error(data?.message === 'PRESET_CAPACITY_REACHED'
        ? `当前会员最多保存 ${pointsCardPresetQuota.value.capacity} 张自定义卡面`
        : (data?.message || '保存卡面失败'));
    }
    createdPreset = normalizePointsCardPreset(data.preset || {});

    const { data: useResult, error: useError } = await supabase.rpc('use_points_card_preset', { p_preset_id: createdPreset.id });
    if (useError) throw useError;
    if (!useResult?.ok) throw new Error(useResult?.message || '应用卡面失败');

    await markCloudinaryUploadsClaimed([uploaded.publicId]);
    await authStore.refreshCurrentUserProfile({ force: true });

    pointsCardPresets.value = [createdPreset, ...pointsCardPresets.value.filter((preset) => preset.id !== createdPreset.id)];
    await loadPointsCardPresetQuota();
    showTopNavStatus({ title: '卡面已添加', message: '已保存为自定义卡面预设', icon: 'success', type: 'success', durationMs: 3600 });
    return true;
  } catch (error) {
    logger.error('user-space', '积分卡面上传失败:', error);
    if (uploaded?.publicId) await cleanupCloudinaryPointsCard(uploaded.publicId, uploaded.url);
    if (createdPreset?.id) {
      await supabase.rpc('delete_points_card_preset', { p_preset_id: createdPreset.id });
    }
    showAlert('error', '上传失败', error.message || '卡面上传过程出错');
    return false;
  } finally {
    isUploadingPointsCard.value = false;
  }
};

const selectPointsCardPreset = async (presetId) => {
  if (!isBeta5.value) return;
  const preset = pointsCardPresets.value.find((item) => item.id === String(presetId || ''));
  if (!preset) return;
  const { data, error } = await supabase.rpc('use_points_card_preset', { p_preset_id: preset.id });
  if (error || !data?.ok) {
    showTopNavStatus({ title: '切换自定义卡面失败，请重试', icon: 'warning' });
    return;
  }
  await authStore.refreshCurrentUserProfile({ force: true });
  preset.lastUsedAt = new Date().toISOString();
  showTopNavStatus({ title: '卡面已应用', message: '已切换到所选自定义卡面', icon: 'success', type: 'success', durationMs: 2800 });
};

const setPointsCardSkin = async (skin) => {
  if (!isBeta5.value || !['blank', 'cats'].includes(String(skin))) return;
  if (skin === 'cats' && !isPointsCardCatsUnlocked.value) {
    await redeemPointsCardCats();
    return;
  }
  const result = await authStore.updateUserProfile({ points_card_skin: skin });
  if (!result.success) {
    showTopNavStatus({ title: '卡片皮肤更新失败，请重试', icon: 'warning' });
    return;
  }
  showTopNavStatus({ title: '皮肤已应用', message: skin === 'cats' ? '小猫卡面已启用' : '已切换为空白卡', icon: 'success', type: 'success', durationMs: 2800 });
};

const redeemPointsCardCats = async () => {
  if (!isBeta5.value || isRedeemingPointsCardCats.value) return;
  if (isPointsCardCatsUnlocked.value) {
    await setPointsCardSkin('cats');
    return;
  }

  let confirmed = false;
  try {
    confirmed = await dialog.confirm({
      title: '兑换全员小猫卡面',
      message: `将扣除 3 积分（当前 ${Math.max(0, Number(userInfo.value.points) || 0)} 积分）。兑换后会永久同步到你的账户，是否确认兑换？`,
      tone: 'default',
      confirmText: '确认兑换',
      cancelText: '暂不兑换'
    });
  } catch (error) {
    logger.warn('user-space', '积分卡兑换确认弹窗未打开:', error);
    showTopNavStatus({ title: '请先完成当前操作后再兑换卡面', icon: 'warning' });
    return;
  }
  if (!confirmed) return;

  isRedeemingPointsCardCats.value = true;
  try {
    const { data, error } = await supabase.rpc('redeem_points_card_cats');
    if (error) throw error;
    if (!data?.ok) {
      if (data?.message === 'INSUFFICIENT_POINTS') {
        showTopNavStatus({ title: '积分不足', message: `兑换全员小猫还需 ${Math.max(0, Number(data.required_points || 3) - Number(data.current_points || 0))} 积分`, icon: 'warning', type: 'warning', durationMs: 3600 });
        return;
      }
      throw new Error(data?.message || '兑换失败');
    }

    await authStore.refreshCurrentUserProfile({ force: true });
    userStats.points = Number(userInfo.value.points) || 0;
    isPointsCardCatsUnlocked.value = true;
    showTopNavStatus({
      title: data.already_unlocked ? '小猫卡面已启用' : '兑换成功',
      message: data.already_unlocked ? '全员小猫卡面已应用' : '已扣除 3 积分并同步到云端',
      icon: 'success',
      type: 'success',
      durationMs: 3600
    });
  } catch (error) {
    logger.error('user-space', '兑换全员小猫卡面失败:', error);
    showAlert('error', '兑换失败', error.message || '暂时无法兑换小猫卡面，请稍后重试');
  } finally {
    isRedeemingPointsCardCats.value = false;
  }
};

const deletePointsCardPreset = async (presetId) => {
  if (!isBeta5.value) return;
  const preset = pointsCardPresets.value.find((item) => item.id === String(presetId || ''));
  if (!preset) return;

  const { data, error } = await supabase.rpc('delete_points_card_preset', { p_preset_id: preset.id });
  if (error || !data?.ok) {
    logger.error('user-space', '删除积分卡面预设失败:', error || data?.message);
    showTopNavStatus({ title: '删除自定义卡面失败，请重试', icon: 'warning' });
    return;
  }
  await authStore.refreshCurrentUserProfile({ force: true });
  pointsCardPresets.value = pointsCardPresets.value.filter((item) => item.id !== preset.id);
  await loadPointsCardPresetQuota();

  const publicId = String(data?.image_public_id || preset.imagePublicId || extractCloudinaryPublicIdFromUrl(data?.image_url || preset.imageUrl)).trim();
  const imageUrl = String(data?.image_url || preset.imageUrl || '').trim();
  // The database has recorded ownership before removing the preset, so a
  // transient cleanup failure cannot block the user's delete action.
  void cleanupCloudinaryPointsCard(publicId, imageUrl).then((cleanupResult) => {
    if (!cleanupResult.ok) {
      logger.warn('user-space', '积分卡面已删除，但云端素材清理稍后重试:', cleanupResult.error);
    }
  });

  showTopNavStatus({
    title: data.was_current ? '当前卡面已删除' : '卡面预设已删除',
    message: data.was_current ? '已切换为空白卡' : '其余预设不受影响',
    icon: 'success',
    type: 'success',
    durationMs: 2800
  });
};

watch(
  [profileSection, isBeta5, isLoggedIn],
  ([, , loggedIn]) => {
    if (!loggedIn) {
      pointsCardPresets.value = [];
      pointsCardPresetQuota.value = { capacity: 3, currentCount: 0, tierCode: 'free', canAdd: true };
      isPointsCardCatsUnlocked.value = false;
    }
  },
  { immediate: true }
);

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

    if (cropPurpose.value === 'points-card') {
      const file = new File([blob], 'points-card.png', { type: 'image/png' });
      const imageCompression = await loadImageCompression();
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1.2,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/webp'
      });
      const ok = await uploadPointsCardFile(compressedFile);
      if (ok) showCropModal.value = false;
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
    const targetLabel = cropPurpose.value === 'profile-background'
      ? '背景'
      : (cropPurpose.value === 'points-card' ? '积分卡面' : '头像');
    showAlert('error', '处理失败', `${targetLabel}裁切出错，请重试`);
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

    showTopNavStatus({
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
  void fetchUserStats({ force });
  void fetchCloudPlusUsage({ force });
  void fetchProfileContent({ force, reset: force });
};

const scheduleUserSpaceWarmup = ({ force = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value.id || typeof window === 'undefined') return;
  clearUserSpaceWarmup();
  userSpaceWarmupTimeoutId = window.setTimeout(() => {
    userSpaceWarmupTimeoutId = null;
    if (!isLoggedIn.value || !userInfo.value.id) return;
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
      void maybeShowGlobalNavOnboardingNotice();
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
  void maybeShowGlobalNavOnboardingNotice();
  // 消息页自身会在加载列表后同步未读数，避免首屏并发重复读取 notifications。
  if (isLoggedIn.value && currentTab.value !== 'messages') {
    void refreshUnreadCount();
  }
  window.addEventListener('boh_unread_refresh', handleUnreadRefresh);
  // 添加主题变化监听
  themeManager.addListener(handleThemeChange);
});

watch(() => route.query.tab, (newTab) => {
  // 注意：本 watch 的兜底是 'profile'，但 onMounted 初始化路径 resolveAccessibleTab
  // 的兜底是 'posts'（见上方 resolveAccessibleTab 定义与 onMounted 调用）。
  // 二者不一致属已知历史遗留，待产品确认未登录/无 tab 时的默认页后统一。
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
    void activateForumTab();
  }
  if (nextTab === 'profile') {
    void preloadProfileStyles();
    runProfileCriticalFetches();
    void openSettingsPanelFromRoute();
  }
}, { flush: 'sync' });

watch(() => route.query.assistant, (mode) => {
  if (mode === 'quick') {
    openGlobalAi();
  } else if (isAiOverlayOpen.value) {
    closeGlobalAi();
  }
}, { immediate: true });

watch(isAiOverlayOpen, (open) => {
  if (open || route.query.assistant !== 'quick') return;
  const nextQuery = { ...route.query };
  delete nextQuery.assistant;
  void router.replace({ path: '/user-space', query: nextQuery });
});

watch(() => route.query.view, () => {
  resolveProfileSectionFromRoute();
  void openSettingsPanelFromRoute();
});

watch(() => route.query.setting, () => {
  void openSettingsPanelFromRoute();
});

watch(currentTab, (newTab, oldTab) => {
  resetBottomNavAutoHide();
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
  userSpaceMemoryCache.clear();
  if (userStatsRetryTimerId) {
    clearTimeout(userStatsRetryTimerId);
    userStatsRetryTimerId = null;
  }
  window.removeEventListener('boh_unread_refresh', handleUnreadRefresh);
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
    await showUnreadTopNavStatus(detail);
  })();
};
</script>

<style src="./styles/shell-community.css"></style>

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

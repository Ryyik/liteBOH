<template>
  <div
    ref="pageRootRef"
    class="user-space-page"
    :class="{
      'tab-transition-forward': tabTransitionDirection === 'forward',
      'tab-transition-back': tabTransitionDirection === 'back',
      'edge-swipe-active': isEdgeSwiping,
      'community-tab-active': currentTab === 'community' && !isForumFeedSection(communitySection),
    }"
    :data-theme="currentTheme"
  >
    <!-- 边缘滑动提示线 -->
    <transition name="edge-ind">
      <div v-if="edgeIndicatorVisible" class="edge-swipe-indicator"></div>
    </transition>

    <input
      type="file"
      ref="avatarInputRef"
      class="hidden-file-input"
      accept="image/*"
      @change="handleAvatarFileChange"
    />
    <input
      type="file"
      ref="profileBackgroundInputRef"
      class="hidden-file-input"
      accept="image/*"
      @change="handleProfileBackgroundFileChange"
    />
    <input
      type="file"
      ref="pointsCardInputRef"
      class="hidden-file-input"
      accept="image/jpeg,image/png,image/webp"
      @change="handlePointsCardFileChange"
    />

    <!-- 方块（论坛）：官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象
         分区壳 ForumSectionShell 与首页 `/` 的下滑直达共用同一份（2026-09-23 单源）。
         默认落点仍是「最新」，「官方」只在切到它时才挂载英雄区渲染层。 -->
    <div
      v-show="currentTab === 'community' || leavingTab === 'community'"
      :ref="(el) => setTabPageRef('community', el)"
      class="tab-page community-shell"
      :class="{ 'is-leaving': leavingTab === 'community' }"
    >
      <ForumSectionShell
        ref="communityShellRef"
        v-model:section="communitySection"
        @island-message="showTopNavStatus"
        @switch-tab="handleCommunitySwitchTab"
        @open-follow-modal="openUserFollowModal"
      >
        <template #official>
          <AsyncOfficialHeroStage />
        </template>
      </ForumSectionShell>
    </div>

    <!-- 我页：身份卡 + 三段（空间 / 资产 / 印象）（2026-10-01 plans/022 §4.2 收口）
         段控真源 = CONTENT_SECTION_ITEMS；「资产」与「印象」原先分别是底栏席位与论坛第 7 席，
         现在都下沉到这里 —— 用户报障「资产 tab 没有出现」的成因就是上一次只撤了底栏席位、
         没把下面这段补上（半成品中间态）。 -->
    <div
      v-show="currentTab === 'posts' || leavingTab === 'posts'"
      :ref="(el) => setTabPageRef('posts', el)"
      class="tab-page content-shell"
      :class="{ 'is-leaving': leavingTab === 'posts' }"
    >
      <SegmentTabs
        :sections="CONTENT_SECTION_ITEMS"
        v-model="contentSection"
        aria-label="我页分段"
      />
      <div
        v-show="contentSection === 'home'"
        class="profile-tab profile-home-active content-home-host"
      >
        <div class="profile-page-content">
          <div v-if="!isLoggedIn" class="login-prompt">
            <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
            <h3 class="login-prompt-title">登录以查看我的</h3>
            <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
            <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
          </div>
          <ProfileHomePanel
            v-else
            key="content-home"
            :profile="userInfo"
            :avatar-url="avatarUrl"
            :profile-background-url="profileBackgroundUrl"
            :profile-cover-style="profileCoverStyle"
            :is-uploading-profile-background="isUploadingProfileBackground"
            :stats="userStats"
            :is-stats-loading="dataState.stats.loading"
            :cloud-plus-usage-text="cloudPlusUsageText"
            :heatmap="activityHeatmap"
            :is-heatmap-loading="dataState.heatmap.loading"
            :cloud-plus-usage-meter-style="cloudPlusUsageMeterStyle"
            :subscription-summary-text="subscriptionSummaryText"
            :is-content-loading="dataState.profile.loading"
            :posts="profilePosts"
            :public-notes="publicCloudNotes"
            :has-more-posts="hasMoreProfilePosts"
            :is-loading-more="isLoadingMoreProfilePosts"
            @edit-profile="openEditProfileModal"
            @settings="openProfileSettings"
            @avatar-click="handleAvatarClick"
            @background-click="handleProfileBackgroundClick"
            @view-impressions="openProfileImpressions"
            @sponsor="openSponsorPage"
            @data-management="openProfileDataManagement"
            @cloud-plus="openCloudPlusArea"
            @assets="openAssetsHub"
            @photo-albums="openPhotoAlbums"
            @post-click="openProfilePost"
            @switch-tab="switchTab"
            @load-more="loadMoreProfilePosts"
            @note-open="openProfileCloudNote"
            @note-set-private="setProfileCloudNotePrivate"
            @note-delete="deleteProfileCloudNote"
          />
        </div>
      </div>

      <!-- 资产分段：AssetsHubPanel 原样 + 赞助
           「首次访问后保持挂载」由本段的 assetsSegmentVisited 闩锁提供，与其余分段的 v-show
           语义对齐：没访问过就不挂载（不为它提前付费），访问过一次就复用（切回零重建、零取数）。
           直接改成裸 v-show 是错的 —— 那会让 AssetsHubPanel 在进入 UserSpace 时就挂载并跑
           onMounted 取数（fetchUserTier / products / 抽奖 / 订阅）。
           内层档位（AssetsHubPanel ↔ SponsorPanel）保持原有 <transition out-in> + v-if 不变。 -->
      <div
        v-if="assetsSegmentVisited"
        v-show="contentSection === 'assets'"
        class="profile-tab assets-shell content-assets-host"
      >
        <div v-if="!isLoggedIn" class="login-prompt">
          <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
          <h3 class="login-prompt-title">登录以查看我的</h3>
          <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
          <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
        </div>
        <div
          v-else
          class="profile-page-content"
          :class="{ 'assets-active': assetsSection === 'hub' }"
        >
          <transition name="profile-panel-fade" mode="out-in">
            <AssetsHubPanel
              v-if="assetsSection === 'hub'"
              key="assets-hub"
              :show-back="false"
              :initial-tab="assetsInitialTab"
              :points-card-presets="pointsCardPresets"
              :is-points-card-presets-loading="isPointsCardPresetsLoading"
              :points-card-preset-capacity="pointsCardPresetQuota.capacity"
              :is-points-card-preset-quota-loading="isPointsCardPresetQuotaLoading"
              :points-card-cats-unlocked="isPointsCardCatsUnlocked"
              :is-redeeming-points-card-cats="isRedeemingPointsCardCats"
              @back="switchTab('posts')"
              @upload-points-card="handlePointsCardClick"
              @set-points-card-skin="setPointsCardSkin"
              @select-points-card-preset="selectPointsCardPreset"
              @delete-points-card-preset="deletePointsCardPreset"
              @redeem-points-card-cats="redeemPointsCardCats"
              @load-points-card-data="loadPointsCardData"
              @sponsor="openSponsorPage"
            />
            <SponsorPanel
              v-else
              key="assets-sponsor"
              :is-home-cat-active="isHomeCatActive"
              :sponsor-methods="sponsorMethods"
              :sponsor-method="sponsorMethod"
              :sponsor-status-text="sponsorStatusText"
              :sponsor-qr-visible="sponsorQrVisible"
              :sponsor-qr-load-failed="sponsorQrLoadFailed"
              :sponsor-qr-loading="sponsorQrLoading"
              :sponsor-qr-image-url="sponsorQrImageUrl"
              :sponsor-cat-burst-key="sponsorCatBurstKey"
              @back="backToAssetsHub"
              @start-flow="startSponsorFlow"
              @select-method="selectSponsorMethod"
              @show-qr="showSponsorQr"
              @qr-load="handleSponsorQrLoad"
              @qr-error="handleSponsorQrError"
            />
          </transition>
        </div>
      </div>

      <!-- 印象分段：原论坛第 7 席，2026-10-01 搬到这里（plans/022 §4.5）。
           取数与删除的单源都在 composables/useProfileImpressions.js，
           本文件只负责「什么时候挂载」—— 同样是首次访问后闩锁。 -->
      <div
        v-if="impressionsSegmentVisited"
        v-show="contentSection === 'impressions'"
        class="profile-tab content-impressions-host"
      >
        <div v-if="!isLoggedIn" class="login-prompt">
          <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
          <h3 class="login-prompt-title">登录以查看我的</h3>
          <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
          <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
        </div>
        <div v-else class="profile-page-content">
          <ProfileImpressionsSection />
        </div>
      </div>
    </div>

    <!-- 消息：消息中心 + AI 助手（2026-09 IA） -->
    <div
      v-show="currentTab === 'messages' || leavingTab === 'messages'"
      :ref="(el) => setTabPageRef('messages', el)"
      class="tab-page messages-tab"
      :class="{ 'is-leaving': leavingTab === 'messages' }"
    >
      <HomeCatMascot
        v-if="isHomeCatActive"
        class="messages-tab-cat"
        pool="background"
        seed="messages-tab"
        size="lg"
        decorative
      />
      <!-- 消息 tab：岛避让由页级 --userspace-messages-top-inset（实测岛高）负责，这里只留呼吸。
           2026-09-30（plans/022）：AI 段已移出消息 tab —— 底栏 AI 席直通全屏 /ai-chat，
           消息 tab 只剩通知收件箱，故段控与 ai-host 一并移除。 -->
      <div class="messages-host">
        <!-- KeepAlive 与上方社区论坛宿主同样处理：离开分区时不销毁消息中心，
             回来直接复用实例（实测「切回来」零数据请求、根节点不换新）。 -->
        <KeepAlive>
          <AsyncMessages
            ref="messagesHostRef"
            v-if="currentTab === 'messages' || leavingTab === 'messages'"
            :minimal="true"
          />
        </KeepAlive>
      </div>
    </div>

    <!-- 设置：偏好 + 资料编辑 + 数据管理/导出（2026-09 IA）
         同上：mountedTabs 闩锁 + v-show，切回设置零重建。
         内层档位（主页 / 编辑资料 / 数据导出 / 数据与隐私）**保持 v-if 不动** ——
         DataExportPanel 内有 pollTimer 轮询导出进度，常驻会变成后台轮询；
         由 v-if 在离开档位时卸载，轮询随之停止。 -->
    <div
      v-if="currentTab === 'settings' || leavingTab === 'settings' || mountedTabs.settings"
      v-show="currentTab === 'settings' || leavingTab === 'settings'"
      :ref="(el) => setTabPageRef('settings', el)"
      class="tab-page profile-tab settings-shell"
      :class="{ 'is-leaving': leavingTab === 'settings' }"
    >
      <div v-if="!isLoggedIn" class="login-prompt">
        <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
        <h3 class="login-prompt-title">登录以查看我的</h3>
        <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
        <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
      </div>
      <div v-else class="profile-page-content">
        <transition name="profile-panel-fade" mode="out-in">
          <ProfileSettingsPanel
            v-if="settingsSection === 'home'"
            key="settings-home"
            :show-back="true"
            :user-email="userInfo?.email || ''"
            :pushplus-status-text="pushplusStatusText"
            :cloud-plus-usage-text="cloudPlusUsageText"
            :subscription-summary-text="subscriptionSummaryText"
            :data-privacy-status-text="dataPrivacyStatusText"
            :theme-display-text="themeDisplayText"
            :is-home-cat-active="isHomeCatActive"
            :current-theme="currentTheme"
            :hide-online-status="hideOnlineStatus"
            :hide-follow-data="hideFollowData"
            @back="switchTab('posts')"
            @open-theme="openThemeModal"
            @open-cloud="openCloudPlusArea"
            @open-pushplus="router.push('/user-space/pushplus-settings?from=userspace-settings')"
            @open-security="router.push('/user-space/account-security?from=userspace-settings')"
            @open-version-settings="router.push('/user-space/settings/version')"
            @open-data="openProfileDataManagement"
            @open-data-management="openProfileDataManagement"
            @open-data-export="openProfileDataExport"
            @logout="handleLogout"
            @toggle-hide-online="toggleHideOnlineStatus"
            @toggle-hide-follow-data="toggleHideFollowData"
          />

          <EditProfilePanel
            v-else-if="settingsSection === 'edit-profile'"
            key="settings-edit"
            v-memo="[settingsSection]"
            :avatar-url="avatarUrl"
            :username="editProfileForm.username"
            :bio="editProfileForm.bio"
            :join-year="editProfileForm.joinYear"
            :join-month="editProfileForm.joinMonth"
            :join-day="editProfileForm.joinDay"
            :birth-month="editProfileForm.birthMonth"
            :birth-day="editProfileForm.birthDay"
            :join-date-years="joinDateYears"
            :months="months"
            :days-for-edit-join-date="daysForEditJoinDate"
            :days-for-edit-profile="daysForEditProfile"
            :is-submitting-profile-edit="isSubmittingProfileEdit"
            @close="closeEditProfileModal"
            @avatar-click="handleAvatarClick"
            @open-avatar-frames="openAvatarFrameModal"
            @save="submitEditProfile"
            @update-username="editProfileForm.username = $event"
            @update-bio="editProfileForm.bio = $event"
            @update-join-year="editProfileForm.joinYear = $event"
            @update-join-month="editProfileForm.joinMonth = $event"
            @update-join-day="editProfileForm.joinDay = $event"
            @update-birth-month="editProfileForm.birthMonth = $event"
            @update-birth-day="editProfileForm.birthDay = $event"
          />

          <DataExportPanel
            v-else-if="settingsSection === 'data-export'"
            key="settings-data-export"
            v-memo="[settingsSection]"
            @back="backToProfileSettings"
          />

          <DataPrivacyPanel
            v-else
            key="settings-data-management"
            v-memo="[settingsSection, isAdmin]"
            :is-admin="isAdmin"
            @back="backToProfileSettings"
            @navigate="handleDataPrivacyNavigate"
          />
        </transition>
      </div>
    </div>

    <!-- 横屏左栏（电脑 + 平板横屏）：主导航与底栏共用同一份 navItems / 点击处理，
         便捷与工具区统一走 handleRailAction 分发到已有 handler。
         可见性由 side-rail.css 的媒体查询决定，竖屏 / 手机横屏下不渲染 -->
    <UserSpaceSideRail
      :nav-items="navItems"
      :current-tab="activeBottomNavId"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      :current-theme="currentTheme"
      :is-logged-in="isLoggedIn"
      @preload-tab="preloadUserSpaceTab"
      @nav-click="handleBottomNavClick"
      @action="handleRailAction"
    />

    <UserSpaceBottomNav
      :visible="!(currentTab === 'settings' && settingsSection === 'edit-profile')"
      :hidden="isBottomNavHidden"
      :ai-overlay-open="isAiOverlayOpen"
      :nav-items="navItems"
      :current-tab="activeBottomNavId"
      :nav-indicator-style="bottomNavIndicatorStyle"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      @preload-tab="preloadUserSpaceTab"
      @nav-click="handleBottomNavClick"
    />

    <ThemeModal
      :open="showThemeModal"
      :current-theme-preference="currentThemePreference"
      @close="closeThemeModal"
      @select="setThemePreference"
    />

    <AvatarFramePickerModal
      :open="showAvatarFrameModal"
      :avatar-url="avatarUrl"
      @close="closeAvatarFrameModal"
    />

    <CommonAlertModal
      v-model:visible="alertState.visible"
      :type="alertState.type"
      :title="alertState.title"
      :message="alertState.message"
    />

    <AvatarCropModal
      v-if="showCropModal"
      v-model:visible="showCropModal"
      :image-src="cropImageSrc"
      :loading="isProcessingCrop"
      :title="cropModalTitle"
      :hint="cropModalHint"
      :sub-hint="cropModalSubHint"
      :aspect-ratio="cropModalAspectRatio"
      :shape="cropModalShape"
      @confirm="handleCropConfirm"
    />

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
import {
  ref,
  computed,
  nextTick,
  onActivated,
  onMounted,
  onUnmounted,
  reactive,
  watch,
  shallowRef,
  shallowReactive,
  markRaw,
  defineAsyncComponent,
} from 'vue';
/* 未登录占位图标（方块 / 我的 / 设置三个 tab 的 login-prompt 都用它）。
   2026-09-24 修：此前模板写了 <User> 但从未导入 —— Vue 解析失败退化为原生元素，
   图标渲染不出来，控制台刷「Failed to resolve component: User」。 */
import { User } from 'lucide-vue-next';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import {
  prepareAvatarUpload,
  uploadAvatarFile,
  removeAvatarByUrl,
} from '@/utils/api/avatar-storage.js';
import { useEdgeSwipeGesture } from '@/composables/useEdgeSwipeGesture';
import UserSpaceBottomNav from './components/UserSpaceBottomNav.vue';
import UserSpaceSideRail from './components/UserSpaceSideRail.vue';
import SegmentTabs from './components/SegmentTabs.vue';
// 方块（论坛）分区壳：与首页 `/` 下滑直达共用同一份（2026-09-23 单源）
import ForumSectionShell from './components/ForumSectionShell.vue';
const ProfileHomePanel = defineAsyncComponent(() => import('./components/ProfileHomePanel.vue'));
const AvatarCropModal = defineAsyncComponent(() => import('@/components/AvatarCropModal.vue'));
// 官方分区舞台（英雄区 + 各周年弹窗）：只在切到「官方」时才请求，不进 UserSpace 主 chunk
const AsyncOfficialHeroStage = defineAsyncComponent(
  () => import('@/views/Home/components/OfficialHeroStage.vue'),
);
const ProfileSettingsPanel = defineAsyncComponent(
  () => import('./components/ProfileSettingsPanel.vue'),
);
const EditProfilePanel = defineAsyncComponent(() => import('./components/EditProfilePanel.vue'));
const AvatarFramePickerModal = defineAsyncComponent(
  () => import('./components/AvatarFramePickerModal.vue'),
);
const SponsorPanel = defineAsyncComponent(() => import('./components/SponsorPanel.vue'));
const DataPrivacyPanel = defineAsyncComponent(() => import('./components/DataPrivacyPanel.vue'));
const DataExportPanel = defineAsyncComponent(() => import('./components/DataExportPanel.vue'));
const AssetsHubPanel = defineAsyncComponent(() => import('./components/AssetsHubPanel.vue'));
// 「我」页第三分段（印象）：数据层单源在 composables/useProfileImpressions.js
const ProfileImpressionsSection = defineAsyncComponent(
  () => import('./components/ProfileImpressionsSection.vue'),
);
import ThemeModal from './components/ThemeModal.vue';
import NotificationSuggestIsland from '@/components/UnifiedNavbar/NotificationSuggestIsland.vue';
import { showIsland, islandTaskView } from '@/composables/useIsland.js';
import { isForumLandscape } from '@/utils/forum-viewport.js';
import { openForumPost } from '@/composables/usePostDetailModal.js';
import { createMemoryTtlCache } from './composables/useMemoryTtlCache.js';
import { useScrollDirectionHide } from './composables/useScrollDirectionHide.js';
import {
  USER_SPACE_VALID_TABS,
  useUserSpaceTabs,
  userSpaceNavItems,
} from './composables/useUserSpaceTabs.js';
// 2026-09-30 底栏收为四席后，assets / settings 不再是底栏项 —— 高亮要经映射落到「我」
import { resolveBottomNavIdForUserSpaceTab } from '@/config/bottom-nav';
import { useImageCompressionLoader } from './composables/useImageCompressionLoader.js';
import {
  AsyncMessages,
  clearIdlePreloadTasks,
  clearScheduledForumPreload,
  preloadForumComponent,
  preloadMessagesComponent,
  preloadProfileStyles,
  preloadSettingsSubPanels,
  scheduleForumPreload,
  scheduleIdleTask,
  setUserSpaceMountedForPreload,
} from './async-loaders.js';
import { FORUM_DEFAULT_SECTION, isForumFeedSection, isForumSection } from '@/config/forum-sections';
import { supabase } from '@/utils/supabase-client.js';
import {
  getPostsByUsername,
  updateProfileAvatar,
  getFollowers,
  getFollowing,
} from '@/utils/api/profile-api.js';
import FollowListModal from '@/components/FollowListModal.vue';
import { getPushplusSettings } from '@/utils/api/pushplus-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { getMyUserSpaceSummary } from '@/utils/api/user-space-api.js';
import { logger } from '@/utils/logger.js';
import { createKeyedAbortController } from '@/utils/request-core.js';
import { listMyCloudEntries, setMyCloudEntryVisibility } from '@/utils/api/boh-cloud-api.js';
import { deleteCloudEntryWithAssets } from '@/utils/cloud-entry-maintenance.js';
import { isPublicCloudEntry } from '@/utils/cloud-storage-accounting.js';
import {
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  deleteCloudinaryAssetsByPublicIds,
  extractCloudinaryPublicIdFromUrl,
  getCloudinaryDisplayUrl,
  markCloudinaryUploadsClaimed,
  uploadImageToCloudinary,
} from '@/utils/cloudinary-client.js';
import sponsorQrImage from '@/assets/images/qrcode.webp';
import { useAuthStore } from '@/stores/auth';
import { ensureNotificationStore, getNotificationStoreRef } from '@/stores/notification-loader';
import { themeManager } from '@/utils/theme-manager.js';
import { isHomeCatTheme } from '@/utils/home-cat-theme.js';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  resolveCloudBenefitFromSubscriptions,
} from '@/utils/subscription-benefits.js';

const { loadImageCompression } = useImageCompressionLoader();

const router = useRouter();
const route = useRoute();
const dialog = useConfirmDialog();
const authStore = useAuthStore();
const { isLoggedIn, isInitialized, userInfo, showLoginModal } = storeToRefs(authStore);
const notificationStoreRef = getNotificationStoreRef();
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const hasUnreadMessages = computed(() => unreadCount.value > 0);
const refreshUnreadCount = async () => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount();
};

const assetsInitialTab = ref('');
const TAB_LEAVE_CLEAR_DELAY_MS = 340;
let userSpaceWarmupTimeoutId = null;
// ✅ 性能优化：使用 markRaw 标记静态配置，避免不必要的响应式追踪
const USERSPACE_CACHE_TTL = markRaw({
  stats: 60 * 1000,
  cloudUsage: 60 * 1000,
  pushplus: 60 * 1000,
  profilePosts: 60 * 1000,
  // 热力图跨一年 371 天，服务端要扫 posts + comments 两张表；变化频率远低于
  // 计数类数据，独立放宽到 5 分钟，避免每次进「内容」tab 都重算一次全窗口聚合。
  heatmap: 5 * 60 * 1000,
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
  heatmap: { loading: false, error: null },
});

// ✅ 性能优化：添加 AbortController 管理，支持请求取消
// 实现已收敛到 @/utils/request-core.js 的 createKeyedAbortController（单一真源）。
const abortControllers = new Map();
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
  heatmap: 0,
});

// ✅ 性能优化：使用 shallowRef 优化非关键大数据
const profilePosts = shallowRef([]);

const hideOnlineStatus = computed(() => userInfo.value?.hideOnlineStatus ?? false);
const hideFollowData = computed(() => userInfo.value?.hideFollowData ?? false);
// 方块（论坛）分区壳实例：内嵌论坛的滚动刷新与发布/搜索意图都经它转发
const communityShellRef = ref(null);
const tabPageRefs = new Map();
const tabScrollPositions = reactive(
  Object.fromEntries(USER_SPACE_VALID_TABS.map((tab) => [tab, 0])),
);
let clearLeavingTabTimer = null;
let userSpacePageEl = null;

let latestTabScrollRestoreToken = 0;

const navItems = userSpaceNavItems;
// 底栏高亮口径：assets / settings 已下沉进「我」页，两者都高亮「我」（见 @/config/bottom-nav 映射表）
const activeBottomNavId = computed(
  () => resolveBottomNavIdForUserSpaceTab(currentTab.value) || currentTab.value,
);
const {
  isOpen: isAiOverlayOpen,
  canOpen: isAiOverlayAllowed,
  open: openGlobalAi,
  close: closeGlobalAi,
} = useGlobalAiOverlay();
// 与 UnifiedNavbar 的 has-bohai-island 同源判定：岛展开时容器实测高度会被面板撑大
const isAiIslandOpen = computed(() => isAiOverlayOpen.value && isAiOverlayAllowed.value);

// 边缘滑动手势检测：从右侧边缘向左滑动唤起AI
const { isSwiping: isEdgeSwiping, edgeIndicatorVisible } = useEdgeSwipeGesture({
  edgeWidth: 20,
  minSwipeDistance: 80,
  maxSwipeTime: 800,
  velocityThreshold: 0.5,
  onTrigger: openGlobalAi,
});

const bottomNavIndicatorStyle = computed(() => navIndicatorStyle.value);
const validTabs = USER_SPACE_VALID_TABS;
// 旧 tab 语义映射（profile=我的→内容、ai→消息、shows→内容）
// 2026-10-01：`assets` 也并进来 —— 它已从「独立 tab」降为「我」页的「资产」分段，
// 底栏席位早在本轮之前就撤了。落点由 `?view=assets` 表达（见 resolveSectionFromRoute）。
const LEGACY_TAB_MAP = { profile: 'posts', ai: 'messages', shows: 'posts', assets: 'posts' };

/**
 * 旧 tab 值 → 现行 tab 值。**三个入口必须走同一份**：
 *   ① `initialUserSpaceTab`（首帧） ② `onMounted` 的 URL 同步 ③ `watch(route.query.tab)`
 *
 * ⚠️ 2026-10-01 修的 bug：原先 ② 直接用**未映射**的 `route.query.tab`，
 * 于是 `?tab=assets` 会把 currentTab 设成 `assets` —— 而 `assets` 已从「独立 tab」
 * 降为「我」页的分段，没有任何 tab-page 认领它，结果**整页白屏**（实测三块 tab-page
 * 全是 display:none）。只要某个旧 tab 值失去自己的页面，这处不一致就会露出来，
 * 所以在入口收敛比在三处各补一次映射更稳。
 */
const resolveRequestedUserSpaceTab = (rawTab) => {
  const raw = String(rawTab || '');
  const mapped = LEGACY_TAB_MAP[raw] || raw;
  return validTabs.includes(mapped) ? mapped : 'community';
};
const rawRequestedTab = String(route.query.tab || '');
const initialUserSpaceTab = resolveRequestedUserSpaceTab(rawRequestedTab);
if (
  initialUserSpaceTab === 'posts' ||
  initialUserSpaceTab === 'assets' ||
  initialUserSpaceTab === 'settings'
) {
  void preloadProfileStyles();
}
// tab 内段控 section（2026-09 IA：原 profile 二级面板拆平到各 tab）
const pageRootRef = ref(null);
// 方块（论坛）分区：六席（官方/最新/关注/新闻/活动/成员）单源在
// @/config/forum-sections，默认落点仍是「最新」；分区壳本体见 ForumSectionShell.vue
const communitySection = ref(FORUM_DEFAULT_SECTION);
const contentSection = ref('home');
const messagesSection = ref('inbox');
const settingsSection = ref('home');
const assetsSection = ref('hub');
// 「我」页三段：空间 / 资产 / 印象（2026-10-01 收口）
const CONTENT_SECTIONS = ['home', 'assets', 'impressions'];
const MESSAGES_SECTIONS = ['inbox'];
const SETTINGS_SECTIONS = ['home', 'edit-profile', 'data-management', 'data-export'];
const CONTENT_SECTION_ITEMS = [
  { id: 'home', label: '空间' },
  { id: 'assets', label: '资产' },
  { id: 'impressions', label: '印象' },
];
const SECTION_DEFAULTS = {
  community: 'latest',
  posts: 'home',
  messages: 'inbox',
  settings: 'home',
};
// 分段惰性挂载闩锁：没访问过的分段不挂载（不为它提前付费），访问过就复用（切回零重建）
const assetsSegmentVisited = ref(false);
const impressionsSegmentVisited = ref(false);
let pendingSectionTab = null;
const tabTransitionDirection = ref('');
const leavingTab = ref(null);
const { currentTab, navIndicatorStyle, ensureTabMounted, mountedTabs } = useUserSpaceTabs(
  navItems,
  initialUserSpaceTab,
);

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
      if (safeTab === 'community' && isForumFeedSection(communitySection.value)) {
        communityShellRef.value?.refreshEmbeddedScroll?.();
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
    disabled: false,
  },
  {
    id: 'alipay',
    label: '支付宝',
    desc: '暂不支持',
    icon: 'AL',
    disabled: true,
  },
];
const sponsorStatusText = computed(() => (sponsorMethod.value === 'wechat' ? '可用' : '暂不支持'));

const resolveSectionFromRoute = () => {
  // URL 还停在旧 tab 时（jumpWithSection 后 router.replace 尚未落地 / watch(currentTab) 先烧），
  // 按「无 view」重算分区会把刚设好的分区冲成默认值 —— 此时 URL 不代表当前 tab，直接不采信。
  const routeTab = LEGACY_TAB_MAP[route.query.tab] || String(route.query.tab || '');
  if (routeTab && validTabs.includes(routeTab) && routeTab !== currentTab.value) return;
  const requestedView = String(route.query.view || '').trim();
  if (currentTab.value === 'community') {
    if (isForumSection(requestedView)) communitySection.value = requestedView;
  } else if (currentTab.value === 'posts') {
    // 旧深链 `?tab=assets`（资产曾是底栏席位）：没有显式 view 时落到「资产」分段，
    // 而不是默认的「空间」—— 否则老链接会把用户送到错误的分段。
    if (!requestedView && rawRequestedTab === 'assets') contentSection.value = 'assets';
    else if (CONTENT_SECTIONS.includes(requestedView)) contentSection.value = requestedView;
  } else if (currentTab.value === 'messages') {
    if (MESSAGES_SECTIONS.includes(requestedView)) messagesSection.value = requestedView;
  } else if (currentTab.value === 'settings') {
    if (SETTINGS_SECTIONS.includes(requestedView)) {
      settingsSection.value = requestedView;
    } else {
      settingsSection.value = 'home';
    }
    if (settingsSection.value === 'home') {
      void fetchPushplusStatus();
      void fetchCloudPlusUsage();
    }
    if (settingsSection.value === 'edit-profile') {
      prepareEditProfileForm();
    }
  }
};

const openSettingsPanelFromRoute = async () => {
  if (currentTab.value !== 'settings' || settingsSection.value !== 'home') return;
  if (String(route.query.setting || '').trim() !== 'theme') return;

  await nextTick();
  openThemeModal();
};

/** tab → 分区内存单源：URL 的 view 一律由这里推导，别再各写一套。
    ⚠️ `assets` 不是 tab 了（是「我」页的分段），别再往这张表里加 —— 它的内层档位
    hub/sponsor 是纯内存态（`assetsSection`），不进 URL：`view` 这个参数已经被
    「分段」占用，两者共用一个 query 名必然打架。 */
const SECTION_REFS = {
  community: communitySection,
  posts: contentSection,
  messages: messagesSection,
  settings: settingsSection,
};

/** 把某 tab 的当前分区按统一口径写进 query：等于默认值则删 view，否则写 view */
const withSectionQuery = (baseQuery, tabId) => {
  const nextQuery = { ...baseQuery };
  const section = SECTION_REFS[tabId]?.value || '';
  if (!section || section === SECTION_DEFAULTS[tabId]) delete nextQuery.view;
  else nextQuery.view = section;
  return nextQuery;
};

const setSectionRoute = (tabId, section) => {
  const nextQuery = { ...route.query, tab: tabId };
  if (!section || section === SECTION_DEFAULTS[tabId]) {
    delete nextQuery.view;
    delete nextQuery.setting;
  } else {
    nextQuery.view = section;
  }
  router.replace({ query: nextQuery });
};

const jumpWithSection = (tabId, section) => {
  if (tabId === 'community') communitySection.value = section;
  else if (tabId === 'posts') contentSection.value = section;
  else if (tabId === 'messages') messagesSection.value = section;
  else if (tabId === 'settings') settingsSection.value = section;
  pendingSectionTab = tabId;
  if (currentTab.value !== tabId) {
    switchTab(tabId);
  } else {
    setSectionRoute(tabId, section);
  }
};

/** 「我」页分段的惰性挂载闩锁 + URL 回写（分段值必须进 URL，否则刷新即丢失） */
watch(contentSection, (next) => {
  if (next === 'assets') assetsSegmentVisited.value = true;
  else if (next === 'impressions') impressionsSegmentVisited.value = true;
  if (currentTab.value === 'posts') setSectionRoute('posts', next);
});

const handleCommunitySwitchTab = (tabId) => {
  // shows 段已并入内容页签重构（空间/Cloud+），节目中心落点回「我的 · 空间」
  if (tabId === 'shows') {
    jumpWithSection('posts', 'home');
    return;
  }
  switchTab(tabId);
};

// ---- 分区段控的切换动效与取数都在 ForumSectionShell 内（2026-09-23 单源） ----
// 抖音式文字页签（SegmentTabs）：v-model 绑当前档，切换动效 = 指示条滑动 + 内容 fade-up

// keepAlive 二次进入：无 view 参数时方块（论坛）回到默认落点「最新」
onActivated(() => {
  if (!route.query.view && currentTab.value === 'community') {
    communitySection.value = FORUM_DEFAULT_SECTION;
  }
});

const userBirthday = computed(() => {
  if (userInfo.value.birthMonth && userInfo.value.birthDay) {
    return {
      month: userInfo.value.birthMonth,
      day: userInfo.value.birthDay,
    };
  }
  return null;
});

const avatarUrl = computed(() => userInfo.value.avatarUrl || '');
const profileBackgroundUrl = computed(() => userInfo.value.profileBackgroundUrl || '');
const profileBackgroundPublicId = computed(() => userInfo.value.profileBackgroundPublicId || '');

const joinDate = computed(() => userInfo.value.joinDate || '');
const isProfileBasicsComplete = computed(() => Boolean(joinDate.value && userBirthday.value));
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
const cropModalAspectRatio = computed(() =>
  cropPurpose.value === 'profile-background'
    ? BACKGROUND_CROP_ASPECT_RATIO
    : cropPurpose.value === 'points-card'
      ? null
      : 1,
);
const cropModalShape = computed(() =>
  ['profile-background', 'points-card'].includes(cropPurpose.value) ? 'rectangle' : 'circle',
);
const cropModalTitle = computed(() =>
  cropPurpose.value === 'profile-background'
    ? '裁切背景'
    : cropPurpose.value === 'points-card'
      ? '裁切积分卡面'
      : '裁切头像',
);
const cropModalHint = computed(() =>
  cropPurpose.value === 'profile-background'
    ? '拖动图片来选择个人卡片背景的显示范围'
    : cropPurpose.value === 'points-card'
      ? '拖动图片，并按需调整裁切框的宽高和显示范围'
      : '拖动以调整位置，缩放以改变大小',
);
const cropModalSubHint = computed(() =>
  cropPurpose.value === 'profile-background'
    ? '裁切后的横幅会作为个人卡片背景'
    : cropPurpose.value === 'points-card'
      ? '积分卡会自动适配你的自定义卡面'
      : '裁切后的效果将作为您的新头像',
);

const escapeCssUrl = (url = '') =>
  String(url || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
const profileCoverStyle = computed(() => {
  const displayUrl = getCloudinaryDisplayUrl(profileBackgroundUrl.value);
  if (!displayUrl) return {};

  return {
    backgroundImage: [
      'linear-gradient(180deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.02))',
      `url("${escapeCssUrl(displayUrl)}")`,
    ].join(', '),
  };
});

// ✅ 性能优化：使用 shallowReactive 优化统计数据，减少深层响应式追踪
const userStats = shallowReactive({
  posts: 0,
  points: 0,
  rank: 0,
  followers: 0,
  following: 0,
});
let latestUserStatsFetchToken = 0;
let userStatsRetryTimerId = null;

const PROFILE_POSTS_PAGE_SIZE = 15;
const hasMoreProfilePosts = ref(true);
const profilePostsPage = ref(1);
const isLoadingMoreProfilePosts = ref(false);
let latestProfileContentFetchToken = 0;

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

const openProfilePost = (postId) => {
  const safePostId = String(postId || '').trim();
  if (!safePostId) return;
  // 横屏（含桌面）：进详情弹窗；竖屏保持整页路由
  if (isForumLandscape()) {
    openForumPost({ router, postId: safePostId });
    return;
  }
  router.push({
    name: 'PostDetail',
    params: { id: safePostId },
    query: { from: 'user-space', tab: 'posts' },
  });
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
  if (!force && !reset && now - lastFetchTime.profilePosts < 5000) {
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
  const abortController = createKeyedAbortController(abortControllers, 'profile-posts');
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
      signal: abortController.signal,
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
      const seen = new Set(profilePosts.value.map((p) => p.id));
      const newPosts = incoming.filter((p) => !seen.has(p.id));
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
const fetchUserStats = async ({ retryCount = 0, force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  if (await fetchAggregatedUserSpaceSummary({ force })) return;

  const safeUsername = String(userInfo.value.username || '').trim();
  const cacheKey = `stats:${userId}:${safeUsername}`;
  const now = Date.now();

  // ✅ 检查 lastFetchTime，避免频繁重复请求
  if (!force && retryCount === 0 && now - lastFetchTime.stats < 5000) {
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
  const abortController = createKeyedAbortController(abortControllers, 'user-stats');
  dataState.stats.loading = true;
  const fallbackPoints = normalizeStatInt(userInfo.value.points, userStats.points);
  userStats.points = fallbackPoints;

  try {
    const [postsResult, pointsResult, followersResult, followingResult] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .or(`author_id.eq.${userId}${safeUsername ? `,author_username.eq.${safeUsername}` : ''}`),
      supabase.from('profiles').select('points').eq('id', userId).maybeSingle(),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId),
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
      following: userStats.following,
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

/**
 * 活跃热力图 —— 服务端算，前端只负责铺格子。
 *
 * 为什么必须走 RPC（supabase/migrations/2026091501_user_activity_heatmap.sql）：
 * PostgREST 表达不了「按自然日分组」的聚合，前端拉全量 posts/comments 自己 group by
 * 则要付出全表扫描 + 全量传输的代价。RPC 按 Asia/Shanghai 分桶，一次往返即可。
 *
 * 注意这里没有用 createKeyedAbortController：supabase-js 的 rpc() 不透传 signal，
 * 所以并发竞争一律靠 fetchToken 判定（与 fetchUserStats 同构）。
 */
const HEATMAP_WINDOW_DAYS = 371; // 53 周 + 当天，与 GitHub 口径一致
const activityHeatmap = shallowRef(null);
let latestHeatmapFetchToken = 0;

const fetchActivityHeatmap = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  const cacheKey = `heatmap:${userId}:${HEATMAP_WINDOW_DAYS}`;
  if (!force) {
    const cached = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.heatmap);
    if (cached) {
      activityHeatmap.value = cached;
      dataState.heatmap.loading = false;
      return;
    }
    if (Date.now() - lastFetchTime.heatmap < 5000) return;
  }

  const fetchToken = ++latestHeatmapFetchToken;
  const now = Date.now();
  dataState.heatmap.loading = true;

  try {
    const { data, error } = await supabase.rpc('get_user_activity_heatmap', {
      p_user_id: userId,
      p_days: HEATMAP_WINDOW_DAYS,
    });
    if (fetchToken !== latestHeatmapFetchToken) return;
    if (error) throw error;

    const payload = data && typeof data === 'object' ? data : null;
    activityHeatmap.value = payload;
    if (payload) setUserSpaceCache(cacheKey, payload);
    lastFetchTime.heatmap = now;
    dataState.heatmap.error = null;
  } catch (error) {
    logger.warn('user-space', '活跃热力图加载失败:', error);
    if (fetchToken === latestHeatmapFetchToken) {
      dataState.heatmap.error = error;
      // RPC 缺失（迁移未上线）时保持 null，ActivityHeatmap 会退化为空态，不会白屏
      activityHeatmap.value = null;
    }
  } finally {
    if (fetchToken === latestHeatmapFetchToken) {
      dataState.heatmap.loading = false;
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
  birthDay: '',
});
const AVATAR_MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const PROFILE_BACKGROUND_MAX_FILE_SIZE_BYTES = CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES;

// 主题设置
const showThemeModal = ref(false);
// 头像框试戴弹层（编辑资料页入口；佩戴状态单源 useAvatarFrame）
const showAvatarFrameModal = ref(false);
const openAvatarFrameModal = () => {
  showAvatarFrameModal.value = true;
};
const closeAvatarFrameModal = () => {
  showAvatarFrameModal.value = false;
};
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(
  () => isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value),
);
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
const dataPrivacyStatusText = computed(() =>
  isProfileBasicsComplete.value ? '资料已完善' : '待补充资料',
);
// ✅ 性能优化：使用 shallowReactive 优化 Pushplus 和 Cloud+ 状态
const pushplusStatus = shallowReactive({
  loaded: false,
  hasToken: false,
  enabled: false,
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
  limit: DEFAULT_CLOUD_IMAGE_LIMIT,
});
// 自己的全部 Cloud+ 条目（含公开笔记）：公开笔记进作品格展示，图片仍占 Cloud+ 配额。
// fetchCloudPlusUsage 的回退路径与 fetchCloudEntriesForWorks 都喂这份数据。
const myCloudEntries = shallowRef([]);
const publicCloudNotes = computed(() =>
  myCloudEntries.value.filter((entry) => isPublicCloudEntry(entry)),
);
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
    normalizeStatInt(summary.cloud_image_limit, cloudPlusUsage.limit),
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
  return showIsland.notify({
    ...payload,
    onAction: actionTab && validTabs.includes(actionTab) ? () => switchTab(actionTab) : undefined,
  });
};

const isBottomNavForceVisible = computed(
  () =>
    isAiOverlayOpen.value ||
    (currentTab.value === 'settings' && settingsSection.value === 'edit-profile'),
);
const { hidden: isBottomNavHidden, reset: resetBottomNavAutoHide } = useScrollDirectionHide({
  forceVisible: isBottomNavForceVisible,
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

const buildUnreadIslandMessage = (_detail = {}) => {
  const totalUnread = Number(unreadCount.value) || 0;
  return {
    title: '有新通知',
    message: totalUnread > 0 ? `当前共有 ${totalUnread} 条未读` : '你有新的站内通知',
    icon: 'notification',
    durationMs: 6200,
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
  if (!force && now - lastFetchTime.pushplus < 5000) {
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

  const abortController = createKeyedAbortController(abortControllers, 'pushplus-status');
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
      enabled: pushplusStatus.enabled,
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
  if (!force && now - lastFetchTime.cloudUsage < 5000) {
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

  const abortController = createKeyedAbortController(abortControllers, 'cloud-usage');
  dataState.cloud.loading = true;
  try {
    const [subscriptionsResult, cloudEntriesResult] = await Promise.all([
      getMySubscriptions(userId, { includeExpired: true, signal: abortController.signal }),
      listMyCloudEntries({ userId, limit: 500, signal: abortController.signal }),
    ]);

    if (abortController.signal.aborted) return;

    const subscriptions =
      subscriptionsResult.ok && Array.isArray(subscriptionsResult.data)
        ? subscriptionsResult.data
        : [];
    const benefit = resolveCloudBenefitFromSubscriptions(subscriptions);
    cloudPlusUsage.limit = Number(benefit.cloudImageLimit || DEFAULT_CLOUD_IMAGE_LIMIT);

    if (cloudEntriesResult.ok && Array.isArray(cloudEntriesResult.data)) {
      myCloudEntries.value = cloudEntriesResult.data;
      cloudPlusUsage.used = cloudEntriesResult.data.reduce(
        (sum, entry) =>
          sum +
          (Array.isArray(entry?.contentBlocks)
            ? entry.contentBlocks.filter((block) => block?.type === 'image').length
            : 0),
        0,
      );
    } else {
      cloudPlusUsage.used = 0;
    }

    cloudPlusUsage.loaded = true;
    setUserSpaceCache(cacheKey, {
      used: cloudPlusUsage.used,
      limit: cloudPlusUsage.limit,
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

/**
 * 拉自己的 Cloud+ 条目喂「作品格」的公开笔记。
 * 聚合摘要 RPC 只给 used/limit 数值、不给条目，作品格必须另拉一次列表；
 * 两条路径都写 myCloudEntries，公开笔记与用量口径同源。
 */
const fetchCloudEntriesForWorks = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    myCloudEntries.value = [];
    return;
  }
  if (!force && myCloudEntries.value.length > 0) return;

  const result = await listMyCloudEntries({ userId, limit: 500 });
  if (result.ok && Array.isArray(result.data)) {
    myCloudEntries.value = result.data;
    cloudPlusUsage.used = result.data.reduce(
      (sum, entry) =>
        sum +
        (Array.isArray(entry?.contentBlocks)
          ? entry.contentBlocks.filter((block) => block?.type === 'image').length
          : 0),
      0,
    );
    cloudPlusUsage.loaded = true;
  } else if (result.error) {
    logger.warn('user-space', '读取 Cloud+ 条目（作品格）失败:', result.error);
  }
};

/** 作品格管理动作后刷新：条目列表 + 用量缓存一起重取（用量缓存按 key 覆写）。 */
const refreshCloudEntriesForWorks = async () => {
  const userId = String(userInfo.value.id || '').trim();
  await fetchCloudEntriesForWorks({ force: true });
  if (userId) {
    setUserSpaceCache(`cloud-usage:${userId}`, {
      used: cloudPlusUsage.used,
      limit: cloudPlusUsage.limit,
    });
    lastFetchTime.cloudUsage = Date.now();
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
  communityShellRef.value?.refreshEmbeddedScroll?.();
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
  void fetchPushplusStatus();
  void fetchCloudPlusUsage();
  jumpWithSection('settings', 'home');
};

const openSponsorPage = () => {
  sponsorMethod.value = 'wechat';
  sponsorQrVisible.value = false;
  sponsorQrLoadFailed.value = false;
  sponsorQrLoading.value = false;
  sponsorCatBurstKey.value += 1;
  // 赞助是「资产」分段的内层档位：先落到资产段，再切内层（内层不进 URL）
  assetsSegmentVisited.value = true;
  assetsSection.value = 'sponsor';
  jumpWithSection('posts', 'assets');
};

const openPhotoAlbums = () => {
  router.push('/user-space/albums');
};

const openAssetsHub = (initialTab = '') => {
  const betaTabs = ['overview', 'cards', 'points', 'subscription', 'fulfillment', 'addresses'];
  let nextTab = String(initialTab);
  // 旧积分页 orders/gifts 入口统一落到 fulfillment（旧 4.9.1 tab 集已随回退通道移除）
  if (['orders', 'gifts'].includes(nextTab)) nextTab = 'fulfillment';
  assetsInitialTab.value = betaTabs.includes(nextTab) ? nextTab : '';
  assetsSegmentVisited.value = true;
  assetsSection.value = 'hub';
  jumpWithSection('posts', 'assets');
};

const backToAssetsHub = () => {
  assetsSection.value = 'hub';
  assetsInitialTab.value = '';
};

const openProfileDataManagement = () => {
  jumpWithSection('settings', 'data-management');
};

const openProfileDataExport = () => {
  jumpWithSection('settings', 'data-export');
};

const handleDataPrivacyNavigate = (route) => {
  if (route === 'shared-memories') {
    router.push('/user-space/shared-memories?from=userspace-data');
  } else if (route === 'admin') {
    router.push('/admin/data-management');
  }
};

const backToProfileSettings = () => {
  settingsSection.value = 'home';
  setSectionRoute('settings', 'home');
  void fetchPushplusStatus();
  void fetchCloudPlusUsage();
};

const openProfileImpressions = () => {
  // 取数由 ProfileImpressionsSection 在挂载时自行触发（单源：composables/useProfileImpressions.js）
  jumpWithSection('posts', 'impressions');
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
  message: '',
});

const months = Array.from({ length: 12 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const joinDateYears = Array.from(
  { length: Math.max(1, currentYear - 2014 + 1) },
  (_, i) => currentYear - i,
);

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
    day: Number(match[3]),
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
  jumpWithSection('settings', 'edit-profile');
};

const closeEditProfileModal = () => {
  settingsSection.value = 'home';
  setSectionRoute('settings', 'home');
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
    editProfileForm.joinDay,
  );
  const hasCompleteJoinDate = hasCompleteDateParts(
    editProfileForm.joinYear,
    editProfileForm.joinMonth,
    editProfileForm.joinDay,
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
  const hasCompleteBirthday = hasCompleteDateParts(
    editProfileForm.birthMonth,
    editProfileForm.birthDay,
  );
  if (hasAnyBirthdayPart && !hasCompleteBirthday) {
    showAlert('warning', '提示', '请完整选择生日月份和日期');
    return;
  }

  isSubmittingProfileEdit.value = true;
  try {
    const updates = {
      username: newUsername,
      bio: String(editProfileForm.bio || '')
        .trim()
        .slice(0, 160),
      join_date: nextJoinDate,
      birth_month: hasCompleteBirthday ? String(editProfileForm.birthMonth) : null,
      birth_day: hasCompleteBirthday ? String(editProfileForm.birthDay) : null,
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
      actionTab: 'posts',
      durationMs: 4200,
    });
    closeEditProfileModal();
  } catch (error) {
    logger.error('user-space', '编辑资料失败:', error);
    showAlert('error', '保存失败', `错误: ${error.message || '未知错误'}`);
  } finally {
    isSubmittingProfileEdit.value = false;
  }
};

const openCloudPlusArea = (view = 'content', extraQuery = {}) => {
  const safeView = ['content', 'settings'].includes(String(view)) ? String(view) : 'content';
  const returnOrigin = currentTab.value === 'settings' ? 'userspace-settings' : 'userspace';
  router.push({
    path: '/user-space/note',
    query: {
      view: safeView,
      from: returnOrigin,
      ...extraQuery,
    },
  });
};

// —— 作品格里的公开笔记（Cloud+ entries）：管理唯一落点（2026-09-29 拍板） ——
const openProfileCloudNote = (entry) => {
  if (!entry?.id) return;
  openCloudPlusArea('content', { entry: String(entry.id) });
};

const setProfileCloudNotePrivate = async (entry) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId || !entry?.id) return;
  try {
    const result = await setMyCloudEntryVisibility(userId, entry.id, 'private');
    if (!result.ok) {
      showAlert('error', '设为私密失败', result.error?.message || '请稍后重试');
      return;
    }
    showTopNavStatus({
      title: '已设为私密',
      message: '这条笔记已从作品格收回，仅你自己可见',
      icon: 'success',
      type: 'success',
    });
    await refreshCloudEntriesForWorks();
  } catch (error) {
    logger.error('user-space', '公开笔记设为私密失败:', error);
  }
};

const deleteProfileCloudNote = async (entry) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId || !entry?.id) return;

  if (
    !(await dialog.confirm({
      title: '删除公开笔记',
      message: '删除后会同时清理笔记里的云端图片，并释放对应 Cloud+ 额度。确定删除吗？',
      tone: 'danger',
      confirmText: '删除',
    }))
  )
    return;

  try {
    const result = await deleteCloudEntryWithAssets(userId, entry);
    if (!result.ok) {
      showAlert('error', '删除失败', result.error?.message || '请稍后重试');
      return;
    }
    showTopNavStatus({
      title: '笔记已删除',
      message: '公开笔记与其图片已清理',
      icon: 'success',
      type: 'success',
    });
    await refreshCloudEntriesForWorks();
  } catch (error) {
    logger.error('user-space', '公开笔记删除失败:', error);
  }
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
  page: 1,
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
    const incoming = res.error ? [] : res.data || [];
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
  if (safeTab === 'community') {
    scheduleIdleTask('tab:community', () => void preloadForumComponent());
  } else if (safeTab === 'posts' && isLoggedIn.value) {
    scheduleIdleTask(
      'tab:posts',
      () => {
        void preloadProfileStyles();
        scheduleUserSpaceWarmup();
      },
      { timeout: 2400, fallbackDelay: 420 },
    );
  } else if (safeTab === 'messages' && isLoggedIn.value) {
    // ✅ 性能优化 P0-1：hover/idle 预载只拉消息中心。
    // 2026-09-30（plans/022）：BOH AI 已移出消息 tab（底栏 AI 席直通全屏 /ai-chat），
    // 其全依赖图（dev 实测 69 模块、~12MB 堆）由 /ai-chat 路由自己按需加载，
    // 不再需要消息 tab 内的按需预载闩锁。
    scheduleIdleTask('tab:messages', () => void preloadMessagesComponent());
  } else if (safeTab === 'assets' && isLoggedIn.value) {
    scheduleIdleTask('tab:assets', () => void preloadProfileStyles(), {
      timeout: 2400,
      fallbackDelay: 420,
    });
  } else if (safeTab === 'settings' && isLoggedIn.value) {
    // 设置额外预载内部档位的面板 chunk：首次换档实测 291~313ms，其中一部分是 chunk 往返
    scheduleIdleTask(
      'tab:settings',
      () => {
        void preloadProfileStyles();
        void preloadSettingsSubPanels();
      },
      { timeout: 2400, fallbackDelay: 420 },
    );
  }
};

const resolveAccessibleTab = (tabId) => {
  return validTabs.includes(tabId) ? tabId : 'posts';
};

const syncUserSpaceTabRoute = (tabId) => {
  // 分区必须随 tab 一起落到 URL：jumpWithSection('settings','edit-profile') 这类
  // 「切 tab + 带分区」的跳转，若 URL 只写 tab，随后 watch(currentTab) 的
  // resolveSectionFromRoute() 会按「无 view」把分区回落成默认值（编辑资料跳转踩过）。
  const nextQuery = withSectionQuery({ ...route.query, tab: tabId }, tabId);
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
  const currentView = String(route.query.view || '');
  const nextView = String(nextQuery.view || '');
  if (currentRouteTab === tabId && currentSection === nextSection && currentView === nextView)
    return;

  router.replace({ path: '/user-space', query: nextQuery });
};

const handleBottomNavClick = (tabId) => {
  closeGlobalAi();
  // 「AI」席是跨模块全屏落点（/ai-chat），不是 UserSpace 的 tab ——
  // 走 switchTab 会被 resolveAccessibleTab 拦成 no-op，必须直接跳路由。
  const item = navItems.find((entry) => entry.id === tabId);
  if (item?.fullPage) {
    void dismissComposerSession().then(() => router.push(item.route));
    return;
  }
  void dismissComposerSession().then(() => switchTab(tabId));
};

const switchTab = (tabId) => {
  const nextTab = resolveAccessibleTab(tabId, { promptLogin: true });
  if (nextTab !== tabId) return;
  if (currentTab.value === tabId) return;
  updateTabTransitionDirection(tabId);
  ensureTabMounted(tabId);
  const previousTab = currentTab.value;
  saveTabScrollPosition(previousTab);
  if (pendingSectionTab !== tabId) {
    communitySection.value = SECTION_DEFAULTS.community;
    contentSection.value = SECTION_DEFAULTS.posts;
    messagesSection.value = SECTION_DEFAULTS.messages;
    // 资产的内层档位（hub / sponsor）是纯内存态，回默认值即可，没有 SECTION_DEFAULTS 条目
    assetsSection.value = 'hub';
    settingsSection.value = SECTION_DEFAULTS.settings;
  }
  pendingSectionTab = null;
  if (tabId === 'posts') {
    void preloadProfileStyles();
    runProfileCriticalFetches();
  }
  if (tabId === 'settings') {
    // 进入设置即开始预热内部档位面板：用户点「数据导出 / 数据与隐私」时通常已经到位
    void preloadSettingsSubPanels();
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
    tabTransitionDirection.value = '';
    clearLeavingTabTimer = null;
  }, TAB_LEAVE_CLEAR_DELAY_MS);
  if (tabId === 'community') {
    void preloadForumComponent();
    void activateForumTab();
  }
};

const handleLogout = () => {
  authStore.logout();
  router.push('/');
};

/* ---------- 横屏左栏动作分发（2026-09-15；2026-09-23 分区壳单源后调整） ----------
   发布 / 搜索落在方块（论坛）分区的 ForumMain 上，而它只在分区壳挂载时存在
   （模板 v-show="currentTab === 'community' || leavingTab === 'community'"）：
   先切回方块，再等分区壳就绪后调用它透传出去的 ForumMain 方法。
   其余动作全部复用已有 handler，不新增业务分支。 */
const waitForForumView = async (methodName, timeoutMs = 4000) => {
  if (currentTab.value !== 'community') switchTab('community');
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const view = communityShellRef.value;
    if (view && typeof view[methodName] === 'function') return view;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  return null;
};

/* 发布会话（.mobile-composer-overlay）在横屏下只覆盖右区、且被 Teleport 到 body，
   切 tab 不会自动收起它，会一直盖住新页面 → 任何导航动作前先请求关闭。
   无改动内容时直接关；有内容时由论坛弹「保存草稿」确认，用户选完再继续。 */
const dismissComposerSession = async () => {
  const view = communityShellRef.value;
  if (view && typeof view.closeComposer === 'function') {
    await view.closeComposer();
  }
  // 方块 tab 未挂载时（ForumMain 不在 DOM）样式层不会有残留
};

const handleRailAction = async (actionId) => {
  // 「发布」本身就是打开这个会话，其余动作都先收掉它
  if (actionId !== 'compose') await dismissComposerSession();
  switch (actionId) {
    case 'compose': {
      const view = await waitForForumView('openComposer');
      view?.openComposer();
      break;
    }
    case 'search': {
      const view = await waitForForumView('focusSearch');
      view?.focusSearch();
      break;
    }
    case 'theme':
      // 主题弹窗的 .modal-overlay / .modal-card 样式来自 profile-panels.css，
      // 而它是按需动态加载的（初始 tab 为 posts/assets/settings 才预载）。
      // 左栏按钮能在社区 tab 直接点开弹窗 → 先确保样式就绪，否则弹窗会裸奔
      await preloadProfileStyles();
      openThemeModal();
      break;
    case 'home':
      router.push('/');
      break;
    case 'logout':
      handleLogout();
      break;
    default:
      break;
  }
};

const toggleHideOnlineStatus = async () => {
  const { success } = await authStore.updateUserProfile({
    hide_online_status: !userInfo.value.hideOnlineStatus,
  });
  if (!success) {
    showTopNavStatus({ title: '更新失败，请重试', icon: 'warning' });
  }
};

const toggleHideFollowData = async () => {
  const { success } = await authStore.updateUserProfile({
    hide_follow_data: !userInfo.value.hideFollowData,
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
      profile_background_public_id: uploaded.publicId,
    });

    if (!result.success) {
      throw new Error(result.message || '保存背景失败');
    }

    const oldPublicId = String(
      oldBackgroundPublicId || extractCloudinaryPublicIdFromUrl(oldBackgroundUrl),
    ).trim();
    const newPublicId = String(uploaded.publicId || '').trim();
    if (oldPublicId && oldPublicId !== newPublicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(oldPublicId, oldBackgroundUrl);
      if (!cleanupResult.ok) {
        logger.warn('user-space', '清理旧个人卡片背景失败:', cleanupResult.error);
        showAlert(
          'warning',
          '背景已更新',
          cleanupResult.error?.message || '旧背景图云端清理失败，请稍后重试',
        );
        return true;
      }
    }

    showTopNavStatus({
      title: '背景已更新',
      message: '个人卡片背景已更换',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'posts',
      durationMs: 4200,
    });
    return true;
  } catch (error) {
    logger.error('user-space', '个人卡片背景上传失败:', error);
    if (uploaded?.publicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(
        uploaded.publicId,
        uploaded.url,
      );
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
  if (isUploadingPointsCard.value) return;
  if (!isPointsCardPresetQuotaLoading.value && !pointsCardPresetQuota.value.canAdd) {
    showTopNavStatus({
      title: '卡面已达上限',
      message: `当前会员最多保存 ${pointsCardPresetQuota.value.capacity} 张自定义卡面`,
      icon: 'warning',
      type: 'warning',
      durationMs: 3600,
    });
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
  lastUsedAt: String(preset.last_used_at || preset.lastUsedAt || ''),
});

const normalizePointsCardPresetQuota = (quota = {}) => ({
  capacity: Math.max(3, Number(quota.capacity || 3) || 3),
  currentCount: Math.max(0, Number(quota.current_count ?? quota.currentCount ?? 0) || 0),
  tierCode:
    String(quota.tier_code || quota.tierCode || 'free')
      .trim()
      .toLowerCase() || 'free',
  canAdd: Boolean(quota.can_add ?? quota.canAdd),
});

const loadPointsCardPresetQuota = async () => {
  if (!userInfo.value?.id || isPointsCardPresetQuotaLoading.value)
    return pointsCardPresetQuota.value;
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
  if (!userInfo.value?.id || isPointsCardPresetsLoading.value) return;
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
  if (!userInfo.value?.id) return;
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
      showTopNavStatus({
        title: '卡面已达上限',
        message: `当前会员最多保存 ${quota.capacity} 张自定义卡面`,
        icon: 'warning',
        type: 'warning',
        durationMs: 3600,
      });
      return false;
    }

    uploaded = await uploadImageToCloudinary(file, {
      pendingSource: 'points-card',
      folder: 'boh-points-cards',
    });
    const { data, error } = await supabase.rpc('create_points_card_preset', {
      p_image_url: uploaded.url,
      p_image_public_id: uploaded.publicId || null,
    });
    if (error) throw error;
    if (!data?.ok) {
      if (data?.message === 'PRESET_CAPACITY_REACHED') {
        await loadPointsCardPresetQuota();
      }
      throw new Error(
        data?.message === 'PRESET_CAPACITY_REACHED'
          ? `当前会员最多保存 ${pointsCardPresetQuota.value.capacity} 张自定义卡面`
          : data?.message || '保存卡面失败',
      );
    }
    createdPreset = normalizePointsCardPreset(data.preset || {});

    const { data: useResult, error: useError } = await supabase.rpc('use_points_card_preset', {
      p_preset_id: createdPreset.id,
    });
    if (useError) throw useError;
    if (!useResult?.ok) throw new Error(useResult?.message || '应用卡面失败');

    await markCloudinaryUploadsClaimed([uploaded.publicId]);
    await authStore.refreshCurrentUserProfile({ force: true });

    pointsCardPresets.value = [
      createdPreset,
      ...pointsCardPresets.value.filter((preset) => preset.id !== createdPreset.id),
    ];
    await loadPointsCardPresetQuota();
    showTopNavStatus({
      title: '卡面已添加',
      message: '已保存为自定义卡面预设',
      icon: 'success',
      type: 'success',
      durationMs: 3600,
    });
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
  const preset = pointsCardPresets.value.find((item) => item.id === String(presetId || ''));
  if (!preset) return;
  const { data, error } = await supabase.rpc('use_points_card_preset', { p_preset_id: preset.id });
  if (error || !data?.ok) {
    showTopNavStatus({ title: '切换自定义卡面失败，请重试', icon: 'warning' });
    return;
  }
  await authStore.refreshCurrentUserProfile({ force: true });
  preset.lastUsedAt = new Date().toISOString();
  showTopNavStatus({
    title: '卡面已应用',
    message: '已切换到所选自定义卡面',
    icon: 'success',
    type: 'success',
    durationMs: 2800,
  });
};

const setPointsCardSkin = async (skin) => {
  if (!['blank', 'cats'].includes(String(skin))) return;
  if (skin === 'cats' && !isPointsCardCatsUnlocked.value) {
    await redeemPointsCardCats();
    return;
  }
  const result = await authStore.updateUserProfile({ points_card_skin: skin });
  if (!result.success) {
    showTopNavStatus({ title: '卡片皮肤更新失败，请重试', icon: 'warning' });
    return;
  }
  showTopNavStatus({
    title: '皮肤已应用',
    message: skin === 'cats' ? '小猫卡面已启用' : '已切换为空白卡',
    icon: 'success',
    type: 'success',
    durationMs: 2800,
  });
};

const redeemPointsCardCats = async () => {
  if (isRedeemingPointsCardCats.value) return;
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
      cancelText: '暂不兑换',
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
        showTopNavStatus({
          title: '积分不足',
          message: `兑换全员小猫还需 ${Math.max(0, Number(data.required_points || 3) - Number(data.current_points || 0))} 积分`,
          icon: 'warning',
          type: 'warning',
          durationMs: 3600,
        });
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
      durationMs: 3600,
    });
  } catch (error) {
    logger.error('user-space', '兑换全员小猫卡面失败:', error);
    showAlert('error', '兑换失败', error.message || '暂时无法兑换小猫卡面，请稍后重试');
  } finally {
    isRedeemingPointsCardCats.value = false;
  }
};

const deletePointsCardPreset = async (presetId) => {
  const preset = pointsCardPresets.value.find((item) => item.id === String(presetId || ''));
  if (!preset) return;

  const { data, error } = await supabase.rpc('delete_points_card_preset', {
    p_preset_id: preset.id,
  });
  if (error || !data?.ok) {
    logger.error('user-space', '删除积分卡面预设失败:', error || data?.message);
    showTopNavStatus({ title: '删除自定义卡面失败，请重试', icon: 'warning' });
    return;
  }
  await authStore.refreshCurrentUserProfile({ force: true });
  pointsCardPresets.value = pointsCardPresets.value.filter((item) => item.id !== preset.id);
  await loadPointsCardPresetQuota();

  const publicId = String(
    data?.image_public_id ||
      preset.imagePublicId ||
      extractCloudinaryPublicIdFromUrl(data?.image_url || preset.imageUrl),
  ).trim();
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
    durationMs: 2800,
  });
};

watch(
  [assetsSection, isLoggedIn],
  ([, loggedIn]) => {
    if (!loggedIn) {
      pointsCardPresets.value = [];
      pointsCardPresetQuota.value = {
        capacity: 3,
        currentCount: 0,
        tierCode: 'free',
        canAdd: true,
      };
      isPointsCardCatsUnlocked.value = false;
    }
  },
  { immediate: true },
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
        fileType: 'image/webp',
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
        fileType: 'image/webp',
      });
      const ok = await uploadPointsCardFile(compressedFile);
      if (ok) showCropModal.value = false;
      return;
    }

    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    // 头像档位（512px webp）与背景/卡面档位不同源，见 utils/api/avatar-storage.js
    const compressedFile = await prepareAvatarUpload(file);

    await uploadToSupabase(compressedFile);
    showCropModal.value = false;
  } catch (error) {
    logger.error('user-space', '裁切处理失败:', error);
    const targetLabel =
      cropPurpose.value === 'profile-background'
        ? '背景'
        : cropPurpose.value === 'points-card'
          ? '积分卡面'
          : '头像';
    showAlert('error', '处理失败', `${targetLabel}裁切出错，请重试`);
  } finally {
    isProcessingCrop.value = false;
  }
};

const uploadToSupabase = async (file) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showAlert('error', '上传失败', '请先登录');
      return;
    }

    const oldAvatarUrl = avatarUrl.value;

    // 上传新头像（路径 / 破缓存参数 / bucket 约定见 utils/api/avatar-storage.js）
    const { url: finalUrl, filePath } = await uploadAvatarFile(file, user.id);
    await updateProfileAvatar(user.id, finalUrl);

    // 清理旧头像文件（非致命：失败只告警，不影响本次更新）
    const cleanupError = await removeAvatarByUrl(oldAvatarUrl, { exclude: filePath });
    if (cleanupError) logger.warn('user-space', '清理旧头像失败 (非致命错误):', cleanupError);

    await authStore.updateUserProfile({ avatar_url: finalUrl });

    showTopNavStatus({
      title: '头像已更新',
      message: '新的头像已经同步',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'posts',
      durationMs: 4200,
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
      user_metadata: { username: userInfo.value.username },
    });
  }
};

const clearUserSpaceWarmup = () => {
  if (userSpaceWarmupTimeoutId !== null && typeof window !== 'undefined') {
    window.clearTimeout(userSpaceWarmupTimeoutId);
    userSpaceWarmupTimeoutId = null;
  }
};

// ✅ 性能优化 P0-3：switchTab 直调与 route.query.tab watcher(flush:'sync') 会在同一次
// 导航内先后各触发一次关键拉取（实测聚合 RPC ×2 + 2 个 in-flight 计数查询被 abort）。
// 这里加 5s 合并窗口：窗口内的非 force 调用直接短路；force（如 userId 变化）不受影响。
const PROFILE_CRITICAL_FETCH_DEDUPE_MS = 5000;
let profileCriticalFetchesAt = 0;
const runProfileCriticalFetches = ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && now - profileCriticalFetchesAt < PROFILE_CRITICAL_FETCH_DEDUPE_MS) return;
  profileCriticalFetchesAt = now;
  void fetchUserStats({ force });
  void fetchCloudPlusUsage({ force });
  void fetchCloudEntriesForWorks({ force });
  void fetchProfileContent({ force, reset: force });
  void fetchActivityHeatmap({ force });
};

const scheduleUserSpaceWarmup = ({ force = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value.id || typeof window === 'undefined') return;
  clearUserSpaceWarmup();
  userSpaceWarmupTimeoutId = window.setTimeout(
    () => {
      userSpaceWarmupTimeoutId = null;
      if (!isLoggedIn.value || !userInfo.value.id) return;
      if (currentTab.value === 'posts') {
        // ✅ 性能优化 P0-3：posts tab 数据统一收口到 runProfileCriticalFetches（带 5s
        // 合并窗口）。hover 预载也会走到这里，定时器晚于关键拉取触发时若再直拉会
        // 重复请求（实测聚合 RPC ×2 + 计数 HEAD 被后到者 abort）。
        runProfileCriticalFetches();
        return;
      }
      void fetchUserStats({ force });
    },
    currentTab.value === 'posts' ? 120 : 900,
  );
};

// ✅ 性能优化：合并分散的 watch 为单个 watch，减少 Vue 内部开销
watch(
  () => ({
    userId: userInfo.value.id,
    isReady: isInitialized.value,
    points: userInfo.value.points,
    birthMonth: editProfileForm.birthMonth,
    joinYear: editProfileForm.joinYear,
    joinMonth: editProfileForm.joinMonth,
  }),
  async (newVal, oldVal) => {
    const { userId, isReady, points, birthMonth, joinYear, joinMonth } = newVal;

    // 处理用户 ID 变化
    if (userId !== oldVal?.userId) {
      if (userId) {
        await initUserData();
        if (currentTab.value === 'posts') {
          runProfileCriticalFetches({ force: true });
        } else {
          scheduleUserSpaceWarmup({ force: true });
        }
        if (currentTab.value === 'settings' && settingsSection.value === 'home') {
          void fetchPushplusStatus({ force: true });
          void fetchCloudPlusUsage({ force: true });
        }
      } else {
        clearUserSpaceWarmup();
        latestUserStatsFetchToken += 1;
        latestHeatmapFetchToken += 1;
        dataState.stats.loading = false;
        dataState.heatmap.loading = false;
        activityHeatmap.value = null;
        dataState.heatmap.error = null;
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
  { immediate: true },
);

/* ---------- 导航岛实测高度 → --userspace-nav-h ----------
   SegmentTabs 顶部避让消费该变量（Newsroom --nav-h 先例）。
   岛含状态卡时高度会变（78↔130+），静态 inset 必然一头空一头盖。
   左栏另有 --userspace-rail-top-h：只避让导航胶囊本体。AI 岛展开面板是
   surface 内的浮层、不与左侧栏重叠，展开期间顶隙冻结在展开前高度，
   收场等 surface 500ms 高度过渡走完再恢复跟随（避免回落中间值写进去）。 */
let navIslandResizeObserver = null;
let railNavSyncHeld = false;
let railNavSyncTimer = null;

const syncUserspaceNavHeight = () => {
  const root = pageRootRef.value;
  if (!root) return;
  const island = document.getElementById('unified-nav-container');
  if (!island) return;
  /* ⚠️ 只上报「收起态」高度（钳制到 container 的 min-height）：岛展开——不管 AI 岛、
     状态卡还是全局搜索面板——都是悬浮层，页面内容不应为它让位。
     2026-09-27 用户实测：全局搜索一出结果，内容区被推下去 200px+。
     （钳制后，下方 AI 岛的 railNavSync 冻结逻辑变成无害冗余，保留不动。） */
  const measured = Math.ceil(island.getBoundingClientRect().height);
  const restHeight = Number.parseFloat(getComputedStyle(island).minHeight) || 0;
  const h = restHeight > 0 ? Math.min(measured, Math.ceil(restHeight)) : measured;
  if (h > 0) root.style.setProperty('--userspace-nav-h', `${h}px`);
  if (railNavSyncHeld) return;
  if (h > 0) root.style.setProperty('--userspace-rail-top-h', `${h}px`);
};

watch(
  isAiIslandOpen,
  (open) => {
    if (open) {
      railNavSyncHeld = true;
      return;
    }
    if (!railNavSyncHeld) return;
    if (railNavSyncTimer) clearTimeout(railNavSyncTimer);
    railNavSyncTimer = setTimeout(() => {
      railNavSyncTimer = null;
      if (isAiIslandOpen.value) return;
      railNavSyncHeld = false;
      syncUserspaceNavHeight();
    }, 600);
  },
  { immediate: true },
);

onMounted(() => {
  void nextTick(syncUserspaceNavHeight);
  // 佩戴框云同步已上移到全局唯一注册点 initAvatarFrameSync（src/main.js 启动时调用），
  // 这里不再单独同步 —— 否则「新设备不进我的页就拉不到框」的时机依赖又会长回来。
  const islandEl = document.getElementById('unified-nav-container');
  if (islandEl && typeof ResizeObserver !== 'undefined') {
    navIslandResizeObserver = new ResizeObserver(syncUserspaceNavHeight);
    navIslandResizeObserver.observe(islandEl);
  }
  setUserSpaceMountedForPreload(true);
  document.body.classList.add('is-loaded');
  // 初始化主题
  const initialTheme = themeManager.getTheme();
  userSpacePageEl = document.querySelector('.user-space-page');
  if (userSpacePageEl) {
    userSpacePageEl.setAttribute('data-theme', initialTheme);
  }
  currentTheme.value = initialTheme;
  currentThemePreference.value = themeManager.getPreference?.() || initialTheme;
  if (route.query.tab && validTabs.includes(route.query.tab)) {
    // 必须过 resolveRequestedUserSpaceTab：这里曾经直接用 route.query.tab，
    // 旧值（如 assets）一旦不再拥有自己的 tab-page 就会白屏，见该函数注释。
    currentTab.value = resolveAccessibleTab(resolveRequestedUserSpaceTab(route.query.tab), {
      promptLogin: true,
    });
  }
  resolveSectionFromRoute();
  void openSettingsPanelFromRoute();
  ensureTabMounted(currentTab.value);
  // 确保 URL 与当前 tab 同步，否则论坛嵌入式组件的 FAB 按钮检查 route.query.tab 会失败
  if (!route.query.tab || !validTabs.includes(route.query.tab)) {
    syncUserSpaceTabRoute(currentTab.value);
  }
  if (currentTab.value === 'community') {
    scheduleForumPreload(currentTab.value);
  }
  void restoreTabScrollPosition(currentTab.value);
  if (isLoggedIn.value) {
    void initUserData();
    if (currentTab.value === 'posts') {
      runProfileCriticalFetches();
    } else {
      scheduleUserSpaceWarmup();
    }
    if (currentTab.value === 'settings' && settingsSection.value === 'home') {
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

watch(
  () => route.query.tab,
  (newTab) => {
    const nextTab = resolveAccessibleTab(resolveRequestedUserSpaceTab(newTab), {
      promptLogin: true,
    });
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
    resolveSectionFromRoute();
    if (nextTab === 'community') {
      scheduleForumPreload(currentTab.value);
      void activateForumTab();
    }
    if (nextTab === 'posts') {
      void preloadProfileStyles();
      runProfileCriticalFetches();
    }
    if (nextTab === 'settings') {
      void preloadSettingsSubPanels();
      void openSettingsPanelFromRoute();
    }
  },
  { flush: 'sync' },
);

watch(
  () => route.query.assistant,
  (mode) => {
    if (mode === 'quick') {
      openGlobalAi();
    } else if (isAiOverlayOpen.value) {
      closeGlobalAi();
    }
  },
  { immediate: true },
);

watch(isAiOverlayOpen, (open) => {
  if (open || route.query.assistant !== 'quick') return;
  const nextQuery = { ...route.query };
  delete nextQuery.assistant;
  void router.replace({ path: '/user-space', query: nextQuery });
});

watch(
  () => route.query.view,
  () => {
    resolveSectionFromRoute();
    void openSettingsPanelFromRoute();
  },
);

watch(
  () => route.query.setting,
  () => {
    void openSettingsPanelFromRoute();
  },
);

watch(currentTab, (newTab, oldTab) => {
  resetBottomNavAutoHide();
  resolveSectionFromRoute();
  if (oldTab === 'posts') {
    scheduleUserSpaceWarmup();
  }
});

onUnmounted(() => {
  closeSuggestIsland(); // 建议岛是全局导航槽位，页面卸载必须收（项目规则）
  saveTabScrollPosition(currentTab.value);
  setUserSpaceMountedForPreload(false);
  if (navIslandResizeObserver) {
    navIslandResizeObserver.disconnect();
    navIslandResizeObserver = null;
  }
  if (railNavSyncTimer) {
    clearTimeout(railNavSyncTimer);
    railNavSyncTimer = null;
  }
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

// ===== 消息中心智能建议岛：进入「消息 tab · 收件箱」且有未读时，导航岛自动弹「一键全部已读」 =====
// actions 数组即「智能操作预测」插槽：本期只放 mark-all-read，后续动作往数组追加即可，卡片与调度不动。
const SUGGEST_DISMISS_KEY = 'boh_notif_suggest_dismissed';
const messagesHostRef = ref(null);
let suggestIslandHandle = null;
let suggestCloseTimer = null;

const closeSuggestIsland = () => {
  if (suggestCloseTimer) {
    clearTimeout(suggestCloseTimer);
    suggestCloseTimer = null;
  }
  if (suggestIslandHandle) {
    suggestIslandHandle.close();
    suggestIslandHandle = null;
  }
};

let suggestActionRunning = false;
const handleSuggestAction = async (actionId) => {
  if (actionId !== 'mark-all-read' || !suggestIslandHandle) return;
  suggestActionRunning = true;
  suggestIslandHandle.update({ busy: true });
  try {
    // 走 Messages 组件内完整闭环：RPC + 本地列表翻转 + triggerUnreadRefresh
    // silent 让成功反馈只由本岛的 done 态呈现，页面内不再弹同义 toast（避免同一结果两处提示）
    await messagesHostRef.value?.markAllAsRead?.({ silent: true });
  } finally {
    suggestActionRunning = false;
    if (!suggestIslandHandle) return;
    if (unreadCount.value === 0) {
      // 成功态：卡片变「已全部标记为已读」，短暂停留后收起
      suggestIslandHandle.update({ busy: false, done: true });
      suggestCloseTimer = setTimeout(closeSuggestIsland, 1400);
    } else {
      // 未清零（请求失败等）：还原可点，等待重试或倒计时自动收
      suggestIslandHandle.update({ busy: false });
    }
  }
};

const presentSuggestIsland = () => {
  closeSuggestIsland();
  if (!isLoggedIn.value || unreadCount.value <= 0) return;
  // 同批次（未读数未增长）已被用户 × 掉过则不再打扰；未读有新增重新解锁
  const dismissedAtCount = Number(sessionStorage.getItem(SUGGEST_DISMISS_KEY) || 0);
  if (unreadCount.value <= dismissedAtCount) return;
  // 任务岛（发帖/上传进度）在展示时让位，不抢导航 surface
  if (islandTaskView.value) return;
  suggestIslandHandle = showIsland.custom(NotificationSuggestIsland, {
    unreadCount: unreadCount.value,
    busy: false,
    done: false,
    actions: [{ id: 'mark-all-read', label: '全部已读' }],
    lingerMs: 12000,
    onAction: handleSuggestAction,
    onDismiss: () => {
      // × 掉或超时：记住当前未读批次，同批次本会话不再弹
      sessionStorage.setItem(SUGGEST_DISMISS_KEY, String(unreadCount.value));
      closeSuggestIsland();
    },
  });
};

// 用户「来看消息」= 消息 tab 且停在收件箱分区；切走 tab / 切到 AI 分区即收
const isMessagesInboxActive = computed(
  () => currentTab.value === 'messages' && messagesSection.value === 'inbox',
);
// 直达 ?tab=messages 时 notificationStoreRef 是 setup 期的 null 快照（mount 逻辑只在不为 messages
// 的 tab 刷未读数），unreadCount computed 会恒 0 —— 建议岛不弹、底部导航徽标也丢。先确保 store 就位。
void ensureNotificationStore();
watch(
  isMessagesInboxActive,
  (active) => {
    if (active) presentSuggestIsland();
    else closeSuggestIsland();
  },
  { immediate: true },
);

// 未读数变化跟随刷新卡片文案；清零即收（覆盖列表内手动点已读的路径）。
// 计数是异步到达的（直达 ?tab=messages 时 watch 首值可能仍是 0）：岛未展示且收件箱激活时补弹。
// CTA 执行期间清零不立即收——把节奏让给 handleSuggestAction 展示成功态。
watch(unreadCount, (count) => {
  if (suggestIslandHandle) {
    if (count <= 0) {
      if (!suggestActionRunning) closeSuggestIsland();
      return;
    }
    suggestIslandHandle.update({ unreadCount: count });
    return;
  }
  if (isMessagesInboxActive.value && count > 0) presentSuggestIsland();
});
</script>

<style src="./styles/shell-community.css"></style>

<style src="./styles/landscape-rail.css"></style>

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
  background: linear-gradient(
    180deg,
    rgba(16, 163, 127, 0.1) 0%,
    rgba(16, 163, 127, 0.3) 20%,
    rgba(16, 163, 127, 0.5) 50%,
    rgba(16, 163, 127, 0.3) 80%,
    rgba(16, 163, 127, 0.1) 100%
  );
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
.user-space-page[data-theme='dark'] .edge-swipe-indicator {
  background: linear-gradient(
    180deg,
    rgba(80, 200, 255, 0.1) 0%,
    rgba(80, 200, 255, 0.3) 20%,
    rgba(80, 200, 255, 0.5) 50%,
    rgba(80, 200, 255, 0.3) 80%,
    rgba(80, 200, 255, 0.1) 100%
  );
}

/* 边缘滑动提示线进出场（从右缘生长） */
.edge-ind-enter-active {
  transition:
    opacity 200ms ease-out,
    transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
}

.edge-ind-leave-active {
  transition: opacity 240ms ease-out;
}

.edge-ind-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.edge-ind-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .edge-swipe-indicator {
    animation: none;
  }

  .edge-ind-enter-active,
  .edge-ind-leave-active {
    transition-duration: 1ms;
  }
}
</style>

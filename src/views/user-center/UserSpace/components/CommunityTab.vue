<template>
  <div class="page-content">
    <div v-if="isLoadingCommunity && !hasLoadedCommunity" class="community-skeleton" aria-hidden="true">
      <div v-for="group in 3" :key="`community-group-loading-${group}`" class="community-group skeleton">
        <div class="group-header">
          <div class="group-info">
            <div class="skeleton-line community-skeleton-title"></div>
            <div class="skeleton-line community-skeleton-subtitle"></div>
          </div>
          <div class="skeleton-block community-skeleton-arrow"></div>
        </div>
      </div>
      <div class="community-users-list skeleton-users">
        <div v-for="user in 4" :key="`community-user-loading-${user}`" class="user-item">
          <div class="skeleton-block community-user-avatar-skeleton"></div>
          <div class="user-info">
            <div class="skeleton-line community-user-name"></div>
            <div class="skeleton-line community-user-bio"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <button type="button" class="community-group glass-group" @click="toggleCommunityExpand"
        :aria-expanded="isCommunityExpanded">
        <HomeCatMascot v-if="isHomeCatActive" class="community-group-cat" pool="ambient" seed="community-recent"
          size="sm" decorative />
        <div class="group-header">
          <div class="group-info">
            <h3 class="group-title">社区伙伴</h3>
            <span class="group-badge" :class="{ 'badge-loading': isLoadingCommunity && !hasLoadedCommunity }">{{ isLoadingCommunity && !hasLoadedCommunity ? '' : totalCommunityUsers }}</span>
          </div>
          <div class="expand-icon" :class="{ expanded: isCommunityExpanded }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      </button>

      <transition name="expand">
        <div v-if="isCommunityExpanded" class="community-users-list">
          <div class="community-search-bar-glass">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input v-model="communitySearchQuery" type="text" placeholder="搜索社区伙伴..."
              class="community-search-input-glass" />
            <button v-if="communitySearchQuery" class="search-clear-btn" @click.stop="communitySearchQuery = ''" aria-label="清除搜索">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <span v-if="isSearching" class="search-loading-spinner" aria-hidden="true"></span>
          </div>

          <div v-if="totalCommunityPages > 1" class="community-pagination-info">
            <span class="pagination-text">第 {{ currentCommunityPage }} / {{ totalCommunityPages }} 页</span>
          </div>

          <div v-if="communityUsers.length === 0" class="empty-state glass-empty">
            <Users class="empty-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
            <p>{{ communitySearchQuery.trim() ? '没有找到匹配的社区伙伴' : '暂无社区伙伴' }}</p>
          </div>

          <div v-for="(user, index) in communityUsers" :key="user.id" class="user-item glass-user"
            :style="{ '--item-index': index }" @click="goToProfile(user.username)">
            <div class="user-avatar">
              <img v-if="user.avatar_url" :src="user.avatar_url" alt="用户头像" class="avatar-image" loading="lazy"
                decoding="async" />
              <span v-else>{{ user.username ? user.username.charAt(0).toUpperCase() : 'U' }}</span>
              <span v-if="isUserOnline(user, hideOnlineStatus)" class="online-dot" aria-label="在线"></span>
            </div>
            <div class="user-info">
              <div class="user-name-row">
                <span class="user-name" :class="communityTierMap[user.id]">@{{ user.username }}</span>
                <span class="user-status" :class="{ 'status-online': isUserOnline(user, hideOnlineStatus) }"
                  :title="formatOnlineStatusTooltip(user, hideOnlineStatus)">{{ formatUserOnlineStatus(user,
                  hideOnlineStatus) }}</span>
              </div>
              <p class="user-bio">{{ user.bio || '这个人很懒，还没有个性签名' }}</p>
              <div class="user-meta">
                <span v-if="user.birth_month && user.birth_day" class="meta-item">
                  <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  {{ String(user.birth_month).padStart(2, '0') }}/{{ String(user.birth_day).padStart(2, '0') }}
                </span>
                <span v-if="user.join_date" class="meta-item">
                  <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  {{ formatJoinDate(user.join_date) }}
                </span>
                <span v-if="user.followersCount !== undefined || user.followingCount !== undefined"
                  class="meta-item follow-count-combo">
                  <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span v-if="canClickFollow(user)" class="follow-count-link" @click.stop="emit('open-follow-modal', user, 'followers')">粉丝 {{ user.followersCount || 0 }}</span>
                  <template v-else>粉丝 {{ user.followersCount || 0 }}</template>
                  <span class="follow-count-sep">·</span>
                  <span v-if="canClickFollow(user)" class="follow-count-link" @click.stop="emit('open-follow-modal', user, 'following')">关注 {{ user.followingCount || 0 }}</span>
                  <template v-else>关注 {{ user.followingCount || 0 }}</template>
                </span>
              </div>
            </div>
          </div>

          <div v-if="totalCommunityPages > 1" class="community-pagination glass-pagination">
            <button class="community-page-btn glass-page-btn"
              :disabled="isLoadingCommunity || currentCommunityPage === 1"
              @click.stop="currentCommunityPage--" aria-label="上一页">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div class="page-dots">
              <span v-for="page in totalCommunityPages" :key="page" class="page-dot"
                :class="{ active: page === currentCommunityPage }"
                @click.stop="currentCommunityPage = page"
                :aria-label="`第 ${page} 页`"></span>
            </div>
            <button class="community-page-btn glass-page-btn"
              :disabled="isLoadingCommunity || currentCommunityPage === totalCommunityPages"
              @click.stop="currentCommunityPage++" aria-label="下一页">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </transition>

      <button type="button" class="community-group glass-group birthday-group-glass" @click="toggleBirthdaysExpand"
        :aria-expanded="isBirthdaysExpanded">
        <HomeCatMascot v-if="isHomeCatActive" class="community-group-cat birthday-cat" pool="reaction"
          seed="community-birthday" size="sm" decorative />
        <div class="group-header">
          <div class="group-info">
            <h3 class="group-title">最近生日</h3>
            <p class="group-count">{{ birthdayGroupSummary }}</p>
          </div>
          <div class="expand-icon" :class="{ expanded: isBirthdaysExpanded }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      </button>

      <transition name="expand">
        <div v-if="isBirthdaysExpanded" class="community-users-list birthday-users-list">
          <div v-if="isLoadingBirthdays && recentBirthdayUsers.length === 0" class="loading-state compact">
            <div class="loading-spinner"></div>
            <p class="loading-text">正在加载最近生日...</p>
          </div>

          <div v-else-if="recentBirthdayUsers.length === 0" class="empty-state glass-empty">
            <Cake class="empty-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
            <p>暂时没有伙伴设置生日。</p>
          </div>

          <div v-for="(user, index) in recentBirthdayUsers" :key="`birthday-${user.id}`"
            class="user-item glass-user birthday-user-glass"
            :style="{ '--item-index': index }" @click="goToProfile(user.username)">
            <div class="user-avatar">
              <img v-if="user.avatar_url" :src="user.avatar_url" alt="用户头像" class="avatar-image" loading="lazy"
                decoding="async" />
              <span v-else>{{ user.username ? user.username.charAt(0).toUpperCase() : 'U' }}</span>
            </div>
            <div class="user-info">
              <span class="user-name" :class="birthdayTierMap[user.id]">@{{ user.username }}</span>
              <p class="user-bio">{{ formatBirthdayDistance(user) }}</p>
              <div class="user-meta">
                <span class="meta-item birthday-meta">
                  <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  {{ String(user.birth_month).padStart(2, '0') }}/{{ String(user.birth_day).padStart(2, '0') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <div class="shows-entry-card-glass" @click="emit('switch-tab', 'shows')">
        <div class="shows-entry-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
        <div class="shows-entry-content">
          <span class="shows-entry-title">方块节目中心</span>
          <p class="shows-entry-desc">进入节目页，查看社区节目与精选内容</p>
        </div>
        <div class="shows-entry-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Users, Cake } from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { useAuthStore } from '@/stores/auth';
import { useUserOnlineStatus } from '../composables/useUserOnlineStatus.js';
import { createMemoryTtlCache } from '../composables/useMemoryTtlCache.js';
import { getProfilesPage, getRecentBirthdayProfiles } from '@/utils/api/auth-api.js';
import { getFollowCountsBatch } from '@/utils/api/profile-api.js';
import { logger } from '@/utils/logger.js';
import { themeManager } from '@/utils/theme-manager.js';
import { isHomeCatTheme } from '@/utils/home-cat-theme.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { useTierMap } from '@/composables/useTierMap.js';

const emit = defineEmits(['switch-tab', 'open-follow-modal']);

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value));

const { isUserOnline, formatUserOnlineStatus, formatOnlineStatusTooltip } = useUserOnlineStatus();

const hideOnlineStatus = computed(() => userInfo.value?.hideOnlineStatus ?? false);

const { fetchUserTier, getNicknameClass } = useUserTier();

const communityMemoryCache = createMemoryTtlCache();
const CACHE_TTL = {
  community: 2 * 60 * 1000,
  birthdays: 10 * 60 * 1000
};

const isLoadingCommunity = ref(false);
const isLoadingBirthdays = ref(false);
const isCommunityExpanded = ref(true);
const isBirthdaysExpanded = ref(false);
const communityUsers = ref([]);
const recentBirthdayUsers = ref([]);
const communitySearchQuery = ref('');
const debouncedCommunitySearchQuery = ref('');
const currentCommunityPage = ref(1);
const totalCommunityUsers = ref(0);
const COMMUNITY_PAGE_SIZE = 10;
const COMMUNITY_BIRTHDAY_LIMIT = 8;
const hasLoadedCommunity = ref(false);
const hasLoadedBirthdays = ref(false);
const isSearching = ref(false);

let communityRefreshTimer = null;
let communitySearchDebounceTimer = null;
let latestCommunityFetchId = 0;
let latestBirthdayFetchId = 0;

const startCommunityRefreshTimer = () => {
  stopCommunityRefreshTimer();
  communityRefreshTimer = setInterval(() => {
    fetchCommunityUsers({ force: true });
  }, 30 * 1000);
};

const stopCommunityRefreshTimer = () => {
  if (communityRefreshTimer) {
    clearInterval(communityRefreshTimer);
    communityRefreshTimer = null;
  }
};

const handleVisibilityChange = () => {
  if (document.hidden) {
    stopCommunityRefreshTimer();
  } else {
    startCommunityRefreshTimer();
  }
};

const totalCommunityPages = computed(() => Math.max(1, Math.ceil(totalCommunityUsers.value / COMMUNITY_PAGE_SIZE)));

const birthdayGroupSummary = computed(() => {
  if (isLoadingBirthdays.value && recentBirthdayUsers.value.length === 0) {
    return '正在加载最近生日';
  }
  if (!recentBirthdayUsers.value.length) {
    return '查看即将过生日的伙伴';
  }
  const firstBirthday = recentBirthdayUsers.value[0];
  return `${recentBirthdayUsers.value.length} 位伙伴 · ${formatBirthdayDistance(firstBirthday)}`;
});

const formatJoinDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const canClickFollow = (user) => !user.hide_follow_data || user.id === userInfo.value.id;

const formatBirthdayDistance = (user = {}) => {
  const daysUntil = Number(user.birthday_days_until);
  if (!Number.isFinite(daysUntil)) {
    return '生日即将到来';
  }
  if (daysUntil === 0) return '今天生日';
  if (daysUntil === 1) return '明天生日';
  return `${daysUntil} 天后生日`;
};

const toggleCommunityExpand = () => {
  isCommunityExpanded.value = !isCommunityExpanded.value;
};

const toggleBirthdaysExpand = () => {
  isBirthdaysExpanded.value = !isBirthdaysExpanded.value;
  if (isBirthdaysExpanded.value && !hasLoadedBirthdays.value && !isLoadingBirthdays.value) {
    fetchRecentBirthdays();
  }
};

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=community`);
};

const loadCommunityFollowCounts = async () => {
  const users = communityUsers.value;
  if (!users.length) return;
  const ids = users.map(u => u.id).filter(Boolean);
  if (!ids.length) return;
  try {
    const res = await getFollowCountsBatch(ids);
    if (res.ok !== false && res.data) {
      for (const user of users) {
        const counts = res.data[user.id];
        if (counts) {
          user.followersCount = counts.followersCount;
          user.followingCount = counts.followingCount;
        }
      }
    }
  } catch {
    // silent
  }
};

const fetchCommunityUsers = async ({ force = false } = {}) => {
  const searchKey = String(debouncedCommunitySearchQuery.value || '').trim().toLowerCase();
  const cacheKey = `community:${currentCommunityPage.value}:${COMMUNITY_PAGE_SIZE}:${searchKey}`;
  const cachedCommunity = communityMemoryCache.get(cacheKey, CACHE_TTL.community);
  if (!force) {
    if (cachedCommunity) {
      communityUsers.value = cachedCommunity.items || [];
      totalCommunityUsers.value = cachedCommunity.total || 0;
      hasLoadedCommunity.value = true;
      isLoadingCommunity.value = false;
      isSearching.value = false;
      return;
    }
  } else if (cachedCommunity) {
    communityUsers.value = cachedCommunity.items || [];
    totalCommunityUsers.value = cachedCommunity.total || 0;
    hasLoadedCommunity.value = true;
  }

  const fetchId = ++latestCommunityFetchId;
  isLoadingCommunity.value = !hasLoadedCommunity.value;

  try {
    const { data, error } = await getProfilesPage({
      page: currentCommunityPage.value,
      pageSize: COMMUNITY_PAGE_SIZE,
      search: debouncedCommunitySearchQuery.value,
      countMode: 'planned'
    });

    if (fetchId !== latestCommunityFetchId) return;

    if (!error && data) {
      const currentUsername = userInfo.value.username;
      const nowISO = new Date().toISOString();
      communityUsers.value = (data.items || [])
        .map((u) =>
          u.username === currentUsername ? { ...u, last_active_at: nowISO } : u
        )
        .sort((a, b) => {
          const ta = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
          const tb = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
          return tb - ta;
        });
      totalCommunityUsers.value = data.total || 0;
      hasLoadedCommunity.value = true;

      void loadCommunityFollowCounts();

      communityMemoryCache.set(cacheKey, {
        items: communityUsers.value,
        total: totalCommunityUsers.value
      });
    } else {
      communityUsers.value = [];
      totalCommunityUsers.value = 0;
      logger.error('community-tab', '获取社区用户失败:', error);
    }
  } catch (err) {
    if (fetchId !== latestCommunityFetchId) return;
    communityUsers.value = [];
    totalCommunityUsers.value = 0;
    logger.error('community-tab', '加载社区用户异常:', err);
  } finally {
    if (fetchId === latestCommunityFetchId) {
      isLoadingCommunity.value = false;
      isSearching.value = false;
    }
  }
};

const fetchRecentBirthdays = async ({ force = false } = {}) => {
  const cacheKey = `birthdays:${COMMUNITY_BIRTHDAY_LIMIT}`;
  if (!force) {
    const cachedBirthdays = communityMemoryCache.get(cacheKey, CACHE_TTL.birthdays);
    if (cachedBirthdays) {
      recentBirthdayUsers.value = cachedBirthdays;
      hasLoadedBirthdays.value = true;
      isLoadingBirthdays.value = false;
      return;
    }
  }

  const fetchId = ++latestBirthdayFetchId;
  isLoadingBirthdays.value = true;

  try {
    const { data, error } = await getRecentBirthdayProfiles({
      limit: COMMUNITY_BIRTHDAY_LIMIT
    });

    if (fetchId !== latestBirthdayFetchId) return;

    if (!error) {
      recentBirthdayUsers.value = data || [];
      hasLoadedBirthdays.value = true;
      communityMemoryCache.set(cacheKey, recentBirthdayUsers.value);
    } else {
      recentBirthdayUsers.value = [];
      logger.error('community-tab', '获取最近生日失败:', error);
    }
  } catch (err) {
    if (fetchId !== latestBirthdayFetchId) return;
    recentBirthdayUsers.value = [];
    logger.error('community-tab', '加载最近生日异常:', err);
  } finally {
    if (fetchId === latestBirthdayFetchId) {
      isLoadingBirthdays.value = false;
    }
  }
};

const fetchCommunityOverview = async () => {
  await Promise.all([
    fetchCommunityUsers(),
    hasLoadedBirthdays.value ? Promise.resolve() : fetchRecentBirthdays()
  ]);
};

// --- 生命周期 ---

onMounted(() => {
  fetchCommunityOverview();
  startCommunityRefreshTimer();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  stopCommunityRefreshTimer();
  if (communitySearchDebounceTimer) {
    clearTimeout(communitySearchDebounceTimer);
    communitySearchDebounceTimer = null;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

// --- 搜索防抖 ---

watch(communitySearchQuery, (value) => {
  if (communitySearchDebounceTimer) {
    clearTimeout(communitySearchDebounceTimer);
  }
  if (value) {
    isSearching.value = true;
  }
  communitySearchDebounceTimer = setTimeout(() => {
    debouncedCommunitySearchQuery.value = String(value || '').trim();
  }, 300);
});

watch(debouncedCommunitySearchQuery, () => {
  if (currentCommunityPage.value !== 1) {
    currentCommunityPage.value = 1;
    return;
  }
  isSearching.value = true;
  fetchCommunityUsers();
});

watch(currentCommunityPage, () => {
  fetchCommunityUsers();
});

const communityTierMap = useTierMap(
  () => {
    const ids = new Set();
    (communityUsers.value || []).forEach((u) => { if (u?.id) ids.add(u.id); });
    return [...ids];
  },
  getNicknameClass,
  fetchUserTier
);

const birthdayTierMap = useTierMap(
  () => {
    const ids = new Set();
    (recentBirthdayUsers.value || []).forEach((u) => { if (u?.id) ids.add(u.id); });
    return [...ids];
  },
  getNicknameClass,
  fetchUserTier
);
</script>

<style src="../styles/shell-community.css"></style>

<template>
  <div class="partners-container">
    <UserCenterPageHeader title="社区里的伙伴" @back="goBack" />

    <!-- 1. Dashboard Header (Stats) -->
    <div class="dashboard-header">
      <!-- Total Users Card -->
      <div class="stat-card glass-container-light">
        <div class="stat-content">
          <div class="stat-label">社区伙伴</div>
          <div class="stat-value-row">
            <span class="stat-value">{{ totalPartners }}</span>
            <span class="stat-unit">位成员</span>
          </div>
        </div>
        <div class="stat-decoration-circle"></div>
      </div>

      <!-- Online Status Card -->
      <div class="stat-card glass-container-light">
        <div class="stat-content">
          <div class="stat-label">活跃程度</div>
          <div class="stat-value-row">
            <span class="stat-value text-highlight">High</span>
            <span class="stat-unit">持续增长中</span>
          </div>
        </div>
        <div class="stat-decoration-circle type-2"></div>
      </div>
    </div>

    <!-- 2. Partners List Container -->
    <div class="partners-list-container glass-container-light">
      <div class="list-header">
        <h3 class="list-title">成员列表</h3>
        <div class="search-box">
          <input v-model="searchQuery" type="text" placeholder="搜索伙伴..." class="search-input" />
        </div>
      </div>

      <div class="partners-list">
        <div v-if="loading" class="loading-container">
          <p>加载中...</p>
        </div>
        <div v-else-if="partners.length > 0">
          <div v-for="partner in partners" :key="partner.id" class="partner-row">
            <!-- Left: Avatar & Info -->
            <div class="partner-info-group" @click="goToProfile(partner.username)">
              <div class="partner-avatar-wrapper">
                <img v-if="partner.avatar_url" :src="partner.avatar_url" class="partner-avatar-img"
                  :alt="partner.username"  loading="lazy" />
                <span v-else class="partner-avatar-text">{{ partner.username?.charAt(0)?.toUpperCase?.() || '?' }}</span>
                <span v-if="isUserOnline(partner, hideOnlineStatus)" class="online-dot"></span>
              </div>
              <div class="partner-details">
                <div class="partner-title-row">
                  <span class="partner-name">{{ partner.username }}</span>
                  <span class="partner-status" :class="{ 'status-online': isUserOnline(partner, hideOnlineStatus) }" :title="formatOnlineStatusTooltip(partner, hideOnlineStatus)">{{ formatUserOnlineStatus(partner, hideOnlineStatus) }}</span>
                  <span class="partner-role-tag" :class="partner.role">{{ getRoleLabel(partner.role) }}</span>
                </div>
                <div class="partner-meta">
                  <span class="meta-item">
                    <CalendarDays class="meta-icon" :size="13" :stroke-width="1.8" aria-hidden="true" />
                    {{ formatDate(partner.join_date) }} 加入
                  </span>
                  <span class="meta-item">
                    <Sparkles class="meta-icon" :size="13" :stroke-width="1.8" aria-hidden="true" />
                    {{ partner.points || 0 }} 积分
                  </span>
                  <span v-if="partner.followersCount !== undefined" class="meta-item follow-count-item" :class="{ 'clickable-follow-stat': !partner.hide_follow_data || partner.id === userInfo.id }" @click.stop="(!partner.hide_follow_data || partner.id === userInfo.id) ? openPartnerFollowModal(partner, 'followers') : undefined">
                    <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    粉丝 {{ partner.followersCount || 0 }}
                  </span>
                  <span v-if="partner.followingCount !== undefined" class="meta-item follow-count-item" :class="{ 'clickable-follow-stat': !partner.hide_follow_data || partner.id === userInfo.id }" @click.stop="(!partner.hide_follow_data || partner.id === userInfo.id) ? openPartnerFollowModal(partner, 'following') : undefined">
                    <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    关注 {{ partner.followingCount || 0 }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Right: Tags & Action -->
            <div class="partner-right-group">
              <div class="partner-tags" v-if="partner.tags && partner.tags.length > 0">
                <span v-for="tag in partner.tags.slice(0, 2)" :key="tag" class="partner-tag">{{ tag }}</span>
              </div>
              <div class="action-buttons">
                <button class="action-btn-outline view-profile-btn"
                  @click="goToProfile(partner.username)">查看空间</button>
                <button
                  v-if="isLoggedIn && partner.id !== userInfo.id"
                  class="action-btn-outline follow-btn-partner"
                  :class="{ 'is-following': isFollowed(partner.id) }"
                  :disabled="isTogglingFollow(partner.id)"
                  @click.stop="handleToggleFollow(partner)"
                >
                  {{ isTogglingFollow(partner.id) ? '...' : isFollowed(partner.id) ? '已关注' : '关注' }}
                </button>
                <button class="action-btn-outline" @click="openImpressions(partner)">写印象</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="no-partners">
          <p>没有找到匹配的伙伴</p>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination-container" v-if="totalPages > 1">
        <button class="page-btn" :disabled="loading || currentPage === 1" @click="currentPage--">上一页</button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="loading || currentPage === totalPages" @click="currentPage++">下一页</button>
      </div>
    </div>

    <!-- 3. Impressions Modal -->
    <Teleport to="body">
      <Transition name="glass-fade">
        <div v-if="selectedPartner" class="glass-modal-overlay" @click="closeImpressions">
          <div class="glass-modal-container impression-modal" @click.stop>
            <div class="modal-header">
              <div class="user-profile-mini">
                <div class="mini-avatar">
                  <img v-if="selectedPartner.avatar_url" :src="selectedPartner.avatar_url" class="mini-avatar-img"
                    :alt="selectedPartner.username"  loading="lazy" />
                  <span v-else>{{ selectedPartner.username?.charAt(0)?.toUpperCase?.() || '?' }}</span>
                </div>
                <div class="mini-info">
                  <h3>{{ selectedPartner.username }} 的印象墙</h3>
                  <p>大家对 TA 的评价</p>
                </div>
              </div>
              <button class="close-btn" @click="closeImpressions">×</button>
            </div>

            <div class="modal-body custom-scrollbar">
              <!-- Add Impression Form -->
              <div v-if="isLoggedIn && userInfo.id !== selectedPartner.id" class="add-impression-box">
                <textarea v-model="newImpression" placeholder="写下你对 TA 的印象..." class="impression-input"
                  rows="3"></textarea>
                <div class="add-actions">
                  <button class="submit-btn" :disabled="submitting || !newImpression.trim()" @click="submitImpression">
                    {{ submitting ? '提交中...' : '发布印象' }}
                  </button>
                </div>
              </div>

              <!-- Impressions List -->
              <div class="impressions-list">
                <div v-if="loadingImpressions" class="mini-loading">加载中...</div>
                <div v-else-if="impressions.length > 0">
                  <div v-for="imp in impressions" :key="imp.id" class="impression-item">
                    <div class="imp-content">{{ imp.content }}</div>
                    <div class="imp-footer">
                      <div class="imp-author-group" @click="goToProfile(imp.author?.username)">
                        <div class="imp-author-avatar">
                          <img v-if="imp.author?.avatar_url" :src="imp.author?.avatar_url" class="imp-avatar-img"  loading="lazy" />
                          <span v-else>{{ imp.author?.username?.charAt(0)?.toUpperCase?.() || '?' }}</span>
                        </div>
                        <span class="imp-author">— {{ imp.author?.username || '神秘伙伴' }}</span>
                      </div>
                      <div class="imp-actions">
                        <span class="imp-date">{{ formatSimpleDate(imp.created_at) }}</span>
                        <button v-if="canDelete(imp)" class="delete-btn"
                          @click="handleDeleteImpression(imp.id)">删除</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="empty-impressions">
                  <p>还没有人写下印象，快来抢沙发吧！</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <FollowListModal
      :show="partnerFollowModal.show"
      :title="partnerFollowModal.type === 'followers' ? '粉丝' : '关注'"
      :users="partnerFollowModal.users"
      :loading="partnerFollowModal.loading"
      :loading-more="partnerFollowModal.loadingMore"
      :has-more="partnerFollowModal.hasMore"
      :empty-text="partnerFollowModal.type === 'followers' ? '暂无粉丝' : '暂未关注任何人'"
      @close="partnerFollowModal.show = false"
      @load-more="handlePartnerFollowLoadMore"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CalendarDays, Sparkles } from 'lucide-vue-next';
import { getProfilesPage } from '@/utils/api/auth-api.js';
import { getUserImpressions, addUserImpression, deleteUserImpression, followUser, unfollowUser, getFollowCountsBatch, getFollowers, getFollowing } from '@/utils/api/profile-api.js';
import FollowListModal from '@/components/FollowListModal.vue';
import { supabase } from '@/utils/supabase-client.js';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { logger } from '@/utils/logger.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { useUserOnlineStatus } from './UserSpace/composables/useUserOnlineStatus.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

// State
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);
const hideOnlineStatus = computed(() => userInfo.value?.hideOnlineStatus ?? false);

// Follow State
const followedUserIds = ref(new Set());
const togglingFollowIds = ref(new Set());

const isFollowed = (userId) => followedUserIds.value.has(userId);
const isTogglingFollow = (userId) => togglingFollowIds.value.has(userId);

const handleToggleFollow = async (targetUser) => {
  if (!isLoggedIn.value || !targetUser?.id || targetUser.id === userInfo.value.id) return;
  if (isTogglingFollow(targetUser.id)) return;

  togglingFollowIds.value = new Set([...togglingFollowIds.value, targetUser.id]);
  try {
    if (isFollowed(targetUser.id)) {
      const res = await unfollowUser(userInfo.value.id, targetUser.id);
      if (res.ok) {
        const next = new Set(followedUserIds.value);
        next.delete(targetUser.id);
        followedUserIds.value = next;
      }
    } else {
      const res = await followUser(userInfo.value.id, targetUser.id);
      if (res.ok) {
        const next = new Set(followedUserIds.value);
        next.add(targetUser.id);
        followedUserIds.value = next;
      }
    }
  } catch {
    // silent
  } finally {
    const next = new Set(togglingFollowIds.value);
    next.delete(targetUser.id);
    togglingFollowIds.value = next;
  }
};

const loadFollowedUsers = async () => {
  if (!isLoggedIn.value || !userInfo.value.id) return;
  try {
    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userInfo.value.id);
    if (follows) {
      followedUserIds.value = new Set(follows.map(f => f.following_id));
    }
  } catch {
    // silent
  }
};

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}`);
};

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

const partners = ref([]);
const loading = ref(true);
const searchQuery = ref('');
const debouncedSearchQuery = ref('');
const currentPage = ref(1);
const totalPartners = ref(0);
const pageSize = 10;
let searchDebounceTimer = null;
let latestFetchId = 0;
const { isUserOnline, formatUserOnlineStatus, formatOnlineStatusTooltip } = useUserOnlineStatus();

// Impressions State
const selectedPartner = ref(null);
const impressions = ref([]);
const loadingImpressions = ref(false);
const newImpression = ref('');
const submitting = ref(false);

// Methods
const fetchPartners = async () => {
  const fetchId = ++latestFetchId;
  loading.value = true;

  try {
    const { data, error } = await getProfilesPage({
      page: currentPage.value,
      pageSize,
      search: debouncedSearchQuery.value
    });

    if (fetchId !== latestFetchId) {
      return;
    }

    if (!error) {
      const currentUsername = userInfo.value.username;
      const nowISO = new Date().toISOString();
      partners.value = (data?.items || [])
        .map((p) =>
          p.username === currentUsername ? { ...p, last_active_at: nowISO } : p
        )
        .sort((a, b) => {
          const ta = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
          const tb = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
          return tb - ta;
        });
      totalPartners.value = data?.total || 0;
    } else {
      partners.value = [];
      totalPartners.value = 0;
      logger.error('partners', '获取伙伴列表失败:', error);
    }
  } catch (err) {
    if (fetchId !== latestFetchId) {
      return;
    }

    partners.value = [];
    totalPartners.value = 0;
    logger.error('partners', '获取伙伴列表异常:', err);
  } finally {
    if (fetchId === latestFetchId) {
      loading.value = false;
    }
  }
  void loadPartnerFollowCounts();
};

const loadPartnerFollowCounts = async () => {
  const users = partners.value;
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

// Partner Follow List Modal
const partnerFollowModal = reactive({
  show: false,
  type: 'followers',
  targetUser: null,
  users: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  page: 1
});

const openPartnerFollowModal = async (user, type) => {
  if (!user?.id) return;
  partnerFollowModal.show = true;
  partnerFollowModal.type = type;
  partnerFollowModal.targetUser = user;
  partnerFollowModal.users = [];
  partnerFollowModal.page = 1;
  partnerFollowModal.hasMore = false;
  await loadPartnerFollowListPage({ reset: true });
};

const loadPartnerFollowListPage = async ({ reset = false } = {}) => {
  const targetId = partnerFollowModal.targetUser?.id;
  if (!targetId) return;
  if (reset) partnerFollowModal.loading = true;
  else partnerFollowModal.loadingMore = true;
  try {
    const pageToLoad = reset ? 1 : partnerFollowModal.page;
    const loadFn = partnerFollowModal.type === 'followers' ? getFollowers : getFollowing;
    const res = await loadFn(targetId, { page: pageToLoad, pageSize: 20 });
    const incoming = res.error ? [] : (res.data || []);
    partnerFollowModal.users = reset ? incoming : [...partnerFollowModal.users, ...incoming];
    partnerFollowModal.hasMore = incoming.length === 20;
    partnerFollowModal.page = pageToLoad + 1;
  } catch {
    if (reset) partnerFollowModal.users = [];
  } finally {
    partnerFollowModal.loading = false;
    partnerFollowModal.loadingMore = false;
  }
};

const handlePartnerFollowLoadMore = () => {
  loadPartnerFollowListPage();
};

// Computed
const totalPages = computed(() => Math.max(1, Math.ceil(totalPartners.value / pageSize)));

// Impressions Logic
const openImpressions = async (partner) => {
  selectedPartner.value = partner;
  loadingImpressions.value = true;
  try {
    const { data, error } = await getUserImpressions(partner.id);
    if (error) {
      logger.error('partners', '获取印象失败:', error);
    }
    impressions.value = data || [];
  } catch (err) {
    logger.error('partners', '获取印象异常:', err);
    impressions.value = [];
  } finally {
    loadingImpressions.value = false;
  }
};

const closeImpressions = () => {
  selectedPartner.value = null;
  impressions.value = [];
  newImpression.value = '';
};

const submitImpression = async () => {
  if (!newImpression.value.trim() || !isLoggedIn.value) return;
  submitting.value = true;
  try {
    const { error } = await addUserImpression(userInfo.value.id, selectedPartner.value.id, newImpression.value);
    if (!error) {
      newImpression.value = '';
      // Refresh list
      const { data, error: refreshError } = await getUserImpressions(selectedPartner.value.id);
      if (refreshError) {
        logger.error('partners', '刷新印象列表失败:', refreshError);
      }
      impressions.value = data || [];
    } else {
      logger.error('partners', '提交印象失败:', error);
    }
  } catch (err) {
    logger.error('partners', '提交印象异常:', err);
  } finally {
    submitting.value = false;
  }
};

const canDelete = (imp) => {
  if (!isLoggedIn.value) return false;
  return imp.author_id === userInfo.value.id || imp.target_id === userInfo.value.id || userInfo.value.role === 'admin';
};

const handleDeleteImpression = async (id) => {
  if (!await dialog.confirm({
    title: '删除印象',
    message: '确定要删除这条印象吗？',
    tone: 'danger',
    confirmText: '删除'
  })) return;
  try {
    const currentUserId = String(userInfo.value.id || '').trim();
    if (!currentUserId) return;
    const { error } = await deleteUserImpression(id, currentUserId);
    if (!error) {
      impressions.value = impressions.value.filter(i => i.id !== id);
    } else {
      logger.error('partners', '删除印象失败:', error);
    }
  } catch (err) {
    logger.error('partners', '删除印象异常:', err);
  }
};

// Utils
const getRoleLabel = (role) => {
  const labels = { 'admin': '管理员', 'moderator': '版主', 'user': '成员' };
  return labels[role] || '成员';
};

const formatDate = (dateString) => {
  if (!dateString) return '未知时间';
  return new Date(dateString).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatSimpleDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

watch(searchQuery, (value) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    debouncedSearchQuery.value = String(value || '').trim();
  }, 300);
});

watch(debouncedSearchQuery, () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }

  fetchPartners();
});

watch(currentPage, () => {
  fetchPartners();
}, { immediate: true });

watch(isLoggedIn, () => {
  loadFollowedUsers();
}, { immediate: true });

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
});
</script>

<style scoped>
.partners-container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 40px;
  padding: 72px 0 60px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  position: relative;
}

/* X-Style Header */
.x-part-header {
  position: sticky;
  top: 72px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #eff3f4;
}

.x-header-content {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.x-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.x-header-title {
  font-size: 20px;
  font-weight: 800;
  color: #0f1419;
  margin: 0;
}

@media (max-width: 768px) {
  .partners-container {
    padding: 56px 16px 40px;
    gap: 24px;
  }

  .dashboard-header {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .stat-card {
    padding: 24px;
    border-radius: 24px;
  }

  .stat-value {
    font-size: 36px;
  }

  .list-header {
    padding: 24px 20px;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .search-box {
    width: 100%;
  }

  .search-input {
    width: 100%;
  }

  .partner-row {
    padding: 20px;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .partner-right-group {
    width: 100%;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.02);
  }

  .partner-info-group {
    width: 100%;
  }

  .partner-avatar-wrapper {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    font-size: 20px;
  }

  .online-dot {
    width: 10px;
    height: 10px;
  }

  .partner-name {
    font-size: 16px;
  }

  .partner-status {
    font-size: 10px;
  }

  .partner-meta {
    flex-wrap: wrap;
    gap: 8px;
  }
}

.glass-container-light {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 32px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
}

.dashboard-header {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 32px;
}

.stat-card {
  position: relative;
  padding: 40px;
  overflow: hidden;
  transition: transform 0.3s;
}

.stat-card:hover {
  transform: translateY(-6px);
}

.stat-label {
  font-size: 14px;
  color: #86868b;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 16px;
}

.stat-value {
  font-size: 48px;
  font-weight: 800;
  color: #1d1d1f;
  letter-spacing: -0.04em;
}

.stat-value.text-highlight {
  color: #007aff;
}

.stat-decoration-circle {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 160px;
  height: 160px;
  border-radius: 60px;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.005));
  transform: rotate(15deg);
}

.stat-decoration-circle.type-2 {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.05), rgba(0, 122, 255, 0.01));
}

.partners-list-container {
  padding: 0;
  overflow: hidden;
}

.list-header {
  padding: 32px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.list-title {
  font-size: 24px;
  font-weight: 800;
  color: #1d1d1f;
}

.search-input {
  padding: 10px 20px;
  border-radius: 100px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: #f5f5f7;
  width: 240px;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  background: #fff;
  border-color: #007aff;
}

.partner-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 40px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid rgba(0, 0, 0, 0.02);
}

.partner-row:hover {
  background: #fbfbff;
}

.partner-info-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.partner-avatar-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  overflow: visible;
  flex-shrink: 0;
  position: relative;
}

.partner-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.partner-status {
  font-size: 11px;
  font-weight: 600;
  color: #86868b;
  white-space: nowrap;
}

.partner-status.status-online {
  color: #10b981;
}

.online-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #34d399;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1.5px rgba(52, 211, 153, 0.3), 0 2px 6px rgba(52, 211, 153, 0.25);
  z-index: 1;
  pointer-events: none;
}

.partner-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 18px;
}

.partner-avatar-text {
  color: #1d1d1f;
}

.partner-name {
  font-size: 18px;
  font-weight: 700;
}

.partner-role-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}

.partner-role-tag.admin {
  background: #fff1f0;
  color: #ff3b30;
}

.partner-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #86868b;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-icon {
  flex: 0 0 auto;
  stroke: currentColor;
}

.partner-right-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.view-profile-btn {
  border-color: #5856D6;
  color: #5856D6;
}

.view-profile-btn:hover {
  background: rgba(88, 86, 214, 0.05);
}

.partner-tags {
  display: flex;
  gap: 8px;
}

.partner-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 100px;
  background: #f5f5f7;
}

.action-btn-outline {
  padding: 8px 16px;
  border-radius: 100px;
  border: 1px solid #007aff;
  background: transparent;
  color: #007aff;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}

.pagination-container {
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.page-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: #f5f5f7;
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal Styles */
.glass-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.impression-modal {
  width: 500px;
  max-width: 90vw;
  background: white;
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.modal-header {
  padding: 24px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.user-profile-mini {
  display: flex;
  align-items: center;
  gap: 16px;
}

.mini-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.mini-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.modal-body {
  padding: 24px 32px;
  overflow-y: auto;
  flex: 1;
}

.impression-input {
  width: 100%;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #f9f9fb;
  resize: none;
  font-family: inherit;
  outline: none;
}

.submit-btn {
  margin-top: 12px;
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: #007aff;
  color: white;
  border: none;
  font-weight: 700;
  cursor: pointer;
}

.impressions-list {
  margin-top: 32px;
}

.impression-item {
  background: #f8f8fa;
  padding: 16px;
  border-radius: 16px;
  margin-bottom: 16px;
}

.imp-content {
  font-size: 15px;
  color: #1d1d1f;
  line-height: 1.5;
}

.imp-footer {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.imp-author-group {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.imp-author-group:hover {
  opacity: 0.8;
}

.imp-author-avatar {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #f0f0f2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.imp-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.imp-author {
  font-weight: 700;
  color: #86868b;
}

.imp-author-group:hover .imp-author {
  color: #007aff;
  text-decoration: underline;
}

.imp-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.delete-btn {
  color: #ff3b30;
  border: none;
  background: none;
  cursor: pointer;
  font-weight: 600;
}

.close-btn {
  font-size: 28px;
  background: none;
  border: none;
  cursor: pointer;
  color: #86868b;
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e0e0e0;
  border-radius: 10px;
}

.follow-btn-partner {
  border-color: #007aff;
  background: #007aff;
  color: white;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.follow-btn-partner:hover {
  background: #0062cc;
  border-color: #0062cc;
  color: white;
}

.follow-btn-partner.is-following {
  background: white;
  border-color: #c7c7cc;
  color: #86868b;
}

.follow-btn-partner.is-following:hover {
  background: rgba(255, 59, 48, 0.05);
  border-color: #ff3b30;
  color: #ff3b30;
}

.follow-btn-partner:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.follow-count-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #86868b;
}

.clickable-follow-stat {
  cursor: pointer;
  transition: opacity 0.15s;
}

.clickable-follow-stat:hover {
  opacity: 0.7;
}
</style>

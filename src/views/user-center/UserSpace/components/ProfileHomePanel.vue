<template>
  <div key="profile-home" class="profile-home-shell">
    <section class="profile-hero-panel">
      <button type="button" class="profile-cover-band"
        :class="{ 'has-background-image': Boolean(profileBackgroundUrl), 'is-uploading': isUploadingProfileBackground }"
        :style="profileCoverStyle" :disabled="isUploadingProfileBackground"
        :aria-label="isUploadingProfileBackground ? '正在上传个人卡片背景' : '更换个人卡片背景'" title="更换背景"
        @click="$emit('background-click')">
        <span class="profile-cover-glass" aria-hidden="true"></span>
        <span class="profile-cover-action" aria-hidden="true">
          {{ isUploadingProfileBackground ? '上传中' : '更换背景' }}
        </span>
      </button>
      <button type="button" class="profile-settings-btn" @click="$emit('settings')" aria-label="设置"
        title="设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06A2 2 0 1 1 20.53 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.7 1 .6h.6a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z">
          </path>
        </svg>
      </button>

      <div class="profile-identity-stack">
      <div class="profile-hero-body">
        <div class="apple-avatar-wrapper profile-hero-avatar clickable" @click="$emit('avatar-click')">
          <div v-if="avatarUrl" class="apple-avatar has-avatar">
            <img :src="avatarUrl" alt="头像" class="avatar-img" loading="lazy">
          </div>
          <div v-else class="apple-avatar">{{ displayInitial }}</div>
          <div class="avatar-edit-overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        </div>

        <div class="profile-hero-copy">
          <div class="name-row profile-hero-name-row">
            <h1 class="profile-name" :class="nicknameClass">{{ displayName }}</h1>
            <span v-if="isAdmin" class="admin-badge">ADMIN</span>
            <span v-if="tierCode && tierCode !== 'free'" class="tier-badge" :class="`tier-${tierCode}`">{{ tierDisplayName }}</span>
          </div>
          <p class="profile-handle">@{{ displayName || 'user' }}</p>
          <div class="profile-bio-wrap">
            <p ref="bioRef" class="profile-bio" :class="{ clamped: !bioExpanded, expanded: bioExpanded }">{{ profileBio }}</p>
            <button v-if="bioHasOverflow" type="button" class="profile-bio-toggle" @click="toggleBio">
              {{ bioExpanded ? '收起' : '全文' }}
            </button>
          </div>
          <button type="button" class="profile-edit-btn" @click="$emit('edit-profile')">
            编辑资料
          </button>
        </div>
      </div>

      <div class="profile-stats profile-hero-stats profile-stats-compact" :class="{ 'is-loading': isStatsLoading }">
        <template v-if="isStatsLoading">
          <span class="stat-skeleton stat-skeleton-line"></span>
        </template>
        <template v-else>
          <button type="button" class="stat-chip" @click="$emit('switch-tab', 'posts')">
            <span class="stat-chip-num">{{ stats.posts || 0 }}</span>
            <span class="stat-chip-label">发帖</span>
          </button>
          <span class="stat-dot" aria-hidden="true">·</span>
          <span class="stat-chip stat-chip-static">
            <span class="stat-chip-num">{{ formatPoints(stats.points) || '0' }}</span>
            <span class="stat-chip-label">积分</span>
          </span>
          <span class="stat-dot" aria-hidden="true">·</span>
          <button type="button" class="stat-chip clickable-follow-stat" @click="openFollowList('followers')">
            <span class="stat-chip-num">{{ stats.followers || 0 }}</span>
            <span class="stat-chip-label">粉丝</span>
          </button>
          <span class="stat-dot" aria-hidden="true">·</span>
          <button type="button" class="stat-chip clickable-follow-stat" @click="openFollowList('following')">
            <span class="stat-chip-num">{{ stats.following || 0 }}</span>
            <span class="stat-chip-label">关注</span>
          </button>
        </template>
      </div>
      </div>
    </section>

    <section class="profile-points-card-section is-own" aria-label="方块积分卡">
      <div class="profile-points-card-head">
        <span class="profile-points-card-kicker">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          方块积分卡
          <span v-if="tierDisplayName" class="tier-badge" :class="`tier-${tierCode}`" style="margin-left: 4px; height: 18px; font-size: 9px; padding: 0 7px;">{{ tierDisplayName }}</span>
        </span>
        <button type="button" class="profile-points-card-action" @click="handlePointsCardClick">
          设置卡面
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="profile-points-card-wrap">
        <PointsCard
          :points="pointsCardPoints"
          :username="displayName"
          :tier-label="tierDisplayName || 'BOH'"
          :skin="pointsCardSkin"
          :image-url="pointsCardImageUrl"
          interactive
          @click="handlePointsCardClick"
        />
      </div>
      <p class="profile-points-card-hint">点击卡面去设置空白/小猫或自定义卡面</p>
    </section>

    <section class="profile-service-panel" aria-label="服务">
      <div class="profile-section-heading">
        <span>服务</span>
      </div>

      <button type="button" class="profile-service-row" @click="$emit('cloud-plus', 'content')">
        <span class="profile-service-icon bg-teal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
            <path d="M8 9h8"></path>
          </svg>
        </span>
        <span class="profile-service-body">
          <strong>Cloud+</strong>
          <small class="profile-service-hint">{{ cloudPlusUsageText }}</small>
        </span>
        <span class="profile-service-meter"><span :style="cloudPlusUsageMeterStyle"></span></span>
        <span class="profile-action-chevron">›</span>
      </button>

      <button type="button" class="profile-service-row" @click="$emit('assets')">
        <span class="profile-service-icon bg-yellow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>
          </svg>
        </span>
        <span class="profile-service-body">
          <strong>{{ beta5 ? '方块积分' : '积分与礼物' }}</strong>
          <small class="profile-service-hint">{{ formatPoints(stats.points) || '0' }} 积分 · {{ subscriptionSummaryText }}</small>
        </span>
        <span class="profile-action-chevron">›</span>
      </button>

      <button v-if="!beta5" type="button" class="profile-service-row" @click="$emit('sponsor')">
        <span class="profile-service-icon bg-gold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M12 2v20"></path>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </span>
        <span class="profile-service-body">
          <strong>赞助</strong>
          <small>支持项目发展</small>
        </span>
        <span class="profile-action-chevron">›</span>
      </button>
    </section>

    <section class="profile-content-panel">
      <div class="profile-content-tabs" role="tablist" aria-label="我的内容">
        <button v-for="tab in contentTabs" :key="tab.id" type="button" role="tab" class="profile-content-tab"
          :class="{ active: activeContentTab === tab.id }" :aria-selected="activeContentTab === tab.id"
          :aria-busy="tab.loading ? 'true' : 'false'"
          @click="activeContentTab = tab.id">
          {{ tab.label }}
          <span v-if="tab.loading" class="profile-content-count is-loading" aria-hidden="true"><span class="profile-content-count-skeleton"></span></span>
          <span v-else class="profile-content-count">{{ tab.count ?? 0 }}</span>
        </button>
      </div>

      <div v-if="activeContentTab === 'posts' && isContentLoading" class="profile-forum-skeleton-feed" aria-hidden="true">
        <div v-for="item in 3" :key="`my-post-skeleton-${item}`" class="profile-forum-skeleton-card">
          <div class="profile-forum-skeleton-header">
            <div class="profile-forum-skeleton-avatar profile-forum-skeleton-item"></div>
            <div class="profile-forum-skeleton-headlines">
              <div class="profile-forum-skeleton-name profile-forum-skeleton-item"></div>
              <div class="profile-forum-skeleton-time profile-forum-skeleton-item"></div>
            </div>
          </div>
          <div class="profile-forum-skeleton-body">
            <div class="profile-forum-skeleton-title profile-forum-skeleton-item"></div>
            <div class="profile-forum-skeleton-line long profile-forum-skeleton-item"></div>
            <div class="profile-forum-skeleton-line medium profile-forum-skeleton-item"></div>
            <div class="profile-forum-skeleton-line short profile-forum-skeleton-item"></div>
          </div>
          <div class="profile-forum-skeleton-actions">
            <div class="profile-forum-skeleton-action profile-forum-skeleton-item"></div>
            <div class="profile-forum-skeleton-action profile-forum-skeleton-item"></div>
            <div class="profile-forum-skeleton-action profile-forum-skeleton-item"></div>
          </div>
        </div>
      </div>
      <div v-else-if="activeContentTab === 'posts' && posts.length" class="profile-post-grid">
        <article v-for="post in posts" :key="post.id" class="profile-post-card"
          :class="{ 'text-only': !getProfilePostCover(post) }" @click="$emit('post-click', post.id)">
          <div v-if="getProfilePostCover(post)" class="profile-post-cover">
            <img v-if="getProfilePostCover(post)" :src="getProfilePostCover(post)"
              :alt="getProfilePostTitle(post)" loading="lazy" decoding="async">
          </div>
          <div class="profile-post-copy">
            <h3>{{ getProfilePostTitle(post) }}</h3>
            <p>{{ getProfilePostSummary(post) }}</p>
            <div class="profile-post-meta">
              <span>{{ formatProfilePostDate(post) }}</span>
              <span>{{ post.like_count || 0 }}赞</span>
              <span>{{ post.comment_count || 0 }}评</span>
            </div>
          </div>
        </article>
        <div v-if="hasMorePosts" class="profile-load-more-wrap">
          <button class="profile-load-more-btn" :disabled="isLoadingMore" @click.stop="$emit('load-more')">
            {{ isLoadingMore ? '加载中...' : '加载更多帖子' }}
          </button>
        </div>
      </div>
      <div v-else-if="activeContentTab === 'posts'" class="profile-content-empty">
        <h3>还没有发帖</h3>
        <p>发布后的内容会直接出现在这里。</p>
        <button type="button" @click="$emit('switch-tab', 'posts')">去发帖</button>
      </div>

      <div v-else-if="activeContentTab === 'replies' && repliesLoading" class="profile-forum-skeleton-feed" aria-hidden="true">
        <div v-for="item in 3" :key="`reply-skeleton-${item}`" class="profile-forum-skeleton-card">
          <div class="profile-forum-skeleton-line long profile-forum-skeleton-item"></div>
          <div class="profile-forum-skeleton-line medium profile-forum-skeleton-item"></div>
        </div>
      </div>
      <div v-else-if="activeContentTab === 'replies' && replies.length" class="profile-reply-list">
        <button v-for="reply in replies" :key="reply.id" type="button" class="profile-reply-item"
          @click="$emit('post-click', reply.post_id)">
          <span class="profile-reply-target">回复了《{{ getReplyPostTitle(reply) }}》</span>
          <strong>{{ getReplySummary(reply) }}</strong>
          <small>{{ formatProfilePostDate(reply) }}</small>
        </button>
      </div>
      <div v-else-if="activeContentTab === 'replies'" class="profile-content-empty">
        <h3>还没有回复</h3>
        <p>参与讨论后，回复会集中出现在这里。</p>
        <button type="button" @click="$emit('switch-tab', 'posts')">去看看帖子</button>
      </div>

      <div v-else-if="activeContentTab === 'drafts' && !draftsLoaded" class="profile-forum-skeleton-feed" aria-hidden="true">
        <div v-for="item in 2" :key="`draft-skeleton-${item}`" class="profile-forum-skeleton-card">
          <div class="profile-forum-skeleton-line long profile-forum-skeleton-item"></div>
          <div class="profile-forum-skeleton-line medium profile-forum-skeleton-item"></div>
        </div>
      </div>
      <div v-else-if="activeContentTab === 'drafts' && drafts.length" class="profile-draft-list">
        <button v-for="draft in drafts" :key="draft.savedAt" type="button" class="profile-draft-item"
          @click="$emit('switch-tab', 'posts')">
          <span class="profile-draft-badge">草稿</span>
          <strong>{{ draft.title || '未命名帖子' }}</strong>
          <p>{{ getDraftSummary(draft) }}</p>
          <small>{{ formatProfilePostDate({ created_at: draft.savedAt }) }}</small>
        </button>
      </div>
      <div v-else-if="activeContentTab === 'drafts'" class="profile-content-empty">
        <h3>没有未完成的草稿</h3>
        <p>论坛编辑器中保存的帖子草稿会显示在这里。</p>
        <button type="button" @click="$emit('switch-tab', 'posts')">开始写帖子</button>
      </div>
    </section>

    <FollowListModal
      :show="followModal.show"
      :title="followModal.type === 'followers' ? '粉丝' : '关注'"
      :users="followModal.users"
      :loading="followModal.loading"
      :loading-more="followModal.loadingMore"
      :has-more="followModal.hasMore"
      :empty-text="followModal.type === 'followers' ? '暂无粉丝' : '暂未关注任何人'"
      :show-unfollow="followModal.type === 'following'"
      @close="closeFollowList"
      @load-more="loadFollowListMore"
      @unfollow="handleUnfollow"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue';
import FollowListModal from '@/components/FollowListModal.vue';
import PointsCard from './PointsCard.vue';
import { getCommentsByUsername, getFollowers, getFollowing, unfollowUser } from '@/utils/api/profile-api.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { PLAN_DISPLAY_NAMES } from '@/utils/subscription-benefits.js';

const followModal = reactive({
  show: false,
  type: 'followers',
  users: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  currentPage: 1
});
const FOLLOW_PAGE_SIZE = 20;
const activeContentTab = ref('posts');
const replies = ref([]);
const repliesLoading = ref(false);
const repliesLoaded = ref(false);
const drafts = ref([]);
const draftsLoaded = ref(false);
const contentTabs = computed(() => {
  const hasValidStatsCount = Number.isFinite(props.stats?.posts);
  const postsLoading = hasValidStatsCount ? props.isStatsLoading : (props.isStatsLoading || props.isContentLoading);
  const postsCount = postsLoading
    ? null
    : (hasValidStatsCount ? props.stats.posts : props.posts.length);
  const repliesLoadingState = repliesLoading.value || (!repliesLoaded.value && !!profileId.value);
  const repliesCount = repliesLoadingState ? null : replies.value.length;
  const draftsLoadingState = !draftsLoaded.value;
  const draftsCount = draftsLoadingState ? null : drafts.value.length;
  return [
    { id: 'posts', label: '帖子', count: postsCount, loading: postsLoading },
    { id: 'replies', label: '回复', count: repliesCount, loading: repliesLoadingState },
    { id: 'drafts', label: '草稿', count: draftsCount, loading: draftsLoadingState }
  ];
});

const openFollowList = async (type) => {
  followModal.type = type;
  followModal.show = true;
  followModal.users = [];
  followModal.currentPage = 1;
  followModal.hasMore = false;
  followModal.loading = true;
  await loadFollowListPage(type, 1);
  followModal.loading = false;
};

const loadFollowListPage = async (type, page) => {
  const userId = props.profile.id;
  if (!userId) return;
  const fetchFn = type === 'followers' ? getFollowers : getFollowing;
  const res = await fetchFn(userId, { page, pageSize: FOLLOW_PAGE_SIZE });
  if (!res.error && Array.isArray(res.data)) {
    if (page === 1) {
      followModal.users = res.data;
    } else {
      const existingIds = new Set(followModal.users.map(u => u.id));
      const newItems = res.data.filter(u => !existingIds.has(u.id));
      followModal.users = [...followModal.users, ...newItems];
    }
    followModal.hasMore = res.data.length >= FOLLOW_PAGE_SIZE;
  }
};

const loadFollowListMore = async () => {
  if (followModal.loadingMore || !followModal.hasMore) return;
  followModal.loadingMore = true;
  const nextPage = followModal.currentPage + 1;
  await loadFollowListPage(followModal.type, nextPage);
  followModal.currentPage = nextPage;
  followModal.loadingMore = false;
};

const closeFollowList = () => {
  followModal.show = false;
};

const handleUnfollow = async (user) => {
  if (user._unfollowing) return;
  user._unfollowing = true;
  const res = await unfollowUser(props.profile.id, user.id);
  if (!res.error) {
    followModal.users = followModal.users.filter(u => u.id !== user.id);
  }
  user._unfollowing = false;
};

const props = defineProps({
  profile: {
    type: Object,
    default: () => ({})
  },
  avatarUrl: {
    type: String,
    default: ''
  },
  profileBackgroundUrl: {
    type: String,
    default: ''
  },
  profileCoverStyle: {
    type: Object,
    default: () => ({})
  },
  isUploadingProfileBackground: {
    type: Boolean,
    default: false
  },
  beta5: {
    type: Boolean,
    default: false
  },
  stats: {
    type: Object,
    default: () => ({ posts: 0, points: 0, rank: 0 })
  },
  isStatsLoading: {
    type: Boolean,
    default: false
  },
  cloudPlusUsageText: {
    type: String,
    default: ''
  },
  cloudPlusUsageMeterStyle: {
    type: Object,
    default: () => ({})
  },
  subscriptionSummaryText: {
    type: String,
    default: ''
  },
  isContentLoading: {
    type: Boolean,
    default: false
  },
  posts: {
    type: Array,
    default: () => []
  },
  hasMorePosts: {
    type: Boolean,
    default: false
  },
  isLoadingMore: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'edit-profile',
  'settings',
  'avatar-click',
  'background-click',
  'view-impressions',
  'sponsor',
  'assets',
  'data-management',
  'cloud-plus',
  'post-click',
  'switch-tab',
  'load-more'
]);

const displayName = computed(() => props.profile.username || '未登录');

const profileId = computed(() => props.profile.id || '');
const { fetchUserTier, getNicknameClass, getUserTierCode } = useUserTier();
const nicknameClass = ref('');
const tierCode = ref('');
const tierDisplayName = computed(() => PLAN_DISPLAY_NAMES[tierCode.value] || '');
watch(profileId, async (id) => {
  if (id) {
    await fetchUserTier(id);
    nicknameClass.value = getNicknameClass(id);
    tierCode.value = getUserTierCode(id);
  }
}, { immediate: true });
const displayInitial = computed(() => (props.profile.username || 'U').charAt(0).toUpperCase());
const isAdmin = computed(() => props.profile.role === 'admin');

const pointsCardPoints = computed(() => Number(props.profile.points ?? props.stats?.points ?? 0));
const pointsCardSkin = computed(() => {
  const raw = props.profile.pointsCardSkin ?? props.profile.points_card_skin ?? 'blank';
  return ['blank', 'cats', 'custom'].includes(String(raw)) ? String(raw) : 'blank';
});
const pointsCardImageUrl = computed(() => String(props.profile.pointsCardImageUrl ?? props.profile.points_card_image_url ?? '').trim());
const handlePointsCardClick = () => {
  emit('assets', 'cards');
};

const profileBio = computed(() => {
  const bio = String(props.profile.bio || '').trim();
  return bio
    ? bio
    : '这个人很认真地搭着自己的方块。';
});

const bioRef = ref(null);
const bioExpanded = ref(false);
const bioHasOverflow = ref(false);

const toggleBio = () => {
  bioExpanded.value = !bioExpanded.value;
};

onMounted(() => {
  if (bioRef.value) {
    bioHasOverflow.value = bioRef.value.scrollHeight > bioRef.value.clientHeight;
  }
});

const joinDate = computed(() => props.profile.joinDate || '');
const joinDateText = computed(() => {
  const val = joinDate.value;
  if (!val) return '设置入群时间';
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) return val;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
});

const birthday = computed(() => {
  if (props.profile.birthMonth && props.profile.birthDay) {
    return { month: props.profile.birthMonth, day: props.profile.birthDay };
  }
  return null;
});

const birthdayText = computed(() => {
  const b = birthday.value;
  if (!b) return '设置生日';
  const month = Number(b.month);
  const day = Number(b.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return '';
  return `${month}月${day}日`;
});

const formatPoints = (points) => {
  if (!points || points === 0) return '0';
  if (points >= 10000) return (points / 10000).toFixed(1) + 'w';
  if (points >= 1000) return (points / 1000).toFixed(1) + 'k';
  return String(points);
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

const getReplyPostTitle = (reply = {}) => normalizeProfileText(reply.post?.title, '帖子');
const getReplySummary = (reply = {}) => {
  const content = normalizeProfileText(reply.content, '暂无回复内容');
  return content.length > 80 ? `${content.slice(0, 80)}...` : content;
};
const getDraftSummary = (draft = {}) => {
  const content = normalizeProfileText(draft.content, '尚未填写正文');
  return content.length > 72 ? `${content.slice(0, 72)}...` : content;
};

const loadReplies = async () => {
  const username = String(props.profile.username || '').trim();
  const userId = String(props.profile.id || '').trim();
  if (!username && !userId) return;
  repliesLoading.value = true;
  const result = await getCommentsByUsername(username, userId, { page: 1, pageSize: 20 });
  replies.value = result.error ? [] : (result.data || []);
  repliesLoaded.value = true;
  repliesLoading.value = false;
};

const readDrafts = () => {
  const userId = String(props.profile.id || 'guest').trim() || 'guest';
  const keys = [`boh_forum_post_draft_${userId}`, `boh_forum_post_draft_${userId}_versions`];
  const collected = [];
  keys.forEach((key) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || (key.endsWith('_versions') ? '[]' : 'null'));
      const rows = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      rows.forEach((draft) => {
        if (!draft || (!String(draft.title || '').trim() && !String(draft.content || '').trim())) return;
        collected.push({ ...draft, savedAt: Number(draft.savedAt || Date.now()) });
      });
    } catch {
      // Ignore malformed legacy drafts.
    }
  });
  const unique = new Map();
  collected.sort((a, b) => b.savedAt - a.savedAt).forEach((draft) => unique.set(draft.savedAt, draft));
  drafts.value = [...unique.values()].slice(0, 10);
  draftsLoaded.value = true;
};

const handleDraftStorage = (event) => {
  if (String(event.key || '').startsWith('boh_forum_post_draft_')) readDrafts();
};

watch(profileId, () => {
  replies.value = [];
  repliesLoaded.value = false;
  repliesLoading.value = false;
  if (profileId.value) void loadReplies();
  readDrafts();
}, { immediate: true });

watch(activeContentTab, (tab) => {
  if (tab === 'replies' && !repliesLoading.value && !repliesLoaded.value) {
    void loadReplies();
  }
});

onMounted(() => window.addEventListener('storage', handleDraftStorage));
onUnmounted(() => window.removeEventListener('storage', handleDraftStorage));
</script>

<style scoped>
.profile-home-shell {
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 0 0 calc(var(--userspace-bottom-nav-offset, 80px) + 28px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 767px) {
  .profile-home-shell {
    padding: 0 0 0;
    gap: 12px;
  }
}

.profile-hero-panel {
  position: relative;
  overflow: hidden;
  min-height: 300px;
  border-radius: 20px;
  border: 1px solid var(--stroke);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  animation: userspace-panel-in 300ms var(--ease-out) both;
}

.profile-cover-band {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  display: block;
  width: 100%;
  height: 120px;
  padding: 0;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  cursor: pointer;
  color: inherit;
  font: inherit;
  text-align: left;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.02)),
    radial-gradient(circle at 16% 24%, rgba(255, 255, 255, 0.95) 0 12%, transparent 13%),
    radial-gradient(circle at 72% 20%, rgba(255, 255, 255, 0.72) 0 7%, transparent 8%),
    linear-gradient(135deg, #b8d7ce 0%, #e7d7b6 48%, #c7d7ef 100%);
  background-color: transparent;
  background-position: center;
  background-size: cover;
  box-shadow: none;
}

.profile-cover-band:hover {
  background-color: transparent;
}

.profile-cover-band:disabled {
  cursor: wait;
}

.profile-cover-band.has-background-image {
  background-size: cover;
}

.profile-cover-glass {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
  opacity: 0.86;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.profile-cover-band:hover .profile-cover-glass,
.profile-cover-band:focus-visible .profile-cover-glass {
  opacity: 1;
}

.profile-cover-action {
  position: absolute;
  right: 18px;
  bottom: 16px;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
  color: rgba(17, 24, 39, 0.78);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  opacity: 0;
  transform: translateY(4px);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.62);
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  transition: opacity 0.18s ease, transform 0.18s ease;
  pointer-events: none;
}

.profile-cover-band:hover .profile-cover-action,
.profile-cover-band:focus-visible .profile-cover-action,
.profile-cover-band.is-uploading .profile-cover-action {
  opacity: 1;
  transform: translateY(0);
}

.profile-cover-band:focus-visible {
  outline: 2px solid rgba(0, 113, 227, 0.45);
  outline-offset: -3px;
}

.profile-settings-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.84);
  color: #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  transition: transform 0.16s ease, background-color 0.16s ease;
}

.profile-settings-btn:hover {
  transform: translateY(-1px);
  background: #ffffff;
}

.profile-settings-btn svg {
  width: 19px;
  height: 19px;
}

.profile-hero-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 18px;
  align-items: end;
  padding: 0 24px 18px;
  margin-top: -36px;
}

.profile-hero-avatar {
  align-self: start;
}

.profile-hero-avatar .apple-avatar {
  width: 96px;
  height: 96px;
  border-radius: 28px;
  border: 4px solid var(--surface);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2);
  transition: transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
}

.profile-hero-avatar:hover .apple-avatar {
  transform: scale(1.025);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.22);
}

.profile-hero-copy {
  position: relative;
  min-width: 0;
  padding-top: 52px;
  padding-right: 150px;
}

.profile-hero-name-row {
  margin-bottom: 2px;
}

.profile-handle,
.profile-bio-wrap {
  margin: 0;
}

.profile-handle {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.profile-bio-wrap {
  margin-top: 8px;
}

.profile-bio {
  margin: 0;
  max-width: 560px;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.55;
  word-break: break-word;
  overflow-wrap: break-word;
}

.profile-bio.clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.profile-bio.expanded {
  display: block;
}

.profile-bio-toggle {
  display: inline-block;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.16s ease;
}

.profile-bio-toggle:hover {
  color: var(--text-primary);
}

.profile-edit-btn {
  position: absolute;
  right: 0;
  bottom: 0;
  margin-top: 14px;
  min-height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  transition: transform 160ms var(--ease-out), box-shadow 180ms var(--ease-out), background-color 180ms ease;
}

.profile-edit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
}

.profile-edit-btn:active {
  transform: scale(0.98);
}

.profile-hero-stats {
  margin: 0 24px 22px;
  padding-top: 18px;
}

.profile-service-panel {
  overflow: hidden;
  border: 1px solid var(--stroke);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  animation: userspace-panel-in 320ms var(--ease-out) 50ms both;
}


.profile-service-row {
  width: 100%;
  min-height: 52px;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.profile-service-row:hover {
  background: rgba(15, 23, 42, 0.035);
}

.profile-service-row:active {
  background: rgba(15, 23, 42, 0.06);
}

.profile-service-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.profile-service-icon svg {
  width: 17px;
  height: 17px;
}

.profile-service-body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  text-align: left;
}

.profile-service-body strong {
  font-size: 14px;
  font-weight: 900;
  color: var(--text-primary);
  white-space: nowrap;
}

.profile-service-hint {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-service-meter {
  width: 60px;
  height: 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  overflow: hidden;
  flex: 0 0 auto;
}

.profile-service-meter span {
  display: block;
  height: 100%;
  min-width: 5px;
  border-radius: inherit;
  background: linear-gradient(90deg, #14b8a6, #2563eb);
  transition: width 280ms var(--ease-out);
}

.profile-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 8px;
}

.profile-section-heading span {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 900;
}

.profile-section-heading small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.profile-action-chevron {
  color: var(--text-secondary);
  font-size: 24px;
  line-height: 1;
  font-weight: 300;
  flex: 0 0 auto;
  transition: transform 160ms var(--ease-out), color 160ms ease;
}

.profile-content-panel {
  overflow: hidden;
  border: 1px solid var(--stroke);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  animation: userspace-panel-in 340ms var(--ease-out) 90ms both;
}

.profile-post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

@media (max-width: 767px) {
  .profile-post-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    padding-inline: 4px;
  }

  .profile-post-copy {
    padding: 10px;
  }

  .profile-post-copy h3 {
    font-size: 14px;
  }

  .profile-post-cover {
    min-height: 120px;
  }
}

@media (max-width: 767px) and (orientation: portrait) {
  .profile-post-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    padding-inline: 6px;
  }

  .profile-post-cover {
    aspect-ratio: 16 / 10;
    min-height: 0;
  }
}

.profile-load-more-wrap {
  column-span: all;
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}

.profile-load-more-btn {
  padding: 8px 24px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.profile-load-more-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: rgba(15, 23, 42, 0.2);
  color: #1e293b;
}

.profile-load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.profile-post-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  background: #ffffff;
  cursor: pointer;
  transform: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
  animation: profile-post-card-in 260ms ease-out both;
}

@keyframes profile-post-card-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.profile-post-card:hover {
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.11);
}

.profile-post-card.text-only {
  min-height: auto;
}

.profile-post-card.text-only .profile-post-copy {
  padding: 14px;
}

.profile-post-card.text-only .profile-post-copy h3 {
  font-size: 16px;
}

.profile-post-card.text-only .profile-post-copy p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.profile-post-cover {
  position: relative;
  aspect-ratio: 4 / 5;
  background: #eef2f7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 42px;
  font-weight: 900;
  overflow: hidden;
}

.profile-post-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 1;
  transform: none;
  filter: none;
  backface-visibility: hidden;
}

.profile-post-cover.empty {
  background: linear-gradient(135deg, #eef2ff, #f8fafc);
}

.profile-post-copy {
  padding: 12px;
}

.profile-post-copy h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.35;
  font-weight: 800;
}

.profile-post-copy p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.profile-post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.profile-content-empty {
  text-align: center;
  padding: 48px 20px;
  color: var(--text-secondary);
}

.profile-content-empty h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
  color: var(--text-primary);
}

.profile-content-empty p {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.5;
}

.profile-content-empty button {
  margin-top: 16px;
  min-height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.user-space-page[data-theme="dark"] .profile-settings-btn {
  background: rgba(24, 24, 27, 0.82);
  color: #f8fafc;
}

.user-space-page[data-theme="dark"] .profile-post-cover.empty {
  background: linear-gradient(135deg, rgba(49, 46, 129, 0.45), rgba(24, 24, 27, 0.92));
}

/* 最终响应式覆盖：避免竖屏图片重新回到高纵向比例 */
@media (max-width: 767px) and (orientation: portrait) {
  .profile-post-cover,
  .profile-post-card:nth-child(3n+1) .profile-post-cover,
  .profile-post-card:nth-child(4n+2) .profile-post-cover,
  .profile-post-card:nth-child(5n+3) .profile-post-cover {
    aspect-ratio: 3 / 2;
    min-height: 0;
    max-height: 240px;
  }
}

@media (orientation: landscape) {
  .profile-points-card-section {
    width: min(100%, 430px);
    align-self: center;
    box-sizing: border-box;
  }

  .profile-post-cover,
  .profile-post-card:nth-child(3n+1) .profile-post-cover,
  .profile-post-card:nth-child(4n+2) .profile-post-cover,
  .profile-post-card:nth-child(5n+3) .profile-post-cover {
    aspect-ratio: 3 / 2;
    min-height: 0;
  }
}

/* 宽屏：积分卡与服务并排，内容区继续占满整行 */
@media (min-width: 768px) and (orientation: landscape) {
  .profile-home-shell {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 18px;
  }

  .profile-home-shell > .profile-hero-panel,
  .profile-home-shell > .profile-content-panel {
    grid-column: 1 / -1;
  }

  .profile-home-shell > .profile-points-card-section,
  .profile-home-shell > .profile-service-panel {
    width: 100%;
    max-width: none;
    align-self: stretch;
    box-sizing: border-box;
  }
}

.profile-content-count.is-loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  margin-left: 5px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
}

.profile-content-count-skeleton {
  display: inline-block;
  width: 22px;
  height: 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.28);
  position: relative;
  overflow: hidden;
}

.profile-content-count-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0));
  animation: userspace-stat-shimmer 1.15s ease-in-out infinite;
}

.user-space-page[data-theme="dark"] .profile-content-count-skeleton {
  background: rgba(71, 85, 105, 0.5);
}

.user-space-page[data-theme="dark"] .profile-content-count-skeleton::after {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0));
}

@media (prefers-reduced-motion: reduce) {
  .profile-content-count-skeleton::after {
    animation: none;
  }
}

</style>

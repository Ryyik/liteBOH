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
            <h1 class="profile-name">{{ displayName }}</h1>
            <span v-if="isAdmin" class="admin-badge">ADMIN</span>
          </div>
          <p class="profile-handle">@{{ displayName || 'user' }}</p>
          <p class="profile-bio">{{ profileBio }}</p>
          <div class="profile-chip-row">
            <span class="profile-chip">
              {{ joinDateText }}
            </span>
            <span class="profile-chip">
              {{ birthdayText }}
            </span>
          </div>
          <button type="button" class="profile-edit-btn" @click="$emit('edit-profile')">
            编辑资料
          </button>
        </div>
      </div>

      <div class="profile-stats profile-hero-stats" :class="{ 'is-loading': isStatsLoading }">
        <div class="stat-item">
          <template v-if="isStatsLoading">
            <span class="stat-skeleton stat-skeleton-value"></span>
            <span class="stat-skeleton stat-skeleton-label"></span>
          </template>
          <template v-else>
            <span class="stat-value">{{ stats.posts || 0 }}</span>
            <span class="stat-label">发帖</span>
          </template>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <template v-if="isStatsLoading">
            <span class="stat-skeleton stat-skeleton-value"></span>
            <span class="stat-skeleton stat-skeleton-label"></span>
          </template>
          <template v-else>
            <span class="stat-value">{{ formatPoints(stats.points) || '0' }}</span>
            <span class="stat-label">积分</span>
          </template>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <template v-if="isStatsLoading">
            <span class="stat-skeleton stat-skeleton-value"></span>
            <span class="stat-skeleton stat-skeleton-label"></span>
          </template>
          <template v-else>
            <span class="stat-value">#{{ stats.rank || '-' }}</span>
            <span class="stat-label">排名</span>
          </template>
        </div>
      </div>
    </section>

    <section class="profile-status-grid" aria-label="我的关键状态">
      <button type="button" class="profile-status-card cloud" @click="$emit('cloud-plus', 'content')">
        <span class="profile-status-icon bg-teal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
            <path d="M8 9h8"></path>
          </svg>
        </span>
        <span class="profile-status-copy">
          <strong>Cloud+</strong>
          <small>{{ cloudPlusUsageText }}</small>
        </span>
        <span class="profile-status-meter" aria-hidden="true">
          <span :style="cloudPlusUsageMeterStyle"></span>
        </span>
      </button>

      <button type="button" class="profile-status-card subscription"
        @click="$emit('subscription')">
        <span class="profile-status-icon bg-yellow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
          </svg>
        </span>
        <span class="profile-status-copy">
          <strong>订阅权益</strong>
          <small>{{ subscriptionSummaryText }}</small>
        </span>
      </button>

      <button type="button" class="profile-status-card gift"
        @click="$emit('gift')">
        <span class="profile-status-icon bg-green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </span>
        <span class="profile-status-copy">
          <strong>礼物进度</strong>
          <small>{{ giftProgressText || '查看领取与地址' }}</small>
        </span>
      </button>
    </section>

    <section class="profile-action-panel profile-account-panel" aria-label="账户与设置">
      <div class="profile-section-heading">
        <span>账户与设置</span>
        <small>{{ dataPrivacyStatusText }}</small>
      </div>
      <button type="button" class="profile-action-row" @click="$emit('settings')">
        <span class="profile-action-icon bg-blue">
          <Palette :size="17" :stroke-width="2" aria-hidden="true" />
        </span>
        <span class="profile-action-copy">
          <strong>主题与通知</strong>
          <small>{{ themeDisplayText }} · Pushplus {{ pushplusStatusText }}</small>
        </span>
        <span class="profile-action-chevron">›</span>
      </button>
      <button type="button" class="profile-action-row" @click="$emit('data-management')">
        <span class="profile-action-icon bg-gray">
          <User :size="17" :stroke-width="2" aria-hidden="true" />
        </span>
        <span class="profile-action-copy">
          <strong>资料管理</strong>
          <small>基础资料、安全与数据</small>
        </span>
        <span class="profile-action-chevron">›</span>
      </button>
      <button type="button" class="profile-action-row" @click="$emit('sponsor')">
        <span class="profile-action-icon bg-gold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M12 2v20"></path>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </span>
        <span class="profile-action-copy">
          <strong>赞助本站</strong>
          <small>支持本站</small>
        </span>
        <span class="profile-action-chevron">›</span>
      </button>
    </section>

    <section class="profile-content-panel">
      <div class="profile-content-tabs" role="tablist" aria-label="我的内容">
        <button v-for="tab in contentTabs" :key="tab.id" type="button" class="profile-content-tab"
          :class="{ active: activeContentTab === tab.id }" role="tab"
          :aria-selected="activeContentTab === tab.id" @click="$emit('tab-change', tab.id)">
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeContentTab === 'posts'" class="profile-posts-area">
        <div v-if="isContentLoading" class="profile-forum-skeleton-feed" aria-hidden="true">
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
        <div v-else-if="posts.length" class="profile-post-grid">
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
        </div>
        <div v-else class="profile-content-empty">
          <h3>还没有发帖</h3>
          <p>发布后的内容会直接出现在这里。</p>
          <button type="button" @click="$emit('switch-tab', 'posts')">去发帖</button>
        </div>
      </div>

      <div v-else-if="activeContentTab === 'cloud'" class="profile-cloud-embed">
        <AsyncCloudPlus embedded />
      </div>

      <div v-else class="profile-impressions-panel">
        <div class="profile-impressions-head">
          <h3>我的印象</h3>
          <span>{{ impressions.length }}</span>
        </div>
        <div v-if="isImpressionsLoading" class="profile-content-empty">
          <p>正在同步印象...</p>
        </div>
        <div v-else-if="impressions.length" class="profile-impressions-grid">
          <article v-for="imp in impressions" :key="imp.id" class="profile-impression-card">
            <p>{{ imp.content }}</p>
            <div>
              <span>@{{ imp.author?.username || '匿名伙伴' }}</span>
              <button type="button" @click="$emit('delete-impression', imp.id)">移除</button>
            </div>
          </article>
        </div>
        <div v-else class="profile-content-empty">
          <h3>暂无他人印象</h3>
          <p>社区伙伴写给你的印象会显示在这里。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Palette, User } from 'lucide-vue-next';
import { AsyncCloudPlus } from '../async-loaders.js';

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
  giftProgressText: {
    type: String,
    default: ''
  },
  dataPrivacyStatusText: {
    type: String,
    default: ''
  },
  themeDisplayText: {
    type: String,
    default: ''
  },
  pushplusStatusText: {
    type: String,
    default: ''
  },
  contentTabs: {
    type: Array,
    default: () => []
  },
  activeContentTab: {
    type: String,
    default: 'posts'
  },
  isContentLoading: {
    type: Boolean,
    default: false
  },
  posts: {
    type: Array,
    default: () => []
  },
  isImpressionsLoading: {
    type: Boolean,
    default: false
  },
  impressions: {
    type: Array,
    default: () => []
  }
});

defineEmits([
  'edit-profile',
  'settings',
  'avatar-click',
  'background-click',
  'tab-change',
  'sponsor',
  'data-management',
  'cloud-plus',
  'subscription',
  'gift',
  'post-click',
  'switch-tab',
  'delete-impression'
]);

const displayName = computed(() => props.profile.username || '未登录');
const displayInitial = computed(() => (props.profile.username || 'U').charAt(0).toUpperCase());
const isAdmin = computed(() => props.profile.role === 'admin');

const profileBio = computed(() => {
  const bio = String(props.profile.bio || '').trim();
  return bio || '这个人很认真地搭着自己的方块。';
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
</script>

<style scoped>
/* Styles are provided globally via UserSpaceMain's style imports */
</style>
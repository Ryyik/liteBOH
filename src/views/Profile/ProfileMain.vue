<template>
  <div class="profile-page" :data-theme="currentTheme">
    <UserCenterPageHeader title="" @back="goBack" />
    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">

    <div v-if="loading" class="profile-skeleton-wrap" aria-hidden="true">
      <section class="profile-hero-panel" style="border-radius: 20px; overflow: hidden;">
        <div class="profile-cover-band" style="height: 120px; background: var(--skeleton);"></div>
        <div class="profile-hero-body" style="padding: 0 24px 18px; margin-top: -36px;">
          <div class="profile-hero-avatar">
            <div class="apple-avatar" style="width: 96px; height: 96px; border-radius: 28px; background: var(--skeleton);"></div>
          </div>
          <div class="profile-hero-copy" style="padding-top: 52px;">
            <div class="skeleton-title skeleton-item" style="width: 140px; height: 22px; border-radius: 6px; margin-bottom: 8px;"></div>
            <div class="skeleton-line medium skeleton-item" style="width: 100px; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
            <div class="skeleton-line long skeleton-item" style="width: 220px; height: 14px; border-radius: 4px;"></div>
          </div>
        </div>
      </section>
      <div class="profile-post-grid" style="margin-top: 16px;">
        <div v-for="item in 4" :key="`profile-page-loading-${item}`" class="profile-post-card skeleton-item" style="height: 120px; border-radius: 16px;"></div>
      </div>
    </div>

    <div v-else-if="!profile" class="profile-not-found">
      <h2>此账号不存在</h2>
      <p>请尝试搜索其他内容。</p>
    </div>

    <div v-else class="profile-home-shell">
      <section class="profile-hero-panel">
        <div class="profile-cover-band" :class="{ 'has-background-image': Boolean(profileBannerStyle?.backgroundImage) }" :style="profileBannerStyle">
          <span class="profile-cover-glass" aria-hidden="true"></span>
        </div>

        <div class="profile-hero-body">
          <div class="apple-avatar-wrapper profile-hero-avatar" :class="{ clickable: isOwnProfile }" @click="isOwnProfile && handleAvatarClick()">
            <div v-if="profile.avatar_url" class="apple-avatar has-avatar">
              <img :src="profile.avatar_url" alt="头像" class="avatar-img" loading="lazy">
            </div>
            <div v-else class="apple-avatar">{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</div>
            <div v-if="isOwnProfile && isUploadingAvatar" class="avatar-upload-spinner">
              <div class="spinner-ring animate-upload-spin"></div>
            </div>
            <div v-if="isOwnProfile && showUploadSuccess" class="avatar-success-overlay">
              <svg class="success-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div v-if="isOwnProfile" class="avatar-edit-overlay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </div>

          <div class="profile-hero-copy">
            <div class="name-row profile-hero-name-row">
              <h1 class="profile-name" :class="nicknameClass">{{ profile.username }}</h1>
              <span v-if="tierCode && tierCode !== 'free'" class="tier-badge" :class="`tier-${tierCode}`">{{ tierDisplayName }}</span>
              <span class="level-badge" :title="`等级 ${levelInfo.level}`">Lv.{{ levelInfo.level }}</span>
            </div>
            <p class="profile-handle">@{{ profile.username }}</p>

            <div class="profile-bio-wrap">
              <p ref="bioRef" class="profile-bio" :class="{ clamped: !bioExpanded, expanded: bioExpanded }">{{ profile.bio || (isOwnProfile ? '点击编辑资料，向大家介绍一下自己吧。' : '还没有介绍。') }}</p>
              <button v-if="bioHasOverflow" type="button" class="profile-bio-toggle" @click="toggleBio">{{ bioExpanded ? '收起' : '全文' }}</button>
            </div>

            <button v-if="isOwnProfile" class="profile-edit-btn" @click="openEditModal">编辑资料</button>
            <button v-else-if="isLoggedIn" class="profile-edit-btn" :class="{ 'is-following': followState.isFollowing }" :disabled="followState.toggling" @click="handleToggleFollow">{{ followState.toggling ? '处理中...' : (followState.isFollowing ? '已关注' : '关注') }}</button>
          </div>
        </div>

        <div class="profile-stats profile-hero-stats">
          <button class="stat-chip" @click="setActiveTab('posts')">
            <span class="stat-chip-num">{{ totalPostCount }}</span>
            <span class="stat-chip-label">帖子</span>
          </button>
          <span class="stat-dot">·</span>
          <span class="stat-chip stat-chip-static">
            <span class="stat-chip-num">{{ profile.points || 0 }}</span>
            <span class="stat-chip-label">积分</span>
          </span>
          <span class="stat-dot">·</span>
          <button class="stat-chip clickable-follow-stat" @click="openFollowModal('followers')">
            <span class="stat-chip-num">{{ followState.followersCount }}</span>
            <span class="stat-chip-label">粉丝</span>
          </button>
          <span class="stat-dot">·</span>
          <button class="stat-chip clickable-follow-stat" @click="openFollowModal('following')">
            <span class="stat-chip-num">{{ followState.followingCount }}</span>
            <span class="stat-chip-label">关注</span>
          </button>
        </div>
      </section>

      <section class="profile-service-panel" aria-label="用户信息">
        <button v-for="binding in creatorBindings" :key="binding.key" type="button" class="profile-service-row" @click="openCreatorBindingHomepage(binding)">
          <span class="profile-service-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 3h7v7"></path>
              <path d="M10 14L21 3"></path>
              <path d="M21 14v7h-7"></path>
              <path d="M3 10L14 21"></path>
            </svg>
          </span>
          <span class="profile-service-body">
            <strong>{{ binding.label }}{{ isOwnProfile && binding.visibility === 'private' ? '（私密）' : '' }}主页</strong>
          </span>
          <span class="profile-action-chevron">›</span>
        </button>
        <button type="button" class="profile-service-row" @click="setActiveTab('posts')">
          <span class="profile-service-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <span class="profile-service-body">
            <strong>{{ formatDate(profile.join_date) }} 加入</strong>
          </span>
          <span class="profile-action-chevron">›</span>
        </button>
        <button v-if="profile.join_date" type="button" class="profile-service-row" @click="setActiveTab('posts')">
          <span class="profile-service-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </span>
          <span class="profile-service-body">
            <strong>方块年龄 {{ calculateBlockAge(profile.join_date) }} 天</strong>
          </span>
          <span class="profile-action-chevron">›</span>
        </button>
        <div v-if="profile.birth_month && profile.birth_day" class="profile-service-row">
          <span class="profile-service-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
              <path d="M4 16h16" />
              <path d="M12 11V7" />
              <path d="M12 7c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
            </svg>
          </span>
          <span class="profile-service-body">
            <strong>{{ profile.birth_month }}月{{ profile.birth_day }}日 生日</strong>
          </span>
          <span class="profile-action-chevron">›</span>
        </div>
      </section>

      <div class="profile-tabs">
        <button class="tab-item" :class="{ active: activeTab === 'posts' }" @click="setActiveTab('posts')">帖子 <div class="tab-indicator"></div></button>
        <button class="tab-item" :class="{ active: activeTab === 'replies' }" @click="setActiveTab('replies')">回复 <div class="tab-indicator"></div></button>
        <button class="tab-item" :class="{ active: activeTab === 'impressions' }" @click="setActiveTab('impressions')">印象 <div class="tab-indicator"></div></button>
      </div>

      <div class="tab-content-list">
        <div v-if="activeTab === 'posts'" class="posts-list">
          <section v-if="showcasePosts.length > 0 || (isOwnProfile && posts.length > 0)" class="profile-showcase-section">
            <div class="showcase-header">
              <h3>代表作置顶</h3>
              <span>{{ showcasePosts.length }}/3</span>
            </div>
            <p v-if="showcasePosts.length === 0" class="showcase-empty-tip">你还没有设置置顶帖子，点击帖子右上角的"置顶"即可展示代表作。</p>
            <div v-else class="showcase-list">
              <article v-for="post in showcasePosts" :key="`showcase-${post.id}`" class="showcase-item" @click="navigateToPost(post.id)">
                <div class="showcase-item-header">
                  <h4>{{ post.title || '无标题' }}</h4>
                  <button v-if="isOwnProfile" class="showcase-unpin-btn" @click.stop="toggleShowcasePost(post)">取消置顶</button>
                </div>
                <p>{{ post.content }}</p>
              </article>
            </div>
          </section>

          <div v-if="isTabLoading.posts && posts.length === 0" class="profile-feed-skeleton" aria-hidden="true">
            <div v-for="item in 3" :key="`posts-loading-${item}`" class="profile-feed-skeleton-item">
              <div class="profile-skeleton-block profile-feed-avatar"></div>
              <div class="profile-feed-skeleton-body">
                <div class="profile-skeleton-block profile-feed-line name"></div>
                <div class="profile-skeleton-block profile-feed-line title"></div>
                <div class="profile-skeleton-block profile-feed-line text"></div>
                <div class="profile-skeleton-block profile-feed-line short"></div>
              </div>
            </div>
          </div>
          <div v-else-if="posts.length === 0" class="empty-list-state">
            <h3>暂无发布过的帖子</h3>
            <p>发布的帖子会出现在这里。</p>
            <button v-if="isOwnProfile" class="empty-action-btn" @click="showPostModal = true">立即发帖</button>
            <button v-else class="empty-action-btn" @click="router.push('/user-space?tab=posts')">去方块社区看看</button>
          </div>
          <div v-else class="profile-post-grid">
            <article v-for="(post, index) in posts" :key="post.id" class="profile-post-card"
              :class="{ 'text-only': !post.images?.length, 'image-post-card-v2': post.images?.length }"
              :style="{ '--post-appear-delay': `${Math.min(index, 8) * 45}ms` }"
              @click="navigateToPost(post.id)">
              <div v-if="isOwnProfile" class="profile-post-pin-action">
                <button class="pin-post-btn" @click.stop="toggleShowcasePost(post)" :disabled="!isShowcasedPost(post.id) && showcasePosts.length >= 3">
                  {{ isShowcasedPost(post.id) ? '已置顶' : '置顶' }}
                </button>
              </div>
              <figure v-if="isHomeCatActive" class="post-card-theme-cat" :class="getPostCardCatVariant(index)" aria-hidden="true">
                <img :src="getPostCardCatSrc(post, index)" alt="" draggable="false" loading="lazy" />
              </figure>
              <figure v-if="isHomeCatActive && shouldShowPostBackgroundCat(post, index)" class="post-card-background-cat" aria-hidden="true">
                <img :src="getPostBackgroundCatSrc(post, index)" alt="" draggable="false" loading="lazy" />
              </figure>
              <div class="profile-post-cover" v-if="getProfilePostCover(post)">
                <img :src="getProfilePostCover(post)" :alt="post.title || '帖子封面'" loading="lazy" decoding="async" />
              </div>
              <div class="profile-post-copy">
                <h3>{{ post.title || '无标题' }}</h3>
                <p>{{ getProfilePostSummary(post) }}</p>
                <div class="profile-post-meta">
                  <span>{{ formatProfilePostDate(post) }}</span>
                  <span>{{ post.like_count || 0 }}赞</span>
                  <span>{{ post.comment_count || 0 }}评</span>
                </div>
              </div>
            </article>
          </div>
          <div v-if="posts.length > 0 && hasMorePosts" class="list-load-more-wrap">
            <button class="load-more-btn" :disabled="isTabLoading.posts" @click="loadMorePosts">
              {{ isTabLoading.posts ? '加载中...' : '加载更多帖子' }}
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'replies'" class="profile-replies-list">
          <div v-if="isTabLoading.replies && comments.length === 0" class="profile-feed-skeleton" aria-hidden="true">
            <div v-for="item in 3" :key="`replies-loading-${item}`" class="profile-feed-skeleton-item">
              <div class="profile-skeleton-block profile-feed-avatar"></div>
              <div class="profile-feed-skeleton-body">
                <div class="profile-skeleton-block profile-feed-line name"></div>
                <div class="profile-skeleton-block profile-feed-line title"></div>
                <div class="profile-skeleton-block profile-feed-line text"></div>
                <div class="profile-skeleton-block profile-feed-line short"></div>
              </div>
            </div>
          </div>
          <div v-else-if="comments.length === 0" class="empty-list-state">
            <h3>暂无回复</h3>
            <p>对他人的回复会出现在这里。</p>
            <button class="empty-action-btn" @click="router.push('/user-space?tab=posts')">去方块社区互动</button>
          </div>
          <div v-else class="replies-list">
            <article v-for="comment in comments" :key="comment.id" class="feed-item reply-item">
              <div class="item-avatar">
                <div class="avatar-mini">
                  <img v-if="comment.author?.avatar_url" :src="comment.author.avatar_url" alt="avatar" class="avatar-mini-img" loading="lazy" decoding="async" />
                  <span v-else>{{ comment.author?.username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                </div>
              </div>
              <div class="item-main">
                <div class="item-header">
                  <span class="item-author" :class="commentTierMap[comment.author_id]">{{ comment.author?.username || '用户' }}</span>
                  <span class="item-handle">@{{ comment.author?.username || '未知' }} · {{ formatTime(comment.created_at) }}</span>
                </div>
                <div class="replying-to" v-if="comment.post">
                  回复 <span class="mention">@{{ comment.post?.author_username || '未知用户' }}</span>
                </div>
                <div class="item-text">{{ comment.content }}</div>
                <div class="quoted-post" v-if="comment.post" @click="navigateToPost(comment.post_id)">
                  <p class="quoted-text">{{ comment.post.content?.substring(0, 100) }}...</p>
                </div>
              </div>
            </article>
          </div>
          <div v-if="comments.length > 0 && hasMoreComments" class="list-load-more-wrap">
            <button class="load-more-btn" :disabled="isTabLoading.replies" @click="loadMoreComments">
              {{ isTabLoading.replies ? '加载中...' : '加载更多回复' }}
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'impressions'" class="impressions-list-tab">
          <div v-if="isTabLoading.impressions && impressions.length === 0" class="profile-feed-skeleton" aria-hidden="true">
            <div v-for="item in 3" :key="`impression-loading-${item}`" class="profile-feed-skeleton-item">
              <div class="profile-skeleton-block profile-feed-line name"></div>
              <div class="profile-skeleton-block profile-feed-line text"></div>
              <div class="profile-skeleton-block profile-feed-line short"></div>
            </div>
          </div>
          <div v-if="impressions.length > 0" class="word-cloud-section">
            <div class="word-cloud-header">
              <h3 class="word-cloud-title">印象词云</h3>
              <span class="word-cloud-subtitle">基于 {{ impressions.length }} 条印象生成</span>
            </div>
            <WordCloud :words="wordCloudData" :height="200" />
          </div>
          <div v-if="!isOwnProfile && isLoggedIn" class="add-impression-section">
            <textarea v-model="newImpressionContent" placeholder="写下你对 TA 的印象..." rows="3" maxlength="100"></textarea>
            <div class="add-imp-actions">
              <span class="char-hint">{{ newImpressionContent.length }}/100</span>
              <button class="submit-imp-btn" :disabled="!newImpressionContent.trim() || submittingImpression" @click="handleSubmitImpression">
                {{ submittingImpression ? '发布中...' : '发布印象' }}
              </button>
            </div>
          </div>
          <div v-if="!isTabLoading.impressions && impressions.length === 0" class="empty-list-state">
            <h3>暂无他人印象</h3>
            <p>关于 {{ profile.username }} 的评价会出现在这里。</p>
          </div>
          <div v-if="impressions.length > 0" class="impressions-wall-profile">
            <div v-for="imp in impressions" :key="imp.id" class="impression-card-profile">
              <p class="imp-text">{{ imp.content }}</p>
              <div class="imp-footer">
                <span class="imp-author" :class="impressionTierMap[imp.author_id]" @click="goToProfileRoute(imp.author?.username)">@{{ imp.author?.username || '匿名' }}</span>
                <div class="imp-footer-right">
                  <span class="imp-date">{{ formatTime(imp.created_at) }}</span>
                  <button v-if="canDeleteImpression(imp)" class="delete-imp-btn" @click="handleDeleteImpression(imp)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6v14a2,2 0,0,1,-2,2H7a2,2 0,0,1,-2,-2V6m3,0V4a2,2 0,0,1,2,-2h4a2,2 0,0,1,2,2v2"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="impressions.length > 0 && hasMoreImpressions" class="list-load-more-wrap">
            <button class="load-more-btn" :disabled="isTabLoading.impressions" @click="loadMoreImpressions">
              {{ isTabLoading.impressions ? '加载中...' : '加载更多印象' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ProfileEditModal
      :show="showEditModal"
      :profile="profile"
      :saving="saving"
      @close="showEditModal = false"
      @save="handleSaveProfile"
      @avatar-click="handleAvatarClick"
      @show-alert="(type, title, message) => showAlert(type, title, message)"
    />

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title" :message="alertState.message" />

    <AvatarCropModal v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop" @confirm="handleCropConfirm" />

    <PostCreateModal :show="showPostModal" :submitting="isSubmittingPost" @close="showPostModal = false" @submit="handleCreatePost" />

    <FollowListModal :show="followModal.show" :title="followModal.type === 'followers' ? '粉丝' : '关注'" :users="followModal.users" :loading="followModal.loading" :loading-more="followModal.loadingMore" :has-more="followModal.hasMore" :empty-text="followModal.type === 'followers' ? '暂无粉丝' : '暂未关注任何人'" @close="followModal.show = false" @load-more="handleFollowListLoadMore" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { useUserTier } from '@/composables/useUserTier.js';
import { useTierMap } from '@/composables/useTierMap.js';
import { PLAN_DISPLAY_NAMES } from '@/utils/subscription-benefits.js';

const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);
const { updateUserProfile } = authStore;
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import WordCloud from '@/components/WordCloud.vue';
import ProfileEditModal from './components/ProfileEditModal.vue';
import PostCreateModal from './components/PostCreateModal.vue';
import { supabase } from '@/utils/supabase-client.js';
import {
  getProfileByUsername,
  getPostsByUsername,
  getPostsByIds,
  getCommentsByUsername,
  getUserImpressions,
  addUserImpression,
  deleteUserImpression,
  updateProfileAvatar,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowCounts,
  getFollowers,
  getFollowing
} from '@/utils/api/profile-api.js';
import { createPost, toggleLike } from '@/utils/api/forum-api.js';
import { getCloudinaryDisplayUrl } from '@/utils/cloudinary-client.js'
import { themeManager } from '@/utils/theme-manager.js';
import { isHomeCatTheme, getHomeCatAsset, getHomeCatTypeBySeed } from '@/utils/home-cat-theme.js';
import { formatSmartTime } from '@/utils/time.js';
import { getLevelInfo } from '@/utils/xp.js';
import { notify } from '@/utils/notify.js';
import { useUserOnlineStatus } from '@/views/user-center/UserSpace/composables/useUserOnlineStatus.js';
import imageCompression from 'browser-image-compression';
import {
  buildCreatorPlatformJumpUrl,
  CREATOR_PLATFORM_KEYS,
  creatorPlatformsMeta,
  normalizeCreatorPlatformIds
} from './creatorPlatforms.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import FollowListModal from '@/components/FollowListModal.vue';

const router = useRouter();
const route = useRoute();
const goBack = () => {
  const from = route.query.from;
  if (from === 'community') {
    router.push('/user-space?tab=community');
  } else if (from === 'forum') {
    router.push('/forum');
  } else if (from === 'profile' || from === 'post-detail') {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/user-space?tab=community');
    }
  } else {
    router.push('/user-space?tab=community');
  }
};
const dialog = useConfirmDialog();
const CREATOR_VISIBILITY_VALUES = new Set(['public', 'private']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeCreatorPlatformVisibility = (raw, availableKeys = CREATOR_PLATFORM_KEYS) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const normalized = {};
  const keySet = new Set(availableKeys);
  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key)) continue;
    const value = String(raw[key] || '').trim().toLowerCase();
    normalized[key] = CREATOR_VISIBILITY_VALUES.has(value) ? value : 'public';
  }
  return normalized;
};

const normalizeCreatorPlatformOrder = (raw, availableKeys = CREATOR_PLATFORM_KEYS) => {
  const list = Array.isArray(raw) ? raw : [];
  const keySet = new Set(availableKeys);
  const seen = new Set();
  const normalized = [];

  for (const item of list) {
    const key = String(item || '').trim();
    if (!CREATOR_PLATFORM_KEYS.includes(key)) continue;
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
};

const normalizeShowcasePostIds = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const ids = [];
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || seen.has(id) || !UUID_REGEX.test(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 3) break;
  }
  return ids;
};

const fetchedProfile = ref(null);
const ownProfileSnapshot = ref({
  username: '',
  bio: '',
  avatar_url: '',
  join_date: '',
  points: 0,
  birth_month: '',
  birth_day: '',
  experience: 0,
  tags: [],
  is_boh_creator: false,
  creator_platform_ids: {},
  creator_platform_visibility: {},
  creator_platform_order: [],
  showcase_post_ids: [],
  profile_background_url: '',
  id: ''
});
const profileFetchVersion = ref(0);
const PROFILE_PAGE_SIZE = 15;
const PROFILE_SYNC_MIN_INTERVAL_MS = 1200;
let lastProfileSyncAt = 0;
let profileFetchInflight = null;
let profileFetchInflightUsername = '';

const posts = ref([]);
const totalPostCount = ref(0);
const comments = ref([]);
const impressions = ref([]);
const loading = ref(true);
const activeTab = ref('posts');
const isTabLoading = reactive({
  posts: false,
  replies: false,
  impressions: false
});
const tabLoaded = reactive({
  posts: false,
  replies: false,
  impressions: false
});
const postsPage = ref(1);
const commentsPage = ref(1);
const impressionsPage = ref(1);
const hasMorePosts = ref(true);
const hasMoreComments = ref(true);
const hasMoreImpressions = ref(true);

const isOwnProfile = computed(() => {
  return isLoggedIn.value && userInfo.value.username === route.params.username;
});

const profile = computed(() => {
  return isOwnProfile.value ? ownProfileSnapshot.value : fetchedProfile.value;
});

const { fetchUserTier, fetchUserTiersBatch, getNicknameClass, getUserTierCode } = useUserTier();
const nicknameClass = ref('');
const tierCode = ref('');
const tierDisplayName = computed(() => PLAN_DISPLAY_NAMES[tierCode.value] || '');
watch(() => profile.value?.id, async (id) => {
  if (id) {
    await fetchUserTier(id);
    nicknameClass.value = getNicknameClass(id);
    tierCode.value = getUserTierCode(id);
  } else {
    nicknameClass.value = '';
    tierCode.value = '';
  }
}, { immediate: true });

const commentTierMap = useTierMap(
  () => {
    const ids = new Set();
    (comments.value || []).forEach((c) => { if (c?.author_id) ids.add(c.author_id); });
    return [...ids];
  },
  getNicknameClass,
  fetchUserTier,
  fetchUserTiersBatch
);

const impressionTierMap = useTierMap(
  () => {
    const ids = new Set();
    (impressions.value || []).forEach((imp) => { if (imp?.author_id) ids.add(imp.author_id); });
    return [...ids];
  },
  getNicknameClass,
  fetchUserTier,
  fetchUserTiersBatch
);

const profileBannerStyle = computed(() => {
  const url = profile.value?.profile_background_url;
  if (!url) return {};
  const displayUrl = getCloudinaryDisplayUrl(url);
  if (!displayUrl) return {};
  return {
    backgroundImage: `url("${displayUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };
});

const creatorBindings = computed(() => {
  const normalized = normalizeCreatorPlatformIds(profile.value?.creator_platform_ids);
  const normalizedVisibility = normalizeCreatorPlatformVisibility(
    profile.value?.creator_platform_visibility,
    Object.keys(normalized)
  );
  const normalizedOrder = normalizeCreatorPlatformOrder(
    profile.value?.creator_platform_order,
    Object.keys(normalized)
  );

  const ordered = normalizedOrder.map((key) => creatorPlatformsMeta.find((platform) => platform.key === key)).filter(Boolean);
  return creatorPlatformsMeta
    .filter((platform) => normalized[platform.key])
    .map((platform) => ({
      key: platform.key,
      label: platform.label,
      id: normalized[platform.key],
      visibility: normalizedVisibility[platform.key] || 'public'
    }))
    .sort((a, b) => {
      const indexA = ordered.findIndex((item) => item.key === a.key);
      const indexB = ordered.findIndex((item) => item.key === b.key);
      return indexA - indexB;
    })
    .filter((binding) => isOwnProfile.value || binding.visibility === 'public');
});

const formatTime = formatSmartTime;

const stopWords = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '他', '她', '它', '们', '这个', '那个', '什么', '怎么',
  '为什么', '哪', '哪里', '哪个', '如何', '但', '但是', '而', '而且', '或', '或者',
  '因为', '所以', '如果', '虽然', '可以', '可能', '应该', '能', '能够', '还',
  '还是', '只', '只是', '只有', '就是', '不是', '没', '真的', '非常', '太',
  '更', '最', '比较', '相当', '特别', '十分', '有点', '一些', '一点', '很多',
  '许多', '这样', '那样', '怎样', '多么', '多少', '几', '第', '让', '把', '被',
  '给', '向', '从', '对', '与', '及', '等', '等等', '之', '其', '此', '彼',
  '啊', '呢', '吧', '吗', '呀', '哦', '嗯', '哈', '呵', '嘿', '哎', '唉',
  '哇', '噢', '咦', '嘘', '哼', '嘛', '罢', '啦', '嘞', '喽', '咯', '咧'
]);

const segmentText = (text) => {
  const words = [];
  const segments = text.split(/[\s,，。！？!?.;；：:""''「」【】()（）\[\]{}、\n\r\t]+/);

  for (const segment of segments) {
    if (segment.length === 0) continue;

    if (/^[\u4e00-\u9fa5]+$/.test(segment)) {
      let i = 0;
      while (i < segment.length) {
        let matched = false;
        for (let len = 4; len >= 2; len--) {
          if (i + len <= segment.length) {
            const word = segment.substring(i, i + len);
            if (!stopWords.has(word)) {
              words.push(word);
              i += len;
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          const char = segment[i];
          if (!stopWords.has(char) && /[\u4e00-\u9fa5]/.test(char)) {
            words.push(char);
          }
          i++;
        }
      }
    } else if (/^[a-zA-Z]+$/.test(segment)) {
      const lowerWord = segment.toLowerCase();
      if (lowerWord.length >= 2 && !stopWords.has(lowerWord)) {
        words.push(lowerWord);
      }
    }
  }

  return words;
};

const wordCloudData = computed(() => {
  if (impressions.value.length === 0) return [];

  const wordCount = new Map();

  for (const imp of impressions.value) {
    if (!imp.content) continue;
    const words = segmentText(imp.content);
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  }

  const sortedWords = Array.from(wordCount.entries())
    .map(([text, count]) => ({ text, count }))
    .filter(item => item.count >= 1 && item.text.length >= 2)
    .sort((a, b) => b.count - a.count);

  const filtered = [];
  const seen = new Set();

  for (const word of sortedWords) {
    let shouldAdd = true;
    for (const existing of filtered) {
      if (existing.text.includes(word.text) || word.text.includes(existing.text)) {
        if (existing.count >= word.count) {
          shouldAdd = false;
          break;
        } else {
          const idx = filtered.indexOf(existing);
          filtered.splice(idx, 1);
          seen.delete(existing.text);
        }
      }
    }
    if (shouldAdd && !seen.has(word.text)) {
      filtered.push(word);
      seen.add(word.text);
    }
    if (filtered.length >= 30) break;
  }

  return filtered;
});

const normalizeProfileText = (value, fallback = '') => {
  const safeValue = String(value || '').trim();
  return safeValue || fallback;
};

const getProfilePostCover = (post = {}) => {
  const cover = String(post.cover_image_url || '').trim();
  if (cover) return cover;
  const images = Array.isArray(post.images) ? post.images : [];
  const firstImage = images[0] || null;
  return String(firstImage?.url || firstImage?.originalUrl || '').trim();
};

const getProfilePostSummary = (post = {}) => {
  const body = normalizeProfileText(post.content || post.body, '');
  return body.length > 88 ? `${body.slice(0, 88)}...` : (body || '暂无正文');
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

// 等级信息计算
const levelInfo = computed(() => getLevelInfo(profile.value.experience || 0));

const normalizedShowcaseIds = computed(() => normalizeShowcasePostIds(profile.value?.showcase_post_ids));
const showcasePostsById = computed(() => {
  const map = new Map();
  for (const post of showcasePostsFetched.value) {
    if (!post?.id) continue;
    map.set(post.id, post);
  }
  for (const post of posts.value) {
    if (!post?.id) continue;
    map.set(post.id, post);
  }
  return map;
});
const showcasePostsOrdered = computed(() => normalizedShowcaseIds.value
  .map((id) => showcasePostsById.value.get(id))
  .filter(Boolean)
);
const showcasePosts = computed(() => showcasePostsOrdered.value);

const bioRef = ref(null);
const bioExpanded = ref(false);
const bioHasOverflow = ref(false);

const toggleBio = () => {
  bioExpanded.value = !bioExpanded.value;
};

// 印象墙相关
const newImpressionContent = ref('');
const submittingImpression = ref(false);

// 发帖相关
const showPostModal = ref(false);
const isSubmittingPost = ref(false);

const showEditModal = ref(false);
const showcasePostsFetched = ref([]);
const saving = ref(false);
const avatarInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const isProcessingCrop = ref(false);
const isUploadingAvatar = ref(false);
const showUploadSuccess = ref(false);

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const hideOnlineStatus = computed(() => userInfo.value?.hideOnlineStatus ?? false);

const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value));

const getPostCardCatType = (index, post) => {
  if (post?.isLiked || Number(post?.like_count || 0) >= 8) return 'like';
  return ['decorAlt', 'decor', 'theme', 'cardExtra', 'mobileGap'][Number(index) % 5];
};
const getPostCardCatVariant = (index) => `cat-variant-${Number(index) % 4}`;
const getPostCardCatSeed = (post, index, suffix = 'card') => `${post?.id || index}:${suffix}`;
const getPostCardCatSrc = (post, index) => getHomeCatAsset(getPostCardCatType(index, post));
const getPostBackgroundCatSrc = (post, index) => {
  const type = getHomeCatTypeBySeed(getPostCardCatSeed(post, index, 'bg'), 'background');
  return getHomeCatAsset(type);
};
const shouldShowPostBackgroundCat = (post, index) => {
  const raw = String(post?.id || index || '');
  let sum = 0;
  for (let i = 0; i < raw.length; i += 1) sum += raw.charCodeAt(i);
  return sum % 3 === 1;
};

const onThemeChanged = (event) => {
  currentTheme.value = event.detail.theme;
  currentThemePreference.value = themeManager.getPreference?.() || currentTheme.value;
};

const { isUserOnline, formatUserOnlineStatus, formatOnlineStatusTooltip } = useUserOnlineStatus();

const followState = reactive({
  isFollowing: false,
  followersCount: 0,
  followingCount: 0,
  toggling: false,
  loaded: false
});

const loadFollowState = async (profileUserId) => {
  if (!profileUserId) return;
  try {
    const countsRes = await getFollowCounts(profileUserId);
    if (countsRes.ok !== false) {
      followState.followersCount = countsRes.data?.followersCount ?? 0;
      followState.followingCount = countsRes.data?.followingCount ?? 0;
    }

    if (isLoggedIn.value && !isOwnProfile.value) {
      const following = await isFollowing(userInfo.value.id, profileUserId);
      followState.isFollowing = Boolean(following.data ?? following);
    }
    followState.loaded = true;
  } catch {
    followState.loaded = true;
  }
};

const handleToggleFollow = async () => {
  if (!isLoggedIn.value || !profile.value?.id || followState.toggling) return;
  followState.toggling = true;
  try {
    if (followState.isFollowing) {
      const res = await unfollowUser(userInfo.value.id, profile.value.id);
      if (res.ok) {
        followState.isFollowing = false;
        followState.followersCount = Math.max(0, followState.followersCount - 1);
      } else if (res.error?.code !== 'ALREADY_FOLLOWING') {
        showAlert('error', '取消失败', res.error?.message || '请稍后重试');
      }
    } else {
      const res = await followUser(userInfo.value.id, profile.value.id);
      if (res.ok) {
        followState.isFollowing = true;
        followState.followersCount += 1;
      } else if (res.error?.code !== 'ALREADY_FOLLOWING') {
        showAlert('error', '关注失败', res.error?.message || '请稍后重试');
      }
    }
  } catch {
    showAlert('error', '操作失败', '网络异常，请稍后重试');
  } finally {
    followState.toggling = false;
  }
};

// Follow List Modal
const followModal = reactive({
  show: false,
  type: 'followers',
  users: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  page: 1
});

const isLikeSubmitting = reactive({});
const likePulsePostIds = ref(new Set());
const isShareCopied = ref(false);
let shareCopyTimer = null;
let likePulseTimers = {};
let likeSubmitTimers = {};

const isLikePulsing = (postId) => likePulsePostIds.value.has(postId);

const handleToggleLike = async (post) => {
  if (!isLoggedIn.value) return;
  if (!post?.id) return;
  if (isLikeSubmitting[post.id]) return;
  isLikeSubmitting[post.id] = true;
  try {
    const { action, error } = await toggleLike(post.id, userInfo.value.id);
    if (error) {
      notify('点赞失败，请稍后重试', 'error');
      return;
    }
    if (action === 'liked') {
      post.like_count = (post.like_count || 0) + 1;
      post.isLiked = true;
    } else if (action === 'unliked') {
      post.like_count = Math.max(0, (post.like_count || 0) - 1);
      post.isLiked = false;
    }
    likePulsePostIds.value = new Set([...likePulsePostIds.value, post.id]);
    clearTimeout(likePulseTimers[post.id]);
    likePulseTimers[post.id] = setTimeout(() => {
      const next = new Set(likePulsePostIds.value);
      next.delete(post.id);
      likePulsePostIds.value = next;
    }, 1900);
  } catch {
    notify('点赞失败，请检查网络连接', 'error');
  } finally {
    clearTimeout(likeSubmitTimers[post.id]);
    likeSubmitTimers[post.id] = setTimeout(() => { isLikeSubmitting[post.id] = false; }, 300);
  }
};

const handleSharePost = async (post) => {
  if (!post?.id) return;
  const url = `${window.location.origin}/forum/post/${post.id}`;
  try {
    await navigator.clipboard.writeText(url);
    isShareCopied.value = true;
    clearTimeout(shareCopyTimer);
    shareCopyTimer = setTimeout(() => { isShareCopied.value = false; }, 2000);
  } catch {
    notify('复制失败，请手动复制链接', 'warning');
  }
};

const openFollowModal = async (type) => {
  const profileId = profile.value?.id;
  if (!profileId) return;
  followModal.type = type;
  followModal.show = true;
  followModal.users = [];
  followModal.page = 1;
  followModal.hasMore = false;
  await loadFollowListPage({ reset: true });
};

const loadFollowListPage = async ({ reset = false } = {}) => {
  const profileId = profile.value?.id;
  if (!profileId) return;
  if (reset) {
    followModal.loading = true;
  } else {
    followModal.loadingMore = true;
  }
  try {
    const pageToLoad = reset ? 1 : followModal.page;
    const loadFn = followModal.type === 'followers' ? getFollowers : getFollowing;
    const res = await loadFn(profileId, { page: pageToLoad, pageSize: 20 });
    const incoming = res.error ? [] : (res.data || []);
    if (reset) {
      followModal.users = incoming;
    } else {
      followModal.users = [...followModal.users, ...incoming];
    }
    followModal.hasMore = incoming.length === 20;
    followModal.page = pageToLoad + 1;
  } catch {
    if (reset) followModal.users = [];
  } finally {
    followModal.loading = false;
    followModal.loadingMore = false;
  }
};

const handleFollowListLoadMore = () => {
  loadFollowListPage();
};

const syncOwnProfileSnapshot = () => {
  ownProfileSnapshot.value = {
    username: userInfo.value.username,
    bio: userInfo.value.bio || '',
    avatar_url: userInfo.value.avatarUrl || '',
    join_date: userInfo.value.joinDate || '',
    points: userInfo.value.points || 0,
    birth_month: userInfo.value.birthMonth || '',
    birth_day: userInfo.value.birthDay || '',
    experience: userInfo.value.experience || 0,
    tags: userInfo.value.tags || [],
    is_boh_creator: Boolean(userInfo.value.isBohCreator),
    creator_platform_ids: normalizeCreatorPlatformIds(userInfo.value.creatorPlatformIds),
    creator_platform_visibility: normalizeCreatorPlatformVisibility(
      userInfo.value.creatorPlatformVisibility,
      Object.keys(normalizeCreatorPlatformIds(userInfo.value.creatorPlatformIds))
    ),
    creator_platform_order: normalizeCreatorPlatformOrder(
      userInfo.value.creatorPlatformOrder,
      Object.keys(normalizeCreatorPlatformIds(userInfo.value.creatorPlatformIds))
    ),
    showcase_post_ids: normalizeShowcasePostIds(userInfo.value.showcasePostIds),
    profile_background_url: userInfo.value.profileBackgroundUrl || '',
    id: userInfo.value.id
  };
};

watch(
  () => [
    userInfo.value.id,
    userInfo.value.username,
    userInfo.value.bio,
    userInfo.value.avatarUrl,
    userInfo.value.joinDate,
    userInfo.value.points,
    userInfo.value.birthMonth,
    userInfo.value.birthDay,
    userInfo.value.experience,
    JSON.stringify(userInfo.value.tags || []),
    Boolean(userInfo.value.isBohCreator),
    JSON.stringify(userInfo.value.creatorPlatformIds || {}),
    JSON.stringify(userInfo.value.creatorPlatformVisibility || {}),
    JSON.stringify(userInfo.value.creatorPlatformOrder || []),
    JSON.stringify(userInfo.value.showcasePostIds || []),
    userInfo.value.profileBackgroundUrl
  ],
  syncOwnProfileSnapshot,
  { immediate: true }
);

const mergeUniqueById = (baseList, appendList) => {
  const seen = new Set();
  const merged = [];
  for (const item of [...baseList, ...appendList]) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
};

const resetPagingState = () => {
  postsPage.value = 1;
  commentsPage.value = 1;
  impressionsPage.value = 1;
  hasMorePosts.value = true;
  hasMoreComments.value = true;
  hasMoreImpressions.value = true;
  tabLoaded.posts = false;
  tabLoaded.replies = false;
  tabLoaded.impressions = false;
  isTabLoading.posts = false;
  isTabLoading.replies = false;
  isTabLoading.impressions = false;
};

const resetProfileCollections = () => {
  fetchedProfile.value = null;
  posts.value = [];
  comments.value = [];
  impressions.value = [];
  showcasePostsFetched.value = [];
  resetPagingState();
};

const resolveProfileQueryContext = () => {
  const safeUsername = String(route.params.username || '').trim();
  const resolvedUserId = String(profile.value?.id || fetchedProfile.value?.id || '').trim();
  return {
    username: safeUsername,
    userId: resolvedUserId || null
  };
};

const refreshProfileSummary = async (username, fetchVersion = profileFetchVersion.value) => {
  const pRes = await getProfileByUsername(username);
  if (fetchVersion !== profileFetchVersion.value) return null;
  if (!pRes.error && pRes.data) {
    fetchedProfile.value = pRes.data;
    return pRes.data;
  }
  fetchedProfile.value = null;
  return null;
};

const loadShowcasePostsForProfile = async (profileData, fetchVersion = profileFetchVersion.value) => {
  const showcaseIds = normalizeShowcasePostIds(profileData?.showcase_post_ids);
  if (!showcaseIds.length) {
    showcasePostsFetched.value = [];
    return;
  }

  try {
    const postsRes = await getPostsByIds(showcaseIds, {
      includeUnapprovedForAuthor: isOwnProfile.value
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    if (!postsRes?.error && Array.isArray(postsRes.data)) {
      showcasePostsFetched.value = postsRes.data;
      return;
    }
    showcasePostsFetched.value = [];
  } catch (_err) {
    if (fetchVersion !== profileFetchVersion.value) return;
    showcasePostsFetched.value = [];
  }
};

const loadPostsPage = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  if (isTabLoading.posts) return;
  if (!reset && !hasMorePosts.value) return;

  const { username, userId } = resolveProfileQueryContext();
  if (!username && !userId) return;

  isTabLoading.posts = true;
  const pageToLoad = reset ? 1 : postsPage.value;
  try {
    const postsRes = await getPostsByUsername(username, userId, {
      page: pageToLoad,
      pageSize: PROFILE_PAGE_SIZE,
      includeUnapprovedForAuthor: isOwnProfile.value
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    const incoming = postsRes.error ? [] : (postsRes.data || []);
    posts.value = reset ? incoming : mergeUniqueById(posts.value, incoming);
    hasMorePosts.value = incoming.length === PROFILE_PAGE_SIZE;
    postsPage.value = pageToLoad + 1;
    tabLoaded.posts = true;
  } catch (error) {
    if (reset) posts.value = [];
    console.error('加载帖子失败:', error);
  } finally {
    isTabLoading.posts = false;
  }
};

const fetchTotalPostCount = async (username, userId) => {
  try {
    let query = supabase
      .from('posts')
      .select('id', { count: 'exact', head: true });

    if (userId && username) {
      query = query.or(`author_id.eq.${userId},author_username.eq.${username}`);
    } else if (userId) {
      query = query.eq('author_id', userId);
    } else if (username) {
      query = query.eq('author_username', username);
    }

    if (!isOwnProfile.value) {
      query = query.or('status.is.null,status.eq.approved');
    }

    const { count, error } = await query;
    if (!error) {
      totalPostCount.value = count ?? 0;
    }
  } catch (e) {
    console.error('获取总帖子数失败:', e);
  }
};

const loadCommentsPage = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  if (isTabLoading.replies) return;
  if (!reset && !hasMoreComments.value) return;

  const { username, userId } = resolveProfileQueryContext();
  if (!username && !userId) return;

  isTabLoading.replies = true;
  const pageToLoad = reset ? 1 : commentsPage.value;
  try {
    const cRes = await getCommentsByUsername(username, userId, {
      page: pageToLoad,
      pageSize: PROFILE_PAGE_SIZE
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    const incoming = cRes.error ? [] : (cRes.data || []);
    comments.value = reset ? incoming : mergeUniqueById(comments.value, incoming);
    hasMoreComments.value = incoming.length === PROFILE_PAGE_SIZE;
    commentsPage.value = pageToLoad + 1;
    tabLoaded.replies = true;
  } catch (error) {
    if (reset) comments.value = [];
    console.error('加载回复失败:', error);
  } finally {
    isTabLoading.replies = false;
  }
};

const loadImpressionsPage = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  const { userId } = resolveProfileQueryContext();
  if (!userId) return;
  if (isTabLoading.impressions) return;
  if (!reset && !hasMoreImpressions.value) return;

  isTabLoading.impressions = true;
  const pageToLoad = reset ? 1 : impressionsPage.value;
  try {
    const impRes = await getUserImpressions(userId, {
      page: pageToLoad,
      pageSize: PROFILE_PAGE_SIZE
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    const incoming = impRes.error ? [] : (impRes.data || []);
    impressions.value = reset ? incoming : mergeUniqueById(impressions.value, incoming);
    hasMoreImpressions.value = incoming.length === PROFILE_PAGE_SIZE;
    impressionsPage.value = pageToLoad + 1;
    tabLoaded.impressions = true;
  } catch (error) {
    if (reset) impressions.value = [];
    console.error('加载印象失败:', error);
  } finally {
    isTabLoading.impressions = false;
  }
};

const ensureActiveTabData = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  if (activeTab.value === 'posts') {
    if (reset || !tabLoaded.posts) await loadPostsPage({ reset: true, fetchVersion });
    return;
  }
  if (activeTab.value === 'replies') {
    if (reset || !tabLoaded.replies) await loadCommentsPage({ reset: true, fetchVersion });
    return;
  }
  if (activeTab.value === 'impressions') {
    if (reset || !tabLoaded.impressions) await loadImpressionsPage({ reset: true, fetchVersion });
  }
};

const fetchProfileData = async (username) => {
  const safeUsername = String(username || '').trim();
  if (!safeUsername) return;

  if (profileFetchInflight && profileFetchInflightUsername === safeUsername) {
    await profileFetchInflight;
    return;
  }

  const runner = (async () => {
    const fetchVersion = ++profileFetchVersion.value;
    loading.value = true;
    resetProfileCollections();

    try {
      const profileData = await refreshProfileSummary(safeUsername, fetchVersion);
      if (fetchVersion !== profileFetchVersion.value) return;

      if (!profileData) {
        resetProfileCollections();
        return;
      }

      await Promise.all([
        loadShowcasePostsForProfile(profileData, fetchVersion),
        ensureActiveTabData({ reset: true, fetchVersion }),
        loadFollowState(profileData.id),
        fetchTotalPostCount(safeUsername, profileData.id)
      ]);
    } catch (err) {
      if (fetchVersion !== profileFetchVersion.value) return;
      resetProfileCollections();
      console.error('加载空间数据失败:', err);
    } finally {
      if (fetchVersion === profileFetchVersion.value) {
        loading.value = false;
      }
    }
  })();

  profileFetchInflight = runner;
  profileFetchInflightUsername = safeUsername;

  try {
    await runner;
  } finally {
    if (profileFetchInflight === runner) {
      profileFetchInflight = null;
      profileFetchInflightUsername = '';
    }
  }
};

const setActiveTab = (tab) => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  void ensureActiveTabData();
};

const loadMorePosts = async () => {
  await loadPostsPage();
};

const loadMoreComments = async () => {
  await loadCommentsPage();
};

const loadMoreImpressions = async () => {
  await loadImpressionsPage();
};

const isShowcasedPost = (postId) => {
  const id = String(postId || '').trim();
  if (!id) return false;
  return normalizedShowcaseIds.value.includes(id);
};

const toggleShowcasePost = async (post) => {
  if (!isOwnProfile.value || !post?.id) return;

  const postId = String(post.id || '').trim();
  if (!postId) return;

  const current = normalizeShowcasePostIds(profile.value?.showcase_post_ids);
  const exists = current.includes(postId);
  if (!exists && current.length >= 3) {
    showAlert('warning', '置顶已满', '最多只能置顶 3 条帖子');
    return;
  }

  const next = exists ? current.filter((id) => id !== postId) : [postId, ...current].slice(0, 3);
  const result = await updateUserProfile({ showcase_post_ids: next });
  if (!result.success) {
    showAlert('error', '操作失败', result.message || '置顶更新失败');
    return;
  }

  await loadShowcasePostsForProfile({ showcase_post_ids: next }, profileFetchVersion.value);
  showAlert('success', exists ? '已取消置顶' : '已置顶', exists ? '帖子已从代表作移除' : '帖子已加入代表作');
};

const handleProfileSync = (event) => {
  const detail = event?.detail || {};
  const currentUsername = String(route.params.username || '');
  if (!currentUsername) return;

  const detailUsername = String(detail.username || '');
  const detailUserId = String(detail.userId || '');
  const isCurrentProfile =
    (detailUsername && detailUsername === currentUsername) ||
    (profile.value?.id && detailUserId && detailUserId === profile.value.id);

  if (!isCurrentProfile) return;

  const now = Date.now();
  if (now - lastProfileSyncAt < PROFILE_SYNC_MIN_INTERVAL_MS) return;
  lastProfileSyncAt = now;

  const reason = String(detail.reason || '');
  if (reason.startsWith('post_') || reason.startsWith('weekly_checkin')) {
    void (async () => {
      const refreshed = await refreshProfileSummary(currentUsername);
      const ctx = resolveProfileQueryContext();
      await Promise.all([
        loadShowcasePostsForProfile(refreshed || profile.value),
        loadPostsPage({ reset: true }),
        fetchTotalPostCount(ctx.username, ctx.userId)
      ]);
    })();
    return;
  }

  if (reason.startsWith('comment_')) {
    void Promise.all([
      refreshProfileSummary(currentUsername),
      loadCommentsPage({ reset: true })
    ]);
    return;
  }

  void fetchProfileData(currentUsername);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
};

const calculateBlockAge = (dateStr) => {
  if (!dateStr) return 0;
  const joinDate = new Date(dateStr);
  const now = new Date();
  if (joinDate > now) return 0;
  return Math.ceil(Math.abs(now - joinDate) / (1000 * 60 * 60 * 24));
};

// formatTime 逻辑已由 formatSmartTime 提供

const navigateToPost = (postId) => {
  const safePostId = String(postId || '').trim();
  if (!safePostId) return;
  const sourceUsername = String(profile.value?.username || route.params.username || '').trim();
  const origin = route.query.from || '';
  const query = sourceUsername
    ? { from: 'profile', username: sourceUsername, origin }
    : undefined;

  router.push({
    name: 'PostDetail',
    params: { id: safePostId },
    query
  });
};

const goToProfileRoute = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=profile`);
};

const openImpressionModal = () => {
  setActiveTab('impressions');
  if (!isLoggedIn.value) {
    showAlert('info', '请先登录', '登录后才能添加印象');
    return;
  }

  requestAnimationFrame(() => {
    const inputEl = document.querySelector('.add-impression-section textarea');
    inputEl?.focus();
  });
};

const openCreatorBindingHomepage = (binding) => {
  if (!binding?.key) return;
  const url = buildCreatorPlatformJumpUrl(binding.key, binding.id);
  if (!url) {
    showAlert('error', '跳转失败', '暂不支持该平台的快捷跳转');
    return;
  }

  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!newWindow) {
    showAlert('warning', '跳转受限', '浏览器阻止了新窗口，请允许弹窗后重试');
  }
};

const openEditModal = () => {
  showEditModal.value = true;
};

const handleSaveProfile = async (updates) => {
  saving.value = true;
  try {
    const oldUsername = profile.value.username;
    const result = await updateUserProfile(updates);

    if (result.success) {
      showAlert('success', '保存成功', '个人资料已更新');
      showEditModal.value = false;

      if (oldUsername !== updates.username) {
        router.replace(`/profile/${encodeURIComponent(updates.username)}`);
      }
    } else {
      if (result.code === '23505') {
        showAlert('error', '保存失败', '该用户名已被占用，请尝试其他名称');
      } else {
        showAlert('error', '保存失败', result.message);
      }
    }
  } catch (_err) {
    showAlert('error', '异常', '网络错误');
  } finally {
    saving.value = false;
  }
};

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const handleAvatarClick = () => {
  avatarInputRef.value?.click();
};

const handleAvatarFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // 转换为预览 URL
  const reader = new FileReader();
  reader.onload = (e) => {
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.readAsDataURL(file);

  // 清空 input 方便下次选择同一张图
  event.target.value = '';
};

const handleCropConfirm = async (blob) => {
  isProcessingCrop.value = true;
  try {
    // 将 blob 转为 file
    const file = new File([blob], 'avatar.png', { type: 'image/png' });

    // 依然进行轻度压缩以确保大小
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);

    isUploadingAvatar.value = true;
    await uploadToSupabase(compressedFile);
    showCropModal.value = false;
    
    // 显示上传成功动画
    showUploadSuccess.value = true;
    setTimeout(() => {
      showUploadSuccess.value = false;
    }, 800);
  } catch (error) {
    console.error('裁切处理失败:', error);
    showAlert('error', '处理失败', '头像裁切出错，请重试');
  } finally {
    isProcessingCrop.value = false;
    isUploadingAvatar.value = false;
  }
};

const uploadToSupabase = async (file) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showAlert('error', '上传失败', '请先登录');
      return;
    }

    // 1. 获取当前头像文件名以便删除
    const oldAvatarUrl = profile.value.avatar_url;

    const timestamp = Date.now();
    const filePath = `${user.id}/avatar_${timestamp}.png`;

    // 2. 上传新头像
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    // 3. 获取新头像 URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // 添加时间戳查询参数以彻底解决浏览器缓存问题
    const finalUrl = `${publicUrl}?t=${timestamp}`;
    await updateProfileAvatar(user.id, finalUrl);

    // 4. 清理旧头像文件 (如果有)
    if (oldAvatarUrl) {
      try {
        // 从 URL 中提取路径。URL 格式通常为 .../storage/v1/object/public/avatars/USER_ID/avatar_TS.png?t=...
        // 我们需要 avatars 之后的路径：USER_ID/avatar_TS.png
        const urlObj = new URL(oldAvatarUrl);
        const pathParts = urlObj.pathname.split('/');
        const avatarsIndex = pathParts.indexOf('avatars');
        if (avatarsIndex !== -1) {
          const oldFilePath = pathParts.slice(avatarsIndex + 1).join('/');
          // 只有当旧文件路径与新文件路径不同时才删除
          if (oldFilePath && oldFilePath !== filePath) {
            await supabase.storage.from('avatars').remove([oldFilePath]);
          }
        }
      } catch (e) {
        console.warn('清理旧头像失败 (非致命错误):', e);
      }
    }

    await updateUserProfile({ avatar_url: finalUrl });

    showAlert('success', '上传成功', '头像已更新！');
  } catch (error) {
    console.error('上传到 Supabase 失败:', error);
    showAlert('error', '上传失败', error.message || '上传过程出错');
  }
};

const handleSubmitImpression = async () => {
  if (!newImpressionContent.value.trim() || !profile.value) return;

  submittingImpression.value = true;
  try {
    const content = newImpressionContent.value.trim();
    const { data, error } = await addUserImpression(
      userInfo.value.id,
      profile.value.id,
      content
    );

    if (!error) {
      const created = Array.isArray(data) ? data[0] : data;
      const optimisticImpression = {
        id: created?.id || `tmp-${Date.now()}`,
        content,
        created_at: created?.created_at || new Date().toISOString(),
        author_id: userInfo.value.id,
        target_id: profile.value.id,
        author: {
          username: userInfo.value.username,
          avatar_url: userInfo.value.avatarUrl || ''
        }
      };
      impressions.value = mergeUniqueById([optimisticImpression], impressions.value).slice(0, PROFILE_PAGE_SIZE);
      tabLoaded.impressions = true;
      newImpressionContent.value = '';
      showAlert('success', '发布成功', '您的印象已墙上');
    } else {
      showAlert('error', '发布失败', error.message);
    }
  } catch (_err) {
    showAlert('error', '异常', '发布印象时出错');
  } finally {
    submittingImpression.value = false;
  }
};

const canDeleteImpression = (impression) => {
  if (!isLoggedIn.value || !userInfo.value?.id) return false;
  return impression.author_id === userInfo.value.id || impression.target_id === userInfo.value.id;
};

const handleDeleteImpression = async (impression) => {
  if (!await dialog.confirm({
    title: '删除印象',
    message: '确定要删除这条印象吗？',
    tone: 'danger',
    confirmText: '删除'
  })) return;

  try {
    const { error } = await deleteUserImpression(impression.id, userInfo.value.id);

    if (!error) {
      showAlert('success', '删除成功', '印象已删除');
      impressions.value = impressions.value.filter((item) => item.id !== impression.id);
    } else {
      showAlert('error', '删除失败', error.message);
    }
  } catch (_err) {
    showAlert('error', '异常', '删除印象时出错');
  }
};

const handleCreatePost = async (safeTitle, safeContent) => {
  if (!safeContent.trim()) return;

  isSubmittingPost.value = true;
  try {
    const { data, error } = await createPost(
      safeContent,
      userInfo.value.id,
      userInfo.value.username,
      'approved',
      safeTitle
    );

    if (!error) {
      const created = Array.isArray(data) ? data[0] : data;
      const optimisticPost = {
        id: created?.id || `tmp-post-${Date.now()}`,
        title: safeTitle,
        content: safeContent,
        created_at: created?.created_at || new Date().toISOString(),
        author_id: userInfo.value.id,
        author_username: userInfo.value.username,
        comment_count: 0,
        like_count: 0
      };
      posts.value = mergeUniqueById([optimisticPost], posts.value);
      totalPostCount.value += 1;
      tabLoaded.posts = true;
      // 重置分页状态，确保后续"加载更多"从正确页码开始
      postsPage.value = 2;
      hasMorePosts.value = true;
      showPostModal.value = false;
      showAlert('success', '发布成功', '您的新动态已同步至社区');
    } else {
      showAlert('error', '发布失败', error.message);
    }
  } catch (_err) {
    showAlert('error', '异常', '发布动态时出错');
  } finally {
    isSubmittingPost.value = false;
  }
};

watch(activeTab, () => {
  void ensureActiveTabData();
});

// 监听路由参数变化，处理不同用户的空间切换
watch(() => route.params.username, (newUsername) => {
  if (newUsername) {
    activeTab.value = 'posts';
    fetchProfileData(newUsername);
  }
});

// 监听登录状态变化，动态刷新页面内容
watch(() => isLoggedIn.value, () => {
  if (route.params.username) {
    fetchProfileData(route.params.username);
  }
});

// 监听 profile 加载后检查 bio 溢出
watch(() => profile.value?.bio, () => {
  nextTick(() => {
    if (bioRef.value) {
      bioHasOverflow.value = bioRef.value.scrollHeight > bioRef.value.clientHeight;
    }
  });
}, { flush: 'post' });

onMounted(() => {
  window.addEventListener('boh_profile_sync', handleProfileSync);
  window.addEventListener('theme-changed', onThemeChanged);
  if (route.params.username) {
    fetchProfileData(route.params.username);
  }
});

onUnmounted(() => {
  window.removeEventListener('boh_profile_sync', handleProfileSync);
  window.removeEventListener('theme-changed', onThemeChanged);
  clearTimeout(shareCopyTimer);
  Object.values(likePulseTimers).forEach(clearTimeout);
  Object.values(likeSubmitTimers).forEach(clearTimeout);
});
</script>

<style scoped>
@import './style.scoped.css';
@import '@/styles/helpers/function.css';
</style>

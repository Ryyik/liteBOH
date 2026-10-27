<template>
  <div key="profile-home" class="profile-home-shell">
    <section class="profile-hero-panel">
      <button
        type="button"
        class="profile-cover-band"
        :class="{
          'has-background-image': Boolean(profileBackgroundUrl),
          'is-uploading': isUploadingProfileBackground,
        }"
        :style="profileCoverStyle"
        :disabled="isUploadingProfileBackground"
        :aria-label="isUploadingProfileBackground ? '正在上传个人卡片背景' : '更换个人卡片背景'"
        title="更换背景"
        @click="$emit('background-click')"
      >
        <span class="profile-cover-glass" aria-hidden="true"></span>
        <span class="profile-cover-action" aria-hidden="true">
          {{ isUploadingProfileBackground ? '上传中' : '更换背景' }}
        </span>
      </button>
      <button
        type="button"
        class="profile-settings-btn"
        @click="$emit('settings')"
        aria-label="设置"
        title="设置"
      >
        设置
      </button>

      <div class="profile-identity-stack">
        <div class="profile-hero-body">
          <span class="boh-avatar-wrap">
            <div
              class="apple-avatar-wrapper profile-hero-avatar clickable"
              @click="$emit('avatar-click')"
            >
              <div v-if="avatarUrl" class="apple-avatar has-avatar">
                <img :src="avatarUrl" alt="头像" class="avatar-img" loading="lazy" />
              </div>
              <div v-else class="apple-avatar">{{ displayInitial }}</div>
              <div class="avatar-edit-overlay">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  stroke-width="2"
                >
                  <path
                    d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                  />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </div>
            <span
              v-if="heroFrame?.url"
              class="boh-avatar-frame"
              :style="{
                '--boh-avatar-frame-url': `url(${heroFrame.url})`,
                '--boh-avatar-frame-scale': String(heroFrame.scale || 1.24),
              }"
              aria-hidden="true"
            ></span>
          </span>

          <div class="profile-hero-copy">
            <div class="name-row profile-hero-name-row">
              <h1 class="profile-name" :class="nicknameClass">{{ displayName }}</h1>
              <span v-if="isAdmin" class="admin-badge">ADMIN</span>
              <span
                v-if="tierCode && tierCode !== 'free'"
                class="tier-badge"
                :class="`tier-${tierCode}`"
                >{{ tierDisplayName }}</span
              >
            </div>
            <!-- 2026-10-26：`@昵称` 行删除 —— 它和上一行的昵称完全重复（BOH 没有独立 handle），
                 既占一行高度又是技术味最重的一行。 -->
            <div class="profile-bio-wrap">
              <p
                ref="bioRef"
                class="profile-bio"
                :class="{ clamped: !bioExpanded, expanded: bioExpanded }"
              >
                {{ profileBio }}
              </p>
              <button
                v-if="bioHasOverflow"
                type="button"
                class="profile-bio-toggle"
                @click="toggleBio"
              >
                {{ bioExpanded ? '收起' : '全文' }}
              </button>
            </div>
          <div
            class="profile-stats profile-hero-stats profile-stats-compact"
            :class="{ 'is-loading': isStatsLoading }"
          >
            <template v-if="isStatsLoading">
              <span class="stat-skeleton stat-skeleton-line"></span>
            </template>
            <template v-else>
              <!-- 2026-10-26（参考小红书的纯数据流）：三个统计是一行**无分隔**的纯文本 ——
                   不再有圆点、边框、胶囊底。数字加粗、标签灰、紧邻排列。
                   顺序按参考产品的习惯：关注 → 粉丝 → 发帖。 -->
              <button type="button" class="stat-text" @click="openFollowList('followers')">
                <strong class="stat-text-num">{{ stats.followers || 0 }}</strong>
                <span class="stat-text-label">粉丝</span>
              </button>
              <button type="button" class="stat-text" @click="openFollowList('following')">
                <strong class="stat-text-num">{{ stats.following || 0 }}</strong>
                <span class="stat-text-label">关注</span>
              </button>
              <button type="button" class="stat-text" @click="$emit('switch-tab', 'posts')">
                <strong class="stat-text-num">{{ stats.posts || 0 }}</strong>
                <span class="stat-text-label">发帖</span>
              </button>
            </template>
          </div>
            <button type="button" class="profile-edit-btn" @click="$emit('edit-profile')">
              编辑资料
            </button>
          </div>
        </div>

      </div>
    </section>

    <!-- 2026-10-26 结构合并：印象摘要行整块移除。
         印象已成为下方内容面板的一个 tab（作品 / 回复 / 印象），
         保留摘要行就是同一目的地的第二个入口 —— 与「一个目的地一个入口」冲突。
         社交证明的内容价值由 tab 上的计数承担，点开即完整网格。 -->
    <ActivityHeatmap :payload="heatmap" :loading="isHeatmapLoading" @compose="$emit('compose')" />

    <!-- 方块积分卡（2026-10-26 做小）：
         原来是一张 200px+ 的大卡面 + 标题行 + 一行操作说明。做小三件事：
         ① 传 compact（PointsCard 内置变体：2.08 aspect、26px 数字）；
         ② 删卡面下方的操作说明（点卡即设置，说明是常驻噪音）；
         ③ 删标题行里的 tier 角标 —— Hero 的 tier-badge 已显示同一个档位。
         卡面本身保留：它是玩家向的「门面资产」，只是不再吃半屏。 -->
    <section class="profile-points-card-section is-own" aria-label="方块积分卡">
      <div class="profile-points-card-head">
        <span class="profile-points-card-kicker">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          方块积分卡
        </span>
        <button type="button" class="profile-points-card-action" @click="handlePointsCardClick">
          设置卡面
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      <div class="profile-points-card-wrap">
        <PointsCard
          :points="pointsCardPoints"
          :username="displayName"
          :tier-label="tierDisplayName || 'BOH'"
          :skin="pointsCardSkin"
          :image-url="pointsCardImageUrl"
          compact
          interactive
          @click="handlePointsCardClick"
        />
      </div>
    </section>

    <!-- 2026-10-26（用户定稿）：「资产」与「摄影集」两个入口也收进**设置页**，
         主页不再保留这一块。至此主页只剩四块：身份卡 / 活跃轨迹 / 积分卡 / 内容面板。
         理由：两者都是月频以下的工具型入口，放在个人主页等于用主页空间做导航；
         资产页本身仍是独立 tab（从设置的「资产」行进入，内层七个 tab 一个不少）。
         ⚠️ 摄影集是 /user-space/albums，设置页那一行是它唯一的常用入口 ——
            改设置页时不要把那一行当死代码清掉。 -->

    <!-- 2026-10-26 结构合并：原「服务」段（Cloud+ / 摄影集两行）整段移除。
         Cloud+ 的底栏已有「图库」席（bottom-nav.ts 的 /user-space/note），
         摄影集入口移入资产段；为一个两行的列表单开一段标题是纯层级浪费。 -->

    <section class="profile-content-panel">
      <div class="profile-content-tabs" role="tablist" aria-label="我的内容">
        <button
          v-for="tab in contentTabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="profile-content-tab"
          :class="{ active: activeContentTab === tab.id }"
          :aria-selected="activeContentTab === tab.id"
          :aria-busy="tab.loading ? 'true' : 'false'"
          @click="activeContentTab = tab.id"
        >
          {{ tab.label }}
          <span v-if="tab.loading" class="profile-content-count is-loading" aria-hidden="true"
            ><span class="profile-content-count-skeleton"></span
          ></span>
          <span v-else class="profile-content-count">{{ tab.count ?? 0 }}</span>
        </button>
      </div>

      <div
        v-if="activeContentTab === 'posts' && isContentLoading"
        class="profile-forum-skeleton-feed"
        aria-hidden="true"
      >
        <div
          v-for="item in 3"
          :key="`my-post-skeleton-${item}`"
          class="profile-forum-skeleton-card"
        >
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
      <div v-else-if="activeContentTab === 'posts' && workItems.length" class="profile-post-grid">
        <template v-for="item in workItems" :key="item.key">
          <article
            v-if="item.kind === 'post'"
            class="profile-post-card"
            :class="{ 'text-only': !postCover(item.post) }"
            @click="$emit('post-click', item.post.id)"
          >
            <div
              v-if="postCover(item.post)"
              class="profile-post-cover"
              :class="{ 'is-multi': postImageCount(item.post) > 1 }"
            >
              <!-- @error 兜底（2026-10-26 修「配图一直裂开」）：封面 URL 失效时
                   （云端图被删/过期/旧 @/assets 引用）把该 URL 记进 brokenCovers，
                   卡片当轮就退回纯文字排版 —— 不再留一个破图图标 + 一大块空白。 -->
              <img
                :src="postCover(item.post)"
                :alt="getProfilePostTitle(item.post)"
                loading="lazy"
                decoding="async"
                @error="markCoverBroken(postCover(item.post))"
              />
              <!-- 多图角标：右下角「共 N 张」。叠层感由 .is-multi 的 box-shadow 造（见样式），
                   不额外画 DOM 图层 —— 多层缩略图要真实渲染就得复制 img，列表里不值。 -->
              <span v-if="postImageCount(item.post) > 1" class="profile-post-multi-count">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="7" y="3" width="14" height="14" rx="2" />
                  <path d="M3 7v12a2 2 0 0 0 2 2h12" />
                </svg>
                {{ postImageCount(item.post) }}
              </span>
            </div>
            <div class="profile-post-copy">
              <h3>{{ getProfilePostTitle(item.post) }}</h3>
              <!-- 纯文字帖补正文摘录（2026-10-26）：只有标题时这张卡比图片卡矮一半，
                   在四列纵向流里就是一块悬空的白色残片。三行摘录把它撑成正常卡片高度，
                   同时让人不必点进去就知道这条在讲什么。图片卡不加（会重复封面信息）。 -->
              <p v-if="!postCover(item.post)" class="profile-post-excerpt">
                {{ postExcerpt(item.post) }}
              </p>
              <div class="profile-post-meta">
                <span>{{ formatProfilePostDate(item.post) }}</span>
                <span>{{ item.post.like_count || 0 }}赞</span>
                <span>{{ item.post.comment_count || 0 }}评</span>
              </div>
            </div>
          </article>

          <article
            v-else
            class="profile-post-card profile-note-card"
            :class="[
              `note-cover-theme-${item.card.coverTheme}`,
              { 'text-only': !noteCover(item.card) },
            ]"
            @click="$emit('note-open', item.card.entry)"
          >
            <div v-if="noteCover(item.card)" class="profile-post-cover">
              <img
                :src="noteCover(item.card)"
                :alt="noteDisplayTitle(item.card)"
                loading="lazy"
                decoding="async"
                @error="markCoverBroken(noteCover(item.card))"
              />
            </div>
            <div v-else class="profile-note-text-cover" aria-hidden="true">
              <span class="profile-note-cover-kicker">Cloud+ 笔记</span>
              <strong>{{ noteDisplayTitle(item.card) }}</strong>
            </div>
            <div class="profile-post-copy">
              <h3>{{ noteDisplayTitle(item.card) }}</h3>
              <div class="profile-post-meta">
                <span>{{ formatProfilePostDate({ created_at: item.card.dateValue }) }}</span>
                <span v-if="item.card.imageCount">{{ item.card.imageCount }} 图</span>
                <span class="profile-note-public-badge">公开</span>
              </div>
              <div class="profile-note-actions">
                <button
                  type="button"
                  class="profile-note-action-btn"
                  @click.stop="$emit('note-set-private', item.card.entry)"
                >
                  设为私密
                </button>
                <button
                  type="button"
                  class="profile-note-action-btn danger"
                  @click.stop="$emit('note-delete', item.card.entry)"
                >
                  删除
                </button>
              </div>
            </div>
          </article>
        </template>
        <div v-if="hasMorePosts" class="profile-load-more-wrap">
          <button
            class="profile-load-more-btn"
            :disabled="isLoadingMore"
            @click.stop="$emit('load-more')"
          >
            {{ isLoadingMore ? '加载中...' : '加载更多帖子' }}
          </button>
        </div>
      </div>
      <div v-else-if="activeContentTab === 'posts'" class="profile-content-empty">
        <h3>还没有作品</h3>
        <p>发布的帖子和公开的 Cloud+ 笔记都会出现在这里。</p>
        <button type="button" @click="$emit('compose')">去发帖</button>
      </div>

      <div
        v-else-if="activeContentTab === 'replies' && repliesLoading"
        class="profile-forum-skeleton-feed"
        aria-hidden="true"
      >
        <div v-for="item in 3" :key="`reply-skeleton-${item}`" class="profile-forum-skeleton-card">
          <div class="profile-forum-skeleton-line long profile-forum-skeleton-item"></div>
          <div class="profile-forum-skeleton-line medium profile-forum-skeleton-item"></div>
        </div>
      </div>
      <div v-else-if="activeContentTab === 'replies' && replies.length" class="profile-reply-list">
        <button
          v-for="reply in replies"
          :key="reply.id"
          type="button"
          class="profile-reply-item"
          @click="$emit('post-click', reply.post_id)"
        >
          <span class="profile-reply-target">回复了《{{ getReplyPostTitle(reply) }}》</span>
          <strong>{{ getReplySummary(reply) }}</strong>
          <small>{{ formatProfilePostDate(reply) }}</small>
        </button>
      </div>
      <div v-else-if="activeContentTab === 'replies'" class="profile-content-empty">
        <h3>还没有回复</h3>
        <p>参与讨论后，回复会集中出现在这里。</p>
        <button type="button" @click="$emit('switch-tab', 'community')">去社区看看</button>
      </div>

      <!-- 印象（2026-10-26：接替原「草稿」席）：
           草稿 tab 删掉 —— 单草稿模型下草稿只有一份，且它本来就只在编辑器里出现
           （2026-10-26 云端单草稿定稿），在主页列一份列表等于给同一个对象开第二扇门。
           印象从「段控第三段」降到这里，段控随之压成两段（空间 | 资产）。
           数据仍由父层唯一实例提供（useProfileImpressions 的缓存是实例级的），
           本组件只透传 props / 事件。 -->
      <div v-else-if="activeContentTab === 'impressions'" class="profile-content-impressions">
        <ProfileImpressionsSection
          :impressions="impressions"
          :loading="impressionsLoading"
          :has-more="impressionsHasMore"
          :is-loading-more="isLoadingMoreImpressions"
          @delete-impression="$emit('delete-impression', $event)"
          @load-more-impressions="$emit('load-more-impressions')"
        />
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
import { computed, reactive, ref, watch, onMounted } from 'vue';
import FollowListModal from '@/components/FollowListModal.vue';
import PointsCard from './PointsCard.vue';
import ActivityHeatmap from './ActivityHeatmap.vue';
import ProfileImpressionsSection from './ProfileImpressionsSection.vue';
import {
  getCommentsByUsername,
  getFollowers,
  getFollowing,
  unfollowUser,
} from '@/utils/api/profile-api.js';
import { fetchQuotedPostsByIds } from '@/utils/api/forum-api.js';
import { resolveStoredCoverUrl } from '@/utils/api/forum-format.js';
import { buildCloudNoteWorkCard } from '@/utils/cloud-note-cover.js';
import { cloudEntryDefaultTitle } from '@/utils/boh-cloud-content.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import { PLAN_DISPLAY_NAMES } from '@/utils/subscription-benefits.js';

const followModal = reactive({
  show: false,
  type: 'followers',
  users: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  currentPage: 1,
});
const FOLLOW_PAGE_SIZE = 20;
const activeContentTab = ref('posts');
const replies = ref([]);
const repliesLoading = ref(false);
const repliesLoaded = ref(false);
const contentTabs = computed(() => {
  const hasValidStatsCount = Number.isFinite(props.stats?.posts);
  const postsLoading = hasValidStatsCount
    ? props.isStatsLoading
    : props.isStatsLoading || props.isContentLoading;
  const postsCount = postsLoading
    ? null
    : hasValidStatsCount
      ? props.stats.posts
      : props.posts.length;
  // 作品格 = 帖子 + 公开笔记（2026-09-29 拍板：公开笔记计入作品格，占用 Cloud+ 配额）
  const worksCount = postsLoading ? null : (postsCount ?? 0) + publicNotesCount.value;
  const repliesLoadingState = repliesLoading.value || (!repliesLoaded.value && !!profileId.value);
  const repliesCount = repliesLoadingState ? null : replies.value.length;
  // 第三席「印象」接替原「草稿」（2026-10-26）：草稿在单草稿模型下只有一份、
  // 且只在编辑器里出现，列成列表没有意义；印象是社交证明，值得常驻一席。
  return [
    { id: 'posts', label: '作品', count: worksCount, loading: postsLoading },
    { id: 'replies', label: '回复', count: repliesCount, loading: repliesLoadingState },
    {
      id: 'impressions',
      label: '印象',
      count: props.impressionsLoading ? null : impressionCount.value,
      loading: props.impressionsLoading,
    },
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
      const existingIds = new Set(followModal.users.map((u) => u.id));
      const newItems = res.data.filter((u) => !existingIds.has(u.id));
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
    followModal.users = followModal.users.filter((u) => u.id !== user.id);
  }
  user._unfollowing = false;
};

const props = defineProps({
  profile: {
    type: Object,
    default: () => ({}),
  },
  avatarUrl: {
    type: String,
    default: '',
  },
  profileBackgroundUrl: {
    type: String,
    default: '',
  },
  profileCoverStyle: {
    type: Object,
    default: () => ({}),
  },
  isUploadingProfileBackground: {
    type: Boolean,
    default: false,
  },
  stats: {
    type: Object,
    default: () => ({ posts: 0, points: 0, rank: 0 }),
  },
  isStatsLoading: {
    type: Boolean,
    default: false,
  },
  /** 活跃热力图：get_user_activity_heatmap RPC 的原始返回值，未就绪传 null */
  heatmap: {
    type: Object,
    default: null,
  },
  /** 热力图首次加载中（骨架态） */
  isHeatmapLoading: {
    type: Boolean,
    default: false,
  },
  /* 2026-10-26：「服务」段删除后，cloudPlusUsageText / cloudPlusUsageMeterStyle
     在主页已无消费点（Cloud+ 用量在底栏「图库」页与设置页各自展示），prop 一并移除。 */
  subscriptionSummaryText: {
    type: String,
    default: '',
  },
  /** 印象列表（2026-10-26：父层持有的唯一实例，印象 tab 直接消费） */
  impressions: {
    type: Array,
    default: () => [],
  },
  impressionsLoading: {
    type: Boolean,
    default: false,
  },
  /** 印象 tab：还有更多可增量加载（父层 useProfileImpressions 的状态） */
  impressionsHasMore: {
    type: Boolean,
    default: false,
  },
  /** 印象 tab：增量加载中 */
  isLoadingMoreImpressions: {
    type: Boolean,
    default: false,
  },
  /**
   * 受控的内容面板 tab（'posts' | 'replies' | 'impressions'）。
   * 2026-10-26：印象从「分段」降为「tab」后，跨组件驱动它的唯一通道就是这个 prop
   * （旧深链 ?view=impressions 走这儿）。配合 content-tab-change 事件做双向同步，
   * 否则用户手动切走之后，父层再设同一个值不会触发 watch（值未变）。
   */
  requestedContentTab: {
    type: String,
    default: 'posts',
  },
  isContentLoading: {
    type: Boolean,
    default: false,
  },
  posts: {
    type: Array,
    default: () => [],
  },
  /** 公开笔记（Cloud+ entries, visibility='public'）：计入作品格，管理动作由父层承接 */
  publicNotes: {
    type: Array,
    default: () => [],
  },
  hasMorePosts: {
    type: Boolean,
    default: false,
  },
  isLoadingMore: {
    type: Boolean,
    default: false,
  },
});

const publicNotesCount = computed(() =>
  Array.isArray(props.publicNotes) ? props.publicNotes.length : 0,
);

// 作品格合并流：帖子 + 公开笔记按时间混排（笔记折成统一卡片视图模型）
const workItems = computed(() => {
  const postItems = (Array.isArray(props.posts) ? props.posts : []).map((post) => ({
    key: `post-${post.id}`,
    kind: 'post',
    date: String(post.created_at || post.published_at || post.updated_at || ''),
    post,
  }));
  const noteItems = (Array.isArray(props.publicNotes) ? props.publicNotes : [])
    .map((entry) => buildCloudNoteWorkCard(entry))
    .filter(Boolean)
    .map((card) => ({
      key: `note-${card.id}`,
      kind: 'note',
      date: card.dateValue,
      card,
    }));
  return [...postItems, ...noteItems].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
});

const noteDisplayTitle = (card = {}) =>
  String(card.title || '').trim() || cloudEntryDefaultTitle(card.entry);

const emit = defineEmits([
  'edit-profile',
  'settings',
  'avatar-click',
  'background-click',
  /** 打开发帖编辑器（2026-10-26：原先三处空态 emit('switch-tab','posts')，
   *  而父子关系是「已在 posts 页内」，switchTab 首句就 return ⇒ 点了没反应。
   *  改为直接请求父层打开发帖会话。 */
  'compose',
  /** 打开资产面板的某个子页（'points' / 'subscription' / 'fulfillment' / 'lottery' / 'sponsor'）。
   *  2026-10-26：原先是 emit('assets') 无参数直落积分面板，现由「资产入口卡」按入口分流。 */
  'open-assets',
  'data-management',
  'cloud-plus',
  'photo-albums',
  'post-click',
  'switch-tab',
  'load-more',
  'note-open',
  'note-set-private',
  'note-delete',
  /** 印象 tab 的删除 / 增量加载，由父层唯一实例执行（同 props 的 impressions） */
  'delete-impression',
  'load-more-impressions',
  /** 内容面板 tab 变化 → 父层同步 profileContentTab（受控 prop 的双向通道） */
  'content-tab-change',
]);

const displayName = computed(() => props.profile.username || '未登录');

const profileId = computed(() => props.profile.id || '');
const { fetchUserTier, getNicknameClass, getUserTierCode } = useUserTier();
const nicknameClass = ref('');
const tierCode = ref('');
const tierDisplayName = computed(() => PLAN_DISPLAY_NAMES[tierCode.value] || '');
// 主页大头像佩戴框：自己=本地佩戴状态（即换即见），tier 跟昵称徽章同源
const { effectiveFrame: heroFrame } = useAvatarFrame(tierCode);
watch(
  profileId,
  async (id) => {
    if (id) {
      await fetchUserTier(id);
      nicknameClass.value = getNicknameClass(id);
      tierCode.value = getUserTierCode(id);
    }
  },
  { immediate: true },
);
const displayInitial = computed(() => (props.profile.username || 'U').charAt(0).toUpperCase());
const isAdmin = computed(() => props.profile.role === 'admin');

/* ── 印象（2026-10-26：从「摘要行」改为内容面板的一个 tab）──
   数据仍来自父层持有的唯一实例（useProfileImpressions 的缓存/节流是实例级），
   这里只算 tab 上的计数，不自己取数。 */
const impressionCount = computed(() =>
  Array.isArray(props.impressions) ? props.impressions.length : 0,
);

const pointsCardPoints = computed(() => Number(props.profile.points ?? props.stats?.points ?? 0));
const pointsCardSkin = computed(() => {
  const raw = props.profile.pointsCardSkin ?? props.profile.points_card_skin ?? 'blank';
  return ['blank', 'cats', 'custom'].includes(String(raw)) ? String(raw) : 'blank';
});
const pointsCardImageUrl = computed(() =>
  String(props.profile.pointsCardImageUrl ?? props.profile.points_card_image_url ?? '').trim(),
);
const handlePointsCardClick = () => {
  // 2026-10-26 修：原先是 emit('assets', 'cards') —— 父层只监听 @open-assets，
  // 这个事件名从未有人接，「设置卡面」在主页是死按钮（点了什么都不发生）。
  // 'cards' 由 AssetsHubPanel.normalizeInitialTab 兼容映射到「装扮」tab（:998-1000）。
  emit('open-assets', 'cards');
};

const profileBio = computed(() => {
  const bio = String(props.profile.bio || '').trim();
  return bio ? bio : '这个人很认真地搭着自己的方块。';
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

const normalizeProfileText = (value, fallback = '') => {
  const safeValue = String(value || '').trim();
  return safeValue || fallback;
};

// —— 转发帖引用回源（个人/他人空间的帖子网格） ——
// 转发帖只存转发留言，标题/封面/摘录取自被引用的原帖（批量回源 + 缓存在 _shared.js）
const quotedPostsMap = ref({});

watch(
  () => props.posts?.length,
  async () => {
    const posts = Array.isArray(props.posts) ? props.posts : [];
    const ids = posts
      .filter((p) => p?.post_kind === 'repost' && p?.repost_of_post_id)
      .map((p) => String(p.repost_of_post_id));
    if (!ids.length) return;
    const map = await fetchQuotedPostsByIds(ids);
    if (!map.size) return;
    quotedPostsMap.value = { ...quotedPostsMap.value, ...Object.fromEntries(map) };
  },
  { immediate: true },
);

const getQuotedPost = (post = {}) =>
  quotedPostsMap.value[String(post?.repost_of_post_id || '')] || null;

const getProfilePostTitle = (post = {}) => {
  // 注意：无条件先读 quoted（依赖收集），否则回源完成后引用了 quoted 的分支
  // 因 early return 不触发重渲染，网格卡永远停在兜底文案
  const quoted = getQuotedPost(post);
  // 转发帖：转发者附的话是主体（标题位），对方帖子内容以小字摘录跟在摘要位
  if (post.post_kind === 'repost') {
    const own = normalizeProfileText(post.body || post.content, '');
    if (own) return own.length > 30 ? `${own.slice(0, 30)}…` : own;
    return normalizeProfileText(quoted?.title, '转发动态');
  }
  return normalizeProfileText(post.title, '无标题');
};

// 2026-10-26：作品卡不显示摘要（图片卡的信息由封面承担），**纯文字帖例外** ——
// 只有标题的无图卡比图片卡矮一半，在四列纵向流里会露出一块空洞。
// 摘录截到 90 字（CSS 再按 3 行裁切），只服务无图卡，见模板里的 v-if。
const postExcerpt = (post = {}) => {
  const text = normalizeProfileText(post.content || post.body, '');
  if (!text) return '';
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
};

const getProfilePostCover = (post = {}) => {
  const images = Array.isArray(post.images) ? post.images : [];
  const firstImage = images[0] || null;
  // 2026-10-26：images 可能是「字符串数组」（老数据 / 详情页写回的形态），
  // 只读 firstImage.url 会得到 undefined ⇒ 封面静默丢失。两种形态都要认。
  const imageCover = String(
    typeof firstImage === 'string'
      ? firstImage
      : firstImage?.url || firstImage?.thumbUrl || firstImage?.originalUrl || '',
  ).trim();
  if (imageCover) return imageCover;
  // 老数据的 @/assets 引用要先解析，否则 <img src="@/assets/..."> 必裂
  const ownCover = String(post.cover_image_url || '').trim();
  if (ownCover) return resolveStoredCoverUrl(ownCover) || ownCover;
  // 转发帖本身无图：借用被引用原帖的封面（老数据 @/assets 引用先解析）
  if (post.post_kind === 'repost') {
    const quotedCover = String(getQuotedPost(post)?.cover_image_url || '').trim();
    if (quotedCover) return resolveStoredCoverUrl(quotedCover) || quotedCover;
  }
  return '';
};

/* 封面加载失败兜底（2026-10-26）
   症状：作品卡左上角一个破图图标 + 一大块占位空白（因为 aspect-ratio 已经把高度撑开）。
   根因是 URL 本身失效（云端图被删 / CDN 域名不可达 / 旧路径），前端拿不到资源。
   处理：失败的 URL 进 brokenCovers，取值函数立刻返回空 ⇒ 卡片当轮退回纯文字排版。
   Set 存 URL 而不是卡片 id：同一条坏链在多张卡之间也能一次记住。 */
const brokenCovers = reactive(new Set());
const markCoverBroken = (url) => {
  if (url) brokenCovers.add(url);
};
const postCover = (post) => {
  const url = getProfilePostCover(post);
  return url && !brokenCovers.has(url) ? url : '';
};
const noteCover = (card = {}) => {
  const url = resolveDbCardImage(card.coverImageUrl) || '';
  return url && !brokenCovers.has(url) ? url : '';
};

/** 多图张数（2026-10-26）：兼容 images 是「对象数组」与「字符串数组」两种存量形态。 */
const postImageCount = (post = {}) => {
  const images = Array.isArray(post.images) ? post.images : [];
  if (images.length) return images.length;
  return Number(post.image_count || 0) || 0;
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

const loadReplies = async () => {
  const username = String(props.profile.username || '').trim();
  const userId = String(props.profile.id || '').trim();
  if (!username && !userId) return;
  repliesLoading.value = true;
  const result = await getCommentsByUsername(username, userId, { page: 1, pageSize: 20 });
  replies.value = result.error ? [] : result.data || [];
  repliesLoaded.value = true;
  repliesLoading.value = false;
};

watch(
  profileId,
  () => {
    replies.value = [];
    repliesLoaded.value = false;
    repliesLoading.value = false;
    if (profileId.value) void loadReplies();
  },
  { immediate: true },
);

watch(activeContentTab, (tab) => {
  // 同步回父层：受控 prop 的值必须跟着实际 tab 走，否则「切走再从此入口进」不触发 watch
  emit('content-tab-change', tab);
  if (tab === 'replies' && !repliesLoading.value && !repliesLoaded.value) {
    void loadReplies();
  }
});

/** 父层请求切 tab（旧深链 ?view=impressions / 其他入口）：单向驱动，不回声 */
watch(
  () => props.requestedContentTab,
  (tab) => {
    if (!tab || tab === activeContentTab.value) return;
    activeContentTab.value = tab;
  },
);
</script>

<style scoped>
.profile-home-shell {
  /* 2026-10-26 横屏全宽：不再压在 980px ——
     参考产品的个人主页是「内容区吃满可用宽度」，980 在 1440 上会留出两条大空白。 */
  width: 100%;
  max-width: none;
  margin: 0 auto;
  padding: 0 0 calc(var(--userspace-bottom-nav-offset, 80px) + 28px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 横屏（≥768）单独顶部栏位（2026-10-26 用户要求）：
   内容从导航岛下方开始，不与岛重叠 —— 与竖屏「封面贴顶、岛浮在上面」相反。
   两种取向并存是有意的：竖屏靠沉浸感，横屏靠可读性与左右分栏。 */
@media (min-width: 768px) {
  .profile-home-shell {
    padding-top: calc(var(--userspace-nav-h, 78px) + 12px);
  }
}

@media (max-width: 767px) {
  /* ================================================================
     竖屏全宽（2026-10-22）
     设计语言：内容 edge-to-edge，区块方角、无边框、无投影，
     靠 8px 页面底色缝 + 1px 分隔线分区；所有「窄卡」排版在这里重排
     （· 分隔的统计行、给编辑按钮留的 150px 右留白、居中小卡、圆角卡片流）。
     ⚠️ 两个必须遵守的写法：
     1) 规则写在这个 scoped 块里 —— 本文件选择器编译后是 `.x[data-v-*]`，
        特异性高于 responsive-integrations.css 的同名全局规则（写全局看不到效果，已实测）；
     2) 每条都带 `.profile-home-shell` 前缀 —— 本块位于基础规则**之前**，
        同特异性下会被后面的基础规则反超（首版就是这么静默失效的：封面仍 120px、
        统计行仍缩进 24px、编辑按钮仍是小胶囊）。前缀把它提到 (0,2,0)，稳定生效。
     ================================================================ */
  .profile-home-shell {
    padding: 0 0 0;
    gap: 8px;
  }

  .profile-home-shell > .profile-hero-panel,
  .profile-home-shell > .profile-activity-heatmap,
  .profile-home-shell > .profile-points-card-section,
  .profile-home-shell > .profile-content-panel {
    border-radius: 0;
    border-left-width: 0;
    border-right-width: 0;
    box-shadow: none;
  }

  /* 顶部贴顶（2026-10-26 用户要求）：不再给导航岛让出一条空白带 ——
     封面背景从 y=0 起铺、导航岛浮在它上面。上边框因此也要去掉，
     否则页顶会留一条 1px 的线，反而把「压在上面」的观感破坏掉。 */
  .profile-home-shell > .profile-hero-panel {
    border-top-width: 0;
  }

  /* 父容器 padding 归零后，hero 的负边距会把它推出视口 —— 显式归零。 */
  .profile-home-shell > .profile-hero-panel {
    margin-left: 0;
    margin-right: 0;
  }

  /* ── 封面：200px + 导航岛高度（2026-10-26 顶部贴顶 + 多露背景）───────────
     封面从页顶 y=0 铺起，导航岛压在它上面；多出来的 nav-h 让头像与名字
     落回岛下方，不会真的被盖住。--userspace-nav-h 由宿主 ResizeObserver 实测写入。 */
  .profile-home-shell .profile-cover-band {
    height: calc(200px + var(--userspace-nav-h, 78px));
  }

  .profile-home-shell .profile-hero-body {
    padding: 0 16px 16px;
    margin-top: -28px;
    gap: 14px;
  }

  .profile-home-shell .profile-hero-avatar .apple-avatar {
    width: 88px;
    height: 88px;
    border-width: 3px;
  }

  /* 宽屏给「编辑资料」胶囊留的 150px 右留白，在 390 下会把名字挤成两行。
     copy 基础是 flex row（名字/徽章同行），竖屏改 column 才能让按钮独占一行、
     否则 width:100% 在 row 里只是内容宽（实测仍是 140px 的小胶囊）。 */
  .profile-home-shell .profile-hero-copy {
    padding-top: 38px;
    padding-right: 0;
    flex-direction: column;
    align-items: stretch;
  }

  /* 编辑资料（2026-10-26 竖屏缩小）：不再是通栏主动作按钮，回到小胶囊 ——
     通栏黑块是旧版最重的视觉元素，主角应该是头像和昵称。
     要同时压掉三条既有约束，否则按钮永远只有 140px 或被迫全宽：
       · responsive-integrations.css 的 `max-width: 140px`（这里显式 max-width: none）
       · 基础规则的 `align-self: flex-start`（保持，让它左对齐不拉伸）
       · 基础 `.profile-hero-copy` 是 flex row（已在上方改 column） */
  .profile-home-shell .profile-edit-btn {
    position: static;
    width: auto;
    max-width: none;
    align-self: flex-start;
    margin-top: 10px;
    min-height: 30px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 12.5px;
    box-shadow: none;
  }

  /* ── 统计行（2026-10-26 纯数据流）：一行无分隔的纯文本，不要分割线、不要圆点、
        不要等分格子。数字加粗、标签灰、彼此紧邻 —— 与参考产品的数据行一致。 */
  .profile-home-shell .profile-hero-stats {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 14px;
    margin: 0;
    padding: 10px 0 0;
    border-top: 0;
  }

  .profile-home-shell .profile-hero-stats .stat-text {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
  }

  .profile-home-shell .profile-hero-stats .stat-text-num {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .profile-home-shell .profile-hero-stats .stat-text-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* 骨架期只有一个 span，让它横跨 4 格，避免加载完成时行高跳变 */
  .profile-home-shell .profile-hero-stats .stat-skeleton {
    grid-column: 1 / -1;
  }

  /* ── 积分卡：去掉 420 上限，卡面吃满内容宽 ─────────────────── */
  .profile-home-shell .profile-points-card-wrap .points-card {
    max-width: none;
  }

  /* ── 内容列表：2026-10-26 一度改成「通栏分隔线列表」（gap:0 / 无边距 / 每张卡一条下边框），
        当天下班前定稿为**四列错位图墙**，那三条随之作废 —— 留着会压过下面的网格定义
        （这两条带 .profile-home-shell 前缀，特异性 0,2,0 > 网格块的 0,1,0，
         表现为「四列完全贴在一起、还没有左右边距」）。网格几何见文件末尾的竖屏块。 */

  .profile-home-shell .profile-post-card:hover {
    box-shadow: none;
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
  animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
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
  box-shadow:
    0 8px 22px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.62);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
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
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.01em;
  /* 文字胶囊：宽度由 padding 撑开，绝不允许「设/置」竖排换行。
     任何断点若再写死 width，本条 nowrap 会把它变成溢出而不是换行 —— 那是更好的故障形态。 */
  white-space: nowrap;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  transition:
    transform 0.16s ease,
    background-color 0.16s ease;
}

@media (hover: hover) and (pointer: fine) {
  .profile-settings-btn:hover {
    transform: translateY(-1px);
    background: #ffffff;
  }
}

.profile-hero-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 18px;
  align-items: end;
  padding: 0 24px 18px;
  margin-top: -36px;
}

.profile-hero-body .boh-avatar-wrap {
  align-self: start;
}

.profile-hero-avatar .apple-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 4px solid var(--surface);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2);
  transition:
    transform 180ms var(--ease-out),
    box-shadow 180ms var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .profile-hero-avatar:hover .apple-avatar {
    transform: scale(1.025);
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.22);
  }
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
  animation: bio-clamp 150ms ease-out;
}

.profile-bio.expanded {
  display: block;
  animation: bio-reveal 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes bio-reveal {
  from {
    opacity: 0.4;
    transform: translateY(3px);
  }
}

@keyframes bio-clamp {
  from {
    opacity: 0.4;
  }
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
  min-height: 34px;
  padding: 0 16px;
  /* 2026-10-26（参考小红书的减重）：原来是 #1d1d1f 实心黑底 + 投影，
     一块纯黑 pill 成了整页最重的色块，压过了昵称与内容本身。
     改成描边次要按钮：入口不变、位置不变，只是不再抢视觉重心。 */
  border: 1px solid var(--stroke);
  border-radius: 999px;
  background: var(--surface-2, rgba(29, 29, 31, 0.05));
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
  transition:
    transform 160ms var(--ease-out),
    background-color 180ms ease,
    border-color 180ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .profile-edit-btn:hover {
    transform: translateY(-1px);
    background: var(--surface-3, rgba(29, 29, 31, 0.09));
    border-color: var(--stroke-strong, var(--stroke));
  }
}

.profile-edit-btn:active {
  transform: scale(0.98);
}

.profile-hero-stats {
  margin: 0 24px 22px;
  padding-top: 18px;
}

/* 2026-10-26：原「服务」段（Cloud+ / 摄影集两行）已删除 —— 摄影集并入资产卡第二行，
   Cloud+ 由底栏「图库」席与设置页承担。对应的 .profile-service* 样式整块移除。 */

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
  transition:
    transform 160ms var(--ease-out),
    color 160ms ease;
}

.profile-content-panel {
  overflow: hidden;
  border: 1px solid var(--stroke);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 120ms both;
}

/* 作品网格（2026-10-26 参考个人主页的双列/多列）
   桌面：auto-fill 196px（980 宽容器约 4 列）；竖屏：固定 2 列，gap 收到 10px。
   封面统一 3:4 竖向 —— 图片是主体，标题只占两行。 */
.profile-post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 16px;
  /* 2026-10-26：横屏也要内边距 —— 之前卡片贴到内容区边缘，
     与上方页签、下方「加载更多」的缩进不一致，看着像溢出。 */
  padding-inline: 20px;
}

@media (max-width: 767px) {
  /* 竖屏单列（2026-10-26 定稿）。四列是**横屏**的要求 —— 竖屏保持单列多次确认过：
     双列/四列在 390 宽下每格只剩 87px 宽，标题必被截成两字加省略号。 */
  .profile-post-grid {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 16px;
    /* 24px：单列时图片很容易「通栏糊满整屏」，收进来才有卡片感 */
    padding-inline: 24px;
  }

  .profile-post-copy {
    padding: 8px 2px 0;
  }

  .profile-post-copy h3 {
    font-size: 14px;
  }

  /* 竖屏页签：**不吸顶**（2026-10-26 撤回了当天上午的 sticky）。
     实测问题：sticky 条在滚动时把上下两张卡切成两半，条带两侧还露出卡片边角，
     看起来像布局错位。页签回到普通流，与内容一起滚动。左内边距与网格 24px 对齐。 */
  .profile-home-shell .profile-content-tabs {
    position: static;
    margin: 0 0 10px;
    padding: 8px 24px 10px;
    background: transparent;
  }

  /* 单列封面：横向 16:10 + 限高 220px（390 屏下 3:4 竖图会占掉大半屏）。
     ⚠️ 必须带 .profile-home-shell 前缀：基础 .profile-post-cover 在本文件**靠后**，
     scoped 后同特异性 ⇒ 源序在后的会赢（这条被压掉过一次）。 */
  .profile-home-shell .profile-post-cover {
    min-height: 0;
    max-height: 220px;
    aspect-ratio: 16 / 10;
  }
}

.profile-load-more-wrap {
  /* 2026-10-26：两处都必须跨列 —— 它在 .profile-post-grid（grid）里是**一个单元格**，
     只写 justify-content: center 会让按钮在那个格里居中（等于靠左偏一点），
     看起来就是「加载更多不居中」。 */
  grid-column: 1 / -1;
  column-span: all;
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 18px 0 10px;
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
  /* 2026-10-26（极简 / 参考个人主页）：卡片壳退场 —— 不再有描边、圆角容器与投影，
     版权归属交给封面自己的圆角。文字直接落在页面底色上。
     这样整页只剩「图 + 两行字」两件事，也和「整页无卡片容器」的口径一致。
     ⚠️ 底色仍保留（--surface-elevated）—— 无图文字的卡片需要有底，否则
        暗色下标题会浮在页面底色上、与相邻卡片糊在一起。 */
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  transform: none;
  transition: opacity 0.16s ease;
  animation: profile-post-card-in 260ms ease-out both;
}

@keyframes profile-post-card-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 2026-10-26：作品卡 hover 效果**整体移除**（用户定稿）。
   试过两版都不对：整卡 opacity（卡片无壳后是一个劣质方块闪动）、
   封面 img 缩放（大图在移动端本来就靠手势，hover 没有意义且会抖）。
   作品卡只保留 cursor: pointer。
   ⚠️ 但**光删本文件的 hover 不够**：profile-base.css 里还留着卡片壳时代的
   `.profile-post-card:hover { box-shadow; transform: translateY(-2px) }`，
   而本页的卡片壳已经退场（border:0 / background:transparent / border-radius:0）——
   阴影画在一个没有圆角的透明方框上，就是横屏看到的那块「很丑的矩形」
   （竖屏之所以没有，只是竖屏媒体块里顺带压了 box-shadow）。
   这条必须与全局规则对撞：scoped 后特异性 0,4,0 > 全局 0,2,0。 */
.profile-home-shell .profile-post-card:hover {
  border-color: transparent;
  box-shadow: none;
  transform: none;
}

.profile-post-card.text-only {
  min-height: auto;
  background: var(--surface-elevated);
  border-radius: 14px;
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
  /* 3:4 竖向封面（2026-10-26）：图片是卡片主体，标题只占两行。
     圆角搬到这里 —— 卡片壳已去掉，视觉边界由封面自身承担。 */
  aspect-ratio: 3 / 4;
  border-radius: 12px;
  background: #eef2f7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 42px;
  font-weight: 900;
  overflow: hidden;
}

/* 多图卡片（2026-10-26）：右下偏移出两层「纸边」，看起来像压着好几张图。
   用 box-shadow 而不是真实图层：列表里复制缩略图不值，视觉暗示够了。
   同时留出 6px 右/下内边距，避免叠层被相邻卡片盖住。 */
.profile-post-cover.is-multi {
  margin-right: 6px;
  margin-bottom: 6px;
  box-shadow:
    3px 3px 0 0 rgba(15, 23, 42, 0.1),
    3px 3px 0 1px var(--surface-elevated, #fff),
    6px 6px 0 0 rgba(15, 23, 42, 0.05),
    6px 6px 0 1px var(--surface-elevated, #fff);
}

.profile-post-multi-count {
  position: absolute;
  right: 8px;
  top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.profile-post-multi-count svg {
  width: 11px;
  height: 11px;
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
  padding: 8px 2px 0;
}

/* 标题两行截断（2026-10-26）：参考产品的卡片标题最多两行，超出省略 —— 
   卡片高度靠封面统一，文字区不再是「摘要 + 元信息」四行。 */
.profile-post-copy h3 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
}

.profile-post-copy p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.45;
}

.profile-post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  color: var(--text-tertiary, #8a8a8a);
  font-size: 11.5px;
  font-weight: 500;
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

.user-space-page[data-theme='dark'] .profile-settings-btn {
  background: rgba(24, 24, 27, 0.82);
  color: #f8fafc;
}

.user-space-page[data-theme='dark'] .profile-post-cover.empty {
  background: linear-gradient(135deg, rgba(49, 46, 129, 0.45), rgba(24, 24, 27, 0.92));
}

/* 封面比例的分工（2026-10-26 收口）：
   · 竖屏（≤767px，单列）→ 16:10 + 限高 220px，声明在文件上方「竖屏单列」那块；
   · 横屏 → 3:2（下面这条 `orientation: landscape`），四列墙上 200~280px 的格子
     配 3:2 的比例最整齐。
   原先这里还有一条 `@media (max-width:767px) and (orientation:portrait)` 把所有封面
   压成 3:2 —— 那是单列时代的规则，会和上面竖屏那块打架（同特异性、源序在后就赢），已删除。
   ⚠️ 竖屏的任何封面覆盖都要带 `.profile-home-shell` 前缀，否则会被本文件靠后的基础规则压掉。 */

@media (orientation: landscape) {
  .profile-points-card-section {
    width: min(100%, 430px);
    align-self: center;
    box-sizing: border-box;
  }

  .profile-post-cover,
  .profile-post-card:nth-child(3n + 1) .profile-post-cover,
  .profile-post-card:nth-child(4n + 2) .profile-post-cover,
  .profile-post-card:nth-child(5n + 3) .profile-post-cover {
    aspect-ratio: 3 / 2;
    min-height: 0;
  }
}

/* 宽屏：活跃轨迹与积分卡并排，内容区继续占满整行 */
@media (min-width: 768px) and (orientation: landscape) {
  .profile-home-shell {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    /* 2026-10-26：从 start 改 stretch —— 用 start 时两列各按自身内容高度，
       活跃轨迹（内容少）比积分卡矮一截，底边参差不齐。stretch 让两卡等高，
       热力图内部靠 heatmap-foot 的 margin-top:auto 把图例压到底部（见组件样式）。 */
    align-items: stretch;
    gap: 18px;
  }

  .profile-home-shell > .profile-hero-panel,
  .profile-home-shell > .profile-content-panel {
    grid-column: 1 / -1;
  }

  /* 两列内的卡片吃满行高，底边才能真的对齐 */
  .profile-home-shell > .profile-activity-heatmap,
  .profile-home-shell > .profile-points-card-section {
    height: 100%;
  }

  /* 2026-10-26：印象摘要行与「服务」段已删除，资产卡是两行通栏（.is-inline），
     所以只剩积分卡与内容面板需要在桌面双栏里控制占位。 */
  .profile-home-shell > .profile-points-card-section {
    width: 100%;
    max-width: none;
    align-self: stretch;
    box-sizing: border-box;
  }

  /* 横屏作品墙：四列，**按行读**（2026-10-26 定稿）。
     ⚠️ 曾试过 CSS columns 的纵向流（每列从上往下堆，短卡后面立刻接下一张）——
        洞确实没了，但日期顺序变成「先向下、再下一列」，用户明确说横着看更舒服 ⇒ 回退。
     现在用 grid，代价是「同一行里最矮的那张下方会留白」，用下面 .text-only 的
     `align-self: stretch` 补：纯文字卡撑满整行高度，白卡正好填住那块洞，
     行内仍是第 1/2/3/4 条，日期顺序从左到右。
     · 4 列；列距 14 / 行距 8（18→12→8 分三步收的）；
     · 错位（4n+2/3/4 = 14/28/8）保留：四列等高会像表格，轻微参差才有瀑布感；
     ⚠️ `align-items: start` 必须写：默认 stretch 会把 margin-top 的错位吃掉。 */
  .profile-home-shell .profile-post-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: start;
    gap: 8px 14px;
  }

  .profile-post-card:nth-child(4n + 2) {
    margin-top: 14px;
  }

  .profile-post-card:nth-child(4n + 3) {
    margin-top: 28px;
  }

  .profile-post-card:nth-child(4n + 4) {
    margin-top: 8px;
  }

  /* 纯文字卡：标题 + 三行正文 + 元信息贴底，卡片撑满整行高度。
     ① 撑满（align-self: stretch）—— 不撑的话它比图片卡矮 50~100px，
        同一行下方就是一块空洞，后面的图也顶不上来（grid 的行高由最高的那张决定）；
     ② 元信息 margin-top: auto —— 文字少时把「10-26 / 12赞 / 3评」压到卡底，
        与相邻图片卡的元信息大致同一水平线，看起来是一排而不是一堆。 */
  .profile-home-shell .profile-post-card.text-only {
    align-self: stretch;
    display: flex;
    flex-direction: column;
  }

  .profile-home-shell .profile-post-card.text-only .profile-post-copy {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px;
  }

  .profile-home-shell .profile-post-card.text-only .profile-post-copy h3 {
    font-size: 15px;
  }

  .profile-home-shell .profile-post-card.text-only .profile-post-copy p {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .profile-home-shell .profile-post-card.text-only .profile-post-meta {
    margin-top: auto;
    padding-top: 8px;
  }

  /* 页签左内边距与作品墙（20px）对齐：之前页签贴内容区左缘、墙缩进 20px，
     滚动时看起来像没对齐。 */
  .profile-home-shell .profile-content-tabs {
    padding-inline: 20px;
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
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.65),
    rgba(255, 255, 255, 0)
  );
  animation: userspace-stat-shimmer 1.15s linear infinite;
}

.user-space-page[data-theme='dark'] .profile-content-count-skeleton {
  background: rgba(71, 85, 105, 0.5);
}

.user-space-page[data-theme='dark'] .profile-content-count-skeleton::after {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.18),
    rgba(255, 255, 255, 0)
  );
}

@media (prefers-reduced-motion: reduce) {
  .profile-hero-panel,
  .profile-content-panel {
    animation-duration: 1ms;
    animation-delay: 0ms;
  }

  .profile-bio.expanded,
  .profile-bio.clamped {
    animation: none;
  }

  .profile-content-count-skeleton::after {
    animation: none;
  }
}
</style>

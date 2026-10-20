<template>
  <div class="newsroom-page" :class="{ 'is-condensed': isCondensed }">
    <!-- 页头：两段共用一份（活动段不再自带页头，2026-10-20 内容页合并） -->
    <header class="news-header">
      <div class="news-header-copy">
        <p class="news-kicker">
          {{ activeSegment === 'activities' ? '方块之家 · BOH EVENTS' : 'BOH 新闻社 · BOH SHOWS' }}
        </p>
        <h1 class="news-title">资讯</h1>
        <p class="news-subtitle">
          {{
            activeSegment === 'activities'
              ? '报名中的活动在最上方，往期活动按月份回看'
              : '新闻、活动、节目，都在这一页'
          }}
        </p>
      </div>
      <div class="news-header-actions">
        <button
          v-if="isAdmin && activeSegment === 'feed'"
          type="button"
          class="news-admin-publish-btn"
          @click="showPublishModal = true"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>投稿新闻</span>
        </button>
        <button
          v-if="isAdmin && activeSegment === 'activities'"
          type="button"
          class="news-admin-publish-btn activity-admin-publish-btn"
          @click="openActivityPublish"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>投稿活动</span>
        </button>
        <div v-if="activeSegment === 'feed'" class="news-stats" aria-label="内容统计">
          <span
            ><strong>{{ feedData.length }}</strong> 条内容</span
          >
          <span class="stats-divider" aria-hidden="true"></span>
          <span>{{ newsCount }} 新闻 · {{ showCount }} 节目</span>
        </div>
      </div>
    </header>

    <!-- 段控：资讯流 / 活动（状态真源是 route.query.tab，不是本地 ref） -->
    <SegmentTabs
      v-model="activeSegment"
      class="news-segment-tabs"
      :sections="NEWSROOM_SEGMENTS"
      aria-label="资讯分区"
    />

    <!-- ═══ 段一：资讯流（新闻 + 节目混排）═══ -->
    <div v-show="activeSegment === 'feed'" class="news-container">
      <!-- 加载状态 -->
      <div v-if="loading" class="news-grid news-skeleton-grid" aria-hidden="true">
        <div v-for="item in 6" :key="`news-loading-${item}`" class="news-card news-card-skeleton">
          <div class="news-skeleton-image">
            <div class="news-skeleton-block news-skeleton-date"></div>
          </div>
          <div class="news-content">
            <div class="news-skeleton-block news-skeleton-category"></div>
            <div class="news-skeleton-block news-skeleton-title"></div>
            <div class="news-skeleton-block news-skeleton-line wide"></div>
            <div class="news-skeleton-block news-skeleton-line"></div>
            <div class="news-meta">
              <div class="news-author">
                <div class="news-skeleton-block news-skeleton-avatar"></div>
                <div class="news-skeleton-block news-skeleton-author"></div>
              </div>
              <div class="news-skeleton-block news-skeleton-more"></div>
            </div>
          </div>
        </div>
      </div>

      <div v-else>
        <section v-if="currentNews.length" class="featured-news" aria-labelledby="featured-heading">
          <div class="section-heading-row">
            <h2 id="featured-heading">最新头条</h2>
            <span class="section-rule" aria-hidden="true"></span>
          </div>
          <div class="featured-layout">
            <article
              v-if="featuredNews"
              class="featured-card news-card"
              :class="{ 'is-show': featuredNews.kind === 'show' }"
              :data-category="featuredNews.category"
              :data-id="featuredNews.id"
              @click="openItem(featuredNews)"
              @keyup.enter="openItem(featuredNews)"
              @keyup.space.prevent="openItem(featuredNews)"
              tabindex="0"
              role="button"
              :aria-label="`${featuredNews.kind === 'show' ? '观看节目：' : '阅读：'}${featuredNews.title}`"
              ref="newsCards"
            >
              <div class="news-image" :class="{ 'is-empty': !hasNewsImage(featuredNews) }">
                <div class="news-image-fallback" aria-hidden="true">
                  <span>{{ (featuredNews.title || '新').charAt(0) }}</span>
                </div>
                <img
                  v-if="hasNewsImage(featuredNews)"
                  :src="getNewsImageUrl(featuredNews.image, 'card')"
                  :alt="featuredNews.title"
                  loading="eager"
                  fetchpriority="high"
                  decoding="async"
                  @error="onImgError"
                />
                <span v-if="featuredNews.kind === 'show'" class="show-play" aria-hidden="true"
                  ><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg
                ></span>
                <span class="news-date">{{ formatDate(featuredNews.date) }}</span>
              </div>
              <div class="news-content">
                <span class="news-category">{{ kindCategoryLabel(featuredNews) }}</span>
                <h3 class="news-title-card">{{ featuredNews.title }}</h3>
                <p class="news-excerpt">{{ featuredNews.excerpt }}</p>
                <div class="news-meta">
                  <span>{{
                    featuredNews.kind === 'show'
                      ? featuredNews.episodes || 'BOH 节目组'
                      : featuredNews.author
                  }}</span
                  ><span class="read-link">{{
                    featuredNews.kind === 'show' ? '立即观看 ↗' : '阅读全文 →'
                  }}</span>
                </div>
              </div>
            </article>
            <div class="secondary-news-list">
              <article
                v-for="news in secondaryNews"
                :key="news.kind + '-' + news.id"
                class="secondary-news-item news-card"
                :class="{ 'is-show': news.kind === 'show' }"
                :data-category="news.category"
                :data-id="news.id"
                @click="openItem(news)"
                @keyup.enter="openItem(news)"
                @keyup.space.prevent="openItem(news)"
                tabindex="0"
                role="button"
                :aria-label="`${news.kind === 'show' ? '观看节目：' : '阅读：'}${news.title}`"
                ref="newsCards"
              >
                <div class="secondary-thumb" :class="{ 'is-empty': !hasNewsImage(news) }">
                  <div class="news-image-fallback mini" aria-hidden="true">
                    <span>{{ (news.title || '新').charAt(0) }}</span>
                  </div>
                  <img
                    v-if="hasNewsImage(news)"
                    :src="getNewsImageUrl(news.image, 'card')"
                    :alt="news.title"
                    loading="lazy"
                    decoding="async"
                    @error="onImgError"
                  /><span v-if="news.kind === 'show'" class="show-play mini" aria-hidden="true"
                    ><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg
                  ></span>
                </div>
                <div class="secondary-copy">
                  <span class="news-category">{{ kindCategoryLabel(news) }}</span>
                  <h3>{{ news.title }}</h3>
                  <time>{{ formatDate(news.date) }}</time>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section class="latest-news" aria-labelledby="latest-heading">
          <div class="section-heading-row">
            <h2 id="latest-heading">全部内容</h2>
            <span class="section-rule" aria-hidden="true"></span>
          </div>

          <!-- 创作者节目投稿（原 /shows 页面独有，2026-10-20 合并后安置在这里）：
               只在「节目」筛选态下出现，避免混进综合流把新闻挤下去。
               安置理由：/shows 已退场，若不挂进来这个功能就丢了（交接文档 §4.4 的警告）。 -->
          <CreatorShowsPanel v-if="isShowFilterActive" class="news-creator-shows" />

          <div class="news-grid" ref="newsGrid">
            <!-- 内容卡片（新闻+节目混排） -->
            <article
              v-for="news in listNews"
              :key="news.kind + '-' + news.id"
              class="news-card"
              :class="{ 'is-show': news.kind === 'show' }"
              :data-category="news.category"
              :data-id="news.id"
              @click="openItem(news)"
              @keyup.enter="openItem(news)"
              @keyup.space.prevent="openItem(news)"
              tabindex="0"
              role="button"
              :aria-label="`${news.kind === 'show' ? '观看节目：' : '阅读：'}${news.title}`"
              ref="newsCards"
            >
              <div class="news-image" :class="{ 'is-empty': !hasNewsImage(news) }">
                <div class="news-image-fallback" aria-hidden="true">
                  <span>{{ (news.title || '新').charAt(0) }}</span>
                </div>
                <img
                  v-if="hasNewsImage(news)"
                  :src="getNewsImageUrl(news.image, 'card')"
                  :alt="news.title"
                  loading="lazy"
                  decoding="async"
                  fetchpriority="low"
                  @error="onImgError"
                />
                <span v-if="news.kind === 'show'" class="show-play" aria-hidden="true"
                  ><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg
                ></span>
                <div class="news-date">{{ formatDate(news.date) }}</div>
              </div>
              <div class="news-content">
                <span class="news-category">{{ kindCategoryLabel(news) }}</span>
                <h3 class="news-title-card">{{ news.title }}</h3>
                <p class="news-excerpt">{{ news.excerpt }}</p>
                <div class="news-meta">
                  <div class="news-author">
                    <div class="author-avatar" aria-hidden="true">
                      {{ (news.kind === 'show' ? '节' : news.author)?.charAt(0) || 'N' }}
                    </div>
                    <span>{{
                      news.kind === 'show' ? news.episodes || 'BOH 节目组' : news.author
                    }}</span>
                  </div>
                  <span>{{ news.kind === 'show' ? '立即观看 ↗' : '阅读全文 →' }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- 无结果提示 -->
      <div class="no-results" :class="{ show: !loading && currentNews.length === 0 }" role="status">
        <div class="no-results-card" aria-hidden="false">
          <i class="icon-file" style="font-size: 40px; color: #c7cdd6; margin-bottom: 16px"></i>
          <h3>暂无相关内容</h3>
          <p>换个关键词或筛选试试</p>
          <button class="reset-filters-btn" type="button" @click="resetFilters">清除筛选</button>
        </div>
      </div>

      <!-- 加载更多：无限滚动哨兵 + 按钮兜底 -->
      <div v-if="hasMore && !loading" class="load-more">
        <div ref="loadMoreSentinel" class="load-more-sentinel" aria-hidden="true"></div>
        <button class="load-more-btn" type="button" @click="loadMore">
          加载更多内容 <span aria-hidden="true">↓</span>
        </button>
      </div>
    </div>

    <!-- ═══ 段二：活动（报名区 + 按月归档，复用 ActivitiesList）═══ -->
    <!-- 用 v-show 而非 v-if：段切换不该销毁活动面板，否则每次切回都要重新拉两张表 -->
    <div v-show="activeSegment === 'activities'" class="news-activities-pane">
      <ActivitiesList
        v-if="activitiesMounted"
        ref="activitiesPanelRef"
        :show-header="false"
        :filter="activityFilter"
        :search-query="searchQuery"
      />
    </div>

    <!-- 管理员投稿新闻 -->
    <AdminContentPublishModal
      :visible="showPublishModal"
      type="news"
      @close="showPublishModal = false"
      @published="loadNewsData"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getImageUrl } from '../../utils/asset-helper.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
import DOMPurify from '@/utils/dompurify.js';
import { showIsland } from '@/composables/useIsland.js';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import AdminContentPublishModal from '@/components/AdminContentPublishModal.vue';
import ContentDetailIsland from '@/components/UnifiedNavbar/ContentDetailIsland.vue';
import CreatorShowsPanel from '@/components/CreatorShowsPanel/index.vue';
import SegmentTabs from '@/views/user-center/UserSpace/components/SegmentTabs.vue';
import ActivitiesList from '@/views/activities/ActivitiesList.vue';
import { SHOW_ITEMS, SHOW_CATEGORIES } from '@/data/shows.js';
// 消毒白名单与封面变换收口到 news-shared.js（详情岛 / 独立详情页共用，防两处漂移）
import {
  NEWS_SANITIZE_OPTIONS,
  NEWS_CARD_IMAGE_TRANSFORM,
  NEWS_DETAIL_IMAGE_TRANSFORM,
} from './news-shared.js';

// 导入新闻 composable
import { initNews, getAllNews, getCategoryName } from '../../composables/useNews';

const route = useRoute();
const router = useRouter();

// ═══ 段控（2026-10-20 内容页合并）：资讯流 / 活动 ═══
// 状态真源是 route.query.tab —— 不用本地 ref 单独存，否则刷新和前进后退会失步。
// 与 config/forum-sections.js 的 resolveForumSection 同思路：非法值一律回落默认段。
const NEWSROOM_SEGMENTS = [
  { id: 'feed', label: '资讯流' },
  { id: 'activities', label: '活动' },
];
const resolveNewsroomSegment = (value) =>
  NEWSROOM_SEGMENTS.some((segment) => segment.id === value) ? value : 'feed';

const activeSegment = computed({
  get: () => resolveNewsroomSegment(route.query.tab),
  set: (value) => {
    const next = resolveNewsroomSegment(value);
    // 默认段不写 query，保持 /newsroom 干净（分享链接最短）
    router.replace({
      path: '/newsroom',
      query: { ...route.query, ...(next === 'feed' ? { tab: undefined } : { tab: next }) },
    });
  },
});

// 活动面板挂载后才初始化（v-if 门闩）：首屏不看活动段时不白拉 activity_campaigns / activities 两张表
const activitiesMounted = ref(activeSegment.value === 'activities');
watch(
  () => activeSegment.value,
  (segment) => {
    if (segment === 'activities') activitiesMounted.value = true;
  },
);

// 活动段专用筛选值（与资讯流的 filterValue 分开，避免两段互相污染）
const activityFilter = ref('all');
watch(
  () => [route.query.tab, route.query.filter],
  ([tab, filter]) => {
    if (resolveNewsroomSegment(tab) === 'activities') {
      activityFilter.value =
        typeof filter === 'string' && ['all', 'campaign', 'past'].includes(filter) ? filter : 'all';
    }
    // notifyIsland 声明在下方（模块求值顺序上晚于本 watch 的注册）——
    // 用微任务推后一拍再调，避免 TDZ。与 ForumMain 里同类问题的既定写法一致。
    Promise.resolve().then(() => notifyIsland());
  },
);

// 新闻数据（kind: news）+ 节目混排
const newsData = ref([]);

// 当前显示的内容（新闻+节目混排，按 date 倒序，最大卡片恒为最新发布）
const currentNews = ref([]);
const visibleCount = ref(9);
const filteredNewsCount = ref(0);
const featuredNews = computed(() => currentNews.value[0] || null);
const secondaryNews = computed(() => currentNews.value.slice(1, 4));
const listNews = computed(() => currentNews.value.slice(4));
const hasMore = computed(() => currentNews.value.length < filteredNewsCount.value);

// 混排全量 + 计数
const feedData = computed(() => sortByDateDesc([...newsData.value, ...SHOW_ITEMS]));
const newsCount = computed(() => newsData.value.length);
const showCount = computed(() => SHOW_ITEMS.length);

// 加载状态
const loading = ref(true);

// 点击式筛选：类型 + 分类（单选 value）
// ⚠️ 节目分类从 SHOW_CATEGORIES 派生，不再手写 —— 手写那一份在加节目时会静默漏掉。
const typeOptions = [
  { label: '全部内容', value: 'all' },
  { label: '只看新闻', value: 'news:all' },
  { label: '只看节目', value: 'show:all' },
];
const newsOptions = [
  { label: '全部新闻', value: 'news:all' },
  { label: '活动公告', value: 'news:event' },
  { label: '更新日志', value: 'news:update' },
  { label: '社区动态', value: 'news:community' },
  { label: '官方通知', value: 'news:announce' },
];
const showOptions = [
  { label: '全部节目', value: 'show:all' },
  ...SHOW_CATEGORIES.map((category) => ({ label: category, value: `show:${category}` })),
];
const allFilterOptions = [...typeOptions, ...newsOptions.slice(1), ...showOptions];
const filterValue = ref('all');

// 「节目」筛选态：创作者投稿面板只在这一态出现（原 /shows 页面独有功能，见模板注释）
const isShowFilterActive = computed(() => String(filterValue.value || '').startsWith('show:'));

// 顶部导航岛通过路由参数同步筛选，刷新和前进/后退时保持一致
const routeFilter = typeof route.query.filter === 'string' ? route.query.filter : 'all';
if (allFilterOptions.some((option) => option.value === routeFilter))
  filterValue.value = routeFilter;
watch(
  () => route.query.filter,
  (value) => {
    const next =
      typeof value === 'string' && allFilterOptions.some((option) => option.value === value)
        ? value
        : 'all';
    filterValue.value = next;
    visibleCount.value = 9;
    updateDisplayNews();
  },
);

// 搜索查询：由顶部导航岛搜索条写入路由 ?q= 驱动（页内无搜索框）
const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '');

// 路由 q 变化 → 同步过滤并回到顶部
watch(
  () => route.query.q,
  (q) => {
    searchQuery.value = typeof q === 'string' ? q : '';
    visibleCount.value = 9;
    updateDisplayNews();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
);

// 路由 ?news= 变化 → 展开该条详情岛（深链语义）。
// 组件级 key 已从 route.fullPath 改为 route.path（同页换参数不再销毁重建组件），
// 因此不能再依赖 onMounted 里那一次性消费 —— 否则「已在 /newsroom 再改 ?news=」不会生效。
// onMounted 里的消费保留，负责首次进入 / 刷新时的落点。
watch(
  () => route.query.news,
  (raw) => {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id) return;
    const target = newsData.value.find((n) => String(n.id) === id);
    if (target) showModal(target);
  },
);

// 液态玻璃筛选栏：滚动收缩
const isCondensed = ref(false);
let scrollTicking = false;

const updateCondensed = () => {
  isCondensed.value = window.scrollY > 120;
};

const onScroll = () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    updateCondensed();
    scrollTicking = false;
  });
};

// 卡片分类文案：节目显示 节目·分类，新闻沿用原映射
const kindCategoryLabel = (item) =>
  item?.kind === 'show' ? `节目 · ${item.category}` : getCategoryName(item?.category);

// ========== 管理员「投稿新闻」= 发布新新闻（写 news 表，论坛官方帖自动同步） ==========
const authStore = useAuthStore();
const { isAdmin } = storeToRefs(authStore);
const showPublishModal = ref(false);

// 活动投稿：弹窗与发布链路都在 ActivitiesList 内部（唯一一份），页头按钮只负责转调。
// 面板没挂载时（还没切到活动段）点击是空操作 —— 但按钮也只在活动段渲染，正常不会发生。
const activitiesPanelRef = ref(null);
const openActivityPublish = () => activitiesPanelRef.value?.openPublish?.();

// 详情灵动岛：详情以导航栏延伸卡呈现（替代原页面内模态框）
let newsDetailIsland = null;
let lastFocusedEl = null;

const NEWS_MODAL_IMAGE_TRANSFORM = NEWS_DETAIL_IMAGE_TRANSFORM;

// 引用
const newsGrid = ref(null);
const newsCards = ref([]);
const loadMoreSentinel = ref(null);

// Intersection Observer
let observer = null;
let loadMoreObserver = null;

// 按筛选 value 过滤混排流
const applyFilterValue = (list) => {
  const v = filterValue.value;
  if (v === 'all') return list;
  const [type, sub] = v.split(':');
  let out = list.filter((item) => item.kind === type);
  if (sub && sub !== 'all') {
    out = out.filter((item) => item.category === sub);
  }
  return out;
};

// 过滤内容的统一方法：最大卡片恒为最新发布（按 date 倒序取 [0]）
const updateDisplayNews = () => {
  let filtered = sortByDateDesc(feedData.value);
  const query = searchQuery.value.toLowerCase().trim();

  filtered = applyFilterValue(filtered);
  if (query) {
    // 搜索与筛选叠加生效
    filtered = filtered.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        (item.excerpt || '').toLowerCase().includes(query) ||
        (item.author || '').toLowerCase().includes(query) ||
        (item.content && item.content.toLowerCase().includes(query)),
    );
  }

  filteredNewsCount.value = filtered.length;
  currentNews.value = filtered.slice(0, visibleCount.value);

  // 重新观察元素
  nextTick(() => {
    observeNewsCards();
    observeLoadMoreSentinel();
  });
};

const resetFilters = () => {
  filterValue.value = 'all';
  visibleCount.value = 9;
  // 同步清掉导航岛搜索的路由 q（若有）
  if (route.query.q || route.query.filter) {
    router.push({ path: '/newsroom', query: { ...route.query, q: undefined, filter: undefined } });
  } else {
    searchQuery.value = '';
    updateDisplayNews();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const loadMore = () => {
  visibleCount.value += 6;
  updateDisplayNews();
};

// 统一打开：节目跳外链，新闻弹详情
const openItem = (item) => {
  if (!item) return;
  if (item.kind === 'show') {
    if (item.link) window.open(item.link, '_blank', 'noopener');
    return;
  }
  showModal(item);
};

// 显示详情：挂到全局导航栏灵动岛（导航 surface 自动撑开，不会被导航遮挡）
const showModal = (news) => {
  if (!news) return;
  lastFocusedEl = document.activeElement;
  newsDetailIsland?.close();
  newsDetailIsland = showIsland.custom(ContentDetailIsland, {
    type: 'news',
    title: String(news.title || ''),
    meta: `${formatDate(news.date)} · ${getCategoryName(news.category)} · 作者：${news.author || '官方'}`,
    image: getNewsImageUrl(news.image, 'modal'),
    html: DOMPurify.sanitize(news.content || '', NEWS_SANITIZE_OPTIONS),
    // S4：新闻有独立页了，岛上给出「打开完整页面」入口（可分享/刷新的 URL）
    pageRoute: `/news/${encodeURIComponent(String(news.id || ''))}`,
    onClose: () => {
      // × / Esc 都走这里：必须真正清掉岛槽位，仅置空句柄岛不会消失
      newsDetailIsland?.close();
      newsDetailIsland = null;
      if (lastFocusedEl && lastFocusedEl.focus) {
        lastFocusedEl.focus();
      }
      lastFocusedEl = null;
    },
  });
};

// 格式化日期
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}/${String(date.getDate()).padStart(2, '0')}`;
};

const isCloudinaryImageUrl = (imageUrl) => {
  const safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return false;
  try {
    const parsed = new URL(safeUrl);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'res.cloudinary.com' &&
      parsed.pathname.includes('/image/upload/')
    );
  } catch (_error) {
    return false;
  }
};

const getNewsImageUrl = (imageUrl, variant = 'card') => {
  const safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return '';
  if (isCloudinaryImageUrl(safeUrl)) {
    return getCloudinaryTransformedUrl(
      safeUrl,
      variant === 'modal' ? NEWS_MODAL_IMAGE_TRANSFORM : NEWS_CARD_IMAGE_TRANSFORM,
    );
  }
  return getImageUrl(safeUrl);
};

// 是否有可用封面：空字符串视为无图，走首字 fallback，避免 <img src=""> 空白
const hasNewsImage = (news) => !!getNewsImageUrl(news?.image, 'card');

// 图片加载失败：隐藏坏图，露出底层 fallback 首字
const onImgError = (e) => {
  const img = e?.target;
  if (img?.style) img.style.display = 'none';
  const box = img?.closest?.('.news-image, .secondary-thumb');
  if (box) box.classList.add('is-empty');
};

const sortByDateDesc = (list) => [...list].sort((a, b) => new Date(b.date) - new Date(a.date));

// 观察新闻卡片：首屏头条必须立即可见，失败时兜底强制 visible（修复左侧空白但可点击）
const observeNewsCards = () => {
  if (observer) {
    observer.disconnect();
  }

  const observerOptions = {
    threshold: 0.05,
    rootMargin: '0px 0px -20px 0px',
  };

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  const cards = Array.isArray(newsCards.value) ? [...newsCards.value] : [newsCards.value];
  // featured 大卡与 v-for 卡片共用同名 ref，Vue 的 ref 收集会把非 v-for 的那个
  // 挤出数组（v-for 首个挂载会用数组整体覆盖同名 ref），这里显式补上，
  // 让它不再依赖 600ms 兜底点亮（避免快速滚出首屏后返回时"隐形但可点"）
  const featuredEl = document.querySelector('.newsroom-page .featured-card');
  if (featuredEl && !cards.includes(featuredEl)) {
    cards.push(featuredEl);
  }
  cards.forEach((card) => {
    const el = card?.$el || card;
    if (el instanceof Element) {
      // 首屏头条直接点亮，不等滚动
      const rect = el.getBoundingClientRect?.();
      if (rect && rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('visible');
      } else {
        observer.observe(el);
      }
    }
  });

  // 兜底：600ms 后仍未 visible 的首屏卡强制点亮，防止空白可点
  clearTimeout(observeNewsCards._t);
  observeNewsCards._t = setTimeout(() => {
    document.querySelectorAll('.newsroom-page .news-card:not(.visible)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + 120) el.classList.add('visible');
    });
  }, 600);
};

// 无限滚动哨兵
const observeLoadMoreSentinel = () => {
  if (loadMoreObserver) loadMoreObserver.disconnect();
  if (!loadMoreSentinel.value || !hasMore.value) return;
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMore.value && !loading.value) {
        loadMore();
      }
    },
    { rootMargin: '320px 0px' },
  );
  loadMoreObserver.observe(loadMoreSentinel.value);
};

// ═══ 导航岛（搜索 + 筛选）随段切换 ═══
// 选项走结构化 groups（GlobalNavStatusCard 已改为按组渲染，下标切片契约作废）。
// 活动段的 filter 值域：all | campaign（报名中）| past（往期），在活动面板内消费。
const feedIslandItem = () => ({
  kind: 'news-tools',
  title: '资讯',
  message: '搜索与筛选',
  icon: 'search',
  persistent: true,
  query: searchQuery.value,
  filter: filterValue.value,
  groups: [
    { label: '', items: typeOptions },
    { label: '新闻分类', items: newsOptions.slice(1) },
    { label: '节目分类', items: showOptions },
  ],
  searchPlaceholder: '搜索新闻、节目、作者...',
  searchLabel: '搜索资讯流',
  filterLabel: '筛选资讯流',
  onSearch: (query) =>
    router.push({
      path: '/newsroom',
      query: { ...route.query, ...(query ? { q: query } : { q: undefined }) },
    }),
  onFilter: (filter) =>
    router.push({
      path: '/newsroom',
      query: { ...route.query, ...(filter !== 'all' ? { filter } : { filter: undefined }) },
    }),
});

const notifyIsland = () => {
  // 活动段**不注册**搜索岛：导航岛是「同一时刻只展示一张卡」的仲裁模型
  // （UnifiedNavbar 的 handleGlobalNavStatus：status 卡已可见 ⇒ 新通知入队），
  // 而 persistent 的搜索岛不会自己收起 ⇒ 活动段的报名反馈（请先登录 / 报名成功 /
  // 报名失败）会被永久排队，用户什么都看不到。
  // 活动段的搜索/筛选本来就作用在往期列表上，且面板自身有可用的空态文案，
  // 所以这里主动让位给一次性通知，是更符合语义的取舍。
  if (activeSegment.value === 'activities') {
    showIsland.preempt();
    return;
  }
  showIsland.notify(feedIslandItem());
};

onMounted(async () => {
  notifyIsland();
  // 添加页面加载完成类
  document.body.classList.add('is-loaded');

  syncNavHeight();
  navResizeObserver = new ResizeObserver(syncNavHeight);
  const nav = document.getElementById('unified-nav-container');
  if (nav && typeof ResizeObserver !== 'undefined') {
    navResizeObserver.observe(nav);
  }

  updateCondensed();
  window.addEventListener('scroll', onScroll, { passive: true });

  // 从 Supabase 加载新闻数据
  await loadNewsData();

  // 深链保底（S4）：/newsroom?news=<id> 直接展开详情岛（旧式分享链接落点）
  const deepLinkNewsId = typeof route.query.news === 'string' ? route.query.news.trim() : '';
  if (deepLinkNewsId) {
    const target = newsData.value.find((n) => String(n.id) === deepLinkNewsId);
    if (target) showModal(target);
  }
});

// 全局导航是 position:fixed，其实际高度与 --bohai-standalone-nav-height 声明值
// 并不一致（同 Health 页的发现）。filter-bar 用 --nav-h 做 sticky 吸顶避让，
// 这里实测导航真实高度写回页面根节点，避免吸顶时与导航叠压。
let navResizeObserver = null;
const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.newsroom-page');
  if (!nav || !page) return;
  const h = nav.getBoundingClientRect().height;
  if (h > 0) page.style.setProperty('--nav-h', `${Math.ceil(h)}px`);
};

// 加载新闻数据：最大卡片恒为最新发布（新闻+节目混排）
const loadNewsData = async () => {
  loading.value = true;
  await initNews();
  newsData.value = (getAllNews() || []).map((n) => ({ ...n, kind: 'news' }));
  updateDisplayNews();
  loading.value = false;

  // 观察新闻卡片
  nextTick(() => {
    observeNewsCards();
    observeLoadMoreSentinel();
  });
};

onBeforeUnmount(() => {
  window.dispatchEvent(
    new CustomEvent('boh_global_nav_status_preview', { detail: { visible: false } }),
  );
  // 详情岛随页面卸载（showIsland.custom 约定：宿主必须负责 close）
  newsDetailIsland?.close();
  newsDetailIsland = null;
  // 取消观察
  if (observer) {
    observer.disconnect();
  }
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
  }
  window.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
@import './style.scoped.css';
</style>

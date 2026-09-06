<template>
  <div class="smart-overview-page">
    <div class="overview-blob overview-blob-1" aria-hidden="true"></div>
    <div class="overview-blob overview-blob-2" aria-hidden="true"></div>
    <div class="overview-blob overview-blob-3" aria-hidden="true"></div>
    <div class="overview-container">
      <!-- 欢迎区 -->
      <header class="welcome-hero" aria-live="polite">
        <p class="welcome-eyebrow">
          <Sparkles :size="13" :stroke-width="2" aria-hidden="true" />
          <span>BOH AI 智能概览</span>
        </p>
        <h1 class="welcome-title">{{ welcomeTitle }}</h1>
        <p class="welcome-subtitle">{{ welcomeSubtitle }}</p>
        <p v-if="rangeText" class="welcome-range">{{ rangeText }}</p>
      </header>

      <!-- 加载骨架（首次加载或刷新时已有内容则不闪骨架） -->
      <div v-if="isLoading && visibleItems.length === 0" class="overview-stream" aria-hidden="true">
        <div v-for="n in 4" :key="`skeleton-${n}`" class="overview-card overview-card-skeleton">
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-chip"></div>
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-text"></div>
            <div class="skeleton-line skeleton-text skeleton-text-short"></div>
            <div class="skeleton-line skeleton-meta"></div>
          </div>
          <div class="skeleton-thumb"></div>
        </div>
      </div>

      <!-- 完全失败（无旧数据可保留时） -->
      <div v-else-if="loadError && visibleItems.length === 0" class="overview-status-card">
        <CloudOff class="overview-status-icon" :size="36" :stroke-width="1.6" aria-hidden="true" />
        <h2 class="overview-status-title">概览加载失败</h2>
        <p class="overview-status-text">{{ loadError }}</p>
        <div class="overview-status-actions">
          <button class="overview-btn" type="button" @click="refresh">
            <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
            重试
          </button>
        </div>
      </div>

      <!-- 空状态（当前页全部被点过后若还有更多，提供继续加载入口而不是"全部看完"） -->
      <div v-else-if="visibleItems.length === 0 && hasMore" class="overview-status-card">
        <CheckCircle2 class="overview-status-icon" :size="36" :stroke-width="1.6" aria-hidden="true" />
        <h2 class="overview-status-title">当前内容都看过了</h2>
        <p class="overview-status-text">后面还有内容，继续加载看看</p>
        <div class="overview-status-actions">
          <button class="overview-btn" type="button" :disabled="isLoadMore" @click="loadMore">
            {{ isLoadMore ? '正在加载…' : '加载更多' }}
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="visibleItems.length === 0 && !hasMore" class="overview-status-card">
        <CheckCircle2 class="overview-status-icon" :size="36" :stroke-width="1.6" aria-hidden="true" />
        <h2 class="overview-status-title">{{ emptyTitle }}</h2>
        <p class="overview-status-text">{{ emptyText }}</p>
        <div class="overview-status-actions">
          <router-link class="overview-btn" to="/user-space?tab=posts">去论坛看看</router-link>
          <router-link class="overview-btn overview-btn-secondary" to="/newsroom">前往新闻中心</router-link>
        </div>
        <p class="overview-status-note">首次登录时会展示最近 7 天的公开内容</p>
      </div>

      <!-- 内容流 -->
      <template v-else>
        <!-- 已有内容时的追加/刷新失败提示：不再静默吞掉翻页失败 -->
        <div v-if="loadError" class="overview-status-card" role="alert">
          <CloudOff class="overview-status-icon" :size="22" :stroke-width="1.6" aria-hidden="true" />
          <p class="overview-status-text">{{ loadError }}</p>
          <div class="overview-status-actions">
            <button class="overview-btn overview-btn-secondary" type="button" @click="refresh">
              <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
              重新加载
            </button>
          </div>
        </div>

        <div class="overview-stream">
          <OverviewCard
            v-for="(item, index) in visibleItems"
            :key="`${item.type}-${item.id}`"
            :item="item"
            :enter-delay="index < 12 ? index * 60 : 0"
            @open="handleOpenItem"
          />
        </div>

        <div v-if="hasMore" class="overview-load-more">
          <button
            class="overview-btn overview-btn-secondary"
            type="button"
            :disabled="isLoadMore"
            @click="loadMore"
          >
            {{ isLoadMore ? '正在加载…' : '加载更多' }}
          </button>
        </div>
      </template>
    </div>

    <!-- 新闻详情弹窗 -->
    <NewsDetailModal
      :is-open="isNewsModalOpen"
      :base="newsBase"
      :detail="newsDetail"
      :is-loading="isNewsLoading"
      :error="newsLoadError"
      @close="closeNewsModal"
      @retry="retryNewsDetail"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Sparkles, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { useOfflineOverview } from '@/composables/useOfflineOverview.js';
import { fetchNewsDetail } from '@/utils/api/overview-api.js';
import OverviewCard from './components/OverviewCard.vue';
import NewsDetailModal from './components/NewsDetailModal.vue';

const router = useRouter();
const authStore = useAuthStore();

const {
  visibleItems,
  anchorTime,
  anchorSource,
  isFirstLogin,
  hasMore,
  offlineDays,
  isLoading,
  isLoadMore,
  loadError,
  load,
  refresh,
  loadMore,
  dismissItem
} = useOfflineOverview();

const username = computed(() => String(authStore.userInfo?.username || '').trim() || '方块居民');

const formatAnchorTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const welcomeTitle = computed(() => {
  if (!isLoading.value && isFirstLogin.value) return '欢迎来到方块之家';
  return `欢迎回来，${username.value}`;
});

const welcomeSubtitle = computed(() => {
  if (isLoading.value && visibleItems.value.length === 0) {
    return '正在为你整理离线期间的新内容…';
  }
  if (isFirstLogin.value) return '这是社区最近的精彩内容，逛一圈认识大家吧';
  if (!anchorTime.value) return '我们为你整理了最近的公开更新';
  if (offlineDays.value >= 1) {
    return offlineDays.value === 1
      ? '你离开了一天，这些内容是在此期间发布的'
      : `你离开了 ${offlineDays.value} 天，这些内容是在此期间发布的`;
  }
  return '今天有一些新内容';
});

const rangeText = computed(() => {
  if (isFirstLogin.value || !anchorTime.value) return '';
  const formatted = formatAnchorTime(anchorTime.value);
  if (!formatted) return '';
  if (anchorSource.value === 'clamped') {
    return `内容范围：${formatted} 之后发布（最长回溯 90 天）`;
  }
  return `内容范围：${formatted} 之后发布`;
});

const emptyTitle = computed(() =>
  isFirstLogin.value ? '暂时还没有公开内容' : '离线期间没有新的帖子或新闻'
);

const emptyText = computed(() =>
  isFirstLogin.value ? '社区刚刚起步，去论坛逛逛认识大家吧' : '你已经看到当前所有更新，去别处转转吧'
);

const handleOpenItem = (item) => {
  dismissItem(item);
  if (item.type === 'post') {
    router.push(`/forum/post/${item.id}`);
    return;
  }
  openNewsModal(item);
};

// 新闻详情弹窗（复用新闻中心的 DOMPurify 清洗与 Cloudinary 图片方案）
const newsBase = ref(null);
const newsDetail = ref(null);
const isNewsModalOpen = ref(false);
const isNewsLoading = ref(false);
const newsLoadError = ref('');
// 弹窗详情请求时序守卫：快速连开两条新闻时，只让最后一次请求的结果生效，
// 防止慢的旧响应把"A 的正文"渲染进"B 的弹窗"
let newsDetailSeq = 0;

const openNewsModal = async (item) => {
  const seq = ++newsDetailSeq;
  newsBase.value = item;
  newsDetail.value = null;
  newsLoadError.value = '';
  isNewsModalOpen.value = true;
  isNewsLoading.value = true;
  try {
    const detail = await fetchNewsDetail(item.id);
    if (seq !== newsDetailSeq) return;
    if (!detail) throw new Error('未找到这条新闻，可能已被下架');
    newsDetail.value = detail;
  } catch (error) {
    if (seq !== newsDetailSeq) return;
    newsLoadError.value = error?.message || '暂时无法获取这条新闻';
  } finally {
    if (seq === newsDetailSeq) isNewsLoading.value = false;
  }
};

const retryNewsDetail = () => {
  if (newsBase.value) openNewsModal(newsBase.value);
};

const closeNewsModal = () => {
  isNewsModalOpen.value = false;
};

onMounted(() => {
  load();
});
</script>

<style>
@import './styles/overview.css';
</style>

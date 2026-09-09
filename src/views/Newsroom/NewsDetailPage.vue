<script setup>
/**
 * NewsDetailPage —— 新闻独立详情页（BETA 6 / S4：`/news/:id` 独立路由 + OG）
 *
 * 背景：新闻详情原先只存在于导航栏灵动岛（ContentDetailIsland），URL 不变、
 * 不可分享、不可刷新、无标题与分享卡。本页提供「真实存在的 URL」：
 *   - 刷新 / 前进后退 / 带链接分享均可用；
 *   - 挂载时经 applySeoMeta 写入 <title> + OG/Twitter meta（可执行 JS 的
 *     分享端与浏览器标签页获得正确预览；爬虫级 OG 见计划书 C3 后续项）。
 *
 * 视觉与数据形态与详情岛保持同源：同一套消毒白名单（news-shared.js）、
 * 同档 Cloudinary 封面变换（c_limit,w_1600），液态玻璃卡 + 明暗双主题。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, CalendarDays, ExternalLink, Newspaper, User } from 'lucide-vue-next';
import DOMPurify from '@/utils/dompurify.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
import { getImageUrl } from '@/utils/asset-helper.js';
import { fetchNewsDetail } from '@/utils/api/overview-api.js';
import { getCategoryName } from '@/composables/useNews.js';
import { themeManager } from '@/utils/theme-manager.js';
import { applySeoMeta } from '@/utils/seo-meta.js';
import EmptyState from '@/components/ui/EmptyState.vue';
import {
  NEWS_SANITIZE_OPTIONS,
  NEWS_DETAIL_IMAGE_TRANSFORM
} from './news-shared.js';

const route = useRoute();
const router = useRouter();

const news = ref(null);
const loading = ref(true);
const loadError = ref(null);
const currentTheme = ref(themeManager.getTheme?.() || 'light');

const handleThemeChange = (theme) => {
  currentTheme.value = theme || themeManager.getTheme?.() || 'light';
};

const newsId = computed(() => String(route.params.id || '').trim());

const coverUrl = computed(() => {
  const raw = String(news.value?.image || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com' && parsed.pathname.includes('/image/upload/')) {
      return getCloudinaryTransformedUrl(raw, NEWS_DETAIL_IMAGE_TRANSFORM);
    }
  } catch (_error) { /* 非法 URL 走兜底 */ }
  return getImageUrl(raw);
});

const sanitizedHtml = computed(() =>
  news.value?.content ? DOMPurify.sanitize(news.value.content, NEWS_SANITIZE_OPTIONS) : ''
);

const formattedDate = computed(() => {
  const date = new Date(news.value?.date || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
});

const loadDetail = async () => {
  const id = newsId.value;
  // news.id 是 bigint 列：非数字输入（如 /news/abc）直接按「不存在」处理，
  // 不发请求（发了也只会得到 22P02 invalid input syntax 错误）
  if (!id || !/^\d+$/.test(id)) {
    loading.value = false;
    loadError.value = 'NOT_FOUND';
    return;
  }
  loading.value = true;
  loadError.value = null;
  news.value = null;
  try {
    const data = await fetchNewsDetail(id);
    if (newsId.value !== id) return; // 路由已变，丢弃过期响应
    if (!data) {
      loadError.value = 'NOT_FOUND';
    } else {
      news.value = data;
      applySeoMeta({
        title: `${data.title || '新闻详情'} · BOHLITE 新闻`,
        description: String(data.excerpt || '').slice(0, 160),
        image: coverUrl.value,
        url: window.location.href
      });
    }
  } catch (error) {
    if (newsId.value !== id) return;
    loadError.value = error?.message || 'LOAD_FAILED';
  } finally {
    if (newsId.value === id) loading.value = false;
  }
};

const backToNewsroom = () => {
  router.push({ path: '/newsroom' });
};

const openInIsland = () => {
  // 从独立页跳回列表并还原灵动岛详情（query.news 深链由列表页接管）
  router.push({ path: '/newsroom', query: { news: newsId.value } });
};

const onCoverError = (event) => {
  if (event?.target) event.target.style.display = 'none';
};

onMounted(() => {
  currentTheme.value = themeManager.getTheme?.() || 'light';
  themeManager.addListener?.(handleThemeChange);
  void loadDetail();
});

onBeforeUnmount(() => {
  themeManager.removeListener?.(handleThemeChange);
});
</script>

<template>
  <div class="news-detail-page" :data-theme="currentTheme">
    <div class="ndp-shell">
      <button type="button" class="ndp-back" @click="backToNewsroom">
        <ArrowLeft :size="15" :stroke-width="2.2" aria-hidden="true" />
        <span>返回新闻&amp;节目</span>
      </button>

      <!-- 加载骨架 -->
      <div v-if="loading" class="ndp-card is-skeleton" aria-label="新闻加载中">
        <div class="ndp-skeleton ndp-sk-kicker"></div>
        <div class="ndp-skeleton ndp-sk-title"></div>
        <div class="ndp-skeleton ndp-sk-title short"></div>
        <div class="ndp-skeleton ndp-sk-cover"></div>
        <div class="ndp-skeleton ndp-sk-line"></div>
        <div class="ndp-skeleton ndp-sk-line"></div>
        <div class="ndp-skeleton ndp-sk-line short"></div>
      </div>

      <!-- 404 / 加载失败 -->
      <div v-else-if="loadError" class="ndp-empty">
        <EmptyState
          variant="search"
          :title="loadError === 'NOT_FOUND' ? '没有找到这篇新闻' : '新闻加载失败'"
          :description="loadError === 'NOT_FOUND' ? '链接可能已过期，或内容已被撤下。' : '网络似乎不太顺畅，稍后再试一次。'"
          action-label="回到新闻&节目"
          @action="backToNewsroom"
        />
      </div>

      <!-- 正文 -->
      <article v-else-if="news" class="ndp-card">
        <p class="ndp-kicker">
          <Newspaper :size="13" :stroke-width="2.2" aria-hidden="true" />
          <span>BOH 新闻社 · {{ getCategoryName(news.category) }}</span>
        </p>
        <h1 class="ndp-title">{{ news.title }}</h1>
        <div class="ndp-meta">
          <span class="ndp-meta-item">
            <CalendarDays :size="13" :stroke-width="2" aria-hidden="true" />
            <span>{{ formattedDate }}</span>
          </span>
          <span class="ndp-meta-item">
            <User :size="13" :stroke-width="2" aria-hidden="true" />
            <span>{{ news.author || '官方' }}</span>
          </span>
        </div>

        <img
          v-if="coverUrl"
          :src="coverUrl"
          :alt="news.title"
          class="ndp-cover"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          @error="onCoverError"
        />

        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="sanitizedHtml" class="ndp-rich" v-html="sanitizedHtml"></div>
        <p v-else class="ndp-excerpt-only">{{ news.excerpt }}</p>

        <div class="ndp-foot">
          <button type="button" class="ndp-foot-btn" @click="openInIsland">
            <ExternalLink :size="13" :stroke-width="2.1" aria-hidden="true" />
            <span>在新闻&amp;节目页打开详情卡</span>
          </button>
          <button type="button" class="ndp-foot-btn is-primary" @click="backToNewsroom">
            <ArrowLeft :size="13" :stroke-width="2.1" aria-hidden="true" />
            <span>返回列表</span>
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.news-detail-page {
  min-height: 100dvh;
  padding: calc(var(--nav-h, 76px) + 20px) 20px 64px;
  background: linear-gradient(160deg, #eef2f7 0%, #f7f8fa 46%, #eef4f0 100%);
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro SC", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
  transition: background 0.35s ease, color 0.35s ease;
}

/* 暗色：页面容器 data-theme 自管理（平铺选择器，勿用 :global） */
.news-detail-page[data-theme="dark"] {
  background: linear-gradient(160deg, #0d1017 0%, #10131a 46%, #0e1310 100%);
  color: #f2f4f8;
}

.ndp-shell {
  max-width: 860px;
  margin: 0 auto;
}

.ndp-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  padding: 8px 16px;
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter-sm, blur(10px));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(10px));
  box-shadow: var(--liquid-shadow, 0 4px 16px rgba(0, 0, 0, 0.06));
  color: var(--liquid-text-secondary, #565861);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.ndp-back:hover {
  transform: translateY(-1px);
  color: var(--liquid-text-primary, #1d1d1f);
}

.news-detail-page[data-theme="dark"] .ndp-back {
  background: rgba(30, 34, 44, 0.72);
  border-color: rgba(255, 255, 255, 0.1);
  color: #b9c0cc;
}

.news-detail-page[data-theme="dark"] .ndp-back:hover {
  color: #f2f4f8;
}

.ndp-card {
  padding: 34px clamp(22px, 4.5vw, 46px) 30px;
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.08));
  border-radius: 26px;
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter, blur(22px) saturate(1.5));
  -webkit-backdrop-filter: var(--liquid-filter, blur(22px) saturate(1.5));
  box-shadow: var(--liquid-shadow, 0 8px 32px rgba(0, 0, 0, 0.08)), var(--liquid-inner-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.6));
}

.news-detail-page[data-theme="dark"] .ndp-card {
  background: rgba(24, 28, 36, 0.72);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.ndp-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 5px 12px;
  border: 1px solid rgba(0, 113, 227, 0.22);
  border-radius: 999px;
  background: rgba(0, 113, 227, 0.08);
  color: var(--liquid-brand, #0071e3);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.ndp-title {
  margin: 0 0 12px;
  font-size: clamp(26px, 4vw, 36px);
  font-weight: 750;
  letter-spacing: -0.018em;
  line-height: 1.24;
  color: var(--liquid-text-primary, #1d1d1f);
  overflow-wrap: anywhere;
}

.ndp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 0 0 22px;
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 13px;
  font-weight: 600;
}

.ndp-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ndp-cover {
  display: block;
  width: 100%;
  margin: 0 0 26px;
  border-radius: 18px;
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.1);
}

.ndp-rich {
  font-size: 15.5px;
  line-height: 1.85;
  color: var(--liquid-text-primary, #1d1d1f);
  overflow-wrap: anywhere;
}

.ndp-rich :deep(p) { margin: 0 0 14px; }
.ndp-rich :deep(h2) { margin: 26px 0 12px; font-size: 21px; font-weight: 720; letter-spacing: -0.01em; }
.ndp-rich :deep(h3) { margin: 22px 0 10px; font-size: 18px; font-weight: 700; }
.ndp-rich :deep(ul), .ndp-rich :deep(ol) { margin: 0 0 14px; padding-left: 24px; }
.ndp-rich :deep(li) { margin: 6px 0; }
.ndp-rich :deep(blockquote) {
  margin: 18px 0;
  padding: 12px 18px;
  border-left: 3px solid var(--liquid-brand, #0071e3);
  border-radius: 0 12px 12px 0;
  background: rgba(0, 113, 227, 0.06);
  color: var(--liquid-text-secondary, #515258);
}
.ndp-rich :deep(code) {
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(0, 113, 227, 0.08);
  color: var(--liquid-brand, #0071e3);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.9em;
}
.ndp-rich :deep(pre) {
  margin: 16px 0;
  padding: 14px 18px;
  border-radius: 12px;
  background: #14161c;
  color: #e8eaef;
  overflow-x: auto;
}
.ndp-rich :deep(pre code) { padding: 0; background: none; color: inherit; }
.ndp-rich :deep(a) { color: var(--liquid-brand, #0071e3); font-weight: 650; text-decoration: none; }
.ndp-rich :deep(a:hover) { text-decoration: underline; }
.ndp-rich :deep(hr) { margin: 24px 0; border: none; border-top: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.08)); }

.news-detail-page[data-theme="dark"] .ndp-rich { color: #e6eaf2; }
.news-detail-page[data-theme="dark"] .ndp-rich :deep(blockquote) { background: rgba(41, 151, 255, 0.1); color: #b7c2d4; }
.news-detail-page[data-theme="dark"] .ndp-rich :deep(code) { background: rgba(41, 151, 255, 0.14); color: #4da3ff; }
.news-detail-page[data-theme="dark"] .ndp-rich :deep(hr) { border-top-color: rgba(255, 255, 255, 0.1); }

.ndp-excerpt-only {
  margin: 0;
  font-size: 15.5px;
  line-height: 1.85;
  color: var(--liquid-text-secondary, #515258);
}

.ndp-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.07));
}

.ndp-foot-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  background: transparent;
  color: var(--liquid-text-secondary, #565861);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
}

.ndp-foot-btn:hover {
  transform: translateY(-1px);
  color: var(--liquid-text-primary, #1d1d1f);
}

.ndp-foot-btn.is-primary {
  background: var(--liquid-brand, #0071e3);
  border-color: transparent;
  color: #fff;
}

.ndp-foot-btn.is-primary:hover {
  color: #fff;
  box-shadow: 0 8px 20px rgba(0, 113, 227, 0.28);
}

.ndp-empty {
  padding: 40px 0;
}

/* 骨架 */
.ndp-card.is-skeleton { min-height: 420px; }

.ndp-skeleton {
  border-radius: 12px;
  background: linear-gradient(100deg, rgba(120, 130, 145, 0.12) 30%, rgba(120, 130, 145, 0.2) 50%, rgba(120, 130, 145, 0.12) 70%);
  background-size: 240% 100%;
  animation: ndp-shimmer 1.5s ease-in-out infinite;
}

.ndp-sk-kicker { width: 150px; height: 22px; border-radius: 999px; margin-bottom: 16px; }
.ndp-sk-title { width: 72%; height: 34px; margin-bottom: 12px; }
.ndp-sk-title.short { width: 46%; }
.ndp-sk-cover { width: 100%; height: clamp(180px, 32vw, 320px); margin: 14px 0 22px; border-radius: 18px; }
.ndp-sk-line { width: 100%; height: 15px; margin-bottom: 12px; }
.ndp-sk-line.short { width: 62%; margin-bottom: 0; }

@keyframes ndp-shimmer {
  from { background-position: 120% 0; }
  to { background-position: -120% 0; }
}

@media (max-width: 640px) {
  .news-detail-page { padding-left: 12px; padding-right: 12px; }
  .ndp-card { padding: 24px 18px 24px; border-radius: 22px; }
}
</style>

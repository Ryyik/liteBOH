<template>
  <Transition name="global-nav-status" @after-leave="$emit('after-leave')">
    <component
      v-if="item?.visible"
      :is="item.kind === 'news-tools' ? 'div' : 'button'"
      type="button"
      class="global-nav-status-card"
      ref="card"
      :class="{ 'is-long': isLong, 'has-previews': previews.length > 0, 'is-reduced-motion': item.reducedMotion, 'is-news-tools': item.kind === 'news-tools' }"
      :style="cardStyle"
      @click="item.kind === 'news-tools' ? undefined : $emit('action')"
    >
      <template v-if="item.kind === 'news-tools'">
        <Search :size="17" class="news-tools-icon" aria-hidden="true" />
        <input v-model="newsQuery" class="news-tools-input" type="search" placeholder="搜索新闻、节目、作者..." aria-label="搜索新闻与节目" @keydown.enter="submitNewsSearch" />
        <button v-if="newsQuery" type="button" class="news-tools-clear" aria-label="清除搜索" @click="newsQuery = ''; submitNewsSearch()">×</button>
        <span class="news-tools-divider" aria-hidden="true"></span>
        <button type="button" class="news-tools-filter" :class="{ active: newsFilter !== 'all' }" aria-label="筛选新闻与节目" @click.stop="toggleNewsFilter"><SlidersHorizontal :size="17" aria-hidden="true" /></button>
        <div v-if="newsFilterOpen" class="news-tools-options" role="listbox" aria-label="筛选内容">
          <button v-for="option in primaryNewsOptions" :key="option.value" type="button" role="option" :aria-selected="newsFilter === option.value" :class="{ selected: newsFilter === option.value }" @click.stop="selectNewsFilter(option.value)">{{ option.label }}</button>
          <button type="button" class="news-tools-more" :aria-expanded="showNewsCategories" @click.stop="showNewsCategories = !showNewsCategories">{{ showNewsCategories ? '收起分类' : '更多分类' }}</button>
          <template v-if="showNewsCategories">
            <span class="news-tools-category-label">新闻分类</span>
            <button v-for="option in newsCategoryOptions" :key="option.value" type="button" role="option" :aria-selected="newsFilter === option.value" :class="{ selected: newsFilter === option.value }" @click.stop="selectNewsFilter(option.value)">{{ option.label }}</button>
            <span class="news-tools-category-label">节目分类</span>
            <button v-for="option in showCategoryOptions" :key="option.value" type="button" role="option" :aria-selected="newsFilter === option.value" :class="{ selected: newsFilter === option.value }" @click.stop="selectNewsFilter(option.value)">{{ option.label }}</button>
          </template>
        </div>
      </template>
      <template v-else>
      <span class="status-icon" :class="`tone-${item.icon}`">
        <component :is="activeIcon" :size="18" :stroke-width="2.1" aria-hidden="true" />
      </span>
      <span class="status-copy">
        <strong>{{ item.title }}</strong>
        <span>{{ item.message }}</span>
        <span v-if="previews.length" class="status-previews">
          <span v-for="(p, i) in previews" :key="`${p.type}-${i}`" class="status-preview-row" :class="{ 'has-image': p.image, 'is-featured': p.image && i === 0 }">
            <span class="status-preview-mark" :class="`is-${p.type}`" aria-hidden="true">{{ p.type === 'post' ? '帖子' : '新闻' }}</span>
            <span class="status-preview-main">
              <span class="status-preview-title">{{ p.title }}</span>
              <span v-if="p.time" class="status-preview-time">{{ p.time }}</span>
              <span v-if="p.excerpt" class="status-preview-excerpt">{{ p.excerpt }}</span>
            </span>
            <img v-if="p.image" class="status-preview-image" :src="p.image" alt="" loading="lazy" decoding="async" @load="reportHeight" @error="onPreviewImgError" />
          </span>
        </span>
      </span>
      <ChevronRight :size="18" aria-hidden="true" />
      </template>
    </component>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Bell, Bot, Check, ChevronRight, CircleAlert, MessageCircle, Newspaper, Search, SlidersHorizontal } from 'lucide-vue-next';

const props = defineProps({
  item: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action', 'after-leave', 'resize']);
const card = ref(null);
const newsQuery = ref(props.item?.query || '');
const newsFilter = ref(props.item?.filter || 'all');
const newsFilterOpen = ref(false);
const showNewsCategories = ref(false);
let resizeObserver;
const newsOptions = computed(() => Array.isArray(props.item?.options) ? props.item.options : []);
const primaryNewsOptions = computed(() => newsOptions.value.slice(0, 3));
const newsCategoryOptions = computed(() => newsOptions.value.slice(3, 7));
const showCategoryOptions = computed(() => newsOptions.value.slice(7));
const submitNewsSearch = () => props.item?.onSearch?.(newsQuery.value.trim());
const toggleNewsFilter = () => { newsFilterOpen.value = !newsFilterOpen.value; };
const selectNewsFilter = (value) => { newsFilter.value = value; newsFilterOpen.value = false; showNewsCategories.value = false; props.item?.onFilter?.(value); };
watch(() => props.item?.query, (value) => { newsQuery.value = String(value || ''); });
watch(() => props.item?.filter, (value) => { newsFilter.value = String(value || 'all'); });

const iconMap = {
  success: Check,
  message: MessageCircle,
  comment: MessageCircle,
  notification: Bell,
  post: Newspaper,
  search: Search,
  warning: CircleAlert,
  ai: Bot
};

const activeIcon = computed(() => iconMap[props.item?.icon] || Check);
const previews = computed(() => {
  const raw = Array.isArray(props.item?.previews) ? props.item.previews : [];
  return raw
    .filter((p) => p && typeof p === 'object')
    .slice(0, 3)
    .map((p) => ({
      type: p.type === 'news' ? 'news' : 'post',
      title: String(p.title || '').trim().slice(0, 60),
      excerpt: String(p.excerpt || '').trim().slice(0, 180),
      time: String(p.time || '').trim(),
      image: String(p.image || '').trim()
    }))
    .filter((p) => p.title);
});
const isLong = computed(() => props.item?.isLong || String(props.item?.message || '').length > 24);
const cardStyle = computed(() => ({
  '--global-nav-status-duration': `${props.item?.duration || 240}ms`,
  '--global-nav-status-distance': `${props.item?.distance || 22}px`,
  '--global-nav-status-blur': `${props.item?.blur || 20}px`
}));

const reportHeight = () => {
  const height = card.value?.getBoundingClientRect().height;
  if (height) emit('resize', height);
};

// 预览图破图兜底：隐藏占位区域，避免空白撑高卡片
const onPreviewImgError = (event) => {
  if (event?.target) event.target.style.display = 'none';
};

onMounted(async () => {
  await nextTick();
  reportHeight();
  resizeObserver = new ResizeObserver(reportHeight);
  if (card.value) resizeObserver.observe(card.value);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

// 卡片 v-if 隐藏期间 ref 为 null，重挂载后需要重新 observe（否则高度上报失效）
watch(
  () => props.item?.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    if (card.value) {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(reportHeight);
      resizeObserver.observe(card.value);
    }
    reportHeight();
  }
);

watch(
  () => [props.item?.visible, props.item?.title, props.item?.message, props.item?.isLong, props.item?.previews?.length],
  async () => {
    await nextTick();
    reportHeight();
  }
);
</script>

<style scoped>
.global-nav-status-card {
  position: absolute;
  z-index: 1;
  top: var(--global-nav-status-top);
  right: 7px;
  left: 7px;
  display: flex;
  align-items: center;
  gap: 13px;
  width: auto;
  min-height: 64px;
  padding: 13px 15px 15px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 24px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255,255,255,.68), rgba(255,255,255,.30));
  box-shadow: 0 14px 32px rgba(29, 41, 56, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255,255,255,.18);
  backdrop-filter: blur(28px) saturate(175%);
  -webkit-backdrop-filter: blur(28px) saturate(175%);
  cursor: pointer;
  text-align: left;
  transform: none;
  transform-origin: center top;
  clip-path: inset(0 round 22px);
  will-change: transform, opacity;
}

.global-nav-status-card.is-long { min-height: 78px; border-radius: 24px; }
.global-nav-status-card.is-news-tools { cursor: default; clip-path: none; overflow: visible; }
.news-tools-icon { flex: 0 0 auto; color: #64748b; }
.news-tools-input { flex: 1; min-width: 0; border: 0; outline: 0; color: #1d1d1f; background: transparent; font: inherit; font-size: 14px; }
.news-tools-clear, .news-tools-filter { display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: #64748b; cursor: pointer; }
.news-tools-filter { width: 34px; height: 34px; border-radius: 50%; }
.news-tools-filter.active, .news-tools-filter:hover { color: #fff; background: #1d1d1f; }
.news-tools-divider { width: 1px; height: 24px; background: rgba(100,116,139,.2); }
.news-tools-options { position: absolute; top: calc(100% + 8px); right: 16px; left: 16px; z-index: 3; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border: 1px solid rgba(255,255,255,.68); border-radius: 16px; background: rgba(255,255,255,.9); box-shadow: 0 14px 32px rgba(15,23,42,.16); backdrop-filter: blur(20px); }
.news-tools-options button { border: 1px solid rgba(100,116,139,.14); border-radius: 10px; padding: 7px 10px; color: #475569; background: rgba(255,255,255,.5); font: inherit; font-size: 12px; cursor: pointer; }
.news-tools-options button.selected { color: #fff; background: #1d1d1f; border-color: #1d1d1f; }
.news-tools-more { width: 100%; color: #64748b !important; background: transparent !important; border-style: dashed !important; }
.news-tools-category-label { width: 100%; margin-top: 3px; color: #98a2b3; font-size: 10px; font-weight: 700; }
.status-icon { display: inline-grid; flex: 0 0 auto; place-items: center; width: 34px; height: 34px; border-radius: 50%; }
.status-icon.tone-success { color: #057857; background: #d8f4e9; }
.status-icon.tone-message { color: #1d62d4; background: #dbeafe; }
.status-icon.tone-comment { color: #1d62d4; background: #dbeafe; }
.status-icon.tone-notification { color: #9a5b06; background: #fef3c7; }
.status-icon.tone-post { color: #146b96; background: #dff3fc; }
.status-icon.tone-search { color: #465569; background: #e8edf3; }
.status-icon.tone-warning { color: #b84212; background: #ffedd5; }
.status-icon.tone-ai { color: #6d38c8; background: #eee4ff; }
.status-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.status-copy strong { color: #1d2938; font-size: 13px; font-weight: 760; line-height: 1.25; }
.status-copy > span:not(.status-previews) { overflow: hidden; color: #617084; font-size: 12px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.is-long .status-copy > span:not(.status-previews) { overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: normal; }

/* ===== 内容预览行（智能概览灵动岛扩展） ===== */
.global-nav-status-card.has-previews { align-items: flex-start; padding: 15px 16px 17px; }
.has-previews .status-icon { margin-top: 1px; }
.has-previews > :last-child { margin-top: 4px; }
.status-previews { display: grid; gap: 0; margin-top: 11px; overflow: visible; white-space: normal; }
.status-preview-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 10px 3px 11px;
  border-bottom: 1px solid rgba(100,116,139,.13);
}
.status-preview-mark { flex: 0 0 auto; color: #1d62d4; font-size: 10px; font-weight: 750; line-height: 1; }
.status-preview-mark.is-news { color: #b8660b; }
.status-preview-main { display: grid; min-width: 0; flex: 1; gap: 3px; }
.status-preview-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #334155;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-preview-time { color: #8593a8; font-size: 10.5px; line-height: 1; white-space: nowrap; }
.status-preview-excerpt {
  display: -webkit-box;
  overflow: hidden;
  color: #66758a;
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.status-preview-image {
  grid-column: 1 / -1;
  order: 3;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: 190px;
  margin: 8px auto 0;
  border-radius: 12px;
  object-fit: contain;
  object-position: center;
  background: transparent;
  box-shadow: 0 8px 20px rgba(29, 41, 56, 0.10);
}
.status-preview-row.is-featured { padding-top: 12px; padding-bottom: 14px; }
.status-preview-row.is-featured .status-preview-image { max-height: 230px; border-radius: 14px; }
.status-preview-row.is-featured .status-preview-title { font-size: 15px; font-weight: 750; }

:global(#unified-nav-container[data-theme="dark"]) .status-preview-row { border-bottom-color: rgba(255,255,255,.12); }
:global(#unified-nav-container[data-theme="dark"]) .status-preview-title { color: rgba(226, 232, 240, 0.9); }
:global(#unified-nav-container[data-theme="dark"]) .status-preview-time { color: rgba(148, 163, 184, 0.85); }
:global(#unified-nav-container[data-theme="dark"]) .status-preview-row.is-featured { background: rgba(255, 255, 255, 0.1); }
:global(#unified-nav-container[data-theme="dark"]) .status-preview-mark.is-post { color: #60a5fa; }
:global(#unified-nav-container[data-theme="dark"]) .status-preview-mark.is-news { color: #fbbf24; }

:global(#unified-nav-container[data-theme="dark"]) .global-nav-status-card {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35,39,49,.78), rgba(22,25,33,.58));
  box-shadow: 0 16px 36px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.12);
}
:global(#unified-nav-container[data-theme="dark"]) .news-tools-input { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"]) .news-tools-options { background: rgba(28,28,30,.94); border-color: rgba(255,255,255,.14); }
:global(#unified-nav-container[data-theme="dark"]) .news-tools-options button { color: #e5e5ea; background: rgba(255,255,255,.08); }
:global(#unified-nav-container[data-theme="dark"]) .news-tools-options button.selected { color: #1d1d1f; background: #f5f5f7; }

:global(#unified-nav-container[data-theme="dark"]) .status-copy strong { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"]) .status-copy span { color: rgba(226, 232, 240, 0.76); }

.global-nav-status-enter-active,
.global-nav-status-leave-active {
  transition:
    clip-path var(--global-nav-status-duration) var(--ease-emphasized, cubic-bezier(0.16, 1, 0.3, 1)),
    transform var(--global-nav-status-duration) var(--ease-emphasized, cubic-bezier(0.16, 1, 0.3, 1)),
    opacity calc(var(--global-nav-status-duration) * 0.68) ease,
    filter calc(var(--global-nav-status-duration) * 0.72) ease;
}
.global-nav-status-enter-from,
.global-nav-status-leave-to {
  opacity: 0;
  filter: blur(2px);
  clip-path: inset(0 0 100% 0 round 22px);
  transform: translateY(calc(var(--global-nav-status-distance) * -0.45));
}
.is-reduced-motion.global-nav-status-card { transition-duration: 120ms; }

@media (max-width: 768px) {
  .global-nav-status-card { right: 5px; left: 5px; min-height: 58px; padding-left: 12px; padding-right: 12px; }
  .status-preview-image { max-height: 150px; }
  .status-preview-row.is-featured .status-preview-image { max-height: 185px; }
}

@media (prefers-reduced-motion: reduce) {
  .global-nav-status-enter-active,
  .global-nav-status-leave-active { transition-duration: 120ms; }
  .global-nav-status-enter-from,
  .global-nav-status-leave-to { filter: none; transform: none; }
}
</style>

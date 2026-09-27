<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { CalendarDays, ChevronDown, Search, Sparkles, X } from 'lucide-vue-next';
import { FORUM_TAG_OPTIONS } from '../forum-config.js';
import GlassPillButton from '@/components/ui/GlassPillButton.vue';

const props = defineProps({
  searchQuery: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  hasSignedThisWeek: { type: Boolean, default: false },
  sortMode: { type: String, default: 'latest' },
  selectedTagFilter: { type: String, default: '' },
  isAiSearchLoading: { type: Boolean, default: false },
  aiSearchHint: { type: String, default: '' },
  /* 最近搜索：数据由父级持有（存储读写也归它管），本组件只负责展示与透传点击 ——
     面板必须**贴着搜索框**，所以它渲染在这里而不是信息流顶部：
     隔着一个发帖框的话，手机上它会被底部导航栏压住（实测 y=773 / 视口 844，命中 nav-item），
     用户既看不到也点不到。 */
  searchHistory: { type: Array, default: () => [] },
  // 展开与否也由父级单点判断（它才知道聚焦态 + 输入是否为空）
  showSearchHistory: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:searchQuery',
  'searchSubmit',
  'askBohai',
  'clearTagFilter',
  // 清除搜索词（输入框右侧 × / 无结果引导）。与「清除标签筛选」分开：
  // 用户清关键词时不该顺手把 #标签 筛选也丢掉，反之亦然。
  'clearSearch',
  // 聚焦态：父级用它决定「最近搜索」条是否展开（空输入 + 聚焦时才展示）
  'searchFocus',
  'searchBlur',
  // 最近搜索的点击：回填某个词 / 清空历史（数据与存储都在父级）
  'applyHistoryKeyword',
  'clearSearchHistory',
  'openWeeklyCheckin',
  'setSortMode',
  'setTagFilter',
]);

const isFilterOpen = ref(false);
const filterRef = ref(null);
const searchInputRef = ref(null);

const filterSummaryText = computed(() => {
  const sortLabel = props.sortMode === 'hottest' ? '最热' : '最新';
  const tagOption = FORUM_TAG_OPTIONS.find((t) => t.value === props.selectedTagFilter);
  const tagLabel = tagOption ? tagOption.label : '全部标签';
  return `${sortLabel} · ${tagLabel}`;
});

const activeTagLabel = computed(() => {
  const option = FORUM_TAG_OPTIONS.find((t) => t.value === props.selectedTagFilter);
  return option ? option.label : `#${props.selectedTagFilter}`;
});

const toggleFilter = () => {
  isFilterOpen.value = !isFilterOpen.value;
};

const closeFilter = () => {
  isFilterOpen.value = false;
};

const handleClickOutside = (e) => {
  if (filterRef.value && !filterRef.value.contains(e.target)) {
    closeFilter();
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

const onSearchInput = (e) => {
  emit('update:searchQuery', e.target.value);
};

const onSearchSubmit = () => {
  emit('searchSubmit');
};

const onAskBohai = () => {
  if (props.isAiSearchLoading) return;
  emit('askBohai');
};

const onClearTagFilter = () => {
  emit('clearTagFilter');
};

const onApplyHistory = (keyword) => {
  emit('applyHistoryKeyword', keyword);
};

const onClearHistory = () => {
  emit('clearSearchHistory');
};

/* 清除搜索词：清空后把焦点交还输入框 —— 用户点 × 十有八九是想重新输入，
   焦点丢掉的话还得再点一次。 */
const onClearSearch = () => {
  emit('clearSearch');
  searchInputRef.value?.focus();
};

const onSearchFocus = () => {
  emit('searchFocus');
};

const onSearchBlur = () => {
  emit('searchBlur');
};

const onOpenWeeklyCheckin = () => {
  emit('openWeeklyCheckin');
};

const onSetSortMode = (mode) => {
  emit('setSortMode', mode);
  closeFilter();
};

const onSetTagFilter = (tag) => {
  emit('setTagFilter', tag);
  closeFilter();
};
</script>

<template>
  <div class="forum-toolbar">
    <div class="toolbar-search-wrapper">
      <Search class="toolbar-search-icon" :size="18" :stroke-width="2" />
      <input
        ref="searchInputRef"
        type="text"
        class="toolbar-search-input"
        :class="{ 'with-tag-chip': selectedTagFilter }"
        placeholder="搜索帖子、作者，或输入 #标签 筛选..."
        :value="searchQuery"
        @input="onSearchInput"
        @keyup.enter="onSearchSubmit"
        @focus="onSearchFocus"
        @blur="onSearchBlur"
      />
      <!-- 横屏：已激活的标签筛选 chip（点 × 清除；移动端隐藏，走筛选下拉） -->
      <button
        v-if="selectedTagFilter"
        type="button"
        class="toolbar-tag-chip"
        :title="`清除标签筛选 ${activeTagLabel}`"
        @click="onClearTagFilter"
      >
        <span class="tag-chip-label">{{ activeTagLabel }}</span>
        <X :size="12" :stroke-width="2.4" class="tag-chip-clear" aria-hidden="true" />
      </button>

      <!-- 清除搜索词：横屏独立定位（该档位 .toolbar-search-actions 整体隐藏） -->
      <button
        v-if="searchQuery"
        type="button"
        class="toolbar-clear-btn is-hero"
        aria-label="清除搜索"
        title="清除搜索"
        @click="onClearSearch"
      >
        <X :size="15" :stroke-width="2.6" />
      </button>

      <!-- 移动端：输入框内右侧操作（清除 + 问BOHAI + 搜索）；横屏隐藏 -->
      <div class="toolbar-search-actions">
        <!-- 清除按钮：只在有内容时出现（空着的时候多一个 × 只是噪音） -->
        <button
          v-if="searchQuery"
          type="button"
          class="toolbar-clear-btn"
          aria-label="清除搜索"
          title="清除搜索"
          @click="onClearSearch"
        >
          <X :size="14" :stroke-width="2.6" />
        </button>
        <button
          type="button"
          class="toolbar-ai-btn"
          :disabled="isAiSearchLoading"
          title="BOHAI 检索论坛内容，并在顶部 AI 岛回答（消耗 AI 额度，Fast 模型）"
          @click="onAskBohai"
        >
          <span class="ai-label">问 BOHAI</span>
        </button>
        <button type="button" class="toolbar-search-btn" aria-label="搜索" @click="onSearchSubmit">
          <Search :size="18" :stroke-width="2.2" />
        </button>
      </div>
    </div>

    <!-- AI 状态 / 提示：挂在工具栏层（横屏时显示在整个工具栏下方） -->
    <Transition name="toolbar-ai-status">
      <div v-if="isAiSearchLoading" class="toolbar-ai-status" aria-live="polite">
        <span class="toolbar-ai-spinner" aria-hidden="true"></span>
        <span class="toolbar-ai-loading-text">BOHAI 检索中</span>
      </div>
    </Transition>
    <div v-if="aiSearchHint && !isAiSearchLoading" class="toolbar-ai-hint">{{ aiSearchHint }}</div>

    <!-- 横屏 hero 底栏：签到 + 问BOHAI 在左，圆形搜索在右（移动端隐藏） -->
    <div class="toolbar-hero-bar">
      <div class="toolbar-hero-left">
        <GlassPillButton
          v-if="isLoggedIn"
          class="toolbar-hero-pill"
          :class="{ 'is-done': hasSignedThisWeek }"
          @click="onOpenWeeklyCheckin"
        >
          <CalendarDays :size="17" :stroke-width="1.9" aria-hidden="true" />
          <span>{{ hasSignedThisWeek ? '本周已签' : '签到' }}</span>
        </GlassPillButton>
        <GlassPillButton
          class="toolbar-hero-pill"
          tone="soft"
          :disabled="isAiSearchLoading"
          title="BOHAI 检索论坛内容，并在顶部 AI 岛回答（消耗 AI 额度，Fast 模型）"
          @click="onAskBohai"
        >
          <Sparkles :size="16" :stroke-width="2" aria-hidden="true" />
          <span>问 BOHAI</span>
        </GlassPillButton>
      </div>
      <button
        type="button"
        class="toolbar-hero-search-btn"
        aria-label="搜索"
        @click="onSearchSubmit"
      >
        <Search :size="19" :stroke-width="2.3" />
      </button>
    </div>

    <!-- 移动端第二行：签到 + 筛选下拉；横屏隐藏 -->
    <div class="toolbar-mobile-row">
      <GlassPillButton
        v-if="isLoggedIn"
        class="toolbar-checkin-btn"
        :class="{ 'is-done': hasSignedThisWeek }"
        @click="onOpenWeeklyCheckin"
      >
        <CalendarDays :size="18" :stroke-width="1.9" aria-hidden="true" />
        <span>{{ hasSignedThisWeek ? '本周已签' : '签到' }}</span>
      </GlassPillButton>

      <div ref="filterRef" class="toolbar-filter-wrapper">
        <GlassPillButton
          class="toolbar-filter-btn"
          :class="{ open: isFilterOpen }"
          @click="toggleFilter"
        >
          <span class="toolbar-filter-text">{{ filterSummaryText }}</span>
          <ChevronDown :size="16" :stroke-width="2.2" class="toolbar-filter-chevron" />
        </GlassPillButton>

        <Transition name="toolbar-filter-drop">
          <div v-if="isFilterOpen" class="toolbar-filter-dropdown">
            <div class="filter-dropdown-section">
              <div class="filter-dropdown-label">排序方式</div>
              <div class="filter-sort-row">
                <button
                  class="filter-sort-btn"
                  :class="{ active: sortMode === 'latest' }"
                  @click="onSetSortMode('latest')"
                >
                  最新
                </button>
                <button
                  class="filter-sort-btn"
                  :class="{ active: sortMode === 'hottest' }"
                  @click="onSetSortMode('hottest')"
                >
                  最热
                </button>
              </div>
            </div>
            <div class="filter-dropdown-divider"></div>
            <div class="filter-dropdown-section">
              <div class="filter-dropdown-label">标签筛选</div>
              <div class="filter-tag-row">
                <button
                  class="filter-tag-btn"
                  :class="{ active: selectedTagFilter === '' }"
                  @click="onSetTagFilter('')"
                >
                  全部标签
                </button>
                <button
                  v-for="tag in FORUM_TAG_OPTIONS"
                  :key="tag.value"
                  class="filter-tag-btn"
                  :class="{ active: selectedTagFilter === tag.value }"
                  @click="onSetTagFilter(tag.value)"
                >
                  {{ tag.label }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 最近搜索：绝对定位贴在工具栏下方（脱离 flex 流，不影响工具栏自身高度）。
         条目用 @mousedown.prevent 保住点击 —— 否则 pointerdown 先让输入框 blur、
         面板收起，click 就落空了。 -->
    <Transition name="toolbar-history-drop">
      <div v-if="showSearchHistory" class="forum-search-history">
        <span class="search-history-label">最近搜索</span>
        <button
          v-for="keyword in searchHistory"
          :key="keyword"
          type="button"
          class="search-history-chip"
          @mousedown.prevent
          @click="onApplyHistory(keyword)"
        >
          {{ keyword }}
        </button>
        <button
          type="button"
          class="search-history-clear"
          @mousedown.prevent
          @click="onClearHistory"
        >
          清除
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.forum-toolbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 32px;
  padding: 8px 10px 8px 18px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 20px;
  box-shadow:
    0 8px 28px rgba(15, 23, 42, 0.05),
    var(--liquid-inner-highlight);
}

.toolbar-search-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.toolbar-search-icon {
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  color: #86868b;
  pointer-events: none;
  flex-shrink: 0;
}

.toolbar-search-input {
  flex: 1;
  width: 100%;
  min-width: 0;
  /* 右侧留出 清除× + 问BOHAI + 搜索 三个控件的宽度（原 120px + 清除键 30px） */
  padding: 10px 150px 10px 32px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  background: rgba(245, 245, 247, 0.6);
  color: #1d1d1f;
  outline: none;
  transition:
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

.toolbar-search-input::placeholder {
  color: #86868b;
}

.toolbar-search-input:focus {
  background: #ffffff;
  box-shadow: 0 0 0 1.5px rgba(0, 113, 227, 0.2);
}

/* 标签筛选 chip：默认隐藏（移动端走筛选下拉），横屏内显示 */
.toolbar-tag-chip {
  display: none;
}

.toolbar-search-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* 清除搜索词：只在输入框有内容时渲染（v-if），所以没有「禁用态」要处理。
   移动端作为 .toolbar-search-actions 的第一个子项内联；横屏用 .is-hero 版单独定位
   （那个档位 .toolbar-search-actions 整体 display:none，无法复用同一份 DOM）。 */
.toolbar-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.06);
  color: #667085;
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s,
    transform 0.15s;
}

.toolbar-clear-btn:hover {
  background: rgba(15, 23, 42, 0.12);
  color: #1d1d1f;
}

.toolbar-clear-btn:active {
  transform: scale(0.92);
}

.toolbar-clear-btn.is-hero {
  display: none;
}

/* ---------- 最近搜索（贴在搜索框下方）----------
   绝对定位而非占位：它是个浮层，不该把下面的内容顶下去 ——
   工具栏高度随断点变化（移动端换行 / 横屏 152px），占位会让 composer 与列表跳动。 */
.forum-search-history {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  /* 高于 .forum-toolbar 自身的 z-index: 5，确保盖住其后的发帖框与列表 */
  z-index: 60;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
}

.search-history-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #86868b;
}

.search-history-chip {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: #3f4a5a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s,
    transform 0.15s;
}

.search-history-chip:hover {
  background: rgba(15, 23, 42, 0.1);
  color: #1d1d1f;
  transform: translateY(-1px);
}

.search-history-chip:active {
  transform: scale(0.97);
}

.search-history-clear {
  margin-left: auto;
  padding: 6px 10px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #86868b;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s;
}

.search-history-clear:hover {
  background: rgba(15, 23, 42, 0.05);
  color: #3f4a5a;
}

.toolbar-history-drop-enter-active,
.toolbar-history-drop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toolbar-history-drop-enter-from,
.toolbar-history-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-history-drop-enter-active,
  .toolbar-history-drop-leave-active {
    transition: none;
  }
}

/* 暗色：面板在 .forum-page[data-theme='dark'] 之内，用祖先选择器即可 ——
   scoped 只给最后一个选择器加 [data-v-*]，祖先部分不受限，所以这里能命中本组件元素。 */
[data-theme='dark'] .forum-search-history {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(30, 30, 34, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
}

[data-theme='dark'] .search-history-label,
[data-theme='dark'] .search-history-clear {
  color: #9a9aa2;
}

[data-theme='dark'] .search-history-chip {
  background: rgba(255, 255, 255, 0.08);
  color: #d8d8de;
}

[data-theme='dark'] .search-history-chip:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

[data-theme='dark'] .search-history-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #d8d8de;
}

.toolbar-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 9px;
  border: none;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.045);
  color: #667085;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    box-shadow 0.2s;
  white-space: nowrap;
}

.toolbar-ai-btn:hover:not(:disabled) {
  background: rgba(17, 24, 39, 0.08);
  color: #111827;
}

.toolbar-ai-btn:disabled {
  opacity: 0.58;
  cursor: wait;
}

.toolbar-ai-btn .ai-label {
  line-height: 1;
}

.toolbar-search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #86868b;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    transform 0.15s;
}

.toolbar-search-btn:hover {
  background: rgba(15, 23, 42, 0.07);
  color: #1d1d1f;
  transform: translateY(-1px);
}

.toolbar-search-btn:active {
  transform: scale(0.96);
}

.toolbar-ai-status {
  position: absolute;
  left: 32px;
  bottom: -32px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.78);
  color: #344054;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  white-space: nowrap;
  z-index: 10;
}

.toolbar-ai-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(148, 163, 184, 0.26);
  border-top-color: rgba(17, 24, 39, 0.66);
  animation: toolbarAiSpin 0.86s linear infinite;
}

.toolbar-ai-loading-text {
  line-height: 1;
  white-space: nowrap;
}

@keyframes toolbarAiSpin {
  to {
    transform: rotate(360deg);
  }
}

.toolbar-ai-hint {
  position: absolute;
  left: 32px;
  bottom: -30px;
  color: #667085;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  z-index: 10;
}

.toolbar-ai-status-enter-active,
.toolbar-ai-status-leave-active {
  transition:
    opacity 0.26s ease,
    transform 0.26s ease,
    filter 0.26s ease;
}

.toolbar-ai-status-enter-from,
.toolbar-ai-status-leave-to {
  opacity: 0.34;
  transform: translateY(-8px) scale(0.985);
  filter: blur(2px);
}

/* 横屏 hero 底栏：默认（移动端）隐藏 */
.toolbar-hero-bar {
  display: none;
}

/* 移动端第二行容器：769-1023 档与输入框同行自然排列，≤768 才换行占满 */
.toolbar-mobile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
}

/* 形态已收敛到 ui/GlassPillButton.vue（玻璃底/描边/字重/hover 上浮均由组件承担），
   这里只保留业务差异：紧凑高度、open 态背景、已签态文字色 */
.toolbar-checkin-btn {
  min-height: 38px;
}

.toolbar-checkin-btn.is-done {
  color: #3f4a5a;
}

.toolbar-filter-wrapper {
  position: relative;
  min-width: 0;
}

.toolbar-filter-btn {
  min-height: 38px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 750;
}

.toolbar-filter-wrapper .toolbar-filter-btn.open {
  background: var(--glass-pill-bg-hover, rgba(255, 255, 255, 0.82));
}

.toolbar-filter-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-filter-chevron {
  flex-shrink: 0;
  color: #86868b;
  transition: transform 0.22s ease;
}

.toolbar-filter-btn.open .toolbar-filter-chevron {
  transform: rotate(180deg);
}

.toolbar-filter-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 240px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12);
  z-index: 100;
}

.filter-dropdown-section {
  margin-bottom: 4px;
}

.filter-dropdown-label {
  font-size: 11px;
  font-weight: 800;
  color: #86868b;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
  padding: 0 4px;
}

.filter-dropdown-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.04);
  margin: 8px 0;
}

.filter-sort-row {
  display: flex;
  gap: 6px;
}

.filter-sort-btn {
  flex: 1;
  min-height: 34px;
  border: none;
  border-radius: 10px;
  background: rgba(245, 245, 247, 0.7);
  color: #6e6e73;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    box-shadow 0.2s;
}

.filter-sort-btn.active {
  background: #ffffff;
  color: #1d1d1f;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.filter-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-tag-btn {
  min-height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(245, 245, 247, 0.7);
  color: #6e6e73;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    box-shadow 0.2s,
    transform 0.15s;
}

.filter-tag-btn:hover {
  background: #e8e8ed;
  transform: translateY(-1px);
}

.filter-tag-btn.active {
  background: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.1);
}

.toolbar-filter-drop-enter-active,
.toolbar-filter-drop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toolbar-filter-drop-enter-from,
.toolbar-filter-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

@media (max-width: 768px) {
  .forum-toolbar {
    flex-wrap: wrap;
    padding: 10px;
    border-radius: 16px;
    gap: 8px;
  }

  .toolbar-search-wrapper {
    flex: 1 1 100%;
    order: 0;
  }

  .toolbar-search-input {
    padding: 10px 130px 10px 32px;
    font-size: 16px;
  }

  .toolbar-mobile-row {
    order: 1;
    flex: 1 1 100%;
  }

  .toolbar-checkin-btn {
    flex: 1;
    justify-content: center;
    min-height: 40px;
  }

  .toolbar-filter-wrapper {
    flex: 1;
  }

  .toolbar-filter-btn {
    width: 100%;
    justify-content: center;
  }

  .toolbar-filter-dropdown {
    left: auto;
    right: 0;
    width: min(244px, calc(100vw - 24px));
    min-width: 0;
    max-width: calc(100vw - 24px);
  }

  .toolbar-ai-status,
  .toolbar-ai-hint {
    position: static;
    margin-top: 6px;
  }
}

/* 桌面两栏档（≥1024，与 base.css 两栏档同阈值；工具栏由 grid-areas 跨栏独占一行）：
   按草图重排为「大号液态玻璃搜索容器」——输入区在上，底部一行 [签到][问BOHAI] 左 + 圆形搜索钮右。
   筛选下拉在横屏移除，标签筛选改由输入框内 #标签名 语法承担（chip 显示当前筛选）。
   样式必须写在本组件 scoped —— base.css 是以 scoped 方式引入的，跨组件选择器匹配不到本组件内部 */
@media (min-width: 1024px) {
  .forum-toolbar {
    flex-direction: column;
    align-items: stretch;
    min-height: 152px;
    padding: 20px 22px 16px;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: var(--liquid-filter);
    -webkit-backdrop-filter: var(--liquid-filter);
    border: 1px solid rgba(255, 255, 255, 0.55);
    box-shadow:
      0 18px 44px rgba(15, 23, 42, 0.07),
      var(--liquid-inner-highlight);
  }

  /* 容器即输入框：输入区裸坐在容器上（无内嵌白底），聚焦反馈落在容器描边 */
  .forum-toolbar:focus-within {
    border-color: rgba(0, 113, 227, 0.3);
    box-shadow:
      0 18px 44px rgba(15, 23, 42, 0.07),
      0 0 0 3px rgba(0, 113, 227, 0.07),
      var(--liquid-inner-highlight);
  }

  .toolbar-search-wrapper {
    position: relative;
    flex: none;
  }

  .toolbar-search-icon {
    display: none;
  }

  .toolbar-search-input {
    height: 56px;
    /* 右侧给清除键让位（横屏这一档只有它一个控件挂在输入行右侧） */
    padding: 0 64px 0 28px;
    font-size: 16px;
    text-align: left;
    background: transparent;
  }

  .toolbar-search-input:focus {
    background: transparent;
    box-shadow: none;
  }

  .toolbar-search-input::placeholder {
    text-align: left;
    color: #9a9aa0;
  }

  .toolbar-search-input.with-tag-chip {
    padding-left: 156px;
  }

  /* 横屏隐藏移动端专属块 */
  .toolbar-search-actions,
  .toolbar-mobile-row {
    display: none;
  }

  /* 清除键：贴输入行右内侧（该档位输入行右侧没有别的控件，不与搜索按钮冲突 ——
     横屏的搜索按钮在下方 hero 栏的右端） */
  .toolbar-clear-btn.is-hero {
    position: absolute;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    width: 30px;
    height: 30px;
  }

  .toolbar-clear-btn.is-hero:hover {
    transform: translateY(-50%) scale(1.06);
  }

  .toolbar-clear-btn.is-hero:active {
    transform: translateY(-50%) scale(0.94);
  }

  /* 标签筛选 chip：贴输入行左侧 */
  .toolbar-tag-chip {
    position: absolute;
    left: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 128px;
    height: 34px;
    padding: 0 12px;
    border: none;
    border-radius: 999px;
    background: #1d1d1f;
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    transition:
      transform 0.18s ease,
      opacity 0.18s ease;
  }

  .toolbar-tag-chip:hover {
    transform: translateY(-50%) scale(1.03);
    opacity: 0.92;
  }

  .tag-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  .tag-chip-clear {
    flex-shrink: 0;
    opacity: 0.72;
  }

  /* hero 底栏：左双钮 + 右圆钮 */
  .toolbar-hero-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 16px;
  }

  .toolbar-hero-left {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* 按钮形态已封装为 ui/GlassPillButton.vue（样式单一源）；
     .toolbar-hero-pill 仅作布局锚点/探针标记 class 透传，这里只保留业务态配色 */
  .toolbar-hero-pill.is-done {
    color: #3f4a5a;
  }

  .toolbar-hero-search-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border: none;
    border-radius: 50%;
    background: #1d1d1f;
    color: #ffffff;
    cursor: pointer;
    box-shadow:
      0 10px 24px rgba(17, 24, 39, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease;
  }

  .toolbar-hero-search-btn:hover {
    transform: translateY(-1px) scale(1.02);
    background: #2b2b30;
    box-shadow:
      0 14px 30px rgba(17, 24, 39, 0.26),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .toolbar-hero-search-btn:active {
    transform: scale(0.95);
  }

  /* AI 状态 / 提示：挂到整个工具栏之下，避免与 hero 按钮重叠
    （此档位 wrapper 只包住输入行，绝对定位的包含块回落到 .forum-toolbar） */
  .toolbar-ai-status {
    bottom: auto;
    top: calc(100% + 10px);
    left: 28px;
  }

  .toolbar-ai-hint {
    bottom: auto;
    top: calc(100% + 12px);
    left: 28px;
  }

  /* 周年皮肤：保持皮肤原有的行内工具栏形态（皮肤样式带感叹号 important，这里恢复结构与子件可见性） */
  .forum-page[data-anniversary-skin='active'] .forum-toolbar {
    flex-direction: row;
    align-items: center;
    min-height: 0;
    padding: 9px;
    gap: 8px;
    background: rgba(251, 247, 233, 0.97);
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-hero-bar {
    display: none;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-actions {
    display: inline-flex;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-mobile-row {
    display: flex;
    gap: 8px;
    flex: 1 1 100%;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-icon {
    display: block;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-input {
    height: auto;
    padding: 10px 150px 10px 36px;
    text-align: center;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-input.with-tag-chip {
    padding-left: 156px;
    text-align: left;
  }
}
</style>

<script setup>
import { ref, computed } from 'vue';
import { CalendarDays, Search, Sparkles, X } from 'lucide-vue-next';
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
]);

const searchInputRef = ref(null);

const activeTagLabel = computed(() => {
  const option = FORUM_TAG_OPTIONS.find((t) => t.value === props.selectedTagFilter);
  return option ? option.label : `#${props.selectedTagFilter}`;
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
</script>

<template>
  <div class="forum-toolbar">
    <div class="toolbar-search-wrapper">
      <!-- 签到：2026-10-22 从原来的「第二行筛选栏」搬进搜索框左侧（参考稿里「+」的位置）。
           筛选下拉（最新 · 全部标签）同时撤掉：它占掉整整一行，而排序默认就是最新、
           标签可以直接在输入框里打 #标签 —— 那一行的成本远高于收益。 -->
      <button
        v-if="isLoggedIn"
        type="button"
        class="toolbar-checkin-inline"
        :class="{ 'is-done': hasSignedThisWeek }"
        :title="hasSignedThisWeek ? '本周已签到' : '每周签到'"
        @click="onOpenWeeklyCheckin"
      >
        {{ hasSignedThisWeek ? '已签' : '签到' }}
      </button>
      <span v-if="isLoggedIn" class="toolbar-inline-sep" aria-hidden="true"></span>
      <input
        ref="searchInputRef"
        type="text"
        class="toolbar-search-input"
        :class="{ 'with-tag-chip': selectedTagFilter }"
        placeholder="搜索帖子、作者或 #标签…"
        aria-label="搜索帖子"
        autocomplete="off"
        enterkeyhint="search"
        :value="searchQuery"
        @input="onSearchInput"
        @keyup.enter="onSearchSubmit"
        @focus="onSearchFocus"
        @blur="onSearchBlur"
      />
      <!-- 横屏：已激活的标签筛选 chip（点 × 清除；移动端隐藏，走 #标签 语法） -->
      <Transition name="toolbar-pop">
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
      </Transition>

      <!-- 清除搜索词：横屏独立定位（该档位 .toolbar-search-actions 整体隐藏） -->
      <Transition name="toolbar-pop">
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
      </Transition>

      <!-- 移动端 / 平板：输入框内右侧只留「清除 + 问BOHAI」。
           搜索不再单独放放大镜钮 —— 回车即搜索（enterkeyhint=search）。 -->
      <div class="toolbar-search-actions">
        <!-- 清除按钮：只在有内容时出现（空着的时候多一个 × 只是噪音） -->
        <Transition name="toolbar-pop">
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
        </Transition>
        <button
          type="button"
          class="toolbar-ai-btn"
          :disabled="isAiSearchLoading"
          title="BOHAI 检索论坛内容，并在顶部 AI 岛回答（消耗 AI 额度，Fast 模型）"
          @click="onAskBohai"
        >
          <span class="ai-label">问 BOHAI</span>
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
    <Transition name="toolbar-ai-hint">
      <div v-if="aiSearchHint && !isAiSearchLoading" class="toolbar-ai-hint">
        {{ aiSearchHint }}
      </div>
    </Transition>

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
        class="toolbar-hero-search-btn boh-press-sm"
        aria-label="搜索"
        @click="onSearchSubmit"
      >
        <Search :size="19" :stroke-width="2.3" />
      </button>
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
/* 竖屏 / 平板：一整条普通横框（参考稿形态）。整条容器不再是「卡里套框」——
   去掉玻璃、投影与嵌套白底，只留 1px 描边 + 全圆角，输入区裸坐其上。
   ≥1024 的横屏 hero 会在自己的媒体查询里把容器重新变回液态玻璃大卡。 */
.forum-toolbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 48px;
  margin-bottom: 18px;
  padding: 0 6px;
  /* 底色/描边走全局液态 token（:root 与 [data-theme='dark'] 各有一套）——
     这样不需要再写一份 [data-theme='dark'] 覆盖，也不会给暗色裸色棘轮添数。 */
  background: var(--liquid-bg-subtle);
  border: 1px solid var(--liquid-border-hairline);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.forum-toolbar:focus-within {
  border-color: rgba(0, 113, 227, 0.32);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.08);
}

.toolbar-search-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
}

/* 签到：搜索框最左侧的纯文字入口（原「+」位）。刻意不做成胶囊按钮 ——
   它是前缀动作，不该和右侧「问 BOHAI」抢视觉权重。 */
.toolbar-checkin-inline {
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px 0 12px;
  border: none;
  background: transparent;
  color: var(--liquid-text-secondary);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.toolbar-checkin-inline:hover {
  background: color-mix(in srgb, var(--liquid-text-primary) 6%, transparent);
}

.toolbar-checkin-inline:active {
  transform: scale(0.96);
}

.toolbar-checkin-inline.is-done {
  color: var(--liquid-text-tertiary);
  font-weight: 600;
}

.toolbar-inline-sep {
  flex-shrink: 0;
  width: 1px;
  height: 16px;
  margin-right: 4px;
  background: var(--liquid-border-hairline);
}

.toolbar-search-input {
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 46px;
  padding: 0 4px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  background: transparent;
  color: var(--liquid-text-primary);
  outline: none;
  transition:
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

.toolbar-search-input::placeholder {
  color: var(--liquid-text-tertiary);
}

/* 输入区自身不再有底色/描边：整条 toolbar 就是那颗「框」，聚焦反馈统一落在容器上 */
.toolbar-search-input:focus {
  background: transparent;
  box-shadow: none;
}

/* 标签筛选 chip：默认隐藏（移动端靠输入框里的 #标签 语法），横屏内显示 */
.toolbar-tag-chip {
  display: none;
}

.toolbar-search-actions {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-right: 2px;
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

/* 搜索框内的零碎控件（清除 × / 标签 chip）：出现时不该「啪」地把输入框挤一下。
   160ms 缩放淡入，退场快 40ms（消失不耐等）。 */
.toolbar-pop-enter-active {
  transition:
    opacity 160ms var(--ease-out),
    transform 160ms var(--ease-out);
}

.toolbar-pop-leave-active {
  transition:
    opacity 120ms var(--ease-out),
    transform 120ms var(--ease-out);
  /* 退场这 120ms 里元素还挂在 DOM 上。`is-hero` 版的清除钮是绝对定位、
     恰好压着输入框右端 —— 留它吃点击会让「清空后立刻点输入框」落空
     （探针 D3 正是这么点空的）。离场的节点一律不参与命中。 */
  pointer-events: none;
}

.toolbar-pop-enter-from,
.toolbar-pop-leave-to {
  opacity: 0;
  transform: scale(0.62);
}

/* chip 从左侧推入：原点在左边才读作「贴到输入框后面」，居中缩放会像凭空冒出来 */
.toolbar-tag-chip {
  transform-origin: left center;
}

/* AI 提示句：紧跟在有过渡的 AI 状态条下面，一硬一软最扎眼 */
.toolbar-ai-hint-enter-active {
  transition:
    opacity 320ms var(--ease-out),
    transform 320ms var(--ease-out);
}

.toolbar-ai-hint-leave-active {
  transition: opacity 200ms var(--ease-out);
}

.toolbar-ai-hint-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.toolbar-ai-hint-leave-to {
  opacity: 0;
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

/* 最近搜索下拉：0.18s/−6px 太快太浅，也不像「从输入框长出来」。
   改 0.32s + 原点贴顶 + 轻微压扁，读作「面板从搜索框下沿展开」。 */
.toolbar-history-drop-enter-active,
.toolbar-history-drop-leave-active {
  transform-origin: top center;
  transition:
    opacity 320ms var(--ease-out),
    transform 320ms var(--ease-out);
}

.toolbar-history-drop-leave-active {
  transition-duration: 200ms;
}

.toolbar-history-drop-enter-from,
.toolbar-history-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scaleY(0.96);
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

/* 「问 BOHAI」：整条框里唯一的按钮（参考稿右端的胶囊）。浅灰底 + 全圆角，
   比原来 10px 圆角的方标签更轻，也不再和输入区抢边界。 */
.toolbar-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--liquid-text-primary) 7%, transparent);
  color: var(--liquid-text-secondary);
  font-size: 11.5px;
  font-weight: 750;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    transform 0.15s;
  white-space: nowrap;
}

.toolbar-ai-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--liquid-text-primary) 11%, transparent);
  color: var(--liquid-text-primary);
}

.toolbar-ai-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.toolbar-ai-btn:disabled {
  opacity: 0.58;
  cursor: wait;
}

.toolbar-ai-btn .ai-label {
  line-height: 1;
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

@media (max-width: 768px) {
  .forum-toolbar {
    min-height: 46px;
    padding: 0 5px;
  }

  /* ≥16px 防 iOS 聚焦自动放大 */
  .toolbar-search-input {
    font-size: 16px;
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
    gap: 10px;
    min-height: 152px;
    margin-bottom: 32px;
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

  /* 横屏隐藏移动端专属块：输入框内的操作组 + 行内签到（hero 底栏已有同功能按钮） */
  .toolbar-search-actions,
  .toolbar-checkin-inline,
  .toolbar-inline-sep {
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

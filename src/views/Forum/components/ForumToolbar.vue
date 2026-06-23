<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { CalendarDays, ChevronDown, Search } from 'lucide-vue-next';
import { FORUM_TAG_OPTIONS } from '../forum-config.js';

const props = defineProps({
  searchQuery: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  hasSignedThisWeek: { type: Boolean, default: false },
  sortMode: { type: String, default: 'latest' },
  selectedTagFilter: { type: String, default: '' },
  isAiSearchEnabled: { type: Boolean, default: false },
  isAiSearchLoading: { type: Boolean, default: false },
  aiSearchHint: { type: String, default: '' }
});

const emit = defineEmits([
  'update:searchQuery',
  'searchSubmit',
  'toggleAiSearch',
  'openWeeklyCheckin',
  'setSortMode',
  'setTagFilter'
]);

const isFilterOpen = ref(false);
const filterRef = ref(null);

const filterSummaryText = computed(() => {
  const sortLabel = props.sortMode === 'hottest' ? '最热' : '最新';
  const tagOption = FORUM_TAG_OPTIONS.find(t => t.value === props.selectedTagFilter);
  const tagLabel = tagOption ? tagOption.label : '全部标签';
  return `${sortLabel} · ${tagLabel}`;
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

const onToggleAiSearch = () => {
  if (props.isAiSearchLoading) return;
  emit('toggleAiSearch');
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
        type="text"
        class="toolbar-search-input"
        placeholder="搜索帖子、内容或作者..."
        :value="searchQuery"
        @input="onSearchInput"
        @keyup.enter="onSearchSubmit"
      />
      <div class="toolbar-search-actions">
        <button
          type="button"
          class="toolbar-ai-btn"
          :class="{ active: isAiSearchEnabled }"
          :disabled="isAiSearchLoading"
          :aria-pressed="isAiSearchEnabled"
          :title="isAiSearchEnabled ? '关闭 BOHAI 搜索' : '开启 BOHAI 搜索'"
          @click="onToggleAiSearch"
        >
          <span class="ai-label">BOHAI</span>
          <span class="ai-switch-dot" aria-hidden="true"></span>
        </button>
        <button type="button" class="toolbar-search-btn" @click="onSearchSubmit">
          <Search :size="18" :stroke-width="2.2" />
        </button>
      </div>
      <Transition name="toolbar-ai-status">
        <div v-if="isAiSearchLoading" class="toolbar-ai-status" aria-live="polite">
          <span class="toolbar-ai-spinner" aria-hidden="true"></span>
          <span class="toolbar-ai-loading-text">BOHAI 搜索中</span>
        </div>
      </Transition>
      <div v-if="aiSearchHint && !isAiSearchLoading" class="toolbar-ai-hint">{{ aiSearchHint }}</div>
    </div>

    <button
      v-if="isLoggedIn"
      type="button"
      class="toolbar-checkin-btn"
      :class="{ 'is-done': hasSignedThisWeek }"
      @click="onOpenWeeklyCheckin"
    >
      <CalendarDays :size="18" :stroke-width="1.9" aria-hidden="true" />
      <span>{{ hasSignedThisWeek ? '本周已签' : '签到' }}</span>
    </button>

    <div ref="filterRef" class="toolbar-filter-wrapper">
      <button
        type="button"
        class="toolbar-filter-btn"
        :class="{ open: isFilterOpen }"
        @click="toggleFilter"
      >
        <span class="toolbar-filter-text">{{ filterSummaryText }}</span>
        <ChevronDown :size="16" :stroke-width="2.2" class="toolbar-filter-chevron" />
      </button>

      <Transition name="toolbar-filter-drop">
        <div v-if="isFilterOpen" class="toolbar-filter-dropdown">
          <div class="filter-dropdown-section">
            <div class="filter-dropdown-label">排序方式</div>
            <div class="filter-sort-row">
              <button
                class="filter-sort-btn"
                :class="{ active: sortMode === 'latest' }"
                @click="onSetSortMode('latest')"
              >最新</button>
              <button
                class="filter-sort-btn"
                :class="{ active: sortMode === 'hottest' }"
                @click="onSetSortMode('hottest')"
              >最热</button>
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
              >全部标签</button>
              <button
                v-for="tag in FORUM_TAG_OPTIONS"
                :key="tag.value"
                class="filter-tag-btn"
                :class="{ active: selectedTagFilter === tag.value }"
                @click="onSetTagFilter(tag.value)"
              >{{ tag.label }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
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
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 20px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.05), var(--liquid-inner-highlight);
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
  padding: 10px 120px 10px 32px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  background: rgba(245, 245, 247, 0.6);
  color: #1d1d1f;
  outline: none;
  transition: background-color 0.25s ease, box-shadow 0.25s ease;
}

.toolbar-search-input::placeholder {
  color: #86868b;
}

.toolbar-search-input:focus {
  background: #ffffff;
  box-shadow: 0 0 0 1.5px rgba(0, 113, 227, 0.2);
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
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
  white-space: nowrap;
}

.toolbar-ai-btn.active {
  background: rgba(17, 24, 39, 0.08);
  color: #111827;
  box-shadow: inset 0 0 0 1px rgba(17, 24, 39, 0.08), var(--liquid-inner-highlight);
}

.toolbar-ai-btn:disabled {
  opacity: 0.58;
  cursor: wait;
}

.toolbar-ai-btn .ai-label {
  line-height: 1;
}

.toolbar-ai-btn .ai-switch-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.78);
  transition: transform 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.toolbar-ai-btn.active .ai-switch-dot {
  background: #111827;
  box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.08);
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
  transition: background-color 0.2s, color 0.2s, transform 0.15s;
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
  backdrop-filter: blur(22px) saturate(170%);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
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
  transition: opacity 0.26s ease, transform 0.26s ease, filter 0.26s ease;
}

.toolbar-ai-status-enter-from,
.toolbar-ai-status-leave-to {
  opacity: 0.34;
  transform: translateY(-8px) scale(0.985);
  filter: blur(2px);
}

.toolbar-checkin-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
  color: #111827;
  font-size: 14px;
  font-weight: 850;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(31, 41, 55, 0.06), var(--liquid-inner-highlight);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
}

.toolbar-checkin-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.82);
}

.toolbar-checkin-btn.is-done {
  color: #3f4a5a;
}

.toolbar-filter-wrapper {
  position: relative;
  flex-shrink: 0;
}

.toolbar-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
  color: #111827;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(31, 41, 55, 0.06), var(--liquid-inner-highlight);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
  white-space: nowrap;
}

.toolbar-filter-btn:hover,
.toolbar-filter-btn.open {
  background: rgba(255, 255, 255, 0.82);
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
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
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
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
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
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.15s;
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
  transition: opacity 0.2s ease, transform 0.2s ease;
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
    padding: 10px 100px 10px 32px;
    font-size: 16px;
  }

  .toolbar-checkin-btn {
    order: 1;
    flex: 1;
    justify-content: center;
    min-height: 40px;
  }

  .toolbar-filter-wrapper {
    order: 2;
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
</style>

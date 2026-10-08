<template>
  <div class="boh-empty" :class="{ 'is-island': overlayMode }">
    <BohLogo size="lg" class="boh-empty__brand" />
    <h2 class="boh-empty__title">{{ title }}</h2>
    <p class="boh-empty__subtitle">{{ subtitle }}</p>

    <!-- 独立页（`/ai-chat`）：固定建议 -->
    <div v-if="standalone" class="boh-empty__suggestions">
      <button
        v-for="(suggestion, suggestionIndex) in activeSuggestions"
        :key="suggestion.text"
        type="button"
        :style="{ '--boh-item-order': suggestionIndex }"
        @click="onPick(suggestion)"
      >
        <span v-if="suggestion.icon" class="boh-empty__sug-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="15"
            height="15"
            v-html="suggestion.icon"
          ></svg>
        </span>
        <span v-if="suggestion.command" class="boh-empty__sug-cmd">{{ suggestion.command }}</span>
        <span>{{ suggestion.text }}</span>
      </button>
    </div>

    <!-- 浮层（岛）形态：上下文相关建议 -->
    <div
      v-if="overlayMode && quickSuggestions.length"
      class="boh-empty__suggestions boh-empty__suggestions--quick"
    >
      <button
        v-for="(suggestion, suggestionIndex) in quickSuggestionItems"
        :key="suggestion.text"
        type="button"
        :style="{ '--boh-item-order': suggestionIndex }"
        @click="onPick(suggestion)"
      >
        <span v-if="suggestion.command" class="boh-empty__sug-cmd">{{ suggestion.command }}</span>
        <span>{{ suggestion.text }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import BohLogo from './BohLogo.vue';

/**
 * BohEmptyState.vue — 空态（plans/025 v2 · Step 6-3 首刀，Step 6-1 对齐 Demo）
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `.empty-state` + `docs/DESIGN-BOHAI.md`
 * §2.1（字号）/ §2.3（圆角）/ §5（`Boh*` 命名契约）/ §7.1（形态切换文案）。
 *
 * ⚠️ 旧类名（`empty-state` / `empty-brand` / `empty-subtitle` / `full-ai-suggestions` /
 * `quick-context-suggestions`）**不迁移**（DESIGN §5：旧类名随旧 DOM 一起死）。
 * 断点与基座同文件 —— 理由见 `styles/layout.css` 文件头纪律 2。
 */
const props = defineProps({
  /** 独立页（`/ai-chat` 整页）—— 决定是否渲染固定建议 */
  standalone: { type: Boolean, default: false },
  /** 浮层（岛）形态 */
  overlayMode: { type: Boolean, default: false },
  /** 大模式 = 形态（Chat / Work），决定文案与建议集 */
  surface: { type: String, default: 'chat' },
  /** 独立页的固定建议（由壳从 `fullPageSuggestions` 传入，字符串数组） */
  standaloneSuggestions: { type: Array, default: () => [] },
  /** 浮层形态的上下文建议 */
  quickSuggestions: { type: Array, default: () => [] },
});

const emit = defineEmits(['pick']);

const COPY = {
  chat: {
    title: '今天想聊点什么?',
    subtitle: 'Enter 发送 · Shift + Enter 换行 · 输入 / 唤起命令',
  },
  work: {
    title: '今天要做点什么?',
    subtitle: '产物会在右侧工作台生成，可预览与下载',
  },
};

const title = computed(() => COPY[props.surface]?.title || COPY.chat.title);
const subtitle = computed(() => COPY[props.surface]?.subtitle || COPY.chat.subtitle);

/* Work 形态的建议集带图标（Demo 口径）；图标走内联 path，避免多引一份图标依赖。 */
const WORK_SUGGESTIONS = [
  {
    text: '导出活动回顾 Word',
    icon: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  },
  {
    text: '生成活动数据 PPT',
    icon: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M12 15v4M8 21h8"/>',
  },
  {
    text: '写一个照片重命名脚本',
    icon: '<path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4"/>',
  },
  { text: '素材盘点成表格', command: '/cloud' },
];

const toItems = (list) =>
  (Array.isArray(list) ? list : []).map((item) =>
    typeof item === 'string' ? { text: item } : item || { text: '' },
  );

const activeSuggestions = computed(() => {
  if (props.surface === 'work') return WORK_SUGGESTIONS;
  const items = toItems(props.standaloneSuggestions);
  return items.length ? items : toItems(['帮我梳理今天要做的事', '搜索 BOH 社区里的相关讨论']);
});

const quickSuggestionItems = computed(() => toItems(props.quickSuggestions));

/** 建议卡带 `/命令` 前缀时，点击要连同命令一起填进输入框（Demo 口径）。 */
const onPick = (item) =>
  emit('pick', item.command ? `${item.command} ${item.text}` : String(item.text || ''));
</script>

<style scoped src="./styles/boh-empty-state.css"></style>

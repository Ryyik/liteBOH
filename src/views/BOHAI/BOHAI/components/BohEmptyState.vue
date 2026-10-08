<template>
  <div class="boh-empty">
    <div class="boh-empty__brand" aria-label="BOH AI">
      <span>BOH</span>
      <span>AI</span>
    </div>
    <h2 class="boh-empty__title">今天需要我如何帮你？</h2>
    <p class="boh-empty__subtitle">提问、检索、计划任务，或让 BOH AI 整理你的想法。</p>

    <!-- 独立页：固定建议（`isStandalone`） -->
    <div v-if="standalone" class="boh-empty__suggestions">
      <button
        v-for="(suggestion, suggestionIndex) in standaloneSuggestions"
        :key="suggestion"
        type="button"
        :style="{ '--bohai-item-order': suggestionIndex }"
        @click="onPick(suggestion)"
      >
        {{ suggestion }}
      </button>
    </div>

    <!-- 浮层（岛）形态：上下文相关建议 -->
    <div
      v-if="overlayMode && quickSuggestions.length"
      class="boh-empty__suggestions boh-empty__suggestions--quick"
    >
      <button
        v-for="(suggestion, suggestionIndex) in quickSuggestions"
        :key="suggestion"
        type="button"
        :style="{ '--bohai-item-order': suggestionIndex }"
        @click="onPick(suggestion)"
      >
        {{ suggestion }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * BohEmptyState.vue — 空态（plans/025 v2 · Step 6-3 第一刀）
 *
 * 口径真源：`docs/DESIGN-BOHAI.md` §2.1（字号）/ §2.3（圆角）/ §5（`Boh*` 命名契约）。
 *
 * ⚠️ 从 `BOHAIMain.vue` 迁出时**只搬结构、不改行为**：
 *   · 旧类名（`empty-state` / `empty-brand` / `empty-subtitle` / `full-ai-suggestions` /
 *     `quick-context-suggestions`）**不迁移**（DESIGN §5：旧类名随旧 DOM 一起死）；
 *   · 页面级/overlay 变体样式在**本组件 scoped** 里（因为 scoped 命不中父组件之外），
 *     **断点规则**上收 `styles/layout.css`（DESIGN §3.2）。
 */
defineProps({
  /** 独立页（`/ai-chat` 整页）—— 决定是否渲染固定建议 */
  standalone: { type: Boolean, default: false },
  /** 浮层（岛）形态 */
  overlayMode: { type: Boolean, default: false },
  /** 独立页的固定建议（由壳从 `fullPageSuggestions` 传入） */
  standaloneSuggestions: { type: Array, default: () => [] },
  /** 浮层形态的上下文建议 */
  quickSuggestions: { type: Array, default: () => [] },
});

const emit = defineEmits(['pick']);

const onPick = (suggestion) => emit('pick', suggestion);
</script>

<style scoped src="./styles/boh-empty-state.css"></style>

<script setup>
/**
 * GlassPillButton —— 白底玻璃胶囊按钮（通用基件）
 *
 * 样式源起：论坛横屏工具栏的「问BOHAI」胶囊（2026-09-15 封装）。
 * 形态 = 半透明白底 + 白描边 + 内高光 + 小档液态玻璃滤镜，hover 上浮变白。
 * 材质变量来自全局 tokens（--liquid-filter-sm）与论坛体系（--liquid-inner-highlight，
 * 缺省时用内置 fallback，非论坛页面也能正常渲染）。
 *
 * 用法：
 *   <GlassPillButton @click="...">
 *     <Sparkles :size="16" /><span>问 BOHAI</span>
 *   </GlassPillButton>
 *
 * tone:
 *   - 'light'（默认）白玻璃底，适合容器上的主操作
 *   - 'soft'  淡灰底，同排按钮里做视觉主次时用（原「问BOHAI」款）
 *
 * 附加 class 会透传到根按钮（如 'is-done' 之类的业务态，由使用方自己的 scoped 定色）。
 */
defineProps({
  tone: {
    type: String,
    default: 'light',
    validator: (v) => ['light', 'soft'].includes(v)
  },
  disabled: { type: Boolean, default: false },
  /** 原生 title 提示 */
  title: { type: String, default: '' }
});

defineEmits(['click']);
</script>

<template>
  <button
    type="button"
    class="glass-pill-btn"
    :class="`tone-${tone}`"
    :disabled="disabled"
    :title="title || undefined"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<style scoped>
/* 材质经局部变量暴露：亮色为默认值，暗色由 forum-dark.css 的
   [data-theme="dark"] .glass-pill-btn 块覆盖变量（无需 important） */
.glass-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 42px;
  padding: 0 16px;
  border: 1px solid var(--glass-pill-border, rgba(255, 255, 255, 0.72));
  border-radius: 14px;
  background: var(--glass-pill-bg, rgba(255, 255, 255, 0.62));
  color: var(--glass-pill-text, #111827);
  font-size: 14px;
  font-weight: 850;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(31, 41, 55, 0.06), var(--liquid-inner-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.78));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
  white-space: nowrap;
}

.glass-pill-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: var(--glass-pill-bg-hover, rgba(255, 255, 255, 0.82));
}

.glass-pill-btn:active:not(:disabled) {
  transform: translateY(0);
}

.glass-pill-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.glass-pill-btn:focus-visible {
  outline: none;
  box-shadow: 0 4px 12px rgba(31, 41, 55, 0.06), 0 0 0 2.5px rgba(0, 113, 227, 0.28), var(--liquid-inner-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.78));
}

/* soft：淡灰底（原「问BOHAI」款），hover 仍走基础规则的变白反馈 */
.glass-pill-btn.tone-soft {
  background: var(--glass-pill-soft-bg, rgba(17, 24, 39, 0.045));
  border-color: var(--glass-pill-soft-border, rgba(17, 24, 39, 0.05));
}
</style>

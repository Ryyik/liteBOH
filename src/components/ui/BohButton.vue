<script setup>
import { computed } from 'vue';

/**
 * BohButton — 全站唯一按钮（plans/045 §2 组件 2）
 *
 * 四档权重（视觉重量 = 功能权重，primary 一屏一个）：
 *   primary   主操作（实色 accent）
 *   secondary 次操作（玻璃面）
 *   ghost     轻动作（无底，hover 才现 soft 底）
 *   danger    破坏性（soft 底，hover 填充；调用方必须配确认框，组件不代管）
 *
 * 动画内置（页面零 CSS）：按压 scale + hover 反馈走 --duration-press/--ease-emphasized；
 * loading 时 spinner 无缝替换图标位，aria-busy 同步。
 *
 * @example
 * <BohButton variant="primary" @click="publish">发布</BohButton>
 * <BohButton variant="danger" :loading="deleting" @click="askThenDelete">删除</BohButton>
 */
const props = defineProps({
  /** 视觉权重：primary | secondary | ghost | danger */
  variant: { type: String, default: 'secondary' },
  /** 尺寸：sm | md | lg */
  size: { type: String, default: 'md' },
  /** 加载态：转圈 + 阻断点击（不置灰，语义是「正在处理」） */
  loading: { type: Boolean, default: false },
  /** 禁用（与 loading 并存时 loading 优先展示） */
  disabled: { type: Boolean, default: false },
  /** 原生 type；表单里默认 submit 以外的按钮请显式传 button */
  type: { type: String, default: 'button' },
  /** 占满整行（移动端表单主操作） */
  block: { type: Boolean, default: false },
});

const emit = defineEmits(['click']);

const isBusy = computed(() => props.loading || props.disabled);

function onClick(event) {
  if (isBusy.value) return;
  emit('click', event);
}
</script>

<template>
  <button
    class="boh-btn"
    :class="[
      `boh-btn--${variant}`,
      `boh-btn--${size}`,
      { 'boh-btn--block': block, 'boh-btn--loading': loading },
    ]"
    :type="type"
    :disabled="disabled"
    :aria-busy="loading || undefined"
    @click="onClick"
  >
    <span v-if="loading" class="boh-btn__spinner" aria-hidden="true"></span>
    <span class="boh-btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.boh-btn {
  appearance: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--liquid-radius-pill, 999px);
  padding: 9px 20px;
  transition:
    transform var(--duration-press) var(--ease-emphasized),
    box-shadow var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}
.boh-btn:active {
  transform: scale(0.97);
}
.boh-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .boh-btn {
    transition-duration: 0s;
  }
}

/* 权重 1 · Primary —— 每屏唯一主操作 */
.boh-btn--primary {
  background: var(--boh-accent);
  color: #fff;
  box-shadow:
    0 6px 18px var(--boh-accent-soft),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.boh-btn--primary:hover:not(:disabled) {
  background: var(--boh-accent-strong);
}

/* 权重 2 · Secondary —— 玻璃面次操作 */
.boh-btn--secondary {
  background: var(--liquid-bg-strong);
  color: var(--liquid-text-primary);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--liquid-highlight-subtle), var(--liquid-shadow-sm);
}
.boh-btn--secondary:hover:not(:disabled) {
  background: var(--liquid-bg);
}

/* 权重 3 · Ghost —— 无底轻动作 */
.boh-btn--ghost {
  background: transparent;
  color: var(--boh-accent-text);
}
.boh-btn--ghost:hover:not(:disabled) {
  background: var(--boh-accent-soft);
}

/* 权重 4 · Danger —— 破坏性；调用方必须先过确认框 */
.boh-btn--danger {
  background: var(--boh-danger-soft);
  color: var(--boh-danger);
}
.boh-btn--danger:hover:not(:disabled) {
  background: var(--boh-danger);
  color: #fff;
}

/* 尺寸 */
.boh-btn--sm {
  padding: 6px 14px;
  font-size: 12px;
}
.boh-btn--lg {
  padding: 12px 26px;
  font-size: 15px;
}
.boh-btn--block {
  display: flex;
  width: 100%;
}

/* loading spinner：替换图标位，宽度稳定不跳字 */
.boh-btn__spinner {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  border-radius: 50%;
  border: 2px solid var(--boh-accent-soft);
  border-top-color: currentColor;
  animation: boh-btn-spin 0.8s linear infinite;
}
@keyframes boh-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .boh-btn__spinner {
    animation-duration: 0s;
  }
}
</style>

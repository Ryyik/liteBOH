<template>
  <div :class="['g-notice', toneClass]" role="status">
    <slot name="icon">
      <span aria-hidden="true">●</span>
    </slot>
    <span class="g-notice-text">
      <slot />
    </span>
    <button v-if="dismissible" type="button" class="g-notice-close" @click="$emit('dismiss')" aria-label="关闭">×</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  tone: { type: String, default: 'info' }, // info | success | warn | error
  dismissible: { type: Boolean, default: false }
});

defineEmits(['dismiss']);

const toneClass = computed(() => {
  if (props.tone === 'error') return 'is-error';
  if (props.tone === 'success') return 'is-success';
  if (props.tone === 'warn' || props.tone === 'warning') return 'is-warn';
  return '';
});
</script>

<style scoped>
.g-notice-text {
  flex: 1;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  line-height: 1.5;
}
.g-notice-close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 calc(var(--spacing) * 1);
  align-self: flex-start;
}
</style>

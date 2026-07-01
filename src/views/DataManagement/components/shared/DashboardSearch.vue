<template>
  <label class="g-search" :class="{ 'is-block': block }">
    <SearchIcon :size="16" class="g-search-icon" />
    <input
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      :aria-label="ariaLabel || placeholder"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown.esc="$emit('update:modelValue', '')"
    />
    <button
      v-if="modelValue"
      type="button"
      class="g-search-clear"
      aria-label="清除搜索"
      @click="$emit('update:modelValue', '')"
    >
      ×
    </button>
  </label>
</template>

<script setup>
import { Search as SearchIcon } from 'lucide-vue-next';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜索...' },
  ariaLabel: { type: String, default: '' },
  block: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);
</script>

<style scoped>
.g-search-clear {
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 calc(var(--spacing) * 1);
}
.g-search-clear:hover { color: var(--foreground); }
</style>

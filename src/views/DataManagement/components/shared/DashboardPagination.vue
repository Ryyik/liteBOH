<template>
  <nav class="g-pager" :aria-label="ariaLabel">
    <button
      type="button"
      class="g-pager-item is-disabled"
      :aria-label="'Previous page'"
      :disabled="!hasPrev"
      @click="goTo(modelValue - 1)"
    >
      ‹
    </button>
    <template v-for="(item, index) in pageItems" :key="`page-${index}`">
      <span v-if="item === '...'" class="g-pager-ellipsis">…</span>
      <button
        v-else
        type="button"
        :class="['g-pager-item', { 'is-active': modelValue === item }]"
        :aria-current="modelValue === item ? 'page' : undefined"
        @click="goTo(item)"
      >{{ item }}</button>
    </template>
    <button
      type="button"
      class="g-pager-item is-disabled"
      :aria-label="'Next page'"
      :disabled="!hasNext"
      @click="goTo(modelValue + 1)"
    >
      ›
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, required: true }, // current page
  total: { type: Number, required: true },
  pageSize: { type: Number, default: 10 },
  siblingCount: { type: Number, default: 1 },
  ariaLabel: { type: String, default: 'Pagination' }
});
const emit = defineEmits(['update:modelValue']);

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const hasPrev = computed(() => props.modelValue > 1);
const hasNext = computed(() => props.modelValue < totalPages.value);

const pageItems = computed(() => {
  const current = props.modelValue;
  const total = totalPages.value;
  const sibling = props.siblingCount;
  if (total <= 1) return [1];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const left = Math.max(2, current - sibling);
  const right = Math.min(total - 1, current + sibling);
  const items = [1];
  if (left > 2) items.push('...');
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push('...');
  items.push(total);
  return items;
});

const goTo = (page) => {
  if (page < 1 || page > totalPages.value || page === props.modelValue) return;
  emit('update:modelValue', page);
};

const rangeStart = computed(() => (props.total === 0 ? 0 : (props.modelValue - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(props.total, props.modelValue * props.pageSize));

defineExpose({ totalPages, rangeStart, rangeEnd });
</script>

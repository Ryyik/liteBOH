<template>
  <button
    type="button"
    :class="['g-table-row', { 'is-selected': selected }]"
    :tabindex="0"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  selected: { type: Boolean, default: false }
});
defineEmits(['click']);
</script>

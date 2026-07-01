<template>
  <span class="g-tooltip-wrap" :style="wrapStyle">
    <slot />
    <span v-if="text" :class="['g-tooltip', placementClass]">{{ text }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  text: { type: String, required: true },
  placement: { type: String, default: 'bottom' } // top | bottom | left | right
});

const placementClass = computed(() => `is-${props.placement}`);
const wrapStyle = computed(() => ({ display: 'inline-flex' }));
</script>

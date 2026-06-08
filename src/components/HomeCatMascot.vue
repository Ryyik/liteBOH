<template>
  <figure class="home-cat-mascot" :class="[`size-${size}`, { decorative }]" :aria-hidden="decorative ? 'true' : 'false'">
    <img :src="catSrc" :alt="decorative ? '' : altText" draggable="false" />
  </figure>
</template>

<script setup>
import { computed } from 'vue';
import { getHomeCatAsset, getHomeCatTypeBySeed } from '@/utils/home-cat-theme.js';

const props = defineProps({
  type: {
    type: String,
    default: 'decor'
  },
  pool: {
    type: String,
    default: ''
  },
  seed: {
    type: [String, Number],
    default: ''
  },
  exclude: {
    type: Array,
    default: () => []
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  alt: {
    type: String,
    default: ''
  },
  decorative: {
    type: Boolean,
    default: false
  }
});

const resolvedType = computed(() => {
  if (props.pool) {
    return getHomeCatTypeBySeed(props.seed || props.type, props.pool, { exclude: props.exclude });
  }
  return props.type;
});
const catSrc = computed(() => getHomeCatAsset(resolvedType.value));
const altText = computed(() => props.alt || '方块小窝小猫');
</script>

<style scoped>
.home-cat-mascot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  line-height: 0;
  pointer-events: none;
  user-select: none;
}

.home-cat-mascot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-cat-mascot.size-sm {
  width: 58px;
  height: 58px;
}

.home-cat-mascot.size-md {
  width: 88px;
  height: 88px;
}

.home-cat-mascot.size-lg {
  width: 128px;
  height: 128px;
}
</style>

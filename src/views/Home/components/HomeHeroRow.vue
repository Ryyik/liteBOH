<template>
  <section
    ref="rowRef"
    class="home-hero-row"
    :class="[`is-${layout}`, { 'is-deferred': !shouldRender }]"
    :aria-label="ariaLabel || undefined"
  >
    <div class="home-hero-row-inner">
      <slot v-if="shouldRender" />
    </div>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps({
  layout: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'split'].includes(value),
  },
  ariaLabel: { type: String, default: '' },
  eager: { type: Boolean, default: false },
});

const rowRef = ref(null);
const shouldRender = ref(props.eager);
let observer = null;

onMounted(() => {
  if (shouldRender.value || typeof IntersectionObserver === 'undefined') {
    shouldRender.value = true;
    return;
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    shouldRender.value = true;
    observer?.disconnect();
    observer = null;
  }, { rootMargin: '800px 0px' });
  if (rowRef.value) observer.observe(rowRef.value);
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<style scoped>
.home-hero-row {
  width: 100%;
}

.home-hero-row.is-deferred {
  min-height: min(720px, 78vh);
}

.home-hero-row-inner {
  display: grid;
  width: 100%;
  gap: var(--home-hero-gap, 12px);
}

.is-full .home-hero-row-inner {
  grid-template-columns: minmax(0, 1fr);
}

.is-split .home-hero-row-inner {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.home-hero-row-inner :deep(> *) {
  min-width: 0;
  height: 100%;
}

@supports (content-visibility: auto) {
  /* 长首页的后续英雄区无需在首屏参与布局和绘制。 */
  .home-hero-row {
    content-visibility: auto;
    contain-intrinsic-size: auto 720px;
  }
}

@media (max-width: 768px) {
  .is-split .home-hero-row-inner {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<template>
  <section class="home-hero-row" :class="`is-${layout}`" :aria-label="ariaLabel || undefined">
    <div class="home-hero-row-inner">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  layout: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'split'].includes(value),
  },
  ariaLabel: { type: String, default: '' },
});
</script>

<style scoped>
.home-hero-row {
  width: 100%;
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

@media (max-width: 768px) {
  .is-split .home-hero-row-inner {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

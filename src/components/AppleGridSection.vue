<template>
  <section class="apple-grid-section" :class="[`variant-${variant}`]">
    <div class="ags-grid" :style="{ gap }">
      <slot></slot>
    </div>
  </section>
</template>

<script setup>
defineProps({
  variant: { type: String, default: 'dark', validator: v => ['dark', 'light'].includes(v) },
  gap: { type: String, default: '12px' }
})
</script>

<style scoped>
.apple-grid-section {
  width: 100%;
  padding: 0;
  background: #f5f5f7;
}

.variant-dark {
  background: #000000;
}

.variant-light {
  background: #f5f5f7;
}

.ags-grid {
  width: 100%;
  max-width: none;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0;
}

@media (max-width: 768px) {
  .apple-grid-section {
    padding: 0;
  }

  .ags-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

@media (max-width: 480px) {
  .apple-grid-section {
    padding: 0;
  }

  .ags-grid {
    gap: 10px;
  }
}
</style>

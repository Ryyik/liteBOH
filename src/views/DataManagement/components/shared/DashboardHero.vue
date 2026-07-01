<template>
  <header class="g-hero">
    <div class="g-hero-copy">
      <div v-if="eyebrow" class="g-eyebrow">{{ eyebrow }}</div>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="g-hero-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' }
});
</script>

<style scoped>
.g-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: calc(var(--spacing) * 6);
  padding: calc(var(--spacing) * 6) 0 calc(var(--spacing) * 2);
  flex-wrap: wrap;
}
.g-hero-copy { min-width: 0; flex: 1 1 320px; }
.g-hero-copy h2 {
  margin: calc(var(--spacing) * 1) 0 calc(var(--spacing) * 2);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--foreground);
  letter-spacing: -0.01em;
}
.g-hero-copy p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--muted-foreground);
  max-width: 720px;
}
.g-hero-actions {
  display: flex;
  gap: calc(var(--spacing) * 3);
  flex-wrap: wrap;
}
@media (max-width: 760px) {
  .g-hero { flex-direction: column; }
  .g-hero-actions { width: 100%; }
}
</style>

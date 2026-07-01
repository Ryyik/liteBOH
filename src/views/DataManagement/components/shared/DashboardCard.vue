<template>
  <article :class="['g-card', { interactive, disabled }]">
    <div v-if="eyebrow || title || $slots.head" class="g-card-head">
      <div>
        <div v-if="eyebrow" class="g-eyebrow">{{ eyebrow }}</div>
        <h3 v-if="title">{{ title }}</h3>
        <p v-if="subtitle">{{ subtitle }}</p>
        <slot name="head" />
      </div>
      <div v-if="$slots.aside" class="g-card-aside">
        <slot name="aside" />
      </div>
    </div>
    <slot />
  </article>
</template>

<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});
</script>

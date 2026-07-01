<template>
  <button
    type="button"
    class="g-toggle"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="label"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="g-toggle-text">
      <span>{{ label }}</span>
      <small v-if="hint">{{ hint }}</small>
    </span>
    <span :class="['g-switch', { 'is-on': modelValue }]" aria-hidden="true">
      <span />
    </span>
  </button>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  hint: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>

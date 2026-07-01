<template>
  <div class="g-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      :class="['g-tab', { 'is-active': modelValue === tab.value }]"
      :aria-selected="modelValue === tab.value"
      role="tab"
      @click="$emit('update:modelValue', tab.value)"
    >
      <component v-if="tab.icon" :is="tab.icon" :size="14" />
      <span>{{ tab.label }}</span>
      <span v-if="typeof tab.count === 'number' && tab.count > 0" class="g-tab-counter">{{ tab.count }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number], required: true },
  tabs: { type: Array, required: true }, // [{ value, label, icon?, count? }]
  ariaLabel: { type: String, default: 'Tab navigation' }
});
defineEmits(['update:modelValue']);
</script>

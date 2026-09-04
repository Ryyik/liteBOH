<template>
  <button type="button" class="hk-card hk-tile hk-tappable" @click="$emit('edit')">
    <div class="hk-label">{{ label }}</div>
    <div class="hk-value">{{ display }}<span v-if="unit" class="u">{{ unit }}</span></div>
  </button>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  display: { type: String, default: '—' },
  unit: { type: String, default: '' }
})
defineEmits(['edit'])
</script>

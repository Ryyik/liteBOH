<template>
  <Teleport to="body">
    <div class="hk-sheet-mask" @click.self="$emit('close')" @keydown.esc="$emit('close')">
      <div class="hk-card hk-sheet" role="dialog" aria-modal="true" :aria-label="title">
        <div class="hk-sheet-handle"></div>
        <div class="hk-sheet-head">
          <button type="button" class="hk-sheet-btn ghost" @click="$emit('close')">取消</button>
          <div class="hk-sheet-title">{{ title }}</div>
          <button type="button" class="hk-sheet-btn done" :disabled="doneDisabled" @click="$emit('save')">{{ doneText }}</button>
        </div>
        <div class="hk-sheet-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

defineProps({
  title: { type: String, default: '' },
  doneText: { type: String, default: '完成' },
  doneDisabled: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'save'])

const onKey = (e) => {
  if (e.key === 'Escape') emit('close')
}
let prevOverflow = ''
onMounted(() => {
  document.addEventListener('keydown', onKey)
  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = prevOverflow
})
</script>

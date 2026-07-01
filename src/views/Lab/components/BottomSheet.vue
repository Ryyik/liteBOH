<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-backdrop" @click="$emit('close')">
        <div class="sheet-panel" :class="{ 'sheet--expanded': expanded }" @click.stop>
          <div class="sheet-handle-area" @mousedown="startDrag" @touchstart="startDrag">
            <div class="sheet-handle"></div>
          </div>
          <div class="sheet-header" v-if="title">
            <h3 class="sheet-title">{{ title }}</h3>
            <button class="sheet-close" @click="$emit('close')">
              <AppIcon name="close" size="small" weight="medium" />
            </button>
          </div>
          <div class="sheet-body" ref="bodyRef">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

defineProps({ open: Boolean, title: String })
defineEmits(['close'])

const expanded = ref(false)
const bodyRef = ref(null)
let dragStartY = 0

function startDrag(e) {
  dragStartY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY
  const onMove = (ev) => {
    const y = ev.type === 'touchmove' ? ev.touches[0].clientY : ev.clientY
    expanded.value = (dragStartY - y) > 40
  }
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onEnd)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onEnd)
  document.addEventListener('touchmove', onMove)
  document.addEventListener('touchend', onEnd)
}
</script>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet-panel {
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.12);
}
.sheet--expanded {
  max-height: 90vh;
  transition: max-height 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.sheet-handle-area {
  display: flex;
  justify-content: center;
  padding: 12px 20px 8px;
  cursor: grab;
  touch-action: none;
}
.sheet-handle {
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.12);
}
.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 20px 12px;
}
.sheet-title {
  font-size: 17px;
  font-weight: 700;
  color: #3d3929;
  margin: 0;
  letter-spacing: -0.01em;
}
.sheet-close {
  background: #f5f4ef;
  border: none;
  color: #6e6d68;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.sheet-close:hover { background: #e3e0d4; color: #3d3929; }
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 24px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.08) transparent;
}
.sheet-body::-webkit-scrollbar { width: 6px; }
.sheet-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 3px; }

/* Transitions */
.sheet-enter-from .sheet-panel { transform: translateY(100%); }
.sheet-leave-to .sheet-panel { transform: translateY(100%); }
.sheet-enter-from { background: transparent; }
.sheet-leave-to { background: rgba(0, 0, 0, 0.3); }
.sheet-enter-active, .sheet-leave-active { transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1); }

/* Desktop: show as side drawer */
@media (min-width: 769px) {
  .sheet-backdrop {
    align-items: stretch;
    justify-content: flex-end;
  }
  .sheet-panel {
    max-width: 360px;
    max-height: unset;
    height: 100%;
    border-radius: 20px 0 0 20px;
  }
  .sheet--expanded { max-height: unset; }
  .sheet-enter-from .sheet-panel { transform: translateX(100%); }
  .sheet-leave-to .sheet-panel { transform: translateX(100%); }
}
</style>

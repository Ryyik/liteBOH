<template>
  <div class="format-toolbar">
    <button
      v-for="btn in buttons" :key="btn.action"
      class="fmt-btn"
      :title="btn.label"
      @click="$emit('action', btn.action)"
    >
      <AppIcon :name="btn.icon" size="small" weight="medium" />
    </button>
    <div class="fmt-divider"></div>
    <button
      v-for="btn in textBtns" :key="btn.action"
      class="fmt-btn"
      :title="btn.label"
      @click="$emit('action', btn.action)"
    >
      {{ btn.label }}
    </button>
  </div>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

const buttons = [
  { icon: 'bold', action: 'bold', label: '加粗' },
  { icon: 'italic', action: 'italic', label: '斜体' },
  { icon: 'underline', action: 'underline', label: '下划线' },
  { icon: 'heading', action: 'heading', label: '标题' },
  { icon: 'list', action: 'list', label: '列表' },
]

const textBtns = [
  { action: 'indent', label: '缩进' },
  { action: 'spacing', label: '行距' },
  { action: 'align', label: '对齐' },
]
defineEmits(['action'])
</script>

<style scoped>
.format-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: #f5f4ef;
  border-bottom: 1px solid #e3e0d4;
}
.fmt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: none;
  border: none;
  border-radius: 6px;
  color: #535146;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 11px;
  font-weight: 600;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.fmt-btn:hover {
  background: #fbf2ed;
  color: #C96442;
}
.fmt-btn:active {
  background: #f5e5db;
  transform: scale(0.94);
}
.fmt-divider {
  width: 1px;
  height: 18px;
  background: #dad9d4;
  margin: 0 4px;
}
.text-btn {
  width: auto;
  padding: 0 8px;
}
</style>

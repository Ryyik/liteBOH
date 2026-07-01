<template>
  <div class="style-picker">
    <div class="picker-head">
      <span class="picker-title">选择样式集</span>
      <span class="picker-sub">{{ presets.length }} 套预设</span>
    </div>
    <div class="picker-grid">
      <button
        v-for="p in presets"
        :key="p.id"
        class="style-card"
        :class="{ active: modelValue === p.id }"
        @click="$emit('update:modelValue', p.id)"
      >
        <!-- 缩略预览：用色块模拟封面/标题/正文 -->
        <div
          class="card-thumb"
          :style="thumbStyle(p)"
        >
          <div class="thumb-bar" :style="{ background: '#' + p.tokens.color.primary }"></div>
          <div class="thumb-lines">
            <div class="thumb-line" :style="{ background: '#' + p.tokens.color.text.onLight, width: '70%' }"></div>
            <div class="thumb-line" :style="{ background: '#' + p.tokens.color.text.muted, width: '90%' }"></div>
            <div class="thumb-line" :style="{ background: '#' + p.tokens.color.text.muted, width: '85%' }"></div>
          </div>
        </div>
        <div class="card-meta">
          <div class="card-name">{{ p.name }}</div>
          <div class="card-desc">{{ p.description }}</div>
        </div>
        <div v-if="modelValue === p.id" class="card-check">
          <AppIcon name="check" size="small" weight="semibold" />
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import AppIcon from './AppIcon.vue'
import { STYLE_PRESETS } from '../config/design-tokens.js'

defineProps({
  modelValue: { type: String, default: '' },
})
defineEmits(['update:modelValue'])

const presets = STYLE_PRESETS

function thumbStyle(p) {
  const bg = p.tokens.color.bg.content
  return { background: '#' + bg }
}
</script>

<style scoped>
.style-picker {
  width: 100%;
}
.picker-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: calc(var(--spacing) * 3);
}
.picker-title {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}
.picker-sub {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--muted-foreground);
}
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: calc(var(--spacing) * 3);
}
.style-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--popover);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.16s ease;
  text-align: left;
}
.style-card:hover {
  border-color: var(--brand-200);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}
.style-card.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(15, 159, 122, 0.12);
}
.card-thumb {
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 6px;
}
.thumb-bar {
  height: 8px;
  width: 40%;
  border-radius: 2px;
}
.thumb-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
}
.thumb-line {
  height: 3px;
  border-radius: 2px;
  opacity: 0.7;
}
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-name {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
}
.card-desc {
  font-family: var(--font-sans);
  font-size: 10px;
  color: var(--muted-foreground);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>

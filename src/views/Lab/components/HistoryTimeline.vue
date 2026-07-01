<template>
  <div class="history-timeline">
    <div class="timeline-head">
      <AppIcon name="clock" size="small" weight="medium" />
      <span class="timeline-title">操作历史</span>
      <span class="timeline-count">{{ items.length }}</span>
    </div>
    <div v-if="items.length === 0" class="timeline-empty">暂无操作记录</div>
    <div v-else class="timeline-list">
      <div
        v-for="(item, i) in items"
        :key="i"
        class="timeline-item"
        :class="{ 'is-current': i === items.length - 1 }"
        @click="$emit('restore', i)"
      >
        <div class="timeline-dot-wrap">
          <div class="timeline-dot" :class="item.type"></div>
          <div v-if="i < items.length - 1" class="timeline-line"></div>
        </div>
        <div class="timeline-content">
          <div class="timeline-label">{{ item.label }}</div>
          <div class="timeline-detail">{{ item.detail }}</div>
          <div class="timeline-meta">{{ item.time }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppIcon from './AppIcon.vue'
defineProps({
  items: { type: Array, default: () => [] },
  // { label, detail, time, type: 'style'|'template'|'content'|'undo' }
})
defineEmits(['restore'])
</script>

<style scoped>
.history-timeline {
  border: none;
  border-radius: 18px;
  background: #ffffff;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.timeline-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: #C96442;
}
.timeline-title { font-size: 14px; font-weight: 600; color: #3d3929; }
.timeline-count {
  font-size: 12px; color: #6e6d68;
  background: #f5f4ef;
  padding: 3px 10px; border-radius: 8px; font-weight: 500; margin-left: auto;
}
.timeline-empty { font-size: 14px; color: #6e6d68; text-align: center; padding: 20px; }
.timeline-list { display: flex; flex-direction: column; gap: 0; max-height: 280px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.08) transparent; }
.timeline-list::-webkit-scrollbar { width: 4px; }
.timeline-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 2px; }

.timeline-item {
  display: flex;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.timeline-item:hover { background: rgba(201, 100, 66, 0.06); }
.timeline-item.is-current { background: rgba(201, 100, 66, 0.08); }

.timeline-dot-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  padding-top: 4px;
}
.timeline-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #dad9d4;
  flex-shrink: 0;
  transition: all 0.2s;
}
.timeline-dot.style { background: #C96442; }
.timeline-dot.template { background: #b05730; }
.timeline-dot.content { background: #788c5d; }
.timeline-dot.undo { background: #d64545; }
.timeline-item:hover .timeline-dot { transform: scale(1.3); }

.timeline-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background: #f5f4ef;
  margin-top: 4px;
}
.timeline-content { flex: 1; min-width: 0; }
.timeline-label { font-size: 13px; font-weight: 600; color: #3d3929; line-height: 1.3; }
.timeline-detail { font-size: 11px; color: #6e6d68; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-meta { font-size: 10px; color: #aeaeb2; margin-top: 3px; }
</style>

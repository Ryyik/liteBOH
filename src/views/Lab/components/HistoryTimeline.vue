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
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--popover);
  padding: 16px;
  box-shadow: var(--shadow-2xs);
}
.timeline-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--primary);
}
.timeline-title { font-size: 14px; font-weight: 600; color: var(--foreground); }
.timeline-count {
  font-size: 12px; color: var(--muted-foreground);
  background: var(--card);
  padding: 3px 10px; border-radius: var(--radius-sm); font-weight: 500; margin-left: auto;
}
.timeline-empty { font-size: 14px; color: var(--muted-foreground); text-align: center; padding: 20px; }
.timeline-list { display: flex; flex-direction: column; gap: 0; max-height: 280px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.08) transparent; }
.timeline-list::-webkit-scrollbar { width: 4px; }
.timeline-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 2px; }

.timeline-item {
  display: flex;
  gap: 12px;
  padding: 10px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.timeline-item:hover { background: color-mix(in srgb, var(--primary) 6%, transparent); }
.timeline-item.is-current { background: color-mix(in srgb, var(--primary) 8%, transparent); }

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
  background: var(--border);
  flex-shrink: 0;
  transition: all 0.2s;
}
.timeline-dot.style { background: var(--primary); }
.timeline-dot.template { background: var(--brand-600); }
.timeline-dot.content { background: var(--success); }
.timeline-dot.undo { background: var(--error); }
.timeline-item:hover .timeline-dot { transform: scale(1.3); }

.timeline-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background: var(--card);
  margin-top: 4px;
}
.timeline-content { flex: 1; min-width: 0; }
.timeline-label { font-size: 13px; font-weight: 600; color: var(--foreground); line-height: 1.3; }
.timeline-detail { font-size: 11px; color: var(--muted-foreground); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-meta { font-size: 10px; color: var(--text-400); margin-top: 3px; }
</style>

<template>
  <div class="inspector">
    <div class="inspector-head">
      <span class="inspector-title">样式清单</span>
      <span class="inspector-count">{{ styles.length }}</span>
    </div>
    <div v-if="!styles || styles.length === 0" class="inspector-empty">暂无样式</div>
    <div v-else class="inspector-list">
      <div
        v-for="st in styles" :key="st.styleId"
        class="style-row" :class="{ heading: st.styleId?.toLowerCase().startsWith('heading') }"
        @mouseenter="showPopover($event, st)" @mouseleave="hidePopover"
      >
        <div class="style-top">
          <span class="style-name">{{ st.name || st.styleId }}</span>
          <span class="style-type">{{ st.type }}</span>
        </div>
        <div class="style-tags">
          <span v-if="st.font?.ascii" class="tag" :title="`字体: ${st.font.ascii}`">{{ st.font.ascii }}</span>
          <span v-if="st.size" class="tag">{{ (st.size / 2).toFixed(1) }}pt</span>
          <span v-if="st.bold" class="tag tag-accent">B</span>
          <span v-if="st.italic" class="tag tag-accent">I</span>
          <span v-if="st.color" class="tag">
            <span class="color-dot" :style="{ background: '#' + st.color }"></span>
          </span>
          <span v-if="st.spacing?.line" class="tag">{{ (st.spacing.line / 240).toFixed(1) }}x</span>
          <span v-if="st.align" class="tag">{{ st.align }}</span>
        </div>
      </div>
    </div>

    <!-- Popover -->
    <Teleport to="body">
      <Transition name="popover">
        <div
          v-if="popover.visible"
          class="popover"
          :style="{ top: popover.y + 'px', left: popover.x + 'px' }"
        >
          <div class="popover-arrow"></div>
          <div class="popover-title">{{ popover.data?.name || popover.data?.styleId }}</div>
          <div class="popover-props">
            <div v-if="popover.data?.font?.ascii" class="popover-prop">
              <span class="prop-label">字体</span>
              <span class="prop-value">{{ popover.data.font.ascii }}</span>
            </div>
            <div v-if="popover.data?.size" class="popover-prop">
              <span class="prop-label">字号</span>
              <span class="prop-value">{{ (popover.data.size / 2).toFixed(1) }}pt</span>
            </div>
            <div v-if="popover.data?.color" class="popover-prop">
              <span class="prop-label">颜色</span>
              <span class="prop-value" style="display:flex;align-items:center;gap:6px;">
                <span class="color-dot" :style="{ background: '#' + popover.data.color }"></span>
                #{{ popover.data.color }}
              </span>
            </div>
            <div v-if="popover.data?.spacing?.line" class="popover-prop">
              <span class="prop-label">行距</span>
              <span class="prop-value">{{ (popover.data.spacing.line / 240).toFixed(2) }}x</span>
            </div>
            <div v-if="popover.data?.spacing?.before" class="popover-prop">
              <span class="prop-label">段前</span>
              <span class="prop-value">{{ popover.data.spacing.before }}pt</span>
            </div>
            <div v-if="popover.data?.spacing?.after" class="popover-prop">
              <span class="prop-label">段后</span>
              <span class="prop-value">{{ popover.data.spacing.after }}pt</span>
            </div>
            <div v-if="popover.data?.align" class="popover-prop">
              <span class="prop-label">对齐</span>
              <span class="prop-value">{{ popover.data.align }}</span>
            </div>
            <div class="popover-prop">
              <span class="prop-label">粗体</span>
              <span class="prop-value">{{ popover.data?.bold ? '是' : '否' }}</span>
            </div>
            <div class="popover-prop">
              <span class="prop-label">斜体</span>
              <span class="prop-value">{{ popover.data?.italic ? '是' : '否' }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
defineProps({ styles: { type: Array, default: () => [] } })

const popover = reactive({ visible: false, x: 0, y: 0, data: null })

function showPopover(e, st) {
  const rect = e.currentTarget.getBoundingClientRect()
  popover.data = st
  popover.x = rect.right + 10
  popover.y = rect.top + rect.height / 2 - 80
  // Keep popover within viewport
  if (popover.x + 260 > window.innerWidth) {
    popover.x = rect.left - 270
  }
  if (popover.y < 90) popover.y = 90
  popover.visible = true
}

function hidePopover() {
  popover.visible = false
}
</script>

<style scoped>
.inspector {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--popover);
  padding: 16px;
  box-shadow: var(--shadow-2xs);
}
.inspector-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.inspector-title { font-size: 14px; font-weight: 600; color: var(--foreground); }
.inspector-count {
  font-size: 12px; color: var(--muted-foreground);
  background: var(--card); padding: 3px 10px; border-radius: var(--radius-sm); font-weight: 500;
}
.inspector-empty { font-size: 14px; color: var(--muted-foreground); text-align: center; padding: 24px; }
.inspector-list { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.08) transparent; }
.inspector-list::-webkit-scrollbar { width: 4px; }
.inspector-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 2px; }
.style-row {
  border: none; border-radius: var(--radius); padding: 12px 14px;
  background: var(--card);
  transition: all 0.2s;
  cursor: default;
}
.style-row:hover { background: var(--card); box-shadow: var(--shadow-2xs); }
.style-row.heading { background: color-mix(in srgb, var(--brand-600) 8%, transparent); }
.style-row.heading:hover { background: color-mix(in srgb, var(--brand-600) 12%, transparent); }
.style-top { display: flex; justify-content: space-between; margin-bottom: 8px; }
.style-name { font-size: 13px; font-weight: 600; color: var(--foreground); }
.style-type { font-size: 11px; color: var(--muted-foreground); background: var(--card); padding: 2px 8px; border-radius: 6px; }
.style-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.tag {
  font-size: 11px; color: var(--muted-foreground); background: var(--card);
  padding: 3px 8px; border-radius: 6px; font-weight: 500;
}
.tag-accent { color: var(--primary); background: var(--brand-50); font-weight: 600; }
.color-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; vertical-align: middle; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

/* ===== Popover ===== */
.popover {
  position: fixed;
  z-index: 8000;
  width: 240px;
  padding: 16px;
  background: var(--popover);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
  pointer-events: none;
  font-family: var(--font-sans);
}
.popover-arrow {
  position: absolute;
  left: -6px;
  top: 50%;
  width: 12px;
  height: 12px;
  background: var(--popover);
  transform: translateY(-50%) rotate(45deg);
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.popover-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground);
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.popover-props { display: flex; flex-direction: column; gap: 7px; }
.popover-prop { display: flex; justify-content: space-between; align-items: center; }
.prop-label { font-size: 12px; color: var(--muted-foreground); font-weight: 500; }
.prop-value { font-size: 12px; color: var(--foreground); font-weight: 600; }

/* Transition */
.popover-enter-from, .popover-leave-to { opacity: 0; transform: scale(0.95); }
.popover-enter-active, .popover-leave-active { transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1); }
</style>

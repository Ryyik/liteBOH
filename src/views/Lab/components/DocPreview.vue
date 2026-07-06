<template>
  <div class="doc-preview" @contextmenu.prevent="onContextMenu" @click="hideContextMenu">
    <div class="preview-toolbar">
      <span class="preview-title">文档预览</span>
      <span v-if="loading" class="preview-loading">
        <ProgressRing :progress="0.65" size="small" indeterminate />
        渲染中
      </span>
    </div>
    <div v-if="!html && !loading" class="preview-empty">
      <AppIcon name="doc" size="xl" weight="light" />
      <p>暂无文档内容</p>
    </div>
    <div v-else-if="loading" class="preview-body preview-loading-state">
      <div class="load-pulse"></div>
      <div class="load-pulse" style="width:75%"></div>
      <div class="load-pulse" style="width:60%"></div>
    </div>
    <div v-else class="preview-body" ref="scrollRef">
      <div class="doc-content" v-html="sanitizedHtml"></div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <Transition name="ctx">
        <div
          v-if="ctx.visible"
          class="ctx-menu"
          :style="{ top: ctx.y + 'px', left: ctx.x + 'px' }"
        >
          <div class="ctx-section">
            <button class="ctx-item" @click="ctxAction('copy-format')">
              <AppIcon name="doc" size="small" weight="medium" />
              <span>复制段落格式</span>
            </button>
            <button class="ctx-item" @click="ctxAction('paste-format')">
              <AppIcon name="paintbrush" size="small" weight="medium" />
              <span>粘贴格式到此</span>
            </button>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-section">
            <button class="ctx-item" @click="ctxAction('set-heading')">
              <AppIcon name="heading" size="small" weight="medium" />
              <span>设为标题</span>
            </button>
            <button class="ctx-item" @click="ctxAction('set-bold')">
              <AppIcon name="bold" size="small" weight="medium" />
              <span>加粗</span>
            </button>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-section">
            <button class="ctx-item" @click="ctxAction('ai-suggest')">
              <AppIcon name="sparkles" size="small" weight="medium" />
              <span>AI 排版建议</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import DOMPurify from '@/utils/dompurify'
import AppIcon from './AppIcon.vue'
import ProgressRing from './ProgressRing.vue'

const emit = defineEmits(['context-action'])

const props = defineProps({
  html: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const sanitizedHtml = computed(() => DOMPurify.sanitize(props.html))

const ctx = reactive({ visible: false, x: 0, y: 0, target: null })

function onContextMenu(e) {
  ctx.x = Math.min(e.clientX, window.innerWidth - 220)
  ctx.y = Math.min(e.clientY, window.innerHeight - 260)
  ctx.target = e.target
  ctx.visible = true
}
function hideContextMenu() {
  ctx.visible = false
}
function ctxAction(action) {
  emit('context-action', { action, target: ctx.target })
  hideContextMenu()
}
</script>

<style scoped>
.doc-preview {
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
  background: var(--popover);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
}
.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-200);
  flex-shrink: 0;
}
.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}
.preview-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--primary);
  background: var(--brand-50);
  padding: 3px 10px;
  border-radius: 6px;
  font-weight: 500;
}
.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted-foreground);
  gap: 12px;
}
.preview-empty p { margin: 0; font-size: 15px; font-weight: 500; }
.preview-body {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
  max-height: 400px;
  padding: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.12) transparent;
}
.preview-body::-webkit-scrollbar { width: 6px; }
.preview-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
.preview-loading-state {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
}
.load-pulse {
  height: 16px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.03));
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }
.doc-content {
  padding: 28px 32px;
  font-family: var(--font-serif);
  background: var(--popover);
}
.doc-content :deep(h1), .doc-content :deep(h2), .doc-content :deep(h3), .doc-content :deep(h4) {
  margin: 1.2em 0 0.4em; font-weight: 700; color: var(--foreground);
  line-height: 1.25; letter-spacing: -0.01em;
}
.doc-content :deep(h1) { font-size: 24px; }
.doc-content :deep(h2) { font-size: 20px; }
.doc-content :deep(h3) { font-size: 17px; }
.doc-content :deep(p) { margin: 0.6em 0; line-height: 1.72; color: var(--secondary-foreground); font-size: 15px; }
.doc-content :deep(ul), .doc-content :deep(ol) { margin: 0.4em 0; padding-left: 24px; color: var(--secondary-foreground); }
.doc-content :deep(li) { margin: 0.3em 0; line-height: 1.65; font-size: 15px; }
.doc-content :deep(table) { border-collapse: collapse; width: 100%; margin: 0.8em 0; border-radius: 10px; overflow: hidden; }
.doc-content :deep(td), .doc-content :deep(th) { border: 1px solid var(--border-200); padding: 10px 14px; font-size: 14px; text-align: left; color: var(--secondary-foreground); }
.doc-content :deep(th) { background: var(--card); font-weight: 600; color: var(--foreground); }
.doc-content :deep(img) { max-width: 100%; height: auto; border-radius: var(--radius-md); }
.doc-content :deep(blockquote) { margin: 0.6em 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--border); color: var(--muted-foreground); font-style: italic; }
.doc-content :deep(em) { font-style: italic; }
.doc-content :deep(strong) { font-weight: 600; color: var(--foreground); }

/* ===== Context Menu ===== */
.ctx-menu {
  position: fixed;
  z-index: 9500;
  width: 210px;
  padding: 6px;
  background: var(--popover);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
  font-family: var(--font-sans);
}
.ctx-section { padding: 2px 0; }
.ctx-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 7px 12px; background: none; border: none;
  border-radius: var(--radius-sm); cursor: pointer; font-size: 13px;
  color: var(--foreground); font-weight: 500;
  transition: all 0.15s;
  font-family: inherit;
}
.ctx-item:hover { background: var(--primary); color: var(--primary-foreground); }
.ctx-item:hover :deep(svg) { stroke: var(--primary-foreground); }
.ctx-divider { height: 1px; background: var(--border-200); margin: 4px 8px; }

/* Transition */
.ctx-enter-from, .ctx-leave-to { opacity: 0; transform: scale(0.92); }
.ctx-enter-active, .ctx-leave-active { transition: all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1); }
</style>

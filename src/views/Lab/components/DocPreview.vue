<template>
  <div class="doc-preview">
    <div class="preview-toolbar">
      <span class="preview-title">文档预览</span>
      <span v-if="loading" class="preview-loading">渲染中...</span>
    </div>
    <div v-if="!html && !loading" class="preview-empty">
      <div class="empty-icon">📄</div>
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
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DOMPurify from '@/utils/dompurify';

const props = defineProps({
  html: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const sanitizedHtml = computed(() => DOMPurify.sanitize(props.html));
</script>

<style scoped>
.doc-preview {
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.98),
    inset 0 -1px 0 rgba(148, 163, 184, 0.12),
    inset 1px 0 0 rgba(255, 255, 255, 0.58),
    inset -1px 0 0 rgba(255, 255, 255, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.38),
    0 14px 34px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
}
.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.08);
  flex-shrink: 0;
}
.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: #202123;
}
.preview-loading {
  font-size: 11px;
  color: #0f9f7a;
  background: rgba(15, 159, 122, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
}
.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: rgba(17, 17, 17, 0.58);
}
.empty-icon { font-size: 40px; margin-bottom: 10px; }
.preview-empty p { margin: 0; font-size: 14px; }
.preview-body {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
  max-height: 400px;
  padding: 0;
}
.preview-loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
}
.load-pulse {
  height: 14px;
  background: linear-gradient(90deg, rgba(17, 17, 17, 0.04), rgba(17, 17, 17, 0.08), rgba(17, 17, 17, 0.04));
  background-size: 200% 100%;
  border-radius: 6px;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }
.doc-content {
  padding: 24px 28px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  background: #ffffff;
}
.doc-content :deep(h1),
.doc-content :deep(h2),
.doc-content :deep(h3),
.doc-content :deep(h4) {
  margin: 1.2em 0 0.4em;
  font-weight: 600;
  color: #202123;
  line-height: 1.3;
}
.doc-content :deep(h1) { font-size: 22px; }
.doc-content :deep(h2) { font-size: 18px; }
.doc-content :deep(h3) { font-size: 16px; }
.doc-content :deep(p) {
  margin: 0.6em 0;
  line-height: 1.7;
  color: #374151;
  font-size: 14px;
}
.doc-content :deep(ul),
.doc-content :deep(ol) {
  margin: 0.4em 0;
  padding-left: 24px;
  color: #374151;
}
.doc-content :deep(li) {
  margin: 0.2em 0;
  line-height: 1.6;
}
.doc-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0;
}
.doc-content :deep(td),
.doc-content :deep(th) {
  border: 1px solid rgba(15, 23, 42, 0.08);
  padding: 6px 10px;
  font-size: 13px;
  text-align: left;
  color: #374151;
}
.doc-content :deep(th) {
  background: #f7f7f8;
  font-weight: 600;
  color: #202123;
}
.doc-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}
.doc-content :deep(blockquote) {
  margin: 0.6em 0;
  padding: 2px 0 2px 14px;
  border-left: 3px solid #d9d9e3;
  color: #5f6368;
}
.doc-content :deep(em) { font-style: italic; }
.doc-content :deep(strong) { font-weight: 600; color: #202123; }
</style>

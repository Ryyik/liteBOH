<template>
  <div class="code-preview">
    <div class="preview-toolbar">
      <div class="preview-toolbar-left">
        <button class="toolbar-btn" title="刷新预览" @click="refreshPreview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>刷新</span>
        </button>
        <button class="toolbar-btn" title="在新窗口打开" @click="openInNewTab">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <span>新窗口</span>
        </button>
        <button v-if="errors.length > 0" class="toolbar-btn toolbar-btn--warn" title="查看错误" @click="showErrorPanel = !showErrorPanel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ errors.length }}</span>
        </button>
      </div>
      <div class="preview-toolbar-right">
        <button class="toolbar-btn" :class="{ active: previewMode === 'desktop' }" title="桌面视图" @click="previewMode = 'desktop'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>
        <button class="toolbar-btn" :class="{ active: previewMode === 'tablet' }" title="平板视图" @click="previewMode = 'tablet'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </button>
        <button class="toolbar-btn" :class="{ active: previewMode === 'mobile' }" title="移动端视图" @click="previewMode = 'mobile'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </button>
      </div>
    </div>
    <div class="preview-body" :class="`mode-${previewMode}`">
      <iframe
        v-if="previewUrl"
        ref="iframeRef"
        :src="previewUrl"
        sandbox="allow-scripts"
        class="preview-iframe"
        title="代码预览"
        @load="onIframeLoad"
      />
      <div v-else class="preview-empty">
        <p>暂无预览内容</p>
      </div>
      <Transition name="fade">
        <div v-if="showErrorPanel && errors.length > 0" class="preview-error-panel">
          <div class="error-panel-header">
            <span>控制台错误 ({{ errors.length }})</span>
            <button class="error-panel-close" @click="showErrorPanel = false">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="error-panel-body">
            <div v-for="(err, i) in errors" :key="i" class="error-item" :class="`error-level--${err.level || 'error'}`">
              <span class="error-level">{{ err.level === 'warn' ? 'WARN' : 'ERROR' }}</span>
              <span class="error-msg">{{ err.message }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { buildPreviewUrl, revokePreviewUrl } from '../engine/html-renderer.js'

const props = defineProps({
  codeData: { type: Object, default: null },
})

const emit = defineEmits(['error'])

const previewMode = ref('desktop')
const previewUrl = ref('')
const iframeRef = ref(null)
const errors = ref([])
const showErrorPanel = ref(false)

watch(() => props.codeData, (val) => {
  revokePreviewUrl(previewUrl.value)
  errors.value = []
  showErrorPanel.value = false
  if (val?.html) {
    previewUrl.value = buildPreviewUrl(val)
  } else {
    previewUrl.value = ''
  }
}, { immediate: true })

function refreshPreview() {
  if (iframeRef.value) {
    errors.value = []
    showErrorPanel.value = false
    iframeRef.value.src = iframeRef.value.src
  }
}

function openInNewTab() {
  if (previewUrl.value) {
    window.open(previewUrl.value, '_blank')
  }
}

function onIframeLoad() {
  try {
    const iframe = iframeRef.value
    if (!iframe?.contentWindow) return
    const win = iframe.contentWindow

    const originalError = win.console.error
    const originalWarn = win.console.warn
    const captured = []

    win.console.error = function(...args) {
      captured.push({ level: 'error', message: args.map(a => String(a)).join(' ') })
      originalError.apply(win.console, args)
    }
    win.console.warn = function(...args) {
      captured.push({ level: 'warn', message: args.map(a => String(a)).join(' ') })
      originalWarn.apply(win.console, args)
    }

    win.addEventListener('error', (e) => {
      captured.push({ level: 'error', message: e.message || 'Script error' })
    })

    // 延迟捕获，确保页面加载完成
    setTimeout(() => {
      errors.value = captured
      if (captured.length > 0) {
        showErrorPanel.value = true
        emit('error', captured)
      }
    }, 1000)
  } catch (e) {
    // 跨域 iframe 可能无法访问 console
  }
}
</script>

<style scoped>
.code-preview {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--popover);
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  gap: 8px;
}
.preview-toolbar-left,
.preview-toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 11px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}
.toolbar-btn:hover {
  background: var(--popover);
  color: var(--foreground);
  border-color: var(--border);
}
.toolbar-btn.active {
  background: var(--brand-50);
  color: var(--primary);
  border-color: var(--brand-200);
}
.toolbar-btn--warn {
  color: #a67c2e;
}
.toolbar-btn--warn:hover {
  background: #fef3e2;
  border-color: #e6c882;
}
.preview-body {
  position: relative;
  transition: all 0.3s ease;
}
.preview-body.mode-desktop {
  width: 100%;
  min-height: 300px;
  max-height: 500px;
}
.preview-body.mode-tablet {
  width: 768px;
  min-height: 400px;
  max-height: 550px;
  margin: 0 auto;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
.preview-body.mode-mobile {
  width: 375px;
  min-height: 500px;
  max-height: 600px;
  margin: 0 auto;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
.preview-iframe {
  width: 100%;
  height: 100%;
  min-height: 300px;
  border: none;
  display: block;
  background: #ffffff;
}
.mode-tablet .preview-iframe {
  min-height: 400px;
}
.mode-mobile .preview-iframe {
  min-height: 500px;
}
.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--muted-foreground);
  font-size: 14px;
}
.preview-error-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 160px;
  background: rgba(30, 30, 30, 0.95);
  border-top: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.error-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255,255,255,0.06);
  font-size: 11px;
  font-family: var(--font-sans);
  color: rgba(255,255,255,0.7);
  font-weight: 600;
}
.error-panel-close {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
}
.error-panel-close:hover { color: #fff; background: rgba(255,255,255,0.1); }
.error-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.error-item {
  display: flex;
  gap: 8px;
  padding: 3px 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  line-height: 1.5;
}
.error-level {
  flex-shrink: 0;
  font-weight: 700;
  width: 44px;
}
.error-level--error .error-level { color: #ff6b6b; }
.error-level--warn .error-level { color: #ffd93d; }
.error-msg {
  color: rgba(255,255,255,0.8);
  word-break: break-all;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

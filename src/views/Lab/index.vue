<template>
  <main class="lab-page">
    <div class="lab-container">
      <!-- Header -->
      <header class="lab-header">
        <div class="lab-header-left">
          <h1 class="lab-brand">BOH 办公 AI</h1>
          <p class="lab-subtitle">对话式文档排版 — 上传 .docx，AI 帮你改样式 | AI 自动生成 PPT</p>
        </div>
        <div class="lab-header-right">
          <!-- Tab Switcher -->
          <div class="tab-switcher">
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'doc' }"
              @click="activeTab = 'doc'"
            >
              📄 文档排版
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'ppt' }"
              @click="activeTab = 'ppt'"
            >
              📊 PPT 生成
            </button>
          </div>
          <button v-if="activeTab === 'doc' && modifiedBlob" class="btn-primary" @click="downloadModified">
            <span class="btn-icon">⬇</span> 下载文档
          </button>
        </div>
      </header>

      <!-- Doc Tab Content -->
      <template v-if="activeTab === 'doc'">
        <!-- Upload -->
        <FileUploader v-model="uploadedFile" @update:modelValue="handleFileUpload" />

        <!-- Error -->
        <div v-if="error" class="error-toast">
          <span>{{ error }}</span>
          <button class="error-close" @click="error = ''">✕</button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="loading-state">
          <div class="load-spinner"></div>
          <p>正在解析文档...</p>
        </div>

        <!-- Workspace -->
        <template v-if="docData && !isLoading">
          <div class="doc-status">
            <span class="status-dot"></span>
            <span class="status-name">{{ docData.fileName }}</span>
            <span class="status-meta">{{ docData.content.length }} 段 · {{ docData.styles.styles.length }} 样式</span>
          </div>

          <div class="workspace">
            <!-- Sidebar -->
            <aside class="ws-sidebar">
              <StyleInspector :styles="docData.styles.styles" />
              <TemplatePanel
                :templates="templates"
                :active-id="activeTemplateId"
                :can-save="true"
                @select="handleTemplateSelect"
                @save="saveCurrentAsTemplate"
                @update="refreshTemplates"
              />
            </aside>

            <!-- Main -->
            <section class="ws-main">
              <DocPreview :html="previewHtml" :loading="previewLoading" />

              <div class="ws-chat">
                <DocChat
                  ref="chatRef"
                  :messages="chatMessages"
                  :loading="aiLoading"
                  @send="handleSend"
                />
              </div>
            </section>
          </div>
        </template>

        <!-- Welcome -->
        <div v-if="!uploadedFile && !isLoading && !docData" class="welcome">
          <div class="welcome-card">
            <div class="welcome-icon">📄</div>
            <h2>文档排版助手</h2>
            <p>上传 Word 文档，通过对话让 AI 帮你调整样式和排版</p>
            <div class="welcome-hints">
              <span class="hint-chip" v-for="h in hints" :key="h">{{ h }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- PPT Tab Content -->
      <template v-if="activeTab === 'ppt'">
        <PPTGenerator />
      </template>
    </div>
  </main>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import * as mammoth from 'mammoth'
import DOMPurify from '@/utils/dompurify.js'
import FileUploader from './components/FileUploader.vue'
import DocPreview from './components/DocPreview.vue'
import StyleInspector from './components/StyleInspector.vue'
import TemplatePanel from './components/TemplatePanel.vue'
import DocChat from './components/DocChat.vue'
import PPTGenerator from './components/PPTGenerator.vue'
import { parseDocx, reparseStylesFromDoc } from './engine/docx-parser.js'
import { applyOperations, applyContentOperations } from './engine/style-engine.js'
import { buildModifiedDocx } from './engine/docx-builder.js'
import { getAllTemplates, saveTemplate } from './engine/template-store.js'
import { useDocumentAI } from './composables/useDocumentAI.js'

const { chat, aiLoading } = useDocumentAI()

const activeTab = ref('doc')

const hints = ['正式报告风格', '标题黑体正文宋体', '首行缩进', '1.5倍行距', '调整页边距']

const uploadedFile = ref(null)
const docData = ref(null)
const isLoading = ref(false)
const error = ref('')
const modifiedBlob = ref(null)
const activeTemplateId = ref(null)
const templates = ref(getAllTemplates())
const chatMessages = ref([])
const chatRef = ref(null)
const previewHtml = ref('')
const previewLoading = ref(false)

function refreshTemplates() {
  templates.value = getAllTemplates()
}

async function updatePreview(blob) {
  previewLoading.value = true
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
    previewHtml.value = DOMPurify.sanitize(result.value)
  } catch (e) {
    previewHtml.value = `<p style="color:#dc2626">预览渲染失败：${e.message}</p>`
  } finally {
    previewLoading.value = false
  }
}

async function rebuildAndPreview() {
  if (!docData.value) return
  const blob = await buildModifiedDocx(docData.value.zip, docData.value.stylesDoc, docData.value.documentDoc)
  modifiedBlob.value = blob
  await updatePreview(blob)
}

async function handleFileUpload(file) {
  if (!file) { docData.value = null; modifiedBlob.value = null; chatMessages.value = []; return }
  isLoading.value = true; error.value = ''; modifiedBlob.value = null; chatMessages.value = []
  try {
    docData.value = await parseDocx(file)
    await rebuildAndPreview()
    chatMessages.value.push({
      role: 'assistant',
      content: `已读取「${docData.value.fileName}」，${docData.value.content.length} 段、${docData.value.styles.styles.length} 种样式。想怎么调整？`,
    })
  } catch (e) {
    error.value = `解析失败：${e.message}`; docData.value = null
  } finally { isLoading.value = false }
}

async function handleSend(text) {
  if (!docData.value) return
  chatMessages.value.push({ role: 'user', content: text })
  try {
    const result = await chat(text, chatMessages.value, docData.value.styles.styles, docData.value.content)
    const reply = result.reply || '已处理。'
    const operations = result.operations || []
    chatMessages.value.push({ role: 'assistant', content: reply, operations })

    if (operations.length > 0) {
      const newStylesDoc = docData.value.stylesDoc.cloneNode(true)
      applyOperations(newStylesDoc, operations)
      docData.value.stylesDoc = newStylesDoc
      docData.value.styles = reparseStylesFromDoc(newStylesDoc)

      const newDocumentDoc = docData.value.documentDoc.cloneNode(true)
      applyContentOperations(newDocumentDoc, operations)
      docData.value.documentDoc = newDocumentDoc

      await rebuildAndPreview()
      error.value = ''
    }
  } catch (e) {
    chatMessages.value.push({ role: 'assistant', content: `出错：${e.message}` })
  }
}

async function handleTemplateSelect(tpl) {
  if (!docData.value) return
  const text = `应用模板「${tpl.name}」到当前文档`
  chatMessages.value.push({ role: 'user', content: text })
  try {
    const result = await chat(text, chatMessages.value, docData.value.styles.styles, docData.value.content)
    const operations = result.operations || []
    chatMessages.value.push({ role: 'assistant', content: result.reply || `已应用「${tpl.name}」`, operations })
    if (operations.length > 0) {
      const newStylesDoc = docData.value.stylesDoc.cloneNode(true)
      applyOperations(newStylesDoc, operations)
      docData.value.stylesDoc = newStylesDoc
      docData.value.styles = reparseStylesFromDoc(newStylesDoc)
      await rebuildAndPreview()
      activeTemplateId.value = tpl.id; error.value = ''
    }
  } catch (e) {
    chatMessages.value.push({ role: 'assistant', content: `模板应用失败：${e.message}` })
  }
}

function saveCurrentAsTemplate(name) {
  if (!docData.value || !modifiedBlob.value) return
  const ops = []
  for (const st of docData.value.styles.styles) {
    const op = { target: st.styleId }
    if (st.font) op.font = st.font.ascii || st.font.eastAsia
    if (st.size) op.size = st.size
    if (st.bold) op.bold = true; if (st.italic) op.italic = true
    if (st.underline) op.underline = true; if (st.strikethrough) op.strikethrough = true
    if (st.color) op.color = st.color; if (st.shading) op.shading = st.shading
    if (st.align) op.align = st.align
    if (st.spacing?.line) op.line = st.spacing.line
    if (st.spacing?.before) op.before = st.spacing.before
    if (st.spacing?.after) op.after = st.spacing.after
    if (st.indent?.firstLine) op.firstLine = st.indent.firstLine
    if (Object.keys(op).length > 1) ops.push(op)
  }
  saveTemplate(name, `从 ${docData.value.fileName} 保存`, ops)
  refreshTemplates()
}

function downloadModified() {
  if (!modifiedBlob.value) return
  const url = URL.createObjectURL(modifiedBlob.value)
  const a = document.createElement('a')
  a.href = url; a.download = `modified_${docData.value?.fileName || 'doc.docx'}`
  a.click(); URL.revokeObjectURL(url)
}
</script>

<style scoped>
.lab-page {
  min-height: 100dvh;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  color: #1d1d1f;
  background: #ffffff;
  padding-top: 80px;
}
.lab-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 18px 48px;
}
.lab-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}
.lab-header-left { flex: 1; }
.lab-brand {
  font-size: 24px;
  font-weight: 780;
  color: #111111;
  margin: 0;
  letter-spacing: 0;
  line-height: 0.98;
}
.lab-subtitle {
  font-size: 13px;
  color: rgba(17, 17, 17, 0.58);
  margin: 6px 0 0;
}
.lab-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tab-switcher {
  display: flex;
  gap: 8px;
}
.tab-btn {
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.88);
  color: rgba(17, 17, 17, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
}
.tab-btn:hover {
  background: rgba(249, 250, 251, 0.48);
  border-color: rgba(148, 163, 184, 0.48);
}
.tab-btn.active {
  background: #0f9f7a;
  color: #ffffff;
  border-color: #0f9f7a;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #111111;
  color: #ffffff;
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  transition: background-color 0.16s ease;
  white-space: nowrap;
}
.btn-primary:hover { background: #2f2f2f; }
.btn-icon { font-size: 15px; }

.error-toast {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.12);
  border-radius: 14px;
  padding: 10px 14px;
  margin-top: 14px;
  font-size: 13px;
  color: #dc2626;
}
.error-close {
  background: none; border: none; color: #dc2626; font-size: 16px; cursor: pointer; padding: 2px 6px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px;
  color: rgba(17, 17, 17, 0.58);
}
.load-spinner {
  width: 28px; height: 28px;
  border: 3px solid rgba(15, 159, 122, 0.2);
  border-top-color: #0f9f7a;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-bottom: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { font-size: 14px; margin: 0; }

.doc-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  font-size: 13px;
  color: rgba(17, 17, 17, 0.58);
}
.status-dot {
  width: 6px; height: 6px;
  background: #0f9f7a;
  border-radius: 50%;
}
.status-name { color: #1d1d1f; font-weight: 500; }
.status-meta::before { content: '·'; margin-right: 8px; color: rgba(17, 17, 17, 0.36); }

.workspace {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 14px;
  margin-top: 10px;
}
.ws-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 260px);
  overflow-y: auto;
}
.ws-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  max-height: calc(100vh - 260px);
}
.ws-main > :first-child { flex-shrink: 1; min-height: 180px; }
.ws-main > :last-child { flex: 1; min-height: 200px; }

.welcome {
  display: flex;
  justify-content: center;
  padding: 60px 20px;
}
.welcome-card {
  text-align: center;
  max-width: 420px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  padding: 36px;
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
.welcome-icon { font-size: 56px; margin-bottom: 16px; }
.welcome-card h2 {
  font-size: 22px;
  font-weight: 760;
  color: #111111;
  margin: 0 0 10px;
  letter-spacing: 0;
}
.welcome-card p {
  font-size: 14px;
  color: rgba(17, 17, 17, 0.58);
  margin: 0 0 20px;
  line-height: 1.55;
}
.welcome-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.hint-chip {
  font-size: 12px;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  padding: 6px 14px;
  transition: all 0.16s ease;
}
.hint-chip:hover {
  border-color: rgba(255, 255, 255, 0.96);
  background: rgba(255, 255, 255, 0.96);
}
</style>

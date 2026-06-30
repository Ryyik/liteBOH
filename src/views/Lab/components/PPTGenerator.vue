<template>
  <div class="ppt-generator">
    <!-- Header -->
    <div class="ppt-header">
      <h3 class="ppt-title">AI PPT 生成器</h3>
      <p class="ppt-desc">输入主题，让 AI 自动生成结构化演示文稿</p>
    </div>

    <!-- Input Area -->
    <div class="ppt-input-area">
      <div class="input-group">
        <label class="input-label">PPT 主题</label>
        <input v-model="topic" type="text" class="input-field" placeholder="例如：项目总结报告、产品介绍、技术分享..."
          @keyup.enter="handleGenerate" />
      </div>

      <div class="input-group">
        <label class="input-label">模板风格</label>
        <select v-model="selectedTemplateId" class="input-select">
          <option v-for="template in templates" :key="template.id" :value="template.id">
            {{ template.name }} - {{ template.description }}
          </option>
        </select>
      </div>

      <div class="input-group">
        <label class="input-label">额外要求（可选）</label>
        <textarea v-model="context" class="input-textarea" placeholder="例如：需要包含数据对比、风格偏商务、预计5-8页..."
          rows="3"></textarea>
      </div>

      <button class="btn-generate" :disabled="!topic || isGenerating" @click="handleGenerate">
        <span v-if="isGenerating" class="spinner"></span>
        <span v-else class="btn-icon">✨</span>
        {{ isGenerating ? '生成中...' : '生成 PPT' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="error-box">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ error }}</span>
    </div>

    <!-- Preview Area -->
    <div v-if="pptData" class="ppt-preview">
      <div class="preview-header">
        <h4 class="preview-title">{{ pptData.title }}</h4>
        <span class="preview-meta">{{ pptData.slides.length }} 张幻灯片</span>
      </div>

      <!-- Slide List -->
      <div class="slide-list">
        <div v-for="(slide, index) in pptData.slides" :key="index" class="slide-item">
          <div class="slide-number">{{ index + 1 }}</div>
          <div class="slide-content">
            <div class="slide-type-badge">{{ getSlideTypeLabel(slide.type) }}</div>
            <div class="slide-title-text">{{ slide.title }}</div>
            <div v-if="slide.points" class="slide-preview-points">
              <span v-for="(point, pIndex) in slide.points.slice(0, 3)" :key="pIndex">
                • {{ point }}
              </span>
              <span v-if="slide.points.length > 3" class="more-indicator">
                +{{ slide.points.length - 3 }} 更多
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Download Button -->
      <div class="ppt-actions">
        <button class="btn-download" @click="handleDownload">
          <span class="btn-icon">⬇</span>
          下载 PPT 文件
        </button>
        <button class="btn-regenerate" @click="handleRegenerate">
          <span class="btn-icon">🔄</span>
          重新生成
        </button>
      </div>
    </div>

    <!-- Tips -->
    <div v-if="!pptData && !isGenerating" class="ppt-tips">
      <div class="tip-item">
        <span class="tip-icon">💡</span>
        <span class="tip-text">AI 会自动生成 5-8 张结构化幻灯片</span>
      </div>
      <div class="tip-item">
        <span class="tip-icon">🎨</span>
        <span class="tip-text">使用 BOH 品牌色系，风格简洁专业</span>
      </div>
      <div class="tip-item">
        <span class="tip-icon">⚡</span>
        <span class="tip-text">纯前端生成，无需后端处理</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { usePPTGenerator } from '../composables/usePPTGenerator.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { PPT_TEMPLATES } from '../config/ppt-templates.js'

const { isGenerating, error, pptData, generatePPTStructure, buildPPT } = usePPTGenerator()
const { showDialog } = useConfirmDialog()

const templates = PPT_TEMPLATES
const selectedTemplateId = ref('boh-brand')

const topic = ref('')
const context = ref('')

async function handleGenerate() {
  if (!topic.value.trim()) return

  try {
    const data = await generatePPTStructure(topic.value, context.value)
    // 成功提示
    await showDialog({
      title: '生成成功',
      message: `已生成 ${data.slides.length} 张幻灯片，预览后可下载`,
      type: 'success',
    })
  } catch (e) {
    // 错误已经在 composable 中处理
    console.error('PPT 生成失败:', e)
  }
}

async function handleDownload() {
  if (!pptData.value) return

  try {
    const fileName = `${pptData.value.title.replace(/\s+/g, '_')}.pptx`
    await buildPPT(pptData.value, selectedTemplateId.value, fileName)

    await showDialog({
      title: '下载成功',
      message: `文件已保存为 ${fileName}`,
      type: 'success',
    })
  } catch (e) {
    await showDialog({
      title: '下载失败',
      message: e.message,
      type: 'error',
    })
  }
}

async function handleRegenerate() {
  const confirmed = await showDialog({
    title: '重新生成',
    message: '确定要重新生成吗？当前内容将被替换',
    type: 'warning',
  })

  if (confirmed) {
    pptData.value = null
    await handleGenerate()
  }
}

function getSlideTypeLabel(type) {
  const labels = {
    title: '封面',
    content: '内容',
    'two-column': '对比',
    end: '结束',
  }
  return labels[type] || '内容'
}
</script>

<style scoped>
.ppt-generator {
  padding: 20px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.ppt-header {
  margin-bottom: 20px;
}

.ppt-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 6px;
}

.ppt-desc {
  font-size: 14px;
  color: rgba(17, 17, 17, 0.58);
  margin: 0;
}

.ppt-input-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 13px;
  font-weight: 500;
  color: #1d1d1f;
}

.input-field {
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.16s ease;
}

.input-field:focus {
  outline: none;
  border-color: #0f9f7a;
}

.input-textarea {
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.16s ease;
}

.input-textarea:focus {
  outline: none;
  border-color: #0f9f7a;
}

.input-select {
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 8px;
  font-size: 14px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.16s ease;
}

.input-select:focus {
  outline: none;
  border-color: #0f9f7a;
}

.btn-generate {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  background: #0f9f7a;
  color: #ffffff;
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.btn-generate:hover:not(:disabled) {
  background: #0d8a6b;
}

.btn-generate:disabled {
  background: rgba(15, 159, 122, 0.36);
  cursor: not-allowed;
}

.btn-icon {
  font-size: 16px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.12);
  border-radius: 8px;
  margin-top: 14px;
}

.error-icon {
  font-size: 18px;
}

.error-text {
  font-size: 14px;
  color: #dc2626;
}

.ppt-preview {
  margin-top: 24px;
  padding: 18px;
  background: rgba(249, 250, 251, 0.48);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.preview-meta {
  font-size: 13px;
  color: rgba(17, 17, 17, 0.58);
}

.slide-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slide-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.slide-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(15, 159, 122, 0.12);
  color: #0f9f7a;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}

.slide-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slide-type-badge {
  display: inline-block;
  padding: 3px 8px;
  background: rgba(15, 159, 122, 0.12);
  color: #0f9f7a;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.slide-title-text {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.slide-preview-points {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  color: rgba(17, 17, 17, 0.58);
}

.more-indicator {
  color: #0f9f7a;
  font-weight: 500;
}

.ppt-actions {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.btn-download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: #1a1a2e;
  color: #ffffff;
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.btn-download:hover {
  background: #2a2a4e;
}

.btn-regenerate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: transparent;
  color: #1a1a2e;
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.btn-regenerate:hover {
  background: rgba(249, 250, 251, 0.48);
}

.ppt-tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
  padding: 14px;
  background: rgba(15, 159, 122, 0.04);
  border-radius: 8px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tip-icon {
  font-size: 16px;
}

.tip-text {
  font-size: 13px;
  color: rgba(17, 17, 17, 0.58);
}
</style>
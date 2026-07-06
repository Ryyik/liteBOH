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

          <!-- 根据布局类型显示不同的可视化预览 -->
          <div class="slide-preview-visual">
            <!-- 封面页预览 -->
            <div v-if="slide.type === 'title'" class="preview-title-box">
              <div class="preview-title-decoration"></div>
              <div class="preview-title-text">{{ slide.title }}</div>
              <div class="preview-title-divider"></div>
              <div v-if="slide.subtitle" class="preview-subtitle">{{ slide.subtitle }}</div>
            </div>

            <!-- 内容页预览 -->
            <div v-else-if="slide.type === 'content'" class="preview-content-box">
              <div class="preview-content-header">
                <div class="preview-header-decoration"></div>
                <div class="preview-content-title">{{ slide.title }}</div>
              </div>
              <div class="preview-content-divider"></div>
              <div class="preview-points-list">
                <div v-for="(point, pIndex) in slide.points.slice(0, 3)" :key="pIndex" class="preview-point-item">
                  <div class="preview-point-box"></div>
                  <span class="preview-point-text">{{ point }}</span>
                </div>
                <div v-if="slide.points.length > 3" class="preview-more-indicator">
                  +{{ slide.points.length - 3 }} 更多要点
                </div>
              </div>
            </div>

            <!-- 两栏对比页预览 -->
            <div v-else-if="slide.type === 'two-column'" class="preview-twocolumn-box">
              <div class="preview-twocolumn-header">
                <div class="preview-header-decoration"></div>
                <div class="preview-twocolumn-title">{{ slide.title }}</div>
              </div>
              <div class="preview-twocolumn-divider"></div>
              <div class="preview-columns-container">
                <div class="preview-column">
                  <div class="preview-column-title">{{ slide.leftColumn?.title }}</div>
                  <div class="preview-column-items">
                    <div v-for="(item, idx) in slide.leftColumn?.items.slice(0, 2)" :key="idx" class="preview-column-item"></div>
                  </div>
                </div>
                <div class="preview-column-separator"></div>
                <div class="preview-column">
                  <div class="preview-column-title">{{ slide.rightColumn?.title }}</div>
                  <div class="preview-column-items">
                    <div v-for="(item, idx) in slide.rightColumn?.items.slice(0, 2)" :key="idx" class="preview-column-item"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 结束页预览 -->
            <div v-else-if="slide.type === 'end'" class="preview-end-box">
              <div class="preview-end-decoration"></div>
              <div class="preview-end-text">{{ slide.title }}</div>
              <div class="preview-end-divider"></div>
              <div v-if="slide.subtitle" class="preview-end-subtitle">{{ slide.subtitle }}</div>
            </div>

            <!-- 默认预览（未知类型） -->
            <div v-else class="preview-default-box">
              <div class="slide-type-badge">{{ getSlideTypeLabel(slide.type) }}</div>
              <div class="slide-title-text">{{ slide.title }}</div>
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
  padding: 28px;
  background: var(--popover);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.ppt-header { margin-bottom: 28px; }
.ppt-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--foreground);
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}
.ppt-desc {
  font-size: 15px;
  color: var(--muted-foreground);
  margin: 0;
  font-weight: 400;
  line-height: 1.47;
}

.ppt-input-area {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.input-field {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 15px;
  transition: all 0.2s;
  background: var(--popover);
  color: var(--foreground);
  font-family: inherit;
}
.input-field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(201, 100, 66, 0.12);
}

.input-textarea {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 15px;
  resize: vertical;
  transition: all 0.2s;
  background: var(--popover);
  color: var(--foreground);
  font-family: inherit;
}
.input-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(201, 100, 66, 0.12);
}

.input-select {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 15px;
  background: var(--popover);
  cursor: pointer;
  transition: all 0.2s;
  color: var(--foreground);
  font-family: inherit;
}
.input-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(201, 100, 66, 0.12);
}

.btn-generate {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 28px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  align-self: flex-start;
}
.btn-generate:hover:not(:disabled) {
  background: var(--brand-400);
  transform: scale(1.02);
}
.btn-generate:active:not(:disabled) {
  transform: scale(0.98);
}
.btn-generate:disabled {
  background: color-mix(in srgb, var(--primary) 30%, transparent);
  cursor: not-allowed;
}
.btn-icon { font-size: 16px; }
.spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: var(--error);
  border-radius: var(--radius);
  margin-top: 18px;
  color: #ffffff;
  font-weight: 500;
  font-size: 14px;
}
.error-icon { font-size: 18px; }
.error-text { flex: 1; }

.ppt-preview {
  margin-top: 28px;
  padding: 24px;
  background: var(--card);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border);
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.preview-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--foreground);
  margin: 0;
  letter-spacing: -0.01em;
}
.preview-meta {
  font-size: 14px;
  color: var(--muted-foreground);
  font-weight: 500;
}
.slide-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.slide-item {
  display: flex;
  gap: 14px;
  padding: 16px;
  background: var(--popover);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-2xs);
  transition: box-shadow 0.2s;
}
.slide-item:hover {
  box-shadow: var(--shadow-md);
}
.slide-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

/* ===== Slide Preview Visual ===== */
.slide-preview-visual {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Title Slide */
.preview-title-box {
  background: color-mix(in srgb, var(--brand-50) 40%, transparent);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  position: relative;
}
.preview-title-decoration {
  position: absolute;
  top: 10px; left: 16px; right: 16px; height: 44px;
  background: color-mix(in srgb, var(--brand-50) 60%, transparent);
  border-radius: var(--radius-sm);
}
.preview-title-text {
  font-size: 17px; font-weight: 700; color: var(--foreground);
  margin-top: 14px; text-align: center;
  letter-spacing: -0.01em;
}
.preview-title-divider {
  width: 48px; height: 3px; background: var(--primary);
  margin: 10px auto; border-radius: 2px;
}
.preview-subtitle {
  font-size: 13px; color: var(--muted-foreground); text-align: center; margin-top: 4px;
}

/* Content Slide */
.preview-content-box { border-radius: var(--radius-md); overflow: hidden; }
.preview-content-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--brand-50) 50%, transparent);
  border-radius: var(--radius-sm);
}
.preview-header-decoration {
  width: 4px; height: 18px; background: var(--primary); border-radius: 2px;
}
.preview-content-title {
  font-size: 15px; font-weight: 600; color: var(--foreground);
}
.preview-content-divider {
  height: 1px; background: var(--border); margin: 10px 0;
}
.preview-points-list { display: flex; flex-direction: column; gap: 8px; }
.preview-point-item { display: flex; align-items: center; gap: 10px; }
.preview-point-box {
  width: 100%; height: 22px;
  background: var(--border);
  border-radius: 6px; flex: 1;
}
.preview-point-text {
  font-size: 13px; color: var(--secondary-foreground);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.preview-more-indicator {
  font-size: 12px; color: var(--primary); font-weight: 600; margin-top: 4px;
}

/* Two Column Slide */
.preview-twocolumn-box { border-radius: var(--radius-md); overflow: hidden; }
.preview-twocolumn-header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--brand-50) 50%, transparent);
  border-radius: var(--radius-sm);
}
.preview-twocolumn-title { font-size: 15px; font-weight: 600; color: var(--foreground); }
.preview-twocolumn-divider { height: 1px; background: var(--border); margin: 10px 0; }
.preview-columns-container { display: flex; gap: 14px; }
.preview-column { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.preview-column-title {
  font-size: 13px; font-weight: 600; color: var(--primary);
  padding: 6px 10px; background: color-mix(in srgb, var(--brand-50) 60%, transparent);
  border-radius: var(--radius-sm); text-align: center;
}
.preview-column-items { display: flex; flex-direction: column; gap: 5px; }
.preview-column-item {
  height: 20px; background: var(--border);
  border-radius: 6px;
}
.preview-column-separator {
  width: 1px; height: 80px;
  background: var(--border);
  margin: 0 4px;
}

/* End Slide */
.preview-end-box {
  background: color-mix(in srgb, var(--brand-50) 40%, transparent);
  border-radius: var(--radius-md); padding: 20px; position: relative;
}
.preview-end-decoration {
  position: absolute; top: 10px; left: 24px; right: 24px; height: 64px;
  background: color-mix(in srgb, var(--brand-50) 50%, transparent); border-radius: var(--radius-sm);
}
.preview-end-text {
  font-size: 17px; font-weight: 700; color: var(--foreground);
  text-align: center; margin-top: 14px;
  letter-spacing: -0.01em;
}
.preview-end-divider {
  width: 40px; height: 3px; background: var(--primary);
  margin: 10px auto; border-radius: 2px;
}
.preview-end-subtitle {
  font-size: 13px; color: var(--muted-foreground); text-align: center; margin-top: 4px;
}

/* Default */
.preview-default-box { display: flex; flex-direction: column; gap: 8px; }
.slide-type-badge {
  display: inline-block; padding: 4px 10px;
  background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary);
  border-radius: var(--radius-sm); font-size: 12px; font-weight: 600;
}
.slide-title-text { font-size: 16px; font-weight: 600; color: var(--foreground); }

.ppt-actions {
  display: flex; gap: 14px; margin-top: 24px;
}
.btn-download {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px;
  background: var(--foreground); color: var(--primary-foreground); border: none;
  border-radius: var(--radius); font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.btn-download:hover { background: var(--text-600); transform: scale(1.02); }
.btn-download:active { transform: scale(0.98); }
.btn-regenerate {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px;
  background: var(--card); color: var(--foreground);
  border: 1px solid var(--border); border-radius: var(--radius);
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.btn-regenerate:hover { background: rgba(0, 0, 0, 0.06); }

.ppt-tips {
  display: flex; flex-direction: column; gap: 12px;
  margin-top: 28px; padding: 20px;
  background: var(--card); border-radius: var(--radius);
  border: 1px solid var(--border);
}
.tip-item { display: flex; align-items: center; gap: 12px; }
.tip-icon { font-size: 18px; }
.tip-text { font-size: 14px; color: var(--muted-foreground); font-weight: 500; }

/* Responsive */
@media (max-width: 768px) {
  .ppt-generator { padding: 20px; }
  .ppt-title { font-size: 22px; }
  .ppt-actions { flex-direction: column; }
  .ppt-actions > * { width: 100%; justify-content: center; }
}
</style>
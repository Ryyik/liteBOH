<template>
  <main class="lab-page">
    <!-- 顶栏：品牌 + 模式切换 + 文档工具 -->
    <header class="lab-topbar">
      <div class="brand">
        <div class="brand-mark">B</div>
        <div class="brand-text">
          <div class="brand-name">BOH 办公 AI</div>
          <div class="brand-sub">对话式文档助手</div>
        </div>
      </div>
      <div class="topbar-actions">
        <button
          v-if="docData"
          class="icon-btn"
          title="文档工具"
          @click="drawerOpen = true"
        >
          <AppIcon name="sidebar" size="small" weight="medium" />
        </button>
        <button
          v-if="modifiedBlob"
          class="icon-btn"
          title="下载文档"
          @click="downloadModified"
        >
          <AppIcon name="download" size="small" weight="medium" />
        </button>
        <button
          v-if="hasConversation"
          class="icon-btn"
          title="新对话"
          @click="resetConversation"
        >
          <AppIcon name="sparkles" size="small" weight="medium" />
        </button>
      </div>
    </header>

    <!-- 主体内容 -->
    <div class="lab-content">
      <!-- 空状态：居中对话框 -->
      <section v-if="!hasConversation && !isLoading" class="empty-state">
        <div class="empty-hero">
          <div class="hero-icon">
            <AppIcon name="sparkles" size="xl" weight="light" />
          </div>
          <h1 class="hero-title">和 AI 一起处理你的文档</h1>
          <p class="hero-subtitle">
            上传 Word 文档让 AI 帮你排版，或用一句话生成 PPT
          </p>
        </div>

        <!-- 对话框（空状态即对话框） -->
        <div class="composer composer-hero">
          <textarea
            ref="heroTextareaRef"
            v-model="text"
            class="composer-input"
            :placeholder="composerPlaceholder"
            rows="3"
            :disabled="aiLoading"
            @keydown.enter.exact.prevent="send"
            @input="autoGrow"
          />
          <div v-if="pendingFile || pptIntent || wordIntent" class="composer-chips">
            <span v-if="pendingFile" class="attach-chip">
              <AppIcon name="doc" size="small" weight="medium" />
              <span class="chip-text">{{ truncate(pendingFile.name, 28) }}</span>
              <button class="chip-remove" title="移除" @click="clearFile">
                <AppIcon name="close" size="small" />
              </button>
            </span>
            <span v-if="pptIntent" class="attach-chip ppt-chip">
              <AppIcon name="chart-bar" size="small" weight="medium" />
              <span class="chip-text">PPT 生成</span>
              <button class="chip-remove" title="取消" @click="pptIntent = false">
                <AppIcon name="close" size="small" />
              </button>
            </span>
            <span v-if="wordIntent" class="attach-chip word-chip">
              <AppIcon name="doc" size="small" weight="medium" />
              <span class="chip-text">Word 生成</span>
              <button class="chip-remove" title="取消" @click="wordIntent = false">
                <AppIcon name="close" size="small" />
              </button>
            </span>
          </div>
          <div class="composer-footer">
            <div class="composer-left">
              <div class="plus-wrap">
                <button
                  class="plus-btn"
                  :class="{ active: plusMenuOpen }"
                  title="添加"
                  @click.stop="plusMenuOpen = !plusMenuOpen"
                >
                  <AppIcon name="plus" size="small" weight="medium" />
                </button>
                <Transition name="popover">
                  <div v-if="plusMenuOpen" class="plus-menu" @click.stop>
                    <button class="plus-item" @click="chooseDoc">
                      <AppIcon name="upload" size="small" weight="medium" />
                      <span>上传 Word 文档</span>
                    </button>
                    <button class="plus-item" @click="choosePPT">
                      <AppIcon name="chart-bar" size="small" weight="medium" />
                      <span>生成 PPT</span>
                    </button>
                    <button class="plus-item" @click="chooseWord">
                      <AppIcon name="doc" size="small" weight="medium" />
                      <span>生成 Word 文档</span>
                    </button>
                    <button class="plus-item" @click="openPresetPicker">
                      <AppIcon name="paintbrush" size="small" weight="medium" />
                      <span>选择样式集</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
            <button
              class="composer-send"
              :disabled="!canSend"
              @click="send"
            >
              <AppIcon name="arrow-right" size="small" weight="semibold" />
              <span>发送</span>
            </button>
          </div>
        </div>
        <input
          ref="heroFileInput"
          type="file"
          accept=".docx"
          hidden
          @change="onFileChange"
        />

        <!-- 建议提示 -->
        <div class="suggestions">
          <button
            v-for="s in suggestions"
            :key="s.text"
            class="suggestion-chip"
            @click="onSuggestion(s)"
          >
            {{ s.text }}
          </button>
        </div>
      </section>

      <!-- 初始加载（文档解析中） -->
      <section v-else-if="isLoading && !hasConversation" class="loading-state">
        <div class="loading-card">
          <ProgressRing :progress="0.6" size="large" indeterminate />
          <p class="loading-text">{{ loadingMessage }}</p>
        </div>
      </section>

      <!-- 对话状态：消息流 + 底部对话框 -->
      <section v-else class="conversation">
        <div ref="threadRef" class="thread">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="message"
            :class="msg.role"
          >
            <div v-if="msg.role === 'assistant'" class="message-avatar">B</div>
            <div class="message-body">
              <div v-if="msg.progress === undefined && msg.content" class="message-meta">
                <span class="meta-name">{{ msg.role === 'user' ? '你' : 'BOH Agent' }}</span>
                <span class="meta-time">{{ msg.time }}</span>
              </div>
              <div v-if="msg.progress === undefined && msg.content" class="message-content">{{ msg.content }}</div>
              <div v-if="msg.file" class="message-attachment">
                <AppIcon name="doc" size="small" weight="medium" />
                <span>{{ msg.file }}</span>
              </div>
              <div v-if="msg.operations?.length" class="message-ops">
                已应用 {{ msg.operations.length }} 项修改
                <button class="ops-view" @click="drawerOpen = true">查看</button>
              </div>
              <!-- 进度卡片 -->
              <div v-if="msg.progress !== undefined" class="progress-card">
                <div class="progress-card-head">
                  <div class="progress-icon">
                    <ProgressRing :progress="msg.progress / 100" size="medium" />
                  </div>
                  <div class="progress-info">
                    <div class="progress-title">BOH Agent</div>
                    <div class="progress-text">{{ msg.progressText || '正在处理...' }}</div>
                  </div>
                </div>
                <div class="progress-bar-container">
                  <div class="progress-bar" :style="{ width: `${msg.progress}%` }"></div>
                </div>
                <div class="progress-percent">{{ msg.progress }}%</div>
              </div>
              <!-- PPT 结果卡片 -->
              <div v-if="msg.ppt" class="ppt-result-card">
                <div class="ppt-result-head">
                  <div>
                    <div class="ppt-result-title">{{ msg.ppt.title }}</div>
                    <div class="ppt-result-meta">{{ msg.ppt.slides.length }} 张幻灯片</div>
                  </div>
                  <button class="ppt-download-btn" @click="downloadPPT(msg.ppt)">
                    <AppIcon name="download" size="small" weight="medium" />
                    下载 PPT
                  </button>
                </div>
                <div class="ppt-slide-previews">
                  <div
                    v-for="(slide, si) in msg.ppt.slides"
                    :key="si"
                    class="ppt-slide-mini"
                    :class="`slide-${slide.type}`"
                  >
                    <div class="slide-mini-num">{{ si + 1 }}</div>
                    <div class="slide-mini-title">{{ slide.title }}</div>
                    <div v-if="slide.points" class="slide-mini-points">
                      {{ slide.points.length }} 个要点
                    </div>
                    <div v-else-if="slide.leftColumn" class="slide-mini-points">
                      对比页
                    </div>
                    <div v-else-if="slide.chartType" class="slide-mini-points">
                      图表
                    </div>
                    <div v-else-if="slide.headers" class="slide-mini-points">
                      表格
                    </div>
                    <div v-else-if="slide.events" class="slide-mini-points">
                      时间线
                    </div>
                  </div>
                </div>
              </div>
              <!-- Word 结果卡片 -->
              <div v-if="msg.word" class="ppt-result-card">
                <div class="ppt-result-head">
                  <div>
                    <div class="ppt-result-title">{{ msg.word.title }}</div>
                    <div class="ppt-result-meta">{{ (msg.word.blocks || []).length }} 个内容块</div>
                  </div>
                  <button class="ppt-download-btn" @click="downloadWord(msg.word)">
                    <AppIcon name="download" size="small" weight="medium" />
                    下载 Word
                  </button>
                </div>
                <div class="word-block-previews">
                  <div
                    v-for="(block, bi) in (msg.word.blocks || []).slice(0, 12)"
                    :key="bi"
                    class="word-block-mini"
                    :class="`block-${block.type}`"
                  >
                    <span class="block-type-tag">{{ blockTypeLabel(block.type) }}</span>
                    <span class="block-text">{{ blockPreview(block) }}</span>
                  </div>
                </div>
              </div>
              <!-- 大纲确认卡片 -->
              <div v-if="msg.outline" class="outline-card">
                <div class="outline-card-head">
                  <div class="outline-card-title">{{ msg.outline.title }}</div>
                  <div class="outline-card-meta">
                    {{ msg.outline.outline.length }} 个章节
                    <span v-if="msg.outlineFlow" class="outline-card-tag">{{ msg.outlineFlow === 'ppt' ? 'PPT' : 'Word' }}</span>
                  </div>
                </div>
                <div class="outline-items">
                  <div
                    v-for="(item, oi) in msg.outline.outline"
                    :key="oi"
                    class="outline-item"
                    :class="`outline-type-${item.type}`"
                  >
                    <div class="outline-item-num">{{ oi + 1 }}</div>
                    <div class="outline-item-body">
                      <div class="outline-item-title">{{ item.title }}</div>
                      <div v-if="item.summary" class="outline-item-summary">{{ item.summary }}</div>
                    </div>
                    <div class="outline-item-type-tag">{{ outlineTypeLabel(item.type) }}</div>
                  </div>
                </div>
                <div
                  v-if="msg.outlineFlow && i === latestOutlineIndex && pendingOutlineFlow"
                  class="outline-actions"
                >
                  <button
                    class="outline-confirm-btn"
                    :disabled="aiLoading"
                    @click="confirmOutlineFromCard"
                  >
                    <AppIcon name="check" size="small" weight="semibold" />
                    确认生成
                  </button>
                  <span class="outline-hint">或在下方输入框告诉我要调整的地方</span>
                </div>
              </div>
            </div>
          </div>
          <!-- AI 思考中（仅当没有进度卡片时显示） -->
          <div v-if="aiLoading && progressMsgIndex < 0" class="message assistant">
            <div class="message-avatar">B</div>
            <div class="message-body">
              <div class="message-meta">
                <span class="meta-name">BOH Agent</span>
                <span class="meta-time">思考中</span>
              </div>
              <div class="thinking"><span class="dot"></span></div>
            </div>
          </div>
        </div>

        <!-- 底部对话框 -->
        <div class="composer composer-bottom">
          <textarea
            ref="bottomTextareaRef"
            v-model="text"
            class="composer-input"
            :placeholder="composerPlaceholder"
            rows="2"
            :disabled="aiLoading"
            @keydown.enter.exact.prevent="send"
            @input="autoGrow"
          />
          <div v-if="pendingFile || pptIntent || wordIntent" class="composer-chips">
            <span v-if="pendingFile" class="attach-chip">
              <AppIcon name="doc" size="small" weight="medium" />
              <span class="chip-text">{{ truncate(pendingFile.name, 24) }}</span>
              <button class="chip-remove" title="移除" @click="clearFile">
                <AppIcon name="close" size="small" />
              </button>
            </span>
            <span v-if="pptIntent" class="attach-chip ppt-chip">
              <AppIcon name="chart-bar" size="small" weight="medium" />
              <span class="chip-text">PPT 生成</span>
              <button class="chip-remove" title="取消" @click="pptIntent = false">
                <AppIcon name="close" size="small" />
              </button>
            </span>
            <span v-if="wordIntent" class="attach-chip word-chip">
              <AppIcon name="doc" size="small" weight="medium" />
              <span class="chip-text">Word 生成</span>
              <button class="chip-remove" title="取消" @click="wordIntent = false">
                <AppIcon name="close" size="small" />
              </button>
            </span>
          </div>
          <div class="composer-footer">
            <div class="composer-left">
              <div class="plus-wrap">
                <button
                  class="plus-btn"
                  :class="{ active: plusMenuOpen }"
                  title="添加"
                  @click.stop="plusMenuOpen = !plusMenuOpen"
                >
                  <AppIcon name="plus" size="small" weight="medium" />
                </button>
                <Transition name="popover">
                  <div v-if="plusMenuOpen" class="plus-menu" @click.stop>
                    <button class="plus-item" @click="chooseDoc">
                      <AppIcon name="upload" size="small" weight="medium" />
                      <span>上传 Word 文档</span>
                    </button>
                    <button class="plus-item" @click="choosePPT">
                      <AppIcon name="chart-bar" size="small" weight="medium" />
                      <span>生成 PPT</span>
                    </button>
                    <button class="plus-item" @click="chooseWord">
                      <AppIcon name="doc" size="small" weight="medium" />
                      <span>生成 Word 文档</span>
                    </button>
                    <button class="plus-item" @click="openPresetPicker">
                      <AppIcon name="paintbrush" size="small" weight="medium" />
                      <span>选择样式集</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
            <button
              class="composer-send"
              :disabled="!canSend"
              @click="send"
            >
              <AppIcon name="arrow-right" size="small" weight="semibold" />
              <span>发送</span>
            </button>
          </div>
        </div>
        <input
          ref="bottomFileInput"
          type="file"
          accept=".docx"
          hidden
          @change="onFileChange"
        />
      </section>
    </div>

    <!-- 任务面板 -->
    <Transition name="task-panel">
      <aside v-if="taskPanelOpen" class="task-panel">
        <div class="task-panel-header">
          <div class="task-panel-title">
            <AppIcon name="check-circle" size="small" weight="medium" />
            <span>任务待办</span>
          </div>
          <button class="task-panel-close" @click="closeTaskPanel">
            <AppIcon name="close" size="small" />
          </button>
        </div>
        <div class="task-panel-body">
          <div
            v-for="(task, idx) in taskList"
            :key="task.id"
            class="task-item"
            :class="`task-${task.status}`"
          >
            <div class="task-icon">
              <template v-if="task.status === 'done'">
                <AppIcon name="check" size="small" weight="bold" />
              </template>
              <template v-else-if="task.status === 'error'">
                <AppIcon name="warning" size="small" weight="medium" />
              </template>
              <template v-else-if="task.status === 'doing'">
                <div class="task-spinner"></div>
              </template>
              <template v-else>
                <span class="task-num">{{ idx + 1 }}</span>
              </template>
            </div>
            <div class="task-content">
              <div class="task-title">{{ task.title }}</div>
              <div class="task-desc">{{ task.desc }}</div>
            </div>
          </div>
        </div>
        <div class="task-panel-footer">
          <span class="task-flow-label">
            {{ currentTaskFlow === 'ppt' ? 'PPT 生成流程' : 'Word 生成流程' }}
          </span>
        </div>
      </aside>
    </Transition>

    <!-- 错误提示 -->
    <Transition name="toast">
      <div v-if="error" class="error-toast">
        <AppIcon name="warning" size="small" weight="medium" />
        <span class="error-text">{{ error }}</span>
        <button class="error-close" @click="error = ''">
          <AppIcon name="close" size="small" />
        </button>
      </div>
    </Transition>

    <!-- 文档工具抽屉 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="drawerOpen"
          class="drawer-mask"
          @click="drawerOpen = false"
        />
      </Transition>
      <Transition name="drawer">
        <aside v-if="drawerOpen && docData" class="drawer">
          <div class="drawer-header">
            <h3 class="drawer-title">文档工具</h3>
            <button class="drawer-close" @click="drawerOpen = false">
              <AppIcon name="close" size="small" />
            </button>
          </div>
          <div class="drawer-body">
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.preview }"
                @click="drawerSection.preview = !drawerSection.preview"
              >
                <AppIcon name="doc" size="small" weight="medium" />
                <span>文档预览</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.preview" class="drawer-section-body">
                <DocPreview
                  :html="previewHtml"
                  :loading="previewLoading"
                  @context-action="onContextAction"
                />
              </div>
            </div>
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.styles }"
                @click="drawerSection.styles = !drawerSection.styles"
              >
                <AppIcon name="paintbrush" size="small" weight="medium" />
                <span>样式清单</span>
                <span class="drawer-count">{{ docData.styles.styles.length }}</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.styles" class="drawer-section-body">
                <StyleInspector :styles="docData.styles.styles" />
              </div>
            </div>
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.templates }"
                @click="drawerSection.templates = !drawerSection.templates"
              >
                <AppIcon name="sidebar" size="small" weight="medium" />
                <span>模板管理</span>
                <span class="drawer-count">{{ templates.length }}</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.templates" class="drawer-section-body">
                <TemplatePanel
                  :templates="templates"
                  :active-id="activeTemplateId"
                  :can-save="true"
                  @select="handleTemplateSelect"
                  @save="saveCurrentAsTemplate"
                  @update="refreshTemplates"
                />
              </div>
            </div>
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.history }"
                @click="drawerSection.history = !drawerSection.history"
              >
                <AppIcon name="clock" size="small" weight="medium" />
                <span>操作历史</span>
                <span class="drawer-count">{{ historyItems.length }}</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.history" class="drawer-section-body">
                <HistoryTimeline :items="historyItems" @restore="onHistoryRestore" />
              </div>
            </div>
          </div>
        </aside>
      </Transition>
    </Teleport>

    <!-- 样式集选择模态框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPresetPicker" class="preset-mask" @click="showPresetPicker = false" />
      </Transition>
      <Transition name="modal">
        <div v-if="showPresetPicker" class="preset-modal">
          <div class="preset-modal-head">
            <h3 class="preset-modal-title">选择样式集</h3>
            <button class="preset-modal-close" @click="showPresetPicker = false">
              <AppIcon name="close" size="small" />
            </button>
          </div>
          <div class="preset-modal-body">
            <StylePresetPicker v-model="selectedPresetId" />
          </div>
          <div class="preset-modal-foot">
            <span class="preset-current">当前：{{ currentPresetName }}</span>
            <button class="preset-confirm-btn" @click="showPresetPicker = false">确定</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 通知 -->
    <NotificationToast ref="toastRef" />
  </main>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import * as mammoth from 'mammoth'
import DOMPurify from '@/utils/dompurify.js'
import AppIcon from './components/AppIcon.vue'
import ProgressRing from './components/ProgressRing.vue'
import NotificationToast from './components/NotificationToast.vue'
import DocPreview from './components/DocPreview.vue'
import StyleInspector from './components/StyleInspector.vue'
import TemplatePanel from './components/TemplatePanel.vue'
import HistoryTimeline from './components/HistoryTimeline.vue'
import StylePresetPicker from './components/StylePresetPicker.vue'
import { parseDocx, reparseStylesFromDoc } from './engine/docx-parser.js'
import { applyOperations, applyContentOperations } from './engine/style-engine.js'
import { buildModifiedDocx } from './engine/docx-builder.js'
import { getAllTemplates, saveTemplate } from './engine/template-store.js'
import { useDocumentAI } from './composables/useDocumentAI.js'
import { usePPTGenerator } from './composables/usePPTGenerator.js'
import { useWordGenerator } from './composables/useWordGenerator.js'
import { STYLE_PRESETS, DEFAULT_PRESET_ID, getPresetById } from './config/design-tokens.js'
import './styles/claude-theme.css'

const { chat, aiLoading } = useDocumentAI()
const { generatePPTStructure, generateOutline: generatePPTOutline, buildPPT, buildPPTFile } = usePPTGenerator()
const { generateDoc: generateWordDoc, generateOutline: generateWordOutline, buildWordFile } = useWordGenerator()

// ===== 顶层状态 =====
const pptIntent = ref(false) // 是否启用 PPT 生成意图
const wordIntent = ref(false) // 是否启用 Word 从零生成意图
const plusMenuOpen = ref(false) // + 菜单展开
const activeFlow = ref(null) // 当前对话流: 'doc' | 'ppt' | 'word' | null
const text = ref('')
const messages = ref([])
const pendingFile = ref(null)
const isLoading = ref(false)
const loadingMessage = ref('正在解析文档...')
const error = ref('')
const toastRef = ref(null)
const threadRef = ref(null)
const heroTextareaRef = ref(null)
const bottomTextareaRef = ref(null)
const heroFileInput = ref(null)
const bottomFileInput = ref(null)

// 样式集
const selectedPresetId = ref(DEFAULT_PRESET_ID)
const showPresetPicker = ref(false)

// 两阶段生成（多轮确认流程）
const pendingOutline = ref(null) // 待确认的大纲
const pendingOutlineTopic = ref('') // 当前大纲对应的主题
const pendingOutlineFlow = ref(null) // 当前确认流程：'ppt' | 'word' | null
const pendingOutlineHistory = ref([]) // 用户历次修改意见，用于累积传给 AI

// 文档相关
const docData = ref(null)
const modifiedBlob = ref(null)
const previewHtml = ref('')
const previewLoading = ref(false)
const activeTemplateId = ref(null)
const templates = ref(getAllTemplates())
const historyItems = ref([])

// 生成的结果数据（用于下载/重新渲染）
const lastPPTData = ref(null)
const lastWordData = ref(null)

// 进度消息状态（用于显示进度卡片）
const progressMsgIndex = ref(-1) // 进度消息在 messages 数组中的索引

// ===== 任务面板 =====
const taskPanelOpen = ref(false)
const taskList = ref([])
const currentTaskFlow = ref(null) // 'ppt' | 'word' | null

/**
 * 初始化任务列表
 */
function initTaskFlow(flow, topic) {
  currentTaskFlow.value = flow
  if (flow === 'ppt') {
    taskList.value = [
      { id: 'outline', title: '输出 PPT 大纲', desc: `主题：${topic}`, status: 'doing' },
      { id: 'confirm', title: '确认大纲细节', desc: '等待你确认或调整', status: 'pending' },
      { id: 'detail', title: '开始输出 PPT', desc: '生成完整幻灯片内容', status: 'pending' },
    ]
  } else if (flow === 'word') {
    taskList.value = [
      { id: 'outline', title: '输出 Word 大纲', desc: `主题：${topic}`, status: 'doing' },
      { id: 'confirm', title: '确认大纲细节', desc: '等待你确认或调整', status: 'pending' },
      { id: 'detail', title: '开始输出 Word 文档', desc: '生成完整文档内容', status: 'pending' },
    ]
  }
  taskPanelOpen.value = true
}

/**
 * 更新任务状态
 */
function updateTask(taskId, status, desc = null) {
  const task = taskList.value.find(t => t.id === taskId)
  if (task) {
    task.status = status
    if (desc !== null) task.desc = desc
  }
}

/**
 * 进入下一个任务
 */
function nextTask(currentId) {
  updateTask(currentId, 'done')
  const idx = taskList.value.findIndex(t => t.id === currentId)
  if (idx >= 0 && idx + 1 < taskList.value.length) {
    updateTask(taskList.value[idx + 1].id, 'doing')
  }
}

/**
 * 关闭任务面板
 */
function closeTaskPanel() {
  taskPanelOpen.value = false
  setTimeout(() => {
    currentTaskFlow.value = null
    taskList.value = []
  }, 300)
}

/**
 * 进度回调函数 - 更新消息流中的进度卡片
 */
function handleProgress(stage, progress, text) {
  if (progressMsgIndex.value >= 0 && messages.value[progressMsgIndex.value]) {
    messages.value[progressMsgIndex.value].progress = progress
    messages.value[progressMsgIndex.value].progressText = text
  }
}

// 抽屉
const drawerOpen = ref(false)
const drawerSection = reactive({
  preview: true,
  styles: false,
  templates: false,
  history: false,
})

// PPT 模板（向后兼容，实际用 selectedPresetId）
const pptTemplateId = ref(DEFAULT_PRESET_ID)

// ===== 计算属性 =====
const hasConversation = computed(() => messages.value.length > 0)

// 最新一条大纲消息的索引（仅在该消息上展示「确认生成」按钮）
const latestOutlineIndex = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].outline) return i
  }
  return -1
})

const currentPresetName = computed(() => getPresetById(selectedPresetId.value).name)

const canSend = computed(() => {
  if (aiLoading.value || isLoading.value) return false
  return !!pendingFile.value || !!text.value.trim()
})

const composerPlaceholder = computed(() => {
  // 大纲确认流程：优先级最高
  if (pendingOutline.value && pendingOutlineFlow.value) {
    const target = pendingOutlineFlow.value === 'ppt' ? 'PPT' : 'Word'
    return `告诉我要调整的地方，或输入「确认」开始生成${target}…`
  }
  if (pendingFile.value) {
    return '告诉 AI 你想怎么改样式，例如「标题黑体加粗、正文宋体、1.5 倍行距」…'
  }
  if (pptIntent.value) {
    return '描述你想要的 PPT 主题，例如「项目总结报告」、「产品介绍」…'
  }
  if (wordIntent.value) {
    return '描述你想要的 Word 文档主题，例如「2024 年度工作总结」、「产品需求文档」…'
  }
  if (activeFlow.value === 'doc') return '继续告诉 AI 你的需求…'
  if (activeFlow.value === 'ppt') return '继续描述你想要的 PPT…'
  if (activeFlow.value === 'word') return '继续描述你想要的文档…'
  return '输入消息，或点击 + 上传文档 / 生成 PPT / 生成 Word…'
})

const suggestions = computed(() => {
  if (pendingFile.value) {
    return [
      { text: '标题黑体加粗居中', action: 'text' },
      { text: '正文宋体 1.5 倍行距', action: 'text' },
      { text: '首行缩进 2 字符', action: 'text' },
      { text: '正式报告风格', action: 'text' },
    ]
  }
  if (pptIntent.value || activeFlow.value === 'ppt') {
    return [
      { text: '项目总结报告', action: 'text' },
      { text: '产品介绍演示', action: 'text' },
      { text: '技术分享', action: 'text' },
      { text: '季度复盘', action: 'text' },
    ]
  }
  if (wordIntent.value || activeFlow.value === 'word') {
    return [
      { text: '年度工作总结', action: 'text' },
      { text: '产品需求文档', action: 'text' },
      { text: '会议纪要', action: 'text' },
      { text: '技术方案', action: 'text' },
    ]
  }
  return [
    { text: '上传文档让我排版', action: 'doc' },
    { text: '生成项目总结 PPT', action: 'ppt' },
    { text: '生成工作总结 Word', action: 'word' },
    { text: '产品介绍演示', action: 'ppt' },
  ]
})

// ===== 方法 =====
function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str
}

function blockTypeLabel(type) {
  const map = {
    heading: '标题', paragraph: '段落', list: '列表', 'ordered-list': '有序列表',
    quote: '引用', code: '代码', table: '表格', image: '图片', divider: '分隔', toc: '目录',
  }
  return map[type] || type
}

function blockPreview(block) {
  if (block.type === 'heading') return `H${block.level || 1} · ${truncate(block.text || '', 30)}`
  if (block.type === 'paragraph') {
    if (Array.isArray(block.runs)) return truncate(block.runs.map(r => r.text || '').join(''), 40)
    return truncate(block.text || '', 40)
  }
  if (block.type === 'list' || block.type === 'ordered-list') return `${(block.items || []).length} 项`
  if (block.type === 'table') return `${(block.headers || []).length} 列 × ${(block.rows || []).length} 行`
  if (block.type === 'quote') return truncate(block.text || '', 30)
  if (block.type === 'code') return truncate(block.text || block.code || '', 30)
  if (block.type === 'divider') return '—— 分隔线 ——'
  if (block.type === 'image') return '图片'
  if (block.type === 'toc') return '目录域'
  return ''
}

function nowTime() {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function autoGrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function chooseDoc() {
  pptIntent.value = false
  wordIntent.value = false
  plusMenuOpen.value = false
  const which = hasConversation.value ? 'bottom' : 'hero'
  nextTick(() => triggerUpload(which))
}

function choosePPT() {
  pendingFile.value = null
  wordIntent.value = false
  pptIntent.value = true
  plusMenuOpen.value = false
  nextTick(() => {
    const ref = hasConversation.value ? bottomTextareaRef : heroTextareaRef
    ref.value?.focus()
  })
}

function chooseWord() {
  pendingFile.value = null
  pptIntent.value = false
  wordIntent.value = true
  plusMenuOpen.value = false
  nextTick(() => {
    const ref = hasConversation.value ? bottomTextareaRef : heroTextareaRef
    ref.value?.focus()
  })
}

function openPresetPicker() {
  plusMenuOpen.value = false
  showPresetPicker.value = true
}

function clearFile() {
  pendingFile.value = null
}

function onSuggestion(s) {
  if (s.action === 'doc') {
    chooseDoc()
  } else if (s.action === 'ppt') {
    pptIntent.value = true
    if (s.text) send(s.text)
  } else if (s.action === 'word') {
    wordIntent.value = true
    if (s.text) send(s.text)
  } else {
    send(s.text)
  }
}

function resetConversation() {
  messages.value = []
  text.value = ''
  pendingFile.value = null
  docData.value = null
  modifiedBlob.value = null
  previewHtml.value = ''
  historyItems.value = []
  error.value = ''
  pptIntent.value = false
  wordIntent.value = false
  plusMenuOpen.value = false
  activeFlow.value = null
  clearPendingOutline()
  lastPPTData.value = null
  lastWordData.value = null
}

function triggerUpload(which) {
  const ref = which === 'hero' ? heroFileInput : bottomFileInput
  ref.value?.click()
}

function onFileChange(e) {
  const file = e.target?.files?.[0]
  if (file) {
    if (!file.name.endsWith('.docx')) {
      error.value = '仅支持 .docx 格式文档'
      return
    }
    pendingFile.value = file
    error.value = ''
    // 自动触发解析
    handleFileUpload(file)
  }
  // 清空 input 以便重复选择同一文件
  if (heroFileInput.value) heroFileInput.value.value = ''
  if (bottomFileInput.value) bottomFileInput.value.value = ''
}

function addHistory(label, detail, type = 'style') {
  const now = new Date()
  historyItems.value.push({
    label,
    detail,
    time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
    type,
  })
}

async function updatePreview(blob) {
  previewLoading.value = true
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
    previewHtml.value = DOMPurify.sanitize(result.value)
  } catch (e) {
    previewHtml.value = `<p style="color:#d64545">预览渲染失败：${e.message}</p>`
  } finally {
    previewLoading.value = false
  }
}

async function rebuildAndPreview() {
  if (!docData.value) return
  const blob = await buildModifiedDocx(
    docData.value.zip,
    docData.value.stylesDoc,
    docData.value.documentDoc
  )
  modifiedBlob.value = blob
  await updatePreview(blob)
}

async function handleFileUpload(file) {
  if (!file) return
  isLoading.value = true
  loadingMessage.value = '正在解析文档...'
  error.value = ''
  modifiedBlob.value = null
  try {
    docData.value = await parseDocx(file)
    await rebuildAndPreview()
    addHistory('文档上传', `解析 ${docData.value.content.length} 段内容`, 'content')
    messages.value.push({
      role: 'assistant',
      content: `已读取「${docData.value.fileName}」，共 ${docData.value.content.length} 段、${docData.value.styles.styles.length} 种样式。想怎么调整？`,
      time: nowTime(),
      file: docData.value.fileName,
    })
    toastRef.value?.success('文档解析成功', `${docData.value.content.length} 段 · ${docData.value.styles.styles.length} 样式`)
  } catch (e) {
    error.value = `解析失败：${e.message}`
    docData.value = null
    pendingFile.value = null
    toastRef.value?.error('解析失败', e.message)
  } finally {
    isLoading.value = false
  }
}

async function send(presetText) {
  const content = (typeof presetText === 'string' ? presetText : text.value).trim()
  if (!content && !pendingFile.value) return
  if (aiLoading.value || isLoading.value) return

  // 大纲确认流程：优先分流，避免走文件/PPT/Word 默认路由
  if (pendingOutline.value && (pendingOutlineFlow.value === 'ppt' || pendingOutlineFlow.value === 'word')) {
    const userText = content
    if (!userText) return // 确认流程必须有文字反馈
    text.value = ''
    nextTick(() => {
      if (heroTextareaRef.value) heroTextareaRef.value.style.height = 'auto'
      if (bottomTextareaRef.value) bottomTextareaRef.value.style.height = 'auto'
    })
    messages.value.push({ role: 'user', content: userText, time: nowTime() })
    await scrollToBottom()

    if (isConfirmIntent(userText)) {
      if (pendingOutlineFlow.value === 'ppt') await confirmPPTOutline()
      else await confirmWordOutline()
    } else {
      if (pendingOutlineFlow.value === 'ppt') await revisePPTOutline(userText)
      else await reviseWordOutline(userText)
    }
    return
  }

  // 确定本次发送的流程：Word 意图 > PPT 意图 > 待解析文件 > 当前对话流
  let flow = null
  if (wordIntent.value) {
    flow = 'word'
  } else if (pptIntent.value) {
    flow = 'ppt'
  } else if (pendingFile.value) {
    flow = 'doc'
  } else {
    flow = activeFlow.value
  }

  // 有待解析文件时先解析
  if (flow === 'doc' && pendingFile.value && !docData.value) {
    await handleFileUpload(pendingFile.value)
  }

  text.value = ''
  // 重置 textarea 高度
  nextTick(() => {
    if (heroTextareaRef.value) heroTextareaRef.value.style.height = 'auto'
    if (bottomTextareaRef.value) bottomTextareaRef.value.style.height = 'auto'
  })

  const userText = content || (pendingFile.value && flow === 'doc' ? '帮我优化这份文档的排版' : '')
  if (userText) {
    messages.value.push({ role: 'user', content: userText, time: nowTime() })
    await scrollToBottom()
  }

  // 清除一次性意图
  pptIntent.value = false
  wordIntent.value = false

  if (flow === 'doc') {
    activeFlow.value = 'doc'
    await sendDoc(userText)
  } else if (flow === 'ppt') {
    activeFlow.value = 'ppt'
    await sendPPT(userText)
  } else if (flow === 'word') {
    activeFlow.value = 'word'
    await sendWord(userText)
  } else {
    messages.value.push({
      role: 'assistant',
      content: '点击左下角 + 按钮：上传 Word 文档让我排版、生成 PPT、或从零生成 Word 文档。',
      time: nowTime(),
    })
    await scrollToBottom()
  }
}

/**
 * 判断用户消息是否为确认意图
 */
function isConfirmIntent(text) {
  const t = text.trim().toLowerCase()
  if (!t) return false
  // 显式确认短语
  const explicit = ['确认', '确认生成', '开始生成', '可以生成', '没问题', '开始吧', '好的', '可以', '行', 'ok', 'go', 'yes', '确认开始', '就这样', '通过']
  if (explicit.some(k => t === k || t === k + '了' || t === k + '吧' || t === k + '啊')) return true
  if (explicit.some(k => t.includes(k))) return true
  // 短消息（≤6 字）且仅含肯定词
  if (t.length <= 6 && /^(确认|可以|好的|没问题|开始|行|ok|go|yes|就这样|通过|生成吧|开始生成|确认生成)/i.test(t)) return true
  return false
}

/**
 * 清空大纲确认流程状态
 */
function clearPendingOutline() {
  pendingOutline.value = null
  pendingOutlineTopic.value = ''
  pendingOutlineFlow.value = null
  pendingOutlineHistory.value = []
}

/**
 * 卡片「确认生成」按钮回调
 */
async function confirmOutlineFromCard() {
  if (!pendingOutline.value) return
  if (pendingOutlineFlow.value === 'ppt') await confirmPPTOutline()
  else if (pendingOutlineFlow.value === 'word') await confirmWordOutline()
}

/**
 * 大纲项类型中文标签
 */
function outlineTypeLabel(type) {
  const map = {
    cover: '封面', agenda: '目录', section: '章节', content: '内容',
    bullets: '要点', 'two-column': '对比', 'image-text': '图文',
    chart: '图表', table: '表格', timeline: '时间线', quote: '引用',
    end: '结尾',
    heading: '标题', paragraph: '段落', list: '列表', 'ordered-list': '有序列表',
    code: '代码', image: '图片', divider: '分隔', toc: '目录',
  }
  return map[type] || type
}

async function sendDoc(content) {
  if (!docData.value) {
    messages.value.push({
      role: 'assistant',
      content: '请先上传一份 .docx 文档，我才能帮你调整样式。',
      time: nowTime(),
    })
    return
  }
  try {
    const result = await chat(
      content,
      messages.value,
      docData.value.styles.styles,
      docData.value.content
    )
    const reply = result.reply || '已处理。'
    const operations = result.operations || []
    messages.value.push({
      role: 'assistant',
      content: reply,
      operations,
      time: nowTime(),
    })

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
      addHistory('样式修改', `已修改 ${operations.length} 项样式`, 'style')
      toastRef.value?.success('样式已更新', `共 ${operations.length} 项修改`)
    }
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      content: `出错：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('操作失败', e.message)
  }
  await scrollToBottom()
}

async function sendPPT(content) {
  aiLoading.value = true

  // 初始化任务面板
  initTaskFlow('ppt', content)

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你生成PPT大纲',
    time: nowTime(),
  })

  try {
    // 第一阶段：生成大纲，等待用户确认后再进入详情生成
    const outlineData = await generatePPTOutline(content, '', handleProgress)
    pendingOutline.value = outlineData
    pendingOutlineTopic.value = content
    pendingOutlineFlow.value = 'ppt'
    pendingOutlineHistory.value = []

    // 大纲完成，进入确认阶段
    nextTask('outline')
    updateTask('confirm', 'doing', `共 ${outlineData.outline.length} 个章节，等待你确认`)

    // 移除进度卡片，替换为大纲卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({
      role: 'assistant',
      content: `已为「${content}」生成大纲，共 ${outlineData.outline.length} 个章节。请查看以下大纲，告诉我需要调整的地方，或确认开始生成 PPT。`,
      outline: outlineData,
      outlineFlow: 'ppt',
      time: nowTime(),
    })
    toastRef.value?.success('大纲已生成', `${outlineData.outline.length} 个章节 · 等待确认`)
  } catch (e) {
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('outline', 'error', e.message)
    messages.value.push({
      role: 'assistant',
      content: `大纲生成失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('大纲生成失败', e.message)
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

/**
 * 用户确认 PPT 大纲 → 进入详情生成（第二阶段）
 */
async function confirmPPTOutline() {
  if (!pendingOutline.value) return
  aiLoading.value = true

  // 确认阶段完成，进入详情生成阶段
  nextTask('confirm')

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你输出PPT',
    time: nowTime(),
  })

  try {
    const data = await generatePPTStructure(pendingOutlineTopic.value, '', pendingOutline.value, handleProgress)
    lastPPTData.value = data

    // 详情生成完成
    nextTask('detail')
    updateTask('detail', 'done', `已生成 ${data.slides.length} 张幻灯片`)

    // 移除进度卡片，替换为结果卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({
      role: 'assistant',
      content: `已为你生成完整 PPT「${data.title}」，共 ${data.slides.length} 张幻灯片，样式集「${currentPresetName.value}」。可以下载查看，或告诉我要调整的地方。`,
      ppt: data,
      time: nowTime(),
    })
    clearPendingOutline()
    toastRef.value?.success('PPT 生成成功', `${data.slides.length} 张幻灯片 · ${currentPresetName.value}`)
  } catch (e) {
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('detail', 'error', e.message)
    messages.value.push({
      role: 'assistant',
      content: `生成失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('PPT 生成失败', e.message)
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

/**
 * 基于用户反馈重新生成 PPT 大纲
 */
async function revisePPTOutline(feedback) {
  aiLoading.value = true

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你调整PPT大纲',
    time: nowTime(),
  })

  try {
    pendingOutlineHistory.value.push(feedback)
    const context = `用户累积修改意见：${pendingOutlineHistory.value.join('；')}`
    const outlineData = await generatePPTOutline(pendingOutlineTopic.value, context, handleProgress)
    pendingOutline.value = outlineData

    // 移除进度卡片，替换为大纲卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({
      role: 'assistant',
      content: `已根据你的反馈调整大纲，现在共 ${outlineData.outline.length} 个章节。继续告诉我需要修改的地方，或确认开始生成。`,
      outline: outlineData,
      outlineFlow: 'ppt',
      time: nowTime(),
    })
    toastRef.value?.success('大纲已更新', `${outlineData.outline.length} 个章节`)
  } catch (e) {
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    messages.value.push({
      role: 'assistant',
      content: `大纲更新失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('大纲更新失败', e.message)
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

async function sendWord(content) {
  aiLoading.value = true

  // 初始化任务面板
  initTaskFlow('word', content)

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你生成Word大纲',
    time: nowTime(),
  })

  try {
    // 第一阶段：生成大纲，等待用户确认后再进入详情生成
    const outlineData = await generateWordOutline(content, '', handleProgress)
    pendingOutline.value = outlineData
    pendingOutlineTopic.value = content
    pendingOutlineFlow.value = 'word'
    pendingOutlineHistory.value = []

    // 大纲完成，进入确认阶段
    nextTask('outline')
    updateTask('confirm', 'doing', `共 ${outlineData.outline.length} 个章节，等待你确认`)

    // 移除进度卡片，替换为大纲卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({
      role: 'assistant',
      content: `已为「${content}」生成文档大纲，共 ${outlineData.outline.length} 个章节。请查看以下大纲，告诉我需要调整的地方，或确认开始生成 Word。`,
      outline: outlineData,
      outlineFlow: 'word',
      time: nowTime(),
    })
    toastRef.value?.success('大纲已生成', `${outlineData.outline.length} 个章节 · 等待确认`)
  } catch (e) {
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('outline', 'error', e.message)
    messages.value.push({
      role: 'assistant',
      content: `大纲生成失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('大纲生成失败', e.message)
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

/**
 * 用户确认 Word 大纲 → 进入详情生成（第二阶段）
 */
async function confirmWordOutline() {
  if (!pendingOutline.value) return
  aiLoading.value = true

  // 确认阶段完成，进入详情生成阶段
  nextTask('confirm')

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你输出Word文档',
    time: nowTime(),
  })

  try {
    const data = await generateWordDoc(pendingOutlineTopic.value, '', pendingOutline.value, handleProgress)
    lastWordData.value = data
    const blockCount = (data.blocks || []).length

    // 详情生成完成
    nextTask('detail')
    updateTask('detail', 'done', `已生成 ${blockCount} 个内容块`)

    // 移除进度卡片，替换为结果卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({
      role: 'assistant',
      content: `已为你生成完整 Word 文档「${data.title}」，共 ${blockCount} 个内容块，样式集「${currentPresetName.value}」。可以下载查看，或告诉我要调整的地方。`,
      word: data,
      time: nowTime(),
    })
    clearPendingOutline()
    toastRef.value?.success('Word 生成成功', `${blockCount} 个内容块 · ${currentPresetName.value}`)
  } catch (e) {
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('detail', 'error', e.message)
    messages.value.push({
      role: 'assistant',
      content: `生成失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('Word 生成失败', e.message)
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

/**
 * 基于用户反馈重新生成 Word 大纲
 */
async function reviseWordOutline(feedback) {
  aiLoading.value = true

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你调整Word大纲',
    time: nowTime(),
  })

  try {
    pendingOutlineHistory.value.push(feedback)
    const context = `用户累积修改意见：${pendingOutlineHistory.value.join('；')}`
    const outlineData = await generateWordOutline(pendingOutlineTopic.value, context, handleProgress)
    pendingOutline.value = outlineData

    // 移除进度卡片，替换为大纲卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({
      role: 'assistant',
      content: `已根据你的反馈调整大纲，现在共 ${outlineData.outline.length} 个章节。继续告诉我需要修改的地方，或确认开始生成。`,
      outline: outlineData,
      outlineFlow: 'word',
      time: nowTime(),
    })
    toastRef.value?.success('大纲已更新', `${outlineData.outline.length} 个章节`)
  } catch (e) {
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    messages.value.push({
      role: 'assistant',
      content: `大纲更新失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('大纲更新失败', e.message)
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

async function downloadPPT(pptData) {
  if (!pptData) return
  try {
    const fileName = `${(pptData.title || 'AI生成').replace(/\s+/g, '_')}.pptx`
    await buildPPTFile(pptData, selectedPresetId.value, fileName)
    toastRef.value?.success('下载成功', fileName)
  } catch (e) {
    error.value = `下载失败：${e.message}`
    toastRef.value?.error('下载失败', e.message)
  }
}

async function downloadWord(wordData) {
  if (!wordData) return
  try {
    const fileName = `${(wordData.title || 'AI生成').replace(/\s+/g, '_')}.docx`
    await buildWordFile(wordData, selectedPresetId.value, fileName)
    toastRef.value?.success('下载成功', fileName)
  } catch (e) {
    error.value = `下载失败：${e.message}`
    toastRef.value?.error('下载失败', e.message)
  }
}

async function scrollToBottom() {
  await nextTick()
  if (threadRef.value) {
    threadRef.value.scrollTop = threadRef.value.scrollHeight
  }
}

function onContextAction({ action }) {
  if (!docData.value) return
  const actionMap = {
    'copy-format': '复制当前段落的格式信息',
    'paste-format': '将之前复制的格式应用到当前段落',
    'set-heading': '将当前段落设为标题样式',
    'set-bold': '将当前段落设为加粗',
    'ai-suggest': '对当前段落给出排版建议',
  }
  const t = actionMap[action] || action
  send(t)
}

function refreshTemplates() {
  templates.value = getAllTemplates()
}

async function handleTemplateSelect(tpl) {
  if (!docData.value) return
  const content = `应用模板「${tpl.name}」到当前文档`
  messages.value.push({ role: 'user', content, time: nowTime() })
  await scrollToBottom()
  try {
    const result = await chat(
      content,
      messages.value,
      docData.value.styles.styles,
      docData.value.content
    )
    const operations = result.operations || []
    messages.value.push({
      role: 'assistant',
      content: result.reply || `已应用「${tpl.name}」`,
      operations,
      time: nowTime(),
    })
    if (operations.length > 0) {
      const newStylesDoc = docData.value.stylesDoc.cloneNode(true)
      applyOperations(newStylesDoc, operations)
      docData.value.stylesDoc = newStylesDoc
      docData.value.styles = reparseStylesFromDoc(newStylesDoc)
      await rebuildAndPreview()
      activeTemplateId.value = tpl.id
      error.value = ''
      addHistory('模板应用', `应用「${tpl.name}」`, 'template')
      toastRef.value?.success('模板已应用', tpl.name)
    }
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      content: `模板应用失败：${e.message}`,
      time: nowTime(),
    })
    toastRef.value?.error('模板应用失败', e.message)
  }
  await scrollToBottom()
}

function saveCurrentAsTemplate(name) {
  if (!docData.value || !modifiedBlob.value) return
  const ops = []
  for (const st of docData.value.styles.styles) {
    const op = { target: st.styleId }
    if (st.font) op.font = st.font.ascii || st.font.eastAsia
    if (st.size) op.size = st.size
    if (st.bold) op.bold = true
    if (st.italic) op.italic = true
    if (st.underline) op.underline = true
    if (st.strikethrough) op.strikethrough = true
    if (st.color) op.color = st.color
    if (st.shading) op.shading = st.shading
    if (st.align) op.align = st.align
    if (st.spacing?.line) op.line = st.spacing.line
    if (st.spacing?.before) op.before = st.spacing.before
    if (st.spacing?.after) op.after = st.spacing.after
    if (st.indent?.firstLine) op.firstLine = st.indent.firstLine
    if (Object.keys(op).length > 1) ops.push(op)
  }
  saveTemplate(name, `从 ${docData.value.fileName} 保存`, ops)
  refreshTemplates()
  addHistory('保存模板', `保存「${name}」`, 'template')
  toastRef.value?.success('模板已保存', name)
}

function downloadModified() {
  if (!modifiedBlob.value) return
  const url = URL.createObjectURL(modifiedBlob.value)
  const a = document.createElement('a')
  a.href = url
  a.download = `modified_${docData.value?.fileName || 'doc.docx'}`
  a.click()
  URL.revokeObjectURL(url)
  toastRef.value?.success('下载成功', docData.value?.fileName || '文档')
}

function onHistoryRestore(index) {
  toastRef.value?.info('历史回滚', `已定位到第 ${index + 1} 步操作（完整回滚功能开发中）`)
  addHistory('回滚操作', `尝试回滚到步骤 ${index + 1}`, 'undo')
}

function onDocClick(e) {
  if (plusMenuOpen.value && !e.target.closest('.plus-wrap')) {
    plusMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  // 引入 Claude 字体
  if (!document.getElementById('claude-fonts')) {
    const link = document.createElement('link')
    link.id = 'claude-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Newsreader:ital,opsz,wght@0,18..72,300;0,18..72,400;0,18..72,500;1,18..72,400&display=swap'
    document.head.appendChild(link)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<style scoped>
/* ===== 页面骨架 ===== */
.lab-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  /* 留出全局固定导航栏（#unified-nav-container, 72px）的空间，避免遮挡 */
  padding-top: 72px;
  box-sizing: border-box;
}

/* ===== 任务面板 ===== */
.task-panel {
  position: fixed;
  top: 72px;
  right: 0;
  width: 300px;
  height: calc(100dvh - 72px);
  background: var(--popover);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  z-index: 50;
  overflow: hidden;
}
.task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 5);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--brand-50) 30%, var(--popover));
}
.task-panel-title {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}
.task-panel-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
  transition: all 0.15s ease;
}
.task-panel-close:hover {
  background: var(--card);
  color: var(--foreground);
}
.task-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
}
.task-item {
  display: flex;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3);
  border-radius: var(--radius-lg);
  background: var(--card);
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}
.task-item.task-done {
  background: color-mix(in srgb, var(--success) 8%, var(--card));
  border-color: color-mix(in srgb, var(--success) 25%, var(--border));
}
.task-item.task-doing {
  background: color-mix(in srgb, var(--primary) 8%, var(--card));
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
}
.task-item.task-error {
  background: color-mix(in srgb, var(--destructive) 8%, var(--card));
  border-color: color-mix(in srgb, var(--destructive) 30%, var(--border));
}
.task-item.task-pending {
  opacity: 0.55;
}
.task-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
.task-done .task-icon {
  background: var(--success);
  color: white;
}
.task-error .task-icon {
  background: var(--destructive);
  color: white;
}
.task-doing .task-icon {
  background: transparent;
}
.task-pending .task-icon {
  background: var(--muted);
  color: var(--muted-foreground);
}
.task-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid color-mix(in srgb, var(--primary) 25%, transparent);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: taskSpin 0.8s linear infinite;
}
@keyframes taskSpin {
  to { transform: rotate(360deg); }
}
.task-content {
  flex: 1;
  min-width: 0;
}
.task-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.4;
}
.task-desc {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
  line-height: 1.4;
}
.task-panel-footer {
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 5);
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--muted) 30%, var(--popover));
}
.task-flow-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

/* 任务面板滑入动画 */
.task-panel-enter-active,
.task-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.task-panel-enter-from,
.task-panel-leave-to {
  transform: translateX(100%);
}

/* ===== 顶栏 ===== */
.lab-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
  padding: calc(var(--spacing) * 5) calc(var(--spacing) * 8);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--background) 88%, transparent);
  backdrop-filter: blur(10px);
  position: sticky;
  /* 粘住时停在全局固定导航栏（72px）下方，避免被遮挡 */
  top: 72px;
  z-index: 10;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  min-width: 0;
}
.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}
.brand-text {
  min-width: 0;
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 17px;
  letter-spacing: -0.01em;
  color: var(--foreground);
  line-height: 1.2;
}
.brand-sub {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--muted-foreground);
  letter-spacing: 0.02em;
  margin-top: 2px;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  flex-wrap: wrap;
}

/* ===== + 菜单 ===== */
.plus-wrap {
  position: relative;
}
.plus-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  cursor: pointer;
  transition: all 0.16s ease;
  flex-shrink: 0;
}
.plus-btn:hover,
.plus-btn.active {
  background: var(--brand-50);
  border-color: var(--brand-200);
  color: var(--brand-700);
}
.plus-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 200px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 20;
}
.plus-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.16s ease;
}
.plus-item:hover {
  background: var(--brand-50);
  color: var(--brand-700);
}
.popover-enter-active, .popover-leave-active {
  transition: all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
  transform-origin: bottom left;
}
.popover-enter-from, .popover-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}

/* ===== 附件标签 ===== */
.composer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
  padding: 0 calc(var(--spacing) * 4) calc(var(--spacing) * 1);
}
.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 10px;
  background: var(--brand-50);
  border: 1px solid var(--brand-200);
  border-radius: var(--radius-full);
  color: var(--brand-700);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  max-width: 260px;
}
.ppt-chip {
  background: color-mix(in srgb, var(--primary) 10%, var(--card));
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
  color: var(--primary);
}
.word-chip {
  background: color-mix(in srgb, #2563eb 10%, var(--card));
  border-color: color-mix(in srgb, #2563eb 30%, var(--border));
  color: #2563eb;
}
.chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  border-radius: var(--radius-full);
  opacity: 0.6;
  transition: all 0.16s ease;
  flex-shrink: 0;
}
.chip-remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
}

/* ===== 图标按钮 ===== */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--popover);
  color: var(--foreground);
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: var(--shadow-2xs);
}
.icon-btn:hover {
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

/* ===== 内容区 ===== */
.lab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ===== 空状态 ===== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 12) calc(var(--spacing) * 6) calc(var(--spacing) * 10);
  gap: calc(var(--spacing) * 8);
}
.empty-hero {
  text-align: center;
  max-width: 640px;
}
.hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-xl);
  background: var(--brand-50);
  color: var(--primary);
  margin-bottom: calc(var(--spacing) * 5);
  box-shadow: var(--shadow-2xs);
}
.hero-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.1;
  letter-spacing: -0.015em;
  color: var(--foreground);
  text-wrap: balance;
}
.hero-subtitle {
  margin: calc(var(--spacing) * 4) 0 0;
  font-family: var(--font-serif);
  font-size: 16px;
  line-height: 1.6;
  color: var(--muted-foreground);
  max-width: 520px;
  margin-left: auto;
  margin-right: auto;
}

/* ===== 对话框（Composer） ===== */
.composer {
  width: min(100%, 720px);
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  /* overflow: visible，让 + 菜单（向上弹出）不被裁剪 */
  overflow: visible;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.composer:focus-within {
  border-color: var(--ring);
  box-shadow: var(--shadow-md), 0 0 0 3px rgba(201, 100, 66, 0.08);
}
.composer-input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 5) calc(var(--spacing) * 2);
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 1.6;
  color: var(--foreground);
  min-height: 56px;
  box-sizing: border-box;
}
.composer-input::placeholder {
  color: var(--muted-foreground);
}
.composer-input:disabled {
  opacity: 0.5;
}
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3) calc(var(--spacing) * 3);
}
.composer-left {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  min-width: 0;
  flex: 1;
}
.composer-send {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 38px;
}
.composer-send:hover:not(:disabled) {
  background: var(--brand-600);
  box-shadow: var(--shadow-md);
}
.composer-send:active:not(:disabled) {
  background: var(--brand-700);
}
.composer-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

/* ===== 建议提示 ===== */
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2.5);
  justify-content: center;
  max-width: 720px;
}
.suggestion-chip {
  padding: 9px 18px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: var(--shadow-2xs);
}
.suggestion-chip:hover {
  background: var(--brand-50);
  border-color: var(--brand-200);
  color: var(--brand-700);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

/* ===== 加载状态 ===== */
.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 12);
}
.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 4);
  padding: calc(var(--spacing) * 12) calc(var(--spacing) * 10);
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-sm);
}
.loading-text {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--muted-foreground);
  font-weight: 500;
}

/* ===== 对话区 ===== */
.conversation {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
  padding: calc(var(--spacing) * 6) calc(var(--spacing) * 6) 0;
  box-sizing: border-box;
}
.thread {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 2) calc(var(--spacing) * 6);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
}
.thread::-webkit-scrollbar {
  width: 6px;
}
.thread::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

/* ===== 消息气泡（Claude 风格） ===== */
.message {
  display: flex;
  gap: calc(var(--spacing) * 3);
  max-width: 100%;
}
.message.user {
  flex-direction: row-reverse;
}
.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--primary-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}
.message-body {
  min-width: 0;
  max-width: calc(100% - 44px);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
}
.message.user .message-body {
  align-items: flex-end;
}
.message-meta {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-family: var(--font-sans);
  font-size: 11px;
}
.message.user .message-meta {
  flex-direction: row-reverse;
}
.meta-name {
  font-weight: 600;
  color: var(--foreground);
}
.meta-time {
  color: var(--muted-foreground);
}
.message-content {
  padding: calc(var(--spacing) * 3.5) calc(var(--spacing) * 4);
  border-radius: calc(var(--radius) + 2px);
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 1.6;
  color: var(--foreground);
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: var(--shadow-xs);
  max-width: 100%;
}
.message.user .message-content {
  background: var(--primary);
  color: var(--primary-foreground);
  border-bottom-right-radius: var(--radius-sm);
}
.message.assistant .message-content {
  background: var(--popover);
  border: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
}
.message-attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--foreground);
  font-weight: 500;
  width: fit-content;
}
.message.user .message-attachment {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--primary-foreground);
}
.message-ops {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  background: var(--brand-50);
  border: 1px solid var(--brand-200);
  border-radius: var(--radius-full);
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--brand-700);
  font-weight: 500;
  width: fit-content;
}
.ops-view {
  background: transparent;
  border: none;
  color: var(--brand-700);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
.ops-view:hover {
  color: var(--brand-800);
}

/* ===== PPT 结果卡片 ===== */
.ppt-result-card {
  width: 100%;
  max-width: 520px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, var(--radius-xl));
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.ppt-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 4) calc(var(--spacing) * 3);
  border-bottom: 1px solid var(--border);
}
.ppt-result-title {
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.3;
}
.ppt-result-meta {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
}
.ppt-download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
  flex-shrink: 0;
}
.ppt-download-btn:hover {
  background: var(--brand-600);
}
.ppt-slide-previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4) calc(var(--spacing) * 4);
}
.ppt-slide-mini {
  padding: calc(var(--spacing) * 2.5);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  position: relative;
  min-height: 70px;
}
.slide-mini-num {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 10px;
  color: var(--muted-foreground);
  font-weight: 600;
}
.slide-mini-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.3;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.slide-mini-points {
  font-size: 10px;
  color: var(--muted-foreground);
}
.slide-title .slide-mini-title {
  color: var(--primary);
}
.slide-end .slide-mini-title {
  color: var(--muted-foreground);
}

/* ===== Word 内容块预览 ===== */
.word-block-previews {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4) calc(var(--spacing) * 4);
}
.word-block-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 11px;
}
.block-type-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  background: var(--brand-50);
  border: 1px solid var(--brand-200);
  border-radius: var(--radius-sm);
  color: var(--brand-700);
  font-size: 9px;
  font-weight: 600;
}
.block-heading .block-type-tag {
  background: color-mix(in srgb, var(--primary) 10%, var(--card));
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
  color: var(--primary);
}
.block-text {
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* ===== 进度卡片 ===== */
.progress-card {
  width: 100%;
  max-width: 480px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, var(--radius-xl));
  padding: calc(var(--spacing) * 4);
  box-shadow: var(--shadow-sm);
}
.progress-card-head {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  margin-bottom: calc(var(--spacing) * 3);
}
.progress-icon {
  flex-shrink: 0;
}
.progress-info {
  flex: 1;
  min-width: 0;
}
.progress-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.3;
}
.progress-text {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--muted-foreground);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-bar-container {
  width: 100%;
  height: 8px;
  background: color-mix(in srgb, var(--primary) 15%, var(--background));
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: calc(var(--spacing) * 2);
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 80%, var(--accent)));
  border-radius: var(--radius);
  transition: width 0.3s ease-out;
}
.progress-percent {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted-foreground);
  text-align: right;
}

/* ===== 大纲确认卡片 ===== */
.outline-card {
  width: 100%;
  max-width: 560px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, var(--radius-xl));
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.outline-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 4) calc(var(--spacing) * 3);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--brand-50) 35%, var(--popover));
}
.outline-card-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.3;
}
.outline-card-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
  flex-shrink: 0;
}
.outline-card-tag {
  padding: 2px 8px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.outline-items {
  display: flex;
  flex-direction: column;
  padding: calc(var(--spacing) * 2);
  gap: 2px;
}
.outline-item {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2.5);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border-radius: var(--radius-sm);
  transition: background 0.16s ease;
}
.outline-item:hover {
  background: var(--brand-50);
}
.outline-item-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--card);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-700);
  margin-top: 1px;
}
.outline-type-cover .outline-item-num,
.outline-type-end .outline-item-num {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: transparent;
}
.outline-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.outline-item-title {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.4;
}
.outline-item-summary {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.outline-item-type-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 500;
  color: var(--muted-foreground);
  margin-top: 2px;
}
.outline-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4) calc(var(--spacing) * 4);
  border-top: 1px dashed var(--border);
  background: color-mix(in srgb, var(--brand-50) 15%, transparent);
  flex-wrap: wrap;
}
.outline-confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 38px;
}
.outline-confirm-btn:hover:not(:disabled) {
  background: var(--brand-600);
  box-shadow: var(--shadow-md);
}
.outline-confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.outline-hint {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
}

/* ===== 样式集选择模态框 ===== */
.preset-mask {
  position: fixed;
  inset: 0;
  background: rgba(61, 57, 41, 0.45);
  backdrop-filter: blur(3px);
  z-index: 200;
}
.preset-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(720px, 92vw);
  max-height: 86vh;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  z-index: 201;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.preset-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--spacing) * 5) calc(var(--spacing) * 6) calc(var(--spacing) * 4);
  border-bottom: 1px solid var(--border);
}
.preset-modal-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 20px;
  color: var(--foreground);
}
.preset-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--popover);
  color: var(--foreground);
  cursor: pointer;
  transition: all 0.16s ease;
}
.preset-modal-close:hover {
  background: var(--card);
}
.preset-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing) * 5) calc(var(--spacing) * 6);
}
.preset-modal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 6);
  border-top: 1px solid var(--border);
  background: var(--popover);
}
.preset-current {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
}
.preset-confirm-btn {
  padding: 8px 22px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}
.preset-confirm-btn:hover {
  background: var(--brand-600);
}
.modal-enter-active, .modal-leave-active {
  transition: all 0.24s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.96);
}

/* ===== 思考动画 ===== */
.thinking {
  display: inline-flex;
  align-items: center;
  padding: calc(var(--spacing) * 3.5) calc(var(--spacing) * 4);
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  border-bottom-left-radius: var(--radius-sm);
  box-shadow: var(--shadow-xs);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--primary);
  animation: thinkingBreath 1.45s ease-in-out infinite;
}
@keyframes thinkingBreath {
  0%, 100% { opacity: 0.4; transform: scale(0.72); }
  50% { opacity: 1; transform: scale(1.22); }
}

/* ===== 底部对话框 ===== */
.composer-bottom {
  position: sticky;
  bottom: 0;
  margin: calc(var(--spacing) * 3) 0 0;
  background: color-mix(in srgb, var(--popover) 92%, transparent);
  backdrop-filter: blur(8px);
}

/* ===== 错误提示 ===== */
.error-toast {
  position: fixed;
  bottom: calc(var(--spacing) * 6);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  background: var(--error);
  color: #fff;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  z-index: 50;
  max-width: 90vw;
}
.error-text {
  flex: 1;
}
.error-close {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.16s ease;
}
.error-close:hover {
  background: rgba(255, 255, 255, 0.3);
}
.toast-enter-active, .toast-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* ===== 抽屉 ===== */
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(61, 57, 41, 0.35);
  backdrop-filter: blur(2px);
  z-index: 100;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: min(420px, 92vw);
  height: 100dvh;
  background: var(--background);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-2xl);
  z-index: 101;
  display: flex;
  flex-direction: column;
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--spacing) * 5) calc(var(--spacing) * 5) calc(var(--spacing) * 4);
  border-bottom: 1px solid var(--border);
}
.drawer-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 20px;
  color: var(--foreground);
}
.drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--popover);
  color: var(--foreground);
  cursor: pointer;
  transition: all 0.16s ease;
}
.drawer-close:hover {
  background: var(--card);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4) calc(var(--spacing) * 6);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
}
.drawer-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--popover);
}
.drawer-section-head {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  width: 100%;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  text-align: left;
  transition: background 0.16s ease;
}
.drawer-section-head:hover {
  background: var(--card);
}
.drawer-section-head span {
  flex: 1;
}
.drawer-count {
  flex: 0 0 auto !important;
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--card);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
}
.drawer-chevron {
  transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  color: var(--muted-foreground);
}
.drawer-section-head.open .drawer-chevron {
  transform: rotate(180deg);
}
.drawer-section-body {
  padding: 0 calc(var(--spacing) * 4) calc(var(--spacing) * 4);
  border-top: 1px solid var(--border);
}
.drawer-enter-active, .drawer-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.drawer-enter-from, .drawer-leave-to {
  transform: translateX(100%);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .lab-topbar {
    padding: calc(var(--spacing) * 4) calc(var(--spacing) * 4);
    gap: calc(var(--spacing) * 3);
  }
  .brand-text {
    display: none;
  }
  .empty-state {
    padding: calc(var(--spacing) * 8) calc(var(--spacing) * 4) calc(var(--spacing) * 8);
  }
  .conversation {
    padding: calc(var(--spacing) * 4) calc(var(--spacing) * 3) 0;
  }
  .message-body {
    max-width: calc(100% - 40px);
  }
  .ppt-slide-previews {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  }
}
</style>

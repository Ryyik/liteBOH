<template>
  <Teleport to="body">
    <Transition name="settings-slide">
      <div v-if="modelValue" class="ai-settings-backdrop" role="presentation"
        @click.self="close" @keydown.escape="close"
        @keydown.tab.prevent="handleTabTrap">
        <section ref="drawerRef" class="ai-settings-drawer" role="dialog" aria-modal="true" aria-label="BOH AI 设置">
          <header class="ai-settings-header">
            <h2 tabindex="-1" ref="titleRef">设置</h2>
            <button ref="closeBtnRef" type="button" class="ai-settings-close-btn" title="关闭 (Esc)" @click="close">
              <X size="18" />
            </button>
          </header>

          <div class="ai-settings-body custom-scrollbar">
            <div class="ai-settings-card">
              <div class="ai-settings-group-title">模型与风格</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row" :class="{ expanded: showModePicker }"
                  @click="showModePicker = !showModePicker">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-blue">
                      <Settings size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">默认模式</span>
                      <span class="ai-settings-desc">{{ currentMode.name }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron" :class="{ expanded: showModePicker }">›</span>
                  </div>
                </div>
                <div v-if="showModePicker" class="ai-settings-inline-options">
                  <button v-for="mode in chatModes" :key="mode.id" type="button"
                    :class="['ai-settings-inline-option', { active: currentModeId === mode.id }]"
                    @click.stop="$emit('selectMode', mode.id); showModePicker = false">
                    <span class="ai-settings-option-main">
                      <strong>{{ mode.name }}</strong>
                      <small>{{ mode.tagline || mode.description }}</small>
                    </span>
                    <Check v-if="currentModeId === mode.id" size="16" />
                  </button>
                </div>

                <div class="ai-settings-row" :class="{ expanded: showStylePicker }"
                  @click="showStylePicker = !showStylePicker">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-purple">
                      <span style="font-size:12px;font-weight:800;">Aa</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">回答风格</span>
                      <span class="ai-settings-desc">{{ currentResponseStyleName }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron" :class="{ expanded: showStylePicker }">›</span>
                  </div>
                </div>
                <div v-if="showStylePicker" class="ai-settings-inline-options">
                  <button v-for="style in responseStyleOptions" :key="style.id" type="button"
                    :class="['ai-settings-inline-option', { active: currentResponseStyleId === style.id }]"
                    @click.stop="$emit('selectResponseStyle', style.id); showStylePicker = false">
                    <span class="ai-settings-option-main">
                      <strong>{{ style.shortName || style.name }}</strong>
                      <small>{{ style.description || style.name }}</small>
                    </span>
                    <Check v-if="currentResponseStyleId === style.id" size="16" />
                  </button>
                </div>

                <div class="ai-settings-row" :class="{ expanded: showThinkingSpeedPicker }"
                  @click="showThinkingSpeedPicker = !showThinkingSpeedPicker">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-purple">
                      <span style="font-size:12px;font-weight:800;">⚡</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">思考速度</span>
                      <span class="ai-settings-desc">{{ currentThinkingSpeedName }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron" :class="{ expanded: showThinkingSpeedPicker }">›</span>
                  </div>
                </div>
                <div v-if="showThinkingSpeedPicker" class="ai-settings-inline-options">
                  <button v-for="level in thinkingSpeedOptions" :key="level.id" type="button"
                    :class="['ai-settings-inline-option', { active: currentThinkingSpeedId === level.id }]"
                    @click.stop="$emit('selectThinkingSpeed', level.id); showThinkingSpeedPicker = false">
                    <span class="ai-settings-option-main">
                      <strong>{{ level.name }}</strong>
                      <small>{{ level.description }}</small>
                    </span>
                    <Check v-if="currentThinkingSpeedId === level.id" size="16" />
                  </button>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">检索</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable" @click="$emit('update:isSearching', !isSearching)">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-green">
                      <Globe size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">联网搜索</span>
                      <span class="ai-settings-desc">获取实时信息</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span :class="['ai-settings-switch', { enabled: isSearching }]"></span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">记忆</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable"
                  @click="$emit('update:isTreeholeMemoryEnabled', !isTreeholeMemoryEnabled)">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-indigo">
                      <span style="font-size:11px;font-weight:800;">C+</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">Cloud+ 引用</span>
                      <span class="ai-settings-desc">引用树洞与日记内容</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span :class="['ai-settings-switch', { enabled: isTreeholeMemoryEnabled }]"></span>
                  </div>
                </div>
                <div class="ai-settings-row clickable"
                  @click="$emit('update:isSharedMemoryEnabled', !isSharedMemoryEnabled)">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-purple">
                      <span style="font-size:11px;font-weight:800;">M</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">公共记忆库</span>
                      <span class="ai-settings-desc">查询社区公共记忆</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span :class="['ai-settings-switch', { enabled: isSharedMemoryEnabled }]"></span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">上下文</div>
              <div class="ai-settings-meter-row">
                <div class="ai-settings-meter-info">
                  <strong>上下文使用率</strong>
                  <small>{{ contextBudgetPercentText }} · {{ contextBudgetUsage?.totalMessageCount || 0 }} 条消息</small>
                </div>
                <div class="ai-settings-meter-track">
                  <div class="ai-settings-meter-fill" :style="{ width: contextBudgetPercentText }" />
                </div>
                <div class="ai-settings-context-details">
                  <div class="ai-settings-context-detail-row">
                    <span>总预算</span>
                    <strong>{{ formatBudgetTotal }}</strong>
                  </div>
                  <div class="ai-settings-context-detail-row">
                    <span>已使用</span>
                    <strong>{{ formatBudgetUsed }} ({{ contextBudgetPercentText }})</strong>
                  </div>
                  <div class="ai-settings-context-detail-row">
                    <span>预估 tokens</span>
                    <strong>≈ {{ estimatedTokens }}</strong>
                  </div>
                  <div class="ai-settings-context-detail-row">
                    <span>压缩状态</span>
                    <strong class="context-status" :class="compressionStatusClass">{{ compressionStatusText }}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">使用额度</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable" @click="$emit('openQuotaPanel')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-orange">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">AI 使用额度</span>
                      <span class="ai-settings-desc">查看今日额度使用情况</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron">›</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">数据</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable" @click="$emit('clearCurrentChat')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-gray">
                      <Trash2 size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">清除当前对话</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron">›</span>
                  </div>
                </div>
                <div class="ai-settings-row clickable" @click="$emit('exportChatData')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-indigo">
                      <span style="font-size:11px;font-weight:800;">JSON</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">导出对话数据</span>
                      <span class="ai-settings-desc">下载 JSON 格式的全部对话记录</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron">›</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-card danger-card">
              <div class="ai-settings-group-title">危险操作</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable danger" @click="$emit('clearAllChatData')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-red">
                      <Trash2 size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label text-danger">清除所有对话</span>
                      <span class="ai-settings-desc">删除全部对话历史，不可撤销</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron text-danger">›</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-footer">
              <strong>BOH AI v2.5 Beta</strong>
              <span>上下文窗口 {{ formatMaxChars }} · 输出上限 {{ formatMaxOutput }}</span>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { X, Settings, Globe, Check, Trash2 } from 'lucide-vue-next';
import { MAX_HISTORY_CONTEXT_CHARS, MAX_FINAL_PROMPT_CHARS, GENERATION_PROFILE_BY_MODE } from '../../composables/chat-engine-config.js';
import { ESTIMATED_SYSTEM_PROMPT_CHARS, estimateTokens } from '../../composables/bohai-engine-helpers.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  currentMode: { type: Object, default: () => ({}) },
  currentModeId: { type: String, default: '' },
  chatModes: { type: Array, default: () => [] },
  currentResponseStyleId: { type: String, default: '' },
  responseStyleOptions: { type: Array, default: () => [] },
  currentThinkingSpeedId: { type: String, default: 'medium' },
  thinkingSpeedOptions: { type: Array, default: () => [] },
  isSearching: { type: Boolean, default: false },
  isTreeholeMemoryEnabled: { type: Boolean, default: false },
  isSharedMemoryEnabled: { type: Boolean, default: false },
  contextBudgetUsage: { type: Object, default: () => ({}) },
  contextBudgetPercentText: { type: String, default: '0%' },
  isCompressingContext: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:modelValue',
  'selectMode',
  'selectResponseStyle',
  'selectThinkingSpeed',
  'update:isSearching',
  'update:isTreeholeMemoryEnabled',
  'update:isSharedMemoryEnabled',
  'clearCurrentChat',
  'exportChatData',
  'clearAllChatData',
  'openQuotaPanel'
]);

const showModePicker = ref(false);
const showStylePicker = ref(false);
const showThinkingSpeedPicker = ref(false);
const drawerRef = ref(null);
const titleRef = ref(null);
const closeBtnRef = ref(null);
let focusRestore = null;

const currentResponseStyleName = computed(() => {
  const style = props.responseStyleOptions?.find(s => s.id === props.currentResponseStyleId);
  return style?.shortName || style?.name || '默认';
});

const currentThinkingSpeedName = computed(() => {
  const level = props.thinkingSpeedOptions?.find(s => s.id === props.currentThinkingSpeedId);
  return level?.name || '中';
});

const close = () => {
  showModePicker.value = false;
  showStylePicker.value = false;
  showThinkingSpeedPicker.value = false;
  emit('update:modelValue', false);
  const el = focusRestore;
  focusRestore = null;
  if (el && typeof el.focus === 'function') {
    nextTick(() => el.focus());
  }
};

const handleTabTrap = (e) => {
  const drawer = drawerRef.value;
  if (!drawer) return;
  const focusable = drawer.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;
  if (e.shiftKey) {
    if (current === first || !drawer.contains(current)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (current === last || !drawer.contains(current)) {
      e.preventDefault();
      first.focus();
    }
  }
};

watch(() => props.modelValue, async (open) => {
  console.log('[BohaiSettingsPanel] modelValue changed:', open, '| body class:', document.body.className);
  if (open) {
    focusRestore = document.activeElement;
    await nextTick();
    const backdrop = document.querySelector('.ai-settings-backdrop');
    const drawer = document.querySelector('.ai-settings-drawer');
    const glassOverlay = document.querySelector('.global-ai-glass-overlay');
    const sidebar = document.querySelector('.sidebar');
    console.log('[BohaiSettingsPanel] 渲染检查:', {
      backdrop存在: !!backdrop,
      backdropZIndex: backdrop ? getComputedStyle(backdrop).zIndex : 'N/A',
      backdropPosition: backdrop ? getComputedStyle(backdrop).position : 'N/A',
      backdropOpacity: backdrop ? getComputedStyle(backdrop).opacity : 'N/A',
      backdropDisplay: backdrop ? getComputedStyle(backdrop).display : 'N/A',
      drawer存在: !!drawer,
      drawerZIndex: drawer ? getComputedStyle(drawer).zIndex : 'N/A',
      drawerPosition: drawer ? getComputedStyle(drawer).position : 'N/A',
      drawerOpacity: drawer ? getComputedStyle(drawer).opacity : 'N/A',
      glassOverlayZIndex: glassOverlay ? getComputedStyle(glassOverlay).zIndex : 'N/A',
      glassOverlayWillChange: glassOverlay ? getComputedStyle(glassOverlay).willChange : 'N/A',
      sidebarZIndex: sidebar ? getComputedStyle(sidebar).zIndex : 'N/A',
      body子元素: Array.from(document.body.children).map(el => (el.className || el.id || el.tagName).slice(0, 40)),
    });
    closeBtnRef.value?.focus();
  } else {
    showModePicker.value = false;
    showStylePicker.value = false;
    showThinkingSpeedPicker.value = false;
    if (focusRestore && typeof focusRestore.focus === 'function') {
      nextTick(() => focusRestore.focus());
    }
    focusRestore = null;
  }
});

onMounted(() => {
  console.log('[BohaiSettingsPanel] 组件已挂载');
});

onUnmounted(() => {
  focusRestore = null;
  console.log('[BohaiSettingsPanel] 组件已卸载');
});

const formatMaxChars = computed(() => {
  const total = (parseInt(MAX_HISTORY_CONTEXT_CHARS) || 12000) + (parseInt(MAX_FINAL_PROMPT_CHARS) || 16000) + ESTIMATED_SYSTEM_PROMPT_CHARS;
  return `${(total / 1000).toFixed(0)}K 字符`;
});

const formatMaxOutput = computed(() => {
  const profile = GENERATION_PROFILE_BY_MODE[props.currentModeId] || GENERATION_PROFILE_BY_MODE.fast;
  return `${(profile?.max_tokens ?? 4096).toLocaleString()} tokens`;
});

const formatBudgetTotal = computed(() => {
  const max = props.contextBudgetUsage?.max || 28600;
  return `${max.toLocaleString()} 字符`;
});

const formatBudgetUsed = computed(() => {
  const used = props.contextBudgetUsage?.used || 0;
  return `${used.toLocaleString()} 字符`;
});

const estimatedTokens = computed(() => {
  const used = props.contextBudgetUsage?.used || 0;
  const estimated = Math.round(used * 0.35);
  return `${estimated.toLocaleString()} tokens`;
});

const compressionStatusClass = computed(() => {
  if (props.isCompressingContext) return 'compressing';
  if (props.contextBudgetUsage?.hasSummary) return 'compressed';
  return 'none';
});

const compressionStatusText = computed(() => {
  if (props.isCompressingContext) return '正在压缩...';
  if (props.contextBudgetUsage?.hasSummary) return '已启用 (包含摘要)';
  return '未压缩';
});
</script>

<style>
.ai-settings-backdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483648 !important; /* 高于 GlobalAiGlassOverlay 的 2147483646 */
  display: flex !important;
  align-items: stretch !important;
  justify-content: flex-start !important;
  padding: 12px !important;
  background: rgba(15, 23, 42, 0.22) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ai-settings-drawer {
  width: min(420px, calc(100vw - 24px)) !important;
  height: calc(100dvh - 24px) !important;
  display: grid !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  overflow: hidden !important;
  border: 1px solid rgba(226, 232, 240, 0.92) !important;
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  color: #111827 !important;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24) !important;
}

.ai-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
}

.ai-settings-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 700;
}

.ai-settings-close-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.ai-settings-close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.ai-settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.ai-settings-card {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.86);
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.ai-settings-card.danger-card {
  border-color: rgba(220, 38, 38, 0.15);
}

.ai-settings-group-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: #86868b;
  letter-spacing: 0.5px;
  padding: 14px 16px 6px;
  margin: 0;
}

.ai-settings-list { display: block; }
.ai-settings-list:empty { display: none; }

.ai-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  transition: background-color 0.15s ease;
}

.ai-settings-row.clickable { cursor: pointer; }
.ai-settings-row:not(:last-child) { border-bottom: 1px solid rgba(0, 0, 0, 0.04); }
.ai-settings-row:hover, .ai-settings-row.expanded { background: rgba(0, 0, 0, 0.02); }

.ai-settings-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.ai-settings-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.ai-settings-label-stack {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ai-settings-label {
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.3;
}

.ai-settings-desc, .ai-settings-value {
  font-size: 12px;
  color: #64748b;
  line-height: 1.3;
}

.ai-settings-row-right {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 120px;
}

.ai-settings-chevron {
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.ai-settings-chevron.expanded { transform: rotate(90deg); }

.ai-settings-inline-options {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 10px;
  gap: 4px;
  background: #f8fafc;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.ai-settings-inline-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.ai-settings-inline-option:hover { background: #f1f5f9; }
.ai-settings-inline-option.active {
  border-color: rgba(16, 163, 127, 0.35);
  background: rgba(16, 163, 127, 0.08);
}

.ai-settings-option-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-settings-option-main strong { font-size: 14px; font-weight: 600; color: #0f172a; }
.ai-settings-option-main small { font-size: 12px; color: #64748b; line-height: 1.3; }

.ai-settings-switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: #cbd5e1;
  flex-shrink: 0;
  transition: background-color 0.2s ease;
}

.ai-settings-switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.22);
  transition: transform 0.2s ease;
}

.ai-settings-switch.enabled { background: #10a37f; }
.ai-settings-switch.enabled::after { transform: translateX(16px); }

.ai-settings-meter-row {
  padding: 14px 16px;
  display: grid;
  gap: 10px;
  box-sizing: border-box;
}

.ai-settings-meter-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.ai-settings-meter-info strong { font-size: 14px; font-weight: 600; color: #0f172a; }
.ai-settings-meter-info small { font-size: 12px; color: #64748b; }

.ai-settings-meter-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.ai-settings-meter-fill {
  height: 100%;
  border-radius: 999px;
  background: #10a37f;
  transition: width 0.3s ease;
}

.ai-settings-context-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.ai-settings-context-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.ai-settings-context-detail-row span {
  color: #64748b;
}

.ai-settings-context-detail-row strong {
  font-weight: 600;
  color: #0f172a;
}

.context-status { font-size: 12px; }
.context-status.compressing { color: #2563eb; }
.context-status.compressed { color: #10a37f; }
.context-status.none { color: #94a3b8; }

.ai-settings-footer {
  text-align: center;
  padding: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ai-settings-footer strong { font-size: 13px; font-weight: 700; color: #64748b; }
.ai-settings-footer span { font-size: 12px; color: #94a3b8; }

.bg-blue { background-color: #EBF5FF; color: #007AFF; }
.bg-green { background-color: #E8F9EE; color: #34C759; }
.bg-purple { background-color: #F7EFFF; color: #AF52DE; }
.bg-orange { background-color: #FFF3E0; color: #F59E0B; }
.bg-gray { background-color: #F5F5F7; color: #8E8E93; }
.bg-indigo { background-color: #EEEDFF; color: #5856D6; }
.bg-red { background-color: #FFE5E5; color: #dc2626; }

.ai-settings-row.danger .ai-settings-label,
.ai-settings-row.danger .ai-settings-desc { color: #dc2626; }
.ai-settings-row.danger:hover { background: rgba(220, 38, 38, 0.04); }
.ai-settings-chevron.text-danger { color: #dc2626; }

/* Transition animations */
.settings-slide-enter-active {
  transition: opacity 0.2s ease;
}
.settings-slide-enter-active .ai-settings-drawer {
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s ease;
}
.settings-slide-leave-active {
  transition: opacity 0.18s ease;
}
.settings-slide-leave-active .ai-settings-drawer {
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease;
}
.settings-slide-enter-from,
.settings-slide-leave-to {
  opacity: 0;
}
.settings-slide-enter-from .ai-settings-drawer {
  opacity: 0;
  transform: translateX(-24px);
}
.settings-slide-leave-to .ai-settings-drawer {
  opacity: 0;
  transform: translateX(-16px);
}

[data-boh-theme="dark"] .ai-settings-drawer {
  background: rgba(28, 28, 30, 0.98) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  color: #f8fafc !important;
}

[data-boh-theme="dark"] .ai-settings-card {
  background: rgba(40, 40, 42, 0.8);
  border-color: rgba(255, 255, 255, 0.08);
}

[data-boh-theme="dark"] .ai-settings-group-title { color: #9ca3af; }
[data-boh-theme="dark"] .ai-settings-label { color: #f8fafc; }
[data-boh-theme="dark"] .ai-settings-desc,
[data-boh-theme="dark"] .ai-settings-value { color: #9ca3af; }
[data-boh-theme="dark"] .ai-settings-chevron { color: #6b7280; }

[data-boh-theme="dark"] .ai-settings-row:hover,
[data-boh-theme="dark"] .ai-settings-row.expanded { background: rgba(255, 255, 255, 0.06); }

[data-boh-theme="dark"] .ai-settings-inline-options {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
}

[data-boh-theme="dark"] .ai-settings-inline-option { background: rgba(40, 40, 42, 0.6); }
[data-boh-theme="dark"] .ai-settings-inline-option.active {
  border-color: rgba(16, 163, 127, 0.45);
  background: rgba(16, 163, 127, 0.12);
}

[data-boh-theme="dark"] .ai-settings-option-main strong { color: #f8fafc; }
[data-boh-theme="dark"] .ai-settings-option-main small { color: #9ca3af; }
[data-boh-theme="dark"] .ai-settings-icon { background: rgba(255, 255, 255, 0.08); }
[data-boh-theme="dark"] .ai-settings-header { border-color: rgba(255, 255, 255, 0.1); }
[data-boh-theme="dark"] .ai-settings-close-btn { color: #9ca3af; }
[data-boh-theme="dark"] .ai-settings-close-btn:hover { background: rgba(255, 255, 255, 0.08); color: #f8fafc; }
[data-boh-theme="dark"] .ai-settings-meter-track { background: rgba(255, 255, 255, 0.1); }
[data-boh-theme="dark"] .ai-settings-footer strong,
[data-boh-theme="dark"] .ai-settings-footer span { color: #9ca3af; }
[data-boh-theme="dark"] .ai-settings-context-details { border-top-color: rgba(255, 255, 255, 0.08); }
[data-boh-theme="dark"] .ai-settings-context-detail-row span { color: #9ca3af; }
[data-boh-theme="dark"] .ai-settings-context-detail-row strong { color: #f8fafc; }
[data-boh-theme="dark"] .context-status.none { color: #6b7280; }
[data-boh-theme="dark"] .context-status.compressing { color: #60a5fa; }
[data-boh-theme="dark"] .context-status.compressed { color: #34d399; }

@media (max-width: 768px) and (orientation: portrait) {
  .ai-settings-backdrop {
    align-items: flex-end !important;
    padding: 0 !important;
  }
  .ai-settings-drawer {
    width: 100% !important;
    height: min(88dvh, 720px) !important;
    border-radius: 18px 18px 0 0 !important;
  }
  .settings-slide-enter-from .ai-settings-drawer {
    transform: translateY(30px);
  }
  .settings-slide-leave-to .ai-settings-drawer {
    transform: translateY(20px);
  }
}
</style>

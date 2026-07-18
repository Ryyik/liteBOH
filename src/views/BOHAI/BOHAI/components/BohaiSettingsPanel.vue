<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="settings-slide">
      <div v-if="modelValue" class="ai-settings-backdrop" :class="{ 'is-embedded': embedded }"
        :data-theme="resolvedTheme" role="presentation"
        @click.self="close" @keydown.escape="close"
        @keydown.tab.prevent="handleTabTrap">
        <section ref="drawerRef" class="ai-settings-drawer" role="dialog" aria-modal="true" aria-label="BOH AI 设置">
          <header class="ai-settings-header">
            <h2 tabindex="-1" ref="titleRef">设置</h2>
            <button ref="closeBtnRef" type="button" class="ai-settings-close-btn" :title="embedded ? '返回' : '关闭 (Esc)'" @click="close">
              <ArrowLeft v-if="embedded" size="18" />
              <X v-else size="18" />
            </button>
          </header>

          <div class="ai-settings-body custom-scrollbar">
            <div class="ai-settings-card">
              <div class="ai-settings-group-title">快捷入口</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable" @click="preferences.shortcutEnabled = !preferences.shortcutEnabled">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">⌨</span></div>
                    <div class="ai-settings-label-stack"><span class="ai-settings-label">全局快捷键</span><span class="ai-settings-desc">{{ shortcutLabel }} 呼出并聚焦输入框</span></div>
                  </div>
                  <span :class="['ai-settings-switch', { enabled: preferences.shortcutEnabled }]"></span>
                </div>
                <div v-if="preferences.shortcutEnabled" class="ai-settings-row" :class="{ expanded: showShortcutPicker }" @click="showShortcutPicker = !showShortcutPicker">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">K</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">快捷键组合</span><span class="ai-settings-desc">{{ shortcutLabel }}</span></div></div>
                  <span class="ai-settings-chevron" :class="{ expanded: showShortcutPicker }">›</span>
                </div>
                <div v-if="showShortcutPicker && preferences.shortcutEnabled" class="ai-settings-inline-options">
                  <button v-for="option in shortcutOptions" :key="option.id" type="button" :class="['ai-settings-inline-option', { active: preferences.shortcut === option.id }]" @click.stop="preferences.shortcut = option.id; showShortcutPicker = false">
                    <span class="ai-settings-option-main"><strong>{{ option.name }}</strong><small>{{ option.description }}</small></span><Check v-if="preferences.shortcut === option.id" size="16" />
                  </button>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.gestureEnabled = !preferences.gestureEnabled">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">↔</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">边缘手势</span><span class="ai-settings-desc">从屏幕边缘横向滑动呼出</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.gestureEnabled }]"></span>
                </div>
                <div v-if="preferences.gestureEnabled" class="ai-settings-inline-segmented">
                  <button :class="{ active: preferences.gestureSide === 'left' }" @click="preferences.gestureSide = 'left'">左侧</button>
                  <button :class="{ active: preferences.gestureSide === 'right' }" @click="preferences.gestureSide = 'right'">右侧</button>
                  <button v-for="level in gestureSensitivityOptions" :key="level.id" :class="{ active: preferences.gestureSensitivity === level.id }" @click="preferences.gestureSensitivity = level.id">{{ level.name }}</button>
                </div>
                <div v-if="preferences.gestureEnabled" class="ai-settings-row clickable" @click="preferences.hapticsEnabled = !preferences.hapticsEnabled">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">◉</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">触感反馈</span><span class="ai-settings-desc">支持的设备在手势完成时轻触反馈</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.hapticsEnabled }]"></span>
                </div>
                <div class="ai-settings-row" :class="{ expanded: showOpenBehaviorPicker }" @click="showOpenBehaviorPicker = !showOpenBehaviorPicker">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">↗</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">呼出后打开</span><span class="ai-settings-desc">{{ currentOpenBehaviorName }} · {{ preferences.initialHeight === 'full' ? '全屏' : '舒适高度' }}</span></div></div>
                  <span class="ai-settings-chevron" :class="{ expanded: showOpenBehaviorPicker }">›</span>
                </div>
                <div v-if="showOpenBehaviorPicker" class="ai-settings-inline-options">
                  <button v-for="option in openBehaviorOptions" :key="option.id" type="button" :class="['ai-settings-inline-option', { active: preferences.openBehavior === option.id }]" @click.stop="preferences.openBehavior = option.id">
                    <span class="ai-settings-option-main"><strong>{{ option.name }}</strong><small>{{ option.description }}</small></span><Check v-if="preferences.openBehavior === option.id" size="16" />
                  </button>
                  <div class="ai-settings-inline-segmented no-indent"><button :class="{ active: preferences.initialHeight === 'comfortable' }" @click.stop="preferences.initialHeight = 'comfortable'">舒适高度</button><button :class="{ active: preferences.initialHeight === 'full' }" @click.stop="preferences.initialHeight = 'full'">全屏</button></div>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.autoFocus = !preferences.autoFocus">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">I</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">自动聚焦输入框</span><span class="ai-settings-desc">呼出后可直接输入</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.autoFocus }]"></span>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">默认行为</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row" :class="{ expanded: showModePicker }"
                  @click="showModePicker = !showModePicker">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-blue">
                      <Settings size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">默认响应模式</span>
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
                      <small>{{ mode.tagline }}</small>
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
                <div class="ai-settings-row clickable" @click="preferences.enterToSend = !preferences.enterToSend">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">↵</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">发送方式</span><span class="ai-settings-desc">{{ preferences.enterToSend ? 'Enter 发送，Shift+Enter 换行' : 'Ctrl/⌘+Enter 发送' }}</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.enterToSend }]"></span>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.defaultWebSearch = !preferences.defaultWebSearch">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">◎</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">新对话默认联网</span><span class="ai-settings-desc">开始新对话时自动启用联网搜索</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.defaultWebSearch }]"></span>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.showDetails = !preferences.showDetails">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">⋯</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">回复详情入口</span><span class="ai-settings-desc">显示检索记录与动作审计</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.showDetails }]"></span>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">记忆</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable" :class="{ disabled: isTreeholeMemoryToggling }"
                  role="switch" tabindex="0" :aria-checked="isTreeholeMemoryEnabled"
                  @click="!isTreeholeMemoryToggling && $emit('toggleTreeholeMemory')"
                  @keydown.enter.prevent="!isTreeholeMemoryToggling && $emit('toggleTreeholeMemory')"
                  @keydown.space.prevent="!isTreeholeMemoryToggling && $emit('toggleTreeholeMemory')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-indigo">
                      <span style="font-size:11px;font-weight:800;">C+</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">个人记忆</span>
                      <span class="ai-settings-desc">{{ isTreeholeMemoryToggling ? '正在更新设置…' : '允许回答参考你的 Cloud+ 内容' }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span :class="['ai-settings-switch', { enabled: isTreeholeMemoryEnabled }]"></span>
                  </div>
                </div>
                <div class="ai-settings-row clickable" role="switch" tabindex="0"
                  :aria-checked="isSharedMemoryEnabled" @click="$emit('toggleSharedMemory')"
                  @keydown.enter.prevent="$emit('toggleSharedMemory')"
                  @keydown.space.prevent="$emit('toggleSharedMemory')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-purple">
                      <span style="font-size:11px;font-weight:800;">M</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">社区知识</span>
                      <span class="ai-settings-desc">允许回答参考社区共享内容</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span :class="['ai-settings-switch', { enabled: isSharedMemoryEnabled }]"></span>
                  </div>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.pageContextEnabled = !preferences.pageContextEnabled">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">▤</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">自动附加当前页面</span><span class="ai-settings-desc">呼出 AI 时附加页面标题和地址</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.pageContextEnabled }]"></span>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.selectionContextEnabled = !preferences.selectionContextEnabled">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">T</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">识别选中文本</span><span class="ai-settings-desc">仅在你主动附加或允许自动附加时使用</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.selectionContextEnabled }]"></span>
                </div>
                <div v-if="memoryStatusText" class="ai-settings-memory-status" role="status">{{ memoryStatusText }}</div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">外观</div>
              <div class="ai-settings-list">
                <div class="ai-settings-inline-segmented settings-wide-segmented">
                  <button v-for="option in appearanceOptions" :key="option.id" :class="{ active: preferences.appearance === option.id }" @click="preferences.appearance = option.id">{{ option.name }}</button>
                </div>
                <div class="ai-settings-inline-segmented settings-wide-segmented">
                  <button :class="{ active: preferences.density === 'comfortable' }" @click="preferences.density = 'comfortable'">舒适</button>
                  <button :class="{ active: preferences.density === 'compact' }" @click="preferences.density = 'compact'">紧凑</button>
                </div>
                <div class="ai-settings-inline-segmented settings-wide-segmented font-scale-segmented">
                  <button :class="{ active: preferences.fontScale === 'small' }" @click="preferences.fontScale = 'small'">小字</button>
                  <button :class="{ active: preferences.fontScale === 'medium' }" @click="preferences.fontScale = 'medium'">标准</button>
                  <button :class="{ active: preferences.fontScale === 'large' }" @click="preferences.fontScale = 'large'">大字</button>
                </div>
                <div class="ai-settings-row clickable" @click="preferences.animationsEnabled = !preferences.animationsEnabled">
                  <div class="ai-settings-row-left"><div class="ai-settings-icon"><span class="settings-glyph">✦</span></div><div class="ai-settings-label-stack"><span class="ai-settings-label">界面动效</span><span class="ai-settings-desc">关闭后减少抽屉和页面切换动画</span></div></div>
                  <span :class="['ai-settings-switch', { enabled: preferences.animationsEnabled }]"></span>
                </div>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">使用情况</div>
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
                      <span class="ai-settings-label">Token 用量</span>
                      <span class="ai-settings-desc">{{ quotaSummaryText }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron">›</span>
                  </div>
                </div>
                <button type="button" class="ai-settings-quota-overview" @click="$emit('openQuotaPanel')">
                  <template v-if="quotaSummary">
                    <div class="ai-settings-quota-head">
                      <span>今日 Token</span>
                      <strong>{{ quotaLimit === -1 ? '∞' : `${quotaPercentLabel}%` }}</strong>
                    </div>
                    <div class="ai-settings-quota-values">
                      <span>已用 {{ formatTokenCount(quotaUsed) }}</span>
                      <span>{{ quotaLimit === -1 ? '无限额度' : `总额 ${formatTokenCount(quotaLimit)}` }}</span>
                    </div>
                    <div class="ai-settings-quota-track" role="progressbar" aria-label="今日 Token 使用比例"
                      :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="quotaLimit === -1 ? undefined : Number(quotaPercent.toFixed(2))">
                      <span :class="{ 'has-usage': quotaPercent > 0, warn: quotaPercent >= 80, danger: quotaPercent >= 95, unlimited: quotaLimit === -1 }"
                        :style="{ width: quotaLimit === -1 ? '100%' : `${quotaPercent}%` }"></span>
                    </div>
                    <div class="ai-settings-quota-foot">
                      <span>{{ quotaLimit === -1 ? '当前订阅不限用量' : `剩余 ${formatTokenCount(quotaRemaining)} Tokens` }}</span>
                      <span>每日 0:00 重置</span>
                    </div>
                  </template>
                  <span v-else class="ai-settings-quota-loading">正在读取今日用量…</span>
                </button>
              </div>
            </div>

            <div class="ai-settings-card">
              <div class="ai-settings-group-title">数据控制</div>
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
              <span>你的对话数据仅用于提供当前产品功能</span>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch, onUnmounted } from 'vue';
import { X, ArrowLeft, Settings, Check, Trash2 } from 'lucide-vue-next';
import { useGlobalAiPreferences, getGlobalAiShortcutLabel } from '@/composables/useGlobalAiPreferences.js';
import { getAiQuotaStatus } from '@/utils/api/api-key-runtime-api.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  currentMode: { type: Object, default: () => ({}) },
  currentModeId: { type: String, default: '' },
  chatModes: { type: Array, default: () => [] },
  currentResponseStyleId: { type: String, default: '' },
  responseStyleOptions: { type: Array, default: () => [] },
  currentThinkingSpeedId: { type: String, default: 'medium' },
  thinkingSpeedOptions: { type: Array, default: () => [] },
  isTreeholeMemoryEnabled: { type: Boolean, default: false },
  isSharedMemoryEnabled: { type: Boolean, default: false },
  isTreeholeMemoryToggling: { type: Boolean, default: false },
  memoryStatusText: { type: String, default: '' },
  resolvedTheme: { type: String, default: 'light' }
});

const emit = defineEmits([
  'update:modelValue',
  'selectMode',
  'selectResponseStyle',
  'selectThinkingSpeed',
  'toggleTreeholeMemory',
  'toggleSharedMemory',
  'clearCurrentChat',
  'exportChatData',
  'clearAllChatData',
  'openQuotaPanel'
]);

const showModePicker = ref(false);
const showStylePicker = ref(false);
const showThinkingSpeedPicker = ref(false);
const showShortcutPicker = ref(false);
const showOpenBehaviorPicker = ref(false);
const drawerRef = ref(null);
const titleRef = ref(null);
const closeBtnRef = ref(null);
const quotaSummary = ref(null);
let focusRestore = null;
const { preferences } = useGlobalAiPreferences();

const shortcutOptions = [
  { id: 'mod+k', name: '⌘/Ctrl + K', description: '通用且容易记忆；Lab 页面保留给命令面板' },
  { id: 'mod+j', name: '⌘/Ctrl + J', description: '适合需要避开命令面板的页面' },
  { id: 'mod+space', name: '⌘/Ctrl + Space', description: '接近系统级助手的呼出习惯' }
];
const gestureSensitivityOptions = [
  { id: 'high', name: '灵敏' },
  { id: 'medium', name: '标准' },
  { id: 'low', name: '稳健' }
];
const openBehaviorOptions = [
  { id: 'resume', name: '继续上次对话', description: '保留阅读位置和未发送内容' },
  { id: 'new', name: '每次新对话', description: '每次呼出都创建可保存的新会话' },
  { id: 'temporary', name: '临时对话', description: '关闭后不会写入历史记录' }
];
const appearanceOptions = [
  { id: 'system', name: '跟随网站' },
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' }
];
const shortcutLabel = computed(() => getGlobalAiShortcutLabel(preferences.shortcut));
const currentOpenBehaviorName = computed(() => openBehaviorOptions.find(option => option.id === preferences.openBehavior)?.name || '继续上次对话');
const formatTokenCount = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
  .format(Math.max(0, Number(value || 0)));
const formatQuotaPercent = (value) => {
  if (value <= 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
};
const quotaUsed = computed(() => Math.max(0, Number(quotaSummary.value?.usedTokens ?? quotaSummary.value?.used ?? 0)));
const quotaLimit = computed(() => Number(quotaSummary.value?.tokenLimit ?? quotaSummary.value?.limit ?? 0));
const quotaPercent = computed(() => quotaLimit.value > 0
  ? Math.min(100, Math.max(0, (quotaUsed.value / quotaLimit.value) * 100))
  : 0);
const quotaPercentLabel = computed(() => formatQuotaPercent(quotaPercent.value));
const quotaRemaining = computed(() => quotaLimit.value === -1
  ? -1
  : Math.max(0, Number(quotaSummary.value?.remainingTokens ?? (quotaLimit.value - quotaUsed.value))));
const quotaSummaryText = computed(() => {
  if (!quotaSummary.value) return '查看今日用量与订阅额度';
  const used = Number(quotaSummary.value.usedTokens ?? quotaSummary.value.used ?? 0);
  const limit = Number(quotaSummary.value.tokenLimit ?? quotaSummary.value.limit ?? 0);
  if (limit === -1) return `今日已用 ${formatTokenCount(used)} · 无限额度`;
  return `今日 ${formatTokenCount(used)} / ${formatTokenCount(limit)} Tokens`;
});

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
  showShortcutPicker.value = false;
  showOpenBehaviorPicker.value = false;
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
  if (open) {
    focusRestore = document.activeElement;
    await nextTick();
    closeBtnRef.value?.focus();
    getAiQuotaStatus().then((result) => {
      if (result?.ok && result.data) quotaSummary.value = result.data;
    }).catch(() => {});
  } else {
    showModePicker.value = false;
    showStylePicker.value = false;
    showThinkingSpeedPicker.value = false;
    showShortcutPicker.value = false;
    showOpenBehaviorPicker.value = false;
    if (focusRestore && typeof focusRestore.focus === 'function') {
      nextTick(() => focusRestore.focus());
    }
    focusRestore = null;
  }
});

onUnmounted(() => {
  focusRestore = null;
});

</script>

<style>
.ai-settings-backdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483600 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 24px !important;
  background: rgba(0, 0, 0, 0.42) !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.ai-settings-backdrop.is-embedded {
  position: absolute !important;
  padding: 0 !important;
  align-items: stretch !important;
  justify-content: stretch !important;
  background: #ffffff !important;
  z-index: 300 !important;
}

.ai-settings-backdrop.is-embedded .ai-settings-drawer {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.ai-settings-drawer {
  position: relative !important;
  z-index: 1 !important;
  width: min(560px, calc(100vw - 48px)) !important;
  height: min(760px, calc(100dvh - 48px)) !important;
  display: grid !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  overflow: hidden !important;
  border: 1px solid #d9d9d9 !important;
  border-radius: 8px !important;
  background: #ffffff !important;
  color: #171717 !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22) !important;
}

.ai-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 10px 16px;
  border-bottom: 1px solid #e5e5e5;
}

.ai-settings-header h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 600;
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
  color: #737373;
  cursor: pointer;
}

.ai-settings-close-btn:hover {
  background: #f2f2f2;
  color: #171717;
}

.ai-settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ai-settings-card {
  background: #ffffff;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: none;
}

.ai-settings-card.danger-card {
  border-color: transparent;
}

.ai-settings-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #737373;
  letter-spacing: 0;
  padding: 22px 12px 8px;
  margin: 0;
}

.ai-settings-list { display: block; }
.ai-settings-list:empty { display: none; }

.ai-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 10px 12px;
  transition: background-color 0.15s ease;
}

.ai-settings-row.clickable { cursor: pointer; }
.ai-settings-row.disabled { cursor: wait; opacity: 0.62; }
.ai-settings-row:not(:last-child) { border-bottom: 1px solid #eeeeee; }
.ai-settings-row:hover, .ai-settings-row.expanded { background: #f7f7f7; }

.ai-settings-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.ai-settings-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent !important;
  color: #525252 !important;
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
  color: #171717;
  line-height: 1.3;
}

.ai-settings-desc, .ai-settings-value {
  font-size: 12px;
  color: #737373;
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
  padding: 4px 12px 10px 50px;
  gap: 4px;
  background: #ffffff;
  border-top: 1px solid #eeeeee;
}

.ai-settings-inline-segmented {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin: 7px 12px 10px 50px;
  padding: 4px;
  border-radius: 9px;
  background: #f1f1f1;
}

.ai-settings-inline-segmented.no-indent { margin: 8px 0 0; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ai-settings-inline-segmented.settings-wide-segmented { margin-left: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ai-settings-inline-segmented.settings-wide-segmented + .settings-wide-segmented { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ai-settings-inline-segmented.font-scale-segmented { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }

.ai-settings-inline-segmented button {
  min-width: 0;
  min-height: 30px;
  padding: 5px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #737373;
  font-size: 11px;
  cursor: pointer;
}

.ai-settings-inline-segmented button.active { background: #ffffff; color: #171717; box-shadow: 0 1px 3px rgba(0,0,0,.09); }
.settings-glyph { font-size: 12px; font-weight: 750; }

.ai-settings-row,
.ai-settings-inline-option,
.ai-settings-inline-segmented button,
.ai-settings-close-btn {
  transition:
    transform 140ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    box-shadow 180ms ease;
}

.ai-settings-row.clickable:hover { transform: translateX(2px); }
.ai-settings-row.clickable:active { transform: translateX(1px) scale(0.995); }
.ai-settings-inline-option:hover { transform: translateX(2px); }
.ai-settings-inline-option:active,
.ai-settings-inline-segmented button:active,
.ai-settings-close-btn:active { transform: scale(0.96); }

.ai-settings-inline-options,
.ai-settings-inline-segmented {
  animation: settings-options-enter 210ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: top center;
}

.ai-settings-card {
  animation: settings-section-enter 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.ai-settings-card:nth-child(2) { animation-delay: 35ms; }
.ai-settings-card:nth-child(3) { animation-delay: 70ms; }
.ai-settings-card:nth-child(4) { animation-delay: 105ms; }
.ai-settings-card:nth-child(n+5) { animation-delay: 130ms; }

.ai-settings-backdrop.is-embedded.settings-slide-enter-active,
.ai-settings-backdrop.is-embedded.settings-slide-leave-active {
  transition: opacity 220ms ease !important;
}

.ai-settings-backdrop.is-embedded.settings-slide-enter-active .ai-settings-drawer,
.ai-settings-backdrop.is-embedded.settings-slide-leave-active .ai-settings-drawer {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease !important;
}

.ai-settings-backdrop.is-embedded.settings-slide-enter-from .ai-settings-drawer {
  transform: translateX(28px) !important;
  opacity: 0;
}

.ai-settings-backdrop.is-embedded.settings-slide-leave-to .ai-settings-drawer {
  transform: translateX(18px) !important;
  opacity: 0;
}

@keyframes settings-options-enter {
  from { opacity: 0; transform: translateY(-6px) scaleY(0.97); }
  to { opacity: 1; transform: translateY(0) scaleY(1); }
}

@keyframes settings-section-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-settings-inline-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.ai-settings-inline-option:hover { background: #f2f2f2; }
.ai-settings-inline-option.active {
  border-color: #d1d1d1;
  background: #f2f2f2;
}

.ai-settings-memory-status {
  margin: 8px 12px 12px 50px;
  padding: 9px 11px;
  border-radius: 8px;
  background: #f5f5f5;
  color: #525252;
  font-size: 12px;
  line-height: 1.45;
}

.ai-settings-quota-overview {
  display: block;
  width: calc(100% - 24px);
  margin: 8px 12px 12px;
  padding: 11px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 9px;
  background: #fafafa;
  color: #525252;
  text-align: left;
  cursor: pointer;
  transition: transform 140ms ease, background-color 160ms ease, border-color 160ms ease;
}
.ai-settings-quota-overview:hover { background: #f2f2f2; border-color: #d4d4d4; transform: translateY(-1px); }
.ai-settings-quota-overview:active { transform: scale(0.99); }
.ai-settings-quota-head,
.ai-settings-quota-values,
.ai-settings-quota-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ai-settings-quota-head { color: #171717; font-size: 12px; font-weight: 600; }
.ai-settings-quota-head strong { color: #171717; font-size: 15px; }
.ai-settings-quota-values { margin-top: 7px; color: #525252; font-size: 12px; }
.ai-settings-quota-track { height: 6px; margin-top: 9px; overflow: hidden; border-radius: 999px; background: #e5e5e5; }
.ai-settings-quota-track span { display: block; height: 100%; border-radius: inherit; background: #171717; transition: width 360ms cubic-bezier(0.16, 1, 0.3, 1); }
.ai-settings-quota-track span.has-usage { min-width: 3px; }
.ai-settings-quota-track span.warn { background: #b7791f; }
.ai-settings-quota-track span.danger { background: #c53030; }
.ai-settings-quota-track span.unlimited { background: repeating-linear-gradient(90deg, #4b5563 0 10px, #9ca3af 10px 18px); }
.ai-settings-quota-foot { margin-top: 7px; color: #737373; font-size: 11px; }
.ai-settings-quota-loading { display: block; color: #737373; font-size: 12px; }

.ai-settings-backdrop[data-theme="dark"] {
  background: rgba(8, 8, 8, 0.62) !important;
}

.ai-settings-backdrop.is-embedded[data-theme="dark"],
.ai-settings-backdrop[data-theme="dark"] .ai-settings-drawer,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-card,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-inline-options {
  background: #212121 !important;
  color: #f5f5f5 !important;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-header,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-row:not(:last-child),
.ai-settings-backdrop[data-theme="dark"] .ai-settings-inline-options {
  border-color: #383838 !important;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-label,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-option-main strong,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-header h2 {
  color: #f5f5f5;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-desc,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-group-title,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-option-main small {
  color: #a3a3a3;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-row:hover,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-row.expanded,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-inline-option:hover,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-inline-option.active,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-memory-status {
  background: #303030;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-inline-segmented {
  background: #303030;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-inline-segmented button.active {
  background: #454545;
  color: #ffffff;
}

.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-overview { border-color: #454545; background: #2b2b2b; color: #d4d4d4; }
.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-overview:hover { background: #353535; border-color: #555555; }
.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-head,
.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-head strong { color: #f5f5f5; }
.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-values { color: #d4d4d4; }
.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-foot { color: #a3a3a3; }
.ai-settings-backdrop[data-theme="dark"] .ai-settings-quota-track { background: #454545; }

.ai-settings-option-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-settings-option-main strong { font-size: 14px; font-weight: 600; color: #171717; }
.ai-settings-option-main small { font-size: 12px; color: #737373; line-height: 1.3; }

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

.ai-settings-switch.enabled { background: #171717; }
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
  background: #171717;
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
  transform: translateY(10px) scale(0.98);
}
.settings-slide-leave-to .ai-settings-drawer {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

[data-boh-theme="dark"] .ai-settings-drawer {
  background: #212121 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  color: #f8fafc !important;
}
[data-boh-theme="dark"] .ai-settings-backdrop.is-embedded { background: #212121 !important; }
[data-boh-theme="dark"] .ai-settings-inline-segmented { background: #303030; }
[data-boh-theme="dark"] .ai-settings-inline-segmented button { color: #a3a3a3; }
[data-boh-theme="dark"] .ai-settings-inline-segmented button.active { background: #424242; color: #fff; }

[data-boh-theme="dark"] .ai-settings-card {
  background: #212121;
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
    border-radius: 8px 8px 0 0 !important;
  }
  .ai-settings-backdrop.is-embedded .ai-settings-drawer { height: 100% !important; }
  .ai-settings-inline-segmented { margin-left: 12px; }
  .settings-slide-enter-from .ai-settings-drawer {
    transform: translateY(30px);
  }
  .settings-slide-leave-to .ai-settings-drawer {
    transform: translateY(20px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-settings-backdrop *,
  .ai-settings-backdrop *::before,
  .ai-settings-backdrop *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
  }
}
</style>

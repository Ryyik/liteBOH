<template>
  <div class="boh-composer-wrap" :class="{ 'is-island': overlayMode }">
    <div class="boh-composer">
      <!-- 附加的页面上下文（原 `.context-chip-row`） -->
      <div v-if="attachedContext" class="boh-ctx">
        <button
          type="button"
          class="boh-ctx-chip"
          title="点击移除附加的页面上下文"
          @click="emit('clear-context')"
        >
          <FileText :size="14" aria-hidden="true" />
          <span class="boh-ctx-label">{{ attachedTitle }}</span>
          <span class="boh-ctx-badge">AI 可见</span>
          <span class="boh-ctx-tokens">~{{ attachedContext.tokenEstimate || '?' }}</span>
          <X :size="13" aria-hidden="true" />
        </button>
      </div>

      <!-- 斜杠命令 -->
      <div v-if="slashOpen" class="boh-slash" role="listbox" aria-label="快捷命令">
        <button
          v-for="(command, commandIndex) in slashCommands"
          :key="command.id"
          type="button"
          class="boh-slash-item"
          :class="{ 'is-current': slashActiveIndex === commandIndex }"
          role="option"
          :aria-selected="slashActiveIndex === commandIndex"
          @mouseenter="emit('update:slashActiveIndex', commandIndex)"
          @mousedown.prevent="emit('run-slash-command', command)"
        >
          <span class="boh-slash-cmd">/{{ command.keyword }}</span>
          <span class="boh-slash-copy">
            <strong>{{ command.label }}</strong>
            <small>{{ command.description }}</small>
          </span>
        </button>
        <div v-if="slashCommands.length === 0" class="boh-slash-empty">没有匹配的命令</div>
      </div>

      <!-- 模式 / 推理强度 菜单（2026-10-08 按用户样稿重排）：
           一颗胶囊「模型名 强度」→ 单浮层**两视图**（⚠️ 必须 v-show，不许 v-if ——
           probe-bohai-user-models B6/B11 直接查 DOM，v-if 会把「模型混进选择器」测成假红）：
           视图一「强度」= 大字档位（品牌蓝）+ 模型行（点进视图二）+ 三档滑杆 + 重置（样稿 1/2）；
           视图二「模型」= 可返回标题行 + 分组头（默认 / 数据库配置）+ 纯文本行 + 选中勾（样稿 3），
           倍率收成右侧弱化小字。视图中没有的「高级」四工具挂视图一底部（保持一次可达）。 -->
      <div v-show="panelOpen" class="boh-mode-menu" role="dialog" aria-label="模式与推理强度">
        <!-- 视图一：思考强度 -->
        <div v-show="menuView === 'effort'" class="boh-mm-view is-effort">
          <button
            type="button"
            class="boh-effort-reset"
            :disabled="currentThinkingSpeedId === defaultThinkingSpeedId"
            title="恢复默认（中）"
            aria-label="恢复默认思考强度"
            @click="resetEffort"
          >
            <RotateCcw :size="14" aria-hidden="true" />
          </button>
          <div class="boh-effort-word" aria-hidden="true">
            {{ currentThinkingSpeed?.name || '中' }}
          </div>
          <button
            type="button"
            class="boh-effort-mode"
            aria-label="选择模型"
            @click="openModelView"
          >
            <span>{{ currentMode.name }}</span>
            <ChevronRight :size="14" aria-hidden="true" />
          </button>
          <!-- 三档离散滑杆（低/中/高）—— **全自绘**（2026-10-08 用户口径「不要原生的拖动条」，
               原生 range 的样式再怎么覆盖也留着原生骨架）。轨道/填充/滑块都是 span，
               指针落点吸附最近档 + 拖动跟随，键盘 ←/→/Home/End 换档，
               role=slider + aria 值与原生 range 可达性等价。
               BOH 的强度走 sampling deltas，没有连续数值档，不照抄样稿的「5.5」数字。
               ⚠️ 换档**不收面板** —— 拖到一半面板关掉 = 滑杆坏了；选「模式」仍收（pickMode 契约不变）。 -->
          <div
            v-if="thinkingSpeedOptions.length > 1"
            class="boh-effort-track-wrap"
            role="slider"
            tabindex="0"
            aria-label="思考强度"
            :aria-valuemin="0"
            :aria-valuemax="thinkingSpeedOptions.length - 1"
            :aria-valuenow="effortIndex"
            :aria-valuetext="currentThinkingSpeed?.name || ''"
            :style="{ '--boh-effort-fill': effortFill }"
            @pointerdown="onEffortPointerDown"
            @keydown="onEffortKeydown"
          >
            <span class="boh-effort-track" aria-hidden="true"></span>
            <span class="boh-effort-fill" aria-hidden="true"></span>
            <span
              v-for="(option, i) in thinkingSpeedOptions"
              :key="`dot-${option.id}`"
              class="boh-effort-dot"
              :data-thinking-speed-id="option.id"
              :class="{ 'is-filled': effortIndex >= i }"
              :style="{ left: `${(i / (thinkingSpeedOptions.length - 1)) * 100}%` }"
              aria-hidden="true"
            ></span>
            <span class="boh-effort-thumb" aria-hidden="true"></span>
          </div>
          <div class="boh-mm-sep" aria-hidden="true"></div>
          <button
            type="button"
            class="boh-mm-item is-adv"
            :class="{ 'is-on': advOpen }"
            :aria-expanded="advOpen"
            @click="advOpen = !advOpen"
          >
            <span class="boh-mm-name">高级</span>
            <ChevronUp :size="15" aria-hidden="true" />
          </button>
          <div v-show="advOpen" class="boh-mm-adv">
            <button
              type="button"
              class="boh-mm-tool"
              :class="{ 'is-on': tools.forum }"
              @click="emit('toggle-tool', 'forum')"
            >
              <Search :size="16" aria-hidden="true" />
              <span><strong>社区搜索</strong><small>查找 BOH 社区内容</small></span>
            </button>
            <button
              type="button"
              class="boh-mm-tool"
              :class="{ 'is-on': tools.cloud }"
              @click="emit('toggle-tool', 'cloud')"
            >
              <Cloud :size="16" aria-hidden="true" />
              <span><strong>个人 Cloud+</strong><small>参考你的 Cloud+ 私有内容</small></span>
            </button>
            <button
              type="button"
              class="boh-mm-tool"
              :class="{ 'is-on': tools.health }"
              @click="emit('toggle-tool', 'health')"
            >
              <HeartPulse :size="16" aria-hidden="true" />
              <span><strong>健康分析</strong><small>参考你本机的 BOH Health 数据</small></span>
            </button>
            <button type="button" class="boh-mm-tool" @click="emit('start-psych')">
              <Brain :size="16" aria-hidden="true" />
              <span
                ><strong>心理分析</strong><small>切换心理专家，由 AI 逐个提问陪你梳理</small></span
              >
            </button>
          </div>
        </div>

        <!-- 视图二：选择模型（样稿 3：标题 + 分组头 + 纯文本行 + 选中勾，倍率收右侧弱化小字） -->
        <div v-show="menuView === 'model'" class="boh-mm-view is-model">
          <button type="button" class="boh-mm-back" aria-label="返回思考强度" @click="backToEffort">
            <ChevronLeft :size="15" aria-hidden="true" />
            <span class="boh-mm-title">选择模型</span>
          </button>
          <div class="boh-mm-group">
            <span class="boh-mm-group-name">默认</span>
            <span class="boh-mm-group-sub">数据库配置</span>
          </div>
          <div v-if="modesLoading" class="boh-mm-loading" aria-live="polite">
            <span
              v-for="i in 3"
              :key="`sk-${i}`"
              class="boh-mm-skeleton"
              :class="{ 'is-short': i === 3 }"
            ></span>
            <p>模式加载中…</p>
          </div>
          <div v-else-if="modes.length === 0" class="boh-mm-empty">暂无可用模式</div>
          <template v-else>
            <button
              v-for="mode in modes"
              :key="mode.id"
              type="button"
              class="boh-mm-item"
              :class="{ 'is-on': currentModeId === mode.id }"
              :data-mode-id="mode.id"
              :title="mode.tagline || mode.description || ''"
              @click="pickMode(mode.id)"
            >
              <span class="boh-mm-name">{{ mode.name }}</span>
              <span class="boh-mm-rate" :class="{ 'is-free': isFreeMode(mode) || mode.byok }">{{
                formatModeRateLabel(mode)
              }}</span>
              <Check :size="15" aria-hidden="true" />
            </button>
          </template>
        </div>
      </div>

      <textarea
        ref="textareaEl"
        class="boh-composer-input"
        :value="modelValue"
        rows="1"
        :disabled="isCompressing"
        :placeholder="placeholder"
        @input="onInput"
        @keydown="emit('keydown', $event)"
      ></textarea>

      <div class="boh-cp-toolbar">
        <button
          type="button"
          class="boh-cp-icon"
          :class="{ 'is-on': isSearching }"
          :aria-pressed="isSearching"
          :title="isSearching ? '联网搜索已开启，点击关闭' : '开启联网搜索'"
          @click="emit('toggle-search')"
        >
          <Globe :size="17" aria-hidden="true" />
        </button>

        <span class="boh-cp-spacer"></span>

        <div
          v-if="usage.visible"
          class="boh-usage-wrap"
          @mouseenter="openUsagePop"
          @mouseleave="scheduleCloseUsagePop"
        >
          <button
            type="button"
            class="boh-usage"
            :class="usage.levelClass"
            :aria-expanded="usagePopOpen"
            aria-haspopup="dialog"
            aria-label="使用情况"
            @click.stop="toggleUsagePop"
          >
            <i :style="{ '--boh-ring-p': usage.percent }"></i>
            <b>{{ usage.percentText }}</b>
          </button>

          <div v-show="usagePopOpen" class="boh-usage-pop" role="dialog" aria-label="使用情况">
            <div class="boh-usage-pop-head">
              <span>使用情况</span>
              <button type="button" @click.stop="emit('open-usage')">完整用量 ›</button>
            </div>

            <div class="boh-usage-row">
              <span class="boh-usage-dot" aria-hidden="true"></span>
              <span>对话上下文</span>
              <b>{{ usage.percentText }}</b>
            </div>
            <div class="boh-usage-meter"><i :style="{ width: usage.percentText }"></i></div>
            <p class="boh-usage-foot">
              本轮约 {{ usage.windowUsed || 0 }} / {{ usage.windowMax || 0 }} 字符 · 已含
              {{ usage.includedMessageCount || 0 }} 轮历史{{
                usage.hasSummary ? ' · 更早内容已存入摘要' : ''
              }}
            </p>

            <template v-if="usage.quotaVisible">
              <div class="boh-usage-row">
                <span class="boh-usage-dot is-quota" aria-hidden="true"></span>
                <span>今日剩余</span>
                <b>{{ usage.quotaRemainingText }}</b>
              </div>
              <!-- 宽度用归一后的 meterText（已用 ÷ 总额，天然 0–100）。
                   主指标是剩余（Plus 尺子，Max 可到 625%）—— 那个数当 width 会撑破容器。 -->
              <div class="boh-usage-meter is-quota">
                <i :style="{ width: usage.quotaMeterText }"></i>
              </div>
              <p class="boh-usage-foot">{{ usage.quotaDetailText }}</p>
            </template>

            <div class="boh-usage-pop-actions">
              <button
                v-if="usage.canCompress"
                type="button"
                class="is-primary"
                :disabled="isCompressing"
                title="立即压缩历史对话，整理早期内容为摘要"
                @click.stop="emit('compress')"
              >
                <Archive :size="12" aria-hidden="true" /><span>整理上下文</span>
              </button>
              <button type="button" @click.stop="emit('open-usage')">用量详情</button>
            </div>

            <div v-if="usage.compressSuccess" class="boh-usage-done">
              <CheckCircle2 :size="12" aria-hidden="true" /><span>上下文已压缩</span>
            </div>
          </div>
        </div>

        <div class="boh-mode-wrap" @click.stop>
          <button
            type="button"
            class="boh-mode-pill"
            :class="{ 'is-open': panelOpen }"
            :title="`${currentMode.name} · 推理强度 ${effortName}`"
            :aria-expanded="panelOpen"
            aria-haspopup="dialog"
            @click="togglePanel"
          >
            <!-- 样稿的「5.5 高」形态：模型名 + 强度名，中间不加分隔符 -->
            {{ currentMode.name }} {{ effortName }}
            <ChevronDown :size="13" aria-hidden="true" />
          </button>
        </div>

        <button
          v-if="isLoading"
          type="button"
          class="boh-send is-stop"
          title="停止生成"
          aria-label="停止生成"
          @click="emit('stop')"
        >
          <Square :size="15" aria-hidden="true" />
        </button>
        <button
          v-else
          type="button"
          class="boh-send"
          :disabled="!modelValue.trim() || isCompressing"
          title="发送"
          aria-label="发送"
          @click="emit('send')"
        >
          <ArrowUp :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p class="boh-cp-note">内容由 AI 生成，请注意核实</p>

    <p v-if="rateLimitMessage" class="boh-cp-alert">{{ rateLimitMessage }}</p>
    <p v-if="notice" class="boh-cp-notice" role="status">{{ notice }}</p>
    <div v-if="contextWarningText" class="boh-cp-warn" role="status">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{{ contextWarningText }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  Archive,
  ArrowUp,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  FileText,
  Globe,
  HeartPulse,
  RotateCcw,
  Search,
  Square,
  X,
} from 'lucide-vue-next';
import { formatModeRateLabel, isFreeMode } from '@/views/BOHAI/utils/mode-rate-label.js';
import { BOH_DEFAULT_THINKING_SPEED_ID } from '@/views/BOHAI/composables/chat-engine-config.js';

/**
 * BohComposer.vue — 输入区（plans/025 v2 · Step 6-4）
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `§5 输入区`（`.boh-composer-wrap` / `.boh-composer` /
 * `.cp-toolbar` / `.usage-badge` / `.mode-pill` / `.mode-menu` / `.slash-menu` / `.send-btn` /
 * `.cp-note`）。
 *
 * 状态划分：
 *   · **业务状态在壳**（输入值 / 模式 / 强度 / 工具开关 / 联网 / 用量数据 / 斜杠命令清单）；
 *   · **纯 UI 状态在本组件**（面板开合 / 高级折叠 / 用量浮层开合）。
 *     壳的 Esc 与「关闭浮层」通过 `defineExpose().closePanel()` 调用（口径不变）。
 *
 * ⚠️ 旧类名（`.input-area` / `.input-box` / `.composer-*` 一族）**不迁移**（DESIGN §5）。
 * ⚠️ 断点与基座同文件（`components/styles/boh-composer.css`）—— 见 `styles/layout.css` 头。
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isCompressing: { type: Boolean, default: false },
  isSearching: { type: Boolean, default: false },
  placeholder: { type: String, default: '有问题，尽管问' },
  overlayMode: { type: Boolean, default: false },
  modes: { type: Array, default: () => [] },
  modesLoading: { type: Boolean, default: false },
  currentMode: { type: Object, default: () => ({ name: '' }) },
  currentModeId: { type: String, default: '' },
  thinkingSpeedOptions: { type: Array, default: () => [] },
  currentThinkingSpeedId: { type: String, default: '' },
  currentThinkingSpeed: { type: Object, default: null },
  tools: { type: Object, default: () => ({ forum: false, cloud: false, health: false }) },
  attachedContext: { type: Object, default: null },
  usage: { type: Object, default: () => ({ visible: false }) },
  slashOpen: { type: Boolean, default: false },
  slashCommands: { type: Array, default: () => [] },
  slashActiveIndex: { type: Number, default: 0 },
  /** 限流提示（原 `.rate-limit`） */
  rateLimitMessage: { type: String, default: '' },
  /** 一次性 UI 通知（原 `.ui-notice`） */
  notice: { type: String, default: '' },
  /** 上下文接近上限的横幅文案（空则不显示；原 `.context-full-banner`） */
  contextWarningText: { type: String, default: '' },
});

const emit = defineEmits([
  'update:modelValue',
  'keydown',
  'input',
  'send',
  'stop',
  'toggle-search',
  'toggle-tool',
  'start-psych',
  'select-mode',
  'select-thinking-speed',
  'run-slash-command',
  'update:slashActiveIndex',
  'clear-context',
  'compress',
  'open-usage',
]);

const textareaEl = ref(null);
const panelOpen = ref(false);
const advOpen = ref(false);
const usagePopOpen = ref(false);
/** 面板内两视图：'effort'（强度，默认） / 'model'（模型清单）。关闭时必须归位 effort。 */
const menuView = ref('effort');
let usagePopCloseTimer = null;

const effortName = computed(() => props.currentThinkingSpeed?.name || '中');

const attachedTitle = computed(() => {
  const title = String(props.attachedContext?.title || '当前页面');
  return title.length > 24 ? `${title.slice(0, 24)}…` : title;
});

/* 倍率 / 免费 / 自有 Key 的文案已收敛到 utils/mode-rate-label.js ——
   设置页的模式选择器要用同一份，留在这里必然分叉（Fast 显示成 1x 就是这么来的）。 */

/* ── 纯 UI 状态 ── */
const closePanel = () => {
  panelOpen.value = false;
  advOpen.value = false;
  menuView.value = 'effort';
};

const openModelView = () => {
  menuView.value = 'model';
};

const backToEffort = () => {
  menuView.value = 'effort';
};

const togglePanel = () => {
  if (panelOpen.value) {
    closePanel();
    return;
  }
  usagePopOpen.value = false;
  panelOpen.value = true;
};

/* 选完模式 / 强度 → **整个面板收起**（2026-10-01 用户拍板两者表现一致）。
   工具开关与「心理分析」不关面板 —— 用户常接着改第二项。 */
const pickMode = (modeId) => {
  emit('select-mode', modeId);
  closePanel();
};

/* ── 思考强度：全自绘滑杆（2026-10-08 参考图口径 + 用户口径「不要原生拖动条」）──
   三档离散（低/中/高，走 sampling deltas，没有连续数值档）。
   ⚠️ 换档**不收面板** —— 拖到一半面板关掉 = 滑杆坏了；选「模式」仍收（pickMode 契约不变，
   2026-10-01 拍板的「两者一致」随滑杆作废）。 */
const defaultThinkingSpeedId = BOH_DEFAULT_THINKING_SPEED_ID;

const effortIndex = computed(() => {
  const idx = props.thinkingSpeedOptions.findIndex((o) => o.id === props.currentThinkingSpeedId);
  return idx >= 0 ? idx : 0;
});

/** 轨道填充比例与滑块位置共用这一个值（写进 --boh-effort-fill，CSS 只消费） */
const effortFill = computed(() => {
  const max = Math.max(props.thinkingSpeedOptions.length - 1, 1);
  return `${(effortIndex.value / max) * 100}%`;
});

const setEffortIndex = (idx) => {
  const option = props.thinkingSpeedOptions[idx];
  if (option && option.id !== props.currentThinkingSpeedId) {
    emit('select-thinking-speed', option.id);
  }
};

/** 指针横坐标 → 最近档位（离散吸附）。wrap 由调用方捕获，不能读 event.currentTarget
    —— pointermove 派发在 window 上，currentTarget 早已还原为 null。 */
const effortIndexFromEvent = (wrap, event) => {
  const rect = wrap.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  return Math.round(ratio * (props.thinkingSpeedOptions.length - 1));
};

const onEffortPointerDown = (event) => {
  const wrap = event.currentTarget;
  if (!wrap) return;
  setEffortIndex(effortIndexFromEvent(wrap, event));
  const onMove = (moveEvent) => setEffortIndex(effortIndexFromEvent(wrap, moveEvent));
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
};

const onEffortKeydown = (event) => {
  const max = props.thinkingSpeedOptions.length - 1;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault();
    setEffortIndex(Math.min(effortIndex.value + 1, max));
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault();
    setEffortIndex(Math.max(effortIndex.value - 1, 0));
  } else if (event.key === 'Home') {
    event.preventDefault();
    setEffortIndex(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    setEffortIndex(max);
  }
};

const resetEffort = () => emit('select-thinking-speed', BOH_DEFAULT_THINKING_SPEED_ID);

const clearUsageTimer = () => {
  if (usagePopCloseTimer) {
    clearTimeout(usagePopCloseTimer);
    usagePopCloseTimer = null;
  }
};

const openUsagePop = () => {
  clearUsageTimer();
  if (panelOpen.value) closePanel();
  usagePopOpen.value = true;
};

const toggleUsagePop = () => {
  clearUsageTimer();
  if (!usagePopOpen.value && panelOpen.value) closePanel();
  usagePopOpen.value = !usagePopOpen.value;
};

/* 离开后延迟关闭：给「抖出边界又抖回来」留余量，也让鼠标有时间挪进浮层 */
const scheduleCloseUsagePop = () => {
  clearUsageTimer();
  usagePopCloseTimer = setTimeout(() => {
    usagePopCloseTimer = null;
    usagePopOpen.value = false;
  }, 180);
};

const onInput = (event) => {
  emit('update:modelValue', event.target.value);
  emit('input', event);
};

const onDocumentClick = (event) => {
  if (panelOpen.value && !event.target.closest?.('.boh-mode-wrap, .boh-mode-menu')) {
    closePanel();
  }
  if (usagePopOpen.value && !event.target.closest?.('.boh-usage-wrap')) {
    usagePopOpen.value = false;
  }
};

onMounted(() => document.addEventListener('click', onDocumentClick));
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  clearUsageTimer();
});

/* 输入框自动增高。⚠️ 三条纪律（2026-10-08 复核）：
   1. `height='auto'` 之后**必须无条件写回** —— 写「next 相等就 return」会把元素永久留在
      auto，内容超过上限后掉回 `rows` 固有高度；
   2. **上限只声明在 CSS 的 `max-height`**（现为 `min(40vh, 340px)`），这里读
      getComputedStyle 取用 —— 不在 JS 写第二份像素值（改上限只动 CSS 一处）；
   3. 空内容时先摘 `placeholder` 再量：浏览器会把折行后的占位文字算进 `scrollHeight`。 */
const autoResize = () => {
  const el = textareaEl.value;
  if (!el) return;
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) el.removeAttribute('placeholder');
  el.style.height = 'auto';
  const maxHeight = parseFloat(getComputedStyle(el).maxHeight);
  const next = Number.isFinite(maxHeight) ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight;
  el.style.height = `${next}px`;
  if (placeholder) el.setAttribute('placeholder', placeholder);
};

watch(
  () => props.modelValue,
  () => {
    // 内容变化（含程序化填入：建议卡 / 预填提问 / 发送后清空）都要重新量一次
    requestAnimationFrame(autoResize);
  },
  { flush: 'post' },
);

/* 面板打开时不再需要斜杠菜单（两者都贴在输入框上方，同时开必重叠） */
watch(
  () => props.slashOpen,
  (open) => {
    if (open) closePanel();
  },
);

defineExpose({
  closePanel,
  /** 供壳的 Esc 分层用：面板是否开着 */
  panelOpen,
  focus: () => textareaEl.value?.focus(),
  autoResize,
  textareaEl,
});
</script>

<style scoped src="./styles/boh-composer.css"></style>

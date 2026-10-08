<template>
  <div
    ref="scrollEl"
    class="boh-stream"
    :class="{ 'is-island': overlayMode }"
    @scroll="emit('scroll')"
  >
    <div class="boh-stream-pad">
      <BohEmptyState
        v-if="isEmpty"
        :standalone="standalone"
        :overlay-mode="overlayMode"
        :surface="surface"
        :standalone-suggestions="standaloneSuggestions"
        :quick-suggestions="quickSuggestions"
        @pick="(text) => emit('pick-suggestion', text)"
      />

      <button
        v-if="hiddenCount > 0"
        type="button"
        class="boh-load-earlier"
        @click="emit('show-more')"
      >
        显示更早 {{ hiddenCount }} 条消息
      </button>

      <div
        v-for="{ message: msg, index: idx } in messages"
        :key="msg.id || idx"
        class="boh-msg"
        :class="msg.role === 'user' ? 'is-user' : 'is-ai'"
        :data-message-index="idx"
      >
        <!-- ── 用户：气泡（右下角单独 4px，DESIGN §2.3） ── -->
        <div v-if="msg.role === 'user'" class="boh-bubble">{{ msg.content }}</div>

        <!-- ── AI：正文 + 工具行 + 来源 chip ──
             2026-10-08 用户口径：「对话流中不再出现 BOHAI」—— 原来每条 AI 回复头顶有
             一行「[logo] BOH AI + 删除键」，现整行去掉，回复直接以正文开头（纯文字流）。
             删除键并入底部操作行（与复制/赞同同排），语义更贴切：它本来就是消息操作。 -->
        <template v-else>
          <div v-if="webActive(idx, msg) || communityActive(idx, msg)" class="boh-search-status">
            <!-- 联网搜索：**纯文本活动行**（2026-10-08 用户口径，参考 Grok 的活动列表 ——
                 不要卡片框）。检索在途：「网页搜索」四字配流动光效；结果一到位立即轮换展示
                 网页标题（搜索是单请求一次性返回，到达即「实时」）。默认折叠，
             点行展开全部网页（纯文本行，可点出原文）。⚠️ 不用 aria-live：标题 2.4s 一换会刷屏读屏。 -->
            <div
              v-if="webActive(idx, msg)"
              class="boh-search-row is-web"
              role="group"
              aria-label="Web Searching"
            >
              <button
                type="button"
                class="boh-search-head"
                :aria-expanded="webSearchExpanded"
                :title="webSearchExpanded ? '收起网页列表' : '展开网页列表'"
                @click="webSearchExpanded = !webSearchExpanded"
              >
                <Globe :size="13" class="boh-search-ico" aria-hidden="true" />
                <span
                  :key="webSearchRotateIndex"
                  class="boh-search-line"
                  :class="{ 'is-shimmer': webSearchActive }"
                  >{{ webSearchLine }}</span
                >
                <ChevronDown
                  :size="14"
                  class="boh-search-chevron"
                  :class="{ 'is-open': webSearchExpanded }"
                  aria-hidden="true"
                />
              </button>
              <ul v-show="webSearchExpanded" class="boh-search-pages">
                <li
                  v-for="(page, pageIndex) in webSearchResults"
                  :key="page.url || `page-${pageIndex}`"
                >
                  <span class="boh-search-page-idx" aria-hidden="true">{{ pageIndex + 1 }}</span>
                  <a
                    v-if="page.url"
                    :href="page.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="page.title"
                    >{{ page.title || hostOf(page.url) }}</a
                  >
                  <span v-else class="boh-search-page-title">{{ page.title }}</span>
                  <em v-if="hostOf(page.url)" aria-hidden="true">{{ hostOf(page.url) }}</em>
                </li>
              </ul>
            </div>
            <div
              v-if="communityActive(idx, msg)"
              class="boh-search-row"
              role="status"
              aria-live="polite"
              aria-label="Community Searching"
            >
              <MessagesSquare :size="13" class="boh-search-ico" aria-hidden="true" />
              <span class="boh-search-line">正在读取近日帖子</span>
            </div>
          </div>

          <div v-if="actionNotes(msg).length" class="boh-action-notes">
            <p v-for="note in actionNotes(msg)" :key="note">{{ note }}</p>
          </div>

          <!-- 任务 / 计划面板（壳计算好模型，这里只渲染） -->
          <section
            v-if="planCard && planCard.visible && idx === lastAssistantIndex"
            class="boh-plan"
            :class="`is-${planCard.statusId}`"
            aria-label="任务执行状态"
          >
            <div class="boh-plan-head">
              <span class="boh-plan-state" aria-hidden="true">
                <LoaderCircle v-if="planCard.statusId === 'running'" :size="17" />
                <CheckCircle2 v-else-if="planCard.statusId === 'completed'" :size="17" />
                <AlertCircle v-else-if="planCard.statusId === 'failed'" :size="17" />
                <Square v-else-if="planCard.statusId === 'cancelled'" :size="14" />
                <Circle v-else :size="16" />
              </span>
              <div class="boh-plan-heading">
                <div class="boh-plan-title-row">
                  <strong>{{ planCard.title }}</strong>
                  <span class="boh-plan-status-label">{{ planCard.statusLabel }}</span>
                </div>
                <span>{{ planCard.subtitle }}</span>
              </div>
              <button
                type="button"
                class="boh-plan-toggle"
                :aria-expanded="planCard.expanded"
                :title="planCard.expanded ? '收起任务步骤' : '展开任务步骤'"
                @click="emit('toggle-plan')"
              >
                <ChevronDown :size="16" aria-hidden="true" />
              </button>
            </div>
            <div
              class="boh-plan-progress"
              role="progressbar"
              aria-label="任务进度"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="planCard.progress"
            >
              <span :style="{ width: `${planCard.progress}%` }"></span>
            </div>
            <div class="boh-plan-meta">
              <span>{{ planCard.summary }}</span>
              <span v-if="planCard.elapsed">{{ planCard.elapsed }}</span>
            </div>
            <div v-show="planCard.expanded" class="boh-plan-list">
              <div
                v-for="todo in planCard.items"
                :key="todo.id"
                class="boh-plan-item"
                :class="`is-${todo.state}`"
              >
                <span class="boh-plan-check">
                  <CheckCircle2 v-if="todo.state === 'done'" :size="16" />
                  <LoaderCircle v-else-if="todo.state === 'active'" :size="16" />
                  <AlertCircle v-else-if="todo.state === 'failed'" :size="16" />
                  <Square v-else-if="todo.state === 'cancelled'" :size="13" />
                  <Circle v-else :size="16" />
                </span>
                <span class="boh-plan-copy">
                  <strong>{{ todo.title }}</strong>
                  <span>{{ todo.detail }}</span>
                </span>
              </div>
            </div>
            <div
              v-if="planCard.statusId === 'running' || planCard.statusId === 'failed'"
              class="boh-plan-actions"
            >
              <button
                v-if="planCard.statusId === 'running'"
                type="button"
                @click="emit('stop-plan')"
              >
                <Square :size="13" />停止任务
              </button>
              <button v-else type="button" @click="emit('retry-plan')">
                <RotateCcw :size="14" />重新尝试
              </button>
            </div>
          </section>

          <div class="boh-ai-body" v-html="renderMarkdown(stripAiQuestion(msg.content))"></div>

          <div
            v-if="traceSources(msg).some((source) => source.ok)"
            class="boh-chips"
            aria-label="本次回答来源"
          >
            <span
              v-for="source in traceSources(msg)
                .filter((item) => item.ok)
                .slice(0, 4)"
              :key="source.connectorId || source.label"
              class="boh-chip"
              :title="source.evidenceRefs?.join(' ') || ''"
            >
              <i>{{ prefixOf(source) }}</i
              >{{ source.label || source.source
              }}<template v-if="source.total"> ×{{ source.total }}</template>
            </span>
          </div>

          <div v-if="inlineQuestion && inlineQuestion.messageIndex === idx" class="boh-inline-q">
            <div class="boh-inline-q-title">{{ inlineQuestion.question }}</div>
            <div class="boh-inline-q-options">
              <button
                v-for="(option, optionIndex) in inlineQuestion.options"
                :key="optionIndex"
                type="button"
                class="boh-inline-q-option"
                :class="{ 'is-selected': inlineAnswer === option }"
                @click="emit('inline-select', option)"
              >
                <span class="boh-inline-q-icon">
                  <CheckCircle2 v-if="inlineAnswer === option" :size="16" />
                  <Circle v-else :size="16" />
                </span>
                <span class="boh-inline-q-text">{{ option }}</span>
              </button>
            </div>
            <div class="boh-inline-q-custom">
              <div class="boh-inline-q-divider"><span>或者自己填写</span></div>
              <textarea
                class="boh-inline-q-input"
                :value="inlineAnswer"
                placeholder="输入你的回答..."
                rows="2"
                :disabled="isLoading"
                @input="emit('update:inlineAnswer', $event.target.value)"
                @keydown.enter="emit('inline-enter', $event)"
              ></textarea>
            </div>
            <div class="boh-inline-q-actions">
              <button
                type="button"
                class="boh-inline-q-submit"
                :disabled="!inlineAnswer.trim() || isLoading"
                @click="emit('inline-submit')"
              >
                发送回答
              </button>
            </div>
          </div>

          <div
            v-if="showThinkingDot(idx)"
            class="boh-thinking"
            aria-live="polite"
            aria-label="正在处理"
          >
            <span class="boh-thinking-dot" aria-hidden="true"></span>
          </div>
        </template>

        <!-- ── 回复操作 ── -->
        <div
          v-if="msg.role === 'assistant' && !isGenerationBusy(idx)"
          class="boh-msg-actions"
          aria-label="回复操作"
        >
          <button
            type="button"
            class="boh-msg-action"
            title="复制"
            @click="emit('copy-message', msg.content)"
          >
            <Copy :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="boh-msg-action"
            title="赞同"
            :class="{ 'is-active': feedback[idx] === 'up' }"
            @click="emit('feedback', idx, 'up')"
          >
            <ThumbsUp :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="boh-msg-action"
            title="不赞同"
            :class="{ 'is-active': feedback[idx] === 'down' }"
            @click="emit('feedback', idx, 'down')"
          >
            <ThumbsDown :size="15" aria-hidden="true" />
          </button>
          <button
            v-if="showDetails"
            type="button"
            class="boh-msg-action"
            title="更多"
            :class="{ 'is-active': detailsOpen.has(idx) }"
            @click="emit('toggle-details', idx)"
          >
            <MoreHorizontal :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="boh-msg-action is-danger"
            title="删除此消息"
            aria-label="删除此消息"
            @click="emit('delete-message', idx)"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>

        <div v-if="detailsOpen.has(idx)" class="boh-meta">
          <div v-if="trace(msg)" class="boh-meta-sec">
            <strong>检索观察</strong>
            <p>{{ traceSummary(msg) }}</p>
            <div v-if="traceSources(msg).length" class="boh-meta-chips">
              <span
                v-for="source in traceSources(msg)"
                :key="source.connectorId || source.label"
                class="boh-meta-chip"
                :class="{ 'is-failed': !source.ok }"
              >
                {{ source.label || source.source }} ·
                {{ source.ok ? `${source.total || 0}条` : '失败' }}
              </span>
            </div>
          </div>
          <div v-if="actionAudit(msg)" class="boh-meta-sec">
            <strong>动作审计</strong>
            <p>{{ formatActionAudit(actionAudit(msg)) }}</p>
          </div>
          <div v-if="!trace(msg) && !actionAudit(msg)" class="boh-meta-sec">
            <p>这条回复没有可展示的检索或动作记录。</p>
          </div>
        </div>
      </div>
    </div>

    <nav v-if="navItems.length > 1" class="boh-jump" aria-label="用户消息导航">
      <button
        v-for="item in navItems"
        :key="item.index"
        type="button"
        class="boh-jump-item"
        :class="{ 'is-active': activeNavIndex === item.index }"
        :title="item.fullText"
        @click="emit('jump', item.index)"
      >
        <span class="boh-jump-label">{{ item.label }}</span>
        <span class="boh-jump-mark" aria-hidden="true"></span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  LoaderCircle,
  MessagesSquare,
  MoreHorizontal,
  RotateCcw,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-vue-next';
import BohEmptyState from './BohEmptyState.vue';
import { renderMarkdown } from './boh-markdown.js';
import { sourcePrefix } from './boh-sources.js';
import { formatBohAIRetrievalTraceSummary } from '@/utils/bohai-observability.js';

/**
 * BohChatStream.vue — 消息流（plans/025 v2 · Step 6-3）
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `§5 消息流` 段（`.boh-stream` / `.boh-stream-pad` /
 * `.msg` / `.bubble` / `.ai-head` / `.tool-row` / `.ai-body` / `.src-chips` / `.chip` /
 * `.codeblock` / `.typing` / `.quote`）。
 *
 * **状态全在壳（`BOHAIMain.vue`）里**，本组件是纯展示层：`props` 进、`emits` 出。
 * 只有「纯展示计算」留在本地（markdown 渲染 / 来源 chip 前缀 / 备注过滤 / 审计文案）。
 *
 * ⚠️ 两件**不许丢**的东西（随块搬进来的，不是新功能）：
 *   1. 任务/计划面板（原 `.plan-todo-card`）—— 模型由壳算好（`planCard`）传进来；
 *   2. 内联追问（原 `.ai-question-inline`）—— 原 `【追问】` 解析仍在壳里。
 *
 * ⚠️ 断点与基座同文件（`components/styles/boh-stream.css`）—— 见 `styles/layout.css` 头。
 */
const props = defineProps({
  /** `[{ message, index }]`（壳已按可见上限切好） */
  messages: { type: Array, default: () => [] },
  hiddenCount: { type: Number, default: 0 },
  isThinking: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  webSearchActive: { type: Boolean, default: false },
  /** 本轮联网搜索命中的网页（{title, url}）—— 真源在 useWebSearchLifecycle，壳透传 */
  webSearchResults: { type: Array, default: () => [] },
  communitySearchActive: { type: Boolean, default: false },
  /** 任务 / 计划面板模型；`visible:false` 时不渲染 */
  planCard: { type: Object, default: null },
  /** 内联追问 `{ question, options, messageIndex }` */
  inlineQuestion: { type: Object, default: null },
  inlineAnswer: { type: String, default: '' },
  feedback: { type: Object, default: () => ({}) },
  detailsOpen: { type: Object, default: () => new Set() },
  showDetails: { type: Boolean, default: false },
  navItems: { type: Array, default: () => [] },
  activeNavIndex: { type: Number, default: -1 },
  surface: { type: String, default: 'chat' },
  standalone: { type: Boolean, default: false },
  overlayMode: { type: Boolean, default: false },
  standaloneSuggestions: { type: Array, default: () => [] },
  quickSuggestions: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'pick-suggestion',
  'show-more',
  'scroll',
  'jump',
  'delete-message',
  'copy-message',
  'feedback',
  'toggle-details',
  'inline-select',
  'inline-submit',
  'inline-enter',
  'update:inlineAnswer',
  'toggle-plan',
  'stop-plan',
  'retry-plan',
]);

const scrollEl = ref(null);

/* 壳需要这个滚动容器做「贴底 / 跳转 / 激活项」——通过 ref 暴露，避免壳再包一层 DOM。 */
defineExpose({ scrollEl });

const isEmpty = computed(() => props.messages.length === 0);

const lastAssistantIndex = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i -= 1) {
    if (props.messages[i]?.message?.role === 'assistant') return props.messages[i].index;
  }
  return -1;
});

/* ── 纯展示计算（原壳里同名逻辑，逐字保留口径） ── */

/* 联网搜索面板的可见窗口 = **整轮生成**（isLoading）：搜索在途时显示检索文案，
   结果一到位立即轮换标题 —— 若只挂在 webSearchActive（请求在途）上，标题出现的
   那一刻面板就消失了，轮换根本看不见。上一条 assistant 消息才显示。 */
const webActive = (index, message) =>
  (props.webSearchActive || props.webSearchResults.length > 0) &&
  props.isLoading &&
  index === props.messages.length - 1 &&
  message?.role === 'assistant';

const communityActive = (index, message) =>
  props.communitySearchActive &&
  props.isThinking &&
  index === props.messages.length - 1 &&
  message?.role === 'assistant';

/* ── 思考黑点的**分相门控**（2026-10-08 用户口径）：
   「网络搜索的时候不显示黑点动画，只有模型思考和回复的时候才显示黑点」——
   · 联网搜索在途（webSearchActive 的窗口 = 请求发出 → 响应返回）→ 无黑点；
   · 搜索结束后（模型思考）与流式回复中（isThinking 翻 false 但 isLoading 仍在）→ 黑点。
   ⚠️ isThinking 从发送保持到首个可见 token（含搜索期），所以不能只看它。
   ⚠️ communitySearchActive **不进**门控：它从检索开始挂到整轮结束（不止请求窗口），
      进门控会让社区类问题的黑点整轮消失 —— 社区搜索的行为保持原样。 */
const showThinkingDot = (index) =>
  (props.isThinking || props.isLoading) &&
  !props.webSearchActive &&
  index === props.messages.length - 1;

/** 整轮生成忙（含搜索期）—— 操作行在忙时隐藏（否则流式回复中黑点和操作行同时出现）。 */
const isGenerationBusy = (index) =>
  (props.isThinking || props.isLoading) && index === props.messages.length - 1;

/* ── 联网搜索：标题轮换 + 折叠 ── */
const webSearchExpanded = ref(false);
const webSearchRotateIndex = ref(0);
let rotateTimer = null;

const stopTitleRotation = () => {
  if (rotateTimer) {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
};

const startTitleRotation = () => {
  stopTitleRotation();
  rotateTimer = setInterval(() => {
    const total = props.webSearchResults.length;
    if (total > 1) webSearchRotateIndex.value = (webSearchRotateIndex.value + 1) % total;
  }, 2400);
};

watch(
  () => [props.isLoading, props.webSearchResults.length, webSearchExpanded.value],
  ([loading, total, expanded]) => {
    if (loading && total > 1 && !expanded) startTitleRotation();
    else stopTitleRotation();
    // 一轮结束/展开清单时收轮换；新一轮标题进来时把游标归零，从第一条开始转
    if (total > 0) webSearchRotateIndex.value = webSearchRotateIndex.value % total;
  },
  { immediate: true },
);

onUnmounted(stopTitleRotation);

const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const webSearchLine = computed(() => {
  const items = props.webSearchResults;
  // 检索在途 / 无结果：纯文字「网页搜索」（配流动光效，见 .is-shimmer）
  if (!items.length) return '网页搜索';
  const current = items[webSearchRotateIndex.value % items.length];
  return current?.title || hostOf(current?.url) || '网页搜索';
});

const actionNotes = (msg) => {
  if (!msg || msg.role !== 'assistant') return [];
  const notes = Array.isArray(msg?.meta?.actionNotes) ? msg.meta.actionNotes : [];
  return notes
    .map((note) => String(note || '').trim())
    .filter((note) => note && !/^(?:检索了|搜索了)/u.test(note))
    .slice(0, 4);
};

const trace = (msg) => (msg?.role === 'assistant' ? msg?.meta?.ragTrace || null : null);

const traceSources = (msg) => {
  const value = trace(msg);
  return Array.isArray(value?.connectors) ? value.connectors : [];
};

const traceSummary = (msg) => formatBohAIRetrievalTraceSummary(trace(msg));

const actionAudit = (msg) => (msg?.role === 'assistant' ? msg?.meta?.actionAudit || null : null);

const formatActionAudit = (audit) => {
  if (!audit) return '';
  const status = audit.ok ? '成功' : '失败';
  const subject = audit.label || audit.actionId || '动作';
  const target = audit.source ? ` · ${audit.source}` : '';
  const detail = audit.ok ? audit.message || '已记录' : audit.errorMessage || '执行失败';
  return `${status} ${subject}${target}：${detail}`;
};

/* 来源 chip 前缀：优先用证据编号首字母（`T1` → `T`），退回 connectorId 映射。
   真源在 `boh-sources.js`（Work 面板共用同一份）。 */
const prefixOf = sourcePrefix;

/* `【追问】` 之后的内容不进正文（正文只留标记之前的部分） */
const AI_QUESTION_MARKER = '【追问】';
const stripAiQuestion = (content) => {
  if (!content) return content;
  const markerIndex = content.indexOf(AI_QUESTION_MARKER);
  if (markerIndex === -1) return content;
  return content.slice(0, markerIndex).trimEnd();
};
</script>

<style scoped src="./styles/boh-stream.css"></style>

<template>
  <!-- tabindex="0"：消息流是**可滚动区域**，里面没有可聚焦元素（AI 正文是纯 v-html），
       不给它 tabindex 时键盘用户根本进不来 —— axe `scrollable-region-focusable` 报的就是这条
       （2026-10-17 全面审查 P1-5）。role="region" + aria-label 让读屏能把它当一块可跳转区域念出来。 -->
  <div
    ref="scrollEl"
    class="boh-stream"
    :class="{ 'is-island': overlayMode }"
    tabindex="0"
    role="region"
    aria-label="对话消息流"
    @scroll="emit('scroll')"
  >
    <div class="boh-stream-pad">
      <Transition name="boh-empty">
        <BohEmptyState
          v-if="isEmpty"
          :standalone="standalone"
          :overlay-mode="overlayMode"
          :surface="surface"
          :standalone-suggestions="standaloneSuggestions"
          :quick-suggestions="quickSuggestions"
          @pick="(text) => emit('pick-suggestion', text)"
        />
      </Transition>

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
          <!-- ── 活动行（2026-10-19 用户口径「始终只显示一个动作」）────────────────
               「正在思考 / 连接社区记忆 / 联网搜索」原来是**三块各自挂载、各自卸下**的节点，
               观感就是同一组流光在两行之间闪。现在合并成**一条**行：此刻展示哪个动作
               由 `boh-activity.js` 的唯一真源算出（`activityStage`），模板里没有第二处判断。
               · 图标位 / 字号 / 单行截断在行内保持不动 —— 切换是**行内文字**交叉淡入
                 （旧行淡出上浮、新行淡入），整行不重建，所以不会把消息流顶得抖一下；
               · 展开面随阶段走：网页搜索/网页检索 → 网页清单；正在思考 → 推理原文；
                 社区读取 → 无可展开内容（于是不出箭头，点了不会没反应）；
               · ⚠️ 不用 aria-live：网页标题 2.4s 一换会刷屏读屏。阶段名由 `aria-label` 给。 -->
          <div
            v-if="activityStage && activityStage !== 'answering'"
            class="boh-search-status"
            :data-activity="activityStage"
            role="group"
            :aria-label="activityAriaLabel"
          >
            <div class="boh-search-row is-web">
              <span class="boh-search-ico-slot">
                <component
                  :is="activityIcon"
                  :key="`ico:${activityStage}`"
                  :size="13"
                  class="boh-search-ico is-swap-in"
                  aria-hidden="true"
                />
              </span>
              <!-- ⚠️ 这里**只能用同一个标签**（button），不可展开时用 `disabled` 表达。
                   别写 `v-if="活动可展开"` + `v-else` 的 button/span 双分支：分支切换会把
                   `<Transition>` 整个换掉，正在离场的那一帧变成孤儿节点（实测停在
                   `leave-active leave-to`、文本永久挡住新文案）。 -->
              <button
                type="button"
                class="boh-search-head"
                :class="{ 'is-static': !activityExpandable }"
                :disabled="!activityExpandable"
                :aria-expanded="activityExpandable ? activityExpanded : undefined"
                :aria-controls="activityExpandable ? activityPanelId : undefined"
                :title="activityTitleTip"
                @click="toggleActivity"
              >
                <!-- 切换动画用「按 key 重挂 + 一次性 keyframes」而不是 <Transition>：
                     Vue 的 Transition 在 `mode="out-in"` 下遇到**同一 tick 内连续换 key**
                     （搜索在途 → 结果到位 → 首 token 这几个状态可能连拍）会把离开中的节点留成
                     孤儿（实测停在 `leave-active leave-to`、文本永久挡住新文案）。
                     一次性 keyframes 自带收尾（`animation-fill-mode: both` 之外不留中间态），
                     即使连续重挂也只是重放，不会留下残影。 -->
                <!-- 两层：外层只负责「进场」(opacity/transform)，内层只负责「流光」
                     (background-clip: text)。两者都要写 `animation`，同一元素上会互相覆盖。 -->
                <span :key="activityLineKey" class="boh-search-line is-swap-in">
                  <span class="boh-search-text" :class="{ 'is-shimmer': activityShimmer }">{{
                    activityLine
                  }}</span>
                </span>
                <ChevronDown
                  v-if="activityExpandable"
                  :size="14"
                  class="boh-search-chevron"
                  :class="{ 'is-open': activityExpanded }"
                  aria-hidden="true"
                />
              </button>

              <!-- 展开面：网页清单（纯文本行，无框无底；可点出原文） -->
              <ul
                v-if="activitySurface === 'web'"
                v-show="activityExpanded"
                :id="activityPanelId"
                class="boh-search-pages"
              >
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

          <!-- 推理过程（2026-10-10 用户口径「纯文本、默认收起、点击展开推理原文」）
               2026-10-19 合并：思考中的「正在思考」**不再单独成行** —— 它就是活动行
               在 `thinking` 阶段的样子（阶段由 `boh-activity.js` 算），这里的推理块
               退化为那条行下的**展开面**（与网页清单同一套 `is-head` 按钮/面板模式）。
               · 生成结束后「思考过程」仍常驻可展开（`hasReasoning`）；
               · 活动行处于网页/社区阶段时，展开面让位（一次只展开一个，不会有两条清单）。
               ⚠️ 正文用 v-show（不是 v-if）—— v-if 会重建节点，滚动位置与探针读取都会抖。 -->
          <div
            v-if="showReasoningPanel(idx, msg)"
            class="boh-reason is-panel"
            :class="{ 'is-live': activityStage === 'thinking' }"
            :id="reasoningPanelId(idx)"
          >
            <div
              v-show="activityStage === 'thinking' || reasoningOpen.has(idx)"
              class="boh-reason-body"
            >
              {{ reasoningOf(msg) }}
            </div>
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
  Globe,
  LoaderCircle,
  MessageSquareText,
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
import {
  BOH_ACTIVITY_SURFACE,
  canExpandActivity,
  formatCommunityActivityLine,
  resolveActivityLine,
  resolveBohActivityStage,
} from './boh-activity.js';
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
  /**
   * 活动行用的社区检索实况：`{ active, postTitle }`。
   * 与上面的 `communitySearchActive`（开关/意图预览）**不同源** —— 那个在检索前就置真、
   * 且挂到整轮结束；这个由 retrieval stage 在连接器结果回来后写，`postTitle` 是
   * 「正在读取《…》」点名用的那一篇。真源：`engine/stages/retrieval.ts`。
   */
  communityActivity: { type: Object, default: () => ({ active: false, postTitle: '' }) },
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

/* ── 展开态（纯 UI 状态，留在本组件）：网页清单 / 推理原文 ──
   ⚠️ 声明必须在下面 `activityExpanded` 之前（computed 求值会先碰到它们）。
   2026-10-19 起两者共用同一条活动行，所以「同一时刻只能展开一个」。 */
const webSearchExpanded = ref(false);
const webSearchRotateIndex = ref(0);
const reasoningOpen = ref(new Set());
const reasoningPanelId = (index) => `boh-reason-${index}`;
const toggleReasoning = (index) => {
  const next = new Set(reasoningOpen.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  reasoningOpen.value = next;
};

/* ── 活动行（2026-10-19）：三块状态 → **唯一一个**正在进行的动作 ──────────────
   判断逻辑全部在 `boh-activity.js`（纯函数，带单测），这里只提供输入与派生展示。 */

/** 本轮社区检索实况（`{ active, postTitle }`，retrieval stage 写） */
const communityLive = computed(() => ({
  active: Boolean(props.communityActivity?.active),
  postTitle: String(props.communityActivity?.postTitle || ''),
}));

/** 社区这一行点名的那一篇（retrieval stage 从论坛连接器取到的标题）。 */
const communityPostTitle = computed(() => communityLive.value.postTitle);

/* 活动行只在**最后一条 AI 消息**上出现；历史消息里不重复播报。 */
const isActivityHost = computed(() => {
  const last = props.messages[props.messages.length - 1];
  return Boolean(last && last.message?.role === 'assistant');
});

/* 「网页标题露过脸了没」—— 结果到位那一刻记一次。
   为什么需要这个计数：`web-results`（展示标题）和 `thinking`（模型推理）同属
   「还没开口」那一段，纯靠优先级排序必然让另一个整段消失（实测两种排法都踩过）。
   所以在这一段里**先露一拍标题，再进思考**。计数只在本轮内有效，`isLoading` 落下就清零。 */
const webTitleRevealed = ref(false);
let revealTimer = 0;
/* 标题**至少**露这么久再切走。不是给探针留窗口 —— 是真的需要：
   结果一到就切「正在思考」时，用户只看到标题闪了一下（甚至一帧都没看清），
   那比不展示更糟。
   ⚠️ 这是**交互节奏**（JS 计时器），不在 `tokens.css` 的 CSS 时长管辖范围内 ——
      那条纪律管的是 CSS 里不许写字面时长；同类的既有先例是本文件的标题轮换 `2400`。
      两者都只服务这一行，别在别处再抄一遍数字。 */
const WEB_TITLE_DWELL_MS = 900;
/* 标题轮换周期（原有行为，2026-10-08 起就是 2400ms）。 */
const WEB_TITLE_ROTATE_MS = 2400;

watch(
  () => [props.webSearchResults.length, props.webSearchActive, props.isLoading],
  ([total, active, loading]) => {
    clearTimeout(revealTimer);
    if (!loading) {
      webTitleRevealed.value = false;
      return;
    }
    // 搜索还在途（`webSearchActive`）：那时展示的是「网页搜索」，不是标题
    if (active || Number(total) <= 0) return;
    if (webTitleRevealed.value) return;
    revealTimer = setTimeout(() => {
      webTitleRevealed.value = true;
    }, WEB_TITLE_DWELL_MS);
  },
  { immediate: true },
);

const activityStage = computed(() => {
  if (!isActivityHost.value) return '';
  return resolveBohActivityStage({
    isThinking: props.isThinking,
    isLoading: props.isLoading,
    webSearchActive: props.webSearchActive,
    webSearchResultCount: props.webSearchResults.length,
    communitySearchActive: communityLive.value.active,
    webTitleRevealed: webTitleRevealed.value,
  });
});

/** 展开面归属：'web'（网页清单）/ 'reason'（推理原文）/ ''（不可展开） */
const activitySurface = computed(() => BOH_ACTIVITY_SURFACE[activityStage.value] || '');

/** 当前展开的网页清单 / 推理原文 —— 一次只允许一个展开面（网页与推理共用这条行）。 */
const activityExpanded = computed(() =>
  activitySurface.value === 'web'
    ? webSearchExpanded.value
    : reasoningOpen.value.has(lastAssistantIndex.value),
);

const activityPanelId = computed(() =>
  activitySurface.value === 'web' ? 'boh-activity-web' : reasoningPanelId(lastAssistantIndex.value),
);

const toggleActivity = () => {
  if (activitySurface.value === 'web') {
    webSearchExpanded.value = !webSearchExpanded.value;
    return;
  }
  if (activitySurface.value === 'reason') toggleReasoning(lastAssistantIndex.value);
};

/** 图标随阶段换（Globe / 对话气泡），**图标位宽度固定** ⇒ 换图标时整行不横向跳。 */
const activityIcon = computed(() => (activitySurface.value === 'web' ? Globe : MessageSquareText));

/** 流光亮带**只跑一个**：网页搜索在途 + 正在思考（2026-10-08 / 10-10 两条口径合流）。 */
const activityShimmer = computed(
  () => activityStage.value === 'web-searching' || activityStage.value === 'thinking',
);

/** 行内文案：网页两阶段轮换标题；社区阶段点名帖子；思考阶段固定「正在思考」。 */
const activityLine = computed(() => {
  const stage = activityStage.value;
  if (stage === 'community') return formatCommunityActivityLine(communityPostTitle.value);
  if (stage === 'web-searching' || stage === 'web-results') {
    return resolveActivityLine(stage, webSearchLine.value);
  }
  return resolveActivityLine(stage);
});

/** 交叉淡入的重放键：换阶段、或网页标题轮换到下一拍，都要重放一次。 */
const activityLineKey = computed(() => {
  const stage = activityStage.value;
  if (stage === 'web-searching' || stage === 'web-results') {
    return `${stage}:${webSearchRotateIndex.value}`;
  }
  return `${stage}:${activityLine.value}`;
});

/** 读屏用：整个活动行的语义标签（阶段名，不带 2.4s 一轮的网页标题，避免刷屏） */
const activityAriaLabel = computed(
  () => `BOH 当前动作：${resolveActivityLine(activityStage.value)}`,
);

const activityTitleTip = computed(() => {
  if (activitySurface.value === 'web')
    return activityExpanded.value ? '收起网页列表' : '展开网页列表';
  if (activitySurface.value === 'reason') {
    return activityExpanded.value ? '收起思考过程' : '展开思考过程';
  }
  return '';
});

/* 推理正文串一次（函数声明在下面 —— 调用时已初始化，不是 TDZ） */
const lastMessageReasoning = computed(() =>
  reasoningOf(props.messages[props.messages.length - 1]?.message),
);

const activityExpandable = computed(() =>
  canExpandActivity(activityStage.value, {
    webPageCount: props.webSearchResults.length,
    hasReasoning: Boolean(lastMessageReasoning.value),
  }),
);

/* ── 推理过程块（2026-10-10 用户口径，2026-10-19 合并为活动行的展开面）──────────
   · 思考态 = 活动行 `thinking` 阶段的文案（纯文本，黑点已退役）；
   · 展开态是**纯 UI 状态**，留在本组件（与 `webSearchExpanded` 同口径），不进壳。
   ⚠️ 数据源 `msg.reasoning` 由生成管线分流而来（useGenerationPipeline 的
      `getThinkingReasoning` → useChatEngine 的 `updateReasoning`）。
   ⚠️ 推理正文用 **`v-show`** 不用 `v-if` —— v-if 会重建节点，滚动位置与探针读取都会抖。 */
const reasoningOf = (message) => String(message?.reasoning || '');

/** 底下的推理面板：有推理内容才挂（生成结束后仍常驻可展开）；活动行在思考阶段时展开。 */
const showReasoningPanel = (index, message) =>
  Boolean(reasoningOf(message)) && index === props.messages.length - 1;

/** 整轮生成忙（含搜索期）—— 操作行在忙时隐藏（否则流式回复中黑点和操作行同时出现）。 */
const isGenerationBusy = (index) =>
  (props.isThinking || props.isLoading) && index === props.messages.length - 1;

/* ── 联网搜索：标题轮换（折叠态见文件上半部分的「展开态」块） ── */
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
  }, WEB_TITLE_ROTATE_MS);
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

onUnmounted(() => {
  stopTitleRotation();
  clearTimeout(revealTimer);
});

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

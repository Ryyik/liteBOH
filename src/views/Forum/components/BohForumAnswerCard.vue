<template>
  <section
    class="boh-forum-answer glass-panel"
    :class="{ 'is-error': isErrorReply }"
    @click="handleCardClick"
  >
    <!-- 头部：BOHAI 标记 + 原句回显（原句进引擎的是干净提问，不是拼好的长 prompt ——
         检索证据走 attachedContext 的 evidenceBlock 进 system prompt，见 script 注释） -->
    <header class="boh-forum-answer-head">
      <span class="boh-forum-answer-mark" aria-hidden="true">
        <Sparkles :size="15" :stroke-width="2" />
      </span>
      <p class="boh-forum-answer-q">{{ question }}</p>
    </header>

    <!-- ① 等待态：点环 + 轮换动作文案（岛同款，文案真源 boh-activity.js）。
         只在「流式已开始、一个字还没出来」时占位；首 token 一到就切回复态。 -->
    <div v-if="showLoading" class="boh-forum-answer-loading" role="status" aria-live="polite">
      <span class="boh-forum-answer-ring" aria-hidden="true">
        <i v-for="n in 8" :key="n" :style="{ '--a': `${(n - 1) * 45}deg`, '--i': n - 1 }"></i>
      </span>
      <span :key="`${shownTitle}:${titleKey}`" class="boh-forum-answer-load-title is-swap-in">{{
        shownTitle
      }}</span>
    </div>

    <!-- ② 回复态：markdown 正文直出，超过封顶高度内部滚动（贴底跟随见 script） -->
    <div v-else ref="bodyRef" class="boh-forum-answer-body" @scroll.passive="onBodyScroll">
      <div
        v-if="answerText"
        class="boh-forum-answer-text"
        :class="{ 'is-error': isErrorReply }"
        v-html="answerHtml"
      ></div>
      <!-- 未登录 / 模型未就绪等导致的空回答兜底：不让卡片开天窗 -->
      <p v-else class="boh-forum-answer-empty">
        这一次没有生成出回答 —— 到
        <button type="button" class="boh-forum-answer-link" @click.stop="openFullConversation">
          完整对话页
        </button>
        查看或重试。
      </p>
    </div>

    <!-- ③ 出口：回答生成完才出现（生成中点卡片也能跳，走根级 click） -->
    <footer
      v-if="!showLoading && answerText && !isErrorReply && !streaming"
      class="boh-forum-answer-foot"
    >
      <button type="button" class="boh-forum-answer-cta" @click.stop="openFullConversation">
        在完整对话页继续聊
        <ArrowUpRight :size="13" :stroke-width="2.2" aria-hidden="true" />
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowUpRight, Sparkles } from 'lucide-vue-next';
import { useChatEngine } from '@/views/BOHAI/composables/useChatEngine.js';
import { BOH_DEFAULT_MODE_ID } from '@/views/BOHAI/composables/chat-engine-config.js';
import {
  BOH_ACTIVITY_LOAD_TITLES,
  formatCommunityActivityLine,
  resolveActivityLine,
  resolveBohActivityStage,
} from '@/views/BOHAI/BOHAI/components/boh-activity.js';
import { renderMarkdown } from '@/views/BOHAI/BOHAI/components/boh-markdown.js';
import { isGenerationErrorText } from '@/views/BOHAI/utils/chatErrorMessages.js';
import { FORUM_TAG_MAP } from '@/views/Forum/forum-config.js';
import { requestBohAISessionOpen } from '@/utils/boh-ai-session-handoff.js';
import { logger } from '@/utils/logger.js';

/**
 * BohForumAnswerCard —— 论坛搜索「问 BOHAI」的内联回答卡片（2026-11-22）。
 *
 * 设计口径（plans 口径定稿）：
 *   · **纯展示**：不带追问输入框；点卡片 → `/ai-chat` 自动打开这条对话继续聊。
 *   · 检索证据不进用户消息：宿主（ForumMain）检索到的帖子经 `evidenceBlock`
 *     （attachedContext → buildPageContextBlock）进 **system prompt**，
 *     引擎里发送的原句干净地落进会话历史 —— 全页交接后看到的是「原句 → 回答」。
 *   · 引擎归属：本组件持有**自己的** useChatEngine 实例（与 BohIslandAnswer 同款先例），
 *     origin='quick-ask' 复用（侧栏「在搜索里问过」分组 / 提升主会话 / 批量清理零改动继承）。
 *     多实例共写 boh_chat_sessions 由写入守卫仲裁（bohai-chat-session-store.js）；
 *     组件卸载时引擎经 onScopeDispose 自行中止流。
 *   · 本组件由宿主经 createPanelAsync **懒加载**：它 import 了 boh-markdown
 *     （markdown-vendor + ui-sanitize），静态引入会把这两个 chunk 拽进 ForumMain 图
 *     （BohIsland.vue 头注释的前车之鉴）。
 *
 * 已知债务：贴底跟随与驻留轮换是岛内实现（BohIslandAnswer）的第二份。
 * 岛被 probe-nav-ask / boh-island-flow 锁定，本次刻意不动它；两处统一时
 * 应抽成共享 composable（同 plans/021 对 useAutoGrowTextarea 的收敛路径）。
 */
const props = defineProps({
  /** 用户搜索框里的原句（也是引擎里那条 user message 的内容） */
  question: { type: String, required: true },
  /** 宿主检索到的相关帖（≤5 条；空数组 = 没检索到，给建议发帖口径） */
  posts: { type: Array, default: () => [] },
});

const router = useRouter();
const engine = useChatEngine();

/* ---------------- 检索证据 → evidenceBlock（进 system prompt，不进用户消息） ---------------- */

const EXCERPT_MAX_CHARS = 120;

const buildPostLine = (post, index) => {
  const title = String(post?.title || '').trim() || '（无标题）';
  const excerpt = String(post?.content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, EXCERPT_MAX_CHARS);
  const tagLabel = FORUM_TAG_MAP[post?.tag]?.label || '';
  const author = String(post?.author_username || post?.username || '').trim();
  const meta = [tagLabel ? `（${tagLabel}）` : '', author ? ` —— 作者：${author}` : '']
    .join('')
    .trim();
  return `${index + 1}. 《${title}》${meta}\n   ${excerpt || '（无正文摘要）'}`;
};

const buildEvidenceBlock = (posts) => {
  const rows = Array.isArray(posts) ? posts.slice(0, 5) : [];
  if (!rows.length) {
    return [
      '论坛数据库中没有检索到与用户问题直接相关的帖子。',
      '',
      '回答口径：请用中文简洁回答用户的问题；如果问题适合社区讨论，可以建议用户发一个带 #提问 标签的帖子来获得更多帮助。',
    ].join('\n');
  }
  return [
    '论坛数据库中检索到的相关帖子（按相关度排序）：',
    ...rows.map((post, index) => buildPostLine(post, index)),
    '',
    '回答口径：请基于以上论坛内容，用中文简洁回答用户的问题：相关内容充分就归纳作答并点出可参考的帖子标题；不够就如实说明，再补充你自己的知识。',
  ].join('\n');
};

/* ---------------- 会话与消息 ---------------- */

const streaming = computed(() => engine.isLoading.value === true);

const messages = computed(() => engine.messages.value || []);

const lastAssistant = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const m = messages.value[i];
    if (m?.role === 'assistant') return m;
  }
  return null;
});

const answerText = computed(() => String(lastAssistant.value?.content || '').trim());

const answerHtml = computed(() => (answerText.value ? renderMarkdown(answerText.value) : ''));

/** 失败提示（速率限制等）不是可继续聊的回答：样式化 + 不挂 CTA（岛同款口径） */
const isErrorReply = computed(() => isGenerationErrorText(answerText.value));

const showLoading = computed(() => streaming.value && !answerText.value);

/* ---------------- 活动行（真源 = boh-activity.js，岛同款时态改写） ---------------- */

const activityStage = computed(() => {
  if (!streaming.value) return '';
  return (
    resolveBohActivityStage({
      isThinking: engine.isThinking.value === true,
      isLoading: true,
      webSearchActive: engine.webSearchActive.value === true,
      webSearchResultCount: (engine.webSearchResults.value || []).length,
      communitySearchActive: engine.communitySearchActive.value === true,
    }) || ''
  );
});

const activityLine = computed(() => {
  const stage = activityStage.value;
  if (!stage) return '';
  return resolveActivityLine(
    stage,
    stage === 'community'
      ? formatCommunityActivityLine(engine.communityActivity.value?.postTitle)
      : '',
  );
});

const loadingTitle = computed(
  () => BOH_ACTIVITY_LOAD_TITLES[activityStage.value] || activityLine.value || '正在思考…',
);

/* ---------------- 动作文案的驻留轮换（岛同款交互节奏，作用注释见 BohIslandAnswer） ---------------- */

const TITLE_DWELL_MS = 640;

const shownTitle = ref(String(loadingTitle.value || ''));
const titleKey = ref(0);
let titleShownAt = Date.now();
let titleTimer = 0;

const commitTitle = (text) => {
  const next = String(text || '');
  if (!next || next === shownTitle.value) return;
  clearTimeout(titleTimer);
  shownTitle.value = next;
  titleKey.value += 1;
  titleShownAt = Date.now();
};

watch(loadingTitle, (next) => {
  if (!showLoading.value) return;
  const text = String(next || '');
  if (!text || text === shownTitle.value) return;
  clearTimeout(titleTimer);
  const wait = Math.max(0, TITLE_DWELL_MS - (Date.now() - titleShownAt));
  if (wait === 0) {
    commitTitle(text);
    return;
  }
  titleTimer = setTimeout(() => commitTitle(loadingTitle.value), wait);
});

watch(showLoading, (loading) => {
  if (!loading) return;
  clearTimeout(titleTimer);
  shownTitle.value = String(loadingTitle.value || '');
  titleKey.value += 1;
  titleShownAt = Date.now();
});

/* ---------------- 贴底跟随：贴着底就继续贴，用户往上翻了就不打扰（岛同款纪律） ---------------- */

const STICK_THRESHOLD = 48;

let stickBottom = true;
let lastPinAt = 0;

const bodyRef = ref(null);

const onBodyScroll = () => {
  const el = bodyRef.value;
  if (!el) return;
  if (Date.now() - lastPinAt < 160) return;
  stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
};

const pinToBottom = async () => {
  if (!stickBottom) return;
  await nextTick();
  const el = bodyRef.value;
  if (!el) return;
  lastPinAt = Date.now();
  el.scrollTop = el.scrollHeight;
};

watch(answerText, () => {
  void pinToBottom();
});

// 加载态 → 回复态：滚动容器这一帧才挂载（v-if/v-else 另一支），必须补一次贴底
watch(showLoading, (loading) => {
  if (!loading) void pinToBottom();
});

let bodyObserver = null;

watch(bodyRef, (el) => {
  bodyObserver?.disconnect();
  bodyObserver = null;
  if (!el || typeof ResizeObserver !== 'function') return;
  bodyObserver = new ResizeObserver(() => {
    void pinToBottom();
  });
  bodyObserver.observe(el);
  void pinToBottom();
});

/* ---------------- 出口：点卡片 → 停流 → 强制落盘 → 交接 → 全页 ---------------- */

/**
 * 点卡片跳全页。三条硬口径：
 *   ① 流式中先 stopGeneration：ForumMain 双层 keepAlive（路由级 + shell 内层），
 *      跳走后卡片引擎还活着、流会继续 —— 交接要的是「现在」这条会话的落盘状态，
 *      中止让 finally 立即收尾（partial 内容保留为 generationStoppedWithContent）；
 *   ② flushSessionsToStorage：落盘平时是 500ms 防抖 + idle 排队，交接按 timestamp
 *      在存储里找会话，防抖窗口内裸跳会让全页扑空；
 *   ③ requestBohAISessionOpen + push：消费方在 useBohShell 的 onMounted/onActivated。
 */
const openFullConversation = () => {
  if (streaming.value) engine.stopGeneration();
  engine.flushSessionsToStorage();
  const session = engine.chatSessions[engine.currentSessionIndex.value];
  const timestamp = session?.timestamp;
  if (!timestamp || !requestBohAISessionOpen(timestamp)) {
    logger.warn('forum-bohai-card', '会话交接登记失败，退化为裸跳', { timestamp });
  }
  router.push('/ai-chat');
};

const handleCardClick = (event) => {
  // 链接 / 按钮自己处理（markdown 正文里的外链、CTA、兜底按钮）
  if (event.target.closest?.('a, button')) return;
  // 拖选文本的 mouseup 也算 click —— 选了内容是在复制，不是想跳页
  const selection =
    typeof window.getSelection === 'function' ? String(window.getSelection() || '') : '';
  if (selection.trim()) return;
  openFullConversation();
};

/* ---------------- 发问 ---------------- */

onMounted(async () => {
  // 快速会话（§3.4 同款）：origin 复用 'quick-ask'，侧栏分组 / 清理零改动继承
  engine.startNewChat('quick-ask');
  // 岛同款档位契约：卡片没有模型选择 UI，恒走 balance（唯一实现处 BohIslandAnswer 的先例）
  const modeIds = (engine.chatModes?.value || []).map((mode) => mode.id);
  if (!modeIds.length || modeIds.includes(BOH_DEFAULT_MODE_ID)) {
    engine.currentModeId.value = BOH_DEFAULT_MODE_ID;
  }
  engine.setAttachedContext({ evidenceBlock: buildEvidenceBlock(props.posts) });
  engine.inputMessage.value = String(props.question || '').trim();
  try {
    await engine.sendMessage();
  } catch (error) {
    // sendMessage 内部已把可恢复错误写进助手消息；这里只兜真正的异常
    logger.warn('forum-bohai-card', '内联提问失败', error);
  }
});

onBeforeUnmount(() => {
  clearTimeout(titleTimer);
  bodyObserver?.disconnect();
  bodyObserver = null;
});
</script>

<style scoped>
/* 材质走论坛全局 .glass-panel（base.css，暗色由 forum-dark.css 接管）；
   文字一律 --liquid-text-* token（check:dark-tokens:strict：不许裸色值）。 */
.boh-forum-answer {
  margin: 0 0 14px;
  padding: 14px 16px 12px;
  border-radius: 20px;
  cursor: pointer;
  color: var(--liquid-text-primary);
}

.boh-forum-answer-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.boh-forum-answer-mark {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  color: var(--liquid-text-secondary);
  background: color-mix(in srgb, var(--liquid-text-primary) 6%, transparent);
}

.boh-forum-answer-q {
  margin: 0;
  padding-top: 3px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--liquid-text-primary);
  overflow-wrap: anywhere;
}

/* 等待态：点环 + 轮换文案（结构同岛 .boh-ring，颜色走 currentColor 适配主题） */
.boh-forum-answer-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  color: var(--liquid-text-secondary);
}

.boh-forum-answer-ring {
  position: relative;
  display: inline-block;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.boh-forum-answer-ring i {
  position: absolute;
  top: 0;
  left: 50%;
  width: 2.5px;
  height: 5px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.28;
  transform: rotate(var(--a)) translateY(-2px);
  transform-origin: 50% 7px;
  animation: bohForumRingFade 1.2s linear calc(var(--i) * 0.15s) infinite;
}

@keyframes bohForumRingFade {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0.28;
  }
}

.boh-forum-answer-load-title {
  font-size: 13px;
  line-height: 1.5;
  color: var(--liquid-text-secondary);
}

.boh-forum-answer-load-title.is-swap-in {
  animation: bohForumTitleSwap 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes bohForumTitleSwap {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 回复态：全文直出 + 内部滚动（滚动条隐藏，底部渐隐收边由 max-height 自然裁切） */
.boh-forum-answer-body {
  max-height: min(320px, 38dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  font-size: 14px;
  line-height: 1.65;
}

.boh-forum-answer-body::-webkit-scrollbar {
  display: none;
}

.boh-forum-answer-text {
  color: var(--liquid-text-primary);
  overflow-wrap: anywhere;
}

.boh-forum-answer-text :deep(p) {
  margin: 0 0 8px;
}

.boh-forum-answer-text :deep(p:last-child) {
  margin-bottom: 0;
}

.boh-forum-answer-text :deep(ul),
.boh-forum-answer-text :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}

.boh-forum-answer-text :deep(a) {
  color: var(--liquid-text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.boh-forum-answer-text :deep(code) {
  font-size: 12.5px;
  padding: 1px 5px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--liquid-text-primary) 7%, transparent);
}

.boh-forum-answer-text :deep(pre) {
  margin: 0 0 8px;
  padding: 10px 12px;
  border-radius: 10px;
  overflow-x: auto;
  background: color-mix(in srgb, var(--liquid-text-primary) 7%, transparent);
}

.boh-forum-answer-text.is-error {
  color: var(--liquid-text-secondary);
  font-size: 13px;
}

.boh-forum-answer-empty {
  margin: 0;
  font-size: 13px;
  color: var(--liquid-text-tertiary);
}

.boh-forum-answer-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--liquid-text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.boh-forum-answer-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.boh-forum-answer-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--liquid-text-primary) 14%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--liquid-text-primary) 5%, transparent);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--liquid-text-primary);
  cursor: pointer;
  transition: background 160ms ease;
}

.boh-forum-answer-cta:active {
  background: color-mix(in srgb, var(--liquid-text-primary) 10%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .boh-forum-answer-ring i {
    animation: none;
  }

  .boh-forum-answer-load-title.is-swap-in {
    animation: none;
  }
}
</style>

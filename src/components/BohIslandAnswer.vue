<template>
  <div class="boh-answer">
    <!-- 输入条：与 GlobalSearchIsland 的 .gs-bar 同几何（岛顶第一个子元素）。
         F2 里语义是「追问」（§3.3 输入条永不清空语义）；流式中显示停止按钮 -->
    <div class="boh-answer-bar">
      <button
        v-if="streaming"
        type="button"
        class="boh-answer-stop"
        aria-label="停止生成"
        title="停止生成"
        @click="stop"
      >
        <Square :size="13" :stroke-width="2.4" aria-hidden="true" />
      </button>
      <Sparkles v-else :size="15" class="boh-answer-spark" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="draft"
        type="text"
        class="boh-answer-input"
        :placeholder="streaming ? '生成中，可停止…' : '追问，或按 Esc 回到搜索'"
        aria-label="追问"
        autocomplete="off"
        spellcheck="false"
        :disabled="streaming"
        @keydown="handleKeydown"
      />
    </div>

    <div class="boh-answer-body">
      <!-- 问题回显：一行小字（§3.5） -->
      <p v-if="lastQuestion" class="boh-q-echo">{{ lastQuestion }}</p>

      <!-- 活动行：唯一真源 = boh-activity.js，流式结束后整行消失 -->
      <p v-if="activityLine" class="boh-activity" role="status">
        <span class="boh-activity-dot" aria-hidden="true"></span>{{ activityLine }}
      </p>

      <!-- 回答正文：markdown 安全渲染；首屏 5–6 行渐隐 + 展开全文（§3.5） -->
      <div
        v-show="answerText"
        ref="answerRef"
        class="boh-answer-text"
        :class="{ clipped: !expanded && overflows }"
        v-html="answerHtml"
      ></div>
      <button
        v-if="overflows || expanded"
        type="button"
        class="boh-expand"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : '展开全文' }}
      </button>

      <!-- 来源：合并成一行 chip（§3.5），展开才看清单 -->
      <div v-if="webSources.length" class="boh-sources">
        <button
          type="button"
          class="boh-sources-chip"
          :aria-expanded="sourcesOpen"
          @click="sourcesOpen = !sourcesOpen"
        >
          网页 {{ webSources.length }}
          <ChevronDown :size="12" :class="{ flip: sourcesOpen }" aria-hidden="true" />
        </button>
        <ul v-if="sourcesOpen" class="boh-sources-list">
          <li v-for="(s, i) in webSources" :key="i">
            <a :href="s.url" target="_blank" rel="noopener">{{ s.title || s.url }}</a>
          </li>
        </ul>
      </div>

      <!-- 未登录 / 配置缺失等导致的空回答兜底：不让回答面开天窗 -->
      <p v-if="!streaming && !answerText && lastQuestion" class="boh-answer-empty">
        这一次没有生成出回答 —— 回答的完整形态（含模型选择与工具）请到
        <button type="button" class="boh-link" @click="goFullPage">完整页面</button>查看。
      </p>
    </div>

    <div class="boh-answer-foot">
      <span class="boh-foot-hint">快速会话 · 全页可续聊</span>
      <button type="button" class="boh-foot-btn" @click="goFullPage">
        去全页 <ArrowUpRight :size="12" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowUpRight, ChevronDown, Sparkles, Square } from 'lucide-vue-next';
import { useChatEngine } from '@/views/BOHAI/composables/useChatEngine.js';
import {
  formatCommunityActivityLine,
  resolveActivityLine,
  resolveBohActivityStage,
} from '@/views/BOHAI/BOHAI/components/boh-activity.js';
import { renderMarkdown } from '@/views/BOHAI/BOHAI/components/boh-markdown.js';
import { logger } from '@/utils/logger.js';
import { useBohIsland } from '@/composables/useBohIsland.js';

/**
 * BohIslandAnswer —— plans/038 §3.5 回答面：只做「流 + 来源 + 收起」。
 *
 * ⚠️ 引擎归属：本组件持有**自己的** useChatEngine 实例（快速会话，§3.4 不接主会话）。
 *   多实例共写 `boh_chat_sessions` 由 bohai-chat-session-store.js 的写入守卫仲裁
 *   （/ai-chat KeepAlive 与旧灵动岛共存的同款先例，2026-10-11 建立）。组件卸载时
 *   引擎经 onScopeDispose 自行中止流与定时器（useChatEngine.js:2038）。
 * ⚠️ 不引 BOHAIMain：侧栏/设置/工具/模型选择一律去全页（§3.6 减法清单）。
 */
const props = defineProps({
  /** 关岛（去全页时调用） */
  onClose: { type: Function, default: null },
});

const router = useRouter();
const bohIsland = useBohIsland();
const engine = useChatEngine();

const draft = ref('');
const expanded = ref(false);
const overflows = ref(false);
const sourcesOpen = ref(false);
const inputRef = ref(null);
const answerRef = ref(null);
let overflowTimer = null;

/* ---------------- 会话与消息 ---------------- */

const streaming = computed(() => engine.isLoading.value === true);

const messages = computed(() => engine.messages.value || []);

const lastQuestion = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const m = messages.value[i];
    if (m?.role === 'user' && String(m.content || '').trim()) return String(m.content).trim();
  }
  return '';
});

const lastAssistant = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const m = messages.value[i];
    if (m?.role === 'assistant') return m;
  }
  return null;
});

const answerText = computed(() => String(lastAssistant.value?.content || '').trim());

const answerHtml = computed(() => (answerText.value ? renderMarkdown(answerText.value) : ''));

const webSources = computed(() => {
  const rows = engine.webSearchResults.value;
  return Array.isArray(rows) ? rows.filter((r) => r?.url || r?.title) : [];
});

/* ---------------- 活动行（唯一真源 = boh-activity.js） ---------------- */

const activityLine = computed(() => {
  if (!streaming.value) return '';
  const stage = resolveBohActivityStage({
    isThinking: engine.isThinking.value === true,
    isLoading: true,
    webSearchActive: engine.webSearchActive.value === true,
    webSearchResultCount: webSources.value.length,
    communitySearchActive: engine.communitySearchActive.value === true,
  });
  if (!stage) return '';
  return resolveActivityLine(
    stage,
    stage === 'community'
      ? formatCommunityActivityLine(engine.communityActivity.value?.postTitle)
      : '',
  );
});

/* ---------------- 发送 ---------------- */

/** 岛内发送统一走这里：种子问题与追问同一条路 */
const send = async (text) => {
  const q = String(text || '').trim();
  if (!q || streaming.value) return;
  expanded.value = false;
  overflows.value = false;
  sourcesOpen.value = false;
  engine.inputMessage.value = q;
  draft.value = '';
  try {
    await engine.sendMessage();
  } catch (error) {
    logger.warn('boh-island', '岛内发送失败', error);
  }
};

const stop = () => {
  engine.stopGeneration();
};

const handleKeydown = (event) => {
  // ⚠️ Esc 不在这里处理：分层收敛在 BohIsland 根监听（回答面退层 / 搜索面关岛）。
  //    这里若再拦截一次，退层后焦点落 body，第二次 Esc 就没人接了。
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    send(draft.value);
  }
};

const goFullPage = () => {
  props.onClose?.();
  router.push('/ai-chat');
};

/* ---------------- 「首屏 5–6 行渐隐」的溢出检测 ---------------- */

/** 裁剪阈值（与下方 .clipped 的 max-height 同源） */
const ANSWER_CLIP_MAX = 132;

const measureOverflow = () => {
  const el = answerRef.value;
  if (!el) {
    overflows.value = false;
    return;
  }
  // ⚠️ 不能拿 clientHeight 比较 —— 不裁剪就永不溢出（鸡生蛋）。
  //    直接量内容高度是否超过裁剪阈值：超过才上 max-height + 渐隐 + 展开按钮。
  overflows.value = el.scrollHeight > ANSWER_CLIP_MAX + 6;
};

// 流式期间逐帧量（内容在长），结束后再量一次收尾
watch(answerText, () => {
  if (expanded.value) return;
  nextTick(measureOverflow);
  if (overflowTimer) clearInterval(overflowTimer);
  overflowTimer = setInterval(measureOverflow, 200);
  setTimeout(() => {
    if (overflowTimer && !streaming.value) {
      clearInterval(overflowTimer);
      overflowTimer = null;
      measureOverflow();
    }
  }, 2500);
});

watch(streaming, (val) => {
  if (!val && overflowTimer) {
    clearInterval(overflowTimer);
    overflowTimer = null;
    nextTick(measureOverflow);
  }
});

/* ---------------- 生命周期 ---------------- */

onMounted(async () => {
  // 快速会话（§3.4）：岛内问答不接主会话 —— 每次岛内问答链路都从全新会话开始
  engine.startNewChat();
  // 消费搜索面转来的种子问题（原句直传，见 GlobalSearchIsland.askAi）
  const seed = bohIsland.pendingAsk.value;
  bohIsland.pendingAsk.value = '';
  if (seed) {
    await nextTick();
    send(seed);
  } else {
    inputRef.value?.focus();
  }
});

onBeforeUnmount(() => {
  if (overflowTimer) clearInterval(overflowTimer);
});
</script>

<style scoped>
.boh-answer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 8px;
  color: rgba(244, 244, 247, 0.92);
  min-height: 0;
  flex: 1 1 auto;
}

/* 输入条：与 .gs-bar 同几何（岛顶恒定契约，probe-nav-ask 断言 top 差值 ≤1px） */
.boh-answer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
}

.boh-answer-spark {
  color: #c4b5fd;
  flex-shrink: 0;
}

.boh-answer-stop {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  cursor: pointer;
}

.boh-answer-stop:hover {
  background: rgba(255, 255, 255, 0.22);
}

.boh-answer-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-weight: 500;
  color: #f5f5f7;
}

.boh-answer-input::placeholder {
  color: rgba(245, 245, 247, 0.38);
}

.boh-answer-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 2px;
}

.boh-q-echo {
  margin: 0;
  font-size: 11.5px;
  color: rgba(244, 244, 247, 0.45);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.boh-activity {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: rgba(196, 181, 253, 0.9);
}

.boh-activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a78bfa;
  animation: boh-ans-pulse 1.1s ease-in-out infinite;
}

@keyframes boh-ans-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.boh-answer-text {
  font-size: 13px;
  line-height: 1.62;
  word-break: break-word;
}

.boh-answer-text.clipped {
  max-height: 132px; /* ≈5–6 行（与 ANSWER_CLIP_MAX 同源） */
  overflow: hidden;
  mask-image: linear-gradient(180deg, #000 72%, transparent);
  -webkit-mask-image: linear-gradient(180deg, #000 72%, transparent);
}

/* markdown 最小排版（深色岛内；完整排版在 BohChatStream / 全页） */
.boh-answer-text :deep(p) {
  margin: 0 0 8px;
}
.boh-answer-text :deep(p:last-child) {
  margin-bottom: 0;
}
.boh-answer-text :deep(ul),
.boh-answer-text :deep(ol) {
  margin: 4px 0 8px;
  padding-left: 18px;
}
.boh-answer-text :deep(code) {
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 12px;
}
.boh-answer-text :deep(pre) {
  margin: 6px 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  overflow-x: auto;
}
.boh-answer-text :deep(pre code) {
  padding: 0;
  background: transparent;
}
.boh-answer-text :deep(a) {
  color: #b9a7f5;
}
.boh-answer-text :deep(h1),
.boh-answer-text :deep(h2),
.boh-answer-text :deep(h3) {
  margin: 8px 0 4px;
  font-size: 13.5px;
}

.boh-expand {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: rgba(196, 181, 253, 0.9);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}

.boh-sources {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.boh-sources-chip {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(244, 244, 247, 0.72);
  font-size: 11.5px;
  cursor: pointer;
}

.boh-sources-chip .flip {
  transform: rotate(180deg);
}

.boh-sources-list {
  margin: 0;
  padding: 2px 0 2px 16px;
  font-size: 12px;
  color: rgba(244, 244, 247, 0.66);
}

.boh-sources-list a {
  color: rgba(185, 167, 245, 0.9);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  max-width: 100%;
  vertical-align: bottom;
}

.boh-answer-empty {
  margin: 0;
  font-size: 12px;
  color: rgba(244, 244, 247, 0.5);
}

.boh-link {
  border: none;
  background: transparent;
  padding: 0;
  color: #b9a7f5;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.boh-answer-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 0;
}

.boh-foot-hint {
  font-size: 10.5px;
  color: rgba(244, 244, 247, 0.32);
}

.boh-foot-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: rgba(196, 181, 253, 0.9);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}
</style>

<template>
  <div class="boh-answer">
    <!-- ① 加载态：白色点环 + 状态文字 + 步骤计数
         （2026-11-05 第五次口径，参考 iOS Siri「Searching events 2/5」）。
         只在「流式已开始、一个字还没出来」时占位；首 token 一到就切回复态。
         ⚠️ 这一态**不提供停止**（2026-11-05 用户口径）：没有按钮、没有脚部文字 ——
            要中止就等首字出来再用/直接 Esc 关岛。 -->
    <div v-if="showLoading" class="boh-load" role="status" aria-live="polite">
      <span class="boh-ring" aria-hidden="true">
        <i v-for="n in 8" :key="n" :style="{ '--a': `${(n - 1) * 45}deg`, '--i': n - 1 }"></i>
      </span>
      <span class="boh-load-title">{{ loadingTitle }}</span>
    </div>

    <!-- ② 回复态：问题（大字）+ 正文 + 来源
         2026-11-05 第六次口径（用户）：**默认显示完整回答**，岛随内容自动延长，
         由卡片 max-height 封顶；溢出后这一层自己滚（滚动条隐藏，见 .boh-answer-body）。
         旧的「首屏裁到 5–6 行、点一下才看全」整套退场。 -->
    <div
      v-else
      ref="bodyRef"
      class="boh-answer-body"
      :class="{ 'has-more': canScrollDown }"
      @scroll.passive="onBodyScroll"
    >
      <!-- 问题回显：从旧版的一行小字改成标题级（参考图 2 胶囊里那句白字） -->
      <p v-if="displayQuestion" class="boh-q-echo">{{ displayQuestion }}</p>

      <!-- 站内导航命中：不走搜索列表，用一句对话回复给出（与 AI 回答同一条通道） -->
      <div v-if="pageLinks.length" class="boh-pages">
        <p class="boh-pages-title">为你找到以下页面：</p>
        <button
          v-for="page in pageLinks"
          :key="page.path"
          type="button"
          class="boh-page-link"
          @click="goPage(page)"
        >
          {{ page.label }}
        </button>
      </div>

      <!-- 回答正文：markdown 安全渲染，全文直出（不再裁剪） -->
      <div
        v-show="answerText && !pageLinks.length"
        class="boh-answer-text"
        v-html="answerHtml"
      ></div>

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

    <!-- ③ 结果胶囊：只有「本轮真的有东西可看」时出现
         （参考图 2 的 Show Results —— 独立一枚、不占满宽）。
         ⚠️ 不能只判 `!showLoading`：空闲态也满足，会在输入框上方凭空多一枚按钮。 -->
    <div v-if="hasAnswer && !showLoading" class="boh-answer-foot">
      <button v-if="streaming" type="button" class="boh-foot-stop" @click="stop">停止生成</button>
      <button v-else type="button" class="boh-result-pill" @click="goFullPage">
        <span class="boh-result-icon" aria-hidden="true">
          <ArrowUpRight :size="13" :stroke-width="2.2" />
        </span>
        查看完整回答
      </button>
    </div>

    <!-- ④ 输入条：空闲常驻 / 回答完成后返场（生成中整条不渲染） -->
    <Transition name="boh-bar">
      <div v-if="!streaming" class="boh-answer-bar">
        <Sparkles :size="15" class="boh-answer-spark" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="draft"
          type="text"
          class="boh-answer-input"
          placeholder="问 BOHAI…"
          aria-label="追问"
          autocomplete="off"
          spellcheck="false"
          @keydown="handleKeydown"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowUpRight, ChevronDown, Sparkles } from 'lucide-vue-next';
import { useChatEngine } from '@/views/BOHAI/composables/useChatEngine.js';
import { BOH_DEFAULT_MODE_ID } from '@/views/BOHAI/composables/chat-engine-config.js';
import {
  formatCommunityActivityLine,
  resolveActivityLine,
  resolveBohActivityStage,
} from '@/views/BOHAI/BOHAI/components/boh-activity.js';
import { renderMarkdown } from '@/views/BOHAI/BOHAI/components/boh-markdown.js';
import { logger } from '@/utils/logger.js';
import { useBohIsland } from '@/composables/useBohIsland.js';
import { SITE_SEARCH_PAGES } from '@/config/site-search-sources';

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
const sourcesOpen = ref(false);
const inputRef = ref(null);
const bodyRef = ref(null);

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

const activityStage = computed(() => {
  if (!streaming.value) return '';
  return (
    resolveBohActivityStage({
      isThinking: engine.isThinking.value === true,
      isLoading: true,
      webSearchActive: engine.webSearchActive.value === true,
      webSearchResultCount: webSources.value.length,
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

/* ---------------- 加载态（2026-11-05 第五次口径） ---------------- */

/**
 * 只在「流式已开始、一个字还没出来」时占位 —— 首 token 一到就切回复态，
 * 不会有「上面一个点环、下面同时往外冒字」的重影。
 */
const showLoading = computed(
  () => streaming.value && !answerText.value && pageLinks.value.length === 0,
);

/** 本轮是否已经有可看的东西（正文 / 页面命中 / 正在流式）—— 结果胶囊与脚部的门 */
const hasAnswer = computed(
  () => Boolean(answerText.value) || pageLinks.value.length > 0 || streaming.value,
);

/**
 * 阶段 → 进行时文案。⚠️ **语义真源仍是 boh-activity.js 的 stage**，这里只做时态改写：
 * 那边给全页活动行的是「网页搜索」「正在思考」这类短标签，岛里这颗胶囊是
 * Siri 式的整句状态（「Searching events 2/5」），直接用标签会读成名词短语。
 * 键就是 stage 本身，不新增阶段、不改优先级。
 */
const LOAD_TITLES = {
  'web-searching': '正在搜索网页…',
  'web-results': '正在阅读网页…',
  community: '正在读取社区帖子…',
  thinking: '正在思考…',
  answering: '正在撰写回复…',
};

const loadingTitle = computed(
  () => LOAD_TITLES[activityStage.value] || activityLine.value || '正在思考…',
);

/* ---------------- 站内页面命中：用一句对话回复代替搜索列表 ---------------- */

/**
 * 2026-11-04 用户口径：这颗岛是「和 BOHAI 聊天」的入口，不是搜索面板。
 * 页面类问题（「论坛」「订阅在哪」）不弹列表，直接回一句
 * 「为你找到以下页面：…」并给出可点的页面胶囊 —— 与 AI 回答同一条 UI 通道。
 */
const PAGE_MATCH_LIMIT = 4;

const pageLinks = ref([]);
const localQuestion = ref('');

const displayQuestion = computed(() => localQuestion.value || lastQuestion.value);

const matchSitePages = (text) => {
  const q = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!q) return [];
  const scored = [];
  for (const page of SITE_SEARCH_PAGES) {
    const label = String(page.label || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    if (!label) continue;
    // 只在「这句话就是在说这个页面」时命中：整词相等、或页面名后只多两三个字
    // （「论坛」「论坛在哪」）。⚠️ 不能用宽松的 includes —— 实测「八周年庆典什么时候」
    // 会被「八周年」这个页面名劫持，真问题就拿不到 AI 回答了。
    if (label === q) scored.push({ page, score: 3 });
    else if (q.length >= 2 && label.startsWith(q)) scored.push({ page, score: 2 });
    else if (q.length <= label.length + 2 && q.includes(label)) scored.push({ page, score: 1 });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, PAGE_MATCH_LIMIT)
    .map((row) => row.page);
};

const goPage = (page) => {
  if (!page?.path) return;
  props.onClose?.();
  router.push(page.path);
};

/* ---------------- 发送 ---------------- */

/** 岛内发送统一走这里：种子问题与追问同一条路 */
const send = async (text) => {
  const q = String(text || '').trim();
  if (!q || streaming.value) return;
  sourcesOpen.value = false;
  draft.value = '';
  // 新一轮问答从头看起：结算上一轮的「贴着底」意图，首字一到就重新贴底；
  // 底部的可滚淡出也一并摘掉（body 在加载态会卸载，留着会是上一轮的残影）
  stickBottom = true;
  canScrollDown.value = false;

  // ① 站内导航：命中页面就直接用对话回复，不走模型、不耗额度
  const pages = matchSitePages(q);
  if (pages.length) {
    pageLinks.value = pages;
    localQuestion.value = q;
    engine.inputMessage.value = '';
    return;
  }

  // ② 其余一律当问题交给 BOHAI（这颗岛的默认语义）
  pageLinks.value = [];
  localQuestion.value = '';
  engine.inputMessage.value = q;
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

/* ---------------- 流式跟随：贴着底就继续贴，用户往上翻了就不打扰 ----------------
   2026-11-05 第六次口径：全文直出 + 卡片 max-height 封顶 + 内部滚动（滚动条隐藏）。
   一旦内容超过封顶高度，**新冒出来的字在视野外** —— 不跟随就等于「答到一半卡住」。
   ⚠️ 只在用户本来就在底部（距底 < 24px）时才跟随：正在往回翻旧内容时被拽回底部
      是最恼人的体验，宁可让他自己滚。 */

const STICK_THRESHOLD = 48;

let stickBottom = true;

/**
 * 最近一次「程序贴底」的时间戳。
 * ⚠️ 这道闸是必须的：`scrollTop` 赋值的 scroll 事件是**异步派发**的，和「内容刚变长、
 *    浏览器把 scrollTop 夹回 0」产生的事件长得一模一样。只按位置判断的话，
 *    溢出量刚好超过阈值时（实测 28px > 24px）会把程序滚动误判成「用户往上翻了」，
 *    从此再不跟随 —— 表现就是「回答最后一行永远停在渐隐带上，滚不动」。
 */
let lastPinAt = 0;

/** 底部是否还有没滚到的内容 —— 有就上「渐隐收边」（替代被隐掉的滚动条做可滚暗示） */
const canScrollDown = ref(false);

const syncScrollEdges = () => {
  const el = bodyRef.value;
  if (!el) return;
  canScrollDown.value = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
};

const onBodyScroll = () => {
  const el = bodyRef.value;
  if (!el) return;
  if (Date.now() - lastPinAt < 160) return; // 自己滚的，不算用户意图
  stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  syncScrollEdges();
};

const pinToBottom = async () => {
  if (!stickBottom) return;
  await nextTick();
  const el = bodyRef.value;
  if (!el) return;
  lastPinAt = Date.now();
  el.scrollTop = el.scrollHeight;
  syncScrollEdges();
  // ⚠️ 还要补一帧：末段内容可能在**本帧末**才完成布局（卡片被 max-height 夹紧、
  //    markdown 里的块级元素落位），上面那一次赋值会被浏览器夹回旧的最大值。
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      const node = bodyRef.value;
      if (!node || !stickBottom) return;
      lastPinAt = Date.now();
      node.scrollTop = node.scrollHeight;
      syncScrollEdges();
    });
  }
};

// 流式期间每个 token 都会改 answerText；nextTick 后贴底。内容短（不溢出）时
// scrollTop 赋 scrollHeight 是无害的（浏览器自己夹紧到 0）。
watch([answerText, () => pageLinks.value.length], () => {
  void pinToBottom();
});

// 加载态 → 回复态：滚动容器在这一帧才**挂载**（v-if / v-else 的另一支）。
// 上面那条 watch 有可能在容器还不存在时就跑完了（首 token 一次到齐时尤其如此），
// 之后又不再有 answerText 变化 ⇒ 一次都不跟随（2026-11-05 实测桌面端即此）。
watch(showLoading, (loading) => {
  if (!loading) void pinToBottom();
});

/**
 * 容器尺寸一变化就重贴。
 *
 * ⚠️ 这是「贴不住」的根治项，不是保险丝：末段内容到达时 body 往往还是自然高度
 *    （实测 475/475，未溢出），**卡片被 max-height 夹紧是之后的布局步骤** ——
 *    夹紧后 clientHeight 从 475 掉到 447，凭空多出 28px 可滚量，但此时
 *    answerText 没变、loading 没变、也没有 scroll 事件 ⇒ 没有任何东西会去贴底。
 *    观察自身尺寸恰好能在「夹紧」那一刻补上这一下。
 */
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

/* ---------------- 种子问题：持续消费（不是只消费一次） ---------------- */

/**
 * 消费搜索面 / 外部宿主转来的种子问题（原句直传，见 GlobalSearchIsland.askAi）。
 *
 * ⚠️ 必须是「持续消费」而不是 onMounted 取一次：本组件只在首次进回答面时挂载，
 *    之后 face 用 v-show 切换（BohIsland.vue）—— 岛不关就不会重挂载。一次性消费会把
 *    两条主路径静默吞掉：
 *      · 问一句 → Esc 回搜索面 → 换个问题再问（搜索面第 0 项 / ⌘↵）；
 *      · 岛已在回答面时，论坛「问 BOHAI」再送一条种子问题。
 *    旧岛用 `watch(pendingPrompt)` 处理同一场景（BOHAIIsland.vue 注释原话：
 *    「岛已展开时又收到新的 open({prompt})（isExpanded 不会变化），同样立即消费」），
 *    P3 迁移到新岛时丢了，2026-11-04 复核补回。
 */
let queuedSeed = '';

const consumeSeed = async () => {
  const seed = String(bohIsland.pendingAsk.value || '').trim();
  if (!seed) return;
  bohIsland.pendingAsk.value = '';
  // 流式中不丢问题：排队，等本轮收尾再发（send 自己会因 streaming 直接 return）
  if (streaming.value) {
    queuedSeed = seed;
    return;
  }
  await nextTick();
  send(seed);
};

watch(
  () => bohIsland.pendingAsk.value,
  (val) => {
    if (String(val || '').trim()) void consumeSeed();
  },
);

watch(streaming, (val) => {
  if (val || !queuedSeed) return;
  const next = queuedSeed;
  queuedSeed = '';
  void send(next);
});

/* ---------------- 生命周期 ---------------- */

onMounted(async () => {
  // 快速会话（§3.4）：岛内问答不接主会话 —— 每次岛内问答链路都从全新会话开始。
  // origin 标记让全页侧栏把它归进「在搜索里问过」分组（可提升为主会话）。
  engine.startNewChat('quick-ask');
  // 岛内恒定平衡档（§3.6，产品口径）：岛里没有模型选择 UI，一律走 balance，
  // 不继承全页上次选的 pro/fast —— 否则同一个问题在全页与岛内会得到不同成本/延迟。
  // ⚠️ P3 迁移时 `showIsland.ai({mode:'fast'})` 变成静默忽略 ⇒ 论坛「问 BOHAI」实际跑的是
  //    用户上次的档位（缺省 `BOH_DEFAULT_MODE_ID='balance'`），行为随人而变。
  //    档位契约落在这里（唯一实现处）；模式表已加载却没有 balance（降级/分级场景）时不硬写，
  //    交给引擎自己的兜底（当前档位不在表里时会被改写成表内首项）。
  const modeIds = (engine.chatModes?.value || []).map((mode) => mode.id);
  if (!modeIds.length || modeIds.includes(BOH_DEFAULT_MODE_ID)) {
    engine.currentModeId.value = BOH_DEFAULT_MODE_ID;
  }
  if (String(bohIsland.pendingAsk.value || '').trim()) {
    await consumeSeed();
  } else {
    inputRef.value?.focus();
  }
});

onBeforeUnmount(() => {
  queuedSeed = '';
  bodyObserver?.disconnect();
  bodyObserver = null;
});
</script>

<style scoped>
.boh-answer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 1px 4px 4px;
  color: var(--boh-ink);
  min-height: 0;
  flex: 1 1 auto;
}

/* 输入条：与 .gs-bar 同几何（岛顶恒定契约，probe-nav-ask 断言 top 差值 ≤1px）。
   2026-11-05 第三次口径：**生成中整条不渲染**（`<Transition name="boh-bar">`），
   输入框返场时从 0 高度淡入。不再有「彩虹条 + 方块暂停按钮」那一套 ——
   用户原话「不要暂停条和暂停按钮，那根彩虹条太难看了」。 */
.boh-answer-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 6px;
  flex: 0 0 auto;
  /* 输入条就是岛本身：不自带底色/描边（2026-11-04 用户口径「同一块材质与颜色」），
     让岛的玻璃直接透上来 —— 与搜索面 .gs-bar 的去框口径一致。 */
  border-color: transparent;
  background: transparent;
}

/* 进出场：高度 / padding / 透明度一起收 ⇒ 卡片高度逐帧变，surface 自然跟着长缩 */
.boh-bar-enter-active,
.boh-bar-leave-active {
  overflow: hidden;
  transition:
    max-height 260ms cubic-bezier(0.22, 1, 0.36, 1),
    padding 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.boh-bar-enter-from,
.boh-bar-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}

.boh-bar-enter-to,
.boh-bar-leave-from {
  max-height: 44px;
  opacity: 1;
}

.boh-answer-spark {
  color: var(--boh-accent);
  flex-shrink: 0;
}

.boh-answer-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-weight: 500;
  color: var(--boh-ink);
}

.boh-answer-input::placeholder {
  color: var(--boh-ink-faint);
}

@media (prefers-reduced-motion: reduce) {
  .boh-bar-enter-active,
  .boh-bar-leave-active {
    transition: none;
  }
}

.reduce-motion .boh-bar-enter-active,
.reduce-motion .boh-bar-leave-active {
  transition: none;
}

/* ---------------- 加载态：白色点环 + 状态 + 步骤（2026-11-05 第五次口径） ----------------
   参考 iOS Siri 的「Searching events 2/5」：一颗由白点围成的环在转，旁边一行进行时状态，
   下面一行进度。环不用图片、不用 conic：8 个点各转一个角度，延迟依次错开 0.115s，
   亮度只在 24% 处冲到 1 ⇒ 任何一帧都有 2~3 个点在亮区，读起来是**一段顺时针拖尾的光弧**。

   ⚠️ 点的 `scale` 只许走 0.95→1.06：差值一放大（比如 0.78）整圈会看成「散落的点」，
      而不是一个环 —— 这是 2026-11-05 对比截图得到的结论。 */

.boh-load {
  display: flex;
  align-items: center;
  gap: 17px;
  padding: 18px 12px;
  min-height: 86px;
}

.boh-ring {
  position: relative;
  width: 54px;
  height: 54px;
  flex-shrink: 0;
}

/* 环底的柔光：把 8 个点连成「一圈在发光」，而不是 8 颗孤立的珠子 */
.boh-ring::after {
  content: '';
  position: absolute;
  inset: -9px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.16), transparent 64%);
  filter: blur(7px);
  pointer-events: none;
}

.boh-ring i {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 11px;
  height: 11px;
  margin: -5.5px 0 0 -5.5px;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 8px rgba(255, 255, 255, 1),
    0 0 16px rgba(255, 255, 255, 0.55);
  transform: rotate(var(--a)) translateY(-17px) scale(0.95);
  opacity: 0.28;
  animation: bohRingPulse 1.5s linear infinite;
  animation-delay: calc(var(--i) * -0.115s);
}

@keyframes bohRingPulse {
  0% {
    opacity: 0.28;
    transform: rotate(var(--a)) translateY(-17px) scale(0.95);
  }

  24% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(-17px) scale(1.06);
  }

  56% {
    opacity: 0.5;
    transform: rotate(var(--a)) translateY(-17px) scale(1);
  }

  100% {
    opacity: 0.28;
    transform: rotate(var(--a)) translateY(-17px) scale(0.95);
  }
}

.boh-load-title {
  font-size: 16.5px;
  font-weight: 500;
  letter-spacing: -0.012em;
  color: var(--boh-ink);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.boh-load-step {
  font-size: 14px;
  font-weight: 400;
  color: var(--boh-ink-dim);
  font-variant-numeric: tabular-nums;
}

/* 降级：点不再起伏，但必须全部亮着（否则 8 个点全是 0.24 的暗灰，看起来像坏了） */
@media (prefers-reduced-motion: reduce) {
  .boh-ring i {
    animation: none;
    opacity: 0.85;
  }
}

.reduce-motion .boh-ring i {
  animation: none;
  opacity: 0.85;
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
  /* 2026-11-05 第六次口径：内部滚动**不显示滚动条**（用户原话）。
     内容高度由卡片 max-height 封顶（BohIsland.vue 的 .boh-card），
     这里只负责滚 + 隐藏轨道；滚动能力本身必须保留（触控板/滚轮/键盘都靠它）。 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.boh-answer-body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

/* 滚动条被隐掉了 ⇒ 靠底部 22px 的淡出告诉用户「下面还有」。
   ⚠️ 只在**确实没到底**时挂（:class 由滚动位置驱动）：滚到底还留着渐隐，
      最后一行会永远像被切掉一截。 */
.boh-answer-body.has-more {
  mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 22px), transparent 100%);
}

.boh-q-echo {
  margin: 2px 8px 0;
  font-size: 15.5px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: var(--boh-ink);
  word-break: break-word;
}

/* 站内导航命中：一句对话回复 + 可点页面胶囊（与岛同一套深色材质） */
.boh-pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.boh-pages-title {
  margin: 0 0 2px;
  width: 100%;
  font-size: 13px;
  line-height: 1.6;
  color: var(--boh-ink);
}

.boh-page-link {
  max-width: 100%;
  padding: 5px 12px;
  border: 1px solid var(--boh-line);
  border-radius: 999px;
  background: var(--boh-chip-bg);
  color: var(--boh-ink);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.boh-page-link:hover {
  background: var(--boh-chip-bg-hover);
  border-color: var(--boh-line-strong);
}

.boh-answer-text {
  padding: 0 8px;
  font-size: 14px;
  line-height: 1.68;
  color: var(--boh-ink-soft);
  word-break: break-word;
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
  background: var(--boh-line);
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
  color: var(--boh-accent);
}
.boh-answer-text :deep(h1),
.boh-answer-text :deep(h2),
.boh-answer-text :deep(h3) {
  margin: 8px 0 4px;
  font-size: 13.5px;
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
  background: var(--boh-chip-bg);
  color: var(--boh-ink-soft);
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
  color: var(--boh-ink-soft);
}

.boh-sources-list a {
  color: var(--boh-accent);
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
  color: var(--boh-ink-dim);
}

.boh-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--boh-accent);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.boh-answer-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 2px 8px 0;
}

/* 结果胶囊：参考图 2 的 Show Results —— 独立一枚、玻璃质感、不占满宽 */
.boh-result-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px 0 8px;
  border: 1px solid var(--boh-line);
  border-radius: 999px;
  background: var(--boh-chip-bg);
  color: var(--boh-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.boh-result-pill:hover {
  background: var(--boh-chip-bg-hover);
  border-color: var(--boh-line-strong);
}

.boh-result-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--boh-chip-bg-hover);
}

/* 生成中（回复态）的停止入口：纯文字，不占一条 */
.boh-foot-stop {
  border: none;
  background: transparent;
  padding: 2px 0;
  color: var(--boh-ink-dim);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.boh-foot-stop:hover {
  color: var(--boh-ink);
}

.boh-foot-hint {
  font-size: 10.5px;
  color: var(--boh-ink-faint);
}

.boh-foot-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: var(--boh-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}
</style>

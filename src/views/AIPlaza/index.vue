<template>
  <main class="ai-intro-v2" :class="{ 'is-mounted': mounted }">
    <!-- ===== Hero：站点 hero 规格（--hero-*）+ 液态玻璃 ===== -->
    <section class="hero" aria-labelledby="boh-ai-title">
      <div class="hero-glow" aria-hidden="true" />
      <img class="hero-cloud" :src="bohCloudVisual" alt="" aria-hidden="true" />

      <div class="hero-inner">
        <p class="kicker reveal">BOH AI · 方块之家</p>
        <h1 id="boh-ai-title" class="reveal d1">BOH AI<span class="dot">.</span></h1>
        <p class="sub reveal d2">从一个问题，到完成一件事。</p>
        <p class="copy reveal d3">
          理解你的想法，整理复杂信息，并在需要时把任务拆解到可以执行的下一步。同一个 BOH
          AI，五种工作节奏，随时切换。
        </p>
        <div class="hero-cta reveal d4">
          <button type="button" class="btn-primary" @click="goChat()">
            开始使用 <ArrowRight :size="17" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn-quiet liquid-glass liquid-glass--pill liquid-glass--subtle"
            @click="scrollToModes"
          >
            探索五种模式 <ChevronDown :size="17" aria-hidden="true" />
          </button>
        </div>

        <!-- 液态玻璃悬浮输入条：单层玻璃，外层唯一 blur -->
        <div
          class="liquid-glass liquid-glass--pill liquid-glass--subtle prompt-bar reveal d5"
          aria-hidden="true"
        >
          <span class="prompt-icon"><Sparkles :size="17" /></span>
          <span class="prompt-text" :key="selectedMode?.modeId">{{
            selectedMode?.example || '把零散想法整理成一份清晰计划'
          }}</span>
          <span class="prompt-send"><ArrowUp :size="16" /></span>
        </div>

        <div class="hero-meta reveal d6">
          <span><Check :size="14" /> 无需学习成本</span>
          <span><Check :size="14" /> 模式随时切换</span>
          <span><Check :size="14" /> 尊重你的边界</span>
        </div>
      </div>

      <button
        type="button"
        class="scroll-hint"
        aria-label="向下滚动查看模式"
        @click="scrollToModes"
      >
        <ChevronDown :size="20" />
      </button>
    </section>

    <!-- ===== 介绍：BOH AI 是什么 ===== -->
    <section class="intro-strip">
      <div class="wrap">
        <p class="kicker center reveal">介绍</p>
        <h2 class="h2 center reveal">不止回答问题，<span class="grad">而是帮你推进事情。</span></h2>
        <p class="lede center reveal">
          三种能力贯穿所有模式：找关键、变步骤、保连续。你只管表达，结构和下一步交给 BOH AI。
        </p>
        <div class="steps">
          <article
            v-for="(s, i) in steps"
            :key="s.title"
            class="step liquid-glass reveal"
            :style="{ transitionDelay: `${i * 90}ms` }"
          >
            <span class="step-num">{{ s.num }}</span>
            <component :is="s.icon" :size="22" aria-hidden="true" />
            <h3>{{ s.title }}</h3>
            <p>{{ s.copy }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== 模式：固定视窗分镜（滚动驱动）===== -->
    <section
      ref="modesSection"
      class="modes"
      :class="{ 'is-staged': stageable, 'is-pinned': pinned }"
      :style="pinnedStyle"
    >
      <div ref="modesStickyRef" class="wrap modes-sticky">
        <p class="kicker center reveal">五种模式</p>
        <h2 class="h2 center reveal">同一个 BOH AI，不同的工作节奏。</h2>
        <p class="lede center reveal">{{ modesLede }}</p>

        <!-- Apple 分段选择器：玻璃轨道 + 滑动实色 thumb，避免玻璃嵌套 -->
        <div
          class="seg liquid-glass liquid-glass--pill reveal"
          role="tablist"
          aria-label="BOH AI 模式"
        >
          <span
            class="seg-thumb"
            aria-hidden="true"
            :style="{
              left: `calc(${(activeModeIndex * 100) / tabCount}% + 4px)`,
              width: `calc(${100 / tabCount}% - 8px)`,
            }"
          />
          <button
            v-for="(mode, index) in publicModes"
            :id="`mode-tab-${mode.modeId}`"
            :key="mode.modeId"
            type="button"
            role="tab"
            class="seg-btn"
            :class="{ active: index === activeModeIndex }"
            :aria-selected="index === activeModeIndex"
            :aria-controls="`mode-panel-${mode.modeId}`"
            @click="selectMode(index)"
          >
            <component :is="mode.iconComponent" :size="16" aria-hidden="true" />
            <span>{{ mode.displayName }}</span>
          </button>
        </div>

        <!-- 外层唯一玻璃卡 -->
        <div class="liquid-glass mode-card reveal">
          <div
            v-if="selectedMode"
            :id="`mode-panel-${selectedMode.modeId}`"
            class="mode-grid"
            role="tabpanel"
            :aria-labelledby="`mode-tab-${selectedMode.modeId}`"
            @touchstart.passive="onTouchStart"
            @touchend.passive="onTouchEnd"
          >
            <Transition :name="slideDir >= 0 ? 'slide-next' : 'slide-prev'" mode="out-in">
              <div :key="selectedMode.modeId" class="mode-slide">
                <div class="mode-left">
                  <div class="mode-top">
                    <span class="mode-mark" :style="{ '--mode-color': selectedMode.color }">
                      <component :is="selectedMode.iconComponent" :size="26" aria-hidden="true" />
                    </span>
                    <span class="mode-eyebrow">{{ selectedMode.eyebrow }}</span>
                  </div>
                  <h3 class="mode-name">{{ selectedMode.displayName }}</h3>
                  <p class="mode-headline">{{ selectedMode.headline }}</p>
                  <p class="mode-summary">{{ selectedMode.summary }}</p>
                  <div class="mode-cta-row">
                    <button
                      type="button"
                      class="btn-primary sm"
                      @click="goChat(selectedMode.modeId)"
                    >
                      使用 {{ selectedMode.displayName }}
                      <ArrowRight :size="16" aria-hidden="true" />
                    </button>
                    <div class="mode-arrows" aria-hidden="false">
                      <button type="button" class="arrow-btn" aria-label="上一个模式" @click="prev">
                        <ChevronDown :size="17" class="rot90" />
                      </button>
                      <span class="mode-count">{{ activeModeIndex + 1 }} / {{ tabCount }}</span>
                      <button type="button" class="arrow-btn" aria-label="下一个模式" @click="next">
                        <ChevronDown :size="17" class="rot-90" />
                      </button>
                    </div>
                  </div>
                  <!-- 移动端小点 -->
                  <div class="dots" aria-hidden="true">
                    <span
                      v-for="(m, i) in publicModes"
                      :key="m.modeId"
                      :class="{ on: i === activeModeIndex }"
                      @click="selectMode(i)"
                    />
                  </div>
                </div>
                <div class="mode-right">
                  <p class="detail-title">适合这些时刻</p>
                  <ul class="strengths">
                    <li v-for="item in selectedMode.strengths" :key="item">
                      <span class="check"><Check :size="15" aria-hidden="true" /></span>
                      <span>{{ item }}</span>
                    </li>
                  </ul>
                  <div class="example">
                    <MessageSquareText :size="18" aria-hidden="true" />
                    <p>“{{ selectedMode.example }}”</p>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <p v-if="loading" class="mode-status" role="status">正在同步可用模式…</p>
          <p v-else-if="error" class="mode-status">
            当前展示标准模式，进入对话后将自动同步可用选项。
          </p>
        </div>
      </div>
    </section>

    <!-- ===== 能力：一张玻璃面板 + 三格 ===== -->
    <section class="caps-section">
      <div class="wrap">
        <div class="caps-panel liquid-glass reveal">
          <p class="kicker center">能力</p>
          <h2 class="h2 center">让信息真正向前流动。</h2>
          <div class="caps">
            <article v-for="c in capabilities" :key="c.title" class="cap">
              <component :is="c.icon" :size="24" aria-hidden="true" />
              <h3>{{ c.title }}</h3>
              <p>{{ c.copy }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 生态：图文 + 液态玻璃信任列表 ===== -->
    <section class="eco">
      <div class="wrap eco-grid">
        <div class="eco-visual reveal">
          <img :src="bohCloudVisual" alt="BOH Cloud 功能连接示意" />
          <div
            class="liquid-glass liquid-glass--pill liquid-glass--subtle eco-float"
            aria-hidden="true"
          >
            <ShieldCheck :size="16" /> 由你决定何时引用
          </div>
        </div>
        <div class="eco-copy">
          <p class="kicker reveal">与你的 BOH 空间协同</p>
          <h2 class="h2 reveal">理解上下文，也尊重边界。</h2>
          <p class="lede left reveal">
            在你允许的范围内，BOH AI
            可以连接站内信息、个人内容与历史对话，让每次交流少一点重复，多一点连续。
          </p>
          <ul class="trust reveal">
            <li>
              <ShieldCheck :size="18" />
              <div><b>由你决定何时引用</b><span>默认不读取，需要时才授权。</span></div>
            </li>
            <li>
              <Brain :size="18" />
              <div><b>围绕当前任务组织上下文</b><span>保留必要记忆，不必每次从头解释。</span></div>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ===== 收尾 CTA：渐变 + 强玻璃卡 ===== -->
    <section class="closing">
      <div class="wrap">
        <div class="liquid-glass liquid-glass--strong close-card reveal">
          <span class="close-icon"><Sparkles :size="22" /></span>
          <h2>今天，想先完成什么？</h2>
          <p>选择一种模式，或直接开始。BOH AI 会跟上你的节奏。</p>
          <div class="close-cta">
            <button type="button" class="btn-primary" @click="goChat()">
              打开 BOH AI <ArrowRight :size="17" aria-hidden="true" />
            </button>
            <button type="button" class="btn-quiet" @click="scrollToModes">先看看模式 ›</button>
          </div>
        </div>
        <p class="fine">BOH AI · 方块之家 — 同一个智能，不同节奏。</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Gauge,
  ListChecks,
  MessageSquareText,
  Network,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-vue-next';
import bohCloudVisual from '@/assets/home-hero/BOHcloud.webp';
import { listActiveBohaiPublicModeConfigs } from '@/utils/api/bohai-model-config-api.js';
import { useScrollStage } from '@/composables/useScrollStage.js';

const router = useRouter();
const modesSection = ref(null);
const modes = ref([]);
const loading = ref(true);
const error = ref(null);
const activeModeIndex = ref(0);
const slideDir = ref(1);
const mounted = ref(false);
let observer = null;

const MODE_PROFILES = {
  ultra: {
    displayName: 'Aurora',
    eyebrow: '高质量创作与分析',
    headline: '把复杂问题想得更完整。',
    summary: '适合需要深度、判断与表达质量的任务，在更多细节之间建立清晰联系。',
    strengths: ['长内容梳理与高质量写作', '复杂问题分析与观点比较', '需要充分上下文的连续对话'],
    example: '帮我比较这三个方案，并给出有依据的最终建议。',
    color: '#0f8a6a',
    iconComponent: Sparkles,
  },
  fast: {
    displayName: 'Lume',
    eyebrow: '轻快日常',
    headline: '想到就问，马上继续。',
    summary: '为日常问答与轻量任务提供直接、清楚的回应，让思路不中断。',
    strengths: ['快速问答与内容改写', '灵感补充与简短总结', '高频、轻量的日常交流'],
    example: '把这段通知改得更简洁、自然一些。',
    color: '#2563eb',
    iconComponent: Zap,
  },
  pro: {
    displayName: 'Aether',
    eyebrow: '均衡处理',
    headline: '速度与质量，恰到好处。',
    summary: '面对大多数工作与学习任务，兼顾响应效率、内容结构和结果可靠性。',
    strengths: ['学习辅助与知识解释', '文档整理与结构化输出', '兼顾效率与细节的综合任务'],
    example: '把这些会议记录整理成结论、待办和负责人。',
    color: '#7c3aed',
    iconComponent: Scale,
  },
  plan: {
    displayName: 'Plan',
    eyebrow: '长任务规划',
    headline: '先看全局，再一步步推进。',
    summary: '把目标拆成清晰步骤，持续跟进进度，并在条件变化时重新调整路线。',
    strengths: ['复杂目标拆解与排期', '多阶段任务持续推进', '风险、依赖与下一步梳理'],
    example: '为这个月的社区活动制定完整执行计划。',
    color: '#d97706',
    iconComponent: ListChecks,
  },
  'agent-cluster': {
    displayName: 'Caelum',
    eyebrow: '协作执行',
    headline: '让不同专长同时工作。',
    summary: '将复杂任务分配给不同能力角色并行处理，再汇总成一致、可执行的结果。',
    strengths: ['需要多角度处理的综合任务', '检索、分析与执行并行推进', '跨步骤结果统一整理'],
    example: '同时调研资料、整理要点，并生成一份行动建议。',
    color: '#dc4a3d',
    iconComponent: Network,
  },
};

const FALLBACK_MODES = [
  { modeId: 'Ultra', displayName: 'Aurora' },
  { modeId: 'fast', displayName: 'Lume' },
  { modeId: 'pro', displayName: 'Aether' },
  { modeId: 'plan', displayName: 'Plan' },
  { modeId: 'agent-cluster', displayName: 'Caelum' },
];

const DEFAULT_PROFILE = {
  eyebrow: '通用智能',
  headline: '为当下的任务提供合适帮助。',
  summary: '理解问题、组织信息，并给出清晰可行的下一步。',
  strengths: ['日常问答与内容整理', '思路扩展与结构化表达', '围绕目标持续对话'],
  example: '帮我理清这个问题，并告诉我下一步该做什么。',
  color: '#0f8a6a',
  iconComponent: Gauge,
};

const publicModes = computed(() => {
  const source = modes.value.length ? modes.value : FALLBACK_MODES;
  return source.map((mode) => {
    const profile = MODE_PROFILES[String(mode.modeId || '').toLowerCase()] || DEFAULT_PROFILE;
    return {
      modeId: mode.modeId,
      ...profile,
      displayName: mode.displayName || profile.displayName || 'BOH AI',
    };
  });
});
const tabCount = computed(() => publicModes.value.length || 1);
const selectedMode = computed(
  () => publicModes.value[activeModeIndex.value] || publicModes.value[0],
);

/* ---------- 固定视窗分镜（pin 分镜）----------
   五种模式天然是一条序列：滚到这一段钉住，随滚动依次登场。

   ⚠️ 「钉不钉」不靠写死断点猜，靠**量**（measureFit）：先摆成钉住时的布局
      （is-staged），量它有没有超出一屏；超了就不钉、退回点按切换。
      写死 min-width 的老做法在窄横屏 / 矮窗口 / 接口多返回一个模式时都会翻车 ——
      钉住段一旦比视口还高，sticky 就失效，底部会被永远截掉。 */
const modesStickyRef = ref(null);
const fits = ref(true);

const { progress: modesProgress, reduceMotion: modesReduceMotion } = useScrollStage(modesSection, {
  scrollClass: 'ai-intro-scroll',
});

/* staged：摆成钉住时的布局（但不粘）—— 测量必须在「已经摆好」的盒子上做。
   reduce 偏好下整段不进场：不测量、不钉。 */
const stageable = computed(() => !modesReduceMotion.value && tabCount.value > 1);
const pinned = computed(() => stageable.value && fits.value);
const pinnedStyle = computed(() =>
  pinned.value ? { '--modes-count': String(tabCount.value) } : null,
);

/* 量「内容有没有超出一屏」。判据用 sticky 自己的 min-height —— CSS 里写的是 100svh，
   getComputedStyle 会把它解析成 px。staged 态下盒子高 = max(min-height, 内容高 + 内边距)，
   所以「盒子高 ≤ min-height」等价于「内容塞得下」，不用再维护第二份视口高度口径。
   ⚠️ 不用 scrollHeight：flex 居中时溢出的「上半截」不计入 scrollHeight（Chrome 实测），
      内容高出 200px 也会被误判成塞得下。 */
const measureFit = () => {
  const sticky = modesStickyRef.value;
  if (!sticky || !stageable.value) return;
  const limit = Number.parseFloat(getComputedStyle(sticky).minHeight);
  if (!Number.isFinite(limit) || limit <= 0) return;
  fits.value = sticky.getBoundingClientRect().height <= limit + 1;
};
const modesLede = computed(() =>
  pinned.value
    ? '向下滚动，五种模式依次登场；也可以直接点按切换。'
    : '快速回答、深入分析、分步规划或协作执行。点按切换，左右滑动也可切换。',
);

/* 滚动 → 模式序号。round 到最近的档位，落在两档之间时保持前一档不动（不会来回抖）。
   点按 tab 会程序化滚动到对应位置，那段时间里进度会依次扫过中间档位 ——
   用 syncTargetIndex 把这段回波吃掉，否则面板会在滚动途中一路闪回。 */
let syncTargetIndex = null;
let syncTimer = 0;
const releaseSync = () => {
  syncTargetIndex = null;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = 0;
};

watch(modesProgress, (value) => {
  if (!pinned.value) return;
  const last = tabCount.value - 1;
  if (last <= 0) return;
  const next = Math.min(last, Math.max(0, Math.round(value * last)));
  if (syncTargetIndex !== null) {
    if (next === syncTargetIndex) releaseSync();
    return;
  }
  if (next !== activeModeIndex.value) setActive(next);
});

const capabilities = [
  {
    icon: Search,
    title: '找到关键内容',
    copy: '从站内信息和当前上下文中提取真正相关的部分，减少来回翻找。',
  },
  {
    icon: Workflow,
    title: '把想法变成步骤',
    copy: '将模糊目标整理为结构、优先级和下一步，让事情更容易开始。',
  },
  {
    icon: Brain,
    title: '保持对话连续',
    copy: '围绕正在进行的任务保留必要上下文，不必每次都从头解释。',
  },
];

const steps = [
  {
    num: '01',
    icon: Search,
    title: '说清楚问题',
    copy: '一句话也可以，BOH AI 会帮你补全背景和关键信息。',
  },
  {
    num: '02',
    icon: Workflow,
    title: '选一种节奏',
    copy: 'Aurora 想深一点，Lume 快一点，Plan 拆细一点，随时可换。',
  },
  {
    num: '03',
    icon: Sparkles,
    title: '拿到可执行结果',
    copy: '结论、步骤、待办一次给清，直接开始做。',
  },
];

const goChat = (modeId) => router.push({ path: '/ai-chat', query: modeId ? { mode: modeId } : {} });
const scrollToModes = () =>
  modesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function setActive(i) {
  if (i === activeModeIndex.value) return;
  slideDir.value = i > activeModeIndex.value ? 1 : -1;
  activeModeIndex.value = i;
}

/* 用户主动选档：先改状态，再把滚动位置搬到对应档位。
   不搬的话会出现「tab 显示第 4 个、滚动位置停在第 2 个」，下一次滚动会当场跳回去。
   已经在这一档时直接返回 —— 免得为一次空操作装上回波抑制，白白吞掉接下来的滚动。 */
function selectMode(index) {
  const last = Math.max(tabCount.value - 1, 0);
  const target = Math.min(last, Math.max(0, index));
  if (target === activeModeIndex.value) return;
  setActive(target);
  if (!pinned.value || last <= 0) return;
  const element = modesSection.value;
  if (!element) return;
  const travel = element.offsetHeight - window.innerHeight;
  if (!(travel > 0)) return;
  const top = window.scrollY + element.getBoundingClientRect().top + (travel * target) / last;
  syncTargetIndex = target;
  window.scrollTo({ top, behavior: 'smooth' });
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(releaseSync, 900);
}

function next() {
  selectMode((activeModeIndex.value + 1) % publicModes.value.length);
}
function prev() {
  selectMode((activeModeIndex.value - 1 + publicModes.value.length) % publicModes.value.length);
}

let touchX = null;
function onTouchStart(e) {
  touchX = e.changedTouches?.[0]?.clientX ?? null;
}
function onTouchEnd(e) {
  if (touchX == null) return;
  const dx = (e.changedTouches?.[0]?.clientX ?? 0) - touchX;
  if (Math.abs(dx) > 48) {
    if (dx < 0) next();
    else prev();
  }
  touchX = null;
}

function setupReveal() {
  const els = document.querySelectorAll('.ai-intro-v2 .reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          observer.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  );
  els.forEach((el) => observer.observe(el));
}

onMounted(async () => {
  requestAnimationFrame(() => {
    mounted.value = true;
  });
  /* scrollend 比定时器更早、更准地解除回波抑制；Safari 尚不支持，由 900ms 定时器兜底。 */
  window.addEventListener('scrollend', releaseSync);
  window.addEventListener('resize', measureFit);
  await nextTick();
  setupReveal();
  measureFit();
  try {
    const result = await listActiveBohaiPublicModeConfigs();
    if (result.ok && result.data.length) {
      modes.value = result.data;
      return;
    }
    error.value = result.error?.message || '模式同步失败';
  } catch (requestError) {
    error.value = requestError?.message || '模式同步失败';
  } finally {
    loading.value = false;
    // 模式表到达后文案长度会变（档数也可能变），量一次再决定钉不钉
    await nextTick();
    measureFit();
  }
});
onUnmounted(() => {
  observer?.disconnect();
  window.removeEventListener('resize', measureFit);
  window.removeEventListener('scrollend', releaseSync);
  if (syncTimer) window.clearTimeout(syncTimer);
});
</script>

<style scoped>
/* ============================================
   BOH AI 介绍页（/ai-intro）
   --------------------------------------------
   视觉一律取自站点体系，本页不另立一套：
     · 文字 / 强调色 / 字号 / CTA 规格 → styles/common/hero-surface.css 的 --hero-*
       （它的文字色已别名到 --liquid-text-*，暗色自动翻转 ⇒ 本页**不写任何暗色文字覆盖**）
     · 玻璃材质 → .liquid-glass 类库 + --liquid-* 令牌（唯一定义处 styles/common/tokens.css）
     · 品牌色 → --boh-brand-*、页面底色 → --boh-bg-*
   本页只保留 --ai-* 前缀的私有量（导航高度、品牌渐变）。
   改色请改令牌，不要在这里写死色值 —— 写死就同时丢掉暗色与全站一致性。
   ============================================ */

/* ⚠️ 根节点**不能设 overflow**（原先这里是 `overflow: hidden`）：一个方向上不是 visible
   它就会成为滚动容器，而 position: sticky 相对「最近的滚动祖先」定位、它自己并不滚
   ⇒ 下面的 .modes-sticky 永远粘不住，表现为「滚到中途整段跟着滚出视口」。
   横向裁剪不依赖它：hero 的光晕由 .hero-glow 自己裁，视口那层由 html 的
   overflow-x: hidden 兜底；body 那层由下面这条复位规则放开。 */
:global(html.ai-intro-scroll body) {
  overflow: visible !important;
}

.ai-intro-v2 {
  --ai-nav-h: 72px;
  /* 强调色：亮色取 hero-surface 的 --hero-accent，暗色切到它的 --hero-accent-on-dark。
     ⚠️ --hero-accent 自己**不随主题翻转**，直接拿它当文字色会在暗底上留下 #0071e3
        这种对比度不足的蓝（小字尤其明显），所以这里做一次别名配对。
     ⚠️ --boh-brand-green / --boh-bg-* 由 themes/dark-mode.css 提供，而那个文件是
        暗色激活后才由 theme-css-loader.js 注入的 —— 亮色下它根本不存在，**必须带
        fallback**（与 src/style.css 里 var(--boh-brand-blue, #0071e3) 同一套写法）。 */
  --ai-accent: var(--hero-accent);
  --ai-grad: linear-gradient(92deg, var(--ai-accent), var(--boh-brand-green, #34c759));
  min-height: 100vh;
  padding-top: var(--ai-nav-h);
  /* 环境色晕：给玻璃材质一层可折射的底。原先靠一套写死的浅色网格渐变 + 三个
     blur(70px) 漂移球，暗色下完全失效；现在由品牌色经 color-mix 派生、自动翻转。
     刻意不设实底色 —— 页面底色交给 body 的 --boh-page-bg（唯一真源）。 */
  background:
    radial-gradient(
      72% 42% at 50% 0%,
      color-mix(in srgb, var(--boh-brand-blue, #0071e3) 8%, transparent),
      transparent 72%
    ),
    radial-gradient(
      52% 32% at 6% 44%,
      color-mix(in srgb, var(--boh-brand-green, #34c759) 6%, transparent),
      transparent 72%
    ),
    radial-gradient(
      60% 34% at 94% 80%,
      color-mix(in srgb, var(--boh-brand-blue, #0071e3) 5%, transparent),
      transparent 72%
    );
  color: var(--hero-text);
  font-family:
    -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
[data-theme='dark'] .ai-intro-v2 {
  --ai-accent: var(--hero-accent-on-dark);
}
.wrap {
  width: min(1120px, 100% - 48px);
  margin: 0 auto;
}
.kicker {
  margin: 0;
  color: var(--ai-accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.hero .kicker {
  font-size: var(--hero-eyebrow-size);
  letter-spacing: var(--hero-eyebrow-tracking);
}
.kicker.center,
.h2.center,
.lede.center {
  text-align: center;
}
.h2 {
  margin: 12px 0 0;
  font-size: var(--hero-headline-s);
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.15;
  text-wrap: balance;
}
.h2 .grad {
  background: var(--ai-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lede {
  max-width: var(--hero-sub-measure);
  margin: 16px auto 0;
  color: var(--hero-text-secondary);
  font-size: 17px;
  line-height: 1.65;
  text-wrap: pretty;
}
.lede.left {
  margin-left: 0;
}

/* ---- 下滑 reveal ---- */
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition:
    opacity 0.8s var(--ease-emphasized),
    transform 0.8s var(--ease-emphasized);
  will-change: opacity, transform;
}
.reveal.is-visible {
  opacity: 1;
  transform: none;
}
.is-mounted .hero .reveal {
  opacity: 0;
  transform: translateY(22px);
  animation: heroUp 0.9s var(--ease-emphasized) forwards;
}
.is-mounted .hero .d1 {
  animation-delay: 0.06s;
}
.is-mounted .hero .d2 {
  animation-delay: 0.14s;
}
.is-mounted .hero .d3 {
  animation-delay: 0.22s;
}
.is-mounted .hero .d4 {
  animation-delay: 0.3s;
}
.is-mounted .hero .d5 {
  animation-delay: 0.4s;
}
.is-mounted .hero .d6 {
  animation-delay: 0.5s;
}
.is-mounted .hero .reveal.is-visible {
  animation: none;
  opacity: 1;
  transform: none;
}
@keyframes heroUp {
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---- Hero ---- */
.hero {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 72px 24px 40px;
  text-align: center;
  isolation: isolate;
}
/* 品牌光晕：由 --hero-accent / --boh-brand-green 经 color-mix 派生，
   跟随主题自动翻转 —— 不再需要一组写死的浅蓝 / 浅绿径向渐变 + 三个 blur(70px) 漂移球。 */
.hero-glow {
  position: absolute;
  /* 横向**不留出血**（inset 左右为 0）：超出视口的绝对定位元素会把
     documentElement.scrollWidth 撑大（实测 1440 下多出 86px），
     旧版是靠根节点 overflow: hidden 盖住的 —— 而那个 hidden 正是 sticky 失效的原因，
     不能再加回来。竖向留一点出血不影响横向滚动。 */
  inset: -10% 0 auto;
  height: 130%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(
      52% 46% at 50% 6%,
      color-mix(in srgb, var(--ai-accent) 14%, transparent),
      transparent 72%
    ),
    radial-gradient(
      38% 38% at 86% 22%,
      color-mix(in srgb, var(--boh-brand-green, #34c759) 12%, transparent),
      transparent 72%
    );
}
.hero-cloud {
  position: absolute;
  left: 50%;
  bottom: -240px;
  width: min(880px, 90vw);
  transform: translateX(-50%);
  opacity: 0.22;
  pointer-events: none;
  mask-image: linear-gradient(180deg, #000 30%, transparent 85%);
  -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 85%);
}
[data-theme='dark'] .hero-cloud {
  opacity: 0.1;
}
.hero-inner {
  width: min(780px, 100%);
}
.hero h1 {
  margin: 10px 0 0;
  font-size: var(--hero-headline-l);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
}
.hero h1 .dot {
  color: var(--ai-accent);
}
.hero .sub {
  margin: 14px 0 0;
  font-size: var(--hero-sub-size);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.hero .copy {
  max-width: var(--hero-sub-measure);
  margin: 16px auto 0;
  color: var(--hero-text-secondary);
  font-size: 17px;
  line-height: 1.7;
}
.hero-cta {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 30px;
  flex-wrap: wrap;
}

/* 主 / 次 CTA：规格取自 hero-surface 的 --hero-cta-* */
.btn-primary {
  min-height: var(--hero-cta-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 28px;
  border: 0;
  border-radius: var(--liquid-radius-pill);
  background: var(--ai-accent);
  color: var(--hero-text-on-dark);
  font-size: var(--hero-cta-font-size);
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--liquid-shadow-sm);
  transition:
    background var(--duration-fast) var(--ease-out),
    transform var(--duration-press) var(--ease-out);
}
.btn-primary.sm {
  min-height: 44px;
  padding: 0 20px;
  font-size: 15px;
}
.btn-quiet {
  min-height: var(--hero-cta-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 24px;
  color: var(--hero-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--duration-press) var(--ease-out);
}
/* hover 只在真有指针的设备上做（触屏的 :hover 会粘住） */
@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover {
    background: var(--hero-accent-hover);
  }
  .btn-quiet:hover {
    transform: translateY(-1px);
  }
}
.btn-primary:active,
.btn-quiet:active {
  transform: scale(0.97);
}

.prompt-bar {
  width: min(620px, 100%);
  display: grid;
  grid-template-columns: 34px 1fr 34px;
  align-items: center;
  gap: 10px;
  margin: 34px auto 0;
  padding: 8px 8px 8px 10px;
  text-align: left;
}
.prompt-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--ai-grad);
  color: var(--hero-text-on-dark);
}
.prompt-text {
  color: var(--hero-text);
  font-size: 14.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prompt-send {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--hero-text);
  color: var(--boh-bg-primary, #ffffff);
}
.hero-meta {
  display: flex;
  justify-content: center;
  gap: 18px;
  margin-top: 22px;
  color: var(--hero-text-muted);
  font-size: 13px;
  flex-wrap: wrap;
}
.hero-meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.scroll-hint {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--hero-text-muted);
  cursor: pointer;
  animation: bob 2.2s var(--ease-in-out) infinite;
}
@keyframes bob {
  50% {
    transform: translateX(-50%) translateY(6px);
  }
}

/* ---- 介绍三步 ---- */
.intro-strip {
  padding: 96px 0 8px;
}
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 44px;
}
.step {
  padding: 28px 26px;
}
.step-num {
  font-size: 13px;
  font-weight: 800;
  color: var(--ai-accent);
  letter-spacing: 0.08em;
}
.step svg {
  margin-top: 14px;
  color: var(--hero-text);
}
.step h3 {
  margin: 12px 0 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.step p {
  margin: 8px 0 0;
  color: var(--hero-text-secondary);
  font-size: 14.5px;
  line-height: 1.65;
}

/* ---- 模式切换 / 固定视窗分镜 ----
   钉不钉**不靠写死断点猜**，靠量（见脚本里的 measureFit）：先摆成钉住时的布局
   （.is-staged），量它有没有超出一屏；超了就不钉、退回点按切换。
   写死 min-width 的老做法在窄横屏 / 矮窗口 / 接口多返回一个模式时都会翻车 ——
   钉住段一旦比视口还高，sticky 就失效，底部会被永远截掉。
   钉住时 .modes 只负责「撑出滚动距离」，.modes-sticky 才是被钉在视口里的那一屏；
   滚动距离 = --modes-count × 64svh，模式越多走得越从容（数量来自接口，可能不是 5 个）。 */
.modes {
  scroll-margin-top: var(--ai-nav-h);
}
.modes-sticky {
  padding: 88px 0 104px;
}
/* staged = 钉住时的布局，但不粘。测量必须在「已经摆好」的盒子上做，
   所以它比 is-pinned 多存在一步；min-height 同时是测量的标尺（见 measureFit）。
   ⚠️ 用 grid 而不是 flex 列，两个坑一起躲开：
     ① flex 列在内容超出时会**压扁子项**（默认 flex-shrink: 1），而 .mode-card 带
        overflow: hidden —— 结果不是「塞不下」而是「内容被静默裁掉」，还把 measureFit
        一起骗了（盒子被压到正好一屏，量出来永远「塞得下」）。实测 375×667 卡片被从
        523px 压到 395px，第二行优点和示例都被切掉了。grid 没有收缩语义：内容超高就
        把盒子撑高，measureFit 拿到的是真值。
     ② 为躲①而加的 flex: none 又会把 .seg 按内容宽度撑开（实测竖屏 342px 的容器里
        撑到 600px，横向溢出 234px）。grid 子项默认横向撑满，不需要额外声明。 */
.modes.is-staged .modes-sticky {
  min-height: 100svh;
  display: grid;
  /* ⚠️ 必须显式 minmax(0, 1fr)：默认的 auto 轨道会按**内容 max-content** 定宽 ——
     竖屏下 .seg 里 5 个 nowrap 按钮把它撑到 600px，轨道跟着 600，横向溢出 234px。
     minmax(0, 1fr) 把轨道钉死成容器宽，.seg 再由自己的 overflow-x 内部横滚。 */
  grid-template-columns: minmax(0, 1fr);
  align-content: center;
  /* 顶栏是 fixed 的：留出导航高度的内容偏移，否则被钉住的标题会压在导航下面 */
  padding: calc(var(--ai-nav-h) + 24px) 0 32px;
}
.modes.is-pinned {
  height: calc(100svh + var(--modes-count, 5) * 64svh);
}
/* ⚠️ 这里**只加 sticky，不写 height**：高度留给 .is-staged 的 min-height 管。
   写过 height: 100svh 会让盒子恒等于一屏 —— 于是 measureFit 里「盒子高 ≤ min-height」
   永远成立，内容明明超了也量不出来（实测 375×667 卡片被裁掉 130px 仍判「塞得下」）。
   只在 fits 为真时才会走到这条规则，此时内容本就 ≤ 一屏，盒子自然正好一屏。 */
.modes.is-pinned .modes-sticky {
  position: sticky;
  top: 0;
}
/* 钉住时收一圈内边距 / 卡高下限，把整屏内容压进视口。
   卡高下限取「最高那一档模式的自然高度」：给低了每切一档卡片就变高变矮，
   钉住时整块会跟着上下跳。 */
.modes.is-staged .mode-left,
.modes.is-staged .mode-right {
  padding: 36px 44px;
}
.modes.is-staged .mode-grid,
.modes.is-staged .mode-slide {
  min-height: min(440px, 46svh);
}
/* 分段器：底 / 描边 / 圆角 / 阴影全部由 .liquid-glass--pill 提供，本页只补排版。
   ⚠️ 必须给**确定宽度**（min(720px, 100%)）+ justify-self: center，不能用
      `margin: 0 auto` 居中：横向 auto margin 会吃掉全部自由空间，**从而禁用
      grid / flex 的 stretch**（规范行为）—— 于是这个格子按内容 max-content 撑开，
      竖屏下 5 个 nowrap 按钮把它撑到 600px（容器只有 342px），横向溢出 234px。
      实测：justify-self:stretch / min-width:0 / max-width:none 三个改法全部无效，
      只有确定宽度有效。 */
.seg {
  position: relative;
  width: min(720px, 100%);
  justify-self: center;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0;
  margin: 34px 0 0;
}
.seg-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: var(--liquid-radius-pill);
  background: var(--liquid-bg-strong);
  box-shadow: var(--liquid-shadow-sm);
  transition:
    left 0.45s var(--ease-drawer),
    width 0.45s var(--ease-drawer);
}
.seg-btn {
  position: relative;
  z-index: 1;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: var(--liquid-radius-pill);
  background: transparent;
  color: var(--hero-text-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--duration-base) var(--ease-out);
  white-space: nowrap;
}
.seg-btn.active {
  color: var(--hero-text);
}
.mode-card {
  margin-top: 22px;
  overflow: hidden;
}
.mode-grid {
  min-height: 440px;
}
.mode-slide {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  min-height: 440px;
}
.mode-left {
  padding: 52px 54px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.mode-top {
  display: flex;
  align-items: center;
  gap: 14px;
}
/* 图标底 / 描边用「本色 + transparent」混色，而不是 + white —— 后者在暗色玻璃上
   会糊出一块发白的底。混 transparent 在两种主题下都成立。 */
.mode-mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: var(--liquid-radius-md);
  background: color-mix(in srgb, var(--mode-color) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
  color: var(--mode-color);
}
.mode-eyebrow {
  color: var(--mode-color, var(--hero-accent));
  font-size: 13px;
  font-weight: 700;
}
.mode-name {
  margin: 18px 0 0;
  font-size: clamp(36px, 4vw, 46px);
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1;
}
.mode-headline {
  margin: 14px 0 0;
  font-size: 21px;
  font-weight: 650;
}
.mode-summary {
  margin: 12px 0 0;
  color: var(--hero-text-secondary);
  font-size: 15px;
  line-height: 1.7;
}
.mode-cta-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 28px;
  flex-wrap: wrap;
}
.mode-arrows {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--hero-text-muted);
}
.arrow-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--liquid-border-hairline);
  background: var(--liquid-bg-strong);
  cursor: pointer;
  color: var(--hero-text);
  transition: background var(--duration-fast) var(--ease-out);
}
.arrow-btn:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
}
.rot90 {
  transform: rotate(90deg);
}
.rot-90 {
  transform: rotate(-90deg);
}
.mode-count {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.dots {
  display: none;
  gap: 8px;
  margin-top: 22px;
}
.dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--boh-text-muted, #c7c7cc);
  cursor: pointer;
}
.dots .on {
  background: var(--hero-text);
  width: 22px;
  border-radius: 99px;
}
.mode-right {
  padding: 52px 54px;
  background: var(--liquid-bg-nested);
  border-left: 1px solid var(--liquid-border-hairline);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.detail-title {
  margin: 0 0 18px;
  color: var(--hero-text-muted);
  font-size: 13px;
  font-weight: 700;
}
.strengths {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.strengths li {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  align-items: start;
  background: var(--liquid-bg-strong);
  border: 1px solid var(--liquid-border-hairline);
  border-radius: var(--liquid-radius-md);
  padding: 14px;
  font-size: 14.5px;
  line-height: 1.5;
  box-shadow: var(--liquid-shadow-sm);
}
.check {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--boh-brand-green, #34c759) 18%, transparent);
  color: var(--boh-brand-green, #34c759);
}
.example {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 10px;
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--liquid-border-hairline);
  color: var(--hero-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}
.mode-status {
  margin: 0;
  padding: 12px;
  text-align: center;
  color: var(--hero-text-muted);
  font-size: 12.5px;
  border-top: 1px solid var(--liquid-border-hairline);
}

/* 切换滑动动效 */
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition:
    opacity 0.38s var(--ease-emphasized),
    transform 0.38s var(--ease-emphasized);
}
.slide-next-enter-from {
  opacity: 0;
  transform: translateX(56px);
}
.slide-next-leave-to {
  opacity: 0;
  transform: translateX(-56px);
}
.slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-56px);
}
.slide-prev-leave-to {
  opacity: 0;
  transform: translateX(56px);
}

/* ---- 能力：一张玻璃面板 + 三格（原先是硬编码 #000 的「深色 Apple 带」，
   在暗色主题下会和页面糊成一片；改用玻璃面板后两种主题下都有清晰的层次） ---- */
.caps-section {
  padding: 96px 0;
}
.caps-panel {
  padding: 64px 48px;
  text-align: center;
}
.caps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 44px;
  text-align: left;
}
.cap {
  border-radius: var(--liquid-radius-md);
  padding: 30px 26px;
  background: var(--liquid-bg-nested);
  border: 1px solid var(--liquid-border-hairline);
}
.cap svg {
  color: var(--ai-accent);
}
.cap h3 {
  margin: 18px 0 0;
  font-size: 19px;
  font-weight: 700;
}
.cap p {
  margin: 10px 0 0;
  color: var(--hero-text-secondary);
  font-size: 14.5px;
  line-height: 1.7;
}

/* ---- 生态 ---- */
.eco {
  padding: 110px 0;
}
.eco-grid {
  display: grid;
  grid-template-columns: 1fr 0.92fr;
  gap: 64px;
  align-items: center;
}
.eco-visual {
  position: relative;
  border-radius: var(--liquid-radius-lg);
  overflow: hidden;
  background: var(--liquid-bg-subtle);
  box-shadow: var(--liquid-shadow);
}
.eco-visual img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 0.82;
  object-fit: cover;
  object-position: center 47%;
}
.eco-float {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px 10px 12px;
  font-size: 13.5px;
  font-weight: 600;
}
.trust {
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.trust li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 12px;
  align-items: center;
  padding: 16px;
  border-radius: var(--liquid-radius-md);
  background: var(--liquid-bg-strong);
  border: 1px solid var(--liquid-border-hairline);
  box-shadow: var(--liquid-shadow-sm);
}
.trust svg {
  color: var(--boh-brand-green, #34c759);
  justify-self: center;
}
.trust b {
  display: block;
  font-size: 14.5px;
}
.trust span {
  color: var(--hero-text-secondary);
  font-size: 13.5px;
}

/* ---- 收尾 ---- */
.closing {
  padding: 20px 0 90px;
}
/* 类库的 --strong 档圆角是 md（16px），收尾大卡用 lg 更合比例 */
.close-card {
  margin: 0 auto;
  max-width: 860px;
  text-align: center;
  padding: 64px 32px;
  border-radius: var(--liquid-radius-lg);
}
.close-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  border-radius: var(--liquid-radius-md);
  background: var(--ai-grad);
  color: var(--hero-text-on-dark);
}
.close-card h2 {
  margin: 22px 0 0;
  font-size: var(--hero-headline-s);
  letter-spacing: -0.02em;
}
.close-card p {
  margin: 12px 0 0;
  color: var(--hero-text-secondary);
  font-size: 16px;
}
.close-cta {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 18px;
  margin-top: 30px;
  flex-wrap: wrap;
}
.fine {
  margin: 26px 0 0;
  text-align: center;
  color: var(--hero-text-muted);
  font-size: 12.5px;
}

@media (max-width: 900px) {
  .steps,
  .caps {
    grid-template-columns: 1fr;
  }
  .caps-panel {
    padding: 40px 22px;
  }
  .caps-section {
    padding: 72px 0;
  }
  .mode-slide {
    grid-template-columns: 1fr;
  }
  .mode-left,
  .mode-right {
    padding: 36px 26px;
  }
  .mode-right {
    border-left: 0;
    border-top: 1px solid var(--liquid-border-hairline);
  }
  .eco-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .seg {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .seg::-webkit-scrollbar {
    display: none;
  }
  .seg-btn {
    flex: 1 0 auto;
    min-width: 118px;
  }
  .seg-thumb {
    display: none;
  }
  .seg-btn.active {
    background: var(--liquid-bg-strong);
    box-shadow: var(--liquid-shadow-sm);
  }
  .dots {
    display: flex;
  }

  /* 钉住 / 测量态的紧凑版：竖屏视口只有 ~840px，而原样卡片 771px + 标题 151px
     根本塞不进一屏（实测 390×844：整块 1251px）。这里收内边距、字号与行距，
     把整块压进一屏；个别更矮的机型（375×667）仍塞不下时，由 measureFit 判定不钉。 */
  .modes.is-staged .modes-sticky {
    padding: calc(var(--ai-nav-h) + 10px) 0 14px;
  }
  .modes.is-staged .h2 {
    font-size: clamp(23px, 6.2vw, 30px);
  }
  .modes.is-staged .lede {
    margin-top: 6px;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .modes.is-staged .seg {
    margin-top: 12px;
  }
  .modes.is-staged .mode-card {
    margin-top: 12px;
  }
  .modes.is-staged .mode-left,
  .modes.is-staged .mode-right {
    padding: 15px;
  }
  .modes.is-staged .mode-mark {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .modes.is-staged .mode-mark svg {
    width: 22px;
    height: 22px;
  }
  .modes.is-staged .mode-name {
    margin-top: 8px;
    font-size: 25px;
  }
  .modes.is-staged .mode-headline {
    margin-top: 6px;
    font-size: 15px;
  }
  .modes.is-staged .mode-summary {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.5;
  }
  .modes.is-staged .mode-cta-row {
    margin-top: 10px;
    gap: 12px;
  }
  .modes.is-staged .btn-primary.sm {
    min-height: 42px;
    padding: 0 18px;
    font-size: 14px;
  }
  .modes.is-staged .dots {
    margin-top: 10px;
  }
  .modes.is-staged .detail-title {
    margin-bottom: 7px;
    font-size: 12px;
  }
  .modes.is-staged .strengths {
    gap: 6px;
  }
  .modes.is-staged .strengths li {
    padding: 6px 10px;
    font-size: 12.5px;
    line-height: 1.4;
    border-radius: 12px;
  }
  .modes.is-staged .check {
    width: 19px;
    height: 19px;
  }
  .modes.is-staged .example {
    margin-top: 8px;
    padding-top: 8px;
    font-size: 12px;
  }
  .modes.is-staged .mode-grid,
  .modes.is-staged .mode-slide {
    min-height: 0;
  }
  /* 摘要与示例按「最多两行」预留高度：切档时文案行数不同（1 行 / 2 行），
     不预留的话卡片高度会在 485~523 之间来回跳，钉住时整块跟着上下抖。
     用 em 而不是写死 px —— 字号变了也跟着变。 */
  .modes.is-staged .mode-summary {
    min-height: 3em;
  }
  .modes.is-staged .example p {
    min-height: 3.2em;
  }
}
@media (max-width: 520px) {
  .ai-intro-v2 {
    --ai-nav-h: 54px;
  }
  .hero {
    padding-top: 56px;
  }
  .hero-cta .btn-primary,
  .hero-cta .btn-quiet {
    width: 100%;
    justify-content: center;
  }
  .prompt-text {
    font-size: 13px;
  }
  .mode-left,
  .mode-right {
    padding: 30px 20px;
  }
  .close-card {
    padding: 48px 22px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reveal,
  .is-mounted .hero .reveal {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
    transition: none !important;
  }
  .scroll-hint {
    animation: none !important;
  }
  .slide-next-enter-active,
  .slide-prev-enter-active,
  .slide-next-leave-active,
  .slide-prev-leave-active {
    transition: none !important;
  }
  .seg-thumb {
    transition: none;
  }
}
</style>

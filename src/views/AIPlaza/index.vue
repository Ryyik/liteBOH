<template>
  <main class="ai-intro">
    <section class="product-hero" aria-labelledby="boh-ai-title">
      <img class="hero-visual" :src="bohCloudVisual" alt="" aria-hidden="true">
      <div class="hero-content">
        <p class="hero-kicker">BOH AI</p>
        <h1 id="boh-ai-title">BOH AI</h1>
        <p class="hero-statement">从一个问题，到完成一件事。</p>
        <p class="hero-copy">理解你的想法，整理复杂信息，并在需要时把任务拆解到可以执行的下一步。</p>
        <div class="hero-actions">
          <button type="button" class="primary-action" @click="goChat()">
            开始使用
            <ArrowRight :size="18" aria-hidden="true" />
          </button>
          <button type="button" class="secondary-action" @click="scrollToModes">
            探索模式
            <ChevronDown :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="hero-prompt" aria-hidden="true">
        <Sparkles :size="18" />
        <span>把零散想法整理成一份清晰计划</span>
        <ArrowUp :size="17" />
      </div>
    </section>

    <section ref="modesSection" class="modes-section">
      <div class="section-heading">
        <p class="section-kicker">为每一种思考，选择合适的方式</p>
        <h2>同一个 BOH AI，不同的工作节奏。</h2>
        <p>快速回答、深入分析、分步规划或协作执行，模式之间可以随时切换。</p>
      </div>

      <div class="mode-explorer">
        <div class="mode-tabs" role="tablist" aria-label="BOH AI 模式">
          <button v-for="(mode, index) in publicModes" :id="`mode-tab-${mode.modeId}`" :key="mode.modeId"
            type="button" role="tab" class="mode-tab" :class="{ active: index === activeModeIndex }"
            :aria-selected="index === activeModeIndex" :aria-controls="`mode-panel-${mode.modeId}`"
            @click="activeModeIndex = index">
            <component :is="mode.iconComponent" :size="17" aria-hidden="true" />
            <span>{{ mode.displayName }}</span>
          </button>
        </div>

        <div v-if="selectedMode" :id="`mode-panel-${selectedMode.modeId}`" class="mode-panel" role="tabpanel"
          :aria-labelledby="`mode-tab-${selectedMode.modeId}`">
          <div class="mode-overview">
            <div class="mode-mark" :style="{ '--mode-color': selectedMode.color }">
              <component :is="selectedMode.iconComponent" :size="28" aria-hidden="true" />
            </div>
            <p class="mode-label">{{ selectedMode.eyebrow }}</p>
            <h3>{{ selectedMode.displayName }}</h3>
            <p class="mode-headline">{{ selectedMode.headline }}</p>
            <p class="mode-summary">{{ selectedMode.summary }}</p>
            <button type="button" class="mode-action" @click="goChat(selectedMode.modeId)">
              使用 {{ selectedMode.displayName }}
              <ArrowRight :size="17" aria-hidden="true" />
            </button>
          </div>

          <div class="mode-details">
            <p class="detail-title">适合这些时刻</p>
            <ul>
              <li v-for="item in selectedMode.strengths" :key="item">
                <Check :size="17" aria-hidden="true" />
                <span>{{ item }}</span>
              </li>
            </ul>
            <div class="mode-example">
              <MessageSquareText :size="19" aria-hidden="true" />
              <p>{{ selectedMode.example }}</p>
            </div>
          </div>
        </div>

        <p v-if="loading" class="mode-status" role="status">正在同步可用模式...</p>
        <p v-else-if="error" class="mode-status">当前展示标准模式，进入对话后将自动同步可用选项。</p>
      </div>
    </section>

    <section class="capability-section">
      <div class="capability-heading">
        <p class="section-kicker">不止回答问题</p>
        <h2>让信息真正向前流动。</h2>
      </div>
      <div class="capability-list">
        <article v-for="capability in capabilities" :key="capability.title" class="capability-item">
          <component :is="capability.icon" :size="25" aria-hidden="true" />
          <h3>{{ capability.title }}</h3>
          <p>{{ capability.copy }}</p>
        </article>
      </div>
    </section>

    <section class="ecosystem-section">
      <div class="ecosystem-visual">
        <img :src="bohCloudVisual" alt="BOH Cloud 功能连接示意">
      </div>
      <div class="ecosystem-copy">
        <p class="section-kicker">与你的 BOH 空间协同</p>
        <h2>理解上下文，也尊重边界。</h2>
        <p>在你允许的范围内，BOH AI 可以连接站内信息、个人内容与历史对话，让每次交流少一点重复，多一点连续。</p>
        <div class="trust-points">
          <span><ShieldCheck :size="18" /> 由你决定何时引用</span>
          <span><Brain :size="18" /> 围绕当前任务组织上下文</span>
        </div>
      </div>
    </section>

    <section class="closing-section">
      <Sparkles :size="28" aria-hidden="true" />
      <h2>今天，想先完成什么？</h2>
      <p>选择一种模式，或直接开始。BOH AI 会跟上你的节奏。</p>
      <button type="button" class="closing-action" @click="goChat()">
        打开 BOH AI
        <ArrowRight :size="18" aria-hidden="true" />
      </button>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  Zap
} from 'lucide-vue-next'
import bohCloudVisual from '@/assets/home-hero/BOHcloud.webp'
import { listActiveBohaiPublicModeConfigs } from '@/utils/api/bohai-model-config-api.js'

const router = useRouter()
const modesSection = ref(null)
const modes = ref([])
const loading = ref(true)
const error = ref(null)
const activeModeIndex = ref(0)

const MODE_PROFILES = {
  ultra: {
    displayName: 'Aurora',
    eyebrow: '高质量创作与分析',
    headline: '把复杂问题想得更完整。',
    summary: '适合需要深度、判断与表达质量的任务，在更多细节之间建立清晰联系。',
    strengths: ['长内容梳理与高质量写作', '复杂问题分析与观点比较', '需要充分上下文的连续对话'],
    example: '帮我比较这三个方案，并给出有依据的最终建议。',
    color: '#0f8a6a',
    iconComponent: Sparkles
  },
  fast: {
    displayName: 'Lume',
    eyebrow: '轻快日常',
    headline: '想到就问，马上继续。',
    summary: '为日常问答与轻量任务提供直接、清楚的回应，让思路不中断。',
    strengths: ['快速问答与内容改写', '灵感补充与简短总结', '高频、轻量的日常交流'],
    example: '把这段通知改得更简洁、自然一些。',
    color: '#2563eb',
    iconComponent: Zap
  },
  pro: {
    displayName: 'Aether',
    eyebrow: '均衡处理',
    headline: '速度与质量，恰到好处。',
    summary: '面对大多数工作与学习任务，兼顾响应效率、内容结构和结果可靠性。',
    strengths: ['学习辅助与知识解释', '文档整理与结构化输出', '兼顾效率与细节的综合任务'],
    example: '把这些会议记录整理成结论、待办和负责人。',
    color: '#7c3aed',
    iconComponent: Scale
  },
  plan: {
    displayName: 'Plan',
    eyebrow: '长任务规划',
    headline: '先看全局，再一步步推进。',
    summary: '把目标拆成清晰步骤，持续跟进进度，并在条件变化时重新调整路线。',
    strengths: ['复杂目标拆解与排期', '多阶段任务持续推进', '风险、依赖与下一步梳理'],
    example: '为这个月的社区活动制定完整执行计划。',
    color: '#d97706',
    iconComponent: ListChecks
  },
  'agent-cluster': {
    displayName: 'Caelum',
    eyebrow: '协作执行',
    headline: '让不同专长同时工作。',
    summary: '将复杂任务分配给不同能力角色并行处理，再汇总成一致、可执行的结果。',
    strengths: ['需要多角度处理的综合任务', '检索、分析与执行并行推进', '跨步骤结果统一整理'],
    example: '同时调研资料、整理要点，并生成一份行动建议。',
    color: '#dc4a3d',
    iconComponent: Network
  }
}

const FALLBACK_MODES = [
  { modeId: 'Ultra', displayName: 'Aurora' },
  { modeId: 'fast', displayName: 'Lume' },
  { modeId: 'pro', displayName: 'Aether' },
  { modeId: 'plan', displayName: 'Plan' },
  { modeId: 'agent-cluster', displayName: 'Caelum' }
]

const DEFAULT_PROFILE = {
  eyebrow: '通用智能',
  headline: '为当下的任务提供合适帮助。',
  summary: '理解问题、组织信息，并给出清晰可行的下一步。',
  strengths: ['日常问答与内容整理', '思路扩展与结构化表达', '围绕目标持续对话'],
  example: '帮我理清这个问题，并告诉我下一步该做什么。',
  color: '#0f8a6a',
  iconComponent: Gauge
}

const publicModes = computed(() => {
  const source = modes.value.length ? modes.value : FALLBACK_MODES
  return source.map((mode) => {
    const profile = MODE_PROFILES[String(mode.modeId || '').toLowerCase()] || DEFAULT_PROFILE
    return {
      modeId: mode.modeId,
      ...profile,
      displayName: mode.displayName || profile.displayName || 'BOH AI'
    }
  })
})

const selectedMode = computed(() => publicModes.value[activeModeIndex.value] || publicModes.value[0])

const capabilities = [
  {
    icon: Search,
    title: '找到关键内容',
    copy: '从站内信息和当前上下文中提取真正相关的部分，减少来回翻找。'
  },
  {
    icon: Workflow,
    title: '把想法变成步骤',
    copy: '将模糊目标整理为结构、优先级和下一步，让事情更容易开始。'
  },
  {
    icon: Brain,
    title: '保持对话连续',
    copy: '围绕正在进行的任务保留必要上下文，不必每次都从头解释。'
  }
]

const goChat = (modeId) => {
  router.push({ path: '/ai-chat', query: modeId ? { mode: modeId } : {} })
}

const scrollToModes = () => {
  modesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  try {
    const result = await listActiveBohaiPublicModeConfigs()
    if (result.ok && result.data.length) {
      modes.value = result.data
      return
    }
    error.value = result.error?.message || '模式同步失败'
  } catch (requestError) {
    error.value = requestError?.message || '模式同步失败'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.ai-intro {
  --intro-nav-height: 72px;
  --ink: #111312;
  --muted: #626865;
  --line: #dfe3e0;
  --accent: #0f8a6a;
  min-height: 100vh;
  padding-top: var(--intro-nav-height);
  overflow: hidden;
  background: #ffffff;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
}

.product-hero {
  position: relative;
  min-height: min(720px, calc(100svh - var(--intro-nav-height)));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 86px 24px 54px;
  overflow: hidden;
  background: #f7f8f7;
  text-align: center;
  isolation: isolate;
}

.hero-visual {
  position: absolute;
  z-index: -1;
  left: 50%;
  bottom: -330px;
  width: min(930px, 82vw);
  height: auto;
  transform: translateX(-50%);
  opacity: 0.38;
  pointer-events: none;
}

.hero-content {
  width: min(760px, 100%);
}

.hero-kicker,
.section-kicker,
.mode-label {
  margin: 0;
  color: var(--accent);
  font-size: 13px;
  font-weight: 760;
  letter-spacing: 0;
}

.hero-content h1 {
  margin: 12px 0 8px;
  font-size: 72px;
  font-weight: 760;
  line-height: 1;
  letter-spacing: 0;
}

.hero-statement {
  margin: 0;
  font-size: 30px;
  font-weight: 650;
  line-height: 1.25;
}

.hero-copy {
  max-width: 610px;
  margin: 18px auto 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.72;
}

.hero-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 30px;
}

.primary-action,
.secondary-action,
.mode-action,
.closing-action {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 20px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 680;
  transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease;
}

.primary-action,
.mode-action {
  background: #111312;
  color: #ffffff;
}

.secondary-action {
  border-color: #cfd4d1;
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
}

.primary-action:hover,
.mode-action:hover {
  background: #2c302e;
  transform: translateY(-1px);
}

.secondary-action:hover {
  border-color: #9fa7a2;
  background: #ffffff;
}

.hero-prompt {
  width: min(620px, calc(100% - 40px));
  min-height: 54px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 12px;
  margin-top: 58px;
  padding: 0 18px;
  border: 1px solid rgba(17, 19, 18, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 18px 44px rgba(22, 30, 26, 0.08);
  color: #676d69;
  text-align: left;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.hero-prompt svg:last-child {
  width: 28px;
  height: 28px;
  padding: 5px;
  border-radius: 50%;
  background: #111312;
  color: #ffffff;
}

.modes-section {
  padding: 112px 24px 124px;
  scroll-margin-top: var(--intro-nav-height);
  background: #ffffff;
}

.section-heading,
.capability-heading {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.section-heading {
  text-align: center;
}

.section-heading h2,
.capability-heading h2,
.ecosystem-copy h2,
.closing-section h2 {
  margin: 12px 0 0;
  font-size: 44px;
  font-weight: 720;
  line-height: 1.14;
  letter-spacing: 0;
}

.section-heading > p:last-child {
  max-width: 620px;
  margin: 18px auto 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.7;
}

.mode-explorer {
  width: min(1120px, 100%);
  margin: 52px auto 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: #fbfcfb;
}

.mode-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-bottom: 1px solid var(--line);
  background: #f2f4f2;
}

.mode-tab {
  min-width: 0;
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border-right: 1px solid var(--line);
  color: #69706c;
  font-size: 14px;
  font-weight: 650;
  transition: background-color 150ms ease, color 150ms ease;
}

.mode-tab:last-child {
  border-right: 0;
}

.mode-tab:hover {
  color: var(--ink);
}

.mode-tab.active {
  background: #ffffff;
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--accent);
}

.mode-panel {
  min-height: 460px;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(300px, 0.92fr);
  background: #ffffff;
}

.mode-overview,
.mode-details {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 58px 64px;
}

.mode-details {
  border-left: 1px solid var(--line);
  background: #f5f7f5;
}

.mode-mark {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  border: 1px solid color-mix(in srgb, var(--mode-color) 28%, white);
  border-radius: 8px;
  background: color-mix(in srgb, var(--mode-color) 10%, white);
  color: var(--mode-color);
}

.mode-overview h3 {
  margin: 10px 0 0;
  font-size: 42px;
  font-weight: 730;
  line-height: 1;
}

.mode-headline {
  margin: 18px 0 0;
  font-size: 23px;
  font-weight: 660;
  line-height: 1.35;
}

.mode-summary {
  max-width: 520px;
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.72;
}

.mode-action {
  align-self: flex-start;
  margin-top: 26px;
}

.detail-title {
  margin: 0 0 20px;
  color: #555c58;
  font-size: 13px;
  font-weight: 720;
}

.mode-details ul {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
}

.mode-details li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  color: #2f3431;
  font-size: 15px;
  line-height: 1.5;
}

.mode-details li svg {
  margin-top: 2px;
  color: var(--accent);
}

.mode-example {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 12px;
  margin-top: 34px;
  padding-top: 24px;
  border-top: 1px solid #d8ddda;
  color: #535a56;
}

.mode-example p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.mode-status {
  margin: 0;
  padding: 10px 16px;
  border-top: 1px solid var(--line);
  color: #7b827e;
  font-size: 12px;
  text-align: center;
}

.capability-section {
  padding: 112px 24px;
  background: #111312;
  color: #ffffff;
}

.capability-heading .section-kicker {
  color: #7dd8bc;
}

.capability-list {
  width: min(1120px, 100%);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 64px auto 0;
  border-top: 1px solid #3b403d;
}

.capability-item {
  min-width: 0;
  padding: 40px 42px 10px 0;
  border-right: 1px solid #3b403d;
}

.capability-item + .capability-item {
  padding-left: 42px;
}

.capability-item:last-child {
  border-right: 0;
}

.capability-item > svg {
  color: #7dd8bc;
}

.capability-item h3 {
  margin: 24px 0 0;
  font-size: 21px;
  font-weight: 680;
}

.capability-item p {
  margin: 12px 0 0;
  color: #aeb6b1;
  font-size: 15px;
  line-height: 1.7;
}

.ecosystem-section {
  width: min(1180px, calc(100% - 48px));
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.92fr);
  align-items: center;
  gap: 72px;
  margin: 0 auto;
  padding: 120px 0;
}

.ecosystem-visual {
  overflow: hidden;
  border-radius: 8px;
  background: #f3f5f4;
}

.ecosystem-visual img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 0.82;
  object-fit: cover;
  object-position: center 47%;
}

.ecosystem-copy > p:not(.section-kicker) {
  margin: 22px 0 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.75;
}

.trust-points {
  display: grid;
  gap: 14px;
  margin-top: 28px;
}

.trust-points span {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #303632;
  font-size: 14px;
  font-weight: 620;
}

.trust-points svg {
  color: var(--accent);
}

.closing-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 112px 24px 120px;
  background: #edf6f1;
  text-align: center;
}

.closing-section > svg {
  color: var(--accent);
}

.closing-section p {
  margin: 18px 0 0;
  color: var(--muted);
  font-size: 16px;
}

.closing-action {
  margin-top: 30px;
  background: var(--accent);
  color: #ffffff;
}

.closing-action:hover {
  background: #0b7258;
  transform: translateY(-1px);
}

@media (orientation: landscape) and (max-width: 1024px) {
  .ai-intro {
    --intro-nav-height: 64px;
  }
}

@media (orientation: portrait) and (max-width: 768px) {
  .ai-intro {
    --intro-nav-height: 60px;
  }
}

@media (orientation: portrait) and (max-width: 480px) {
  .ai-intro {
    --intro-nav-height: 54px;
  }
}

@media (max-width: 820px) {
  .product-hero {
    min-height: min(700px, calc(100svh - var(--intro-nav-height)));
    padding: 68px 20px 42px;
  }

  .hero-visual {
    bottom: -190px;
    width: 760px;
    max-width: none;
    opacity: 0.3;
  }

  .hero-content h1 {
    font-size: 48px;
  }

  .hero-statement {
    font-size: 24px;
  }

  .hero-copy {
    font-size: 15px;
  }

  .hero-prompt {
    margin-top: 42px;
  }

  .modes-section,
  .capability-section {
    padding: 88px 20px;
  }

  .section-heading h2,
  .capability-heading h2,
  .ecosystem-copy h2,
  .closing-section h2 {
    font-size: 34px;
  }

  .mode-tabs {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mode-tabs::-webkit-scrollbar {
    display: none;
  }

  .mode-tab {
    min-width: 132px;
    flex: 1 0 auto;
  }

  .mode-panel {
    grid-template-columns: 1fr;
  }

  .mode-overview,
  .mode-details {
    padding: 42px 34px;
  }

  .mode-details {
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .capability-list {
    grid-template-columns: 1fr;
  }

  .capability-item,
  .capability-item + .capability-item {
    padding: 30px 0;
    border-right: 0;
    border-bottom: 1px solid #3b403d;
  }

  .capability-item:last-child {
    border-bottom: 0;
  }

  .ecosystem-section {
    width: min(100% - 40px, 680px);
    grid-template-columns: 1fr;
    gap: 46px;
    padding: 88px 0;
  }
}

@media (max-width: 520px) {
  .product-hero {
    padding-top: 54px;
  }

  .hero-content h1 {
    font-size: 42px;
  }

  .hero-statement {
    font-size: 21px;
  }

  .hero-actions {
    width: 100%;
    flex-direction: column;
  }

  .primary-action,
  .secondary-action {
    width: 100%;
  }

  .hero-prompt {
    margin-top: 30px;
    font-size: 13px;
  }

  .modes-section,
  .capability-section {
    padding: 74px 16px;
  }

  .section-heading h2,
  .capability-heading h2,
  .ecosystem-copy h2,
  .closing-section h2 {
    font-size: 29px;
  }

  .mode-explorer {
    margin-top: 38px;
  }

  .mode-overview,
  .mode-details {
    padding: 34px 24px;
  }

  .mode-overview h3 {
    font-size: 34px;
  }

  .mode-headline {
    font-size: 20px;
  }

  .ecosystem-section {
    width: calc(100% - 32px);
    padding: 74px 0;
  }

  .closing-section {
    padding: 82px 20px 90px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .primary-action,
  .secondary-action,
  .mode-action,
  .closing-action {
    transition: none;
  }
}
</style>

<template>
  <main class="ai-intro-v2" :class="{ 'is-mounted': mounted }">
    <!-- ===== Hero：Apple 极简 + 液态玻璃 ===== -->
    <section class="hero" aria-labelledby="boh-ai-title">
      <div class="hero-mesh" aria-hidden="true">
        <span class="blob b1" />
        <span class="blob b2" />
        <span class="blob b3" />
        <img class="hero-cloud" :src="bohCloudVisual" alt="" aria-hidden="true" />
      </div>

      <div class="hero-inner">
        <p class="kicker reveal">BOH AI · 方块之家</p>
        <h1 id="boh-ai-title" class="reveal d1">BOH AI<span class="dot">.</span></h1>
        <p class="sub reveal d2">从一个问题，到完成一件事。</p>
        <p class="copy reveal d3">理解你的想法，整理复杂信息，并在需要时把任务拆解到可以执行的下一步。同一个 BOH AI，五种工作节奏，随时切换。</p>
        <div class="hero-cta reveal d4">
          <button type="button" class="btn-primary" @click="goChat()">
            开始使用 <ArrowRight :size="17" aria-hidden="true" />
          </button>
          <button type="button" class="btn-glass" @click="scrollToModes">
            探索五种模式 <ChevronDown :size="17" aria-hidden="true" />
          </button>
        </div>

        <!-- 液态玻璃悬浮输入条：单层玻璃，外层唯一 blur -->
        <div class="liquid-glass liquid-glass--pill liquid-glass--subtle prompt-bar reveal d5" aria-hidden="true">
          <span class="prompt-icon"><Sparkles :size="17" /></span>
          <span class="prompt-text" :key="selectedMode?.modeId">{{ selectedMode?.example || '把零散想法整理成一份清晰计划' }}</span>
          <span class="prompt-send"><ArrowUp :size="16" /></span>
        </div>

        <div class="hero-meta reveal d6">
          <span><Check :size="14" /> 无需学习成本</span>
          <span><Check :size="14" /> 模式随时切换</span>
          <span><Check :size="14" /> 尊重你的边界</span>
        </div>
      </div>

      <button type="button" class="scroll-hint" aria-label="向下滚动查看模式" @click="scrollToModes">
        <ChevronDown :size="20" />
      </button>
    </section>

    <!-- ===== 介绍：BOH AI 是什么 ===== -->
    <section class="intro-strip">
      <div class="wrap">
        <p class="kicker center reveal">介绍</p>
        <h2 class="h2 center reveal">不止回答问题，<span class="grad">而是帮你推进事情。</span></h2>
        <p class="lede center reveal">三种能力贯穿所有模式：找关键、变步骤、保连续。你只管表达，结构和下一步交给 BOH AI。</p>
        <div class="steps">
          <article v-for="(s, i) in steps" :key="s.title" class="step liquid-glass reveal" :style="{ transitionDelay: `${i * 90}ms` }">
            <span class="step-num">{{ s.num }}</span>
            <component :is="s.icon" :size="22" aria-hidden="true" />
            <h3>{{ s.title }}</h3>
            <p>{{ s.copy }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== 模式：分段切换 + 滑动切换面板 ===== -->
    <section ref="modesSection" class="modes">
      <div class="wrap">
        <p class="kicker center reveal">五种模式</p>
        <h2 class="h2 center reveal">同一个 BOH AI，不同的工作节奏。</h2>
        <p class="lede center reveal">快速回答、深入分析、分步规划或协作执行。点按切换，左右滑动也可切换。</p>

        <!-- Apple 分段选择器：实色轨道 + 滑动白色 thumb，避免玻璃嵌套 -->
        <div class="seg reveal" role="tablist" aria-label="BOH AI 模式">
          <span
            class="seg-thumb"
            aria-hidden="true"
            :style="{ left: `calc(${(activeModeIndex * 100) / tabCount}% + 4px)`, width: `calc(${100 / tabCount}% - 8px)` }"
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
            @click="setActive(index)"
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
                    <button type="button" class="btn-primary sm" @click="goChat(selectedMode.modeId)">
                      使用 {{ selectedMode.displayName }} <ArrowRight :size="16" aria-hidden="true" />
                    </button>
                    <div class="mode-arrows" aria-hidden="false">
                      <button type="button" class="arrow-btn" aria-label="上一个模式" @click="prev"><ChevronDown :size="17" class="rot90" /></button>
                      <span class="mode-count">{{ activeModeIndex + 1 }} / {{ tabCount }}</span>
                      <button type="button" class="arrow-btn" aria-label="下一个模式" @click="next"><ChevronDown :size="17" class="rot-90" /></button>
                    </div>
                  </div>
                  <!-- 移动端小点 -->
                  <div class="dots" aria-hidden="true">
                    <span v-for="(m, i) in publicModes" :key="m.modeId" :class="{ on: i === activeModeIndex }" @click="setActive(i)" />
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
          <p v-else-if="error" class="mode-status">当前展示标准模式，进入对话后将自动同步可用选项。</p>
        </div>
      </div>
    </section>

    <!-- ===== 能力：深色 Apple 区 + 暗玻璃卡 ===== -->
    <section class="dark">
      <div class="wrap">
        <p class="kicker light reveal">能力</p>
        <h2 class="h2 light reveal">让信息真正向前流动。</h2>
        <div class="caps">
          <article v-for="(c, i) in capabilities" :key="c.title" class="cap reveal" :style="{ transitionDelay: `${i * 90}ms` }">
            <component :is="c.icon" :size="24" aria-hidden="true" />
            <h3>{{ c.title }}</h3>
            <p>{{ c.copy }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== 生态：图文 + 液态玻璃信任列表 ===== -->
    <section class="eco">
      <div class="wrap eco-grid">
        <div class="eco-visual reveal">
          <img :src="bohCloudVisual" alt="BOH Cloud 功能连接示意" />
          <div class="liquid-glass liquid-glass--pill liquid-glass--subtle eco-float" aria-hidden="true">
            <ShieldCheck :size="16" /> 由你决定何时引用
          </div>
        </div>
        <div class="eco-copy">
          <p class="kicker reveal">与你的 BOH 空间协同</p>
          <h2 class="h2 reveal">理解上下文，也尊重边界。</h2>
          <p class="lede left reveal">在你允许的范围内，BOH AI 可以连接站内信息、个人内容与历史对话，让每次交流少一点重复，多一点连续。</p>
          <ul class="trust reveal">
            <li><ShieldCheck :size="18" /><div><b>由你决定何时引用</b><span>默认不读取，需要时才授权。</span></div></li>
            <li><Brain :size="18" /><div><b>围绕当前任务组织上下文</b><span>保留必要记忆，不必每次从头解释。</span></div></li>
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
            <button type="button" class="btn-primary" @click="goChat()">打开 BOH AI <ArrowRight :size="17" aria-hidden="true" /></button>
            <button type="button" class="btn-quiet" @click="scrollToModes">先看看模式 ›</button>
          </div>
        </div>
        <p class="fine">BOH AI · 方块之家 — 同一个智能，不同节奏。</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
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
const slideDir = ref(1)
const mounted = ref(false)
let observer = null

const MODE_PROFILES = {
  ultra: {
    displayName: 'Aurora', eyebrow: '高质量创作与分析', headline: '把复杂问题想得更完整。',
    summary: '适合需要深度、判断与表达质量的任务，在更多细节之间建立清晰联系。',
    strengths: ['长内容梳理与高质量写作', '复杂问题分析与观点比较', '需要充分上下文的连续对话'],
    example: '帮我比较这三个方案，并给出有依据的最终建议。', color: '#0f8a6a', iconComponent: Sparkles
  },
  fast: {
    displayName: 'Lume', eyebrow: '轻快日常', headline: '想到就问，马上继续。',
    summary: '为日常问答与轻量任务提供直接、清楚的回应，让思路不中断。',
    strengths: ['快速问答与内容改写', '灵感补充与简短总结', '高频、轻量的日常交流'],
    example: '把这段通知改得更简洁、自然一些。', color: '#2563eb', iconComponent: Zap
  },
  pro: {
    displayName: 'Aether', eyebrow: '均衡处理', headline: '速度与质量，恰到好处。',
    summary: '面对大多数工作与学习任务，兼顾响应效率、内容结构和结果可靠性。',
    strengths: ['学习辅助与知识解释', '文档整理与结构化输出', '兼顾效率与细节的综合任务'],
    example: '把这些会议记录整理成结论、待办和负责人。', color: '#7c3aed', iconComponent: Scale
  },
  plan: {
    displayName: 'Plan', eyebrow: '长任务规划', headline: '先看全局，再一步步推进。',
    summary: '把目标拆成清晰步骤，持续跟进进度，并在条件变化时重新调整路线。',
    strengths: ['复杂目标拆解与排期', '多阶段任务持续推进', '风险、依赖与下一步梳理'],
    example: '为这个月的社区活动制定完整执行计划。', color: '#d97706', iconComponent: ListChecks
  },
  'agent-cluster': {
    displayName: 'Caelum', eyebrow: '协作执行', headline: '让不同专长同时工作。',
    summary: '将复杂任务分配给不同能力角色并行处理，再汇总成一致、可执行的结果。',
    strengths: ['需要多角度处理的综合任务', '检索、分析与执行并行推进', '跨步骤结果统一整理'],
    example: '同时调研资料、整理要点，并生成一份行动建议。', color: '#dc4a3d', iconComponent: Network
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
  eyebrow: '通用智能', headline: '为当下的任务提供合适帮助。',
  summary: '理解问题、组织信息，并给出清晰可行的下一步。',
  strengths: ['日常问答与内容整理', '思路扩展与结构化表达', '围绕目标持续对话'],
  example: '帮我理清这个问题，并告诉我下一步该做什么。', color: '#0f8a6a', iconComponent: Gauge
}

const publicModes = computed(() => {
  const source = modes.value.length ? modes.value : FALLBACK_MODES
  return source.map((mode) => {
    const profile = MODE_PROFILES[String(mode.modeId || '').toLowerCase()] || DEFAULT_PROFILE
    return { modeId: mode.modeId, ...profile, displayName: mode.displayName || profile.displayName || 'BOH AI' }
  })
})
const tabCount = computed(() => publicModes.value.length || 1)
const selectedMode = computed(() => publicModes.value[activeModeIndex.value] || publicModes.value[0])

const capabilities = [
  { icon: Search, title: '找到关键内容', copy: '从站内信息和当前上下文中提取真正相关的部分，减少来回翻找。' },
  { icon: Workflow, title: '把想法变成步骤', copy: '将模糊目标整理为结构、优先级和下一步，让事情更容易开始。' },
  { icon: Brain, title: '保持对话连续', copy: '围绕正在进行的任务保留必要上下文，不必每次都从头解释。' }
]

const steps = [
  { num: '01', icon: Search, title: '说清楚问题', copy: '一句话也可以，BOH AI 会帮你补全背景和关键信息。' },
  { num: '02', icon: Workflow, title: '选一种节奏', copy: 'Aurora 想深一点，Lume 快一点，Plan 拆细一点，随时可换。' },
  { num: '03', icon: Sparkles, title: '拿到可执行结果', copy: '结论、步骤、待办一次给清，直接开始做。' }
]

const goChat = (modeId) => router.push({ path: '/ai-chat', query: modeId ? { mode: modeId } : {} })
const scrollToModes = () => modesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })

function setActive(i) {
  if (i === activeModeIndex.value) return
  slideDir.value = i > activeModeIndex.value ? 1 : -1
  activeModeIndex.value = i
}
function next() { setActive((activeModeIndex.value + 1) % publicModes.value.length) }
function prev() { setActive((activeModeIndex.value - 1 + publicModes.value.length) % publicModes.value.length) }

let touchX = null
function onTouchStart(e) { touchX = e.changedTouches?.[0]?.clientX ?? null }
function onTouchEnd(e) {
  if (touchX == null) return
  const dx = (e.changedTouches?.[0]?.clientX ?? 0) - touchX
  if (Math.abs(dx) > 48) { if (dx < 0) next(); else prev() }
  touchX = null
}

function setupReveal() {
  const els = document.querySelectorAll('.ai-intro-v2 .reveal')
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return }
  observer = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); observer.unobserve(en.target) } })
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
  els.forEach((el) => observer.observe(el))
}

onMounted(async () => {
  requestAnimationFrame(() => { mounted.value = true })
  await nextTick()
  setupReveal()
  try {
    const result = await listActiveBohaiPublicModeConfigs()
    if (result.ok && result.data.length) { modes.value = result.data; return }
    error.value = result.error?.message || '模式同步失败'
  } catch (requestError) {
    error.value = requestError?.message || '模式同步失败'
  } finally {
    loading.value = false
  }
})
onUnmounted(() => observer?.disconnect())
</script>

<style scoped>
.ai-intro-v2 {
  --nav-h: 72px;
  --ink: #1d1d1f;
  --muted: #6e6e73;
  --blue: #0071e3;
  --blue-hover: #0077ed;
  --bg: #fbfbfd;
  --card: #f5f5f7;
  min-height: 100vh;
  padding-top: var(--nav-h);
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.wrap { width: min(1120px, 100% - 48px); margin: 0 auto; }
.kicker { margin: 0; color: var(--blue); font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.kicker.center, .h2.center, .lede.center { text-align: center; }
.kicker.light { color: #7dd8bc; }
.h2 { margin: 12px 0 0; font-size: clamp(32px, 4.4vw, 48px); font-weight: 700; letter-spacing: -0.015em; line-height: 1.1; }
.h2.light { color: #fff; }
.h2 .grad { background: linear-gradient(90deg, #0071e3, #42a5f5 55%, #0f8a6a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lede { max-width: 640px; margin: 16px auto 0; color: var(--muted); font-size: 17px; line-height: 1.65; }
.lede.left { margin-left: 0; }

/* ---- 下滑 reveal ---- */
.reveal { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(0.16,1,0.3,1), transform .8s cubic-bezier(0.16,1,0.3,1); will-change: opacity, transform; }
.reveal.is-visible { opacity: 1; transform: none; }
.is-mounted .hero .reveal { opacity: 0; transform: translateY(22px); animation: heroUp .9s cubic-bezier(0.16,1,0.3,1) forwards; }
.is-mounted .hero .d1 { animation-delay: .06s; } .is-mounted .hero .d2 { animation-delay: .14s; }
.is-mounted .hero .d3 { animation-delay: .22s; } .is-mounted .hero .d4 { animation-delay: .3s; }
.is-mounted .hero .d5 { animation-delay: .4s; } .is-mounted .hero .d6 { animation-delay: .5s; }
.is-mounted .hero .reveal.is-visible { animation: none; opacity: 1; transform: none; }
@keyframes heroUp { to { opacity: 1; transform: none; } }

/* ---- Hero ---- */
.hero { position: relative; display: flex; justify-content: center; padding: 84px 24px 30px; text-align: center; isolation: isolate; }
.hero-mesh { position: absolute; inset: 0; z-index: -1; overflow: hidden; background: linear-gradient(180deg, #fbfbfd 0%, #f2f6fb 55%, #eef5f1 100%); }
.blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; animation: drift 14s ease-in-out infinite alternate; }
.b1 { width: 520px; height: 520px; left: 8%; top: -180px; background: radial-gradient(circle, #cfe4ff, transparent 65%); }
.b2 { width: 460px; height: 460px; right: 6%; top: -120px; background: radial-gradient(circle, #d8f3e5, transparent 65%); animation-delay: -5s; }
.b3 { width: 620px; height: 320px; left: 50%; bottom: -160px; transform: translateX(-50%); background: radial-gradient(ellipse, #e3ecff, transparent 65%); opacity: .5; }
@keyframes drift { to { transform: translateY(26px) scale(1.04); } }
.b3 { animation-name: driftX; } @keyframes driftX { to { transform: translateX(-50%) translateY(18px); } }
.hero-cloud { position: absolute; left: 50%; bottom: -260px; width: min(880px, 90vw); transform: translateX(-50%); opacity: .28; pointer-events: none; mask-image: linear-gradient(180deg, #000 30%, transparent 85%); -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 85%); }
.hero-inner { width: min(780px, 100%); }
.hero h1 { margin: 10px 0 0; font-size: clamp(52px, 9vw, 84px); font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
.hero h1 .dot { color: var(--blue); }
.hero .sub { margin: 14px 0 0; font-size: clamp(22px, 3.4vw, 30px); font-weight: 650; letter-spacing: -0.01em; }
.hero .copy { max-width: 620px; margin: 16px auto 0; color: var(--muted); font-size: 17px; line-height: 1.7; }
.hero-cta { display: flex; justify-content: center; gap: 12px; margin-top: 30px; flex-wrap: wrap; }
.btn-primary { min-height: 52px; display: inline-flex; align-items: center; gap: 8px; padding: 0 28px; border: 0; border-radius: 980px; background: var(--blue); color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform .2s cubic-bezier(0.16,1,0.3,1), background .2s; box-shadow: 0 8px 24px rgba(0,113,227,.28); }
.btn-primary:hover { background: var(--blue-hover); transform: translateY(-1px) scale(1.01); }
.btn-primary:active { transform: scale(.98); }
.btn-primary.sm { min-height: 48px; padding: 0 24px; font-size: 15px; }
.btn-glass { min-height: 52px; display: inline-flex; align-items: center; gap: 8px; padding: 0 24px; border-radius: 980px; border: 1px solid rgba(255,255,255,.7); background: rgba(255,255,255,.6); color: var(--ink); font-size: 15px; font-weight: 600; cursor: pointer; backdrop-filter: blur(18px) saturate(180%); -webkit-backdrop-filter: blur(18px) saturate(180%); box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 8px 24px rgba(15,23,42,.08); transition: transform .2s; }
.btn-glass:hover { transform: translateY(-1px); }
.prompt-bar { width: min(620px, 100%); display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; gap: 10px; margin: 34px auto 0; padding: 8px 8px 8px 10px !important; border-radius: 980px !important; text-align: left; }
.prompt-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(135deg, #0071e3, #0f8a6a); color: #fff; }
.prompt-text { color: #3a3a3c; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prompt-send { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: #1d1d1f; color: #fff; }
.hero-meta { display: flex; justify-content: center; gap: 18px; margin-top: 22px; color: var(--muted); font-size: 13px; flex-wrap: wrap; }
.hero-meta span { display: inline-flex; align-items: center; gap: 6px; }
.scroll-hint { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: #86868b; cursor: pointer; animation: bob 2.2s ease-in-out infinite; }
@keyframes bob { 50% { transform: translateX(-50%) translateY(6px); } }

/* ---- 介绍三步 ---- */
.intro-strip { padding: 96px 0 8px; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 44px; }
.step { padding: 28px 26px; border-radius: 28px !important; }
.step-num { font-size: 13px; font-weight: 800; color: var(--blue); letter-spacing: .08em; }
.step svg { margin-top: 14px; color: var(--ink); }
.step h3 { margin: 12px 0 0; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
.step p { margin: 8px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.65; }

/* ---- 模式切换 ---- */
.modes { padding: 88px 0 104px; scroll-margin-top: var(--nav-h); }
.seg { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0; max-width: 720px; margin: 34px auto 0; padding: 4px; border-radius: 980px; background: rgba(232,232,237,.9); }
.seg-thumb { position: absolute; top: 4px; bottom: 4px; border-radius: 980px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.12); transition: left .45s cubic-bezier(0.32,0.72,0,1), width .45s cubic-bezier(0.32,0.72,0,1); }
.seg-btn { position: relative; z-index: 1; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 980px; background: transparent; color: #6e6e73; font-size: 14px; font-weight: 600; cursor: pointer; transition: color .25s; white-space: nowrap; }
.seg-btn.active { color: var(--ink); }
.mode-card { margin-top: 22px; border-radius: 28px !important; overflow: hidden; }
.mode-grid { min-height: 440px; }
.mode-slide { display: grid; grid-template-columns: 1.05fr .95fr; min-height: 440px; }
.mode-left { padding: 52px 54px; display: flex; flex-direction: column; justify-content: center; }
.mode-top { display: flex; align-items: center; gap: 14px; }
.mode-mark { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; background: color-mix(in srgb, var(--mode-color) 12%, white); border: 1px solid color-mix(in srgb, var(--mode-color) 24%, white); color: var(--mode-color); }
.mode-eyebrow { color: var(--mode-color, var(--blue)); font-size: 13px; font-weight: 700; }
.mode-name { margin: 18px 0 0; font-size: clamp(36px, 4vw, 46px); font-weight: 750; letter-spacing: -0.02em; line-height: 1; }
.mode-headline { margin: 14px 0 0; font-size: 21px; font-weight: 650; }
.mode-summary { margin: 12px 0 0; color: var(--muted); font-size: 15px; line-height: 1.7; }
.mode-cta-row { display: flex; align-items: center; gap: 18px; margin-top: 28px; flex-wrap: wrap; }
.mode-arrows { display: inline-flex; align-items: center; gap: 10px; color: var(--muted); }
.arrow-btn { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; border: 1px solid rgba(0,0,0,.1); background: #fff; cursor: pointer; color: var(--ink); }
.arrow-btn:hover { background: var(--card); }
.rot90 { transform: rotate(90deg); } .rot-90 { transform: rotate(-90deg); }
.mode-count { font-size: 13px; font-variant-numeric: tabular-nums; }
.dots { display: none; gap: 8px; margin-top: 22px; }
.dots span { width: 7px; height: 7px; border-radius: 50%; background: #d2d2d7; cursor: pointer; }
.dots .on { background: var(--ink); width: 22px; border-radius: 99px; }
.mode-right { padding: 52px 54px; background: rgba(245,245,247,.72); border-left: 1px solid rgba(0,0,0,.06); display: flex; flex-direction: column; justify-content: center; }
.detail-title { margin: 0 0 18px; color: #6e6e73; font-size: 13px; font-weight: 700; }
.strengths { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.strengths li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; background: #fff; border: 1px solid rgba(0,0,0,.05); border-radius: 16px; padding: 14px; font-size: 14.5px; line-height: 1.5; box-shadow: 0 2px 10px rgba(0,0,0,.04); }
.check { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: #e8f5ee; color: #0f8a6a; }
.example { display: grid; grid-template-columns: 26px 1fr; gap: 10px; margin-top: 22px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,.08); color: #515154; font-size: 14px; line-height: 1.6; }
.mode-status { margin: 0; padding: 12px; text-align: center; color: #86868b; font-size: 12.5px; border-top: 1px solid rgba(0,0,0,.06); }

/* 切换滑动动效 */
.slide-next-enter-active, .slide-next-leave-active, .slide-prev-enter-active, .slide-prev-leave-active { transition: opacity .38s cubic-bezier(0.16,1,0.3,1), transform .38s cubic-bezier(0.16,1,0.3,1); }
.slide-next-enter-from { opacity: 0; transform: translateX(56px); }
.slide-next-leave-to { opacity: 0; transform: translateX(-56px); }
.slide-prev-enter-from { opacity: 0; transform: translateX(-56px); }
.slide-prev-leave-to { opacity: 0; transform: translateX(56px); }

/* ---- 深色能力区 ---- */
.dark { margin: 0 16px; border-radius: 32px; background: #000; color: #f5f5f7; padding: 96px 0; }
.caps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 48px; }
.cap { border-radius: 24px; padding: 34px 30px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%); box-shadow: inset 0 1px 0 rgba(255,255,255,.14); }
.cap svg { color: #7dd8bc; }
.cap h3 { margin: 20px 0 0; font-size: 20px; font-weight: 700; }
.cap p { margin: 10px 0 0; color: #a1a1a6; font-size: 14.5px; line-height: 1.7; }

/* ---- 生态 ---- */
.eco { padding: 110px 0; }
.eco-grid { display: grid; grid-template-columns: 1fr .92fr; gap: 64px; align-items: center; }
.eco-visual { position: relative; border-radius: 28px; overflow: hidden; background: #eef1ef; box-shadow: 0 20px 60px rgba(15,23,42,.1); }
.eco-visual img { display: block; width: 100%; aspect-ratio: 1 / .82; object-fit: cover; object-position: center 47%; }
.eco-float { position: absolute; left: 16px; bottom: 16px; display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px 10px 12px !important; font-size: 13.5px; font-weight: 600; }
.trust { list-style: none; margin: 28px 0 0; padding: 0; display: grid; gap: 12px; }
.trust li { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: center; padding: 16px; border-radius: 20px; background: rgba(255,255,255,.75); border: 1px solid rgba(0,0,0,.05); backdrop-filter: blur(16px) saturate(170%); -webkit-backdrop-filter: blur(16px) saturate(170%); box-shadow: 0 8px 24px rgba(15,23,42,.06); }
.trust svg { color: #0f8a6a; justify-self: center; }
.trust b { display: block; font-size: 14.5px; }
.trust span { color: var(--muted); font-size: 13.5px; }

/* ---- 收尾 ---- */
.closing { padding: 20px 0 90px; }
.close-card { margin: 0 auto; max-width: 860px; text-align: center; padding: 72px 32px !important; border-radius: 32px !important; background: linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.72)) !important; }
.close-icon { width: 52px; height: 52px; margin: 0 auto; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(135deg, #0071e3, #0f8a6a); color: #fff; }
.close-card h2 { margin: 22px 0 0; font-size: clamp(30px, 4vw, 42px); letter-spacing: -0.02em; }
.close-card p { margin: 12px 0 0; color: var(--muted); font-size: 16px; }
.close-cta { display: flex; justify-content: center; align-items: center; gap: 18px; margin-top: 30px; flex-wrap: wrap; }
.btn-quiet { border: 0; background: none; color: var(--blue); font-size: 15px; font-weight: 600; cursor: pointer; }
.fine { margin: 26px 0 0; text-align: center; color: #86868b; font-size: 12.5px; }

@media (max-width: 900px) {
  .steps, .caps { grid-template-columns: 1fr; }
  .mode-slide { grid-template-columns: 1fr; }
  .mode-left, .mode-right { padding: 36px 26px; }
  .mode-right { border-left: 0; border-top: 1px solid rgba(0,0,0,.06); }
  .eco-grid { grid-template-columns: 1fr; gap: 40px; }
  .seg { display: flex; overflow-x: auto; scrollbar-width: none; }
  .seg::-webkit-scrollbar { display: none; }
  .seg-btn { flex: 1 0 auto; min-width: 118px; }
  .seg-thumb { display: none; }
  .seg-btn.active { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
  .dots { display: flex; }
  .dark { margin: 0 10px; padding: 72px 0; }
}
@media (max-width: 520px) {
  .ai-intro-v2 { --nav-h: 54px; }
  .hero { padding-top: 56px; }
  .hero-cta .btn-primary, .hero-cta .btn-glass { width: 100%; justify-content: center; }
  .prompt-text { font-size: 13px; }
  .mode-left, .mode-right { padding: 30px 20px; }
  .close-card { padding: 52px 22px !important; }
}
@media (prefers-reduced-motion: reduce) {
  .reveal, .is-mounted .hero .reveal { opacity: 1 !important; transform: none !important; animation: none !important; transition: none !important; }
  .blob, .scroll-hint { animation: none !important; }
  .slide-next-enter-active, .slide-prev-enter-active, .slide-next-leave-active, .slide-prev-leave-active { transition: none !important; }
  .seg-thumb { transition: none; }
}
</style>

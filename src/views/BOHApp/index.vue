<script setup>
/**
 * BOH App 产品介绍页（/app）
 *
 * 页面结构：Hero → 滚动特写（sticky 分镜）→ 能力网格 → 安装步骤 → 下载区
 *
 * 两条实现约束（都踩过坑，改动前先读）：
 * 1. 根节点与 html/body 都必须 overflow: visible，否则祖先的 overflow 会把
 *    sticky 舞台降级成普通块，滚动分镜直接失效。
 * 2. 滚动进度整体走 rAF 节流 + 缓存几何量，不在 scroll 回调里读 getBoundingClientRect，
 *    否则每帧强制同步布局。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  ArrowDown, BatteryCharging, Check, Copy, Download, Eraser,
  Feather, ShieldCheck, Users
} from 'lucide-vue-next'
import { ANDROID_APP_RELEASE, detectPlatform } from './app-release.js'

const release = ANDROID_APP_RELEASE

const rootRef = ref(null)
const stageRef = ref(null)

const platform = ref('desktop')
const reduceMotion = ref(false)
const heroProgress = ref(0)
const stageProgress = ref(0)
const copyState = ref('idle')

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

/**
 * 滚动分镜的三个卖点 —— 只讲三件别的客户端做不到的事：
 * 免更新、离线启动、原生形态。
 *
 * ⚠️ 这里和下方 highlights 必须严格不重复。凡是能塞进 highlights 的补充细节，
 *    就不要在这里占一屏；这里每多讲一条，网格就少一条可讲的。
 */
const features = [
  {
    kicker: '01 · 版本',
    title: '每次打开，都是新版',
    body: '不用记着升级，也不用等下载。打开的那一刻，拿到的就是最新的方块之家。',
    note: '只有图标、应用名这类外壳资源变了，才需要重新安装',
  },
  {
    kicker: '02 · 启动',
    title: '秒开，断网也进得来',
    body: '应用外壳留在手机里。点开先出画面，不必等一次网络往返。',
    note: '离线时先看上次的内容，连上网自动补齐',
  },
  {
    kicker: '03 · 形态',
    title: '没有地址栏',
    body: `独立窗口，自己的启动屏和任务栈。长按桌面图标，直接进${release.shortcuts.map((s) => s.label).join('、')}。`,
    note: '深色模式跟随系统自动切换',
  },
]

/**
 * 补充细节。每一条都必须是分镜里没提过的角度，
 * 否则同一件事会被说两遍，页面上看着就啰嗦了。
 */
const highlights = [
  { icon: Feather, title: '秒下秒装', body: `${release.sizeLabel}，下载不用等` },
  { icon: BatteryCharging, title: '不常驻后台', body: '关掉就是关掉，不偷偷占资源' },
  { icon: Users, title: '账号是同一套', body: '与网页共用登录，帖子和积分实时一致' },
  { icon: Eraser, title: '卸载无残留', body: '不绑定商店账号，删掉就干净' },
]

const steps = [
  { title: '下载安装包', body: '点上面的按钮，浏览器会存下一个不到 1 MB 的文件。' },
  { title: '允许安装', body: '首次会提示「未知来源」。这是侧载应用的正常流程，允许即可。' },
  { title: '打开并登录', body: '用你已有的账号登录。之后打开就是社区，没有多余步骤。' },
]

const downloadHref = release.downloadUrl

const isStandalone = computed(() => platform.value === 'standalone')
const isIos = computed(() => platform.value === 'ios')
const isAndroid = computed(() => platform.value === 'android')

/** 已装用户不必再被引导安装，主按钮让位给版本信息。 */
const primaryLabel = computed(() => (isStandalone.value ? '查看版本信息' : '下载 APK'))

/**
 * 当前分镜序号。整段滚动被均分成「面板数 - 1」个间隔，
 * 于是 progress 的 0 和 1 正好落在首尾两块面板的正中心。
 */
const activeFeatureIndex = computed(() => {
  const last = features.length - 1
  if (last <= 0) return 0
  return Math.min(last, Math.max(0, Math.round(stageProgress.value * last)))
})

/**
 * 分镜面板的视觉状态：唯一驱动量是「离当前进度中心多远」。
 * 相邻面板的透明度之和恒为 1，因此切换是连续交叉淡入淡出，没有黑场。
 *
 * ⚠️ 中心点用 `index / (总屏数 - 1)` 而不是 `(index + 0.5) / 总屏数`：
 *    后者会让首尾两屏永远停在中途（progress 到不了它们的中心），
 *    表现为滚到开头第一屏只剩 25% 不透明度。
 */
const panelStyle = (index) => {
  if (reduceMotion.value) return null
  const last = features.length - 1
  if (last <= 0) return { opacity: 1, pointerEvents: 'auto' }

  // signed：当前进度离本屏中心几个「屏间隔」，0 = 正中，±1 = 相邻屏正中
  const signed = (stageProgress.value - index / last) * last
  const distance = Math.abs(signed)

  // 过渡只在 |signed| 的 0.45 → 0.55 这 10% 区间内完成。
  // 换算成滚动距离约 140px：两屏同时半透明的时间极短，肉眼几乎捕捉不到重影。
  //
  // 为什么不做大幅位移的「翻页」：三屏的标题在版面上位置相同，
  // 而面板只占视口一半高 —— 想靠位移让上下两屏完全不重叠，就得各自移动半屏以上，
  // 于是过渡途中整个视口中间空掉（实测截图：上下各留一片内容、中间全白）。
  // 交叉淡入的短促版本反而是这里唯一不产生空白的方案。
  const t = clamp((distance - 0.45) / 0.1)
  const focus = 1 - t

  return {
    opacity: focus,
    // 只留一点上浮感，不承担分离职责
    transform: `translate3d(0, ${-Math.sign(signed) * t * 36}px, 0)`,
    pointerEvents: focus > 0.5 ? 'auto' : 'none',
  }
}

let stageMetrics = null
let scrollFrame = 0
let geometryObserver = null

const measureStage = () => {
  const element = stageRef.value
  if (!element) {
    stageMetrics = null
    return
  }
  const rect = element.getBoundingClientRect()
  stageMetrics = {
    top: window.scrollY + rect.top,
    distance: element.offsetHeight - window.innerHeight,
  }
}

const updateScroll = () => {
  const viewportHeight = window.innerHeight || 1
  heroProgress.value = reduceMotion.value ? 0 : clamp(window.scrollY / (viewportHeight * 0.85))

  if (!stageMetrics || stageMetrics.distance <= 0) {
    stageProgress.value = 0
    return
  }
  stageProgress.value = clamp((window.scrollY - stageMetrics.top) / stageMetrics.distance)
}

const requestScrollUpdate = () => {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    updateScroll()
    scrollFrame = 0
  })
}

const handleResize = () => {
  measureStage()
  requestScrollUpdate()
}

const copyDownloadLink = async () => {
  try {
    await navigator.clipboard.writeText(downloadHref)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }
  window.setTimeout(() => { copyState.value = 'idle' }, 2200)
}

onMounted(() => {
  platform.value = detectPlatform()
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // 放开 body 的 overflow，否则 sticky 分镜整体失效（原因见 style.scoped.css 顶部注释）
  document.documentElement.classList.add('boh-app-scroll')

  measureStage()
  updateScroll()

  if ('ResizeObserver' in window && rootRef.value) {
    geometryObserver = new ResizeObserver(() => {
      measureStage()
      requestScrollUpdate()
    })
    geometryObserver.observe(rootRef.value)
  }

  window.addEventListener('scroll', requestScrollUpdate, { passive: true })
  window.addEventListener('resize', handleResize, { passive: true })
})

onUnmounted(() => {
  document.documentElement.classList.remove('boh-app-scroll')
  window.removeEventListener('scroll', requestScrollUpdate)
  window.removeEventListener('resize', handleResize)
  geometryObserver?.disconnect()
  geometryObserver = null
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <main ref="rootRef" class="boh-app-page">
    <section class="hero">
      <div class="hero-glow" aria-hidden="true" />

      <div class="hero-inner">
        <div
          class="hero-copy"
          :style="reduceMotion ? null : {
            transform: `translate3d(0, ${heroProgress * -42}px, 0)`,
            opacity: 1 - heroProgress * 1.15
          }"
        >
          <p class="eyebrow">BOH · ANDROID</p>
          <h1>方块之家<br>装进手机</h1>
          <p class="lead">
            不用去应用商店。不用记着升级。
            下载、安装，桌面上就多了一个方块之家。
          </p>

          <div class="hero-actions">
            <a class="btn btn-primary" :href="downloadHref" rel="noopener">
              <Download :size="18" aria-hidden="true" />
              {{ primaryLabel }}
            </a>
            <a class="btn btn-ghost" href="#capability">
              它有什么不一样
              <ArrowDown :size="16" aria-hidden="true" />
            </a>
          </div>

          <ul class="hero-meta">
            <li>{{ release.minAndroidLabel }}</li>
            <li>{{ release.sizeLabel }}</li>
            <li>免费</li>
          </ul>
        </div>

        <div
          class="hero-visual"
          :style="reduceMotion ? null : {
            transform: `translate3d(0, ${heroProgress * -16}px, 0) scale(${1 - heroProgress * 0.05})`,
            opacity: 1 - heroProgress * 0.75
          }"
        >
          <div class="phone">
            <span class="phone-notch" aria-hidden="true" />
            <div class="phone-screen">
              <img class="phone-icon" src="/icons/icon-192.png" alt="BOH 应用图标" width="72" height="72">
              <p class="phone-name">Block of Home</p>
              <p class="phone-hint">正在载入最新版本…</p>
              <span class="phone-bar" aria-hidden="true" />
            </div>
          </div>
          <span class="phone-shadow" aria-hidden="true" />
        </div>
      </div>

      <a class="scroll-cue" href="#capability" aria-label="向下滚动查看能力介绍">
        <ArrowDown :size="18" aria-hidden="true" />
      </a>
    </section>

    <section
      id="capability"
      ref="stageRef"
      class="stage"
      :class="{ 'is-static': reduceMotion }"
      aria-label="BOH App 的滚动能力介绍"
    >
      <div class="stage-sticky">
        <div class="stage-rail" aria-hidden="true">
          <span
            v-for="(feature, index) in features"
            :key="feature.kicker"
            class="rail-dot"
            :class="{ 'is-active': index === activeFeatureIndex }"
          />
        </div>

        <div class="stage-panels">
          <article
            v-for="(feature, index) in features"
            :key="feature.title"
            class="panel"
            :style="panelStyle(index)"
          >
            <div class="panel-text">
              <p class="panel-kicker">{{ feature.kicker }}</p>
              <h2>{{ feature.title }}</h2>
              <p class="panel-body">{{ feature.body }}</p>
              <p class="panel-note">{{ feature.note }}</p>
            </div>

            <div class="panel-visual" aria-hidden="true">
              <template v-if="index === 0">
                <div class="viz viz-update">
                  <span class="viz-card is-old">
                    <em>旧版本</em>
                    <i />
                    <i class="is-short" />
                  </span>
                  <span class="viz-arrow">↑</span>
                  <span class="viz-card is-new">
                    <em>最新版本</em>
                    <i />
                    <i class="is-short" />
                  </span>
                </div>
              </template>

              <template v-else-if="index === 1">
                <div class="viz viz-boot">
                  <span class="viz-boot-core">
                    <span class="viz-boot-dot" />
                  </span>
                  <span class="viz-boot-label">本地外壳 · 0.4s</span>
                </div>
              </template>

              <template v-else>
                <div class="viz viz-window">
                  <span class="viz-browser">
                    <i class="viz-browser-bar" />
                    <i class="viz-browser-body" />
                  </span>
                  <span class="viz-native">
                    <i class="viz-native-body" />
                  </span>
                </div>
              </template>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="highlights" aria-label="能力一览">
      <header class="section-head">
        <p class="eyebrow">能力一览</p>
        <h2>一个小巧的壳，该有的都有</h2>
      </header>

      <ul class="highlight-grid">
        <li v-for="item in highlights" :key="item.title" class="highlight-card">
          <span class="highlight-icon">
            <component :is="item.icon" :size="18" aria-hidden="true" />
          </span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </li>
      </ul>
    </section>

    <section class="steps" aria-label="安装步骤">
      <header class="section-head">
        <p class="eyebrow">安装</p>
        <h2>三步，一分钟</h2>
      </header>

      <ol class="step-list">
        <li v-for="(step, index) in steps" :key="step.title" class="step-item">
          <span class="step-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </li>
      </ol>

      <p class="steps-note">
        <ShieldCheck :size="16" aria-hidden="true" />
        安装包由本项目的构建流水线签名产出，包名固定为
        <code>{{ release.packageId }}</code>，升级时直接覆盖，不会变成两个应用。
      </p>
    </section>

    <section class="download" aria-label="下载">
      <div class="download-card">
        <p class="eyebrow">下载</p>

        <template v-if="isStandalone">
          <h2>你正在 App 里看这一页</h2>
          <p class="download-lead">
            当前版本 {{ release.version }}（build {{ release.versionCode }}）。
            内容已与网页端同步，无需再安装。
          </p>
        </template>

        <template v-else-if="isIos">
          <h2>在 iPhone 上把它加到主屏</h2>
          <p class="download-lead">
            iOS 不支持侧载安装包，但可以用同一个应用，只是入口在浏览器里。
          </p>
          <ol class="ios-steps">
            <li>用 Safari 打开 <strong>blockofhome.cn</strong></li>
            <li>点底部的分享按钮</li>
            <li>选择「添加到主屏幕」</li>
          </ol>
        </template>

        <template v-else>
          <h2>{{ isAndroid ? '现在装一个' : '装到你的安卓设备上' }}</h2>
          <p class="download-lead">
            直接把安装包下到这台设备；如果在电脑上，先复制链接发到手机再打开。
          </p>
        </template>

        <div class="download-actions">
          <a class="btn btn-primary btn-lg" :href="downloadHref" rel="noopener">
            <Download :size="18" aria-hidden="true" />
            下载 APK · {{ release.sizeLabel }}
          </a>

          <button type="button" class="btn btn-ghost" @click="copyDownloadLink">
            <component :is="copyState === 'copied' ? Check : Copy" :size="16" aria-hidden="true" />
            {{ copyState === 'copied' ? '链接已复制' : copyState === 'failed' ? '复制失败，请手动选择' : '复制下载链接' }}
          </button>
        </div>

        <dl class="download-specs">
          <div>
            <dt>版本</dt>
            <dd>{{ release.version }}</dd>
          </div>
          <div>
            <dt>体积</dt>
            <dd>{{ release.sizeLabel }}</dd>
          </div>
          <div>
            <dt>系统要求</dt>
            <dd>{{ release.minAndroidLabel }}</dd>
          </div>
          <div>
            <dt>包名</dt>
            <dd><code>{{ release.packageId }}</code></dd>
          </div>
        </dl>

        <p class="download-foot">
          <a :href="release.releasePageUrl" rel="noopener" target="_blank">查看发布记录与更新日志</a>
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
@import './style.scoped.css';
</style>

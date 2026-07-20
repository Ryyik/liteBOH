<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import originImage from '@/assets/images/blockofhomepage.webp'
import togetherImage from '@/assets/images/main2.webp'
import winterImage from '@/assets/images/winterhouse.webp'
import fourYearsImage from '@/assets/images/2022-7-4years.webp'
import fiveYearsImage from '@/assets/images/2023-7-5years.webp'
import homeImage from '@/assets/images/2024-1-fangkuai.webp'
import sevenYearsImage from '@/assets/images/2025-7years.webp'
import futureImage from '@/assets/images/2025wintermap.webp'
import reunionImage from '@/assets/images/blockschool.webp'

const router = useRouter()
const rootRef = ref(null)
const heroRef = ref(null)
const tunnelRef = ref(null)
const finaleRef = ref(null)

const heroProgress = ref(0)
const tunnelProgress = ref(0)
const finaleProgress = ref(0)
const activeChapter = ref(0)
const reduceMotion = ref(false)
const viewportWidth = ref(1024)

const chapters = [
  {
    year: '2018',
    kicker: 'ORIGIN / 出生点',
    title: '从第一块开始',
    copy: '没有宏大的计划。只是几个人，在一片小小的土地上，放下了第一块方块。',
    image: originImage,
    accent: '#f6b958'
  },
  {
    year: '2020',
    kicker: 'ONLINE / 灯火',
    title: '每次登录，都是回家',
    copy: '真实世界按下暂停，方块世界的灯却一盏盏亮了起来。距离没有阻止我们相遇。',
    image: togetherImage,
    accent: '#7fd5ff'
  },
  {
    year: '2021',
    kicker: 'WINTER / 冬眠号',
    title: '在雪里围一簇火',
    copy: '冬眠生存成为传统。寒冷的地图里，篝火、木屋和并肩冒险让冬天有了温度。',
    image: winterImage,
    accent: '#b8ddff'
  },
  {
    year: '2022',
    kicker: 'TOGETHER / 四周年',
    title: '让烟花为我们停一秒',
    copy: '越来越多的名字出现在同一张合照里。我们庆祝的不是数字，而是仍然站在彼此身边。',
    image: fourYearsImage,
    accent: '#ff8e7a'
  },
  {
    year: '2023',
    kicker: 'ARCHIVE / 五周年',
    title: '记忆开始拥有形状',
    copy: '纪录片、节目与新的故事被保存下来。一个服务器，慢慢长成可以被讲述的共同记忆。',
    image: fiveYearsImage,
    accent: '#68d9ff'
  },
  {
    year: '2024',
    kicker: 'HOME / 不止于方块',
    title: '世界向外生长',
    copy: '新的工具、新的创作和新的相遇从这里发生。BOH 不再只有一张地图，却始终保留家的坐标。',
    image: homeImage,
    accent: '#8ee08f'
  },
  {
    year: '2025',
    kicker: 'MEET / 七周年',
    title: '屏幕那边的人来到身边',
    copy: '一起坐下、一起合影、一起看云。那些熟悉的 ID，终于拥有真实的声音与笑容。',
    image: sevenYearsImage,
    accent: '#ffd76d'
  },
  {
    year: '2026',
    kicker: 'NEXT / 八周年',
    title: '地图还没有边界',
    copy: '八年不是终点。旧世界仍在发光，而第九年的第一块方块，正等待我们一起放下。',
    image: futureImage,
    accent: '#ff6f6f'
  }
]

const blockColors = ['grass', 'dirt', 'stone', 'gold', 'water', 'wood', 'light']
const floatingBlocks = Array.from({ length: 54 }, (_, index) => ({
  id: index,
  type: blockColors[index % blockColors.length],
  x: (index * 37 + 11) % 101,
  y: (index * 61 + 7) % 96,
  size: 8 + ((index * 13) % 24),
  depth: -80 - ((index * 47) % 620),
  delay: (index % 9) * -0.7,
  turn: ((index * 29) % 70) - 35
}))

const figureBlocks = Array.from({ length: 78 }, (_, index) => {
  const t = (index / 78) * Math.PI * 2
  return {
    id: index,
    type: blockColors[(index * 3) % blockColors.length],
    x: 50 + Math.sin(t) * 20,
    y: 50 + Math.sin(t * 2) * 31,
    sx: ((index * 83) % 900) - 450,
    sy: ((index * 137) % 780) - 390,
    sr: ((index * 47) % 540) - 270,
    size: 11 + ((index * 7) % 10)
  }
})

const reunionFragments = [
  { id: 'staff', clip: 'polygon(18% 4%, 38% 4%, 38% 58%, 17% 58%)', x: -34, y: -22, r: -8, s: .82, cx: 28, cy: 31, delay: 0 },
  { id: 'back-center', clip: 'polygon(40% 4%, 55% 4%, 57% 39%, 39% 39%)', x: 8, y: -36, r: 5, s: .78, cx: 48, cy: 21, delay: .08 },
  { id: 'back-white', clip: 'polygon(55% 3%, 70% 3%, 70% 45%, 54% 45%)', x: -8, y: -34, r: -4, s: .8, cx: 62, cy: 23, delay: .03 },
  { id: 'back-right', clip: 'polygon(68% 3%, 84% 3%, 85% 49%, 68% 49%)', x: 32, y: -24, r: 7, s: .84, cx: 76, cy: 25, delay: .13 },
  { id: 'drink', clip: 'polygon(6% 24%, 24% 24%, 25% 62%, 5% 62%)', x: -38, y: -5, r: -7, s: .8, cx: 15, cy: 43, delay: .18 },
  { id: 'ice-cream', clip: 'polygon(22% 27%, 42% 27%, 43% 70%, 21% 70%)', x: -32, y: 13, r: 6, s: .8, cx: 32, cy: 49, delay: .27 },
  { id: 'camera', clip: 'polygon(37% 26%, 55% 26%, 56% 74%, 36% 74%)', x: 2, y: 30, r: -5, s: .76, cx: 46, cy: 50, delay: .2 },
  { id: 'headphones', clip: 'polygon(51% 29%, 68% 29%, 69% 66%, 50% 66%)', x: 4, y: -30, r: 5, s: .82, cx: 60, cy: 48, delay: .3 },
  { id: 'purple', clip: 'polygon(63% 29%, 81% 29%, 82% 79%, 62% 79%)', x: 34, y: 7, r: -6, s: .78, cx: 72, cy: 54, delay: .22 },
  { id: 'pink', clip: 'polygon(78% 27%, 98% 27%, 98% 76%, 77% 76%)', x: 40, y: -3, r: 8, s: .82, cx: 88, cy: 51, delay: .35 },
  { id: 'lollipop', clip: 'polygon(2% 52%, 30% 52%, 31% 100%, 1% 100%)', x: -42, y: 28, r: 8, s: .76, cx: 16, cy: 77, delay: .39 },
  { id: 'pufferfish', clip: 'polygon(25% 56%, 57% 56%, 58% 100%, 24% 100%)', x: -10, y: 38, r: -7, s: .74, cx: 41, cy: 79, delay: .32 },
  { id: 'burger', clip: 'polygon(50% 55%, 72% 55%, 73% 100%, 49% 100%)', x: 12, y: 40, r: 6, s: .76, cx: 61, cy: 78, delay: .43 },
  { id: 'peace', clip: 'polygon(67% 53%, 95% 53%, 96% 100%, 66% 100%)', x: 38, y: 31, r: -7, s: .76, cx: 81, cy: 77, delay: .47 }
]

const currentChapter = computed(() => chapters[activeChapter.value])
const pageProgress = computed(() => (
  (heroProgress.value * 0.18) + (tunnelProgress.value * 0.62) + (finaleProgress.value * 0.2)
))

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function sectionProgress(element) {
  if (!element) return 0
  const rect = element.getBoundingClientRect()
  const distance = element.offsetHeight - window.innerHeight
  return distance > 0 ? clamp(-rect.top / distance) : 0
}

function tunnelPosition() {
  const raw = tunnelProgress.value * (chapters.length - 1)
  if (raw >= chapters.length - 1) return chapters.length - 1

  const chapter = Math.floor(raw)
  const local = raw - chapter
  const transition = clamp((local - 0.72) / 0.28)
  const eased = transition * transition * (3 - 2 * transition)
  return chapter + eased
}

function panelStyle(index) {
  const position = tunnelPosition()
  const delta = index - position
  const distance = Math.abs(delta)
  const visible = distance < 1.35
  const easedScale = Math.max(0.74, 1 - distance * 0.16)

  return {
    '--accent': chapters[index].accent,
    opacity: visible ? Math.max(0, 1 - distance * 0.76) : 0,
    visibility: visible ? 'visible' : 'hidden',
    transform: reduceMotion.value
      ? `translate3d(0, calc(${delta * 16}vh + var(--stage-offset)), 0)`
      : `translate3d(0, calc(${delta * 16}vh + var(--stage-offset)), ${-distance * 520}px) rotateX(${delta * -42}deg) rotateZ(${delta * 1.2}deg) scale(${easedScale})`,
    zIndex: 20 - Math.round(distance * 10)
  }
}

function imageStyle(index) {
  const position = tunnelPosition()
  const delta = index - position
  return {
    transform: reduceMotion.value
      ? 'scale(1.02)'
      : `scale(${1.08 + Math.abs(delta) * 0.08}) translate3d(0, ${delta * -7}%, 0)`
  }
}

function figureBlockStyle(block) {
  const assemble = clamp(finaleProgress.value / 0.2)
  const settle = 1 - Math.pow(1 - assemble, 3)
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.size}px`,
    height: `${block.size}px`,
    transform: `translate3d(${block.sx * (1 - settle)}px, ${block.sy * (1 - settle)}px, 0) rotate(${block.sr * (1 - settle)}deg) scale(${0.45 + settle * 0.55})`,
    opacity: Math.min(1, 0.12 + assemble * 1.4)
  }
}

const figureStyle = computed(() => {
  const infinity = clamp((finaleProgress.value - 0.18) / 0.1)
  const exit = clamp((finaleProgress.value - 0.27) / 0.09)
  return {
    opacity: 1 - exit,
    transform: `translate(-50%, -50%) rotate(${infinity * 90}deg) scale(${0.86 + infinity * 0.14 + exit * 0.16})`
  }
})

const reunionProgress = computed(() => clamp((finaleProgress.value - 0.3) / 0.58))

function reunionFragmentStyle(fragment) {
  if (reduceMotion.value) return { clipPath: fragment.clip, opacity: 0 }
  const local = clamp((reunionProgress.value - fragment.delay) / Math.max(0.01, 0.68 - fragment.delay))
  const settle = 1 - Math.pow(1 - local, 3)
  const handoff = clamp((reunionProgress.value - 0.82) / 0.12)
  const motionScale = viewportWidth.value <= 560 ? 0.58 : 1
  return {
    clipPath: fragment.clip,
    transformOrigin: `${fragment.cx}% ${fragment.cy}%`,
    opacity: Math.min(1, local * 1.8) * (1 - handoff),
    filter: `blur(${(1 - settle) * 8}px) saturate(${0.45 + settle * 0.55}) brightness(${0.7 + settle * 0.3})`,
    transform: `translate3d(${fragment.x * motionScale * (1 - settle)}vw, ${fragment.y * motionScale * (1 - settle)}vh, 0) rotate(${fragment.r * (1 - settle)}deg) scale(${fragment.s + (1 - fragment.s) * settle})`
  }
}

const reunionFrameStyle = computed(() => {
  const arrive = 1 - Math.pow(1 - reunionProgress.value, 3)
  return {
    opacity: clamp(reunionProgress.value * 2.4),
    transform: `translate(-50%, calc(-50% + var(--stage-offset))) scale(${1.12 - arrive * 0.12})`
  }
})

const reunionPhotoStyle = computed(() => {
  const reveal = reduceMotion.value ? 1 : clamp((reunionProgress.value - 0.72) / 0.2)
  return {
    opacity: reveal,
    filter: `blur(${(1 - reveal) * 5}px) saturate(${0.76 + reveal * 0.24})`
  }
})

function updateScroll() {
  heroProgress.value = sectionProgress(heroRef.value)
  tunnelProgress.value = sectionProgress(tunnelRef.value)
  finaleProgress.value = sectionProgress(finaleRef.value)
  activeChapter.value = Math.min(
    chapters.length - 1,
    Math.max(0, Math.round(tunnelPosition()))
  )
}

let scrollFrame = 0
function requestScrollUpdate() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    viewportWidth.value = window.innerWidth
    updateScroll()
    scrollFrame = 0
  })
}

function handlePointerMove(event) {
  if (!rootRef.value || reduceMotion.value) return
  const x = (event.clientX / window.innerWidth - 0.5) * 2
  const y = (event.clientY / window.innerHeight - 0.5) * 2
  rootRef.value.style.setProperty('--pointer-x', x.toFixed(3))
  rootRef.value.style.setProperty('--pointer-y', y.toFixed(3))
}

onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  viewportWidth.value = window.innerWidth
  document.documentElement.classList.add('boh-journey-scroll')
  updateScroll()
  window.addEventListener('scroll', requestScrollUpdate, { passive: true })
  window.addEventListener('resize', requestScrollUpdate, { passive: true })
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
})

onUnmounted(() => {
  document.documentElement.classList.remove('boh-journey-scroll')
  window.removeEventListener('scroll', requestScrollUpdate)
  window.removeEventListener('resize', requestScrollUpdate)
  window.removeEventListener('pointermove', handlePointerMove)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <main ref="rootRef" class="voxel-journey">
    <div class="grain" aria-hidden="true" />

    <aside class="journey-progress" aria-label="八周年旅程进度">
      <span class="progress-year">{{ currentChapter.year }}</span>
      <span class="progress-track">
        <span class="progress-fill" :style="{ transform: `scaleY(${pageProgress})` }" />
      </span>
      <span class="progress-index">{{ String(activeChapter + 1).padStart(2, '0') }} / 08</span>
    </aside>

    <section ref="heroRef" class="hero-scroll">
      <div class="hero-sticky">
        <div class="hero-image" :style="{
          transform: `scale(${1.06 + heroProgress * 0.22}) translate3d(0, ${heroProgress * -4}%, 0)`,
          opacity: 1 - heroProgress * 0.86
        }">
          <img :src="sevenYearsImage" alt="方块之家成员在方块世界中的七周年合影">
        </div>
        <div class="hero-vignette" />

        <div class="voxel-space" aria-hidden="true" :style="{
          transform: `translate3d(0, ${heroProgress * -12}vh, 0) rotate(${heroProgress * 3}deg)`
        }">
          <span
            v-for="block in floatingBlocks"
            :key="block.id"
            class="voxel-particle"
            :class="`is-${block.type}`"
            :style="{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.size}px`,
              height: `${block.size}px`,
              '--depth': `${block.depth}px`,
              '--delay': `${block.delay}s`,
              '--turn': `${block.turn}deg`,
              opacity: heroProgress > 0.08 ? Math.min(0.8, heroProgress * 1.3) : 0
            }"
          />
        </div>

        <div class="hero-copy" :style="{
          transform: `translate3d(calc(var(--pointer-x) * -10px), calc(var(--stage-offset) - ${heroProgress * 16}vh), 0)`,
          opacity: 1 - heroProgress * 1.35
        }">
          <p class="eyebrow">BLOCK OF HOME · 2018—2026</p>
          <h1><span>八年</span><br>共筑一个世界</h1>
          <p class="hero-lead">这不是一条时间线。<br>是我们一起放下的每一块。</p>
        </div>

        <div class="origin-cube-wrap" :style="{
          opacity: clamp((heroProgress - 0.22) * 2.2),
          transform: `translate(-50%, calc(-50% + var(--stage-offset))) scale(${0.55 + heroProgress * 0.72}) rotate(${heroProgress * 38}deg)`
        }">
          <div class="origin-cube" :style="{
            transform: `rotateX(${-22 + heroProgress * 210}deg) rotateY(${35 + heroProgress * 310}deg)`
          }">
            <span class="cube-face face-front" />
            <span class="cube-face face-back" />
            <span class="cube-face face-right" />
            <span class="cube-face face-left" />
            <span class="cube-face face-top" />
            <span class="cube-face face-bottom" />
          </div>
        </div>

        <div class="hero-origin-copy" :class="{ visible: heroProgress > 0.58 }">
          <span>01</span>
          <p>一切，都从一块方块开始。</p>
        </div>

        <div class="scroll-cue" :class="{ hidden: heroProgress > 0.12 }">
          <span>向下滚动</span>
          <i />
        </div>
      </div>
    </section>

    <section class="manifesto">
      <div class="manifesto-grid" aria-hidden="true">
        <span v-for="index in 32" :key="index" :style="{ animationDelay: `${(index % 8) * 0.08}s` }" />
      </div>
      <div class="manifesto-copy">
        <p class="eyebrow">8 MEMORY CHUNKS</p>
        <h2>我们没有保存所有日子。<br><em>但记住了光落下的位置。</em></h2>
        <p>接下来的滚动，会穿过八块真实的 BOH 记忆。每一帧都来自我们共同生活过的方块世界。</p>
      </div>
    </section>

    <section ref="tunnelRef" class="memory-tunnel" :style="{ height: `${chapters.length * 125}vh` }">
      <div class="tunnel-sticky">
        <div class="tunnel-ceiling" aria-hidden="true" />
        <article
          v-for="(chapter, index) in chapters"
          :key="chapter.year"
          class="memory-panel"
          :class="{ active: index === activeChapter }"
          :style="panelStyle(index)"
        >
          <div class="panel-media">
            <img :src="chapter.image" :alt="`${chapter.year} 年方块之家记忆`" :style="imageStyle(index)">
            <div class="panel-shade" />
            <div class="panel-pixels" aria-hidden="true">
              <span v-for="pixel in 18" :key="pixel" :style="{
                '--x': `${(pixel * 23) % 100}%`,
                '--y': `${(pixel * 41) % 100}%`,
                '--s': `${6 + (pixel % 5) * 4}px`,
                '--d': `${(pixel % 7) * -0.2}s`
              }" />
            </div>
          </div>

          <div class="panel-year" aria-hidden="true">{{ chapter.year }}</div>
          <div class="panel-copy">
            <p class="panel-kicker">{{ chapter.kicker }}</p>
            <h2>{{ chapter.title }}</h2>
            <p class="panel-description">{{ chapter.copy }}</p>
            <div class="panel-coordinate">
              <span /> BOH MEMORY {{ String(index + 1).padStart(2, '0') }} / 08
            </div>
          </div>
        </article>

        <nav class="chapter-dots" aria-label="记忆章节">
          <span
            v-for="(chapter, index) in chapters"
            :key="chapter.year"
            :class="{ active: index === activeChapter }"
            :style="{ '--dot-accent': chapter.accent }"
          >{{ chapter.year }}</span>
        </nav>
      </div>
    </section>

    <section class="memory-break">
      <div class="break-image break-image-a">
        <img :src="winterImage" alt="方块之家冬日记忆">
      </div>
      <div class="break-image break-image-b">
        <img :src="fourYearsImage" alt="方块之家周年烟花记忆">
      </div>
      <div class="break-image break-image-c">
        <img :src="homeImage" alt="方块之家建筑记忆">
      </div>
      <div class="break-copy">
        <span>150+ MEMBERS · 2922 DAYS</span>
        <h2>一个世界真正的尺度，<br>不是地图有多大。</h2>
        <p>是有多少人，愿意一次又一次回来。</p>
      </div>
    </section>

    <section ref="finaleRef" class="finale-scroll">
      <div class="finale-sticky">
        <div class="finale-aurora" />
        <div class="figure-eight" :style="figureStyle" aria-hidden="true">
          <span
            v-for="block in figureBlocks"
            :key="block.id"
            class="figure-block"
            :class="`is-${block.type}`"
            :style="figureBlockStyle(block)"
          />
        </div>

        <div class="assembly-copy" :style="{
          opacity: clamp(1 - finaleProgress * 5),
          transform: `translateY(${finaleProgress * -40}px)`
        }">
          <span>FINAL BUILD</span>
          <h2>把散落的记忆<br>重新放在一起</h2>
        </div>

        <div class="reveal-copy" :class="{ visible: finaleProgress > 0.18 && finaleProgress < 0.35 }">
          <p class="reveal-year">2018 — 2026</p>
          <h2>八年，感谢有你。</h2>
          <p>每一个名字，都是这个世界的一部分。</p>
        </div>

        <div class="reunion-frame" :style="reunionFrameStyle">
          <img class="reunion-ghost" :src="reunionImage" alt="" aria-hidden="true">
          <img
            v-for="fragment in reunionFragments"
            :key="fragment.id"
            class="reunion-fragment"
            :src="reunionImage"
            alt=""
            aria-hidden="true"
            :style="reunionFragmentStyle(fragment)"
          >
          <img
            class="reunion-photo"
            :src="reunionImage"
            alt="方块之家八周年校园设定集大合照"
            :style="reunionPhotoStyle"
          >
          <div class="reunion-sheen" aria-hidden="true" />
        </div>

        <div class="reunion-guide" :class="{ visible: finaleProgress > 0.34 && finaleProgress < 0.76 }">
          <span>FINAL PORTRAIT</span>
          <p>让每一个名字，回到属于自己的位置。</p>
        </div>

        <div class="reunion-finale-copy" :class="{ visible: finaleProgress > 0.83 }">
          <p class="reveal-year">BLOCK OF HOME · 8TH ANNIVERSARY</p>
          <h2>这一张合照，装下了我们的第八年。</h2>
        </div>

        <div class="finale-actions" :class="{ visible: finaleProgress > 0.94 }">
          <button class="primary-action" @click="router.push({ path: '/', hash: '#ryyik-letter' })">查看信件</button>
          <button class="text-action" @click="router.push('/')">返回方块之家</button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
@import './style.scoped.css';
</style>

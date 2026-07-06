<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import confetti from 'canvas-confetti'

const router = useRouter()

const carriages = [
  {
    year: '2018',
    title: '始发站',
    emoji: '🚉',
    color: '#8B6914',
    bgGradient: 'linear-gradient(135deg, #1a1408 0%, #2a1f0e 30%, #3d2b16 60%, #2a1f0e 100%)',
    accentColor: '#C4A35A',
    desc: '那一年，我们在一块小小的土地上放下了第一块方块。没有人知道这个社区会走向何方，只是单纯地热爱着 Minecraft 带给我们的快乐。\nBlock of Home，从此开始了它的故事。',
    milestones: ['BOH 服务器成立', '第一批成员加入', '第一个建筑项目完成'],
    image: ''
  },
  {
    year: '2019',
    title: '萌芽',
    emoji: '🌱',
    color: '#4A7C59',
    bgGradient: 'linear-gradient(135deg, #0a1a0e 0%, #0f2618 30%, #1a3d28 60%, #0f2618 100%)',
    accentColor: '#6EBF7E',
    desc: '社区开始有了温度。新朋友们从四面八方而来，在方块世界里一起建造、探索、欢笑。\nBOH 不再只是一个服务器，而是一个真正的家。',
    milestones: ['社区成员突破 20 人', '第一届建筑大赛', '服务器版本升级'],
    image: ''
  },
  {
    year: '2020',
    title: '前行',
    emoji: '🌊',
    color: '#2C5F7C',
    bgGradient: 'linear-gradient(135deg, #081520 0%, #0e2235 30%, #163a4d 60%, #0e2235 100%)',
    accentColor: '#4A9BC7',
    desc: '风雨兼程的一年。尽管外界环境变化莫测，BOH 的灯火从未熄灭。\n我们在虚拟的世界里找到了真实的陪伴，每一次登录都是一次回家。',
    milestones: ['线上活动常态化', '社区论坛搭建', '新年线上聚会'],
    image: ''
  },
  {
    year: '2021',
    title: '冬眠号',
    emoji: '❄️',
    color: '#1A3A5C',
    bgGradient: 'linear-gradient(135deg, #060e1a 0%, #0c1a30 30%, #142b4a 60%, #0c1a30 100%)',
    accentColor: '#7EB8E0',
    desc: '冬眠生存传统正式开启。在那个寒冷的冬天，我们一起在雪地中求生，围着篝火讲故事。\n这是 BOH 最温暖的传统，一年又一年，从未间断。',
    milestones: ['第一届冬眠生存', '跨年烟花大会', '社区成员突破 50 人'],
    image: ''
  },
  {
    year: '2022',
    title: '蓄力',
    emoji: '⚡',
    color: '#5B3A8C',
    bgGradient: 'linear-gradient(135deg, #100a1a 0%, #1c122e 30%, #2e1d4a 60%, #1c122e 100%)',
    accentColor: '#8B6FC7',
    desc: '沉默中积蓄力量。这一年，我们在幕后默默建设，为未来的爆发做准备。\n每一个 bug 的修复，每一个功能的优化，都是为了让 BOH 变得更好。',
    milestones: ['技术架构升级', '新功能密集开发', '社区管理制度完善'],
    image: ''
  },
  {
    year: '2023',
    title: '五周年',
    emoji: '🎬',
    color: '#C67B30',
    bgGradient: 'linear-gradient(135deg, #1a1006 0%, #2e1c0e 30%, #4a2e16 60%, #2e1c0e 100%)',
    accentColor: '#E8A84C',
    desc: '五周年！我们有了自己的纪录片，有了更丰富的活动，有了更紧密的联结。\n五年的时间，足够让一个虚拟社区变成真实的大家庭。',
    milestones: ['五周年纪录片发布', '成员突破 100 人', 'BOH 品牌升级'],
    image: ''
  },
  {
    year: '2024',
    title: '成长',
    emoji: '🌿',
    color: '#2D8A6E',
    bgGradient: 'linear-gradient(135deg, #081a12 0%, #0e2e20 30%, #164a32 60%, #0e2e20 100%)',
    accentColor: '#4FC4A0',
    desc: 'BOH AI 上线、MBTI 人格测试、周边商城开业……\n这一年，BOH 从一个 Minecraft 社区进化成了一个完整的创作生态。我们不止于方块。',
    milestones: ['BOH AI 上线', 'MBTI 测试发布', 'BOH 商城开业', '会员订阅系统上线'],
    image: ''
  },
  {
    year: '2025',
    title: '遇见',
    emoji: '✨',
    color: '#B8860B',
    bgGradient: 'linear-gradient(135deg, #1a1200 0%, #2e2208 30%, #4a3810 60%, #2e2208 100%)',
    accentColor: '#E8C84C',
    desc: '从线上到线下。"遇见"系列让 BOH 的家人们真正相见。\n那些在屏幕上相伴多年的人，终于可以在现实世界里拥抱、欢笑。',
    milestones: ['第一次线下见面会', '"遇见"系列上线', 'BOH 周年纪念周边'],
    image: ''
  },
  {
    year: '2026',
    title: '终点站',
    emoji: '🎉',
    color: '#C41E3A',
    bgGradient: 'linear-gradient(135deg, #1a0608 0%, #2e0e14 30%, #4a1820 60%, #2e0e14 100%)',
    accentColor: '#E85C6E',
    desc: '八年了。从一个小小的服务器，到如今数百人的大家庭。\nBOH 八周年，感谢每一个曾经来过、正在这里、即将加入的你。\n第九年，我们还在。',
    milestones: ['八周年庆典', '新篇章开启', '感谢每一位 BOH 家人'],
    image: ''
  }
]

const chapterRefs = ref([])
const visibleChapters = ref(new Set())
const trainSectionRef = ref(null)
const currentCarriage = ref(0)
const isAtStation = ref(false)
const showScrollHint = ref(true)

const trackStyle = computed(() => ({
  transform: `translateX(-${currentCarriage.value * 100}vw)`
}))

function handleScroll() {
  if (!trainSectionRef.value) return

  const rect = trainSectionRef.value.getBoundingClientRect()
  const sectionHeight = trainSectionRef.value.offsetHeight
  const windowHeight = window.innerHeight

  if (rect.top < windowHeight && rect.bottom > 0) {
    const scrolledPast = -rect.top
    const totalScrollable = sectionHeight - windowHeight
    const progress = Math.max(0, Math.min(1, scrolledPast / totalScrollable))
    currentCarriage.value = Math.round(progress * (carriages.length - 1))
    isAtStation.value = currentCarriage.value === carriages.length - 1
  }
}

function goToCarriage(index) {
  if (!trainSectionRef.value) return
  const sectionTop = trainSectionRef.value.offsetTop
  const totalScrollable = trainSectionRef.value.offsetHeight - window.innerHeight
  const progress = index / (carriages.length - 1)
  window.scrollTo({ top: sectionTop + progress * totalScrollable, behavior: 'smooth' })
}

function handleTrainNav(dir) {
  const next = currentCarriage.value + dir
  if (next >= 0 && next < carriages.length) goToCarriage(next)
}

function fireConfetti() {
  const duration = 3000
  const end = Date.now() + duration
  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ['#C4A35A', '#E8A84C', '#E85C6E', '#4FC4A0', '#8B6FC7']
    })
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#C4A35A', '#E8A84C', '#E85C6E', '#4FC4A0', '#8B6FC7']
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

function navigateTo(path) {
  router.push(path)
}

let wheelTimeout = null
function handleWheel(e) {
  if (!trainSectionRef.value) return
  const rect = trainSectionRef.value.getBoundingClientRect()
  const isInView = rect.top < window.innerHeight && rect.bottom > 0

  if (isInView) {
    const scrolledPast = -rect.top
    const totalScrollable = trainSectionRef.value.offsetHeight - window.innerHeight
    const rawProgress = scrolledPast / totalScrollable

    clearTimeout(wheelTimeout)
    wheelTimeout = setTimeout(() => {
      const snapped = Math.round(rawProgress * (carriages.length - 1))
      const snappedProgress = snapped / (carriages.length - 1)
      const diff = Math.abs(rawProgress - snappedProgress)
      if (diff > 0.01 && diff < 0.15) {
        goToCarriage(snapped)
      }
    }, 150)
  }
}

let observer = null
onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('scroll', handleWheel, { passive: true })

  setTimeout(() => { showScrollHint.value = false }, 5000)

  setTimeout(fireConfetti, 2000)

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        visibleChapters.value.add(entry.target.dataset.chapter)
        if (entry.target.dataset.chapter === 'finale') {
          fireConfetti()
        }
      }
    })
  }, { threshold: 0.3 })

  setTimeout(() => {
    document.querySelectorAll('[data-chapter]').forEach(el => observer.observe(el))
  }, 200)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('scroll', handleWheel)
  if (observer) observer.disconnect()
})
</script>

<template>
  <div class="journey-page">
    <!-- ============ CHAPTER 1: HERO ============ -->
    <section data-chapter="hero" class="chapter hero-chapter">
      <div class="hero-bg">
        <div class="star-field">
          <div v-for="i in 60" :key="i" class="star" :style="{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            width: `${Math.random() * 3 + 1}px`,
            height: `${Math.random() * 3 + 1}px`
          }" />
        </div>
      </div>
      <div class="hero-content" :class="{ 'animate-in': visibleChapters.has('hero') }">
        <div class="hero-badge">2018 — 2026</div>
        <h1 class="hero-title">
          <span class="hero-number">8</span>
          <span class="hero-text">
            <span>周</span>
            <span>年</span>
          </span>
        </h1>
        <p class="hero-subtitle">BOH 八年光影列车</p>
        <p class="hero-desc">一段关于方块、朋友和家的时光旅程</p>
        <div class="scroll-indicator" :class="{ hidden: !showScrollHint }">
          <span class="scroll-mouse">
            <span class="scroll-dot" />
          </span>
          <span class="scroll-label">向下滚动，登车出发</span>
        </div>
      </div>
    </section>

    <!-- ============ CHAPTER 2: QUICK TIMELINE ============ -->
    <section data-chapter="timeline" class="chapter timeline-chapter">
      <h2 class="section-title">八年轨迹</h2>
      <div class="timeline">
        <div
          v-for="(car, i) in carriages"
          :key="car.year"
          class="timeline-item"
          :class="{ 'timeline-visible': visibleChapters.has('timeline') }"
          :style="{ transitionDelay: `${i * 0.08}s` }"
        >
          <div class="timeline-dot" :style="{ borderColor: car.color }" />
          <div class="timeline-content">
            <span class="timeline-year" :style="{ color: car.color }">{{ car.year }}</span>
            <span class="timeline-title">{{ car.emoji }} {{ car.title }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ CHAPTER 3: BOARDING TRANSITION ============ -->
    <section data-chapter="boarding" class="chapter boarding-chapter">
      <div class="boarding-content" :class="{ 'animate-in': visibleChapters.has('boarding') }">
        <p class="boarding-label">— 请登车 —</p>
        <h2 class="boarding-title">时光专列即将出发</h2>
        <p class="boarding-desc">穿越八年的旅程，每一节车厢都装载着独家记忆</p>
        <div class="train-illustration">
          <div class="train-body">
            <div class="train-window" />
            <div class="train-window" />
            <div class="train-window" />
          </div>
          <div class="train-roof" />
          <div class="train-wheels">
            <div class="wheel" />
            <div class="wheel" />
            <div class="wheel" />
          </div>
          <div class="train-steam">
            <span class="steam-puff" />
            <span class="steam-puff" />
            <span class="steam-puff" />
          </div>
        </div>
      </div>
      <div class="boarding-hint">继续向下滚动，进入列车</div>
    </section>

    <!-- ============ CHAPTER 4: TRAIN JOURNEY ============ -->
    <section
      ref="trainSectionRef"
      class="train-section"
      :style="{ height: carriages.length * 100 + 'vh' }"
    >
      <div class="train-sticky">
        <div class="train-track" :style="trackStyle">
          <div
            v-for="(car, i) in carriages"
            :key="car.year"
            class="carriage"
            :style="{ background: car.bgGradient }"
          >
            <div class="carriage-bg-year" :style="{ color: car.accentColor }">{{ car.year }}</div>

            <div class="carriage-content">
              <div class="carriage-header">
                <span class="carriage-emoji">{{ car.emoji }}</span>
                <div class="carriage-number" :style="{ background: car.accentColor }">
                  🚃 {{ i + 1 }}
                </div>
              </div>

              <h2 class="carriage-title" :style="{ color: car.accentColor }">
                {{ car.year }} · {{ car.title }}
              </h2>

              <div class="carriage-desc">
                <p v-for="(line, li) in car.desc.split('\n')" :key="li">{{ line }}</p>
              </div>

              <div class="carriage-milestones">
                <div
                  v-for="(ms, mi) in car.milestones"
                  :key="mi"
                  class="milestone-chip"
                  :style="{ borderColor: car.accentColor, color: car.accentColor }"
                >
                  {{ ms }}
                </div>
              </div>

              <div v-if="i === carriages.length - 1" class="station-arrival">
                <p class="arrival-text">到站了。</p>
                <button class="btn-station" @click="fireConfetti">🎊 放礼花</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Train Navigation -->
        <div class="train-navigation">
          <button
            class="train-nav-btn"
            :disabled="currentCarriage === 0"
            @click="handleTrainNav(-1)"
          >
            ‹
          </button>
          <div class="train-dots">
            <button
              v-for="(car, i) in carriages"
              :key="i"
              class="train-dot"
              :class="{ active: i === currentCarriage }"
              :style="{
                background: i === currentCarriage ? car.accentColor : 'transparent',
                borderColor: car.accentColor
              }"
              @click="goToCarriage(i)"
              :title="`${car.year} - ${car.title}`"
            />
          </div>
          <button
            class="train-nav-btn"
            :disabled="currentCarriage === carriages.length - 1"
            @click="handleTrainNav(1)"
          >
            ›
          </button>
          <div class="carriage-label">{{ carriages[currentCarriage].year }} · {{ carriages[currentCarriage].title }}</div>
        </div>
      </div>
    </section>

    <!-- ============ CHAPTER 5: FINALE ============ -->
    <section data-chapter="finale" class="chapter finale-chapter">
      <div class="finale-content" :class="{ 'animate-in': visibleChapters.has('finale') }">
        <div class="finale-badge">🎉 抵达终点</div>
        <h2 class="finale-title">八年，感谢有你</h2>
        <p class="finale-desc">
          从 2018 到 2026，从几个人的小天地到数百人的大家庭。<br>
          每一块方块，每一次欢笑，每一个深夜的畅聊，都构成了今天的 BOH。
        </p>
        <div class="finale-stats">
          <div class="stat-item">
            <span class="stat-number">8</span>
            <span class="stat-label">年历程</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">150+</span>
            <span class="stat-label">社区成员</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">∞</span>
            <span class="stat-label">无限回忆</span>
          </div>
        </div>
        <button class="btn-confetti" @click="fireConfetti">🎊 放礼花庆祝</button>
      </div>
    </section>

    <!-- ============ CHAPTER 6: CTA ============ -->
    <section data-chapter="cta" class="chapter cta-chapter">
      <div class="cta-content" :class="{ 'animate-in': visibleChapters.has('cta') }">
        <h2 class="cta-title">不止于方块</h2>
        <p class="cta-desc">第九年，我们还在。<br>欢迎你一起书写下一个八年的故事。</p>
        <div class="cta-buttons">
          <button class="btn-primary" @click="navigateTo('/')">回到首页</button>
          <button class="btn-secondary" @click="navigateTo('/about')">了解 BOH</button>
          <button class="btn-secondary" @click="navigateTo('/join')">加入我们</button>
        </div>
        <div class="cta-footer">
          <p>Block of Home</p>
          <p class="cta-years">2018 — 2026</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@import './style.scoped.css';
</style>

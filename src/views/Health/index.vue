<template>
  <div class="hk-page" data-health-page ref="pageEl">
    <div class="hk-orb hk-orb-a" aria-hidden="true"></div>
    <div class="hk-orb hk-orb-b" aria-hidden="true"></div>
    <div class="hk-orb hk-orb-c" aria-hidden="true"></div>

    <header class="hk-topbar">
      <div class="hk-wrap" style="gap:0">
        <div class="hk-topbar-date">{{ dateLabel }}</div>
        <h1 class="hk-topbar-title">健康</h1>
      </div>
    </header>

    <main class="hk-wrap">
      <HkBmiCard :value="healthStore.bmi" @edit="sheet = 'body'" />

      <div class="hk-grid-3">
        <HkMetricTile label="身高" :display="fmt(healthStore.profile.heightCm)" unit="cm" @edit="sheet = 'body'" />
        <HkMetricTile label="体重" :display="fmt(healthStore.profile.weightKg, 1)" unit="kg" @edit="sheet = 'body'" />
        <HkMetricTile label="年龄" :display="fmt(healthStore.age)" unit="岁" @edit="sheet = 'body'" />
      </div>

      <section class="hk-card hk-list">
        <div class="hk-list-title">身体测量</div>
        <button type="button" class="hk-row" @click="sheet = 'body'">
          <span class="hk-row-name">身高</span>
          <span class="hk-row-value">{{ fmt(healthStore.profile.heightCm) }} cm<span class="hk-chev">›</span></span>
        </button>
        <button type="button" class="hk-row" @click="sheet = 'body'">
          <span class="hk-row-name">体重</span>
          <span class="hk-row-value">{{ fmt(healthStore.profile.weightKg, 1) }} kg<span class="hk-chev">›</span></span>
        </button>
        <button type="button" class="hk-row" @click="sheet = 'body'">
          <span class="hk-row-name">出生年份</span>
          <span class="hk-row-value">{{ healthStore.profile.birthYear || '—' }}<span class="hk-chev">›</span></span>
        </button>
        <button type="button" class="hk-row" @click="sheet = 'body'">
          <span class="hk-row-name">性别</span>
          <span class="hk-row-value">{{ sexLabel }}<span class="hk-chev">›</span></span>
        </button>
        <div class="hk-list-foot" v-if="healthStore.bmr">
          BMR {{ healthStore.bmr }} kcal · TDEE {{ healthStore.tdee }} kcal
        </div>
      </section>

      <div class="hk-grid-3">
        <HkRingTile
          label="步数"
          :display="todayLog?.steps ? todayLog.steps.toLocaleString() : '—'"
          :value="todayLog?.steps ?? null"
          :goal="10000"
          color="var(--hk-red)"
          @edit="sheet = 'log'"
        />
        <HkRingTile
          label="睡眠"
          :display="todayLog?.sleepHours ? todayLog.sleepHours + ' h' : '—'"
          :value="todayLog?.sleepHours ?? null"
          :goal="8"
          color="var(--hk-indigo)"
          @edit="sheet = 'log'"
        />
        <HkRingTile
          label="饮水"
          :display="todayLog?.waterCups ? todayLog.waterCups + ' 杯' : '—'"
          :value="todayLog?.waterCups ?? null"
          :goal="8"
          color="var(--hk-cyan)"
          @edit="sheet = 'log'"
        />
      </div>

      <HkSleepTrend :days="healthStore.last7Days" :avg="healthStore.weeklyAvgSleep" />

      <section class="hk-card hk-list">
        <button type="button" class="hk-row" @click="askBohAi">
          <span class="hk-row-name">用 BOH AI 分析</span>
          <span class="hk-row-value"><span class="hk-chev">›</span></span>
        </button>
        <button type="button" class="hk-row" @click="sheet = 'vault'">
          <span class="hk-row-name">健康档案</span>
          <span class="hk-row-value">{{ healthStore.vaultRecords.length || '—' }}<span class="hk-chev">›</span></span>
        </button>
        <button type="button" class="hk-row" @click="exportData">
          <span class="hk-row-name">导出数据</span>
          <span class="hk-row-value"><span class="hk-chev">›</span></span>
        </button>
        <button type="button" class="hk-row hk-row-danger" @click="clearAll">
          <span class="hk-row-name">清空全部健康数据</span>
          <span class="hk-row-value"><span class="hk-chev">›</span></span>
        </button>
      </section>

      <div class="hk-foot">数据仅存本机 · 仅供参考，不构成医疗建议</div>
    </main>

    <HkBodySheet
      v-if="sheet === 'body'"
      :profile="healthStore.profile"
      :is-first-run="isFirstRun"
      @close="closeSheet"
      @save="saveProfile"
    />
    <HkLogSheet v-if="sheet === 'log'" :log="todayLog" @close="sheet = null" @save="saveToday" />
    <HkVaultSheet
      v-if="sheet === 'vault'"
      :records="healthStore.vaultRecords"
      @close="sheet = null"
      @add="addVault"
      @remove="healthStore.removeVaultRecord"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHealthStore } from '@/stores/health'
import './health.css'
import HkBmiCard from './components/HkBmiCard.vue'
import HkMetricTile from './components/HkMetricTile.vue'
import HkRingTile from './components/HkRingTile.vue'
import HkSleepTrend from './components/HkSleepTrend.vue'
import HkBodySheet from './components/HkBodySheet.vue'
import HkLogSheet from './components/HkLogSheet.vue'
import HkVaultSheet from './components/HkVaultSheet.vue'

const healthStore = useHealthStore()
const router = useRouter()

const sheet = ref(null)
const isFirstRun = ref(false)
const pageEl = ref(null)

// 全局导航是 position:fixed，不在文档流里，且各断点下实际高度并不等于
// --bohai-standalone-nav-height 的声明值。这里实测它的真实高度写回 --hk-nav-h，
// 避免小尺寸下日期/标题被导航压住（原来硬编码 60/54px 时会被压住 4~10px）。
let navResizeObserver = null
const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container')
  if (!nav || !pageEl.value) return
  const h = nav.getBoundingClientRect().height
  if (h > 0) pageEl.value.style.setProperty('--hk-nav-h', `${Math.ceil(h)}px`)
}

const todayLog = computed(() => healthStore.todayLog)

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const now = new Date()
const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}`

const SEX_LABELS = { male: '男', female: '女', other: '其他', prefer_not_to_say: '不愿透露' }
const sexLabel = computed(() => SEX_LABELS[healthStore.profile.sex] || '—')

const fmt = (v, digits = 0) => (v === null || v === undefined ? '—' : Number(v).toFixed(digits))

onMounted(() => {
  window.scrollTo(0, 0)
  healthStore.hydrate()
  syncNavHeight()
  const nav = document.getElementById('unified-nav-container')
  if (nav && typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(syncNavHeight)
    navResizeObserver.observe(nav)
  }
  if (!healthStore.onboardingDone && !healthStore.profile.heightCm && !healthStore.profile.weightKg) {
    isFirstRun.value = true
    setTimeout(() => { sheet.value = 'body' }, 260)
  }
})
onUnmounted(() => { navResizeObserver?.disconnect() })

const closeSheet = () => {
  sheet.value = null
  isFirstRun.value = false
  healthStore.markOnboardingDone()
}

const saveProfile = (payload) => {
  healthStore.setProfile(payload)
  closeSheet()
}

const saveToday = (payload) => {
  healthStore.upsertDailyLog(new Date().toISOString().slice(0, 10), payload)
  sheet.value = null
}

const addVault = ({ title, indicators }) => {
  if (!title) return
  healthStore.addVaultRecord(title, indicators)
}

// 健康 AI 分析已并入 BOH AI：带着一句话种子提问跳过去，
// BOH AI 的 health 连接器会自动读取本页的本机健康数据作为依据。
const askBohAi = () => {
  const hasProfile = Boolean(healthStore.profile.heightCm || healthStore.profile.weightKg)
  const hasLogs = healthStore.dailyLogs.length > 0
  const seed = hasProfile || hasLogs
    ? '帮我分析一下最近的健康数据，并给出下一步可以做的小调整。'
    : '我想开始做健康管理，先从哪些数据记起比较有用？'
  router.push({ path: '/ai-chat', query: { ask: seed } })
}

const exportData = () => {
  const data = {
    profile: healthStore.profile,
    weightLogs: healthStore.weightLogs,
    dailyLogs: healthStore.dailyLogs,
    vaultRecords: healthStore.vaultRecords,
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `boh-health-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const clearAll = () => {
  if (!window.confirm('清空全部健康数据？此操作不可恢复。')) return
  healthStore.clearAll()
  sheet.value = null
}
</script>

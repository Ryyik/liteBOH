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

      <div class="hk-foot">
        <template v-if="healthStore.cloudSynced">已加密同步到云端 · 仅供参考，不构成医疗建议</template>
        <template v-else-if="isLoggedIn && healthStore.cloudSyncError">云端同步失败 · 数据已存本机，联网后重试</template>
        <template v-else-if="!isLoggedIn">未登录 · 数据仅存本机</template>
        <template v-else>云端同步中… · 仅供参考，不构成医疗建议</template>
      </div>
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
import { useHealthStore, localDateISO } from '@/stores/health'
import { supabase } from '@/utils/supabase-client'
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
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
const { open: openGlobalAi, canOpen: globalAiCanOpen } = useGlobalAiOverlay()
const { confirm: showConfirm } = useConfirmDialog()

const sheet = ref(null)
const isFirstRun = ref(false)
const pageEl = ref(null)
// 此前该变量从未声明，onMounted 里的赋值会抛 ReferenceError 并被 try/catch 吞掉，
// 导致模板中 `!isLoggedIn` 恒真、页脚永远显示"未登录 · 数据仅存本机"。
const isLoggedIn = ref(false)

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

onMounted(async () => {
  window.scrollTo(0, 0)
  // 导航高度修正与观察器先于云端 hydrate 注册，避免弱网下被 4 个云端查询拖慢
  syncNavHeight()
  const nav = document.getElementById('unified-nav-container')
  if (nav && typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(syncNavHeight)
    navResizeObserver.observe(nav)
  }
  try {
    const { data } = await supabase.auth.getSession()
    isLoggedIn.value = Boolean(data?.session?.user?.id)
  } catch {}
  // hydrate 现在返回可等待的 Promise：等待本地+云端数据全部就绪后再判断
  // 首次使用，防止新设备上用 onboarding 默认值覆盖云端真实档案
  await healthStore.hydrate().catch(() => {})
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
  // 与读取侧 todayISODate（localDateISO）保持同一本地时区基准；
  // 此前用 UTC toISOString 会导致东八区 0:00-7:59 的记录落到"昨天"
  healthStore.upsertDailyLog(localDateISO(), payload)
  sheet.value = null
}

const addVault = ({ title, indicators }) => {
  if (!title) return
  healthStore.addVaultRecord(title, indicators)
}

// 健康 AI 分析:不再 router.push 跳全页,改唤起顶部 AI 灵动岛,
// 岛打开后自动填入种子 prompt 并发送。已登录时附带本机健康画像让 AI 给出针对性建议。
const askBohAi = () => {
  const profile = healthStore.profile
  const recent = (healthStore.dailyLogs || []).slice(0, 7)
  const recentWeights = (healthStore.weightLogs || []).slice(0, 7)
  const hasProfile = Boolean(profile.heightCm || profile.weightKg)
  const hasLogs = recent.length > 0

  let seed
  if (hasProfile || hasLogs) {
    const parts = ['请基于我近期的健康数据,给出 3 条具体可执行的小调整。']
    if (profile.heightCm) parts.push(`身高 ${profile.heightCm} cm`)
    if (profile.weightKg) parts.push(`体重 ${profile.weightKg} kg`)
    if (profile.birthYear) parts.push(`出生于 ${profile.birthYear} 年`)
    if (recentWeights.length) {
      const w0 = recentWeights[recentWeights.length - 1]?.weightKg
      const w1 = recentWeights[0]?.weightKg
      if (w0 && w1 && w0 !== w1) parts.push(`近 ${recentWeights.length} 次体重记录从 ${w0} kg 变为 ${w1} kg`)
    }
    const recentSleep = recent.map((d) => d.sleepHours).filter((v) => typeof v === 'number')
    if (recentSleep.length) {
      const avg = (recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length).toFixed(1)
      parts.push(`近 ${recentSleep.length} 天平均睡眠 ${avg} h`)
    }
    const recentSteps = recent.map((d) => d.steps).filter((v) => typeof v === 'number')
    if (recentSteps.length) {
      const avg = Math.round(recentSteps.reduce((a, b) => a + b, 0) / recentSteps.length)
      parts.push(`近 ${recentSteps.length} 天平均步数 ${avg.toLocaleString()}`)
    }
    const recentWater = recent.map((d) => d.waterCups).filter((v) => typeof v === 'number')
    if (recentWater.length) {
      const avg = (recentWater.reduce((a, b) => a + b, 0) / recentWater.length).toFixed(1)
      parts.push(`近 ${recentWater.length} 天平均饮水 ${avg} 杯`)
    }
    seed = parts.join(';') + '。'
  } else {
    seed = '我想开始做健康管理,先从哪些数据记起比较有用?'
  }

  // 优先走灵动岛;如果岛处于禁用态(在 /ai-chat 页面等)回退到全页路由
  if (globalAiCanOpen.value) {
    openGlobalAi({ snap: 1, prompt: seed })
  } else {
    router.push({ path: '/ai-chat', query: { ask: seed } })
  }
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

const clearAll = async () => {
  const ok = await showConfirm({
    title: '清空全部健康数据？',
    message: '此操作将同时删除云端已同步的数据，且不可恢复。',
    confirmText: '清空',
    cancelText: '取消',
    danger: true
  })
  if (!ok) return
  // clearAll 为异步：云端删除失败时 store 会置 cloudSyncError（页面顶栏有对应提示）
  // 并按设计保留本地数据，此时不关闭弹层，避免用户误以为已清空
  const result = await healthStore.clearAll()
  if (result && result.ok === false) return
  sheet.value = null
}
</script>

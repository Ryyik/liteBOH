<template>
  <section class="github-heatmap" :aria-label="ariaLabel">
    <div class="heatmap-header">
      <p class="section-label">BOHLITE · 开源仓库</p>
      <h2>代码足迹</h2>
      <p>{{ subtitle }}</p>
    </div>

    <div class="heatmap-frame">
      <!-- 月份标注：绝对定位到每月首列，宽度与网格严格等宽 -->
      <div v-if="!error" class="heatmap-months-row" :style="{ width: gridWidth + 'px' }" aria-hidden="true">
        <span
          v-for="m in monthLabels"
          :key="m.key"
          class="heatmap-month"
          :style="{ left: m.left + 'px' }"
        >{{ m.label }}</span>
      </div>

      <div class="heatmap-body-row">
        <!-- 星期标注：行 1/3/5 = 周一/三/五（GitHub 同款只标三个防拥挤） -->
        <div v-if="!error" class="heatmap-weekdays-col" aria-hidden="true">
          <span
            v-for="w in weekdayRows"
            :key="w.row"
            class="heatmap-weekday"
            :style="{ top: w.top + 'px' }"
          >{{ w.label }}</span>
        </div>

        <div ref="trackRef" class="heatmap-container" role="img" :aria-label="ariaLabel">
          <div v-if="loading" class="heatmap-grid is-skeleton" :style="gridStyle">
            <div v-for="i in cellTotal" :key="`sk-${i}`" class="heatmap-cell skeleton-cell"></div>
          </div>

          <div v-else-if="error" class="heatmap-error">
            <p>数据暂时不可用</p>
            <button type="button" @click="fetchData()">重试</button>
          </div>

          <div v-else class="heatmap-grid" :style="gridStyle">
            <div
              v-for="(day, index) in days"
              :key="index"
              class="heatmap-cell"
              :class="{ 'has-count': day.count > 0 }"
              :style="{ backgroundColor: getColor(day.count) }"
              :title="`${day.label} · ${day.count} 次提交`"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="heatmap-legend">
      <span class="legend-range">{{ rangeLabel }}</span>
      <span>少</span>
      <div class="legend-cells">
        <div v-for="i in 5" :key="i" :style="{ backgroundColor: getColor(i - 1) }"></div>
      </div>
      <span>多</span>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const trackRef = ref(null)
const loading = ref(true)
const error = ref(false)
const commitData = ref([])

// 网格几何：横向 GitHub 风格矩阵 —— 行 = 周内日（7），列 = 周。
// cell 尺寸由容器实测宽度反推（CSS 不再写死格子尺寸，避免两处真源打架）。
const cellSize = ref(12)
const gapSize = ref(3)
const weekCount = ref(53)
// 网格精确宽度（weeks*(cell+gap)-gap），供月份标注行对齐用
const gridWidth = ref(0)

const MIN_CELL = 6
const MAX_CELL = 14

const cellTotal = computed(() => weekCount.value * 7)

const rangeLabel = computed(() => (weekCount.value >= 53 ? '近一年' : '近半年'))

// 口径说明：这张图只反映 GitHub 开源仓库的提交活动，
// 与「方块之家 2018 年至今」的社群历史不是同一件事，文案上必须讲清楚。
const subtitle = computed(() =>
  `${rangeLabel.value}共 ${totalCommits.value} 次提交，记录开源仓库的每一次 Build —— 而方块之家的故事，远早于此。`
)

const ariaLabel = computed(() =>
  `BOHLITE 开源仓库更新情况，${rangeLabel.value}共 ${totalCommits.value} 次提交`
)

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${weekCount.value}, ${cellSize.value}px)`,
  gridTemplateRows: `repeat(7, ${cellSize.value}px)`,
  gridAutoFlow: 'column',
  gap: `${gapSize.value}px`,
}))

// 日期 key 统一走本地时区（数据与格子同一口径）
const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 悬停提示用完整中文年月日
const cnDate = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`

// 月份标注：扫窗口日期，每月第一次出现的列锚一个标签（GitHub 同款）。
// 相邻标签会重叠时（如窗口首月只剩几天），当前标签让位给信息更完整的下一个月。
const monthLabels = computed(() => {
  const seen = new Set()
  const raw = []
  days.value.forEach((day, i) => {
    const month = day.date.slice(0, 7)
    if (seen.has(month)) return
    seen.add(month)
    const col = Math.floor(i / 7)
    raw.push({
      key: month,
      label: `${Number(day.date.slice(5, 7))}月`,
      left: col * (cellSize.value + gapSize.value),
    })
  })
  return raw.filter((m, i) => {
    const next = raw[i + 1]
    const width = m.label.length * 12 + 4 // ≈12px 字号下的标签宽
    return !next || next.left - m.left >= width
  })
})

// 星期标注：行 1/3/5 = 周一/三/五，top 随 cell/gap 实测值走
const weekdayRows = computed(() => [
  { row: 1, label: '一', top: 1 * (cellSize.value + gapSize.value) },
  { row: 3, label: '三', top: 3 * (cellSize.value + gapSize.value) },
  { row: 5, label: '五', top: 5 * (cellSize.value + gapSize.value) },
])

const days = computed(() => {
  const result = []
  // 末列对齐到本周周六，列内行 0..6 = 周日..周六（与 GitHub 热力图同构）
  const today = new Date()
  const end = new Date(today)
  end.setDate(today.getDate() + (6 - today.getDay()))
  const start = new Date(end)
  start.setDate(end.getDate() - (weekCount.value * 7 - 1))

  const dateMap = {}
  commitData.value.forEach((d) => {
    dateMap[d.date] = d.count
  })

  for (let i = 0; i < weekCount.value * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = localDateKey(d)
    result.push({
      date: key,
      label: cnDate(d),
      count: d > today ? 0 : (dateMap[key] || 0),
      future: d > today,
    })
  }
  return result
})

// 总数口径：只统计网格窗口内「实际渲染出来」的格子。
// 否则窄屏降级到 26 周时，窗口之外的提交仍会被计入总数 → 数字虚高且与图对不上。
const totalCommits = computed(() => days.value.reduce((sum, d) => sum + d.count, 0))

// GitHub 同款「四分位动态分档」：把有提交的日子按次数排序，切成 4 个均匀档位。
// 写死阈值会让低频仓库整图偏浅 —— 实测本仓库 0/2/5/10 分档下 48% 的活跃日挤在最浅档、
// 最深档仅 6%；动态分档后深浅层次始终与自己的数据分布匹配，稀疏感大幅缓解。
const colorThresholds = computed(() => {
  const counts = commitData.value.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b)
  if (counts.length === 0) return [1, 2, 3]
  const pick = (p) => counts[Math.min(counts.length - 1, Math.floor(counts.length * p))]
  return [pick(0.25), pick(0.5), pick(0.75)]
})

function getColor(count) {
  if (count === 0) return '#e8edf3'
  const [t1, t2, t3] = colorThresholds.value
  if (count <= t1) return '#c8d9e8'
  if (count <= t2) return '#7ba8d4'
  if (count <= t3) return '#3a7cc5'
  return '#0071e3'
}

// 容器宽度 → cell 尺寸。53 列放不下时降到半年（26 列），永不横向滚动。
// available 取外层 frame 的约束宽（扣水平 padding 与星期标注列）——
// 不能读网格自身 clientWidth：网格宽由 cell 反推决定，读它会形成循环锁定。
function measure() {
  const el = trackRef.value
  if (!el) return
  const frame = el.closest('.heatmap-frame')
  let padX = FRAME_PAD_X * 2
  if (frame) {
    const cs = getComputedStyle(frame)
    padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  }
  const frameInner = (frame ? frame.clientWidth : el.clientWidth) - padX
  const available = frameInner - WEEKDAY_COL_W
  if (available <= 0) return
  let weeks = 53
  let gap = 3
  let cell = Math.floor((available - (weeks - 1) * gap) / weeks)
  if (cell < MIN_CELL) {
    weeks = 26
    gap = 2
    cell = Math.floor((available - (weeks - 1) * gap) / weeks)
  }
  weekCount.value = weeks
  gapSize.value = gap
  cellSize.value = Math.min(Math.max(cell, 5), MAX_CELL)
  gridWidth.value = weeks * (cellSize.value + gap) - gap
}

const FRAME_PAD_X = 32 // .heatmap-frame 的水平 padding
const WEEKDAY_COL_W = 26 // .heatmap-weekdays-col 占位宽

let resizeObserver = null

// ---- 缓存与降级 ----------------------------------------------------------
// GitHub 未鉴权接口限流 60 次/小时/IP，而本组件一次加载要发 3 页请求。
// 同一出口 IP 刷约 20 次就会 403。所以：新鲜期内直接吃缓存不发请求；
// 请求失败时用历史快照兜底，而不是把访客甩进「数据暂时不可用」。
const CACHE_KEY = 'boh:github-commits:v1'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 小时

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.commits) || parsed.commits.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(commits) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), commits }))
  } catch {
    // 无痕模式 / 配额写满：静默放弃缓存，不影响主流程
  }
}

// 只取最长窗口（53 周）内的提交：既覆盖 53/26 两种网格，又不随仓库增长而无限翻页。
// 起始点再往前留 2 天余量，避免边界日因时区/时刻差被切掉。
function sinceParam() {
  const d = new Date()
  d.setDate(d.getDate() + (6 - d.getDay()))
  d.setDate(d.getDate() - (53 * 7 + 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

async function fetchData({ silent = false } = {}) {
  if (!silent) {
    loading.value = true
    error.value = false
  }
  try {
    const commits = await fetchAllCommits()
    const dateMap = {}
    commits.forEach((c) => {
      const raw = c.date || c.commit?.author?.date
      if (!raw) return
      const key = localDateKey(new Date(raw))
      dateMap[key] = (dateMap[key] || 0) + 1
    })
    commitData.value = Object.entries(dateMap).map(([date, count]) => ({ date, count }))
    writeCache(commitData.value)
    error.value = false
  } catch (e) {
    console.warn('[GitHubHeatmap] 获取失败，尝试降级:', e)
    // 有历史快照就继续展示旧图，只在完全无数据时才报错
    error.value = commitData.value.length === 0
  } finally {
    loading.value = false
  }
}

async function fetchAllCommits() {
  const allCommits = []
  const since = sinceParam()
  let page = 1
  const perPage = 100

  while (true) {
    const url =
      `https://api.github.com/repos/Ryyik/liteBOH/commits` +
      `?per_page=${perPage}&page=${page}&since=${encodeURIComponent(since)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) {
      const hint = res.status === 403 ? '（触发 GitHub 未鉴权限流，通常 1 小时内自动恢复）' : ''
      throw new Error(`HTTP ${res.status}${hint}`)
    }
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break
    allCommits.push(...data)
    if (data.length < perPage) break
    page++
    if (page > 10) break
  }
  return allCommits
}

onMounted(() => {
  measure()
  // 观察外层 frame（随视口伸缩），而非网格自身——网格宽是 measure 的输出，观察它会失去 resize 响应
  const frame = trackRef.value?.closest('.heatmap-frame')
  if ('ResizeObserver' in window && frame) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(frame)
  }

  const cached = readCache()
  if (!cached) {
    fetchData()
    return
  }
  // 先吃缓存出图（不闪骨架屏），再决定要不要打网络
  commitData.value = cached.commits
  loading.value = false
  if (Date.now() - (cached.savedAt || 0) < CACHE_TTL) return
  fetchData({ silent: true })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped>
.github-heatmap {
  padding: 150px 0;
  background: #fff;
}

.heatmap-header {
  max-width: 840px;
  margin: 0 auto 84px;
  text-align: center;
}

.heatmap-header h2 {
  margin: 18px 0 20px;
  font-size: 72px;
  font-weight: 700;
  line-height: 1.04;
  color: #1d1d1f;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}

.heatmap-header p {
  max-width: 650px;
  margin: 0 auto;
  color: #6e6e73;
  font-size: 21px;
  line-height: 1.55;
}

.section-label {
  margin: 0;
  color: #0071e3;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.4;
}

/* 标注体系：月份行 + 星期列 + 网格。frame 负责水平留白与整体居中，
   网格自身收缩到内容宽，保证月份标签与列逐像素对齐。 */
.heatmap-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 32px;
}

.heatmap-months-row {
  position: relative;
  height: 18px;
  margin-bottom: 8px;
  margin-left: 26px; /* 对齐 weekdays 列宽，使标签坐标原点 = 网格左缘 */
}

.heatmap-month {
  position: absolute;
  top: 0;
  font-size: 12px;
  line-height: 18px;
  color: #6e6e73;
  white-space: nowrap;
}

.heatmap-body-row {
  display: flex;
  align-items: flex-start;
}

.heatmap-weekdays-col {
  position: relative;
  width: 26px;
  flex: none;
  align-self: stretch;
}

.heatmap-weekday {
  position: absolute;
  right: 0;
  font-size: 11px;
  line-height: 1;
  color: #6e6e73;
}

.heatmap-container {
  display: flex;
}

.heatmap-grid {
  display: grid;
  align-content: start;
}

.heatmap-cell {
  border-radius: 2px;
  transition: opacity 150ms ease;
}

.heatmap-cell:not(.skeleton-cell):hover {
  opacity: 0.75;
}

.heatmap-cell.skeleton-cell {
  background: #e8edf3;
  animation: skeletonPulse 1.5s ease-in-out infinite;
}

.heatmap-grid.is-skeleton .heatmap-cell:nth-child(odd) {
  animation-delay: 0.3s;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

.heatmap-error {
  text-align: center;
  padding: 60px 0;
  color: #6e6e73;
  font-size: 18px;
}

.heatmap-error button {
  display: block;
  margin: 16px auto 0;
  padding: 8px 24px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.04);
  color: #1d1d1f;
  font-size: 14px;
  cursor: pointer;
}

.heatmap-error button:hover {
  background: rgba(0, 0, 0, 0.08);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  color: #6e6e73;
  font-size: 13px;
}

.legend-range {
  margin-right: 8px;
}

.legend-cells {
  display: flex;
  gap: 3px;
}

.legend-cells div {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

@media (orientation: portrait) and (max-width: 768px) {
  .github-heatmap {
    padding: 100px 0;
  }

  .heatmap-header {
    margin-bottom: 58px;
  }

  .heatmap-header h2 {
    font-size: 56px;
  }

  .heatmap-header p {
    font-size: 18px;
  }

  .heatmap-frame {
    padding: 0 16px;
  }

  .heatmap-month {
    font-size: 10px;
  }

  .heatmap-weekday {
    font-size: 10px;
  }

  .heatmap-legend {
    margin-top: 16px;
    font-size: 12px;
    gap: 6px;
  }
}

@media (orientation: portrait) and (max-width: 480px) {
  .github-heatmap {
    padding: 80px 0;
  }

  .heatmap-header h2 {
    font-size: 44px;
  }

  .heatmap-header p {
    font-size: 16px;
  }
}

/* 横屏矮视口：压缩区块纵向呼吸，格子尺寸仍由 JS 实测驱动 */
@media (orientation: landscape) and (max-height: 500px) {
  .github-heatmap {
    padding: 72px 0;
  }

  .heatmap-header {
    margin-bottom: 40px;
  }

  .heatmap-header h2 {
    font-size: 40px;
  }

  .heatmap-header p {
    font-size: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .heatmap-cell {
    animation: none;
    transition: none;
  }
}
</style>

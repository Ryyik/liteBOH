<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import EmptyState from '@/components/ui/EmptyState.vue';

/**
 * ActivityHeatmap — 个人活跃热力图（GitHub 贡献图同款）
 *
 * 数据来源单一入口：后端的 get_user_activity_heatmap RPC。该 RPC 只返回「有活动的那一天」
 * （多数用户一年里是稀疏的），其余 0 值天由本组件依据返回的 start_date/end_date 补齐铺满。
 *
 * 之所以不在前端聚合：PostgREST 无法表达按日分组的聚合，前端拉全量 posts/comments 再算
 * 既不经济也会拖慢个人空间首屏。
 *
 * 日期处理纪律：一律以 UTC 挂载的 Date 承载 'YYYY-MM-DD'，
 * 避免本地时区偏移把「服务端按 Asia/Shanghai 分的桶」挪到相邻天。
 */
const props = defineProps({
  /** RPC 返回值；未就绪时传 null */
  payload: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  /** 基于北京时间（记忆/摘要口径）时传给 tooltip 的补充说明 */
  timezoneLabel: { type: String, default: 'Asia/Shanghai' },
  /** 是否本人视角。访客视角隐藏「去发帖」入口 —— 他人的空间没有可跳的发帖 tab */
  isOwner: { type: Boolean, default: true }
});

const emit = defineEmits(['switch-tab']);

const CELL_SIZE = 12;
const CELL_GAP = 3;
const MAX_WEEKS = 53;

const toKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const parseKey = (key) => {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

/** 计数 → 色阶（0-4）。固定阈值而非分位数，保证同一数字在任何账号下颜色一致。 */
const levelOf = (count) => {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
};

const days = computed(() => {
  const source = props.payload;
  if (!source?.start_date || !source?.end_date) return [];

  const start = parseKey(source.start_date);
  const end = parseKey(source.end_date);
  if (!start || !end || start > end) return [];

  const bucket = new Map();
  (source.days || []).forEach((row) => {
    if (!row?.d) return;
    const posts = Number(row.p) || 0;
    const comments = Number(row.c) || 0;
    bucket.set(row.d, { posts, comments });
  });

  const cells = [];
  const cursor = new Date(start);
  let safety = 0;
  while (cursor <= end && safety < MAX_WEEKS * 7 + 7) {
    const key = toKey(cursor);
    const hit = bucket.get(key) || { posts: 0, comments: 0 };
    const total = hit.posts + hit.comments;
    cells.push({
      key,
      date: new Date(cursor),
      posts: hit.posts,
      comments: hit.comments,
      total,
      level: levelOf(total),
      dayOfWeek: cursor.getUTCDay()
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    safety += 1;
  }
  return cells;
});

/** 按周围绕：每列一周，首列用空白补齐到周一在首位 */
const weeks = computed(() => {
  const cells = days.value;
  if (!cells.length) return [];
  const lead = cells[0].dayOfWeek;
  const padded = [...Array.from({ length: lead }, () => null), ...cells];
  const chunked = [];
  for (let i = 0; i < padded.length; i += 7) {
    chunked.push(padded.slice(i, i + 7));
  }
  return chunked;
});

/**
 * 月份标签：以「某月首次出现的那一列」为锚，span = 该月横跨的列数。
 * 直接返回月清单（不是逐列数组），模板里按顺序平铺即可对齐。
 */
const monthLabels = computed(() => {
  const result = [];
  let lastMonth = -1;
  weeks.value.forEach((week) => {
    const firstReal = week.find(Boolean);
    if (!firstReal) return;
    const month = firstReal.date.getUTCMonth();
    let current = result[result.length - 1];
    if (!current || month !== lastMonth) {
      current = { text: `${month + 1}月`, span: 0 };
      result.push(current);
      lastMonth = month;
    }
    current.span += 1;
  });
  return result.filter((item) => item.span > 0);
});

const totalCount = computed(() => {
  const source = props.payload;
  if (!source) return 0;
  return (Number(source.total_posts) || 0) + (Number(source.total_comments) || 0);
});

const metrics = computed(() => {
  const source = props.payload;
  if (!source) return [];
  return [
    { label: '发帖', value: Number(source.total_posts) || 0 },
    { label: '回复', value: Number(source.total_comments) || 0 },
    { label: '活跃天数', value: Number(source.active_days) || 0 },
    { label: '最长连续', value: `${Number(source.max_streak) || 0} 天` }
  ];
});

const hasData = computed(() => days.value.length > 0 && totalCount.value > 0);

/** 空态文案按视角分流：本人给行动出口，访客只做陈述 */
const emptyState = computed(() => (props.isOwner
  ? {
      title: '还没有留下足迹',
      description: '发个帖子或者回复一句，这里就会亮起第一块格子。',
      actionText: '去发帖'
    }
  : {
      title: 'TA 还没有留下足迹',
      description: 'TA 还没有发帖或回复，等 TA 的第一块格子亮起。',
      actionText: ''
    }));

const scrollRef = ref(null);
const canvasRef = ref(null);
const hovered = ref(null);

const scrollToLatest = () => {
  const el = scrollRef.value;
  if (!el) return;
  el.scrollLeft = el.scrollWidth;
};

onMounted(() => {
  if (hasData.value) nextTick(scrollToLatest);
});

watch(hasData, (value) => {
  if (value) nextTick(scrollToLatest);
});

const handleCellEnter = (cell, event) => {
  if (!cell) return;
  // 基准必须是 canvas（滚动内容本身），不能用 scrollRef —— absolute 子元素绑定的是
  // containing block 的 padding box，横滑时不会跟着位移，用滚动容器算出来的 left 会漂。
  const hostRect = canvasRef.value?.getBoundingClientRect();
  if (!hostRect) return;
  const rect = event.currentTarget.getBoundingClientRect();
  hovered.value = {
    ...cell,
    left: rect.left - hostRect.left + rect.width / 2,
    top: rect.top - hostRect.top
  };
};

const handleGridLeave = () => {
  hovered.value = null;
};

const formatCellDate = (date) => `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;

const cellTitle = (cell) => {
  if (!cell.total) return `${formatCellDate(cell.date)} · 无记录`;
  const parts = [];
  if (cell.posts) parts.push(`${cell.posts} 发帖`);
  if (cell.comments) parts.push(`${cell.comments} 回复`);
  return `${formatCellDate(cell.date)} · ${parts.join(' · ')}`;
};

const tipText = computed(() => (hovered.value ? cellTitle(hovered.value) : ''));
</script>

<template>
  <section class="profile-activity-heatmap" aria-label="活跃轨迹">
    <div class="heatmap-head">
      <span class="heatmap-kicker">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="3" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
        活跃轨迹
      </span>
      <span class="heatmap-total">过去一年 {{ totalCount }} 次</span>
    </div>

    <div v-if="loading" class="heatmap-loading" aria-label="正在加载活跃数据">
      <span class="heatmap-loading-bar"></span>
      <span class="heatmap-loading-bar short"></span>
    </div>

    <template v-else-if="hasData">
      <div class="heatmap-metrics">
        <div v-for="item in metrics" :key="item.label" class="heatmap-metric">
          <span class="heatmap-metric-label">{{ item.label }}</span>
          <strong class="heatmap-metric-value">{{ item.value }}</strong>
        </div>
      </div>

      <div ref="scrollRef" class="heatmap-scroll">
        <div ref="canvasRef" class="heatmap-canvas">
          <div class="heatmap-months" aria-hidden="true">
            <span v-for="label in monthLabels" :key="`month-${label.text}-${label.span}`" class="heatmap-month"
              :style="{ width: `${label.span * (CELL_SIZE + CELL_GAP)}px` }">{{ label.text }}</span>
          </div>
          <div class="heatmap-body">
            <div class="heatmap-dows" aria-hidden="true">
              <span v-for="label in ['', '一', '', '三', '', '五', '']" :key="`dow-${label || 'x'}`">{{ label }}</span>
            </div>
            <div class="heatmap-grid" @mouseleave="handleGridLeave">
              <template v-for="(week, weekIndex) in weeks" :key="`week-${weekIndex}`">
                <span v-for="(cell, dayIndex) in week" :key="cell ? cell.key : `pad-${weekIndex}-${dayIndex}`"
                  class="heatmap-cell"
                  :class="[cell ? `is-level-${cell.level}` : 'is-pad', { 'is-active': cell?.total > 0 }]"
                  :title="cell ? cellTitle(cell) : ''" @mouseenter="handleCellEnter(cell, $event)"></span>
              </template>
            </div>
          </div>

          <div v-if="hovered" class="heatmap-tip" :style="{ left: `${hovered.left}px`, top: `${hovered.top}px` }">
            {{ tipText }}
          </div>
        </div>
      </div>

      <div class="heatmap-foot">
        <span class="heatmap-legend">
          少
          <i class="heatmap-swatch is-level-0"></i>
          <i class="heatmap-swatch is-level-1"></i>
          <i class="heatmap-swatch is-level-2"></i>
          <i class="heatmap-swatch is-level-3"></i>
          <i class="heatmap-swatch is-level-4"></i>
          多
        </span>
        <span class="heatmap-hint">横滑查看更早 · 按 {{ timezoneLabel }} 计日</span>
      </div>
    </template>

    <EmptyState v-else compact variant="spark" :title="emptyState.title" :description="emptyState.description"
      :action-text="emptyState.actionText" @action="emit('switch-tab', 'posts')" />
  </section>
</template>

<style scoped>
.profile-activity-heatmap {
  /* min-width:0 —— 组件可能作为 flex/grid 子项，默认的 auto 最小宽度会被内部
     横向滚动区的内容宽度顶开，导致面板把整个页面撑宽。 */
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 14px 16px 12px;
  border: 1px solid var(--stroke);
  border-radius: 20px;
  background: var(--surface);
  /* 不用 --shadow-sm：该变量在两个宿主里语义不一致（user-space 是完整 shadow，profile 只是个 rgba 颜色），
     跨页复用必须取全局单一源的 --liquid-shadow-sm。 */
  box-shadow: var(--liquid-shadow-sm);
  animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 60ms both;
}

@keyframes userspace-panel-in {
  from {
    opacity: 0;
    transform: translate3d(0, 14px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

/* 骨架 → 数据到达：轻浮入（v-else 分支重挂载时自动播放一次） */
.heatmap-metrics,
.heatmap-scroll {
  animation: userspace-panel-in 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.heatmap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.heatmap-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 900;
}

.heatmap-total {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
}

/* ---------- 加载骨架 ---------- */
.heatmap-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 0 20px;
}

.heatmap-loading-bar {
  height: 84px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.06) 25%, rgba(15, 23, 42, 0.11) 50%, rgba(15, 23, 42, 0.06) 75%);
  background-size: 200% 100%;
  animation: heatmap-shimmer 1.4s linear infinite;
}

.heatmap-loading-bar.short {
  height: 12px;
  width: 42%;
}

@keyframes heatmap-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ---------- 指标条 ---------- */
.heatmap-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.heatmap-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 10px;
  border-radius: 12px;
  background: var(--surface-soft, rgba(15, 23, 42, 0.035));
}

.heatmap-metric-label {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 650;
}

.heatmap-metric-value {
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.2;
}

/* ---------- 网格 ---------- */
.heatmap-scroll {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.22) transparent;
  -webkit-overflow-scrolling: touch;
}

.heatmap-scroll::-webkit-scrollbar {
  height: 5px;
}

.heatmap-scroll::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.25);
  border-radius: 999px;
}

/* 悬浮提示挂载在 canvas 内（而非滚动容器）——它是滚动内容的一部分，横滑时会跟着格子走 */
.heatmap-canvas {
  position: relative;
  display: inline-block;
  min-width: 100%;
}

.heatmap-months {
  display: flex;
  margin: 0 0 4px 22px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 650;
}

.heatmap-month {
  flex: 0 0 auto;
  white-space: nowrap;
}

.heatmap-body {
  display: flex;
  gap: 4px;
}

.heatmap-dows {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
  width: 18px;
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 12px;
  color: var(--text-secondary);
  font-weight: 650;
}

.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column;
  gap: 3px;
}

.heatmap-cell {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--boh-heat-0);
  transition: outline-color 160ms ease;
  outline: 1px solid rgba(15, 23, 42, 0.04);
  outline-offset: -1px;
}

.heatmap-cell.is-pad {
  background: transparent;
  outline: none;
  pointer-events: none;
}

.heatmap-cell.is-level-1 { background: var(--boh-heat-1); }
.heatmap-cell.is-level-2 { background: var(--boh-heat-2); }
.heatmap-cell.is-level-3 { background: var(--boh-heat-3); }
.heatmap-cell.is-level-4 { background: var(--boh-heat-4); }

.heatmap-cell.is-active:hover {
  outline-color: rgba(15, 23, 42, 0.32);
  position: relative;
  z-index: 1;
}

/* ---------- 悬浮提示 ---------- */
.heatmap-tip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 8px));
  padding: 5px 9px;
  border-radius: 8px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

/* ---------- 底部图例 ---------- */
.heatmap-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}

.heatmap-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.heatmap-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.heatmap-swatch.is-level-0 { background: var(--boh-heat-0); }
.heatmap-swatch.is-level-1 { background: var(--boh-heat-1); }
.heatmap-swatch.is-level-2 { background: var(--boh-heat-2); }
.heatmap-swatch.is-level-3 { background: var(--boh-heat-3); }
.heatmap-swatch.is-level-4 { background: var(--boh-heat-4); }

.heatmap-hint {
  font-weight: 650;
}

/* 暗色覆写挂在 html[data-theme] 上而非某个宿主：本组件同时在「我的空间」(.user-space-page)
   与「他人主页」(.profile-page) 使用，两者都有自己的 data-theme，写成全局单一源才不会漏一侧。
   ← range 内的祖先选择器不带 scope 属性，不会触发「scoped 跨组件匹配不到」的坑。 */
html[data-theme="dark"] .heatmap-loading-bar {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.06) 25%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.06) 75%);
  background-size: 200% 100%;
}

html[data-theme="dark"] .heatmap-cell.is-active:hover {
  outline-color: rgba(255, 255, 255, 0.4);
}

@media (max-width: 767px) {
  .profile-activity-heatmap {
    padding: 12px 14px 10px;
  }

  .heatmap-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .heatmap-foot {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-activity-heatmap {
    animation-duration: 1ms;
  }

  .heatmap-metrics,
  .heatmap-scroll {
    animation: none;
  }

  .heatmap-cell,
  .heatmap-loading-bar {
    animation: none;
    transition: none;
  }
}
</style>

<script setup>
/**
 * PityIslandCard — 「社区抽奖」保底进度全局导航栏自定义岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，内容高度自动上报撑开导航 surface，
 * 玻璃质感来自 surface 本体（has-custom-card 档，--liquid-filter 液态玻璃），卡体保持透明。
 *
 * 纯展示组件：数据与动作全部由宿主（CommunityLotteries/index.vue）注入，
 * 自身不发请求、不依赖路由（同 WallIslandCard 先例）。
 *
 * 状态机（与页面保底胶囊 variant 同源）：loading / guest / error / free / progress / due
 * - progress / due：紧凑态 ⇄ 展开态（岛内长高，surface 高度经 ResizeObserver 自动跟随）
 * - guest / free / error：点击直接执行宿主动作（拉起登录 / 去订阅 / 重试）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronDown, Coins, Crown, Ticket } from 'lucide-vue-next';

const props = defineProps({
  // 页面保底状态单一真相源（get_my_lottery_pity_status 归一化结果）
  status: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  // 当前积分余额（页面胶囊移除后由岛卡展开区承接展示）
  pointsDisplay: { type: String, default: '' },
  goPoints: { type: Function, default: null },
  goSubscription: { type: Function, default: null },
  openLogin: { type: Function, default: null },
  retry: { type: Function, default: null }
});

const expanded = ref(false);

const losses = computed(() => Number(props.status?.consecutiveLosses || 0));
const threshold = computed(() => Number(props.status?.threshold || 0));
const remaining = computed(() => Math.max(0, Number(props.status?.remainingLosses ?? threshold.value - losses.value)));
const percent = computed(() => {
  if (!props.status?.eligible || !threshold.value) return 0;
  return Math.min(100, Math.round((losses.value / threshold.value) * 100));
});

const variant = computed(() => {
  if (props.loading) return 'loading';
  if (!props.isLoggedIn) return 'guest';
  if (props.error || !props.status) return 'error';
  if (!props.status.eligible) return 'free';
  if (props.status.isDue) return 'due';
  return 'progress';
});

/** 仅 progress / due 两个态有展开详情，其余态点击直接执行动作 */
const hasDetail = computed(() => variant.value === 'progress' || variant.value === 'due');

const compactAria = computed(() => {
  switch (variant.value) {
    case 'loading': return '正在读取保底进度';
    case 'guest': return '登录查看保底进度';
    case 'error': return '保底进度暂不可用，点击重试';
    case 'free': return '订阅后开启保底进度';
    case 'due': return `保底已可兑现，当前 ${losses.value}/${threshold.value} 场`;
    default: return `保底进度 ${losses.value}/${threshold.value} 场，还差 ${remaining.value} 场`;
  }
});

const primaryAction = () => {
  switch (variant.value) {
    case 'guest': props.openLogin?.(); break;
    case 'error': props.retry?.(); break;
    case 'free': props.goSubscription?.(); break;
    case 'progress':
    case 'due':
      expanded.value = !expanded.value;
      break;
    default: break;
  }
};

// Esc 收起展开态（与导航层交互习惯一致）
const onKeydown = (event) => {
  if (event.key === 'Escape' && expanded.value) expanded.value = false;
};

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

// 数据刷新后若已无详情可展示，自动收起，避免撑着空详情
watch(hasDetail, (val) => {
  if (!val) expanded.value = false;
});
</script>

<template>
  <div class="pity-island-card" :class="[`is-${variant}`, { 'is-expanded': hasDetail && expanded }]">
    <!-- 紧凑行：常驻态 -->
    <button
      type="button"
      class="pi-compact"
      :aria-expanded="hasDetail ? expanded : undefined"
      :aria-label="compactAria"
      @click="primaryAction"
    >
      <span class="pi-dot" aria-hidden="true"></span>
      <span class="pi-label">保底</span>
      <span v-if="hasDetail" class="pi-track" aria-hidden="true">
        <span class="pi-fill" :style="{ width: percent + '%' }"></span>
      </span>
      <span v-if="hasDetail" class="pi-count">{{ losses }}/{{ threshold }}</span>
      <span v-if="variant === 'due'" class="pi-due-badge">可兑现</span>
      <span v-if="hasDetail && variant !== 'due'" class="pi-sub">还差{{ remaining }}场</span>
      <span v-else-if="variant === 'loading'" class="pi-sub">正在读取</span>
      <span v-else-if="variant === 'guest'" class="pi-sub">登录查看</span>
      <span v-else-if="variant === 'error'" class="pi-sub">暂不可用 · 重试</span>
      <span v-else-if="variant === 'free'" class="pi-sub">订阅后开启</span>
      <ChevronDown v-if="hasDetail" :size="14" class="pi-chevron" aria-hidden="true" />
    </button>

    <!-- 展开区：岛内长高，surface 高度自动跟随 -->
    <div v-if="hasDetail && expanded" class="pi-detail">
      <div class="pi-detail-head">
        <span class="pi-detail-title">
          <Ticket :size="13" :stroke-width="2.1" aria-hidden="true" />
          保底进度
        </span>
        <span class="pi-detail-num">{{ losses }}<i>/{{ threshold }} 场</i></span>
        <span class="pi-detail-pct">{{ percent }}%</span>
      </div>
      <div class="pi-detail-track" role="progressbar" :aria-valuenow="losses" aria-valuemin="0" :aria-valuemax="threshold" aria-label="保底进度">
        <span class="pi-detail-fill" :style="{ width: percent + '%' }"></span>
      </div>
      <p class="pi-detail-rule">
        <template v-if="variant === 'due'">保底已就绪 · 参与「计入并兑现」活动即可领取保底礼</template>
        <template v-else>还差 {{ remaining }} 场到保底 · 中奖后清零</template>
        <span class="pi-detail-threshold">阈值 Plus 24 · Pro 18 · Max 12 · Ultra 8</span>
      </p>
      <div class="pi-detail-actions">
        <span v-if="pointsDisplay" class="pi-detail-points">当前 {{ pointsDisplay }} 积分</span>
        <button type="button" class="pi-btn pi-btn-primary" @click="goPoints?.()">
          <Coins :size="13" :stroke-width="2.1" aria-hidden="true" />
          <span>积分明细</span>
        </button>
        <button type="button" class="pi-btn" @click="goSubscription?.()">
          <Crown :size="13" :stroke-width="2.1" aria-hidden="true" />
          <span>会员方案</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 卡体透明：液态玻璃来自 surface 本体（has-custom-card 档）；
   rest 高度 52px 与 WallIslandCard 同档，跨页切换岛高不跳变 */
.pity-island-card {
  display: flex;
  flex-direction: column;
  padding: 0 10px 4px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif;
}

/* ---- 紧凑行 ---- */
.pi-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 8px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}

.pi-compact:hover { background: rgba(15, 23, 42, 0.045); }
.pi-compact:active { background: rgba(15, 23, 42, 0.07); }
.pi-compact:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.pi-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #aeaeb2;
}

.is-progress .pi-dot { background: #1d1d1f; }
.is-due .pi-dot { background: #b7791f; box-shadow: 0 0 8px rgba(183, 121, 31, 0.35); }
.is-error .pi-dot { background: #ff3b30; }
.is-loading .pi-dot { animation: pi-dot-pulse 1.2s ease-in-out infinite; }

@keyframes pi-dot-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.pi-label {
  flex: 0 0 auto;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

/* 迷你进度条 */
.pi-track {
  flex: 1 1 60px;
  min-width: 48px;
  height: 5px;
  border-radius: 99px;
  background: rgba(29, 29, 31, 0.1);
  overflow: hidden;
}

.pi-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1d1d1f 0%, #2c2c2e 100%);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-due .pi-track { background: rgba(183, 121, 31, 0.14); }
.is-due .pi-fill { background: linear-gradient(90deg, #b7791f 0%, #d4a017 100%); box-shadow: 0 0 8px rgba(183, 121, 31, 0.3); }

.pi-count {
  flex: 0 0 auto;
  color: #3a3a3c;
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pi-due-badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(255, 251, 235, 0.9);
  color: #b7791f;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.pi-sub {
  flex: 0 0 auto;
  max-width: 96px;
  overflow: hidden;
  color: #8e8e93;
  font-size: 11.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pi-chevron {
  flex: 0 0 auto;
  color: #8e8e93;
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-expanded .pi-chevron { transform: rotate(180deg); }

/* ---- 展开区 ---- */
.pi-detail {
  display: grid;
  gap: 8px;
  padding: 3px 8px 9px;
  animation: pi-expand 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes pi-expand {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.pi-detail-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.pi-detail-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #6e6e73;
  font-size: 12px;
  font-weight: 650;
}

.pi-detail-num {
  margin-left: auto;
  color: #1d1d1f;
  font-size: 17px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.pi-detail-num i {
  color: #8e8e93;
  font-size: 11.5px;
  font-style: normal;
  font-weight: 600;
}

.pi-detail-pct {
  flex: 0 0 auto;
  min-width: 34px;
  color: #6e6e73;
  font-size: 11.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.pi-detail-track {
  height: 6px;
  border-radius: 99px;
  background: rgba(29, 29, 31, 0.1);
  overflow: hidden;
}

.pi-detail-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1d1d1f 0%, #2c2c2e 100%);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-due .pi-detail-track { background: rgba(183, 121, 31, 0.14); }
.is-due .pi-detail-fill { background: linear-gradient(90deg, #b7791f 0%, #d4a017 100%); box-shadow: 0 0 8px rgba(183, 121, 31, 0.3); }

.pi-detail-rule {
  margin: 0;
  color: #6e6e73;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.55;
}

.pi-detail-threshold {
  display: block;
  margin-top: 1px;
  color: #98989d;
  font-size: 11px;
}

.pi-detail-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.pi-detail-points {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #6e6e73;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pi-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border: 0.5px solid rgba(29, 29, 31, 0.14);
  border-radius: 99px;
  background: transparent;
  color: #3a3a3c;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: background-color 0.18s ease, transform 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}

.pi-btn:hover { background: rgba(15, 23, 42, 0.05); }
.pi-btn:active { transform: scale(0.97); }
.pi-btn:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.pi-btn-primary {
  border-color: transparent;
  background: #0071e3;
  color: #fff;
}

.pi-btn-primary:hover { background: #0062c4; }

/* ---------- 暗色（整条 :global 前缀，逐条独立写） ---------- */
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-compact:hover) { background: rgba(255, 255, 255, 0.06); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-compact:active) { background: rgba(255, 255, 255, 0.1); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-label) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-track) { background: rgba(255, 255, 255, 0.14); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-fill) { background: linear-gradient(90deg, #f5f5f7 0%, #e5e5ea 100%); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-due .pi-dot) { background: #e0a23a; box-shadow: 0 0 8px rgba(224, 162, 58, 0.35); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-due .pi-track) { background: rgba(224, 162, 58, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-due .pi-fill) { background: linear-gradient(90deg, #e0a23a 0%, #f0c040 100%); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-progress .pi-dot) { background: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-error .pi-dot) { background: #ff453a; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-count) { color: #d1d1d6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-due-badge) { background: rgba(224, 162, 58, 0.16); color: #f0c040; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-sub) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-chevron) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-title) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-num) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-num i) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-pct) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-track) { background: rgba(255, 255, 255, 0.14); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-fill) { background: linear-gradient(90deg, #f5f5f7 0%, #e5e5ea 100%); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-due .pi-detail-track) { background: rgba(224, 162, 58, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card.is-due .pi-detail-fill) { background: linear-gradient(90deg, #e0a23a 0%, #f0c040 100%); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-rule) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-threshold) { color: rgba(161, 161, 166, 0.8); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-detail-points) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-btn) { border-color: rgba(255, 255, 255, 0.16); color: #d1d1d6; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-btn:hover) { background: rgba(255, 255, 255, 0.08); }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-btn-primary) { background: #0071e3; color: #fff; }
:global(#unified-nav-container[data-theme="dark"] .pity-island-card .pi-btn-primary:hover) { background: #0062c4; }

/* ---------- 横竖屏适配 ---------- */
@media (max-width: 480px) {
  .pi-sub { display: none; }
  .pi-compact { gap: 7px; padding: 0 6px; }
  .pi-detail-rule { font-size: 11.5px; }
  .pi-detail-threshold { font-size: 10.5px; }
}

@media (prefers-reduced-motion: reduce) {
  .pi-compact,
  .pi-fill,
  .pi-detail-fill,
  .pi-chevron { transition: none; }
  .pi-detail { animation: none; }
  .is-loading .pi-dot { animation: none; }
}
</style>

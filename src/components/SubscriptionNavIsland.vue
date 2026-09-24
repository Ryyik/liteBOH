<script setup>
/**
 * SubscriptionNavIsland — 订阅页「吸顶条」融入灵动导航栏的自定义岛（showIsland.custom 槽位）
 *
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，内容高度自动上报撑开导航 surface，
 * 玻璃质感来自 surface 本体（has-custom-card 档），卡体保持透明（同 LabQuotaIsland 先例）。
 *
 * 纯展示组件：数据与动作全部由宿主（SubscriptionPlans.vue）注入，
 * 自身不发请求、不依赖路由、不读全局状态。
 *
 * 承载页面顶部「计费周期 + 当前订阅 + 积分/充值」三条信息：
 * - 宿主在工具条被导航栏吞没时挂载本岛，滚回时卸载，实现「吸顶条自动融入灵动导航栏」。
 * - 布局恒为单行（不换行、不折叠），保证宿主用于判定收放的岛高稳定可测。
 */
import { computed } from 'vue';
import { ChevronRight, Coins, Crown, Sparkles } from 'lucide-vue-next';

const props = defineProps({
  // 当前计费周期：'monthly' | 'yearly'
  billingCycle: { type: String, default: 'monthly' },
  // 周期选项快照：[{ value, label, discount }]
  billingTabs: { type: Array, default: () => [] },
  // 最高有效订阅快照：{ name, expiresText } | null
  plan: { type: Object, default: null },
  // 是否处于试用态
  isTrial: { type: Boolean, default: false },
  // 当前积分
  points: { type: Number, default: 0 },
  // 提交中（订阅/试用请求进行中）
  submitting: { type: Boolean, default: false },
  onSwitchCycle: { type: Function, default: null },
  onRecharge: { type: Function, default: null }
});

const tabs = computed(() => (Array.isArray(props.billingTabs) ? props.billingTabs : []));

/** 滑块位置：按选项数均分，与页面内 .seg 的百分比写法同源 */
const activeIndex = computed(() => {
  const idx = tabs.value.findIndex((t) => t.value === props.billingCycle);
  return idx < 0 ? 0 : idx;
});
const thumbStyle = computed(() => {
  const count = Math.max(tabs.value.length, 1);
  const width = 100 / count;
  return { left: `calc(${activeIndex.value * width}% + 3px)`, width: `calc(${width}% - 6px)` };
});

const hasPlan = computed(() => !!props.plan);
const planName = computed(() => String(props.plan?.name || ''));
const expiresText = computed(() => String(props.plan?.expiresText || ''));
const statusTitle = computed(() => {
  if (!hasPlan.value) return '尚未订阅';
  return `${props.isTrial ? '试用中' : '当前订阅'} · ${planName.value}`;
});
const statusSub = computed(() => (hasPlan.value ? `至 ${expiresText.value}` : '选个档位开始'));

const switchCycle = (tab) => {
  if (!tab?.value || tab.value === props.billingCycle) return;
  props.onSwitchCycle?.(tab.value);
};
</script>

<template>
  <div class="sub-nav-island" :class="{ 'is-trial': isTrial, 'is-idle': !hasPlan }">
    <!-- 计费周期：与页面内分段控件同语义，尺寸收窄以适配导航胶囊 -->
    <div class="sni-seg" role="tablist" aria-label="计费周期">
      <span class="sni-seg-thumb" aria-hidden="true" :style="thumbStyle" />
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        class="sni-seg-btn"
        :class="{ active: billingCycle === tab.value }"
        :aria-selected="billingCycle === tab.value"
        @click="switchCycle(tab)"
      >{{ tab.label }}<em v-if="tab.discount">{{ tab.discount }}</em></button>
    </div>

    <span class="sni-divider" aria-hidden="true" />

    <!-- 当前订阅状态 -->
    <span class="sni-status" :class="{ none: !hasPlan }">
      <span class="sni-status-icon" aria-hidden="true">
        <Crown v-if="hasPlan" :size="13" />
        <Sparkles v-else :size="13" />
      </span>
      <span class="sni-status-text">
        <b>{{ statusTitle }}</b>
        <small>{{ statusSub }}</small>
      </span>
    </span>

    <!-- 积分 + 充值 -->
    <button
      type="button"
      class="sni-points"
      :aria-label="`当前积分 ${points}，点击充值`"
      @click="onRecharge?.()"
    >
      <span class="sni-coin" aria-hidden="true"><Coins :size="14" :stroke-width="1.9" /></span>
      <span class="sni-points-num">{{ points }}</span>
      <span class="sni-points-unit">积分</span>
      <span class="sni-go">充值<ChevronRight :size="13" aria-hidden="true" /></span>
    </button>
  </div>
</template>

<style scoped>
/* 卡体透明：液态玻璃来自 surface 本体（has-custom-card 档）。
   固定单行高度 —— 宿主用它推算导航栏展开后的底边，勿在窄屏改为换行。 */
.sub-nav-island {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 8px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ---------- 计费周期 ---------- */
.sni-seg {
  position: relative;
  flex: 0 0 auto;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  min-width: 168px;
  padding: 3px;
  border-radius: 980px;
  background: rgba(120, 120, 128, 0.16);
}

.sni-seg-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 980px;
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.14);
  transition: left 0.42s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.sni-seg-btn {
  position: relative;
  z-index: 1;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 980px;
  background: transparent;
  color: #6e6e73;
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.22s ease, transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.sni-seg-btn.active { color: #1d1d1f; }
.sni-seg-btn:active { transform: scale(0.96); }
.sni-seg-btn:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }
.sni-seg-btn em {
  margin-left: 5px;
  color: #0071e3;
  font-size: 11px;
  font-style: normal;
  font-weight: 650;
}

.sni-divider {
  flex: 0 0 auto;
  width: 1px;
  height: 22px;
  background: rgba(120, 120, 128, 0.22);
}

/* ---------- 订阅状态 ---------- */
.sni-status {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 4px;
}

.sni-status-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: linear-gradient(135deg, #0071e3, #42a5f5);
  color: #fff;
}
.sni-status.none .sni-status-icon {
  background: rgba(120, 120, 128, 0.2);
  color: #6e6e73;
}
.is-trial .sni-status-icon { background: linear-gradient(135deg, #0f8a6a, #34d399); }

.sni-status-text {
  display: grid;
  gap: 0;
  min-width: 0;
  line-height: 1.25;
}
.sni-status-text b {
  overflow: hidden;
  color: #1d1d1f;
  font-size: 12.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sni-status-text small {
  overflow: hidden;
  color: #86868b;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 积分 + 充值 ---------- */
.sni-points {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px 0 7px;
  border: 1px solid rgba(0, 113, 227, 0.18);
  border-radius: 980px;
  background: rgba(0, 113, 227, 0.08);
  color: #1d1d1f;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}
.sni-points:hover { border-color: rgba(0, 113, 227, 0.34); background: rgba(0, 113, 227, 0.13); }
.sni-points:active { transform: scale(0.97); }
.sni-points:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.sni-coin {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: rgba(0, 113, 227, 0.14);
  color: #0071e3;
}

.sni-points-num {
  color: #1d1d1f;
  font-size: 14.5px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.sni-points-unit {
  color: #86868b;
  font-size: 11.5px;
  font-weight: 600;
}

.sni-go {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding-left: 7px;
  border-left: 1px solid rgba(120, 120, 128, 0.25);
  color: #0071e3;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}

/* ---------- 暗色（整条 :global 前缀，逐条独立写） ---------- */
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-seg) { background: rgba(255, 255, 255, 0.12); }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-seg-thumb) { background: #2c2c2e; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-seg-btn) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-seg-btn.active) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-seg-btn em) { color: #2997ff; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-divider) { background: rgba(255, 255, 255, 0.14); }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-status-text b) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-status-text small) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-status.none .sni-status-icon) { background: rgba(255, 255, 255, 0.12); color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-points) { border-color: rgba(41, 151, 255, 0.28); background: rgba(41, 151, 255, 0.12); color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-points:hover) { border-color: rgba(41, 151, 255, 0.48); background: rgba(41, 151, 255, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-coin) { background: rgba(41, 151, 255, 0.18); color: #2997ff; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-points-num) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-points-unit) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .sub-nav-island .sni-go) { border-left-color: rgba(255, 255, 255, 0.16); color: #2997ff; }

/* ---------- 窄屏：只做减法，恒不换行 ---------- */
@media (max-width: 900px) {
  .sni-seg { min-width: 146px; }
  .sni-seg-btn { padding: 0 9px; font-size: 12px; }
  .sni-status-text small { display: none; }
}

@media (max-width: 620px) {
  .sub-nav-island { gap: 8px; padding: 0 6px; }
  .sni-divider { display: none; }
  .sni-seg { min-width: 124px; }
  .sni-seg-btn { padding: 0 7px; font-size: 11.5px; }
  .sni-seg-btn em { display: none; }
  .sni-status { gap: 6px; padding: 0; }
  .sni-status-text b { font-size: 11.5px; }
  .sni-points { gap: 5px; padding: 0 9px 0 6px; }
  .sni-points-unit { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .sni-seg-thumb,
  .sni-seg-btn,
  .sni-points { transition: none; }
}
</style>

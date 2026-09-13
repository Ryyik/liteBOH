<script setup>
/**
 * LabQuotaIsland — 「BOH Agent 实验室」配额 + 生成状态全局导航栏自定义岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，内容高度自动上报撑开导航 surface，
 * 玻璃质感来自 surface 本体（has-custom-card 档，--liquid-filter 液态玻璃），卡体保持透明。
 *
 * 纯展示组件：数据与动作全部由宿主（Lab/index.vue）注入，
 * 自身不发请求、不依赖路由（同 PityIslandCard 先例）。
 *
 * 页面顶栏的配额徽章与底部状态栏横条已移除，由本岛卡承接展示：
 * - 紧凑行：状态点 + 「Agent」标签 + 迷你进度条（生成中=生成进度，空闲=配额用量）+ 剩余次数 / 生成阶段
 * - 展开区（点击展开）：本月配额详情、档位限额说明、升级入口
 * - 状态机：loading / unlimited / exceeded / normal（叠加 gen.running 生成态）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronDown, Cpu, Crown, Paintbrush, Zap } from 'lucide-vue-next';

const props = defineProps({
  // 配额快照（useLabQuota 的 quotaDisplayData）：{ used, limit, remaining, percent, isExceeded, isUnlimited, tier, nextTier, nextTierQuota }
  quota: { type: Object, default: null },
  // 生成状态快照：{ running, label, stage, progress }（progress 为 null 表示不确定进度）
  gen: { type: Object, default: () => ({ running: false, label: '', stage: '', progress: null }) },
  // 对话模型快照：{ list: [{ id, name, tagline, tierTag, locked, mult }], selectedId, loading }
  models: { type: Object, default: () => ({ list: [], selectedId: '', loading: false }) },
  // 样式集快照：{ list: [{ id, name }], selectedId }
  presets: { type: Object, default: () => ({ list: [], selectedId: '' }) },
  // 思考预算值（0-1，五档映射与 ThinkingBudgetSlider 同阈值）
  thinking: { type: Number, default: 0.5 },
  // 外部请求聚焦某分区（输入框样式集 pill 联动）：{ tab: 'style'|'think'|..., seq: Number }，seq 变化触发展开并切 tab
  focusTab: { type: Object, default: null },
  // 未就绪时紧凑行文案
  loading: { type: Boolean, default: false },
  goSubscription: { type: Function, default: null },
  onSelectModel: { type: Function, default: null },
  onSelectPreset: { type: Function, default: null },
  onSetThinking: { type: Function, default: null }
});

const TIER_LABEL_MAP = { anonymous: '游客', free: 'Free', plus: 'Plus', pro: 'Pro', max: 'Max', ultra: 'Ultra' };

const expanded = ref(false);

const genRunning = computed(() => !!props.gen?.running);
const genLabel = computed(() => String(props.gen?.label || ''));
const genStage = computed(() => String(props.gen?.stage || ''));
const genHasProgress = computed(() => Number.isFinite(Number(props.gen?.progress)));
const genPercent = computed(() => Math.max(0, Math.min(100, Math.round(Number(props.gen?.progress) || 0))));

const used = computed(() => Number(props.quota?.used || 0));
const limit = computed(() => Number(props.quota?.limit ?? 0));
const remaining = computed(() => Number(props.quota?.remaining ?? 0));
const percent = computed(() => {
  if (props.quota?.isUnlimited) return 0;
  if (!limit.value) return 0;
  return Math.min(100, Math.round((used.value / limit.value) * 100));
});

const variant = computed(() => {
  if (props.loading || !props.quota) return 'loading';
  if (props.quota.isUnlimited) return 'unlimited';
  if (props.quota.isExceeded) return 'exceeded';
  return 'normal';
});

/** 展开详情：loading 态无数据不展开；无限态也可展开看档位说明 */
const hasDetail = computed(() => variant.value !== 'loading');

/** 紧凑行状态点颜色语义 */
const dotClass = computed(() => {
  if (genRunning.value) return 'gen';
  if (variant.value === 'exceeded') return 'exceeded';
  if (variant.value === 'unlimited') return 'unlimited';
  return 'idle';
});

/** 迷你进度条：生成中展示生成进度（蓝），否则展示配额用量（黑 / 超限红） */
const barMode = computed(() => {
  if (genRunning.value) return 'gen';
  if (variant.value === 'exceeded') return 'exceeded';
  if (variant.value === 'unlimited') return 'none';
  return 'quota';
});

const barPercent = computed(() => (barMode.value === 'gen' ? genPercent.value : percent.value));

/** 紧凑行计数：生成中显示百分比，否则显示剩余次数 */
const countText = computed(() => {
  if (genRunning.value && genHasProgress.value) return `${genPercent.value}%`;
  if (variant.value === 'unlimited') return '∞';
  if (variant.value === 'loading') return '--';
  return `${remaining.value}`;
});

/** 紧凑行副文案：生成阶段优先，其次配额语义 */
const subText = computed(() => {
  if (genRunning.value) {
    const stage = genStage.value || '正在思考…';
    return genHasProgress.value ? stage : `${stage}`;
  }
  if (variant.value === 'loading') return '正在读取';
  if (variant.value === 'unlimited') return '无限生成';
  if (variant.value === 'exceeded') return '配额已用完';
  return `剩余 ${remaining.value} 次`;
});

const compactAria = computed(() => {
  if (genRunning.value) return `正在生成${genLabel.value}：${genStage.value || '处理中'}`;
  if (variant.value === 'exceeded') return `本月配额已用完，已用 ${used.value}/${limit.value} 次，点击查看详情`;
  if (variant.value === 'unlimited') return '配额无限生成，点击查看详情';
  if (variant.value === 'loading') return '正在读取配额';
  return `本月剩余 ${remaining.value} 次（已用 ${used.value}/${limit.value}），点击查看详情`;
});

const tierLabel = computed(() => TIER_LABEL_MAP[props.quota?.tier] || props.quota?.tier || '-');
const nextTierLabel = computed(() => (props.quota?.nextTier ? TIER_LABEL_MAP[props.quota.nextTier] : ''));
const genTaskText = computed(() => (genRunning.value ? `当前任务：生成${genLabel.value} · ${genStage.value || '处理中'}` : ''));

// ---- 对话模型选择 ----
const modelList = computed(() => (Array.isArray(props.models?.list) ? props.models.list : []));
const modelLoading = computed(() => !!props.models?.loading);
const selectedModelId = computed(() => String(props.models?.selectedId ?? ''));
const selectedModel = computed(() => modelList.value.find((m) => m.id === selectedModelId.value) || null);
const currentModelText = computed(() => {
  if (modelLoading.value) return '正在读取模型';
  if (!modelList.value.length) return '默认模型';
  return selectedModel.value?.name || '默认模型';
});

const pickModel = (item) => {
  if (item?.locked) return;
  props.onSelectModel?.(item?.id ?? '');
};

// ---- 样式集选择 ----
const presetList = computed(() => (Array.isArray(props.presets?.list) ? props.presets.list : []));
const presetSelectedId = computed(() => String(props.presets?.selectedId ?? ''));
const currentPresetText = computed(() => {
  const cur = presetList.value.find((p) => p.id === presetSelectedId.value);
  return cur?.name || '默认';
});

const pickPreset = (item) => {
  if (item?.id == null) return;
  props.onSelectPreset?.(item.id);
};

// ---- 思考预算（五档，阈值与 ThinkingBudgetSlider 一致） ----
const THINKING_LEVELS = [
  { label: '低', value: 0.1 },
  { label: '偏低', value: 0.35 },
  { label: '中', value: 0.55 },
  { label: '偏高', value: 0.75 },
  { label: '高', value: 0.95 },
];
const thinkingValue = computed(() => Number(props.thinking) || 0);
const activeThinking = computed(() => {
  const v = thinkingValue.value;
  if (v < 0.25) return '低';
  if (v < 0.45) return '偏低';
  if (v < 0.65) return '中';
  if (v < 0.85) return '偏高';
  return '高';
});
const setThinking = (level) => props.onSetThinking?.(level.value);

// ---- 展开区分区（内部点击出现列表：配额 / 模型 / 样式 / 思考，选择内容综合管理） ----
const activeTab = ref('quota');
const TAB_ITEMS = [
  { id: 'quota', label: '配额' },
  { id: 'model', label: '模型' },
  { id: 'style', label: '样式' },
  { id: 'think', label: '思考' },
];
const switchTab = (id) => { activeTab.value = id; };

const primaryAction = () => {
  if (hasDetail.value) expanded.value = !expanded.value;
};

// Esc 收起展开态（与导航层交互习惯一致）
const onKeydown = (event) => {
  if (event.key === 'Escape' && expanded.value) expanded.value = false;
};

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

// 生成结束时若展开区无新内容变化，保持原样；数据刷新由宿主 sync 驱动
watch(hasDetail, (val) => {
  if (!val) expanded.value = false;
});

// 输入框 pill 联动：seq 变化 → 展开岛并切到对应分区（样式集 pill → 样式 tab 等）
watch(
  () => props.focusTab,
  (ft) => {
    if (ft && Number(ft.seq) > 0 && ft.tab) {
      expanded.value = true;
      activeTab.value = String(ft.tab);
    }
  }
);
</script>

<template>
  <div class="lab-quota-island" :class="[`is-${variant}`, { 'is-expanded': hasDetail && expanded, 'is-gen': genRunning }]">
    <!-- 紧凑行：常驻态 -->
    <button
      type="button"
      class="lq-compact"
      :aria-expanded="hasDetail ? expanded : undefined"
      :aria-label="compactAria"
      @click="primaryAction"
    >
      <span class="lq-dot" aria-hidden="true"></span>
      <span class="lq-label">Agent</span>
      <span v-if="barMode !== 'none'" class="lq-track" aria-hidden="true">
        <span v-if="barMode !== 'gen' || genHasProgress" class="lq-fill" :style="{ width: barPercent + '%' }"></span>
        <span v-else class="lq-fill is-indeterminate"></span>
      </span>
      <span class="lq-count">{{ countText }}</span>
      <span class="lq-sub">{{ subText }}</span>
      <ChevronDown v-if="hasDetail" :size="14" class="lq-chevron" aria-hidden="true" />
    </button>

    <!-- 展开区：岛内长高，surface 高度自动跟随。
         分区交互：点击 tab 出现对应列表，把配额/模型/样式/思考的选择内容综合在一处 -->
    <div v-if="hasDetail && expanded" class="lq-detail">
      <div class="lq-tabs" role="tablist" aria-label="灵动岛分区">
        <button
          v-for="t in TAB_ITEMS"
          :key="t.id"
          type="button"
          class="lq-tab"
          :class="{ 'is-active': activeTab === t.id }"
          role="tab"
          :aria-selected="activeTab === t.id"
          @click="switchTab(t.id)"
        >{{ t.label }}</button>
      </div>

      <!-- 配额面板 -->
      <div v-if="activeTab === 'quota'" class="lq-panel" role="tabpanel">
        <div class="lq-detail-head">
          <span class="lq-detail-title">
            <Zap :size="13" :stroke-width="2.1" aria-hidden="true" />
            本月配额
          </span>
          <span class="lq-detail-num">{{ variant === 'unlimited' ? '∞' : used }}<i>{{ variant === 'unlimited' ? ' 无限生成' : ` / ${limit} 次` }}</i></span>
          <span v-if="variant !== 'unlimited'" class="lq-detail-pct">{{ percent }}%</span>
        </div>
        <div
          v-if="variant !== 'unlimited'"
          class="lq-detail-track"
          role="progressbar"
          :aria-valuenow="used"
          aria-valuemin="0"
          :aria-valuemax="limit"
          aria-label="配额用量"
        >
          <span class="lq-detail-fill" :class="{ 'is-exceeded': variant === 'exceeded' }" :style="{ width: percent + '%' }"></span>
        </div>
        <p class="lq-detail-rule">
          <template v-if="variant === 'exceeded'">本月 {{ limit }} 次已用完，下月 1 日重置；升级档位立即获得更多次数。</template>
          <template v-else-if="variant === 'unlimited'">当前档位不限次数，放心生成。</template>
          <template v-else>还差 {{ remaining }} 次到本月上限，下月 1 日重置。</template>
          <span class="lq-detail-threshold">当前档位 {{ tierLabel }} · {{ variant === 'unlimited' ? '不限次数' : `${limit} 次/月` }}</span>
          <span v-if="genTaskText" class="lq-detail-gen">{{ genTaskText }}</span>
        </p>
        <div class="lq-detail-actions">
          <button
            v-if="nextTierLabel"
            type="button"
            class="lq-btn lq-btn-primary"
            @click="goSubscription?.()"
          >
            <Crown :size="13" :stroke-width="2.1" aria-hidden="true" />
            <span>升级 {{ nextTierLabel }}{{ props.quota?.nextTierQuota && props.quota.nextTierQuota > 0 ? ` · ${props.quota.nextTierQuota} 次/月` : '' }}</span>
          </button>
          <button v-else type="button" class="lq-btn" @click="goSubscription?.()">
            <Crown :size="13" :stroke-width="2.1" aria-hidden="true" />
            <span>会员方案</span>
          </button>
        </div>
      </div>

      <!-- 模型面板（BOHAI 模式；任务生成的模型仍由服务端 lab_ai_model_configs 路由） -->
      <div v-else-if="activeTab === 'model'" class="lq-panel" role="tabpanel">
        <div class="lq-models-head">
          <span class="lq-detail-title">
            <Cpu :size="13" :stroke-width="2.1" aria-hidden="true" />
            对话模型
          </span>
          <span class="lq-models-current">{{ currentModelText }}</span>
        </div>
        <div v-if="modelLoading" class="lq-models-loading">正在读取 BOHAI 模型…</div>
        <div v-else-if="!modelList.length" class="lq-models-loading">模型列表暂不可用 · 使用默认模型</div>
        <div v-else class="lq-model-list" role="radiogroup" aria-label="选择对话模型">
          <button
            v-for="m in modelList"
            :key="m.id"
            type="button"
            class="lq-model-item"
            :class="{ 'is-active': m.id === selectedModelId, 'is-locked': m.locked }"
            role="radio"
            :aria-checked="m.id === selectedModelId"
            :title="m.locked ? `${m.tierTag || '更高档位'}可用` : m.tagline || m.name"
            @click="pickModel(m)"
          >
            <span class="lq-model-main">
              <span class="lq-model-name">
                {{ m.name }}
                <em v-if="m.mult" class="lq-model-mult">{{ m.mult }}×</em>
                <em v-if="m.locked && m.tierTag" class="lq-model-tier is-locked">{{ m.tierTag }}</em>
              </span>
              <span v-if="m.tagline" class="lq-model-tagline">{{ m.tagline }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- 样式面板（原选择弹窗迁移；影响 PPT/Word 生成与文档排版风格） -->
      <div v-else-if="activeTab === 'style'" class="lq-panel" role="tabpanel">
        <div class="lq-models-head">
          <span class="lq-detail-title">
            <Paintbrush :size="13" :stroke-width="2.1" aria-hidden="true" />
            样式集
          </span>
          <span class="lq-models-current">{{ currentPresetText }}</span>
        </div>
        <div class="lq-model-list lq-preset-list" role="radiogroup" aria-label="选择样式集">
          <button
            v-for="p in presetList"
            :key="p.id"
            type="button"
            class="lq-model-item lq-preset-item"
            :class="{ 'is-active': p.id === presetSelectedId }"
            role="radio"
            :aria-checked="p.id === presetSelectedId"
            @click="pickPreset(p)"
          >
            <span class="lq-model-name">{{ p.name }}</span>
          </button>
        </div>
      </div>

      <!-- 思考面板（原顶栏 popover 迁移，五档点选） -->
      <div v-else class="lq-panel" role="tabpanel">
        <div class="lq-models-head">
          <span class="lq-detail-title">思考预算</span>
          <span class="lq-models-current">{{ activeThinking }}</span>
        </div>
        <div class="lq-model-list lq-preset-list" role="radiogroup" aria-label="思考预算档位">
          <button
            v-for="level in THINKING_LEVELS"
            :key="level.label"
            type="button"
            class="lq-model-item lq-preset-item"
            :class="{ 'is-active': level.label === activeThinking }"
            role="radio"
            :aria-checked="level.label === activeThinking"
            @click="setThinking(level)"
          >
            <span class="lq-model-name">{{ level.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 卡体透明：液态玻璃来自 surface 本体（has-custom-card 档）；
   rest 高度与 PityIslandCard 同档，跨页切换岛高不跳变 */
.lab-quota-island {
  display: flex;
  flex-direction: column;
  padding: 0 10px 4px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif;
}

/* ---- 紧凑行 ---- */
.lq-compact {
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

.lq-compact:hover { background: rgba(15, 23, 42, 0.045); }
.lq-compact:active { background: rgba(15, 23, 42, 0.07); }
.lq-compact:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.lq-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #aeaeb2;
}

.is-normal .lq-dot { background: #1d1d1f; }
.is-unlimited .lq-dot { background: #34c759; }
.is-exceeded .lq-dot { background: #ff3b30; }
.is-gen .lq-dot { background: #0071e3; animation: lq-dot-pulse 1.2s ease-in-out infinite; }

@keyframes lq-dot-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.lq-label {
  flex: 0 0 auto;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

/* 迷你进度条：生成中=生成进度（蓝），空闲=配额用量 */
.lq-track {
  flex: 1 1 60px;
  min-width: 48px;
  height: 5px;
  border-radius: 99px;
  background: rgba(29, 29, 31, 0.1);
  overflow: hidden;
}

.lq-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1d1d1f 0%, #2c2c2e 100%);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-gen .lq-track { background: rgba(0, 113, 227, 0.12); }
.is-gen .lq-fill { background: linear-gradient(90deg, #0071e3 0%, #2997ff 100%); }

/* 不确定进度：扫动动画（普通聊天/文档排版无百分比时） */
.lq-fill.is-indeterminate {
  width: 36%;
  background: linear-gradient(90deg, rgba(0, 113, 227, 0.25) 0%, #0071e3 50%, rgba(0, 113, 227, 0.25) 100%);
  animation: lq-indeterminate 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes lq-indeterminate {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(320%); }
}

.is-exceeded .lq-track { background: rgba(255, 59, 48, 0.12); }
.is-exceeded .lq-fill { background: linear-gradient(90deg, #ff3b30 0%, #ff6961 100%); }

.lq-count {
  flex: 0 0 auto;
  min-width: 20px;
  color: #3a3a3c;
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}

.lq-sub {
  flex: 0 0 auto;
  max-width: 118px;
  overflow: hidden;
  color: #8e8e93;
  font-size: 11.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-gen .lq-sub { color: #0071e3; }
.is-exceeded .lq-sub { color: #d0342b; }

.lq-chevron {
  flex: 0 0 auto;
  color: #8e8e93;
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-expanded .lq-chevron { transform: rotate(180deg); }

/* ---- 展开区 ---- */
.lq-detail {
  display: grid;
  gap: 8px;
  padding: 3px 8px 9px;
  animation: lq-expand 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* 分区 tab：内部点击出现对应列表 */
.lq-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(29, 29, 31, 0.06);
}

.lq-tab {
  flex: 1;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #6e6e73;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
  -webkit-tap-highlight-color: transparent;
}

.lq-tab:hover { color: #1d1d1f; }
.lq-tab.is-active {
  background: #fff;
  color: #1d1d1f;
  box-shadow: 0 1px 4px rgba(29, 41, 56, 0.14);
}
.lq-tab:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.lq-panel {
  display: grid;
  gap: 8px;
  animation: lq-panel-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes lq-panel-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes lq-expand {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.lq-detail-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.lq-detail-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #6e6e73;
  font-size: 12px;
  font-weight: 650;
}

.lq-detail-num {
  margin-left: auto;
  color: #1d1d1f;
  font-size: 17px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.lq-detail-num i {
  color: #8e8e93;
  font-size: 11.5px;
  font-style: normal;
  font-weight: 600;
}

.lq-detail-pct {
  flex: 0 0 auto;
  min-width: 34px;
  color: #6e6e73;
  font-size: 11.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.lq-detail-track {
  height: 6px;
  border-radius: 99px;
  background: rgba(29, 29, 31, 0.1);
  overflow: hidden;
}

.lq-detail-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1d1d1f 0%, #2c2c2e 100%);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.lq-detail-fill.is-exceeded { background: linear-gradient(90deg, #ff3b30 0%, #ff6961 100%); }

.lq-detail-rule {
  margin: 0;
  color: #6e6e73;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.55;
}

.lq-detail-threshold {
  display: block;
  margin-top: 1px;
  color: #98989d;
  font-size: 11px;
}

.lq-detail-gen {
  display: block;
  margin-top: 2px;
  color: #0071e3;
  font-size: 11px;
}

/* ---- 对话模型选择 ---- */
.lq-models {
  display: grid;
  gap: 6px;
}

.lq-models-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.lq-models-current {
  overflow: hidden;
  color: #1d1d1f;
  font-size: 11.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lq-models-loading {
  color: #98989d;
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 0 1px;
}

.lq-model-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.lq-preset-list { grid-template-columns: 1fr 1fr 1fr; }

.lq-model-item {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
  border: 0.5px solid rgba(29, 29, 31, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
  -webkit-tap-highlight-color: transparent;
}

.lq-model-item:hover { background: rgba(15, 23, 42, 0.045); }
.lq-model-item:active { transform: scale(0.985); }
.lq-model-item:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.lq-model-item.is-active {
  border-color: rgba(0, 113, 227, 0.55);
  background: rgba(0, 113, 227, 0.08);
}

.lq-model-item.is-locked { cursor: not-allowed; opacity: 0.55; }
.lq-model-item.is-locked:hover { background: rgba(255, 255, 255, 0.5); }

.lq-model-main {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 0;
}

.lq-model-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  color: #1d1d1f;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.lq-model-name > span,
.lq-model-name { text-overflow: ellipsis; }

/* 配额倍率（相对基础配额的消耗倍数） */
.lq-model-mult {
  flex: 0 0 auto;
  color: #0071e3;
  font-size: 10px;
  font-style: normal;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.lq-model-tagline {
  overflow: hidden;
  color: #8e8e93;
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lq-model-tier {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 99px;
  background: rgba(255, 251, 235, 0.9);
  color: #b7791f;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}

.lq-model-tier.is-locked {
  background: rgba(255, 251, 235, 0.9);
  color: #b7791f;
}

.lq-preset-item { justify-content: center; }

.lq-detail-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.lq-btn {
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

.lq-btn:hover { background: rgba(15, 23, 42, 0.05); }
.lq-btn:active { transform: scale(0.97); }
.lq-btn:focus-visible { outline: 2px solid #94a3b8; outline-offset: 1px; }

.lq-btn-primary {
  border-color: transparent;
  background: #0071e3;
  color: #fff;
}

.lq-btn-primary:hover { background: #0062c4; }

/* ---------- 暗色（整条 :global 前缀，逐条独立写） ---------- */
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-compact:hover) { background: rgba(255, 255, 255, 0.06); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-compact:active) { background: rgba(255, 255, 255, 0.1); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-label) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-normal .lq-dot) { background: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-track) { background: rgba(255, 255, 255, 0.14); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-fill) { background: linear-gradient(90deg, #f5f5f7 0%, #e5e5ea 100%); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-gen .lq-dot) { background: #2997ff; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-gen .lq-track) { background: rgba(41, 151, 255, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-gen .lq-fill) { background: linear-gradient(90deg, #2997ff 0%, #64b5ff 100%); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-fill.is-indeterminate) { background: linear-gradient(90deg, rgba(41, 151, 255, 0.25) 0%, #2997ff 50%, rgba(41, 151, 255, 0.25) 100%); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-exceeded .lq-dot) { background: #ff453a; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-exceeded .lq-track) { background: rgba(255, 69, 58, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-exceeded .lq-fill) { background: linear-gradient(90deg, #ff453a 0%, #ff6961 100%); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-count) { color: #d1d1d6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-sub) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-gen .lq-sub) { color: #64b5ff; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island.is-exceeded .lq-sub) { color: #ff6961; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-chevron) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-title) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-num) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-num i) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-pct) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-track) { background: rgba(255, 255, 255, 0.14); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-fill) { background: linear-gradient(90deg, #f5f5f7 0%, #e5e5ea 100%); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-fill.is-exceeded) { background: linear-gradient(90deg, #ff453a 0%, #ff6961 100%); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-rule) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-threshold) { color: rgba(161, 161, 166, 0.8); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-detail-gen) { color: #64b5ff; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-btn) { border-color: rgba(255, 255, 255, 0.16); color: #d1d1d6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-btn:hover) { background: rgba(255, 255, 255, 0.08); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-btn-primary) { background: #0071e3; color: #fff; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-btn-primary:hover) { background: #0062c4; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-models-current) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-models-loading) { color: rgba(161, 161, 166, 0.8); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-item) { border-color: rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.05); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-item:hover) { background: rgba(255, 255, 255, 0.09); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-item.is-active) { border-color: rgba(41, 151, 255, 0.6); background: rgba(41, 151, 255, 0.12); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-item.is-locked:hover) { background: rgba(255, 255, 255, 0.05); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-radio) { border-color: rgba(255, 255, 255, 0.32); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-item.is-active .lq-model-radio) { border-color: #2997ff; box-shadow: inset 0 0 0 3px #1c1e26, inset 0 0 0 8px #2997ff; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-name) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-tagline) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-tier) { background: rgba(255, 255, 255, 0.08); color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-model-tier.is-locked) { background: rgba(224, 162, 58, 0.16); color: #f0c040; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-tabs) { background: rgba(255, 255, 255, 0.08); }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-tab) { color: #a1a1a6; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-tab:hover) { color: #f5f5f7; }
:global(#unified-nav-container[data-theme="dark"] .lab-quota-island .lq-tab.is-active) { background: rgba(255, 255, 255, 0.14); color: #f5f5f7; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3); }

/* ---------- 横竖屏适配 ---------- */
/* 中窄宽度（竖屏窗口/分屏）：收紧紧凑行与列表密度 */
@media (max-width: 768px) {
  .lq-compact { height: 44px; gap: 7px; padding: 0 6px; }
  .lq-sub { max-width: 96px; }
  .lq-model-list { gap: 3px; }
  .lq-preset-list { grid-template-columns: 1fr 1fr 1fr; }
  .lq-model-item { padding: 5px 7px; }
  .lq-detail { padding: 2px 6px 8px; }
}

@media (max-width: 480px) {
  .lq-sub { display: none; }
  .lq-model-list, .lq-preset-list { grid-template-columns: 1fr 1fr; }
  .lq-model-name { font-size: 11.5px; }
  .lq-detail-rule { font-size: 11.5px; }
  .lq-detail-threshold { font-size: 10.5px; }
}

@media (prefers-reduced-motion: reduce) {
  .lq-compact,
  .lq-fill,
  .lq-detail-fill,
  .lq-chevron { transition: none; }
  .lq-fill.is-indeterminate { animation: none; width: 50%; }
  .lq-detail { animation: none; }
  .is-gen .lq-dot { animation: none; }
}
</style>

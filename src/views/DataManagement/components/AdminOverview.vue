<template>
  <!-- Compact overview header (topbar already shows the page title) -->
  <div v-if="activeFilterSummary" class="g-overview-filter-bar">
    <span class="g-eyebrow">当前筛选</span>
    <span class="g-overview-filter-text">{{ activeFilterSummary }}</span>
  </div>

  <!-- 1. 待办事项：全宽置顶，点击直达对应表 -->
  <section class="g-todo-band" aria-label="待办事项">
    <div class="g-todo-head">
      <div>
        <div class="g-eyebrow">待办事项</div>
        <strong>{{ pendingTodoCount > 0 ? `${pendingTodoCount} 项需要处理` : '全部处理完毕' }}</strong>
      </div>
      <span v-if="pendingTodoCount === 0" class="g-badge is-success">一切正常</span>
    </div>
    <div v-if="pendingTodos.length" class="g-todo-grid">
      <button
        v-for="item in pendingTodos"
        :key="item.id"
        type="button"
        :class="['g-todo-card', `is-${item.tone}`]"
        @click="$emit('select-tab', item.tab)"
      >
        <strong>{{ item.count }}</strong>
        <span class="g-todo-text"><b>{{ item.title }}</b><small>{{ item.description }}</small></span>
        <span class="g-todo-go" aria-hidden="true">→</span>
      </button>
    </div>
    <div v-else class="g-todo-empty">无待办事项，站点运行良好</div>
    <details v-if="settledTodos.length" class="g-todo-settled">
      <summary>已处理完毕（{{ settledTodos.length }}）</summary>
      <div class="g-todo-settled-list">
        <button v-for="item in settledTodos" :key="item.id" type="button" @click="$emit('select-tab', item.tab)">
          {{ item.title }} · {{ item.count }}
        </button>
      </div>
    </details>
  </section>

  <!-- 2. 核心指标：可点击下钻 -->
  <div class="g-overview-stats">
    <DashboardStat
      v-for="card in liveStatusCards"
      :key="card.id"
      :eyebrow="card.label"
      :value="card.value"
      :detail="card.detail"
      :interactive="isStatClickable(card)"
      @click="onStatClick(card)"
    />
  </div>

  <!-- 3. 双栏：快捷操作 + 动态 -->
  <div class="g-overview-grid">
    <article class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-eyebrow">快捷操作</div>
          <strong>常用入口</strong>
        </div>
      </div>
      <div class="g-quick-grid">
        <button type="button" class="g-quick-cell" @click="goToShopConsole">
          <StoreIcon :size="18" />
          <span><strong>商城装修</strong><small>商品与展示</small></span>
        </button>
        <button type="button" class="g-quick-cell" @click="goToHeroConsole">
          <LayoutIcon :size="18" />
          <span><strong>首页装修</strong><small>英雄区发布</small></span>
        </button>
        <button type="button" class="g-quick-cell" @click="$emit('quick-create', 'lotteries')">
          <GiftIcon :size="18" />
          <span><strong>发起抽奖</strong><small>新建抽奖</small></span>
        </button>
        <button type="button" class="g-quick-cell" @click="$emit('select-tab', 'reportedPosts')">
          <FlagIcon :size="18" />
          <span><strong>审核举报</strong><small>{{ reportPendingCount }} 条待审</small></span>
        </button>
      </div>
    </article>

    <div class="g-overview-side">
      <article class="g-card">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">最近更新</div>
            <strong>动态</strong>
          </div>
          <div class="g-card-head-actions">
            <button class="g-icon-btn is-sm" type="button" @click="$emit('refresh-now')" :disabled="isRefreshing" title="刷新">
              <RefreshCw :size="14" :class="{ 'g-spin': isRefreshing }" />
            </button>
          </div>
        </div>
        <div v-if="recentActivityItems.length" class="g-list">
          <button
            v-for="item in recentActivityItems.slice(0, 5)"
            :key="item.id"
            type="button"
            class="g-list-item is-clickable"
            @click="$emit('select-tab', item.id)"
          >
            <span class="g-list-text">
              <strong>{{ item.title }}</strong>
              <small>{{ item.meta }}</small>
            </span>
            <span class="g-list-meta">{{ item.timestamp }}</span>
          </button>
        </div>
        <div v-else class="g-empty">暂无最近活动</div>
      </article>

      <article class="g-card g-health-strip">
        <div class="g-health-row">
          <span class="g-eyebrow">系统健康</span>
          <span :class="['g-badge', supabaseBadgeTone]">
            <span class="g-badge-dot" />
            {{ supabaseStatusBadge }} · {{ supabaseHealthScore }}
          </span>
          <span :class="['g-badge', cloudinaryBadgeTone]">
            <span class="g-badge-dot" />
            媒体{{ cloudinaryStatusBadge }}
          </span>
          <button class="g-icon-btn is-sm" type="button" @click="refreshCloudStatus" :disabled="cloudStatusLoading" title="刷新云状态">
            <RefreshCw :size="14" :class="{ 'g-spin': cloudStatusLoading }" />
          </button>
        </div>
      </article>
    </div>
  </div>

  <!-- 4. 云服务用量详情（折叠收纳，功能无损） -->
  <details class="g-card g-cloud-details">
    <summary class="g-cloud-summary">
      <Cloud :size="15" />
      <span>云服务用量详情</span>
      <span :class="['g-badge', supabaseBadgeTone]">{{ supabaseStatusBadge }}</span>
    </summary>

    <div class="g-grid-2col">
      <article :class="['g-card', `is-${supabaseTone}`]">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">云服务 · Supabase</div>
            <strong>数据库与存储用量</strong>
          </div>
          <div class="g-card-head-actions">
            <button class="g-icon-btn is-sm" type="button" @click="refreshCloudStatus" :disabled="supabaseLoading" title="刷新">
              <RefreshCw :size="14" :class="{ 'g-spin': supabaseLoading }" />
            </button>
            <span :class="['g-badge', supabaseBadgeTone]">
              <span class="g-badge-dot" />
              {{ supabaseStatusBadge }}
            </span>
          </div>
        </div>
        <div v-if="supabaseLoading" class="g-overview-skeleton">
          <LoaderCircle :size="18" class="g-spin" />
          <span>正在获取 Supabase 状态...</span>
        </div>
        <div v-else-if="supabaseError" class="g-overview-empty">
          <DashboardNotice tone="error">
            {{ supabaseError }}
          </DashboardNotice>
          <button class="g-btn g-btn-secondary g-btn-sm" type="button" @click="refreshCloudStatus">
            <RefreshCw :size="14" />
            重试
          </button>
        </div>
        <div v-else class="g-overview-cloud-body">
          <DashboardDonut
            :percent="supabaseDbPercent"
            :value="supabaseDbSize"
            :label="`数据库 ${supabaseDbPercent.toFixed(1)}%`"
            tone="primary"
            size="md"
            :legend="cloudLegend"
          />
          <div class="g-overview-metric">
            <div class="g-overview-metric-head">
              <span>存储已用</span>
              <span class="g-overview-metric-value">{{ supabaseStorageSize }} / {{ supabaseStorageLimit }}</span>
            </div>
            <DashboardProgress :value="supabaseStoragePercent" :min-visible-width="3" />
          </div>
          <div class="g-overview-mini-grid">
            <div class="g-overview-mini">
              <span>用户数</span>
              <strong>{{ supabaseUserCount }}</strong>
            </div>
            <div class="g-overview-mini">
              <span>帖子数</span>
              <strong>{{ supabasePostCount }}</strong>
            </div>
            <div class="g-overview-mini">
              <span>活跃连接</span>
              <strong>{{ supabaseConnections }}</strong>
            </div>
          </div>
          <div class="g-overview-health">
            <span>健康评分</span>
            <strong :class="supabaseHealthClass">{{ supabaseHealthScore }}</strong>
          </div>
        </div>
        <DashboardNotice v-if="supabaseDeploymentRequired" tone="warn">
          需部署 admin_supabase_project_status RPC
        </DashboardNotice>
      </article>

      <article :class="['g-card', `is-${cloudinaryTone}`]">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">云服务 · Cloudinary</div>
            <strong>媒体资源用量</strong>
          </div>
          <div class="g-card-head-actions">
            <button class="g-icon-btn is-sm" type="button" @click="refreshCloudStatus" :disabled="cloudinaryLoading" title="刷新">
              <RefreshCw :size="14" :class="{ 'g-spin': cloudinaryLoading }" />
            </button>
            <span :class="['g-badge', cloudinaryBadgeTone]">
              <span class="g-badge-dot" />
              {{ cloudinaryStatusBadge }}
            </span>
          </div>
        </div>
        <div v-if="cloudinaryLoading" class="g-overview-skeleton">
          <LoaderCircle :size="18" class="g-spin" />
          <span>正在获取 Cloudinary 状态...</span>
        </div>
        <div v-else-if="cloudinaryError" class="g-overview-empty">
          <DashboardNotice tone="error">
            {{ cloudinaryError }}
          </DashboardNotice>
          <button class="g-btn g-btn-secondary g-btn-sm" type="button" @click="refreshCloudStatus">
            <RefreshCw :size="14" />
            重试
          </button>
        </div>
        <div v-else class="g-overview-cloud-body">
          <div class="g-overview-metric">
            <div class="g-overview-metric-head">
              <span>Cloud Name</span>
              <span class="g-overview-metric-value is-mono">{{ cloudinaryCloudName }}</span>
            </div>
          </div>
          <div class="g-overview-metric">
            <div class="g-overview-metric-head">
              <span>带宽已用</span>
              <span class="g-overview-metric-value">{{ cloudinaryBandwidth || '-' }} / {{ cloudinaryBandwidthLimit }}</span>
            </div>
            <DashboardProgress
              :value="cloudinaryBandwidthPercent"
              :unlimited="cloudinaryBandwidthUnlimited"
              :min-visible-width="3"
            />
          </div>
          <div class="g-overview-metric">
            <div class="g-overview-metric-head">
              <span>存储已用</span>
              <span class="g-overview-metric-value">{{ cloudinaryStorage || '-' }} / {{ cloudinaryStorageLimit }}</span>
            </div>
            <DashboardProgress
              :value="cloudinaryStoragePercent"
              :unlimited="cloudinaryStorageUnlimited"
              :min-visible-width="3"
            />
          </div>
          <div class="g-overview-metric">
            <div class="g-overview-metric-head">
              <span>Credits 已用</span>
              <span class="g-overview-metric-value">{{ cloudinaryCredits }} / {{ cloudinaryCreditsLimit }}</span>
            </div>
            <DashboardProgress
              :value="cloudinaryCreditsPercent"
              :unlimited="cloudinaryCreditsUnlimited"
              :min-visible-width="3"
            />
          </div>
        </div>
        <DashboardNotice v-if="cloudinaryDeploymentRequired" tone="warn">
          需部署 cloudinary-usage Edge Function
        </DashboardNotice>
      </article>
    </div>
  </details>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Cloud, Flag as FlagIcon, Gift as GiftIcon, LoaderCircle, RefreshCw, Store as StoreIcon, Layout as LayoutIcon } from 'lucide-vue-next';
import {
  getSupabaseProjectStatus,
  getCloudinaryUsageStatus,
  formatBytes
} from '../../../utils/cloud-service-status.js';
import DashboardStat from './shared/DashboardStat.vue';
import DashboardProgress from './shared/DashboardProgress.vue';
import DashboardNotice from './shared/DashboardNotice.vue';
import DashboardDonut from './shared/DashboardDonut.vue';

const props = defineProps({
  activeDiagnostics: { type: Array, required: true },
  activeFilterSummary: { type: String, required: true },
  currentTab: { type: String, required: true },
  currentTabLabel: { type: String, required: true },
  isLoading: { type: Boolean, default: false },
  isRefreshing: { type: Boolean, default: false },
  liveStatusCards: { type: Array, required: true },
  recentActivityItems: { type: Array, required: true },
  secondsUntilRefresh: { type: Number, default: 30 },
  tableSummaryCards: { type: Array, required: true },
  totalRecordCount: { type: Number, required: true }
});

const router = useRouter();

const goToShopConsole = () => {
  router.push('/admin/shop-console').catch(() => {});
};

const goToHeroConsole = () => {
  router.push('/admin/hero-console').catch(() => {});
};

// 指挥舱：待办分流（有数置顶 / 归零折叠）与 KPI 下钻映射
const pendingTodos = computed(() => props.activeDiagnostics.filter((d) => Number(d.count) > 0));
const settledTodos = computed(() => props.activeDiagnostics.filter((d) => Number(d.count) <= 0));
const pendingTodoCount = computed(() => pendingTodos.value.length);
const reportPendingCount = computed(
  () => props.activeDiagnostics.find((d) => d.id === 'reported-posts')?.count || 0
);

const emit = defineEmits(['refresh-now', 'select-tab', 'quick-create']);
const STAT_TAB_TARGET = { pending: 'reportedPosts' };
const isStatClickable = (card) =>
  card.id === 'pending' || card.id === 'uptime' || card.id === 'refresh';
const onStatClick = (card) => {
  if (STAT_TAB_TARGET[card.id]) emit('select-tab', STAT_TAB_TARGET[card.id]);
  else if (card.id === 'uptime' || card.id === 'refresh') emit('refresh-now');
};

// Cloud status
const cloudStatusLoading = ref(false);
const supabaseStatus = ref(null);
const cloudinaryStatus = ref(null);

const supabaseData = computed(() => supabaseStatus.value?.data || {});
const supabaseError = computed(() => supabaseStatus.value?.error || null);
const supabaseLoading = computed(() => cloudStatusLoading.value || (!supabaseStatus.value && !supabaseError.value));

const supabaseDbSize = computed(() => formatBytes(supabaseData.value.database_size || supabaseData.value.databaseSize || 0));
const supabaseDbLimit = computed(() => formatBytes(supabaseData.value.database_size_limit || supabaseData.value.databaseSizeLimit || 500 * 1024 * 1024));
const supabaseDbPercent = computed(() => {
  const percent = supabaseData.value.database_percent || supabaseData.value.databasePercent
    || (supabaseData.value.database_size && supabaseData.value.database_size_limit
      ? (supabaseData.value.database_size / supabaseData.value.database_size_limit) * 100
      : 0);
  return Math.min(100, Math.max(0, percent));
});
const supabaseStorageSize = computed(() => formatBytes(supabaseData.value.storage_size || supabaseData.value.storageSize || 0));
const supabaseStorageLimit = computed(() => formatBytes(supabaseData.value.storage_size_limit || supabaseData.value.storageSizeLimit || 1024 * 1024 * 1024));
const supabaseStoragePercent = computed(() => Math.min(100, Math.max(0, supabaseData.value.storage_percent || supabaseData.value.storagePercent || 0)));
const supabaseUserCount = computed(() => supabaseData.value.user_count || supabaseData.value.userCount || supabaseData.value.estimatedUsers || 0);
const supabasePostCount = computed(() => supabaseData.value.post_count || supabaseData.value.postCount || supabaseData.value.estimatedPosts || 0);
const supabaseConnections = computed(() => supabaseData.value.active_connections || supabaseData.value.activeConnections || 0);
const supabaseHealthScore = computed(() => supabaseData.value.health_score || supabaseData.value.healthScore || 100);
const supabaseDeploymentRequired = computed(() => Boolean(supabaseData.value.deploymentRequired));

const supabaseTone = computed(() => {
  if (supabaseError.value) return 'danger';
  if (supabaseDeploymentRequired.value) return 'warn';
  if (supabaseHealthScore.value >= 90) return 'success';
  if (supabaseHealthScore.value >= 70) return 'warn';
  return 'danger';
});

const supabaseBadgeTone = computed(() => {
  if (supabaseLoading.value) return 'is-muted';
  if (supabaseError.value) return 'is-danger';
  if (supabaseDeploymentRequired.value) return 'is-warning';
  if (supabaseHealthScore.value >= 90) return 'is-success';
  if (supabaseHealthScore.value >= 70) return 'is-warning';
  return 'is-danger';
});

const supabaseHealthClass = computed(() => supabaseHealthScore.value >= 90 ? 'is-good' : supabaseHealthScore.value >= 70 ? 'is-warning' : 'is-danger');

const supabaseStatusBadge = computed(() => {
  if (supabaseLoading.value) return '加载中';
  if (supabaseError.value) return '获取失败';
  if (supabaseDeploymentRequired.value) return '待部署';
  if (supabaseHealthScore.value >= 90) return '健康';
  if (supabaseHealthScore.value >= 70) return '警告';
  return '危险';
});

// Cloudinary
const cloudinaryData = computed(() => cloudinaryStatus.value?.data || {});
const cloudinaryError = computed(() => cloudinaryStatus.value?.error || null);
const cloudinaryLoading = computed(() => cloudStatusLoading.value || (!cloudinaryStatus.value && !cloudinaryError.value));

const cloudinaryCloudName = computed(() => cloudinaryData.value.cloudName || cloudinaryData.value.cloud_name || 'dkqae7j1m');
const cloudinaryBandwidth = computed(() => {
  const bytes = cloudinaryData.value.bandwidth;
  return bytes ? formatBytes(bytes) : null;
});
const cloudinaryBandwidthPercent = computed(() => cloudinaryData.value.bandwidthPercent || cloudinaryData.value.bandwidth_percent || 0);
const cloudinaryBandwidthLimit = computed(() => {
  const bytes = cloudinaryData.value.bandwidthLimit || cloudinaryData.value.bandwidth_limit;
  if (bytes === -1) return '无限制';
  if (!bytes) return '-';
  return formatBytes(bytes);
});
const cloudinaryBandwidthUnlimited = computed(() => Boolean(cloudinaryData.value.bandwidthUnlimited));
const cloudinaryStorage = computed(() => {
  const bytes = cloudinaryData.value.storage;
  return bytes ? formatBytes(bytes) : null;
});
const cloudinaryStoragePercent = computed(() => cloudinaryData.value.storagePercent || cloudinaryData.value.storage_percent || 0);
const cloudinaryStorageLimit = computed(() => {
  const bytes = cloudinaryData.value.storageLimit || cloudinaryData.value.storage_limit;
  if (bytes === -1) return '无限制';
  if (!bytes) return '-';
  return formatBytes(bytes);
});
const cloudinaryStorageUnlimited = computed(() => Boolean(cloudinaryData.value.storageUnlimited));
const cloudinaryCredits = computed(() => cloudinaryData.value.credits ?? 0);
const cloudinaryCreditsLimit = computed(() => {
  const value = cloudinaryData.value.creditsLimit || cloudinaryData.value.credits_limit || 0;
  if (value === -1) return '无限制';
  return value;
});
const cloudinaryCreditsUnlimited = computed(() => Boolean(cloudinaryData.value.creditsUnlimited));
const cloudinaryCreditsPercent = computed(() => cloudinaryData.value.creditsPercent || cloudinaryData.value.credits_percent || 0);
const cloudinaryDeploymentRequired = computed(() => Boolean(cloudinaryData.value.deploymentRequired));

const cloudinaryTone = computed(() => {
  if (cloudinaryError.value) return 'danger';
  if (cloudinaryDeploymentRequired.value) return 'warn';
  return 'success';
});

const cloudinaryBadgeTone = computed(() => {
  if (cloudinaryLoading.value) return 'is-muted';
  if (cloudinaryError.value) return 'is-danger';
  if (cloudinaryDeploymentRequired.value) return 'is-warning';
  return 'is-success';
});

const cloudinaryStatusBadge = computed(() => {
  if (cloudinaryLoading.value) return '加载中';
  if (cloudinaryError.value) return '获取失败';
  if (cloudinaryDeploymentRequired.value) return '待部署';
  return '已配置';
});

// Legend for Supabase donut
const cloudLegend = computed(() => ([
  { label: '数据库', value: supabaseDbSize.value, color: 'var(--primary)' },
  { label: '存储', value: supabaseStorageSize.value, color: 'var(--chart-4)' },
  { label: '健康', value: `${supabaseHealthScore.value}/100`, color: supabaseHealthClass.value === 'is-good' ? 'var(--chart-5)' : 'var(--chart-3)' }
]));

const refreshCloudStatus = async () => {
  if (cloudStatusLoading.value) return;
  cloudStatusLoading.value = true;
  try {
    const [supabaseResult, cloudinaryResult] = await Promise.all([
      getSupabaseProjectStatus(),
      getCloudinaryUsageStatus()
    ]);
    supabaseStatus.value = supabaseResult;
    cloudinaryStatus.value = cloudinaryResult;
  } catch (err) {
    // 捕获异常并写入 error 字段，避免 supabaseLoading 计算属性永久为 true
    supabaseStatus.value = { data: null, error: err?.message || '加载失败' };
    cloudinaryStatus.value = { data: null, error: err?.message || '加载失败' };
  } finally {
    cloudStatusLoading.value = false;
  }
};

onMounted(() => {
  refreshCloudStatus().catch(() => {});
});

watch(() => props.isRefreshing, (newVal, oldVal) => {
  if (oldVal && !newVal) refreshCloudStatus();
});
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/google-components.css';

/* ---------- Filter bar (top of overview) ---------- */
.g-overview-filter-bar {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--primary) 5%, var(--card));
  font-size: 0.82rem;
  color: var(--muted-foreground);
  margin-bottom: calc(var(--spacing) * 4);
}
.g-overview-filter-text { color: var(--foreground); font-weight: 600; }

/* ---------- Stats row ---------- */
.g-overview-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: calc(var(--spacing) * 4);
  margin-top: calc(var(--spacing) * 4);
}

/* ---------- Quick tools ---------- */
.g-quick-tool {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.16s ease;
}
.g-quick-tool:hover { background: var(--accent); border-color: var(--ring); }
.g-quick-tool:active { transform: scale(0.997); }
.g-quick-tool:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.g-quick-tool-icon { color: var(--primary); flex: 0 0 18px; }
.g-quick-tool-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
.g-quick-tool-copy strong { font-size: 0.86rem; color: var(--foreground); }
.g-quick-tool-copy small { font-size: 0.74rem; color: var(--muted-foreground); }
.g-quick-tool-arrow { color: var(--muted-foreground); font-size: 1.1rem; flex: 0 0 auto; }

/* ---------- Diagnostic rows ---------- */
.g-diagnostic-row {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.16s ease;
}
.g-diagnostic-row:hover { background: var(--accent); border-color: var(--ring); }
.g-diagnostic-row:active { transform: scale(0.997); }
.g-diagnostic-row:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.g-diagnostic-row .g-diagnostic-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted-foreground);
  flex: 0 0 8px;
}
.g-diagnostic-row.is-success .g-diagnostic-dot { background: var(--chart-5); }
.g-diagnostic-row.is-warn .g-diagnostic-dot { background: var(--chart-3); }
.g-diagnostic-row.is-danger .g-diagnostic-dot { background: var(--chart-2); }
.g-diagnostic-row.is-info .g-diagnostic-dot { background: var(--primary); }
.g-diagnostic-row .g-diagnostic-text { display: grid; gap: 2px; min-width: 0; flex: 1; }
.g-diagnostic-row .g-diagnostic-text strong { font-size: 0.86rem; color: var(--foreground); }
.g-diagnostic-row .g-diagnostic-text small { font-size: 0.74rem; color: var(--muted-foreground); }
.g-diagnostic-row .g-diagnostic-count {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--foreground);
  font-size: 0.74rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ---------- Skeleton (loading) ---------- */
.g-overview-skeleton {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 6) 0;
  color: var(--muted-foreground);
  font-size: 0.84rem;
  justify-content: center;
}

/* ---------- Error / empty block ---------- */
.g-overview-empty {
  display: grid;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) 0;
}

/* ---------- Cloud service body ---------- */
.g-overview-cloud-body {
  display: grid;
  gap: calc(var(--spacing) * 4);
  padding: calc(var(--spacing) * 2) 0;
}
.g-overview-metric {
  display: grid;
  gap: calc(var(--spacing) * 2);
}
.g-overview-metric-head {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  font-size: 0.8rem;
}
.g-overview-metric-head > span:first-child { color: var(--muted-foreground); }
.g-overview-metric-value {
  color: var(--foreground);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.g-overview-metric-value.is-mono { font-family: var(--font-mono); font-size: 0.78rem; }

.g-overview-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--spacing) * 2);
  margin-top: calc(var(--spacing) * 1);
}
.g-overview-mini {
  padding: calc(var(--spacing) * 2.5);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  display: grid;
  gap: 2px;
}
.g-overview-mini span { font-size: 0.72rem; color: var(--muted-foreground); }
.g-overview-mini strong { font-size: 0.95rem; color: var(--foreground); font-variant-numeric: tabular-nums; }

.g-overview-health {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: calc(var(--spacing) * 2);
  border-top: 1px solid var(--border);
  font-size: 0.84rem;
  color: var(--muted-foreground);
}
.g-overview-health strong { font-size: 1.05rem; color: var(--foreground); }
.g-overview-health strong.is-success { color: var(--chart-5); }
.g-overview-health strong.is-warn { color: var(--chart-3); }
.g-overview-health strong.is-danger { color: var(--chart-2); }

/* ---------- 2-col grid for cloud services ---------- */
.g-grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--spacing) * 4);
}

/* ---------- Card head actions (refresh button + badge row) ---------- */
.g-card-head-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
}

/* ---------- List meta (right-aligned timestamp) ---------- */
.g-list-meta {
  font-size: 0.74rem;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ---------- 指挥舱：待办事项带 ---------- */
.g-todo-band {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  padding: calc(var(--spacing) * 4);
  margin-top: calc(var(--spacing) * 4);
  display: grid;
  gap: calc(var(--spacing) * 3);
}
.g-todo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
}
.g-todo-head > div { display: grid; gap: 2px; }
.g-todo-head strong { font-size: 1rem; color: var(--foreground); }
.g-todo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: calc(var(--spacing) * 3);
}
.g-todo-card {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: var(--radius);
  background: var(--background);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.16s ease;
}
.g-todo-card:hover { background: var(--accent); }
.g-todo-card:active { transform: scale(0.99); }
.g-todo-card > strong {
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
  min-width: 2ch;
  text-align: center;
}
.g-todo-card.is-warning { border-left-color: var(--chart-3); }
.g-todo-card.is-warning > strong { color: var(--chart-3); }
.g-todo-card.is-danger { border-left-color: var(--chart-2); }
.g-todo-card.is-danger > strong { color: var(--chart-2); }
.g-todo-card.is-success { border-left-color: var(--chart-5); }
.g-todo-text { display: grid; gap: 2px; flex: 1; min-width: 0; }
.g-todo-text b { font-size: 0.86rem; color: var(--foreground); }
.g-todo-text small { font-size: 0.74rem; color: var(--muted-foreground); }
.g-todo-go { color: var(--muted-foreground); font-size: 1.1rem; }
.g-todo-empty {
  padding: calc(var(--spacing) * 4);
  text-align: center;
  color: var(--chart-5);
  font-weight: 600;
  font-size: 0.9rem;
  background: color-mix(in srgb, var(--chart-5) 8%, transparent);
  border-radius: var(--radius);
}
.g-todo-settled { font-size: 0.78rem; color: var(--muted-foreground); }
.g-todo-settled summary { cursor: pointer; }
.g-todo-settled-list {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
  margin-top: calc(var(--spacing) * 2);
}
.g-todo-settled-list button {
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--muted-foreground);
  border-radius: 999px;
  padding: 4px 12px;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}
.g-todo-settled-list button:hover { color: var(--foreground); border-color: var(--ring); }

/* ---------- 指挥舱：双栏 ---------- */
.g-overview-grid {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: calc(var(--spacing) * 4);
  margin-top: calc(var(--spacing) * 4);
}
.g-overview-side { display: grid; gap: calc(var(--spacing) * 4); align-content: start; }
.g-quick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--spacing) * 3);
}
.g-quick-cell {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--primary);
  transition: border-color 0.2s ease, background 0.2s ease;
}
.g-quick-cell:hover { background: var(--accent); border-color: var(--ring); }
.g-quick-cell > span { display: grid; gap: 2px; min-width: 0; }
.g-quick-cell strong { font-size: 0.86rem; color: var(--foreground); }
.g-quick-cell small { font-size: 0.72rem; color: var(--muted-foreground); }
.g-health-strip { padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4); }
.g-health-row {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex-wrap: wrap;
}
.g-health-row .g-eyebrow { margin-right: auto; }
.g-list-item.is-clickable {
  width: 100%;
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--radius);
}
.g-list-item.is-clickable:hover { background: var(--accent); }

/* ---------- 云详情折叠 ---------- */
.g-cloud-details { margin-top: calc(var(--spacing) * 4); }
.g-cloud-summary {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--foreground);
  list-style: none;
}
.g-cloud-summary::-webkit-details-marker { display: none; }
.g-cloud-summary .g-badge { margin-left: auto; }
.g-cloud-details .g-grid-2col { padding: 0 calc(var(--spacing) * 4) calc(var(--spacing) * 4); }

/* ---------- Responsive ---------- */
@media (max-width: 1100px) {
  .g-grid-2col { grid-template-columns: 1fr; }
  .g-overview-mini-grid { grid-template-columns: 1fr 1fr; }
  .g-overview-grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .g-overview-mini-grid { grid-template-columns: 1fr; }
  .g-quick-grid { grid-template-columns: 1fr; }
}
</style>

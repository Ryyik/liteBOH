<template>
  <!-- Compact overview header (topbar already shows the page title) -->
  <div v-if="activeFilterSummary" class="g-overview-filter-bar">
    <span class="g-eyebrow">当前筛选</span>
    <span class="g-overview-filter-text">{{ activeFilterSummary }}</span>
  </div>

  <!-- Tabs (overview / cloud / activity) -->
  <DashboardTabs
    v-model="activeTab"
    :tabs="tabItems"
    aria-label="Overview sections"
  />

  <!-- Section: Overview (live status + recent) -->
  <div v-show="activeTab === 'overview'">
    <!-- Live status stats -->
    <div class="g-overview-stats">
      <DashboardStat
        v-for="card in liveStatusCards"
        :key="card.id"
        :eyebrow="card.label"
        :value="card.value"
        :detail="card.detail"
        interactive
      />
    </div>

    <!-- Quick tools -->
    <article class="g-card" style="margin-top: calc(var(--spacing) * 4);">
      <div class="g-card-head">
        <div>
          <div class="g-eyebrow">快捷工具</div>
          <strong>独立管理页</strong>
        </div>
        <span class="g-badge is-muted">1 项</span>
      </div>
      <button type="button" class="g-quick-tool" @click="goToShopConsole">
        <StoreIcon :size="18" class="g-quick-tool-icon" />
        <span class="g-quick-tool-copy">
          <strong>商城装修</strong>
          <small>可视化编辑商城商品与展示，保存即生效</small>
        </span>
        <span class="g-quick-tool-arrow">→</span>
      </button>
    </article>

    <!-- Diagnostics -->
    <article class="g-card" style="margin-top: calc(var(--spacing) * 5);">
      <div class="g-card-head">
        <div>
          <div class="g-eyebrow">信号</div>
          <strong>异常与待处理</strong>
        </div>
        <span class="g-badge is-muted">{{ activeDiagnostics.length }} 项</span>
      </div>
      <div v-if="activeDiagnostics.length" class="g-list">
        <button
          v-for="item in activeDiagnostics"
          :key="item.id"
          type="button"
          :class="['g-diagnostic-row', `is-${item.tone}`]"
          @click="$emit('select-tab', item.tab)"
        >
          <span class="g-diagnostic-dot" aria-hidden="true" />
          <span class="g-diagnostic-text">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <span class="g-diagnostic-count">{{ item.count }}</span>
        </button>
      </div>
      <div v-else class="g-empty">暂无待处理事项</div>
    </article>
  </div>

  <!-- Section: Cloud services (donut + line + cards) -->
  <div v-show="activeTab === 'cloud'">
    <div class="g-grid-2col" style="margin-top: calc(var(--spacing) * 4);">
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
  </div>

  <!-- Section: Data tree (using sheet for table summary) -->
  <div v-show="activeTab === 'tables'">
    <DashboardSheet
      title="数据表概览"
      :badge="`${tableSummaryCards.length} 张`"
      :summary="`共 ${totalRecordCount} 条记录`"
      style="margin-top: calc(var(--spacing) * 4);"
    >
      <table class="g-table-sheet">
        <thead>
          <tr>
            <th>数据表</th>
            <th>记录数</th>
            <th>占比</th>
            <th style="width: 80px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="table in tableSummaryCards" :key="table.id" :class="{ 'is-selected': currentTab === table.id }">
            <td><strong>{{ table.label }}</strong></td>
            <td class="is-mono">{{ table.count }}</td>
            <td>
              <DashboardProgress :value="totalRecordCount ? (table.count / totalRecordCount) * 100 : 0" :min-visible-width="3" />
            </td>
            <td>
              <button class="g-btn g-btn-ghost g-btn-sm" type="button" @click="$emit('select-tab', table.id)">
                打开
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </DashboardSheet>
  </div>

  <!-- Section: Activity (recent activity) -->
  <div v-show="activeTab === 'activity'" style="margin-top: calc(var(--spacing) * 4);">
    <article class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-eyebrow">最近更新</div>
          <strong>活动流</strong>
        </div>
        <div class="g-card-head-actions">
          <span class="g-badge is-muted">{{ recentActivityItems.length }} 条</span>
          <button class="g-icon-btn is-sm" type="button" @click="$emit('refresh-now')" :disabled="isRefreshing" title="刷新">
            <RefreshCw :size="14" :class="{ 'g-spin': isRefreshing }" />
          </button>
        </div>
      </div>
      <div v-if="recentActivityItems.length" class="g-list">
        <div v-for="item in recentActivityItems" :key="item.id" class="g-list-item">
          <span class="g-list-text">
            <strong>{{ item.title }}</strong>
            <small>{{ item.meta }}</small>
          </span>
          <span class="g-list-meta">{{ item.timestamp }}</span>
        </div>
      </div>
      <div v-else class="g-empty">暂无最近活动</div>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Cloud, Layers, LoaderCircle, RefreshCw, Store as StoreIcon, Table as TableIcon, Activity as ActivityIcon, Home as HomeIcon } from 'lucide-vue-next';
import {
  getSupabaseProjectStatus,
  getCloudinaryUsageStatus,
  formatBytes
} from '../../../utils/cloud-service-status.js';
import DashboardStat from './shared/DashboardStat.vue';
import DashboardProgress from './shared/DashboardProgress.vue';
import DashboardNotice from './shared/DashboardNotice.vue';
import DashboardTabs from './shared/DashboardTabs.vue';
import DashboardDonut from './shared/DashboardDonut.vue';
import DashboardSheet from './shared/DashboardSheet.vue';

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

defineEmits(['refresh-now', 'select-tab']);

const router = useRouter();

const goToShopConsole = () => {
  router.push('/admin/shop-console').catch(() => {});
};

// Tabs state
const activeTab = ref('overview');
const tabItems = computed(() => [
  { value: 'overview', label: '概览', icon: HomeIcon, count: props.liveStatusCards.length },
  { value: 'cloud', label: '云服务', icon: Cloud, count: 2 },
  { value: 'tables', label: '数据表', icon: TableIcon, count: props.tableSummaryCards.length },
  { value: 'activity', label: '活动流', icon: ActivityIcon, count: props.recentActivityItems.length }
]);

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

/* ---------- Responsive ---------- */
@media (max-width: 1100px) {
  .g-grid-2col { grid-template-columns: 1fr; }
  .g-overview-mini-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 720px) {
  .g-overview-mini-grid { grid-template-columns: 1fr; }
}
</style>

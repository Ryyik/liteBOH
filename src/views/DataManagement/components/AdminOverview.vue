<template>
  <div class="overview-status-bar">
    <div v-for="card in liveStatusCards" :key="card.id" class="status-card" :class="`status-${card.status}`">
      <component :is="card.icon" :size="18" class="status-card-icon" />
      <div class="status-card-body">
        <span class="status-card-label">{{ card.label }}</span>
        <strong class="status-card-value">{{ card.value }}</strong>
        <span class="status-card-detail">{{ card.detail }}</span>
      </div>
    </div>
  </div>

  <!-- 云服务状态卡片 -->
  <div class="cloud-services-section">
    <div class="overview-section-header">
      <h3>云服务状态</h3>
      <button class="overview-refresh-btn" @click="refreshCloudStatus" :class="{ spinning: cloudStatusLoading }">
        <RefreshCw :size="14" />
        刷新
      </button>
    </div>
    <div class="cloud-services-grid">
      <!-- Supabase 状态卡片 -->
      <div class="cloud-service-card" :class="supabaseCardClass">
        <div class="cloud-service-header">
          <Database :size="20" />
          <span class="cloud-service-name">Supabase</span>
          <span class="cloud-service-status-badge" :class="supabaseStatusBadgeClass">
            {{ supabaseStatusBadge }}
          </span>
        </div>
        <div class="cloud-service-body">
          <div class="cloud-metric">
            <span class="cloud-metric-label">数据库大小</span>
            <div class="cloud-metric-bar">
              <div class="cloud-metric-fill" :style="{ width: supabaseDbPercent + '%' }"></div>
            </div>
            <span class="cloud-metric-value">{{ supabaseDbSize }} / {{ supabaseDbLimit }}</span>
          </div>
          <div class="cloud-metric">
            <span class="cloud-metric-label">存储大小</span>
            <div class="cloud-metric-bar">
              <div class="cloud-metric-fill" :style="{ width: supabaseStoragePercent + '%' }"></div>
            </div>
            <span class="cloud-metric-value">{{ supabaseStorageSize }} / {{ supabaseStorageLimit }}</span>
          </div>
          <div class="cloud-metric-row">
            <div class="cloud-metric-mini">
              <span>用户数</span>
              <strong>{{ supabaseUserCount }}</strong>
            </div>
            <div class="cloud-metric-mini">
              <span>帖子数</span>
              <strong>{{ supabasePostCount }}</strong>
            </div>
            <div class="cloud-metric-mini">
              <span>活跃连接</span>
              <strong>{{ supabaseConnections }}</strong>
            </div>
          </div>
          <div class="cloud-health-score">
            <span>健康评分</span>
            <strong :class="supabaseHealthClass">{{ supabaseHealthScore }}</strong>
          </div>
        </div>
        <div v-if="supabaseDeploymentRequired" class="cloud-service-notice">
          <AlertCircle :size="14" />
          需部署 admin_supabase_project_status RPC
        </div>
      </div>

      <!-- Cloudinary 状态卡片 -->
      <div class="cloud-service-card" :class="cloudinaryCardClass">
        <div class="cloud-service-header">
          <Cloud :size="20" />
          <span class="cloud-service-name">Cloudinary</span>
          <span class="cloud-service-status-badge" :class="cloudinaryStatusBadgeClass">
            {{ cloudinaryStatusBadge }}
          </span>
        </div>
        <div class="cloud-service-body">
          <div class="cloud-metric-row">
            <div class="cloud-metric-mini">
              <span>Cloud Name</span>
              <strong>{{ cloudinaryCloudName }}</strong>
            </div>
            <div class="cloud-metric-mini">
              <span>待处理上传</span>
              <strong>{{ cloudinaryPendingCount }}</strong>
            </div>
          </div>
          <div v-if="cloudinaryBandwidth" class="cloud-metric">
            <span class="cloud-metric-label">带宽使用</span>
            <div class="cloud-metric-bar">
              <div class="cloud-metric-fill" :style="{ width: cloudinaryBandwidthPercent + '%' }"></div>
            </div>
            <span class="cloud-metric-value">{{ cloudinaryBandwidth }}</span>
          </div>
          <div v-if="cloudinaryStorage" class="cloud-metric">
            <span class="cloud-metric-label">存储使用</span>
            <div class="cloud-metric-bar">
              <div class="cloud-metric-fill" :style="{ width: cloudinaryStoragePercent + '%' }"></div>
            </div>
            <span class="cloud-metric-value">{{ cloudinaryStorage }}</span>
          </div>
        </div>
        <div v-if="cloudinaryDeploymentRequired" class="cloud-service-notice">
          <AlertCircle :size="14" />
          需部署 cloudinary-usage Edge Function
        </div>
      </div>
    </div>
  </div>

  <div class="overview-section" style="margin-bottom: 16px;">
    <div class="overview-section-header">
      <h3>数据表概览</h3>
      <button class="overview-refresh-btn" @click="$emit('refresh-now')" :class="{ spinning: isRefreshing }">
        <RefreshCw :size="14" />
        刷新
      </button>
    </div>
    <div class="overview-table-grid">
      <button
        v-for="table in tableSummaryCards"
        :key="table.id"
        class="overview-table-card"
        :class="{ active: currentTab === table.id }"
        @click="$emit('select-tab', table.id)"
      >
        <span class="overview-table-label">{{ table.label }}</span>
        <strong class="overview-table-count">{{ table.count }}</strong>
      </button>
    </div>
  </div>

  <div class="overview-grid-2col">
    <div class="overview-section">
      <div class="overview-section-header">
        <h3>异常与待处理</h3>
      </div>
      <div class="overview-diagnostics">
        <div v-for="item in activeDiagnostics" :key="item.id" class="diagnostic-row" :class="`tone-${item.tone}`">
          <div class="diagnostic-dot"></div>
          <div class="diagnostic-body">
            <strong>{{ item.title }}</strong>
            <span>{{ item.description }}</span>
          </div>
          <span class="diagnostic-count">{{ item.count }}</span>
          <button class="diagnostic-goto" @click="$emit('select-tab', item.tab)">查看</button>
        </div>
        <div v-if="!activeDiagnostics.length" class="diagnostic-empty">暂无待处理事项</div>
      </div>
    </div>

    <div class="overview-section">
      <div class="overview-section-header">
        <h3>最近更新</h3>
      </div>
      <div class="overview-recent">
        <div v-for="item in recentActivityItems" :key="item.id" class="recent-row">
          <span class="recent-dot"></span>
          <div class="recent-body">
            <span class="recent-title">{{ item.title }}</span>
            <span class="recent-meta">{{ item.meta }}</span>
          </div>
        </div>
        <div v-if="!recentActivityItems.length" class="diagnostic-empty">暂无最近活动</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RefreshCw, Database, Cloud, AlertCircle } from 'lucide-vue-next';
import { 
  getSupabaseProjectStatus, 
  getCloudinaryUsageStatus, 
  formatBytes 
} from '../../../utils/cloud-service-status.js';

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

// 云服务状态
const cloudStatusLoading = ref(false);
const supabaseStatus = ref(null);
const cloudinaryStatus = ref(null);

// Supabase 状态计算属性
const supabaseOk = computed(() => supabaseStatus.value?.ok ?? false);
const supabaseData = computed(() => supabaseStatus.value?.data || {});

const supabaseDbSize = computed(() => {
  const bytes = supabaseData.value.database_size || 0;
  return formatBytes(bytes);
});

const supabaseDbLimit = computed(() => {
  const bytes = supabaseData.value.database_size_limit || 500 * 1024 * 1024;
  return formatBytes(bytes);
});

const supabaseDbPercent = computed(() => {
  const percent = supabaseData.value.database_percent || 
    (supabaseData.value.database_size && supabaseData.value.database_size_limit 
      ? (supabaseData.value.database_size / supabaseData.value.database_size_limit) * 100 
      : 0);
  return Math.min(100, Math.max(0, percent));
});

const supabaseStorageSize = computed(() => {
  const bytes = supabaseData.value.storage_size || 0;
  return formatBytes(bytes);
});

const supabaseStorageLimit = computed(() => {
  const bytes = supabaseData.value.storage_size_limit || 1024 * 1024 * 1024;
  return formatBytes(bytes);
});

const supabaseStoragePercent = computed(() => {
  const percent = supabaseData.value.storage_percent || 0;
  return Math.min(100, Math.max(0, percent));
});

const supabaseUserCount = computed(() => supabaseData.value.user_count || supabaseData.value.estimatedUsers || 0);
const supabasePostCount = computed(() => supabaseData.value.post_count || supabaseData.value.estimatedPosts || 0);
const supabaseConnections = computed(() => supabaseData.value.active_connections || 0);
const supabaseHealthScore = computed(() => supabaseData.value.health_score || 100);

const supabaseDeploymentRequired = computed(() => Boolean(supabaseData.value.deploymentRequired));

const supabaseCardClass = computed(() => ({
  'cloud-card-healthy': supabaseHealthScore.value >= 90,
  'cloud-card-warning': supabaseHealthScore.value >= 70 && supabaseHealthScore.value < 90,
  'cloud-card-danger': supabaseHealthScore.value < 70,
  'cloud-card-loading': !supabaseOk.value && !supabaseDeploymentRequired.value
}));

const supabaseHealthClass = computed(() => ({
  'health-good': supabaseHealthScore.value >= 90,
  'health-warning': supabaseHealthScore.value >= 70 && supabaseHealthScore.value < 90,
  'health-danger': supabaseHealthScore.value < 70
}));

const supabaseStatusBadge = computed(() => {
  if (!supabaseOk.value && !supabaseDeploymentRequired.value) return '加载中';
  if (supabaseDeploymentRequired.value) return '待部署';
  if (supabaseHealthScore.value >= 90) return '健康';
  if (supabaseHealthScore.value >= 70) return '警告';
  return '危险';
});

const supabaseStatusBadgeClass = computed(() => ({
  'badge-healthy': supabaseHealthScore.value >= 90 && supabaseOk.value,
  'badge-warning': (supabaseHealthScore.value >= 70 && supabaseHealthScore.value < 90) || supabaseDeploymentRequired.value,
  'badge-danger': supabaseHealthScore.value < 70,
  'badge-loading': !supabaseOk.value && !supabaseDeploymentRequired.value
}));

// Cloudinary 状态计算属性
const cloudinaryOk = computed(() => cloudinaryStatus.value?.ok ?? false);
const cloudinaryData = computed(() => cloudinaryStatus.value?.data || {});

const cloudinaryCloudName = computed(() => cloudinaryData.value.cloudName || 'dkqae7j1m');
const cloudinaryPendingCount = computed(() => cloudinaryData.value.pending_uploads_count || 0);
const cloudinaryBandwidth = computed(() => {
  const bytes = cloudinaryData.value.bandwidth;
  if (!bytes) return null;
  return formatBytes(bytes);
});
const cloudinaryBandwidthPercent = computed(() => cloudinaryData.value.bandwidthPercent || 0);
const cloudinaryStorage = computed(() => {
  const bytes = cloudinaryData.value.storage;
  if (!bytes) return null;
  return formatBytes(bytes);
});
const cloudinaryStoragePercent = computed(() => cloudinaryData.value.storagePercent || 0);

const cloudinaryDeploymentRequired = computed(() => Boolean(cloudinaryData.value.deploymentRequired));

const cloudinaryCardClass = computed(() => ({
  'cloud-card-healthy': cloudinaryOk.value && !cloudinaryDeploymentRequired.value,
  'cloud-card-warning': cloudinaryDeploymentRequired.value,
  'cloud-card-loading': !cloudinaryOk.value && !cloudinaryDeploymentRequired.value
}));

const cloudinaryStatusBadge = computed(() => {
  if (!cloudinaryOk.value && !cloudinaryDeploymentRequired.value) return '加载中';
  if (cloudinaryDeploymentRequired.value) return '待部署';
  return '已配置';
});

const cloudinaryStatusBadgeClass = computed(() => ({
  'badge-healthy': cloudinaryOk.value && !cloudinaryDeploymentRequired.value,
  'badge-warning': cloudinaryDeploymentRequired.value,
  'badge-loading': !cloudinaryOk.value && !cloudinaryDeploymentRequired.value
}));

// 刷新云服务状态
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
  } finally {
    cloudStatusLoading.value = false;
  }
};

// 初始化时加载云服务状态
onMounted(() => {
  refreshCloudStatus();
});

// 当刷新按钮被点击时也刷新云状态
watch(() => props.isRefreshing, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    // 主刷新完成后，刷新云状态
    refreshCloudStatus();
  }
});
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/console.css';
@import '../styles/responsive.css';

/* 云服务状态卡片样式 */
.cloud-services-section {
  margin-bottom: 16px;
}

.cloud-services-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (max-width: 768px) {
  .cloud-services-grid {
    grid-template-columns: 1fr;
  }
}

.cloud-service-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-muted);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
}

.cloud-service-card:hover {
  border-color: var(--border-default);
}

.cloud-card-healthy {
  border-color: var(--success-muted);
}

.cloud-card-warning {
  border-color: var(--warning-muted);
}

.cloud-card-danger {
  border-color: var(--danger-muted);
}

.cloud-card-loading {
  opacity: 0.7;
}

.cloud-service-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cloud-service-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.cloud-service-status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-muted);
  color: var(--text-muted);
}

.badge-healthy {
  background: var(--success-muted);
  color: var(--success-text);
}

.badge-warning {
  background: var(--warning-muted);
  color: var(--warning-text);
}

.badge-danger {
  background: var(--danger-muted);
  color: var(--danger-text);
}

.badge-loading {
  background: var(--bg-muted);
  color: var(--text-muted);
}

.cloud-service-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cloud-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cloud-metric-label {
  font-size: 12px;
  color: var(--text-muted);
}

.cloud-metric-bar {
  height: 6px;
  background: var(--bg-muted);
  border-radius: 3px;
  overflow: hidden;
}

.cloud-metric-fill {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.cloud-metric-value {
  font-size: 11px;
  color: var(--text-secondary);
}

.cloud-metric-row {
  display: flex;
  gap: 12px;
}

.cloud-metric-mini {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cloud-metric-mini span {
  font-size: 11px;
  color: var(--text-muted);
}

.cloud-metric-mini strong {
  font-size: 13px;
  color: var(--text-primary);
}

.cloud-health-score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--border-muted);
}

.cloud-health-score span {
  font-size: 12px;
  color: var(--text-muted);
}

.cloud-health-score strong {
  font-size: 16px;
}

.health-good {
  color: var(--success-text);
}

.health-warning {
  color: var(--warning-text);
}

.health-danger {
  color: var(--danger-text);
}

.cloud-service-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  background: var(--warning-muted);
  border-radius: 4px;
  font-size: 12px;
  color: var(--warning-text);
}
</style>
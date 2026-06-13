<template>
  <section class="dashboard-hero">
    <div class="hero-copy">
      <div class="hero-kicker">
        <span class="live-dot"></span>
        方块之家管理控制台
      </div>
      <h2>站点运行、内容发布和数据维护集中处理。</h2>
      <p>当前正在管理 {{ currentTabLabel }}，共 {{ totalRecordCount }} 条记录。{{ activeFilterSummary }}。</p>
    </div>
    <div class="hero-status-grid">
      <div v-for="item in siteHealthCards" :key="item.label" class="hero-status-card">
        <component :is="item.icon" :size="18" />
        <div>
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>
    </div>
  </section>

  <section class="stats-section">
    <div class="stat-card" v-for="stat in statsCards" :key="stat.id" :class="`stat-${stat.type}`">
      <div class="stat-icon">
        <component :is="stat.icon" :size="22" />
      </div>
      <div class="stat-content">
        <template v-if="isLoading">
          <span class="dm-skeleton-block dm-stat-value-skeleton"></span>
          <span class="dm-skeleton-block dm-stat-label-skeleton"></span>
        </template>
        <template v-else>
          <span class="stat-value">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </template>
      </div>
      <div class="stat-trend" v-if="!isLoading && stat.trend">
        <span :class="{ up: stat.trend > 0, down: stat.trend < 0 }">
          {{ stat.trend > 0 ? '+' : '' }}{{ stat.trend }}%
        </span>
      </div>
    </div>
  </section>

  <section class="dashboard-grid">
    <div class="overview-panel">
      <div class="panel-heading">
        <div>
          <h2>数据表概览</h2>
          <p>当前管理模块的数据规模</p>
        </div>
        <Database :size="19" />
      </div>
      <div class="table-summary-list">
        <button
          v-for="table in tableSummaryCards"
          :key="table.id"
          class="table-summary-item"
          :class="{ active: currentTab === table.id }"
          type="button"
          @click="$emit('select-tab', table.id)"
        >
          <span class="table-summary-icon">{{ table.icon }}</span>
          <span class="table-summary-label">{{ table.label }}</span>
          <strong>{{ table.count }}</strong>
        </button>
      </div>
    </div>

    <div class="overview-panel">
      <div class="panel-heading">
        <div>
          <h2>异常诊断</h2>
          <p>审核、风控和调度状态</p>
        </div>
        <ShieldCheck :size="19" />
      </div>
      <div class="operations-list">
        <button
          v-for="item in activeDiagnostics"
          :key="item.id"
          type="button"
          class="operation-item"
          :class="`tone-${item.tone}`"
          @click="$emit('select-tab', item.tab)"
        >
          <span class="operation-status" :class="item.tone"></span>
          <div>
            <strong>{{ item.title }}</strong>
            <span>{{ item.description }}</span>
          </div>
          <span class="operation-count">{{ item.count }}</span>
        </button>
      </div>
    </div>

    <div class="overview-panel activity-panel">
      <div class="panel-heading">
        <div>
          <h2>最近活动</h2>
          <p>按数据表更新时间聚合</p>
        </div>
        <Activity :size="19" />
      </div>
      <div class="activity-list">
        <div v-for="item in recentActivityItems" :key="item.id" class="activity-item">
          <div class="activity-dot"></div>
          <div>
            <strong>{{ item.title }}</strong>
            <span>{{ item.meta }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { Activity, Database, ShieldCheck } from 'lucide-vue-next';

defineProps({
  activeDiagnostics: { type: Array, required: true },
  activeFilterSummary: { type: String, required: true },
  currentTab: { type: String, required: true },
  currentTabLabel: { type: String, required: true },
  isLoading: { type: Boolean, default: false },
  recentActivityItems: { type: Array, required: true },
  siteHealthCards: { type: Array, required: true },
  statsCards: { type: Array, required: true },
  tableSummaryCards: { type: Array, required: true },
  totalRecordCount: { type: Number, required: true }
});

defineEmits(['select-tab']);
</script>

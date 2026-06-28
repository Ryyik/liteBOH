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
import { RefreshCw } from 'lucide-vue-next';

defineProps({
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
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/console.css';
@import '../styles/responsive.css';
</style>

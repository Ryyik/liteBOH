<template>
  <header class="dm-header">
    <div class="header-content">
      <div class="header-left">
        <button class="sidebar-toggle" type="button" @click="$emit('toggle-sidebar')" aria-label="切换管理导航">
          <PanelLeft :size="19" />
        </button>
        <button class="back-btn" @click="$emit('back')" aria-label="返回首页" title="返回首页">
          <ArrowLeft :size="19" />
        </button>
        <div class="header-title-group">
          <span class="header-eyebrow">Website Dashboard</span>
          <h1 class="header-title">网站管理面板</h1>
          <p class="header-subtitle">内容、用户、审核和站点数据的统一工作台</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="refresh-btn" @click="$emit('refresh')" :class="{ spinning: isRefreshing }">
          <RefreshCw :size="17" />
          <span>刷新数据</span>
        </button>
        <button v-if="canCreate" class="publish-btn" @click="$emit('create')">
          <Plus :size="17" />
          <span>新增记录</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ArrowLeft, PanelLeft, Plus, RefreshCw } from 'lucide-vue-next';

defineProps({
  canCreate: { type: Boolean, default: false },
  isRefreshing: { type: Boolean, default: false }
});

defineEmits(['back', 'create', 'refresh', 'toggle-sidebar']);
</script>

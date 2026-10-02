<template>
  <div class="profile-impressions-section">
    <ProfileImpressionsPanel
      :show-back="showBack"
      :is-impressions-loading="impressionsLoading"
      :impressions="profileImpressions"
      :has-more="impressionsHasMore"
      :is-loading-more="isLoadingMoreImpressions"
      @back="$emit('back')"
      @delete-impression="handleDeleteImpression"
      @load-more-impressions="loadMoreImpressions"
    />

    <CommonAlertModal
      v-model:visible="alertState.visible"
      :type="alertState.type"
      :title="alertState.title"
      :message="alertState.message"
    />
  </div>
</template>

<script setup>
/**
 * 「我」页 · 印象分段 —— 取数逻辑单源在 composables/useProfileImpressions.js。
 *
 * 2026-10-01（plans/022 §4.2）：印象从论坛第 7 席搬进「我」页第三段。
 * 本组件只负责「组件形态」的两件事：把数据喂给 ProfileImpressionsPanel、
 * 承接删除结果的 Alert 弹窗（数据层不该持有视图宿主）。
 */
import { onBeforeUnmount, reactive } from 'vue';
import ProfileImpressionsPanel from './ProfileImpressionsPanel.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import { useProfileImpressions } from '../composables/useProfileImpressions.js';

defineProps({
  showBack: { type: Boolean, default: false },
});

defineEmits(['back']);

const alertState = reactive({ visible: false, type: 'info', title: '', message: '' });
const notify = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const {
  profileImpressions,
  impressionsLoading,
  impressionsHasMore,
  isLoadingMoreImpressions,
  fetchImpressions,
  loadMoreImpressions,
  handleDeleteImpression,
  dispose,
} = useProfileImpressions({ notify });

// 宿主「首次切到该分段」时把数据拉起来（父组件用 v-if 闩锁控制挂载时机）
void fetchImpressions();

onBeforeUnmount(dispose);

defineExpose({
  /** 供宿主在需要时强制刷新（如从「我的印象」入口二次进入） */
  reloadImpressions: (options) => fetchImpressions(options),
});
</script>

<style scoped>
.profile-impressions-section {
  width: 100%;
}
</style>

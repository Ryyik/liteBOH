<template>
  <div class="profile-impressions-section">
    <ProfileImpressionsPanel
      :show-back="showBack"
      :is-impressions-loading="loading"
      :impressions="impressions"
      :has-more="hasMore"
      :is-loading-more="isLoadingMore"
      @back="$emit('back')"
      @delete-impression="(impression) => $emit('delete-impression', impression)"
      @load-more-impressions="$emit('load-more-impressions')"
    />
  </div>
</template>

<script setup>
/**
 * 「我」页 · 印象分段 —— 视图组件（受控）。
 *
 * 2026-10-01（plans/022 §4.2）：印象从论坛第 7 席搬进「我」页第三段。
 *
 * 2026-10-26（IA 融合 · 第二刀）：本组件从「自取数」改为「受控」——
 * 主页新增了印象摘要行（同一份数据的第二个消费方），若两边各调一次
 * useProfileImpressions，composable 的实例级缓存/节流会各算一份 ⇒ 同一屏两次请求。
 * 现由父级（UserSpaceMain）持有唯一实例并向下传，本组件只负责视图与事件透传。
 * 数据层单源仍是 composables/useProfileImpressions.js，删除动作也由父级执行。
 */
import ProfileImpressionsPanel from './ProfileImpressionsPanel.vue';

defineProps({
  /** 印象列表（父级持有的 shallowRef 在模板里已解包） */
  impressions: { type: Array, default: () => [] },
  /** 首屏加载中 */
  loading: { type: Boolean, default: false },
  /** 还有更多可增量加载 */
  hasMore: { type: Boolean, default: false },
  /** 增量加载中 */
  isLoadingMore: { type: Boolean, default: false },
  showBack: { type: Boolean, default: false },
});

defineEmits(['back', 'delete-impression', 'load-more-impressions']);
</script>

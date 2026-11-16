<template>
  <!-- 我的图文（2026-11-16 起影集降级为发帖格式）
       = 该用户全部 is_album 的帖子按时间倒序，没有「本」、不建册、无配额。
       数据源是 posts（photo_albums 那三张表与编辑器不在这一层）。 -->
  <div class="photo-albums-panel">
    <MyAlbumBook />
  </div>
</template>

<script setup>
/**
 * 图文内联面板：零逻辑包装。
 * 读数据、空态、点开阅读全在 MyAlbumBook 里（与信息流共用同一套卡片与阅读层）。
 * 老摄影集的编辑器（6 版式 / 章节 / 离线导出）暂未接入，等以后作为「精装」挂回来。
 */
import MyAlbumBook from '@/views/Forum/components/MyAlbumBook.vue';
</script>

<style scoped>
@import '../styles/settings-glass.css';

.photo-albums-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: pap-in 240ms var(--ease-out, ease-out) both;
}

@keyframes pap-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .photo-albums-panel {
    animation: none;
  }
}
</style>

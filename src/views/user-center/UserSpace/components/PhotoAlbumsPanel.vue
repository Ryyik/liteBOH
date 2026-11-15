<template>
  <!-- 我的影集（2026-11-15 起由「摄影集」改造而来）
       形态定稿：**一个用户就一本影集** —— 这本 = 该用户全部影集帖按时间倒序，
       不需要建册、没有书位配额、本内帖数无上限。
       入口位置不变（设置三级页 / 横屏右栏），换的只是数据源：
       以前读 photo_albums（3 张表 + 编辑器），现在读 posts 里 is_album 的那些。 -->
  <div class="photo-albums-panel">
    <MyAlbumBook />
  </div>
</template>

<script setup>
/**
 * 影集内联面板：零逻辑包装。
 * 读数据、空态、点开阅读全在 MyAlbumBook 里（与论坛「影集」分区共用同一套卡片与阅读层）。
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

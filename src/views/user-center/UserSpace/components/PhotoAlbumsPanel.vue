<template>
  <!-- 摄影集（2026-11-10 收进设置三级页）
       之前设置里点「摄影集」是 `router.push('/user-space/albums')` —— 整页替换，
       横屏左侧目录消失、底栏也不在，用户报障的「有些页面还是单独一页」就是这类。
       现在横屏出在右栏、竖屏整页；内容与独立路由共用同一个页面组件（PhotoAlbums
       的 `embed` 只改外壳：去底色 / 去 100vh / 去自带返回按钮），不复制一份列表逻辑。 -->
  <div class="photo-albums-panel">
    <PhotoAlbums embed />
  </div>
</template>

<script setup>
/**
 * 摄影集内联面板：零逻辑包装。
 * 建册 / 上传 / 配额 / 分享全部留在 PhotoAlbums 里，这里只决定「用哪层外壳」。
 */
import PhotoAlbums from '@/views/PhotoAlbums/index.vue';
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

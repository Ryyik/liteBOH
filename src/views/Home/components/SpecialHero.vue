<template>
  <!-- 代码接管的特殊英雄区模板 - 方案A builtin -->
  <!-- 用法：直接改 title/subtitle/image/links 即可，排序/显隐由 DB 的 sort_order/is_archived 控制 -->
  <AppleGridCard
    class="special-hero-card"
    title="特别企划<br>由代码来定义"
    subtitle="这是一个代码接管的英雄区示例，文案、图片、按钮完全写在组件里。"
    variant="light"
    :links="[
      { text: '主要操作', type: 'primary', to: '/about' },
      { text: '次要操作', type: 'secondary', href: '#' },
    ]"
  >
    <!-- 视觉区：可放 <img> / <picture> / 任意自定义 slot，如需无图可删掉整个 <template #default> -->
    <div class="special-hero-visual">
      <img
        :src="placeholderImg"
        alt="特别英雄区配图"
        class="special-hero-image"
        :loading="priority ? 'eager' : 'lazy'"
        decoding="async"
        :fetchpriority="priority ? 'high' : 'auto'"
        draggable="false"
      />
    </div>
  </AppleGridCard>
</template>

<script setup>
import AppleGridCard from '@/components/AppleGridCard.vue';
// 示例图：复用现有资源，换成你的图只需改这一行 import
import placeholderImg from '@/assets/images/BOHcloud.webp?url';

defineProps({
  priority: { type: Boolean, default: false },
});
</script>

<style scoped>
.special-hero-card {
  min-height: 560px;
}

.special-hero-card :deep(.agc-content) {
  text-align: center;
}

.special-hero-card :deep(.agc-title) {
  font-size: clamp(36px, 5vw, 64px);
  line-height: 1.05;
}

.special-hero-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 24px 0 0;
}

.special-hero-image {
  display: block;
  width: min(100%, 520px);
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.12));
}

@media (max-width: 768px) {
  .special-hero-card {
    min-height: auto;
  }
  .special-hero-image {
    width: min(100%, 360px);
  }
}
</style>

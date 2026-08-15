<template>
  <AppleGridCard
    class="mascot-new-hero-card"
    :title="'Halo,<br>软软的新朋友来啦。'"
    subtitle="2026秋款全新吉祥物上线。"
    variant="light"
    :links="[
      { text: '探索周边', type: 'primary', to: '/shop' },
      { text: '了解方块之家', type: 'secondary', to: '/about' },
    ]"
  >
    <picture class="mascot-new-visual">
      <source media="(orientation: portrait)" :srcset="mascotPortraitImg" />
      <source media="(orientation: landscape)" :srcset="mascotLandscapeImg" />
      <img
        :src="mascotLandscapeImg"
        alt="方块之家全新吉祥物玩偶"
        class="mascot-new-image"
        :loading="priority ? 'eager' : 'lazy'"
        decoding="async"
        :fetchpriority="priority ? 'high' : 'auto'"
        draggable="false"
      />
    </picture>
  </AppleGridCard>
</template>

<script setup>
import AppleGridCard from '@/components/AppleGridCard.vue';
import mascotLandscapeImg from '@/assets/images/mascot-new-landscape-clean.webp?url';
import mascotPortraitImg from '@/assets/images/mascot-new-portrait.webp?url';

defineProps({
  priority: { type: Boolean, default: false },
});
</script>

<style scoped>
.mascot-new-hero-card {
  min-height: 620px;
  padding: 72px 0 0;
}

.mascot-new-hero-card :deep(.agc-content) {
  padding: 0 clamp(20px, 4vw, 32px);
  margin: 0 auto;
  text-align: center;
}

.mascot-new-hero-card :deep(.agc-title) {
  font-size: clamp(48px, 6.5vw, 84px);
  font-weight: 750;
  line-height: 1.02;
  letter-spacing: -0.015em;
  margin-bottom: 12px;
}

.mascot-new-hero-card :deep(.agc-subtitle) {
  font-size: clamp(18px, 2.1vw, 25px);
  line-height: 1.4;
  max-width: 600px;
  margin: 0 auto 28px;
}

.mascot-new-hero-card :deep(.agc-links) {
  justify-content: center;
}

.mascot-new-hero-card :deep(.agc-visual) {
  padding-top: 0;
  width: 100%;
  margin-top: auto;
}

.mascot-new-visual {
  display: block;
  line-height: 0;
  width: 100%;
  margin: 0;
  text-align: center;
}

.mascot-new-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: clamp(420px, 62vh, 680px);
  object-fit: contain;
  object-position: center bottom;
  margin: 0 auto;
}

/* ========== 竖屏适配 ========== */
@media (orientation: portrait) {
  .mascot-new-hero-card {
    min-height: auto;
    padding-top: 56px;
  }

  /* 去掉 margin-top:auto 导致的文字与图片间大片空隙 */
  .mascot-new-hero-card :deep(.agc-visual) {
    margin-top: 12px;
    flex: 0 0 auto;
  }

  /* 竖屏使用紧凑裁切图，让玩偶紧接文案并保持稳定尺寸。 */
  .mascot-new-image {
    width: auto;
    height: clamp(360px, 48svh, 440px);
    max-width: 100%;
    object-position: center center;
  }
}

/* ========== 小屏（通用窄屏） ========== */
@media (max-width: 768px) {
  .mascot-new-hero-card {
    padding-left: 0;
    padding-right: 0;
  }

  .mascot-new-hero-card :deep(.agc-title) {
    font-size: clamp(40px, 11vw, 54px);
  }

  .mascot-new-hero-card :deep(.agc-subtitle) {
    font-size: 17px;
    margin-bottom: 22px;
  }
}

/* ========== 竖屏小屏（手机） ========== */
@media (orientation: portrait) and (max-width: 420px) {
  .mascot-new-hero-card {
    padding-top: 44px;
  }

  .mascot-new-hero-card :deep(.agc-title) {
    font-size: clamp(36px, 11vw, 46px);
  }

  .mascot-new-hero-card :deep(.agc-visual) {
    margin-top: 4px;
  }

  .mascot-new-image {
    height: clamp(360px, 48svh, 420px);
  }
}
</style>

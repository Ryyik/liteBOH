<template>
  <HomeOverlayHero
    eyebrow="BOH 吉祥物"
    :title="'从熊到面包，\n再到下一个故事。'"
    subtitle="每一代吉祥物，都陪我们走过一段时光。"
    :image-src="breadImg"
    image-alt="方块之家吉祥物"
    image-position="center center"
    :links="[
      { text: '探索周边', type: 'primary', to: '/shop' },
      { text: '了解方块之家', type: 'secondary', to: '/about' },
    ]"
  />
</template>

<script setup>
import HomeOverlayHero from './HomeOverlayHero.vue';
import breadImg from '@/assets/images/breadgift.webp?url';
</script>

<template>
  <HomeOverlayHero
    eyebrow="社区 · 故事收集处"
    :title="'方块墙'"
    subtitle="把今天的心情、祝福，或者一个想记住的瞬间，钉在这里。"
    :image-src="blockWallImg"
    image-alt="方块墙"
    image-position="center center"
    :links="[
      { text: '去留言', type: 'primary', to: '/block-wall' },
    ]"
  />
</template>

<script setup>
import HomeOverlayHero from './HomeOverlayHero.vue';
import blockWallImg from '@/assets/images/2024-1-fangkuai.webp?url';
</script>

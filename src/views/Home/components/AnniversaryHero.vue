<template>
  <HomeOverlayHero eyebrow="方块之家 · 八周年" :title="'我们的世界，\n加载到第八年。'" subtitle="从一张地图，到一群人的共同世界。"
    :image-src="anniversaryWorldImg" image-alt="方块之家八周年校园设定集" image-position="center center" priority poster-pan :links="[
      { text: '走进八年旅程', type: 'primary', to: '/boh-8-years-journey' },
      { text: '关于方块之家', type: 'secondary', to: '/about' },
    ]" />
</template>

<script setup>
import HomeOverlayHero from './HomeOverlayHero.vue';
import anniversaryWorldImg from '@/assets/images/blockschool.webp?url';
</script>

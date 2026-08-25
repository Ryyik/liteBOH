<template>
  <HomeOverlayHero
    eyebrow="社区 · 故事收集处"
    :title="'方块墙'"
    subtitle="把今天的心情、祝福，或者一个想记住的瞬间，钉在这里。"
    :image-src="blockWallImg"
    :image-srcset="blockWallSrcset"
    image-sizes="100vw"
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
import blockWall390 from '@/assets/images/2024-1-fangkuai-390.webp?url';
import blockWall768 from '@/assets/images/2024-1-fangkuai-768.webp?url';
import blockWall1280 from '@/assets/images/2024-1-fangkuai-1280.webp?url';

// 响应式 srcset：移动端 390px 视口只下载 12.5KB 的 390w 变体（2x DPR 走 768w 35KB），
// 桌面端才用 1280w/1920w。原先固定下载 125KB 的 1920w 主图。
const blockWallSrcset = `${blockWall390} 390w, ${blockWall768} 768w, ${blockWall1280} 1280w, ${blockWallImg} 1920w`;
</script>

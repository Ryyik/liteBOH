<template>
  <!-- 按 builtin_key 分发渲染对应的硬编码英雄区组件 -->
  <MascotNewHero v-if="builtinKey === 'mascot-new'" />

  <AgentPreviewHero v-else-if="builtinKey === 'agent-preview'" />

  <BirthdayHero
    v-else-if="builtinKey === 'birthday'"
    :people="birthdayPeople"
    @more="$emit('birthday-more')"
  />

  <BlockWallHero v-else-if="builtinKey === 'block-wall'" />

  <MascotEvolutionHero v-else-if="builtinKey === 'mascot-evolution'" />

  <AnniversaryHero
    v-else-if="builtinKey === 'anniversary-8'"
    @poster="$emit('poster')"
  />

  <!-- 云上咖啡店：全幅图片叠加 -->
  <HomeOverlayHero
    v-else-if="builtinKey === 'cloud-cafe'"
    class="anniversary-cafe-hero"
    eyebrow="八周年 · 网页游戏"
    title="云上咖啡店"
    subtitle="招待方块熟客，亲手完成研磨、萃取、奶泡与拉花。"
    :image-src="anniversaryCafeImg"
    image-alt="云上咖啡店的 Minecraft 风格咖啡馆"
    image-position="center 54%"
    :links="[
      { text: '开始营业', type: 'primary', to: '/anniversary-cafe' },
      { text: '走进八年旅程', type: 'secondary', to: '/boh-8-years-journey' }
    ]"
  />

  <!-- 遇见福州：Apple 风格横幅 -->
  <AppleHeroBanner
    v-else-if="builtinKey === 'fuzhou'"
    class="fuzhou-hero"
    tag="遇见系列"
    title="Halo，福州。"
    :image-src="fuzhouImg"
    image-alt="福州"
    variant="light"
    card
    :full-bleed-image="true"
    :links="[{ text: '了解活动', type: 'primary', onClick: () => $emit('open-fuzhou') }]"
  />

  <!-- 主题与云端：分栏并排 -->
  <template v-else-if="builtinKey === 'split-theme-cloud'">
    <AppleGridCard
      title="BOH X 小猫主题"
      subtitle="快来体验萌萌小猫～"
      variant="light"
      :links="[{ text: '去设置', type: 'primary', to: '/user-space?tab=profile&view=settings&setting=theme' }]"
    >
      <HomeCatMascot class="cat-theme-main-cat" type="theme" size="lg" decorative />
    </AppleGridCard>

    <AppleGridCard
      title="BOH Cloud+"
      subtitle="云端内容，随时可达"
      variant="light"
      :image-src="bohCloudImg"
      image-alt="BOH Cloud+"
      :links="[
        { text: '立即体验', type: 'primary', to: '/user-space/note' },
        { text: '了解更多', type: 'secondary', onClick: () => $emit('open-cloud-plus') }
      ]"
    />
  </template>

  <!-- 品牌与八周年寄语：分栏并排 -->
  <template v-else-if="builtinKey === 'split-brand-letter'">
    <AppleGridCard
      title="了解，<br>什么是BOH"
      subtitle="一个属于方块之家的生态平台"
      variant="light"
      :image-src="faviconImg"
      image-alt="方块之家"
      :links="[
        { text: '了解更多', type: 'primary', to: '/about' },
        { text: '加入我们', type: 'secondary', to: '/join' }
      ]"
    />

    <AppleGridCard
      title="来自 Ryyik 的一封信"
      subtitle="方块之家八周年"
      variant="light"
      :links="[{ text: '查看信件', type: 'secondary', onClick: () => $emit('open-anniversary-letter') }]"
    >
      <img
        :src="anniversaryTextImg"
        alt="方块之家八周年"
        class="agc-anniversary-logo"
        loading="lazy"
        decoding="async"
        width="768"
        height="512"
      >
    </AppleGridCard>
  </template>
</template>

<script setup>
import { computed } from 'vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import AppleHeroBanner from '@/components/AppleHeroBanner.vue';
import AppleGridCard from '@/components/AppleGridCard.vue';
import HomeOverlayHero from './HomeOverlayHero.vue';
import AnniversaryHero from './AnniversaryHero.vue';
import BlockWallHero from './BlockWallHero.vue';
import MascotEvolutionHero from './MascotEvolutionHero.vue';
import MascotNewHero from './MascotNewHero.vue';
import BirthdayHero from './BirthdayHero.vue';
import AgentPreviewHero from './AgentPreviewHero.vue';

// 内置英雄区所需的静态图片资源
import bohCloudImg from '@/assets/images/BOHcloud.webp?url';
import faviconImg from '@/assets/images/favicon.webp?url';
import fuzhouImg from '@/assets/images/fuzhou.webp?url';
import anniversaryTextImg from '@/assets/images/8yearstext.webp?url';
import anniversaryCafeImg from '@/assets/images/26coffee4.webp?url';

const props = defineProps({
  hero: { type: Object, required: true },
  birthdayPeople: { type: Array, default: () => [] },
});

defineEmits(['poster', 'birthday-more', 'open-fuzhou', 'open-cloud-plus', 'open-anniversary-letter']);

const builtinKey = computed(() => props.hero?.builtin_key || '');
</script>

<style scoped>
/* 福州首屏：图片铺满卡片底部和左右 */
.fuzhou-hero :deep(.ahb-container) {
  padding-bottom: 0;
}
.fuzhou-hero :deep(.ahb-visual) {
  margin-top: 0;
  margin-left: calc(-1 * var(--apple-section-padding-x));
  margin-right: calc(-1 * var(--apple-section-padding-x));
}
.fuzhou-hero :deep(.ahb-image) {
  display: block;
}

/* 小猫主题 slot 内的猫咪样式 */
.cat-theme-main-cat {
  width: 220px;
  height: 220px;
  filter: drop-shadow(0 24px 34px rgba(255, 134, 168, 0.24));
}

/* 八周年信件卡片内的 logo */
.agc-anniversary-logo {
  display: block;
  width: min(100%, 520px);
  height: auto;
  margin: auto;
  object-fit: contain;
}

@media (max-width: 768px) {
  .cat-theme-main-cat { width: 160px; height: 160px; }
}

@media (max-width: 480px) {
  .cat-theme-main-cat { width: 120px; height: 120px; }
}
</style>

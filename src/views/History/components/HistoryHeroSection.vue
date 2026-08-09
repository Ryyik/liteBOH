<template>
  <!-- BOH Agent 预览 -->
  <HomeHeroRow v-if="id === 'agent-preview'" layout="full" aria-label="BOH Agent Preview">
    <AgentPreviewHero />
  </HomeHeroRow>

  <!-- 今日生日（预览模式数据） -->
  <HomeHeroRow v-else-if="id === 'birthday'" layout="full" aria-label="今日生日">
    <BirthdayHero />
  </HomeHeroRow>

  <!-- 方块墙 -->
  <HomeHeroRow v-else-if="id === 'block-wall'" layout="full" aria-label="方块墙">
    <BlockWallHero />
  </HomeHeroRow>

  <!-- 吉祥物进化史 -->
  <HomeHeroRow v-else-if="id === 'mascot-evolution'" layout="full" aria-label="方块之家吉祥物">
    <MascotEvolutionHero />
  </HomeHeroRow>

  <!-- 八周年 -->
  <HomeHeroRow v-else-if="id === 'anniversary-8'" layout="full" aria-label="方块之家八周年">
    <AnniversaryHero />
  </HomeHeroRow>

  <!-- 云上咖啡店 -->
  <HomeHeroRow v-else-if="id === 'cloud-cafe'" layout="full" aria-label="云上咖啡店网页游戏">
    <HomeOverlayHero
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
  </HomeHeroRow>

  <!-- 遇见福州 -->
  <HomeHeroRow v-else-if="id === 'fuzhou'" layout="full" aria-label="遇见福州">
    <AppleHeroBanner
      class="fuzhou-hero"
      tag="遇见系列"
      title="Halo，福州。"
      :image-src="fuzhouImg"
      image-alt="福州"
      variant="light"
      card
      :full-bleed-image="true"
    />
  </HomeHeroRow>

  <!-- 主题与云端（分栏） -->
  <HomeHeroRow v-else-if="id === 'split-theme-cloud'" layout="split" aria-label="主题与云端">
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
      ]"
    />
  </HomeHeroRow>

  <!-- 品牌与八周年寄语（分栏） -->
  <HomeHeroRow v-else-if="id === 'split-brand-letter'" layout="split" aria-label="品牌与八周年寄语">
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
      :links="[{ text: '查看信件', type: 'secondary', to: '/?letter' }]"
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
  </HomeHeroRow>
</template>

<script setup>
import HomeHeroRow from '../../Home/components/HomeHeroRow.vue';
import HomeOverlayHero from '../../Home/components/HomeOverlayHero.vue';
import AnniversaryHero from '../../Home/components/AnniversaryHero.vue';
import BlockWallHero from '../../Home/components/BlockWallHero.vue';
import MascotEvolutionHero from '../../Home/components/MascotEvolutionHero.vue';
import BirthdayHero from '../../Home/components/BirthdayHero.vue';
import AgentPreviewHero from '../../Home/components/AgentPreviewHero.vue';
import AppleHeroBanner from '@/components/AppleHeroBanner.vue';
import AppleGridCard from '@/components/AppleGridCard.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import anniversaryCafeImg from '@/assets/images/26coffee4.webp?url';
import anniversaryTextImg from '@/assets/images/8yearstext.webp?url';
import bohCloudImg from '@/assets/images/BOHcloud.webp?url';
import faviconImg from '@/assets/images/favicon.webp?url';
import fuzhouImg from '@/assets/images/fuzhou.webp?url';

defineProps({
  id: { type: String, required: true },
});
</script>

<style scoped>
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

.cat-theme-main-cat {
  width: 220px;
  height: 220px;
  filter: drop-shadow(0 24px 34px rgba(255, 134, 168, 0.24));
}

.agc-anniversary-logo {
  display: block;
  width: min(100%, 520px);
  height: auto;
  margin: auto;
  object-fit: contain;
}
</style>
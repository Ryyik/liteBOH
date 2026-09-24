<template>
  <div class="home-hero-flow">
    <HomeHeroRow
      v-for="(hero, heroIndex) in heroes"
      :key="(hero.template === 'builtin' ? 'builtin:' + hero.builtin_key : hero.id) + ':' + hero.sort_order"
      :layout="heroLayout(hero)"
      :aria-label="hero.aria_label || hero.label || hero.title"
      :id="hero.builtin_key === 'split-brand-letter' ? 'ryyik-letter' : undefined"
    >
      <DynamicHomeHero
        v-if="hero.template !== 'builtin'"
        :hero="hero"
        :priority="heroIndex === 0"
        @link-click="emit('link-click', $event)"
      />
      <BuiltinHeroRenderer
        v-else
        :hero="hero"
        :priority="heroIndex === 0"
        :birthday-people="birthdayPeople"
        @poster="emit('poster')"
        @birthday-more="emit('birthday-more')"
        @open-fuzhou="emit('open-fuzhou')"
        @open-cloud-plus="emit('open-cloud-plus')"
        @open-anniversary-letter="emit('open-anniversary-letter')"
      />
    </HomeHeroRow>
  </div>
</template>

<script setup>
/* 首页 hero 海报流（原 Home/index.vue 里的 HomeHeroRow 循环原样搬出）。
   2026-09-22 首页改版：论坛「官方」分区要渲染同一套 hero 流，故抽成独立组件；
   渲染分流（DynamicHomeHero / BuiltinHeroRenderer）、各弹窗事件、排期与显隐机制
   **一律不动** —— 弹窗仍归 Home/index.vue 所有，本组件只把事件透传上去。

   ⚠️ 本组件必须由调用方异步加载（defineAsyncComponent），不得进首屏壳。 */
import HomeHeroRow from './HomeHeroRow.vue';
import DynamicHomeHero from './DynamicHomeHero.vue';
import BuiltinHeroRenderer from './BuiltinHeroRenderer.vue';
import { builtinHeroLayout } from './homeArchiveData.js';

defineProps({
  /** 已过滤（含生日判定）的可见 hero 列表 */
  heroes: { type: Array, default: () => [] },
  birthdayPeople: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'link-click',
  'poster',
  'birthday-more',
  'open-fuzhou',
  'open-cloud-plus',
  'open-anniversary-letter',
]);

// 英雄区布局：builtin 类型查映射表，其余按 template 判断（与改版前一致）
const heroLayout = (hero) => {
  if (hero.template === 'builtin') {
    return builtinHeroLayout[hero.builtin_key] || 'full';
  }
  return hero.template === 'split' ? 'split' : 'full';
};
</script>

<style scoped>
.home-hero-flow {
  display: grid;
  width: 100%;
  gap: var(--home-hero-gap, 12px);
}
</style>

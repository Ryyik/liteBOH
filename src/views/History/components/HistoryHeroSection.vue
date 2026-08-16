<template>
  <!-- 统一渲染：builtin 走 BuiltinHeroRenderer，其余走 DynamicHomeHero -->
  <HomeHeroRow :layout="layout" :aria-label="hero.aria_label || hero.label || hero.title" :eager="eager">
    <DynamicHomeHero v-if="hero.template !== 'builtin'" :hero="hero" />
    <BuiltinHeroRenderer
      v-else
      :hero="hero"
      @open-anniversary-letter="goToLetter"
      @open-fuzhou="goToFuzhou"
      @open-cloud-plus="goToCloudPlus"
      @poster="goToPoster"
    />
  </HomeHeroRow>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import HomeHeroRow from '../../Home/components/HomeHeroRow.vue';
import DynamicHomeHero from '../../Home/components/DynamicHomeHero.vue';
import BuiltinHeroRenderer from '../../Home/components/BuiltinHeroRenderer.vue';
import { builtinHeroLayout } from '../../Home/components/homeArchiveData.js';

const props = defineProps({
  hero: { type: Object, required: true },
  eager: { type: Boolean, default: false },
});

const router = useRouter();

const layout = computed(() => {
  if (props.hero.template === 'builtin') {
    return builtinHeroLayout[props.hero.builtin_key] || 'full';
  }
  return props.hero.template === 'split' ? 'split' : 'full';
});

// 历史区点击交互：跳回首页对应位置
const goToLetter = () => router.push({ path: '/', hash: '#ryyik-letter' });
const goToFuzhou = () => router.push({ path: '/' });
const goToCloudPlus = () => router.push({ path: '/user-space/note' });
const goToPoster = () => router.push({ path: '/' });
</script>

<template>
  <div class="history-page">
    <!-- 已归档英雄区：统一从数据库读取（含 builtin 与数据驱动两类） -->
    <HistoryHeroSection
      v-for="(hero, heroIndex) in archivedHeroes"
      :key="hero.id"
      :hero="hero"
      :eager="heroIndex === 0"
    />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import HistoryHeroSection from './components/HistoryHeroSection.vue';
import { useHomeHeroesStore } from '@/stores/homeHeroes';

const homeHeroesStore = useHomeHeroesStore();
const archivedHeroes = homeHeroesStore.archivedHeroes;

onMounted(async () => {
  try {
    await homeHeroesStore.fetchArchived({ force: true });
  } catch {
    // 表不存在时仅返回空数组
  }
});
</script>

<style scoped>
.history-page {
  --home-nav-safe-offset: 84px;
  width: 100%;
  overflow-x: hidden;
  background-color: #f5f5f7;
  color: #000000;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", "微软雅黑", sans-serif;
  -webkit-overflow-scrolling: touch;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: var(--home-nav-safe-offset);
}

@media (max-width: 995px) {
  .history-page { --home-nav-safe-offset: 72px; }
}

@media (max-width: 660px) {
  .history-page { --home-nav-safe-offset: 66px; }
}
</style>

<script setup>
/**
 * ActivityMonthRail — 单个月份的横向滚动轨道（「每月一轨道」方案的原子单元）
 *
 * 背景：17 条历史活动摊开后是 16 个月份组，只有 2024-12 有 2 张卡。
 * 所以「单卡轨道」是常态而非边界情况——它不参与 scroll-snap，
 * 卡片放宽到接近满宽，避免一个月占一行却只有一小块内容的空旷感。
 *
 * 横滑范式沿用 Forum/styles/feed.css 的 .image-post-strip：
 * overscroll-behavior-x: contain 防页面横滑溢出 + 隐藏滚动条靠露边暗示可滑。
 * 露边用负 margin 抵消宿主容器的 gutter（--activity-rail-gutter），
 * 让首卡与月份标题对齐、末卡可滑到容器边缘。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ActivityCard from "./ActivityCard.vue";

const props = defineProps({
  monthLabel: { type: String, required: true },
  monthKey: { type: String, default: "" },
  items: { type: Array, default: () => [] }
});

defineEmits(["open"]);

const railRef = ref(null);
const activeIndex = ref(0);
const hasOverflow = ref(false);

const isSingle = computed(() => props.items.length <= 1);
const countLabel = computed(() => `${props.items.length} 场`);

// 以「第一个可见卡片」为当前项——锚定可见性而非索引推算，
// 避免露边负 margin 导致的 offsetLeft 基准偏移。
const syncScrollState = () => {
  const rail = railRef.value;
  if (!rail) return;
  hasOverflow.value = rail.scrollWidth - rail.clientWidth > 4;
  const railLeft = rail.getBoundingClientRect().left;
  const cards = Array.from(rail.children);
  let current = 0;
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i].getBoundingClientRect().left - railLeft >= -8) {
      current = i;
      break;
    }
    current = i;
  }
  activeIndex.value = current;
};

const scrollToIndex = (index) => {
  const rail = railRef.value;
  if (!rail) return;
  const target = rail.children[index];
  if (!target) return;
  rail.scrollTo({ left: target.offsetLeft - rail.offsetLeft, behavior: "smooth" });
};

onMounted(() => {
  syncScrollState();
  window.addEventListener("resize", syncScrollState, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", syncScrollState);
});
</script>

<template>
  <section class="month-rail" :data-month="monthKey">
    <header class="month-rail__head">
      <h2 class="month-rail__title">{{ monthLabel }}</h2>
      <span class="month-rail__count">{{ countLabel }}</span>

      <div v-if="hasOverflow && !isSingle" class="month-rail__dots" role="tablist" aria-label="切换活动">
        <button
          v-for="(item, index) in items"
          :key="item.id ?? index"
          type="button"
          role="tab"
          class="month-rail__dot"
          :class="{ 'is-active': index === activeIndex }"
          :aria-selected="index === activeIndex"
          :aria-label="`第 ${index + 1} 张：${item.title || '活动'}`"
          @click="scrollToIndex(index)"
        ></button>
      </div>
    </header>

    <div
      ref="railRef"
      class="month-rail__track"
      :class="{ 'is-single': isSingle }"
      @scroll="syncScrollState"
    >
      <div v-for="item in items" :key="item.id" class="month-rail__slot">
        <ActivityCard :activity="item" @open="$emit('open', $event)" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.month-rail {
  margin-bottom: 34px;
}

.month-rail__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 12px;
}

.month-rail__title {
  margin: 0;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: #1d1d1f;
}

.month-rail__count {
  font-size: 12.5px;
  font-weight: 500;
  color: #a1a1a6;
  font-variant-numeric: tabular-nums;
}

.month-rail__dots {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding-bottom: 2px;
}

.month-rail__dot {
  width: 16px;
  height: 3px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.15);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.month-rail__dot:hover { background: rgba(15, 23, 42, 0.3); }
.month-rail__dot.is-active { background: #1d1d1f; }
.month-rail__dot:focus-visible { outline: 2px solid #94a3b8; outline-offset: 2px; }

.month-rail__track {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-block: 4px 10px;
  margin-inline: calc(var(--activity-rail-gutter, 40px) * -1);
  padding-inline: var(--activity-rail-gutter, 40px);
  scroll-padding-inline: var(--activity-rail-gutter, 40px);
}

.month-rail__track::-webkit-scrollbar { display: none; }

.month-rail__slot {
  flex: 0 0 auto;
  width: clamp(230px, 27%, 300px);
  scroll-snap-align: start;
}

.month-rail__track.is-single {
  scroll-snap-type: none;
}

.month-rail__track.is-single .month-rail__slot {
  width: min(420px, 100%);
}

@media (max-width: 768px) {
  .month-rail {
    margin-bottom: 26px;
  }

  .month-rail__track {
    margin-inline: calc(var(--activity-rail-gutter, 20px) * -1);
    padding-inline: var(--activity-rail-gutter, 20px);
    scroll-padding-inline: var(--activity-rail-gutter, 20px);
  }

  .month-rail__slot { width: clamp(200px, 74%, 280px); }
  .month-rail__track.is-single .month-rail__slot { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .month-rail__dot { transition: none; }
}

html[data-theme="dark"] .month-rail__title { color: #f5f5f7; }
html[data-theme="dark"] .month-rail__count { color: #6e6e73; }
html[data-theme="dark"] .month-rail__dot { background: rgba(255, 255, 255, 0.18); }
html[data-theme="dark"] .month-rail__dot:hover { background: rgba(255, 255, 255, 0.32); }
html[data-theme="dark"] .month-rail__dot.is-active { background: #f5f5f7; }
</style>

<template>
  <section
    ref="rowRef"
    class="home-hero-row"
    :class="[`is-${layout}`]"
    :aria-label="ariaLabel || undefined"
  >
    <div class="home-hero-row-inner">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  layout: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'split'].includes(value),
  },
  ariaLabel: { type: String, default: '' },
});

const rowRef = ref(null);
</script>

<style scoped>
/* —— 为什么不做延迟渲染 / content-visibility ——
   1) content-visibility:auto 在 iOS Safari 触发 WebKit bug 321501：真实触摸滚动时
      行进入视口后保持"过期的零高度布局"，整行空白且不自愈（程序化 scrollTo 不复现，
      故桌面探针测不出来）；配套的 318216 则是滚动反复重排导致卡顿。Blink 无此问题，
      但本站 iOS 流量占比高，禁用是净收益——首屏成本已由骨架屏承担，图片另有 LQIP+lazy。
   2) 行级 is-deferred 占位 + IntersectionObserver + 空闲预热机制一并移除：
      占位高度是估计值，与真实高度有 100~300px 漂移，滚动中页面总高反复变化
      （实测 6097→6402→6277），既造成"首滚跳变"又会在 iOS 上叠出空白窗；
      7 行静态模板的 DOM 构建成本仅几 ms，直接全部渲染换回"高度从 t0 起就稳定"。
   ⚠️ 若未来确需恢复行级虚拟化，必须先在真 iOS Safari 验证 321501 已修复。 */
.home-hero-row {
  width: 100%;
}

.home-hero-row-inner {
  display: grid;
  width: 100%;
  gap: var(--home-hero-gap, 12px);
}

.is-full .home-hero-row-inner {
  grid-template-columns: minmax(0, 1fr);
}

.is-split .home-hero-row-inner {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.home-hero-row-inner :deep(> *) {
  min-width: 0;
  height: 100%;
}

@media (max-width: 768px) {
  .is-split .home-hero-row-inner {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

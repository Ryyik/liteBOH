<template>
  <section
    ref="rowRef"
    class="home-hero-row"
    :class="[`is-${layout}`, { 'is-deferred': !shouldRender }]"
    :data-intrinsic="intrinsic || undefined"
    :aria-label="ariaLabel || undefined"
  >
    <div class="home-hero-row-inner">
      <slot v-if="shouldRender" />
    </div>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  layout: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'split'].includes(value),
  },
  ariaLabel: { type: String, default: '' },
  eager: { type: Boolean, default: false },
  // 占位高度镜像 key：builtin 用 builtin_key，动态 hero 用 template。
  // 对应表达式见下方 [data-intrinsic] 映射表，改 hero 自身 min-height 时须同步。
  intrinsic: { type: String, default: '' },
});

const rowRef = ref(null);
const shouldRender = ref(props.eager);
let observer = null;
let prewarmTimer = null;
let prewarmHandle = null;

watch(() => props.eager, (eager) => {
  if (eager) shouldRender.value = true;
});

onMounted(() => {
  if (shouldRender.value || typeof IntersectionObserver === 'undefined') {
    shouldRender.value = true;
    return;
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    shouldRender.value = true;
    observer?.disconnect();
    observer = null;
  }, { rootMargin: '800px 0px' });
  if (rowRef.value) observer.observe(rowRef.value);

  // —— 空闲预热 ——
  // 视口驱动的 hero 已由 --row-intrinsic 精确镜像；内容驱动的 hero（agent-preview/
  // special-custom/split 等）高度随内容漂移，静态占位常数会过时。
  // 首屏稳定后趁空闲把剩余行全部渲染，让页面总高度在用户下滚之前就落定为
  // 真实值——消除"占位→真实"的首滚跳变，也让占位常数漂移自动愈合。
  // 注意：行有 content-visibility:auto 兜底，离屏行预热只花 DOM 构建成本，不参与绘制。
  const requestIdle = window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: 2500 })
    : (cb) => window.setTimeout(cb, 2000);
  prewarmTimer = window.setTimeout(() => {
    prewarmHandle = requestIdle(() => {
      shouldRender.value = true;
    });
  }, 300);
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
  if (prewarmTimer) {
    window.clearTimeout(prewarmTimer);
    prewarmTimer = null;
  }
  if (prewarmHandle != null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(prewarmHandle);
    prewarmHandle = null;
  }
});
</script>

<style scoped>
/* —— 行占位高度单源 ——
   问题背景：占位高度(旧固定 720px)与各英雄区真实高度（760/756/702/624…）不符，
   首次滚动渲染时页面总高度跳变 97~151px，来回滚动像"内容没加载全"。
   解法：每行按 hero 种类挂 data-intrinsic，--row-intrinsic 镜像该英雄区
   自身的 min-height 表达式；deferred 占位 / contain-intrinsic-size / 真实高度
   三者对齐，首次渲染即零跳变（auto 记忆真实尺寸兜底后续滚动）。
   ⚠️ 改任何英雄区的 min-height 时，同步更新这里的映射表。 */
.home-hero-row {
  --row-intrinsic: 720px; /* 未知类型的保守兜底 */
}

/* 动态 hero（template 命名） */
.home-hero-row[data-intrinsic='overlay'],
.home-hero-row[data-intrinsic='standard'],
.home-hero-row[data-intrinsic='responsive'] {
  /* 镜像 DynamicHomeHero / HomeOverlayHero 的 clamp(620px, 78svh, 900px) */
  --row-intrinsic: clamp(620px, 78svh, 900px);
}
.home-hero-row[data-intrinsic='showcase'] {
  /* 镜像 ShowcaseBookHero 的 clamp(650px, 84svh, 900px) */
  --row-intrinsic: clamp(650px, 84svh, 900px);
}
.home-hero-row[data-intrinsic='split'] {
  /* split 双卡并排为内容驱动高度（桌面实测约 624px），取近似值 */
  --row-intrinsic: 640px;
}

/* builtin hero（builtin_key 命名） */
.home-hero-row[data-intrinsic='beta6-renewal'] {
  /* 镜像 .beta6-hero 的 min-height: min(86vh, 760px) */
  --row-intrinsic: min(86vh, 760px);
}
.home-hero-row[data-intrinsic='block-wall'],
.home-hero-row[data-intrinsic='anniversary-8'],
.home-hero-row[data-intrinsic='cloud-cafe'] {
  /* 三者均包 HomeOverlayHero：clamp(620px, 78svh, 900px) */
  --row-intrinsic: clamp(620px, 78svh, 900px);
}
.home-hero-row[data-intrinsic='birthday'] {
  /* 镜像 BirthdayHero 的 clamp(520px, 70svh, 760px) */
  --row-intrinsic: clamp(520px, 70svh, 760px);
}
.home-hero-row[data-intrinsic='agent-preview'] {
  /* AgentPreviewHero 内容驱动（实测 702~818px，随内容浮动），粗估 + 空闲预热自愈 */
  --row-intrinsic: 820px;
}
.home-hero-row[data-intrinsic='fuzhou'] {
  /* AppleHeroBanner 内容驱动（实测约 700px） */
  --row-intrinsic: 700px;
}
.home-hero-row[data-intrinsic='mascot-new'] {
  /* MascotNewHero 内容驱动（实测约 756px） */
  --row-intrinsic: 756px;
}
.home-hero-row[data-intrinsic='mascot-evolution'] {
  --row-intrinsic: 720px;
}
.home-hero-row[data-intrinsic='special-custom'] {
  /* SpecialHero 内容驱动（min 560 / 实测约 938px），粗估 + 空闲预热自愈 */
  --row-intrinsic: 940px;
}
.home-hero-row[data-intrinsic='split-theme-cloud'],
.home-hero-row[data-intrinsic='split-brand-letter'] {
  /* 双 AppleGridCard 并排，桌面实测约 624px */
  --row-intrinsic: 640px;
}

.home-hero-row {
  width: 100%;
}

.home-hero-row.is-deferred {
  min-height: var(--row-intrinsic, 720px);
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

@supports (content-visibility: auto) {
  /* 长首页的后续英雄区无需在首屏参与布局和绘制。 */
  .home-hero-row {
    content-visibility: auto;
    contain-intrinsic-size: auto var(--row-intrinsic, 720px);
  }
}

/* —— 视口档位修正：镜像各 hero 自身的响应式 min-height —— */
@media (max-width: 640px) {
  /* .beta6-hero 移动端收缩为 min(80vh, 640px) */
  .home-hero-row[data-intrinsic='beta6-renewal'] {
    --row-intrinsic: min(80vh, 640px);
  }
}

@media (max-width: 768px) {
  .is-split .home-hero-row-inner {
    grid-template-columns: minmax(0, 1fr);
  }

  /* split 双卡在窄屏堆叠为单列，高度约翻倍 */
  .home-hero-row[data-intrinsic='split'],
  .home-hero-row[data-intrinsic='split-theme-cloud'],
  .home-hero-row[data-intrinsic='split-brand-letter'] {
    --row-intrinsic: 1100px;
  }
}
</style>

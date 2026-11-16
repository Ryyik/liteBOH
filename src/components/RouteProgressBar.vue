<template>
  <!-- 路由切换的极细进度条（2px，贴屏幕顶边）。
       pointer-events: none —— 它盖在最上层，绝不能吃掉任何点击；
       aria-hidden —— 纯装饰，读屏用户不需要听到「正在加载」，页面自身的骨架已经说明了。 -->
  <div class="route-progress" :class="{ 'is-active': isActive }" aria-hidden="true">
    <span class="route-progress-fill" :style="{ transform: `scaleX(${scale})` }"></span>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

/**
 * 路由切换的「有反应」提示（2026-11-16）。
 *
 * 为什么需要：底栏切页要等目标页 chunk（Slow 4G 实测 497ms）。在那段时间里
 * 屏幕上什么都没有变化 —— 用户的原话是「点了没反应 / 卡一下」。
 * 页面骨架只能等 chunk 回来才有机会出现，所以必须在**导航一开始**就有反馈。
 *
 * 为什么不立刻显示：路由切换绝大多数在 100ms 内完成，立刻弹一条进度条
 * 等于每次切页都闪一下（比不加更糟）。所以延迟 `SHOW_DELAY_MS` 才出现，
 * 显示时也不是「假装满」：先到 15%，再缓慢逼近 90%，等导航真的结束才补到 100%。
 * 这是「我不知道还剩多久，但我知道它在动」，不是精确进度条 —— 精确进度做不到，
 * 别为了好看去伪造百分比。
 *
 * ⚠️ 只挂在 App 级一次。每个宿主各挂一条会得到两条交叠的进度条，
 * 而且钩子会重复注册（vue-router 的钩子没有幂等语义）。
 */
const SHOW_DELAY_MS = 120;
const FADE_OUT_MS = 220;

const router = useRouter();
const isActive = ref(false);
const scale = ref(0);

let showTimer = 0;
let rampTimer = 0;
let hideTimer = 0;

const clearTimers = () => {
  if (showTimer) window.clearTimeout(showTimer);
  if (rampTimer) window.clearInterval(rampTimer);
  if (hideTimer) window.clearTimeout(hideTimer);
  showTimer = 0;
  rampTimer = 0;
  hideTimer = 0;
};

const start = () => {
  // 上一次还没收尾就又开始导航：直接复位，别叠加定时器
  clearTimers();
  isActive.value = false;
  scale.value = 0;

  showTimer = window.setTimeout(() => {
    isActive.value = true;
    scale.value = 0.15;
    /* 缓慢逼近 0.9：每 200ms 加 0.12，封顶 0.9 —— 剩下 10% 留给「真的完成」，
       否则会出现「进度条满了但页面还没出来」的假完成。 */
    rampTimer = window.setInterval(() => {
      if (scale.value >= 0.9) return;
      scale.value = Math.min(0.9, scale.value + 0.12);
    }, 200);
  }, SHOW_DELAY_MS);
};

const finish = () => {
  if (showTimer) {
    window.clearTimeout(showTimer);
    showTimer = 0;
  }
  if (rampTimer) {
    window.clearInterval(rampTimer);
    rampTimer = 0;
  }
  // 没显示过（快导航）就什么都不做：不留任何残影
  if (!isActive.value) {
    scale.value = 0;
    return;
  }
  scale.value = 1;
  hideTimer = window.setTimeout(() => {
    isActive.value = false;
    // 等淡出结束再归零，避免「收回去」被看到
    hideTimer = window.setTimeout(() => {
      scale.value = 0;
      hideTimer = 0;
    }, FADE_OUT_MS);
  }, 160);
};

const stopBeforeEach = router.beforeEach(() => {
  start();
});
const stopAfterEach = router.afterEach(() => {
  finish();
});
const stopOnError = router.onError(() => {
  finish();
});

onMounted(() => {
  clearTimers();
});

onBeforeUnmount(() => {
  clearTimers();
  stopBeforeEach();
  stopAfterEach();
  stopOnError();
});
</script>

<style scoped>
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
  transition: opacity 220ms ease-out;
}

.route-progress.is-active {
  opacity: 1;
}

.route-progress-fill {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  background: var(--apple-blue, #0071e3);
  /* 只在「完成」那一下有过渡；爬升阶段由 JS 每 200ms 加一格，不需要过渡，
     否则每次加格都会被拉伸成一条长动画，反而像卡住。 */
  transition: transform 200ms ease-out;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .route-progress,
  .route-progress-fill {
    transition: none;
  }
}
</style>

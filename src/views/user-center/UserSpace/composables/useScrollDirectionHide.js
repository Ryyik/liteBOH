import { onMounted, onUnmounted, ref, watch } from 'vue';

const TOP_REVEAL_OFFSET = 4;
/* 2026-11-14：阈值上调（收起 20→24 / 展开 8→12）+ 切换冷却。
   原因：收起/展开从「淡出消失」变成「整条胶囊形变成一颗圆」，位移量大了一个量级，
   沿用 8px 的展开阈值会在手指微抖 / 惯性滚动尾声来回抽搐。 */
const HIDE_DISTANCE = 24;
const SHOW_DISTANCE = 12;
const TOGGLE_COOLDOWN = 220;

const getScrollContainer = (target) => {
  if (target && target !== document && target !== document.documentElement && target !== window) {
    return target;
  }
  return document.scrollingElement || document.documentElement;
};

export const useScrollDirectionHide = ({ forceVisible }) => {
  const hidden = ref(false);
  const positions = new WeakMap();
  let activeContainer = null;
  let travel = 0;
  let frameId = 0;
  let pendingTarget = null;
  let lastToggleAt = 0;

  const reveal = () => {
    hidden.value = false;
    travel = 0;
    lastToggleAt = Date.now();
  };

  const evaluate = () => {
    frameId = 0;
    if (forceVisible.value || !pendingTarget) {
      reveal();
      return;
    }

    const container = getScrollContainer(pendingTarget);
    pendingTarget = null;
    const nextPosition = Math.max(0, Number(container?.scrollTop || window.scrollY || 0));
    const previousPosition = positions.get(container);
    positions.set(container, nextPosition);

    if (previousPosition === undefined || activeContainer !== container) {
      activeContainer = container;
      travel = 0;
      if (nextPosition <= TOP_REVEAL_OFFSET) hidden.value = false;
      return;
    }

    if (nextPosition <= TOP_REVEAL_OFFSET) {
      reveal();
      return;
    }

    const delta = nextPosition - previousPosition;
    if (Math.abs(delta) < 1) return;
    travel = delta > 0 ? Math.max(0, travel) + delta : Math.min(0, travel) + delta;

    /* 冷却期内**不清零 travel**：攒下的位移继续armed，冷却一过立刻兑现。
       清零会表现成「我明明滑了 30px 它没反应」。 */
    const cooled = () => Date.now() - lastToggleAt >= TOGGLE_COOLDOWN;

    if (travel >= HIDE_DISTANCE) {
      if (!hidden.value) {
        if (!cooled()) return;
        hidden.value = true;
        lastToggleAt = Date.now();
      }
      travel = 0;
    } else if (travel <= -SHOW_DISTANCE) {
      if (hidden.value) {
        if (!cooled()) return;
        hidden.value = false;
        lastToggleAt = Date.now();
      }
      travel = 0;
    }
  };

  const handleScroll = (event) => {
    pendingTarget = event?.target || document;
    if (!frameId) frameId = window.requestAnimationFrame(evaluate);
  };

  const reset = () => {
    /* 2026-11-14：不再清 activeContainer / positions。
       清掉的话 reset 之后的第一条 scroll 只会被当成「换容器」的基线、不判方向
       —— 用户点圆展开后接着往下滑，要滑**两下**才收得回去（探针 F 组实测）。
       容器真的换了由 evaluate 里的 activeContainer !== container 兜住。 */
    reveal();
  };

  watch(
    forceVisible,
    () => {
      if (forceVisible.value) reset();
    },
    { immediate: true },
  );

  onMounted(() => {
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener('scroll', handleScroll, { capture: true });
    if (frameId) window.cancelAnimationFrame(frameId);
  });

  return { hidden, reset };
};

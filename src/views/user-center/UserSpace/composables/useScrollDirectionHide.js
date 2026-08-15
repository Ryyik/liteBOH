import { onMounted, onUnmounted, ref, watch } from 'vue';

const TOP_REVEAL_OFFSET = 4;
const HIDE_DISTANCE = 20;
const SHOW_DISTANCE = 8;

const getScrollContainer = (target) => {
  if (target && target !== document && target !== document.documentElement && target !== window) {
    return target;
  }
  return document.scrollingElement || document.documentElement;
};

export const useScrollDirectionHide = ({ enabled, forceVisible }) => {
  const hidden = ref(false);
  const positions = new WeakMap();
  let activeContainer = null;
  let travel = 0;
  let frameId = 0;
  let pendingTarget = null;

  const reveal = () => {
    hidden.value = false;
    travel = 0;
  };

  const evaluate = () => {
    frameId = 0;
    if (!enabled.value || forceVisible.value || !pendingTarget) {
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

    if (travel >= HIDE_DISTANCE) {
      hidden.value = true;
      travel = 0;
    } else if (travel <= -SHOW_DISTANCE) {
      hidden.value = false;
      travel = 0;
    }
  };

  const handleScroll = (event) => {
    pendingTarget = event?.target || document;
    if (!frameId) frameId = window.requestAnimationFrame(evaluate);
  };

  const reset = () => {
    activeContainer = null;
    pendingTarget = null;
    reveal();
  };

  watch([enabled, forceVisible], () => {
    if (!enabled.value || forceVisible.value) reset();
  }, { immediate: true });

  onMounted(() => {
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener('scroll', handleScroll, { capture: true });
    if (frameId) window.cancelAnimationFrame(frameId);
  });

  return { hidden, reset };
};

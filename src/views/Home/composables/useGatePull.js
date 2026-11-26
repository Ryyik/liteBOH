import { computed, ref } from 'vue';
import { readGatePassed, markGatePassed } from '@/utils/home-gate-storage.js';

const GATE_TIMINGS = {
  normal: { holdMs: 2000, fadeMs: 560, focusMs: 700, navEnterMs: 900 },
  reduced: { holdMs: 2000, fadeMs: 300, focusMs: 300, navEnterMs: 320 },
};

export function useGateOverlay() {
  const reduceMotion = ref(false);
  let reduceQuery = null;

  const prefersReducedMotion = () => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };
  reduceMotion.value = prefersReducedMotion();
  const gateTimings = () => (reduceMotion.value ? GATE_TIMINGS.reduced : GATE_TIMINGS.normal);

  const gateAlreadyPassed = readGatePassed();
  const gateDismissed = ref(gateAlreadyPassed);
  const gateLeaving = ref(false);
  const forumOpen = ref(gateAlreadyPassed);
  const forumEntering = ref(false);
  const bottomNavReady = ref(gateAlreadyPassed);
  const gateSettled = ref(gateAlreadyPassed);

  const fadeDurationMs = computed(() => gateTimings().fadeMs);
  const bottomNavEnterMs = computed(() => gateTimings().navEnterMs);
  const focusDurationMs = computed(() => gateTimings().focusMs);

  let autoTimer = null;
  let finishTimer = null;
  let focusTimer = null;

  const lockDocumentScroll = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
  };

  const unlockDocumentScroll = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
  };

  const clearAutoTimer = () => {
    if (autoTimer) window.clearTimeout(autoTimer);
    autoTimer = null;
  };

  const clearFinishTimer = () => {
    if (finishTimer) window.clearTimeout(finishTimer);
    finishTimer = null;
  };

  const finishGate = () => {
    if (gateDismissed.value) return;
    clearFinishTimer();
    gateDismissed.value = true;
    gateSettled.value = true;
    forumEntering.value = true;
    bottomNavReady.value = true;
    unlockDocumentScroll();
    if (focusTimer) window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      focusTimer = null;
      forumEntering.value = false;
    }, gateTimings().focusMs);
  };

  const scheduleFinish = () => {
    clearFinishTimer();
    // 动画结束后再卸载，80ms 覆盖帧调度误差。
    finishTimer = window.setTimeout(finishGate, gateTimings().fadeMs + 80);
  };

  const commitGate = () => {
    if (gateLeaving.value || gateDismissed.value) return;
    clearAutoTimer();
    teardownGateKeys();
    window.scrollTo({ top: 0, behavior: 'auto' });
    lockDocumentScroll();
    gateLeaving.value = true;
    forumOpen.value = true;
    markGatePassed();
    scheduleFinish();
  };

  const gateActive = () => !gateLeaving.value && !gateDismissed.value;

  const handleGateKeydown = (event) => {
    if (!gateActive()) return;
    const skipKeys = ['ArrowDown', 'Enter', ' ', 'Spacebar', 'Escape'];
    if (!skipKeys.includes(event.key)) return;
    event.preventDefault();
    commitGate();
  };

  const teardownGateKeys = () => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', handleGateKeydown);
  };

  const setupGateKeys = () => {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', handleGateKeydown);
  };

  const onReduceMotionChange = (event) => {
    reduceMotion.value = Boolean(event.matches);
    if (gateLeaving.value) scheduleFinish();
  };

  const mounted = () => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia === 'function') {
      reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduceMotion.value = reduceQuery.matches;
      if (typeof reduceQuery.addEventListener === 'function') {
        reduceQuery.addEventListener('change', onReduceMotionChange);
      } else if (typeof reduceQuery.addListener === 'function') {
        reduceQuery.addListener(onReduceMotionChange);
      }
    }
    if (gateAlreadyPassed) return;
    lockDocumentScroll();
    setupGateKeys();
    clearAutoTimer();
    autoTimer = window.setTimeout(commitGate, gateTimings().holdMs);
  };

  const unmounted = () => {
    teardownGateKeys();
    clearAutoTimer();
    clearFinishTimer();
    if (focusTimer) window.clearTimeout(focusTimer);
    focusTimer = null;
    if (reduceQuery) {
      if (typeof reduceQuery.removeEventListener === 'function') {
        reduceQuery.removeEventListener('change', onReduceMotionChange);
      } else if (typeof reduceQuery.removeListener === 'function') {
        reduceQuery.removeListener(onReduceMotionChange);
      }
      reduceQuery = null;
    }
    unlockDocumentScroll();
  };

  return {
    gateDismissed,
    gateLeaving,
    forumOpen,
    forumEntering,
    gateSettled,
    bottomNavReady,
    fadeDurationMs,
    bottomNavEnterMs,
    focusDurationMs,
    commitGate,
    mounted,
    unmounted,
  };
}

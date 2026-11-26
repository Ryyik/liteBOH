import { ref } from 'vue';

export const FORUM_PULL_THRESHOLD = 72;
export const FORUM_PULL_MAX_DISTANCE = 112;
const FORUM_PULL_HOLD_DISTANCE = 52;
const FORUM_PULL_RESPONSE = 0.34;
const GESTURE_INTENT_THRESHOLD = 10;

export function getForumPullDistance(rawDistance, viewportHeight = 844) {
  const distance = Math.max(0, Number(rawDistance) || 0);
  const dimension = Math.max(1, Number(viewportHeight) || 1);
  const resisted = (distance * dimension * 0.55) / (dimension + 0.55 * distance);
  return Math.min(FORUM_PULL_MAX_DISTANCE, resisted);
}

export function useForumPullToRefresh({ contentRef, getScrollContainer, isEnabled, onRefresh }) {
  const isActive = ref(false);
  const isRefreshing = ref(false);
  let gesture = null;
  let currentDistance = 0;
  let releaseVelocity = 0;
  let animationFrame = 0;
  let settleResolve = null;
  let attached = false;

  const renderDistance = (distance) => {
    currentDistance = Math.max(0, distance);
    const root = contentRef?.value?.parentElement;
    if (!root?.style?.setProperty) return;
    root.style.setProperty('--forum-pull-distance', `${currentDistance.toFixed(2)}px`);
    root.style.setProperty('--forum-pull-rotation', `${(currentDistance * 3).toFixed(2)}deg`);
    root.style.setProperty('--forum-pull-opacity', String(Math.min(1, currentDistance / 36)));
  };

  const stopSettling = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const resolve = settleResolve;
    settleResolve = null;
    resolve?.();
  };

  const settleTo = (target) => {
    stopSettling();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      renderDistance(target);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      settleResolve = resolve;
      let value = currentDistance;
      let velocity = releaseVelocity;
      let previousTime = performance.now();
      const stiffness = ((2 * Math.PI) / FORUM_PULL_RESPONSE) ** 2;
      const damping = 2 * Math.sqrt(stiffness);

      const step = (now) => {
        const delta = Math.min(0.032, Math.max(0.001, (now - previousTime) / 1000));
        previousTime = now;
        velocity += (-stiffness * (value - target) - damping * velocity) * delta;
        value += velocity * delta;
        if (target === 0 && value < 0) {
          value = 0;
          velocity = 0;
        }
        if (Math.abs(value - target) < 0.35 && Math.abs(velocity) < 6) {
          renderDistance(target);
          animationFrame = 0;
          const done = settleResolve;
          settleResolve = null;
          done?.();
          return;
        }
        renderDistance(value);
        animationFrame = requestAnimationFrame(step);
      };
      animationFrame = requestAnimationFrame(step);
    });
  };

  const readScrollTop = () => {
    const scroller = getScrollContainer?.();
    if (!scroller || scroller === window) return Math.max(0, window.scrollY || 0);
    return Math.max(0, scroller.scrollTop || 0);
  };

  const cancelGesture = () => {
    gesture = null;
    if (isActive.value && !isRefreshing.value) {
      void settleTo(0).then(() => {
        if (attached && !gesture) isActive.value = false;
      });
    }
  };

  const handleTouchStart = (event) => {
    if (
      !isEnabled?.() ||
      isRefreshing.value ||
      event.touches?.length !== 1 ||
      readScrollTop() > 1
    ) {
      return;
    }
    const target = event.target;
    const root = contentRef?.value?.parentElement;
    if (root?.contains && !root.contains(target)) return;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    stopSettling();
    const touch = event.touches[0];
    gesture = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      lastTime: performance.now(),
      velocity: 0,
      pulling: false,
    };
  };

  const handleTouchMove = (event) => {
    if (!gesture || event.touches?.length !== 1) {
      if (gesture) cancelGesture();
      return;
    }
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) {
      cancelGesture();
      return;
    }
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (!gesture.pulling) {
      if (Math.abs(deltaX) > GESTURE_INTENT_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        cancelGesture();
        return;
      }
      if (deltaY <= GESTURE_INTENT_THRESHOLD || readScrollTop() > 1) {
        if (deltaY < -GESTURE_INTENT_THRESHOLD) cancelGesture();
        return;
      }
      gesture.pulling = true;
      isActive.value = true;
    }
    if (deltaY <= 0 || readScrollTop() > 1) {
      cancelGesture();
      return;
    }
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    const instantVelocity = ((touch.clientY - gesture.lastY) / elapsed) * 1000;
    gesture.velocity = gesture.velocity * 0.65 + instantVelocity * 0.35;
    gesture.lastY = touch.clientY;
    gesture.lastTime = now;
    renderDistance(getForumPullDistance(deltaY, window.innerHeight));
  };

  const handleTouchEnd = () => {
    if (!gesture) return;
    const completed = gesture.pulling;
    releaseVelocity = completed ? gesture.velocity : 0;
    gesture = null;
    if (!completed) return;
    if (currentDistance < FORUM_PULL_THRESHOLD) {
      void settleTo(0).then(() => {
        if (attached && !gesture) isActive.value = false;
      });
      return;
    }
    isRefreshing.value = true;
    releaseVelocity = 0;
    const hold = settleTo(FORUM_PULL_HOLD_DISTANCE);
    const refresh = Promise.resolve().then(() => onRefresh?.());
    void refresh
      .finally(() => hold)
      .then(() => {
        if (attached) return settleTo(0);
      })
      .finally(() => {
        isRefreshing.value = false;
        isActive.value = false;
      });
  };

  const attach = () => {
    if (typeof window === 'undefined') return;
    detach();
    attached = true;
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', cancelGesture, { passive: true });
  };

  const detach = () => {
    attached = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', cancelGesture);
    }
    stopSettling();
    gesture = null;
    releaseVelocity = 0;
    isRefreshing.value = false;
    isActive.value = false;
    renderDistance(0);
  };

  return { isActive, isRefreshing, attach, detach };
}

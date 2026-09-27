import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isGlobalNavbarVisible } from '@/utils/global-navbar-visibility.js';

const isOpen = ref(false);
const theme = ref('light');

const dragProgress = ref(1);
const isDragging = ref(false);
const openRequestId = ref(0);
// Prompt passed by another view is held until the overlay has mounted its chat API.
const pendingPrompt = ref('');
// Seed 期望的模型模式（如论坛「问BOHAI」默认走 fast）：与 pendingPrompt 同生命周期
const pendingMode = ref('');

let resolveOverlayHeight = () => {
  if (typeof window !== 'undefined') return window.innerHeight;
  return 800;
};
let dragStartY = 0;
let dragProgressBefore = 0;
let closeTimeout = null;

function useSharedState() {
  const route = useRoute();

  const canOpen = computed(() => {
    if (route.name === 'AiChat') return false;
    /* ⚠️ 岛体挂在 UnifiedNavbar 内 —— 导航栏是否渲染必须与 App.vue **同源**判断。
       这里曾只判 route.meta.hideNavbar，漏了 embed=desktop / from=userspace /
       user-space 子视图这几类「导航栏已隐藏但 meta 没标记」的路由，
       结果 showIsland.ai() 静默返回 false，用户看到「AI 岛当前不可用，请稍后再试」
       —— 在带论坛列表的 user-space 子视图里这是必然发生，不是偶发。
       （详见 utils/global-navbar-visibility.js 顶部说明） */
    if (!isGlobalNavbarVisible(route)) return false;
    return true;
  });

  function open(options = {}) {
    if (!canOpen.value) return;
    if (typeof options.prompt === 'string' && options.prompt.trim()) {
      pendingPrompt.value = options.prompt;
    }
    pendingMode.value = typeof options.mode === 'string' ? options.mode.trim() : '';
    cancelScheduledClose();
    isOpen.value = true;
    dragProgress.value = Number(options.snap) === 2 ? 2 : 1;
    isDragging.value = false;
    openRequestId.value += 1;
  }

  function close() {
    cancelScheduledClose();
    isOpen.value = false;
    dragProgress.value = 1;
    isDragging.value = false;
  }

  function toggle() {
    if (isOpen.value) close();
    else open();
  }

  function consumePendingPrompt() {
    const prompt = pendingPrompt.value;
    pendingPrompt.value = '';
    return prompt;
  }

  /** 消费种子期望的模型模式（一次性，与 consumePendingPrompt 搭配使用） */
  function consumePendingMode() {
    const mode = pendingMode.value;
    pendingMode.value = '';
    return mode;
  }

  function syncTheme() {
    const html = document.documentElement;
    theme.value = html.getAttribute('data-theme') || 'light';
  }

  function setOverlayHeight(fn) {
    resolveOverlayHeight = fn;
  }

  function startDrag(clientY) {
    if (!canOpen.value) return;
    cancelScheduledClose();
    dragProgressBefore = isOpen.value ? dragProgress.value : 0;
    if (!isOpen.value) {
      isOpen.value = true;
    }
    isDragging.value = true;
    dragStartY = clientY;
  }

  function moveDrag(clientY) {
    if (!isDragging.value) return;
    const maxHeight = resolveOverlayHeight();
    const distance = dragStartY - clientY;
    const target = dragProgressBefore + distance / (maxHeight * 0.5);
    dragProgress.value = Math.max(0, Math.min(2, target));
  }

  function endDrag() {
    if (!isDragging.value) return;
    isDragging.value = false;
    if (dragProgress.value > 1.25) {
      dragProgress.value = 2;
    } else if (dragProgress.value > 0.25) {
      dragProgress.value = 1;
    } else {
      dragProgress.value = 0;
      scheduleClose(600);
    }
  }

  function scheduleClose(delay) {
    cancelScheduledClose();
    closeTimeout = setTimeout(() => {
      isOpen.value = false;
      closeTimeout = null;
    }, delay);
  }

  function cancelScheduledClose() {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  }

  watch(isOpen, (val) => {
    if (val) syncTheme();
  });

  return {
    isOpen,
    theme,
    canOpen,
    openRequestId,
    dragProgress,
    isDragging,
    pendingPrompt,
    open,
    close,
    toggle,
    syncTheme,
    setOverlayHeight,
    startDrag,
    moveDrag,
    endDrag,
    consumePendingPrompt,
    consumePendingMode,
  };
}

let singleton = null;

export function useGlobalAiOverlay() {
  if (!singleton) {
    singleton = useSharedState();
  }
  return singleton;
}

<template>
  <Teleport to="body">
    <!-- 根节点不拦截点击（pointer-events 下放给胶囊与卡片）；
         data-theme 恒为 dark —— 岛本体是深色材质（iOS 同款识别度），
         搜索面板的暗色分支（低透明白叠色）因此在任意页面主题下都成立 -->
    <div class="boh-island-root" data-theme="dark" :class="{ open: isOpen }">
      <!-- 常驻胶囊：竖屏待命入口（桌面不常驻 —— 导航栏搜索按钮 + `/` 是桌面入口） -->
      <button
        v-if="pillVisible"
        type="button"
        class="boh-pill"
        :style="islandPos"
        aria-label="问一句：搜索全站或问 BOHAI"
        @click="open"
      >
        <Sparkles :size="14" :stroke-width="2.2" aria-hidden="true" />
        <span class="boh-pill-text">问一句</span>
      </button>

      <!-- 展开卡：输入条恒为第一个可见子元素 ⇒ 各面之间输入框逐像素不动 -->
      <div
        v-if="isOpen"
        class="boh-card"
        :style="islandPos"
        role="dialog"
        aria-label="搜索与问一句"
      >
        <!-- 搜索面：v-show 保活（查询词/历史/滚动位在 Esc 往返间不丢） -->
        <SearchIslandPanel
          v-show="face === 'search'"
          :on-close="close"
          :on-esc="handleEsc"
          :on-action="runAction"
          :on-ask="ask"
        />
        <!-- 回答面（§3.5）：引擎长在组件里，只在首次进入回答面时挂载；
             关岛即卸载（引擎 onScopeDispose 中止流，不留后台生成） -->
        <BohIslandAnswer v-if="answerMounted" v-show="face === 'answer'" :on-close="close" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Sparkles } from 'lucide-vue-next';
import { useBohIsland, scheduleSearchPanelPrefetch } from '@/composables/useBohIsland.js';
import BohIslandAnswer from '@/components/BohIslandAnswer.vue';

/**
 * BohIsland —— plans/038：一颗岛装下搜索与「问一句」。
 *
 * App 级挂载（App.vue），Teleport 到 body：
 *   · hideNavbar / user-space 子视图等无导航栏路由照样可用；
 *   · 与导航 surface 零几何耦合 —— 不再撑高、不再与任务岛/通知岛仲裁。
 *   · P3 入口收敛后全站唯一 AI 岛：⌘K（App.vue）与 showIsland.ai() 都落在本岛。
 *
 * 落位：top = 导航栏底边 + 12（导航栏在场时实测其 bottom，缺席时退 safe-area + 12）；
 * 水平居中悬浮（plans/038 §3.1）。
 */
const {
  isOpen,
  face,
  canOpen,
  open,
  close,
  toggle,
  ask,
  backToSearch,
  runAction,
  SearchIslandPanel,
} = useBohIsland();

/* ---------------- Esc 分层（§3.3）：回答面退回搜索面，搜索面直接关岛 ---------------- */

const handleEsc = () => {
  if (face.value === 'answer') backToSearch();
  else close();
};

// 根级 Esc：岛开着时接住焦点不在搜索输入框上的 Esc（回答面输入框、点过页面之后等）。
// 搜索面输入框自己的 Esc handler 会 stopPropagation，不会到这里 —— 不双发。
const handleRootEsc = (event) => {
  if (event.key !== 'Escape' || !isOpen.value) return;
  event.preventDefault();
  handleEsc();
};
document.addEventListener('keydown', handleRootEsc);

/** 回答组件只在首次进入回答面时挂载；关岛即卸载（不留后台生成） */
const answerMounted = ref(false);
watch(face, (val) => {
  if (val === 'answer') answerMounted.value = true;
});
watch(isOpen, (val) => {
  if (!val) answerMounted.value = false;
});

/* ---------------- 落位：跟随导航栏底边 ---------------- */

const islandTop = ref(84);

const measureTop = () => {
  // 导航栏在场 → 岛挂在它下方 12px；缺席（hideNavbar 路由）→ 12px + safe-area
  const nav = document.querySelector('#unified-nav-container');
  const bottom = nav ? nav.getBoundingClientRect().bottom : 0;
  islandTop.value = bottom > 0 ? Math.round(bottom + 12) : 12;
};

const islandPos = computed(() => ({ '--boh-island-top': `${islandTop.value}px` }));

watch(isOpen, (val) => {
  if (val) nextTick(measureTop);
});

/* ---------------- 胶囊可见性：竖屏常驻，桌面不常驻（§2.9） ---------------- */

const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)') : null;
const isNarrow = ref(narrowQuery ? narrowQuery.matches : false);

const onNarrowChange = (e) => {
  isNarrow.value = e.matches;
};

const pillVisible = computed(() => canOpen.value && isNarrow.value && !isOpen.value);

/* ---------------- `/` 快捷键（自 useGlobalSearch.js 迁入 —— 岛必须不依赖导航栏） ---------------- */

const handleShortcut = (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key !== '/') return;
  // 岛已开时焦点就在面板输入框里 —— 此时按 / 的意图是「关掉它」，
  // 不能走下面的输入态豁免（否则会往输入框里打一个斜杠，快捷键形同失效）。
  if (!isOpen.value) {
    const active = document.activeElement;
    const tag = String(active?.tagName || '').toLowerCase();
    // 输入态不拦截（用户正在打字时按 / 就是在输入斜杠）
    if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;
  }
  event.preventDefault();
  if (!canOpen.value) return;
  toggle();
};

/** ⌘K 再按 = 聚焦输入条（App.vue 派发 boh-ai-focus-composer；全页 useBohShell 也监听同一事件） */
const handleFocusComposer = () => {
  if (!isOpen.value) {
    open();
    return;
  }
  nextTick(() => {
    const selector = face.value === 'answer' ? '.boh-answer-input' : '.gs-input';
    document.querySelector(`.boh-island-root ${selector}`)?.focus?.();
  });
};

const onResize = () => {
  if (isOpen.value) measureTop();
};

onMounted(() => {
  window.addEventListener('keydown', handleShortcut);
  window.addEventListener('resize', onResize);
  window.addEventListener('boh-ai-focus-composer', handleFocusComposer);
  narrowQuery?.addEventListener?.('change', onNarrowChange);
  // 首屏空闲预热搜索面板 chunk（弱网/省流量下跳过，见 useBohIsland.js）
  scheduleSearchPanelPrefetch();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('boh-ai-focus-composer', handleFocusComposer);
  narrowQuery?.removeEventListener?.('change', onNarrowChange);
  document.removeEventListener('keydown', handleRootEsc);
  close();
});
</script>

<style>
/* 非 scoped：Teleport 到 body，样式必须全局可寻址（probe-nav-ask 直接查这些类名）。
   命名空间 boh- 前缀防冲突。 */
.boh-island-root {
  position: fixed;
  inset: 0;
  z-index: 90; /* 导航栏容器之上（surface z 序见 style.scoped.css），模态语义允许盖住页面 */
  pointer-events: none;
  font-family: inherit;
}

.boh-island-root .boh-pill,
.boh-island-root .boh-card {
  pointer-events: auto;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  top: calc(var(--boh-island-top, 84px) + env(safe-area-inset-top, 0px));
}

/* ---------------- 胶囊（待命态 148×40） ---------------- */

.boh-island-root .boh-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: 148px;
  height: 40px;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(40, 40, 46, 0.94), rgba(24, 24, 28, 0.96));
  color: #f5f5f7;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow:
    0 12px 32px rgba(10, 12, 20, 0.38),
    0 2px 8px rgba(10, 12, 20, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  transition:
    transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1),
    box-shadow 240ms ease;
}

.boh-island-root .boh-pill:hover {
  transform: translateX(-50%) translateY(1px);
  box-shadow:
    0 16px 40px rgba(10, 12, 20, 0.44),
    0 2px 8px rgba(10, 12, 20, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.boh-island-root .boh-pill:active {
  transform: translateX(-50%) scale(0.97);
}

.boh-island-root .boh-pill svg {
  color: #c4b5fd;
}

.boh-pill-text {
  line-height: 1;
}

/* ---------------- 展开卡 ---------------- */

.boh-island-root .boh-card {
  width: min(352px, calc(100vw - 32px));
  max-height: clamp(
    240px,
    calc(100dvh - var(--boh-island-top, 84px) - 12px - var(--kb-inset, 0px)),
    560px
  );
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(38, 38, 44, 0.94), rgba(24, 24, 28, 0.96));
  box-shadow:
    0 24px 64px rgba(10, 12, 20, 0.46),
    0 4px 16px rgba(10, 12, 20, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  overflow: hidden;
  animation: bohIslandIn 320ms cubic-bezier(0.34, 1.3, 0.64, 1);
  transform: translateX(-50%);
}

@keyframes bohIslandIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

@media (min-width: 1024px) {
  .boh-island-root .boh-card {
    width: min(560px, calc(100vw - 48px));
  }
}

/* 展开卡内的搜索面板：撑满卡片。⚠️ 必须 basis auto（不能 flex:1）——
   卡片高度由内容撑起、仅 max-height 封顶，basis 0 会把内容高度算成 0，
   结果行全部溢出隐藏（2026-11-04 实测踩坑：gs-body clientHeight=0）。 */
.boh-island-root .boh-card > * {
  flex: 1 1 auto;
  min-height: 0;
}
</style>

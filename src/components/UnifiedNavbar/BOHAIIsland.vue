<template>
  <Transition name="bohai-island-fade">
    <div
      v-if="isExpanded"
      class="bohai-island"
      :data-theme="theme"
      :class="{ 'is-thinking': isThinking, 'is-empty': isEmpty }"
      role="dialog"
      aria-label="BOH AI 灵动岛"
    >
      <!-- 顶部 header：状态 + 全屏按钮 -->
      <div class="bohai-island-header">
        <span class="bohai-island-header-icon" aria-hidden="true">
          <Sparkles v-if="!isThinking" :size="16" :stroke-width="2.1" />
          <LoaderCircle v-else class="spin" :size="16" :stroke-width="2.1" />
        </span>
        <span class="bohai-island-header-text">
          <template v-if="isEmpty"><strong>BOH AI</strong> 已就绪</template>
          <template v-else-if="isThinking"><strong>BOH AI</strong> 正在思考...</template>
          <template v-else><strong>BOH AI</strong> 对话中</template>
        </span>
        <div class="bohai-island-header-actions">
          <button
            type="button"
            class="bohai-island-icon-btn"
            title="新对话"
            aria-label="新对话"
            @click="onNewChat"
          >
            <Plus :size="15" :stroke-width="2.1" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="bohai-island-icon-btn"
            title="在完整页面打开"
            aria-label="在完整页面打开"
            @click="openFullscreen"
          >
            <Maximize2 :size="14" :stroke-width="2.1" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="bohai-island-icon-btn"
            title="关闭"
            aria-label="关闭"
            @click="collapse"
          >
            <X :size="14" :stroke-width="2.1" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- 中间：BOHAIMain 内嵌消息流（去气泡化） -->
      <div class="bohai-island-chat">
        <BOHAIMain
          ref="bohaiMainRef"
          embedded
          :overlay-mode="true"
          :quick-active="false"
          :quick-suggestions="[]"
          @island-message="onIslandMessage"
          @overlay-state="onOverlayState"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LoaderCircle, Maximize2, Plus, Sparkles, X } from 'lucide-vue-next';
import { defineAsyncComponent } from 'vue';
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay';

const BOHAIMain = defineAsyncComponent(() => import('@/views/BOHAI/BOHAI/BOHAIMain.vue'));

const route = useRoute();
const router = useRouter();
// 岛状态与开关逻辑（原 useBohaiIsland 薄包装，已内联）：
// 完全复用 useGlobalAiOverlay 单例的 isOpen / open / close，零侵入
const { isOpen, canOpen, close, consumePendingPrompt, consumePendingMode, pendingPrompt } =
  useGlobalAiOverlay();

// 岛"展开"的判定：overlay 打开 + 路由允许（避开 /ai-chat 避免双实例）
const isExpanded = computed(() => isOpen.value && canOpen.value);

// 路由进入 /ai-chat 时强制关闭岛（避免 BOHAIChat 同时挂在岛和全屏）
watch(
  () => route.name,
  (name) => {
    if (name === 'AiChat' && isOpen.value) close();
  },
  { immediate: true },
);

// 岛内触发关闭（如用户按 ESC、点 X）
const collapse = () => close();

// 岛内触发全屏跳转（右上角 ↗ 按钮）
const openFullscreen = async () => {
  close();
  await router.push('/ai-chat');
};

const theme = computed(() => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
});

const bohaiMainRef = ref(null);
const isThinking = ref(false);
const isEmpty = ref(true);

// 等待 BOHAIMain 异步组件加载并完成初始化（有界等待，避免死循环）
const waitForChatApi = async (timeoutMs = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof bohaiMainRef.value?.appendAndSend === 'function') return true;
    await nextTick();
    await new Promise((r) => setTimeout(r, 50));
  }
  return Boolean(bohaiMainRef.value?.appendToComposer);
};

// 消费外部传入的种子 prompt（健康页「用 BOH AI 分析」、论坛「问BOHAI」等场景）。
// 此前消费逻辑只存在于已无人挂载的 GlobalAiGlassOverlay 中，种子 prompt 永远丢失。
// 种子可携带期望模型模式（mode）：发送前静默切换，不弹模式通知。
const tryConsumeSeedPrompt = async () => {
  const prompt = consumePendingPrompt();
  const mode = consumePendingMode();
  if (!prompt) return;
  const applySeedMode = () => {
    if (mode && typeof bohaiMainRef.value?.applySeedMode === 'function') {
      bohaiMainRef.value.applySeedMode(mode);
    }
  };
  const ready = await waitForChatApi();
  if (ready && typeof bohaiMainRef.value?.appendAndSend === 'function') {
    applySeedMode();
    bohaiMainRef.value.appendAndSend(prompt);
  } else {
    // 降级：至少把内容填进输入框，用户可以手动点发送
    applySeedMode();
    bohaiMainRef.value?.appendToComposer?.(prompt);
  }
};

// 监听展开：聚焦输入框 + 消费滞留的种子 prompt
watch(isExpanded, async (val) => {
  if (!val) return;
  await nextTick();
  // 等 BOHAIMain 异步加载完成
  requestAnimationFrame(() => {
    bohaiMainRef.value?.focusComposer?.();
  });
  tryConsumeSeedPrompt();
});

// 岛已展开时又收到新的 open({prompt})（isExpanded 不会变化），同样立即消费，
// 防止 prompt 滞留到下一次无关的打开
watch(pendingPrompt, (val) => {
  if (val && isExpanded.value) tryConsumeSeedPrompt();
});

// ESC 关闭：优先交给 BOHAIMain 处理分层 ESC（功能菜单/设置/侧栏），全关后再收岛
const handleKeydown = (e) => {
  if (e.key !== 'Escape') return;
  const handled = bohaiMainRef.value?.handleEscapeLayer?.();
  if (!handled) collapse();
};
watch(isExpanded, (val) => {
  if (val) document.addEventListener('keydown', handleKeydown);
  else document.removeEventListener('keydown', handleKeydown);
});
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function onIslandMessage(payload) {
  // 预留：BOHAIMain 主动发的岛消息
  if (payload?.type === 'thinking') {
    isThinking.value = payload.value;
  }
  if (payload?.type === 'empty') {
    isEmpty.value = payload.value;
  }
}

function onOverlayState(state) {
  // overlayMode 下 BOHAIMain 会 emit 状态变化
  if (state?.thinking !== undefined) isThinking.value = state.thinking;
  if (state?.empty !== undefined) isEmpty.value = state.empty;
}

function onNewChat() {
  bohaiMainRef.value?.startNewChat?.();
}
</script>

<style scoped>
/* ============================================
   BOHAI 灵动岛样式（纯 CSS，用 :global() 穿透 scoped 覆盖 BOHAIMain）
   ============================================ */

/* ---- Transition 包裹层：进场/退场与 surface 高度过渡同步 500ms ---- */
.bohai-island-fade-enter-active,
.bohai-island-fade-leave-active {
  transition:
    opacity 420ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 500ms cubic-bezier(0.16, 1, 0.3, 1),
    clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* 进场起始：在顶栏缝隙里缩成一条线，透明 */
.bohai-island-fade-enter-from {
  opacity: 0;
  transform: translateY(-18px) scale(0.9);
  clip-path: inset(0 0 100% 0 round 24px);
}

/* 进场结束：正常形态（与 leave-from 对称） */
.bohai-island-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
  clip-path: inset(0 round 24px);
}

/* 退场起始：正常形态 */
.bohai-island-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  clip-path: inset(0 round 24px);
}

/* 退场结束：缩回顶栏缝隙，从底部向上收 */
.bohai-island-fade-leave-to {
  opacity: 0;
  transform: translateY(-18px) scale(0.9);
  clip-path: inset(0 0 100% 0 round 24px);
}

@media (prefers-reduced-motion: reduce) {
  .bohai-island-fade-enter-active,
  .bohai-island-fade-leave-active {
    transition-duration: 160ms;
  }
}

/* ============================================
   顶栏 surface 形态联动
   ============================================ */
:global(.unified-nav-surface.has-bohai-island) {
  --bohai-island-top: var(--global-nav-rest-height, 72px);
  --bohai-island-bottom-gap: 12px;
  --bohai-island-height: min(50vh, 520px);
  height: calc(
    var(--bohai-island-top) + var(--bohai-island-height) + var(--bohai-island-bottom-gap)
  ) !important;
  border-radius: 30px !important;
  background-color: rgba(255, 255, 255, 0.56);
  box-shadow:
    0 18px 48px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  /* transition 沿用 surface 默认 500ms cubic-bezier(0.16,1,0.3,1)，
     与岛的 Vue Transition 严格同步，进出节奏一致 */
}

:global(.unified-nav-surface.has-bohai-island) > :global(.nav-container) {
  position: relative;
  z-index: 3;
  height: var(--global-nav-rest-height, 72px);
}

/* ============================================
   岛本体
   ============================================ */
:global(.bohai-island) {
  position: absolute;
  z-index: 2;
  top: var(--bohai-island-top);
  right: 7px;
  left: 7px;
  display: flex;
  flex-direction: column;
  gap: 0;
  height: var(--bohai-island-height);
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 24px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.3));
  box-shadow:
    0 14px 32px rgba(29, 41, 56, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  overflow: hidden;
  transform-origin: center top;
  will-change: transform, opacity;
}

/* 注：钻出动画完全由 Vue <Transition name="bohai-island-fade"> 接管，
   与 surface 的 height 过渡（380ms, cubic-bezier(0.16,1,0.3,1)）严格同步。
   不再用元素自身 keyframes，避免进场双动画叠加。 */

/* ============================================
   顶部 header
   ============================================ */
:global(.bohai-island-header) {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  color: #334155;
}

:global(.bohai-island-header-icon) {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: #6d38c8;
  background: linear-gradient(135deg, #eee4ff, #f6efff);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

:global(.bohai-island-header-icon .spin) {
  animation: bohaiIslandSpin 1.2s linear infinite;
}

@keyframes bohaiIslandSpin {
  to {
    transform: rotate(360deg);
  }
}

:global(.bohai-island-header-text) {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 560;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(.bohai-island-header-text strong) {
  color: #1d2938;
  font-weight: 700;
}

:global(.bohai-island-header-actions) {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

:global(.bohai-island-icon-btn) {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.34);
  color: #465569;
  cursor: pointer;
  transition:
    transform 140ms ease,
    background-color 160ms ease,
    color 160ms ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

:global(.bohai-island-icon-btn:hover) {
  background: rgba(255, 255, 255, 0.6);
  color: #1d2938;
  transform: translateY(-1px);
}

:global(.bohai-island-icon-btn:active) {
  transform: scale(0.94);
}

/* ============================================
   聊天区域（内嵌 BOHAIMain）
   ============================================
   2026-10-08（plans/025 v2 · Step 6）：BOHAIMain 的 UI 树已整体重写为 `Boh*` 组件。
   岛形态**不再靠 `:global()` 覆盖去改造内部 DOM** —— 新组件自己认识岛：
   · 侧栏与顶栏在岛形态下**根本不渲染**（`v-if="!props.overlayMode"`，壳里）；
   · 消息流 / 输入区通过 `overlayMode` prop 拿到 `is-island` 类，样式在各自 scoped CSS 里。
   原先那 ~250 行指向 `.sidebar` / `.chat-container` / `.message-*` / `.composer-*` /
   `.empty-state` 的覆盖（含 40+ 个 `!important`）**随旧 DOM 一起删除**。 */
:global(.bohai-island-chat) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* （2026-10-08 删除：`.chat-container` 内边距 / 去气泡化 / 空态 / 输入区 /
   模式菜单页脚 共约 200 行 `:global()` 覆盖 —— 旧类名随旧 DOM 一起死。） */

/* ============================================
   暗色模式
   ============================================ */
:global(#unified-nav-container[data-theme='dark'] .bohai-island) {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35, 39, 49, 0.78), rgba(22, 25, 33, 0.58));
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

:global(#unified-nav-container[data-theme='dark'] .bohai-island-header) {
  border-bottom-color: rgba(255, 255, 255, 0.08);
  color: rgba(226, 232, 240, 0.86);
}

:global(#unified-nav-container[data-theme='dark'] .bohai-island-header-text strong) {
  color: #f8fafc;
}

:global(#unified-nav-container[data-theme='dark'] .bohai-island-header-icon) {
  background: linear-gradient(135deg, rgba(109, 56, 200, 0.32), rgba(79, 70, 229, 0.22));
  color: #c4b5fd;
}

:global(#unified-nav-container[data-theme='dark'] .bohai-island-icon-btn) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(226, 232, 240, 0.85);
}

:global(#unified-nav-container[data-theme='dark'] .bohai-island-icon-btn:hover) {
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

/* （2026-10-08 删除：暗色下指向 `.message-*` / `.composer-*` 的 8 条 `:global()` 覆盖 ——
   新组件用 `--boh-*` 令牌，暗色只切令牌值，不再需要第二套规则。） */

/* ============================================
   响应式
   ============================================ */
@media (max-width: 768px) {
  :global(.unified-nav-surface.has-bohai-island) {
    --bohai-island-height: min(54vh, 460px);
  }

  :global(.bohai-island) {
    right: 5px;
    left: 5px;
  }
}

@media (max-width: 480px) {
  :global(.bohai-island-header-icon) {
    width: 26px;
    height: 26px;
  }

  :global(.bohai-island-icon-btn) {
    width: 26px;
    height: 26px;
  }
}
</style>

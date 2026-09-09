<script setup>
/**
 * Beta6IslandCard — BETA 6 焕新详情自定义岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，高度自动上报撑开导航 surface。
 * 点击首页「了解焕新详情」唤起：头部行 + 高身可滚动详情区（全文直接呈现，无打字机）。
 * 生命周期自管理：停留 lingerMs 自动 onClose()；用户滚动阅读时重置倒计时，不被中途收走。
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
  /** 打完后停留时长 ms，随后自动关闭（用户滚动会重置） */
  lingerMs: { type: Number, default: 12000 },
  onAction: { type: Function, default: null },
  onClose: { type: Function, default: null },
});

const scrollEl = ref(null);
const scrollable = ref(false);
const atBottom = ref(false);
let closeTimer = null;

const measure = () => {
  const el = scrollEl.value;
  if (!el) return;
  scrollable.value = el.scrollHeight > el.clientHeight + 4;
  atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
};

const armAutoClose = () => {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => props.onClose?.(), Number(props.lingerMs) || 12000);
};

// 用户滚动：刷新可滚动状态 + 重置自动关闭倒计时（阅读中不被收走）
const onScroll = () => {
  measure();
  armAutoClose();
};

onMounted(() => {
  nextTick(measure);
  armAutoClose();
});

onUnmounted(() => {
  if (closeTimer) clearTimeout(closeTimer);
});
</script>

<template>
  <div class="beta6-island-card" role="status" aria-label="BETA 6 焕新详情">
    <div class="bi-head">
      <span class="bi-badge" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
      </span>
      <p class="bi-title">BOHLITE BETA 6 · 焕新体验</p>
      <button type="button" class="bi-cta" @click="onAction?.()">查看详情</button>
    </div>
    <div class="bi-scroller" :class="{ 'bi-mask': scrollable && !atBottom }">
      <div ref="scrollEl" class="bi-scroll" @scroll="onScroll">
        <p class="bi-text">{{ text }}</p>
      </div>
      <transition name="bi-fade">
        <span v-if="scrollable && !atBottom" class="bi-hint" aria-hidden="true">下滑查看更多 ↓</span>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.beta6-island-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  width: min(560px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 12px 14px 12px;
}

/* 头部：徽标 + 标题 + CTA */
.bi-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bi-badge {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #0071e3;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.32);
}

.bi-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #1d1d1f;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bi-cta {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #0071e3;
  color: #fff;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
}

.bi-cta:hover { background: #0077ed; transform: translateY(-1px); }
.bi-cta:active { transform: translateY(0); }
.bi-cta:focus-visible { outline: 2px solid #94a3b8; outline-offset: 2px; }

/* —— 高身长文滚动区 —— */
.bi-scroller {
  position: relative;
}

/* 未滑到底时底部渐隐，暗示下方还有内容（mask 方案亮暗色通用） */
.bi-scroller.bi-mask .bi-scroll {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 30px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 30px), transparent);
}

.bi-scroll {
  max-height: min(256px, 40vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.16) transparent;
}

.bi-scroll::-webkit-scrollbar { width: 4px; }
.bi-scroll::-webkit-scrollbar-track { background: transparent; }
.bi-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.16); border-radius: 999px; }

/* 详情正文：多行排版 */
.bi-text {
  font-size: 13px;
  line-height: 21px;
  color: #6e6e73;
  white-space: pre-line;
}

/* 「下滑查看更多」提示：悬浮于滚动区底部中央 */
.bi-hint {
  position: absolute;
  left: 50%;
  bottom: 2px;
  transform: translateX(-50%);
  padding: 3px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.10), inset 0 0 0 1px rgba(15, 23, 42, 0.05);
  font-size: 11px;
  font-weight: 600;
  color: #86868b;
  white-space: nowrap;
  pointer-events: none;
}

.bi-fade-enter-active,
.bi-fade-leave-active { transition: opacity 0.25s ease; }
.bi-fade-enter-from,
.bi-fade-leave-to { opacity: 0; }

/* 暗色：导航 surface 转深后同步换色（与 WallIslandCard 同款全局选择器写法） */
html[data-theme="dark"] .bi-title { color: #f2f5f8; }
html[data-theme="dark"] .bi-text { color: #8d99a8; }
html[data-theme="dark"] .bi-scroll { scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
html[data-theme="dark"] .bi-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.22); }
html[data-theme="dark"] .bi-hint {
  background: rgba(36, 40, 48, 0.88);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  color: #9aa4b2;
}

@media (max-width: 640px) {
  .beta6-island-card { width: calc(100vw - 24px); gap: 7px; padding: 10px 12px; }
  .bi-scroll { max-height: min(200px, 36vh); }
  .bi-cta { padding: 0 11px; }
}

@media (prefers-reduced-motion: reduce) {
  .bi-fade-enter-active,
  .bi-fade-leave-active { transition: none; }
}
</style>

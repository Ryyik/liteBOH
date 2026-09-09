<script setup>
/**
 * ContentDetailIsland — 新闻/活动详情全局导航栏自定义岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，内容高度自动上报撑开导航 surface，
 * 详情以「从导航栏向下延伸的玻璃卡」呈现，替代原页面内模态框（避免被导航遮挡）。
 *
 * 内容来源约定：
 * - type='news'：调用方传 html（须已在调用方过 DOMPurify），展示富文本正文；
 * - type='activity'：调用方传 paragraphs（string[]），组件内渲染为段落。
 * 关闭统一走 onClose 回调（× / Esc），由宿主负责 close() 岛槽位。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, Share2 } from 'lucide-vue-next';
import { CalendarDays, Newspaper, X } from 'lucide-vue-next';

const props = defineProps({
  // 'news' | 'activity'
  type: { type: String, default: 'news' },
  title: { type: String, default: '' },
  // 元信息行（调用方拼好：日期 · 分类 · 作者）
  meta: { type: String, default: '' },
  // 封面图（调用方已解析为可用 URL；空串则不渲染封面）
  image: { type: String, default: '' },
  // 新闻正文：已消毒 HTML（news 专用）
  html: { type: String, default: '' },
  // 活动介绍：纯文本段落数组（activity 专用）
  paragraphs: { type: Array, default: () => [] },
  // 分享落点路由（BETA 6 / S4，如 /news/:id）：传入则展示「分享」按钮，
  // 一键分享该独立页链接（独立页承载逐篇 OG 分享卡）；降级为复制链接
  pageRoute: { type: String, default: '' },
  onClose: { type: Function, default: null }
});

const requestClose = () => props.onClose?.();

// ---- 分享（S4）：Web Share API 优先，降级复制链接 ----
const shareState = ref('idle'); // idle | copied
let shareResetTimer = null;

const resolveShareUrl = () => {
  if (typeof window === 'undefined') return '';
  // hash 路由：绝对链接 = origin + pathname + '#<pageRoute>'
  return `${window.location.origin}${window.location.pathname}#${props.pageRoute}`;
};

const showCopiedHint = () => {
  shareState.value = 'copied';
  if (shareResetTimer) clearTimeout(shareResetTimer);
  shareResetTimer = setTimeout(() => {
    shareState.value = 'idle';
    shareResetTimer = null;
  }, 2200);
};

const sharePage = async () => {
  if (!props.pageRoute) return;
  const url = resolveShareUrl();
  const payload = { title: props.title || 'BOHLITE', text: props.title || '', url };
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share(payload); // 用户手势内调用 ✓（按钮 click）
      return; // 原生分享面板自行给出反馈
    }
  } catch (error) {
    if (error?.name === 'AbortError') return; // 用户取消分享面板，不算失败
    // 分享面板失败 → 落到复制降级
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showCopiedHint();
    }
  } catch (_error) { /* 剪贴板不可用时静默（极旧浏览器） */ }
};

const onImageError = (event) => {
  if (event?.target) event.target.style.display = 'none';
};

// Esc 关闭（与导航层交互习惯一致）
const onKeydown = (event) => {
  if (event.key === 'Escape') requestClose();
};

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="content-detail-island" role="dialog" aria-modal="false" :aria-label="title">
    <div class="cdi-head">
      <span class="cdi-chip" :class="`is-${type}`" aria-hidden="true">
        <Newspaper v-if="type === 'news'" :size="14" :stroke-width="2.1" />
        <CalendarDays v-else :size="14" :stroke-width="2.1" />
        <span>{{ type === 'news' ? '新闻' : '活动' }}</span>
      </span>
      <strong class="cdi-title">{{ title }}</strong>
      <button type="button" class="cdi-close" aria-label="关闭" @click="requestClose">
        <X :size="15" aria-hidden="true" />
      </button>
    </div>

    <div class="cdi-body">
      <img
        v-if="image"
        :src="image"
        :alt="title"
        class="cdi-cover"
        loading="lazy"
        decoding="async"
        @error="onImageError"
      />
      <span v-if="meta" class="cdi-meta">{{ meta }}</span>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="html" class="cdi-content cdi-rich" v-html="html"></div>
      <div v-else-if="paragraphs.length" class="cdi-content">
        <p v-for="(para, i) in paragraphs" :key="i">{{ para }}</p>
      </div>

      <!-- 分享（S4）：一键分享独立页链接（原生分享面板 / 降级复制） -->
      <button v-if="pageRoute" type="button" class="cdi-open-page" :class="{ 'is-copied': shareState === 'copied' }"
        :aria-label="shareState === 'copied' ? '链接已复制' : '分享这篇新闻'" @click="sharePage">
        <template v-if="shareState === 'copied'">
          <Check :size="13" :stroke-width="2.4" aria-hidden="true" />
          <span>链接已复制</span>
        </template>
        <template v-else>
          <Share2 :size="13" :stroke-width="2.1" aria-hidden="true" />
          <span>分享</span>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.content-detail-island {
  display: flex;
  flex-direction: column;
  max-height: min(76dvh, 720px);
  padding: 12px 14px 14px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 22px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.4));
  box-shadow: 0 14px 32px rgba(29, 41, 56, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  animation: cdi-in 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cdi-in {
  from { opacity: 0; transform: translateY(-8px); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

/* ---- 头部 ---- */
.cdi-head {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(100, 116, 139, 0.12);
}

.cdi-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 750;
  white-space: nowrap;
}

.cdi-chip.is-news { color: #1d62d4; background: rgba(29, 98, 212, 0.1); }
.cdi-chip.is-activity { color: #b45309; background: rgba(217, 119, 6, 0.12); }

.cdi-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #1d2938;
  font-size: 14px;
  font-weight: 760;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cdi-close {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #64748b;
  background: rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.cdi-close:hover { color: #1d2938; background: rgba(15, 23, 42, 0.1); }
.cdi-close:active { transform: scale(0.94); }

/* ---- 内容区（超高内部滚动） ---- */
.cdi-body {
  display: grid;
  gap: 9px;
  overflow-y: auto;
  min-height: 0;
  padding: 1px;
  scrollbar-width: thin;
}

.cdi-cover {
  width: 100%;
  max-height: min(34dvh, 300px);
  border-radius: 14px;
  object-fit: cover;
  background: rgba(15, 23, 42, 0.05);
}

.cdi-meta {
  color: #617084;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
}

.cdi-content {
  color: #334155;
  font-size: 13.5px;
  line-height: 1.72;
}

.cdi-content p { margin: 0 0 0.85em; }
.cdi-content p:last-child { margin-bottom: 0; }

/* 新闻富文本（内容与原 Newsroom 模态框同源，仅随卡片宽度收敛） */
.cdi-rich :deep(h1),
.cdi-rich :deep(h2),
.cdi-rich :deep(h3),
.cdi-rich :deep(h4) {
  margin: 1.1em 0 0.5em;
  color: #1d2938;
  line-height: 1.35;
}
.cdi-rich :deep(h1) { font-size: 1.25em; }
.cdi-rich :deep(h2) { font-size: 1.15em; }
.cdi-rich :deep(h3),
.cdi-rich :deep(h4) { font-size: 1.05em; }
.cdi-rich :deep(ul),
.cdi-rich :deep(ol) { margin: 0 0 0.85em; padding-left: 1.4em; }
.cdi-rich :deep(li) { margin-bottom: 0.3em; }
.cdi-rich :deep(blockquote) {
  margin: 0.9em 0;
  padding: 0.5em 0.9em;
  border-left: 3px solid rgba(0, 113, 227, 0.35);
  border-radius: 8px;
  color: #475569;
  background: rgba(0, 113, 227, 0.06);
}
.cdi-rich :deep(a) { color: #0071e3; text-decoration: underline; text-underline-offset: 2px; }
.cdi-rich :deep(code) {
  padding: 0.1em 0.4em;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 0.92em;
}
.cdi-rich :deep(pre) {
  overflow-x: auto;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.06);
}
.cdi-rich :deep(pre code) { padding: 0; background: none; }
.cdi-rich :deep(img) { max-width: 100%; border-radius: 10px; }
.cdi-rich :deep(hr) { margin: 1.1em 0; border: none; border-top: 1px solid rgba(100, 116, 139, 0.16); }

/* ---------- 暗色（与导航岛卡片同款前缀） ---------- */
:global(#unified-nav-container[data-theme="dark"] .content-detail-island) {
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35, 39, 49, 0.8), rgba(22, 25, 33, 0.6));
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

:global(#unified-nav-container[data-theme="dark"] .cdi-head) { border-bottom-color: rgba(255, 255, 255, 0.1); }
:global(#unified-nav-container[data-theme="dark"] .cdi-title) { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"] .cdi-meta) { color: rgba(226, 232, 240, 0.72); }
:global(#unified-nav-container[data-theme="dark"] .cdi-content) { color: rgba(226, 232, 240, 0.88); }
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(h1)),
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(h2)),
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(h3)),
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(h4)) { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(blockquote)) { color: rgba(203, 213, 225, 0.9); background: rgba(10, 132, 255, 0.12); }
:global(#unified-nav-container[data-theme="dark"] .cdi-chip.is-news) { color: #93c5fd; background: rgba(59, 130, 246, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .cdi-chip.is-activity) { color: #fbbf24; background: rgba(217, 119, 6, 0.2); }

:global(#unified-nav-container[data-theme="dark"] .cdi-cover) { background: rgba(255, 255, 255, 0.06); }
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(code)) { background: rgba(255, 255, 255, 0.1); }
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(pre)) { background: rgba(255, 255, 255, 0.08); }
:global(#unified-nav-container[data-theme="dark"] .cdi-rich :deep(a)) { color: #6cb2ff; }

:global(#unified-nav-container[data-theme="dark"] .cdi-close) {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.08);
}

:global(#unified-nav-container[data-theme="dark"] .cdi-close:hover) {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.16);
}

/* ---------- 横竖屏适配 ---------- */
/* 竖屏（手机/平板 portrait）：收窄留白、压低封面占比，留更多空间给正文 */
@media (orientation: portrait) and (max-width: 1024px) {
  .content-detail-island {
    max-height: min(72dvh, 640px);
    padding: 10px 12px 12px;
    border-radius: 20px;
  }
  .cdi-cover { max-height: 24dvh; border-radius: 12px; }
  .cdi-title { font-size: 13.5px; }
  .cdi-head { padding-bottom: 8px; margin-bottom: 8px; }
}

/* 小屏手机（<480px）：进一步收紧 */
@media (max-width: 480px) {
  .content-detail-island { max-height: 74dvh; padding: 9px 10px 11px; }
  .cdi-cover { max-height: 26dvh; border-radius: 11px; }
  .cdi-content { font-size: 13px; line-height: 1.66; }
  .cdi-chip span { display: none; }
  .cdi-chip { padding: 0 7px; }
}

/* 横屏矮窗（手机横屏）：整体更扁，封面压缩、正文占主 */
@media (orientation: landscape) and (max-height: 520px) {
  .content-detail-island { max-height: 86dvh; padding: 10px 14px 12px; }
  .cdi-cover { max-height: 30dvh; }
  .cdi-head { padding-bottom: 7px; margin-bottom: 7px; }
}

/* ---- 分享按钮（S4） ---- */
.cdi-open-page {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 16px;
  border: 1px solid rgba(0, 113, 227, 0.24);
  border-radius: 999px;
  background: rgba(0, 113, 227, 0.08);
  color: #0071e3;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease;
}

.cdi-open-page:hover {
  transform: translateY(-1px);
  background: rgba(0, 113, 227, 0.14);
}

.cdi-open-page:active { transform: scale(0.98); }

.cdi-open-page.is-copied {
  border-color: rgba(52, 199, 89, 0.35);
  background: rgba(52, 199, 89, 0.12);
  color: #1f8a3d;
}

@media (prefers-reduced-motion: reduce) {
  .content-detail-island { animation: none; }
}
</style>

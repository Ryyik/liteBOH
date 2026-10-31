<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { acquireBodyScrollLock } from '@/composables/useBodyScrollLock.js';
import { motionEase, motionMs } from '@/utils/motion.js';
import {
  animateMorph,
  canMorph,
  flipFromRect,
  flipRadius,
  peekOrigin,
} from '@/utils/motion-origin.js';
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-vue-next';

const props = defineProps({
  images: { type: Array, default: () => [] },
  initialIndex: { type: Number, default: 0 },
  open: { type: Boolean, default: false },
  // 来源前缀（`forum-image:<postId>`）。为空则退化为原来的居中浮起。
  originKey: { type: String, default: '' },
});

const emit = defineEmits(['close', 'update:open']);

const IMAGE_VIEWER_MIN_ZOOM = 0.5;
const IMAGE_VIEWER_MAX_ZOOM = 4;
const IMAGE_VIEWER_ZOOM_STEP = 0.25;
// 空白处点击关闭：按下到抬起的位移超过这个像素数就当成「拖拽平移」，不关闭
const IMAGE_VIEWER_CLICK_SLOP = 8;

const isLoading = ref(false);
const currentIndex = ref(0);
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const isPanning = ref(false);
let panStart = { x: 0, y: 0 };
// 本次指针按下的起点，以及按下时是否落在图片上（区分「点空白关闭」与「拖拽平移」）
let pointerDownAt = { x: 0, y: 0 };
let pointerDownOnImage = false;

const currentImage = computed(() => props.images[currentIndex.value] || null);

const viewerKey = computed(() =>
  String(
    currentImage.value?.url ||
      currentImage.value?.detailUrl ||
      currentImage.value?.originalUrl ||
      '',
  ).trim(),
);

const viewerSources = computed(() => {
  const image = currentImage.value || {};
  return Array.from(
    new Set(
      [image.detailUrl, image.originalUrl, image.url, image.thumbUrl]
        .map((url) => String(url || '').trim())
        .filter(Boolean),
    ),
  );
});

const currentUrl = computed(() => viewerSources.value[0] || '');

const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`);

const viewerStyle = computed(() => ({
  transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${zoom.value})`,
}));

const hasMultipleImages = computed(() => props.images.length > 1);

function clampZoom(value) {
  return Math.min(IMAGE_VIEWER_MAX_ZOOM, Math.max(IMAGE_VIEWER_MIN_ZOOM, Number(value) || 1));
}

function resetTransform() {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
  isPanning.value = false;
}

function setZoom(value) {
  const nextZoom = clampZoom(value);
  zoom.value = nextZoom;
  if (nextZoom <= 1) {
    pan.value = { x: 0, y: 0 };
  }
}

function zoomIn() {
  setZoom(zoom.value + IMAGE_VIEWER_ZOOM_STEP);
}

function zoomOut() {
  setZoom(zoom.value - IMAGE_VIEWER_ZOOM_STEP);
}

function goToImage(index) {
  const total = props.images.length;
  if (!total) {
    currentIndex.value = 0;
    return;
  }
  const nextIndex = Math.min(Math.max(Number(index || 0), 0), total - 1);
  if (nextIndex !== currentIndex.value) {
    resetTransform();
    isLoading.value = true;
  }
  currentIndex.value = nextIndex;
}

function showPrev() {
  const total = props.images.length;
  if (total <= 1) return;
  resetTransform();
  isLoading.value = true;
  currentIndex.value = (currentIndex.value - 1 + total) % total;
}

function showNext() {
  const total = props.images.length;
  if (total <= 1) return;
  resetTransform();
  isLoading.value = true;
  currentIndex.value = (currentIndex.value + 1) % total;
}

/* ── 从缩略图起、回缩略图去（plans/035 §L4）─────────────────────────
   两段式：容器尺寸由 img 的布局尺寸决定（`offsetWidth` 不受 transform 影响），
   中心由 stage 的 rect 反推 —— 所以不需要等 `getBoundingClientRect` 被自己污染。
   形变只作用在 img 上：stage 的缩放已经交给 CSS 过渡，两边同时缩会缩两次。 */
const imgRef = ref(null);
const stageRef = ref(null);
const morphPhase = ref(''); // '' | 'in' | 'out'
let enteredOnce = false;

const originKeyForCurrent = () => {
  const prefix = String(props.originKey || '').trim();
  if (!prefix) return '';
  const url = String(currentImage.value?.url || '').trim();
  return url ? `${prefix}:${url}` : prefix;
};

const peekSource = () =>
  peekOrigin(originKeyForCurrent(), { matchPrefix: true }) ||
  (props.originKey ? peekOrigin(props.originKey, { matchPrefix: true }) : null);

const measureImgRect = (img) => {
  const stage = stageRef.value || img?.parentElement;
  if (!img || !stage || !img.offsetWidth || !img.offsetHeight) return null;
  const box = stage.getBoundingClientRect();
  const width = img.offsetWidth;
  const height = img.offsetHeight;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
};

const playEnterMorph = async () => {
  const img = imgRef.value;
  const source = peekSource();
  if (!img || !source || !canMorph()) return;
  const target = measureImgRect(img);
  if (!target) return;
  const flip = flipFromRect(source, target);
  const radiusFrom = flipRadius(source.radius || 12, flip.sx, flip.sy, 12);
  const radiusTo = getComputedStyle(img).borderRadius || '12px';
  morphPhase.value = 'in';
  await animateMorph(
    img,
    [
      {
        transform: flip.transform,
        transformOrigin: '0 0',
        borderRadius: `${radiusFrom}px`,
        opacity: 0,
      },
      { opacity: 1, offset: 0.2 },
      { transform: 'none', transformOrigin: '0 0', borderRadius: radiusTo, opacity: 1 },
    ],
    { duration: motionMs('--motion-enter', 320), easing: motionEase('--ease-morph') },
  );
  morphPhase.value = '';
};

const finishClose = () => {
  emit('update:open', false);
  emit('close');
};

const isClosing = ref(false);

function close() {
  if (isClosing.value) return;
  const img = imgRef.value;
  const source = peekSource();
  // 放大过就老实淡出：缩放后的图与缩略图的几何关系已经不是「同一个物体」
  if (!img || !source || !canMorph() || zoom.value > 1) {
    finishClose();
    return;
  }
  const current = measureImgRect(img);
  if (!current) {
    finishClose();
    return;
  }
  isClosing.value = true;
  morphPhase.value = 'out';
  const flip = flipFromRect(source, current);
  const radiusTo = flipRadius(source.radius || 12, flip.sx, flip.sy, 12);
  const radiusFrom = getComputedStyle(img).borderRadius || '12px';
  void animateMorph(
    img,
    [
      { transform: 'none', transformOrigin: '0 0', borderRadius: radiusFrom, opacity: 1 },
      { opacity: 0.65, offset: 0.7 },
      {
        transform: flip.transform,
        transformOrigin: '0 0',
        borderRadius: `${radiusTo}px`,
        opacity: 0,
      },
    ],
    {
      duration: motionMs('--motion-exit', 240),
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      // 退场必须保留终态：否则 cancel 的瞬间图片弹回全屏，紧接着才淡出
      keepFinal: true,
    },
  ).then(() => {
    isClosing.value = false;
    morphPhase.value = '';
    finishClose();
  });
}

function handleWheel(event) {
  const direction = Number(event?.deltaY || 0) < 0 ? 1 : -1;
  setZoom(zoom.value + direction * IMAGE_VIEWER_ZOOM_STEP);
}

function startPan(event) {
  pointerDownAt = {
    x: Number(event?.clientX || 0),
    y: Number(event?.clientY || 0),
  };
  pointerDownOnImage = Boolean(event?.target?.closest?.('.forum-image-viewer-img'));
  if (zoom.value <= 1) return;
  isPanning.value = true;
  event?.currentTarget?.setPointerCapture?.(event.pointerId);
  panStart = {
    x: Number(event?.clientX || 0) - pan.value.x,
    y: Number(event?.clientY || 0) - pan.value.y,
  };
}

function movePan(event) {
  if (!isPanning.value || zoom.value <= 1) return;
  pan.value = {
    x: Number(event?.clientX || 0) - panStart.x,
    y: Number(event?.clientY || 0) - panStart.y,
  };
}

function stopPan(event) {
  if (!isPanning.value) return;
  isPanning.value = false;
  event?.currentTarget?.releasePointerCapture?.(event.pointerId);
}

// 点击图片外的空白处关闭大图。
// 注意 stage 铺满整个遮罩（width/height 100%），所以遮罩上的 @click.self 永远收不到
// 空白点击 —— 必须由 stage 自己判定：目标是 stage 本身（不是 img）、按下也落在空白、
// 且按下到抬起的位移在阈值内（缩放后的拖拽平移不算点击）。
function handleStageClick(event) {
  if (event.target !== event.currentTarget) return;
  if (pointerDownOnImage) return;
  const moved = Math.hypot(
    Number(event?.clientX || 0) - pointerDownAt.x,
    Number(event?.clientY || 0) - pointerDownAt.y,
  );
  if (moved > IMAGE_VIEWER_CLICK_SLOP) return;
  close();
}

function handleImageLoad() {
  isLoading.value = false;
  // 每次打开只在第一张图上跑一次形变：翻页、补全图片都会重新 load，
  // 那些不该再「从缩略图飞一次」
  if (enteredOnce) return;
  enteredOnce = true;
  void nextTick().then(playEnterMorph);
}

function handleImageError(event) {
  const target = event?.target;
  if (!target) {
    isLoading.value = false;
    return;
  }
  const currentSourceIndex = Number(target.dataset?.sourceIndex || 0);
  const nextSourceIndex = currentSourceIndex + 1;
  const nextSource = viewerSources.value[nextSourceIndex];
  if (!nextSource) {
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  target.dataset.sourceIndex = String(nextSourceIndex);
  target.src = nextSource;
}

function handleKeydown(event) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    close();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showPrev();
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    showNext();
    return;
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomIn();
    return;
  }
  if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomOut();
    return;
  }
  if (event.key === '0') {
    event.preventDefault();
    resetTransform();
  }
}

watch(
  () => props.initialIndex,
  (newIndex) => {
    resetTransform();
    isLoading.value = true;
    currentIndex.value = Math.min(
      Math.max(Number(newIndex || 0), 0),
      Math.max(0, props.images.length - 1),
    );
  },
);

// 打开期间图片列表可能被按需补全（列表接口只回 4 张预览，翻页前补全量）：
// 以原图 URL 对齐，保持当前查看的图片不动，仅更新索引与总张数
watch(
  () => props.images,
  (next, prev) => {
    if (!Array.isArray(next) || !next.length || next === prev) return;
    const current = Array.isArray(prev) ? prev[currentIndex.value] : null;
    const wanted = String(current?.originalUrl || current?.url || '').trim();
    let at = -1;
    if (wanted) {
      at = next.findIndex((img) => String(img?.originalUrl || img?.url || '').trim() === wanted);
    }
    resetTransform();
    isLoading.value = true;
    currentIndex.value = at >= 0 ? at : Math.min(currentIndex.value, next.length - 1);
  },
);

/* body 滚动锁走引用计数单源（2026-10-30 P3-1）。原先是直写 overflow：
   论坛主页面在 onDeactivated / onUnmounted 里无条件清零，查看器开着时一旦论坛先离场，
   锁就被清掉 ⇒ 查看器背后还能滚。现在两边各持各的锁，互不干扰。 */
let scrollLockRelease = null;
const releaseViewerScrollLock = () => {
  scrollLockRelease?.();
  scrollLockRelease = null;
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      enteredOnce = false;
      morphPhase.value = '';
      isClosing.value = false;
      scrollLockRelease ??= acquireBodyScrollLock('forum-image-viewer');
      // 命中缓存时 `load` 不会再触发，必须自己补一次（否则缓存图永远不做形变）
      nextTick(() => {
        const img = imgRef.value;
        if (!img || !img.complete || !img.naturalWidth) return;
        handleImageLoad();
      });
    } else {
      releaseViewerScrollLock();
    }
  },
);

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  releaseViewerScrollLock();
});
</script>

<template>
  <Teleport to="body">
    <transition name="forum-image-viewer-fade">
      <div
        v-if="open"
        class="forum-image-viewer"
        role="dialog"
        aria-modal="true"
        :class="{ 'is-morph-in': morphPhase === 'in', 'is-morph-out': morphPhase === 'out' }"
        aria-label="查看帖子大图"
        @click.self="close"
      >
        <button type="button" class="forum-image-viewer-close" aria-label="关闭大图" @click="close">
          <X :size="24" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <div class="forum-image-viewer-toolbar" aria-label="大图缩放工具">
          <button
            type="button"
            class="forum-image-viewer-tool"
            :disabled="zoom <= IMAGE_VIEWER_MIN_ZOOM"
            aria-label="缩小图片"
            @click.stop="zoomOut"
          >
            <ZoomOut :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <span class="forum-image-viewer-zoom">{{ zoomPercent }}</span>
          <button
            type="button"
            class="forum-image-viewer-tool"
            :disabled="zoom >= IMAGE_VIEWER_MAX_ZOOM"
            aria-label="放大图片"
            @click.stop="zoomIn"
          >
            <ZoomIn :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="forum-image-viewer-tool"
            aria-label="重置缩放"
            @click.stop="resetTransform"
          >
            <RotateCcw :size="19" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <button
          v-if="hasMultipleImages"
          type="button"
          class="forum-image-viewer-nav prev"
          aria-label="上一张大图"
          @click.stop="showPrev"
        >
          <ChevronLeft :size="34" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div
          class="forum-image-viewer-stage"
          ref="stageRef"
          :class="{ 'is-zoomed': zoom > 1, 'is-panning': isPanning }"
          @click="handleStageClick"
          @wheel.prevent="handleWheel"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="stopPan"
          @pointercancel="stopPan"
          @pointerleave="stopPan"
        >
          <div v-if="isLoading" class="forum-image-viewer-loader" aria-label="图片加载中">
            <span class="forum-image-viewer-spinner"></span>
          </div>
          <img
            :key="`${viewerKey}-viewer`"
            ref="imgRef"
            class="forum-image-viewer-img"
            :src="currentUrl"
            data-source-index="0"
            :style="viewerStyle"
            :alt="`帖子大图 ${currentIndex + 1}`"
            decoding="async"
            @load="handleImageLoad"
            @error="handleImageError"
            loading="lazy"
          />
        </div>
        <button
          v-if="hasMultipleImages"
          type="button"
          class="forum-image-viewer-nav next"
          aria-label="下一张大图"
          @click.stop="showNext"
        >
          <ChevronRight :size="34" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div v-if="hasMultipleImages" class="forum-image-viewer-count">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.forum-image-viewer {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(18px, 4vw, 52px);
  background: rgba(7, 10, 18, 0.88);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.forum-image-viewer-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
  cursor: default;
}

.forum-image-viewer-stage.is-zoomed {
  cursor: grab;
}

.forum-image-viewer-stage.is-panning {
  cursor: grabbing;
}

.forum-image-viewer-img {
  max-width: 96vw;
  max-height: 92vh;
  object-fit: contain;
  display: block;
  border-radius: 12px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
  transform-origin: center center;
  transition: transform 0.16s ease;
  user-select: none;
  -webkit-user-drag: none;
}

.forum-image-viewer-stage.is-panning .forum-image-viewer-img {
  transition: none;
}

.forum-image-viewer-close,
.forum-image-viewer-nav,
.forum-image-viewer-tool {
  position: fixed;
  border: none;
  border-radius: 999px;
  box-sizing: border-box;
  padding: 0;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  transition:
    background-color 0.18s ease,
    transform 0.18s ease;
}

.forum-image-viewer-toolbar {
  position: fixed;
  top: max(18px, env(safe-area-inset-top));
  left: 50%;
  z-index: 1;
  transform: translateX(-50%);
  height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border-radius: 999px;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.forum-image-viewer-tool {
  position: static;
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, 0.12);
}

.forum-image-viewer-tool:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.forum-image-viewer-zoom {
  min-width: 48px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

.forum-image-viewer-close {
  top: max(18px, env(safe-area-inset-top));
  right: max(18px, env(safe-area-inset-right));
  z-index: 2;
  width: 44px;
  height: 44px;
  line-height: 1;
}

.forum-image-viewer-close svg,
.forum-image-viewer-tool svg,
.forum-image-viewer-nav svg {
  pointer-events: none;
  display: block;
}

.forum-image-viewer-nav {
  top: 50%;
  width: 52px;
  height: 52px;
  transform: translateY(-50%);
  /* 「上一张」在 DOM 里排在 stage 之前：stage 是 position: relative 且铺满遮罩，
     同级定位元素按源序绘制 ⇒ 不给 z-index 的话左箭头会被 stage 里的图片整个盖住
     （表现为翻到宽图后左箭头消失、点不到）。close/toolbar 早就各自带了 z-index，
     只有 nav 漏了，别删这条。 */
  z-index: 2;
}

.forum-image-viewer-nav.prev {
  left: 22px;
}

.forum-image-viewer-nav.next {
  right: 22px;
}

.forum-image-viewer-close:hover,
.forum-image-viewer-nav:hover,
.forum-image-viewer-tool:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.24);
}

.forum-image-viewer-nav:hover {
  transform: translateY(-50%) scale(1.04);
}

.forum-image-viewer-count {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  font-size: 13px;
  font-weight: 800;
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.forum-image-viewer-loader {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.forum-image-viewer-spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.22);
  border-top-color: #ffffff;
  animation: forumImageViewerSpin 0.78s linear infinite;
}

@keyframes forumImageViewerSpin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 开合动效（2026-10-28）─────────────────────────────────────
   家族口径照 plans/017（弹层入场 scale+微位移、退场更快更轻）与 Cloud+ 详情弹窗：
   遮罩淡入 + 图片 0.92 → 1 浮起落定 + 控件晚一拍淡入。

   ⚠️ 遮罩 / 图片 / 控件三段**时长刻意都对齐 260ms**：Vue 只读 Transition **根元素**的
   transition 时长来决定何时摘掉 `*-enter-active`，子元素比根长就会被截断在根那一刻
   （--ease-out 前置，截断点通常已走完 90%+ 所以看不出来 —— 但没必要依赖这个巧合）。
   控件那段的「延迟 + 时长」必须等于根时长（60 + 200 = 260），否则 opacity 会被砍成半透明跳变。
   改时长就三段一起改。 */

.forum-image-viewer-fade-enter-active {
  transition: opacity 260ms var(--ease-out);
}

.forum-image-viewer-fade-leave-active {
  transition: opacity 180ms var(--ease-out);
  /* ⚠️ 刻意不抄 Cloud+ 的 `pointer-events: none`：退场这 180ms 里若让点击穿透，
     连点第二下会落到下面的帖子卡片缩略图上、把大图又打开一次。
     留在原地吃点击，第二次点只会重复触发 close()，是幂等的。 */
}

.forum-image-viewer-fade-enter-from,
.forum-image-viewer-fade-leave-to {
  opacity: 0;
}

/* 图片层：入场浮起落定（缩放交给 stage —— img 自己的 transform 被平移/缩放的内联样式占着，
   在 img 上写 transition/animation 会跟 `translate3d(pan) scale(zoom)` 打架） */
.forum-image-viewer-fade-enter-active .forum-image-viewer-stage {
  transition: transform 260ms var(--ease-out);
}

.forum-image-viewer-fade-leave-active .forum-image-viewer-stage {
  /* 与 Cloud+ cloudDetailZoomOut 同一条曲线（ease-in：起步慢、收尾快，读作「被抽走」） */
  transition: transform 180ms cubic-bezier(0.4, 0, 1, 1);
}

.forum-image-viewer-fade-enter-from .forum-image-viewer-stage {
  transform: scale(0.92) translateY(8px);
}

.forum-image-viewer-fade-leave-to .forum-image-viewer-stage {
  transform: scale(0.96);
}

/* 控件（关闭 / 工具条 / 翻页箭头 / 计数）：晚 60ms 淡入，退场不拖尾
   （只动 opacity，不碰 transform —— nav 的 transform 要留给 `translateY(-50%)` 居中与 hover 放大） */
.forum-image-viewer-fade-enter-active .forum-image-viewer-close,
.forum-image-viewer-fade-enter-active .forum-image-viewer-toolbar,
.forum-image-viewer-fade-enter-active .forum-image-viewer-nav,
.forum-image-viewer-fade-enter-active .forum-image-viewer-count {
  transition: opacity 200ms var(--ease-out) 60ms;
}

.forum-image-viewer-fade-enter-from .forum-image-viewer-close,
.forum-image-viewer-fade-enter-from .forum-image-viewer-toolbar,
.forum-image-viewer-fade-enter-from .forum-image-viewer-nav,
.forum-image-viewer-fade-enter-from .forum-image-viewer-count {
  opacity: 0;
}

/* reduce-motion：按 plans/003 口径「保留 opacity 反馈、砍位移与缩放」。
   全局基线（styles/common/animations.css）只把 transition 压到 100ms，位移仍在 ⇒ 这里显式砍掉。 */
/* ── 从缩略图起 / 回缩略图去（plans/035 §L4）──
   走 rect morph 时 stage 的「居中浮起」必须让位：形变已经作用在 img 上，
   stage 再缩一次就是缩两遍（观感是「图片在飞的同时还在抽一下」）。
   特异性 0,3,0 > 上面 enter-from 那几条 0,2,0，故不依赖书写顺序。 */
.forum-image-viewer.is-morph-in .forum-image-viewer-stage,
.forum-image-viewer.is-morph-out .forum-image-viewer-stage {
  transition: none;
  transform: none;
}

/* 形变期间 img 的 transform 由 WAAPI 接管，CSS 过渡会把每一帧再插值一次 */
.forum-image-viewer.is-morph-in .forum-image-viewer-img,
.forum-image-viewer.is-morph-out .forum-image-viewer-img {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .forum-image-viewer-fade-enter-active .forum-image-viewer-stage,
  .forum-image-viewer-fade-leave-active .forum-image-viewer-stage {
    transition: none;
  }

  .forum-image-viewer-fade-enter-from .forum-image-viewer-stage,
  .forum-image-viewer-fade-leave-to .forum-image-viewer-stage {
    transform: none;
  }
}

@media (max-width: 768px) {
  .forum-image-viewer {
    padding: 12px;
  }

  .forum-image-viewer-img {
    max-width: 100vw;
    max-height: 86vh;
    border-radius: 8px;
  }

  .forum-image-viewer-close {
    top: 12px;
    right: 12px;
    width: 40px;
    height: 40px;
  }

  .forum-image-viewer-toolbar {
    top: 12px;
    height: 40px;
    gap: 5px;
    padding: 0 7px;
  }

  .forum-image-viewer-tool {
    width: 30px;
    height: 30px;
  }

  .forum-image-viewer-zoom {
    min-width: 42px;
    font-size: 12px;
  }

  .forum-image-viewer-nav {
    width: 44px;
    height: 44px;
  }

  .forum-image-viewer-nav.prev {
    left: 10px;
  }

  .forum-image-viewer-nav.next {
    right: 10px;
  }
}
</style>

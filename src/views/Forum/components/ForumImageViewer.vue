<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next';

const props = defineProps({
  images: { type: Array, default: () => [] },
  initialIndex: { type: Number, default: 0 },
  open: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'update:open']);

const IMAGE_VIEWER_MIN_ZOOM = 0.5;
const IMAGE_VIEWER_MAX_ZOOM = 4;
const IMAGE_VIEWER_ZOOM_STEP = 0.25;

const isLoading = ref(false);
const currentIndex = ref(0);
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const isPanning = ref(false);
let panStart = { x: 0, y: 0 };

const currentImage = computed(() => props.images[currentIndex.value] || null);

const viewerKey = computed(() => String(
  currentImage.value?.url
  || currentImage.value?.detailUrl
  || currentImage.value?.originalUrl
  || ''
).trim());

const viewerSources = computed(() => {
  const image = currentImage.value || {};
  return Array.from(new Set([
    image.detailUrl,
    image.originalUrl,
    image.url,
    image.thumbUrl
  ].map((url) => String(url || '').trim()).filter(Boolean)));
});

const currentUrl = computed(() => viewerSources.value[0] || '');

const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`);

const viewerStyle = computed(() => ({
  transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${zoom.value})`
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

function close() {
  emit('update:open', false);
  emit('close');
}

function handleWheel(event) {
  const direction = Number(event?.deltaY || 0) < 0 ? 1 : -1;
  setZoom(zoom.value + direction * IMAGE_VIEWER_ZOOM_STEP);
}

function startPan(event) {
  if (zoom.value <= 1) return;
  isPanning.value = true;
  event?.currentTarget?.setPointerCapture?.(event.pointerId);
  panStart = {
    x: Number(event?.clientX || 0) - pan.value.x,
    y: Number(event?.clientY || 0) - pan.value.y
  };
}

function movePan(event) {
  if (!isPanning.value || zoom.value <= 1) return;
  pan.value = {
    x: Number(event?.clientX || 0) - panStart.x,
    y: Number(event?.clientY || 0) - panStart.y
  };
}

function stopPan(event) {
  if (!isPanning.value) return;
  isPanning.value = false;
  event?.currentTarget?.releasePointerCapture?.(event.pointerId);
}

function handleImageLoad() {
  isLoading.value = false;
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

watch(() => props.initialIndex, (newIndex) => {
  resetTransform();
  isLoading.value = true;
  currentIndex.value = Math.min(Math.max(Number(newIndex || 0), 0), Math.max(0, props.images.length - 1));
});

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <transition name="forum-image-viewer-fade">
      <div v-if="open" class="forum-image-viewer" role="dialog" aria-modal="true"
        aria-label="查看帖子大图" @click.self="close">
        <button type="button" class="forum-image-viewer-close" aria-label="关闭大图"
          @click="close">
          <X :size="24" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <div class="forum-image-viewer-toolbar" aria-label="大图缩放工具">
          <button type="button" class="forum-image-viewer-tool" :disabled="zoom <= IMAGE_VIEWER_MIN_ZOOM"
            aria-label="缩小图片" @click.stop="zoomOut">
            <ZoomOut :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <span class="forum-image-viewer-zoom">{{ zoomPercent }}</span>
          <button type="button" class="forum-image-viewer-tool" :disabled="zoom >= IMAGE_VIEWER_MAX_ZOOM"
            aria-label="放大图片" @click.stop="zoomIn">
            <ZoomIn :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <button type="button" class="forum-image-viewer-tool" aria-label="重置缩放"
            @click.stop="resetTransform">
            <RotateCcw :size="19" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <button v-if="hasMultipleImages" type="button" class="forum-image-viewer-nav prev"
          aria-label="上一张大图" @click.stop="showPrev">
          <ChevronLeft :size="34" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div class="forum-image-viewer-stage"
          :class="{ 'is-zoomed': zoom > 1, 'is-panning': isPanning }"
          @wheel.prevent="handleWheel"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="stopPan"
          @pointercancel="stopPan"
          @pointerleave="stopPan">
          <div v-if="isLoading" class="forum-image-viewer-loader" aria-label="图片加载中">
            <span class="forum-image-viewer-spinner"></span>
          </div>
          <img :key="`${viewerKey}-viewer`" class="forum-image-viewer-img" :src="currentUrl"
            data-source-index="0" :style="viewerStyle"
            :alt="`帖子大图 ${currentIndex + 1}`" decoding="async"
            @load="handleImageLoad" @error="handleImageError"  loading="lazy" />
        </div>
        <button v-if="hasMultipleImages" type="button" class="forum-image-viewer-nav next"
          aria-label="下一张大图" @click.stop="showNext">
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
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
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
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  transition: background-color 0.18s ease, transform 0.18s ease;
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
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
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
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
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

.forum-image-viewer-fade-enter-active,
.forum-image-viewer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.forum-image-viewer-fade-enter-from,
.forum-image-viewer-fade-leave-to {
  opacity: 0;
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
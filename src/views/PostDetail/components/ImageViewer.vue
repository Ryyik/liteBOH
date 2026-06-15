<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-vue-next';

const props = defineProps({
  visible: { type: Boolean, default: false },
  images: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: 0 },
  postTitle: { type: String, default: '' },
  currentImage: { type: Object, default: null },
  imageKey: { type: String, default: '' }
});

const emit = defineEmits([
  'close',
  'navigate-prev',
  'navigate-next',
  'go-to-index',
  'update:currentIndex'
]);

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const isImageLoading = ref(false);
let panStart = { x: 0, y: 0 };

const hasMultipleImages = computed(() => props.images.length > 1);

const currentImageViewerSources = computed(() => {
  const image = props.currentImage || {};
  return Array.from(new Set([
    image.detailUrl,
    image.originalUrl,
    image.url,
    image.thumbUrl
  ].map((url) => String(url || '').trim()).filter(Boolean)));
});

const currentImageLargeUrl = computed(() => currentImageViewerSources.value[0] || '');

const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`);

const imageStyle = computed(() => ({
  transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${zoom.value})`
}));

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || 1));
}

function resetTransform() {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
  isPanning.value = false;
}

const setZoom = (value) => {
  const nextZoom = clampZoom(value);
  zoom.value = nextZoom;
  if (nextZoom <= 1) {
    pan.value = { x: 0, y: 0 };
  }
};

const zoomIn = () => {
  setZoom(zoom.value + ZOOM_STEP);
};

const zoomOut = () => {
  setZoom(zoom.value - ZOOM_STEP);
};

const handleWheel = (event) => {
  const direction = Number(event?.deltaY || 0) < 0 ? 1 : -1;
  setZoom(zoom.value + direction * ZOOM_STEP);
};

const startPan = (event) => {
  if (zoom.value <= 1) return;
  isPanning.value = true;
  event?.currentTarget?.setPointerCapture?.(event.pointerId);
  panStart = {
    x: Number(event?.clientX || 0) - pan.value.x,
    y: Number(event?.clientY || 0) - pan.value.y
  };
};

const movePan = (event) => {
  if (!isPanning.value || zoom.value <= 1) return;
  pan.value = {
    x: Number(event?.clientX || 0) - panStart.x,
    y: Number(event?.clientY || 0) - panStart.y
  };
};

const stopPan = (event) => {
  if (!isPanning.value) return;
  isPanning.value = false;
  event?.currentTarget?.releasePointerCapture?.(event.pointerId);
};

const handleImageError = (event) => {
  const target = event?.target;
  if (!target) {
    isImageLoading.value = false;
    return;
  }
  const currentSourceIndex = Number(target.dataset?.sourceIndex || 0);
  const nextSourceIndex = currentSourceIndex + 1;
  const nextSource = currentImageViewerSources.value[nextSourceIndex];
  if (!nextSource) {
    isImageLoading.value = false;
    return;
  }
  isImageLoading.value = true;
  target.dataset.sourceIndex = String(nextSourceIndex);
  target.src = nextSource;
};

const handleImageLoad = () => {
  isImageLoading.value = false;
};

const handleKeydown = (event) => {
  if (!props.visible) return;
  if (event.key === 'Escape') {
    emit('close');
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    emit('navigate-prev');
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    emit('navigate-next');
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
};

watch(() => props.visible, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

watch(() => props.imageKey, () => {
  if (props.visible) {
    isImageLoading.value = true;
    resetTransform();
  }
});

watch(() => props.visible, (isOpen) => {
  if (isOpen) {
    resetTransform();
    isImageLoading.value = true;
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
    <transition name="detail-viewer-fade">
      <div v-if="visible" class="detail-image-viewer" role="dialog" aria-modal="true"
        aria-label="查看帖子大图" @click.self="$emit('close')">
        <button type="button" class="detail-image-viewer-close" aria-label="关闭大图"
          @click="$emit('close')">
          <X :size="24" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <div class="detail-image-viewer-toolbar" aria-label="大图缩放工具">
          <button type="button" class="detail-image-viewer-tool" :disabled="zoom <= MIN_ZOOM"
            aria-label="缩小图片" @click.stop="zoomOut">
            <ZoomOut :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <span class="detail-image-viewer-zoom">{{ zoomPercent }}</span>
          <button type="button" class="detail-image-viewer-tool" :disabled="zoom >= MAX_ZOOM"
            aria-label="放大图片" @click.stop="zoomIn">
            <ZoomIn :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <button type="button" class="detail-image-viewer-tool" aria-label="重置缩放"
            @click.stop="resetTransform">
            <RotateCcw :size="19" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <button v-if="hasMultipleImages" type="button" class="detail-image-viewer-nav prev"
          aria-label="上一张大图" @click.stop="$emit('navigate-prev')">
          <ChevronLeft :size="34" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div class="detail-image-viewer-stage"
          :class="{ 'is-zoomed': zoom > 1, 'is-panning': isPanning }"
          @wheel.prevent="handleWheel"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="stopPan"
          @pointercancel="stopPan"
          @pointerleave="stopPan">
          <div v-if="isImageLoading" class="detail-image-viewer-loader" aria-label="图片加载中">
            <span class="detail-image-viewer-spinner"></span>
          </div>
          <img :key="`${imageKey}-viewer`" class="detail-image-viewer-img" :src="currentImageLargeUrl"
            data-source-index="0" :style="imageStyle"
            :alt="`${postTitle} 大图 ${currentIndex + 1}`" decoding="async"
            @load="handleImageLoad" @error="handleImageError"  loading="lazy" />
        </div>
        <button v-if="hasMultipleImages" type="button" class="detail-image-viewer-nav next"
          aria-label="下一张大图" @click.stop="$emit('navigate-next')">
          <ChevronRight :size="34" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div v-if="hasMultipleImages" class="detail-image-viewer-count">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.detail-image-viewer {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(18px, 4vw, 52px);
  background: rgba(7, 10, 18, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.detail-image-viewer-stage {
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

.detail-image-viewer-stage.is-zoomed {
  cursor: grab;
}

.detail-image-viewer-stage.is-panning {
  cursor: grabbing;
}

.detail-image-viewer-img {
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

.detail-image-viewer-stage.is-panning .detail-image-viewer-img {
  transition: none;
}

.detail-image-viewer-close,
.detail-image-viewer-nav,
.detail-image-viewer-tool {
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
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: background-color 0.18s ease, transform 0.18s ease;
}

.detail-image-viewer-toolbar {
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
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.detail-image-viewer-tool {
  position: static;
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, 0.12);
}

.detail-image-viewer-tool:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.detail-image-viewer-zoom {
  min-width: 48px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

.detail-image-viewer-close {
  top: max(18px, env(safe-area-inset-top));
  right: max(18px, env(safe-area-inset-right));
  z-index: 2;
  width: 44px;
  height: 44px;
  line-height: 1;
}

.detail-image-viewer-close svg,
.detail-image-viewer-tool svg,
.detail-image-viewer-nav svg {
  pointer-events: none;
  display: block;
}

.detail-image-viewer-nav {
  top: 50%;
  width: 52px;
  height: 52px;
  transform: translateY(-50%);
}

.detail-image-viewer-nav.prev {
  left: 22px;
}

.detail-image-viewer-nav.next {
  right: 22px;
}

.detail-image-viewer-close:hover,
.detail-image-viewer-nav:hover,
.detail-image-viewer-tool:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.24);
}

.detail-image-viewer-nav:hover {
  transform: translateY(-50%) scale(1.04);
}

.detail-image-viewer-count {
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
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.detail-image-viewer-loader {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.detail-image-viewer-spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.22);
  border-top-color: #ffffff;
  animation: detailViewerSpin 0.78s linear infinite;
}

@keyframes detailViewerSpin {
  to {
    transform: rotate(360deg);
  }
}

.detail-viewer-fade-enter-active,
.detail-viewer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.detail-viewer-fade-enter-from,
.detail-viewer-fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .detail-image-viewer {
    padding: 12px;
  }

  .detail-image-viewer-img {
    max-width: 100vw;
    max-height: 86vh;
    border-radius: 8px;
  }

  .detail-image-viewer-close {
    top: 12px;
    right: 12px;
    width: 40px;
    height: 40px;
  }

  .detail-image-viewer-toolbar {
    top: 12px;
    height: 40px;
    gap: 5px;
    padding: 0 7px;
  }

  .detail-image-viewer-tool {
    width: 30px;
    height: 30px;
  }

  .detail-image-viewer-zoom {
    min-width: 42px;
    font-size: 12px;
  }

  .detail-image-viewer-nav {
    width: 44px;
    height: 44px;
  }

  .detail-image-viewer-nav.prev {
    left: 10px;
  }

  .detail-image-viewer-nav.next {
    right: 10px;
  }
}
</style>

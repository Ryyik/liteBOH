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
<template>
  <picture v-if="usePicture">
    <!-- WebP 格式 - 现代浏览器 -->
    <source v-if="webpSrc" :srcset="webpSrc" :type="WEBP_MIME" :media="mediaQuery" />
    <!-- 原始格式作为 fallback -->
    <img :src="fallbackSrc" :alt="alt" :loading="loading" :decoding="decoding" :width="width" :height="height"
      :class="imgClass" :style="imgStyle" @load="onLoad" @error="onError" />
  </picture>
  <img v-else :src="src" :alt="alt" :loading="loading" :decoding="decoding" :width="width" :height="height"
    :class="imgClass" :style="imgStyle" @load="onLoad" @error="onError" />
</template>

<script setup>
import { computed, ref } from 'vue';
import { getImageUrl } from '@/utils/asset-helper.js';

const WEBP_MIME = 'image/webp';

const props = defineProps({
  // 图片路径（支持 @/assets/... 格式）
  src: {
    type: String,
    required: true
  },
  // 图片 alt 文本
  alt: {
    type: String,
    default: ''
  },
  // 是否使用 picture 标签提供 WebP 支持
  usePicture: {
    type: Boolean,
    default: true
  },
  // 懒加载
  lazy: {
    type: Boolean,
    default: true
  },
  // 异步解码
  asyncDecode: {
    type: Boolean,
    default: true
  },
  // 图片宽度
  width: {
    type: [Number, String],
    default: undefined
  },
  // 图片高度
  height: {
    type: [Number, String],
    default: undefined
  },
  // CSS 类名
  imgClass: {
    type: [String, Array, Object],
    default: ''
  },
  // 内联样式
  imgStyle: {
    type: Object,
    default: () => ({})
  },
  // 媒体查询（用于响应式）
  media: {
    type: String,
    default: undefined
  },
  // 备用图片路径
  fallback: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['load', 'error']);

const isLoaded = ref(false);
const hasError = ref(false);

// 计算加载策略
const loading = computed(() => props.lazy ? 'lazy' : 'eager');

// 计算解码策略
const decoding = computed(() => props.asyncDecode ? 'async' : 'sync');

// 计算媒体查询
const mediaQuery = computed(() => props.media);

// 解析后的主图片 URL
const resolvedSrc = computed(() => {
  if (!props.src) return props.fallback || '';
  return getImageUrl(props.src, { fallback: props.fallback, silent: true });
});

// WebP 版本 URL
const webpSrc = computed(() => {
  if (!props.src || !props.usePicture) return null;

  // 如果原图就是 webp，不需要额外处理
  if (props.src.toLowerCase().endsWith('.webp')) {
    return null;
  }

  // 尝试获取 webp 版本
  const webpPath = props.src.replace(/\.(png|jpe?g)$/i, '.webp');
  const webpUrl = getImageUrl(webpPath, { silent: true });

  // 如果 webp 版本存在且与原始路径不同
  if (webpUrl && webpUrl !== resolvedSrc.value) {
    return webpUrl;
  }

  return null;
});

// Fallback 图片（用于 picture 标签内的 img）
const fallbackSrc = computed(() => resolvedSrc.value);

// 事件处理
const onLoad = (event) => {
  isLoaded.value = true;
  emit('load', event);
};

const onError = (event) => {
  hasError.value = true;
  console.warn(`[OptimizedImage] 图片加载失败: ${props.src}`);
  emit('error', event);
};
</script>

<style scoped>
picture,
img {
  max-width: 100%;
  height: auto;
}
</style>

<template>
  <div class="film-fx" aria-hidden="true">
    <!-- 整体染色（胶卷底色）：soft-light 叠整幅，中间调也吃色，是「一眼看出是哪卷」的一层 -->
    <span v-if="castStyle" class="film-fx__layer" :style="castStyle"></span>

    <!-- 高光泛光：图片走「阈值提亮 → 模糊」的位图（与导出同源）；
         相机取景走「第二路 video + CSS 亮部压缩」的实时近似（见脚本注释）。 -->
    <video
      v-if="halationStream && halationStyle"
      ref="halationVideoRef"
      class="film-fx__layer"
      :style="halationStyle"
      muted
      playsinline
      autoplay
      aria-hidden="true"
    ></video>
    <img
      v-else-if="glowUrl"
      class="film-fx__layer is-glow"
      :src="glowUrl"
      :style="halationStyle"
      alt=""
    />

    <!-- 染料分层：screen 抬暗部（阴影染色）、soft-light 压亮部（高光染色） -->
    <span v-if="shadowStyle" class="film-fx__layer" :style="shadowStyle"></span>
    <span v-if="highlightStyle" class="film-fx__layer" :style="highlightStyle"></span>

    <!-- 片基灰雾：白色 + lighten 只抬黑场，不动高光 -->
    <span v-if="liftStyle" class="film-fx__layer" :style="liftStyle"></span>

    <!-- 银盐颗粒：与导出一模一样的噪声块（utils/image-editor-grain.js） -->
    <span v-if="grainStyle" class="film-fx__layer" :style="grainStyle"></span>

    <!-- 镜头失光 -->
    <span v-if="vignetteStyle" class="film-fx__layer" :style="vignetteStyle"></span>

    <!-- 后背漏光 -->
    <span v-if="leakStyle" class="film-fx__layer" :style="leakStyle"></span>
  </div>
</template>

<script setup>
/**
 * 胶片模拟的预览层（2026-11-05）。
 *
 * 这一层的唯一职责：把 resolveFilterLook() 解析出的物理层，在 DOM 里按与
 * utils/image-editor-export.js 相同的顺序、相同的数值画一遍。**不能**在这里
 * 自己发明参数 —— 一旦预览和导出的数值分叉，用户切完滤镜看到的和发出去的
 * 就是两张照片。
 *
 * ⚠️ 混合模式的两个坑：
 *  1. 根节点**不能**加 `isolation: isolate`：那会把混合组限制在本组件内部，
 *     而组件本身是透明的，于是所有层都「和透明黑混合」= 什么都不显示。
 *     这里刻意让它们和身后那张照片（同属一个父级层叠上下文）混合。
 *  2. 因此父容器必须 `overflow: hidden` 且与照片矩形完全重合，否则漏光/
 *     暗角会糊到照片外面去（见 ImageEditModal 的 .imgedit-photo-frame）。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { GRAIN_TILE_SIZE, getGrainTile, grainSpeckSize } from '@/utils/image-editor-grain.js';
import { buildHalationGlow } from '@/utils/image-editor-halation.js';

const props = defineProps({
  /** resolveFilterLook() 的产物 */
  look: { type: Object, required: true },
  /** 照片地址（泛光层要复用同一张图） */
  src: { type: String, default: '' },
  /** 照片在屏幕上的实际宽度，用来把「按 1600 宽标定」的参数换算成像素 */
  boxWidth: { type: Number, default: 320 },
  /**
   * 相机取景专用：给一路 MediaStream。
   *
   * 泛光层此时不再走 `buildHalationGlow`（那要每帧 drawImage + getImageData，
   * 手机上一次同步读回 10~25ms，30fps 直接崩），改用第二路 `<video>` 绑同一路流
   * + CSS「亮部压缩」（contrast 拉阈值、brightness 压回黑场）再模糊。
   * 这是**唯一**允许的预览/成片近似：成片仍由导出管线按阈值精确生成，
   * 差异只在光斑边缘的柔和度，不在有/没有。
   */
  halationStream: { type: Object, default: null },
  /** 前置摄像头取景要镜像；泛光层用的第二路 video 必须同步镜像，否则光晕和画面错位 */
  mirror: { type: Boolean, default: false },
});

const layerBase = {
  position: 'absolute',
  inset: '0',
  pointerEvents: 'none',
};

const scaled = (ratio) => Math.max(0, Number(ratio) || 0);

/**
 * 泛光位图：按阈值从**当前预览**里提取高光再染色模糊。
 * 不能在 CSS 里用 `blur()` 近似 —— 那会连暗部一起抬亮（成片发灰掉饱和）。
 * 这里生成的是小图（≤360px 宽），由 CSS 撑满照片矩形。
 */
const glowUrl = ref('');
let glowToken = 0;

// 只缓存「当前这张」：每次重渲染都会产生新的 blob URL，缓存多了会一直攥着解码后的大图
let cachedSrc = '';
let cachedTask = null;
const loadImage = (src) => {
  if (src === cachedSrc && cachedTask) return cachedTask;
  cachedSrc = src;
  cachedTask = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  return cachedTask;
};

const rebuildGlow = async () => {
  const halation = props.look?.halation;
  const token = ++glowToken;
  // 相机取景：泛光由第二路 video 现算，这里不生成位图（也没有静态 src 可用）
  if (props.halationStream) {
    glowUrl.value = '';
    return;
  }
  if (scaled(halation?.opacity) <= 0 || !props.src) {
    glowUrl.value = '';
    return;
  }
  const image = await loadImage(props.src);
  if (!image || token !== glowToken) return;
  const glow = buildHalationGlow(image, halation, { cssFilter: props.look?.css });
  if (token !== glowToken) return;
  // 每次切滤镜都会重建；上一张 dataURL 直接释放（小图，交给 GC 就够）
  glowUrl.value = glow ? glow.toDataURL('image/png') : '';
};

watch(
  () => [
    props.src,
    props.look?.css,
    props.look?.halation?.opacity,
    props.look?.halation?.color,
    props.look?.halation?.blur,
  ],
  rebuildGlow,
  { immediate: true },
);

/* ── 实时泛光（相机取景）────────────────────────────────────────────────
 * 阈值近似的两个数一起调，别单改其一：
 *   contrast(4)   —— 以 0.5 为中轴，把 <0.375 的亮度压到 0（等于「只留亮部」）
 *   brightness(.62) —— 再把中间调压回去，否则整幅都在发光
 * 成片走 utils/image-editor-halation.js 的精确阈值，这里只求取景器不卡。 */
const LIVE_HALATION_BRIGHT_PASS = 'contrast(4) brightness(0.62) saturate(1.35)';
const halationVideoRef = ref(null);

const halationStyle = computed(() => {
  const halation = props.look?.halation;
  const opacity = scaled(halation?.opacity);
  if (opacity <= 0) return null;
  const live = Boolean(props.halationStream);
  if (!live && !glowUrl.value) return null;
  const style = {
    ...layerBase,
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    opacity: String(opacity),
    mixBlendMode: 'screen',
  };
  if (!live) return style;
  const radius = Math.max(1, scaled(halation.blur) * props.boxWidth);
  return {
    ...style,
    filter: `${LIVE_HALATION_BRIGHT_PASS} blur(${radius.toFixed(2)}px)`,
    // 只镜像这一路 video：染色/暗角/漏光是对称或按归一化坐标定位的，
    // 跟着镜像会让光斑位置和成片对不上
    transform: props.mirror ? 'scaleX(-1)' : 'none',
  };
});

/* 绑流要等 DOM：泛光层是 v-if（切「原图」会卸载），重新出现时必须重新绑一次 */
watch(
  () => [props.halationStream, props.look?.halation?.opacity],
  async () => {
    await nextTick();
    const video = halationVideoRef.value;
    if (!video) return;
    if (video.srcObject !== props.halationStream) {
      video.srcObject = props.halationStream || null;
    }
    if (!props.halationStream) return;
    // 不 catch 会在 iOS 上抛未处理的 NotAllowedError（同一路流第二次 play 偶发）
    const played = video.play();
    if (played && typeof played.catch === 'function') played.catch(() => {});
  },
  { immediate: true },
);

const castStyle = computed(() => {
  const layer = props.look?.cast;
  const opacity = scaled(layer?.opacity);
  if (opacity <= 0 || !layer?.color || layer.color === 'transparent') return null;
  return {
    ...layerBase,
    background: layer.color,
    opacity: String(opacity),
    mixBlendMode: layer.blend || 'soft-light',
  };
});

const shadowStyle = computed(() => {
  const layer = props.look?.shadow;
  const opacity = scaled(layer?.opacity);
  if (opacity <= 0) return null;
  return {
    ...layerBase,
    background: layer.color,
    opacity: String(opacity),
    mixBlendMode: layer.blend || 'screen',
  };
});

const highlightStyle = computed(() => {
  const layer = props.look?.highlight;
  const opacity = scaled(layer?.opacity);
  if (opacity <= 0) return null;
  return {
    ...layerBase,
    background: layer.color,
    opacity: String(opacity),
    mixBlendMode: layer.blend || 'soft-light',
  };
});

const liftStyle = computed(() => {
  const lift = scaled(props.look?.lift);
  if (lift <= 0) return null;
  return {
    ...layerBase,
    background: '#ffffff',
    opacity: String(lift),
    mixBlendMode: 'lighten',
  };
});

const grainStyle = computed(() => {
  const grain = props.look?.grain;
  const opacity = scaled(grain?.opacity);
  if (opacity <= 0) return null;
  const dataUrl = getGrainTile()?.dataUrl;
  if (!dataUrl) return null;
  // 与导出同一个换算：颗粒粗细以 1600 宽成片为基准
  const speck = grainSpeckSize(grain.scale, props.boxWidth);
  const tile = Math.max(2, GRAIN_TILE_SIZE * speck);
  return {
    ...layerBase,
    backgroundImage: `url(${dataUrl})`,
    backgroundRepeat: 'repeat',
    backgroundSize: `${tile.toFixed(2)}px ${tile.toFixed(2)}px`,
    opacity: String(opacity),
    mixBlendMode: 'overlay',
  };
});

const vignetteStyle = computed(() => {
  const amount = scaled(props.look?.vignette);
  if (amount <= 0) return null;
  return {
    ...layerBase,
    background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 28%, rgba(0,0,0,${Math.min(
      0.95,
      amount,
    ).toFixed(3)}) 100%)`,
    mixBlendMode: 'multiply',
  };
});

const leakStyle = computed(() => {
  const leak = props.look?.leak;
  const opacity = scaled(leak?.opacity);
  if (opacity <= 0 || !leak?.color || leak.color === 'transparent') return null;
  const x = (scaled(leak.x) * 100).toFixed(1);
  const y = (scaled(leak.y) * 100).toFixed(1);
  return {
    ...layerBase,
    background: `radial-gradient(circle at ${x}% ${y}%, ${leak.color} 0%, ${leak.color} 55%, rgba(0,0,0,0) 100%)`,
    opacity: String(opacity),
    mixBlendMode: 'screen',
  };
});
</script>

<style scoped>
.film-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* ⚠️ 不要加 isolation / z-index：见脚本注释 */
}

.film-fx__layer {
  pointer-events: none;
  border-radius: inherit;
}
</style>

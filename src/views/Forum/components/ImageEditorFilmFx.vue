<template>
  <div class="film-fx" aria-hidden="true">
    <!-- 高光泛光：用同一张图模糊后叠加。为了和导出顺序一致，先套调色再模糊 -->
    <img v-if="halationStyle" class="film-fx__layer" :src="src" :style="halationStyle" alt="" />

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
import { computed } from 'vue';
import { GRAIN_TILE_SIZE, getGrainTile, grainSpeckSize } from '@/utils/image-editor-grain.js';

const props = defineProps({
  /** resolveFilterLook() 的产物 */
  look: { type: Object, required: true },
  /** 照片地址（泛光层要复用同一张图） */
  src: { type: String, default: '' },
  /** 照片在屏幕上的实际宽度，用来把「按 1600 宽标定」的参数换算成像素 */
  boxWidth: { type: Number, default: 320 },
});

const layerBase = {
  position: 'absolute',
  inset: '0',
  pointerEvents: 'none',
};

const scaled = (ratio) => Math.max(0, Number(ratio) || 0);

const halationStyle = computed(() => {
  const halation = props.look?.halation;
  const opacity = scaled(halation?.opacity);
  if (opacity <= 0 || !props.src) return null;
  const radius = Math.max(1, scaled(halation.blur) * props.boxWidth);
  const grade = props.look?.css && props.look.css !== 'none' ? `${props.look.css} ` : '';
  return {
    ...layerBase,
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    opacity: String(opacity),
    mixBlendMode: 'screen',
    filter: `${grade}blur(${radius.toFixed(2)}px) saturate(1.4) brightness(1.15)`,
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

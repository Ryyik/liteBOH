<template>
  <span class="boh-avatar-wrap fa-root" :style="rootStyle">
    <img v-if="src" :src="src" :alt="alt" class="fa-img" loading="lazy">
    <span v-else class="fa-fallback" aria-hidden="true">{{ initial }}</span>
    <Transition name="fa-swap" mode="out-in">
      <span v-if="frameUrl" key="frame" class="boh-avatar-frame" :style="frameStyle" aria-hidden="true"></span>
      <span v-else-if="ring" key="ring" class="fa-mock-ring" :class="{ 'is-rainbow': ring === 'rainbow' }"
        :style="ring !== 'rainbow' ? { '--fa-ring-color': ring } : null" aria-hidden="true"></span>
    </Transition>
  </span>
</template>

<script setup>
/**
 * 带框头像基础渲染件：头像（图/占位）+ 框层三选一（真图 url / mock 色环 / 无）。
 * 圆形裁切在 img 自身；wrap 不裁剪溢出，给框的耳朵/流苏留位（见 styles/common/avatar-frame.css）。
 * 真图走全局 .boh-avatar-frame（--boh-avatar-frame-url 注入）；素材未接入时用 mock 环兜底。
 * scale = 按框缩放（厚环白框 1.4），不传走全局默认 1.24。
 */
import { computed } from 'vue';

const props = defineProps({
  src: { type: String, default: '' },
  initial: { type: String, default: 'U' },
  alt: { type: String, default: '头像' },
  size: { type: Number, default: 52 },
  frameUrl: { type: String, default: '' },
  /** '' 无环 | 色值 | 'rainbow' */
  ring: { type: String, default: '' },
  /** 按框缩放倍数（框层边长 = 头像 × scale）；缺省走全局 1.24 */
  frameScale: { type: Number, default: 0 }
});

const rootStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  '--fa-ring-w': `${Math.max(3, Math.round(props.size * 0.072))}px`
}));

const frameStyle = computed(() => {
  const style = { '--boh-avatar-frame-url': `url(${props.frameUrl})` };
  if (props.frameScale) style['--boh-avatar-frame-scale'] = String(props.frameScale);
  return style;
});
</script>

<style scoped>
.fa-root {
  flex-shrink: 0;
}

.fa-img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.fa-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #0071e3, #5856d6);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  color: #fff;
  font-size: calc(v-bind(size) * 0.42px);
  font-weight: 800;
  user-select: none;
}

.fa-mock-ring {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: var(--fa-ring-w, 4px) solid var(--fa-ring-color, #0071e3);
  border-radius: 50%;
  pointer-events: none;
}

.fa-mock-ring.is-rainbow {
  border: none;
  background: conic-gradient(#f66 0 18%, #fa0 18% 36%, #fd3 36% 54%, #3c6 54% 72%, #29f 72% 88%, #a5f 88% 100%);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--fa-ring-w, 4px)), #000 calc(100% - var(--fa-ring-w, 4px) + 0.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - var(--fa-ring-w, 4px)), #000 calc(100% - var(--fa-ring-w, 4px) + 0.5px));
}

/* 框/环切换 crossfade（out-in：旧层快退、新层轻缩落定） */
.fa-swap-enter-active {
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}

.fa-swap-enter-from {
  opacity: 0;
  transform: scale(1.04);
}

.fa-swap-leave-active {
  transition: opacity 100ms ease-out;
}

.fa-swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fa-swap-enter-active,
  .fa-swap-leave-active {
    transition-duration: 1ms;
  }

  .fa-swap-enter-from {
    transform: none;
  }
}
</style>

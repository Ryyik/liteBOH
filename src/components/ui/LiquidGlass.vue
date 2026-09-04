<script setup>
import { computed } from 'vue'

/**
 * LiquidGlass — iOS 26/27 液态玻璃容器
 * 纯样式封装，不改任何逻辑，横竖屏直接调用
 * @example
 * <LiquidGlass>外卡</LiquidGlass>
 * <LiquidGlass variant="pill subtle">工具栏</LiquidGlass>
 * <LiquidGlass variant="inset">Location/草稿/标签</LiquidGlass>
 * <LiquidGlass :blur="18" :radius="16" as="section">自定义</LiquidGlass>
 */
const props = defineProps({
  /** 变体：default | strong | subtle | overlay | inset | clear */
  variant: { type: String, default: 'default' },
  /** 额外变体叠加，如 "pill subtle" */
  extra: { type: String, default: '' },
  /** 自定义 blur 会覆盖 --liquid-blur */
  blur: { type: [String, Number], default: null },
  /** 自定义圆角 */
  radius: { type: [String, Number], default: null },
  /** 渲染标签 */
  as: { type: String, default: 'div' },
  /** 是否启用悬停抬升 */
  interactive: { type: Boolean, default: false },
})

const variantClass = computed(() => {
  const base = props.variant === 'default' ? '' : `liquid-glass--${props.variant}`
  const extra = props.extra ? props.extra.split(/\s+/).map(v=>`liquid-glass--${v}`).join(' ') : ''
  const inter = props.interactive ? 'liquid-glass--interactive' : ''
  return ['liquid-glass', base, extra, inter].filter(Boolean).join(' ')
})

const customStyle = computed(() => {
  const s = {}
  if (props.blur != null) s['--liquid-blur'] = typeof props.blur === 'number' ? `${props.blur}px` : props.blur
  if (props.radius != null) s['--liquid-radius-lg'] = typeof props.radius === 'number' ? `${props.radius}px` : props.radius
  return s
})
</script>

<template>
  <component :is="as" :class="variantClass" :style="customStyle">
    <slot />
  </component>
</template>

<style scoped>
/* 样式由 src/styles/common/liquid-glass.css 提供，此文件仅兜底 */
</style>

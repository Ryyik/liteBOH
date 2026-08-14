<template>
  <!-- 标准卡片型：复用 AppleGridCard -->
  <AppleGridCard
    v-if="hero.template === 'standard'"
    class="dynamic-hero"
    :class="[`dynamic-hero-${hero.id}`, { 'is-portrait': isPortrait, 'is-preview': Boolean(previewDevice) }]"
    :title="hero.title"
    :subtitle="hero.subtitle || ''"
    :variant="hero.variant"
    :image-src="heroImageSrc"
    :image-alt="hero.image_config.alt || ''"
    :image-style="standardImageStyle"
    :content-layout="contentLayout"
    :image-position-editable="Boolean(previewDevice)"
    :links="resolvedLinks"
    @image-position="emitCardImagePosition"
  />

  <!-- 全幅图片叠加型：复用 HomeOverlayHero 的样式结构 -->
  <section
    v-else-if="hero.template === 'overlay'"
    class="dynamic-overlay-hero"
    :class="{ 'is-portrait': isPortrait, 'is-preview': Boolean(previewDevice) }"
    :style="overlayStyle"
    :aria-label="hero.aria_label || hero.title"
  >
    <img
      v-if="hero.image_config.src"
      :src="heroImageSrc"
      :alt="hero.image_config.alt || hero.title"
      class="dynamic-overlay-image"
      :style="overlayImageStyle"
      loading="lazy"
      decoding="async"
      draggable="false"
      @pointerdown="startImagePositionDrag"
      @pointermove="updateImagePositionDrag"
      @pointerup="stopImagePositionDrag"
      @pointercancel="stopImagePositionDrag"
    />
    <div class="dynamic-overlay-shade" aria-hidden="true"></div>
    <div
      class="dynamic-overlay-content"
      :class="{ 'is-position-editable': Boolean(previewDevice) }"
      :style="overlayContentStyle"
      @pointerdown="startContentPositionDrag"
      @pointermove="updateContentPositionDrag"
      @pointerup="stopContentPositionDrag"
      @pointercancel="stopContentPositionDrag"
    >
      <p v-if="hero.eyebrow" class="dynamic-overlay-eyebrow">{{ hero.eyebrow }}</p>
      <h1 class="dynamic-overlay-title" v-html="hero.title"></h1>
      <p v-if="hero.subtitle" class="dynamic-overlay-subtitle">{{ hero.subtitle }}</p>
      <div v-if="resolvedLinks.length" class="dynamic-overlay-actions">
        <template v-for="(link, i) in resolvedLinks" :key="`overlay-${i}`">
          <router-link
            v-if="link.to"
            :to="link.to"
            class="dynamic-overlay-button"
            :class="`is-${link.type || 'secondary'}`"
          >{{ link.text }}</router-link>
          <a
            v-else-if="link.href"
            :href="link.href"
            class="dynamic-overlay-button"
            :class="`is-${link.type || 'secondary'}`"
            target="_blank"
            rel="noopener noreferrer"
          >{{ link.text }}</a>
          <button
            v-else
            type="button"
            class="dynamic-overlay-button"
            :class="`is-${link.type || 'secondary'}`"
            @click="link.onClick && link.onClick()"
          >{{ link.text }}</button>
        </template>
      </div>
    </div>
  </section>

  <!-- 分栏并排型：两张 AppleGridCard 并排 -->
  <div
    v-else-if="hero.template === 'split'"
    class="dynamic-split-hero"
    :class="{ 'is-portrait': isPortrait, 'is-preview': Boolean(previewDevice) }"
    :aria-label="hero.aria_label || hero.title"
  >
    <AppleGridCard
      v-for="(card, idx) in splitCards"
      :key="`split-${idx}`"
      :title="card.title"
      :subtitle="card.subtitle || ''"
      :variant="card.variant || 'light'"
      class="dynamic-split-card"
      :class="{ 'is-portrait': isPortrait, 'is-preview': Boolean(previewDevice) }"
      :image-src="card.image_config.src || ''"
      :image-alt="card.image_config.alt || ''"
      :image-style="splitCardImageStyle(card.image_config)"
      :content-layout="resolveContentLayout(card.content_layout)"
      :links="resolveLinks(card.links)"
    />
  </div>

  <!-- 横竖屏适配型：picture + source 切换 -->
  <AppleGridCard
    v-else-if="hero.template === 'responsive'"
    class="dynamic-hero dynamic-responsive-hero"
    :class="{ 'is-portrait': isPortrait, 'is-preview': Boolean(previewDevice) }"
    :title="hero.title"
    :subtitle="hero.subtitle || ''"
    :variant="hero.variant"
    :content-layout="contentLayout"
    :links="resolvedLinks"
  >
    <picture class="dynamic-responsive-visual">
      <img
        :src="responsiveImageSrc"
        :alt="hero.image_config.alt || hero.title"
        class="dynamic-responsive-image"
        loading="eager"
        decoding="async"
        fetchpriority="high"
        draggable="false"
        :style="responsiveImageStyle"
        @pointerdown="startImagePositionDrag"
        @pointermove="updateImagePositionDrag"
        @pointerup="stopImagePositionDrag"
        @pointercancel="stopImagePositionDrag"
      />
    </picture>
  </AppleGridCard>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppleGridCard from '@/components/AppleGridCard.vue';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';

const props = defineProps({
  hero: { type: Object, required: true },
  previewDevice: { type: String, default: '' }
});

const emit = defineEmits(['link-click', 'image-position', 'content-offset']);

const HERO_TRANSFORMS = {
  standard: 'f_auto,q_auto:good,c_fill,w_900',
  overlay:  'f_auto,q_auto:good,c_fill,w_1800',
  split:    'f_auto,q_auto:good,c_fill,w_900',
  responsive: 'f_auto,q_auto:good,w_1200'
};

const viewportIsPortrait = ref(false)
const isPortrait = computed(() => props.previewDevice
  ? props.previewDevice === 'mobile'
  : viewportIsPortrait.value)
const resolveContentLayout = (raw) => {
  if (!raw) return {}
  const desktop = raw.desktop || raw
  return isPortrait.value ? { ...desktop, ...(raw.mobile || {}) } : desktop
}
const contentLayout = computed(() => resolveContentLayout(props.hero.content_layout))
const activeImageConfig = computed(() => props.hero.image_config || {})
const DEFAULT_MOBILE_IMAGE_SCALE = 1.24
const activeStandardImageSrc = computed(() => {
  const config = activeImageConfig.value
  return isPortrait.value ? (config.mobile_src || config.src || '') : (config.src || '')
})
const activeStandardPosition = computed(() => {
  const config = activeImageConfig.value
  return isPortrait.value ? (config.mobile_position || config.position || 'center center') : (config.position || 'center center')
})
const positionPercent = (value, axis) => {
  const keywords = axis === 'x'
    ? { left: 0, center: 50, right: 100 }
    : { top: 0, center: 50, bottom: 100 }
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized in keywords) return keywords[normalized]
  const numeric = Number.parseFloat(normalized)
  return normalized.endsWith('%') && Number.isFinite(numeric)
    ? Math.max(0, Math.min(100, numeric))
    : 50
}
const overlayImageFocus = computed(() => {
  const [horizontal = 'center', vertical = 'center'] = String(activeStandardPosition.value || '').trim().split(/\s+/)
  return {
    x: positionPercent(horizontal, 'x'),
    y: positionPercent(vertical, 'y')
  }
})
const overlayImageScale = computed(() => {
  if (!isPortrait.value) return 1.08
  const value = Number(activeImageConfig.value.mobile_scale)
  return Number.isFinite(value) ? Math.max(1, Math.min(2.2, value)) : DEFAULT_MOBILE_IMAGE_SCALE
})
const heroImageSrc = computed(() =>
  getCloudinaryTransformedUrl(activeStandardImageSrc.value, HERO_TRANSFORMS[props.hero.template] || '')
);
const portraitSrc = computed(() =>
  getCloudinaryTransformedUrl(props.hero.image_config.portraitSrc || '', HERO_TRANSFORMS.responsive)
);
const landscapeSrc = computed(() =>
  getCloudinaryTransformedUrl(props.hero.image_config.landscapeSrc || '', HERO_TRANSFORMS.responsive)
);
const responsiveImageSrc = computed(() => isPortrait.value
  ? (portraitSrc.value || landscapeSrc.value)
  : (landscapeSrc.value || portraitSrc.value))

const standardImageStyle = computed(() => ({
  objectPosition: activeStandardPosition.value,
  objectFit: isPortrait.value ? (activeImageConfig.value.mobile_object_fit || 'contain') : 'contain'
}))
const overlayImageStyle = computed(() => ({
  objectPosition: activeStandardPosition.value,
  objectFit: isPortrait.value ? (activeImageConfig.value.mobile_object_fit || 'cover') : 'cover',
  transformOrigin: activeStandardPosition.value,
  '--dynamic-image-scale': overlayImageScale.value,
  '--dynamic-image-pan-x': `${(50 - overlayImageFocus.value.x) * (overlayImageScale.value - 1)}%`,
  '--dynamic-image-pan-y': `${(50 - overlayImageFocus.value.y) * (overlayImageScale.value - 1)}%`
}))
const overlayStyle = computed(() => ({
  justifyContent: ({ left: 'flex-start', center: 'center', right: 'flex-end' })[contentLayout.value.align] || 'center',
  alignItems: ({ top: 'flex-start', center: 'center', bottom: 'flex-end' })[contentLayout.value.valign] || 'flex-end',
  '--hero-preview-height': props.previewDevice ? (isPortrait.value ? '844px' : '900px') : undefined
}))
const overlayContentStyle = computed(() => ({
  maxWidth: contentLayout.value.max_width ? `${contentLayout.value.max_width}px` : undefined,
  textAlign: contentLayout.value.text_align || 'center',
  transform: `translate(${contentLayout.value.offset_x || 0}px, ${contentLayout.value.offset_y || 0}px)`
}))
const responsiveImageStyle = computed(() => ({
  objectPosition: isPortrait.value
    ? (activeImageConfig.value.portrait_position || 'center center')
    : (activeImageConfig.value.position || 'center bottom')
}))
const splitCardImageStyle = (config = {}) => ({
  objectPosition: isPortrait.value ? (config.mobile_position || config.position || 'center center') : (config.position || 'center center'),
  objectFit: isPortrait.value ? (config.mobile_object_fit || 'contain') : 'contain'
})

// 解析 onClick 字符串为事件回调
const resolveLinks = (links) => {
  if (!Array.isArray(links)) return [];
  return links.map((link) => ({
    ...link,
    onClick: link.onClick ? () => emit('link-click', link.onClick) : undefined
  }));
};

const resolvedLinks = computed(() => resolveLinks(props.hero.links));
const splitCards = computed(() =>
  (props.hero.split_cards || []).map((card) => ({
    ...card,
    image_config: {
      ...card.image_config,
      src: getCloudinaryTransformedUrl(
        isPortrait.value ? (card.image_config.mobile_src || card.image_config.src || '') : (card.image_config.src || ''),
        HERO_TRANSFORMS.split
      )
    }
  }))
);

let draggingImage = false
let draggingContent = false
let previousContentPoint = null
const emitImagePosition = (event) => {
  const rect = event.currentTarget.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const x = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)))
  const y = Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100)))
  emit('image-position', { x, y, portrait: isPortrait.value })
}
const startImagePositionDrag = (event) => {
  if (!props.previewDevice) return
  event.preventDefault()
  draggingImage = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  emitImagePosition(event)
}
const updateImagePositionDrag = (event) => {
  if (props.previewDevice && draggingImage) emitImagePosition(event)
}
const stopImagePositionDrag = (event) => {
  draggingImage = false
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}
const emitCardImagePosition = ({ x, y }) => emit('image-position', { x, y, portrait: isPortrait.value })
const startContentPositionDrag = (event) => {
  if (!props.previewDevice || event.target.closest('a, button')) return
  event.preventDefault()
  draggingContent = true
  previousContentPoint = { x: event.clientX, y: event.clientY }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
const updateContentPositionDrag = (event) => {
  if (!draggingContent || !previousContentPoint) return
  emit('content-offset', {
    dx: Math.round(event.clientX - previousContentPoint.x),
    dy: Math.round(event.clientY - previousContentPoint.y),
    portrait: isPortrait.value
  })
  previousContentPoint = { x: event.clientX, y: event.clientY }
}
const stopContentPositionDrag = (event) => {
  draggingContent = false
  previousContentPoint = null
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}
const syncViewportOrientation = () => {
  viewportIsPortrait.value = window.matchMedia('(orientation: portrait)').matches
}
onMounted(() => {
  syncViewportOrientation()
  window.addEventListener('resize', syncViewportOrientation)
})
onBeforeUnmount(() => window.removeEventListener('resize', syncViewportOrientation))
</script>

<style scoped>
/* ========== Overlay 模板 ========== */
.dynamic-overlay-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  min-height: clamp(620px, var(--hero-preview-height, 78svh), 900px);
  overflow: hidden;
  align-items: flex-end;
  justify-content: center;
  padding: clamp(64px, 8vw, 112px) clamp(22px, 6vw, 88px);
  color: #fff;
  text-align: center;
  background: #151515;
}

.dynamic-overlay-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -2;
  display: block;
  object-fit: cover;
  object-position: center center;
  /* 取景余量允许同宽高比图片也响应焦点位置。 */
  transform: translate(var(--dynamic-image-pan-x, 0%), var(--dynamic-image-pan-y, 0%)) scale(var(--dynamic-image-scale, 1.08));
  animation: dynamicOverlayImageReveal 1.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.dynamic-overlay-shade {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.04) 28%, rgba(0, 0, 0, 0.22) 58%, rgba(0, 0, 0, 0.76) 100%),
    linear-gradient(90deg, rgba(0, 0, 0, 0.12), transparent 28%, transparent 72%, rgba(0, 0, 0, 0.12));
}

.dynamic-overlay-content {
  width: min(100%, 980px);
  text-shadow: 0 2px 22px rgba(0, 0, 0, 0.38);
}
.dynamic-overlay-content.is-position-editable {
  cursor: move;
  touch-action: none;
}

/* 管理台预览使用固定尺寸容器，避免 vw/svh 受外层浏览器窗口影响。 */
.dynamic-overlay-hero.is-preview {
  padding: clamp(64px, 8cqw, 112px) clamp(22px, 6cqw, 88px);
}
.dynamic-overlay-hero.is-preview .dynamic-overlay-eyebrow {
  font-size: clamp(14px, 1.5cqw, 18px);
}
.dynamic-overlay-hero.is-preview .dynamic-overlay-title {
  font-size: clamp(48px, 7cqw, 92px);
}
.dynamic-overlay-hero.is-preview .dynamic-overlay-subtitle {
  font-size: clamp(17px, 2cqw, 24px);
}

.dynamic-overlay-eyebrow,
.dynamic-overlay-title,
.dynamic-overlay-subtitle,
.dynamic-overlay-actions {
  animation: dynamicOverlayContentReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.dynamic-overlay-eyebrow {
  margin: 0 0 10px;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 650;
  line-height: 1.3;
}

.dynamic-overlay-title {
  margin: 0;
  font-size: clamp(48px, 7vw, 92px);
  font-weight: 750;
  line-height: 1.02;
  letter-spacing: 0;
  text-wrap: balance;
  white-space: pre-line;
  animation-delay: 80ms;
}

.dynamic-overlay-subtitle {
  max-width: 720px;
  margin: 16px auto 0;
  color: rgba(255, 255, 255, 0.86);
  font-size: clamp(17px, 2vw, 24px);
  font-weight: 450;
  line-height: 1.45;
  animation-delay: 150ms;
}

.dynamic-overlay-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
  animation-delay: 220ms;
}

.dynamic-overlay-button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  padding: 0 25px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 980px;
  color: #fff;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18), inset 0 1px rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), background-color 260ms ease, border-color 260ms ease;
}

.dynamic-overlay-button.is-primary {
  border-color: rgba(255, 255, 255, 0.62);
  color: #111;
  background: rgba(255, 255, 255, 0.78);
  text-shadow: none;
}

.dynamic-overlay-button.is-secondary {
  background: rgba(20, 20, 22, 0.34);
}

@media (hover: hover) {
  .dynamic-overlay-button:hover { transform: translateY(-2px); }
  .dynamic-overlay-button.is-primary:hover { background: rgba(255, 255, 255, 0.92); }
  .dynamic-overlay-button.is-secondary:hover {
    border-color: rgba(255, 255, 255, 0.56);
    background: rgba(20, 20, 22, 0.5);
  }
}

.dynamic-overlay-button:active { transform: scale(0.97); }
.dynamic-overlay-button:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.9);
  outline-offset: 3px;
}

@keyframes dynamicOverlayImageReveal {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes dynamicOverlayContentReveal {
  from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@media (max-width: 768px) {
  .dynamic-overlay-hero,
  .dynamic-overlay-hero.is-portrait {
    min-height: min(760px, calc(var(--hero-preview-height, 100svh) - 54px));
    padding: 52px 20px;
  }
  .dynamic-overlay-title { font-size: 46px; }
  .dynamic-overlay-subtitle { font-size: 17px; }
}

.dynamic-overlay-hero.is-portrait {
  min-height: min(760px, calc(var(--hero-preview-height, 100svh) - 54px));
  padding: 52px 20px;
}
.dynamic-overlay-hero.is-preview.is-portrait {
  min-height: var(--hero-preview-height);
}
.dynamic-overlay-hero.is-portrait .dynamic-overlay-title { font-size: 46px; }
.dynamic-overlay-hero.is-portrait .dynamic-overlay-subtitle { font-size: 17px; }

@media (prefers-reduced-motion: reduce) {
  .dynamic-overlay-image,
  .dynamic-overlay-eyebrow,
  .dynamic-overlay-title,
  .dynamic-overlay-subtitle,
  .dynamic-overlay-actions { animation: none; }
  .dynamic-overlay-button { transition: none; }
}

/* ========== Split 模板 ========== */
.dynamic-split-hero {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.dynamic-split-hero :deep(> *) {
  min-width: 0;
  height: 100%;
}

@media (max-width: 768px) {
  .dynamic-split-hero,
  .dynamic-split-hero.is-portrait {
    grid-template-columns: minmax(0, 1fr);
  }
}

.dynamic-split-hero.is-portrait {
  grid-template-columns: minmax(0, 1fr);
}

/* ========== Responsive 模板 ========== */
.dynamic-responsive-hero {
  min-height: 620px;
  padding: 72px 0 0;
}

.dynamic-responsive-visual {
  display: block;
  line-height: 0;
  width: 100%;
  margin: 0;
  text-align: center;
}

.dynamic-responsive-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: clamp(420px, 62vh, 680px);
  object-fit: contain;
  object-position: center bottom;
  margin: 0 auto;
}
.dynamic-responsive-hero.is-preview .dynamic-responsive-image {
  max-height: clamp(420px, 62cqh, 680px);
}

@media (orientation: portrait) {
  .dynamic-responsive-hero {
    min-height: auto;
    padding-top: 56px;
  }
  .dynamic-responsive-image {
    width: auto;
    height: clamp(360px, 48svh, 440px);
    max-width: 100%;
    object-position: center center;
  }
}

.dynamic-responsive-hero.is-portrait {
  min-height: auto;
  padding-top: 56px;
}

.dynamic-responsive-hero.is-portrait .dynamic-responsive-image {
  width: auto;
  height: clamp(360px, 48svh, 440px);
  max-width: 100%;
  object-position: center center;
}

@media (max-width: 768px) {
  .dynamic-responsive-hero {
    padding-left: 0;
    padding-right: 0;
  }
}
</style>

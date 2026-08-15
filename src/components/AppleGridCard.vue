<template>
  <div class="apple-grid-card" :class="[`variant-${variant}`]">
    <div class="agc-content" :style="contentStyle">
      <h3 class="agc-title" v-html="sanitizedTitle"></h3>
      <p v-if="subtitle" class="agc-subtitle">{{ subtitle }}</p>
      <div v-if="links && links.length" class="agc-links" :style="{ justifyContent: textAlignment }">
        <template v-for="(link, i) in links" :key="i">
          <router-link
            v-if="link.to"
            :to="link.to"
            class="agc-link"
            :class="[link.type ? `agc-link-${link.type}` : '']"
            @click="link.onClick"
          >
            <template v-if="!link.type">{{ link.text }} &rsaquo;</template>
            <template v-else>{{ link.text }}</template>
          </router-link>
          <a
            v-else-if="link.href"
            :href="link.href"
            class="agc-link"
            :class="[link.type ? `agc-link-${link.type}` : '']"
            target="_blank"
            rel="noopener noreferrer"
          >
            <template v-if="!link.type">{{ link.text }} &rsaquo;</template>
            <template v-else>{{ link.text }}</template>
          </a>
          <button
            v-else
            class="agc-link"
            :class="[link.type ? `agc-link-${link.type}` : '']"
            @click="link.onClick"
          >
            <template v-if="!link.type">{{ link.text }} &rsaquo;</template>
            <template v-else>{{ link.text }}</template>
          </button>
        </template>
      </div>
    </div>
    <div class="agc-visual">
      <slot>
        <img
          v-if="imageSrc"
          :src="imageSrc"
          :alt="imageAlt"
          class="agc-image"
          :class="{ 'is-position-editable': imagePositionEditable }"
          :style="imageStyle"
          loading="lazy"
          decoding="async"
          @pointerdown="startImagePositionDrag"
          @pointermove="updateImagePositionDrag"
          @pointerup="stopImagePositionDrag"
          @pointercancel="stopImagePositionDrag"
        />
      </slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import DOMPurify from '@/utils/dompurify.js'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  variant: { type: String, default: 'dark', validator: v => ['dark', 'light'].includes(v) },
  imageSrc: { type: String, default: '' },
  imageAlt: { type: String, default: '' },
  links: { type: Array, default: () => [] },
  imageStyle: { type: Object, default: () => ({}) },
  contentLayout: { type: Object, default: null },
  imagePositionEditable: { type: Boolean, default: false }
})
const emit = defineEmits(['image-position'])

const sanitizedTitle = computed(() => DOMPurify.sanitize(props.title, {
  ALLOWED_TAGS: ['br', 'b', 'strong', 'em', 'i', 'span'],
  ALLOWED_ATTR: ['class']
}))
const textAlignment = computed(() => props.contentLayout?.text_align || 'center')
const contentStyle = computed(() => ({
  textAlign: textAlignment.value,
  alignSelf: ({ left: 'flex-start', center: 'center', right: 'flex-end' })[props.contentLayout?.align] || 'center',
  maxWidth: props.contentLayout?.max_width ? `${props.contentLayout.max_width}px` : undefined
}))

let draggingImage = false
const emitImagePosition = (event) => {
  if (!props.imagePositionEditable) return
  const rect = event.currentTarget.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  emit('image-position', {
    x: Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))),
    y: Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100)))
  })
}
const startImagePositionDrag = (event) => {
  if (!props.imagePositionEditable) return
  draggingImage = true
  event.preventDefault()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  emitImagePosition(event)
}
const updateImagePositionDrag = (event) => {
  if (draggingImage) emitImagePosition(event)
}
const stopImagePositionDrag = (event) => {
  draggingImage = false
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}
</script>

<style scoped>
.apple-grid-card {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 60px 24px 48px;
  min-height: 480px;
  position: relative;
}

.variant-dark {
  background: #000000;
  color: #f5f5f7;
}

.variant-light {
  background: #ffffff;
  color: #1d1d1f;
  box-shadow: none;
  transition: none;
}

.variant-light:hover {
  transform: none;
  box-shadow: none;
}

.agc-content {
  animation: agcFadeIn .8s ease both;
  z-index: 1;
}

.agc-title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  letter-spacing: -.01em;
  line-height: 1.1;
  margin: 0 0 8px;
}

.variant-dark .agc-title { color: #f5f5f7; }
.variant-light .agc-title { color: #1d1d1f; }

.agc-subtitle {
  font-size: clamp(14px, 2vw, 19px);
  font-weight: 400;
  line-height: 1.42;
  margin: 0 0 20px;
  max-width: 360px;
}

.variant-dark .agc-subtitle { color: color-mix(in srgb, #ffffff 70%, transparent); }
.variant-light .agc-subtitle { color: #86868b; }

.agc-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
}

.agc-link {
  display: inline-flex;
  align-items: center;
  font-size: clamp(14px, 1.8vw, 17px);
  color: #2997ff;
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  transition: color .3s ease;
}
.variant-light .agc-link { color: #0071e3; }
.agc-link:hover { text-decoration: underline; color: #64b5f6; }

/* 胶囊按钮样式 */
.agc-link-primary {
  padding: 12px 26px;
  background: #2997ff;
  color: #000000 !important;
  border-radius: 980px;
  font-size: 17px;
  font-weight: 400;
  text-decoration: none !important;
  line-height: 1.17648;
  transition: background-color 0.3s ease;
}

.agc-link-primary:hover {
  background: #3aa0ff;
  text-decoration: none !important;
}

.variant-light .agc-link-primary {
  background: #0071e3;
  color: #ffffff !important;
}

.variant-light .agc-link-primary:hover {
  background: #0077ed;
}

.agc-link-secondary {
  padding: 12px 26px;
  background: transparent;
  color: #2997ff !important;
  border: 1px solid #2997ff;
  border-radius: 980px;
  font-size: 17px;
  font-weight: 400;
  text-decoration: none !important;
  line-height: 1.17648;
  transition: all 0.3s ease;
}

.agc-link-secondary:hover {
  background: rgba(41, 151, 255, 0.15);
  text-decoration: none !important;
}

.variant-light .agc-link-secondary {
  color: #0071e3 !important;
  border-color: #0071e3;
}

.variant-light .agc-link-secondary:hover {
  background: rgba(0, 113, 227, 0.08);
}

.agc-visual {
  margin-top: auto;
  padding-top: 24px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  width: 100%;
  animation: agcFadeIn .8s ease .15s both;
}

.agc-image {
  max-width: 100%;
  max-height: 280px;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
.agc-image.is-position-editable { cursor: crosshair; touch-action: none; }

/* 固定预览画布内改用容器单位，确保字号与真实画布宽度一致。 */
.apple-grid-card.is-preview .agc-title { font-size: clamp(28px, 4cqw, 40px); }
.apple-grid-card.is-preview .agc-subtitle { font-size: clamp(14px, 2cqw, 19px); }
.apple-grid-card.is-preview .agc-link { font-size: clamp(14px, 1.8cqw, 17px); }
.apple-grid-card.is-preview.is-portrait {
  padding: 40px 22px 32px;
  min-height: 380px;
}
.apple-grid-card.is-preview.is-portrait .agc-title { font-size: 28px; }
.apple-grid-card.is-preview.is-portrait .agc-subtitle { font-size: 15px; }
.apple-grid-card.is-preview.is-portrait .agc-links { gap: 10px; }
.apple-grid-card.is-preview.is-portrait .agc-link-primary,
.apple-grid-card.is-preview.is-portrait .agc-link-secondary {
  min-width: auto;
  padding: 9px 20px;
  font-size: 14px;
}
.apple-grid-card.is-preview.is-portrait .agc-image { max-height: 220px; }

@keyframes agcFadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Responsive */
@media (max-width: 768px) {
  .apple-grid-card {
    padding: 40px 22px 32px;
    min-height: 380px;
  }

  .agc-title {
    font-size: 28px;
  }

  .agc-subtitle {
    font-size: 15px;
  }

  .agc-links {
    gap: 10px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .agc-link-primary,
  .agc-link-secondary {
    padding: 9px 20px;
    font-size: 14px;
    min-width: auto;
    justify-content: center;
  }

  .agc-image {
    max-height: 220px;
  }
}

@media (max-width: 480px) {
  .apple-grid-card {
    padding: 36px 18px 28px;
    min-height: 340px;
  }

  .agc-title {
    font-size: 26px;
  }

  .agc-subtitle {
    font-size: 14px;
  }

  .agc-links {
    gap: 8px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .agc-link-primary,
  .agc-link-secondary {
    padding: 9px 18px;
    font-size: 14px;
    min-width: auto;
    justify-content: center;
  }

  .agc-image {
    max-height: 200px;
  }
}
</style>

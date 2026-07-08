<template>
  <section
    class="hero-section"
    :class="[`variant-${variant}`, { 'has-visual': !!imageSrc || !!$slots.visual }]"
  >
    <div class="hero-container">
      <div class="hero-content" ref="contentRef">
        <p v-if="eyebrow" class="hero-eyebrow">{{ eyebrow }}</p>
        <h1 v-if="titleLevel === 1" class="hero-title" v-html="title"></h1>
        <h2 v-else class="hero-title hero-title-h2" v-html="title"></h2>
        <p v-if="subtitle" class="hero-subtitle">{{ subtitle }}</p>
        <div v-if="actions && actions.length" class="hero-actions">
          <template v-for="(action, i) in actions" :key="i">
            <router-link
              v-if="action.to"
              :to="action.to"
              :class="actionClass(action.type)"
              @click="action.onClick"
            >
              <span>{{ action.label }}</span>
              <svg v-if="action.arrow" class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </router-link>
            <a
              v-else-if="action.href"
              :href="action.href"
              :class="actionClass(action.type)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ action.label }}
            </a>
            <button
              v-else
              :class="actionClass(action.type)"
              @click="action.onClick"
            >
              {{ action.label }}
            </button>
          </template>
        </div>
      </div>
      <div v-if="imageSrc || !!$slots.visual" class="hero-visual">
        <slot name="visual">
          <div class="hero-image-wrapper">
            <img
              :src="imageSrc"
              :alt="imageAlt"
              class="hero-image"
              :style="imageStyle"
              loading="lazy"
              decoding="async"
            />
          </div>
        </slot>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  imageSrc: { type: String, default: '' },
  imageAlt: { type: String, default: '' },
  imageAspect: { type: String, default: '16/9' },
  imageMaxW: { type: String, default: '920px' },
  imageFit: { type: String, default: 'contain' },
  variant: {
    type: String,
    default: 'light',
    validator: (v) => ['light', 'gray', 'dark'].includes(v)
  },
  actions: { type: Array, default: () => [] },
  titleLevel: { type: Number, default: 1 }
})

const contentRef = ref(null)

const actionClass = (type) => {
  switch (type) {
    case 'primary': return 'hero-btn hero-btn-primary'
    case 'secondary': return 'hero-btn hero-btn-secondary'
    case 'link': return 'hero-text-link'
    default: return 'hero-btn hero-btn-primary'
  }
}

const imageStyle = computed(() => ({
  aspectRatio: props.imageAspect,
  maxWidth: props.imageMaxW,
  objectFit: props.imageFit
}))
</script>

<style scoped>
/* ============================================
   Hero Section Base
   ============================================ */
.hero-section {
  width: 100%;
  padding: var(--apple-hero-padding-top) var(--apple-section-padding-x) var(--apple-hero-padding-bottom);
  position: relative;
  overflow: hidden;
}

.hero-container {
  max-width: var(--apple-container-max);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: 48px;
  align-items: center;
  text-align: center;
}

/* ============================================
   Variants
   ============================================ */
.variant-light {
  background: var(--apple-bg-white);
  color: var(--apple-text-primary);
}

.variant-gray {
  background: var(--apple-bg-gray);
  color: var(--apple-text-primary);
}

.variant-dark {
  background: var(--apple-bg-dark);
  color: #f5f5f7;
}

.variant-dark .hero-eyebrow {
  color: color-mix(in srgb, #ffffff 70%, transparent);
}

.variant-dark .hero-subtitle {
  color: color-mix(in srgb, #ffffff 85%, transparent);
}

.variant-dark .hero-text-link {
  color: var(--apple-brand-dark);
}

/* ============================================
   Content
   ============================================ */
.hero-content {
  animation: heroFadeIn 1s var(--apple-ease);
}

.hero-eyebrow {
  margin: 0 0 8px;
  font-size: var(--apple-eyebrow);
  font-weight: 400;
  letter-spacing: var(--apple-eyebrow-ls);
  color: var(--apple-text-secondary);
}

.hero-title {
  font-size: var(--apple-display-1);
  font-weight: var(--apple-display-1-weight);
  letter-spacing: var(--apple-display-1-ls);
  line-height: var(--apple-display-1-lh);
  margin: 0;
  background: linear-gradient(135deg, var(--apple-text-primary) 0%, #434344 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-title-h2 {
  font-size: var(--apple-display-2);
  letter-spacing: var(--apple-display-2-ls);
  line-height: var(--apple-display-2-lh);
}

.variant-dark .hero-title {
  background: none;
  -webkit-text-fill-color: #f5f5f7;
  color: #f5f5f7;
}

.hero-subtitle {
  margin: 12px auto 0;
  max-width: 720px;
  font-size: var(--apple-copy);
  line-height: var(--apple-copy-lh);
  letter-spacing: var(--apple-copy-ls);
  font-weight: 400;
  color: var(--apple-text-secondary);
}

/* ============================================
   Actions
   ============================================ */
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 22px;
  margin-top: 24px;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--apple-btn-height);
  padding: 8px var(--apple-btn-padding-x);
  border-radius: var(--apple-btn-radius);
  font-size: var(--apple-btn-font);
  line-height: 1.17645;
  letter-spacing: -0.022em;
  font-weight: 400;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
  transition: background-color var(--apple-duration-fast) ease,
              color var(--apple-duration-fast) ease,
              opacity var(--apple-duration-fast) ease;
}

.hero-btn-primary {
  background: var(--apple-brand);
  color: #ffffff;
  box-shadow: 0 4px 20px rgba(0, 122, 255, 0.3);
}

.hero-btn-primary:hover {
  background: var(--apple-brand-hover);
}

.hero-btn-secondary {
  background: transparent;
  color: var(--apple-brand);
  border: 1px solid var(--apple-brand);
}

.hero-btn-secondary:hover {
  background: var(--apple-brand);
  color: #ffffff;
}

.hero-text-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--apple-btn-font);
  line-height: 1.2;
  letter-spacing: -0.022em;
  color: var(--apple-brand);
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 0;
  text-decoration: none;
  transition: opacity var(--apple-duration-fast) ease;
}

.hero-text-link:hover {
  text-decoration: underline;
}

.hero-text-link .btn-arrow {
  width: 13px;
  height: 13px;
  transition: transform var(--apple-duration-fast) ease;
}

.hero-text-link:hover .btn-arrow {
  transform: translateX(2px);
}

.btn-arrow {
  width: 18px;
  height: 18px;
}

/* ============================================
   Visual
   ============================================ */
.hero-visual {
  display: flex;
  justify-content: center;
  align-items: center;
  animation: heroFadeIn 1s var(--apple-ease) 0.2s both;
}

.hero-image-wrapper {
  width: 100%;
  max-width: var(--apple-visual-max-w);
  border-radius: var(--apple-visual-radius);
  overflow: hidden;
  background: var(--apple-bg-light);
  border: 1px solid var(--apple-border);
}

.variant-gray .hero-image-wrapper {
  background: var(--apple-bg-white);
}

.variant-dark .hero-image-wrapper {
  background: color-mix(in srgb, #ffffff 5%, transparent);
  border-color: color-mix(in srgb, #ffffff 6%, transparent);
}

.hero-image {
  display: block;
  width: 100%;
  height: auto;
}

/* ============================================
   Animation
   ============================================ */
@keyframes heroFadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============================================
   Responsive
   ============================================ */
@media (max-width: 1024px) {
  .hero-section {
    padding: 50px 20px 40px;
  }

  .hero-container {
    gap: 36px;
  }

  .hero-title {
    font-size: 56px;
    line-height: 1.08;
  }

  .hero-title-h2 {
    font-size: 44px;
  }

  .hero-subtitle {
    font-size: 19px;
  }
}

@media (max-width: 768px) {
  .hero-section {
    padding: 44px 18px 36px;
  }

  .hero-container {
    gap: 28px;
  }

  .hero-title {
    font-size: 40px;
    line-height: 1.12;
  }

  .hero-title-h2 {
    font-size: 34px;
  }

  .hero-subtitle {
    font-size: 17px;
    line-height: 1.47;
  }

  .hero-actions {
    flex-direction: column;
    gap: 14px;
    margin-top: 20px;
  }

  .hero-btn {
    width: 100%;
    max-width: 320px;
    justify-content: center;
    min-height: 48px;
    font-size: 16px;
  }

  .hero-text-link {
    font-size: 16px;
  }

  .hero-image-wrapper {
    border-radius: 14px;
  }
}

@media (max-width: 480px) {
  .hero-section {
    padding: 36px 14px 28px;
  }

  .hero-title {
    font-size: 32px;
    line-height: 1.15;
  }

  .hero-title-h2 {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 15px;
  }

  .hero-actions {
    gap: 12px;
  }

  .hero-btn {
    min-height: 44px;
    font-size: 15px;
  }

  .hero-image-wrapper {
    border-radius: 12px;
  }
}
</style>

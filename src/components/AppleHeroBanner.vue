<template>
  <section class="apple-hero-banner" :class="[`variant-${variant}`, { 'is-card': card }]">
    <div class="ahb-container">
      <div class="ahb-content">
        <span v-if="tag" class="ahb-tag">{{ tag }}</span>
        <h1 class="ahb-title" v-html="sanitizedTitle"></h1>
        <p v-if="subtitle" class="ahb-subtitle">{{ subtitle }}</p>
        <div v-if="links && links.length" class="ahb-links">
          <template v-for="(link, i) in links" :key="i">
            <router-link
              v-if="link.to"
              :to="link.to"
              class="ahb-link"
              :class="[link.type ? `ahb-link-${link.type}` : '']"
              @click="link.onClick"
            >
              {{ link.text }}
              <svg
                v-if="!link.type"
                class="ahb-link-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </router-link>
            <a
              v-else-if="link.href"
              :href="link.href"
              class="ahb-link"
              :class="[link.type ? `ahb-link-${link.type}` : '']"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ link.text }}
              <svg
                v-if="!link.type"
                class="ahb-link-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </a>
            <button
              v-else
              class="ahb-link"
              :class="[link.type ? `ahb-link-${link.type}` : '']"
              @click="link.onClick"
            >
              {{ link.text }}
              <svg
                v-if="!link.type"
                class="ahb-link-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </template>
        </div>
      </div>
      <div v-if="imageSrc" class="ahb-visual" :class="{ 'ahb-visual-fullbleed': fullBleedImage }">
        <img
          :src="imageSrc"
          :alt="imageAlt"
          class="ahb-image"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div v-if="!imageSrc" class="ahb-visual">
        <slot></slot>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import DOMPurify from '@/utils/dompurify.js'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  tag: { type: String, default: '' },
  variant: {
    type: String,
    default: 'light',
    validator: (v) => ['light', 'dark', 'gray'].includes(v),
  },
  card: { type: Boolean, default: false },
  imageSrc: { type: String, default: '' },
  imageAlt: { type: String, default: '' },
  fullBleedImage: { type: Boolean, default: false },
  links: { type: Array, default: () => [] },
})

const sanitizedTitle = computed(() => DOMPurify.sanitize(props.title, {
  ALLOWED_TAGS: ['br', 'b', 'strong', 'em', 'i', 'span'],
  ALLOWED_ATTR: ['class']
}))
</script>

<style scoped>
/* ── Base ── */
.apple-hero-banner {
  width: 100%;
  padding: 140px var(--apple-section-padding-x) 100px;
  text-align: center;
  overflow: hidden;
}

.ahb-container {
  max-width: var(--apple-container-max);
  margin: 0 auto;
}

/* ── Card mode: 白色卡片样式（可复用） ── */
.apple-hero-banner.is-card {
  padding: 0;
  background: transparent;
}

.is-card .ahb-container {
  width: 100%;
  max-width: none;
  margin: 0;
  background: #ffffff;
  border-radius: 0;
  padding: 100px var(--apple-section-padding-x) 80px;
  box-shadow: none;
  transition: none;
}

.is-card:hover .ahb-container {
  transform: none;
  box-shadow: none;
}

.is-card.variant-dark .ahb-container {
  background: #000000;
}

.is-card.variant-gray .ahb-container {
  background: #f5f5f7;
}

.ahb-content {
  animation: ahbFadeIn 1s var(--apple-ease);
}

/* ── Variants ── */
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

.variant-dark .ahb-subtitle {
  color: color-mix(in srgb, #ffffff 85%, transparent);
}

.variant-dark .ahb-link {
  color: #2997ff;
}

/* ── Tag ── */
.ahb-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: #bf4800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

/* ── Title ── */
.ahb-title {
  font-size: clamp(40px, 8vw, 80px);
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.05;
  margin: 0 0 12px;
  color: var(--apple-text-primary);
}

.variant-dark .ahb-title {
  color: #f5f5f7;
}

/* ── Subtitle ── */
.ahb-subtitle {
  font-size: clamp(16px, 2.4vw, 28px);
  font-weight: 400;
  line-height: 1.42;
  letter-spacing: 0.011em;
  color: #86868b;
  margin: 0 0 28px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

/* ── Links ── */
.ahb-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
}

.ahb-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: clamp(16px, 2vw, 21px);
  color: var(--apple-brand);
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  transition: color var(--apple-duration-fast) ease;
}

.ahb-link:hover {
  color: var(--apple-brand-hover);
  text-decoration: underline;
}

.ahb-link-arrow {
  width: 12px;
  height: 12px;
  transition: transform var(--apple-duration-fast) ease;
}

.ahb-link:hover .ahb-link-arrow {
  transform: translateX(2px);
}

/* ── Button-style links (Apple 胶囊按钮) ── */
.ahb-link-primary {
  padding: 12px 26px;
  background: #0071e3;
  color: #ffffff;
  border-radius: 980px;
  font-size: 17px;
  font-weight: 400;
  text-decoration: none;
  line-height: 1.17648;
  transition: background-color 0.3s ease;
}

.ahb-link-primary:hover {
  background: #0077ed;
  text-decoration: none;
}

.variant-dark .ahb-link-primary {
  background: #2997ff;
  color: #000000;
}

.variant-dark .ahb-link-primary:hover {
  background: #3aa0ff;
}

.ahb-link-secondary {
  padding: 12px 26px;
  background: transparent;
  color: #0071e3;
  border: 1px solid #0071e3;
  border-radius: 980px;
  font-size: 17px;
  font-weight: 400;
  text-decoration: none;
  line-height: 1.17648;
  transition: all 0.3s ease;
}

.ahb-link-secondary:hover {
  background: rgba(0, 113, 227, 0.08);
  text-decoration: none;
}

.variant-dark .ahb-link-secondary {
  color: #2997ff;
  border-color: #2997ff;
}

.variant-dark .ahb-link-secondary:hover {
  background: rgba(41, 151, 255, 0.15);
}

/* ── Visual / Image ── */
.ahb-visual {
  margin-top: 40px;
  display: flex;
  justify-content: center;
  animation: ahbFadeIn 1s var(--apple-ease) 0.2s both;
}

.ahb-image {
  max-width: 100%;
  height: auto;
  display: block;
}

.ahb-visual-fullbleed {
  margin-top: 40px;
}

.ahb-visual-fullbleed .ahb-image {
  width: 100%;
  max-width: none;
}

/* ── Animation ── */
@keyframes ahbFadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Responsive: Tablet ── */
@media (max-width: 768px) {
  .apple-hero-banner {
    padding: 80px 20px 60px;
  }

  .is-card .ahb-container {
    padding: 60px 20px 50px;
  }

  .ahb-title {
    font-size: 40px;
  }

  .ahb-subtitle {
    font-size: 17px;
  }

  .ahb-links {
    gap: 12px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .ahb-link-primary,
  .ahb-link-secondary {
    padding: 11px 22px;
    font-size: 15px;
    min-width: auto;
    justify-content: center;
  }

  .ahb-visual {
    margin-top: 30px;
  }
}

/* ── Responsive: Mobile (竖屏) ── */
@media (max-width: 480px) {
  .apple-hero-banner {
    padding: 50px 16px 40px;
  }

  .is-card .ahb-container {
    padding: 50px 16px 40px;
  }

  .ahb-tag {
    font-size: 14px;
  }

  .ahb-title {
    font-size: 36px;
  }

  .ahb-subtitle {
    font-size: 16px;
  }

  .ahb-links {
    gap: 10px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .ahb-link-primary,
  .ahb-link-secondary {
    padding: 10px 20px;
    font-size: 15px;
    min-width: auto;
    justify-content: center;
  }

  .ahb-visual {
    margin-top: 24px;
  }

  .ahb-image {
    max-height: 280px;
  }
}
</style>

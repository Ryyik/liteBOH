<template>
  <!-- 标准卡片型：复用 AppleGridCard -->
  <AppleGridCard
    v-if="hero.template === 'standard'"
    class="dynamic-hero"
    :class="`dynamic-hero-${hero.id}`"
    :title="hero.title"
    :subtitle="hero.subtitle || ''"
    :variant="hero.variant"
    :image-src="heroImageSrc"
    :image-alt="hero.image_config.alt || ''"
    :links="resolvedLinks"
  />

  <!-- 全幅图片叠加型：复用 HomeOverlayHero 的样式结构 -->
  <section
    v-else-if="hero.template === 'overlay'"
    class="dynamic-overlay-hero"
    :aria-label="hero.aria_label || hero.title"
  >
    <img
      v-if="hero.image_config.src"
      :src="heroImageSrc"
      :alt="hero.image_config.alt || hero.title"
      class="dynamic-overlay-image"
      :style="{ objectPosition: hero.image_config.position || 'center center' }"
      loading="lazy"
      decoding="async"
      draggable="false"
    />
    <div class="dynamic-overlay-shade" aria-hidden="true"></div>
    <div class="dynamic-overlay-content">
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
    :aria-label="hero.aria_label || hero.title"
  >
    <AppleGridCard
      v-for="(card, idx) in splitCards"
      :key="`split-${idx}`"
      :title="card.title"
      :subtitle="card.subtitle || ''"
      :variant="card.variant || 'light'"
      :image-src="card.image_config.src || ''"
      :image-alt="card.image_config.alt || ''"
      :links="resolveLinks(card.links)"
    />
  </div>

  <!-- 横竖屏适配型：picture + source 切换 -->
  <AppleGridCard
    v-else-if="hero.template === 'responsive'"
    class="dynamic-hero dynamic-responsive-hero"
    :title="hero.title"
    :subtitle="hero.subtitle || ''"
    :variant="hero.variant"
    :links="resolvedLinks"
  >
    <picture class="dynamic-responsive-visual">
      <source
        v-if="hero.image_config.portraitSrc"
        media="(orientation: portrait)"
        :srcset="portraitSrc"
      />
      <source
        v-if="hero.image_config.landscapeSrc"
        media="(orientation: landscape)"
        :srcset="landscapeSrc"
      />
      <img
        :src="landscapeSrc || portraitSrc || ''"
        :alt="hero.image_config.alt || hero.title"
        class="dynamic-responsive-image"
        loading="eager"
        decoding="async"
        fetchpriority="high"
        draggable="false"
      />
    </picture>
  </AppleGridCard>
</template>

<script setup>
import { computed } from 'vue';
import AppleGridCard from '@/components/AppleGridCard.vue';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';

const props = defineProps({
  hero: { type: Object, required: true }
});

const emit = defineEmits(['link-click']);

const HERO_TRANSFORMS = {
  standard: 'f_auto,q_auto:good,c_fill,w_900',
  overlay:  'f_auto,q_auto:good,c_fill,w_1800',
  split:    'f_auto,q_auto:good,c_fill,w_900',
  responsive: 'f_auto,q_auto:good,w_1200'
};

const heroImageSrc = computed(() =>
  getCloudinaryTransformedUrl(props.hero.image_config.src || '', HERO_TRANSFORMS[props.hero.template] || '')
);
const portraitSrc = computed(() =>
  getCloudinaryTransformedUrl(props.hero.image_config.portraitSrc || '', HERO_TRANSFORMS.responsive)
);
const landscapeSrc = computed(() =>
  getCloudinaryTransformedUrl(props.hero.image_config.landscapeSrc || '', HERO_TRANSFORMS.responsive)
);

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
      src: getCloudinaryTransformedUrl(card.image_config.src || '', HERO_TRANSFORMS.split)
    }
  }))
);
</script>

<style scoped>
/* ========== Overlay 模板 ========== */
.dynamic-overlay-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  min-height: clamp(620px, 78svh, 900px);
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
  transform: scale(1.015);
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
  from { opacity: 0; transform: scale(1.07); }
  to { opacity: 1; transform: scale(1.015); }
}

@keyframes dynamicOverlayContentReveal {
  from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@media (max-width: 768px) {
  .dynamic-overlay-hero {
    min-height: min(760px, calc(100svh - 54px));
    padding: 52px 20px;
  }
  .dynamic-overlay-title { font-size: 46px; }
  .dynamic-overlay-subtitle { font-size: 17px; }
}

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
  .dynamic-split-hero {
    grid-template-columns: minmax(0, 1fr);
  }
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

@media (max-width: 768px) {
  .dynamic-responsive-hero {
    padding-left: 0;
    padding-right: 0;
  }
}
</style>

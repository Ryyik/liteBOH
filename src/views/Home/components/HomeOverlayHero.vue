<template>
  <section
    class="overlay-hero"
    :class="{
      'is-poster-draggable': posterPan,
      'is-poster-dragging': isPosterDragging,
    }"
    :aria-label="title"
    @pointerdown="startPosterDrag"
    @pointermove="movePosterDrag"
    @pointerup="finishPosterDrag"
    @pointercancel="finishPosterDrag"
  >
    <img
      ref="imageElement"
      class="overlay-hero-image"
      :src="imageSrc"
      :alt="imageAlt"
      :style="{ objectPosition: posterPan ? undefined : imagePosition }"
      :loading="priority ? 'eager' : 'lazy'"
      decoding="async"
      :fetchpriority="priority ? 'high' : 'auto'"
      draggable="false"
    >
    <div class="overlay-hero-shade" aria-hidden="true"></div>

    <div class="overlay-hero-content">
      <p v-if="eyebrow" class="overlay-hero-eyebrow">{{ eyebrow }}</p>
      <h1 class="overlay-hero-title">{{ title }}</h1>
      <p v-if="subtitle" class="overlay-hero-subtitle">{{ subtitle }}</p>

      <div v-if="links.length" class="overlay-hero-actions">
        <template v-for="(link, index) in links" :key="`${link.text}-${index}`">
          <router-link
            v-if="link.to"
            :to="link.to"
            class="overlay-hero-button"
            :class="`is-${link.type || 'secondary'}`"
            @click="link.onClick"
          >
            {{ link.text }}
          </router-link>
          <a
            v-else-if="link.href"
            :href="link.href"
            class="overlay-hero-button"
            :class="`is-${link.type || 'secondary'}`"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ link.text }}
          </a>
          <button
            v-else
            type="button"
            class="overlay-hero-button"
            :class="`is-${link.type || 'secondary'}`"
            @click="link.onClick"
          >
            {{ link.text }}
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  imageSrc: { type: String, required: true },
  imageAlt: { type: String, default: '' },
  imagePosition: { type: String, default: 'center center' },
  priority: { type: Boolean, default: false },
  posterPan: { type: Boolean, default: false },
  links: { type: Array, default: () => [] },
});

const imageElement = ref(null);
const posterPosition = ref(50);
const isPosterDragging = ref(false);

const POSTER_PAN_DURATION = 26000;
const POSTER_RESUME_DELAY = 4000;

let dragStartX = 0;
let dragStartPosition = 50;
let dragMoved = false;
let posterAnimation = null;
let posterResumeTimer = null;
let portraitMedia = null;
let reducedMotionMedia = null;

const isPortraitViewport = () => window.matchMedia('(orientation: portrait)').matches;

const readCurrentPosterPosition = () => {
  const position = imageElement.value
    ? Number.parseFloat(window.getComputedStyle(imageElement.value).objectPosition)
    : 50;
  return Number.isFinite(position) ? position : 50;
};

const clearPosterResumeTimer = () => {
  if (!posterResumeTimer) return;
  window.clearTimeout(posterResumeTimer);
  posterResumeTimer = null;
};

const createPosterAnimation = () => {
  posterAnimation?.cancel();
  posterAnimation = null;
  clearPosterResumeTimer();

  const image = imageElement.value;
  if (!image) return;
  image.style.objectPosition = '';

  if (!props.posterPan || !isPortraitViewport() || reducedMotionMedia?.matches) return;

  posterPosition.value = 0;
  posterAnimation = image.animate(
    [
      { objectPosition: '0% center' },
      { objectPosition: '100% center' },
    ],
    {
      duration: POSTER_PAN_DURATION,
      direction: 'alternate',
      easing: 'linear',
      fill: 'both',
      iterations: Infinity,
    },
  );
};

const syncPosterAnimation = (position) => {
  posterPosition.value = position;
  if (posterAnimation) {
    posterAnimation.currentTime = (position / 100) * POSTER_PAN_DURATION;
  } else if (imageElement.value) {
    imageElement.value.style.objectPosition = `${position}% center`;
  }
};

const startPosterDrag = (event) => {
  if (!props.posterPan || !isPortraitViewport() || event.button !== 0) return;
  if (event.target.closest('a, button')) return;

  dragStartX = event.clientX;
  dragStartPosition = readCurrentPosterPosition();
  dragMoved = false;
  clearPosterResumeTimer();
  posterAnimation?.pause();
  posterPosition.value = dragStartPosition;
  isPosterDragging.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
};

const movePosterDrag = (event) => {
  if (!isPosterDragging.value) return;

  const deltaX = event.clientX - dragStartX;
  if (!dragMoved && Math.abs(deltaX) < 6) return;
  dragMoved = true;

  const heroWidth = event.currentTarget.clientWidth || 1;
  const heroHeight = event.currentTarget.clientHeight || 1;
  const image = imageElement.value;
  const imageRatio = image?.naturalWidth && image?.naturalHeight
    ? image.naturalWidth / image.naturalHeight
    : 16 / 9;
  const renderedWidth = Math.max(heroWidth, heroHeight * imageRatio);
  const horizontalOverflow = Math.max(renderedWidth - heroWidth, heroWidth);
  const positionDelta = (deltaX / horizontalOverflow) * 100;

  syncPosterAnimation(Math.min(100, Math.max(0, dragStartPosition - positionDelta)));
};

const finishPosterDrag = (event) => {
  if (!isPosterDragging.value) return;
  isPosterDragging.value = false;

  if (dragMoved && posterAnimation && !reducedMotionMedia?.matches) {
    posterResumeTimer = window.setTimeout(() => {
      posterAnimation?.play();
      posterResumeTimer = null;
    }, POSTER_RESUME_DELAY);
  } else if (!dragMoved) {
    posterAnimation?.play();
  }

  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
};

onMounted(async () => {
  portraitMedia = window.matchMedia('(orientation: portrait)');
  reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  await nextTick();
  createPosterAnimation();
  portraitMedia.addEventListener?.('change', createPosterAnimation);
  reducedMotionMedia.addEventListener?.('change', createPosterAnimation);
});

onBeforeUnmount(() => {
  clearPosterResumeTimer();
  posterAnimation?.cancel();
  portraitMedia?.removeEventListener?.('change', createPosterAnimation);
  reducedMotionMedia?.removeEventListener?.('change', createPosterAnimation);
});
</script>

<style scoped>
.overlay-hero {
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

.overlay-hero-image,
.overlay-hero-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.overlay-hero-image {
  z-index: -2;
  display: block;
  object-fit: cover;
  object-position: center center;
  transform: scale(1.015);
  animation: overlayImageReveal 1.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.overlay-hero-shade {
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.04) 28%, rgba(0, 0, 0, 0.22) 58%, rgba(0, 0, 0, 0.76) 100%),
    linear-gradient(90deg, rgba(0, 0, 0, 0.12), transparent 28%, transparent 72%, rgba(0, 0, 0, 0.12));
}

.overlay-hero-content {
  width: min(100%, 980px);
  text-shadow: 0 2px 22px rgba(0, 0, 0, 0.38);
}

.overlay-hero-eyebrow,
.overlay-hero-title,
.overlay-hero-subtitle,
.overlay-hero-actions {
  animation: overlayContentReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.overlay-hero-eyebrow {
  margin: 0 0 10px;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 650;
  line-height: 1.3;
}

.overlay-hero-title {
  margin: 0;
  font-size: clamp(48px, 7vw, 92px);
  font-weight: 750;
  line-height: 1.02;
  letter-spacing: 0;
  text-wrap: balance;
  white-space: pre-line;
  animation-delay: 80ms;
}

.overlay-hero-subtitle {
  max-width: 720px;
  margin: 16px auto 0;
  color: rgba(255, 255, 255, 0.86);
  font-size: clamp(17px, 2vw, 24px);
  font-weight: 450;
  line-height: 1.45;
  animation-delay: 150ms;
}

.overlay-hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
  animation-delay: 220ms;
}

.overlay-hero-button {
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

.overlay-hero-button.is-primary {
  border-color: rgba(255, 255, 255, 0.62);
  color: #111;
  background: rgba(255, 255, 255, 0.78);
  text-shadow: none;
}

.overlay-hero-button.is-secondary {
  background: rgba(20, 20, 22, 0.34);
}

@media (hover: hover) {
  .overlay-hero-button:hover {
    transform: translateY(-2px);
  }

  .overlay-hero-button.is-primary:hover {
    background: rgba(255, 255, 255, 0.92);
  }

  .overlay-hero-button.is-secondary:hover {
    border-color: rgba(255, 255, 255, 0.56);
    background: rgba(20, 20, 22, 0.5);
  }
}

.overlay-hero-button:active {
  transform: scale(0.97);
}

.overlay-hero-button:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.9);
  outline-offset: 3px;
}

@keyframes overlayImageReveal {
  from { opacity: 0; transform: scale(1.07); }
  to { opacity: 1; transform: scale(1.015); }
}

@keyframes overlayContentReveal {
  from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@media (max-width: 768px) {
  .overlay-hero {
    min-height: min(760px, calc(100svh - 54px));
    padding: 52px 20px;
  }

  .overlay-hero-title {
    font-size: 46px;
  }

  .overlay-hero-subtitle {
    font-size: 17px;
  }
}

@media (orientation: portrait) and (max-width: 380px) {
  .overlay-hero-title {
    font-size: 40px;
  }
}

@media (orientation: portrait) {
  .overlay-hero.is-poster-draggable {
    cursor: grab;
    touch-action: pan-y;
  }

  .overlay-hero.is-poster-dragging {
    cursor: grabbing;
    user-select: none;
  }

  .overlay-hero.is-poster-draggable .overlay-hero-image {
    object-position: left center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay-hero-image,
  .overlay-hero-eyebrow,
  .overlay-hero-title,
  .overlay-hero-subtitle,
  .overlay-hero-actions {
    animation: none;
  }

  .overlay-hero-image {
    object-position: center center;
  }

  .overlay-hero-button {
    transition: none;
  }
}
</style>

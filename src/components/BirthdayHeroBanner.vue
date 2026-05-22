<template>
  <section class="birthday-home-hero" aria-labelledby="birthday-home-title">
    <div class="birthday-home-media" aria-hidden="true">
      <img :src="getImageUrl('cake202512.webp')" alt="" fetchpriority="high" decoding="async" />
    </div>

    <div class="birthday-home-content">
      <div class="birthday-home-kicker">
        <PartyPopper :size="18" stroke-width="2.2" />
        <span>BOH Birthday Party</span>
      </div>

      <h1 id="birthday-home-title" class="birthday-home-title">
        {{ displayName }} 生日会
      </h1>

      <p class="birthday-home-subtitle">
        今天，方块之家为你点亮一场专属庆祝。
      </p>

      <div class="birthday-home-actions">
        <router-link to="/birthday" class="birthday-home-primary">
          <Gift :size="19" stroke-width="2.3" />
          <span>进入生日会</span>
          <ArrowRight :size="18" stroke-width="2.4" />
        </router-link>
        <span class="birthday-home-date">
          <CalendarHeart :size="17" stroke-width="2.2" />
          {{ birthdayLabel }}
        </span>
      </div>
    </div>

    <div class="birthday-home-card" aria-hidden="true">
      <div class="birthday-card-logo">
        <img :src="getImageUrl('favicon.webp')" alt="" loading="lazy" decoding="async" />
      </div>
      <div>
        <span class="birthday-card-label">TODAY</span>
        <strong>Happy Birthday</strong>
      </div>
      <Sparkles :size="24" stroke-width="2.2" />
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, CalendarHeart, Gift, PartyPopper, Sparkles } from 'lucide-vue-next';
import confetti from 'canvas-confetti';
import { computed, onMounted } from 'vue';
import { getImageUrl } from '@/utils/asset-helper.js';

const props = defineProps({
  username: {
    type: String,
    default: '朋友'
  },
  month: {
    type: [String, Number],
    default: ''
  },
  day: {
    type: [String, Number],
    default: ''
  }
});

const displayName = computed(() => String(props.username || '').trim() || '朋友');

const birthdayLabel = computed(() => {
  const month = String(props.month || '').padStart(2, '0');
  const day = String(props.day || '').padStart(2, '0');
  if (!month || !day || month === '00' || day === '00') return '生日当天限定';
  return `${month}/${day} 当日限定`;
});

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const fireOpeningConfetti = () => {
  if (prefersReducedMotion()) return;

  const colors = ['#ffffff', '#ff4d5f', '#ffce47', '#4f8cff', '#39b980'];

  confetti({
    particleCount: 88,
    spread: 78,
    startVelocity: 42,
    origin: { x: 0.22, y: 0.36 },
    colors
  });

  confetti({
    particleCount: 88,
    spread: 78,
    startVelocity: 42,
    origin: { x: 0.78, y: 0.34 },
    colors
  });
};

onMounted(() => {
  window.setTimeout(fireOpeningConfetti, 260);
});
</script>

<style scoped>
.birthday-home-hero {
  position: relative;
  min-height: clamp(620px, 92vh, 860px);
  padding: 120px min(7vw, 96px) 72px;
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(320px, 0.98fr);
  align-items: center;
  gap: clamp(28px, 5vw, 72px);
  overflow: hidden;
  background:
    linear-gradient(110deg, rgba(6, 6, 7, 0.94) 0%, rgba(22, 23, 26, 0.86) 48%, rgba(255, 255, 255, 0.12) 100%),
    radial-gradient(circle at 86% 22%, rgba(255, 214, 102, 0.34), transparent 28%),
    radial-gradient(circle at 18% 18%, rgba(255, 70, 89, 0.24), transparent 30%),
    #0c0d10;
  color: #fff;
  isolation: isolate;
}

.birthday-home-hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 150px;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.08));
  pointer-events: none;
  z-index: -1;
}

.birthday-home-content {
  position: relative;
  z-index: 1;
  max-width: 720px;
}

.birthday-home-kicker,
.birthday-home-date {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.birthday-home-kicker {
  padding: 10px 14px;
  margin-bottom: 26px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(18px);
}

.birthday-home-title {
  margin: 0;
  font-size: clamp(56px, 9vw, 128px);
  line-height: 0.88;
  letter-spacing: 0;
  font-weight: 900;
  text-wrap: balance;
}

.birthday-home-subtitle {
  width: min(540px, 100%);
  margin: 26px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: clamp(18px, 2vw, 26px);
  line-height: 1.42;
  font-weight: 500;
}

.birthday-home-actions {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 42px;
}

.birthday-home-primary {
  min-height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 24px;
  border-radius: 999px;
  color: #111214;
  background: #fff;
  text-decoration: none;
  font-size: 16px;
  font-weight: 800;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}

.birthday-home-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.32);
}

.birthday-home-media {
  position: relative;
  z-index: 1;
  align-self: stretch;
  min-height: 430px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
  transform: rotate(1.5deg);
}

.birthday-home-media::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, rgba(0, 0, 0, 0.4), transparent 50%),
    linear-gradient(120deg, rgba(255, 255, 255, 0.18), transparent 36%);
}

.birthday-home-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.04);
}

.birthday-home-card {
  position: absolute;
  left: min(11vw, 138px);
  bottom: 54px;
  z-index: 2;
  min-width: 275px;
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(24px);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.24);
}

.birthday-card-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #fff;
}

.birthday-card-logo img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.birthday-card-label {
  display: block;
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.birthday-home-card strong {
  display: block;
  color: #fff;
  font-size: 18px;
}

@media (max-width: 860px) {
  .birthday-home-hero {
    grid-template-columns: 1fr;
    min-height: 760px;
    padding: 108px 22px 54px;
  }

  .birthday-home-media {
    min-height: 260px;
    order: -1;
    transform: none;
  }

  .birthday-home-card {
    position: relative;
    left: auto;
    right: auto;
    bottom: auto;
    margin-top: 24px;
    width: 100%;
    min-width: 0;
  }
}

@media (min-width: 861px) and (max-width: 1240px) {
  .birthday-home-card {
    left: 32px;
    bottom: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .birthday-home-primary {
    transition: none;
  }
}
</style>

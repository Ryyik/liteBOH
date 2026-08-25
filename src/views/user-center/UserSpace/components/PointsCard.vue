<template>
  <article
    class="points-card"
    :class="[`is-${resolvedSkin}`, { 'has-custom-image': resolvedSkin === 'custom' && imageUrl, 'is-compact': compact, 'is-interactive': interactive }]"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="interactive ? '打开方块积分卡设置' : undefined"
    @click="interactive && $emit('click')"
    @keydown.enter.self="interactive && $emit('click')"
    @keydown.space.self.prevent="interactive && $emit('click')"
  >
    <img v-if="resolvedSkin === 'custom' && imageUrl" class="points-card-custom-image" :src="imageUrl" alt="" loading="lazy">
    <template v-else-if="resolvedSkin === 'cats'">
      <span class="points-card-cat-stage" aria-hidden="true">
        <img v-for="cat in catSkinAssets" :key="cat.id" class="points-card-cat" :src="cat.src" alt="" loading="lazy">
      </span>
    </template>
    <span v-if="resolvedSkin === 'custom' && imageUrl" class="points-card-scrim" aria-hidden="true"></span>
    <span class="points-card-content">
      <span class="points-card-topline"><span>方块积分</span><Coins :size="18" :stroke-width="1.8" aria-hidden="true" /></span>
      <span class="points-card-points">{{ pointsDisplay }}</span>
      <span class="points-card-label">可用积分</span>
      <span class="points-card-footer">
        <span>{{ username }}</span>
        <span class="points-card-footer-actions">
          <span>{{ tierLabel }}</span>
          <button v-if="showSponsorAction" type="button" class="points-card-sponsor" @click.stop="$emit('sponsor')" @keydown.stop>赞助</button>
        </span>
      </span>
    </span>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { Coins } from 'lucide-vue-next';
import { HOME_CAT_ASSETS } from '@/utils/home-cat-theme.js';

const props = defineProps({
  points: { type: Number, default: 0 },
  username: { type: String, default: '未命名用户' },
  tierLabel: { type: String, default: 'BOH' },
  skin: { type: String, default: 'blank' },
  imageUrl: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showSponsorAction: { type: Boolean, default: false }
});

defineEmits(['click', 'sponsor']);

const resolvedSkin = computed(() => ['blank', 'cats', 'custom'].includes(props.skin) ? props.skin : 'blank');
const pointsDisplay = computed(() => Math.max(0, Number(props.points) || 0).toLocaleString('zh-CN'));
const catSkinAssets = Object.entries(HOME_CAT_ASSETS).map(([id, src]) => ({ id, src }));
</script>

<style scoped>
.points-card { position: relative; isolation: isolate; display: block; width: 100%; aspect-ratio: 8 / 5; overflow: hidden; border: 0.5px solid rgba(18, 34, 51, .10); border-radius: 18px; background: #edf2f4; color: #122233; box-shadow: 0 8px 20px rgba(27, 49, 69, .08); text-align: left; }
.points-card.is-interactive { cursor: pointer; }
.points-card.is-blank { background: #edf2f4; }
.points-card.is-cats { background: #fff; border-color: rgba(181, 117, 135, .16); color: #3c3437; box-shadow: 0 8px 20px rgba(169, 104, 126, .08); }
.points-card-custom-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.points-card-scrim { position: absolute; inset: 0; z-index: 1; background: rgba(247, 251, 252, .10); }
.points-card.has-custom-image .points-card-scrim { background: rgba(8, 19, 28, .32); }
.points-card-cat-stage { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
.points-card-cat { position: absolute; width: 20%; height: auto; object-fit: contain; filter: drop-shadow(0 5px 7px rgba(76, 58, 61, .12)); }
.points-card-cat:nth-child(1) { width: 19%; left: 4%; bottom: 6%; transform: rotate(-9deg); }.points-card-cat:nth-child(2) { width: 18%; right: 4%; bottom: 6%; transform: rotate(7deg); }.points-card-cat:nth-child(3) { width: 17%; left: 39%; top: 3%; transform: rotate(5deg); }.points-card-cat:nth-child(4) { width: 15%; left: 63%; top: 3%; transform: rotate(-11deg); }.points-card-cat:nth-child(5) { width: 15%; left: 16%; top: 21%; transform: rotate(-8deg); }.points-card-cat:nth-child(6) { width: 14%; right: 15%; top: 25%; transform: rotate(12deg); }.points-card-cat:nth-child(7) { width: 14%; left: 32%; bottom: 16%; transform: rotate(-4deg); }.points-card-cat:nth-child(8) { width: 13%; left: 53%; bottom: 20%; transform: rotate(8deg); }.points-card-cat:nth-child(9) { width: 12%; left: 31%; top: 34%; transform: rotate(12deg); }.points-card-cat:nth-child(10) { width: 11%; left: 61%; bottom: 10%; transform: rotate(-7deg); }
.points-card-content { position: relative; z-index: 2; display: flex; min-height: 100%; flex-direction: column; padding: clamp(16px, 5%, 22px); }
.points-card-topline, .points-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 650; letter-spacing: -0.01em; }
.points-card-points { margin-top: auto; font-size: clamp(28px, 8.5vw, 40px); font-weight: 780; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.points-card-label { margin-top: 4px; font-size: 11.5px; font-weight: 500; opacity: .62; }.points-card-footer { margin-top: auto; font-size: 11px; opacity: .62; }
.points-card-footer-actions { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }.points-card-sponsor { min-height: auto; padding: 0; border: 0; border-radius: 0; background: transparent; color: #007aff; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; text-underline-offset: 2px; }.points-card-sponsor:hover { text-decoration: underline; background: transparent; }.points-card.has-custom-image .points-card-sponsor { border: 0; background: transparent; color: #fff; opacity: 0.92; }.points-card.has-custom-image .points-card-sponsor:hover { background: transparent; opacity: 1; text-decoration: underline; }
.points-card.has-custom-image { color: #fff; border-color: rgba(255,255,255,.28); }.points-card.has-custom-image .points-card-label, .points-card.has-custom-image .points-card-footer { opacity: .84; }
.points-card.is-interactive:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(27, 49, 69, .12); }.points-card.is-interactive:focus-visible { outline: 2px solid #007aff; outline-offset: 2px; }
.points-card.is-compact { max-width: 368px; aspect-ratio: 2.08 / 1; border-radius: 14px; }.points-card.is-compact .points-card-content { padding: 14px 16px; }.points-card.is-compact .points-card-points { font-size: 26px; }
@media (max-width: 420px) { .points-card-cat:nth-child(3) { width: 19%; }.points-card-cat:nth-child(4) { width: 17%; }.points-card-cat:nth-child(9), .points-card-cat:nth-child(10) { width: 12%; }.points-card-footer-actions { gap: 6px; }.points-card-sponsor { padding: 0; } }
@media (prefers-reduced-motion: reduce) { .points-card.is-interactive:hover { transform: none; } }
</style>

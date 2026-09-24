<template>
  <a
    :href="ad.link_url || 'javascript:;'"
    :class="['post-card-v2', 'glass-panel', 'ad-slot', { 'ad-slot-fixed': hasFixedHeight }]"
    :style="heightVars"
    :aria-label="`广告：${ad.title || '推广内容'}`"
    @click.prevent="handleClick"
  >
    <div v-if="ad.image_url && !imageFailed" class="ad-slot-media">
      <img :src="ad.image_url" :alt="ad.title || '广告'" loading="lazy" @error="onImageError" />
    </div>
    <div v-else class="ad-slot-placeholder">📢</div>
    <span class="ad-slot-tag">广告</span>
    <div class="ad-slot-body">
      <span class="ad-slot-title">{{ ad.title || '赞助内容' }}</span>
      <span class="ad-slot-cta">了解更多 →</span>
    </div>
  </a>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../../../utils/supabase-client.js';

const props = defineProps({
  ad: { type: Object, required: true }
});

const router = useRouter();
const imageFailed = ref(false);

const onImageError = () => {
  imageFailed.value = true;
};

// 「帖子大小」档位的内置高度：前台实测帖子卡片高度（横屏 ≈ 536px / 竖屏 ≈ 400px）
const POST_CARD_HEIGHT = { landscape: 520, portrait: 400 };

// 自定义像素值：0/空/非法时沿用「帖子大小」档
const resolveCustomHeight = (value, fallback) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// card_size: 'post'（默认，帖子大小）/ 'custom'（自定义像素）/ 'auto'（跟随图片比例）
const hasFixedHeight = computed(() => String(props.ad?.card_size || 'post') !== 'auto');

const heightVars = computed(() => {
  if (!hasFixedHeight.value) return null;
  const isCustom = props.ad?.card_size === 'custom';
  const landscape = isCustom
    ? resolveCustomHeight(props.ad?.card_height_landscape, POST_CARD_HEIGHT.landscape)
    : POST_CARD_HEIGHT.landscape;
  const portrait = isCustom
    ? resolveCustomHeight(props.ad?.card_height_portrait, POST_CARD_HEIGHT.portrait)
    : POST_CARD_HEIGHT.portrait;
  return {
    '--ad-h-landscape': `${landscape}px`,
    '--ad-h-portrait': `${portrait}px`
  };
});

const isExternal = (url) => /^https?:\/\//i.test(url || '') || url?.startsWith('//');

const handleClick = () => {
  if (props.ad?.id) {
    supabase
      .rpc('increment_ad_clicks', { target_id: props.ad.id })
      .then(() => {})
      .catch(() => {});
  }
  const target = props.ad?.link_url;
  if (!target) return;
  if (isExternal(target)) {
    window.open(target, '_blank', 'noopener,noreferrer');
  } else {
    router.push(target);
  }
};
</script>

<style scoped>
/* 复用 post-card-v2 容器样式，使广告卡片与帖子卡片同尺寸、同间距 */
.ad-slot {
  display: block;
  padding: 24px;
  text-decoration: none;
  position: relative;
}
/* 「帖子大小」/「自定义像素」档：卡片整体固定高度（横竖屏各取配置值，断点与
   src/utils/forum-viewport.js 的横屏判据同组），媒体区自动填充剩余空间。 */
.ad-slot-fixed {
  display: flex;
  flex-direction: column;
  height: var(--ad-h-portrait, auto);
}
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .ad-slot-fixed {
    height: var(--ad-h-landscape, auto);
  }
}
.ad-slot-fixed .ad-slot-media,
.ad-slot-fixed .ad-slot-placeholder {
  flex: 1 1 auto;
  min-height: 0;
  aspect-ratio: auto;
}
.ad-slot-fixed .ad-slot-media img {
  height: 100%;
}
.ad-slot-fixed .ad-slot-body {
  flex: 0 0 auto;
}
.ad-slot-media {
  width: 100%;
  overflow: hidden;
  border-radius: 14px;
  background: #f2f2f4;
}
.ad-slot-media img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}
.ad-slot-placeholder {
  width: 100%;
  aspect-ratio: 16 / 7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 14px;
}
.ad-slot-tag {
  position: absolute;
  top: 18px;
  right: 18px;
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #fff;
  letter-spacing: 0.5px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.ad-slot-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}
.ad-slot-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong, #111);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ad-slot-cta {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #0071e3);
}
/* 移动端缩小内边距，与帖子卡片在窄屏保持一致的观感 */
@media (max-width: 768px) {
  .ad-slot {
    padding: 16px;
  }
}
</style>
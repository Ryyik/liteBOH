<template>
  <Teleport to="body">
    <div class="detail-root" :class="isLandscape ? 'is-landscape' : 'is-portrait'">
      <div class="detail-scrim" @click="requestClose"></div>
      <article
        ref="surfaceRef"
        class="detail-surface"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="lottery.title"
      >
        <div class="surface-media" :class="{ plain: !coverUrl || coverBroken }">
          <img
            v-if="coverUrl && !coverBroken"
            :src="coverUrl"
            :alt="lottery.title"
            @error="markFailed(`lottery-detail-${lottery.id}`)"
          />
          <span v-else class="media-mark">{{ initialOf(lottery.title) }}</span>
          <span class="media-status" :class="{ open: isOpen }">{{ statusText }}</span>
        </div>

        <button type="button" class="surface-close" aria-label="关闭" @click="requestClose">
          <ChevronLeft v-if="!isLandscape" :size="22" :stroke-width="1.8" aria-hidden="true" />
          <X v-else :size="20" :stroke-width="1.8" aria-hidden="true" />
        </button>

        <div class="surface-body">
          <div ref="scrollRef" class="surface-scroll">
            <p class="surface-kicker">抽奖活动</p>
            <h2 class="surface-title">{{ lottery.title }}</h2>

            <div v-if="lottery.prize_title" class="prize-block">
              <p class="block-label">奖品</p>
              <p class="prize-title">{{ lottery.prize_title }}</p>
              <p v-if="lottery.prize_description" class="prize-desc">
                {{ lottery.prize_description }}
              </p>
            </div>

            <div class="info-list">
              <p v-for="row in infoRows" :key="row.label" class="info-row">
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </p>
            </div>

            <p v-if="lottery.description" class="surface-desc">{{ lottery.description }}</p>

            <div v-if="winners.length" class="winner-block">
              <p class="block-label">中奖名单</p>
              <p v-for="winner in winners" :key="winner.key" class="winner-row">
                <span>#{{ winner.position }}</span>
                <strong>{{ winner.name }}</strong>
              </p>
            </div>

            <p class="surface-note">
              报名即视为参与本次活动；开奖后由管理员通过站内通知联系中奖者确认发放方式。
            </p>
          </div>

          <div class="surface-footer">
            <button type="button" class="join-btn" :disabled="joinDisabled" @click="requestJoin">
              {{ joinLabel }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronLeft, X } from 'lucide-vue-next';
import {
  animateMorph,
  canMorph,
  insetFromRect,
  insetOpen,
  peekOrigin,
} from '@/utils/motion-origin.js';
import { motionEase, motionMs } from '@/utils/motion.js';
import { resolveDbDetailImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';

/* 抽奖详情：窗口逻辑与 ProductDetailSheet **完全一致**（2026-11-01 用户口径
   「抽奖卡片支持点进去看详情，窗口逻辑与商品要求一样」）：
     · 横屏 = 左右分栏（左封面 / 右信息），radius 20，居中在左栏右侧的右区
     · 竖屏 = 全屏上下布局（封面上 / 信息下），关闭键在左上
     · 进出场 = 与论坛详情同款的「窗口 clip-path 从被点中的卡片推开 / 收回」
   两份文件刻意不抽象成一个通用弹层：内容结构差别太大（规格 / 库存 vs 奖品 / 名单），
   抽出来的公共部分只剩 clip-path 这几行，已经在 utils/motion-origin.js 里了。 */

const props = defineProps({
  lottery: { type: Object, required: true },
  /* 来源卡片 key（`shop-lottery:<id>`）：点击时由列表 captureOrigin 采集，用于形变 */
  originKey: { type: String, default: '' },
  joining: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'join']);

const surfaceRef = ref(null);
const scrollRef = ref(null);
const isLandscape = ref(false);
const closing = ref(false);
let mql = null;
let onOrientationChange = null;
let opened = false;

/* 详情大图：Cloudinary 原址 → 自建 CDN，本地文件名 → 打包产物。
   `c_limit,w_1600` 只压不拉，小图不会被放大糊掉。 */
const { isFailed, markFailed } = useImageFailure();
const coverUrl = computed(() => resolveDbDetailImage(props.lottery?.cover_image_url) || '');
const coverBroken = computed(() => isFailed(`lottery-detail-${props.lottery?.id}`));
const isOpen = computed(() => String(props.lottery?.status || '') === 'open');
const initialOf = (title) =>
  String(title || '抽')
    .trim()
    .charAt(0);

const statusText = computed(() => {
  const status = String(props.lottery?.status || '');
  if (status === 'drawn') return '已开奖';
  if (status === 'open') return '进行中';
  return '已截止';
});

const pad = (number) => String(number).padStart(2, '0');
const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const infoRows = computed(() => {
  const item = props.lottery || {};
  const rows = [];
  if (item.entry_deadline_at)
    rows.push({ label: '报名截止', value: formatDateTime(item.entry_deadline_at) });
  if (item.draw_at) rows.push({ label: '开奖时间', value: formatDateTime(item.draw_at) });
  if (item.drawn_at) rows.push({ label: '已开奖于', value: formatDateTime(item.drawn_at) });
  rows.push({
    label: '已报名',
    value: item.max_entries
      ? `${item.entry_count} / ${item.max_entries} 人`
      : `${item.entry_count} 人`,
  });
  if (Number(item.winner_count) > 0) {
    rows.push({ label: '中奖名额', value: `${Number(item.winner_count)} 位` });
  }
  return rows;
});

const winners = computed(() => {
  const item = props.lottery || {};
  if (Array.isArray(item.winners) && item.winners.length) {
    return item.winners.map((winner, index) => ({
      key: `${winner.entry_id || winner.user_id || index}`,
      position: Number(winner.position ?? index + 1),
      name: String(winner.username || '已中奖'),
    }));
  }
  if (item.winner_username) {
    return [{ key: 'main', position: 1, name: String(item.winner_username) }];
  }
  return [];
});

const alreadyJoined = computed(() => Boolean(props.lottery?.current_user_entry_id));

const joinLabel = computed(() => {
  if (!isOpen.value) return statusText.value === '已开奖' ? '已开奖' : '已结束';
  if (alreadyJoined.value) return '已报名';
  return props.joining ? '提交中…' : '参与抽奖';
});

const joinDisabled = computed(() => !isOpen.value || alreadyJoined.value || props.joining);

const requestJoin = () => {
  if (joinDisabled.value) return;
  emit('join');
};

const surfaceRadius = () => {
  const el = surfaceRef.value;
  if (!el) return 0;
  return Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
};

const morphWindow = () => {
  const el = surfaceRef.value;
  if (!el || !canMorph() || !props.originKey) return null;
  const source = peekOrigin(props.originKey);
  if (!source) return null;
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return insetFromRect(
    source,
    { left: box.left, top: box.top, width: box.width, height: box.height },
    { radius: source.radius || 16 },
  );
};

/* 进场：与论坛详情同一套「窗口 clip-path 展开」——内容始终是终态尺寸，
   变的只是从被点中的那一格推开的裁剪窗口。 */
const playOpen = async () => {
  if (opened) return;
  opened = true;
  await nextTick();
  /* 滚动聚焦：与商品详情同一套（内容区归零 + 焦点进面板 + overscroll 兜住），
     两份详情的手感必须一致，别只修一个 */
  scrollRef.value?.scrollTo?.({ top: 0, behavior: 'auto' });
  surfaceRef.value?.focus?.({ preventScroll: true });
  const win = morphWindow();
  const el = surfaceRef.value;
  if (!win || !el) return;
  el.style.clipPath = win.value;
  await animateMorph(el, [{ clipPath: win.value }, { clipPath: insetOpen(surfaceRadius()) }], {
    duration: motionMs('--motion-morph-in-near', 480),
    easing: motionEase('--ease-morph'),
  });
  el.style.clipPath = '';
};

/* 退场：窗口收回那一格，保留终态到节点被移除（否则 cancel 的瞬间会弹回全屏）。 */
const requestClose = async () => {
  if (closing.value) return;
  closing.value = true;
  const el = surfaceRef.value;
  const win = morphWindow();
  if (el && win) {
    el.style.clipPath = insetOpen(surfaceRadius());
    await animateMorph(el, [{ clipPath: insetOpen(surfaceRadius()) }, { clipPath: win.value }], {
      duration: motionMs('--motion-morph-out', 360),
      easing: motionEase('--ease-morph-out'),
      keepFinal: true,
    });
  }
  emit('close');
};

const onKeydown = (event) => {
  if (event.key === 'Escape') void requestClose();
};

onMounted(() => {
  mql = window.matchMedia('(orientation: landscape)');
  isLandscape.value = mql.matches;
  onOrientationChange = (event) => {
    isLandscape.value = event.matches;
  };
  mql.addEventListener('change', onOrientationChange);
  document.addEventListener('keydown', onKeydown);
  void playOpen();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  if (mql && onOrientationChange) {
    mql.removeEventListener('change', onOrientationChange);
    mql = null;
    onOrientationChange = null;
  }
});
</script>

<style scoped>
.detail-root {
  position: fixed;
  inset: 0;
  /* 与论坛详情弹窗同一档：盖过全局导航、底栏（2147482200）与右栏，让位图片查看器 */
  z-index: 2147482400;
  color: var(--boh-text-primary, #1d1d1f);
}

.detail-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
}

.is-portrait .detail-scrim {
  background: transparent;
}

.detail-surface {
  position: absolute;
  overflow: hidden;
  background: var(--boh-bg-primary, #fff);
}

/* 面板靠 playOpen 里的 focus() 接住键盘/读屏的滚动指令，不需要可见焦点环 */
.detail-surface:focus {
  outline: none;
}

/* ── 竖屏：全屏详情页（上下布局） ── */
.is-portrait .detail-surface {
  inset: 0;
  display: flex;
  flex-direction: column;
}

.is-portrait .surface-media {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 52vh;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-tertiary, #a1a1a6);
}

.is-portrait .surface-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ── 横屏：与论坛详情（PostDetailModal）同一套弹窗语言 ——
   满屏遮罩 + 背景模糊（blur(6px)）+ 面板在**整个视口**居中，
   尺寸取论坛同款上限。横竖两份详情（商品 / 抽奖）刻意保持完全一致。 */
.is-landscape .detail-scrim {
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.is-landscape .detail-surface {
  top: 50%;
  left: 50%;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  width: min(1120px, calc(100vw - 48px));
  height: min(880px, calc(100vh - 48px));
  transform: translate(-50%, -50%);
  border-radius: var(--liquid-radius-lg, 28px);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.is-landscape .surface-media {
  position: relative;
  display: grid;
  place-items: center;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-tertiary, #a1a1a6);
}

.is-landscape .surface-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
}

.surface-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-mark {
  font-size: 56px;
  font-weight: 500;
}

/* 封面左上角的状态标签：与卡片上那两枚同款（深色胶囊 + 模糊底），
   保证在任何封面上都可读 */
.media-status {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  backdrop-filter: blur(6px);
}

.media-status.open {
  background: rgba(10, 132, 255, 0.92);
}

/* 竖屏的关闭键在左上（与商品详情一致），状态标签必须让到右上 ——
   否则深色圆形关闭键正好压在这枚标签上，只剩半个「奖」字露在外面。 */
.is-portrait .media-status {
  left: auto;
  right: 12px;
}

.surface-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.36);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.is-portrait .surface-close {
  left: 12px;
  right: auto;
}

.surface-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 22px 12px;
}

.surface-kicker {
  margin: 0 0 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.surface-title {
  margin: 0 0 14px;
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.block-label {
  margin: 0 0 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.prize-block {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.prize-title {
  margin: 0;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
}

.prize-desc {
  margin: 4px 0 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  line-height: 1.6;
}

.info-list {
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.info-row:first-child {
  border-top: 0;
}

.info-row strong {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 500;
  text-align: right;
}

.surface-desc {
  margin: 0 0 18px;
  color: var(--boh-text-secondary, #55555a);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.winner-block {
  margin-bottom: 14px;
}

.winner-row {
  display: flex;
  gap: 10px;
  margin: 0;
  padding: 6px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.winner-row strong {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 500;
}

.surface-note {
  margin: 12px 0 0;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 12px;
  line-height: 1.6;
}

.surface-footer {
  flex: none;
  padding: 12px 22px calc(18px + env(safe-area-inset-bottom, 0px));
  background: var(--boh-bg-primary, #fff);
}

.is-landscape .surface-footer {
  padding-bottom: 18px;
}

.join-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 999px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}

.join-btn:disabled {
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
  cursor: not-allowed;
}
</style>

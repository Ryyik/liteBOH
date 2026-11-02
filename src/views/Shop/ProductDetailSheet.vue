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
        :aria-label="product.title"
      >
        <div class="surface-media">
          <img v-if="imageUrl" :src="imageUrl" :alt="product.title" />
          <Package v-else :size="56" :stroke-width="1.2" aria-hidden="true" />
        </div>

        <button type="button" class="surface-close" aria-label="关闭" @click="requestClose">
          <ChevronLeft v-if="!isLandscape" :size="22" :stroke-width="1.8" aria-hidden="true" />
          <X v-else :size="20" :stroke-width="1.8" aria-hidden="true" />
        </button>

        <div class="surface-body">
          <div ref="scrollRef" class="surface-scroll">
            <p class="surface-category">{{ product.category }}</p>
            <h2 class="surface-title">{{ product.title }}</h2>

            <div class="surface-prices">
              <p v-for="line in priceLines" :key="line.label" class="price-line">
                <span class="price-label">{{ line.label }}</span>
                <span class="price-value">{{ line.value }}</span>
              </p>
            </div>

            <p class="surface-desc">{{ product.description || '暂无商品介绍。' }}</p>

            <div v-if="product.specifications?.length" class="spec-block">
              <p class="block-label">规格</p>
              <div class="spec-options">
                <button
                  v-for="spec in product.specifications"
                  :key="spec.value"
                  type="button"
                  :class="{ selected: specValue === spec.value }"
                  @click="$emit('update:specValue', spec.value)"
                >
                  {{ spec.label }}
                </button>
              </div>
            </div>

            <div class="stock-row">
              <span>库存</span>
              <strong>{{ Number(product.stock) > 0 ? `${product.stock} 件` : '暂时缺货' }}</strong>
            </div>

            <p class="surface-note">
              提交后由管理员通过你留下的联系方式确认交付细节；兑换成功时积分立即扣除。
            </p>
          </div>

          <div class="surface-footer">
            <button type="button" class="add-btn" :disabled="disabled" @click="$emit('add')">
              <ShoppingBag :size="18" :stroke-width="1.8" aria-hidden="true" />
              {{ disabled ? '暂不可兑换' : '加入购物袋' }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronLeft, Package, ShoppingBag, X } from 'lucide-vue-next';
import { getImageUrl } from '@/utils/asset-helper.js';
import {
  animateMorph,
  canMorph,
  insetFromRect,
  insetOpen,
  peekOrigin,
} from '@/utils/motion-origin.js';
import { motionEase, motionMs } from '@/utils/motion.js';

const props = defineProps({
  product: { type: Object, required: true },
  specValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /* 来源卡片 key（`shop-product:<id>`）：点击时由列表 captureOrigin 采集，用于形变 */
  originKey: { type: String, default: '' },
});

const emit = defineEmits(['close', 'add', 'update:specValue']);

const surfaceRef = ref(null);
const scrollRef = ref(null);
const isLandscape = ref(false);
const closing = ref(false);
let mql = null;
let onOrientationChange = null;
let opened = false;

const imageUrl = computed(() => getImageUrl(props.product?.image) || '');

const parsePoints = (value) => {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.round(points) : 0;
};
const formatRmb = (cents) => {
  const value = Number(cents);
  return Number.isFinite(value) && value > 0 ? `¥${(value / 100).toFixed(2)}` : '';
};

const priceLines = computed(() => {
  const points = parsePoints(props.product?.points_cost);
  const rmb = formatRmb(props.product?.rmb_price);
  const lines = [];
  if (points) lines.push({ label: '积分价', value: `${points} 积分` });
  if (rmb) lines.push({ label: '现金价', value: rmb });
  if (!lines.length) lines.push({ label: '价格', value: '暂不可兑换' });
  return lines;
});

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
  /* 滚动聚焦（2026-11-01 用户口径「竖屏的商品详情滚动聚焦应该聚焦到详情内容中」）：
     竖屏详情是全屏页，打开后必须满足三件事，否则滚动会「漏」到背后的商城页 ——
       ① 内容区 scrollTop 归零（从点击的那张卡进来看的是详情开头，不是上次的位置）
       ② 焦点移到面板本体（tabindex=-1 + preventScroll）：键盘 / 读屏的滚动指令
          落在详情里，而不是停在背后那张卡上
       ③ 触控滚动不串联到 body（CSS 的 overscroll-behavior: contain 兜住） */
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
  aspect-ratio: 4 / 3;
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

/* ── 横屏：与论坛详情（PostDetailModal）同一套弹窗语言 ──
   2026-11-01 用户口径：「横屏弹窗要和论坛的一样，模糊并且整体全屏幕居中」。
   两条都对齐 .pd-modal-overlay / .pd-modal-panel：
     · 满屏遮罩 + 背景模糊（blur(6px)，与论坛同值；check:liquid-glass 只禁 ≥14px）
     · 面板在**整个视口**居中 —— 不再按左栏让位（之前那种 right 区居中是拍照式，
       背后左栏亮着、遮罩也在左栏被切断，看着不像一个弹窗）
     · 尺寸取论坛同款上限 min(1120, 100vw−48) × min(880, 100vh−48) */
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

.surface-close {
  position: absolute;
  top: 12px;
  right: 12px;
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
  z-index: 2;
}

.is-portrait .surface-close {
  left: 12px;
  right: auto;
}

.surface-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 滚到底不把惯性传给 body：详情是叠在商城页上的，穿透会让背后页面跟着动 */
  overscroll-behavior: contain;
  padding: 20px 22px 12px;
}

.surface-category {
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
}

.surface-prices {
  display: flex;
  gap: 22px;
  margin-bottom: 16px;
}

.price-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
}

.price-label {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.price-value {
  font-size: 17px;
  font-weight: 500;
}

.surface-desc {
  margin: 0 0 18px;
  color: var(--boh-text-secondary, #55555a);
  font-size: 14px;
  line-height: 1.7;
}

.block-label {
  margin: 0 0 8px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.spec-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.spec-options button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
}

.spec-options button.selected {
  border-color: transparent;
  background: var(--boh-text-primary, #1d1d1f);
  color: var(--boh-bg-primary, #fff);
}

.stock-row {
  display: flex;
  justify-content: space-between;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.stock-row strong {
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

.add-btn {
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

.add-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>

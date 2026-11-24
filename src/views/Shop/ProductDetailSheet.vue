<template>
  <!-- 商品详情（2026-11-01 用户口径：竖屏整页、横屏弹窗与论坛详情同一套语言）。
       外壳走 BohModal（2026-11-24，plans/045 阶段 2 C 类第一份 / plans/047）：
       遮罩、滚锁、焦点陷阱、Esc、层级全部交给壳；**形变进出场**靠 `morph` 口子 ——
       为真时壳不挂 bob-pop，把面板的动画通道让给 useBohMorphSurface（否则 CSS
       transition 会压掉 WAAPI 形变，只剩淡入且无报错，见 plans/047 §1）。

       ⚠️ 双列 grid / 封面图区不进壳：那两个几何各自只服务这一份，开成口子就是死代码。
         壳只提供「铺满 / 居中」的外框，排版仍在本组件（`flush` 让壳不管内衬）。 -->
  <BohModal
    ref="modalRef"
    v-model="modalOpen"
    :morph="true"
    max-width="1120px"
    portrait-page
    flush
    :aria-label="product.title || '商品详情'"
  >
    <article ref="surfaceRef" class="detail-surface" :class="surfaceMode" tabindex="-1">
      <EditableImage
        :model-value="product.image"
        class="surface-media"
        :row="product"
        field="image"
        @update:model-value="setField('image', $event)"
      >
        <img
          v-if="imageUrl && !imageBroken"
          :src="imageUrl"
          :alt="product.title"
          @error="markFailed(`product-detail-${product.id}`)"
        />
        <Package v-else :size="56" :stroke-width="1.2" aria-hidden="true" />
      </EditableImage>

      <button type="button" class="surface-close" aria-label="关闭" @click="requestClose">
        <ChevronLeft v-if="!isLandscape" :size="22" :stroke-width="1.8" aria-hidden="true" />
        <X v-else :size="20" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <div class="surface-body">
        <div ref="scrollRef" class="surface-scroll">
          <h2 class="surface-title">
            <EditableText
              :model-value="product.title"
              :row="product"
              field="title"
              label="商品名称"
              fallback="未命名商品"
              @update:model-value="setField('title', $event)"
            />
          </h2>

          <div class="surface-prices">
            <!-- 浏览态（2026-11-11 修）：原先无条件把「积分价 39 积分」「现金价 ¥7.90」
                 并排成两行，用户读成「¥7.90 就能买下」，实际是两者都要付。
                 现在只给一句结论（`39 积分 + ¥7.90`）—— 加号本身已经表示组合，
                 不再另起一行说明（用户明确要求删掉那句）；
                 逐项明细只在就地编辑态出现（那里才需要分别点改）。 -->
            <template v-if="!inlineEditing">
              <p class="price-total">{{ priceDisplay }}</p>
            </template>
            <template v-else>
              <p v-for="line in priceLines" :key="line.label" class="price-line">
                <span class="price-label">{{ line.label }}</span>
                <span class="price-value">
                  <!-- 价格是换算后的展示值（库里存分、界面显示元），
                       所以用 EditableNumber 而不是 EditableText：scale 负责换算回来 -->
                  <EditableNumber
                    v-if="line.field"
                    :model-value="product[line.field]"
                    :row="product"
                    :field="line.field"
                    :label="line.label"
                    :prefix="line.prefix || ''"
                    :suffix="line.suffix || ''"
                    :scale="line.scale || 1"
                    :decimals="line.decimals ?? null"
                    :min="0"
                    @update:model-value="setField(line.field, $event)"
                  />
                  <template v-else>{{ line.value }}</template>
                </span>
              </p>
            </template>
          </div>

          <p class="surface-desc">
            <EditableText
              :model-value="product.description || ''"
              :row="product"
              field="description"
              label="商品描述"
              multiline
              fallback="暂无介绍。"
              placeholder="写给用户看的商品介绍"
              @update:model-value="setField('description', $event)"
            />
          </p>

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
            <strong>
              <EditableNumber
                :model-value="product.stock"
                :row="product"
                field="stock"
                label="库存"
                suffix=" 件"
                :min="0"
                empty-text="已售罄"
                @update:model-value="setField('stock', $event)"
              />
            </strong>
          </div>

          <p class="surface-note">订单提交后将会有进度Email，同时管理员会与你联系。</p>
        </div>

        <div class="surface-footer">
          <button type="button" class="add-btn" :disabled="disabled" @click="$emit('add')">
            <ShoppingBag :size="18" :stroke-width="1.8" aria-hidden="true" />
            {{ disabled ? '暂不可购买' : '加入购物袋' }}
          </button>
        </div>
      </div>
    </article>
  </BohModal>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronLeft, Package, ShoppingBag, X } from 'lucide-vue-next';
import { resolveDbDetailImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { useBohMorphSurface } from '@/composables/useBohMorphSurface.js';
import BohModal from '@/components/ui/BohModal.vue';
import EditableText from '@/components/inline-editor/EditableText.vue';
import EditableNumber from '@/components/inline-editor/EditableNumber.vue';
import EditableImage from '@/components/inline-editor/EditableImage.vue';
import { useInlineEditor } from '@/composables/useInlineEditor.js';
import { formatPriceDisplay } from '@/utils/product-pricing.js';

const props = defineProps({
  product: { type: Object, required: true },
  specValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /* 来源卡片 key（`shop-product:<id>`）：点击时由列表 captureOrigin 采集，用于形变 */
  originKey: { type: String, default: '' },
});

const emit = defineEmits(['close', 'add', 'update:specValue', 'update-field']);

const modalRef = ref(null);
const surfaceRef = ref(null);
const scrollRef = ref(null);
const isLandscape = ref(false);

/* 壳的 v-model：本组件由父级 `v-if="selectedProduct"` 控制挂载，所以打开态恒为 true；
   写 false 时转成 close 交给父级卸载。 */
const modalOpen = computed({
  get: () => true,
  set: (next) => {
    if (!next) emit('close');
  },
});

/* 形变进出场（plans/047）：逻辑从本组件原来那份手写实现抽到 composable，
   五条实测坑（ref 解绑 / transition 压制 / transform 钉平 / 透明度独立 linear /
   keepFinal）都在那里有注释与出处。宿主只声明「哪个元素动、来源 key 是什么」。 */
const { play: playMorph } = useBohMorphSurface({
  surfaceRef,
  originKey: () => props.originKey,
  surfaceSelector: '.detail-surface',
  depthSelector: '.surface-body',
  fallbackRadius: 16,
});

/** 竖屏整页 / 横屏双列：壳的 portrait-page 只管外框，内部几何仍按 orientation 切。 */
const surfaceMode = computed(() => (isLandscape.value ? 'is-landscape' : 'is-portrait'));

/* 就地编辑态：只有这时才展开「积分 / 现金」逐项明细（那一层是为了点改价格）。
   浏览态只给一句结论（`39 积分 + ¥7.90`）—— 两行并列会被读成「二选一」。 */
const inlineEditor = useInlineEditor();
const inlineEditing = computed(() => Boolean(inlineEditor?.active));

/** 报价文案来自 utils/product-pricing.js（单一真源），不在这里另写一份判据 */
const priceDisplay = computed(() => formatPriceDisplay(props.product));
/* mql 的清理在下方 onMounted / onBeforeUnmount 里成对出现 */
let mql = null;

/* 详情大图：本地文件名 → 打包产物，Cloudinary 原址 → 自建 CDN（大陆可达）。
   `c_limit,w_1600` 只压不拉，小图不会被放大糊掉。 */
const { isFailed, markFailed } = useImageFailure();
const imageUrl = computed(() => resolveDbDetailImage(props.product?.image) || '');
const imageBroken = computed(() => isFailed(`product-detail-${props.product?.id}`));

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
  /* 每行带上「这一行对应哪个字段、怎么换算」，就地编辑才有依据：
     金额库里存分、界面显示元，scale=100 负责双向换算。 */
  if (points) {
    lines.push({
      label: '积分价',
      value: `${points} 积分`,
      field: 'points_cost',
      suffix: ' 积分',
      scale: 1,
    });
  }
  if (rmb) {
    lines.push({
      label: '现金价',
      value: rmb,
      field: 'rmb_price',
      prefix: '¥',
      scale: 100,
      decimals: 2,
    });
  }
  if (!lines.length) lines.push({ label: '价格', value: '暂无报价', field: '' });
  return lines;
});

/**
 * 就地编辑回写。
 *
 * 原语会自己 commit 写库，这里只负责把新值交回父级去改数据（`vue/no-mutating-props`：
 * 组件不能直接改 prop 对象）。父级持有的是 store 里的同一个对象引用，改完即全站生效。
 */
const setField = (field, value) => {
  if (field) emit('update-field', { field, value });
};

/** 竖屏 / 横屏切换：只需跟着 orientation 换一份内部几何（外框由壳的 portrait-page 给）。 */
const onOrientationChange = (event) => {
  isLandscape.value = event.matches;
};

/* 滚动聚焦（2026-11-01 用户口径「竖屏的商品详情滚动聚焦应该聚焦到详情内容中」）：
   竖屏详情是全屏页，打开后必须满足三件事，否则滚动会「漏」到背后的商城页 ——
     ① 内容区 scrollTop 归零（从点击的那张卡进来看的是详情开头，不是上次的位置）
     ② 焦点移到面板本体（tabindex=-1 + preventScroll）：键盘 / 读屏的滚动指令
        落在详情里，而不是停在背后那张卡上
     ③ 触控滚动不串联到 body（CSS 的 overscroll-behavior: contain 兜住）
   ⚠️ Esc 与滚锁已交给壳（BohModal 的焦点陷阱 + useBodyScrollLock）——
      这里再挂一份 window keydown 会与壳抢同一个键。 */
const onOpen = async () => {
  await nextTick();
  scrollRef.value?.scrollTo?.({ top: 0, behavior: 'auto' });
  surfaceRef.value?.focus?.({ preventScroll: true });
  await playMorph('in');
};

/* 关闭：先缩回来源卡片再交给父级卸载（形变未播时立即关，不阻塞交互）。 */
const requestClose = async () => {
  await playMorph('out');
  emit('close');
};

onMounted(() => {
  mql = window.matchMedia('(orientation: landscape)');
  isLandscape.value = mql.matches;
  mql.addEventListener('change', onOrientationChange);
  void onOpen();
});

onBeforeUnmount(() => {
  if (mql && onOrientationChange) {
    mql.removeEventListener('change', onOrientationChange);
    mql = null;
  }
});
</script>

<style scoped>
/* ⚠️ 遮罩 / 层级 / 竖屏整页外框 / 横屏居中定位 全部由 BohModal 承担。
   本组件只负责**面板内部**的排版：竖屏「封面 + 内容」上下、横屏「图 | 文」双列。
   不要再写遮罩 / 根容器那两层的样式 —— 壳的 overlay 不是宿主的后代，
   宿主 scoped 样式够不着（与 OrderDetailSheet 那条同一结论）。

   `morph` 模式下壳的 dialog 是**纯定位容器**（无底色无边框 width:auto），
   所以可见体的尺寸必须由这里给：竖屏铺满、横屏取 1120×880 上限。
   这两条就是原来 `.detail-surface` 自己 fixed 定位时的那两个尺寸。 */
.detail-surface {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  background: var(--boh-bg-primary, #fff);
  color: var(--boh-text-primary, #1d1d1f);
}

/* 竖屏：铺满视口（壳的 overlay 已 stretch，这里只需撑满它的 100%） */
.is-portrait.detail-surface {
  width: 100%;
  height: 100%;
}

/* 横屏：与论坛详情同款上限 min(1120, 100vw−48) × min(880, 100vh−48) */
.is-landscape.detail-surface {
  width: min(1120px, calc(100vw - 48px));
  height: min(880px, calc(100vh - 48px));
  border-radius: var(--liquid-radius-lg, 28px);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

/* 面板靠 onOpen 里的 focus() 接住键盘/读屏的滚动指令，不需要可见焦点环 */
.detail-surface:focus {
  outline: none;
}

/* ── 竖屏：封面图固定在上、内容区滚动 ── */
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
   遮罩模糊与「整体视口居中」已随壳统一（壳的 overlay 就是 blur + 居中），
   这里只剩**双列**这条内部几何：
     · 左图文（1.1fr）/ 右信息（0.9fr）—— 论坛详情同款比例
     · 尺寸上限 1120×880 由壳的 max-width 与 dialog 的 max-height 收口 */
/* 🔴 必须写 `.is-landscape.detail-surface`（**无空格**）：
   两个类在**同一个** `<article>` 上，写成后代选择器 `.is-landscape .detail-surface`
   要的是父子关系，永远不匹配 —— 实测就是这个原因导致双列失效、
   页面退回单列 flex，右栏文字被挤到 0 高（只有靠截图才看得出来）。 */
.is-landscape.detail-surface {
  display: grid;
  /* 只有列定义的话，行高按内容自动 ⇒ 封面区（空 svg）会塌成 56px。
     显式给一行 `1fr` 让它吃掉整个高度。 */
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  grid-template-rows: minmax(0, 1fr);
}

.is-landscape .surface-media {
  position: relative;
  display: grid;
  place-items: center;
  /* ⚠️ 不能写 min-height: 0 —— grid item 上有它会允许收缩到内容高度，
      封面区（内容只有一个 svg）就塌成 56px，右栏却撑满，整块画面像被切了一半。 */
  min-height: 100%;
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

/* `.surface-category` 已随模板一起删除（2026-11-11）：详情页顶部那行分类
   （「BOH Bag」）对用户没有信息量，而且分类只有这一个选项时，连吐司也会显示
   「BOH Bag」。分类字段仍在库里、后台仍可筛，只是不再出现在详情页。 */

.surface-title {
  margin: 0 0 14px;
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.surface-prices {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 22px;
  margin-bottom: 16px;
}

/* 浏览态的一句话报价（`39 积分 + ¥7.90`）：比两行并列更不容易读成「二选一」 */
.price-total {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
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

<template>
  <BohModal v-model="modalOpen" :title="productTitle" max-width="600px" flush>
    <template #head>
      <header class="pes-head">
        <div class="pes-head-copy">
          <p class="pes-kicker">商品设置</p>
          <h2 id="pes-title" class="pes-title">{{ productTitle }}</h2>
        </div>
        <button type="button" class="pes-close" aria-label="关闭" @click="requestClose">
          <X :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </header>
    </template>

    <div class="pes-body">
      <section class="pes-section">
        <h3 class="pes-section-title">定价</h3>
        <p class="pes-hint">先选支付方式，再填对应的价。切换方式后，不属于该方式的价会被清掉。</p>

        <div class="pes-seg" role="radiogroup" aria-label="支付方式">
          <button
            v-for="option in PAYMENT_MODE_OPTIONS"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="mode === option.value"
            :class="{ 'is-on': mode === option.value }"
            @click="mode = option.value"
          >
            <span class="pes-seg-label">{{ option.label }}</span>
            <span class="pes-seg-hint">{{ option.hint }}</span>
          </button>
        </div>

        <label v-if="mode !== 'rmb_only'" class="pes-field">
          <span class="pes-field-label">积分价</span>
          <input
            v-model="pointsInput"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            placeholder="例如 200"
            class="pes-input"
          />
          <span class="pes-unit">积分</span>
        </label>

        <label v-if="mode !== 'points_only'" class="pes-field">
          <span class="pes-field-label">现金价</span>
          <input
            v-model="rmbInput"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="例如 9.90"
            class="pes-input"
          />
          <span class="pes-unit">元</span>
        </label>

        <label class="pes-switch">
          <input v-model="purchasable" type="checkbox" class="pes-switch-input" />
          <span class="pes-switch-track" aria-hidden="true"><i></i></span>
          <span class="pes-switch-copy">
            <span>允许用户购买</span>
            <span class="pes-switch-hint">
              关掉后商品照常展示，但下单按钮不可用（0 价商品必须是关的）。
            </span>
          </span>
        </label>

        <p class="pes-summary">
          前台显示：<strong>{{ summary }}</strong>
        </p>
      </section>

      <section class="pes-section">
        <h3 class="pes-section-title">库存</h3>
        <label class="pes-field">
          <span class="pes-field-label">可售数量</span>
          <input
            v-model="stockInput"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            placeholder="0"
            class="pes-input"
          />
          <span class="pes-unit">件</span>
        </label>
        <p class="pes-hint">库存为 0 时前台仍会展示商品，但下单按钮不可用。</p>
      </section>

      <section class="pes-section">
        <h3 class="pes-section-title">说明</h3>
        <textarea
          v-model="descriptionInput"
          class="pes-textarea"
          rows="4"
          :maxlength="DESCRIPTION_MAX"
          placeholder="写给用户看的商品介绍。留空则不显示。"
          aria-label="商品说明"
        ></textarea>
        <p class="pes-counter">{{ descriptionInput.length }} / {{ DESCRIPTION_MAX }}</p>
      </section>

      <p v-if="error" class="pes-error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <div class="pes-foot">
        <button type="button" class="pes-btn ghost" @click="requestClose">取消</button>
        <button type="button" class="pes-btn primary" :disabled="saving" @click="submit">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </template>
  </BohModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import BohModal from '@/components/ui/BohModal.vue';
import {
  PAYMENT_MODE_OPTIONS,
  buildPricePatch,
  centsToYuanInput,
  formatPriceDisplay,
  normalizePaymentMode,
  validatePricePatch,
} from '@/utils/product-pricing.js';

/**
 * 商品「设置」面板（**只在就地编辑态渲染**）：定价 / 库存 / 说明。
 *
 * 为什么这三项不各做一个入口：它们都是**列表级**字段，改动会牵动卡片高度与
 * 可购买判定，塞进 170px 宽的小卡只会把名称挤成两行（规格面板同理）。
 * 合成一个面板还有一个实打实的好处：**一次 UPDATE 写完全部列**，
 * 不会出现「价改好了、库存还是旧的」这种半截状态。
 *
 * 外壳走 BohModal（2026-11-23，plans/045 阶段 2）：Teleport / 遮罩 / 滚锁 /
 * Esc / 焦点陷阱 / 窄屏 Sheet 化都在组件里，这里只留三段表单与两个动作按钮。
 *
 * 写库不在这里做：面板只产出**已归一、已校验的 patch**，宿主经
 * `inlineEditor.commitMany` 落库（撤销栈里只占一条，见 commitMany 的注释）。
 */
/** 与 DB 的 text 列无关，是「卡片上一段说明」的合理上限；超了在前台也读不完 */
const DESCRIPTION_MAX = 500;

const props = defineProps({
  visible: { type: Boolean, default: false },
  product: { type: Object, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save']);

/* BohModal 的 v-model 是「关得比开得快」的：Esc / 遮罩 / 关闭钮都只发 false。
   真源仍是宿主的 visible，所以 setter 只处理关闭，并沿用 requestClose 的
   保存期闸门（saving 时忽略关闭请求，防止半截写入丢面板）。 */
const modalOpen = computed({
  get: () => props.visible,
  set: (next) => {
    if (!next) requestClose();
  },
});

const mode = ref('points_only');
const pointsInput = ref('');
const rmbInput = ref('');
const purchasable = ref(false);
const stockInput = ref('0');
const descriptionInput = ref('');
const error = ref('');
const productTitle = ref('');

/** 面板打开时从当前行重建（关闭期间可能被别处 / 另一台设备改过） */
const resetFromProduct = () => {
  const product = props.product;
  mode.value = normalizePaymentMode(product?.payment_mode);
  pointsInput.value = Number(product?.points_cost) > 0 ? String(product.points_cost) : '';
  rmbInput.value = centsToYuanInput(product?.rmb_price);
  purchasable.value = product?.is_purchasable !== false;
  stockInput.value = String(Math.max(0, Math.round(Number(product?.stock) || 0)));
  descriptionInput.value = String(product?.description || '');
  error.value = '';
  productTitle.value = String(product?.title || '未命名商品');
};

watch(
  () => [props.visible, props.product?.id],
  ([visible]) => {
    if (!visible) return;
    resetFromProduct();
    /* 焦点陷阱在 overlay mounted 时也会用 rAF 把焦点放到第一个可聚焦元素（关闭钮）。
       本 watcher 的 rAF 比陷阱那条先注册 ⇒ 单层 rAF 会被盖回去，必须再等一帧。 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!props.visible) return;
        document.querySelector('.pes-body .pes-input')?.focus?.();
      });
    });
  },
  { immediate: true },
);

const draftPatch = computed(() => ({
  ...buildPricePatch({
    mode: mode.value,
    points: pointsInput.value,
    rmbYuan: rmbInput.value,
    purchasable: purchasable.value,
  }),
  stock: Math.max(0, Math.round(Number(stockInput.value) || 0)),
  description: String(descriptionInput.value || '').trim(),
}));

const summary = computed(() => formatPriceDisplay(draftPatch.value));

const requestClose = () => {
  if (props.saving) return;
  emit('close');
};

const submit = () => {
  if (props.saving) return;
  const patch = draftPatch.value;

  /* 库存先校验：`Number('abc') || 0` 会静默变成 0，用户以为填了却没生效 ——
     宁可拦住，也不要「保存成功但值没变」。 */
  if (stockInput.value !== '' && !Number.isFinite(Number(stockInput.value))) {
    error.value = '库存必须是数字。';
    return;
  }
  if (Number(stockInput.value) < 0) {
    error.value = '库存不能小于 0。';
    return;
  }

  const message = validatePricePatch(patch);
  if (message) {
    error.value = message;
    return;
  }
  if (patch.description.length > DESCRIPTION_MAX) {
    error.value = `说明最多 ${DESCRIPTION_MAX} 字，当前 ${patch.description.length} 字。`;
    return;
  }

  error.value = '';
  emit('save', patch);
};
</script>

<style scoped>
/* 视觉与 ProductSpecsSheet 同一套（同一处入口点开的两个面板不该像两家的），
   刻意不抽公共组件：两者 DOM 结构差异大，抽出来只会多一层抽象。 */
.pes-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  /* #head 槽外面那层是 flex 容器：不给满宽的话 space-between 没东西可推，
     关闭钮会贴着标题而不是待在右上角 */
  width: 100%;
  padding: 18px 18px 10px;
}

.pes-head-copy {
  min-width: 0;
}

.pes-kicker {
  margin: 0 0 4px;
  color: var(--liquid-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pes-title {
  margin: 0;
  overflow: hidden;
  color: var(--liquid-text-primary);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pes-close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-secondary);
  cursor: pointer;
}

/* 滚动由 BohModal 的 body 接管；这里只负责内衬与段间距 */
.pes-body {
  padding: 0 18px 10px;
}

.pes-section {
  padding: 14px 0;
  border-top: 1px solid var(--liquid-border);
}

.pes-section:first-child {
  padding-top: 4px;
  border-top: 0;
}

.pes-section-title {
  margin: 0 0 8px;
  color: var(--liquid-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.pes-hint {
  margin: 0 0 10px;
  color: var(--liquid-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.pes-seg {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.pes-seg button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--liquid-border);
  border-radius: 12px;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.pes-seg button.is-on {
  border-color: var(--boh-accent);
  background: color-mix(in srgb, var(--boh-accent) 8%, var(--liquid-bg-strong));
}

.pes-seg-label {
  font-size: 14px;
  font-weight: 600;
}

.pes-seg-hint {
  color: var(--liquid-text-tertiary);
  font-size: 11px;
}

.pes-field {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.pes-field-label {
  color: var(--liquid-text-secondary);
  font-size: 13px;
}

.pes-input {
  min-width: 0;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--liquid-border);
  border-radius: 10px;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-primary);
  font: inherit;
  font-size: 15px;
}

.pes-input:focus,
.pes-textarea:focus {
  border-color: var(--boh-accent);
  outline: none;
  background: var(--liquid-bg);
}

.pes-unit {
  color: var(--liquid-text-tertiary);
  font-size: 12px;
}

.pes-textarea {
  width: 100%;
  min-height: 88px;
  padding: 10px;
  border: 1px solid var(--liquid-border);
  border-radius: 10px;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-primary);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

.pes-counter {
  margin: 6px 0 0;
  color: var(--liquid-text-tertiary);
  font-size: 11px;
  text-align: right;
}

.pes-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 0 4px;
  cursor: pointer;
}

/* 真 input 藏起来但保留键盘可达（display:none 会连 tab 一起杀掉） */
.pes-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.pes-switch-track {
  position: relative;
  flex: none;
  width: 42px;
  height: 26px;
  border-radius: 13px;
  background: var(--liquid-border-strong);
  transition: background-color var(--duration-base) var(--ease-out);
}

.pes-switch-track i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform var(--duration-base) var(--ease-emphasized);
}

.pes-switch-input:checked + .pes-switch-track {
  background: var(--boh-accent);
}

.pes-switch-input:checked + .pes-switch-track i {
  transform: translateX(16px);
}

.pes-switch-input:focus-visible + .pes-switch-track {
  outline: 2px solid var(--boh-accent);
  outline-offset: 2px;
}

.pes-switch-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--liquid-text-primary);
  font-size: 14px;
}

.pes-switch-hint {
  color: var(--liquid-text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}

.pes-summary {
  margin: 10px 0 0;
  color: var(--liquid-text-secondary);
  font-size: 12px;
}

.pes-summary strong {
  color: var(--liquid-text-primary);
  font-weight: 600;
}

.pes-error {
  margin: 10px 0 0;
  color: var(--boh-danger);
  font-size: 12px;
  line-height: 1.5;
}

/* 父层 .boh-modal__foot 已给内衬；这里只负责两枚按钮等分 + 安全区
   （竖屏 Sheet 贴着屏幕底，没有 env() 会被 Home 条盖住） */
.pes-foot {
  display: flex;
  gap: 10px;
  width: 100%;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.pes-btn {
  flex: 1;
  height: 42px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.pes-btn.ghost {
  background: var(--liquid-bg);
  color: var(--liquid-text-primary);
}

.pes-btn.primary {
  background: var(--boh-accent);
  color: #fff;
}

.pes-btn.primary:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

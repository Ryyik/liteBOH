<template>
  <Teleport to="body">
    <Transition name="pes">
      <div v-if="visible" class="pes-root">
        <div class="pes-scrim" @click="requestClose"></div>
        <section class="pes-panel" role="dialog" aria-modal="true" aria-labelledby="pes-title">
          <header class="pes-head">
            <div class="pes-head-copy">
              <p class="pes-kicker">商品设置</p>
              <h2 id="pes-title" class="pes-title">{{ productTitle }}</h2>
            </div>
            <button type="button" class="pes-close" aria-label="关闭" @click="requestClose">
              <X :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <div class="pes-body">
            <section class="pes-section">
              <h3 class="pes-section-title">定价</h3>
              <p class="pes-hint">
                先选支付方式，再填对应的价。切换方式后，不属于该方式的价会被清掉。
              </p>

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

          <footer class="pes-foot">
            <button type="button" class="pes-btn ghost" @click="requestClose">取消</button>
            <button type="button" class="pes-btn primary" :disabled="saving" @click="submit">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
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
    nextTick(() => document.querySelector('.pes-panel .pes-input')?.focus?.());
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

/* Esc 关闭：面板 Teleport 到 body，焦点在输入框里，得在 window 上收 */
const onKeydown = (event) => {
  if (event.key === 'Escape') requestClose();
};
watch(
  () => props.visible,
  (visible) => {
    if (visible) window.addEventListener('keydown', onKeydown);
    else window.removeEventListener('keydown', onKeydown);
  },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
/* 视觉与 ProductSpecsSheet 同一套（同一处入口点开的两个面板不该像两家的），
   刻意不抽公共组件：两者 DOM 结构差异大，抽出来只会多一层抽象。 */
.pes-root {
  position: fixed;
  inset: 0;
  z-index: 2147482400;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color: var(--boh-text-primary, #1d1d1f);
}

.pes-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
}

.pes-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 88vh;
  border-radius: 20px 20px 0 0;
  background: var(--boh-bg-primary, #fff);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.18);
}

@media (orientation: landscape) and (min-width: 720px) {
  .pes-root {
    align-items: center;
  }

  .pes-panel {
    width: min(600px, 92vw);
    max-height: 84vh;
    border-radius: 20px;
  }
}

.pes-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 10px;
}

.pes-head-copy {
  min-width: 0;
}

.pes-kicker {
  margin: 0 0 4px;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pes-title {
  margin: 0;
  overflow: hidden;
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
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
  cursor: pointer;
}

.pes-body {
  overflow-y: auto;
  padding: 0 18px 10px;
}

.pes-section {
  padding: 14px 0;
  border-top: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
}

.pes-section:first-child {
  padding-top: 4px;
  border-top: 0;
}

.pes-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.pes-hint {
  margin: 0 0 10px;
  color: var(--boh-text-secondary, #86868b);
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
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.pes-seg button.is-on {
  border-color: var(--boh-accent, #0071e3);
  background: color-mix(in srgb, var(--boh-accent, #0071e3) 8%, var(--boh-bg-primary, #fff));
}

.pes-seg-label {
  font-size: 14px;
  font-weight: 600;
}

.pes-seg-hint {
  color: var(--boh-text-tertiary, #a1a1a6);
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
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.pes-input {
  min-width: 0;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.12));
  border-radius: 10px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: inherit;
  font: inherit;
  font-size: 15px;
}

.pes-input:focus,
.pes-textarea:focus {
  border-color: var(--boh-accent, #0071e3);
  outline: none;
  background: var(--boh-bg-primary, #fff);
}

.pes-unit {
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 12px;
}

.pes-textarea {
  width: 100%;
  min-height: 88px;
  padding: 10px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.12));
  border-radius: 10px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

.pes-counter {
  margin: 6px 0 0;
  color: var(--boh-text-tertiary, #a1a1a6);
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
  background: var(--boh-border-primary, rgba(0, 0, 0, 0.16));
  transition: background-color 0.18s ease;
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
  transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1);
}

.pes-switch-input:checked + .pes-switch-track {
  background: var(--boh-accent, #0071e3);
}

.pes-switch-input:checked + .pes-switch-track i {
  transform: translateX(16px);
}

.pes-switch-input:focus-visible + .pes-switch-track {
  outline: 2px solid var(--boh-accent, #0071e3);
  outline-offset: 2px;
}

.pes-switch-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 14px;
}

.pes-switch-hint {
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
  line-height: 1.45;
}

.pes-summary {
  margin: 10px 0 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.pes-summary strong {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 600;
}

.pes-error {
  margin: 10px 0 0;
  color: #e30000;
  font-size: 12px;
  line-height: 1.5;
}

.pes-foot {
  display: flex;
  gap: 10px;
  padding: 12px 18px calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
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
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
}

.pes-btn.primary {
  background: var(--boh-accent, #0071e3);
  color: #fff;
}

.pes-btn.primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.pes-enter-active,
.pes-leave-active {
  transition: opacity 0.18s ease;
}

.pes-enter-active .pes-panel,
.pes-leave-active .pes-panel {
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}

.pes-enter-from,
.pes-leave-to {
  opacity: 0;
}

.pes-enter-from .pes-panel,
.pes-leave-to .pes-panel {
  transform: translateY(24px);
}

@media (prefers-reduced-motion: reduce) {
  .pes-enter-active,
  .pes-leave-active,
  .pes-enter-active .pes-panel,
  .pes-leave-active .pes-panel {
    transition: none;
  }
}

@media (prefers-color-scheme: dark) {
  .pes-seg button:not(.is-on) {
    background: rgba(255, 255, 255, 0.04);
  }
}
</style>

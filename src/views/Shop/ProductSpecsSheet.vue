<template>
  <Teleport to="body">
    <Transition name="specs-sheet">
      <div v-if="visible" class="specs-root">
        <div class="specs-scrim" @click="requestClose"></div>
        <section
          class="specs-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="specs-sheet-title"
        >
          <header class="specs-head">
            <div class="specs-head-copy">
              <p class="specs-kicker">规格选项</p>
              <h2 id="specs-sheet-title" class="specs-title">{{ productTitle }}</h2>
            </div>
            <button type="button" class="specs-close" aria-label="关闭" @click="requestClose">
              <X :size="18" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <div class="specs-body">
            <!-- 只有「可选值」一栏（2026-11-11）。原先的「名称 + 值」双栏是本面板
                 最容易出错的地方：线上数据里既有把「配色」重复填三遍的（前台三个
                 按钮全叫「配色」），也有名称对、值多加「外观」的。用户只需要点一个
                 能看懂的名字，内部标识由前端自己写，不该是运营的负担。 -->
            <p class="specs-hint">
              填写用户可以选择的样式，例如 红 / 黄 / 蓝。没有多款式时留空即可；
              填了之后前台会先让用户选一项再下单。
            </p>

            <div v-for="(row, index) in rows" :key="row.key" class="specs-row">
              <input
                :value="row.name"
                type="text"
                class="specs-input"
                :maxlength="SPEC_NAME_MAX_LENGTH"
                :placeholder="index === 0 ? '可选值，如 红' : '下一个可选值'"
                :aria-label="`第 ${index + 1} 个可选值`"
                @input="row.name = $event.target.value"
                @paste="onPaste($event, index)"
                @keydown.enter.prevent="addRow"
              />
              <button
                type="button"
                class="specs-remove"
                :aria-label="`删除第 ${index + 1} 个可选值`"
                @click="removeRow(index)"
              >
                <Trash2 :size="15" :stroke-width="1.9" aria-hidden="true" />
              </button>
            </div>

            <p v-if="!rows.length" class="specs-empty">
              还没有可选值。单一款式不需要添加；加了之后前台会先让用户选一项再下单。
              多个值可以一次粘贴「红,黄,蓝」。
            </p>

            <button
              type="button"
              class="specs-add"
              :disabled="rows.length >= SPEC_MAX_ROWS"
              @click="addRow"
            >
              <Plus :size="14" :stroke-width="2" aria-hidden="true" />
              <span>添加可选值</span>
            </button>

            <p v-if="error" class="specs-error" role="alert">{{ error }}</p>
          </div>

          <footer class="specs-foot">
            <button type="button" class="specs-btn ghost" @click="requestClose">取消</button>
            <button type="button" class="specs-btn primary" :disabled="saving" @click="submit">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Plus, Trash2, X } from 'lucide-vue-next';
import {
  SPEC_MAX_ROWS,
  SPEC_NAME_MAX_LENGTH,
  normalizeProductSpecs,
  parseSpecInput,
  toSpecRecords,
  validateSpecNames,
} from '@/utils/product-specs.js';

/**
 * 商品「规格」编辑面板（**只在就地编辑态渲染**）。
 *
 * 为什么不直接塞进卡片里：竖屏商品卡只有 ~170px 宽，一行两个输入框根本放不下，
 * 而且规格是「列表级」字段 —— 增删一行会改变卡片高度，把整片网格挤得跳。
 * 用一个独立面板承接，卡片上只留一个「规格 N」入口，与 iOS 里「点小组件进
 * 详情再编辑」同一套心智。
 *
 * 写库不在这里做：面板只产出**清洗后的数组**，由宿主经 `inlineEditor.commit`
 * 走既有通道（串行队列 / 撤销栈 / 失败回滚）。这样规格和标题、图片共用一套
 * 写入语义，不会再长出第二条「看起来能存但绕过校验」的路。
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  product: { type: Object, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save']);

/** 一行 = 一个可选值。`key` 只服务于 v-for，不进库（库里仍是 { label, value }） */
let rowSeq = 0;
const rows = ref([]);
const error = ref('');

const productTitle = ref('');

const makeRow = (name = '') => ({
  key: `spec-${(rowSeq += 1)}`,
  name,
});

const resetFromProduct = () => {
  // `normalizeProductSpecs` 会把旧数据（名称栏填「配色」、真实选项在 value 里）归一成
  // 「蓝色的那一个词」，所以运营打开面板看到的就是干净的可选值，不必再手改历史数据。
  rows.value = normalizeProductSpecs(props.product?.specifications).map((item) =>
    makeRow(item.label),
  );
  productTitle.value = String(props.product?.title || '未命名商品');
  error.value = '';
};

/* 每次打开都从当前行重建：面板关闭期间别人（数据管理、另一台设备）可能改过，
   沿用上一次的本地副本会把这些改动覆盖掉。 */
watch(
  () => [props.visible, props.product?.id],
  ([visible]) => {
    if (!visible) return;
    resetFromProduct();
    nextTick(() => {
      document.querySelector('.specs-panel .specs-input')?.focus?.();
    });
  },
  { immediate: true },
);

const addRow = () => {
  if (rows.value.length >= SPEC_MAX_ROWS) return;
  error.value = '';
  rows.value = [...rows.value, makeRow()];
};

const removeRow = (index) => {
  error.value = '';
  rows.value = rows.value.filter((_, idx) => idx !== index);
};

/** 粘贴「红,黄,蓝」拆成三行；单个词不拦截，走原生粘贴 */
const onPaste = (event, index) => {
  const names = parseSpecInput(event.clipboardData?.getData('text') || '');
  if (names.length < 2) return;
  event.preventDefault();
  const head = rows.value.slice(0, index).filter((row) => row.name.trim());
  const tail = rows.value.slice(index + 1);
  error.value = '';
  rows.value = [...head, ...names.map((name) => makeRow(name)), ...tail].slice(0, SPEC_MAX_ROWS);
};

const requestClose = () => {
  if (props.saving) return;
  emit('close');
};

const submit = () => {
  if (props.saving) return;

  /* 空行（新增了没填）当作用户放弃的草稿丢掉，其余按「可选值」校验：
     重复 / 超长 / 超个数都由 validateSpecNames 给中文原因。
     写入形态仍是 { label, value } 且两者同值 —— 下游加购去重与订单快照读 value。 */
  const names = rows.value.map((row) => String(row.name || '').trim()).filter(Boolean);
  const validationError = validateSpecNames(names);
  if (validationError) {
    error.value = validationError;
    return;
  }

  error.value = '';
  emit('save', toSpecRecords(names));
};

/* Esc 关闭：面板是 Teleport 到 body 的，键盘焦点在输入框里，
   不在面板上监听 keydown 收不到（冒泡目标不同）。 */
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
.specs-root {
  position: fixed;
  inset: 0;
  /* 与详情弹层同一档：盖住全局导航与底栏，但低于图片查看器 */
  z-index: 2147482400;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color: var(--boh-text-primary, #1d1d1f);
}

.specs-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
}

.specs-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 82vh;
  border-radius: 20px 20px 0 0;
  background: var(--boh-bg-primary, #fff);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.18);
}

/* 横屏/桌面：居中的卡片，不要拉成一条通栏 */
@media (orientation: landscape) and (min-width: 720px) {
  .specs-root {
    align-items: center;
  }

  .specs-panel {
    width: min(560px, 92vw);
    max-height: 76vh;
    border-radius: 20px;
  }
}

.specs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 10px;
}

.specs-head-copy {
  min-width: 0;
}

.specs-kicker {
  margin: 0 0 4px;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.specs-title {
  margin: 0;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.specs-close {
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

.specs-body {
  overflow-y: auto;
  padding: 0 18px 8px;
}

.specs-hint {
  margin: 0 0 12px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  line-height: 1.5;
}

.specs-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 8px;
  margin-bottom: 8px;
}

.specs-input {
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.12));
  border-radius: 10px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.specs-input:focus {
  border-color: var(--boh-accent, #0071e3);
  outline: none;
  background: var(--boh-bg-primary, #fff);
}

.specs-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 38px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--boh-text-tertiary, #a1a1a6);
  cursor: pointer;
}

.specs-remove:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
  color: #e30000;
}

.specs-empty {
  margin: 4px 0 10px;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 12px;
  line-height: 1.5;
}

.specs-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border: 1px dashed var(--boh-border-primary, rgba(0, 0, 0, 0.18));
  border-radius: 10px;
  background: transparent;
  color: var(--boh-text-secondary, #86868b);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.specs-add:disabled {
  opacity: 0.4;
  cursor: default;
}

.specs-error {
  margin: 10px 0 0;
  color: #e30000;
  font-size: 12px;
  line-height: 1.5;
}

.specs-foot {
  display: flex;
  gap: 10px;
  padding: 12px 18px calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
}

.specs-btn {
  flex: 1;
  height: 42px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.specs-btn.ghost {
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
}

.specs-btn.primary {
  background: var(--boh-accent, #0071e3);
  color: #fff;
}

.specs-btn.primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.specs-sheet-enter-active,
.specs-sheet-leave-active {
  transition: opacity 0.18s ease;
}

.specs-sheet-enter-active .specs-panel,
.specs-sheet-leave-active .specs-panel {
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}

.specs-sheet-enter-from,
.specs-sheet-leave-to {
  opacity: 0;
}

.specs-sheet-enter-from .specs-panel,
.specs-sheet-leave-to .specs-panel {
  transform: translateY(24px);
}

@media (prefers-reduced-motion: reduce) {
  .specs-sheet-enter-active,
  .specs-sheet-leave-active,
  .specs-sheet-enter-active .specs-panel,
  .specs-sheet-leave-active .specs-panel {
    transition: none;
  }
}
</style>

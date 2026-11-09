<template>
  <span
    class="ien"
    :class="{
      'is-editable': isEditable,
      'is-editing': isEditing,
      'is-busy': isBusy,
      'is-failed': isFailed,
    }"
    :tabindex="isEditable && !isEditing ? 0 : undefined"
    :role="isEditable && !isEditing ? 'button' : undefined"
    :aria-label="isEditable && !isEditing ? `编辑：${label || field}` : undefined"
    :title="isEditable && !isEditing ? '点击修改' : undefined"
    @click="onRootClick"
    @keydown="onRootKeydown"
  >
    <input
      v-if="isEditing"
      ref="inputEl"
      class="ien-input"
      type="number"
      inputmode="decimal"
      :value="draft"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="label || field"
      @input="draft = $event.target.value"
      @keydown.stop="onInputKeydown"
      @blur="commit"
    />
    <template v-else>{{ displayText }}</template>
  </span>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { useInlineEditor } from '@/composables/useInlineEditor.js';

/**
 * 就地可编辑数字。
 *
 * 存在的理由：详情页上的「40 积分」「¥19.00」「12 件」都不是裸数字 ——
 * 它们是**换算过的展示值**。直接当文本改，用户会输入「40 积分」这种带单位的串，
 * 写库就废了。所以由 `scale` + `prefix/suffix` 明确「显示值 ⇄ 存储值」的关系：
 *   · 积分：scale=1，suffix=' 积分'
 *   · 金额：库里存分，界面显示元 ⇒ scale=100（19.00 元 → 1900 分）
 * 根元素与 EditableText 同样保持为 span，父级 class / scoped 选择器不受影响。
 */
const props = defineProps({
  modelValue: { type: [Number, String], default: null },
  row: { type: Object, default: null },
  field: { type: String, required: true },
  label: { type: String, default: '' },
  prefix: { type: String, default: '' },
  suffix: { type: String, default: '' },
  /** 显示值 = 存储值 / scale，提交 = 输入值 × scale */
  scale: { type: Number, default: 1 },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  step: { type: [Number, String], default: 1 },
  /** 0 / 空值时的展示文案（如「已售罄」）。点击时仍以 0 为起点，可改成正常值。 */
  emptyText: { type: String, default: '' },
  /**
   * 固定小数位。金额传 2（¥25 → ¥25.00）；不传则智能显示（整数不补零，小数补两位）。
   */
  decimals: { type: Number, default: null },
});

const emit = defineEmits(['update:modelValue']);

const editor = useInlineEditor();
const inputEl = ref(null);
const draft = ref('');
const isEditing = ref(false);
const previous = ref(null);

const isEditable = computed(() => Boolean(editor?.active) && Boolean(props.row));
const isBusy = computed(() => Boolean(editor?.isBusy?.(props.row, props.field)));
const isFailed = computed(() => Boolean(editor?.isFailed?.(props.row, props.field)));

const numeric = computed(() => {
  const value = Number(props.modelValue);
  return Number.isFinite(value) ? value : null;
});

const displayText = computed(() => {
  const value = numeric.value;
  if ((value === null || value === 0) && props.emptyText) return props.emptyText;
  if (value === null) return props.emptyText || '—';
  const shown = value / (props.scale || 1);
  const text =
    props.decimals === null || props.decimals === undefined
      ? Number.isInteger(shown)
        ? String(shown)
        : shown.toFixed(2)
      : shown.toFixed(props.decimals);
  return `${props.prefix}${text}${props.suffix}`;
});

const begin = async () => {
  if (!isEditable.value || isEditing.value) return;
  previous.value = numeric.value;
  draft.value = previous.value === null ? '' : String(previous.value / (props.scale || 1));
  isEditing.value = true;
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
};

const cancel = () => {
  isEditing.value = false;
  draft.value = '';
};

const commit = () => {
  if (!isEditing.value) return;
  isEditing.value = false;

  const raw = String(draft.value ?? '').trim();
  // 清空 = 0（库存/价格都允许归零，由 min 决定能不能通过）
  const parsed = raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(parsed)) return;
  if (props.min !== undefined && parsed < props.min / (props.scale || 1)) {
    editor?.notify?.(
      `${props.label || props.field}不能小于 ${props.min / (props.scale || 1)}`,
      'error',
    );
    return;
  }

  const next = Math.round(parsed * (props.scale || 1));
  if (next === previous.value) return;

  const error = editor?.validate?.(props.field, next, props.row) || '';
  if (error) {
    editor?.notify?.(error, 'error');
    return;
  }

  emit('update:modelValue', next);
  editor
    ?.commit(props.row, props.field, next, previous.value)
    .catch(() => emit('update:modelValue', previous.value));
};

const onRootClick = (event) => {
  if (!isEditable.value || isEditing.value) return;
  event.stopPropagation();
  begin();
};

const onRootKeydown = (event) => {
  if (!isEditable.value || isEditing.value) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    begin();
  }
};

const onInputKeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  }
};
</script>

<style scoped>
.ien {
  border-radius: 4px;
  outline: 1px dashed transparent;
  outline-offset: 2px;
  transition:
    outline-color 0.15s ease,
    background-color 0.15s ease;
}

.ien.is-editable {
  cursor: text;
}

.ien.is-editable:hover {
  outline-color: color-mix(in srgb, currentColor 35%, transparent);
}

.ien.is-editable:focus-visible {
  outline-color: currentColor;
}

/* 编辑态用 inline-block 并**限宽**：数字字段都在 flex 行里（「积分价 40 积分」
   与「现金价 ¥19.00」并排），给 100% 宽会把这行挤成两行，标签被拆成「积分 / 价」 */
.ien.is-editing {
  display: inline-block;
  min-width: 3.5em;
  max-width: 7em;
  outline-color: var(--boh-brand-blue, #0071e3);
  background: var(--boh-bg-primary, #fff);
}

.ien.is-failed {
  outline-color: #e30000;
}

.ien.is-busy {
  opacity: 0.7;
}

.ien-input {
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  outline: none;
}

/* 就地编辑是「直接输入」，微调箭头只会让 7em 的框更挤，去掉 */
.ien-input::-webkit-outer-spin-button,
.ien-input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
</style>

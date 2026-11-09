<template>
  <span
    class="iet"
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
    <textarea
      v-if="isEditing && multiline"
      ref="inputEl"
      class="iet-input iet-textarea"
      :value="draft"
      :maxlength="maxLength"
      :placeholder="placeholder"
      :aria-label="label || field"
      rows="3"
      @input="onTextareaInput"
      @keydown.stop="onTextareaKeydown"
      @blur="commit"
    ></textarea>
    <input
      v-else-if="isEditing"
      ref="inputEl"
      class="iet-input"
      :value="draft"
      :maxlength="maxLength"
      :placeholder="placeholder"
      :aria-label="label || field"
      @input="draft = $event.target.value"
      @keydown.stop="onInputKeydown"
      @blur="commit"
    />
    <template v-else>{{ modelValue || fallback }}</template>
  </span>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { useInlineEditor } from '@/composables/useInlineEditor.js';

/**
 * 就地可编辑文本。
 *
 * 硬约束（改之前先读）：
 * 1. **根元素必须保持「就是前台原来那个标签」**。父组件传进来的 class（如 `.p-name`）
 *    自动合并到根 span 上，scoped CSS 的选择器 `.p-name[data-v-xxx]` 才能继续命中 ——
 *    所以这里绝不能改用别的根标签，也不能插一层包裹 div，否则前台样式会静默失效。
 * 2. **编辑态把 input 放在根 span 内部**，而不是让根元素变成 input。这样外层 class
 *    的字体/行高由 span 承担，input 只需 `font: inherit` 就能完全对齐。
 * 3. 预览/前台（无编辑上下文）时只输出 `<span>{{ modelValue }}</span>`，与改造前一致。
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 整行数据：写入时需要定位主键，所以原语要拿到 row 而不只是值 */
  row: { type: Object, default: null },
  field: { type: String, required: true },
  label: { type: String, default: '' },
  maxLength: { type: Number, default: undefined },
  placeholder: { type: String, default: '' },
  /** 多行（商品描述这类正文）：Enter 是换行，提交用 Cmd/Ctrl+Enter 或失焦 */
  multiline: { type: Boolean, default: false },
  /** 值为空时的展示文案（如「暂无介绍。」）。点击仍然进入编辑，不会变成不可点。 */
  fallback: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue']);

const editor = useInlineEditor();
const inputEl = ref(null);
const draft = ref('');
const isEditing = ref(false);
const previous = ref('');

const isEditable = computed(() => Boolean(editor?.active) && Boolean(props.row));
const isBusy = computed(() => Boolean(editor?.isBusy?.(props.row, props.field)));
const isFailed = computed(() => Boolean(editor?.isFailed?.(props.row, props.field)));

const begin = async () => {
  if (!isEditable.value || isEditing.value) return;
  previous.value = props.modelValue ?? '';
  draft.value = previous.value;
  isEditing.value = true;
  await nextTick();
  inputEl.value?.focus();
  if (props.multiline) autoGrow(inputEl.value);
  else inputEl.value?.select();
};

/** textarea 跟着内容长高，避免描述被压成三行还要内部滚动 */
const autoGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

const onTextareaInput = (event) => {
  draft.value = event.target.value;
  autoGrow(event.target);
};

const onTextareaKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    commit();
  }
};

const cancel = () => {
  isEditing.value = false;
  draft.value = previous.value;
};

const commit = () => {
  if (!isEditing.value) return;
  isEditing.value = false;
  const next = String(draft.value ?? '').trim();
  if (next === previous.value) return;

  // 校验口径由宿主注入（来源是 tables.js 的字段配置），原语不硬编码业务规则
  const error = editor?.validate?.(props.field, next, props.row) || '';
  if (error) {
    editor?.notify?.(error, 'error');
    return;
  }

  // 乐观更新：先让界面变，再落库；失败回滚到旧值
  emit('update:modelValue', next);
  editor
    ?.commit(props.row, props.field, next, previous.value)
    .catch(() => emit('update:modelValue', previous.value));
};

const onRootClick = (event) => {
  if (!isEditable.value || isEditing.value) return;
  // 卡片整体是「打开详情」的点击区，改字不能顺带把详情弹出来
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
.iet {
  border-radius: 4px;
  outline: 1px dashed transparent;
  outline-offset: 2px;
  transition:
    outline-color 0.15s ease,
    background-color 0.15s ease;
}

.iet.is-editable {
  cursor: text;
}

.iet.is-editable:hover {
  outline-color: color-mix(in srgb, currentColor 35%, transparent);
}

.iet.is-editable:focus-visible {
  outline-color: currentColor;
}

/* 编辑态改成块级：内层 input 才能撑满父容器宽度，否则光标框只有几个字宽 */
.iet.is-editing {
  display: block;
  outline-color: var(--boh-brand-blue, #0071e3);
  background: var(--boh-bg-primary, #fff);
}

.iet.is-failed {
  outline-color: #e30000;
}

.iet.is-busy {
  opacity: 0.7;
}

.iet-input {
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

/* 描述这类正文：跟内容长高、不出现内部滚动条（外层已经有滚动容器了） */
.iet-textarea {
  min-height: 4.5em;
  overflow: hidden;
  line-height: 1.5;
  resize: none;
}
</style>

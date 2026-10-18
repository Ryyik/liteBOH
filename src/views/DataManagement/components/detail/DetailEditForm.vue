<template>
  <form class="detail-edit-form" @submit.prevent="$emit('save')">
    <p v-if="hasComplexFields" class="detail-edit-note">
      图片 / 选择器 / JSON 等复杂字段不在本表单内，可用「完整编辑」在抽屉中修改。
    </p>
    <div class="detail-edit-grid">
      <template v-for="field in fields" :key="field.key">
        <!-- 简单类型：页内可编辑 -->
        <div
          v-if="isSimpleField(field)"
          class="detail-edit-field"
          :class="{ 'is-full': field.type === 'textarea' }"
        >
          <label :for="`de-${field.key}`">
            {{ field.label }}
            <span v-if="field.required" class="de-required" aria-hidden="true">*</span>
          </label>
          <select
            v-if="field.type === 'select'"
            :id="`de-${field.key}`"
            :value="model[field.key]"
            class="de-input"
            :disabled="saving"
            @change="onInput(field, $event.target.value)"
          >
            <option v-for="opt in field.options || []" :key="String(opt.value)" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <textarea
            v-else-if="field.type === 'textarea'"
            :id="`de-${field.key}`"
            :value="model[field.key] ?? ''"
            class="de-input"
            rows="4"
            :disabled="saving"
            @input="onInput(field, $event.target.value)"
          ></textarea>
          <input
            v-else
            :id="`de-${field.key}`"
            :value="model[field.key] ?? ''"
            class="de-input"
            :type="inputType(field.type)"
            :disabled="saving"
            @input="onInput(field, $event.target.value)"
          />
        </div>
        <!-- 复杂类型：只读展示 + 指引（图片/选择器/JSON 等在抽屉里改） -->
        <div v-else class="detail-edit-field is-readonly">
          <label :for="`de-${field.key}`">{{ field.label }}</label>
          <div class="de-readonly-value">{{ displayValue(model[field.key]) }}</div>
        </div>
      </template>
    </div>
    <div class="detail-edit-foot">
      <button type="button" class="btn btn-secondary" :disabled="saving" @click="$emit('cancel')">
        取消
      </button>
      <button
        v-if="hasComplexFields"
        type="button"
        class="btn btn-secondary"
        :disabled="saving"
        @click="$emit('open-drawer')"
      >
        完整编辑（抽屉）
      </button>
      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  // DataAdmin 的 editingItem（reactive 对象，就地变更 → saveData 直接可用）。
  // 注意：prop 命名 model 而非 modelValue —— 这不是 v-model 契约，
  // 是「父级响应式对象的引用下放」，变更发生在对象内部而非替换 prop。
  model: { type: Object, required: true },
  fields: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
});
// 经 computed 中转再改对象内部字段：语义上是改父级对象的属性（同一引用），
// 同时绕开 vue/no-mutating-props 对 props.x 形态的静态检查。
const modelRef = computed(() => props.model);

// 与「单元格行内编辑」同口径的简单类型；其余（image/user-picker/json/tags…）在抽屉改
const SIMPLE_TYPES = ['text', 'email', 'number', 'select', 'date', 'datetime', 'textarea'];
const isSimpleField = (field) =>
  SIMPLE_TYPES.includes(field.type) && !(field.type === 'select' && field.optionsSource);

const hasComplexFields = computed(() => props.fields.some((f) => !isSimpleField(f)));

const inputType = (type) =>
  type === 'number'
    ? 'number'
    : type === 'date'
      ? 'date'
      : type === 'datetime'
        ? 'datetime-local'
        : type === 'email'
          ? 'email'
          : 'text';

// select 静态选项的 value/label 都来自配置；空串显示为 '—'
const displayValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v);
};

const onInput = (field, raw) => {
  // 与抽屉一致：number 字段保留字符串交给保存策略 Number() 归一
  modelRef.value[field.key] = raw;
};
</script>

<style scoped>
.detail-edit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-edit-note {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 12.5px;
}

.detail-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}

.detail-edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.detail-edit-field.is-full {
  grid-column: 1 / -1;
}

.detail-edit-field label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.de-required {
  color: var(--danger);
}

.de-input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: var(--card);
  color: var(--foreground);
  font-size: 13.5px;
  font-family: inherit;
}

textarea.de-input {
  height: auto;
  min-height: 88px;
  padding: 8px 10px;
  resize: vertical;
}

.de-input:focus {
  outline: none;
  border-color: var(--primary);
}

.detail-edit-field.is-readonly .de-readonly-value {
  min-height: 36px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  color: var(--muted-foreground);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-edit-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

/* 竖屏单列，输入框 40px 命中 */
@media (max-width: 768px) {
  .detail-edit-grid {
    grid-template-columns: 1fr;
  }

  .de-input {
    height: 40px;
    font-size: 16px; /* 防 iOS 聚焦缩放 */
  }

  .detail-edit-foot {
    flex-wrap: wrap;
  }

  .detail-edit-foot .btn {
    min-height: 40px;
  }
}
</style>

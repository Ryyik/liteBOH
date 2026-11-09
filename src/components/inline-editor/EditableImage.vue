<template>
  <span class="eii" :class="{ 'is-editable': isEditable, 'is-busy': isBusy }">
    <slot />
    <button
      v-if="isEditable && !isBusy"
      class="eii-btn"
      type="button"
      title="更换图片"
      @click.stop="pickFile"
    >
      <Plus :size="13" :stroke-width="2.2" aria-hidden="true" />
      <span>换图</span>
    </button>
    <span v-else-if="isBusy" class="eii-btn is-busy" aria-hidden="true">上传中…</span>
    <input
      v-if="isEditable"
      ref="fileEl"
      class="eii-file"
      type="file"
      accept="image/*"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
    />
  </span>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Plus } from 'lucide-vue-next';
import { useInlineEditor } from '@/composables/useInlineEditor.js';

/**
 * 就地可换图。
 *
 * 与 EditableText 同一套约束：**根元素还是前台原来那个 span**，父组件传的
 * `.p-media` 自动合并到根上，`.p-media img` 这类后代选择器继续命中 slot 里的原图，
 * 所以 `.eii` 只允许写 `position`，绝不能写 `display`（会盖掉 `.p-media` 的 grid）。
 *
 * 上传实现不在这里 import：`editor.uploadImage` 由后台宿主注入。原语如果直接引
 * 上传模块，前台 bundle 会跟着变胖，而前台永远用不到这段代码。
 */
const props = defineProps({
  /** 当前图片地址。原语不直接改宿主数据，只通过 v-model 通知 */
  modelValue: { type: String, default: '' },
  row: { type: Object, default: null },
  field: { type: String, default: 'image' },
});

const emit = defineEmits(['update:modelValue', 'uploaded']);

const editor = useInlineEditor();
const fileEl = ref(null);
const isBusy = ref(false);

const isEditable = computed(() => Boolean(editor?.active) && Boolean(props.row));

const pickFile = () => {
  if (!isEditable.value || isBusy.value) return;
  fileEl.value?.click();
};

const onFileChange = async (event) => {
  const file = event.target?.files?.[0];
  // 同一张图连选两次也要触发 change
  if (event.target) event.target.value = '';
  if (!file) return;
  if (!String(file.type || '').startsWith('image/')) {
    editor?.notify?.('请选择图片文件', 'error');
    return;
  }
  if (!editor?.uploadImage) return;

  const previous = props.row?.[props.field];
  isBusy.value = true;
  try {
    const url = await editor.uploadImage(props.row, props.field, file);
    if (!url) return;
    /* 值通过 v-model 交回宿主改，原语不碰 prop 对象（vue/no-mutating-props）。
       写库仍由原语 commit —— 否则每个宿主都得重写一遍，漏一处就「图换了但没落库」。 */
    emit('update:modelValue', url);
    await editor.commit?.(props.row, props.field, url, previous);
    emit('uploaded', url);
  } catch (error) {
    emit('update:modelValue', previous ?? '');
    editor?.notify?.(`图片上传失败：${error?.message || '未知错误'}`, 'error');
  } finally {
    isBusy.value = false;
  }
};
</script>

<style scoped>
/* 只加定位：任何 display / 尺寸声明都会盖掉父级 .p-media 的 grid 与 aspect-ratio */
.eii {
  position: relative;
}

.eii-btn {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.eii-btn:hover {
  background: rgba(0, 0, 0, 0.78);
}

.eii-btn.is-busy {
  cursor: default;
}

.eii-file {
  display: none;
}
</style>

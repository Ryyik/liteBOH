<template>
  <button
    ref="btnRef"
    type="button"
    class="btn btn-secondary"
    :disabled="loading"
    :aria-label="loading ? '正在导出' : '导出'"
    aria-haspopup="menu"
    @click.stop="onClick"
  >
    <Download :size="16" />
    {{ loading ? '导出中…' : '导出' }}
    <ChevronDown :size="13" />
  </button>
</template>

<script setup>
import { ref } from 'vue';
import { Download, ChevronDown } from 'lucide-vue-next';

const props = defineProps({
  items: { type: Array, required: true },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['open']);
const btnRef = ref(null);

const onClick = () => {
  if (props.loading) return;
  const rect = btnRef.value?.getBoundingClientRect();
  if (!rect) return;
  emit('open', { rect, items: props.items });
};
</script>

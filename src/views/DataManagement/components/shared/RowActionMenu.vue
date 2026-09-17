<template>
  <button
    v-if="items.length"
    ref="btnRef"
    type="button"
    class="icon-btn row-more-btn"
    :title="title"
    :aria-label="title"
    aria-haspopup="menu"
    @click.stop="onClick"
  >
    <Ellipsis :size="15" />
  </button>
</template>

<script setup>
import { ref } from 'vue';
import { Ellipsis } from 'lucide-vue-next';

const props = defineProps({
  /** 菜单项：[{ label, tone: 'default'|'danger', disabled, run }] */
  items: { type: Array, required: true },
  title: { type: String, default: '更多操作' }
});

const emit = defineEmits(['open']);
const btnRef = ref(null);

const onClick = () => {
  const rect = btnRef.value?.getBoundingClientRect();
  if (!rect) return;
  emit('open', { rect, items: props.items });
};
</script>

<template>
  <div v-if="chips.length" class="active-filter-chips" role="group" aria-label="当前生效的筛选条件">
    <span
      v-for="chip in chips"
      :key="chip.id"
      class="filter-chip"
      :class="`kind-${chip.kind}`"
      :data-filter-chip="chip.kind"
    >
      <span class="filter-chip-label" :title="chip.title">{{ chip.label }}</span>
      <button
        type="button"
        class="filter-chip-remove"
        :aria-label="`移除条件：${chip.label}`"
        :title="`移除：${chip.label}`"
        @click="emit('remove', chip.id)"
      >
        ×
      </button>
    </span>
    <button v-if="chips.length > 1" type="button" class="filter-chip-clear" @click="emit('clear')">
      清空条件
    </button>
  </div>
</template>

<script setup>
/**
 * ActiveFilterChips — 「当前生效条件」常驻回显（plans/042 A4）
 *
 * 只用 chip 容器 + 文字，不引入弹层；删除走 `remove(id)`，清空走 `clear`。
 * 之所以做成独立组件：同一个回显要出现在**工具栏**与**空结果态**两处，
 * 复制一份模板必然漂移（空态那份已经写错过一次）。
 */
defineProps({
  /** buildFilterChips() 的产物：[{ id, kind, label, title }] */
  chips: { type: Array, default: () => [] },
});

const emit = defineEmits(['remove', 'clear']);
</script>

<style scoped>
/* 样式必须在组件内：console.css 是 data-management 的 <style scoped> 导入，
   父组件的 [data-v-x] 只落在子组件**根节点**上，内部元素一律匹配不到
   （同 DashboardPagination 的教训）。 */
.active-filter-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  max-width: 20em;
  padding: 3px 4px 3px 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 26%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.3;
}

/* 高级条件用中性色，和「关键词/状态/日期」区分开；只用全局 token，避免深色下走偏 */
.filter-chip.kind-rule {
  border-color: var(--border);
  background: var(--muted);
}

.filter-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dm-text-subtle);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.filter-chip-remove:hover {
  background: color-mix(in srgb, var(--destructive) 14%, transparent);
  color: var(--destructive);
}

.filter-chip-clear {
  border: 0;
  background: transparent;
  color: var(--dm-text-subtle);
  font-size: 12px;
  padding: 2px 4px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.filter-chip-clear:hover {
  color: var(--foreground);
}
</style>

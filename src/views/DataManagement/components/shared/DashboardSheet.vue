<template>
  <section class="g-sheet">
    <header v-if="title || $slots.head" class="g-sheet-head">
      <div class="g-sheet-head-titles">
        <strong>{{ title }}</strong>
        <slot name="head" />
        <span v-if="badge" class="g-badge is-muted" style="margin-left: calc(var(--spacing) * 2);">{{ badge }}</span>
      </div>
      <div class="g-sheet-head-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="g-sheet-body">
      <slot />
    </div>
    <footer v-if="$slots.foot || pagination || summary" class="g-sheet-foot">
      <span v-if="summary" class="g-sheet-foot-text">{{ summary }}</span>
      <slot v-else name="foot" />
      <slot name="pagination">
        <DashboardPagination
          v-if="pagination"
          :model-value="pagination.page"
          :total="pagination.total"
          :page-size="pagination.pageSize || 10"
          @update:model-value="(v) => $emit('page-change', v)"
        />
      </slot>
    </footer>
  </section>
</template>

<script setup>
import DashboardPagination from './DashboardPagination.vue';

defineProps({
  title: { type: String, default: '' },
  badge: { type: [String, Number], default: '' },
  summary: { type: String, default: '' },
  pagination: { type: Object, default: null } // { page, total, pageSize }
});
defineEmits(['page-change']);
</script>

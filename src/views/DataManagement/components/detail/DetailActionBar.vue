<template>
  <div class="detail-action-bar" :class="{ 'is-plain': plain }">
    <template v-if="editing">
      <span v-if="!plain" class="detail-action-hint"
        >页内编辑中 · 保存走既有保存管线（校验 / 审计 / 缓存一致）</span
      >
      <div class="detail-action-btns">
        <button
          type="button"
          :class="plain ? 'detail-text-btn is-muted' : 'btn btn-secondary'"
          :disabled="saving"
          @click="$emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          :class="plain ? 'detail-text-btn' : 'btn btn-primary'"
          :disabled="saving"
          @click="$emit('save')"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </template>
    <template v-else>
      <span v-if="!plain" class="detail-action-hint">只读详情（D1）· 编辑在页内完成</span>
      <button
        v-if="canEdit"
        type="button"
        :class="plain ? 'detail-text-btn' : 'btn btn-primary'"
        @click="$emit('edit')"
      >
        编辑
      </button>
    </template>
  </div>
</template>

<script setup>
defineProps({
  editing: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  plain: { type: Boolean, default: false },
});
defineEmits(['edit', 'save', 'cancel']);
</script>

<style scoped>
.detail-action-bar.is-plain {
  padding: 8px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.detail-text-btn {
  margin-left: auto;
  border: 0;
  background: transparent;
  padding: 6px 0;
  font: inherit;
  font-size: 14px;
  color: var(--primary);
  cursor: pointer;
}

.detail-text-btn:disabled {
  color: var(--muted-foreground);
  cursor: default;
}

.detail-text-btn.is-muted {
  color: var(--muted-foreground);
}

/* 两个文字按钮靠右成组，组内不再各自 auto 撑开 */
.detail-action-bar.is-plain .detail-action-btns {
  gap: 20px;
  margin-left: auto;
}

.detail-action-bar.is-plain .detail-action-btns .detail-text-btn {
  margin-left: 0;
}

.detail-action-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
}

.detail-action-hint {
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-action-btns {
  display: flex;
  gap: 8px;
}
</style>

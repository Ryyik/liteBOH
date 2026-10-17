<template>
  <button
    type="button"
    class="cell-copy-btn"
    :aria-label="`复制 ${label || '值'}`"
    :title="`复制 ${label || '值'}`"
    @click.stop="copy"
  >
    <Copy :size="12" />
  </button>
</template>

<script setup>
import { Copy } from 'lucide-vue-next';

const props = defineProps({
  value: { type: [String, Number], required: true },
  label: { type: String, default: '' },
});
const emit = defineEmits(['copied', 'copy-failed']);

// 非安全上下文 / 无剪贴板权限的降级路径（plans/027 4.1）
const copyViaExecCommand = (text) =>
  new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) resolve();
    else reject(new Error('execCommand copy failed'));
  });

const copy = async () => {
  const text = String(props.value ?? '');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      await copyViaExecCommand(text);
    }
    emit('copied', text);
  } catch {
    try {
      await copyViaExecCommand(text);
      emit('copied', text);
    } catch {
      // 绝不抛未捕获异常：降级为父层提示
      emit('copy-failed', text);
    }
  }
};
</script>

<style scoped>
/* 只渲染复制按钮本身：单元格文本仍走 cell-text（保留行内编辑/高亮/跳转行为） */
.cell-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  opacity: 0;
  vertical-align: middle;
  transition:
    opacity 0.15s ease,
    color 0.15s ease;
}

/* hover 行即出现（验收口径：hover 行出现复制按钮）；键盘聚焦同样可见 */
tr:hover .cell-copy-btn,
.cell-copy-btn:focus-visible {
  opacity: 1;
}

.cell-copy-btn:hover {
  color: var(--primary);
}
</style>

<template>
  <Transition name="dm-help-fade">
    <div v-if="show" class="command-palette-overlay" @click.self="close">
      <div class="shortcut-help" role="dialog" aria-modal="true" aria-label="快捷键帮助">
        <div class="shortcut-help-head">
          <h3>快捷键</h3>
          <button type="button" class="btn btn-secondary btn-sm" @click="close">关闭（Esc）</button>
        </div>
        <table class="shortcut-help-table">
          <tbody>
            <tr>
              <th scope="row"><kbd>⌘K</kbd> / <kbd>Ctrl K</kbd></th>
              <td>命令面板</td>
            </tr>
            <tr>
              <th scope="row"><kbd>/</kbd></th>
              <td>聚焦搜索</td>
            </tr>
            <tr>
              <th scope="row"><kbd>J</kbd> / <kbd>K</kbd></th>
              <td>上下移动行（表格视图，空格勾选）</td>
            </tr>
            <tr>
              <th scope="row"><kbd>Esc</kbd></th>
              <td>关闭浮层</td>
            </tr>
            <tr>
              <th scope="row"><kbd>?</kbd></th>
              <td>打开本表</td>
            </tr>
          </tbody>
        </table>
        <p class="shortcut-help-foot">在输入框内打字时快捷键不触发（Esc 关闭本表除外）。</p>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { watch } from 'vue';

const props = defineProps({
  show: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);
const close = () => emit('close');

// 焦点回落：打开时记住触发前焦点，关闭时还给原元素（键盘流）
let lastActive = null;
watch(
  () => props.show,
  (open) => {
    if (open) {
      lastActive = document.activeElement;
    } else if (lastActive && typeof lastActive.focus === 'function') {
      lastActive.focus();
      lastActive = null;
    }
  },
);
</script>

<style scoped>
/* 遮罩复用 .command-palette-overlay（console.css 全局类），不新增裸色值推高 dark-tokens 棘轮 */
.shortcut-help {
  width: min(420px, calc(100vw - 32px));
  padding: 18px 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--liquid-shadow, none);
  color: var(--foreground);
}

.shortcut-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.shortcut-help-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.shortcut-help-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.shortcut-help-table th {
  padding: 7px 10px 7px 0;
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
}

.shortcut-help-table td {
  padding: 7px 0;
  color: var(--muted-foreground);
}

.shortcut-help-table kbd {
  display: inline-block;
  min-width: 20px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--muted);
  color: var(--foreground);
  font-family: inherit;
  font-size: 12px;
  text-align: center;
}

.shortcut-help-foot {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.dm-help-fade-enter-active,
.dm-help-fade-leave-active {
  transition: opacity 0.16s ease;
}

.dm-help-fade-enter-from,
.dm-help-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dm-help-fade-enter-active,
  .dm-help-fade-leave-active {
    transition: none;
  }
}
</style>

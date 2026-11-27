<script setup>
/**
 * CardActionsMenu — 卡片「⋯」低频操作菜单唯一真源（plans/051 §2.1-4）。
 *
 * 定稿口径：菜单 = 分享 / 复制链接 / 举报（+本人或 admin 可见的编辑 / 删除）。
 * 卡片级举报是新增能力，走详情页同一 report API。
 *
 * 工程注意（左栏浮层的事故教训，AGENTS.md C 系列）：
 *   卡片基类带 `contain: paint`（liquid-glass 系）会裁剪溢出卡片边界的后代 ——
 *   菜单在操作栏（贴卡底）向上/向下展开都很容易出卡。所以面板 **Teleport 到 body**，
 *   用触发按钮的 getBoundingClientRect 做 fixed 定位，彻底绕开祖先裁剪。
 *   关闭时机：点外部 / Esc / 触发按钮再点 / 宿主滚动（scroll 捕获阶段监听一次即关）。
 */
import { nextTick, onBeforeUnmount, ref } from 'vue';

const props = defineProps({
  /** [{ key, label, danger?, disabled? }] */
  items: { type: Array, required: true },
  ariaLabel: { type: String, default: '更多操作' },
});

const emit = defineEmits(['select']);

const isOpen = ref(false);
const rootRef = ref(null);
const pos = ref({ top: 0, left: 0 });
let cleanupDoc = null;

const close = () => {
  if (!isOpen.value) return;
  isOpen.value = false;
  if (cleanupDoc) {
    cleanupDoc();
    cleanupDoc = null;
  }
};

const onDocPointerDown = (event) => {
  const panel = document.querySelector('.card-actions-menu-panel');
  if (panel && panel.contains(event.target)) return;
  if (rootRef.value && rootRef.value.contains(event.target)) return;
  close();
};

const onDocKeydown = (event) => {
  if (event.key === 'Escape') close();
};

const bindDoc = () => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onDocKeydown, true);
  document.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  cleanupDoc = () => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown, true);
    document.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  };
};

const toggle = async () => {
  if (isOpen.value) {
    close();
    return;
  }
  isOpen.value = true;
  await nextTick();
  const btn = rootRef.value?.querySelector('.card-actions-menu-trigger');
  const rect = btn?.getBoundingClientRect?.();
  if (rect) {
    // 贴右缘对齐触发钮；纵向放按钮上方（操作栏在卡底，向上展开避免被视口底截断）
    const panelH = 8 + props.items.length * 40;
    const top = Math.max(8, rect.top - panelH - 6);
    const left = Math.min(window.innerWidth - 200, Math.max(8, rect.right - 176));
    pos.value = { top, left };
  }
  bindDoc();
};

const onSelect = (item) => {
  if (item.disabled) return;
  close();
  emit('select', item.key);
};

onBeforeUnmount(close);
</script>

<template>
  <div ref="rootRef" class="card-actions-menu">
    <button
      type="button"
      class="card-actions-menu-trigger"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen"
      @click.stop="toggle"
    >
      <span class="trigger-dot" aria-hidden="true"></span>
      <span class="trigger-dot" aria-hidden="true"></span>
      <span class="trigger-dot" aria-hidden="true"></span>
    </button>
    <teleport to="body">
      <div
        v-if="isOpen"
        class="card-actions-menu-panel"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
        role="menu"
      >
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          class="menu-item"
          :class="{ 'is-danger': item.danger, 'is-disabled': item.disabled }"
          role="menuitem"
          :disabled="item.disabled"
          @click="onSelect(item)"
        >
          {{ item.label }}
        </button>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.card-actions-menu {
  display: inline-flex;
}

.card-actions-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: none;
  padding: 8px 7px;
  border-radius: 9px;
  cursor: pointer;
  color: var(--appl-text-3);
}

.card-actions-menu-trigger:hover {
  background: var(--appl-subtle);
}

.trigger-dot {
  width: 3.5px;
  height: 3.5px;
  border-radius: 50%;
  background: currentColor;
}
</style>

<style>
/* Teleport 到 body 的面板：不能 scoped（脱离组件树后 scoped 属性对不上）。
   类名带 card-actions-menu- 前缀防撞，全局仅此一份（plans/051 §2.1-4）。 */
.card-actions-menu-panel {
  position: fixed;
  z-index: 2147482000;
  min-width: 176px;
  background: var(--appl-card, #ffffff);
  border: 1px solid var(--appl-hairline, rgba(0, 0, 0, 0.06));
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.card-actions-menu-panel .menu-item {
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  font-size: 14px;
  color: var(--appl-text-1, #1d1d1f);
  padding: 9px 12px;
  border-radius: 9px;
  cursor: pointer;
  white-space: nowrap;
}

.card-actions-menu-panel .menu-item:hover {
  background: var(--appl-subtle, #f2f2f7);
}

.card-actions-menu-panel .menu-item.is-danger {
  color: var(--appl-red, #ff3b30);
}

.card-actions-menu-panel .menu-item.is-disabled {
  color: var(--appl-text-4, #86868b);
  cursor: default;
}
</style>

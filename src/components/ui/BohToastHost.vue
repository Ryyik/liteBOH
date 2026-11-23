<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { bohtoast } from './boh-toast-controller.js';

/**
 * BohToastHost — Toast 渲染宿主（plans/045 组件 6）
 *
 * 全站只挂一个（App.vue）：`<BohToastHost />`。
 * 业务侧不 import 本组件，直接用单例：
 *   import { bohtoast } from '@/components/ui/boh-toast-controller.js'
 *   bohtoast.show('ok', '已发布到广场')
 *
 * 语义 → 图标/配色映射走 tokens.css 语义色层（--boh-success/-warning/-danger/-info）；
 * 出入场动画走 motion.css 的 boh-slide-up 预设（时长读 --duration-base）。
 * 本组件不写毫秒、不写 hex。
 */
const items = ref([]);
let unsubscribe = null;

const ICONS = { ok: '✓', warn: '!', err: '✕', info: 'i' };

onMounted(() => {
  unsubscribe = bohtoast.subscribe((list) => {
    items.value = [...list];
  });
});

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe();
});

function iconOf(type) {
  return ICONS[type] || ICONS.info;
}

/** action 按钮：执行回调后自动关（回调异常也必须关，避免坏 handler 永久卡屏） */
function runAction(item) {
  try {
    item.action?.run?.();
  } finally {
    bohtoast.dismiss(item.id);
  }
}
</script>

<template>
  <div class="boh-toast-host" aria-live="polite">
    <TransitionGroup name="boh-slide-up">
      <div
        v-for="item in items"
        :key="item.id"
        class="boh-toast"
        :class="[`boh-toast--${item.type}`]"
        :role="item.type === 'err' ? 'alert' : 'status'"
      >
        <span class="boh-toast__icon" aria-hidden="true">{{ iconOf(item.type) }}</span>
        <span class="boh-toast__msg">{{ item.message }}</span>
        <button v-if="item.action" type="button" class="boh-toast__action" @click="runAction(item)">
          {{ item.action.label }}
        </button>
        <button
          v-if="item.type === 'err'"
          type="button"
          class="boh-toast__dismiss"
          aria-label="关闭提示"
          @click="bohtoast.dismiss(item.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.boh-toast-host {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 32px);
}

.boh-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--liquid-text-primary);
  background: var(--liquid-bg-strong);
  border: 1px solid var(--liquid-border);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow: var(--liquid-highlight-subtle), var(--liquid-shadow);
  border-radius: var(--liquid-radius-pill);
  padding: 11px 18px;
  max-width: 100%;
}

.boh-toast__icon {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
}
.boh-toast--ok .boh-toast__icon {
  background: var(--boh-success);
}
.boh-toast--warn .boh-toast__icon {
  background: var(--boh-warning);
}
.boh-toast--err .boh-toast__icon {
  background: var(--boh-danger);
}
.boh-toast--info .boh-toast__icon {
  background: var(--boh-info);
}

.boh-toast__msg {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boh-toast__action {
  appearance: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  color: var(--boh-accent-text);
  background: transparent;
  padding: 4px 8px;
  border-radius: var(--liquid-radius-pill);
  transition: background-color var(--duration-fast) var(--ease-out);
}
.boh-toast__action:hover {
  background: var(--boh-accent-soft);
}

.boh-toast__dismiss {
  appearance: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  line-height: 1;
  color: var(--liquid-text-tertiary);
  background: transparent;
  padding: 2px 4px;
  border-radius: 50%;
}
.boh-toast__dismiss:hover {
  color: var(--liquid-text-primary);
}
</style>

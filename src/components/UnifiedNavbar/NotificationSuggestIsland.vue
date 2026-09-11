<script setup>
/**
 * NotificationSuggestIsland — 消息中心智能建议岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，高度自动上报撑开导航 surface。
 * ForumMain 在打开消息抽屉且未读 > 0 时唤起：单行卡「N 条未读 + 全部已读」。
 * actions 数组即「智能操作预测」插槽：本期只放 mark-all-read，后续动作往数组追加，组件不动。
 * 生命周期自管理：停留 lingerMs 自动 onDismiss()；指针交互重置倒计时；busy 暂停；done 交给调用方收起。
 */
import { computed, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  unreadCount: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
  done: { type: Boolean, default: false },
  actions: { type: Array, default: () => [] },
  /** 无交互自动收起时长 ms（指针悬停/按下会重置） */
  lingerMs: { type: Number, default: 12000 },
  onAction: { type: Function, default: null },
  onDismiss: { type: Function, default: null },
});

let lingerTimer = null;

const disarmLinger = () => {
  if (lingerTimer) {
    clearTimeout(lingerTimer);
    lingerTimer = null;
  }
};

const armLinger = () => {
  disarmLinger();
  if (props.busy || props.done) return;
  lingerTimer = setTimeout(() => props.onDismiss?.(), Number(props.lingerMs) || 12000);
};

const title = computed(() => {
  if (props.done) return '已全部标记为已读';
  const count = props.unreadCount > 99 ? '99+' : props.unreadCount;
  return `${count} 条未读消息`;
});

const onActionClick = (action) => {
  if (props.busy || props.done) return;
  disarmLinger(); // 执行期间的收起节奏交给调用方（成功态停留 / 失败还原）
  props.onAction?.(action.id);
};

const onDismissClick = () => {
  disarmLinger();
  props.onDismiss?.();
};

// busy 解除后重新布防倒计时；done 后停止自动收起（由调用方定时 close）
watch(() => props.busy, (busy) => {
  if (busy) disarmLinger();
  else armLinger();
});
watch(() => props.done, (done) => {
  if (done) disarmLinger();
});

onMounted(armLinger);
onUnmounted(disarmLinger);
</script>

<template>
  <div class="notif-suggest-card" role="status" aria-label="消息中心快捷建议"
    @pointerenter="armLinger" @pointerdown="armLinger">
    <span class="nsc-badge" :class="{ 'is-done': done }" aria-hidden="true">
      <svg v-if="!done" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
    <p class="nsc-title">{{ title }}</p>
    <template v-if="!done">
      <button v-for="action in actions" :key="action.id" type="button" class="nsc-cta"
        :disabled="busy" @click="onActionClick(action)">
        {{ busy ? '处理中…' : action.label }}
      </button>
    </template>
    <button type="button" class="nsc-close" aria-label="关闭" :disabled="busy" @click="onDismissClick">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* 透明底：直接坐在 navbar island-custom-host 的 surface 材质上（与 Beta6IslandCard 同模式） */
.notif-suggest-card {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: min(460px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 8px 10px 8px 12px;
}

/* 徽标：铃铛 / 完成态对勾 */
.nsc-badge {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: #0071e3;
  color: #fff;
  box-shadow: 0 3px 10px rgba(0, 113, 227, 0.30);
  transition: background 0.25s ease, box-shadow 0.25s ease;
}

.nsc-badge.is-done {
  background: #30a14e;
  box-shadow: 0 3px 10px rgba(48, 161, 78, 0.30);
}

.nsc-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: #1d1d1f;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 主操作 CTA（由 actions 驱动渲染） */
.nsc-cta {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #0071e3;
  color: #fff;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease, opacity 0.2s ease;
}

.nsc-cta:hover:not(:disabled) { background: #0077ed; transform: translateY(-1px); }
.nsc-cta:active:not(:disabled) { transform: translateY(0); }
.nsc-cta:disabled { opacity: 0.55; cursor: default; }
.nsc-cta:focus-visible { outline: 2px solid #94a3b8; outline-offset: 2px; }

/* 关闭按钮 */
.nsc-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #86868b;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.2s ease;
}

.nsc-close:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); color: #1d1d1f; }
.nsc-close:disabled { opacity: 0.4; cursor: default; }
.nsc-close:focus-visible { outline: 2px solid #94a3b8; outline-offset: 2px; }

/* 暗色：navbar surface 转深后同步换色（平铺祖先选择器写法） */
html[data-theme="dark"] .nsc-title { color: #f2f5f8; }
html[data-theme="dark"] .nsc-badge { background: #2997ff; }
html[data-theme="dark"] .nsc-cta { background: #2997ff; }
html[data-theme="dark"] .nsc-cta:hover:not(:disabled) { background: #3ea1ff; }
html[data-theme="dark"] .nsc-badge.is-done { background: #32d158; }
html[data-theme="dark"] .nsc-close { color: #9aa4b2; }
html[data-theme="dark"] .nsc-close:hover:not(:disabled) { background: rgba(255, 255, 255, 0.10); color: #f2f5f8; }

@media (max-width: 640px) {
  .notif-suggest-card { width: calc(100vw - 24px); gap: 8px; padding: 7px 8px 7px 10px; }
  .nsc-cta { height: 28px; padding: 0 11px; }
}
</style>

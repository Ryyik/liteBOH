<template>
  <section class="lottery-operations" aria-label="抽奖运营工作台">
    <header class="lottery-operations-header">
      <div>
        <span class="lottery-operations-eyebrow">运营工作台</span>
        <h3>优先处理正在阻塞的事项</h3>
        <p>履约、通知与到期开奖集中处理；完整记录仍可在下方各表追溯。</p>
      </div>
      <div class="lottery-operations-actions">
        <button type="button" class="lottery-icon-button" :disabled="snapshot.isLoading" title="刷新待办" aria-label="刷新待办" @click="$emit('refresh')">
          <RefreshCw :size="16" :class="{ 'is-spinning': snapshot.isLoading }" />
        </button>
        <button type="button" class="lottery-secondary-button" @click="$emit('open-tab', 'lotteryAuditLogs')">查看审计</button>
        <button type="button" class="lottery-primary-button" :disabled="dueDrawPending || !dueCount" @click="$emit('run-due-draws')">
          <Play :size="15" />
          {{ dueCount ? `处理 ${dueCount} 个到期抽奖` : '暂无到期抽奖' }}
        </button>
      </div>
    </header>

    <div class="lottery-metrics" aria-label="抽奖运营指标">
      <button type="button" class="lottery-metric is-actionable" @click="$emit('open-tab', 'lotteryFulfillments')">
        <span>待履约</span>
        <strong>{{ activeFulfillmentCount }}</strong>
        <small>联系、确认与发货</small>
      </button>
      <button type="button" class="lottery-metric is-actionable" @click="$emit('open-tab', 'lotteryFulfillments')">
        <span>通知异常</span>
        <strong>{{ notificationFailureCount }}</strong>
        <small>需要重新发送（并入履约）</small>
      </button>
      <button type="button" class="lottery-metric is-actionable" @click="$emit('open-tab', 'lotteries')">
        <span>待开奖</span>
        <strong>{{ dueCount }}</strong>
        <small>{{ schedulerHealth }}</small>
      </button>
      <button type="button" class="lottery-metric is-actionable" @click="$emit('open-tab', 'lotteryEntries')">
        <span>报名风控</span>
        <strong>{{ snapshot.joinRiskCount || 0 }}</strong>
        <small>最近异常尝试（并入报名）</small>
      </button>
    </div>

    <div class="lottery-work-list">
      <div class="lottery-work-list-head">
        <div>
          <span class="lottery-operations-eyebrow">下一步</span>
          <strong>{{ tasks.length ? '按优先级处理' : '没有待处理事项' }}</strong>
        </div>
        <button v-if="tasks.length" type="button" class="lottery-text-button" @click="$emit('open-tab', taskTab)">打开全部</button>
      </div>

      <div v-if="tasks.length" class="lottery-task-list">
        <article v-for="task in tasks" :key="task.id" :class="['lottery-task', `is-${task.tone}`]">
          <div class="lottery-task-indicator" aria-hidden="true" />
          <div class="lottery-task-copy">
            <strong>{{ task.title }}</strong>
            <span>{{ task.meta }}</span>
          </div>
          <div class="lottery-task-actions">
            <button v-if="task.action === 'advance'" type="button" class="lottery-secondary-button" @click="$emit('advance-fulfillment', task.source)">推进</button>
            <button v-if="task.action === 'advance'" type="button" class="lottery-text-button is-danger" @click="$emit('replace-winner', task.source)">替补</button>
            <button v-if="task.action === 'retry'" type="button" class="lottery-secondary-button" @click="$emit('retry-notification', task.source)">重试</button>
            <button v-if="task.action === 'open'" type="button" class="lottery-secondary-button" @click="$emit('open-tab', task.tab)">查看</button>
          </div>
        </article>
      </div>
      <div v-else class="lottery-empty-state">履约、通知和开奖队列目前都处于清空状态。</div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { Play, RefreshCw } from 'lucide-vue-next';

const props = defineProps({
  snapshot: {
    type: Object,
    required: true
  },
  schedulerStatus: {
    type: Object,
    default: null
  },
  dueDrawPending: {
    type: Boolean,
    default: false
  }
});

defineEmits(['advance-fulfillment', 'open-tab', 'refresh', 'replace-winner', 'retry-notification', 'run-due-draws']);

const dueCount = computed(() => Math.max(
  Number(props.snapshot.dueLotteryCount || 0),
  Number(props.snapshot.dueLotteries?.length || 0),
  Number(props.schedulerStatus?.due_count || 0)
));
const activeFulfillmentCount = computed(() => Math.max(
  Number(props.snapshot.fulfillmentCount || 0),
  Number(props.snapshot.fulfillments?.length || 0)
));
const notificationFailureCount = computed(() => {
  // 优先精确计数（仅 failed）；回退到展示列表中 failed 的数量，pending 不计入异常
  const exact = Number(props.snapshot.notificationFailureCount || 0);
  if (exact > 0) return exact;
  return (props.snapshot.notificationFailures || []).filter((item) => item.status === 'failed').length;
});
const schedulerHealth = computed(() => {
  if (!props.schedulerStatus) return '调度状态待加载';
  if (props.schedulerStatus?.last_run?.status === 'failed') return '最近任务失败';
  return props.schedulerStatus?.job_active ? '调度运行中' : '调度待检查';
});
const taskTab = computed(() => {
  if (activeFulfillmentCount.value) return 'lotteryFulfillments';
  if (notificationFailureCount.value) return 'lotteryFulfillments';
  return 'lotteries';
});
const tasks = computed(() => [
  ...(props.snapshot.fulfillments || []).map((item) => ({
    id: `fulfillment-${item.id}`,
    title: `${item.username || item.username_snapshot || '中奖用户'}等待${getFulfillmentAction(item.status)}`,
    meta: `${item.lottery_title || '未命名抽奖'} · ${getFulfillmentStatus(item.status)}`,
    tone: item.status === 'shipping' ? 'info' : 'warn',
    action: 'advance',
    source: item
  })),
  ...(props.snapshot.notificationFailures || []).map((item) => ({
    id: `notification-${item.id}`,
    title: `${item.username || '中奖用户'}的中奖通知发送失败`,
    meta: `${item.lottery_title || '未命名抽奖'} · 已尝试 ${Number(item.attempt_count || 0)} 次`,
    tone: 'danger',
    action: 'retry',
    source: item
  })),
  ...(props.snapshot.dueLotteries || []).map((item) => ({
    id: `lottery-${item.id}`,
    title: `${item.title || '未命名抽奖'}等待开奖`,
    meta: item.draw_at ? `计划开奖 ${formatDateTime(item.draw_at)}` : '未设置开奖时间',
    tone: 'info',
    action: 'open',
    tab: 'lotteries'
  }))
].slice(0, 6));

const getFulfillmentStatus = (status) => ({
  pending_contact: '待联系',
  contacted: '已联系',
  confirmed: '待发货',
  shipping: '运输中'
})[status] || '待处理';

const getFulfillmentAction = (status) => ({
  pending_contact: '联系',
  contacted: '确认',
  confirmed: '发货',
  shipping: '完成履约'
})[status] || '处理';

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
};
</script>

<style scoped>
.lottery-operations {
  display: grid;
  gap: 14px;
  margin: 0 0 16px;
}
.lottery-operations-header,
.lottery-work-list {
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--card) 88%, transparent);
}
.lottery-operations-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  box-shadow: var(--dm-liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.55));
}
.lottery-operations-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
}
.lottery-operations h3,
.lottery-work-list-head strong { margin: 0; color: var(--foreground); font-size: 16px; line-height: 1.35; }
.lottery-operations p { max-width: 620px; margin: 5px 0 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.55; }
.lottery-operations-actions,
.lottery-task-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lottery-icon-button,
.lottery-secondary-button,
.lottery-primary-button,
.lottery-text-button {
  min-height: 34px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 140ms cubic-bezier(.23, 1, .32, 1), background 140ms ease, border-color 140ms ease;
}
.lottery-icon-button { display: grid; width: 34px; padding: 0; place-items: center; }
.lottery-secondary-button { padding: 0 11px; }
.lottery-primary-button { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); }
.lottery-text-button { min-height: auto; padding: 3px 0; border: 0; background: transparent; color: var(--primary); }
.lottery-icon-button:hover:not(:disabled), .lottery-secondary-button:hover, .lottery-text-button:hover { background: var(--muted); border-color: var(--input); }
.lottery-primary-button:hover:not(:disabled) { filter: brightness(.96); }
.lottery-icon-button:active:not(:disabled), .lottery-secondary-button:active, .lottery-primary-button:active, .lottery-text-button:active { transform: scale(.97); }
.lottery-icon-button:disabled, .lottery-primary-button:disabled { cursor: not-allowed; opacity: .52; }
.is-danger { color: var(--destructive); }
.is-spinning { animation: lottery-spin .8s linear infinite; }
@keyframes lottery-spin { to { transform: rotate(360deg); } }
.lottery-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.lottery-metric { display: grid; min-height: 96px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--foreground); text-align: left; font: inherit; }
.lottery-metric.is-actionable { cursor: pointer; transition: transform 140ms cubic-bezier(.23, 1, .32, 1), border-color 140ms ease, background 140ms ease; }
.lottery-metric.is-actionable:hover { border-color: var(--ring); background: color-mix(in srgb, var(--primary) 5%, var(--card)); }
.lottery-metric.is-actionable:active { transform: scale(.98); }
.lottery-metric span, .lottery-metric small { color: var(--muted-foreground); font-size: 12px; }
.lottery-metric strong { margin: 4px 0 auto; color: var(--foreground); font-size: 26px; font-variant-numeric: tabular-nums; }
.lottery-work-list { overflow: hidden; }
.lottery-work-list-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.lottery-task-list { display: grid; }
.lottery-task { display: grid; grid-template-columns: 3px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.lottery-task:last-child { border-bottom: 0; }
.lottery-task-indicator { align-self: stretch; border-radius: 999px; background: var(--muted-foreground); }
.lottery-task.is-warn .lottery-task-indicator { background: var(--chart-3); }
.lottery-task.is-danger .lottery-task-indicator { background: var(--destructive); }
.lottery-task.is-info .lottery-task-indicator { background: var(--primary); }
.lottery-task-copy { display: grid; min-width: 0; gap: 3px; }
.lottery-task-copy strong { overflow: hidden; color: var(--foreground); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.lottery-task-copy span { overflow: hidden; color: var(--muted-foreground); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.lottery-empty-state { padding: 26px 16px; color: var(--muted-foreground); font-size: 13px; text-align: center; }
@media (max-width: 900px) { .lottery-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) {
  .lottery-operations-header { display: grid; gap: 14px; padding: 15px; }
  .lottery-operations-actions { justify-content: stretch; }
  .lottery-operations-actions .lottery-primary-button { flex: 1; justify-content: center; }
  .lottery-task { grid-template-columns: 3px minmax(0, 1fr); padding: 12px; }
  .lottery-task-actions { grid-column: 2; }
}
@media (max-width: 420px) { .lottery-metrics { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .lottery-icon-button, .lottery-secondary-button, .lottery-primary-button, .lottery-text-button, .lottery-metric { transition: opacity 140ms ease, background 140ms ease; } .is-spinning { animation: none; } }
</style>

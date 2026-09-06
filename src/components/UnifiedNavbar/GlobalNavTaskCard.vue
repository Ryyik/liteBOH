<template>
  <Transition name="global-nav-task" @after-leave="$emit('after-leave')">
    <div
      v-if="item?.visible"
      :key="item.id"
      ref="card"
      class="global-nav-task-card"
      :class="[`is-${item.state}`, item.tone ? `tone-${item.tone}` : '', { 'has-thumbs': thumbs.length > 0 }]"
    >
      <!-- 缩略图堆叠（可选，如发帖图的 Airdrop 式展示） -->
      <div v-if="thumbs.length" class="task-thumb-stack" :class="{ single: thumbs.length === 1 }">
        <div v-for="(url, idx) in thumbs" :key="url + idx" class="task-thumb">
          <img :src="url" alt="" loading="eager" decoding="async" @error="onThumbError" />
        </div>
      </div>
      <span v-else class="task-icon" :class="`tone-${iconTone}`">
        <component
          :is="activeIcon"
          :size="17"
          :stroke-width="2.2"
          :class="{ 'spin-icon': item?.state === 'running' && item?.progress != null }"
          aria-hidden="true"
        />
      </span>

      <span class="task-copy">
        <strong>{{ item.title }}</strong>
        <span>{{ item.message }}</span>
      </span>

      <!-- 进度环：进行中 / 成功态展示 -->
      <div v-if="showRing" class="task-ring" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="13" class="task-ring-track" stroke-width="3.6" fill="none" />
          <circle
            cx="22" cy="22" r="13"
            class="task-ring-value"
            :stroke="ringColor"
            stroke-width="3.6"
            fill="none"
            stroke-linecap="round"
            :stroke-dasharray="RING_CIRC"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <span class="task-ring-pct">{{ progressPct }}%</span>
      </div>

      <!-- 操作按钮：失败态展示 -->
      <span v-else-if="actions.length" class="task-actions">
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          class="task-btn"
          :class="`is-${action.kind}`"
          @click.stop="$emit('action', action.id)"
        >{{ action.label }}</button>
      </span>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { AlertTriangle, Check, LoaderCircle, Upload } from 'lucide-vue-next';

const props = defineProps({
  item: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['action', 'after-leave', 'resize']);

const card = ref(null);
let resizeObserver;

const RING_CIRC = 81.68; // 2πr, r=13

const thumbs = computed(() => (Array.isArray(props.item?.thumbs) ? props.item.thumbs : []));
const actions = computed(() => (Array.isArray(props.item?.actions) ? props.item.actions : []));
const showRing = computed(() => props.item?.state === 'running' || props.item?.state === 'success');
const progressPct = computed(() => (props.item?.state === 'success' ? 100 : Math.round(Number(props.item?.progress) || 0)));
const dashOffset = computed(() => RING_CIRC - (RING_CIRC * progressPct.value) / 100);

const ringColor = computed(() => {
  if (props.item?.state === 'success') return '#00b578';
  if (props.item?.tone === 'warning') return '#f59e0b';
  if (props.item?.tone === 'danger') return '#ff3b30';
  return '#1677ff';
});

const iconTone = computed(() => {
  if (props.item?.state === 'success') return 'success';
  if (props.item?.state === 'fail') return props.item?.tone === 'warning' ? 'warning' : 'danger';
  return props.item?.tone || 'running';
});

const activeIcon = computed(() => {
  if (props.item?.state === 'success') return Check;
  if (props.item?.state === 'fail') return AlertTriangle;
  return props.item?.progress == null ? Upload : LoaderCircle;
});

// 破图兜底：直接从堆叠中移除，避免空白占位
const onThumbError = (event) => {
  const el = event?.target;
  if (!el) return;
  const wrapper = el.parentElement;
  if (wrapper) wrapper.style.display = 'none';
  el.style.display = 'none';
};

const reportHeight = () => {
  const height = card.value?.getBoundingClientRect().height;
  if (height) emit('resize', height);
};

// 卡片 v-if 隐藏期间 ref 为 null，重新展示后需要重新 observe（否则高度上报失效）；
// 任务切换（item.id 变化）时内层 :key 重建 DOM，同样需要重新 observe 到新节点
watch(
  [() => props.item?.visible, () => props.item?.id],
  async ([visible]) => {
    if (!visible) return;
    await nextTick();
    if (card.value) {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(reportHeight);
      resizeObserver.observe(card.value);
    }
    reportHeight();
  }
);

watch(
  () => [props.item?.visible, props.item?.title, props.item?.message, props.item?.state, thumbs.value.length, actions.value.length],
  async () => {
    await nextTick();
    reportHeight();
  }
);

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
/* 与消息通知岛完全同位：置于 surface 内，top/left/right 对齐，高度由内容撑出后上报 */
.global-nav-task-card {
  position: absolute;
  z-index: 1;
  top: var(--global-nav-status-top);
  left: 7px;
  right: 7px;
  display: flex;
  align-items: center;
  gap: 11px;
  width: auto;
  min-height: var(--global-nav-status-card-height, 58px);
  padding: 10px 13px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 24px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.3));
  box-shadow: 0 14px 32px rgba(29, 41, 56, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(28px) saturate(175%);
  -webkit-backdrop-filter: blur(28px) saturate(175%);
  clip-path: inset(0 round 22px);
  will-change: transform, opacity;
  transform-origin: center top;
}

.task-icon { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto; }
.task-icon.tone-running { color: #1677ff; background: #e8f0ff; }
.task-icon.tone-success { color: #057857; background: #d8f4e9; }
.task-icon.tone-warning { color: #b45309; background: #fff7ed; }
.task-icon.tone-danger { color: #b91c1c; background: #ffe8e6; }
.task-icon.tone-upload { color: #1677ff; background: #e8f0ff; }

.task-icon .spin-icon { animation: taskCardSpin 1.2s linear infinite; }
@keyframes taskCardSpin { to { transform: rotate(360deg); } }

.task-thumb-stack { position: relative; width: 44px; height: 44px; flex: 0 0 auto; }
.task-thumb-stack .task-thumb {
  position: absolute; width: 36px; height: 36px; border-radius: 10px; overflow: hidden;
  border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12); background: #f5f5f7;
}
.task-thumb-stack .task-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.task-thumb-stack .task-thumb:nth-child(1) { left: 0; top: 0; transform: rotate(-4deg); z-index: 1; }
.task-thumb-stack .task-thumb:nth-child(2) { left: 8px; top: 4px; transform: rotate(5deg); z-index: 2; }
.task-thumb-stack .task-thumb:nth-child(3) { left: 4px; top: 8px; transform: none; z-index: 3; width: 38px; height: 38px; border-radius: 11px; }
.task-thumb-stack.single .task-thumb { left: 0; top: 0; width: 44px; height: 44px; transform: none; border-radius: 12px; }

.task-copy { display: grid; flex: 1; min-width: 0; gap: 2px; text-align: left; }
.task-copy strong { color: #1d2938; font-size: 13px; font-weight: 760; line-height: 1.25; }
.task-copy > span { overflow: hidden; color: #617084; font-size: 12px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }

.task-ring { position: relative; width: 44px; height: 44px; flex: 0 0 auto; }
.task-ring svg { transform: rotate(-90deg); }
.task-ring-track { stroke: rgba(29, 41, 56, 0.08); }
.task-ring .task-ring-value { transition: stroke-dashoffset 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.task-ring .task-ring-pct { position: absolute; inset: 0; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #1d2938; }

.task-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.task-btn {
  border: none; border-radius: 999px; padding: 6px 11px; font-size: 11px; font-weight: 800; cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}
.task-btn.is-primary { background: #1d1d1f; color: #fff; }
.task-btn.is-danger { background: #b45309; color: #fff; }
.task-btn.is-ghost { background: #f5f5f7; color: #1d1d1f; border: 1px solid rgba(0, 0, 0, 0.06); }
.task-btn:active { transform: scale(0.96); }

/* 进场/退场：与消息通知岛同款钻出节奏 */
.global-nav-task-enter-active,
.global-nav-task-leave-active {
  transition:
    clip-path 420ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 420ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 280ms ease,
    filter 300ms ease;
}
.global-nav-task-enter-from,
.global-nav-task-leave-to {
  opacity: 0;
  filter: blur(2px);
  clip-path: inset(0 0 100% 0 round 22px);
  transform: translateY(-10px);
}

:global(#unified-nav-container[data-theme="dark"]) .global-nav-task-card {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35, 39, 49, 0.78), rgba(22, 25, 33, 0.58));
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
:global(#unified-nav-container[data-theme="dark"]) .task-copy strong { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"]) .task-copy > span { color: rgba(226, 232, 240, 0.76); }
:global(#unified-nav-container[data-theme="dark"]) .task-ring-track { stroke: rgba(255, 255, 255, 0.14); }
:global(#unified-nav-container[data-theme="dark"]) .task-ring .task-ring-pct { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"]) .task-thumb-stack .task-thumb { border-color: rgba(255, 255, 255, 0.2); }
:global(#unified-nav-container[data-theme="dark"]) .task-btn.is-ghost { background: rgba(255, 255, 255, 0.08); color: #f8fafc; border-color: rgba(255, 255, 255, 0.12); }

@media (max-width: 768px) {
  .global-nav-task-card { left: 5px; right: 5px; min-height: 54px; padding-left: 11px; padding-right: 11px; }
}

@media (prefers-reduced-motion: reduce) {
  .global-nav-task-enter-active,
  .global-nav-task-leave-active { transition-duration: 120ms; }
  .global-nav-task-enter-from,
  .global-nav-task-leave-to { filter: none; transform: none; }
  .task-ring .task-ring-value { transition: none !important; }
}
</style>

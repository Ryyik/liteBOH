<template>
  <!-- 订单管理（2026-11-10）
       用户口径：「点击头像出现一个订单管理」。
       定位：管理员的**操作台**，不是数据后台的表格 —— 一屏能看到"谁买的、多少钱、
       到哪一步了"，并当场推进（现金单收完钱就能点发货）。
       通知（站内信 + 进度邮件）由数据库触发器发，这里只写 status。 -->
  <Teleport to="body">
    <Transition name="ao">
      <div v-if="visible" class="ao-root shop-sheet-tokens">
        <div class="ao-scrim" @click="$emit('close')"></div>

        <section class="ao-sheet" role="dialog" aria-modal="true" aria-labelledby="ao-title">
          <header class="ao-head">
            <h2 id="ao-title" class="ao-title">订单管理</h2>
            <span class="ao-count">{{ orders.length }} 单</span>
            <button
              type="button"
              class="ao-close"
              aria-label="关闭订单管理"
              @click="$emit('close')"
            >
              <X :size="19" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </header>

          <div class="ao-filters" role="tablist" aria-label="按状态筛选">
            <button
              v-for="option in FILTERS"
              :key="option.value"
              type="button"
              role="tab"
              class="ao-filter"
              :class="{ active: filter === option.value }"
              :aria-selected="filter === option.value"
              @click="filter = option.value"
            >
              {{ option.label }}
              <em v-if="countOf(option.value)">{{ countOf(option.value) }}</em>
            </button>
          </div>

          <div class="ao-body">
            <p v-if="loading" class="ao-hint">正在加载订单…</p>
            <p v-else-if="loadError" class="ao-hint is-error">{{ loadError }}</p>
            <p v-else-if="!visibleOrders.length" class="ao-hint">
              {{ filter === 'all' ? '还没有订单' : '这个状态下没有订单' }}
            </p>

            <ul v-else class="ao-list">
              <li v-for="order in visibleOrders" :key="order.id" class="ao-item">
                <div class="ao-item-head">
                  <strong class="ao-no">{{ order.orderNo || '—' }}</strong>
                  <span class="ao-status" :class="`is-${order.status}`">
                    {{ order.statusLabel }}
                  </span>
                </div>

                <p class="ao-line">
                  <span>{{ order.buyerName }}</span>
                  <span class="ao-dot" aria-hidden="true">·</span>
                  <span>{{ order.priceText || '—' }}</span>
                  <span class="ao-dot" aria-hidden="true">·</span>
                  <span>{{ formatTime(order.createdAt) }}</span>
                </p>
                <p class="ao-items">{{ itemLine(order) }}</p>
                <p v-if="order.shipping && order.shipping.address" class="ao-addr">
                  {{ order.shipping.recipient }} {{ order.shipping.phone }} ·
                  {{ order.shipping.address }}
                </p>
                <p v-if="order.remark" class="ao-remark">备注：{{ order.remark }}</p>

                <div class="ao-actions">
                  <button
                    v-if="nextStatus(order)"
                    type="button"
                    class="ao-advance"
                    :disabled="busyId === order.id"
                    @click="advance(order)"
                  >
                    {{ busyId === order.id ? '处理中…' : advanceLabel(order) }}
                  </button>
                  <span v-else class="ao-done">{{ doneText(order) }}</span>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import {
  advanceShopOrderStatus,
  fetchAllShopOrders,
  shopStatusLabel,
} from '@/utils/api/shop-orders-api.js';
import { logger } from '@/utils/logger.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'notify']);

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'preparing', label: '准备中' },
  { value: 'shipped', label: '已发货' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
];

const orders = ref([]);
const loading = ref(false);
const loadError = ref('');
const filter = ref('all');
const busyId = ref('');

const visibleOrders = computed(() =>
  filter.value === 'all'
    ? orders.value
    : orders.value.filter((order) => order.status === filter.value),
);

const countOf = (value) =>
  value === 'all' ? 0 : orders.value.filter((order) => order.status === value).length;

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const itemLine = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return order?.title || '—';
  const head = items
    .slice(0, 2)
    .map((item) => `${item.title} ×${item.quantity}`)
    .join('、');
  return items.length > 2 ? `${head} 等 ${items.length} 件` : head;
};

/* 推进规则与订单详情同源：只往前一档，取消是终止态 */
const nextStatus = (order) => {
  if (order?.status === 'preparing') return 'shipped';
  if (order?.status === 'shipped') return 'completed';
  return '';
};

const advanceLabel = (order) => (nextStatus(order) === 'shipped' ? '标记已发货' : '标记完成');

const doneText = (order) => {
  if (order?.status === 'completed') return '已完成';
  if (order?.status === 'cancelled') return '已取消';
  return '';
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { data, error } = await fetchAllShopOrders();
    orders.value = data;
    if (error) loadError.value = '订单读取失败，请稍后重试';
  } catch (error) {
    logger.warn('shop-order', '加载订单管理列表失败', error);
    loadError.value = '订单读取失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};

const advance = async (order) => {
  const next = nextStatus(order);
  if (!next || busyId.value) return;
  busyId.value = order.id;
  try {
    const result = await advanceShopOrderStatus(order.id, next);
    if (!result.ok) {
      emit('notify', result.message || '推进失败，请稍后再试');
      return;
    }
    /* 就地更新，不整表重拉：重拉会让列表跳一下，管理员正在看的那一行跑掉 */
    order.status = result.status || next;
    order.statusLabel = shopStatusLabel(order.status);
    emit('notify', next === 'shipped' ? '已标记发货，用户已收到通知' : '订单已标记完成');
  } catch (error) {
    logger.warn('shop-order', '推进订单进度失败', error);
    emit('notify', '推进失败，请稍后再试');
  } finally {
    busyId.value = '';
  }
};

const onKeydown = (event) => {
  if (event.key === 'Escape') emit('close');
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      filter.value = 'all';
      void load();
      document.addEventListener('keydown', onKeydown);
    } else {
      document.removeEventListener('keydown', onKeydown);
      busyId.value = '';
    }
  },
);

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.ao-root {
  position: fixed;
  inset: 0;
  /* 与结算 / 商品详情 / 支付成功同档：压过全局导航（9999）与灵动岛 */
  z-index: 2147482400;
  color: var(--boh-text-primary, #1d1d1f);
}

.ao-scrim {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* 竖屏：整页（手机上就是"下一页"），与结算页同一套形态 */
.ao-sheet {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ao-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
  border-bottom: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  background: var(--boh-bg-primary, #fff);
}

.ao-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.ao-count {
  margin-left: auto;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.ao-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  cursor: pointer;
}

.ao-close:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ao-filters {
  flex: none;
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  overflow-x: auto;
  background: var(--boh-bg-primary, #fff);
  border-bottom: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  scrollbar-width: none;
}

.ao-filters::-webkit-scrollbar {
  display: none;
}

.ao-filter {
  flex: none;
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: var(--boh-bg-secondary, #f2f3f5);
  color: var(--boh-text-secondary, #5d6269);
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.ao-filter.active {
  background: var(--boh-text-primary, #1d2735);
  color: var(--boh-bg-primary, #fff);
}

.ao-filter em {
  margin-left: 4px;
  font-style: normal;
  opacity: 0.7;
}

.ao-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
}

.ao-hint {
  margin: 24px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  text-align: center;
}

.ao-hint.is-error {
  color: var(--boh-warning, #8a5a00);
}

.ao-list {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
}

.ao-item {
  padding: 12px 13px;
  border-radius: 14px;
  background: var(--boh-bg-primary, #fff);
}

.ao-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ao-no {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ao-status {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--boh-text-primary, #1d2735) 8%, transparent);
  color: color-mix(in srgb, var(--boh-text-primary, #1d2735) 72%, transparent);
  font-size: 11px;
  font-weight: 600;
}

/* 状态色只走全局语义 token（暗色档自动翻亮），不在组件里写死色值 */
.ao-status.is-preparing {
  background: color-mix(in srgb, var(--boh-warning, #8a5a00) 14%, transparent);
  color: var(--boh-warning, #8a5a00);
}

.ao-status.is-shipped {
  background: color-mix(in srgb, var(--boh-brand-blue, #0071e3) 14%, transparent);
  color: var(--boh-brand-blue, #0071e3);
}

.ao-status.is-completed {
  background: color-mix(in srgb, var(--boh-success, #1c7c4a) 14%, transparent);
  color: var(--boh-success, #1c7c4a);
}

.ao-line,
.ao-items,
.ao-addr,
.ao-remark {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.ao-line {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--boh-text-secondary, #5d6269);
}

.ao-dot {
  opacity: 0.5;
}

.ao-items {
  color: var(--boh-text-primary, #333a42);
}

.ao-addr,
.ao-remark {
  color: var(--boh-text-secondary, #6d7279);
}

.ao-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.ao-advance {
  min-width: 108px;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 160ms ease;
}

.ao-advance:hover {
  filter: brightness(1.08);
}

.ao-advance:disabled {
  opacity: 0.6;
  cursor: default;
}

.ao-done {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

/* 横屏 / 宽屏：居中弹窗，四边留白（与结算页同一套断点） */
@media (orientation: landscape) {
  .ao-sheet {
    inset: auto;
    top: 50%;
    left: 50%;
    width: min(720px, calc(100vw - 64px));
    height: min(600px, calc(100vh - 40px));
    transform: translate(-50%, -50%);
    border-radius: var(--liquid-radius-lg, 24px);
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  }
}

.ao-enter-active,
.ao-leave-active {
  transition: opacity 180ms ease;
}

.ao-enter-from,
.ao-leave-to {
  opacity: 0;
}

.ao-enter-active .ao-sheet,
.ao-leave-active .ao-sheet {
  transition: transform 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.ao-enter-from .ao-sheet,
.ao-leave-to .ao-sheet {
  transform: translateX(100%);
}

@media (orientation: landscape) {
  .ao-enter-from .ao-sheet,
  .ao-leave-to .ao-sheet {
    transform: translate(-50%, calc(-50% + 10px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ao-enter-active,
  .ao-leave-active,
  .ao-enter-active .ao-sheet,
  .ao-leave-active .ao-sheet {
    transition-duration: 1ms;
  }
}
</style>

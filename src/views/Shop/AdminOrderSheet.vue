<template>
  <!-- 订单管理（2026-11-10）
       用户口径：「点击头像出现一个订单管理」。
       定位：管理员的**操作台**，不是数据后台的表格 —— 一屏能看到"谁买的、多少钱、
       到哪一步了"，并当场推进（现金单收完钱就能点发货）。
       通知（站内信 + 进度邮件）由数据库触发器发，这里只写 status。 -->
  <BohModal v-model="modalOpen" :title="'礼物管理'" max-width="720px" portrait-page flush>
    <template #head>
      <!-- ⚠️ 必须包一层 column：#head 槽外层是 flex **行**容器（壳里那条
           justify-content: space-between 是给「标题 + 关闭钮」准备的）。直接把
           头部和筛选条两个块级子元素一起塞进去，它们会横排并被挤扁 ——
           实测表现是筛选条整条消失，而 Playwright 的 click 仍能命中（假绿），
           只有截图才看得出来。

           🔴 `shop-sheet-tokens` 不能丢：store-tokens.css 给商城域重定义了
           --boh-bg-primary（暗色 #1c1c1e）/ --boh-page-bg 等，注释里写明
           「类名由组件根元素自带」。本组件挂到 body 上、**不在 .store-page 里**
           ⇒ 拿不到那份 token，卡片会回落成全站暗色的 #0a0a0f，
           比页面底（#16120e）更暗 —— 层次反了（截图实测）。
           壳接管了根元素，所以这层类要挂在内容容器上。 -->
      <div class="ao-head-wrap shop-sheet-tokens">
        <header class="ao-head">
          <h2 id="ao-title" class="ao-title">礼物管理</h2>
          <span class="ao-count">{{ orders.length }} 单</span>
          <button type="button" class="ao-close" aria-label="关闭礼物管理" @click="requestClose">
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
      </div>
    </template>

    <!-- ⚠️ `shop-sheet-tokens` 必须同时挂在**两个槽的内容容器**上（#head 与默认槽
         是两个兄弟节点，token 只能各自继承）。store-tokens.css 给商城域重定义了
         --boh-bg-primary（暗色 #1c1c1e）/ --boh-bg-secondary（暗色 #0c0c0e）等，
         「类名由组件根元素自带」。本组件挂到 body 上、
         **不在 .store-page 里** ⇒ 不挂这个类就拿不到那份 token：
         卡片会回落成全站暗色的 #0a0a0f，比页面底更暗，层次整个反了（截图实测）。 -->
    <div class="ao-body shop-sheet-tokens">
      <p v-if="loading" class="ao-hint">正在加载礼物…</p>
      <p v-else-if="loadError" class="ao-hint is-error">{{ loadError }}</p>
      <p v-else-if="!visibleOrders.length" class="ao-hint">
        {{ filter === 'all' ? '还没有礼物' : '这个状态下没有礼物' }}
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
  </BohModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import BohModal from '@/components/ui/BohModal.vue';
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

/* 外壳走 BohModal（2026-11-23，plans/045 阶段 2）：Teleport / 遮罩 / 滚锁 /
   Esc / 焦点陷阱 / 竖屏整页形态都在组件里，这里只留内容与推进逻辑。
   滚锁删掉了原来的 useBodyScrollLock —— 壳已内置（同一份真源，双层锁只会多一份引用计数）。 */

const requestClose = () => emit('close');

/* BohModal 的 v-model 是「关得比开得快」的：Esc / 遮罩 / 关闭钮都只发 false。
   真源仍是宿主的 visible，所以 setter 只处理关闭。 */
const modalOpen = computed({
  get: () => props.visible,
  set: (next) => {
    if (!next) requestClose();
  },
});

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'preparing', label: '准备中' },
  { value: 'shipped', label: '已寄出' },
  { value: 'completed', label: '已送达' },
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

const advanceLabel = (order) => (nextStatus(order) === 'shipped' ? '标记已寄出' : '标记已送达');

const doneText = (order) => {
  if (order?.status === 'completed') return '已送达';
  if (order?.status === 'cancelled') return '已取消';
  return '';
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { data, error } = await fetchAllShopOrders();
    orders.value = data;
    if (error) loadError.value = '礼物读取失败，请稍后重试';
  } catch (error) {
    logger.warn('shop-order', '加载订单管理列表失败', error);
    loadError.value = '礼物读取失败，请稍后重试';
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
    emit('notify', next === 'shipped' ? '已标记寄出，用户已收到通知' : '礼物已标记送达');
  } catch (error) {
    logger.warn('shop-order', '推进订单进度失败', error);
    emit('notify', '推进失败，请稍后再试');
  } finally {
    busyId.value = '';
  }
};

/* 打开时重置筛选并拉列表。Esc 与滚锁已交给壳（BohModal 的焦点陷阱负责 Esc，
   stopPropagation 后不会漏到页面级监听），所以这里不再挂 document 级 keydown。 */
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      filter.value = 'all';
      void load();
    } else {
      busyId.value = '';
    }
  },
);
</script>

<style scoped>
/* 旧手写外壳（.ao-root / .ao-scrim / .ao-sheet / 进出场 keyframes）已随迁移删除：
   层级、遮罩、竖屏整页/横屏居中的几何全部由 BohModal 承担。
   这里只剩「头部 + 筛选条 + 列表」的内容样式。 */

/* #head 槽外层是 flex 行容器（壳里那条 space-between 是给标题+关闭钮的），
   这一层把「头部 + 筛选条」重新排成纵向，并强制占满槽宽。 */
.ao-head-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ao-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  /* 上面那层已经铺满槽宽；这里不再需要 width: 100%（留给 count 的 auto 边距） */
  padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
  border-bottom: 1px solid var(--liquid-border);
  /* 整页形态下头部与列表是**同一页**：底色必须跟页面色走。
     用 --boh-bg-primary 会在暗色下露出色带（那里是 #0a0a0f 纯黑，
     而页面是 #16120e 暖炭）—— 截图实测过。 */
  background: var(--boh-page-bg);
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
  /* 同 .ao-head：整页形态下跟页面底色走（暗色色带见该处注释） */
  background: var(--boh-page-bg);
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

/* 滚动交给壳的 body（flush 已去掉内衬），这里只留列表自己的内衬与底安全区。
   底色必须是**次级底**：原设计是「浅灰页面 + 白卡」形成层次，
   只剩 --boh-page-bg（亮色 #fff、暗色 #16120e）+ 白卡会让两者在亮色下同为纯白，
   卡片边界直接消失（实测 card=rgb(255,255,255) / page=rgb(255,255,255)）。
   头部与筛选条仍走 --boh-page-bg —— 与迁移前的白头部 + 灰列表一致。 */
.ao-body {
  padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--boh-bg-secondary, #f5f5f7);
  /* 列表短时也要铺满壳的 body，否则灰底只到内容底部、下面露出页面底色，
     整页形态下会出现"半张灰纸"的断裂感 */
  min-height: 100%;
  box-sizing: border-box;
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

/* 横屏居中弹窗（720 宽、四边留白）、进出场、reduced-motion 全部由 BohModal 承担，
   这里不再留第二份几何/动画 —— 手写那份是 .ao-sheet 的，类已经不存在了。 */
</style>

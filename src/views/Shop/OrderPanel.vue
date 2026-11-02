<template>
  <!-- 周边 · 「订单」分区（2026-11-02）
       用户口径：「把订单也做成一个子 Tab，放在购物袋后面」—— 订单从购物袋的二级分段
       提成一级分区，和「产品 / 抽奖 / 购物袋 / 地址」平级。

       为什么不留在购物袋里：购物袋是「还没买的东西」，订单是「已经买了的东西」，
       两件事的诉求不同（一个去结算、一个查进度），挤在一个分段里每次都要先切一下。 -->
  <section class="order-panel">
    <!-- 收货地址：只在「没有地址」时出现一条提示（2026-11-02 用户口径「这个删除，只在无地址时提示」
         —— 有地址时这条摘要是常驻噪音，默认地址本来就长一样，谁也不看第二眼）。
         点它是往「地址」分区跳，不在这里就地展开地址簿 —— 地址只在地址分区维护一处。 -->
    <button
      v-if="isLoggedIn && !addressSummary"
      type="button"
      class="order-address"
      @click="$emit('open-address')"
    >
      <span class="order-address-icon">
        <MapPin :size="15" :stroke-width="1.9" aria-hidden="true" />
      </span>
      <span class="order-address-copy">
        <strong>还没有收货地址</strong>
        <small>补一个地址，礼物才不会卡在发货前</small>
      </span>
      <span class="order-address-btn">去添加</span>
    </button>

    <div class="order-filters" role="tablist" aria-label="订单筛选">
      <button
        v-for="option in filterOptions"
        :key="option.value"
        type="button"
        role="tab"
        :aria-selected="filter === option.value"
        :class="{ active: filter === option.value }"
        @click="filter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="!isLoggedIn" class="order-empty shop-fade-in">
      <p>登录后查看购物、中奖与礼物记录</p>
      <button type="button" class="ghost-btn" @click="showLoginModal = true">登录</button>
    </div>
    <p v-else-if="loading" class="order-hint shop-fade-in">正在加载订单…</p>
    <div v-else-if="!visibleOrders.length" class="order-empty shop-fade-in">
      <p>{{ emptyOrderText }}</p>
    </div>
    <TransitionGroup v-else name="shop-card" tag="ul" class="order-list">
      <!-- 整张卡是一个按钮：点开详情（2026-11-02 用户口径「支持点开详情」）。
           卡片左侧放商品首图 —— 主流电商的订单列表都是"图 + 标题 + 状态"，
           纯文字列表在一堆订单里认不出买了什么。 -->
      <li
        v-for="(order, index) in visibleOrders"
        :key="`${order.kind}-${order.id}`"
        class="order-card-wrap"
        :style="{ '--i': index }"
      >
        <button type="button" class="order-card" @click="openDetail(order)">
          <span class="order-thumb">
            <img
              v-if="thumbVisible(order)"
              :src="thumbOf(order)"
              alt=""
              loading="lazy"
              decoding="async"
              :class="{ 'is-loading': !isImageLoaded(thumbKey(order)) }"
              @load="markImageLoaded(thumbKey(order))"
              @error="markThumbFailed(thumbKey(order))"
            />
            <ShoppingBag v-else :size="20" :stroke-width="1.7" aria-hidden="true" />
          </span>
          <span class="order-main">
            <span class="order-head">
              <span class="order-kind" :class="[`is-${order.kind}`, { win: order.isWinner }]">{{
                kindLabel(order)
              }}</span>
              <span class="order-status" :class="{ win: order.isWinner }">
                {{ statusText(order) }}
              </span>
            </span>
            <span class="order-title">{{ order.title }}</span>
            <span class="order-sub">{{ order.subtitle }}</span>
            <span class="order-foot">
              <span>{{ footText(order) }}</span>
              <span>{{ formatDate(order.createdAt) }}</span>
            </span>
          </span>
          <ChevronRight class="order-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </li>
    </TransitionGroup>

    <OrderDetailSheet
      :order="detailOrder"
      @close="detailOrder = null"
      @notify="emit('notify', $event)"
      @changed="loadOrders"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ChevronRight, MapPin, ShoppingBag } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { fetchMyOrders } from '@/utils/api/shop-orders-api.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { useImageLoaded } from '@/composables/useImageLoaded.js';
import { fetchDefaultAddress } from '@/utils/api/address-api.js';
import { logger } from '@/utils/logger.js';
import OrderDetailSheet from './OrderDetailSheet.vue';

const emit = defineEmits(['open-address', 'notify']);

const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);

const filter = ref('all');
const orders = ref([]);
const loading = ref(false);

/* 默认收货地址：顶部那一条只读摘要（真正维护在「地址」分区）。
   单独占一次轻量查询，只取一条 —— 这页不显示地址总数，没必要整表读。 */
const defaultAddress = ref(null);
const addressSummary = computed(() => {
  const addr = defaultAddress.value;
  if (!addr) return '';
  const place = [String(addr.region || '').trim(), String(addr.detail || '').trim()]
    .filter(Boolean)
    .join(' ');
  const recipient = String(addr.recipient || '').trim();
  if (recipient && place) return `${recipient} · ${place}`;
  return recipient || place;
});

const loadDefaultAddress = async () => {
  const uid = authStore.userInfo?.id;
  if (!uid) {
    defaultAddress.value = null;
    return;
  }
  const { data } = await fetchDefaultAddress(uid);
  defaultAddress.value = data || null;
};

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'shop', label: '购物' },
  /* 2026-11-01 用户口径「订单只显示中奖的抽奖」⇒ 这一格的语义从「参与记录」
     收窄成「中奖记录」，标签跟着改，别让用户点进去发现少了一半记录却不知道为什么 */
  { value: 'lottery', label: '中奖' },
  /* 2026-11-02：礼物并进订单区（用户口径「礼物什么的已经进入周边订单了」）——
     礼物是实物，用户来看的诉求和购物订单完全一致：寄到哪一步、编号是多少 */
  { value: 'gift', label: '礼物' },
];

/* 三种记录共用一张卡，差异只在「这一格写什么」：集中在这里，模板里不再写三元堆叠 */
const KIND_LABELS = { shop: '购物', lottery: '中奖', gift: '礼物' };
const kindLabel = (order) => KIND_LABELS[order?.kind] || '订单';
const statusText = (order) => {
  if (order?.kind === 'lottery') return order.resultText || order.statusLabel || '';
  return order?.statusLabel || '';
};
const footText = (order) => {
  if (order?.kind === 'lottery') return `中奖编号 #${order.orderNo || ''}`;
  if (order?.kind === 'gift') return order.orderNo || '礼物记录';
  return order?.orderNo || '';
};

const visibleOrders = computed(() =>
  filter.value === 'all'
    ? orders.value
    : orders.value.filter((order) => order.kind === filter.value),
);
const emptyOrderText = computed(() => {
  if (filter.value === 'shop') return '还没有购物订单';
  if (filter.value === 'lottery') return '还没有中奖记录';
  if (filter.value === 'gift') return '还没有礼物记录';
  return '还没有订单';
});

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const loadOrders = async () => {
  if (!isLoggedIn.value) {
    orders.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await fetchMyOrders(authStore.userInfo?.id);
    orders.value = data || [];
  } catch (error) {
    logger.warn('shop-order', '加载订单失败', error);
    orders.value = [];
  } finally {
    loading.value = false;
  }
};

/* 详情弹层：取消订单的能力搬到了 OrderDetailSheet 里
   （用户口径「详情里可以取消订单」），这一层只负责"哪张卡被点开了"。 */
const detailOrder = ref(null);
const openDetail = (order) => {
  detailOrder.value = order;
};
/* 订单里的图存的是**下单当时的原始值**，历史上有三种形态：裸文件名（本地资源）、
   Cloudinary 原址（大陆不可达）、已是 CDN。必须逐次过 resolveDbCardImage ——
   2026-11-02 线上实测：裸文件名被直接塞进 src，浏览器按当前路由解析成
   `/mascot-new-landscape-orig.webp` 一律 404，整列缩略图都是空方块。 */
const thumbOf = (order) => resolveDbCardImage(order?.items?.[0]?.image || order?.image || '') || '';
const { isFailed: isThumbFailed, markFailed: markThumbFailed } = useImageFailure();
/* 缩略图解码完成后淡入 */
const { isImageLoaded, markImageLoaded } = useImageLoaded();
const thumbKey = (order) => `order-thumb-${order?.kind}-${order?.id}`;
const thumbVisible = (order) => Boolean(thumbOf(order)) && !isThumbFailed(thumbKey(order));

watch(
  () => [isLoggedIn.value, authStore.userInfo?.id],
  () => {
    void loadOrders();
    void loadDefaultAddress();
  },
  { immediate: true },
);

defineExpose({ refresh: loadOrders });
</script>

<style scoped>
/* 与 .bag-panel / .addr-panel 同宽（760）：切分区时左右边界不跳 */
.order-panel {
  display: flex;
  flex-direction: column;
  color: var(--boh-text-primary, #1d1d1f);
  width: 100%;
  max-width: 760px;
}

/* 整条是一个按钮（点哪儿都进「地址」分区），所以要把浏览器给 button 的默认外观抹掉。
   底色与订单卡同口径（--boh-bg-primary + border）：用 --boh-bg-secondary 会和页面底色
   撞成一片，实测截图里整条完全"消失"，只剩文字飘在筛选上方。 */
.order-address {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  background: var(--boh-bg-primary, #fff);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.order-address:hover {
  border-color: var(--boh-brand-blue, #0071e3);
}

.order-address:focus-visible {
  outline: 2px solid var(--boh-brand-blue, #0071e3);
  outline-offset: 2px;
}

.order-address-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--boh-bg-primary, #fff);
  color: var(--boh-text-secondary, #86868b);
}

.order-address-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.order-address-copy strong {
  overflow: hidden;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 13px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-address-copy small {
  overflow: hidden;
  /* 同「地址」分区的说明行：11px 用 #86868b 在白卡上只有 3.3:1，肉眼发虚 */
  color: color-mix(in srgb, var(--boh-text-primary, #1d1d1f) 72%, transparent);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-address-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  /* 整条已经是按钮，这里只做"可以进去改"的视觉提示，不再画第二层边框 */
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 12px;
}

.order-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 12px;
}

.order-filters button {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  cursor: pointer;
}

.order-filters button.active {
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
}

.order-list {
  position: relative; /* leave 的绝对定位基准（shop-card-leave-active） */
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 整张卡是按钮：图 + 文字 + 右侧箭头，和主流电商订单列表一致。
   抹掉 button 默认外观（字体、对齐、内边距），否则文字会居中、行高会变。 */
.order-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--boh-bg-primary, #fff);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}

.order-card:hover {
  border-color: var(--boh-border-strong, rgba(0, 0, 0, 0.18));
}

.order-card:active {
  transform: scale(0.995);
}

.order-card:focus-visible {
  outline: 2px solid var(--boh-brand-blue, #0071e3);
  outline-offset: 2px;
}

.order-thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
}

.order-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.order-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.order-chevron {
  flex: none;
  color: var(--boh-text-tertiary, #a1a1a6);
}

.order-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.order-kind {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
}

.order-status {
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
}

.order-status.win {
  color: var(--boh-brand-blue, #0071e3);
}

/* 中奖的单子：类别徽标也走品牌色，一眼能和购物单分开 */
.order-kind.win {
  background: var(--boh-brand-blue-soft, rgba(0, 113, 227, 0.08));
  color: var(--boh-brand-blue, #0071e3);
}

/* 礼物单：暖色徽标。三类记录（购物灰 / 中奖蓝 / 礼物暖）在列表里各自可辨 */
.order-kind.is-gift {
  background: var(--boh-gift-soft, rgba(160, 90, 0, 0.1));
  color: var(--boh-gift-accent, #a05a00);
}

.order-title {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-sub {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
}

.order-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 56px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.order-empty p {
  margin: 0;
}

.order-hint {
  margin: 24px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  text-align: center;
}

.ghost-btn {
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 13px;
  cursor: pointer;
}
</style>

<template>
  <div class="bag-panel">
    <div class="bag-seg" role="tablist" aria-label="购物袋分段">
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'cart'"
        :class="{ active: view === 'cart' }"
        @click="view = 'cart'"
      >
        购物车<span v-if="bagCount" class="seg-count">{{ bagCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'orders'"
        :class="{ active: view === 'orders' }"
        @click="view = 'orders'"
      >
        订单
      </button>
    </div>

    <div v-if="view === 'cart'" class="bag-section">
      <div v-if="!shoppingBag.length" class="bag-empty">
        <p>购物袋还是空的</p>
        <button type="button" class="ghost-btn" @click="$emit('browse')">去看看周边</button>
      </div>
      <template v-else>
        <ul class="bag-list">
          <li v-for="item in shoppingBag" :key="`${item.id}-${item.selectedSpec}`" class="bag-row">
            <img class="bag-thumb" :src="itemImage(item)" :alt="String(item.title || '')" />
            <div class="bag-row-main">
              <!-- 删除入口（2026-11-01）：此前只有 −/+ 数量，把数量减到 1 就再也减不掉，
                   等于没有「移除」。× 是行级动作，和数量控件分开，避免误触 -->
              <div class="row-head">
                <p class="row-title">{{ item.title }}</p>
                <button
                  type="button"
                  class="row-remove"
                  aria-label="移除该商品"
                  title="移除"
                  @click="removeItem(item)"
                >
                  <X :size="14" :stroke-width="2" aria-hidden="true" />
                </button>
              </div>
              <p class="row-sub">{{ item.selectedSpecLabel || '默认规格' }}</p>
              <div class="row-bottom">
                <div class="qty">
                  <button type="button" aria-label="减少数量" @click="changeQuantity(item, -1)">
                    −
                  </button>
                  <span>{{ item.quantity }}</span>
                  <button type="button" aria-label="增加数量" @click="changeQuantity(item, 1)">
                    +
                  </button>
                </div>
                <p class="row-price">{{ itemPriceText(item) }}</p>
              </div>
            </div>
          </li>
        </ul>
        <div class="bag-total">
          <span>合计</span>
          <span class="total-values">{{ totalText }}</span>
        </div>
        <button
          type="button"
          class="primary-btn"
          :disabled="!canCheckout"
          @click="$emit('checkout')"
        >
          去结算
        </button>
      </template>
    </div>

    <div v-else class="bag-section">
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

      <div v-if="!isLoggedIn" class="bag-empty">
        <p>登录后查看购物订单与中奖记录</p>
        <button type="button" class="ghost-btn" @click="showLoginModal = true">登录</button>
      </div>
      <p v-else-if="loading" class="bag-hint">正在加载订单…</p>
      <div v-else-if="!visibleOrders.length" class="bag-empty">
        <p>{{ emptyOrderText }}</p>
      </div>
      <ul v-else class="order-list">
        <li v-for="order in visibleOrders" :key="`${order.kind}-${order.id}`" class="order-card">
          <div class="order-head">
            <span class="order-kind" :class="{ win: order.isWinner }">
              {{ order.kind === 'shop' ? '购物' : '中奖' }}
            </span>
            <span class="order-status" :class="{ win: order.isWinner }">
              {{ order.kind === 'shop' ? order.statusLabel : order.resultText }}
            </span>
          </div>
          <p class="order-title">{{ order.title }}</p>
          <p class="order-sub">{{ order.subtitle }}</p>
          <div class="order-foot">
            <span>{{ order.kind === 'shop' ? order.orderNo : `中奖编号 #${order.orderNo}` }}</span>
            <span>{{ formatDate(order.createdAt) }}</span>
          </div>
        </li>
      </ul>
      <button
        v-if="showFullLink && isLoggedIn"
        type="button"
        class="full-link"
        @click="$emit('open-full')"
      >
        在购物袋页查看全部订单
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useBagStore } from '@/stores/bag';
import { getImageUrl } from '@/utils/asset-helper.js';
import { X } from 'lucide-vue-next';
import { fetchMyOrders } from '@/utils/api/shop-orders-api.js';
import { logger } from '@/utils/logger.js';

const props = defineProps({
  initialView: { type: String, default: 'cart' },
  /* 嵌在商城 Tab 里时给一条「去购物袋页」的出口；独立页自身不需要（默认 false） */
  showFullLink: { type: Boolean, default: false },
});

defineEmits(['checkout', 'browse', 'open-full']);

const authStore = useAuthStore();
const bagStore = useBagStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { shoppingBag } = storeToRefs(bagStore);

const view = ref(props.initialView === 'orders' ? 'orders' : 'cart');
const filter = ref('all');
const orders = ref([]);
const loading = ref(false);

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'shop', label: '购物' },
  /* 2026-11-01 用户口径「订单只显示中奖的抽奖」⇒ 这一格的语义从「参与记录」
     收窄成「中奖记录」，标签跟着改，别让用户点进去发现少了一半记录却不知道为什么 */
  { value: 'lottery', label: '中奖' },
];

const bagCount = computed(() => shoppingBag.value.reduce((sum, item) => sum + item.quantity, 0));

const parsePoints = (value) => {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.round(points) : 0;
};
const formatRmb = (cents) => {
  const value = Number(cents);
  return Number.isFinite(value) && value > 0 ? `¥${(value / 100).toFixed(2)}` : '';
};
const priceText = (product) => {
  const mode = String(product?.payment_mode || 'points_only');
  const points = parsePoints(product?.points_cost);
  const rmb = formatRmb(product?.rmb_price);
  if (mode === 'rmb_only') return rmb || '暂不可购买';
  if (mode === 'combined') {
    return [points ? `${points} 积分` : '', rmb].filter(Boolean).join(' + ') || '暂不可兑换';
  }
  return points ? `${points} 积分` : '暂不可兑换';
};
const itemPriceText = priceText;
const itemImage = (item) => getImageUrl(item?.image) || '';

const totalPoints = computed(() =>
  shoppingBag.value.reduce((sum, item) => sum + parsePoints(item.points_cost) * item.quantity, 0),
);
const totalRmb = computed(() =>
  shoppingBag.value.reduce((sum, item) => {
    const rmb = Number(item.rmb_price);
    return sum + (Number.isFinite(rmb) && rmb > 0 ? rmb * item.quantity : 0);
  }, 0),
);
const totalText = computed(() => {
  const parts = [];
  if (totalPoints.value) parts.push(`${totalPoints.value} 积分`);
  if (totalRmb.value) parts.push(formatRmb(totalRmb.value));
  return parts.join(' + ') || '—';
});

const canCheckout = computed(() =>
  shoppingBag.value.every((item) => {
    if (item.is_purchasable === false) return false;
    const mode = String(item.payment_mode || 'points_only');
    if (mode === 'points_only') return parsePoints(item.points_cost) > 0;
    if (mode === 'rmb_only') return Number(item.rmb_price) > 0;
    if (mode === 'combined') return parsePoints(item.points_cost) > 0 && Number(item.rmb_price) > 0;
    return false;
  }),
);

const visibleOrders = computed(() =>
  filter.value === 'all'
    ? orders.value
    : orders.value.filter((order) => order.kind === filter.value),
);
const emptyOrderText = computed(() => {
  if (filter.value === 'shop') return '还没有购物订单';
  if (filter.value === 'lottery') return '还没有中奖记录';
  return '还没有订单';
});

const changeQuantity = (item, delta) => {
  bagStore.updateBagItemQuantity(item.id, item.selectedSpec, delta);
};

/* 整件移除（不是把数量减到 0）：removeFromBag 直接按 id + 规格删掉那一行 */
const removeItem = (item) => {
  bagStore.removeFromBag(item.id, item.selectedSpec);
};

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
    logger.warn('shop-bag', '加载订单失败', error);
    orders.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  () => [isLoggedIn.value, authStore.userInfo?.id],
  () => {
    void loadOrders();
  },
  { immediate: true },
);

const refresh = () => loadOrders();
const showOrders = () => {
  view.value = 'orders';
  void loadOrders();
};

defineExpose({ refresh, showOrders });
</script>

<style scoped>
.bag-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--boh-text-primary, #1d1d1f);
  /* 横屏改成全宽屏布局后（商品 / 抽奖网格铺满右区），购物袋不跟着拉满：
     它是「一行一件」的列表，拉满后缩略图与按钮被推到两端、中间一大片空白，
     而且顶上那个「购物车 / 订单」分段控件会被撑成两根巨型胶囊。
     限宽 760 与商品内容列同宽，切 Tab 时左右边界不跳。 */
  width: 100%;
  max-width: 760px;
}

.bag-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  /* 分段控件自身限宽：横屏全宽后若跟着拉满，两个选项各 380px，
     「购物车」会变成一根巨型胶囊、另一个字飘到屏幕另一端 —— 读不出是一个控件 */
  width: 100%;
  max-width: 260px;
  padding: 3px;
  border-radius: 999px;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.bag-seg button {
  position: relative;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  cursor: pointer;
}

.bag-seg button.active {
  background: var(--boh-bg-primary, #fff);
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 500;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.seg-count {
  display: inline-block;
  margin-left: 5px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
}

.bag-list,
.order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bag-row {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--boh-bg-primary, #fff);
}

.bag-thumb {
  width: 64px;
  height: 64px;
  flex: none;
  border-radius: 12px;
  object-fit: cover;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.bag-row-main {
  min-width: 0;
  flex: 1;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.row-remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  margin: -2px -2px 0 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--boh-text-tertiary, #a1a1a6);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.row-remove:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
}

.row-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.row-sub {
  margin: 2px 0 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.qty {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
}

.qty button {
  width: 26px;
  height: 26px;
  border: 0;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.qty span {
  min-width: 18px;
  text-align: center;
  font-size: 12px;
}

.row-price {
  margin: 0;
  font-size: 13px;
}

.bag-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 14px 2px 0;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.total-values {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 500;
}

.primary-btn {
  display: block;
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 999px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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

.bag-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 56px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.bag-empty p {
  margin: 0;
}

.bag-hint {
  margin: 24px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  text-align: center;
}

.order-filters {
  display: flex;
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

.order-card {
  padding: 14px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--boh-bg-primary, #fff);
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

.order-title {
  margin: 0;
  font-size: 14px;
}

.order-sub {
  margin: 3px 0 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.order-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
}

.full-link {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 12px 0;
  border: 0;
  background: transparent;
  color: var(--boh-brand-blue, #0071e3);
  font-size: 13px;
  cursor: pointer;
}
</style>

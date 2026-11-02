<template>
  <!-- 周边 · 「购物袋」分区（2026-11-02）
       订单已提成一级分区（/shop?tab=order，见 OrderPanel.vue），这里只剩「还没买的东西」。
       原来那个「购物车 / 订单」二级分段随之去掉 —— 只剩一段的分段控件只是装饰。 -->
  <div class="bag-panel">
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
      <button type="button" class="primary-btn" :disabled="!canCheckout" @click="$emit('checkout')">
        去结算
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useBagStore } from '@/stores/bag';
import { getImageUrl } from '@/utils/asset-helper.js';
import { X } from 'lucide-vue-next';

defineEmits(['checkout', 'browse']);

const bagStore = useBagStore();
const { shoppingBag } = storeToRefs(bagStore);

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

const changeQuantity = (item, delta) => {
  bagStore.updateBagItemQuantity(item.id, item.selectedSpec, delta);
};

/* 整件移除（不是把数量减到 0）：removeFromBag 直接按 id + 规格删掉那一行 */
const removeItem = (item) => {
  bagStore.removeFromBag(item.id, item.selectedSpec);
};
</script>

<style scoped>
.bag-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--boh-text-primary, #1d1d1f);
  /* 横屏改成全宽屏布局后（商品 / 抽奖网格铺满右区），购物袋不跟着拉满：
     它是「一行一件」的列表，拉满后缩略图与按钮被推到两端、中间一大片空白。
     限宽 760 与商品内容列、订单、地址同宽，切 Tab 时左右边界不跳。 */
  width: 100%;
  max-width: 760px;
}

.bag-list {
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
</style>

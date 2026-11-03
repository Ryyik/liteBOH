<template>
  <!-- 订单详情（2026-11-02）
       用户口径：「购物订单可以带图片，支持点开详情（详情里可以取消订单）可以看内容和状态
       （例如什么时候发货，什么时候运输，参考主流购物平台 UI），横屏弹窗竖屏全屏形式」。

       形态：竖屏铺满（手机上就是"下一页"），横屏 / 宽屏居中弹窗（高度不超 80vh）。
       状态用竖向时间线表达进度，而不是只丢一个「待处理」标签 —— 主流电商看的是
       「到哪一步了、下一步是什么」。 -->
  <Teleport to="body">
    <!-- 进出场（2026-11-03 用户口径「打开关闭任何操作都要有动画，不要硬切」）：
         进场原本就有 od-slide-up；补的是**遮罩淡入**与**离场**——
         v-if 直接摘节点会让整层瞬间消失，看起来像页面闪了一下。 -->
    <Transition name="od">
      <div v-if="order" class="od-overlay" @click.self="$emit('close')">
        <section class="od-sheet" role="dialog" aria-modal="true" aria-label="订单详情">
          <header class="od-head">
            <button type="button" class="od-back" aria-label="返回" @click="$emit('close')">
              <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <span class="od-head-title">订单详情</span>
            <!-- 占位：让标题在视觉上居中，不依赖 flex 的 space-between 凑 -->
            <span class="od-head-spacer" aria-hidden="true" />
          </header>

          <div class="od-body">
            <div class="od-status" :class="{ muted: isCancelled }">
              <div class="od-status-copy">
                <strong>{{ statusLabel }}</strong>
                <small>{{ statusHint }}</small>
              </div>
              <component
                :is="isCancelled ? Ban : Truck"
                :size="22"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </div>

            <ol class="od-steps" :class="{ 'is-cancelled': isCancelled }">
              <li
                v-for="(step, index) in steps"
                :key="step.key"
                class="od-step"
                :class="{ done: index <= currentIndex, current: index === currentIndex }"
              >
                <span class="od-dot" aria-hidden="true" />
                <div class="od-step-copy">
                  <strong>{{ step.label }}</strong>
                  <small>{{ step.hint }}</small>
                </div>
                <time v-if="step.time" class="od-step-time">{{ step.time }}</time>
              </li>
            </ol>

            <div class="od-section">
              <h3 class="od-section-title">商品</h3>
              <ul class="od-items">
                <li v-for="(item, index) in items" :key="`${item.title}-${index}`" class="od-item">
                  <span class="od-thumb">
                    <img
                      v-if="item.imageUrl && !isItemImageFailed(index)"
                      :src="item.imageUrl"
                      alt=""
                      loading="lazy"
                      @error="markItemImageFailed(index)"
                    />
                    <ShoppingBag v-else :size="20" :stroke-width="1.7" aria-hidden="true" />
                  </span>
                  <span class="od-item-copy">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.specLabel }}</small>
                  </span>
                  <span class="od-item-qty">×{{ item.quantity }}</span>
                </li>
              </ul>
            </div>

            <dl class="od-meta">
              <div>
                <dt>订单号</dt>
                <dd>{{ order.orderNo || '—' }}</dd>
              </div>
              <div>
                <dt>下单时间</dt>
                <dd>{{ formatDateTime(order.createdAt) || '—' }}</dd>
              </div>
              <div>
                <dt>支付</dt>
                <dd>{{ order.priceText || '—' }}</dd>
              </div>
              <div v-if="order.updatedAt">
                <dt>最近更新</dt>
                <dd>{{ formatDateTime(order.updatedAt) }}</dd>
              </div>
            </dl>

            <!-- 收货信息（2026-11-03）：时间线只回答「到哪一步」，回答不了「寄给谁、寄到哪」。
               ⚠️ 订单表**没有地址快照列**（只存了收件人电话与 items），这里读的是
               当前资料里登记的收货地址 —— 所以措辞必须写明「当前资料」，不能让人
               以为这是下单当时的快照。补真快照要动表结构（见 plans/037 §5 P2）。 -->
            <div v-if="shipping" class="od-section">
              <h3 class="od-section-title">收货信息</h3>
              <div class="od-shipping">
                <p class="od-shipping-head">
                  <strong>{{ shipping.recipient || '未填写' }}</strong>
                  <span>{{ shipping.phone || '' }}</span>
                </p>
                <p class="od-shipping-addr">{{ shipping.address || '未填写' }}</p>
                <small>按当前资料显示 · 下单时的地址未单独留档</small>
              </div>
            </div>

            <p v-if="!canCancel" class="od-note">{{ cancelHint }}</p>
          </div>

          <footer v-if="canCancel" class="od-foot">
            <button
              type="button"
              class="od-cancel"
              :class="{ armed }"
              :disabled="cancelling"
              @click="handleCancel"
            >
              {{ cancelling ? '处理中…' : armed ? '确认取消' : cancelLabel }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Ban, ChevronLeft, ShoppingBag, Truck } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { cancelGift, cancelShopOrder } from '@/utils/api/shop-orders-api.js';
import { getProfileByUsername } from '@/utils/api/profile-api.js';
import { logger } from '@/utils/logger.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';

const props = defineProps({
  order: { type: Object, default: null },
});

const emit = defineEmits(['close', 'notify', 'changed']);

/* 状态词与进度条真源 —— 和数据库 status / gift_status 的取值一一对应。
   顺序即进度顺序；cancelled 不在流程里，单独走「已取消」分支。 */
/* 四态（2026-11-02 用户口径）：准备中 → 已发货 → 完成；取消是终止态。
   订单和礼物共用同一条流程 —— 对用户来说两者都是「一件实物在寄」。 */
const FLOW = [
  { key: 'preparing', label: '准备中', hint: '正在为你打包' },
  { key: 'shipped', label: '已发货', hint: '包裹已交给承运方' },
  { key: 'completed', label: '完成', hint: '已送达' },
];

const TIMELINES = { shop: FLOW, gift: FLOW };

/* 未发货前都能自助退款（用户口径 2026-11-02「在未发货前可以让用户直接退款」）：
   preparing = 准备中，还没交给承运方。
   shipped 之后包裹在路上，退了会变成"钱退了货还在寄"，只能走人工。 */
const CANCELABLE_SHOP = new Set(['preparing']);
const CANCELABLE_GIFT = new Set(['preparing']);

const kind = computed(() => (props.order?.kind === 'gift' ? 'gift' : 'shop'));
const status = computed(() => String(props.order?.status || ''));
const isCancelled = computed(() => status.value === 'cancelled');

/* 收货信息：订单行里没有地址快照（表结构如此），从当前资料读一份用于核对。
   只有购物订单需要 —— 礼物/中奖的联系方式走的是另一条线。
   读失败就整块不显示，不要用一个空卡片占位。 */
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const shipping = ref(null);
const loadShipping = async () => {
  if (props.order?.kind !== 'shop') {
    shipping.value = null;
    return;
  }
  const username = String(userInfo.value?.username || '').trim();
  if (!username) return;
  try {
    const { data, error } = await getProfileByUsername(username);
    if (error || !data) return;
    const recipient = String(data.shipping_recipient || '').trim();
    const phone = String(data.shipping_phone || '').trim();
    const address = String(data.shipping_address || '').trim();
    shipping.value = recipient || address ? { recipient, phone, address } : null;
  } catch (error) {
    logger.warn('shop-order', '读取收货信息失败', error);
  }
};

watch(
  () => props.order?.id,
  () => void loadShipping(),
  { immediate: true },
);

const statusLabel = computed(() => {
  if (isCancelled.value) return '取消';
  return props.order?.statusLabel || '准备中';
});

const statusHint = computed(() => {
  if (isCancelled.value) return '订单已取消，积分已退回账户';
  const flow = TIMELINES[kind.value];
  const step = flow.find((entry) => entry.key === status.value);
  return step?.hint || '订单处理中';
});

const currentIndex = computed(() => {
  // 已取消：终止节点是时间线的最后一个（已提交 → 取消）
  if (isCancelled.value) return 1;
  const index = TIMELINES[kind.value].findIndex((entry) => entry.key === status.value);
  return index < 0 ? 0 : index;
});

/* 只有「下单」和「当前这一步」有可信时间：库里只存 created_at / updated_at，
   中间步骤没有独立时间戳 —— 不编时间，宁可留空。 */
const steps = computed(() => {
  if (isCancelled.value) {
    return [
      {
        key: 'created',
        label: '已提交',
        hint: '订单已创建',
        time: formatDateTime(props.order?.createdAt),
      },
      {
        key: 'cancelled',
        label: '取消',
        hint: '订单已关闭，积分已退回',
        time: formatDateTime(props.order?.updatedAt),
      },
    ];
  }

  return TIMELINES[kind.value].map((step, index) => ({
    ...step,
    time:
      index === 0
        ? formatDateTime(props.order?.createdAt)
        : index === currentIndex.value
          ? formatDateTime(props.order?.updatedAt)
          : '',
  }));
});

const items = computed(() => {
  const list = Array.isArray(props.order?.items) ? props.order.items : [];
  if (list.length) {
    return list.map((item) => ({
      title: item.title || '周边商品',
      specLabel: item.specLabel || '默认规格',
      quantity: Math.max(1, Number(item.quantity) || 1),
      imageUrl: resolveDbCardImage(item.image) || '',
    }));
  }
  return [
    {
      title: props.order?.title || '订单',
      specLabel: props.order?.subtitle || '',
      quantity: 1,
      imageUrl: resolveDbCardImage(props.order?.image) || '',
    },
  ];
});

/* 商品图失败记账：key 与 v-for 的 key 同口径（标题 + 下标），
   不用纯下标 —— 列表重排后下标会指到另一行，出现「这张挂了那张变占位」。 */
const { isFailed, markFailed } = useImageFailure();
const itemImageKey = (item, index) => `order-item-${item?.title || ''}-${index}`;
const isItemImageFailed = (index) => isFailed(itemImageKey(items.value[index], index));
const markItemImageFailed = (index) => markFailed(itemImageKey(items.value[index], index));

const canCancel = computed(() => {
  if (!props.order?.id || isCancelled.value) return false;
  return kind.value === 'gift'
    ? CANCELABLE_GIFT.has(status.value)
    : CANCELABLE_SHOP.has(status.value);
});

const cancelLabel = computed(() => (kind.value === 'gift' ? '取消礼物' : '取消订单'));
const cancelHint = computed(() => {
  if (isCancelled.value) return '';
  if (kind.value === 'gift') return '礼物已发出，无法自助取消。如需帮助请联系管理员。';
  return status.value === 'completed'
    ? '订单已完成，无法自助取消。如需售后请联系管理员。'
    : '订单已发货，无法自助取消。如需售后请联系管理员。';
});

const armed = ref(false);
const cancelling = ref(false);
let armTimer = 0;

const disarm = () => {
  armed.value = false;
  if (armTimer) {
    clearTimeout(armTimer);
    armTimer = 0;
  }
};

const handleCancel = async () => {
  if (cancelling.value) return;
  if (!armed.value) {
    armed.value = true;
    if (armTimer) clearTimeout(armTimer);
    armTimer = window.setTimeout(disarm, 3000);
    return;
  }

  disarm();
  cancelling.value = true;
  try {
    const result =
      kind.value === 'gift'
        ? await cancelGift(props.order.id)
        : await cancelShopOrder(props.order.id);

    if (!result.ok) {
      emit('notify', result.message || '取消失败，请稍后再试');
      return;
    }

    if (kind.value === 'gift') {
      emit('notify', '礼物已取消');
    } else if (result.refundedPoints > 0) {
      emit('notify', `订单已取消，${result.refundedPoints} 积分已退回`);
    } else {
      emit('notify', '订单已取消');
    }

    emit('changed');
    emit('close');
  } catch (error) {
    logger.warn('shop-order', '取消订单失败', error);
    emit('notify', '取消失败，请稍后再试');
  } finally {
    cancelling.value = false;
  }
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/* 打开期间锁滚动 + Esc 关闭：详情是覆盖层，背后列表不该跟着滚 */
const onKeydown = (event) => {
  if (event.key === 'Escape') emit('close');
};

watch(
  () => props.order,
  (value) => {
    disarm();
    cancelling.value = false;
    if (value) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKeydown);
    } else {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeydown);
    }
  },
);

onBeforeUnmount(() => {
  disarm();
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.od-overlay {
  position: fixed;
  z-index: 2147482400;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  color: var(--boh-text-primary, #1d1d1f);
  background: color-mix(in srgb, var(--boh-page-bg, #fff) 82%, transparent);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
}

/* 竖屏：铺满整屏（等于翻到下一页），顶部留安全区 */
.od-sheet {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background: var(--boh-page-bg, #fff);
  animation: od-slide-up 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* 遮罩淡入（面板自己走 od-slide-up）；离场单独写一套 —— 进场若也交给
   <Transition> 会和下面那条 keyframes 打架，所以这里只接管 leave。 */
.od-overlay {
  animation: od-fade-in 200ms ease;
}

@keyframes od-fade-in {
  from {
    opacity: 0;
  }
}

.od-leave-active {
  transition: opacity 200ms ease;
}

.od-leave-to {
  opacity: 0;
}

.od-leave-active .od-sheet {
  transition:
    transform 220ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 200ms ease;
}

.od-leave-to .od-sheet {
  transform: translateY(4%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .od-overlay,
  .od-sheet {
    animation-duration: 1ms;
  }

  .od-leave-active,
  .od-leave-active .od-sheet {
    transition-duration: 1ms;
  }
}

@keyframes od-slide-up {
  from {
    transform: translateY(3%);
    opacity: 0.6;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 横屏 / 宽屏：居中弹窗，四边留白，不再铺满 */
@media (orientation: landscape) {
  .od-overlay {
    align-items: center;
    padding: 20px;
  }
  .od-sheet {
    width: min(560px, 100%);
    height: auto;
    max-height: calc(100vh - 40px);
    border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
    border-radius: 22px;
    box-shadow: 0 28px 80px rgba(23, 39, 58, 0.22);
    overflow: hidden;
    animation: od-pop 200ms ease-out;
  }

  @keyframes od-pop {
    from {
      transform: scale(0.97);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
}

.od-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 14px 10px;
  border-bottom: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
}

.od-back {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  cursor: pointer;
}

.od-back:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
}

.od-head-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.od-head-spacer {
  flex: none;
  width: 34px;
}

.od-body {
  flex: 1;
  min-height: 0;
  padding: 16px 16px 20px;
  overflow-y: auto;
}

.od-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
}

.od-status.muted {
  color: var(--boh-text-secondary, #86868b);
}

.od-status-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.od-status-copy strong {
  font-size: 17px;
}

.od-status-copy small {
  color: color-mix(in srgb, var(--boh-text-primary, #1d1d1f) 68%, transparent);
  font-size: 12px;
}

.od-steps {
  display: flex;
  flex-direction: column;
  margin: 18px 0 0;
  padding: 0 0 0 4px;
  list-style: none;
}

.od-step {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 0 0 18px 0;
  color: var(--boh-text-tertiary, #a1a1a6);
}

/* 竖线：最后一个节点不画 */
.od-step:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 16px;
  left: 4px;
  width: 1px;
  height: calc(100% - 8px);
  background: var(--boh-border-primary, rgba(0, 0, 0, 0.08));
}

.od-step.done {
  color: var(--boh-text-secondary, #86868b);
}

.od-step.current {
  color: var(--boh-text-primary, #1d1d1f);
}

.od-dot {
  position: relative;
  z-index: 1;
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--boh-border-strong, rgba(0, 0, 0, 0.18));
}

.od-step.done .od-dot {
  background: var(--boh-text-secondary, #86868b);
}

.od-step.current .od-dot {
  background: var(--boh-brand-blue, #0071e3);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--boh-brand-blue, #0071e3) 16%, transparent);
}

/* 取消是"终止"不是"进度"：终止点用 danger，别让人以为还在流程里 */
.od-steps.is-cancelled .od-step.current .od-dot {
  background: var(--boh-danger, #c0392b);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--boh-danger, #c0392b) 14%, transparent);
}

.od-step-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.od-step-copy strong {
  font-size: 13px;
  font-weight: 500;
}

.od-step.current .od-step-copy strong {
  font-weight: 600;
}

.od-step-copy small {
  color: color-mix(in srgb, var(--boh-text-primary, #1d1d1f) 62%, transparent);
  font-size: 11px;
}

.od-step-time {
  flex: none;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.od-section {
  margin-top: 8px;
}

.od-section-title {
  margin: 0 0 8px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  font-weight: 500;
}

/* 收货信息：与商品块同款卡片，但只放两行文字 */
.od-shipping {
  padding: 11px 12px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  background: var(--boh-bg-primary, #fff);
}

.od-shipping p {
  margin: 0;
}

.od-shipping-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.od-shipping-head strong {
  font-size: 13px;
  font-weight: 500;
}

.od-shipping-head span {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.od-shipping .od-shipping-addr {
  margin-top: 4px;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 12px;
  line-height: 1.5;
}

.od-shipping small {
  display: block;
  margin-top: 6px;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
}

.od-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.od-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  background: var(--boh-bg-primary, #fff);
}

.od-thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
}

.od-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.od-item-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.od-item-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.od-item-copy small {
  overflow: hidden;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.od-item-qty {
  flex: none;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.od-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 18px 0 0;
  padding: 14px 0 0;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
}

.od-meta div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.od-meta dt {
  flex: none;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.od-meta dd {
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.od-note {
  margin: 16px 0 0;
  color: color-mix(in srgb, var(--boh-text-primary, #1d1d1f) 62%, transparent);
  font-size: 11px;
  line-height: 1.6;
}

.od-foot {
  flex: none;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
}

.od-cancel {
  width: 100%;
  height: 44px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 14px;
  cursor: pointer;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.od-cancel:hover {
  border-color: var(--boh-border-strong, rgba(0, 0, 0, 0.18));
}

/* 确认态才上 danger：第一下只是"我要取消"，第二下才是真退 */
.od-cancel.armed {
  border-color: color-mix(in srgb, var(--boh-danger, #c0392b) 45%, transparent);
  background: color-mix(in srgb, var(--boh-danger, #c0392b) 10%, transparent);
  color: var(--boh-danger, #c0392b);
}

.od-cancel:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>

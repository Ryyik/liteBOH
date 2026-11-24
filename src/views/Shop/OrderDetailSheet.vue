<template>
  <!-- 订单详情（2026-11-02）
       用户口径：「购物订单可以带图片，支持点开详情（详情里可以取消订单）可以看内容和状态
       （例如什么时候发货，什么时候运输，参考主流购物平台 UI），横屏弹窗竖屏全屏形式」。

       形态：竖屏铺满（手机上就是"下一页"），横屏 / 宽屏居中弹窗（高度不超 80vh）。
       状态用竖向时间线表达进度，而不是只丢一个「待处理」标签 —— 主流电商看的是
       「到哪一步了、下一步是什么」。

       外壳走 BohModal（2026-11-24，plans/045 阶段 2 第六家族 / B 类最后一份）：
       遮罩 / 滚锁 / 焦点陷阱 / Esc / 进出场全部交给壳；竖屏整页靠 `portrait-page`
       （上一批给壳加的第四个口子），横屏回 560 宽居中弹窗。
       这里只剩下内容：头部、正文、底部动作区三块。
       ⚠️ 别在注释里逐字复述被删掉的旧类名与旧 API —— 单测用「全文不含某字面量」
       做防回潮守卫，注释里出现同样会命中（假红）。 -->
  <BohModal v-model="modalOpen" title="礼物详情" max-width="560px" portrait-page flush>
    <!-- ⚠️ `shop-sheet-tokens` 必须挂在**两个槽的内容容器**上（#head 与默认槽是
         兄弟节点，token 只能各自继承）。store-tokens.css 给商城域重定义了
         --boh-bg-secondary（暗色 #0c0c0e）/ --boh-page-bg 等，「类名由组件根元素
         自带」—— 本组件挂到 body 上、**不在 .store-page 里**，不挂这个类就拿不到
         那份 token（卡片回落全站暗色、比页面底更暗，层次整个反了）。
         壳接管了根元素，所以这层类要挂在内容容器上。 -->
    <template #head>
      <header class="od-head shop-sheet-tokens">
        <button type="button" class="od-back" aria-label="返回" @click="requestClose">
          <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <span class="od-head-title">礼物详情</span>
        <!-- 占位：让标题在视觉上居中，不依赖 flex 的 space-between 凑 -->
        <span class="od-head-spacer" aria-hidden="true" />
      </header>
    </template>

    <div class="od-body shop-sheet-tokens">
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
          <dt>编号</dt>
          <dd>{{ order?.orderNo || '—' }}</dd>
        </div>
        <div>
          <dt>领取时间</dt>
          <dd>{{ formatDateTime(order?.createdAt) || '—' }}</dd>
        </div>
        <div>
          <dt>费用</dt>
          <dd>{{ order?.priceText || '—' }}</dd>
        </div>
        <div>
          <!-- 运费口径 2026-11-04「大部分地区不收邮费」：订单详情是核对总价的地方，
               这里缺一行会让人怀疑"是不是还有笔邮费没算" -->
          <dt>运费</dt>
          <dd>大部分地区包邮</dd>
        </div>
        <div v-if="order?.updatedAt">
          <dt>最近更新</dt>
          <dd>{{ formatDateTime(order.updatedAt) }}</dd>
        </div>
      </dl>

      <!-- 收货信息（2026-11-04 起读**下单快照**）：
           2026-11-03 那版只能读当前资料并注明「下单时的地址未单独留档」——
           用户改了默认地址，这张单就永久说不清寄给谁了。快照列上线后优先用它；
           历史订单没有快照，仍然回落资料，并把"当前"两个字写出来。 -->
      <div v-if="shipping" class="od-section">
        <h3 class="od-section-title">收货信息</h3>
        <div class="od-shipping">
          <p class="od-shipping-head">
            <strong>{{ shipping.recipient || '未填写' }}</strong>
            <span>{{ shipping.phone || '' }}</span>
          </p>
          <p class="od-shipping-addr">{{ shipping.address || '未填写' }}</p>
          <small v-if="shipping.isSnapshot">下单时留档，改地址不影响此单</small>
          <small v-else>按当前资料显示 · 此单未留下单时地址</small>
        </div>
      </div>

      <!-- 买家备注：只在当时真写了才出现，空备注不占版面 -->
      <div v-if="order?.remark" class="od-section">
        <h3 class="od-section-title">礼物备注</h3>
        <p class="od-remark">{{ order.remark }}</p>
      </div>

      <!-- 现金待收：线上下单、线下收款，不写清会让人以为"提交完就没事了" -->
      <p v-if="cashDue" class="od-note is-due">
        现金 {{ cashDueText }} 由管理员联系收取，收款后寄出。
      </p>

      <p v-if="!canCancel" class="od-note">{{ cancelHint }}</p>
    </div>

    <!-- 底部动作区（2026-11-10）：管理员多一档「推进进度」。
         之前商城页里**没有任何推进入口**，只能去「数据管理 → 商城订单」改一行
         status —— 现金单尤其别扭：钱是线下收的，收完就该能立刻落库。
         通知（站内信 + 进度邮件）由数据库触发器发，这里不重复发。 -->
    <template v-if="canCancel || adminNextStatus" #footer>
      <footer class="od-foot shop-sheet-tokens">
        <button
          v-if="adminNextStatus"
          type="button"
          class="od-advance"
          :disabled="advancing"
          @click="handleAdvance"
        >
          {{ advancing ? '处理中…' : adminAdvanceLabel }}
        </button>
        <small v-if="adminNextStatus && cashDue" class="od-advance-hint">
          现金 {{ cashDueText }} 收到后再推进；用户会同时收到站内信与邮件
        </small>
        <button
          v-if="canCancel"
          type="button"
          class="od-cancel"
          :class="{ armed }"
          :disabled="cancelling"
          @click="handleCancel"
        >
          {{ cancelling ? '处理中…' : armed ? '确认取消' : cancelLabel }}
        </button>
      </footer>
    </template>
  </BohModal>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Ban, ChevronLeft, ShoppingBag, Truck } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import {
  cancelGift,
  cancelShopOrder,
  advanceShopOrderStatus,
} from '@/utils/api/shop-orders-api.js';
import { getProfileByUsername } from '@/utils/api/profile-api.js';
import { sendShopOrderCancelledEmail } from '@/utils/email-service.js';
import { logger } from '@/utils/logger.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import BohModal from '@/components/ui/BohModal.vue';

const props = defineProps({
  order: { type: Object, default: null },
});

const emit = defineEmits(['close', 'notify', 'changed']);

/* 外壳走 BohModal（2026-11-24，plans/045 阶段 2 第六家族）：挂载位置、遮罩、
   滚锁、焦点陷阱、Esc、进出场全部交给壳。原来这里的声明式滚动锁（随 order
   开关）与 window 级 Esc 监听都删了 —— 壳已内置同一份真源，双层锁只会多一份
   引用计数；两处 Esc 监听还会互相抢。 */
const requestClose = () => emit('close');

/* BohModal 的 v-model 是「关得比开得快」的：Esc / 遮罩 / 关闭钮都只发 false。
   本组件是常驻挂载 + 靠 order 判空显示的（父级 OrderPanel 里没有任何 v-if），
   所以打开态由 order 推导，写 false 时转成 close 事件交给父级清空。 */
const modalOpen = computed({
  get: () => Boolean(props.order),
  set: (next) => {
    if (!next) requestClose();
  },
});

/* 状态词与进度条真源 —— 和数据库 status / gift_status 的取值一一对应。
   顺序即进度顺序；cancelled 不在流程里，单独走「已取消」分支。 */
/* 四态（2026-11-02 用户口径）：准备中 → 已发货 → 完成；取消是终止态。
   订单和礼物共用同一条流程 —— 对用户来说两者都是「一件实物在寄」。 */
const FLOW = [
  { key: 'preparing', label: '准备中', hint: '正在为你准备' },
  { key: 'shipped', label: '已寄出', hint: '已交给快递' },
  { key: 'completed', label: '已送达', hint: '已被签收' },
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
  /* ① 优先用订单自带的下单快照（2026-11-04 起的新单都有） */
  const snapshot = props.order?.shipping;
  if (snapshot && (snapshot.address || snapshot.recipient)) {
    shipping.value = {
      recipient: String(snapshot.recipient || '').trim(),
      phone: String(snapshot.phone || '').trim(),
      address: String(snapshot.address || '').trim(),
      isSnapshot: true,
    };
    return;
  }
  /* ② 历史订单没有快照：回落当前资料，并且措辞上不能冒充"当时" */
  const username = String(userInfo.value?.username || '').trim();
  if (!username) return;
  try {
    const { data, error } = await getProfileByUsername(username);
    if (error || !data) return;
    const recipient = String(data.shipping_recipient || '').trim();
    const phone = String(data.shipping_phone || '').trim();
    const address = String(data.shipping_address || '').trim();
    shipping.value = recipient || address ? { recipient, phone, address, isSnapshot: false } : null;
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

/* 现金待收（2026-11-04 口径：现金线下人工收）。
   ⚠️ 不新造订单状态 —— 表里只有 preparing/shipped/completed/cancelled 四态，
   这里只是「这笔钱还没结」的**展示层事实**：已发货/已完成/已取消都不再提示，
   因为那时要么已经收过、要么这一单作废了。 */
const cashDue = computed(() => {
  const order = props.order;
  if (order?.kind !== 'shop') return 0;
  if (String(order?.paymentMode || 'points_only') === 'points_only') return 0;
  if (['completed', 'cancelled', 'shipped'].includes(String(order?.status || ''))) return 0;
  const cents = Number(order?.rmb) || 0;
  return cents > 0 ? cents : 0;
});
const cashDueText = computed(() => `¥${(cashDue.value / 100).toFixed(2)}`);

const statusHint = computed(() => {
  if (isCancelled.value) return '礼物已取消，积分已退回账户';
  const flow = TIMELINES[kind.value];
  const step = flow.find((entry) => entry.key === status.value);
  return step?.hint || '礼物处理中';
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
        hint: '礼物已确认',
        time: formatDateTime(props.order?.createdAt),
      },
      {
        key: 'cancelled',
        label: '取消',
        hint: '礼物已关闭，积分已退回',
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
      title: props.order?.title || '方块礼物',
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

/* 商城商品与赠礼在用户口径里都叫「礼物」（2026-11-12），取消动作因此不再分两种文案 */
const cancelLabel = '取消礼物';
const cancelHint = computed(() => {
  if (isCancelled.value) return '';
  if (kind.value === 'gift') return '礼物已发出，无法自助取消，请联系管理员。';
  return status.value === 'completed'
    ? '礼物已送达，无法自助取消，售后请联系管理员。'
    : '礼物已寄出，无法自助取消，售后请联系管理员。';
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

    /* 取消 → 通知管理员（2026-11-03）。取消本身是 RPC 里的钱的事务，
       邮件只是告知，所以**不阻塞、不影响结果提示**：发送失败只记日志，
       用户看到的仍然是「订单已取消」。
       幂等重放（alreadyCancelled）不再发第二封 —— 库里状态已是 cancelled，
       服务端的「确实已取消」校验挡不住重复点击。 */
    if (kind.value !== 'gift' && !result.alreadyCancelled) {
      void sendShopOrderCancelledEmail({ orderId: props.order.id }).catch((error) => {
        logger.warn('shop-order', '订单取消通知邮件发送失败', error);
      });
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

/* ── 管理员推进进度（2026-11-10）──────────────────────────────────────
 *
 * 为什么入口在这里而不是后台：现金单的推进是「收到钱 → 发出货 → 确认收货」，
 * 发生在聊天/收款现场，不该要求管理员切到数据管理后台去改一行。
 *
 * ⚠️ 只做 shop 订单：礼物进度走 user_gifts.gift_status，后台另有那一路，
 *    别在这里顺手扩（两套状态词不同，混在一起会互相覆盖）。
 * ⚠️ 通知（站内信 + 进度邮件）由数据库触发器 `trg_notify_shop_order_progress`
 *    与 mail_outbox 发出，这里**不再调 EF** —— 再调一次就是重复发信。
 * ⚠️ 只往前推一档：preparing → shipped → completed。cancelled 不在这条路上
 *    （用户自助走 cancel_shop_order，管理员作废走后台）。
 */
const isAdmin = computed(() => Boolean(authStore.isAdmin));
const advancing = ref(false);
const adminNextStatus = computed(() => {
  if (!isAdmin.value) return '';
  if (props.order?.kind !== 'shop' || isCancelled.value) return '';
  if (status.value === 'preparing') return 'shipped';
  if (status.value === 'shipped') return 'completed';
  return '';
});
const adminAdvanceLabel = computed(() =>
  adminNextStatus.value === 'shipped' ? '标记已寄出' : '标记已送达',
);

const handleAdvance = async () => {
  const next = adminNextStatus.value;
  if (!next || advancing.value) return;
  advancing.value = true;
  try {
    const result = await advanceShopOrderStatus(props.order.id, next);
    if (!result.ok) {
      emit('notify', result.message || '推进失败，请稍后再试');
      return;
    }
    emit('notify', next === 'shipped' ? '已标记寄出，用户已收到通知' : '礼物已标记送达');
    emit('changed');
    emit('close');
  } catch (error) {
    logger.warn('shop-order', '推进订单进度失败', error);
    emit('notify', '推进失败，请稍后再试');
  } finally {
    advancing.value = false;
  }
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/* 切换订单时重置「确认取消」的两段式状态。
   Esc 与滚锁已交给 BohModal（壳的焦点陷阱负责 Esc 且带 stopPropagation，
   不误关外层；滚锁是引用计数，叠层安全）—— 别再往这里写 window keydown
   或 body.style.overflow，两套 Esc 会互相抢、两层锁会多一份计数。 */
watch(
  () => props.order,
  () => {
    disarm();
    cancelling.value = false;
  },
);

onBeforeUnmount(disarm);
</script>

<style scoped>
/* 遮罩 / 面板底色 / 圆角 / 阴影 / 进出场 / 层级 / 竖屏整页 / 横屏居中
   全部由 BohModal 承担（portrait-page + max-width="560px"）。这里只留内容。
   ⚠️ 壳的 overlay 是它自己的根元素，宿主 scoped 样式够不着 —— 在这里写遮罩类
   既无效又会被防回潮守卫当成旧外壳回来了。 */

/* 头部：壳的 #head 槽内衬是 0（head--slot），节奏由这里定。
   竖屏整页时顶部要留安全区（刘海/状态栏），横屏居中弹窗里则不需要 ——
   用 env() 在弹窗里也是 0，一条规则两档都对。

   🔴 `width: 100%` 不能省：#head 槽外层是 flex **行**容器（壳里那条
   space-between 是给「标题 + 关闭钮」两个子元素准备的），本 header 作为它的
   唯一子项时宽度是**按内容收缩**的（flex item 的默认 cross-axis 行为），
   于是标题贴到返回按钮右边、底部分隔线只画到一半 —— 只有截图才看得出来
   （探针量的是元素存在与文字内容，量不到「是否撑满」）。 */
.od-head {
  display: flex;
  flex: none;
  width: 100%;
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

/* 内容区：滚动与「吃掉剩余高度」由壳的 body 负责（flush 档 + portrait-page
   给 body 补了 flex:1/min-height:0），这里只给内衬。别再写 overflow-y:auto ——
   双层滚动容器会让竖屏整页滑动时先滚内层、滚到底才带动外层，手感是断的。 */
.od-body {
  padding: 16px 16px 20px;
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

/* 现金待收：用语义警告色，和"取消订单"这类提示区分开 */
.od-note.is-due {
  margin-top: 14px;
  color: var(--boh-warning, #8a5a00);
  font-size: 12px;
  font-weight: 500;
}

/* 买家备注：原文照排，保留换行可能性（用户可能写了多行要求） */
.od-remark {
  margin: 0;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 底部动作区：壳的 #footer 槽自带 14/24/22 内衬与右对齐，所以这里只补
   width:100%（默认不是块级铺满）与底部安全区 —— 别再写左右 padding，
   会和壳叠成 40px，按钮区被挤窄一圈。 */
.od-foot {
  width: 100%;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  /* 管理员同时有「推进进度」与「取消订单」两档时竖排，不并排挤成两个半宽按钮 */
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 管理员主操作：实心蓝。与「取消」刻意拉开层级 —— 推进是常规动作，取消是例外 */
.od-advance {
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 160ms ease;
}

.od-advance:hover {
  filter: brightness(1.08);
}

.od-advance:disabled {
  opacity: 0.6;
  cursor: default;
}

.od-advance-hint {
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
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

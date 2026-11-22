<template>
  <section class="fl-page" aria-label="订单与礼物">
    <header class="fl-hero">
      <div class="fl-hero-copy">
        <p class="fl-eyebrow">Fulfillment</p>
        <h2>订单与礼物</h2>
        <p>
          商城订单、抽奖奖品和赠礼合并成一条履约队列。这里只回答一件事：哪些还没寄、哪些在路上、哪些缺收件信息。
        </p>
      </div>
      <div class="fl-hero-actions">
        <span v-if="lastLoadedAt" class="fl-updated">更新于 {{ formatClock(lastLoadedAt) }}</span>
        <button class="fl-btn ghost" type="button" :disabled="loading" @click="load">
          <RefreshCw :size="15" :class="{ 'fl-spin': loading }" aria-hidden="true" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <p v-if="notice.text" class="fl-notice" :class="`is-${notice.tone}`" role="status">
      {{ notice.text }}
    </p>

    <div class="fl-summary" role="group" aria-label="履约概览">
      <button
        v-for="card in summaryCards"
        :key="card.key"
        type="button"
        class="fl-stat"
        :class="[`tone-${card.tone}`, { 'is-active': activeSummaryKey === card.key }]"
        :aria-pressed="activeSummaryKey === card.key"
        @click="selectSummary(card)"
      >
        <span class="fl-stat-icon">
          <component :is="card.icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
        </span>
        <span class="fl-stat-value">{{ card.value }}</span>
        <span class="fl-stat-label">{{ card.label }}</span>
        <span class="fl-stat-hint">{{ card.hint }}</span>
      </button>
    </div>

    <section class="fl-toolbar" aria-label="筛选履约记录">
      <label class="fl-search">
        <Search :size="16" aria-hidden="true" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索订单号、用户名、收件人、电话或奖品"
          aria-label="搜索订单或礼物"
        />
        <button
          v-if="keyword"
          type="button"
          class="fl-search-clear"
          aria-label="清空搜索"
          @click="keyword = ''"
        >
          ×
        </button>
      </label>

      <div class="fl-filter-row">
        <div class="fl-filter-group" role="group" aria-label="按来源筛选">
          <span class="fl-filter-label">来源</span>
          <button
            v-for="option in FULFILLMENT_ORIGIN_FILTERS"
            :key="option.value"
            type="button"
            class="fl-chip"
            :class="{ 'is-active': origin === option.value }"
            :aria-pressed="origin === option.value"
            @click="setOrigin(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="fl-filter-group" role="group" aria-label="按状态筛选">
          <span class="fl-filter-label">状态</span>
          <button
            v-for="option in FULFILLMENT_STATUS_FILTERS"
            :key="option.value"
            type="button"
            class="fl-chip"
            :class="{ 'is-active': status === option.value && !onlyNeedsShipping }"
            :aria-pressed="status === option.value && !onlyNeedsShipping"
            @click="setStatus(option.value)"
          >
            {{ option.label }}
            <em v-if="statusCount(option.value)">{{ statusCount(option.value) }}</em>
          </button>
        </div>

        <label class="fl-sort">
          <span>排序</span>
          <select v-model="sortMode" aria-label="履约记录排序">
            <option value="priority">待处理优先</option>
            <option value="latest">最新创建</option>
          </select>
        </label>
      </div>
    </section>

    <div class="fl-result-bar">
      <p>
        显示 <strong>{{ visibleItems.length }}</strong> / {{ items.length }} 条
        <span v-if="stats.needsShipping" class="fl-result-warning">
          · {{ stats.needsShipping }} 条缺收件信息
        </span>
      </p>
      <button v-if="hasActiveFilters" type="button" class="fl-reset" @click="resetFilters">
        重置筛选
      </button>
    </div>

    <div v-if="loading && !items.length" class="fl-grid" aria-label="正在加载履约记录">
      <div v-for="index in 6" :key="`fl-skeleton-${index}`" class="fl-card is-skeleton">
        <span class="fl-skeleton-line short"></span>
        <span class="fl-skeleton-line title"></span>
        <span class="fl-skeleton-line"></span>
        <span class="fl-skeleton-block"></span>
      </div>
    </div>

    <div v-else-if="loadError && !items.length" class="fl-state is-error">
      <Inbox :size="30" :stroke-width="1.5" aria-hidden="true" />
      <strong>履约记录读取失败</strong>
      <p>{{ loadError }}</p>
      <button type="button" class="fl-btn ghost" @click="load">重新加载</button>
    </div>

    <div v-else-if="!visibleItems.length" class="fl-state">
      <Inbox :size="30" :stroke-width="1.5" aria-hidden="true" />
      <strong>{{ hasActiveFilters ? '没有匹配的记录' : '还没有订单或礼物' }}</strong>
      <p>
        {{
          hasActiveFilters
            ? '试试清空关键词或切换状态；也可能是当前筛选下确实没有待处理项。'
            : '商城下单、抽奖中奖和赠礼记录会自动出现在这里。'
        }}
      </p>
      <button v-if="hasActiveFilters" type="button" class="fl-btn ghost" @click="resetFilters">
        清除筛选
      </button>
    </div>

    <div v-else class="fl-grid">
      <article
        v-for="item in visibleItems"
        :key="item.key"
        class="fl-card"
        :class="[
          `is-${item.status}`,
          {
            'is-needs-shipping': item.needsShipping,
            'is-expanded': isExpanded(item),
          },
        ]"
      >
        <header class="fl-card-head">
          <span class="fl-origin" :class="`is-${item.origin}`">{{ originLabel(item.origin) }}</span>
          <span class="fl-status" :class="`tone-${statusTone(item.status)}`">
            {{ item.statusLabel }}
          </span>
        </header>

        <div class="fl-card-main">
          <div class="fl-thumb" :class="{ 'is-empty': !hasImage(item) }">
            <img
              v-if="hasImage(item)"
              :src="imageUrl(item)"
              alt=""
              loading="lazy"
              @error="markImageFailed(item.key)"
            />
            <Package v-else :size="24" :stroke-width="1.5" aria-hidden="true" />
          </div>
          <div class="fl-card-copy">
            <h3>{{ item.title }}</h3>
            <p class="fl-code">
              <span>{{ item.code || '无编号' }}</span>
              <template v-if="item.username">
                <span class="fl-dot" aria-hidden="true">·</span>
                <span class="fl-user">用户 {{ item.username }}</span>
              </template>
            </p>
            <p v-if="item.priceText" class="fl-price">{{ item.priceText }}</p>
          </div>
        </div>

        <div v-if="item.status !== 'cancelled'" class="fl-progress" :class="`is-${item.status}`">
          <span
            v-for="(step, index) in FULFILLMENT_STEPS"
            :key="step.value"
            class="fl-step"
            :class="{ 'is-done': isStepDone(item.status, index) }"
          >
            <i aria-hidden="true"></i>
            <b>{{ step.label }}</b>
          </span>
        </div>
        <p v-else class="fl-cancelled-line">这单已取消，不再进入寄送流程。</p>

        <div class="fl-address" :class="{ 'is-missing': item.needsShipping }">
          <MapPin :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span class="fl-address-text">
            <span v-if="hasShippingInfo(item)" class="fl-address-line">{{
              addressLine(item)
            }}</span>
            <span v-else-if="item.needsShipping">待补收件信息</span>
            <span v-else>收货人 / 地址未留存</span>
          </span>
          <button
            v-if="hasShippingInfo(item)"
            type="button"
            class="fl-copy"
            aria-label="复制完整收件信息"
            title="复制完整收件信息（收货人 / 电话 / 地址）"
            @click="copyShipping(item)"
          >
            <Copy :size="14" aria-hidden="true" />
            <span class="fl-copy-text">复制</span>
          </button>
        </div>

        <p v-if="item.remark" class="fl-remark">备注：{{ item.remark }}</p>

        <footer class="fl-card-foot">
          <div class="fl-card-actions">
            <button
              v-if="item.nextStatus"
              type="button"
              class="fl-btn primary"
              :disabled="Boolean(busyKey)"
              @click="advance(item)"
            >
              <Truck v-if="item.nextStatus === 'shipped'" :size="14" aria-hidden="true" />
              <CheckCircle2 v-else :size="14" aria-hidden="true" />
              {{ busyKey === item.key ? '处理中…' : item.nextActionLabel }}
            </button>
            <span v-else class="fl-done">
              {{ item.status === 'completed' ? '已完成履约' : '已取消' }}
            </span>
            <button
              v-if="canCancelFulfillment(item)"
              type="button"
              class="fl-btn danger-ghost"
              :disabled="Boolean(busyKey)"
              :title="cancelHint(item)"
              @click="cancel(item)"
            >
              <Ban :size="14" aria-hidden="true" />
              取消
            </button>
          </div>
          <button type="button" class="fl-detail-toggle" @click="toggleExpanded(item)">
            {{ isExpanded(item) ? '收起' : '详情' }}
            <ChevronDown :size="14" :class="{ 'is-open': isExpanded(item) }" aria-hidden="true" />
          </button>
        </footer>

        <div v-if="isExpanded(item)" class="fl-expanded">
          <div v-if="item.items.length" class="fl-expanded-block">
            <p class="fl-expanded-label">内容</p>
            <ul class="fl-item-list">
              <li v-for="(line, index) in item.items" :key="`${item.key}-item-${index}`">
                <span>{{ line.title || '未命名' }}</span>
                <span class="fl-item-qty">×{{ line.quantity || 1 }}</span>
              </li>
            </ul>
          </div>

          <dl class="fl-facts">
            <div>
              <dt>创建</dt>
              <dd>{{ formatTime(item.createdAt) || '—' }}</dd>
            </div>
            <div v-if="item.completedAt">
              <dt>送达</dt>
              <dd>{{ formatTime(item.completedAt) }}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{{ originDetail(item) }}</dd>
            </div>
            <div v-if="item.points">
              <dt>积分</dt>
              <dd>{{ item.points }}</dd>
            </div>
          </dl>

          <!-- 进度邮件的真实投递结果：用户问的是「到底发了没有」，
               这里直接给账本答案，而不是只说「已排队」。 -->
          <div v-if="item.recordKind === 'order'" class="fl-mail">
            <p class="fl-expanded-label">进度邮件</p>
            <p v-if="mailState(item).loading" class="fl-mail-line is-muted">查询中…</p>
            <p v-else-if="!mailState(item).ok" class="fl-mail-line is-muted">
              {{ mailState(item).text }}
            </p>
            <p v-else class="fl-mail-line" :class="`is-${mailState(item).status || 'none'}`">
              {{ mailState(item).text }}
              <span v-if="mailState(item).detail" class="fl-mail-detail">
                · {{ mailState(item).detail }}
              </span>
            </p>
          </div>

          <p v-if="item.origin === 'lottery'" class="fl-expanded-hint">
            这张单由开奖自动生成；重抽后未再中奖时，仍处于准备中的旧单会自动取消。
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Inbox,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-vue-next';
import {
  adminCancelShopOrder,
  advanceShopOrderStatus,
  advanceUserGiftStatus,
  fetchFulfillmentQueue,
  fetchShopOrderMailStatus,
} from '@/utils/api/shop-orders-api.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useConfirmDialog, isDialogBusy } from '@/composables/useConfirmDialog.js';
import {
  FULFILLMENT_ORIGIN_FILTERS,
  FULFILLMENT_ORIGIN_META,
  FULFILLMENT_STATUS_FILTERS,
  buildFulfillmentQueue,
  buildShippingCopyText,
  canCancelFulfillment,
  cancelHint,
  filterFulfillmentQueue,
  fulfillmentStatusLabel,
  nextFulfillmentAction,
  nextFulfillmentStatus,
  sortFulfillmentQueue,
  summarizeFulfillmentQueue,
} from '../composables/fulfillment-queue.js';

const FULFILLMENT_STEPS = [
  { value: 'preparing', label: '准备' },
  { value: 'shipped', label: '寄出' },
  { value: 'completed', label: '送达' },
];

const STATUS_TONE = {
  preparing: 'warning',
  shipped: 'info',
  completed: 'success',
  cancelled: 'muted',
};

const items = ref([]);
const loading = ref(false);
const loadError = ref('');
const lastLoadedAt = ref(null);
const keyword = ref('');
const status = ref('all');
const origin = ref('all');
const onlyNeedsShipping = ref(false);
const sortMode = ref('priority');
const busyKey = ref('');
const expandedKeys = ref(new Set());
const failedImages = ref(new Set());
const notice = ref({ text: '', tone: 'success' });
let noticeTimer = null;

const { confirm } = useConfirmDialog();

const stats = computed(() => summarizeFulfillmentQueue(items.value));

const visibleItems = computed(() =>
  sortFulfillmentQueue(
    filterFulfillmentQueue(items.value, {
      status: status.value,
      origin: origin.value,
      keyword: keyword.value,
      needsShippingOnly: onlyNeedsShipping.value,
    }),
    sortMode.value,
  ),
);

const summaryCards = computed(() => [
  {
    key: 'all',
    label: '全部记录',
    value: stats.value.total,
    hint: '订单 + 赠礼',
    tone: 'neutral',
    icon: Package,
  },
  /* 「待补信息」排第二：它是唯一一类「不处理就永远寄不出」的记录。
     手机竖屏下概览横向滑动，前两张卡必须是最该看的两个数。 */
  {
    key: 'needsShipping',
    label: '待补信息',
    value: stats.value.needsShipping,
    hint: '没有地址就寄不出',
    tone: 'danger',
    icon: AlertTriangle,
  },
  {
    key: 'preparing',
    label: '待寄出',
    value: stats.value.preparing,
    hint: '准备中，含抽奖奖品',
    tone: 'warning',
    icon: Clock3,
  },
  {
    key: 'shipped',
    label: '运输中',
    value: stats.value.shipped,
    hint: '已寄出，等待送达',
    tone: 'info',
    icon: Truck,
  },
  {
    key: 'completed',
    label: '已送达',
    value: stats.value.completed,
    hint: '本轮履约完成',
    tone: 'success',
    icon: CheckCircle2,
  },
]);

const activeSummaryKey = computed(() => {
  if (onlyNeedsShipping.value) return 'needsShipping';
  if (status.value === 'all' && origin.value === 'all' && !keyword.value.trim()) return 'all';
  if (origin.value === 'all' && !keyword.value.trim() && status.value !== 'all')
    return status.value;
  return '';
});

const hasActiveFilters = computed(
  () =>
    status.value !== 'all' ||
    origin.value !== 'all' ||
    Boolean(keyword.value.trim()) ||
    onlyNeedsShipping.value,
);

const showNotice = (text, tone = 'success') => {
  notice.value = { text, tone };
  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = { text: '', tone: 'success' };
  }, 4200);
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await fetchFulfillmentQueue({ limit: 200 });
    items.value = buildFulfillmentQueue(result);
    lastLoadedAt.value = new Date();
    if (result.error) {
      const hasPartialData = items.value.length > 0;
      loadError.value = hasPartialData ? '' : '请检查网络或管理员权限后再试。';
      if (hasPartialData) showNotice('部分记录读取失败，先展示已取到的数据', 'warning');
    }
  } catch {
    loadError.value = '请检查网络或管理员权限后再试。';
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  keyword.value = '';
  status.value = 'all';
  origin.value = 'all';
  onlyNeedsShipping.value = false;
};

const selectSummary = (card) => {
  resetFilters();
  if (card.key === 'needsShipping') {
    onlyNeedsShipping.value = true;
    return;
  }
  if (card.key !== 'all') status.value = card.key;
};

const setStatus = (value) => {
  onlyNeedsShipping.value = false;
  status.value = value;
};

const setOrigin = (value) => {
  origin.value = value;
};

const statusCount = (value) => {
  if (value === 'all') return stats.value.total;
  return stats.value[value] || 0;
};

const statusTone = (value) => STATUS_TONE[value] || 'muted';

const originLabel = (value) => FULFILLMENT_ORIGIN_META[value]?.label || value;

const originDetail = (item) => {
  if (item.origin === 'lottery') return '抽奖奖品（开奖自动建单）';
  if (item.origin === 'gift') return item.isActive === false ? '赠礼 · 历史归档' : '赠礼';
  return '商城礼物';
};

const imageUrl = (item) => resolveDbCardImage(item.image);

const hasImage = (item) => Boolean(imageUrl(item)) && !failedImages.value.has(item.key);

const markImageFailed = (key) => {
  failedImages.value = new Set([...failedImages.value, key]);
};

const hasShippingInfo = (item) => Boolean(item.shipping.recipient && item.shipping.address);

const addressLine = (item) =>
  [item.shipping.recipient, item.shipping.phone, item.shipping.address].filter(Boolean).join(' · ');

const isExpanded = (item) => expandedKeys.value.has(item.key);

/* 邮件状态按需查询：只在展开详情时拉一次，缓存进 Map，
   避免每张卡一进列表就打一次 RPC。 */
const mailStates = ref(new Map());

const mailState = (item) =>
  mailStates.value.get(item.key) || { loading: false, ok: true, text: '' };

const loadMailStatus = async (item) => {
  if (item.recordKind !== 'order') return;
  if (mailStates.value.has(item.key)) return;

  const next = new Map(mailStates.value);
  next.set(item.key, { loading: true, ok: true, text: '' });
  mailStates.value = next;

  const result = await fetchShopOrderMailStatus(item.id);

  const apply = new Map(mailStates.value);
  if (!result.ok) {
    apply.set(item.key, { loading: false, ok: false, text: result.message });
  } else if (!result.hasRecord) {
    apply.set(item.key, { loading: false, ok: true, status: '', text: result.statusText });
  } else {
    apply.set(item.key, {
      loading: false,
      ok: true,
      status: result.status,
      text: result.statusText,
      detail: [result.lastError, result.attempts > 0 ? `第 ${result.attempts} 次尝试` : '']
        .filter(Boolean)
        .join('，'),
    });
  }
  mailStates.value = apply;
};

/* 状态一变，之前查到的邮件结论就过期了（那一行对应的是旧状态的邮件）。
   清掉缓存，等下次展开时重新查，避免详情里挂着上一档的「已发出」。 */
const invalidateMailStatus = (item) => {
  if (!mailStates.value.has(item.key)) return;
  const next = new Map(mailStates.value);
  next.delete(item.key);
  mailStates.value = next;
};

const toggleExpanded = (item) => {
  const next = new Set(expandedKeys.value);
  if (next.has(item.key)) next.delete(item.key);
  else {
    next.add(item.key);
    loadMailStatus(item);
  }
  expandedKeys.value = next;
};

const isStepDone = (current, index) => {
  const rank = { preparing: 1, shipped: 2, completed: 3 };
  return (rank[current] || 0) >= index + 1;
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const formatClock = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const copyShipping = async (item) => {
  /* 2026-11-21：复制完整信息（收货人 / 电话 / 地址三行），
     而不是单行拼接 —— 粘到寄件表单里不用再拆开重排。 */
  const text = buildShippingCopyText(item.shipping);
  if (!text) {
    showNotice('这单没有可复制的收件信息', 'warning');
    return;
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    showNotice('收货人、电话、地址已复制');
  } catch {
    showNotice('复制失败，请手动选择收件信息', 'error');
  }
};

/* 进度推进后的提示口径（2026-11-21）。
   「已入队」是前端确知的事实；「已发出」只能由 mail_outbox 账本回答，
   所以这里不猜投递时间，而是指向详情里那条真实状态。 */
const notifyCopy = (status) => {
  if (status === 'shipped') return '已标记寄出，进度通知已入队（展开详情可看投递结果）';
  if (status === 'completed') return '已标记送达，进度通知已入队（展开详情可看投递结果）';
  return '进度已更新，通知已入队';
};

const advance = async (item) => {
  if (!item.nextStatus || busyKey.value) return;
  const target = item.nextStatus;
  busyKey.value = item.key;
  try {
    const result =
      item.recordKind === 'order'
        ? await advanceShopOrderStatus(item.id, target)
        : await advanceUserGiftStatus(item.id, target);

    if (!result.ok) {
      showNotice(result.message || '推进失败，请稍后再试', 'error');
      return;
    }

    item.status = result.status || target;
    item.statusLabel = fulfillmentStatusLabel(item.status);
    item.nextStatus = nextFulfillmentStatus(item.status);
    item.nextActionLabel = nextFulfillmentAction(item.status);
    item.needsShipping =
      item.status === 'preparing' && (!item.shipping.recipient || !item.shipping.address);
    if (item.status === 'completed') item.completedAt = new Date().toISOString();

    invalidateMailStatus(item);
    showNotice(notifyCopy(item.status));
  } catch {
    showNotice('推进失败，请稍后再试', 'error');
  } finally {
    busyKey.value = '';
  }
};

const cancel = async (item) => {
  if (!canCancelFulfillment(item) || busyKey.value) return;

  /* shipped 单取消不退积分，必须让操作者先看到这句话再决定 —— 这是唯一
     会造成「取消成功了但余额没变」的路径，不能只靠事后补充说明。 */
  let confirmed = false;
  try {
    confirmed = await confirm({
      title: item.status === 'shipped' ? '取消这张已寄出的单？' : '取消这张单？',
      message:
        item.status === 'shipped'
          ? `单号 ${item.code || '未知'} 已寄出。取消后订单作废，但不会自动退回积分（${item.points || 0} 分），需要你另行处理售后与账务。`
          : `单号 ${item.code || '未知'} 会作废，并退回本单消耗的 ${item.points || 0} 积分。此操作不可撤销。`,
      tone: 'danger',
      confirmText: '确定取消',
      cancelText: '再想想',
    });
  } catch (error) {
    if (!isDialogBusy(error)) showNotice('确认框打开失败，请刷新后重试', 'error');
    return;
  }
  if (!confirmed) return;

  busyKey.value = item.key;
  try {
    const result = await adminCancelShopOrder(item.id, 'admin_cancel_from_workbench');
    if (!result.ok) {
      showNotice(result.message || '取消失败，请稍后再试', 'error');
      return;
    }

    if (result.alreadyCancelled) {
      showNotice('这单此前已经取消过了', 'warning');
    } else {
      const refund = result.refundedPoints > 0 ? `，已退回 ${result.refundedPoints} 积分` : '';
      const mail = result.mailQueued ? '，取消通知已排队' : '，本次未产生通知';
      showNotice(`订单已取消${refund}${mail}`, 'success');
    }

    item.status = 'cancelled';
    item.statusLabel = fulfillmentStatusLabel('cancelled');
    item.nextStatus = nextFulfillmentStatus('cancelled');
    item.nextActionLabel = nextFulfillmentAction('cancelled');
    item.needsShipping = false;
    if (Number.isFinite(result.refundedPoints)) item.points = 0;
    invalidateMailStatus(item);
  } catch {
    showNotice('取消失败，请稍后再试', 'error');
  } finally {
    busyKey.value = '';
  }
};

onMounted(load);
onBeforeUnmount(() => {
  if (noticeTimer) window.clearTimeout(noticeTimer);
});
</script>

<style scoped>
.fl-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--foreground);
}

.fl-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background:
    radial-gradient(
      circle at 100% 0%,
      color-mix(in srgb, var(--boh-brand-blue, var(--primary)) 14%, transparent),
      transparent 46%
    ),
    color-mix(in srgb, var(--card) 94%, transparent);
}

.fl-hero-copy {
  max-width: 700px;
}

.fl-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--boh-brand-blue, var(--primary));
}

.fl-hero h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.fl-hero p {
  margin: 7px 0 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.fl-hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.fl-updated {
  color: var(--muted-foreground);
  font-size: 11px;
  white-space: nowrap;
}

.fl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--foreground);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

.fl-btn:hover {
  border-color: color-mix(in srgb, var(--foreground) 24%, var(--border));
}

.fl-btn:active {
  transform: scale(0.97);
}

.fl-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.fl-btn.primary {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

.fl-btn.ghost {
  background: color-mix(in srgb, var(--muted) 58%, transparent);
}

/* 后台取消：破坏性动作，用于区分「推进」与「作废」两种意图，
   平时是低饱和描边，指针落上去才显红，避免在密集列表里一直抢眼。 */
.fl-btn.danger-ghost {
  border-color: color-mix(in srgb, var(--destructive) 26%, var(--border));
  background: transparent;
  color: var(--destructive);
}

.fl-btn.danger-ghost:hover {
  border-color: color-mix(in srgb, var(--destructive) 52%, var(--border));
  background: color-mix(in srgb, var(--destructive) 8%, transparent);
}

.fl-notice {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
  background: var(--muted);
  color: var(--muted-foreground);
}

.fl-notice.is-error {
  border-color: color-mix(in srgb, var(--destructive) 34%, var(--border));
  color: var(--destructive);
}

.fl-notice.is-warning {
  border-color: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 34%, var(--border));
  color: var(--boh-warning, var(--chart-3));
}

.fl-notice.is-success {
  border-color: color-mix(in srgb, var(--boh-brand-green, var(--chart-3)) 30%, var(--border));
  color: var(--boh-brand-green, var(--chart-3));
}

.fl-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.fl-stat {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'icon value'
    'icon label'
    'hint hint';
  align-items: center;
  gap: 0 9px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card);
  text-align: left;
  font: inherit;
  color: var(--foreground);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.fl-stat:hover {
  border-color: color-mix(in srgb, var(--foreground) 20%, var(--border));
  transform: translateY(-1px);
}

.fl-stat.is-active {
  border-color: color-mix(in srgb, var(--boh-brand-blue, var(--primary)) 48%, var(--border));
  background: color-mix(in srgb, var(--boh-brand-blue, var(--primary)) 7%, var(--card));
}

.fl-stat-icon {
  grid-area: icon;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--muted);
  color: var(--muted-foreground);
}

.fl-stat.tone-warning .fl-stat-icon {
  background: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 16%, var(--card));
  color: var(--boh-warning, var(--chart-3));
}

.fl-stat.tone-info .fl-stat-icon {
  background: color-mix(in srgb, var(--boh-brand-blue, var(--primary)) 14%, var(--card));
  color: var(--boh-brand-blue, var(--primary));
}

.fl-stat.tone-danger .fl-stat-icon {
  background: color-mix(in srgb, var(--destructive) 14%, var(--card));
  color: var(--destructive);
}

.fl-stat.tone-success .fl-stat-icon {
  background: color-mix(in srgb, var(--boh-brand-green, var(--chart-3)) 15%, var(--card));
  color: var(--boh-brand-green, var(--chart-3));
}

.fl-stat-value {
  grid-area: value;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
}

.fl-stat-label {
  grid-area: label;
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
}

.fl-stat-hint {
  grid-area: hint;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 10.5px;
  line-height: 1.4;
}

.fl-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card);
}

.fl-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  min-height: 38px;
  border: 1px solid var(--input);
  border-radius: 10px;
  background: var(--background);
  color: var(--muted-foreground);
}

.fl-search:focus-within {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 18%, transparent);
}

.fl-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 13px;
}

.fl-search-clear {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.fl-filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.fl-filter-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.fl-filter-label,
.fl-sort span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 600;
}

.fl-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.fl-chip:hover {
  color: var(--foreground);
  border-color: color-mix(in srgb, var(--foreground) 22%, var(--border));
}

.fl-chip.is-active {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

.fl-chip em {
  font-style: normal;
  font-size: 10px;
  opacity: 0.72;
}

.fl-sort {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.fl-sort select {
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--foreground);
  font: inherit;
  font-size: 11.5px;
}

.fl-result-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 20px;
}

.fl-result-bar p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 11.5px;
}

.fl-result-bar strong {
  color: var(--foreground);
}

.fl-result-warning {
  color: var(--boh-warning, var(--chart-3));
}

.fl-reset {
  border: 0;
  background: transparent;
  color: var(--boh-brand-blue, var(--primary));
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.fl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 12px;
  align-items: start;
}

.fl-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 5%, transparent);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.fl-card:hover {
  border-color: color-mix(in srgb, var(--foreground) 18%, var(--border));
  box-shadow: 0 6px 20px color-mix(in srgb, var(--foreground) 7%, transparent);
}

.fl-card.is-needs-shipping {
  border-color: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 36%, var(--border));
}

.fl-card.is-cancelled {
  background: color-mix(in srgb, var(--muted) 44%, var(--card));
  opacity: 0.82;
}

.fl-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fl-origin,
.fl-status {
  display: inline-flex;
  align-items: center;
  min-height: 21px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.fl-origin {
  background: var(--muted);
  color: var(--muted-foreground);
}

.fl-origin.is-shop {
  background: color-mix(in srgb, var(--boh-brand-blue, var(--primary)) 12%, transparent);
  color: var(--boh-brand-blue, var(--primary));
}

.fl-origin.is-lottery {
  background: color-mix(in srgb, var(--boh-brand-green, var(--chart-3)) 14%, transparent);
  color: var(--boh-brand-green, var(--chart-3));
}

.fl-origin.is-gift {
  background: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 15%, transparent);
  color: var(--boh-warning, var(--chart-3));
}

.fl-status.tone-warning {
  color: var(--boh-warning, var(--chart-3));
  background: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 14%, transparent);
}

.fl-status.tone-info {
  color: var(--boh-brand-blue, var(--primary));
  background: color-mix(in srgb, var(--boh-brand-blue, var(--primary)) 12%, transparent);
}

.fl-status.tone-success {
  color: var(--boh-brand-green, var(--chart-3));
  background: color-mix(in srgb, var(--boh-brand-green, var(--chart-3)) 13%, transparent);
}

.fl-status.tone-muted {
  color: var(--muted-foreground);
  background: var(--muted);
}

.fl-card-main {
  display: flex;
  align-items: center;
  gap: 11px;
}

.fl-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--muted);
  color: var(--muted-foreground);
}

.fl-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fl-card-copy {
  min-width: 0;
}

.fl-card-copy h3 {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-code {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-user {
  color: var(--foreground);
  font-weight: 600;
}

.fl-dot {
  opacity: 0.6;
}

.fl-price {
  margin: 4px 0 0;
  color: var(--foreground);
  font-size: 11.5px;
  font-weight: 600;
}

.fl-progress {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 9px 0 0;
  border-top: 1px solid var(--border);
}

.fl-step {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--muted-foreground);
  font-size: 10px;
}

.fl-step i {
  position: relative;
  display: block;
  width: 100%;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--muted);
}

.fl-step.is-done i {
  background: var(--primary);
}

.fl-step.is-done {
  color: var(--foreground);
}

.fl-progress.is-shipped .fl-step:nth-child(2) i {
  background: var(--boh-brand-blue, var(--primary));
}

.fl-progress.is-completed .fl-step:nth-child(2) i,
.fl-progress.is-completed .fl-step:nth-child(3) i {
  background: var(--boh-brand-green, var(--chart-3));
}

.fl-step b {
  font-weight: 600;
}

.fl-cancelled-line {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 11px;
}

.fl-address {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 9px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--muted) 54%, transparent);
  color: var(--muted-foreground);
  font-size: 11px;
  line-height: 1.5;
}

.fl-address > svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.fl-address-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.fl-address.is-missing {
  background: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 10%, transparent);
  color: var(--boh-warning, var(--chart-3));
  font-weight: 600;
}

.fl-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 22px;
  height: 24px;
  padding: 0 7px;
  margin-left: auto;
  flex-shrink: 0;
  border: 0;
  border-radius: 6px;
  background: var(--card);
  color: var(--muted-foreground);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.fl-copy:hover {
  color: var(--foreground);
}

/* 复制按钮的字在窄屏才出现：桌面列表密集时可以只留图标，
   手机上一个 22px 的纯图标按钮很难点准。 */
.fl-copy-text {
  display: none;
}

.fl-remark {
  margin: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

/* 推进与取消并排；两者都是主操作层级，允许换行但不与「详情」挤在一起 */
.fl-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.fl-card-foot .fl-btn {
  min-height: 31px;
  font-size: 11.5px;
}

.fl-done {
  color: var(--muted-foreground);
  font-size: 11.5px;
  font-weight: 600;
}

.fl-detail-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.fl-detail-toggle:hover {
  color: var(--foreground);
}

.fl-detail-toggle svg {
  transition: transform 0.16s ease;
}

.fl-detail-toggle svg.is-open {
  transform: rotate(180deg);
}

.fl-expanded {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.fl-expanded-label {
  margin: 0 0 5px;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.fl-item-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fl-item-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
}

.fl-item-qty {
  color: var(--muted-foreground);
}

.fl-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
}

.fl-facts div {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.fl-facts dt {
  color: var(--muted-foreground);
  font-size: 10px;
}

.fl-facts dd {
  margin: 0;
  font-size: 11px;
}

.fl-expanded-hint {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--boh-brand-green, var(--chart-3)) 9%, transparent);
  color: var(--muted-foreground);
  font-size: 10.5px;
  line-height: 1.55;
}

/* ── 进度邮件状态 ───────────────────────────────────────────────────── */
.fl-mail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fl-mail .fl-expanded-label {
  margin-bottom: 0;
}

.fl-mail-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 50%, transparent);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.5;
}

/* 四种结局用色区分：绿灯=真发出去了，灰=还没发，红=不会发了 */
.fl-mail-line.is-sent {
  background: color-mix(in srgb, var(--boh-brand-green, var(--chart-3)) 12%, transparent);
  color: var(--boh-brand-green, var(--chart-3));
}

.fl-mail-line.is-pending {
  background: color-mix(in srgb, var(--boh-warning, var(--chart-3)) 12%, transparent);
  color: var(--boh-warning, var(--chart-3));
}

.fl-mail-line.is-skipped,
.fl-mail-line.is-failed {
  background: color-mix(in srgb, var(--destructive) 10%, transparent);
  color: var(--destructive);
}

.fl-mail-line.is-muted {
  color: var(--muted-foreground);
  font-weight: 500;
}

.fl-mail-detail {
  font-weight: 500;
  color: var(--muted-foreground);
}

.fl-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 260px;
  padding: 24px;
  border: 1px dashed var(--border);
  border-radius: 16px;
  color: var(--muted-foreground);
  text-align: center;
}

.fl-state strong {
  color: var(--foreground);
  font-size: 14px;
}

.fl-state p {
  max-width: 440px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.fl-state.is-error {
  border-color: color-mix(in srgb, var(--destructive) 30%, var(--border));
}

.fl-state.is-error strong {
  color: var(--destructive);
}

.fl-card.is-skeleton {
  gap: 10px;
  min-height: 220px;
  opacity: 0.7;
}

.fl-skeleton-line,
.fl-skeleton-block {
  display: block;
  border-radius: 6px;
  background: var(--muted);
  animation: fl-skeleton 1.25s ease-in-out infinite;
}

.fl-skeleton-line {
  width: 80%;
  height: 12px;
}

.fl-skeleton-line.short {
  width: 34%;
  height: 10px;
}

.fl-skeleton-line.title {
  width: 62%;
  height: 18px;
}

.fl-skeleton-block {
  width: 100%;
  height: 76px;
  margin-top: 6px;
}

.fl-spin {
  animation: fl-spin 0.9s linear infinite;
}

@keyframes fl-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fl-skeleton {
  50% {
    opacity: 0.45;
  }
}

@media (max-width: 1080px) {
  .fl-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* ── 平板 / 窄桌面 ──────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .fl-hero {
    flex-direction: column;
    padding: 16px;
    gap: 12px;
  }

  .fl-hero h2 {
    font-size: 21px;
  }

  .fl-hero-actions {
    width: 100%;
    justify-content: space-between;
  }

  .fl-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .fl-stat:last-child {
    grid-column: 1 / -1;
  }

  .fl-filter-row {
    align-items: flex-start;
  }

  .fl-sort {
    width: 100%;
    margin-left: 0;
  }

  .fl-grid {
    grid-template-columns: 1fr;
  }
}

/* ── 手机竖屏：单手可操作是第一优先级（2026-11-21）─────────────────────
   目标顺序：① 一屏内能看到「哪些单要处理」；② 主操作（寄出/取消/复制）
   落在拇指区且 ≥44px；③ 次要信息（来源、进度、时间）不挤压操作区。 */
@media (max-width: 560px) {
  .fl-page {
    gap: 10px;
  }

  .fl-hero {
    padding: 14px;
    border-radius: 14px;
  }

  /* 竖屏首屏的金贵尺寸：eyebrow 和解释段都是「读一次就够」的内容，
     它们每省一行，队列就早一行出现。
     ⚠️ 必须写 `.fl-hero p.fl-eyebrow` 而不是 `.fl-eyebrow`：
     下面 `.fl-hero p` 会设 display:-webkit-box（多行截断），
     单靠类名压不住它，eyebrow 会照样显示出来（2026-11-21 实测踩过）。 */
  .fl-hero p.fl-eyebrow {
    display: none;
  }

  .fl-hero p {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* 概览卡改成横向可滑动的一条：竖屏下 5 张卡竖着排会把队列推到屏外，
     横滑能一眼扫完「待寄出 / 运输中 / 待补信息」三个关键数。 */
  .fl-summary {
    display: flex;
    gap: 8px;
    margin-inline: -14px;
    padding: 2px 14px 4px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .fl-summary::-webkit-scrollbar {
    display: none;
  }

  .fl-stat {
    flex: 0 0 auto;
    width: 116px;
    min-height: 84px;
    padding: 11px;
    border-radius: 12px;
    scroll-snap-align: start;
  }

  .fl-stat:last-child {
    grid-column: auto;
  }

  .fl-stat-value {
    font-size: 20px;
  }

  /* 说明文案在手机上删掉：它只解释卡片含义，已经知道的人不需要它，
     而它每张卡要占掉两行。 */
  .fl-stat-hint {
    display: none;
  }

  .fl-toolbar {
    padding: 11px;
    border-radius: 12px;
    gap: 8px;
  }

  /* iOS 输入框 <16px 会触发自动放大，搜索框必须锁住这一点 */
  .fl-search {
    min-height: 44px;
  }

  .fl-search input {
    font-size: 16px;
  }

  /* 筛选 chip 横滑，避免两排 chip 把列表压到首屏之外 */
  .fl-filter-group {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .fl-filter-group::-webkit-scrollbar {
    display: none;
  }

  .fl-filter-label {
    position: sticky;
    left: 0;
    z-index: 1;
    padding-right: 6px;
    background: var(--card);
    flex-shrink: 0;
  }

  .fl-chip {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 0 12px;
  }

  .fl-card {
    padding: 12px;
    gap: 9px;
    border-radius: 12px;
  }

  .fl-card-main {
    gap: 10px;
  }

  .fl-card-copy h3 {
    font-size: 14px;
  }

  /* 复制按钮在竖屏必须带字：纯图标 22px 的命中区太小，且含义不直观 */
  .fl-copy {
    height: 32px;
    min-width: 56px;
    padding: 0 10px;
    border: 1px solid var(--border);
  }

  .fl-copy-text {
    display: inline;
  }

  /* 操作区固定在卡片底部并与「详情」分层：
     主按钮吃满剩余宽度，取消按钮保留独立点击区，两者都 ≥44px。 */
  .fl-card-foot {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding-top: 4px;
  }

  .fl-card-actions {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 8px;
  }

  .fl-card-foot .fl-btn {
    min-height: 44px;
    justify-content: center;
    font-size: 13px;
  }

  /* 没有推进按钮时只剩一行状态文案，让它自己占满整行 */
  .fl-card-actions > .fl-done {
    min-height: 40px;
    display: flex;
    align-items: center;
  }

  .fl-detail-toggle {
    justify-content: center;
    min-height: 44px;
    margin-left: 0;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .fl-result-bar {
    flex-wrap: wrap;
    gap: 6px;
  }
}

/* ── 小屏 + 横屏（大号手机横放）：压缩纵向留白，保持一屏多看一行 ───── */
@media (max-width: 900px) and (orientation: landscape) and (max-height: 500px) {
  .fl-page {
    gap: 8px;
  }

  .fl-hero {
    padding: 12px 14px;
  }

  .fl-hero p {
    display: none;
  }

  .fl-summary {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .fl-stat-hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fl-spin,
  .fl-skeleton-line,
  .fl-skeleton-block {
    animation: none;
  }
}
</style>

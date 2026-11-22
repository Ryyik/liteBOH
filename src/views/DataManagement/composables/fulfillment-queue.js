/**
 * 数据管理面板 · 「订单与礼物」履约队列（2026-11-21）
 *
 * 为什么单独一层：商城订单（shop_points_orders）、抽奖自动单（同表 source=lottery）
 * 与赠礼（user_gifts）是三条来源、同一件事——「把一件实物寄出去，并跟到送达」。
 * 组件只负责渲染，合并/筛选/排序/计数全放在这里，便于单测锁行为。
 *
 * 单一真源：状态文案一律来自 shop-orders-api 的 shopStatusLabel，
 * 不在本文件另写一份中文词表。
 */

import { shopStatusLabel } from '@/utils/api/shop-orders-api.js';

export const FULFILLMENT_STATUS_META = {
  preparing: { label: '准备中', tone: 'warning' },
  shipped: { label: '已寄出', tone: 'info' },
  completed: { label: '已送达', tone: 'success' },
  cancelled: { label: '已取消', tone: 'muted' },
};

export const FULFILLMENT_ORIGIN_META = {
  shop: { label: '商城', tone: 'shop' },
  lottery: { label: '抽奖', tone: 'lottery' },
  gift: { label: '赠礼', tone: 'gift' },
};

export const FULFILLMENT_STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'preparing', label: '准备中' },
  { value: 'shipped', label: '已寄出' },
  { value: 'completed', label: '已送达' },
  { value: 'cancelled', label: '已取消' },
];

export const FULFILLMENT_ORIGIN_FILTERS = [
  { value: 'all', label: '全部来源' },
  { value: 'shop', label: '商城' },
  { value: 'lottery', label: '抽奖' },
  { value: 'gift', label: '赠礼' },
];

export const fulfillmentStatusLabel = (status) => shopStatusLabel(status);

export const nextFulfillmentStatus = (status) => {
  if (status === 'preparing') return 'shipped';
  if (status === 'shipped') return 'completed';
  return '';
};

export const nextFulfillmentAction = (status) => {
  if (status === 'preparing') return '标记已寄出';
  if (status === 'shipped') return '标记已送达';
  return '';
};

/* ── 后台取消（2026-11-21）─────────────────────────────────────────────
 *
 * 与数据库 `admin_cancel_shop_order` 的判据保持同一套，前端只做「按钮是否出现」，
 * 真正的拒绝仍在服务端：两边判据不一致会出现「按钮可点但必失败」的空点击。
 *
 *   preparing → 可取消，退积分并写流水
 *   shipped   → 可取消，但不自动退积分（货在路上，账要人工核）
 *   completed → 终态，不可取消
 *   cancelled → 不可再取消
 *
 * 赠礼（user_gifts）暂时不提供后台取消：没有对应的服务端函数，
 * 在前端硬改成 cancelled 会绕过赠礼的履约与通知链路。
 */
export const FULFILLMENT_CANCELABLE_STATUSES = ['preparing', 'shipped'];

export const canCancelFulfillment = (item) =>
  item?.recordKind === 'order' && FULFILLMENT_CANCELABLE_STATUSES.includes(item?.status);

/**
 * 取消按钮下的说明文案。写清楚「这次取消会不会退积分」，
 * 否则管理员点完才发现 shipped 单不退，会以为是漏了。
 */
export const cancelHint = (item) => {
  if (!canCancelFulfillment(item)) return '';
  if (item.status === 'shipped') return '已寄出的单可取消，但不会自动退积分，需人工核对售后';
  return '取消后会退回本单消耗的积分，并把订单作废';
};

const firstItem = (order) => (Array.isArray(order?.items) ? order.items[0] : null);

/**
 * 一键复制用的完整收货文本（2026-11-21）。
 *
 * 之前复制的是「收件人 · 电话 · 地址」单行拼接，粘到快递页面还要手工拆开重排。
 * 这里改成带字段名的多行：贴进任何下单/寄件表单都能一眼对上，
 * 也方便管理员核对「到底缺哪一项」。
 */
export const buildShippingCopyText = (shipping) => {
  const recipient = String(shipping?.recipient || '').trim();
  const phone = String(shipping?.phone || '').trim();
  const address = String(shipping?.address || '').trim();
  if (!recipient && !phone && !address) return '';
  return [
    recipient ? `收货人：${recipient}` : '',
    phone ? `电话：${phone}` : '',
    address ? `地址：${address}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

const makeItem = ({
  key,
  recordKind,
  raw,
  origin,
  title,
  subtitle,
  code,
  username,
  status,
  createdAt,
  completedAt,
  priceText,
  items,
  shipping,
  remark,
  image,
  points,
  isActive,
}) => {
  const nextStatus = nextFulfillmentStatus(status);
  const recipient = String(shipping?.recipient || '').trim();
  const address = String(shipping?.address || '').trim();
  return {
    key,
    recordKind,
    id: String(raw?.id || ''),
    origin,
    title: String(title || '未命名'),
    subtitle: String(subtitle || ''),
    code: String(code || ''),
    username: String(username || ''),
    status: String(status || 'preparing'),
    statusLabel: fulfillmentStatusLabel(status),
    createdAt: createdAt || null,
    completedAt: completedAt || null,
    priceText: String(priceText || ''),
    items: Array.isArray(items) ? items : [],
    shipping: {
      recipient,
      phone: String(shipping?.phone || '').trim(),
      address,
    },
    remark: String(remark || ''),
    image: String(image || ''),
    points: Math.max(0, Number(points) || 0),
    isActive: isActive !== false,
    nextStatus,
    nextActionLabel: nextFulfillmentAction(status),
    needsShipping: status === 'preparing' && (!recipient || !address),
    searchText: [
      title,
      subtitle,
      code,
      username,
      recipient,
      shipping?.phone,
      address,
      ...(Array.isArray(items) ? items.map((item) => item?.title) : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
};

export const orderToFulfillmentItem = (order) => {
  const item = firstItem(order);
  const origin = order?.source === 'lottery' ? 'lottery' : 'shop';
  return makeItem({
    key: `order:${order?.id || order?.orderNo || ''}`,
    recordKind: 'order',
    raw: order,
    origin,
    title: order?.title || item?.title || '方块礼物',
    subtitle: order?.subtitle || item?.specLabel || '',
    code: order?.orderNo || '',
    username: order?.buyerName || order?.username || '',
    status: order?.status,
    createdAt: order?.createdAt,
    completedAt: order?.completedAt,
    priceText: order?.priceText || '',
    items: order?.items,
    shipping: order?.shipping,
    remark: order?.remark,
    image: item?.image || '',
    points: order?.points,
    isActive: true,
  });
};

export const giftToFulfillmentItem = (gift) => {
  const item = firstItem(gift);
  return makeItem({
    key: `gift:${gift?.id || gift?.orderNo || ''}`,
    recordKind: 'gift',
    raw: gift,
    origin: 'gift',
    title: gift?.title || item?.title || '礼物',
    subtitle: gift?.subtitle || '',
    code: gift?.orderNo || '',
    username: gift?.username || '',
    status: gift?.status,
    createdAt: gift?.createdAt,
    completedAt: gift?.completedAt,
    priceText: gift?.priceText || '',
    items: gift?.items,
    shipping: gift?.shipping,
    remark: gift?.remark,
    image: item?.image || '',
    points: gift?.points,
    isActive: gift?.isActive !== false,
  });
};

export function buildFulfillmentQueue({ orders = [], gifts = [] } = {}) {
  return [
    ...(Array.isArray(orders) ? orders : []).map(orderToFulfillmentItem),
    ...(Array.isArray(gifts) ? gifts : []).map(giftToFulfillmentItem),
  ];
}

const STATUS_PRIORITY = {
  preparing: 1,
  shipped: 2,
  completed: 3,
  cancelled: 4,
};

const timeValue = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

/**
 * 默认按「该处理的先出现」：缺收件信息 > 准备中 > 已寄出 > 已送达 > 已取消，
 * 同档内新单在前。`latest` 只按创建时间倒序，用于查最近一单。
 */
export function sortFulfillmentQueue(items, mode = 'priority') {
  const list = Array.isArray(items) ? [...items] : [];
  if (mode === 'latest') {
    return list.sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
  }
  const rankOf = (item) =>
    item.needsShipping ? 0 : STATUS_PRIORITY[item.status] || STATUS_PRIORITY.cancelled + 1;
  return list.sort((a, b) => {
    const aRank = rankOf(a);
    const bRank = rankOf(b);
    if (aRank !== bRank) return aRank - bRank;
    return timeValue(b.createdAt) - timeValue(a.createdAt);
  });
}

export function filterFulfillmentQueue(
  items,
  { status = 'all', origin = 'all', keyword = '', needsShippingOnly = false } = {},
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (status !== 'all' && item.status !== status) return false;
    if (origin !== 'all' && item.origin !== origin) return false;
    if (needsShippingOnly && !item.needsShipping) return false;
    if (query && !item.searchText.includes(query)) return false;
    return true;
  });
}

export function summarizeFulfillmentQueue(items) {
  const list = Array.isArray(items) ? items : [];
  const countByStatus = (status) => list.filter((item) => item.status === status).length;
  return {
    total: list.length,
    preparing: countByStatus('preparing'),
    shipped: countByStatus('shipped'),
    completed: countByStatus('completed'),
    cancelled: countByStatus('cancelled'),
    needsShipping: list.filter((item) => item.needsShipping).length,
    lottery: list.filter((item) => item.origin === 'lottery').length,
    gift: list.filter((item) => item.origin === 'gift').length,
  };
}

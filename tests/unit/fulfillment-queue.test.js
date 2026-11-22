/**
 * 数据管理「履约台」合并队列（2026-11-21）
 *
 * 商城订单、抽奖自动单、赠礼三条来源共用一条「准备中 → 已寄出 → 已送达」流程。
 * 这里锁的是组件最容易悄悄写错、而肉眼看不出来的几件事：
 *   ① 抽奖单必须保持 origin=lottery（不能因为落在 shop_points_orders 就显示成商城单）；
 *   ② 没有收件地址的 preparing 单要进「待补信息」桶，否则那一栏永远是 0；
 *   ③ 筛选必须同时认来源 / 状态 / 关键词 / “只看缺地址”；
 *   ④ 默认排序必须把该处理的放前面，而不是简单按时间倒序。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import {
  buildFulfillmentQueue,
  buildShippingCopyText,
  canCancelFulfillment,
  cancelHint,
  filterFulfillmentQueue,
  nextFulfillmentAction,
  nextFulfillmentStatus,
  sortFulfillmentQueue,
  summarizeFulfillmentQueue,
} from '@/views/DataManagement/composables/fulfillment-queue.js';

const shipping = {
  recipient: '张三',
  phone: '13800000000',
  address: '广东省深圳市南山区',
};

const shopOrder = (extra = {}) => ({
  id: 'order-1',
  orderNo: 'BOH-1001',
  title: '机械键盘',
  buyerName: 'alice',
  status: 'preparing',
  source: 'shop',
  createdAt: '2026-11-20T10:00:00.000Z',
  priceText: '1200 积分',
  shipping,
  items: [{ title: '机械键盘', quantity: 1, image: '' }],
  points: 1200,
  ...extra,
});

const gift = (extra = {}) => ({
  id: 'gift-1',
  orderNo: 'SF123',
  title: '周年纪念品',
  username: 'bob',
  status: 'shipped',
  source: 'gift',
  createdAt: '2026-11-19T10:00:00.000Z',
  priceText: '赠礼',
  shipping,
  items: [{ title: '周年纪念品', quantity: 1, image: '' }],
  ...extra,
});

describe('履约队列归一化', () => {
  it('抽奖自动单保留 lottery 来源，而不是显示成商城单', () => {
    const [item] = buildFulfillmentQueue({
      orders: [shopOrder({ source: 'lottery', lotteryId: 'lot-a' })],
    });
    expect(item.origin).toBe('lottery');
    expect(item.recordKind).toBe('order');
    expect(item.statusLabel).toBe('准备中');
  });

  it('缺地址的 preparing 单进入待补信息，有地址的不会', () => {
    const queue = buildFulfillmentQueue({
      orders: [
        shopOrder({ id: 'o-ok' }),
        shopOrder({ id: 'o-missing', shipping: { recipient: '', phone: '', address: '' } }),
      ],
    });
    expect(queue.find((item) => item.id === 'o-ok').needsShipping).toBe(false);
    expect(queue.find((item) => item.id === 'o-missing').needsShipping).toBe(true);
  });

  it('状态推进是单向两档，不提供回退', () => {
    expect(nextFulfillmentStatus('preparing')).toBe('shipped');
    expect(nextFulfillmentStatus('shipped')).toBe('completed');
    expect(nextFulfillmentStatus('completed')).toBe('');
    expect(nextFulfillmentStatus('cancelled')).toBe('');
    expect(nextFulfillmentAction('preparing')).toBe('标记已寄出');
    expect(nextFulfillmentAction('shipped')).toBe('标记已送达');
  });
});

describe('履约队列筛选与计数', () => {
  const queue = buildFulfillmentQueue({
    orders: [
      shopOrder({ id: 'o-1', orderNo: 'BOH-1001' }),
      shopOrder({
        id: 'o-2',
        orderNo: 'BOH-LOTTERY-1002',
        source: 'lottery',
        lotteryId: 'lot-a',
        shipping: { recipient: '', phone: '', address: '' },
      }),
      shopOrder({ id: 'o-3', orderNo: 'BOH-1003', status: 'completed', buyerName: 'carol' }),
    ],
    gifts: [gift({ id: 'g-1', orderNo: 'SF-2001' })],
  });

  it('能按来源分开：抽奖单只出现在 lottery 下', () => {
    const lottery = filterFulfillmentQueue(queue, { origin: 'lottery' });
    expect(lottery.map((item) => item.id)).toEqual(['o-2']);
  });

  it('能按状态与“只看缺地址”交集筛选', () => {
    const missing = filterFulfillmentQueue(queue, {
      status: 'preparing',
      needsShippingOnly: true,
    });
    expect(missing.map((item) => item.id)).toEqual(['o-2']);
  });

  it('关键词能命中订单号、用户名与收件人', () => {
    expect(filterFulfillmentQueue(queue, { keyword: 'boh-1001' })).toHaveLength(1);
    expect(filterFulfillmentQueue(queue, { keyword: 'carol' })).toHaveLength(1);
    expect(filterFulfillmentQueue(queue, { keyword: '张三' })).toHaveLength(3);
  });

  it('概览计数与队列一致，缺地址只数 preparing 单', () => {
    const stats = summarizeFulfillmentQueue(queue);
    expect(stats.total).toBe(4);
    expect(stats.preparing).toBe(2);
    expect(stats.shipped).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.needsShipping).toBe(1);
    expect(stats.lottery).toBe(1);
    expect(stats.gift).toBe(1);
  });
});

describe('履约队列默认排序', () => {
  it('缺地址 > 准备中 > 已寄出 > 已送达，同档新单在前', () => {
    const queue = buildFulfillmentQueue({
      orders: [
        shopOrder({ id: 'completed', status: 'completed', createdAt: '2026-11-21T00:00:00Z' }),
        shopOrder({ id: 'preparing-new', createdAt: '2026-11-21T02:00:00Z' }),
        shopOrder({ id: 'preparing-old', createdAt: '2026-11-20T02:00:00Z' }),
        shopOrder({
          id: 'missing',
          shipping: { recipient: '', phone: '', address: '' },
          createdAt: '2026-11-19T02:00:00Z',
        }),
      ],
      gifts: [gift({ id: 'shipped' })],
    });

    expect(sortFulfillmentQueue(queue).map((item) => item.id)).toEqual([
      'missing',
      'preparing-new',
      'preparing-old',
      'shipped',
      'completed',
    ]);
  });

  it('latest 模式只按创建时间倒序', () => {
    const queue = buildFulfillmentQueue({
      orders: [
        shopOrder({ id: 'old', createdAt: '2026-11-19T00:00:00Z' }),
        shopOrder({ id: 'new', createdAt: '2026-11-21T00:00:00Z' }),
      ],
    });
    expect(sortFulfillmentQueue(queue, 'latest').map((item) => item.id)).toEqual(['new', 'old']);
  });
});

describe('后台取消的可用范围（2026-11-21）', () => {
  it('准备中的订单可取消，已寄出的也可取消（但不退积分）', () => {
    const [preparing, shipped] = buildFulfillmentQueue({
      orders: [shopOrder({ id: 'a' }), shopOrder({ id: 'b', status: 'shipped' })],
    });
    expect(canCancelFulfillment(preparing)).toBe(true);
    expect(canCancelFulfillment(shipped)).toBe(true);
  });

  it('已送达 / 已取消是终态，不再给取消入口', () => {
    const [completed, cancelled] = buildFulfillmentQueue({
      orders: [
        shopOrder({ id: 'a', status: 'completed' }),
        shopOrder({ id: 'b', status: 'cancelled' }),
      ],
    });
    expect(canCancelFulfillment(completed)).toBe(false);
    expect(canCancelFulfillment(cancelled)).toBe(false);
    expect(cancelHint(completed)).toBe('');
  });

  it('赠礼没有后台取消：服务端没有对应函数，前端不能硬改状态', () => {
    const [item] = buildFulfillmentQueue({ gifts: [gift({ status: 'preparing' })] });
    expect(item.status).toBe('preparing');
    expect(canCancelFulfillment(item)).toBe(false);
  });

  it('取消说明把「会不会退积分」写清楚，已寄出单不假装退', () => {
    const [preparing, shipped] = buildFulfillmentQueue({
      orders: [shopOrder({ id: 'a' }), shopOrder({ id: 'b', status: 'shipped' })],
    });
    expect(cancelHint(preparing)).toContain('退回');
    expect(cancelHint(shipped)).toContain('不会自动退');
  });
});

describe('一键复制完整收货信息（2026-11-21）', () => {
  it('三项齐全时输出带字段名的三行，便于直接粘进寄件表单', () => {
    expect(buildShippingCopyText(shipping)).toBe(
      ['收货人：张三', '电话：13800000000', '地址：广东省深圳市南山区'].join('\n'),
    );
  });

  it('缺项只输出存在的字段，不补空行也不编造内容', () => {
    expect(buildShippingCopyText({ recipient: '张三', phone: '', address: '某地' })).toBe(
      ['收货人：张三', '地址：某地'].join('\n'),
    );
    expect(buildShippingCopyText({ recipient: '', phone: '', address: '' })).toBe('');
    expect(buildShippingCopyText(null)).toBe('');
  });
});

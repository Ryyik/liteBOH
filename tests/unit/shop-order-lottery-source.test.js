import { describe, expect, it, vi } from 'vitest';

// mock supabase 客户端：本文件只测「真实抽奖单替换虚拟中奖卡」的纯合并规则
vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { preferRealLotteryOrders } from '@/utils/api/shop-orders-api.js';

/**
 * 购物袋「抽奖中奖订单」的合并契约（2026-11-20 迁移 2026112001 起，
 * 中奖会在 shop_points_orders 落一张真订单，source='lottery'）。
 *
 * 真实订单与前端合成的虚拟中奖卡（buildWinningLotteryOrders）会指向同一场活动，
 * 不做替换的话用户会看到同一个奖品两张卡。这里锁四件事：
 *   ① 有真实单（source='lottery' 且 lotteryId 非空）⇒ 同 lotteryId 的虚拟卡丢弃；
 *   ② 没有真实单（历史中奖 / 库还没迁移）⇒ 虚拟卡原样保留；
 *   ③ 真实单缺 lotteryId（老库 fallback 查询拿不到该列）⇒ 不参与替换，
 *      即 source='lottery' 但 lotteryId 为空的行不能把虚拟卡全灭掉；
 *   ④ 虚拟卡缺 lotteryId（老数据）⇒ 永远保留，宁可重复也不丢卡。
 */
describe('preferRealLotteryOrders', () => {
  const shopOrder = (extra = {}) => ({
    kind: 'shop',
    id: 'order-1',
    source: 'shop',
    lotteryId: '',
    ...extra,
  });

  const lotteryCard = (lotteryId, extra = {}) => ({
    kind: 'lottery',
    id: `entry-${lotteryId}`,
    lotteryId,
    ...extra,
  });

  it('① 有真实抽奖单时，同活动的虚拟卡被丢弃', () => {
    const shop = [shopOrder(), shopOrder({ id: 'order-2', source: 'lottery', lotteryId: 'lot-a' })];
    const cards = [lotteryCard('lot-a'), lotteryCard('lot-b')];
    const merged = preferRealLotteryOrders(shop, cards);
    expect(merged.map((item) => item.lotteryId)).toEqual(['lot-b']);
  });

  it('② 没有真实抽奖单时，虚拟卡原样保留', () => {
    const shop = [shopOrder(), shopOrder({ id: 'order-3' })];
    const cards = [lotteryCard('lot-a'), lotteryCard('lot-b')];
    expect(preferRealLotteryOrders(shop, cards)).toEqual(cards);
  });

  it('③ source=lottery 但缺 lotteryId 的真实单不参与替换', () => {
    const shop = [shopOrder({ source: 'lottery', lotteryId: '' })];
    const cards = [lotteryCard('lot-a')];
    expect(preferRealLotteryOrders(shop, cards)).toEqual(cards);
  });

  it('④ 虚拟卡缺 lotteryId 时永远保留（宁可重复不丢卡）', () => {
    const shop = [shopOrder({ source: 'lottery', lotteryId: 'lot-a' })];
    const cards = [lotteryCard(''), { kind: 'lottery', id: 'entry-x' }];
    expect(preferRealLotteryOrders(shop, cards)).toEqual(cards);
  });
});

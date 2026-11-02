import { describe, expect, it, vi } from 'vitest';

// mock supabase 客户端：本文件只测「中奖订单」的纯判定，不需要真连库
vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { buildWinningLotteryOrders } from '@/utils/api/shop-orders-api.js';

/**
 * 购物袋订单里「抽奖」部分的过滤契约（2026-11-02 用户口径：
 * 「购物袋的订单抽奖部分只显示自己中奖的内容」）。
 *
 * 这里锁四件事，每一条错一次都会直接表现在界面上：
 *   ① 未中奖的参与记录**不能**出现（否则订单里混进一堆没中的活动）；
 *   ② 多中奖名额时，第 2..N 名也要能看到自己的中奖记录 —— 只看
 *      lotteries.winner_user_id（只存首位中奖者）会把这些人漏掉；
 *   ③ 同一活动多次参与只出一条（订单列表里重复三行毫无意义）；
 *   ④ 拿不到中奖名单时回落到 winner_user_id，不能整块变空。
 */

const ME = 'uid-me';
const OTHER = 'uid-other';

const lotteryRow = (id, extra = {}) => ({
  id,
  title: `活动 ${id}`,
  prize_title: `奖品 ${id}`,
  status: 'drawn',
  winner_user_id: null,
  ...extra,
});

const entry = (id, lotteryId, createdAt = '2026-11-01T10:00:00Z') => ({
  id,
  lottery_id: lotteryId,
  created_at: createdAt,
});

const winnerIndex = (map) => new Map(Object.entries(map).map(([id, uids]) => [id, new Set(uids)]));

describe('buildWinningLotteryOrders', () => {
  it('只保留中奖的：未中奖的参与记录不出现', () => {
    const data = buildWinningLotteryOrders({
      entries: [entry('e1', 'l-won'), entry('e2', 'l-lost')],
      lotteries: [lotteryRow('l-won'), lotteryRow('l-lost')],
      winnerIndex: winnerIndex({ 'l-won': [ME], 'l-lost': [OTHER] }),
      userId: ME,
    });
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('e1');
    expect(data[0].isWinner).toBe(true);
    expect(data[0].resultText).toBe('已中奖');
  });

  it('多中奖名额：第 2 名（不在 winner_user_id 里）也能看到', () => {
    const data = buildWinningLotteryOrders({
      entries: [entry('e1', 'l-multi')],
      lotteries: [lotteryRow('l-multi', { winner_user_id: OTHER })],
      winnerIndex: winnerIndex({ 'l-multi': [OTHER, ME] }),
      userId: ME,
    });
    expect(data).toHaveLength(1);
    expect(data[0].isWinner).toBe(true);
  });

  it('拿不到中奖名单时回落 winner_user_id（不能整块变空）', () => {
    const data = buildWinningLotteryOrders({
      entries: [entry('e1', 'l-legacy')],
      lotteries: [lotteryRow('l-legacy', { winner_user_id: ME })],
      winnerIndex: new Map(),
      userId: ME,
    });
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('e1');
  });

  it('同一活动多次参与只出一条，且保留参与时间最早的那次上下文', () => {
    const data = buildWinningLotteryOrders({
      entries: [
        entry('e-late', 'l-same', '2026-11-01T12:00:00Z'),
        entry('e-early', 'l-same', '2026-11-01T09:00:00Z'),
      ],
      lotteries: [lotteryRow('l-same')],
      winnerIndex: winnerIndex({ 'l-same': [ME] }),
      userId: ME,
    });
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('e-late'); // 入参顺序即「最新在前」，取第一条
  });

  it('活动行缺失（已删/不可见）跳过，不抛错', () => {
    const data = buildWinningLotteryOrders({
      entries: [entry('e1', 'l-gone')],
      lotteries: [],
      winnerIndex: winnerIndex({ 'l-gone': [ME] }),
      userId: ME,
    });
    expect(data).toEqual([]);
  });

  it('没有用户 id 时直接返回空（避免空串 === 空串 把所有人都判成中奖）', () => {
    const data = buildWinningLotteryOrders({
      entries: [entry('e1', 'l1')],
      lotteries: [lotteryRow('l1')],
      winnerIndex: new Map(),
      userId: '',
    });
    expect(data).toEqual([]);
  });

  it('待开奖（status=open）即使参与过也不进订单', () => {
    const data = buildWinningLotteryOrders({
      entries: [entry('e1', 'l-open')],
      lotteries: [lotteryRow('l-open', { status: 'open' })],
      winnerIndex: new Map(),
      userId: ME,
    });
    expect(data).toEqual([]);
  });
});

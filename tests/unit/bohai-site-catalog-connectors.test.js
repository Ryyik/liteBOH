/**
 * bohai-site-catalog-connectors.test.js — 新闻 / 商城连接器（2026-11-12）
 *
 * 三条最容易错、且错了不会报错的地方：
 *   ① `rmb_price` 是**分**（线上实测 790 = ¥7.90）。少除 100 会把 7.9 元说成 790 元。
 *   ② `products` 的 RLS 里有 `select_all using true` ⇒ 未上架商品对所有人可读。
 *      「只给在售」必须由连接器自己 `.eq('is_active', true)`，不能指望 RLS。
 *   ③ 操作类问题（「商城入口在哪」）不该触发目录读取 —— 那会白烧 token 且答非所问。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { from: mocks.from },
}));

const { formatProductPrice, formatRmbPrice, getProductsContext } =
  await import('../../src/views/BOHAI/composables/useShopProductsRetrieval');
const { getNewsContext } = await import('../../src/views/BOHAI/composables/useSiteNewsRetrieval');
const { getMembersStatsContext } =
  await import('../../src/views/BOHAI/composables/useMembersStatsRetrieval');
const { shouldUseMembersStats, shouldUseShopProducts, shouldUseSiteNews } =
  await import('../../src/views/BOHAI/composables/useIntentDetection');

/**
 * 让 supabase 的链式调用返回固定行。
 *
 * ⚠️ 必须是「既可链式、又可 await」的对象：新闻的链在第 3 段就 await（`order().limit()`
 * 没有 `.eq`），商品的链是 `select().eq().order().limit()`。只返回普通对象会让 await
 * 立刻拿到 `{eq, ...}` 而没有 `data` ⇒ 会静默变成「空表」（第一版就是这么错的）。
 */
const stubQuery = (rows) => {
  const calls = { eq: [], select: null, order: null, limit: null };
  const settled = Promise.resolve({ data: rows, error: null });
  const chain = {
    select: (columns) => {
      calls.select = columns;
      return chain;
    },
    order: (column, options) => {
      calls.order = [column, options];
      return chain;
    },
    limit: (count) => {
      calls.limit = count;
      return chain;
    },
    eq: (column, value) => {
      calls.eq.push([column, value]);
      return chain;
    },
    then: (onFulfilled, onRejected) => settled.then(onFulfilled, onRejected),
    catch: (onRejected) => settled.catch(onRejected),
  };
  mocks.from.mockReturnValue(chain);
  return calls;
};

describe('价格格式（分 → 元）', () => {
  it('790 分 = ¥7.90，9900 分 = ¥99.00', () => {
    expect(formatRmbPrice(790)).toBe('¥7.90');
    expect(formatRmbPrice(9900)).toBe('¥99.00');
  });

  it('0 / 负数 / 非数字 → 空串（不显示 ¥0.00，那会被当成免费）', () => {
    expect(formatRmbPrice(0)).toBe('');
    expect(formatRmbPrice(-100)).toBe('');
    expect(formatRmbPrice(null)).toBe('');
    expect(formatRmbPrice('abc')).toBe('');
  });

  it('combined = 积分 或 现金（线上主力形态）', () => {
    expect(formatProductPrice({ points_cost: 39, rmb_price: 790, payment_mode: 'combined' })).toBe(
      '39 积分 或 ¥7.90',
    );
  });

  it('points_only 只给积分；rmb_only 只给现金', () => {
    expect(
      formatProductPrice({ points_cost: 95, rmb_price: null, payment_mode: 'points_only' }),
    ).toBe('95 积分');
    expect(
      formatProductPrice({ points_cost: null, rmb_price: 500, payment_mode: 'rmb_only' }),
    ).toBe('¥5.00');
  });

  it('未知 payment_mode 兜底把两种价都列出（宁可多给，不能漏真价）', () => {
    expect(formatProductPrice({ points_cost: 15, rmb_price: 500, payment_mode: '' })).toBe(
      '15 积分 或 ¥5.00',
    );
  });
});

describe('商城连接器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('查询显式过滤上架状态（RLS 有一条 using true，过滤不能交给数据库）', async () => {
    const calls = stubQuery([
      {
        id: 1,
        title: '斜挎包',
        category: '周边',
        points_cost: 39,
        rmb_price: 790,
        is_active: true,
      },
    ]);
    await getProductsContext('周边');
    expect(calls.eq).toContainEqual(['is_active', true]);
    expect(mocks.from).toHaveBeenCalledWith('products');
  });

  it('价格与库存进上下文，且是「分」换算后的元', async () => {
    stubQuery([
      {
        id: 1,
        title: '斜挎包',
        category: '周边',
        points_cost: 39,
        rmb_price: 790,
        stock: 0,
        payment_mode: 'combined',
        is_purchasable: true,
        is_active: true,
        sort_order: 1,
      },
    ]);
    const result = await getProductsContext('');
    expect(result.context).toContain('斜挎包');
    expect(result.context).toContain('¥7.90');
    expect(result.context).toContain('暂时缺货');
    expect(result.context).not.toContain('¥790');
  });

  it('空表给明确空态（不给模型编造空间）', async () => {
    stubQuery([]);
    const result = await getProductsContext('');
    expect(result.context).toContain('没有在售商品');
    expect(result.total).toBe(0);
  });
});

describe('新闻连接器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('输出标题 / 日期 / 分类，并报最新日期给 ranking', async () => {
    stubQuery([
      { id: 1, title: '冬季更新', category: '公告', excerpt: '新增周边', date: '2026-11-05' },
      { id: 2, title: '旧闻', category: '公告', excerpt: '', date: '2026-10-01' },
    ]);
    const result = await getNewsContext('');
    expect(result.context).toContain('冬季更新');
    expect(result.context).toContain('2026-11-05');
    expect(result.latestAt).toBe('2026-11-05');
  });

  it('关键词命中时只给命中的那条（宁缺毋滥，不拿无关新闻凑数）', async () => {
    stubQuery([
      { id: 1, title: '无关公告', category: '公告', excerpt: '', date: '2026-11-05' },
      { id: 2, title: '冬季周边上新', category: '商城', excerpt: '', date: '2026-09-01' },
    ]);
    const result = await getNewsContext('周边上新');
    expect(result.context).toContain('冬季周边上新');
    // 命中后不回退补位：与论坛连接器同口径（补位会把无关内容喂给模型、带偏答案）
    expect(result.context).not.toContain('无关公告');
  });
});

describe('意图路由', () => {
  it('新闻类问法命中，操作类不命中', () => {
    expect(shouldUseSiteNews('最近有什么新闻')).toBe(true);
    expect(shouldUseSiteNews('官方公告在哪看')).toBe(false); // 操作问题 → siteGuide
    expect(shouldUseSiteNews('帮我写首诗')).toBe(false);
  });

  it('商品类问法命中，纯积分问题不命中（那是用户私域）', () => {
    expect(shouldUseShopProducts('有什么周边可以买')).toBe(true);
    expect(shouldUseShopProducts('斜挎包多少钱')).toBe(true);
    expect(shouldUseShopProducts('我有多少积分')).toBe(false);
  });

  it('成员统计类命中；「这个帖子里多少人回复」不命中（那是论坛的事）', () => {
    expect(shouldUseMembersStats('站点有多少位成员')).toBe(true);
    expect(shouldUseMembersStats('成员总数')).toBe(true);
    expect(shouldUseMembersStats('这个帖子里有多少人回复')).toBe(false);
  });
});

describe('成员聚合连接器（只 count，不给明细）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 每次 select 依次返回 counts[i]；`head: true` 的查询不会有 data 行。返回调用记录。 */
  const stubCounts = (counts) => {
    const calls = [];
    let index = 0;
    mocks.from.mockImplementation(() => ({
      select: (columns, options) => {
        calls.push({ columns, options });
        const value = counts[Math.min(index, counts.length - 1)];
        index += 1;
        const settled = Promise.resolve({ count: value, error: null });
        const chain = {
          gte: () => chain,
          eq: () => chain,
          then: (resolve, reject) => settled.then(resolve, reject),
          catch: (reject) => settled.catch(reject),
        };
        return chain;
      },
    }));
    return calls;
  };

  it('只给聚合数字，且明确写「不含明细」', async () => {
    stubCounts([33, 2, 1]);
    const result = await getMembersStatsContext();
    expect(result.context).toContain('成员总数：33 位');
    expect(result.context).toContain('近 7 天新增：2 位');
    expect(result.context).toContain('今日新增：1 位');
    expect(result.context).toContain('不含任何成员明细');
    expect(result.total).toBe(33);
  });

  it('查询是 head count（不取行）—— 这是「不给明细」的技术保证', async () => {
    const calls = stubCounts([10, 0, 0]);
    await getMembersStatsContext();
    expect(calls.length).toBe(3);
    for (const call of calls) {
      expect(call.options).toMatchObject({ count: 'exact', head: true });
    }
  });

  it('人数为 0 也要给出数字（不要因为 0 就省略成「没有数据」）', async () => {
    stubCounts([0, 0, 0]);
    const result = await getMembersStatsContext();
    expect(result.context).toContain('成员总数：0 位');
  });
});

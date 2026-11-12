/**
 * 礼物记录并入周边「订单」分区（2026-11-02 礼物中心整页退场后）。
 *
 * 退场的前提是「一份记录都不能少」：老的礼物中心把礼物拆成「当前礼物」和「历史礼物」两段，
 * 历史那一族的判定是 `is_active === false`（完成超 1 个月自动归档，见 utils/gift-archive.js）。
 * 订单区若照抄资产页那套 `is_active` 过滤，归档礼物会整批消失 —— 而它现在是**唯一**入口。
 *
 * 同一个日期订单又从「购物袋的第二段」提成了独立分区（OrderPanel.vue），所以断言落点跟着搬。
 * 这里锁五件事：
 *  1. 老页面真的没了（不是「还留着但没入口」）；
 *  2. 礼物查询不按 is_active 过滤，且上限足够装下历史（不跟订单的 30 条走）；
 *  3. 礼物确实并进了「我的订单」三路聚合；
 *  4. 订单分区有「礼物」筛选与对应卡片文案；
 *  5. 订单是 /shop 的一级分区、排在购物袋之后；购物袋自己不再带订单（防止又塞回去）。
 *
 * ⚠️ 否定断言先 `scriptSection()` 再 `stripComments()` —— 注释里会合法地复述被禁的写法。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

const apiBare = stripComments(scriptSection(read('src/utils/api/shop-orders-api.js')));
const orderBare = stripComments(scriptSection(read('src/views/Shop/OrderPanel.vue')));
const orderRaw = read('src/views/Shop/OrderPanel.vue');
const orderTemplate = orderRaw.slice(0, orderRaw.lastIndexOf('</template>'));

const bagBare = stripComments(scriptSection(read('src/views/Shop/BagPanel.vue')));
const bagRaw = read('src/views/Shop/BagPanel.vue');
const bagTemplate = bagRaw.slice(0, bagRaw.lastIndexOf('</template>'));

const shopRaw = read('src/views/Shop/index.vue');

/** 截取某个导出函数的函数体（到下一个顶层 export 或文件末尾），避免跨函数误判 */
const functionBody = (source, name) => {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name} 必须存在`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const next = rest.indexOf('\nexport ', 1);
  return next === -1 ? rest : rest.slice(0, next);
};

const giftBody = functionBody(apiBare, 'fetchMyGiftOrders');
const ordersBody = functionBody(apiBare, 'fetchMyOrders');

describe('礼物中心退场', () => {
  it('老页面目录已删除（不是留着一份没入口的孤儿页）', () => {
    expect(existsSync(resolve(root, 'src/views/user-center/Address'))).toBe(false);
  });
});

describe('礼物查询必须装得下历史礼物', () => {
  it('不按 is_active 过滤（归档标记只是展示分组，不是删除）', () => {
    // 只允许按 user_id 圈定自己的记录；多任何一个 eq 都意味着又加了一层过滤
    const eqCalls = [...giftBody.matchAll(/\.eq\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(eqCalls).toEqual(['user_id']);
  });

  it('上限不跟订单的 30 条走 —— 历史礼物会被无声截断', () => {
    expect(apiBare).toMatch(/const GIFT_ORDER_LIMIT = (\d+);/);
    const limit = Number(apiBare.match(/const GIFT_ORDER_LIMIT = (\d+);/)[1]);
    expect(limit).toBeGreaterThanOrEqual(100);
    expect(giftBody).toContain('.limit(GIFT_ORDER_LIMIT)');
    // 注意别写成 not.toContain('ORDER_LIMIT')：GIFT_ORDER_LIMIT 是它的子串
    expect(giftBody).not.toContain('.limit(ORDER_LIMIT)');
  });

  it('礼物是「我的订单」的第三路，与购物 / 中奖并列', () => {
    expect(ordersBody).toContain('fetchMyShopOrders(userId)');
    expect(ordersBody).toContain('fetchMyLotteryOrders(userId)');
    expect(ordersBody).toContain('fetchMyGiftOrders(userId)');
    expect(flattenSource(ordersBody)).toContain(flattenSource('...gifts.data'));
  });
});

describe('订单分区能看见礼物', () => {
  it('筛选里有「礼物」一格', () => {
    expect(flattenSource(orderBare)).toContain(flattenSource(`{ value: 'gift', label: '礼物' }`));
  });

  it('三类记录共用卡片文案，礼物有独立标签', () => {
    expect(flattenSource(orderBare)).toContain(
      flattenSource(`const KIND_LABELS = { shop: '购物', lottery: '中奖', gift: '礼物' };`),
    );
    // 礼物卡脚注给礼物编号（没有编号时兜底成「礼物记录」）
    expect(flattenSource(orderBare)).toContain(
      flattenSource(`if (order?.kind === 'gift') return order.orderNo || '礼物记录';`),
    );
  });

  it('礼物编号与状态在模板里有落点', () => {
    expect(orderTemplate).toContain('kindLabel(order)');
    expect(orderTemplate).toContain('statusText(order)');
    expect(orderTemplate).toContain('footText(order)');
  });
});

describe('订单是商城的一级分区，不再是购物袋的第二段', () => {
  it('顶栏含「礼物」，且排在「购物袋」之后', () => {
    const tabBlock = shopRaw.slice(shopRaw.indexOf('const tabs = ['));
    const labels = [...tabBlock.slice(0, tabBlock.indexOf('];')).matchAll(/label: '([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual(['产品', '抽奖', '购物袋', '礼物', '地址']);
  });

  it('?tab=order 能直达（值域与顶栏同源，不手抄清单）', () => {
    expect(shopRaw).toContain('const SHOP_TAB_IDS = tabs.map((tab) => tab.id);');
    expect(shopRaw).toContain('SHOP_TAB_IDS.includes(tab)');
  });

  it('购物袋自己不再渲染订单（防止又塞回二级分段）', () => {
    expect(orderBare).not.toContain('BAG_VIEWS');
    expect(flattenSource(bagBare)).not.toContain(flattenSource('fetchMyOrders'));
    expect(bagTemplate).not.toContain('order-card');
    expect(bagTemplate).not.toContain('bag-seg');
  });
});

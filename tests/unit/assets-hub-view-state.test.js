/**
 * AssetsHubPanel 视图状态机守卫（2026-10-26 重做后；2026-11-02 收掉「订单与地址」）。
 *
 * 覆盖四类契约：
 *  1. 值域 —— 只有 home / decor / points 三个视图，未知值回落 home；
 *  2. 旧值映射 —— 七个页签时代的深链（overview / lottery / sponsor / subscription /
 *     cards / gifts / addresses / fulfillment）必须继续落到现存视图，否则老书签、老入口
 *     静默白屏（`?panel=cards` 由「我」页「设置卡面」按钮发出）；
 *  3. 契约撤除 —— tab-change / initialTab / showBack / back 与概览引擎不许回流；
 *  4. 迁出复核 —— 礼物 / 订单 / 收货地址在 2026-11-02 搬去购物袋与设置，本页不许
 *     悄悄长回来（否则同一份数据两处口径，地址双轨问题复发）。
 *
 * ⚠️ 全部断言走 `tests/helpers/source.js` 归一（本仓库 prettier 会重排，逐字断言会假红）。
 * 否定断言先 `scriptSection()` 再 `stripComments()` —— 注释里会合法地复述被删写法。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const raw = readFileSync(
  resolve(
    import.meta.dirname,
    '../../src/views/user-center/UserSpace/components/AssetsHubPanel.vue',
  ),
  'utf8',
);
const template = raw.split('</template>')[0];
const code = squeezeSource(scriptSection(raw));
const bare = stripComments(scriptSection(raw));
const flat = flattenSource(scriptSection(raw));

describe('AssetsHubPanel 视图值域', () => {
  it('只声明三个视图', () => {
    expect(flat).toContain(flattenSource(`const VIEW_IDS = new Set(['home', 'decor', 'points']);`));
  });

  it('未知值回落首页（不抛错、不留空页）', () => {
    expect(code).toMatch(/VIEW_IDS\.has\(mapped\)\s*\?\s*mapped\s*:\s*'home'/);
  });

  it('旧页签值全部映射到现存视图', () => {
    // home 一族：概览 / 订阅 / 抽奖 / 赞助都收进了首页
    for (const legacy of ['overview', 'subscription', 'lottery', 'sponsor']) {
      expect(flat).toContain(flattenSource(`${legacy}: 'home'`));
    }
    // 装扮一族：cards 来自「我」页积分卡的「设置卡面」
    expect(flat).toContain(flattenSource(`cards: 'decor'`));
    // 迁出的一族：老深链（?panel=orders / gifts / addresses / fulfillment）必须回落到
    // 首页而不是留白 —— 它们对应的内容现在在周边的「订单」/「地址」分区与设置里。
    for (const legacy of ['orders', 'fulfillment', 'gifts', 'addresses']) {
      expect(flat).toContain(flattenSource(`${legacy}: 'home'`));
    }
  });

  it('二级页标题只剩装扮 / 积分明细', () => {
    expect(flat).toContain(flattenSource(`SUBPAGE_TITLES = { decor: '装扮', points: '积分明细' }`));
  });
});

describe('AssetsHubPanel 视图切换', () => {
  it('切换统一上报 view-change（宿主据此写 URL ?panel=）', () => {
    expect(code).toContain(squeezeSource(`emit('view-change', target)`));
  });

  it('每个视图自己取数，切回首页重新拉首页数据', () => {
    expect(code).toContain(squeezeSource(`if (target === 'home') void loadHome();`));
    expect(code).toContain(squeezeSource(`if (target === 'decor') emit('load-points-card-data');`));
    expect(code).toContain(squeezeSource(`if (target === 'points') void loadLedger();`));
  });

  it('外部驱动（深链 / 设置页资产行）在保活期间也必须生效', () => {
    // prettier 会在 `watch(` 后断行 ⇒ 用正则宽边界，别用逐字子串
    expect(bare).toMatch(/watch\(\s*\(\)\s*=>\s*props\.initialView/);
  });

  it('挂载时先取档位再打开当前视图', () => {
    expect(code).toContain(
      squeezeSource(`onMounted(() => { void loadTier(); openView(view.value); })`),
    );
  });

  it('首页只拉会员 / 积分明细两路数据', () => {
    expect(code).toContain(squeezeSource(`await Promise.all([loadSubscription(), loadLedger()]);`));
  });
});

describe('AssetsHubPanel 订单与地址已迁出', () => {
  it('不再有订单 / 礼物的取数函数与状态', () => {
    for (const gone of [
      'loadOrders',
      'loadGifts',
      'refreshFulfillment',
      'ordersLoading',
      'giftsLoading',
      'currentGift',
      'historyGifts',
      'recordFilter',
      'addressCount',
    ]) {
      expect(bare).not.toContain(gone);
    }
  });

  it('不再挂 AddressManager / 礼物归档工具', () => {
    for (const gone of ['AddressManager', 'gift-archive', 'getExpiredActiveGiftIds']) {
      expect(bare).not.toContain(gone);
    }
  });

  it('模板里没有订单 / 地址子页残留', () => {
    for (const gone of ['ah-gift', 'ah-order', 'ah-fulfillment', 'AddressManager']) {
      expect(template).not.toContain(gone);
    }
  });

  it('账本仍把商城扣分并入（订单迁走了，钱不能从账本上消失）', () => {
    expect(code).toContain(squeezeSource(`.from('shop_points_orders')`));
    expect(code).toContain(squeezeSource(`title: '商城订单'`));
  });
});

describe('AssetsHubPanel 契约', () => {
  it('props 只有 initialView，旧的 initialTab / showBack 已撤除', () => {
    const propsBlock = bare.match(/defineProps\(\{([\s\S]*?)\n\}\)/)?.[1] || '';
    expect(propsBlock).toContain('initialView');
    expect(propsBlock).not.toContain('initialTab');
    expect(propsBlock).not.toContain('showBack');
  });

  it('emits 里有 view-change，没有 tab-change / back', () => {
    const emitsBlock = bare.match(/defineEmits\(\[([\s\S]*?)\]\)/)?.[1] || '';
    const emits = [...emitsBlock.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    expect(emits).toContain('view-change');
    expect(emits).not.toContain('tab-change');
    expect(emits).not.toContain('back');
  });

  it('页签组件与概览引擎不再回流', () => {
    expect(template).not.toContain('SegmentTabs');
    expect(template).not.toContain('ah-segment');
    for (const gone of [
      'loadOverview',
      'overviewCandidates',
      'primaryInsight',
      'useProductsStore',
      'getCommunityLotteries',
    ]) {
      expect(bare).not.toContain(gone);
    }
  });

  it('模板保住首页四卡 + 二级页返回条', () => {
    for (const cls of ['ah-wallet', 'ah-member', 'ah-decor-card', 'ah-todo']) {
      expect(template).toContain(`class="ah-panel ${cls}"`);
    }
    expect(template).toContain('class="ah-subpage-bar"');
  });
});

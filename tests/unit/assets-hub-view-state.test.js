/**
 * AssetsHubPanel 视图状态机守卫（2026-10-26 重做后）。
 *
 * 覆盖三类契约：
 *  1. 值域 —— 只有 home / decor / orders / points 四个视图，未知值回落 home；
 *  2. 旧值映射 —— 七个页签时代的深链（overview / lottery / sponsor / subscription /
 *     cards / gifts / addresses / fulfillment）必须继续落到现存视图，否则老书签、老入口
 *     静默白屏（`?panel=cards` 由「我」页「设置卡面」按钮发出）；
 *  3. 契约撤除 —— tab-change / initialTab / showBack / back 与概览引擎不许回流。
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
  it('只声明四个视图', () => {
    expect(flat).toContain(
      flattenSource(`const VIEW_IDS = new Set(['home', 'decor', 'orders', 'points']);`),
    );
  });

  it('未知值回落首页（不抛错、不留空页）', () => {
    expect(code).toMatch(/VIEW_IDS\.has\(mapped\)\s*\?\s*mapped\s*:\s*'home'/);
  });

  it('七个旧页签值全部映射到现存视图', () => {
    // home 一族：概览 / 订阅 / 抽奖 / 赞助都收进了首页
    for (const legacy of ['overview', 'subscription', 'lottery', 'sponsor']) {
      expect(flat).toContain(flattenSource(`${legacy}: 'home'`));
    }
    // 装扮一族：cards 来自「我」页积分卡的「设置卡面」
    expect(flat).toContain(flattenSource(`cards: 'decor'`));
    // 订单一族：礼物 / 地址 / 履约都是同一屏
    for (const legacy of ['fulfillment', 'gifts', 'addresses']) {
      expect(flat).toContain(flattenSource(`${legacy}: 'orders'`));
    }
  });
});

describe('AssetsHubPanel 视图切换', () => {
  it('切换统一上报 view-change（宿主据此写 URL ?panel=）', () => {
    expect(code).toContain(squeezeSource(`emit('view-change', target)`));
  });

  it('每个二级视图自己取数，切回首页重新拉首页数据', () => {
    expect(code).toContain(squeezeSource(`if (target === 'home') void loadHome();`));
    expect(code).toContain(squeezeSource(`if (target === 'decor') emit('load-points-card-data');`));
    expect(code).toContain(squeezeSource(`if (target === 'points') void loadLedger();`));
    expect(code).toMatch(
      /if \(target === 'orders'\) \{\s*void loadOrders\(\);\s*void loadGifts\(\);/,
    );
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

  it('首页只拉会员 / 订单 / 礼物 / 明细四类数据', () => {
    expect(code).toContain(
      squeezeSource(
        `await Promise.all([loadSubscription(), loadOrders(), loadGifts(), loadLedger()]);`,
      ),
    );
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

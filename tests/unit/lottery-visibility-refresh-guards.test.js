/**
 * lottery-visibility-refresh-guards.test.js —— 2026-11-16「新建的抽奖在周边抽奖页不显示」
 *
 * 那次报障是两层叠在一起，这里各钉一条：
 *
 * ① 数据层：`is_community_visible = false`。`get_community_lotteries` 第一层过滤就是
 *    `where is_community_visible = true` ⇒ 刷新一百次也不会出现。真正害人的是后台那句
 *    hint —— 旧文案写「首页会自动映射社区抽奖页中最新一条报名中的抽奖」，而线上
 *    `get_home_lottery` 是按 `is_home_visible = true` 单独筛的，两列**互相独立**。
 *    文案把两件事混成一件 ⇒ 运营以为自己在调首页，实际把抽奖从周边抽奖页摘掉了。
 *    更早还有个版本让 `is_home_visible` 复用「社区抽奖页」那组选项，下拉里写着「社区」、
 *    控制的却是首页，同一个坑。
 *
 * ② 表现层：`/shop` 自 2026-11-14 进 KeepAlive 白名单，`LotteryPanel` 只在 onMounted
 *    取一次数 ⇒ 从别的页面切回来看到的还是缓存列表。这一层才是「要刷新一下」的来源。
 *
 * 用源码级断言而不是挂载组件：vitest 环境是 node，SFC + supabase 客户端拖不进整棵依赖图；
 * 仓库既有先例见 keep-alive-names.test.js。正则刻意放宽空白，避免 prettier 重排假红。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/** 注释里会引用这些字面量（解释「旧文案错在哪」），断言必须只看实现 */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const panel = () => stripComments(read('src/views/Shop/LotteryPanel.vue'));
const fields = () => stripComments(read('src/views/DataManagement/config/fields.js'));
const tables = () => stripComments(read('src/views/DataManagement/config/tables.js'));

describe('抽奖列表：KeepAlive 激活时必须重新取数', () => {
  it('首次挂载必须取数（否则 loading 永久为 true）', () => {
    const source = panel();
    const start = source.indexOf('onMounted(');
    expect(start, 'LotteryPanel 里找不到 onMounted').toBeGreaterThan(-1);
    const end = source.indexOf('onActivated(');
    const mountedBlock = source.slice(start, end > start ? end : start + 400);
    /* 2026-11-20 回归：改独立详情页时把 onMounted 里的 load() 一起删了，
       而首次 onActivated 又被闩锁跳过 ⇒ 列表从未发请求，永远停在「正在加载抽奖…」。 */
    expect(mountedBlock).toMatch(/load\s*\(/);
  });

  it('LotteryPanel 注册了 onActivated（不是只有 onMounted）', () => {
    const source = panel();
    expect(source).toMatch(/onActivated/);
    expect(source).toMatch(/onActivated\s*\(/);
  });

  it('激活回调里走静默 + 强刷，而不是再亮一次骨架', () => {
    const source = panel();
    expect(source).toMatch(/load\s*\([^)]*silent:\s*true/);
    expect(source).toMatch(/load\s*\([^)]*force:\s*true/);
  });

  it('首次激活不重复请求（闩锁在，避免首屏双取）', () => {
    const source = panel();
    expect(source).toMatch(/hasActivatedOnce/);
    // 闩锁必须真的拦住第一次：出现 early return 才算数
    const activatedBlock = source.slice(source.indexOf('onActivated('));
    expect(activatedBlock).toMatch(/if\s*\(\s*!hasActivatedOnce\s*\)\s*\{[\s\S]*?return;/);
  });
});

describe('抽奖列表：周边页空闲预取', () => {
  const shop = () => stripComments(read('src/views/Shop/index.vue'));

  it('商品请求 settle 后调度预取，且直接落在抽奖 Tab 时不重复预取', () => {
    const source = shop();
    expect(source).toContain('getCommunityLotteries');
    expect(source).toMatch(/\.finally\(\s*\(\)\s*=>\s*scheduleLotteryPrefetch\(\)\s*\)/);
    expect(source).toMatch(/requestIdleCallback/);
    expect(source).toMatch(/activeTab\.value === 'lottery'/);
    expect(source).toMatch(/cancelLotteryPrefetch/);
  });

  it('面板按用户作用域读缓存，避免把「我的报名」串给下一个账号', () => {
    const source = panel();
    expect(source).toMatch(/cacheKey:\s*cacheKey\(\)/);
    expect(source).toMatch(/userInfo\?\.id/);
  });
});

describe('数据管理台：两个可见性开关各说各的，不许再互相借文案', () => {
  it('is_home_visible 有自己的一组选项', () => {
    expect(fields()).toMatch(/export\s+const\s+LOTTERY_HOME_VISIBLE_OPTIONS\s*=/);
    expect(fields()).toMatch(/LOTTERY_HOME_VISIBLE_OPTIONS/);
  });

  it('is_home_visible 不再复用「社区抽奖页」那组选项', () => {
    const source = tables();
    const start = source.indexOf("key: 'is_home_visible'");
    expect(start, 'tables.js 里找不到 is_home_visible 字段').toBeGreaterThan(-1);
    const block = source.slice(start, start + 600);
    expect(block).toMatch(/LOTTERY_HOME_VISIBLE_OPTIONS/);
    expect(block).not.toMatch(/LOTTERY_COMMUNITY_VISIBLE_OPTIONS/);
  });

  it('总开关的说明不再声称「首页自动映射社区抽奖页」（与线上筛选口径相反）', () => {
    const source = tables();
    const start = source.indexOf("key: 'is_community_visible'");
    expect(start, 'tables.js 里找不到 is_community_visible 字段').toBeGreaterThan(-1);
    const block = source.slice(start, start + 900);
    expect(block).not.toMatch(/首页会自动映射/);
    // 必须点明「关掉 = 前台全隐藏」这件事，否则又会有人以为只影响抽奖页
    expect(block).toMatch(/前台全隐藏|都会出现|不会出现/);
  });
});

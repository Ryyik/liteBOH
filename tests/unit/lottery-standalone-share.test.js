/**
 * lottery-standalone-share.test.js —— 抽奖详情「独立页 + 分享链接」守卫（2026-11-20）
 *
 * 那次两条报障叠在一起：
 *   ① 手机上点「分享 → 复制」只拿到文字、没有链接 —— 系统分享面板/部分机型的「复制」
 *      只读 `text` 字段、丢掉 `url`。修法是把链接塞进 `text`，两条通道都带 URL。
 *   ② 「想要独立页」—— 详情原来只是 /shop 里的一个弹层，地址栏拿不到链接、刷新即丢，
 *      分享出去只能靠 `?lottery=<id>` 深链（同页内二次点击时 KeepAlive 不重挂⇒静默失效）。
 *
 * 用源码级断言（vitest 是 node 环境，SFC + supabase 拖不进整棵依赖图；先例见
 * lottery-visibility-refresh-guards.test.js）。断言全部走归一后的实现，注释已剥。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';
import { publicRoutes } from '../../src/router/routes/public.js';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const script = (p) => stripComments(scriptSection(read(p)));

const sheet = () => script('src/views/Shop/LotteryDetailSheet.vue');
const panel = () => script('src/views/Shop/LotteryPanel.vue');
const page = () => script('src/views/Shop/LotteryDetailPage.vue');

describe('独立详情页路由', () => {
  it('/lottery/:id 注册为真实页面（可分享 / 刷新 / 前进后退）', () => {
    const route = publicRoutes.find((entry) => entry.path === '/lottery/:id');
    expect(route, '缺少 /lottery/:id 路由').toBeTruthy();
    expect(route.name).toBe('LotteryDetail');
    expect(typeof route.component).toBe('function');
    // 与周边页共用 page-shop 的左右栏让位，否则同一详情会长成两个宽度
    expect(route.meta?.bodyClass).toBe('page-shop');
  });

  it('独立页复用同一个 LotteryDetailSheet（视觉零分叉），并走 standalone 模式', () => {
    const source = page();
    expect(source).toContain("from './LotteryDetailSheet.vue'");
    /* 模板在 <script> 之外：这条要看整份文件，用 flattenSource 抹平属性换行 */
    expect(flattenSource(read('src/views/Shop/LotteryDetailPage.vue'))).toMatch(
      /<LotteryDetailSheet[^>]*standalone/,
    );
  });
});

describe('分享链接：文案必须自带 URL（手机端「只有文字没链接」的根因）', () => {
  it('text 里拼上了 url，而不是只给 title / prize', () => {
    const source = flattenSource(sheet());
    // 两处 text 赋值都必须带 ${url}
    expect(source).toMatch(/text\s*=\s*prize\s*\?[^;]*\$\{url\}/);
    // 兜底：整段 script 内出现 `${url}`（防止被简化成只传 url 字段）
    expect(source).toContain('${url}');
  });

  it('落点是独立页 /lottery/:id，且经 router.resolve 取（改名不废链）', () => {
    const source = sheet();
    expect(source).toContain("name: 'LotteryDetail'");
    // 不再手拼 ?tab=lottery&lottery=<id>
    expect(source).not.toContain('tab=lottery&lottery=');
    expect(source).toContain('router.resolve');
  });
});

describe('列表卡片 → 独立页，而不是本页叠弹层', () => {
  it('点卡片走 router.push 到 LotteryDetail', () => {
    const source = flattenSource(panel());
    expect(source).toContain("name:'LotteryDetail'");
    expect(source).toContain('router.push');
  });

  it('面板里不再渲染详情弹层（它已迁到独立页）', () => {
    expect(panel()).not.toContain('LotteryDetailSheet');
    expect(read('src/views/Shop/LotteryPanel.vue')).not.toContain('<LotteryDetailSheet');
  });

  it('旧深链 ?lottery=<id> 会 replace 到独立页，且 watch query（KeepAlive 同页失效的修法）', () => {
    const source = flattenSource(panel());
    expect(source).toContain('redirectLegacyDeepLink');
    expect(source).toContain('route.query.lottery');
    // 必须有 watch —— 只有 onMounted 的话 KeepAlive 缓存后同页再点深链不生效
    expect(source).toMatch(/watch\(\(\)=>route\.query\.lottery/);
  });
});

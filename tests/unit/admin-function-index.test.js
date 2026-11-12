import { describe, expect, it } from 'vitest';
import {
  buildAdminFunctionIndex,
  searchAdminFunctions,
  scoreFunctionMatch,
  TAB_ALIASES,
} from '../../src/views/DataManagement/config/function-index.js';
import { tabModules, tabs } from '../../src/views/DataManagement/config/tabs.js';
import { canViewModule } from '../../src/views/DataManagement/config/rbac.js';

/**
 * 后台「按功能名找入口」的能力（2026-11-12 用户报障：数据管理面板搜不到功能）。
 *
 * 这里守的是**能搜到**这件事本身，不是某个字符串写没写：
 *   1. 索引必须覆盖面板里每一个可跳转落点（模块 / 页签 / 独立控制台页 / 系统子页），
 *      否则「搜得到」只是碰巧覆盖了被断言的那几条；
 *   2. 别名必须真的能命中（「补发」→ 积分发放），这是用户报障的直接场景；
 *   3. 排序要把功能排在模块前面（搜「积分」的人要的是那一页，不是模块首页）。
 */

const index = buildAdminFunctionIndex({ role: 'admin' });
const ids = (list) => list.map((entry) => `${entry.kind}:${entry.id}`);

describe('功能索引的覆盖面', () => {
  it('索引非空（防止配置读取写错导致整组断言空跑）', () => {
    expect(index.length).toBeGreaterThan(50);
  });

  it('tabModules 里每个模块都有一个 module 落点', () => {
    for (const mod of tabModules) {
      expect(ids(index), `${mod.id} 没进索引`).toContain(`module:${mod.id}`);
    }
  });

  it('每个模块 tabIds 里的页签都有 tab 落点（侧栏搜不到就等于入口不存在）', () => {
    const missing = [];
    for (const mod of tabModules) {
      for (const tabId of mod.tabIds || []) {
        if (!ids(index).includes(`tab:${tabId}`)) missing.push(tabId);
      }
    }
    expect(missing).toEqual([]);
  });

  it('只登记 tabIds 里的页签：「已并入其它页」的过渡条目不该被搜出来', () => {
    // api-keys / freemodels 仅留 label 给旧深链，点进去是一份过渡页
    expect(ids(index)).not.toContain('tab:api-keys');
    expect(ids(index)).not.toContain('tab:freemodels');
    expect(tabs.some((tab) => tab.id === 'api-keys')).toBe(true);
  });

  it('系统模块的两个子页（媒体资源 / 网站设置）可被搜到', () => {
    expect(ids(index)).toContain('section:media');
    expect(ids(index)).toContain('section:settings');
  });

  it('key 唯一（v-for 的 :key 直接用它）', () => {
    const keys = index.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('按功能名 / 别名检索', () => {
  const find = (query) => ids(searchAdminFunctions(index, query, { limit: 12 }));

  it('原文页签名直接命中，且功能排在模块前面', () => {
    const hits = find('积分');
    expect(hits[0]).toBe('tab:points');
    // 用户模块也在 haystack 里，但排在功能之后
    const modulePos = hits.indexOf('module:users');
    expect(modulePos === -1 || modulePos > 0).toBe(true);
  });

  it('别名「补发」能找到「积分发放」和「订阅发放」', () => {
    const hits = find('补发');
    expect(hits).toContain('tab:points-grant');
    expect(hits).toContain('tab:subscriptions-grant');
  });

  it('别名「banner」能找到广告管理，别名「头像」能找到头像框控制台', () => {
    expect(find('banner')).toContain('tab:ads');
    expect(find('头像')).toContain('module:avatar-console');
  });

  it('多关键词按 AND 处理：「积分 发放」不会把「积分管理」也算进来', () => {
    const hits = find('积分 发放');
    expect(hits).toContain('tab:points-grant');
    expect(hits).not.toContain('tab:points');
  });

  it('完全无关的词返回空（而不是兜底返回全量）', () => {
    expect(searchAdminFunctions(index, 'zzzz不存在的功能')).toEqual([]);
    expect(searchAdminFunctions(index, '   ')).toEqual([]);
  });

  it('每个别名都能命中它自己那条页签（防止别名写错 tabId 成了死词）', () => {
    const broken = [];
    for (const [tabId, aliases] of Object.entries(TAB_ALIASES)) {
      for (const alias of aliases) {
        const hits = ids(searchAdminFunctions(index, alias, { limit: 20 }));
        if (!hits.includes(`tab:${tabId}`)) broken.push(`${alias} → ${tabId}`);
      }
    }
    // 别名可能同时命中多条（「生日」既是活动也是祝福），只要目标那条在结果里即可
    expect(broken).toEqual([]);
  });
});

describe('排序与权限', () => {
  it('完全等于页签名 > 前缀命中 > 只命中模块名', () => {
    const ads = index.find((entry) => entry.key === 'tab:ads');
    const exact = scoreFunctionMatch(ads, '广告管理');
    const prefix = scoreFunctionMatch(ads, '广告');
    const byModuleOnly = scoreFunctionMatch(ads, '社区');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(byModuleOnly);
    expect(byModuleOnly).toBeGreaterThan(0);
    expect(scoreFunctionMatch(ads, '')).toBe(0);
  });

  it('同一模块下的页签继承模块权限：版主看不到用户模块的功能', () => {
    const moderatorIndex = buildAdminFunctionIndex({ role: 'moderator' });
    const pointsGrant = moderatorIndex.find((entry) => entry.key === 'tab:points-grant');
    expect(canViewModule('moderator', 'users')).toBe(false);
    expect(pointsGrant.denied).toBe(true);
    // 内容复核是版主的本职，不能被标成无权
    const reported = moderatorIndex.find((entry) => entry.key === 'tab:reportedPosts');
    expect(reported.denied).toBe(false);
  });

  it('includeDenied:false 时把无权项过滤掉（⌘K 可选口子）', () => {
    const moderatorIndex = buildAdminFunctionIndex({ role: 'moderator' });
    const visible = searchAdminFunctions(moderatorIndex, '积分', { includeDenied: false });
    expect(visible.every((entry) => !entry.denied)).toBe(true);
  });
});

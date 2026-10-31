import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tabs, tabModules } from '../../src/views/DataManagement/config/tabs.js';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';

/**
 * page 型 tab 的接线：`type: 'page'` 的页签由 `PAGE_TAB_COMPONENTS` 映射到组件，
 * 缺映射不会报错、不会白屏，只会渲染出一块**空白**——比崩溃更难发现。
 *
 * 2026-10-31 加「帮人报名」时补的守卫：当时确认过 points-grant / pity-grant /
 * subscriptions-grant 三个页签都在映射里，但没有任何机制保证「新加一个 page 页签
 * 一定记得挂组件」。这条守的就是那个关系。
 */

const DATA_ADMIN = 'src/views/DataManagement/DataAdmin.vue';
const code = flattenSource(
  stripComments(
    scriptSection(readFileSync(resolve(import.meta.dirname, '../..', DATA_ADMIN), 'utf8')),
  ),
);
// 对象键可能带引号也可能不带（freemodels 是合法标识符 ⇒ prettier 不加引号），
// 所以先统一去引号再匹配，否则会因为「键写没写引号」误报。
const codeNoQuotes = code.replace(/'/g, '');

const pageTabs = tabs.filter((tab) => tab.type === 'page');

/** 刻意不进侧栏的历史页签：仅用于旧深链兜底（?tab=api-keys / freemodels），见 tabs.js 注释。 */
const LEGACY_DEEP_LINK_TABS = new Set(['api-keys', 'freemodels']);

describe('page 型 tab 的组件映射', () => {
  it('确实存在 page 型页签（避免正则写错导致这个文件变成空跑）', () => {
    expect(pageTabs.length).toBeGreaterThanOrEqual(4);
    expect(pageTabs.map((tab) => tab.id)).toContain('lottery-join-grant');
  });

  it('每个 page 型页签都在 PAGE_TAB_COMPONENTS 里有组件（否则渲染空白）', () => {
    const missing = pageTabs
      .filter((tab) => !codeNoQuotes.includes(`${tab.id}:`))
      .map((tab) => tab.id);

    expect(missing).toEqual([]);
  });

  it('每个 page 型页签都挂在某个模块的 tabIds 下（否则侧栏点不到）', () => {
    const reachable = new Set(tabModules.flatMap((mod) => mod.tabIds || []));
    const orphans = pageTabs
      .filter((tab) => !LEGACY_DEEP_LINK_TABS.has(tab.id))
      .filter((tab) => !reachable.has(tab.id))
      .map((tab) => tab.id);

    expect(orphans).toEqual([]);
  });

  it('page 型页签不得出现在 tables.js 的数据配置里（否则会被当成表格去取数）', () => {
    // 判据取 tables.js 源码而不是导入的对象：dataConfig 是默认导出的巨型对象，
    // 这里只想知道「有没有给这个 tab 配过表」，用键名匹配足够且不依赖导出结构。
    const tables = readFileSync(
      resolve(import.meta.dirname, '../..', 'src/views/DataManagement/config/tables.js'),
      'utf8',
    );
    const wronglyConfigured = pageTabs
      .filter((tab) => new RegExp(`\\n  ${tab.id}: \\{`).test(tables))
      .map((tab) => tab.id);

    expect(wronglyConfigured).toEqual([]);
  });
});

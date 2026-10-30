/**
 * 「查询条件」层外搬后的落位与单源守卫（2026-10-30，审查报告 P1-1 第 3 步）。
 *
 * 断言的**主体**跟着代码走：原来钉在 ForumMain.vue 里的那几条不变量
 * （单字符滞回、#标签语法、防抖句柄唯一），现在读「查询层两文件并集」。
 *
 * 两条落位断言防的是**外搬特有的两种事故**：
 *   1. 搬完没挂上 —— composable 写好了、宿主没调用 ⇒ 所有不变量守卫仍然全绿，产品却没有搜索防抖；
 *   2. 两边各留一份 —— 宿主旧实现没删干净 ⇒ 两个防抖定时器互相覆盖，
 *      表现是「输入后偶尔不检索」，比彻底坏掉更难查。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const SCRIPT = 'src/views/Forum/ForumMain.vue';
const QUERY = 'src/views/Forum/composables/useForumFeedQuery.js';

// ⚠️ .vue 必须先取 <script> 区再剥注释：模板里的 `image/*` 会与远处的 `*/` 错配
const hostCode = () => squeezeSource(stripComments(scriptSection(read(SCRIPT))));
const queryCode = () => squeezeSource(stripComments(read(QUERY)));
/** 两文件并集：不变量只关心「有没有这份实现」，不关心它此刻住在哪个文件 */
const chainCode = () => `${hostCode()}\n${queryCode()}`;

describe('查询条件层：落位', () => {
  it('宿主必须真调用 useForumFeedQuery 并注入筛选态与取数函数', () => {
    const host = hostCode();
    expect(host).toContain('useForumFeedQuery({');
    // 注入的 ref 少一个，对应开关就会写到一个孤儿对象上（点了没反应，也不报错）
    for (const dep of ['searchQuery', 'sortMode', 'feedMode', 'selectedTagFilter', 'fetchForumData']) {
      expect(host).toContain(dep);
    }
    // 动作要真的接出来：模板绑定的是宿主的局部名
    expect(host).toContain(squeezeSource('} = useForumFeedQuery({'));
  });

  it('宿主不得留第二份防抖句柄或动作定义（两份互相覆盖 ⇒ 输入后偶尔不检索）', () => {
    const host = hostCode();
    expect(host).not.toContain('let searchDebounceTimer');
    expect(host).not.toContain('clearTimeout(searchDebounceTimer');
    expect(host).not.toContain('const setSortMode');
    expect(host).not.toContain('const setTagFilter');
    expect(host).not.toContain('const applyHistoryKeyword');
  });

  it('宿主两处「先掐待发检索」必须走同一出口（askBohai / 卸载清理）', () => {
    const host = hostCode();
    // 直接 clearTimeout 别人的 let 已经不可能（见上一条），但显式钉住调用点数：
    // 少一处 ⇒ 卸载后定时器还会打一次全表查询；多一处 ⇒ 说明又有人绕过出口。
    expect(host.match(/cancelPendingSearch\(\)/g)).toHaveLength(2);
  });
});

describe('查询条件层：不变量（两文件并集，跟着代码走）', () => {
  it('单字符搜索有滞回，多字符走常规防抖', () => {
    const code = chainCode();
    expect(code).toContain('SINGLE_CHAR_SEARCH_DELAY_MS');
    expect(code).toContain('SEARCH_DEBOUNCE_MS');
    // 反向：不允许把单字符也丢进同一个短防抖（每次都打全表查询）
    expect(code).not.toContain('pendingKeyword.length === 1 ? SEARCH_DEBOUNCE_MS');
  });

  it('# 标签语法：输入解析成筛选，且下拉选择优先（清掉 #记号）', () => {
    const code = chainCode();
    expect(code).toContain('deriveTagFilterFromInput');
    expect(code).toContain('stripTagTokens');
    // 下拉选择必须先把输入里的 #记号清掉，否则防抖解析会把选择覆盖回旧标签
    expect(code).toMatch(/searchQuery\.value\.includes\('#'\)[\s\S]{0,160}stripTagTokens/);
  });

  it('最近搜索历史只在本模块读写 localStorage，且键名唯一', () => {
    const host = hostCode();
    expect(host).not.toContain('boh-forum-search-history');
    const code = queryCode();
    expect(code.match(/boh-forum-search-history/g)).toHaveLength(1);
  });
});

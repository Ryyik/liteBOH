import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 护栏：导航状态卡的「白名单式重建」必须放行筛选选项字段。
 *
 * 为什么要有这个守卫（2026-10-20 实测事故）：
 * `UnifiedNavbar/index.vue` 的 `normalizeNavStatus()` 是**白名单式重建** ——
 * 它把一个 payload 手工重建成新对象，只拷贝它认识的字段。任何新字段不写进
 * 这个函数，就等于**根本没传下去**，而且失败是**静默的**：
 *   · Newsroom 明明传了 `groups`（结构化筛选分组），
 *   · 卡片却拿到 `undefined` ⇒ `optionGroups` 为空 ⇒ 筛选面板渲染成一条空白扁条，
 *   · 用户报障是「点了筛选看不到内容」，看起来像布局被裁，实际是数据没到。
 * 当时先怀疑「面板被 surface 固定高度裁掉」，改了一轮高度上报才定位到真因。
 *
 * 所以这里把「这几个字段必须被放行」钉死：以后谁在白名单里删字段、
 * 或新增 kind 时忘了补，这条会当场红。
 *
 * 为什么是源码守卫而不是行为断言：`normalizeNavStatus` 是 SFC 内的私有函数，
 * 没有对外导出；为了测它而把内部实现变成公共 API 得不偿失
 * （同 `tests/unit/unified-nav-scrolled-guard.test.js` 的取舍）。
 */

const NAVBAR = 'src/components/UnifiedNavbar/index.vue';

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

/** 取出 normalizeNavStatus 的函数体（从声明处到下一个顶层 const） */
const normalizeBody = () => {
  const src = read(NAVBAR);
  const start = src.indexOf('const normalizeNavStatus = (payload = {}) => {');
  expect(start, 'normalizeNavStatus 的声明找不到 —— 本守卫需要同步更新').toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.indexOf('\n};', rest.indexOf('return {'));
  expect(end, 'normalizeNavStatus 的函数体边界找不到').toBeGreaterThan(-1);
  return rest.slice(0, end);
};

describe('导航状态卡白名单（normalizeNavStatus）', () => {
  it('放行 groups —— 结构化筛选分组的唯一通道', () => {
    // 少了这一条，筛选面板会静默变成空白条（2026-10-20 实际报障）
    expect(normalizeBody()).toContain('groups:');
  });

  it('放行搜索/筛选的三处文案覆盖（分段后搜索框 placeholder 要跟着段变）', () => {
    const body = normalizeBody();
    for (const key of ['searchPlaceholder:', 'searchLabel:', 'filterLabel:']) {
      expect(body, `白名单缺少 ${key}`).toContain(key);
    }
  });

  it('原有必需字段仍在（防止重构时误删）', () => {
    const body = normalizeBody();
    for (const key of ['query:', 'filter:', 'options:', 'onSearch:', 'onFilter:', 'persistent:']) {
      expect(body, `白名单缺少 ${key}`).toContain(key);
    }
  });

  it('groups 为非法值时不抛错（回落到空数组）', () => {
    // 契约：非数组一律当空，组件侧再判空渲染 —— 别让上游传 null 炸掉整条导航
    expect(normalizeBody()).toMatch(
      /groups:\s*Array\.isArray\(payload\.groups\)\s*\?\s*payload\.groups\s*:\s*\[\]/,
    );
  });
});

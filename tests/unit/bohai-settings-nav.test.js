/**
 * bohai-settings-nav.test.js — 锁「AI 设置左侧导航的权限过滤」（2026-11-12）
 *
 * 这条规则是**安全边界**：「调试」分区里放着知识库切片原文、chunk id 与真实分数的入口。
 * 如果它露给普通用户，界面上不会有任何报错 —— 所以必须在这里把两条分支都钉死：
 *   ① 无关键词（直接打开设置）② 有关键词（搜索「调试」）。
 * 旧实现的坑正是只过滤了 ② —— `if (!keyword) return NAV_GROUPS` 原样返回未过滤列表。
 */
import { describe, expect, it } from 'vitest';
import {
  filterNavGroupsByKeyword,
  filterNavGroupsByPermission,
} from '../../src/views/BOHAI/utils/settings-nav';

const GROUPS = [
  {
    id: 'general',
    label: '通用',
    items: [{ id: 'chat', label: '对话偏好', keywords: '响应 模式' }],
  },
  {
    id: 'debug',
    label: '调试',
    adminOnly: true,
    items: [{ id: 'debug', label: '知识库调试', adminOnly: true, keywords: '调试 知识库 切片' }],
  },
  {
    id: 'mixed',
    label: '混合',
    items: [
      { id: 'public', label: '公开项', keywords: '公开' },
      { id: 'adminOnlyItem', label: '仅管理员项', adminOnly: true, keywords: '仅管理员' },
    ],
  },
];

const ids = (groups) => groups.map((group) => group.id);
const itemIds = (groups) => groups.flatMap((group) => group.items.map((item) => item.id));

describe('设置导航权限过滤', () => {
  it('管理员：调试分区与仅管理员条目都在', () => {
    const result = filterNavGroupsByPermission(GROUPS, { isAdmin: true });
    expect(ids(result)).toContain('debug');
    expect(itemIds(result)).toContain('debug');
    expect(itemIds(result)).toContain('adminOnlyItem');
  });

  it('普通用户：调试分区整组消失（无关键词分支也不能露）', () => {
    const result = filterNavGroupsByPermission(GROUPS, { isAdmin: false });
    expect(ids(result)).not.toContain('debug');
    expect(itemIds(result)).not.toContain('debug');
  });

  it('普通用户 + 搜「调试」：搜不到（搜索跑在过滤之后）', () => {
    const visible = filterNavGroupsByPermission(GROUPS, { isAdmin: false });
    const result = filterNavGroupsByKeyword(visible, '调试');
    expect(result).toEqual([]);
  });

  it('管理员 + 搜「调试」：能搜到', () => {
    const visible = filterNavGroupsByPermission(GROUPS, { isAdmin: true });
    const result = filterNavGroupsByKeyword(visible, '调试');
    expect(itemIds(result)).toContain('debug');
  });

  it('组内个别条目带 adminOnly 时只滤条目、组还在', () => {
    const result = filterNavGroupsByPermission(GROUPS, { isAdmin: false });
    expect(ids(result)).toContain('mixed');
    expect(itemIds(result)).toContain('public');
    expect(itemIds(result)).not.toContain('adminOnlyItem');
  });

  it('不修改入参（computed 反复求值时不能把原数组越滤越小）', () => {
    const before = GROUPS.length;
    filterNavGroupsByPermission(GROUPS, { isAdmin: false });
    filterNavGroupsByPermission(GROUPS, { isAdmin: false });
    expect(GROUPS.length).toBe(before);
    expect(GROUPS.find((group) => group.id === 'mixed').items.length).toBe(2);
  });

  it('缺参 / 空数组不崩', () => {
    expect(filterNavGroupsByPermission()).toEqual([]);
    expect(filterNavGroupsByPermission([], {})).toEqual([]);
    expect(filterNavGroupsByKeyword()).toEqual([]);
    expect(filterNavGroupsByKeyword(GROUPS, '')).toHaveLength(GROUPS.length);
  });

  it('关键词比较不区分大小写、匹配标题与近义词', () => {
    const groups = [
      { id: 'a', label: 'Group', items: [{ id: 'x', label: 'Chunk', keywords: 'Knowledge' }] },
    ];
    expect(itemIds(filterNavGroupsByKeyword(groups, 'knowledge'))).toContain('x');
    expect(itemIds(filterNavGroupsByKeyword(groups, 'chunk'))).toContain('x');
  });
});

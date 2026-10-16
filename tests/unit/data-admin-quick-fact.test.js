import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseQuickFact,
  QUICK_FACT_PRIORITY,
} from '@/views/DataManagement/composables/quick-fact.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

// 官方事实「速记输入框」守卫（2026-10-16 用户口径：
// 「方便的说人物 xxx 然后就自动归类，给我一个输入框」）。
// 解析器为纯函数：显式前缀 > 已知成员名 > 关键词推断 > 兜底概况。
// 反证：把 quick-fact.js 里 `category = 'member_profile'` 的人物前缀分支删掉 → 第 1 条必红。

describe('官方事实速记 · parseQuickFact 归类', () => {
  it('显式「人物：」前缀 → 成员档案 + 人名标题/标签', () => {
    const result = parseQuickFact('人物：小牛 是技术担当，运营苦力怕服务器');
    expect(result.category).toBe('member_profile');
    expect(result.title).toBe('成员档案：小牛');
    expect(result.tags).toEqual(['小牛']);
    expect(result.content).toBe('人物：小牛 是技术担当，运营苦力怕服务器');
    expect(result.priority).toBe(QUICK_FACT_PRIORITY.member_profile);
    expect(result.status).toBe('active');
    expect(result.source_label).toBe('管理员速记');
  });

  it('已知成员名开头（无前缀）也归成员档案，且优先于年份推断', () => {
    const result = parseQuickFact('小牛 2019年加入方块之家', { knownNames: ['小牛', 'Ryyik'] });
    expect(result.category).toBe('member_profile');
    expect(result.title).toBe('成员档案：小牛');
  });

  it('「成员档案：xxx」惯用开头不吞人名', () => {
    const result = parseQuickFact('成员档案：小牛 是技术担当');
    expect(result.category).toBe('member_profile');
    expect(result.title).toBe('成员档案：小牛');
  });

  it('英文名在人名截断下可用', () => {
    const result = parseQuickFact('Eleven 是活跃老成员');
    expect(result.category).toBe('member_profile');
    expect(result.title).toBe('成员档案：Eleven');
  });

  it('年份 → timeline（发展大事记）', () => {
    const result = parseQuickFact('2019年 群解散事件，冷静后又把大家拉回');
    expect(result.category).toBe('timeline');
    expect(result.title).toBe('大事记：2019年');
    expect(result.tags).toEqual(['2019年']);
    expect(result.priority).toBe(QUICK_FACT_PRIORITY.timeline);
  });

  it('「大事记：」前缀优先于年份', () => {
    const result = parseQuickFact('大事记：2021年 周年庆传统开启');
    expect(result.category).toBe('timeline');
    expect(result.title).toBe('大事记：2021年');
  });

  it('文化关键词 → culture', () => {
    const result = parseQuickFact('理念：高品质服务，纯粹的游戏热爱');
    expect(result.category).toBe('culture');
    expect(result.priority).toBe(QUICK_FACT_PRIORITY.culture);
  });

  it('兜底 community_overview，标题取前 24 字', () => {
    const result = parseQuickFact('官网上线了新的帮助中心页面');
    expect(result.category).toBe('community_overview');
    expect(result.title).toBe('官网上线了新的帮助中心页面');
    expect(result.title.length).toBeLessThanOrEqual(24);
  });

  it('空输入返回 null', () => {
    expect(parseQuickFact('')).toBeNull();
    expect(parseQuickFact('   ')).toBeNull();
  });
});

describe('官方事实速记 · 面板接线（源码守卫）', () => {
  const view = read('src/views/DataManagement/DataAdmin.vue');

  it('速记输入条 + 回车/按钮 + 解析器接线齐备', () => {
    expect(view).toContain('quick-fact-bar');
    expect(view).toContain('handleQuickAddFact');
    expect(view).toMatch(/parseQuickFact/);
    expect(view).toMatch(/quick-fact\.js/);
    // 入库后必须同步向量索引（速记与抽屉保存同一条铁律）
    expect(view).toMatch(/handleQuickAddFact[\s\S]{0,2000}syncCoreMemoriesIndex/);
  });
});

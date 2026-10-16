import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

// 数据管理 · 官方事实 tab「一眼看到内容」视图守卫（2026-10-16 用户口径：
// 「这个视图不太方便编辑，没办法一下看到内容」）。锁四件事：
//   ① 表格：content 列声明多行预览（multiline/clampLines）并上移到标题后；
//   ② 卡片：正文预览（cardView.bodyKey）+ 整卡点击编辑（clickToEdit）；
//   ③ 渲染：表格多行分支 + 卡片预览元素 + 整卡点击 handler 接线齐备；
//   ④ 样式：多行截断（-webkit-line-clamp）与 pre-wrap 存在于对应 CSS。
// 断言用宽容正则 —— 防 prettier 重排导致假红（仓库既有纪律）。
// 反证：把 tables.js 的 `multiline: true` 撤掉 → 第 1 条必红。

describe('数据管理 · 官方事实「一眼看到内容」', () => {
  const tables = read('src/views/DataManagement/config/tables.js');
  const view = read('src/views/DataManagement/DataAdmin.vue');
  const consoleCss = read('src/views/DataManagement/styles/console.css');

  it('content 列声明多行预览 + 排在标题之后', () => {
    expect(tables).toMatch(/key:\s*'content',[^}]*multiline:\s*true/);
    expect(tables).toMatch(/key:\s*'content',[^}]*clampLines:\s*\d+/);
    const seg = tables.slice(tables.indexOf('coreMemories: {'));
    const iTitle = seg.indexOf("key: 'title'");
    const iContent = seg.indexOf("key: 'content'");
    const iCategory = seg.indexOf("key: 'category'");
    expect(iTitle).toBeGreaterThan(-1);
    expect(iContent).toBeGreaterThan(iTitle);
    expect(iCategory).toBeGreaterThan(iContent);
  });

  it('卡片视图声明正文预览与整卡点击编辑', () => {
    expect(tables).toMatch(/bodyKey:\s*'content'/);
    expect(tables).toMatch(/clickToEdit:\s*true/);
  });

  it('渲染层：表格多行分支 + 卡片预览 + 整卡点击接线齐备', () => {
    expect(view).toContain('cell-text-multiline');
    expect(view).toMatch(/col\.multiline/);
    expect(view).toContain('lottery-card-preview');
    expect(view).toMatch(/currentCardViewConfig\.bodyKey/);
    expect(view).toMatch(/handleCardClick/);
    // 整卡可点必须与动作区防冒泡成对出现（否则点铅笔会双开抽屉/误触删除）
    expect(view).toMatch(/lottery-card-actions[^>]*@click\.stop/);
  });

  it('样式：多行截断与卡片预览样式存在', () => {
    expect(consoleCss).toContain('.cell-text-multiline');
    expect(consoleCss).toMatch(/-webkit-line-clamp/);
    expect(consoleCss).toMatch(/white-space:\s*pre-wrap/);
    expect(view).toContain('.lottery-card-preview');
    expect(view).toMatch(/\.lottery-card\.is-clickable/);
  });
});

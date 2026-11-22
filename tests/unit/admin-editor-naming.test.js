/**
 * 数据管理 · 几个“编辑”入口的命名口径（2026-11-21）
 *
 * 用户报障：「就地编辑语义不清」—— 侧栏里「商城装修 / 就地编辑 / 资讯编辑」三个
 * 名字都在说“编辑”，但没有一个说清**在哪里编、编什么**。定稿口径：
 *
 *   商品编辑台     = 独立页，左列表 + 右表单，批量改商品字段与主图
 *   商城页内编辑   = 渲染真实 /shop，在页面上单点改（商品卡 + 抽奖卡）
 *   资讯页内编辑   = 渲染真实 /newsroom，在页面上单点改标题/摘要/封面
 *
 * 这里锁三件事：① 新名字与描述必须能区分落点；② 旧名字仍可作为搜索别名命中；
 * ③ 页面标题与概览快捷入口不能继续用旧名字。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_PAGE_META, tabModules } from '@/views/DataManagement/config/tabs.js';
import {
  buildAdminFunctionIndex,
  MODULE_ALIASES,
  searchAdminFunctions,
} from '@/views/DataManagement/config/function-index.js';

const root = resolve(import.meta.dirname, '../..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');
const moduleById = (id) => tabModules.find((mod) => mod.id === id);

const index = buildAdminFunctionIndex({ role: 'admin' });
const resultIds = (query) =>
  searchAdminFunctions(index, query, { limit: 20 }).map((entry) => `${entry.kind}:${entry.id}`);

describe('编辑器入口命名', () => {
  it('三个入口的名字分别说清“表单批量编辑 / 商城页内 / 资讯页内”', () => {
    expect(moduleById('shop-console')?.label).toBe('商品编辑台');
    expect(moduleById('shop-editor')?.label).toBe('商城页内编辑');
    expect(moduleById('news-editor')?.label).toBe('资讯页内编辑');
  });

  it('名字两两不同，且不再残留一个孤零零的「就地编辑」标签', () => {
    const labels = ['shop-console', 'shop-editor', 'news-editor'].map(
      (id) => moduleById(id)?.label,
    );
    expect(new Set(labels).size).toBe(3);
    expect(labels).not.toContain('就地编辑');
  });

  it('描述能直接区分落点与能力', () => {
    expect(moduleById('shop-console')?.description).toContain('左侧商品列表');
    expect(moduleById('shop-console')?.description).toContain('批量');
    expect(moduleById('shop-editor')?.description).toContain('真实商城页');
    expect(moduleById('shop-editor')?.description).toContain('抽奖卡');
    expect(moduleById('news-editor')?.description).toContain('真实资讯页');
  });

  it('独立控制台页标题同步改成「商品编辑台」', () => {
    expect(ADMIN_PAGE_META['shop-console']?.title).toBe('商品编辑台');
    expect(read('src/views/ShopConsole/index.vue')).toContain('<h1>商品编辑台</h1>');
    expect(read('src/views/DataManagement/components/AdminOverview.vue')).toContain(
      '<strong>商品编辑台</strong>',
    );
  });
});

describe('旧名字仍可搜到新入口', () => {
  it('「就地编辑」命中商城页内编辑', () => {
    expect(resultIds('就地编辑')).toContain('module:shop-editor');
  });

  it('「商城装修」命中商品编辑台', () => {
    expect(resultIds('商城装修')).toContain('module:shop-console');
  });

  it('「资讯编辑」命中资讯页内编辑', () => {
    expect(resultIds('资讯编辑')).toContain('module:news-editor');
  });

  it('旧名字只留在别名表里，不回流成模块 label', () => {
    expect(MODULE_ALIASES['shop-editor']).toContain('就地编辑');
    expect(MODULE_ALIASES['shop-console']).toContain('商城装修');
    expect(MODULE_ALIASES['news-editor']).toContain('资讯编辑');
  });
});

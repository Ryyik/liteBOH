import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * plans/042 B2：一条记录只有一条编辑主路径。
 *
 * 这次是**灰度**落地：行内铅笔改成「进详情再编辑」，抽屉留在 ⋯ 里当逃生口。
 * 守卫锁住这两件事 —— 否则下次有人图省事把铅笔改回 openEditModal，
 * 「点哪个才对」的犹豫就又回来了，而且没有任何测试会红。
 */

const read = (path) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');

describe('行内编辑入口（B2 灰度）', () => {
  const view = read('src/views/DataManagement/DataAdmin.vue');

  it('铅笔进详情，不再直接开抽屉', () => {
    const pencil = view.slice(view.indexOf('class="icon-btn edit"'));
    const button = pencil.slice(0, 400);
    expect(button).toContain('@click="openRecordDetail(item)"');
    expect(button).toContain('aria-label="在详情中编辑"');
    expect(button).not.toContain('openEditModal');
  });

  it('抽屉作为逃生口留在 ⋯ 菜单里（灰度期不许一次切死）', () => {
    expect(view).toContain("id: 'quick-edit'");
    expect(view).toContain('快速编辑（抽屉）');
  });

  it('详情页的「编辑」走 embedded 模式（不另开弹层）', () => {
    expect(view).toContain('openEditModal(record, { embedded: true })');
  });
});

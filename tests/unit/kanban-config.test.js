import { describe, expect, it } from 'vitest';

import { resolveKanbanConfig } from '@/views/DataManagement/composables/kanban-config.js';

describe('resolveKanbanConfig：值域来源（plans/042 A3 的前提）', () => {
  it('显式 kanban.statusMeta → source=statusMeta，列顺序与声明一致', () => {
    const cfg = {
      fields: [{ key: 'status', label: '状态' }],
      kanban: {
        statusKey: 'status',
        statusMeta: {
          approved: { label: '已通过', tone: 'success' },
          rejected: { label: '已拒绝', tone: 'danger' },
        },
      },
    };
    const kb = resolveKanbanConfig(cfg);
    expect(kb.source).toBe('statusMeta');
    expect(kb.columns.map((c) => c.value)).toEqual(['approved', 'rejected']);
    expect(kb.columns[0].tone).toBe('success');
  });

  it('只有 cardView.statusMeta → source=cardViewMeta', () => {
    const cfg = {
      fields: [{ key: 'status', label: '状态' }],
      cardView: { statusKey: 'status', statusMeta: { open: { label: '进行中' } } },
    };
    expect(resolveKanbanConfig(cfg).source).toBe('cardViewMeta');
  });

  it('status 是带 options 的 select → source=fieldOptions，值域即 options', () => {
    const cfg = {
      fields: [
        {
          key: 'status',
          label: '状态',
          type: 'select',
          options: [
            { value: 'draft', label: '草稿' },
            { value: 'live', label: '已上线' },
          ],
        },
      ],
    };
    const kb = resolveKanbanConfig(cfg);
    expect(kb.source).toBe('fieldOptions');
    expect(kb.columns.map((c) => c.value)).toEqual(['draft', 'live']);
  });

  it('没有状态字段 / 显式 kanban:false → null（此时不能撤掉状态下拉）', () => {
    expect(resolveKanbanConfig({ fields: [{ key: 'title', label: '标题' }] })).toBeNull();
    expect(
      resolveKanbanConfig({
        fields: [{ key: 'status', label: '状态' }],
        kanban: false,
      }),
    ).toBeNull();
  });

  it('statusMeta 为空对象 → null（chips 无值域可用）', () => {
    const cfg = {
      fields: [{ key: 'status', label: '状态' }],
      kanban: { statusKey: 'status', statusMeta: {} },
    };
    expect(resolveKanbanConfig(cfg)).toBeNull();
  });
});

describe('resolveKanbanConfig：statusField 提示锁死列名', () => {
  const usersLike = {
    fields: [
      {
        key: 'role',
        label: '角色',
        type: 'select',
        options: [
          { value: 'user', label: '普通用户' },
          { value: 'admin', label: '管理员' },
        ],
      },
      {
        key: 'hide_online_status',
        label: '隐藏在线状态',
        type: 'select',
        options: [
          { value: 'true', label: '隐藏' },
          { value: 'false', label: '显示' },
        ],
      },
    ],
  };

  it('不给提示时按 /status/ 猜中 hide_online_status（旧行为）', () => {
    const kb = resolveKanbanConfig(usersLike);
    expect(kb.statusKey).toBe('hide_online_status');
  });

  it('给了 statusField=role 时只认 role，不再猜 hide_online_status', () => {
    const kb = resolveKanbanConfig(usersLike, { statusField: 'role' });
    expect(kb.statusKey).toBe('role');
    expect(kb.columns.map((c) => c.value)).toEqual(['user', 'admin']);
    expect(kb.source).toBe('fieldOptions');
  });

  it('提示的列不是 select（无法作值域）→ null，而不是退回旧猜测', () => {
    const cfg = {
      fields: [
        { key: 'role', label: '角色', type: 'badge' },
        {
          key: 'hide_online_status',
          label: '隐藏在线状态',
          type: 'select',
          options: [{ value: '1', label: '是' }],
        },
      ],
    };
    expect(resolveKanbanConfig(cfg, { statusField: 'role' })).toBeNull();
  });

  it('显式 statusKey 优先，不受提示影响', () => {
    const cfg = {
      fields: [{ key: 'status', label: '状态' }],
      kanban: { statusKey: 'status', statusMeta: { approved: { label: '已通过' } } },
    };
    expect(resolveKanbanConfig(cfg, { statusField: 'role' }).statusKey).toBe('status');
  });
});

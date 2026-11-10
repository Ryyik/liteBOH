import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildItemLabel,
  buildDeleteConfirmMessage,
  buildBatchDeleteConfirmMessage,
  isBatchDeleteConfirmed,
} from '@/views/DataManagement/composables/data-admin-delete-confirm.js';

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

describe('data-admin delete confirm messages', () => {
  it('单条删除：含标识、tabLabel、ID、关联类型与不可恢复声明', () => {
    const msg = buildDeleteConfirmMessage({
      item: { id: 'u-1', username: '小牛' },
      tabLabel: '用户管理',
      relatedLabels: ['报名', '发帖'],
    });
    expect(msg).toContain('即将删除「小牛」（用户管理）');
    expect(msg).toContain('ID：u-1');
    expect(msg).toContain('关联记录 2 类（报名/发帖）');
    expect(msg).toContain('此操作不可恢复');
  });

  it('单条删除：无关联时不出现关联行；无任何标识时回退「这条记录」', () => {
    const msg = buildDeleteConfirmMessage({ item: {}, tabLabel: '标签管理' });
    expect(msg).not.toContain('关联记录');
    expect(msg).not.toContain('ID：');
    expect(msg).toContain('即将删除「这条记录」（标签管理）');
    expect(msg).toContain('此操作不可恢复');
  });

  it('buildItemLabel：title → username → name → id 依次回退', () => {
    expect(buildItemLabel({ title: 'T', username: 'U' })).toBe('T');
    expect(buildItemLabel({ username: 'U', name: 'N' })).toBe('U');
    expect(buildItemLabel({ name: 'N', id: 'I' })).toBe('N');
    expect(buildItemLabel({ id: 'I' })).toBe('I');
    expect(buildItemLabel(null)).toBe('这条记录');
  });

  it('批量删除 ≤3 条：列出全部标识，无省略行', () => {
    const msg = buildBatchDeleteConfirmMessage({
      count: 2,
      tabLabel: '活动管理',
      items: [{ title: '活动A' }, { username: '用户B' }],
    });
    expect(msg).toContain('即将删除 2 条「活动管理」记录');
    expect(msg).toContain('活动A、用户B');
    expect(msg).not.toContain('…等');
  });

  it('批量删除 >3 条：只列前 3 条 + 省略行', () => {
    const msg = buildBatchDeleteConfirmMessage({
      count: 12,
      tabLabel: '活动管理',
      items: [{ title: 'A1' }, { title: 'A2' }, { title: 'A3' }, { title: 'A4' }, { title: 'A5' }],
    });
    expect(msg).toContain('A1、A2、A3');
    expect(msg).not.toContain('A4');
    expect(msg).toContain('…等 12 条');
    expect(msg).toContain('此操作不可恢复');
  });

  it('账号模式批量：说「N 个用户账号」，并点明连带登录凭证', () => {
    // 反证：默认文案是「N 条记录」—— 在「积分」tab（其实也是 profiles 表）
    // 会把删号说成删一行积分数据
    const msg = buildBatchDeleteConfirmMessage({
      count: 3,
      tabLabel: '积分',
      items: [{ username: 'A' }, { username: 'B' }, { username: 'C' }],
      accountMode: true,
    });
    expect(msg).toContain('即将删除 3 个用户账号（积分）');
    expect(msg).not.toContain('条「积分」记录');
    expect(msg).toContain('登录凭证');
    expect(msg).toContain('无法通过「最近删除」找回');
  });

  it('账号模式单条：说「删除用户账号」，普通模式不受影响', () => {
    const account = buildDeleteConfirmMessage({
      item: { id: 'u-1', username: '小牛' },
      tabLabel: '用户管理',
      accountMode: true,
    });
    expect(account).toContain('即将删除用户账号「小牛」（用户管理）');
    expect(account).toContain('登录凭证');

    const plain = buildBatchDeleteConfirmMessage({ count: 2, tabLabel: '商品' });
    expect(plain).not.toContain('登录凭证');
    expect(plain).not.toContain('用户账号');
  });

  it('二次确认输入：trim 后必须与「删除 N 条」完全一致', () => {
    expect(isBatchDeleteConfirmed('删除 12 条', 12)).toBe(true);
    expect(isBatchDeleteConfirmed('  删除 12 条 ', 12)).toBe(true);
    expect(isBatchDeleteConfirmed('删除 12 条', 10)).toBe(false);
    expect(isBatchDeleteConfirmed('删 12 条', 12)).toBe(false);
    expect(isBatchDeleteConfirmed('', 12)).toBe(false);
    expect(isBatchDeleteConfirmed(null, 12)).toBe(false);
  });
});

describe('delete confirm wiring', () => {
  it('mutations 消费纯函数并对 n≥10 要求二次输入', () => {
    const m = read('src/views/DataManagement/composables/useDataAdminMutations.js');
    expect(m).toContain('buildDeleteConfirmMessage');
    expect(m).toContain('buildBatchDeleteConfirmMessage');
    expect(m).toContain('isBatchDeleteConfirmed');
    expect(m).toContain('count >= 10');
  });

  it('S1：批量条不再有「跨页全选」字样与全选入口，改述「（本页）」', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).not.toContain('跨页全选');
    expect(view).not.toContain('selectAllResults(');
    expect(view).not.toContain('@click="selectAllResults"');
    expect(view).not.toContain('全选全部 {{');
    expect(view).toContain('（本页）');
    // selectAllResultsMode 保留（批次 E 重新接线复用）
    expect(view).toContain('selectAllResultsMode');
  });
});

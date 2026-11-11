import { describe, expect, it } from 'vitest';
import {
  hasProfileWriteContent,
  splitProfileWritePayload,
} from '@/views/DataManagement/composables/data-admin-profile-write.js';
import {
  PROFILE_ADMIN_RPC_FIELDS,
  PROFILE_SAVE_SELECT_COLUMNS,
  TAB_WRITABLE_FIELDS,
} from '@/views/DataManagement/config.js';
import { TABS_ACTIONS } from '@/views/DataManagement/config/tabs.js';

/**
 * 反证式回归（2026-11-11 数据管理面板全量审查 P0-1 / P0-2）。
 *
 * 这些断言对应的都是「线上会 42501 / 会被 RLS 拒」的真实故障，而不是风格检查。
 * 谁把敏感列挪回直更路径、或把回读改回 `RETURNING *`，这里必须变红。
 */
describe('profiles 保存链路：敏感列必须走 RPC', () => {
  it('5 个敏感列全部落到 adminPatch，其余列留在直更 payload', () => {
    const { adminPatch, rest } = splitProfileWritePayload({
      username: '小牛无聊',
      role: 'user',
      points: 96,
      experience: 190,
      tags: ['a'],
      hide_online_status: false,
      bio: 'hi',
      shipping_phone: '13800000000',
    });

    expect(Object.keys(adminPatch).sort()).toEqual(
      ['experience', 'hide_online_status', 'points', 'role', 'tags'].sort(),
    );
    expect(rest).toEqual({
      username: '小牛无聊',
      bio: 'hi',
      shipping_phone: '13800000000',
    });
  });

  it('敏感列清单钉死为这 5 个（挪走任何一个都会让保存重新 42501）', () => {
    // 依据：2026090803_security_hardening.sql 的列级 UPDATE 白名单
    // 明确排除 role / points / experience / tags / hide_online_status。
    expect([...PROFILE_ADMIN_RPC_FIELDS].sort()).toEqual([
      'experience',
      'hide_online_status',
      'points',
      'role',
      'tags',
    ]);
  });

  it('敏感列必须仍在 TAB_WRITABLE_FIELDS.users 里，否则 RPC 收不到值（静默不生效）', () => {
    const writable = TAB_WRITABLE_FIELDS.users;
    const missing = PROFILE_ADMIN_RPC_FIELDS.filter((key) => !writable.includes(key));
    expect(missing).toEqual([]);
  });

  it('拆分不丢键、不重复（adminPatch ∪ rest = 原 payload）', () => {
    const payload = { username: 'u', points: 1, bio: 'b' };
    const { adminPatch, rest } = splitProfileWritePayload(payload);
    expect(Object.keys(rest).filter((key) => key in adminPatch)).toEqual([]);
    expect(new Set([...Object.keys(rest), ...Object.keys(adminPatch)])).toEqual(
      new Set(Object.keys(payload)),
    );
  });

  it('只有敏感列时 rest 为空（不要再发一次空的 update）', () => {
    const { adminPatch, rest } = splitProfileWritePayload({ points: 10 });
    expect(adminPatch).toEqual({ points: 10 });
    expect(rest).toEqual({});
    expect(hasProfileWriteContent({ adminPatch, rest })).toBe(true);
  });

  it('完全空载荷时不认为有内容可写', () => {
    const split = splitProfileWritePayload({});
    expect(hasProfileWriteContent(split)).toBe(false);
  });

  it('回读列清单不含任何被 H-1 收窄的敏感列（否则 RETURNING * 那类 42501 会回来）', () => {
    // 2026070802_fix_high_security_issues.sql 按 H-1 收回了这些列的 SELECT；
    // 而 profiles 没有表级 SELECT ⇒ 一旦回读带上它们，整条保存直接 42501。
    const forbidden = [
      'shipping_recipient',
      'shipping_phone',
      'shipping_address',
      'pushplus_token',
      'gift_content',
      'gift_no',
      'gift_price',
    ];
    const selectList = PROFILE_SAVE_SELECT_COLUMNS.split(',').map((item) => item.trim());
    expect(selectList.length).toBeGreaterThan(0);
    expect(selectList.filter((column) => forbidden.includes(column))).toEqual([]);
    expect(PROFILE_SAVE_SELECT_COLUMNS).not.toContain('*');
  });
});

describe('users 页签不得再暴露「新增」', () => {
  it('TABS_ACTIONS.users 不再含 create（profiles 无 admin INSERT 策略，补授权也照样被拒）', () => {
    // 2026-11-11 实测：补齐 grant select, insert 后仍是
    // `new row violates row-level security policy`；且绕过也只会造出孤儿 profile。
    expect(TABS_ACTIONS.users).not.toContain('create');
    expect(TABS_ACTIONS.users).toContain('edit');
  });
});

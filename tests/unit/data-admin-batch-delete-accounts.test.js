import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 账号批量删除的接线守卫（2026-11-10）。
 *
 * 背景：`users` 和 `points` 都指向同一张 `profiles` 表。单条删除走
 * `admin_delete_user_account`，批量删除却只对 `users` 走 RPC，`points` 落到
 * 裸 `delete from profiles` —— 会级联清空该用户几十张表的关联数据（posts /
 * comments / 积分流水 / 云盘 / 订单 …），却把 `auth.users` 那行留在原地：
 * 用户还能登录、后台再也查不到人；同时绕过了 RPC 里的 `CANNOT_DELETE_SELF`，
 * 管理员在积分 tab 全选会把自己的 profile 删掉、锁在后台外面。
 *
 * 这里是反证式守卫：谁把 points 从账号分支拿掉、或退回裸删，测试必须变红。
 */
const source = readFileSync(
  resolve(
    import.meta.dirname,
    '../../src/views/DataManagement/composables/useDataAdminMutations.js',
  ),
  'utf8',
);

const accountBlock = () => {
  const start = source.indexOf('if (accountMode) {');
  expect(start, '找不到批量删除的账号分支').toBeGreaterThan(-1);
  const end = source.indexOf('const rawRows', start);
  expect(end, '找不到账号分支的结束位置').toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('账号批量删除接线', () => {
  it('points 与 users 同属账号 tab（都是 profiles 表）', () => {
    expect(source).toMatch(/const ACCOUNT_TABS = new Set\(\[\s*'users',\s*'points',?\s*\]\)/);
  });

  it('批量删除不再只对 users 判 RPC（旧写法把 points 漏给了裸删）', () => {
    expect(source).not.toContain("tabId === 'users'");
    expect(source).toContain('const accountMode = ACCOUNT_TABS.has(currentTab.value)');
  });

  it('账号分支必须逐条走 RPC，且分支内不得出现裸删', () => {
    const block = accountBlock();
    expect(block).toContain('deleteAdminAccounts(');
    expect(block).not.toContain('.delete()');
  });

  it('RPC 拒绝时保留 code，才能把「不许删自己」和真失败分开', () => {
    expect(source).toMatch(/failure\.code = String\(rpcData\?\.code/);
    expect(source).toMatch(
      /NON_FATAL_ACCOUNT_DELETE_CODES = new Set\(\[[^\]]*'CANNOT_DELETE_SELF'/,
    );
  });

  it('失败项留在选中列表（否则一次失败就得重新勾一遍）', () => {
    expect(source).toContain('selectedItems.value = result.failed.map');
  });

  it('账号删除不写「最近删除」快照', () => {
    expect(source).toContain('const skipSnapshot = ACCOUNT_TABS.has(tabId);');
  });
});

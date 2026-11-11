/**
 * profiles 保存链路的载荷拆分（纯函数，便于反证测试）
 *
 * 为什么需要这一步：见 docs/2026-11-11-数据管理面板功能可行性全量审查.md §2 P0-1。
 *
 *   · `role / points / experience / tags / hide_online_status` 的列级 UPDATE 被
 *     `2026090803_security_hardening.sql` **有意**排除在授权白名单外 ⇒ 直更必然 42501。
 *   · 修法**不能**是补 GRANT：`profiles_update_self` 的 qual 只有 `auth.uid() = id`，
 *     一旦给 authenticated 补上这些列的 UPDATE，任何登录用户都能把自己改成 admin
 *     （2026-11-11 事务内临时授权实测：普通用户自升 admin 成功）。
 *   · 因此这些列必须走 `admin_update_user_profile`（SECURITY DEFINER + 管理员校验），
 *     其余列仍走直更 —— 本函数负责把二者切开。
 */

import { PROFILE_ADMIN_RPC_FIELDS } from '../config/fields.js';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * @param {Record<string, unknown>} payload 已过 TAB_WRITABLE_FIELDS 白名单的待存字段
 * @returns {{ adminPatch: Record<string, unknown>, rest: Record<string, unknown> }}
 *   adminPatch —— 只能经 RPC 写入的敏感字段
 *   rest       —— 可走直更（`.update()`）的字段
 */
export const splitProfileWritePayload = (payload = {}) => {
  const rest = { ...payload };
  const adminPatch = {};

  PROFILE_ADMIN_RPC_FIELDS.forEach((key) => {
    if (hasOwn(rest, key)) {
      adminPatch[key] = rest[key];
      delete rest[key];
    }
  });

  return { adminPatch, rest };
};

/** 拆分后有没有需要提交的内容（避免发出空的 update / 空 p_patch 被函数拒绝） */
export const hasProfileWriteContent = ({ adminPatch, rest }) =>
  Object.keys(adminPatch).length > 0 || Object.keys(rest).length > 0;

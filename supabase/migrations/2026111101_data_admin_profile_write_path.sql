-- =====================================================================
-- 数据管理面板写入链路修复（2026-11-11 全量审查 P0-1 / P0-3）
-- 详见 docs/2026-11-11-数据管理面板功能可行性全量审查.md §2
-- =====================================================================
--
-- 线上实测的三个事实：
--
--   ① 「用户管理 / 积分管理」保存必然 42501
--      `role / points / experience / tags / hide_online_status` 的列级 UPDATE
--      是 2026090803_security_hardening.sql **有意**排除在授权白名单外的；
--      而面板保存走的是整包 update ⇒ 只改用户名也整单失败。
--
--   ② 同一保存链路还带 `.select()`（等价 RETURNING *），需要**全部列**的 SELECT
--      `shipping_recipient/phone/address` + `pushplus_token` 的列级 SELECT
--      被 2026070802_fix_high_security_issues.sql 按 H-1 收回
--      ⇒ 即使补齐 UPDATE 授权，仍会再撞一层 42501。
--      （SQL 侧已对照实测：`returning id` 成功 / `returning *` 42501）
--
--   ③ 「AI 额度」保存必然 42501
--      `ai_pricing_config` 对 authenticated 只授了 SELECT；RLS
--      （ai_pricing_config_admin_all，按 current_user_is_admin()）本身是对的 ——
--      是策略与授权不一致，管理员被自己的授权挡住。
--
-- ⚠️ 为什么 ① 不能靠补 GRANT 修（本次在事务内临时授权实测，线上 ACL 未变更）：
--      补 `update(role)` 后，**普通用户**（非 admin）可以
--        · 把自己的 role 改成 'admin'        → 成功
--        · 把自己的 points 改成 999999       → 成功
--      因为 `profiles_update_self` 的 qual 只有 `auth.uid() = id`，与列级授权一叠加
--      ＝任何登录用户可自封管理员。补 `select(shipping_*)` 还会让全员手机号可遍历。
--      ⇒ 正确修法是 SECURITY DEFINER RPC（管理员校验 + 字段白名单），
--        本迁移**不给 profiles 补任何列级授权**。
--
-- 本迁移只做两件事：
--   A. `ai_pricing_config` 补 INSERT/UPDATE 授权（RLS 已是 admin-only，补授权安全）
--   B. 新增 `admin_update_user_profile`：管理员改那 5 个敏感列的唯一合法入口
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. ai_pricing_config：补齐 INSERT / UPDATE
--    单行表（check id = 1），页面用的是 upsert ⇒ 需要 INSERT 权限，
--    冲突时由 RLS 的 admin 策略放行更新。
-- ---------------------------------------------------------------------
grant select, insert, update on table public.ai_pricing_config to authenticated;

-- ---------------------------------------------------------------------
-- B. admin_update_user_profile：管理员改敏感列的唯一入口
--
--    设计约束（每条都有对应的实测依据）：
--      · security definer + 函数内 admin 校验（不能用 RLS，因为要绕过列级授权）
--      · 只接受白名单键，白名单外的键**报错**而不是静默丢弃
--        （静默丢弃会让前端以为写进去了 —— 这正是本面板此前的 bug 类型）
--      · 值域校验放在库里，不依赖前端表单
--      · 返回给前端的 jsonb 只含面板需要的列，不回传敏感列，避免顺手扩大读面
-- ---------------------------------------------------------------------
create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_allowed_keys text[] := array['role', 'points', 'experience', 'tags', 'hide_online_status'];
  v_allowed_roles text[] := array['user', 'admin'];
  v_key text;
  v_row public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'forbidden: auth required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  if jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'p_patch must be a json object' using errcode = '22023';
  end if;
  if v_patch = '{}'::jsonb then
    raise exception 'p_patch is empty' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'profile % not found', p_user_id using errcode = 'P0002';
  end if;

  -- 白名单外的键直接报错（不静默丢弃）
  for v_key in select jsonb_object_keys(v_patch) loop
    if not (v_key = any(v_allowed_keys)) then
      raise exception 'field "%" is not writable through admin_update_user_profile', v_key
        using errcode = '22023';
    end if;
  end loop;

  if v_patch ? 'role' then
    if v_patch ->> 'role' is null or not ((v_patch ->> 'role') = any(v_allowed_roles)) then
      raise exception 'invalid role: %', coalesce(v_patch ->> 'role', 'null') using errcode = '22023';
    end if;
  end if;

  if v_patch ? 'points' then
    if v_patch ->> 'points' is null or (v_patch ->> 'points') !~ '^[0-9]{1,10}$' then
      raise exception 'invalid points: %', coalesce(v_patch ->> 'points', 'null') using errcode = '22023';
    end if;
    if (v_patch ->> 'points')::bigint > 2147483647 then
      raise exception 'points out of integer range: %', v_patch ->> 'points' using errcode = '22003';
    end if;
  end if;

  if v_patch ? 'experience' then
    if v_patch ->> 'experience' is null or (v_patch ->> 'experience') !~ '^[0-9]{1,10}$' then
      raise exception 'invalid experience: %', coalesce(v_patch ->> 'experience', 'null')
        using errcode = '22023';
    end if;
    if (v_patch ->> 'experience')::bigint > 2147483647 then
      raise exception 'experience out of integer range: %', v_patch ->> 'experience'
        using errcode = '22003';
    end if;
  end if;

  if v_patch ? 'tags' and jsonb_typeof(v_patch -> 'tags') is distinct from 'array' then
    raise exception 'invalid tags: expected json array' using errcode = '22023';
  end if;

  if v_patch ? 'hide_online_status'
     and jsonb_typeof(v_patch -> 'hide_online_status') is distinct from 'boolean' then
    raise exception 'invalid hide_online_status: expected boolean' using errcode = '22023';
  end if;

  update public.profiles p
     set role = case
           when v_patch ? 'role' then v_patch ->> 'role'
           else p.role
         end,
         points = case
           when v_patch ? 'points' then (v_patch ->> 'points')::integer
           else p.points
         end,
         experience = case
           when v_patch ? 'experience' then (v_patch ->> 'experience')::integer
           else p.experience
         end,
         tags = case
           when v_patch ? 'tags'
             then array(select jsonb_array_elements_text(v_patch -> 'tags'))
           else p.tags
         end,
         hide_online_status = case
           when v_patch ? 'hide_online_status' then (v_patch ->> 'hide_online_status')::boolean
           else p.hide_online_status
         end
   where p.id = p_user_id
  returning * into v_row;

  -- 审计：这条路径绕过列级授权，必须在库里留痕（前端日志可被跳过）
  -- meta 只记字段名，不记值，避免积分等数值进入审计表
  insert into public.admin_audit_logs
    (actor_id, actor_label, action, resource_table, resource_id, meta)
  values (
    auth.uid(),
    (select coalesce(username, '') from public.profiles where id = auth.uid()),
    'update_sensitive_profile',
    'profiles',
    p_user_id::text,
    jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(v_patch) as k))
  );

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'role', v_row.role,
    'points', v_row.points,
    'experience', v_row.experience,
    'join_date', v_row.join_date,
    'bio', v_row.bio,
    'avatar_url', v_row.avatar_url,
    'avatar_frame_url', v_row.avatar_frame_url,
    'tags', to_jsonb(v_row.tags),
    'hide_online_status', v_row.hide_online_status,
    'is_banned', v_row.is_banned,
    'is_muted', v_row.is_muted
  );
end;
$$;

revoke execute on function public.admin_update_user_profile(uuid, jsonb)
  from anon, authenticated, public;
grant execute on function public.admin_update_user_profile(uuid, jsonb)
  to authenticated;

comment on function public.admin_update_user_profile(uuid, jsonb) is
  '管理员修改 profiles 敏感列（role/points/experience/tags/hide_online_status）的唯一入口。'
  '列级 UPDATE 被 2026090803 有意收窄，直接补 GRANT 会导致普通用户自升 admin（已实测），故走 SECURITY DEFINER。';

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------
-- 回归验证（管理员 JWT 下执行，期望全部成功）
--   select public.admin_update_user_profile('<uid>', '{"points": 96}'::jsonb);        -- 1 行 jsonb
--   select public.admin_update_user_profile('<uid>', '{"tags": ["a","b"]}'::jsonb);   -- tags 为 text[]
-- 负向（期望 42501 / 22023）
--   普通用户调用                                   → forbidden: admin only
--   select public.admin_update_user_profile('<uid>', '{"bio":"x"}'::jsonb);           -- 白名单外字段
--   select public.admin_update_user_profile('<uid>', '{"role":"root"}'::jsonb);       -- 非法角色
--   select public.admin_update_user_profile('<uid>', '{"points":-1}'::jsonb);         -- 负数
--
-- ⚠️ profiles 的列级授权**不要**在本迁移外另行补齐：
--   `grant update (role, points, …) on public.profiles to authenticated`
--   会让任何登录用户通过 `profiles_update_self`（qual: auth.uid() = id）自升管理员。

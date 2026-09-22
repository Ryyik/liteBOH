-- 2026092201_fix_sync_profile_from_auth_user_insert_no_email.sql
-- 修复：新用户注册 500（Database error saving new user）。
--
-- 根因：2026090803 安全加固把 profiles.email 列 drop 掉（email 只存 auth.users），
-- 但触发器函数 sync_profile_from_auth_user_insert() 仍在 INSERT 列清单里引用
-- email（含 on conflict 分支的 excluded.email）→ 任何 auth.users INSERT 都会
-- 触发 42703 undefined column → GoTrue 返回 500「Database error saving new user」。
-- 2026-09-08 之后无新注册，该问题一直未暴露；2026-09-22 开启邮箱验证后首次
-- 端到端注册实测时炸出。
--
-- 修复：函数体去掉 email 列引用，与「email 只存 auth.users」的决策对齐。
-- handle_new_user() 不引用 email、未受影响，保持不动（最小变更）。
--
-- 验证：修复后 bohtest@blockofhome.cn 注册 → 确认 → 登录全链路通过（见当日日志）。

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_username text;
  v_join_date date := current_date;
  v_join_date_text text;
  v_birth_month text;
  v_birth_day text;
begin
  v_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  if v_username is null then
    v_username := nullif(trim(split_part(lower(coalesce(new.email, '')), '@', 1)), '');
  end if;
  if v_username is null then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  -- 安全修复：强制 role 为 'user'，忽略 metadata 中可能注入的 role
  -- （原代码 v_role := nullif(... raw_user_meta_data ->> 'role' ...) 导致自注册管理员漏洞）

  -- 安全修复：强制 points 为 0，忽略 metadata 中可能注入的 points
  -- （原代码 v_points 从 raw_user_meta_data ->> 'points' 读取）

  -- email 不落 profiles（2026090803：email 只存 auth.users）

  v_join_date_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'join_date', '')), '');
  if v_join_date_text is not null and v_join_date_text ~ '^\d{4}-\d{2}-\d{2}$' then
    v_join_date := v_join_date_text::date;
  end if;

  v_birth_month := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_month', '')), '');
  v_birth_day := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_day', '')), '');

  insert into public.profiles (
    id,
    username,
    role,
    points,
    join_date,
    birth_month,
    birth_day
  ) values (
    new.id,
    v_username,
    'user',
    0,
    v_join_date,
    v_birth_month,
    v_birth_day
  )
  on conflict (id) do update
    set username = coalesce(nullif(trim(public.profiles.username), ''), excluded.username),
        join_date = coalesce(public.profiles.join_date, excluded.join_date),
        -- on conflict 时也不允许用 metadata 的 role 覆盖
        role = public.profiles.role,
        birth_month = coalesce(public.profiles.birth_month, excluded.birth_month),
        birth_day = coalesce(public.profiles.birth_day, excluded.birth_day);

  return new;
end;
$function$;

notify pgrst, 'reload schema';

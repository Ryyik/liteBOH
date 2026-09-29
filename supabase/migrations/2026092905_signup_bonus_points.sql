-- ============================================
-- AI 积分计费 4/5：新用户注册礼 5 积分（不过期，一次性）
-- 挂载点：现有建档触发器 sync_profile_from_auth_user_insert。
-- 防重：points_transactions 上 (user_id) where reason='signup_bonus' 部分唯一索引，
-- 流水插入成功（FOUND）才加分 —— 并发/重放均不会重复发放。
-- ============================================

create unique index if not exists points_transactions_signup_bonus_once
  on public.points_transactions (user_id)
  where reason = 'signup_bonus';

create or replace function public.sync_profile_from_auth_user_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_username text;
  v_join_date date := current_date;
  v_join_date_text text;
  v_birth_month text;
  v_birth_day text;
  v_is_new boolean;
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

  v_is_new := not exists (
    select 1 from public.profiles where id = new.id
  );

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

  -- 新用户注册礼：5 积分（AI Token 体验金，不过期）。
  -- 唯一索引仲裁，流水落库成功才加分；冲突（重放/并发）静默跳过。
  if coalesce(v_is_new, false) then
    insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
    values (new.id, 5, 5, 'signup_bonus', '新用户注册礼（AI Token 体验金，不过期）')
    on conflict do nothing;

    if found then
      update public.profiles
         set points = coalesce(points, 0) + 5
       where id = new.id;
    end if;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

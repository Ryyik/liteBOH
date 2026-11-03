-- ============================================================
-- 硬化 get_recent_birthday_profiles
--
-- 背景（2026-11-03 安全复审，P1）：
--   该函数是 SECURITY DEFINER 且同时 `grant execute ... to anon`，
--   函数体内没有任何隐私判断 —— RLS 本来会做的过滤被 definer 绕过了。
--   实测匿名 `POST /rest/v1/rpc/get_recent_birthday_profiles {"p_limit":1000}`
--   返回 200 且给出全量带生日的用户。当前 `hide_online_status=true` 的人数为 0，
--   所以尚未发生实际泄露；但只要出现第一个开启该开关的用户，开关立即失效。
--
-- 本次只做三件最小必要改动（保持 SECURITY DEFINER，不改前端）：
--   1) last_active_at 按 hide_online_status 脱敏（开关为真时返回 null）
--   2) p_limit 夹到 1..50 —— 原来直接透传 `limit p_limit`，匿名可要全量
--   3) 过滤封禁用户 —— 原来被永久封禁的账号仍挂在生日墙上
--
-- 刻意**不做**的（留给后续，避免一次性改太多）：
--   - 改 security invoker：会连带改变 profiles 的列级权限边界，需单独验证
--   - 收紧 anon 的 execute 授权：前端首页未登录时依赖它展示生日墙
-- ============================================================

begin;

create or replace function public.get_recent_birthday_profiles(p_limit int default 8)
returns table (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  join_date date,
  birth_month int,
  birth_day int,
  last_active_at timestamptz,
  hide_online_status boolean,
  birthday_days_until int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now date := current_date;
  v_current_year int := extract(year from v_now)::int;
  -- 硬夹紧：null / 0 / 负数 / 超大值全部落到 [1, 50]
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  return query
  with birthday_data as (
    select
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.join_date,
      p.birth_month::int as birth_month,
      p.birth_day::int as birth_day,
      -- 隐私：用户选择「隐藏在线状态」时，活跃时间不外泄
      case
        when coalesce(p.hide_online_status, false) then null::timestamptz
        else p.last_active_at
      end as last_active_at,
      coalesce(p.hide_online_status, false) as hide_online_status,
      case
        when p.birth_month::int between 1 and 12
             and p.birth_day::int between 1 and
               case p.birth_month::int
                 when 2 then 29
                 when 4 then 30 when 6 then 30
                 when 9 then 30 when 11 then 30
                 else 31
               end
             and make_date(v_current_year, p.birth_month::int, p.birth_day::int) >= v_now
          then make_date(v_current_year, p.birth_month::int, p.birth_day::int) - v_now
        else make_date(v_current_year + 1, p.birth_month::int, p.birth_day::int) - v_now
      end as days_until
    from public.profiles p
    where p.birth_month is not null
      and p.birth_day is not null
      and p.birth_month ~ '^\d+$'
      and p.birth_day ~ '^\d+$'
      -- 封禁账号不上生日墙（登录封禁与全局封禁都算）
      and coalesce(p.is_banned, false) = false
      and coalesce(p.login_banned, false) = false
  )
  select
    bd.id,
    bd.username,
    bd.avatar_url,
    bd.bio,
    bd.join_date,
    bd.birth_month,
    bd.birth_day,
    bd.last_active_at,
    bd.hide_online_status,
    bd.days_until as birthday_days_until
  from birthday_data bd
  order by bd.days_until asc, bd.username asc nulls last
  limit v_limit;
end;
$$;

comment on function public.get_recent_birthday_profiles(int) is
  '获取最近过生日的用户列表；limit 夹在 1..50，last_active_at 按 hide_online_status 脱敏，过滤封禁账号';

commit;

-- 2026090911_resolve_email_login_from_auth_users.sql
-- 修复 resolve_email_for_login 两个叠加问题：
-- ① 2026090803 已 drop profiles.email，旧函数体 `select pr.email from profiles pr`
--    运行时报 42703；
-- ② 2026070802 把函数声明为 stable 却执行 `insert into _rate_limits`，
--    运行时报 0A000 "INSERT is not allowed in a non-volatile function"。
--    两者叠加 → 「方块 ID + 密码」登录全量失败（前端误报账号或密码错误）。
-- 处理：改为 volatile（有限流写入）；email 改从 auth.users 读取
-- （SECURITY DEFINER + search_path=public，auth.users 需显式限定 schema）。

create or replace function public.resolve_email_for_login(p_username text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text;
  v_client_ip text;
  v_rate_count integer;
begin
  -- 获取客户端 IP（Supabase 注入的请求头）
  v_client_ip := coalesce(
    current_setting('request.header.x-forwarded-for', true),
    current_setting('request.header.x-real-ip', true),
    'unknown'
  );
  -- 取 X-Forwarded-For 的第一个 IP（可能含多个逗号分隔）
  if v_client_ip like '%,%' then
    v_client_ip := split_part(v_client_ip, ',', 1);
  end if;
  v_client_ip := btrim(v_client_ip);

  -- 限流：每 IP 每分钟最多 10 次邮箱解析请求（防邮箱枚举，沿用 2026070802 策略）
  -- 注意：只 RETURNING count（reset_at 是 timestamptz，2026070802 曾把它塞进 integer 变量报 22P02）
  insert into public._rate_limits (key, count, reset_at)
  values ('resolve_email:' || v_client_ip, 1, now() + interval '60 seconds')
  on conflict (key) do update
    set count = case
      when public._rate_limits.reset_at <= now() then 1
      else public._rate_limits.count + 1
    end,
    reset_at = case
      when public._rate_limits.reset_at <= now() then now() + interval '60 seconds'
      else public._rate_limits.reset_at
    end
  returning count into v_rate_count;

  if v_rate_count > 10 then
    raise exception 'rate_limit_exceeded: 请求过于频繁，请稍后再试';
  end if;

  -- email 只存 auth.users（profiles.email 已 drop）：经 profiles.username 定位后取 auth.users.email
  select au.email into v_email
  from auth.users au
  join public.profiles pr on pr.id = au.id
  where lower(pr.username) = lower(p_username)
  limit 1;

  return v_email;
end;
$$;

grant execute on function public.resolve_email_for_login(text) to anon, authenticated;

comment on function public.resolve_email_for_login is '通过用户名（方块 ID）查找登录邮箱（读 auth.users，绕过 RLS，受 IP 限流保护）';

notify pgrst, 'reload schema';

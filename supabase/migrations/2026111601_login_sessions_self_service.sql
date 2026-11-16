-- 2026111601_login_sessions_self_service.sql
-- 「账户安全 → 登录设备」的自助查询 + 单台下线（2026-11-16）
--
-- 为什么**不建新表**：
--   GoTrue 的 `auth.sessions` 本来就逐会话记录 `created_at` / `updated_at` /
--   `user_agent` / `ip`，而 `auth.refresh_tokens.session_id` 是
--   `ON DELETE CASCADE`（实测 2026-11-16）—— 删掉会话行，该设备的 refresh token
--   一并失效，效果与 `signOut()` 的服务端行为一致。
--   新建业务表反而要额外维护「登录时写一行」，且和真实会话状态有两份真源。
--
-- 为什么必须用 SECURITY DEFINER 函数：
--   `auth` schema 不暴露给 anon/authenticated，前端读不到；函数里用
--   `auth.uid()` 过滤，等价于 RLS 的 `user_id = auth.uid()`，但作用在 auth schema 上。
--   `set search_path = ''` + 全限定名，避免被 search_path 注入劫持。
--
-- 安全边界：
--   · 只能看见 / 只能删自己的会话（`user_id = auth.uid()`）；
--   · 不许删「当前会话」—— 那等价于退出登录，已有专门入口，避免误操作把自己踢掉；
--   · 过滤 Deno/EdgeRuntime 的 UA：那是 Edge Function 自己产生的会话，不是用户设备。

create or replace function public.list_my_login_sessions()
returns table (
  session_id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id as session_id,
    s.created_at,
    greatest(s.created_at, s.updated_at) as last_active_at,
    s.user_agent,
    coalesce(s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid, false) as is_current
  from auth.sessions s
  where auth.uid() is not null
    and s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
    -- 服务端会话（Edge Function / Deno）不是"设备"，展示出来只会让人困惑
    and coalesce(s.user_agent, '') not ilike 'Deno/%'
    and coalesce(s.user_agent, '') not ilike '%SupabaseEdgeRuntime%'
  order by greatest(s.created_at, s.updated_at) desc
  limit 30;
$$;

revoke all on function public.list_my_login_sessions() from public;
grant execute on function public.list_my_login_sessions() to authenticated;
grant execute on function public.list_my_login_sessions() to service_role;

create or replace function public.revoke_my_login_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_deleted integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'message', '请先登录。');
  end if;

  if p_session_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', '缺少会话标识。');
  end if;

  -- 不下线「当前设备」：用户想要的其实是退出登录，那条链路还要解绑推送、清本地 PII
  if v_current is not null and p_session_id = v_current then
    return jsonb_build_object(
      'ok', false,
      'code', 'CANNOT_REVOKE_CURRENT',
      'message', '不能在这里下线当前设备，请直接使用「退出登录」。'
    );
  end if;

  delete from auth.sessions s
  where s.id = p_session_id
    and s.user_id = v_uid;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '该设备已不在线。');
  end if;

  return jsonb_build_object('ok', true, 'code', 'REVOKED', 'message', '该设备已下线。');
end;
$$;

revoke all on function public.revoke_my_login_session(uuid) from public;
grant execute on function public.revoke_my_login_session(uuid) to authenticated;
grant execute on function public.revoke_my_login_session(uuid) to service_role;

-- 回滚（手工）：
--   drop function if exists public.revoke_my_login_session(uuid);
--   drop function if exists public.list_my_login_sessions();

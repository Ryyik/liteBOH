begin;

-- ============================================
-- Web Push 订阅的写入/清理入口（两个 security definer RPC）
--
-- 为什么不能直接用表：push_subscriptions.endpoint 是**全局唯一**的，
-- 而它绑定的是「浏览器实例」而不是「账号」。同一台设备换账号时会撞上：
--   用户 A 已订阅 → endpoint 行归属 A
--   用户 B 在同一浏览器开启推送 → 拿到同一个 endpoint（Chrome 会复用）
--   → 客户端 upsert(ON CONFLICT DO UPDATE) 需要 UPDATE 现有行，
--     而 RLS 的 using(auth.uid() = user_id) 判的是 A ≠ B → 直接拒绝
--   → 表现为「B 开了推送但永远收不到」，且报错难懂
--
-- 这里用 security definer 包一层，把 user_id 硬写成 auth.uid()：
--   · 调用方无法指定 user_id，拿不到别人的订阅（不是越权入口）
--   · 设备的所有权天然成立 —— endpoint 只有持有它的那个浏览器才拿得到
--
-- 语义：**谁在这台设备上登录，这台设备就归谁**。换账号即接管，符合直觉。
-- 幂等：create or replace。
-- ============================================

-- ------------------------------------------------------------------
-- 保存（或接管）当前设备的订阅
-- ------------------------------------------------------------------
create or replace function public.boh_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception '用户未认证';
  end if;

  if coalesce(trim(p_endpoint), '') = '' then
    raise exception 'endpoint 不能为空';
  end if;
  if coalesce(trim(p_p256dh), '') = '' or coalesce(trim(p_auth), '') = '' then
    raise exception '订阅密钥不能为空';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (
    caller_id,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    nullif(left(coalesce(p_user_agent, ''), 400), '')
  )
  on conflict (endpoint) do update
    set user_id       = excluded.user_id,
        p256dh        = excluded.p256dh,
        auth          = excluded.auth,
        user_agent    = excluded.user_agent,
        last_seen_at  = now(),
        failure_count = 0,
        disabled_at   = null;
end;
$$;

comment on function public.boh_save_push_subscription(text, text, text, text) is
  '保存/接管当前设备的 Web Push 订阅。user_id 强制为 auth.uid()，调用方无法指定。';

-- ------------------------------------------------------------------
-- 解绑当前设备（用户主动关闭推送，或退出登录时清理）
-- ------------------------------------------------------------------
create or replace function public.boh_delete_push_subscription(p_endpoint text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  affected integer := 0;
begin
  if caller_id is null then
    raise exception '用户未认证';
  end if;
  if coalesce(trim(p_endpoint), '') = '' then
    return 0;
  end if;

  delete from public.push_subscriptions
   where endpoint = trim(p_endpoint)
     and user_id = caller_id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.boh_delete_push_subscription(text) is
  '解绑当前设备（限本人行）。用户关闭推送或退出登录时调用。返回删除行数。';

-- ------------------------------------------------------------------
-- 权限：只给 authenticated，anon 一律不给
-- ------------------------------------------------------------------
revoke all on function public.boh_save_push_subscription(text, text, text, text) from public;
revoke all on function public.boh_save_push_subscription(text, text, text, text) from anon;
grant execute on function public.boh_save_push_subscription(text, text, text, text) to authenticated;

revoke all on function public.boh_delete_push_subscription(text) from public;
revoke all on function public.boh_delete_push_subscription(text) from anon;
grant execute on function public.boh_delete_push_subscription(text) to authenticated;

notify pgrst, 'reload schema';

commit;

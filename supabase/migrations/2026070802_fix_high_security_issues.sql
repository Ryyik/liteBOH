begin;

-- =====================================================================
-- 修复 HIGH 安全漏洞 H-1 + H-2
--
-- H-1: profiles 表 SELECT 策略 using(true) 暴露全体用户敏感字段
--      (shipping_*/pushplus_token/gift_content/email)
-- 修复：列级 REVOKE 敏感字段 + SECURITY DEFINER RPC 函数
--      仅本人可查自己敏感字段，admin 可查任意用户。
--
-- H-2: resolve_email_for_login RPC 对 anon 开放导致邮箱枚举
-- 修复：在函数内集成 rate limit 检查，每 IP 每分钟最多 10 次。
-- =====================================================================


-- ---------------------------------------------------------------------
-- H-1: 列级权限收窄 profiles 敏感字段
-- ---------------------------------------------------------------------

-- 敏感字段清单：email, shipping_recipient, shipping_phone, shipping_address,
--              gift_content, gift_no, gift_price, pushplus_token
-- （pushplus_enabled 非敏感，保留可读；gift_status 非敏感，保留可读）

-- 对 anon 收回所有敏感字段（email 已在 2026062202 收回，这里补充其余字段）
revoke select(email) on public.profiles from anon;
revoke select(shipping_recipient) on public.profiles from anon;
revoke select(shipping_phone) on public.profiles from anon;
revoke select(shipping_address) on public.profiles from anon;
revoke select(gift_content) on public.profiles from anon;
revoke select(gift_no) on public.profiles from anon;
revoke select(gift_price) on public.profiles from anon;
revoke select(pushplus_token) on public.profiles from anon;

-- 对 authenticated 收回敏感字段（防止任意登录用户遍历他人敏感信息）
revoke select(email) on public.profiles from authenticated;
revoke select(shipping_recipient) on public.profiles from authenticated;
revoke select(shipping_phone) on public.profiles from authenticated;
revoke select(shipping_address) on public.profiles from authenticated;
revoke select(gift_content) on public.profiles from authenticated;
revoke select(gift_no) on public.profiles from authenticated;
revoke select(gift_price) on public.profiles from authenticated;
revoke select(pushplus_token) on public.profiles from authenticated;


-- ---------------------------------------------------------------------
-- H-1 辅助 RPC：get_my_sensitive_profile()
-- 当前登录用户查询自己的敏感字段（绕过列级权限，SECURITY DEFINER）
-- ---------------------------------------------------------------------
create or replace function public.get_my_sensitive_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_row from public.profiles where id = v_uid limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'email', v_row.email,
    'shipping_recipient', v_row.shipping_recipient,
    'shipping_phone', v_row.shipping_phone,
    'shipping_address', v_row.shipping_address,
    'gift_content', v_row.gift_content,
    'gift_no', v_row.gift_no,
    'gift_price', v_row.gift_price,
    'pushplus_token', v_row.pushplus_token
  );
end;
$$;

grant execute on function public.get_my_sensitive_profile() to authenticated;


-- ---------------------------------------------------------------------
-- H-1 辅助 RPC：admin_get_user_sensitive(p_user_id)
-- 管理员查询指定用户的敏感字段（SECURITY DEFINER + admin 校验）
-- ---------------------------------------------------------------------
create or replace function public.admin_get_user_sensitive(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden: 仅管理员可执行此操作';
  end if;

  select * into v_row from public.profiles where id = p_user_id limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'email', v_row.email,
    'shipping_recipient', v_row.shipping_recipient,
    'shipping_phone', v_row.shipping_phone,
    'shipping_address', v_row.shipping_address,
    'gift_content', v_row.gift_content,
    'gift_no', v_row.gift_no,
    'gift_price', v_row.gift_price,
    'pushplus_token', v_row.pushplus_token
  );
end;
$$;

grant execute on function public.admin_get_user_sensitive(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- H-1 辅助 RPC：admin_list_users_with_sensitive(p_search, p_limit)
-- 管理员批量查询用户列表（含敏感字段），支持用户名/邮箱/收货人/电话搜索。
-- 返回 JSONB 数组，仅 admin 可调用。
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users_with_sensitive(
  p_search text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text;
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden: 仅管理员可执行此操作';
  end if;

  v_search := nullif(trim(coalesce(p_search, '')), '');
  p_limit := least(greatest(p_limit, 1), 500);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'email', p.email,
      'shipping_recipient', p.shipping_recipient,
      'shipping_phone', p.shipping_phone,
      'shipping_address', p.shipping_address
    ) order by p.username)
    from public.profiles p
    where v_search is null
       or p.username ilike '%' || v_search || '%'
       or p.email ilike '%' || v_search || '%'
       or p.shipping_recipient ilike '%' || v_search || '%'
       or p.shipping_phone ilike '%' || v_search || '%'
       or (p.id)::text = v_search
    limit p_limit
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_users_with_sensitive(text, integer) to authenticated;


-- ---------------------------------------------------------------------
-- H-2: resolve_email_for_login 加 IP 限流防邮箱枚举
-- 复用 check_rate_limit RPC，以请求 IP 为 key，每分钟最多 10 次。
-- ---------------------------------------------------------------------
create or replace function public.resolve_email_for_login(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_client_ip text;
  v_rate_ok boolean;
  v_rate_count integer;
  v_rate_retry integer;
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

  -- 限流：每 IP 每分钟最多 10 次邮箱解析请求
  -- check_rate_limit 仅 service_role 可调用，这里用直接 SQL 兜底
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
  returning count, reset_at into v_rate_count, v_rate_retry;

  if v_rate_count > 10 then
    raise exception 'rate_limit_exceeded: 请求过于频繁，请稍后再试';
  end if;

  -- 原有逻辑：通过用户名查找邮箱
  select pr.email into v_email
  from profiles pr
  where lower(pr.username) = lower(p_username)
  limit 1;

  return v_email;
end;
$$;

-- 保持原有授权（anon 仍可调用，但受限流保护）
grant execute on function public.resolve_email_for_login(text) to anon, authenticated;

comment on function public.resolve_email_for_login is '通过用户名查找邮箱（仅用于登录流程，绕过 RLS，受 IP 限流保护）';


-- ---------------------------------------------------------------------
-- H-3 辅助 RPC：refund_lab_usage
-- 回退一次 Lab 使用记录（AI 调用失败时回退预扣减的配额）
-- 删除最近一条该用户/设备的指定 flow_type 记录。
-- ---------------------------------------------------------------------
create or replace function public.refund_lab_usage(
  p_user_id uuid default null,
  p_device_id text default null,
  p_flow_type text default null
)
returns boolean
language plpgsql
as $$
declare
  v_deleted_id uuid;
begin
  if p_user_id is null and p_device_id is null then
    return false;
  end if;

  -- 删除最近一条匹配记录（按 created_at 降序取第一条）
  delete from public.lab_usage_records
  where id = (
    select id from public.lab_usage_records
    where (p_user_id is null or user_id = p_user_id)
      and (p_device_id is null or device_id = p_device_id)
      and (p_flow_type is null or flow_type = p_flow_type)
    order by created_at desc
    limit 1
  )
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;

grant execute on function public.refund_lab_usage(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- 2026090901_fix_sensitive_rpc_no_email.sql
-- 修复：2026090803_security_hardening 已 drop profiles.email，
-- 但 2026070802 的三个 sensitive RPC 仍引用 email 列，
-- 运行时报错：record "v_row" has no field "email"（pushplus 设置/地址管理加载失败）。
-- 处理：重建三个函数，移除全部 email 引用（email 已由 auth.users 托管，profiles 不再存）。

-- ---------------------------------------------------------------------
-- get_my_sensitive_profile()：当前登录用户查自己的敏感字段
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
-- admin_get_user_sensitive(p_user_id)：管理员查指定用户敏感字段
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
-- admin_list_users_with_sensitive(p_search, p_limit)：管理员批量查用户
-- （email 列已删：去掉 email 字段与邮箱搜索分支）
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
      'shipping_recipient', p.shipping_recipient,
      'shipping_phone', p.shipping_phone,
      'shipping_address', p.shipping_address
    ) order by p.username)
    from public.profiles p
    where v_search is null
       or p.username ilike '%' || v_search || '%'
       or p.shipping_recipient ilike '%' || v_search || '%'
       or p.shipping_phone ilike '%' || v_search || '%'
       or (p.id)::text = v_search
    limit p_limit
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_users_with_sensitive(text, integer) to authenticated;

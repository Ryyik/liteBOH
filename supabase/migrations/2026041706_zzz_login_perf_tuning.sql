-- 登录性能优化：
-- 1) 为登录预检查热点查询补充索引
-- 2) 优化 should_require_login_captcha 失败计数逻辑（最多扫描 3 条失败记录）

begin;

create index if not exists idx_profiles_lower_email
  on public.profiles ((lower(coalesce(email, ''))))
  where email is not null;

create index if not exists idx_profiles_lower_username
  on public.profiles ((lower(coalesce(username, ''))));

create index if not exists idx_auth_login_events_recent_fail_lookup
  on public.auth_login_events (login_key, device_id_hash, created_at desc)
  where succeeded = false;

create index if not exists idx_auth_trusted_devices_active_lookup
  on public.auth_trusted_devices (user_id, device_id_hash, trust_until desc)
  where revoked_at is null;

create or replace function public.should_require_login_captcha(
  p_login_id text,
  p_device_id_hash text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_login_key text := lower(trim(coalesce(p_login_id, '')));
  v_device_hash text := trim(coalesce(p_device_id_hash, ''));
  v_user_id uuid := null;
  v_join_date date := null;
  v_is_old_user boolean := false;
  v_trust_until timestamp with time zone := null;
  v_recent_failed integer := 0;
begin
  if v_login_key = '' or v_device_hash = '' then
    return jsonb_build_object(
      'ok', true,
      'require_captcha', true,
      'reason', 'INVALID_INPUT'
    );
  end if;

  if position('@' in v_login_key) > 0 then
    select p.id, p.join_date
      into v_user_id, v_join_date
      from public.profiles p
     where lower(coalesce(p.email, '')) = v_login_key
     limit 1;
  else
    select p.id, p.join_date
      into v_user_id, v_join_date
      from public.profiles p
     where lower(coalesce(p.username, '')) = v_login_key
     limit 1;
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'ok', true,
      'require_captcha', true,
      'reason', 'UNKNOWN_ACCOUNT'
    );
  end if;

  v_is_old_user := coalesce(v_join_date <= (current_date - 30), false);
  if not v_is_old_user then
    return jsonb_build_object(
      'ok', true,
      'require_captcha', true,
      'reason', 'ACCOUNT_TOO_NEW'
    );
  end if;

  select count(*)
    into v_recent_failed
    from (
      select 1
        from public.auth_login_events e
       where e.login_key = v_login_key
         and e.device_id_hash = v_device_hash
         and e.succeeded = false
         and e.created_at >= (now() - interval '15 minutes')
       limit 3
    ) t;

  if v_recent_failed >= 3 then
    return jsonb_build_object(
      'ok', true,
      'require_captcha', true,
      'reason', 'RECENT_FAILURES',
      'recent_failed', v_recent_failed
    );
  end if;

  select d.trust_until
    into v_trust_until
    from public.auth_trusted_devices d
   where d.user_id = v_user_id
     and d.device_id_hash = v_device_hash
     and d.revoked_at is null
   order by d.trust_until desc
   limit 1;

  if v_trust_until is not null and v_trust_until > now() then
    return jsonb_build_object(
      'ok', true,
      'require_captcha', false,
      'reason', 'TRUSTED_DEVICE',
      'trust_until', v_trust_until
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'require_captcha', true,
    'reason', 'CAPTCHA_REQUIRED'
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'require_captcha', true,
      'reason', 'CHECK_FAILED',
      'message', coalesce(sqlerrm, 'UNKNOWN_ERROR')
    );
end;
$$;

commit;

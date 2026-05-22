-- 修复信任设备登录仍被要求验证码：
-- 1) 预检查命中有效信任设备时直接免验证码
-- 2) 登录成功回写时，若 auth.uid() 尚未同步，回退按登录名解析用户并续期信任设备

begin;

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

create or replace function public.record_login_attempt(
  p_login_id text,
  p_device_id_hash text,
  p_succeeded boolean,
  p_used_captcha boolean default false,
  p_failure_code text default null,
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
  v_failure_code text := nullif(left(trim(coalesce(p_failure_code, '')), 80), '');
  v_user_agent text := nullif(left(trim(coalesce(p_user_agent, '')), 512), '');
  v_user_id uuid := auth.uid();
  v_join_date date := null;
  v_is_old_user boolean := false;
  v_existing_trust_until timestamp with time zone := null;
  v_new_trust_until timestamp with time zone := null;
begin
  if v_login_key = '' or v_device_hash = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'INVALID_INPUT'
    );
  end if;

  if v_user_id is null then
    if position('@' in v_login_key) > 0 then
      select p.id
        into v_user_id
        from public.profiles p
       where lower(coalesce(p.email, '')) = v_login_key
       limit 1;
    else
      select p.id
        into v_user_id
        from public.profiles p
       where lower(coalesce(p.username, '')) = v_login_key
       limit 1;
    end if;
  end if;

  insert into public.auth_login_events (
    user_id,
    login_key,
    device_id_hash,
    succeeded,
    used_captcha,
    failure_code,
    user_agent
  ) values (
    v_user_id,
    v_login_key,
    v_device_hash,
    coalesce(p_succeeded, false),
    coalesce(p_used_captcha, false),
    v_failure_code,
    v_user_agent
  );

  if coalesce(p_succeeded, false) and v_user_id is not null then
    select p.join_date
      into v_join_date
      from public.profiles p
     where p.id = v_user_id;

    v_is_old_user := coalesce(v_join_date <= (current_date - 30), false);

    if v_is_old_user then
      select d.trust_until
        into v_existing_trust_until
        from public.auth_trusted_devices d
       where d.user_id = v_user_id
         and d.device_id_hash = v_device_hash
         and d.revoked_at is null
       order by d.trust_until desc
       limit 1;

      if coalesce(p_used_captcha, false)
         or (v_existing_trust_until is not null and v_existing_trust_until > now()) then
        v_new_trust_until := now() + interval '30 days';

        insert into public.auth_trusted_devices (
          user_id,
          device_id_hash,
          trusted_since,
          trust_until,
          last_login_at,
          last_used_captcha,
          last_user_agent,
          revoked_at
        ) values (
          v_user_id,
          v_device_hash,
          now(),
          v_new_trust_until,
          now(),
          coalesce(p_used_captcha, false),
          v_user_agent,
          null
        )
        on conflict (user_id, device_id_hash)
        do update
          set trusted_since = case
            when public.auth_trusted_devices.revoked_at is null
              then public.auth_trusted_devices.trusted_since
            else excluded.trusted_since
          end,
          trust_until = excluded.trust_until,
          last_login_at = excluded.last_login_at,
          last_used_captcha = excluded.last_used_captcha,
          last_user_agent = excluded.last_user_agent,
          revoked_at = null;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'trusted_until', v_new_trust_until
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'message', coalesce(sqlerrm, 'UNKNOWN_ERROR')
    );
end;
$$;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    raise notice '刷新 PostgREST schema cache 失败（可忽略并稍后重试）: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$$;

commit;

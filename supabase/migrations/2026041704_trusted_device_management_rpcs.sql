-- 信任设备管理 RPC：
-- 1) 查询当前用户的有效信任设备列表
-- 2) 撤销单个信任设备
-- 3) 撤销全部信任设备

begin;

create or replace function public.list_my_trusted_devices(
  p_current_device_id_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_hash text := trim(coalesce(p_current_device_id_hash, ''));
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_AUTHENTICATED',
      'message', '请先登录'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'devices', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'device_id_hash', d.device_id_hash,
          'trusted_since', d.trusted_since,
          'trust_until', d.trust_until,
          'last_login_at', d.last_login_at,
          'last_used_captcha', d.last_used_captcha,
          'is_current_device', (v_current_hash <> '' and d.device_id_hash = v_current_hash),
          'user_agent_summary', case
            when nullif(trim(coalesce(d.last_user_agent, '')), '') is null then '未知设备'
            else left(regexp_replace(trim(d.last_user_agent), '\s+', ' ', 'g'), 120)
          end
        )
        order by
          case when v_current_hash <> '' and d.device_id_hash = v_current_hash then 0 else 1 end,
          d.last_login_at desc
      )
      from public.auth_trusted_devices d
      where d.user_id = v_user_id
        and d.revoked_at is null
        and d.trust_until > now()
    ), '[]'::jsonb)
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'TRUSTED_DEVICE_LIST_FAILED'),
      'message', coalesce(sqlerrm, '读取信任设备失败')
    );
end;
$$;

create or replace function public.revoke_my_trusted_device(
  p_device_id_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_hash text := trim(coalesce(p_device_id_hash, ''));
  v_rows integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_AUTHENTICATED',
      'message', '请先登录'
    );
  end if;

  if v_device_hash = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_DEVICE_HASH',
      'message', '设备标识无效'
    );
  end if;

  update public.auth_trusted_devices
     set revoked_at = now(),
         trust_until = least(trust_until, now())
   where user_id = v_user_id
     and device_id_hash = v_device_hash
     and revoked_at is null;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'revoked', v_rows > 0,
    'affected_rows', v_rows
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'TRUSTED_DEVICE_REVOKE_FAILED'),
      'message', coalesce(sqlerrm, '撤销信任设备失败')
    );
end;
$$;

create or replace function public.revoke_all_my_trusted_devices()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_AUTHENTICATED',
      'message', '请先登录'
    );
  end if;

  update public.auth_trusted_devices
     set revoked_at = now(),
         trust_until = least(trust_until, now())
   where user_id = v_user_id
     and revoked_at is null;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'affected_rows', v_rows
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'TRUSTED_DEVICE_REVOKE_ALL_FAILED'),
      'message', coalesce(sqlerrm, '撤销全部信任设备失败')
    );
end;
$$;

revoke all on function public.list_my_trusted_devices(text) from public;
revoke all on function public.revoke_my_trusted_device(text) from public;
revoke all on function public.revoke_all_my_trusted_devices() from public;

grant execute on function public.list_my_trusted_devices(text) to anon;
grant execute on function public.list_my_trusted_devices(text) to authenticated;
grant execute on function public.list_my_trusted_devices(text) to service_role;

grant execute on function public.revoke_my_trusted_device(text) to anon;
grant execute on function public.revoke_my_trusted_device(text) to authenticated;
grant execute on function public.revoke_my_trusted_device(text) to service_role;

grant execute on function public.revoke_all_my_trusted_devices() to anon;
grant execute on function public.revoke_all_my_trusted_devices() to authenticated;
grant execute on function public.revoke_all_my_trusted_devices() to service_role;

commit;

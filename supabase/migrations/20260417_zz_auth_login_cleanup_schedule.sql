-- 登录信息安全清理：
-- 1) 清理超过保留期的登录事件
-- 2) 清理长期已撤销或长期过期的信任设备
-- 3) 若 pg_cron 可用，自动创建每日定时清理任务

begin;

create index if not exists idx_auth_login_events_created_at
  on public.auth_login_events (created_at);

create index if not exists idx_auth_trusted_devices_revoked_at
  on public.auth_trusted_devices (revoked_at);

create index if not exists idx_auth_trusted_devices_trust_until
  on public.auth_trusted_devices (trust_until);

create or replace function public.cleanup_auth_login_artifacts(
  p_events_retention_days integer default 90,
  p_revoked_devices_retention_days integer default 30,
  p_expired_devices_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_events_days integer := greatest(7, least(coalesce(p_events_retention_days, 90), 365));
  v_revoked_days integer := greatest(1, least(coalesce(p_revoked_devices_retention_days, 30), 365));
  v_expired_days integer := greatest(1, least(coalesce(p_expired_devices_retention_days, 30), 365));
  v_deleted_events integer := 0;
  v_deleted_revoked_devices integer := 0;
  v_deleted_expired_devices integer := 0;
begin
  delete from public.auth_login_events
   where created_at < (now() - make_interval(days => v_events_days));
  get diagnostics v_deleted_events = row_count;

  delete from public.auth_trusted_devices
   where revoked_at is not null
     and revoked_at < (now() - make_interval(days => v_revoked_days));
  get diagnostics v_deleted_revoked_devices = row_count;

  delete from public.auth_trusted_devices
   where revoked_at is null
     and trust_until < (now() - make_interval(days => v_expired_days));
  get diagnostics v_deleted_expired_devices = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_login_events', v_deleted_events,
    'deleted_revoked_devices', v_deleted_revoked_devices,
    'deleted_expired_devices', v_deleted_expired_devices,
    'retention_days', jsonb_build_object(
      'login_events', v_events_days,
      'revoked_devices', v_revoked_days,
      'expired_devices', v_expired_days
    ),
    'cleaned_at', now()
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'AUTH_LOGIN_CLEANUP_FAILED'),
      'message', coalesce(sqlerrm, '清理登录信息失败')
    );
end;
$$;

revoke all on function public.cleanup_auth_login_artifacts(integer, integer, integer) from public;
grant execute on function public.cleanup_auth_login_artifacts(integer, integer, integer) to service_role;

do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (
    select 1
      from pg_extension
     where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过定时任务创建。可通过 service_role 手动调用 cleanup_auth_login_artifacts。';
    return;
  end if;

  perform cron.unschedule(jobid)
    from cron.job
   where jobname = 'cleanup_auth_login_artifacts_daily';

  -- UTC 20:20 = Asia/Shanghai 次日 04:20
  perform cron.schedule(
    'cleanup_auth_login_artifacts_daily',
    '20 20 * * *',
    $cmd$select public.cleanup_auth_login_artifacts();$cmd$
  );
exception
  when others then
    raise notice '创建/更新 pg_cron 任务失败，已跳过自动调度: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;

-- 临时下线登录/注册额外风控后，清理相关数据库对象：
-- 1) 取消登录清理定时任务（如存在）
-- 2) 删除信任设备 / 登录验证码窗口 / ALTCHA 相关函数与表

begin;

do $$
begin
  if exists (
    select 1
      from pg_extension
     where extname = 'pg_cron'
  ) then
    begin
      perform cron.unschedule(jobid)
        from cron.job
       where jobname = 'cleanup_auth_login_artifacts_daily';
    exception
      when undefined_table then
        null;
      when undefined_function then
        null;
      when invalid_schema_name then
        null;
      when insufficient_privilege then
        raise notice 'insufficient privilege to unschedule pg_cron job: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
    end;
  end if;
exception
  when others then
    raise notice 'skip unschedule cleanup_auth_login_artifacts_daily: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end
$$;

do $$
begin
  if to_regclass('public.auth_trusted_devices') is not null then
    execute 'drop trigger if exists trg_auth_trusted_devices_updated_at on public.auth_trusted_devices';
  end if;
end
$$;

drop function if exists public.cleanup_auth_login_artifacts(integer, integer, integer);
drop function if exists public.revoke_all_my_trusted_devices();
drop function if exists public.revoke_my_trusted_device(text);
drop function if exists public.list_my_trusted_devices(text);
drop function if exists public.list_my_trusted_devices();
drop function if exists public.record_login_attempt(text, text, boolean, boolean, text, text);
drop function if exists public.should_require_login_captcha(text, text, text);
drop function if exists public.touch_auth_trusted_devices_updated_at();

drop table if exists public.auth_login_events;
drop table if exists public.auth_trusted_devices;
drop table if exists public.auth_altcha_proofs;

commit;

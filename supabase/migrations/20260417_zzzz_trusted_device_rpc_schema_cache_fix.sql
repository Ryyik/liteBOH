-- 信任设备 RPC 修复：
-- 1) 补充 anon 角色执行权限（函数内部自行鉴权）
-- 2) 刷新 PostgREST schema cache，避免“找不到函数”缓存滞后

begin;

do $$
begin
  if to_regprocedure('public.list_my_trusted_devices(text)') is not null then
    execute 'grant execute on function public.list_my_trusted_devices(text) to anon';
    execute 'grant execute on function public.list_my_trusted_devices(text) to authenticated';
    execute 'grant execute on function public.list_my_trusted_devices(text) to service_role';
  else
    raise notice '缺少 public.list_my_trusted_devices(text)，请先执行 20260417_trusted_device_management_rpcs.sql';
  end if;

  if to_regprocedure('public.revoke_my_trusted_device(text)') is not null then
    execute 'grant execute on function public.revoke_my_trusted_device(text) to anon';
    execute 'grant execute on function public.revoke_my_trusted_device(text) to authenticated';
    execute 'grant execute on function public.revoke_my_trusted_device(text) to service_role';
  else
    raise notice '缺少 public.revoke_my_trusted_device(text)，请先执行 20260417_trusted_device_management_rpcs.sql';
  end if;

  if to_regprocedure('public.revoke_all_my_trusted_devices()') is not null then
    execute 'grant execute on function public.revoke_all_my_trusted_devices() to anon';
    execute 'grant execute on function public.revoke_all_my_trusted_devices() to authenticated';
    execute 'grant execute on function public.revoke_all_my_trusted_devices() to service_role';
  else
    raise notice '缺少 public.revoke_all_my_trusted_devices()，请先执行 20260417_trusted_device_management_rpcs.sql';
  end if;

  begin
    perform pg_notify('pgrst', 'reload schema');
  exception
    when others then
      raise notice '刷新 PostgREST schema cache 失败（可忽略并稍后重试）: %', coalesce(sqlerrm, 'UNKNOWN_ERROR');
  end;
end;
$$;

commit;

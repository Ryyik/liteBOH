-- 隐藏在线状态改为 self-only RPC，避免 authenticated 列级直更权让管理员绕过审计。

begin;

revoke update (hide_online_status) on table public.profiles from authenticated;

create or replace function public.update_my_hide_online_status(p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
     set hide_online_status = coalesce(p_hidden, false)
   where id = auth.uid();
end;
$fn$;

revoke all on function public.update_my_hide_online_status(boolean) from public, anon, authenticated;
grant execute on function public.update_my_hide_online_status(boolean) to authenticated;

notify pgrst, 'reload schema';

commit;

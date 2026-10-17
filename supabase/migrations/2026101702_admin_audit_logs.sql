-- plans/027 E6.1 管理端审计：admin_audit_logs + log_admin_action RPC
-- 幂等（if not exists / drop if exists）；追加写语义，无 update/delete 路径。
-- 权限：表仅 authenticated 可 SELECT（RLS 再限 admin）；anon 全无。
-- RPC：security definer + action 白名单 + auth.uid() 空即拒；anon 三段 revoke。

create table if not exists public.admin_audit_logs (
  id             bigserial primary key,
  actor_id       uuid references auth.users(id) on delete set null,
  actor_label    text,
  action         text not null,
  resource_table text not null,
  resource_id    text,
  diff           jsonb,
  meta           jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_logs_table_time_idx
  on public.admin_audit_logs (resource_table, created_at desc);
create index if not exists admin_audit_logs_actor_time_idx
  on public.admin_audit_logs (actor_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin can read audit logs" on public.admin_audit_logs;
create policy "admin can read audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 表级权限收紧：只给 authenticated SELECT（RLS 过滤非 admin），anon 全无；
-- INSERT/UPDATE/DELETE 不授（写入只走 security definer RPC）
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

create or replace function public.log_admin_action(
  p_action text,
  p_resource_table text,
  p_resource_id text default null,
  p_diff jsonb default null,
  p_meta jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_action not in ('create','update','delete','batch_delete','grant','moderate','export') then
    raise exception 'unsupported action: %', p_action;
  end if;
  insert into public.admin_audit_logs
    (actor_id, actor_label, action, resource_table, resource_id, diff, meta)
  values (
    auth.uid(),
    (select coalesce(username, '') from public.profiles where id = auth.uid()),
    p_action,
    p_resource_table,
    p_resource_id,
    p_diff,
    p_meta
  );
end;
$$;

-- anon 不可执行（三段写全，AGENTS.md §3），authenticated 可执行
revoke execute on function public.log_admin_action(text, text, text, jsonb, jsonb)
  from anon, authenticated, public;
grant execute on function public.log_admin_action(text, text, text, jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

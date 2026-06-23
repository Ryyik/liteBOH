begin;

-- 1. 为 profiles 表添加最后活跃时间戳字段
alter table public.profiles
  add column if not exists last_active_at timestamptz;

-- 2. 创建索引以支持按最近活跃排序的查询
create index if not exists idx_profiles_last_active_at
  on public.profiles (last_active_at desc nulls last);

-- 3. RPC：更新当前用户的 last_active_at（由客户端心跳调用）
create or replace function public.update_last_active_at()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.profiles
  set last_active_at = v_now
  where id = auth.uid()
    and (last_active_at is null or last_active_at < v_now - interval '2 minutes');
  return v_now;
end;
$$;

grant execute on function public.update_last_active_at to authenticated;

comment on function public.update_last_active_at is '更新当前用户的最后活跃时间（至少间隔2分钟）';

notify pgrst, 'reload schema';

commit;

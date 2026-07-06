-- ============================================================
-- 实验室使用限额表
-- ============================================================
-- 记录每次完整的 PPT/Word 生成（以下载为准）
-- 未登录用户通过 device_id 标识，登录用户通过 user_id 标识
-- 每月自动重置（通过 expires_at 字段判断）

create table if not exists public.lab_usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete cascade,
  device_id text null,  -- 未登录用户的设备标识（localStorage 存储的 UUID）
  flow_type text not null check (flow_type in ('ppt', 'word')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (date_trunc('month', now()) + interval '1 month')
);

-- 索引：快速查询当前有效周期的使用记录
create index if not exists idx_lab_usage_user_current
  on public.lab_usage_records (user_id, expires_at)
  where user_id is not null;

create index if not exists idx_lab_usage_device_current
  on public.lab_usage_records (device_id, expires_at)
  where device_id is not null;

-- RLS 策略
alter table public.lab_usage_records enable row level security;

-- 用户只能查看自己的记录
create policy "Users can view own lab usage records"
  on public.lab_usage_records for select
  using (auth.uid() = user_id);

-- 用户只能插入自己的记录（登录用户）
create policy "Users can insert own lab usage records"
  on public.lab_usage_records for insert
  with check (auth.uid() = user_id);

-- 匿名用户（未登录）可以插入 device_id 记录
create policy "Anonymous users can insert device records"
  on public.lab_usage_records for insert
  with check (user_id is null and device_id is not null);

-- 匿名用户可以查看自己的 device_id 记录
create policy "Anonymous users can view own device records"
  on public.lab_usage_records for select
  using (user_id is null and device_id is not null);

-- ============================================================
-- RPC: 获取当前周期的使用次数
-- ============================================================
create or replace function public.get_lab_usage_count(
  p_user_id uuid default null,
  p_device_id text default null
)
returns integer
language plpgsql
stable
as $$
declare
  v_count integer;
begin
  -- 查询当前月份的有效记录
  select count(*) into v_count
  from public.lab_usage_records
  where
    (p_user_id is not null and user_id = p_user_id or
     p_device_id is not null and device_id = p_device_id)
    and expires_at > now();

  return coalesce(v_count, 0);
end;
$$;

-- ============================================================
-- RPC: 记录一次使用
-- ============================================================
create or replace function public.record_lab_usage(
  p_flow_type text,
  p_user_id uuid default null,
  p_device_id text default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  -- 验证 flow_type 不能为空
  if p_flow_type is null then
    raise exception 'flow_type cannot be null';
  end if;

  -- 必须提供 user_id 或 device_id
  if p_user_id is null and p_device_id is null then
    raise exception 'Must provide either user_id or device_id';
  end if;

  insert into public.lab_usage_records (
    user_id, device_id, flow_type
  ) values (
    p_user_id, p_device_id, p_flow_type
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- 授权匿名用户调用 RPC
-- ============================================================
-- get_lab_usage_count: 允许匿名调用（通过 device_id 查询）
grant execute on function public.get_lab_usage_count(uuid, text) to anon, authenticated;

-- record_lab_usage: 允许匿名调用（通过 device_id 记录）
grant execute on function public.record_lab_usage(text, uuid, text) to anon, authenticated;